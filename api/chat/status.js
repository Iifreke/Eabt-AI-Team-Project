import { applyCors } from '../../src/utils/cors.js';
import supabase from '../../src/db/supabase.js';
import { anyAdminOnline } from '../../src/utils/presence.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  try {
    // Widget polls this every 30s while a chat is open — piggyback a presence
    // touch so "lead is online" reflects an open tab, not just message sends.
    const { sessionId } = req.query;
    if (sessionId) {
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('session_id', sessionId);
    }

    const adminsOnline = await anyAdminOnline(supabase);
    return res.status(200).json({ adminsOnline });
  } catch {
    return res.status(200).json({ adminsOnline: false });
  }
}
