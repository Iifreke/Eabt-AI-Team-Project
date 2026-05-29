import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    // Single conversation when ?id= is provided (replaces conversation.js)
    if (req.query.id) {
      const { data: conv, error } = await supabase
        .from('conversations')
        .select('id, session_id, stage, messages, created_at, updated_at, failed_attempts, lead_id, school_id')
        .eq('id', req.query.id)
        .single();
      if (error || !conv) {
        console.error('single conv error:', error?.message, 'id:', req.query.id);
        return res.status(404).json({ error: 'Not found' });
      }

      // Fetch lead, school, and escalation in parallel — avoids FK join ambiguity
      const [leadResult, schoolResult, escalationResult] = await Promise.all([
        conv.lead_id
          ? supabase.from('leads').select('id, name, email, phone').eq('id', conv.lead_id).single()
          : Promise.resolve({ data: null }),
        conv.school_id
          ? supabase.from('schools').select('name, slug').eq('id', conv.school_id).single()
          : Promise.resolve({ data: null }),
        supabase.from('escalations').select('*')
          .eq('conversation_id', req.query.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
      ]);

      return res.status(200).json({
        ...conv,
        leads: leadResult.data || null,
        schools: schoolResult.data || null,
        escalation: escalationResult.data || null,
      });
    }

    // All conversations for a specific lead
    if (req.query.leadId) {
      const { data: lead, error: leadErr } = await supabase
        .from('leads')
        .select('id, name, email, phone, school_id, created_at')
        .eq('id', req.query.leadId)
        .single();

      if (leadErr || !lead) return res.status(404).json({ error: 'Lead not found' });

      const { data: convs } = await supabase
        .from('conversations')
        .select('id, session_id, stage, messages, created_at, updated_at, schools(name, slug), escalations(attended_by, resolved_by)')
        .eq('lead_id', req.query.leadId)
        .order('updated_at', { ascending: false });

      return res.status(200).json({
        lead,
        conversations: (convs || []).map(c => {
          const escalation = c.escalations?.[0] || null;
          const agent = escalation 
            ? (escalation.attended_by || escalation.resolved_by || '—')
            : '—';
          return {
            ...c,
            message_count: Array.isArray(c.messages) ? c.messages.length : 0,
            agent,
          };
        }),
      });
    }

    // List conversations
    const { schoolId, stage, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('conversations')
      .select(
        'id, session_id, stage, failed_attempts, updated_at, created_at, messages, leads(name, email), schools(name, slug), escalations(attended_by, resolved_by)',
        { count: 'exact' }
      );

    if (schoolId) {
      const { data: school } = await supabase
        .from('schools')
        .select('id')
        .eq('slug', schoolId)
        .single();
      if (school) query = query.eq('school_id', school.id);
    }

    if (stage) query = query.eq('stage', stage);

    const { data: conversations, count, error } = await query
      .order('updated_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) throw error;

    const mapped = (conversations || []).map(conv => {
      const escalation = conv.escalations?.[0] || null;
      const agent = escalation 
        ? (escalation.attended_by || escalation.resolved_by || '—')
        : '—';
      return {
        ...conv,
        message_count: Array.isArray(conv.messages) ? conv.messages.length : 0,
        agent,
      };
    });

    return res.status(200).json({ conversations: mapped, total: count || 0, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error('conversations error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
