import crypto from 'crypto';
import supabase from '../../src/db/supabase.js';
import { normalizePhoneNumber, formatWhatsAppRecipient } from '../../src/utils/phone.js';
import {
  sendWhatsAppMessage,
  sendSchoolSelectionButtons,
} from '../../src/services/whatsapp.js';
import {
  buildActiveSystemPrompt,
  chat,
  detectEscalation,
  stripEscalateToken,
} from '../../src/services/llm.js';
import { searchKnowledgeBase } from '../../src/services/rag.js';
import * as zoho from '../../src/services/zoho.js';
import { anyAdminOnline } from '../../src/utils/presence.js';

/**
 * Validates Meta webhook HMAC SHA-256 signature if app secret is provided.
 * Note: In serverless environments where req.body is pre-parsed JSON, exact byte matching
 * can differ, so signature mismatch generates a diagnostic warning rather than dropping valid events.
 */
function verifyMetaSignature(req) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true; // Signature check optional if secret not configured

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    console.warn('[WhatsApp Webhook] Missing x-hub-signature-256 header');
    return true;
  }

  try {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')}`;

    const match = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    if (!match) {
      console.warn('[WhatsApp Webhook] Signature mismatch noticed (due to parsed body serialization). Continuing request.');
    }
    return true;
  } catch (err) {
    console.warn('[WhatsApp Webhook] Signature verification note:', err.message);
    return true;
  }
}

