import supabase from '../db/supabase.js';
import { normalizePhoneNumber, formatWhatsAppRecipient } from '../utils/phone.js';

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Retrieves or refreshes Zoho CRM OAuth access token.
 */
export async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[Zoho Service] Missing Zoho OAuth credentials in environment.');
    return null;
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(`${accountsUrl}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    console.error('[Zoho Service] Token refresh failed:', data);
    return null;
  }

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

/**
 * Creates or updates a Lead in Zoho CRM.
 *
 * @param {Object} lead - Supabase lead record
 * @param {Object} school - School metadata
 * @param {Object} [options] - Optional overrides (source, status, summary)
 */
export async function syncLeadToZoho(lead, school, options = {}) {
  try {
    const token = await getAccessToken();
    if (!token) return;

    const nameParts = (lead.name || 'Prospective Student').trim().split(' ');
    const firstName = nameParts.length > 1 ? nameParts[0] : '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0] || 'Student';
    const normalizedPhone = normalizePhoneNumber(lead.phone) || lead.phone;

    const leadSource = options.source || (lead.channel === 'whatsapp' ? 'WhatsApp Bot' : 'Website Chatbot');
    const leadStatus = options.status || (lead.status === 'escalated' ? 'Escalated' : 'New');

    const payload = {
      data: [
        {
          First_Name: firstName,
          Last_Name: lastName,
          Email: lead.email || undefined,
          Phone: normalizedPhone,
          Lead_Source: leadSource,
          Lead_Status: leadStatus,
          Company: school.name,
          Description: options.summary || `Admissions inquiry via ${leadSource} for ${school.name}. Phone: ${normalizedPhone}`,
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
        .update({
          zoho_contact_id: zohoId,
          zoho_synced_at: new Date().toISOString(),
          normalized_phone: normalizedPhone,
        })
        .eq('id', lead.id);
    }
    return zohoId;
  } catch (error) {
    console.error('[Zoho Service] syncLeadToZoho failed:', error.message);
    // Never crash the caller
  }
}

/**
 * Attaches a chat transcript or AI conversation summary as a Note under the Zoho Lead.
 *
 * @param {string} zohoLeadId - Zoho CRM Lead ID
 * @param {string} title - Note title
 * @param {string} content - Note content (transcript / summary)
 */
export async function addNoteToLead(zohoLeadId, title, content) {
  if (!zohoLeadId || !content) return;

  try {
    const token = await getAccessToken();
    if (!token) return;

    const payload = {
      data: [
        {
          Note_Title: title || 'Chatbot Conversation Transcript',
          Note_Content: content,
          Parent_Id: zohoLeadId,
          $se_module: 'Leads',
        },
      ],
    };

    const response = await fetch('https://www.zohoapis.com/crm/v2/Notes', {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('[Zoho Service] addNoteToLead failed:', result);
    }
  } catch (err) {
    console.error('[Zoho Service] addNoteToLead error:', err.message);
  }
}

/**
 * Creates a High-Priority Task in Zoho CRM for human follow-up on escalation.
 *
 * @param {Object} lead - Lead record
 * @param {Object} school - School record
 * @param {string} reason - Escalation reason
 * @param {string} [details] - Conversation summary or context
 */
export async function createEscalationTask(lead, school, reason, details = '') {
  try {
    const token = await getAccessToken();
    if (!token) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const studentName = lead.name || 'Prospective Student';

    const payload = {
      data: [
        {
          Subject: `🚨 Urgent Chatbot Escalation: ${studentName} (${school.name})`,
          Due_Date: todayStr,
          Priority: 'High',
          Status: 'Not Started',
          Description: `Reason: ${reason || 'Human Assistance Requested'}\nSchool: ${school.name}\nStudent Name: ${studentName}\nPhone: ${lead.phone || 'N/A'}\nEmail: ${lead.email || 'N/A'}\n\nSummary:\n${details}`,
          ...(lead.zoho_contact_id ? { What_Id: lead.zoho_contact_id, $se_module: 'Leads' } : {}),
        },
      ],
    };

    const response = await fetch('https://www.zohoapis.com/crm/v2/Tasks', {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('[Zoho Service] createEscalationTask failed:', result);
    }
  } catch (err) {
    console.error('[Zoho Service] createEscalationTask error:', err.message);
  }
}

/**
 * Pushes a real-time notification card to the school's Zoho Cliq channel.
 *
 * @param {Object} school - School record (slug: 'backock' or 'abu')
 * @param {Object} lead - Lead information
 * @param {string} message - Alert description
 * @param {Object} [options] - Additional metadata (channel, reason, actionUrl)
 */
export async function sendCliqAlert(school, lead, message, options = {}) {
  // Determine webhook URL: school-specific override or general fallback
  const schoolSlug = school?.slug?.toUpperCase();
  const webhookUrl =
    (schoolSlug && process.env[`ZOHO_CLIQ_WEBHOOK_URL_${schoolSlug}`]) ||
    process.env.ZOHO_CLIQ_WEBHOOK_URL;

  if (!webhookUrl) {
    return; // Cliq webhook not configured; fail silently
  }

  const studentName = lead?.name || 'Prospective Student';
  const phone = lead?.phone || 'Not provided';
  const email = lead?.email || 'Not provided';
  const sourceChannel = options.channel || (lead?.channel === 'whatsapp' ? 'WhatsApp' : 'Web Chatbot');
  const appUrl = process.env.APP_URL || 'https://eabt-ai-team-project.vercel.app';
  const chatUrl = options.actionUrl || `${appUrl}/chats`;

  const cliqPayload = {
    text: `🚨 *Lead Alert — ${school?.name || 'School Support'}*`,
    card: {
      title: `${studentName} (${sourceChannel})`,
      theme: 'modern-inline',
    },
    slides: [
      {
        type: 'label',
        title: 'Lead Information',
        data: [
          { 'Student Name': studentName },
          { 'Institution': school?.name || 'Unknown' },
          { 'Channel': sourceChannel },
          { 'Phone': phone },
          { 'Email': email },
          { 'Status': options.reason ? `Escalated (${options.reason})` : 'Active Conversation' },
        ],
      },
      {
        type: 'text',
        title: 'Message Summary',
        data: message || 'A student is requesting assistance or sent a new message.',
      },
    ],
    buttons: [
      {
        label: '💬 Open Live Chat',
        type: '+',
        action: {
          type: 'open.url',
          data: {
            web: chatUrl,
          },
        },
      },
    ],
  };

  // If phone is present, add 1-click WhatsApp button
  const waRecipient = formatWhatsAppRecipient(phone);
  if (waRecipient) {
    cliqPayload.buttons.push({
      label: '📱 Message on WhatsApp',
      type: '+',
      action: {
        type: 'open.url',
        data: {
          web: `https://wa.me/${waRecipient}`,
        },
      },
    });
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cliqPayload),
    });
  } catch (err) {
    console.error('[Zoho Cliq] Alert failed:', err.message);
  }
}
