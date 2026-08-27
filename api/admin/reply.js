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
    const { conversationId, message } = req.body;

    if (!conversationId || !message?.trim()) {
      return res.status(400).json({ error: 'conversationId and message are required' });
    }

    // Load conversation with lead and school details
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id, messages, stage, channel, whatsapp_phone, user_web_online, user_last_seen_web, school_id, lead_id, schools(id, name, slug), leads(id, name, phone, normalized_phone, zoho_contact_id)')
      .eq('id', conversationId)
      .single();

    if (convErr || !conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Only allow replies on escalated conversations
    if (conv.stage !== 'escalated') {
      return res.status(400).json({ error: 'Can only reply to escalated conversations' });
    }

    // Look up the admin's display name from their profile
    const profile = await getProfile(user.id);
    const adminName = profile?.full_name || user.email || 'Support Agent';
    const schoolName = conv.schools?.name || 'School Support';

    // Set first_response_at, status and attended_by on the escalation when admin replies
    const { data: esc } = await supabase
      .from('escalations')
      .select('id, first_response_at, status, attended_by')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (esc) {
      const updates = {};
      if (!esc.first_response_at) {
        updates.first_response_at = new Date().toISOString();
      }
      if (esc.status === 'pending') {
        updates.status = 'in_progress';
      }
      if (!esc.attended_by) {
        updates.attended_by = adminName;
      }
      if (Object.keys(updates).length > 0) {
        await supabase
          .from('escalations')
          .update(updates)
          .eq('id', esc.id);
      }
    }

    // Append admin message (also clears any typing indicator)
    const messages = (Array.isArray(conv.messages) ? conv.messages : []).filter(m => m.role !== '__typing__');
    messages.push({
      role: 'admin',
      content: message.trim(),
      ts: Date.now(),
      adminName,
    });

    const { error: updateErr } = await supabase
      .from('conversations')
      .update({ messages, updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    if (updateErr) throw updateErr;

    // ── Omnichannel WhatsApp Dispatch ─────────────────────────
    // If conversation is from WhatsApp OR user is offline on the web widget
    const isWhatsAppChannel = conv.channel === 'whatsapp';
    const lastSeenMs = conv.user_last_seen_web ? new Date(conv.user_last_seen_web).getTime() : 0;
    const isWebUserOffline = conv.user_web_online === false || (Date.now() - lastSeenMs > 90 * 1000);

    const userPhone = conv.whatsapp_phone || conv.leads?.normalized_phone || conv.leads?.phone;

    let whatsappSent = false;
    if ((isWhatsAppChannel || isWebUserOffline) && userPhone) {
      const waBody = `*${adminName}* (${schoolName}):\n${message.trim()}`;
      const schoolSlug = conv.schools?.slug || 'babcock';
      const waResult = await sendWhatsAppMessage(userPhone, waBody, { schoolSlug });
      whatsappSent = waResult.ok;
      if (!waResult.ok) {
        console.warn('[Admin Reply] WhatsApp dispatch failed:', waResult.error);
      }
    }

    // Log admin response to Zoho CRM Notes in background if linked
    if (conv.leads?.zoho_contact_id) {
      zoho.addNoteToLead(
        conv.leads.zoho_contact_id,
        `Staff Reply by ${adminName}`,
        `[${new Date().toLocaleTimeString()}] ${adminName}: ${message.trim()}`
      ).catch(console.error);
    }

    return res.status(200).json({ ok: true, messages, whatsappSent });
  } catch (error) {
    console.error('admin reply error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