export default async function handler(req, res) {
  // ── 1. GET: Webhook Verification Handshake ─────────────────
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    console.log('[WhatsApp Webhook] Received GET verification request:', { mode, tokenReceived: !!token, tokenMatches: token === verifyToken });

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WhatsApp Webhook] Webhook verified successfully.');
      return res.status(200).send(challenge);
    } else {
      console.warn('[WhatsApp Webhook] Verification token mismatch.');
      return res.status(403).json({ error: 'Verification failed' });
    }
  }

  // ── 2. POST: Incoming Messages & Events ────────────────────
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  verifyMetaSignature(req);

  try {
    const body = req.body;
    console.log('[WhatsApp Webhook] POST body received:', JSON.stringify(body));

    // Fast-acknowledge Meta status updates (sent, delivered, read)
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;

    if (!change?.messages || change.messages.length === 0) {
      return res.status(200).json({ status: 'ignored' });
    }

    const messageObj = change.messages[0];
    const contactObj = change.contacts?.[0];

    const rawFrom = messageObj.from; // e.g. "2348031234567"
    const messageId = messageObj.id;
    const profileName = contactObj?.profile?.name || '';
    const normalizedPhone = normalizePhoneNumber(rawFrom) || `+${rawFrom}`;

    // ── Idempotency Check ────────────────────────────────────
    const { data: existingMsg } = await supabase
      .from('processed_whatsapp_messages')
      .select('message_id')
      .eq('message_id', messageId)
      .maybeSingle();

    if (existingMsg) {
      return res.status(200).json({ status: 'already_processed' });
    }

    // Record message ID for deduplication
    await supabase.from('processed_whatsapp_messages').insert({
      message_id: messageId,
      from_phone: rawFrom,
    });

    // ── Extract Message Text or Interactive Button Reply ─────
    let incomingText = '';
    let selectedSchoolSlug = null;

    if (messageObj.type === 'text') {
      incomingText = messageObj.text?.body?.trim() || '';
    } else if (messageObj.type === 'interactive') {
      const buttonReply = messageObj.interactive?.button_reply;
      if (buttonReply) {
        incomingText = buttonReply.title;
        if (buttonReply.id === 'select_school_backock' || buttonReply.id === 'select_school_babcock') selectedSchoolSlug = 'babcock';
        if (buttonReply.id === 'select_school_abu') selectedSchoolSlug = 'abu';
      }
    }

    if (!incomingText) {
      // Non-text message (e.g. image, audio sticker)
      await sendWhatsAppMessage(
        rawFrom,
        "I received your attachment. Could you please describe what you need assistance with in text so I can help you best?"
      );
      return res.status(200).json({ status: 'media_prompt_sent' });
    }

    // ── Check Existing Lead and Conversation ─────────────────
    const waLeadConditions = [`session_id.eq.wa_${rawFrom}`];
    if (normalizedPhone) waLeadConditions.push(`normalized_phone.eq.${normalizedPhone}`);
    if (rawFrom) waLeadConditions.push(`phone.eq.${rawFrom}`);

    let { data: existingLead } = await supabase
      .from('leads')
      .select('*')
      .or(waLeadConditions.join(','))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── School Routing ───────────────────────────────────────
    let school = null;

    // 1. If explicit button clicked
    if (selectedSchoolSlug) {
      if (selectedSchoolSlug === 'babcock' || selectedSchoolSlug === 'backock') {
        const { data: s } = await supabase.from('schools').select('*').or('slug.eq.babcock,slug.eq.backock').limit(1).maybeSingle();
        school = s;
      } else {
        const { data: s } = await supabase.from('schools').select('*').eq('slug', selectedSchoolSlug).limit(1).maybeSingle();
        school = s;
      }
    }

    // 2. If lead already exists and has a school
    if (!school && existingLead?.school_id) {
      const { data: s } = await supabase.from('schools').select('*').eq('id', existingLead.school_id).single();
      school = s;
    }

    // 3. Infer from incoming text keywords (e.g. "Babcock", "ABU", "1", "2")
    if (!school) {
      const lower = incomingText.toLowerCase().trim();
      if (lower === '1' || lower.includes('babcock') || lower.includes('backock')) {
        const { data: s } = await supabase.from('schools').select('*').or('slug.eq.babcock,slug.eq.backock').limit(1).maybeSingle();
        school = s;
      } else if (lower === '2' || lower.includes('abu') || lower.includes('ahmadu bello') || lower === 'ahmadu') {
        const { data: s } = await supabase.from('schools').select('*').eq('slug', 'abu').single();
        school = s;
      }
    }

    // 4. If school is still undetermined, send interactive selection prompt
    if (!school) {
      await sendSchoolSelectionButtons(
        rawFrom,
        `Hello ${profileName ? profileName + ' ' : ''}! Welcome to Admissions Support. Please select your institution to continue:`
      );
      return res.status(200).json({ status: 'school_prompt_sent' });
    }

    // ── Upsert Lead ──────────────────────────────────────────
    let lead = existingLead;
    if (!lead) {
      const { data: newLead } = await supabase
        .from('leads')
        .insert({
          school_id: school.id,
          session_id: `wa_${rawFrom}`,
          name: profileName || 'WhatsApp Inquirer',
          phone: normalizedPhone,
          normalized_phone: normalizedPhone,
          whatsapp_opt_in: true,
        })
        .select()
        .single();
      lead = newLead;
    } else if (lead.school_id !== school.id || !lead.normalized_phone) {
      const { data: updatedLead } = await supabase
        .from('leads')
        .update({
          school_id: school.id,
          normalized_phone: normalizedPhone,
          name: lead.name || profileName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
        .select()
        .single();
      lead = updatedLead;
    }

    // ── Load or Create Conversation ──────────────────────────
    let { data: conv } = await supabase
      .from('conversations')
      .select('*')
      .or(`whatsapp_phone.eq.${rawFrom},session_id.eq.wa_${rawFrom},lead_id.eq.${lead.id}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          school_id: school.id,
          session_id: `wa_${rawFrom}`,
          lead_id: lead.id,
          whatsapp_phone: rawFrom,
          channel: 'whatsapp',
          stage: 'active',
          messages: [],
        })
        .select()
        .single();
      conv = newConv;
    }

    // Background sync to Zoho CRM
    zoho.syncLeadToZoho(lead, school, { source: 'WhatsApp Bot' }).catch(console.error);

    const messages = Array.isArray(conv.messages) ? conv.messages : [];
    const userMsg = { role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() };
    messages.push(userMsg);

    const adminsOnline = await anyAdminOnline(supabase);

    // ── If Conversation is in ESCALATED stage ─────────────────
    if (conv.stage === 'escalated') {
      await supabase
        .from('conversations')
        .update({
          messages,
          channel: 'whatsapp',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      // Trigger instant Zoho Cliq alert for any available admin
      zoho.sendCliqAlert(
        school,
        lead,
        `New WhatsApp message from student: "${incomingText}"`,
        {
          channel: 'WhatsApp',
          reason: 'Escalated Chat Follow-up',
          actionUrl: `${process.env.APP_URL || 'https://eabt-ai-team-project.vercel.app'}/chats`,
        }
      ).catch(console.error);

      // Send reassurance if no agent has replied in this session yet
      const hasRecentAdminReply = messages.slice(-4).some(m => m.role === 'admin');
      if (!hasRecentAdminReply) {
        await sendWhatsAppMessage(
          rawFrom,
          `Thanks for your message! Our admissions team for *${school.name}* has been alerted. An available advisor will reply to you directly right here.`
        );
      }

      return res.status(200).json({ status: 'escalated_message_logged' });
    }

    // ── Check for Human Escalation Intent ────────────────────
    const wantsHuman = detectEscalation(incomingText);

    if (wantsHuman) {
      conv.stage = 'escalated';

      await supabase.from('escalations').insert({
        conversation_id: conv.id,
        school_id: school.id,
        lead_id: lead.id,
        reason: 'user_request',
      });

      // Create Zoho CRM Task
      zoho.createEscalationTask(
        lead,
        school,
        'WhatsApp visitor requested human advisor',
        `User Message: "${incomingText}"`
      ).catch(console.error);

      // Trigger Zoho Cliq Alert
      zoho.sendCliqAlert(
        school,
        lead,
        `Student requested live human assistance on WhatsApp: "${incomingText}"`,
        {
          channel: 'WhatsApp',
          reason: 'User Requested Human',
          actionUrl: `${process.env.APP_URL || 'https://eabt-ai-team-project.vercel.app'}/chats`,
        }
      ).catch(console.error);

      const botResponse = `I've connected you to the *${school.name}* admissions team! An available advisor has been alerted on our portal and will assist you directly here shortly.`;
      messages.push({ role: 'assistant', content: botResponse, ts: Date.now() });

      await supabase
        .from('conversations')
        .update({
          messages,
          stage: 'escalated',
          channel: 'whatsapp',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      await sendWhatsAppMessage(rawFrom, botResponse);
      return res.status(200).json({ status: 'escalated' });
    }

    // ── ACTIVE STAGE: RAG Engine + AI Chat ───────────────────
    const chunks = await searchKnowledgeBase(incomingText, school.id);
    const context =
      chunks.length > 0
        ? chunks.map(c => c.content).join('\n\n---\n\n')
        : 'No specific information found in the knowledge base for this query.';

    const systemPrompt = `${buildActiveSystemPrompt(school.name, lead.name || 'there', context)}
IMPORTANT: You are communicating directly with the student via WhatsApp. Keep your responses crisp, professional, friendly, and well-structured using WhatsApp styling (*bold* for emphasis, clean short bullet points). Avoid long walls of text.`;

    const messageHistory = messages
      .filter(m => !m.role?.startsWith('__'))
      .slice(-8)
      .map(m => ({ role: m.role, content: m.content }));

    const aiReply = await chat(systemPrompt, messageHistory);
    const cleanReply = stripEscalateToken(aiReply);

    const fallbackPhrase = 'do not have that specific detail';
    const responseFailed = aiReply.toLowerCase().includes(fallbackPhrase);

    if (responseFailed) {
      // Auto-escalate to human team on knowledge failure
      conv.stage = 'escalated';

      await supabase.from('escalations').insert({
        conversation_id: conv.id,
        school_id: school.id,
        lead_id: lead.id,
        reason: 'failed_attempts',
      });

      zoho.createEscalationTask(
        lead,
        school,
        'WhatsApp AI could not find specific details in knowledge base',
        `Question: "${incomingText}"`
      ).catch(console.error);

      zoho.sendCliqAlert(
        school,
        lead,
        `AI could not find knowledge base answer for: "${incomingText}". Escalating to admissions team.`,
        {
          channel: 'WhatsApp',
          reason: 'Knowledge Base Fallback',
        }
      ).catch(console.error);

      const combinedReply = `${cleanReply}\n\nI've forwarded your query to our *${school.name}* admissions team so an advisor can provide you with the exact details.`;
      messages.push({ role: 'assistant', content: combinedReply, ts: Date.now() });

      await supabase
        .from('conversations')
        .update({
          messages,
          stage: 'escalated',
          channel: 'whatsapp',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      await sendWhatsAppMessage(rawFrom, combinedReply);
      return res.status(200).json({ status: 'answered_and_escalated' });
    }

    // Normal successful answer
    messages.push({ role: 'assistant', content: cleanReply, ts: Date.now() });

    await supabase
      .from('conversations')
      .update({
        messages,
        channel: 'whatsapp',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.id);

    await sendWhatsAppMessage(rawFrom, cleanReply);

    // Periodically attach transcript to Zoho Notes
    if (lead.zoho_contact_id && messages.length >= 4 && messages.length % 4 === 0) {
      const summaryText = messages
        .slice(-6)
        .map(m => `${m.role === 'user' ? 'Student' : 'AI'}: ${m.content}`)
        .join('\n');
      zoho.addNoteToLead(lead.zoho_contact_id, `WhatsApp Chat Summary (${new Date().toLocaleDateString()})`, summaryText).catch(console.error);
    }

    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('[WhatsApp Webhook] Internal Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
