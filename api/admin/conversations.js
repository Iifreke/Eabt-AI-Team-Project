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
        .select('*, leads(*), schools(name, slug)')
        .eq('id', req.query.id)
        .single();
      if (error || !conv) return res.status(404).json({ error: 'Not found' });
      const { data: escalation } = await supabase
        .from('escalations')
        .select('*')
        .eq('conversation_id', req.query.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return res.status(200).json({ ...conv, escalation: escalation || null });
    }

    // List conversations
    const { schoolId, stage, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('conversations')
      .select(
        'id, session_id, stage, failed_attempts, updated_at, created_at, messages, leads(name, email), schools(name, slug)',
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

    const mapped = (conversations || []).map(conv => ({
      ...conv,
      message_count: Array.isArray(conv.messages) ? conv.messages.length : 0,
      messages: undefined,
    }));

    return res.status(200).json({ conversations: mapped, total: count || 0, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error('conversations error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
