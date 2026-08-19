import { applyCors } from '../../src/utils/cors.js';
import { getSchool } from '../../src/utils/validate.js';
import supabase from '../../src/db/supabase.js';
import { chat } from '../../src/services/llm.js';
import { anyAdminOnline } from '../../src/utils/presence.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const { schoolId, sessionId } = req.query;
  if (!schoolId || !sessionId) {
    return res.status(400).json({ error: 'schoolId and sessionId are required' });
  }

  try {
    const school = await getSchool(schoolId, res);
    if (!school) return;

    // Returning visitor — send back their last message without re-generating greeting
    const { data: conv } = await supabase
      .from('conversations')
      .select('stage, messages')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (conv?.messages?.length > 0) {
      const adminsOnline = await anyAdminOnline(supabase);
      const lastMsg = conv.messages[conv.messages.length - 1];
      return res.status(200).json({
        message: lastMsg?.content || `Welcome back to ${school.name}!`,
        suggestions: [],
        stage: conv.stage || 'onboarding',
        adminsOnline,
      });
    }

    // New session — generate a warm greeting
    const greetingText = await chat(
      `You are Maverick, a warm, friendly admissions assistant for ${school.name}. Write ONLY in plain English — no markdown, no asterisks, no bullet symbols. Keep it to 2 sentences.`,
      [{
        role: 'user',
        content: `Greet the visitor warmly. Welcome them, introduce yourself as Maverick, and ask what they would like to know about ${school.name}.`,
      }]
    );

    const adminsOnline = await anyAdminOnline(supabase);

    return res.status(200).json({
      message: greetingText,
      suggestions: [],
      stage: 'onboarding',
      adminsOnline,
    });
  } catch (error) {
    console.error('greet error:', error);
    return res.status(200).json({
      message: 'Hello! Welcome. How can I help you today?',
      suggestions: [],
      stage: 'onboarding',
    });
  }
}
