import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';
import { sendTicketEmail, sendTicketReplyEmail } from '../../src/services/email.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // POST — no auth required (widget submits tickets)
  if (req.method === 'POST') {
    try {
      const { schoolId, name, email, phone, subject, message } = req.body;
      if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: 'name, email, subject and message are required' });
      }

      let school_id = null;
      let school = null;
      if (schoolId) {
        // Widget passes the slug (e.g. 'backock') — try slug first, fall back to UUID
        let { data: s } = await supabase
          .from('schools').select('id, name, staff_email, slug').eq('slug', schoolId).single();
        if (!s) {
          const r = await supabase
            .from('schools').select('id, name, staff_email, slug').eq('id', schoolId).single();
          s = r.data;
        }
        if (s) { school_id = s.id; school = s; }
      }

      const { data: ticket, error } = await supabase
        .from('tickets')
        .insert({ school_id, name, email, phone: phone || null, subject, message })
        .select()
        .single();

      if (error) throw error;

      if (school?.staff_email) {
        sendTicketEmail({ school, ticket }).catch(() => {});
      }

      return res.status(201).json({ ticket });
    } catch (err) {
      console.error('ticket create error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Auth required for GET and PATCH
  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const { status, schoolId, page = '1', limit = '20' } = req.query;
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const offset = (pageNum - 1) * limitNum;

      let query = supabase
        .from('tickets')
        .select('*, schools(name, slug)', { count: 'exact' });

      if (status) query = query.eq('status', status);
      if (schoolId) {
        const { data: s } = await supabase.from('schools').select('id').eq('slug', schoolId).single();
        if (s) query = query.eq('school_id', s.id);
      }

      const { data: tickets, count, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (error) throw error;

      return res.status(200).json({ tickets: tickets || [], total: count || 0, page: pageNum, limit: limitNum });
    } catch (err) {
      console.error('tickets list error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { id, status, assigned_to, staff_reply, tags } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing id' });

      // Capture replied_at before update to know if this is the first reply
      const { data: existing } = await supabase
        .from('tickets').select('replied_at').eq('id', id).single();
      const isFirstReply = !existing?.replied_at;

      const updates = { updated_at: new Date().toISOString() };
      if (status) updates.status = status;
      if (assigned_to !== undefined) updates.assigned_to = assigned_to;
      if (staff_reply !== undefined) {
        updates.staff_reply = staff_reply;
        if (isFirstReply) updates.replied_at = new Date().toISOString();
      }
      if (tags !== undefined) updates.tags = tags;

      const { data: ticket, error } = await supabase
        .from('tickets')
        .update(updates)
        .eq('id', id)
        .select('*, schools(id, name, slug, staff_email)')
        .single();

      if (error) throw error;

      // ── Send reply email to lead on first reply only ─────────────
      if (staff_reply && staff_reply.trim() && ticket?.email && isFirstReply) {
        const school = ticket.schools || { name: 'Support Team' };
        sendTicketReplyEmail({ school, ticket, staffReply: staff_reply.trim() }).catch(() => {});
      }

      return res.status(200).json({ ticket });
    } catch (err) {
      console.error('ticket update error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).end();
}
