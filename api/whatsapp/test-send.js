import { formatWhatsAppRecipient } from '../../src/utils/phone.js';

export default async function handler(req, res) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const targetPhone = req.query.to || '2348145349114';

  const recipient = formatWhatsAppRecipient(targetPhone);

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'text',
    text: {
      preview_url: false,
      body: 'Hello from EduTech Bot! Meta WhatsApp connection is working perfectly.',
    },
  };

  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const metaData = await metaRes.json();

    return res.status(200).json({
      metaStatus: metaRes.status,
      metaOk: metaRes.ok,
      phoneNumberId,
      tokenLength: accessToken ? accessToken.length : 0,
      tokenPrefix: accessToken ? accessToken.slice(0, 10) + '...' : 'none',
      tokenSuffix: accessToken ? '...' + accessToken.slice(-10) : 'none',
      recipient,
      metaResponse: metaData,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
