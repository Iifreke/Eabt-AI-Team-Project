export default async function handler(req, res) {
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
