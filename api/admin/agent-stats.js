import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    // ── Human agents ──────────────────────────────────────────
    const { data: agents } = await supabase
      .from('admin_profiles')
      .select('id, full_name, email, status, role')
      .order('full_name');

    const { data: escalations } = await supabase
      .from('escalations')
      .select('id, attended_by, resolved_by, status, reason, created_at, first_response_at, conversation_id, lead_id, school_id')
      .order('created_at', { ascending: false });

    const escLeadIds   = [...new Set((escalations || []).map(e => e.lead_id).filter(Boolean))];
    const escSchoolIds = [...new Set((escalations || []).map(e => e.school_id).filter(Boolean))];

    const [escLeads, escSchools] = await Promise.all([
      escLeadIds.length
        ? supabase.from('leads').select('id, name, email, phone').in('id', escLeadIds)
        : Promise.resolve({ data: [] }),
      escSchoolIds.length
        ? supabase.from('schools').select('id, name').in('id', escSchoolIds)
        : Promise.resolve({ data: [] }),
    ]);

    const escLeadsMap   = Object.fromEntries((escLeads.data  || []).map(l => [l.id, l]));
    const escSchoolsMap = Object.fromEntries((escSchools.data || []).map(s => [s.id, s]));

    const agentStats = (agents || []).map(agent => {
      const mine = (escalations || []).filter(
        e => e.attended_by === agent.full_name || e.resolved_by === agent.full_name
      );
      return {
        id:       agent.id,
        name:     agent.full_name || agent.email,
        email:    agent.email,
        status:   agent.status,
        role:     agent.role,
        total:    mine.length,
        active:   mine.filter(e => e.status === 'in_progress').length,
        resolved: mine.filter(e => e.status === 'resolved').length,
        conversations: mine.map(e => ({
          id:             e.conversation_id,
          escalationId:   e.id,
          status:         e.status,
          reason:         e.reason,
          startedAt:      e.created_at,
          firstResponseAt:e.first_response_at,
          lead:           escLeadsMap[e.lead_id] || null,
          school:         escSchoolsMap[e.school_id]?.name || '—',
        })),
      };
    });

    // ── AI Bot stats ──────────────────────────────────────────
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, stage, messages, created_at, updated_at, lead_id, school_id')
      .order('updated_at', { ascending: false });

    const convs = conversations || [];
    const convLeadIds   = [...new Set(convs.map(c => c.lead_id).filter(Boolean))];
    const convSchoolIds = [...new Set(convs.map(c => c.school_id).filter(Boolean))];

    const [convLeads, convSchools] = await Promise.all([
      convLeadIds.length
        ? supabase.from('leads').select('id, name, email, phone').in('id', convLeadIds)
        : Promise.resolve({ data: [] }),
      convSchoolIds.length
        ? supabase.from('schools').select('id, name').in('id', convSchoolIds)
        : Promise.resolve({ data: [] }),
    ]);

    const convLeadsMap   = Object.fromEntries((convLeads.data  || []).map(l => [l.id, l]));
    const convSchoolsMap = Object.fromEntries((convSchools.data || []).map(s => [s.id, s]));

    const botRows = convs.map(c => ({
      id:           c.id,
      stage:        c.stage,
      messageCount: Array.isArray(c.messages) ? c.messages.filter(m => !m.role?.startsWith('__')).length : 0,
      startedAt:    c.created_at,
      lastActivity: c.updated_at,
      lead:         convLeadsMap[c.lead_id]  || null,
      school:       convSchoolsMap[c.school_id]?.name || '—',
    }));

    const botStats = {
      total:     botRows.length,
      active:    botRows.filter(r => r.stage === 'active' || r.stage === 'onboarding').length,
      escalated: botRows.filter(r => r.stage === 'escalated').length,
      conversations: botRows,
    };

    return res.status(200).json({ agentStats, botStats });
  } catch (err) {
    console.error('agent-stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
