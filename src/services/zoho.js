import supabase from '../db/supabase.js';
import { normalizePhoneNumber, formatWhatsAppRecipient } from '../utils/phone.js';

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Robust fetch wrapper with automatic retry and exponential backoff.
 */
async function fetchWithRetry(url, options = {}, retries = 3, backoffMs = 500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (attempt === retries) {
        throw err;
      }
      const wait = backoffMs * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

/**
 * Resolves standard formatted school details for CRM & Notifications.
 */
export function getSchoolFormattedDetails(school) {
  const slug = (school?.slug || '').toLowerCase().trim();
  const name = school?.name || '';

  if (slug === 'abu' || name.toLowerCase().includes('abudlc') || name.toLowerCase().includes('ahmadu bello')) {
    return {
      slug: 'abu',
      displayName: 'Ahmadu Bello University (ABU) Distance Learning Centre',
      companyName: 'Ahmadu Bello University (ABU) Distance Learning Centre',
    };
  }

  if (slug === 'babcock' || slug === 'backock' || name.toLowerCase().includes('babcock')) {
    return {
      slug: 'babcock',
      displayName: 'Babcock University (BU-CODEL)',
      companyName: 'Babcock University (BU-CODEL)',
    };
  }

  return {
    slug: slug || 'general',
    displayName: name || 'University Distance Learning Support',
    companyName: name || 'Distance Learning Admissions',
  };
}

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

  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    const response = await fetchWithRetry(`${accountsUrl}/oauth/v2/token`, {
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
  } catch (err) {
    console.error('[Zoho Service] Error obtaining access token:', err.message);
    return null;
  }
}

/**
 * Finds and retrieves an existing Lead profile from Zoho CRM by phone or email.
 * Returns { id, name, email, phone, company, leadSource, leadStatus, raw } or null.
 */
export async function findZohoLead(phone, email) {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const candidates = [];
    const normalized = normalizePhoneNumber(phone);
    if (normalized) candidates.push(normalized);
    if (phone && phone !== normalized) candidates.push(phone);
    
    // Also try local 0-prefixed version if +234
    if (normalized && normalized.startsWith('+234')) {
      candidates.push('0' + normalized.slice(4));
    }

    // 1. Search by Phone variants
    for (const p of candidates) {
      if (!p || p.length < 5) continue;
      const url = `https://www.zohoapis.com/crm/v2/Leads/search?phone=${encodeURIComponent(p)}`;
      const res = await fetchWithRetry(url, {
        method: 'GET',
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });

      if (res && res.status !== 204 && res.ok) {
        const data = await res.json().catch(() => null);
        const found = data?.data?.[0];
        if (found?.id) {
          const fullName = (found.Full_Name || `${found.First_Name || ''} ${found.Last_Name || ''}`).trim();
          return {
            id: String(found.id),
            name: fullName && !fullName.toLowerCase().includes('applicant') && !fullName.toLowerCase().includes('prospective') ? fullName : (found.Full_Name || ''),
            email: found.Email || null,
            phone: found.Phone || found.Mobile || normalized || phone || null,
            company: found.Company || null,
            leadSource: found.Lead_Source || null,
            leadStatus: found.Lead_Status || null,
            raw: found,
          };
        }
      }
    }

    // 2. Search by Email
    if (email && email.includes('@')) {
      const url = `https://www.zohoapis.com/crm/v2/Leads/search?email=${encodeURIComponent(email.trim())}`;
      const res = await fetchWithRetry(url, {
        method: 'GET',
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });

      if (res && res.status !== 204 && res.ok) {
        const data = await res.json().catch(() => null);
        const found = data?.data?.[0];
        if (found?.id) {
          const fullName = (found.Full_Name || `${found.First_Name || ''} ${found.Last_Name || ''}`).trim();
          return {
            id: String(found.id),
            name: fullName && !fullName.toLowerCase().includes('applicant') && !fullName.toLowerCase().includes('prospective') ? fullName : (found.Full_Name || ''),
            email: found.Email || email.trim(),
            phone: found.Phone || found.Mobile || null,
            company: found.Company || null,
            leadSource: found.Lead_Source || null,
            leadStatus: found.Lead_Status || null,
            raw: found,
          };
        }
      }
    }
  } catch (err) {
    console.warn('[Zoho Service] findZohoLead error:', err.message);
  }
  return null;
}

