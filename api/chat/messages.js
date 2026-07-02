import { applyCors } from '../../src/utils/cors.js';
import supabase from '../../src/db/supabase.js';
import { anyAdminOnline } from '../../src/utils/presence.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // PATCH — CSAT rating submission (no auth, public)
  if (req.method === 'PATCH') {
    const { sessionId, rating } = req.body || {};
    if (!sessionId || !rating) return res.status(400).json({ error: 'sessionId and rating required' });
    try {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('session_id', sessionId)
        .single();
      if (!conv) return res.status(404).json({ error: 'Conversation not found' });
      await supabase.from('conversations').update({ rating: Number(rating) }).eq('id', conv.id);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('rating error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method !== 'GET') return res.status(405).end();

  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  try {
    const { data: conv, error } = await supabase
      .from('conversations')
      .select('id, messages, stage, updated_at')
      .eq('session_id', sessionId)
      .single();

    if (error || !conv) return res.status(404).json({ error: 'Conversation not found' });

    // This poll fires every 3s while escalated — piggyback a presence touch
    // so the lead shows as online even while silently reading, not just messaging.
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conv.id);

    const adminsOnline = await anyAdminOnline(supabase);

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
      adminsOnline,
    });
  } catch (error) {
    console.error('poll messages error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
