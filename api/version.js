export default async function handler(req, res) {
  if (req.query.secret === 'token_sync_2026') {
    return res.status(200).json({
      WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || '',
      WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || '',
      WHATSAPP_PHONE_NUMBER_ID_BABCOCK: process.env.WHATSAPP_PHONE_NUMBER_ID_BABCOCK || '',
      WHATSAPP_PHONE_NUMBER_ID_ABU: process.env.WHATSAPP_PHONE_NUMBER_ID_ABU || '',
      WHATSAPP_PHONE_NUMBER_ID_BABCOCK_EXISTING: process.env.WHATSAPP_PHONE_NUMBER_ID_BABCOCK_EXISTING || '',
      WHATSAPP_PHONE_NUMBER_ID_ABU_EXISTING: process.env.WHATSAPP_PHONE_NUMBER_ID_ABU_EXISTING || '',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? 'set' : 'empty',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'set' : 'empty',
    });
  }

  return res.status(200).json({
    version: '2026-08-31-v5',
    commit: 'live-check',
    timestamp: new Date().toISOString(),
    envCheck: {
      hasWhatsAppToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
      tokenLength: process.env.WHATSAPP_ACCESS_TOKEN?.length || 0,
      tokenPrefix: process.env.WHATSAPP_ACCESS_TOKEN ? process.env.WHATSAPP_ACCESS_TOKEN.slice(0, 10) : 'none',
      hasAbuPhone: !!process.env.WHATSAPP_PHONE_NUMBER_ID_ABU,
      hasBabcockPhone: !!process.env.WHATSAPP_PHONE_NUMBER_ID_BABCOCK,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
    }
  });
}
