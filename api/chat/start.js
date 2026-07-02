import { applyCors } from '../../src/utils/cors.js';
import { getSchool } from '../../src/utils/validate.js';
import supabase from '../../src/db/supabase.js';
import { chat } from '../../src/services/llm.js';
import * as zoho from '../../src/services/zoho.js';
import { anyAdminOnline } from '../../src/utils/presence.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { schoolId, sessionId, name, email, phone } = req.body;

    if (!schoolId || !sessionId || !name || !email || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const school = await getSchool(schoolId, res);
    if (!school) return;

    // Check if there is an existing lead with the same email and phone for this school
    let { data: existingLeads } = await supabase
      .from('leads')
      .select('*')
      .eq('school_id', school.id)
      .eq('email', email)
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(1);

    let lead = existingLeads?.[0] || null;
    let existingConv = null;

    if (lead) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('*')
        .eq('lead_id', lead.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      existingConv = conv;

      const { data: updated } = await supabase
        .from('leads')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', lead.id)
        .select()
        .single();
      lead = updated;
    } else {
      const { data: newLead } = await supabase
        .from('leads')
        .insert({ school_id: school.id, session_id: sessionId, name, email, phone })
        .select()
        .single();
      lead = newLead;
    }

    // Generate warm greeting ONLY if we are starting a new conversation
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
          messages: initialMessages,
        });
    }

    // Sync lead to Zoho CRM in the background
    zoho.syncLeadToZoho(lead, school).catch(console.error);

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
