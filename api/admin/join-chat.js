import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { escalationId, agentName } = req.body || {};
    if (!escalationId) return res.status(400).json({ error: 'escalationId required' });

    const name = agentName || user.email;

    // Fetch current co_agents
    const { data: esc, error: fetchErr } = await supabase
      .from('escalations')
      .select('id, attended_by, co_agents')
      .eq('id', escalationId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!esc) return res.status(404).json({ error: 'Escalation not found' });

    // Don't add if already the primary agent or already in co_agents
    const existing = esc.co_agents || [];
    if (esc.attended_by === name || existing.includes(name)) {
      return res.status(200).json({ ok: true, alreadyJoined: true });
    }

    const updated = [...existing, name];

    const { error: updateErr } = await supabase
      .from('escalations')
      .update({ co_agents: updated, updated_at: new Date().toISOString() })
      .eq('id', escalationId);

    if (updateErr) throw updateErr;

    return res.status(200).json({ ok: true, co_agents: updated });
  } catch (error) {
    console.error('join-chat error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
