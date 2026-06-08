import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    // All conversations the AI bot has handled (every stage)
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, session_id, stage, messages, created_at, updated_at, lead_id, school_id')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const convs = conversations || [];

    // Fetch leads and schools for display
    const leadIds = [...new Set(convs.map(c => c.lead_id).filter(Boolean))];
    const schoolIds = [...new Set(convs.map(c => c.school_id).filter(Boolean))];

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

    const rows = convs.map(c => ({
      id: c.id,
      stage: c.stage,
      messageCount: Array.isArray(c.messages) ? c.messages.filter(m => !m.role?.startsWith('__')).length : 0,
      startedAt: c.created_at,
      lastActivity: c.updated_at,
      lead: leadsMap[c.lead_id] || null,
      school: schoolsMap[c.school_id]?.name || '—',
    }));

    const active = rows.filter(r => r.stage === 'active' || r.stage === 'onboarding');
    const escalated = rows.filter(r => r.stage === 'escalated');
    const total = rows.length;

    return res.status(200).json({ total, active: active.length, escalated: escalated.length, conversations: rows });
  } catch (err) {
    console.error('agent-stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
