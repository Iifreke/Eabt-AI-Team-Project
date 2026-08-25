export default async function handler(req, res) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '920478204428865';

  try {
    // 1. Check me / token debug
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${accessToken}`);
    const meData = await meRes.json();

    // 2. Fetch all WhatsApp Business Accounts phone numbers
    const numbersRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${accessToken}`);
    const numbersData = await numbersRes.json();

    // 3. Try also with the other ID
    const otherId = '1220287537833490';
    const otherRes = await fetch(`https://graph.facebook.com/v21.0/${otherId}/phone_numbers?access_token=${accessToken}`);
    const otherData = await otherRes.json();

    return res.status(200).json({
      me: meData,
      waba_phone_numbers: numbersData,
      other_id_phone_numbers: otherData,
      current_env: {
        WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
        WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
