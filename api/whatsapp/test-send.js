import { resolveWhatsAppPhoneNumberId } from '../../src/services/whatsapp.js';

export default async function handler(req, res) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const school = (req.query.school || 'babcock').toLowerCase();
  const phoneNumberId = req.query.phoneId || resolveWhatsAppPhoneNumberId(school);
  const targetPhone = req.query.to || '2348145349114';

  const schoolName = (school === 'abu')
    ? 'ABU Distance Learning Centre'
    : 'Babcock University';

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: targetPhone,
    type: 'text',
    text: {
      preview_url: false,
      body: `🎉 Hello from ${schoolName} Admissions Support! Your WhatsApp AI bot is connected and operational!`,
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
      school,
      phoneNumberId,
      metaStatus: metaRes.status,
      metaOk: metaRes.ok,
      metaResponse: metaData,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
