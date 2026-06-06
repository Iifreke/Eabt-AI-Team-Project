import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';
import { sendTicketEmail, sendTicketReplyEmail, sendTicketConfirmationEmail } from '../../src/services/email.js';

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
        // Widget passes the slug (e.g. 'babcock') — try slug first, fall back to UUID
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
        .insert({ school_id, name, email, phone: phone || null, subject, message, status: 'open' })
        .select()
        .single();

      if (error) throw error;

      // Send notification email to staff
      if (school?.staff_email) {
        sendTicketEmail({ school, ticket }).catch(() => {});
      }

      // Send confirmation email to visitor
      const schoolForVisitor = school || { name: 'Support Team' };
      sendTicketConfirmationEmail({ school: schoolForVisitor, ticket }).catch(err => {
        console.error('sendTicketConfirmationEmail failed:', err);
      });

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

      if (error) {
        console.error('tickets query error:', error);
        throw error;
      }

      return res.status(200).json({ tickets: tickets || [], total: count || 0, page: pageNum, limit: limitNum });
    } catch (err) {
      console.error('tickets list error:', err);
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { id, status, assigned_to, staff_reply, tags } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing id' });

      // Load existing ticket to compare staff_reply and current status
      const { data: existing } = await supabase
        .from('tickets')
        .select('staff_reply, status, email, name, subject, message, created_at')
        .eq('id', id)
        .single();

      const replyChanged = staff_reply !== undefined &&
        staff_reply.trim() &&
        staff_reply.trim() !== (existing?.staff_reply || '').trim();

      const updates = { updated_at: new Date().toISOString() };

      // Apply explicit status changes from UI
      if (status) updates.status = status;

      // If a new reply is being saved, auto-advance status from 'open' to 'pending'
      if (replyChanged) {
        updates.staff_reply = staff_reply.trim();
        // Auto-advance status: open → pending (in progress), keep others unchanged
        if (!status && existing?.status === 'open') {
          updates.status = 'pending';
        }
      } else if (staff_reply !== undefined) {
        updates.staff_reply = staff_reply;
      }

      if (assigned_to !== undefined) updates.assigned_to = assigned_to;
      if (tags !== undefined) updates.tags = tags;

      const { data: ticket, error } = await supabase
        .from('tickets')
        .update(updates)
        .eq('id', id)
        .select('*, schools(id, name, slug)')
        .single();

      if (error) throw error;

      // ── Send reply email to lead whenever staff_reply actually changed ─────
      if (replyChanged && ticket?.email) {
        const school = ticket.schools || { name: 'Support Team' };
        // Merge existing ticket fields for the email (schools relation stripped)
        const ticketForEmail = {
          ...existing,
          id: ticket.id,
          staff_reply: staff_reply.trim(),
          schools: undefined,
        };
        sendTicketReplyEmail({ school, ticket: ticketForEmail, staffReply: staff_reply.trim() }).catch(err => {
          console.error('sendTicketReplyEmail failed:', err);
        });
      }

      return res.status(200).json({ ticket });
    } catch (err) {
      console.error('ticket update error:', err);
      return res.status(500).json({
        error: err?.message || String(err) || 'unknown',
        code: err?.code,
        detail: err?.details,
        _v: 'v4',
      });
    }
  }

  return res.status(405).end();
}
