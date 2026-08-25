import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import { resolveSchoolId } from '../../src/utils/validate.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { schoolId, range, agentName } = req.query;

    const now = new Date();
    const cutoff = range === 'today'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      : range === 'week'  ? new Date(Date.now() - 7 * 86400000).toISOString()
      : range === 'month' ? new Date(Date.now() - 30 * 86400000).toISOString()
      : null;

    let schoolUUID = null;
    if (schoolId) {
      schoolUUID = await resolveSchoolId(schoolId);
    }

    // Range-filtered count
    const baseQ = (table, filters = {}) => {
      let q = supabase.from(table).select('*', { count: 'exact', head: true });
      if (schoolUUID) q = q.eq('school_id', schoolUUID);
      if (cutoff) q = q.gte('created_at', cutoff);
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      return q;
    };

    // Real-time count (no cutoff)
    const rtQ = (table, filters = {}) => {
      let q = supabase.from(table).select('*', { count: 'exact', head: true });
      if (schoolUUID) q = q.eq('school_id', schoolUUID);
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      return q;
    };

    const [
      { count: totalLeads },
      { count: totalConversations },
      { count: activeConversations },
      { count: pendingEscalations },
      { count: resolvedChats },
      { data: schools },
      { data: recentLeads },
    ] = await Promise.all([
      baseQ('leads'),
      baseQ('conversations'),
      rtQ('conversations', { stage: 'active' }),
      rtQ('escalations', { status: 'pending' }),
      baseQ('escalations', { status: 'resolved' }),
      supabase.from('schools').select('id, slug, name'),
      supabase.from('leads')
        .select('name, email, school_id, created_at, schools(slug, name)')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // Leads by school
    const leadsBySchool = {};
    if (schools) {
      await Promise.all(schools.map(async s => {
        const { count } = await supabase.from('leads')
          .select('*', { count: 'exact', head: true }).eq('school_id', s.id);
        leadsBySchool[s.slug] = count || 0;
      }));
    }

    const filteredLeads = schoolUUID
      ? (recentLeads || []).filter(l => l.school_id === schoolUUID).slice(0, 5)
      : (recentLeads || []).slice(0, 5);

    // Leads trend (daily buckets for chart)
    let leadsTrend = [];
    {
      const trendCutoff = cutoff || new Date(Date.now() - 30 * 86400000).toISOString();
      let q = supabase.from('leads').select('created_at');
      if (schoolUUID) q = q.eq('school_id', schoolUUID);
      const { data: trendLeads } = await q.gte('created_at', trendCutoff);
      const grouped = {};
      (trendLeads || []).forEach(l => {
        const date = l.created_at.slice(0, 10);
        grouped[date] = (grouped[date] || 0) + 1;
      });
      leadsTrend = Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));
    }

    // Human-assisted vs AI-only
    let humanAssistedCount = 0;
    let aiOnlyCount = 0;
    {
      let q = supabase.from('escalations').select('*', { count: 'exact', head: true });
      if (schoolUUID) q = q.eq('school_id', schoolUUID);
      if (cutoff) q = q.gte('created_at', cutoff);
      const { count } = await q;
      humanAssistedCount = count || 0;
      aiOnlyCount = Math.max(0, (totalConversations || 0) - humanAssistedCount);
    }

    // Agent performance
    let agentPerformance = [];
    {
      let q = supabase.from('escalations')
        .select('attended_by, resolved_by, status, created_at, first_response_at, lead_id');
      if (schoolUUID) q = q.eq('school_id', schoolUUID);
      if (cutoff) q = q.gte('created_at', cutoff);
      const { data: escData } = await q;
      const map = {};
      (escData || []).forEach(e => {
        if (e.attended_by) {
          if (!map[e.attended_by]) {
            map[e.attended_by] = {
              agent: e.attended_by,
              served: 0,
              resolved: 0,
              totalResponseMs: 0,
              responseCount: 0,
              uniqueLeads: new Set(),
            };
          }
          map[e.attended_by].served++;
          if (e.first_response_at && e.created_at) {
            const ms = new Date(e.first_response_at) - new Date(e.created_at);
            if (ms > 0) {
              map[e.attended_by].totalResponseMs += ms;
              map[e.attended_by].responseCount++;
            }
          }
          if (e.lead_id) map[e.attended_by].uniqueLeads.add(e.lead_id);
        }
        if (e.status === 'resolved' && e.resolved_by) {
          if (!map[e.resolved_by]) {
            map[e.resolved_by] = {
              agent: e.resolved_by,
              served: 0,
              resolved: 0,
              totalResponseMs: 0,
              responseCount: 0,
              uniqueLeads: new Set(),
            };
          }
          map[e.resolved_by].resolved++;
        }
      });
      agentPerformance = Object.values(map).map(a => ({
        agent: a.agent,
        served: a.served,
        resolved: a.resolved,
        avgResponseMs: a.responseCount > 0 ? Math.round(a.totalResponseMs / a.responseCount) : null,
        usersRespondedTo: a.uniqueLeads.size,
      })).sort((a, b) => b.served - a.served);
    }

    // Open tickets
    const { count: openTickets } = await supabase
      .from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'open');

    // Average CSAT
    let avgCsat = null;
    {
      let q = supabase.from('conversations').select('rating').not('rating', 'is', null);
      if (schoolUUID) q = q.eq('school_id', schoolUUID);
      const { data: ratings } = await q;
      if (ratings?.length) {
        avgCsat = Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10;
      }
    }

    // Agent-specific detailed statistics
    let agentStats = null;
    if (agentName) {
      // Fetch escalations for this agent
      let q = supabase.from('escalations')
        .select('id, attended_by, resolved_by, status, created_at, first_response_at, leads(id, name, email, phone, created_at, schools(slug, name))')
        .or(`attended_by.eq."${agentName}",resolved_by.eq."${agentName}"`);
      if (schoolUUID) q = q.eq('school_id', schoolUUID);
      
      const { data: agentEscs } = await q.order('created_at', { ascending: false });
      
      const nowMs = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      const oneWeek = 7 * oneDay;
      const oneMonth = 30 * oneDay;
      
      const served = { today: 0, week: 0, month: 0, allTime: 0 };
      const resolved = { today: 0, week: 0, month: 0, allTime: 0 };
      let totalResponseMs = 0;
      let responseCount = 0;
      
      const recentLeadsMap = new Map();
      const dailyGrouped = {};
      
      (agentEscs || []).forEach(e => {
        const createdMs = new Date(e.created_at).getTime();
        const diffMs = nowMs - createdMs;
        
        // Count served
        if (e.attended_by === agentName) {
          served.allTime++;
          if (diffMs <= oneDay) served.today++;
          if (diffMs <= oneWeek) served.week++;
          if (diffMs <= oneMonth) served.month++;
          
          // Group by day for trend (past 30 days)
          if (diffMs <= 30 * oneDay) {
            const date = e.created_at.slice(0, 10);
            dailyGrouped[date] = (dailyGrouped[date] || 0) + 1;
          }
        }
        
        // Count resolved
        if (e.resolved_by === agentName && e.status === 'resolved') {
          resolved.allTime++;
          if (diffMs <= oneDay) resolved.today++;
          if (diffMs <= oneWeek) resolved.week++;
          if (diffMs <= oneMonth) resolved.month++;
        }
        
        // Response time
        if (e.attended_by === agentName && e.first_response_at && e.created_at) {
          const ms = new Date(e.first_response_at) - new Date(e.created_at);
          if (ms > 0) {
            totalResponseMs += ms;
            responseCount++;
          }
        }
        
        // Recent leads
        if (e.leads && !recentLeadsMap.has(e.leads.id)) {
          recentLeadsMap.set(e.leads.id, {
            ...e.leads,
            status: e.status,
            attended_by: e.attended_by,
            resolved_by: e.resolved_by,
          });
        }
      });
      
      const dailyTrend = Object.entries(dailyGrouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));
        
      agentStats = {
        served,
        resolved,
        avgResponseMs: responseCount > 0 ? Math.round(totalResponseMs / responseCount) : null,
        leadsTrend: dailyTrend,
        recentLeads: Array.from(recentLeadsMap.values()).slice(0, 50),
      };
    }

    return res.status(200).json({
      totalLeads: totalLeads || 0,
      totalConversations: totalConversations || 0,
      activeConversations: activeConversations || 0,
      pendingEscalations: pendingEscalations || 0,
      resolvedChats: resolvedChats || 0,
      leadsBySchool,
      recentLeads: filteredLeads,
      leadsTrend,
      agentPerformance,
      humanAssistedCount,
      aiOnlyCount,
      openTickets: openTickets || 0,
      avgCsat,
      agentStats,
    });
  } catch (error) {
    console.error('stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
