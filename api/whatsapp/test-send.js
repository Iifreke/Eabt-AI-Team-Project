export default async function handler(req, res) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '1220287537833494';
  const targetPhone = req.query.to || '2348145349114';

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: targetPhone,
    type: 'text',
    text: {
      preview_url: false,
      body: '🎉 Hello from ABU Distance Learning Centre Admissions Support! Your WhatsApp AI bot is connected and working!',
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
      metaResponse: metaData,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
