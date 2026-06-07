import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  // GET — list escalations
  if (req.method === 'GET') {
    try {
      const { status, schoolId } = req.query;

      let query = supabase
        .from('escalations')
        .select('*, conversations(session_id, stage), leads(name, email, phone), schools(name, slug)');

      if (status) query = query.eq('status', status);

      if (schoolId) {
        const { data: school } = await supabase
          .from('schools')
          .select('id')
          .eq('slug', schoolId)
          .single();
        if (school) query = query.eq('school_id', school.id);
      }

      const { data: escalations, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      return res.status(200).json({ escalations: escalations || [] });
    } catch (error) {
      console.error('escalations error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PATCH — update a single escalation
  if (req.method === 'PATCH') {
    try {
      const { id, status, staff_notes, attended_by, resolved_by, tags } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing id' });

      const updates = { updated_at: new Date().toISOString() };
      if (status) updates.status = status;
      if (staff_notes !== undefined) updates.staff_notes = staff_notes;
      if (attended_by !== undefined) updates.attended_by = attended_by;
      if (resolved_by !== undefined) updates.resolved_by = resolved_by;
      if (tags !== undefined) updates.tags = tags;

      const { data: escalation, error } = await supabase
        .from('escalations')
        .update(updates)
        .eq('id', id)
        .select('id, conversation_id')
        .single();

      if (error) throw error;

      // When resolved: set conversation stage back to 'active' so the widget
      // detects it via polling and hands the user back to the AI
      if (status === 'resolved' && escalation?.conversation_id) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id, messages')
          .eq('id', escalation.conversation_id)
          .single();

        if (conv) {
          const messages = Array.isArray(conv.messages) ? conv.messages : [];
          messages.push({
            role: 'assistant',
            content: 'The support agent has ended this session. You can continue asking questions and our AI assistant will help you.',
            ts: Date.now(),
          });
          await supabase
            .from('conversations')
            .update({ stage: 'active', messages, updated_at: new Date().toISOString() })
            .eq('id', escalation.conversation_id);
        }
      }

      return res.status(200).json({ escalation });
    } catch (error) {
      console.error('escalation patch error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).end();
}
