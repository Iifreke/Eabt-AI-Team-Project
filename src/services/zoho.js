import supabase from '../db/supabase.js';

let cachedToken = null;
let tokenExpiry = 0;

export async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
  });

  const response = await fetch(
    `${process.env.ZOHO_ACCOUNTS_URL}/oauth/v2/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    }
  );

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export async function syncLeadToZoho(lead, school) {
  try {
    const token = await getAccessToken();
    const nameParts = (lead.name || '').split(' ');

    const payload = {
      data: [
        {
          First_Name: nameParts[0] || '',
          Last_Name: nameParts.slice(1).join(' ') || '.',
          Email: lead.email,
          Phone: lead.phone,
          Lead_Source: 'Website Chatbot',
          Lead_Status: 'New',
          Company: school.name,
          Description: `Enquiry via chatbot | School: ${school.name}`,
        },
      ],
    };

    const url = lead.zoho_contact_id
      ? `https://www.zohoapis.com/crm/v2/Leads/${lead.zoho_contact_id}`
      : 'https://www.zohoapis.com/crm/v2/Leads';

    const method = lead.zoho_contact_id ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    const zohoId = result.data?.[0]?.details?.id;

    if (zohoId) {
      await supabase
        .from('leads')
        .update({ zoho_contact_id: zohoId, zoho_synced_at: new Date().toISOString() })
        .eq('id', lead.id);
    }
  } catch (error) {
    console.error('Zoho sync failed:', error.message);
    // Do NOT rethrow — Zoho failure must never affect the user
  }
}
