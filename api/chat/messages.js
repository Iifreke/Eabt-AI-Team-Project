import { applyCors } from '../../src/utils/cors.js';
import supabase from '../../src/db/supabase.js';

// Public endpoint — no auth required (widget polls this)
// Returns the latest messages for a conversation by sessionId
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  try {
    const { data: conv, error } = await supabase
      .from('conversations')
      .select('id, messages, stage, updated_at')
      .eq('session_id', sessionId)
      .single();

    if (error || !conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const all = conv.messages || [];
    const typingEntry = all.find(m => m.role === '__typing__');
    const agentTyping = typingEntry && (Date.now() - typingEntry.ts) < 8000
      ? { agentName: typingEntry.agentName }
      : null;

    return res.status(200).json({
      messages: all.filter(m => m.role !== '__typing__'),
      agentTyping,
      stage: conv.stage,
      updatedAt: conv.updated_at,
    });
  } catch (error) {
    console.error('poll messages error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
