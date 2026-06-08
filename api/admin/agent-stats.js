import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    // Fetch all agents
    const { data: agents } = await supabase
      .from('admin_profiles')
      .select('id, full_name, email, status, role')
      .order('full_name');

    // Fetch all escalations with lead and school info
    const { data: escalations } = await supabase
      .from('escalations')
      .select(`
        id,
        attended_by,
        resolved_by,
        status,
        reason,
        created_at,
        first_response_at,
        conversation_id,
        lead_id,
        school_id
      `)
      .order('created_at', { ascending: false });

    if (!agents || !escalations) {
      return res.status(200).json({ agentStats: [] });
    }

    // Fetch leads for all escalations
    const leadIds = [...new Set((escalations || []).map(e => e.lead_id).filter(Boolean))];
    const schoolIds = [...new Set((escalations || []).map(e => e.school_id).filter(Boolean))];

    const [leadsResult, schoolsResult] = await Promise.all([
      leadIds.length
        ? supabase.from('leads').select('id, name, email, phone').in('id', leadIds)
        : Promise.resolve({ data: [] }),
      schoolIds.length
        ? supabase.from('schools').select('id, name').in('id', schoolIds)
        : Promise.resolve({ data: [] }),
    ]);

    const leadsMap = Object.fromEntries((leadsResult.data || []).map(l => [l.id, l]));
    const schoolsMap = Object.fromEntries((schoolsResult.data || []).map(s => [s.id, s]));

    // Build per-agent stats (match by full_name since that's what attended_by stores)
    const agentStats = agents.map(agent => {
      const agentEscalations = escalations.filter(
        e => e.attended_by === agent.full_name || e.resolved_by === agent.full_name
      );

      const active = agentEscalations.filter(e => e.status === 'in_progress');
      const resolved = agentEscalations.filter(e => e.status === 'resolved');
      const pending = agentEscalations.filter(e => e.status === 'pending' && e.attended_by === agent.full_name);

      const conversations = agentEscalations.map(e => ({
        id: e.conversation_id,
        escalationId: e.id,
        status: e.status,
        reason: e.reason,
        startedAt: e.created_at,
        firstResponseAt: e.first_response_at,
        lead: leadsMap[e.lead_id] || null,
        school: schoolsMap[e.school_id]?.name || '—',
      }));

      return {
        id: agent.id,
        name: agent.full_name || agent.email,
        email: agent.email,
        status: agent.status,
        role: agent.role,
        total: agentEscalations.length,
        active: active.length,
        resolved: resolved.length,
        pending: pending.length,
        conversations,
      };
    });

    return res.status(200).json({ agentStats });
  } catch (err) {
    console.error('agent-stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
