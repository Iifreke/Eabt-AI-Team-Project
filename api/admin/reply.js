import { applyCors } from '../../src/utils/cors.js';
import { requireAuth, getProfile } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';
import { sendWhatsAppMessage } from '../../src/services/whatsapp.js';
import * as zoho from '../../src/services/zoho.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // PATCH — set or clear typing indicator
  if (req.method === 'PATCH') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const { conversationId, typing } = req.body;
    if (!conversationId) return res.status(400).json({ error: 'conversationId required' });
    const { data: conv } = await supabase.from('conversations').select('id, messages').eq('id', conversationId).single();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    const messages = (Array.isArray(conv.messages) ? conv.messages : []).filter(m => m.role !== '__typing__');
    if (typing) {
      const profile = await getProfile(user.id);
      messages.push({ role: '__typing__', agentName: profile?.full_name || 'Support Agent', ts: Date.now() });
    }
    await supabase.from('conversations').update({ messages, updated_at: new Date().toISOString() }).eq('id', conversationId);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { conversationId, message, attachments } = req.body;

    if (!conversationId || (!message?.trim() && (!Array.isArray(attachments) || attachments.length === 0))) {
      return res.status(400).json({ error: 'conversationId and message or attachments are required' });
    }

    // Load conversation, profile, and escalation in parallel
    const [profile, convRes, escRes] = await Promise.all([
      getProfile(user.id),
      supabase
        .from('conversations')
        .select('id, session_id, messages, stage, channel, whatsapp_phone, user_web_online, user_last_seen_web, school_id, lead_id, schools(id, name, slug), leads(id, name, email, phone, normalized_phone, session_id, zoho_contact_id)')
        .eq('id', conversationId)
        .single(),
      supabase
        .from('escalations')
        .select('id, first_response_at, status, attended_by')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const conv = convRes.data;
    const esc = escRes.data;

    if (convRes.error || !conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const adminName = profile?.full_name || user.email || 'Support Agent';
    const schoolName = conv.schools?.name || 'School Support';

    // Prepare escalation updates
    const escUpdates = {};
    if (esc) {
      if (!esc.first_response_at) escUpdates.first_response_at = new Date().toISOString();
      if (esc.status === 'pending') escUpdates.status = 'in_progress';
      if (!esc.attended_by) escUpdates.attended_by = adminName;
    }

    // Append admin message (also clears any typing indicator)
    const messages = (Array.isArray(conv.messages) ? conv.messages : []).filter(m => m.role !== '__typing__');
    const adminMsg = {
      role: 'admin',
      content: (message || '').trim(),
      ts: Date.now(),
      adminName,
    };
    if (Array.isArray(attachments) && attachments.length > 0) {
      adminMsg.attachments = attachments;
    }
    messages.push(adminMsg);

    const convUpdates = {
      messages,
      updated_at: new Date().toISOString(),
    };
    if (conv.stage !== 'escalated') {
      convUpdates.stage = 'escalated';
    }

    // Execute database updates in parallel
    const writePromises = [
      supabase.from('conversations').update(convUpdates).eq('id', conversationId),
    ];
    if (esc && Object.keys(escUpdates).length > 0) {
      writePromises.push(supabase.from('escalations').update(escUpdates).eq('id', esc.id));
    }
    const writeResults = await Promise.all(writePromises);
    const writeErr = writeResults.find(r => r.error)?.error;
    if (writeErr) throw writeErr;

    // ── Omnichannel routing decision (computed before responding) ──
    const isWhatsAppSession = conv.channel?.toLowerCase() === 'whatsapp' || conv.session_id?.startsWith('wa_') || !!conv.whatsapp_phone;
    const lastSeenMs = conv.user_last_seen_web ? new Date(conv.user_last_seen_web).getTime() : 0;
    const isWebUserOffline = conv.user_web_online === false || (Date.now() - lastSeenMs > 90 * 1000);
    const userPhone = conv.whatsapp_phone || conv.leads?.normalized_phone || conv.leads?.phone;

    // ── Respond to the admin immediately — DB save is the source of truth ──
    // WhatsApp + Zoho run after the response so Meta API latency never causes a 504.
    res.status(200).json({ ok: true, messages, whatsappSent: !!(isWhatsAppSession || isWebUserOffline) && !!userPhone });

    // ── WhatsApp Dispatch (post-response, non-blocking) ────────────────────
    if ((isWhatsAppSession || isWebUserOffline) && userPhone) {
      const waBody = `*${adminName}* (${schoolName}):\n${message.trim()}`;

      const lastUserMsg = [...(Array.isArray(conv.messages) ? conv.messages : [])]
        .reverse()
        .find(m => m.role === 'user' && (m.phone_number_id || m.schoolSlug));

      const schoolSlug = conv.schools?.slug || lastUserMsg?.schoolSlug || 'babcock';
      const defaultPhoneId = schoolSlug === 'abu'
        ? (process.env.WHATSAPP_PHONE_NUMBER_ID_ABU || '1244786642062141')
        : (process.env.WHATSAPP_PHONE_NUMBER_ID_BABCOCK || '1364026993464546');

      const targetPhoneNumberId = lastUserMsg?.phone_number_id || defaultPhoneId;
      const targetSchoolSlug = lastUserMsg?.schoolSlug || schoolSlug;

      sendWhatsAppMessage(userPhone, waBody, {
        phoneNumberId: targetPhoneNumberId,
        schoolSlug: targetSchoolSlug,
      }).then(waResult => {
        if (!waResult.ok) {
          console.warn('[Admin Reply] WhatsApp dispatch failed:', waResult.error);
        } else {
          console.log(`[Admin Reply] WhatsApp message delivered (id: ${waResult.messageId})`);
        }
      }).catch(err => console.error('[Admin Reply] WhatsApp dispatch exception:', err.message));
    }

    // ── Zoho CRM sync (post-response, non-blocking) ────────────────────────
    if (conv.leads || conv.lead_id) {
      const leadObj = conv.leads || { id: conv.lead_id, school_id: conv.school_id };
      const schoolObj = conv.schools || { id: conv.school_id };
      const zohoSource = isWhatsAppSession ? 'WhatsApp Bot' : 'Website Chatbot';

      (async () => {
        try {
          await zoho.syncLeadToZoho(leadObj, schoolObj, { source: zohoSource, status: 'In Progress' });

          if (!esc?.first_response_at) {
            const transcript = zoho.formatConversationTranscript(messages, leadObj, schoolObj, { reason: 'Human handoff' });
            await zoho.addNoteToLead(leadObj, `📋 Escalation Transcript (${new Date().toLocaleDateString()})`, transcript, schoolObj);
          }

          await zoho.addNoteToLead(
            leadObj,
            `Staff Reply by ${adminName}`,
            `[${new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Lagos' })}] ${adminName} (Staff):\n${message.trim()}`,
            schoolObj
          );
        } catch (zohoErr) {
          console.error('[Reply] Zoho sync failed (non-fatal):', zohoErr.message);
        }
      })();
    }
  } catch (error) {
    console.error('admin reply error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
