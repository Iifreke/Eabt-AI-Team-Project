import { formatWhatsAppRecipient } from '../utils/phone.js';

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
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
 */
export async function sendWhatsAppMessage(to, message) {
  const recipient = formatWhatsAppRecipient(to);
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
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
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[WhatsApp Service] Meta API Error:', JSON.stringify(data, null, 2));
      return { ok: false, error: data?.error?.message || 'Failed to send WhatsApp message' };
    }

    const messageId = data?.messages?.[0]?.id;
    console.log('[WhatsApp Service] Message dispatched successfully, id:', messageId);
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
 * @param {string} [fallbackText] - Optional custom fallback text if interactive payload is rejected
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
 */
export async function sendWhatsAppButtons(to, bodyText, buttons = [], fallbackText = '') {
  const recipient = formatWhatsAppRecipient(to);
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
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
    return await sendWhatsAppMessage(to, formattedBody);
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
    fallbackText ||
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
    });

    const data = await res.json();
    if (!res.ok) {
      console.warn('[WhatsApp Service] Interactive Button Send rejected by Meta, falling back to text prompt:', data);
      return await sendWhatsAppMessage(to, defaultFallback);
    }

    const messageId = data?.messages?.[0]?.id;
    console.log('[WhatsApp Service] Interactive buttons dispatched successfully, id:', messageId);
    return { ok: true, messageId };
  } catch (err) {
    console.error('[WhatsApp Service] Button Dispatch Error, falling back to text:', err.message);
    return await sendWhatsAppMessage(to, defaultFallback);
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
 */
export async function sendWhatsAppTemplate(to, templateName, languageCode = 'en_US', components = []) {
  const recipient = formatWhatsAppRecipient(to);
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
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
    });

    const data = await res.json();
    return { ok: res.ok, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
