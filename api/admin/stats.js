import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const [
      { count: totalLeads },
      { count: totalConversations },
      { count: activeConversations },
      { count: pendingEscalations },
      { data: schools },
      { data: recentLeads },
    ] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }),
      supabase.from('conversations').select('*', { count: 'exact', head: true }),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('stage', 'active'),
      supabase.from('escalations').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('schools').select('id, slug'),
      supabase
        .from('leads')
        .select('name, email, school_id, created_at, schools(slug)')
        .order('created_at', { ascending: false })
        .limit(5),
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

    return res.status(200).json({
      totalLeads: totalLeads || 0,
      totalConversations: totalConversations || 0,
      activeConversations: activeConversations || 0,
      pendingEscalations: pendingEscalations || 0,
      leadsBySchool,
      recentLeads: recentLeads || [],
    });
  } catch (error) {
    console.error('stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
