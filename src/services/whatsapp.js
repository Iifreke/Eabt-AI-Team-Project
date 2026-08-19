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
      console.error('[WhatsApp Service] Meta API Error:', data);
      return { ok: false, error: data?.error?.message || 'Failed to send WhatsApp message' };
    }

    const messageId = data?.messages?.[0]?.id;
    return { ok: true, messageId };
  } catch (err) {
    console.error('[WhatsApp Service] Network/Dispatch Error:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Sends an interactive 2-button selector for school routing (Babcock vs ABU).
 *
 * @param {string} to - Recipient phone number
 * @param {string} headerText - Prompt text
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
 */
export async function sendSchoolSelectionButtons(to, headerText) {
  const recipient = formatWhatsAppRecipient(to);
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!recipient || !phoneNumberId || !accessToken) {
    return { ok: false, error: 'Credentials or recipient missing' };
  }

  const bodyText = headerText || 'Welcome to EduTech Admissions Support! Please select which institution you are inquiring about:';

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
              title: 'Babcock School',
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
      console.error('[WhatsApp Service] Button Send Error:', data);
      return { ok: false, error: data?.error?.message };
    }

    return { ok: true, messageId: data?.messages?.[0]?.id };
  } catch (err) {
    console.error('[WhatsApp Service] Button Dispatch Error:', err.message);
    return { ok: false, error: err.message };
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
