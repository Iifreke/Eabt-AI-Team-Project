export default async function handler(req, res) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const babcockWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_BABCOCK || '1306201654679772';
  const abuWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_ABU || '920478204428865';

  try {
    // 1. Check me / token debug
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${accessToken}`);
    const meData = await meRes.json();

    // 2. Fetch Babcock WABA phone numbers
    let babcockNumbers = null;
    try {
      const bRes = await fetch(`https://graph.facebook.com/v21.0/${babcockWabaId}/phone_numbers?access_token=${accessToken}`);
      babcockNumbers = await bRes.json();
    } catch (e) {
      babcockNumbers = { error: e.message };
    }

    // 3. Fetch ABU WABA phone numbers
    let abuNumbers = null;
    try {
      const aRes = await fetch(`https://graph.facebook.com/v21.0/${abuWabaId}/phone_numbers?access_token=${accessToken}`);
      abuNumbers = await aRes.json();
    } catch (e) {
      abuNumbers = { error: e.message };
    }

    return res.status(200).json({
      me: meData,
      babcock: {
        waba_id: babcockWabaId,
        phone_numbers: babcockNumbers,
        env_phone_id: process.env.WHATSAPP_PHONE_NUMBER_ID_BABCOCK,
      },
      abu: {
        waba_id: abuWabaId,
        phone_numbers: abuNumbers,
        env_phone_id: process.env.WHATSAPP_PHONE_NUMBER_ID_ABU,
      },
      current_env: {
        WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
        WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
