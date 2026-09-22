import { applyCors } from '../../src/utils/cors.js';
import { getSchool, isValidEmail } from '../../src/utils/validate.js';
import supabase from '../../src/db/supabase.js';
import { chat } from '../../src/services/llm.js';
import * as zoho from '../../src/services/zoho.js';
import { anyAdminOnline } from '../../src/utils/presence.js';
import { normalizePhoneNumber } from '../../src/utils/phone.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { schoolId, sessionId, name, email, phone } = req.body;

    if (!schoolId || !sessionId || !name || !email || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const school = await getSchool(schoolId, res);
    if (!school) return;

    const normalizedPhone = normalizePhoneNumber(phone) || phone;

    const conditions = [];
    if (email) conditions.push(`email.eq.${email}`);
    if (normalizedPhone) conditions.push(`normalized_phone.eq.${normalizedPhone}`);
    if (phone && phone !== normalizedPhone) conditions.push(`phone.eq.${phone}`);

    let leadQuery = supabase.from('leads').select('*').eq('school_id', school.id);
    if (conditions.length > 0) {
      leadQuery = leadQuery.or(conditions.join(','));
    }
    let { data: existingLeads } = await leadQuery.order('created_at', { ascending: false }).limit(1);

    let lead = existingLeads?.[0] || null;
    let existingConv = null;

    // Check Zoho CRM for existing lead
    let zohoLead = null;
    try {
      zohoLead = await zoho.findZohoLead(normalizedPhone, email);
    } catch (zErr) {
      console.warn('[Web Chat Start] Zoho search warning:', zErr.message);
    }

    if (lead) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('*')
        .eq('lead_id', lead.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      existingConv = conv;

      const updates = {
        name,
        email,
        phone,
        normalized_phone: normalizedPhone,
        updated_at: new Date().toISOString(),
      };
      if (zohoLead?.id && !lead.zoho_contact_id) {
        updates.zoho_contact_id = zohoLead.id;
        updates.zoho_synced_at = new Date().toISOString();
      }

      const { data: updated } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', lead.id)
        .select()
        .single();
      lead = updated || lead;
    } else {
      const { data: newLead } = await supabase
        .from('leads')
        .insert({
          school_id: school.id,
          session_id: sessionId,
          name,
          email,
          phone,
          normalized_phone: normalizedPhone,
          zoho_contact_id: zohoLead?.id || null,
          zoho_synced_at: zohoLead?.id ? new Date().toISOString() : null,
        })
        .select()
        .single();
      lead = newLead;
    }

    // Generate warm greeting ONLY if starting a new conversation
    let greetingText = '';
    let initialMessages = [];
    if (!existingConv) {
      const firstName = name.split(' ')[0];
      greetingText = await chat(
        `You are Maverick, a warm, friendly admissions assistant for ${school.name}. Your name is Maverick. Write ONLY in plain English — no markdown, no asterisks, no bullet symbols. Keep it to 2 sentences.`,
        [{
          role: 'user',
          content: `Greet ${firstName} warmly. Welcome them, introduce yourself as Maverick, and ask what they would like to know about ${school.name}.`,
        }]
      );
      initialMessages = [{ role: 'assistant', content: greetingText, ts: Date.now() }];

      // Create new conversation
      await supabase
        .from('conversations')
        .insert({
          school_id: school.id,
          session_id: sessionId,
          lead_id: lead.id,
          stage: 'active',
          channel: 'web',
          user_web_online: true,
          user_last_seen_web: new Date().toISOString(),
          messages: initialMessages,
        });

      // Send Cliq alert for new prospective student
      await zoho.sendCliqAlert(
        school,
        lead,
        `New prospective student started chatting on the website widget: "${lead.name}" (${lead.email || lead.phone})`,
        {
          channel: 'Web Chatbot',
          chatId: sessionId,
          actionUrl: `${zoho.getAppBaseUrl()}/chats?id=${sessionId}`,
        }
      );
    } else {
      await supabase
        .from('conversations')
        .update({
          user_web_online: true,
          user_last_seen_web: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConv.id);
    }

    // Sync lead to Zoho CRM immediately with full details and direct chat link
    try {
      const syncedZohoId = await zoho.syncLeadToZoho(lead, school, {
        source: `Website Chatbot (${school.slug.toUpperCase() === 'ABU' ? 'ABU' : 'Babcock'})`,
        chatId: sessionId,
      });
      if (syncedZohoId) {
        lead.zoho_contact_id = syncedZohoId;
        lead.zoho_synced_at = new Date().toISOString();
      }
    } catch (zErr) {
      console.error('[Web Chat Start] Zoho lead sync error:', zErr.message);
    }

    const adminsOnline = await anyAdminOnline(supabase);

    if (existingConv) {
      return res.status(200).json({
        message: existingConv.messages?.[existingConv.messages.length - 1]?.content || 'Welcome back!',
        stage: existingConv.stage || 'active',
        lead,
        sessionId: existingConv.session_id,
        messages: existingConv.messages || [],
        adminsOnline,
      });
    }

    return res.status(200).json({ message: greetingText, stage: 'active', lead, adminsOnline });
  } catch (error) {
    console.error('start error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
