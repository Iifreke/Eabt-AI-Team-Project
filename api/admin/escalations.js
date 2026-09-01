import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import { resolveSchoolId } from '../../src/utils/validate.js';
import supabase from '../../src/db/supabase.js';
import { sendWhatsAppMessage } from '../../src/services/whatsapp.js';

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
        .select('*, conversations(id, session_id, stage, channel, whatsapp_phone), leads(name, email, phone, normalized_phone, zoho_contact_id, lead_tier), schools(name, slug)');

      if (status) query = query.eq('status', status);

      if (schoolId) {
        const resolvedId = await resolveSchoolId(schoolId);
        if (resolvedId) query = query.eq('school_id', resolvedId);
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

      // When resolved: close out the conversation and notify the user
      if (status === 'resolved' && escalation?.conversation_id) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id, messages, channel, whatsapp_phone, session_id, school_id, schools(name, slug)')
          .eq('id', escalation.conversation_id)
          .single();

        if (conv) {
          const messages = Array.isArray(conv.messages) ? conv.messages : [];
          const closingText = 'The support agent has ended this session. You can continue asking questions and our AI assistant will help you.';

          messages.push({
            role: '__notification',
            content: closingText,
            ts: Date.now(),
          });

          await supabase
            .from('conversations')
            .update({ stage: 'active', messages, updated_at: new Date().toISOString() })
            .eq('id', escalation.conversation_id);

          // Send WhatsApp closing message if this was a WhatsApp conversation
          const isWhatsApp = conv.channel?.toLowerCase() === 'whatsapp' || conv.session_id?.startsWith('wa_') || !!conv.whatsapp_phone;
          const userPhone = conv.whatsapp_phone || conv.session_id?.replace('wa_', '');

          if (isWhatsApp && userPhone) {
            const schoolSlug = conv.schools?.slug || 'babcock';
            const agentName = resolved_by || 'Support Agent';
            const schoolName = conv.schools?.name || 'School Support';

            const waGoodbye =
              `✅ *${agentName}* (${schoolName}) has ended this support session.\n\n` +
              `Thank you for reaching out! If you have more questions, feel free to message us anytime and our AI assistant will be happy to help. 🎓`;

            try {
              await sendWhatsAppMessage(userPhone, waGoodbye, { schoolSlug });
            } catch (waErr) {
              console.warn('[End Chat] WhatsApp goodbye failed:', waErr.message);
            }
          }
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
