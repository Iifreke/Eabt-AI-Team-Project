export default async function handler(req, res) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const babcockAspiringWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_BABCOCK_ASPIRING || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_BABCOCK || '1746522759878986';
  const babcockExistingWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_BABCOCK_EXISTING || '1306201654679772';
  const abuAspiringWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_ABU_ASPIRING || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_ABU || '4487863601471450';
  const abuExistingWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_ABU_EXISTING || '920478204428865';

  const fetchWabaNumbers = async (wabaId) => {
    if (!wabaId) return null;
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${accessToken}`);
      return await res.json();
    } catch (e) {
      return { error: e.message };
    }
  };

  try {
    // 1. Check me / token debug
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${accessToken}`);
    const meData = await meRes.json();

    // 2. Fetch phone numbers across all 4 accounts
    const [babcockAspiring, babcockExisting, abuAspiring, abuExisting] = await Promise.all([
      fetchWabaNumbers(babcockAspiringWabaId),
      fetchWabaNumbers(babcockExistingWabaId),
      fetchWabaNumbers(abuAspiringWabaId),
      fetchWabaNumbers(abuExistingWabaId),
    ]);

    return res.status(200).json({
      me: meData,
      babcock: {
        aspiring: {
          waba_id: babcockAspiringWabaId,
          phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID_BABCOCK_ASPIRING || process.env.WHATSAPP_PHONE_NUMBER_ID_BABCOCK,
          phone_number: process.env.WHATSAPP_PHONE_NUMBER_BABCOCK_ASPIRING || process.env.WHATSAPP_PHONE_NUMBER_BABCOCK,
          meta_numbers: babcockAspiring,
        },
        existing: {
          waba_id: babcockExistingWabaId,
          phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID_BABCOCK_EXISTING,
          phone_number: process.env.WHATSAPP_PHONE_NUMBER_BABCOCK_EXISTING,
          meta_numbers: babcockExisting,
        },
      },
      abu: {
        aspiring: {
          waba_id: abuAspiringWabaId,
          phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID_ABU_ASPIRING || process.env.WHATSAPP_PHONE_NUMBER_ID_ABU,
          phone_number: process.env.WHATSAPP_PHONE_NUMBER_ABU_ASPIRING || process.env.WHATSAPP_PHONE_NUMBER_ABU,
          meta_numbers: abuAspiring,
        },
        existing: {
          waba_id: abuExistingWabaId,
          phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID_ABU_EXISTING,
          phone_number: process.env.WHATSAPP_PHONE_NUMBER_ABU_EXISTING,
          meta_numbers: abuExisting,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
