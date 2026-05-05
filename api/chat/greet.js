import { applyCors } from '../../src/utils/cors.js';
import { getSchool } from '../../src/utils/validate.js';
import supabase from '../../src/db/supabase.js';
import { buildOnboardingSystemPrompt, chat } from '../../src/services/llm.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const { schoolId, sessionId } = req.query;

    if (!schoolId || !sessionId) {
      return res.status(400).json({ error: 'Missing schoolId or sessionId' });
    }

    const school = await getSchool(schoolId, res);
    if (!school) return;

    // Load or create conversation
    let { data: conv } = await supabase
      .from('conversations')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (!conv) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({ school_id: school.id, session_id: sessionId, stage: 'onboarding' })
        .select()
        .single();
      conv = newConv;
    }

    // Load or create lead
    let { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (!lead) {
      const { data: newLead } = await supabase
        .from('leads')
        .insert({ school_id: school.id, session_id: sessionId })
        .select()
        .single();
      lead = newLead;
    }

    // If already greeted, return first bot message
    const messages = conv.messages || [];
    const firstBot = messages.find(m => m.role === 'assistant');
    if (firstBot) {
      return res.status(200).json({
        message: firstBot.content,
        stage: conv.stage,
        suggestions: [],
      });
    }

    // Generate greeting
    const systemPrompt = buildOnboardingSystemPrompt(school.name);
    const greetingText = await chat(systemPrompt, [
      {
        role: 'user',
        content: `The visitor just opened the chat. Greet them warmly, mention that you are the admissions assistant for ${school.name}, and ask for their full name to get started.`,
      },
    ]);

    // Save bot message
    const updatedMessages = [...messages, { role: 'assistant', content: greetingText, ts: Date.now() }];
    await supabase
      .from('conversations')
      .update({ messages: updatedMessages, updated_at: new Date().toISOString() })
      .eq('id', conv.id);

    return res.status(200).json({
      message: greetingText,
      stage: 'onboarding',
      suggestions: [],
    });
  } catch (error) {
    console.error('greet error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
