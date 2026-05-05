import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const { data: conv, error } = await supabase
      .from('conversations')
      .select('*, leads(*), schools(name, slug)')
      .eq('id', id)
      .single();

    if (error || !conv) return res.status(404).json({ error: 'Conversation not found' });

    // Fetch escalation if exists
    const { data: escalation } = await supabase
      .from('escalations')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return res.status(200).json({ ...conv, escalation: escalation || null });
  } catch (error) {
    console.error('conversation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
