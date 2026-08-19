import { applyCors } from '../../src/utils/cors.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { sessionId, online } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    const updates = {
      user_last_seen_web: new Date().toISOString(),
      user_web_online: online !== false,
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from('conversations')
      .update(updates)
      .eq('session_id', sessionId);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('presence error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