/**
 * Searches Zoho CRM for an existing Lead ID by phone or email.
 */
export async function searchZohoLeadByContact(phone, email) {
  const found = await findZohoLead(phone, email);
  return found?.id || null;
}

/**
 * Creates or updates a Lead in Zoho CRM and syncs the ID back to Supabase.
 *
 * @param {Object} lead - Supabase lead record
 * @param {Object} school - School metadata
 * @param {Object} [options] - Optional overrides (source, status, summary)
 */
export async function syncLeadToZoho(lead, school, options = {}) {
  if (!lead) return null;

  try {
    const token = await getAccessToken();
    if (!token) return null;

    const schoolInfo = getSchoolFormattedDetails(school);
    const normalizedPhone = normalizePhoneNumber(lead.phone || lead.normalized_phone) || lead.phone || lead.normalized_phone || '';

    // Robust Name Splitting conforming to Zoho CRM mandatory fields
    const rawName = (lead.name || '').trim();
    let firstName = '';
    let lastName = '';

    if (rawName) {
      const nameParts = rawName.split(/\s+/);
      if (nameParts.length > 1) {
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ');
      } else {
        firstName = nameParts[0];
        lastName = nameParts[0]; // Zoho requires non-empty Last_Name
      }
    } else {
      firstName = lead.channel === 'whatsapp' || lead.session_id?.startsWith('wa_') ? 'WhatsApp' : 'Web';
      lastName = normalizedPhone ? `Applicant (${normalizedPhone})` : 'Prospective Student';
    }

    const schoolSuffix = schoolInfo.slug.toUpperCase() === 'ABU' ? ' (ABU)' : ' (Babcock)';
    let leadSource = options.source || (lead.channel === 'whatsapp' || lead.session_id?.startsWith('wa_') ? 'WhatsApp Bot' : 'Website Chatbot');
    if (!leadSource.includes('(') && !leadSource.includes('ABU') && !leadSource.includes('Babcock')) {
      leadSource += schoolSuffix;
    }
    const leadStatus = options.status || (lead.status === 'escalated' ? 'Escalated' : 'New');

    let zohoLeadId = lead.zoho_contact_id;

    // If not cached in Supabase, search Zoho to prevent duplicate leads
    if (!zohoLeadId && (normalizedPhone || lead.email)) {
      zohoLeadId = await searchZohoLeadByContact(normalizedPhone, lead.email);
    }

    const description = options.summary ||
      `Admissions inquiry via ${leadSource} for ${schoolInfo.displayName}.\n` +
      `Student Name: ${rawName || 'Not provided'}\n` +
      `Phone: ${normalizedPhone || 'Not provided'}\n` +
      `Email: ${lead.email || 'Not provided'}\n` +
      `Channel: ${leadSource}\n` +
      `Last Activity: ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' })} WAT`;

    // Construct rich Zoho tags for clear CRM segmentation & filtering
    const tagsList = [];
    const schoolTag = schoolInfo.slug.toUpperCase() === 'ABU' ? 'ABUDLC' : 'Babcock';
    tagsList.push({ name: schoolTag });
    tagsList.push({ name: (lead.channel === 'whatsapp' || lead.session_id?.startsWith('wa_')) ? 'WhatsApp' : 'Website Chat' });

    if (options.tags && Array.isArray(options.tags)) {
      options.tags.forEach(t => {
        if (t && typeof t === 'string' && !tagsList.some(x => x.name.toLowerCase() === t.toLowerCase())) {
          tagsList.push({ name: t });
        }
      });
    } else if (lead.lead_tier) {
      tagsList.push({ name: lead.lead_tier === 'HOT' ? 'Hot Lead' : lead.lead_tier === 'WARM' ? 'Warm Lead' : 'Cold Lead' });
    }

    const leadPayload = {
      First_Name: firstName,
      Last_Name: lastName,
      Company: schoolInfo.companyName,
      Lead_Source: leadSource,
      Lead_Status: leadStatus,
      Description: description,
      Tag: tagsList,
    };

    if (lead.email) {
      leadPayload.Email = lead.email.trim();
    }
    if (normalizedPhone) {
      leadPayload.Phone = normalizedPhone;
      leadPayload.Mobile = normalizedPhone;
    }

    const url = zohoLeadId
      ? `https://www.zohoapis.com/crm/v2/Leads/${zohoLeadId}`
      : 'https://www.zohoapis.com/crm/v2/Leads';

    const method = zohoLeadId ? 'PUT' : 'POST';

    const response = await fetchWithRetry(url, {
      method,
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: [leadPayload] }),
    });

    const result = await response.json();
    const returnedId = result.data?.[0]?.details?.id || zohoLeadId;

    if (returnedId) {
      // Update in-memory object
      lead.zoho_contact_id = returnedId;
      lead.zoho_synced_at = new Date().toISOString();

      // Persist to Supabase leads table if lead record has an ID
      if (lead.id) {
        await supabase
          .from('leads')
          .update({
            zoho_contact_id: returnedId,
            zoho_synced_at: lead.zoho_synced_at,
            normalized_phone: normalizedPhone || lead.normalized_phone,
          })
          .eq('id', lead.id);
      }
      return returnedId;
    } else {
      console.error('[Zoho Service] syncLeadToZoho API error response:', JSON.stringify(result));
    }
  } catch (error) {
    console.error('[Zoho Service] syncLeadToZoho exception:', error.message);
  }
  return null;
}

