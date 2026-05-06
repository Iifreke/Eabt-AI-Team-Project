import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { schoolId } = req.query;

    // Resolve school UUID from slug if provided
    let schoolUUID = null;
    if (schoolId) {
      const { data: school } = await supabase
        .from('schools')
        .select('id')
        .eq('slug', schoolId)
        .single();
      schoolUUID = school?.id || null;
    }

    // Helper: build a filtered count query
    const countQuery = (table, extraFilters = {}) => {
      let q = supabase.from(table).select('*', { count: 'exact', head: true });
      if (schoolUUID) q = q.eq('school_id', schoolUUID);
      for (const [k, v] of Object.entries(extraFilters)) q = q.eq(k, v);
      return q;
    };

    const [
      { count: totalLeads },
      { count: totalConversations },
      { count: activeConversations },
      { count: pendingEscalations },
      { data: schools },
      { data: recentLeads },
    ] = await Promise.all([
      countQuery('leads'),
      countQuery('conversations'),
      countQuery('conversations', { stage: 'active' }),
      countQuery('escalations', { status: 'pending' }),
      supabase.from('schools').select('id, slug, name'),
      supabase
        .from('leads')
        .select('name, email, school_id, created_at, schools(slug, name)')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // Leads by school
    const leadsBySchool = {};
    if (schools) {
      for (const school of schools) {
        const { count } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('school_id', school.id);
        leadsBySchool[school.slug] = count || 0;
      }
    }

    // Filter recentLeads by school when scoped
    const filteredLeads = schoolUUID
      ? (recentLeads || []).filter(l => l.school_id === schoolUUID).slice(0, 5)
      : (recentLeads || []).slice(0, 5);

    return res.status(200).json({
      totalLeads: totalLeads || 0,
      totalConversations: totalConversations || 0,
      activeConversations: activeConversations || 0,
      pendingEscalations: pendingEscalations || 0,
      leadsBySchool,
      recentLeads: filteredLeads,
    });
  } catch (error) {
    console.error('stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
