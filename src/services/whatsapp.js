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
 * Sends an interactive 2-button selector for school routing (Babcock vs ABU).
 * Automatically falls back to plain text if buttons are not supported or rejected by Meta.
 *
 * @param {string} to - Recipient phone number
 * @param {string} headerText - Prompt text
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
 */
export async function sendSchoolSelectionButtons(to, headerText) {
  const recipient = formatWhatsAppRecipient(to);
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  const bodyText = headerText || 'Welcome to Admissions Support! Please select which institution you are inquiring about:';

  if (!recipient || !phoneNumberId || !accessToken) {
    console.error('[WhatsApp Service] Missing credentials or recipient for buttons:', { recipient, hasPhoneId: !!phoneNumberId, hasToken: !!accessToken });
    return { ok: false, error: 'Credentials or recipient missing' };
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: bodyText,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'select_school_backock',
              title: 'Babcock University',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'select_school_abu',
              title: 'ABU',
            },
          },
        ],
      },
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
      console.warn('[WhatsApp Service] Interactive Button Send failed, falling back to text prompt:', data);
      const fallbackText = `${bodyText}\n\n1️⃣ Reply *1* or *Babcock* for Babcock University\n2️⃣ Reply *2* or *ABU* for Ahmadu Bello University (ABU)`;
      return await sendWhatsAppMessage(to, fallbackText);
    }

    const messageId = data?.messages?.[0]?.id;
    console.log('[WhatsApp Service] Interactive buttons dispatched successfully, id:', messageId);
    return { ok: true, messageId };
  } catch (err) {
    console.error('[WhatsApp Service] Button Dispatch Error, falling back to text:', err.message);
    const fallbackText = `${bodyText}\n\n1️⃣ Reply *1* or *Babcock* for Babcock University\n2️⃣ Reply *2* or *ABU* for Ahmadu Bello University (ABU)`;
    return await sendWhatsAppMessage(to, fallbackText);
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