/**
 * Unified helper to save/update a lead in Supabase and synchronize with Zoho CRM.
 * Handles phone normalization, Zoho search, dual persistence, and tagging by school.
 */
export async function saveAndSyncLead({
  school,
  sessionId,
  name,
  email,
  phone,
  channel = 'whatsapp',
  options = {},
}) {
  try {
    const normalizedPhone = normalizePhoneNumber(phone) || phone || '';
    const schoolInfo = getSchoolFormattedDetails(school);

    // 1. Check if lead already exists in Supabase
    const conditions = [];
    if (sessionId) conditions.push(`session_id.eq.${sessionId}`);
    if (normalizedPhone) conditions.push(`normalized_phone.eq.${normalizedPhone}`);
    if (phone && phone !== normalizedPhone) conditions.push(`phone.eq.${phone}`);
    if (email) conditions.push(`email.eq.${email}`);

    let lead = null;
    if (conditions.length > 0) {
      const { data: existing } = await supabase
        .from('leads')
        .select('*')
        .or(conditions.join(','))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      lead = existing;
    }

    const updates = {
      school_id: school?.id || lead?.school_id,
      session_id: sessionId || lead?.session_id,
      name: name || lead?.name,
      email: email || lead?.email,
      phone: phone || lead?.phone,
      normalized_phone: normalizedPhone || lead?.normalized_phone,
      updated_at: new Date().toISOString(),
    };

    if (lead) {
      const { data: updated, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', lead.id)
        .select()
        .single();
      if (!error && updated) lead = updated;
    } else {
      const { data: created, error } = await supabase
        .from('leads')
        .insert({
          ...updates,
          whatsapp_opt_in: channel === 'whatsapp',
        })
        .select()
        .single();
      if (!error && created) lead = created;
    }

    // 2. Sync to Zoho CRM
    if (lead) {
      const defaultSource = channel === 'whatsapp'
        ? `WhatsApp Bot (${schoolInfo.slug.toUpperCase() === 'ABU' ? 'ABU' : 'Babcock'})`
        : `Website Chatbot (${schoolInfo.slug.toUpperCase() === 'ABU' ? 'ABU' : 'Babcock'})`;

      await syncLeadToZoho(lead, school, {
        source: options.source || defaultSource,
        status: options.status,
        summary: options.summary,
      });
    }

    return lead;
  } catch (err) {
    console.error('[Zoho Service] saveAndSyncLead error:', err.message);
    return null;
  }
}

/**
 * Formats a clean chronological conversation transcript for Zoho CRM Notes and Tasks.
 */
export function formatConversationTranscript(messages = [], lead = {}, school = {}, metadata = {}) {
  const safeLead = lead || {};
  const schoolInfo = getSchoolFormattedDetails(school || {});
  const studentName = safeLead.name || 'Prospective Student';
  const phone = safeLead.phone || safeLead.normalized_phone || 'Not provided';
  const email = safeLead.email || 'Not provided';
  const channel = safeLead.channel === 'whatsapp' || safeLead.session_id?.startsWith('wa_') ? 'WhatsApp' : 'Website Chatbot';
  const nowWAT = new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' });

  const header = [
    '========================================',
    '🎓 ADMISSIONS CONVERSATION TRANSCRIPT',
    '========================================',
    `Institution: ${schoolInfo.displayName}`,
    `Student Name: ${studentName}`,
    `Phone: ${phone}`,
    `Email: ${email}`,
    `Channel: ${channel}`,
    `Session ID: ${safeLead.session_id || 'N/A'}`,
    `Date & Time: ${nowWAT} (WAT)`,
    metadata?.reason ? `Status: Escalated (${metadata.reason})` : 'Status: Active Chat',
    '========================================\n',
  ].join('\n');

  const formattedMessages = (Array.isArray(messages) ? messages : [])
    .filter(m => m && !m.role?.startsWith('__'))
    .map(m => {
      let sender = 'Student';
      if (m.role === 'assistant') sender = 'Maverick (AI Concierge)';
      else if (m.role === 'admin') sender = `${m.adminName || 'Admissions Officer'} (Staff)`;

      const timeStr = m.ts
        ? new Date(m.ts).toLocaleTimeString('en-US', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' })
        : '';
      const timeTag = timeStr ? `[${timeStr}] ` : '';

      return `${timeTag}${sender}:\n${(m.content || '').trim()}`;
    })
    .join('\n\n');

  return `${header}${formattedMessages || '(No message history)'}\n\n========================================`;
}

/**
 * Attaches a chat transcript or AI conversation summary as a Note under the Zoho Lead.
 *
 * @param {string|Object} leadOrZohoId - Zoho CRM Lead ID or Lead object
 * @param {string} title - Note title
 * @param {string} content - Note content (transcript / summary)
 * @param {Object} [school] - Optional school metadata if auto-sync is needed
 */
export async function addNoteToLead(leadOrZohoId, title, content, school = {}) {
  if (!leadOrZohoId || !content) return null;

  try {
    let zohoLeadId = typeof leadOrZohoId === 'string' ? leadOrZohoId : leadOrZohoId?.zoho_contact_id;

    // If passed a lead object without zoho_contact_id, sync the lead first
    if (!zohoLeadId && typeof leadOrZohoId === 'object') {
      zohoLeadId = await syncLeadToZoho(leadOrZohoId, school);
    }

    if (!zohoLeadId) {
      console.warn('[Zoho Service] addNoteToLead skipped: missing Zoho Lead ID');
      return null;
    }

    const token = await getAccessToken();
    if (!token) return null;

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

    const response = await fetchWithRetry('https://www.zohoapis.com/crm/v2/Notes', {
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
      return null;
    }
    return result;
  } catch (err) {
    console.error('[Zoho Service] addNoteToLead error:', err.message);
    return null;
  }
}

/**
 * Creates a High-Priority Task in Zoho CRM for human follow-up on escalation.
 *
 * @param {Object} lead - Lead record
 * @param {Object} school - School record
 * @param {string} reason - Escalation reason
 * @param {string} [details] - Escalation details or message context
 * @param {string} [transcript] - Full conversation transcript to attach as a Note
 */
export async function createEscalationTask(lead, school, reason, details = '', transcript = '') {
  try {
    const schoolInfo = getSchoolFormattedDetails(school);
    const token = await getAccessToken();
    if (!token) return null;

    // Ensure lead is synced to Zoho CRM first so task can be attached
    let zohoLeadId = lead.zoho_contact_id;
    if (!zohoLeadId) {
      zohoLeadId = await syncLeadToZoho(lead, school, { status: 'Escalated' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const studentName = lead.name || lead.phone || lead.normalized_phone || 'Prospective Student';
    const contactPhone = lead.phone || lead.normalized_phone || 'N/A';
    const contactEmail = lead.email || 'N/A';

    const taskDescription =
      `🚨 ESCALATION ALERT — ${schoolInfo.displayName}\n\n` +
      `Reason: ${reason || 'Human Assistance Requested'}\n` +
      `Institution: ${schoolInfo.displayName}\n` +
      `Student Name: ${studentName}\n` +
      `Phone: ${contactPhone}\n` +
      `Email: ${contactEmail}\n` +
      `Channel: ${lead.channel === 'whatsapp' || lead.session_id?.startsWith('wa_') ? 'WhatsApp' : 'Web Chatbot'}\n` +
      `Escalation Timestamp: ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' })} WAT\n\n` +
      `Context / User Inquiry:\n${details || 'Student requested immediate admissions support.'}`;

    const payload = {
      data: [
        {
          Subject: `🚨 Urgent Admissions Escalation: ${studentName} (${schoolInfo.displayName})`,
          Due_Date: todayStr,
          Priority: 'High',
          Status: 'Not Started',
          Description: taskDescription,
          ...(zohoLeadId ? { What_Id: zohoLeadId, $se_module: 'Leads' } : {}),
        },
      ],
    };

    const response = await fetchWithRetry('https://www.zohoapis.com/crm/v2/Tasks', {
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

    // Also attach full conversation transcript as a Note under the Lead
    if (transcript && zohoLeadId) {
      const noteTitle = `🚨 Escalation Transcript — ${new Date().toLocaleDateString()}`;
      await addNoteToLead(zohoLeadId, noteTitle, transcript, school);
    }

    return result;
  } catch (err) {
    console.error('[Zoho Service] createEscalationTask error:', err.message);
    return null;
  }
}

/**
 * Complete helper to sync Lead, Full Transcript Note, and Escalation Task to Zoho CRM.
 */
export async function syncFullConversationToZoho(lead, school, conv, options = {}) {
  if (!lead || !school || !conv) return null;

  try {
    const isEscalation = options.isEscalation || conv.stage === 'escalated';
    const status = isEscalation ? 'Escalated' : (options.status || 'In Progress');

    // 1. Sync Lead Details to Zoho CRM
    const zohoLeadId = await syncLeadToZoho(lead, school, {
      status,
      source: options.source || (conv.channel === 'whatsapp' ? 'WhatsApp Bot' : 'Website Chatbot'),
      summary: options.summary,
    });

    // 2. Format and Attach Full Conversation Transcript as Note
    const transcript = formatConversationTranscript(conv.messages || [], lead, school, {
      reason: options.reason,
    });

    const noteTitle = isEscalation
      ? `🚨 Escalation Transcript (${new Date().toLocaleDateString()})`
      : `📋 Full Chat Transcript (${new Date().toLocaleDateString()})`;

    if (zohoLeadId) {
      await addNoteToLead(zohoLeadId, noteTitle, transcript, school);
    }

    // 3. If Escalated, create High-Priority Task
    if (isEscalation) {
      await createEscalationTask(
        lead,
        school,
        options.reason || 'Human Assistance Requested',
        options.details || 'Student requested admissions advisor.',
        transcript
      );
    }

    return zohoLeadId;
  } catch (err) {
    console.error('[Zoho Service] syncFullConversationToZoho error:', err.message);
    return null;
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
  const schoolInfo = getSchoolFormattedDetails(school);
  const schoolSlug = schoolInfo.slug.toUpperCase();

  // Determine webhook URL: school-specific override or general fallback
  const webhookUrl =
    (schoolSlug && process.env[`ZOHO_CLIQ_WEBHOOK_URL_${schoolSlug}`]) ||
    (schoolSlug === 'BABCOCK' || schoolSlug === 'BACKOCK'
      ? (process.env.ZOHO_CLIQ_WEBHOOK_URL_BABCOCK || process.env.ZOHO_CLIQ_WEBHOOK_URL_BACKOCK)
      : null) ||
    process.env.ZOHO_CLIQ_WEBHOOK_URL;

  if (!webhookUrl) {
    return; // Cliq webhook not configured; fail silently
  }

  const studentName = lead?.name || 'Prospective Student';
  const phone = lead?.phone || lead?.normalized_phone || 'Not provided';
  const email = lead?.email || 'Not provided';
  const sourceChannel = options.channel || (lead?.channel === 'whatsapp' || lead?.session_id?.startsWith('wa_') ? 'WhatsApp' : 'Web Chatbot');
  const appUrl = process.env.APP_URL || 'https://eabt-ai-team-project.vercel.app';
  const chatUrl = options.actionUrl || `${appUrl}/chats`;

  const cliqPayload = {
    text: `🚨 *Lead Alert — ${schoolInfo.displayName}*`,
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
          { 'Institution': schoolInfo.displayName },
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

  try {
    const res = await fetchWithRetry(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cliqPayload),
    });
    if (!res.ok) {
      console.error('[Zoho Cliq] Webhook returned status:', res.status);
    }
  } catch (err) {
    console.error('[Zoho Cliq] Alert failed:', err.message);
  }
}
