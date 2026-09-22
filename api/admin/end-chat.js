import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'PUT') {
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const escalationId = req.body?.escalationId || req.body?.id;
    const resolvedBy = req.body?.resolvedBy || req.body?.resolved_by;
    if (!escalationId) return res.status(400).json({ error: 'escalationId or id required' });

    // 1. Mark escalation as resolved
    const { data: escalation, error: escErr } = await supabase
      .from('escalations')
      .update({
        status: 'resolved',
        resolved_by: resolvedBy || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', escalationId)
      .select('id, conversation_id, school_id, lead_id')
      .maybeSingle();

    if (escErr) throw escErr;

    // 2. Update conversation + send WhatsApp goodbye + sync to Zoho
    if (escalation?.conversation_id) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id, messages, channel, whatsapp_phone, session_id, lead_id, school_id, leads(id, name, email, phone, normalized_phone, zoho_contact_id), schools(id, name, slug)')
        .eq('id', escalation.conversation_id)
        .maybeSingle();

      if (conv) {
        const messages = Array.isArray(conv.messages) ? conv.messages : [];
        messages.push({
          role: '__notification',
          content: 'The support agent has ended this session. You can continue asking questions and our AI assistant will help you.',
          ts: Date.now(),
        });

        await supabase
          .from('conversations')
          .update({ stage: 'active', messages, updated_at: new Date().toISOString() })
          .eq('id', escalation.conversation_id);

        // Sync resolved status and closing note to Zoho CRM
        if (conv.leads && conv.schools) {
          try {
            const { addNoteToLead, syncLeadToZoho } = await import('../../src/services/zoho.js');
            await syncLeadToZoho(conv.leads, conv.schools, { status: 'Closed' });
            await addNoteToLead(
              conv.leads,
              `Support Session Ended (${new Date().toLocaleDateString()})`,
              `Support agent ${resolvedBy || 'Staff'} ended this support session on ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' })} WAT.`,
              conv.schools
            );
          } catch (zErr) {
            console.warn('[End Chat] Zoho sync warning:', zErr.message);
          }
        }

        // Send WhatsApp goodbye message
        const isWhatsApp = conv.channel?.toLowerCase() === 'whatsapp' || conv.session_id?.startsWith('wa_') || !!conv.whatsapp_phone;
        const userPhone = conv.whatsapp_phone || conv.leads?.normalized_phone || conv.leads?.phone || conv.session_id?.replace('wa_', '');

        if (isWhatsApp && userPhone) {
          try {
            const { sendWhatsAppMessage } = await import('../../src/services/whatsapp.js');
            const schoolSlug = conv.schools?.slug || 'babcock';
            const schoolName = conv.schools?.name || 'School Support';
            const agentName = resolvedBy || 'Support Agent';

            const waGoodbye =
              `✅ *${agentName}* (${schoolName}) has ended this support session.\n\n` +
              `Thank you for reaching out! If you have more questions, feel free to message us anytime and our AI assistant will be happy to help. 🎓`;

            await sendWhatsAppMessage(userPhone, waGoodbye, { schoolSlug });
          } catch (waErr) {
            console.warn('[End Chat] WhatsApp goodbye failed:', waErr.message);
          }
        }
      }
    }

    return res.status(200).json({ ok: true, escalation });
  } catch (error) {
    console.error('end-chat error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
