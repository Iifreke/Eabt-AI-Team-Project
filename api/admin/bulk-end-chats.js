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
    const { schoolId, resolvedBy } = req.body || {};
    const resolver = resolvedBy || user.email || 'Admin';

    // Build query — end all non-resolved escalations, optionally filtered by school
    let query = supabase
      .from('escalations')
      .update({
        status: 'resolved',
        resolved_by: resolver,
        updated_at: new Date().toISOString(),
      })
      .in('status', ['pending', 'needs_reply', 'in_progress'])
      .select('id, conversation_id');

    if (schoolId && schoolId !== 'all') {
      query = query.eq('school_id', schoolId);
    }

    const { data: ended, error: escErr } = await query;
    if (escErr) throw escErr;

    const count = ended?.length || 0;

    // Bulk update conversations back to active stage
    const convIds = (ended || []).map(e => e.conversation_id).filter(Boolean);
    if (convIds.length > 0) {
      await supabase
        .from('conversations')
        .update({ stage: 'active', updated_at: new Date().toISOString() })
        .in('id', convIds);
    }

    return res.status(200).json({ ok: true, ended: count });
  } catch (error) {
    console.error('bulk-end-chats error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
