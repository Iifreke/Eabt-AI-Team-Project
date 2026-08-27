import { formatWhatsAppRecipient } from '../utils/phone.js';

/**
 * Resolves the appropriate Meta Phone Number ID based on school slug or options.
 */
export function resolveWhatsAppPhoneNumberId(options) {
  if (!options) {
    return process.env.WHATSAPP_PHONE_NUMBER_ID_BABCOCK || process.env.WHATSAPP_PHONE_NUMBER_ID || '1308107395712291';
  }

  if (typeof options === 'string') {
    const slug = options.toLowerCase().trim();
    if (slug === 'babcock' || slug === 'backock') {
      return process.env.WHATSAPP_PHONE_NUMBER_ID_BABCOCK || '1308107395712291';
    }
    if (slug === 'abu') {
      return process.env.WHATSAPP_PHONE_NUMBER_ID_ABU || '1220287537833494';
    }
    // If passed a numeric string directly
    if (/^\d+$/.test(slug)) return slug;
  }

  if (typeof options === 'object') {
    if (options.phoneNumberId) return options.phoneNumberId;
    const slug = (options.schoolSlug || options.school || '').toLowerCase().trim();
    if (slug === 'babcock' || slug === 'backock') {
      return process.env.WHATSAPP_PHONE_NUMBER_ID_BABCOCK || '1308107395712291';
    }
    if (slug === 'abu') {
      return process.env.WHATSAPP_PHONE_NUMBER_ID_ABU || '1220287537833494';
    }
  }

  return process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID_BABCOCK || '1308107395712291';
}

/**
 * Converts standard Markdown to WhatsApp-compatible formatting.
 * - **bold** or <strong>bold</strong> -> *bold*
 * - *italic* or <em>italic</em> -> _italic_
 * - `code` -> `code`
 * - ```block``` -> ```block```
 * - Bullet points preserved
 */
export function toWhatsAppMarkdown(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    // Replace markdown bold **word** or __word__ with *word*
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    .replace(/__(.*?)__/g, '*$1*')
    // Replace HTML bold/strong
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '*$1*')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '*$1*')
    // Replace HTML italic/em
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '_$1_')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '_$1_')
    // Clean up excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Sends a freeform text message via Meta WhatsApp Cloud API.
 * (Supported within the 24-hour customer service window).
 *
 * @param {string} to - Recipient phone number in E.164 or local format
 * @param {string} message - Message body
 * @param {string|object} [options] - school slug ('babcock'|'abu') or options object { phoneNumberId, schoolSlug }
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
 */
export async function sendWhatsAppMessage(to, message, options = {}) {
  const recipient = formatWhatsAppRecipient(to);
  const phoneNumberId = resolveWhatsAppPhoneNumberId(options);
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!recipient) {
    console.error('[WhatsApp Service] Invalid recipient phone number:', to);
    return { ok: false, error: 'Invalid recipient phone number' };
  }

  if (!phoneNumberId || !accessToken) {
    console.warn('[WhatsApp Service] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN in env.');
    return { ok: false, error: 'WhatsApp credentials not configured' };
  }

  const formattedText = toWhatsAppMarkdown(message);

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'text',
    text: {
      preview_url: false,
      body: formattedText,
    },
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[WhatsApp Service] Meta API Error:', JSON.stringify(data, null, 2));
      return { ok: false, error: data?.error?.message || 'Failed to send WhatsApp message' };
    }

    const messageId = data?.messages?.[0]?.id;
    console.log('[WhatsApp Service] Message dispatched successfully, id:', messageId, 'phoneId:', phoneNumberId);
    return { ok: true, messageId };
  } catch (err) {
    console.error('[WhatsApp Service] Network/Dispatch Error:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Sends interactive reply buttons (up to 3 buttons) via Meta WhatsApp Cloud API.
 * Automatically falls back to clean Markdown text prompt if buttons fail or are not supported.
 *
 * @param {string} to - Recipient phone number
 * @param {string} bodyText - Main message text
 * @param {Array<{ id: string, title: string }>} buttons - Array of button objects (max 3)
 * @param {string|object} [optionsOrFallback] - school slug ('babcock'|'abu') or options object or custom fallback text
 * @param {string} [fallbackText] - Optional custom fallback text
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
 */
export async function sendWhatsAppButtons(to, bodyText, buttons = [], optionsOrFallback = {}, fallbackText = '') {
  const recipient = formatWhatsAppRecipient(to);
  const options = (typeof optionsOrFallback === 'string' && !optionsOrFallback.includes('\n') && ['babcock', 'backock', 'abu'].includes(optionsOrFallback.toLowerCase()))
    ? { schoolSlug: optionsOrFallback }
    : (typeof optionsOrFallback === 'object' ? optionsOrFallback : {});

  const customFallback = typeof optionsOrFallback === 'string' && optionsOrFallback.includes('\n')
    ? optionsOrFallback
    : fallbackText;

  const phoneNumberId = resolveWhatsAppPhoneNumberId(options);
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!recipient) {
    console.error('[WhatsApp Service] Invalid recipient phone number:', to);
    return { ok: false, error: 'Invalid recipient phone number' };
  }

  if (!phoneNumberId || !accessToken) {
    console.warn('[WhatsApp Service] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN in env.');
    return { ok: false, error: 'WhatsApp credentials not configured' };
  }

  const formattedBody = toWhatsAppMarkdown(bodyText);

  // If no buttons provided, send standard text message
  if (!buttons || buttons.length === 0) {
    return await sendWhatsAppMessage(to, formattedBody, options);
  }

  const validButtons = buttons.slice(0, 3).map((b, idx) => ({
    type: 'reply',
    reply: {
      id: b.id || `btn_${idx + 1}`,
      title: (b.title || `Option ${idx + 1}`).slice(0, 20),
    },
  }));

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: formattedBody,
      },
      action: {
        buttons: validButtons,
      },
    },
  };

  const defaultFallback =
    customFallback ||
    `${formattedBody}\n\n` +
      validButtons
        .map((b, idx) => `${idx + 1}️⃣ Reply *${idx + 1}* or *${b.reply.title}*`)
        .join('\n');

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    if (!res.ok) {
      console.warn('[WhatsApp Service] Interactive Button Send rejected by Meta, falling back to text prompt:', data);
      return await sendWhatsAppMessage(to, defaultFallback, options);
    }

    const messageId = data?.messages?.[0]?.id;
    console.log('[WhatsApp Service] Interactive buttons dispatched successfully, id:', messageId, 'phoneId:', phoneNumberId);
    return { ok: true, messageId };
  } catch (err) {
    console.error('[WhatsApp Service] Button Dispatch Error, falling back to text:', err.message);
    return await sendWhatsAppMessage(to, defaultFallback, options);
  }
}

/**
 * Sends a pre-approved Meta WhatsApp Template message.
 * Used for business-initiated contact outside the 24-hour service window.
 *
 * @param {string} to - Recipient phone number
 * @param {string} templateName - Approved template name in Meta Business Manager
 * @param {string} languageCode - e.g. "en_US" or "en"
 * @param {Array} components - Template parameters / variables
 * @param {string|object} [options] - school slug or options object
 */
export async function sendWhatsAppTemplate(to, templateName, languageCode = 'en_US', components = [], options = {}) {
  const recipient = formatWhatsAppRecipient(to);
  const phoneNumberId = resolveWhatsAppPhoneNumberId(options);
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!recipient || !phoneNumberId || !accessToken) {
    return { ok: false, error: 'Credentials or recipient missing' };
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: components.length > 0 ? components : undefined,
    },
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    return { ok: res.ok, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
