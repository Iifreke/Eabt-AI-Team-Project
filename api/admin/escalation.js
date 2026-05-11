import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'PATCH') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { id, status, staff_notes, attended_by, resolved_by } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const updates = { updated_at: new Date().toISOString() };
    if (status) updates.status = status;
    if (staff_notes !== undefined) updates.staff_notes = staff_notes;
    if (attended_by !== undefined) updates.attended_by = attended_by;
    if (resolved_by !== undefined) updates.resolved_by = resolved_by;

    const { data: escalation, error } = await supabase
      .from('escalations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ escalation });
  } catch (error) {
    console.error('escalation patch error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
