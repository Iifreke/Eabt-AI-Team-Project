import { applyCors } from '../../src/utils/cors.js';
import { getSchool } from '../../src/utils/validate.js';
import supabase from '../../src/db/supabase.js';
import { chat } from '../../src/services/llm.js';
import * as zoho from '../../src/services/zoho.js';

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

    // Upsert lead with all collected details
    let { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (lead) {
      const { data: updated } = await supabase
        .from('leads')
        .update({ name, email, phone, updated_at: new Date().toISOString() })
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

    // Generate a warm, personalised greeting (no markdown)
    const firstName = name.split(' ')[0];
    const greetingText = await chat(
      `You are Maverick, a warm, friendly admissions assistant for ${school.name}. Your name is Maverick. Write ONLY in plain English — no markdown, no asterisks, no bullet symbols. Keep it to 2 sentences.`,
      [{
        role: 'user',
        content: `Greet ${firstName} warmly. Welcome them, introduce yourself as Maverick, and ask what they would like to know about ${school.name}.`,
      }]
    );

    const initialMessages = [{ role: 'assistant', content: greetingText, ts: Date.now() }];

    // Upsert conversation in active stage
    let { data: conv } = await supabase
      .from('conversations')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (conv) {
      await supabase
        .from('conversations')
        .update({ stage: 'active', messages: initialMessages, updated_at: new Date().toISOString() })
        .eq('id', conv.id);
    } else {
      await supabase
        .from('conversations')
        .insert({ school_id: school.id, session_id: sessionId, stage: 'active', messages: initialMessages });
    }

    // Sync lead to Zoho CRM in the background
    zoho.syncLeadToZoho(lead, school).catch(console.error);

    return res.status(200).json({ message: greetingText, stage: 'active', lead });
  } catch (error) {
    console.error('start error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
