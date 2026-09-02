import { applyCors } from '../../src/utils/cors.js';
import { getSchool } from '../../src/utils/validate.js';
import supabase from '../../src/db/supabase.js';
import {
  buildOnboardingSystemPrompt,
  buildActiveSystemPrompt,
  chatStream,
  generateSuggestions,
  detectEscalation,
  stripEscalateToken,
  extractLeadFields,
} from '../../src/services/llm.js';
import { searchKnowledgeBase, extractText } from '../../src/services/rag.js';
import * as zoho from '../../src/services/zoho.js';
import * as email from '../../src/services/email.js';
import { anyAdminOnline } from '../../src/utils/presence.js';
import { normalizePhoneNumber } from '../../src/utils/phone.js';

const READABLE_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

async function extractAttachmentText(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';
  const parts = [];
  for (const att of attachments) {
    if (!READABLE_TYPES.has(att.type)) continue;
    try {
      const res = await fetch(att.url);
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      const text = await extractText(buffer, att.type);
      if (text?.trim()) {
        parts.push(`[Attached file: ${att.name}]\n${text.trim()}`);
      }
    } catch (err) {
      console.error('Attachment extract failed:', att.name, err.message);
    }
  }
  return parts.join('\n\n---\n\n');
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { message, schoolId, sessionId, attachments } = req.body;

    if ((!message && (!attachments || attachments.length === 0)) || !schoolId || !sessionId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const school = await getSchool(schoolId, res);
    if (!school) return;

    // Load or create conversation
    let { data: conv } = await supabase
      .from('conversations')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (!conv) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          school_id: school.id,
          session_id: sessionId,
          stage: 'onboarding',
          channel: 'web',
          user_web_online: true,
          user_last_seen_web: new Date().toISOString(),
        })
        .select()
        .single();
      conv = newConv;
    } else {
      // Refresh user presence timestamp
      await supabase
        .from('conversations')
        .update({
          user_web_online: true,
          user_last_seen_web: new Date().toISOString(),
        })
        .eq('id', conv.id);
    }

    // Load or create lead
    let { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (!lead) {
      const { data: newLead } = await supabase
        .from('leads')
        .insert({ school_id: school.id, session_id: sessionId })
        .select()
        .single();
      lead = newLead;
    }

    // Ensure conversation has lead_id linked
    if (!conv.lead_id && lead?.id) {
      await supabase
        .from('conversations')
        .update({ lead_id: lead.id })
        .eq('id', conv.id);
      conv.lead_id = lead.id;
    }

    // Extract text from any readable attachments
    const attachmentText = await extractAttachmentText(attachments);
    const messageWithAttachments = attachmentText
      ? `${message}\n\n${attachmentText}`
      : message;

    // Append user message
    const messages = conv.messages || [];
    const userMsg = { role: 'user', content: message, ts: Date.now() };
    if (Array.isArray(attachments) && attachments.length > 0) userMsg.attachments = attachments;
    messages.push(userMsg);

    // Setup SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const sendChunk = (data) => {
      res.write('data: ' + JSON.stringify(data) + '\n\n');
    };

    let fullResponse = '';

    // Check admin online status once — used in all done events
    const adminsOnline = await anyAdminOnline(supabase);

    // ── ONBOARDING STAGE ──────────────────────────────────────
    if (conv.stage === 'onboarding') {
      const systemPrompt = buildOnboardingSystemPrompt(school.name);
      const messageHistory = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

      await chatStream(systemPrompt, messageHistory, (chunk) => {
        fullResponse += chunk;
        sendChunk({ chunk });
      });

      // Extract fields from user message and bot response
      const fromUser = extractLeadFields(message);
      const fromBot = extractLeadFields(fullResponse);

      if (fromUser.name || fromBot.name) lead.name = fromUser.name || fromBot.name;
      if (fromUser.email || fromBot.email) lead.email = fromUser.email || fromBot.email;
      if (fromUser.phone || fromBot.phone) {
        const rawPhone = fromUser.phone || fromBot.phone;
        lead.phone = rawPhone;
        lead.normalized_phone = normalizePhoneNumber(rawPhone) || rawPhone;
      }

      // Update lead in DB
      await supabase
        .from('leads')
        .update({
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          normalized_phone: lead.normalized_phone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id);

      // Sync to Zoho as soon as name + (email or phone) are available
      // zoho.syncLeadToZoho writes zoho_contact_id back to Supabase, so repeated calls
      // update the same Zoho record rather than creating duplicates.
      if (lead.name && (lead.email || lead.phone)) {
        await zoho.syncLeadToZoho(lead, school, {
          source: `Website Chatbot (${school.slug.toUpperCase() === 'ABU' ? 'ABU' : 'Babcock'})`,
        }).catch(() => {});
      }

      // Check if onboarding complete
      let newStage = 'onboarding';
      if (lead.name && lead.email && lead.phone) {
        newStage = 'active';
        conv.stage = 'active';
        await zoho.sendCliqAlert(
          school,
          lead,
          `Visitor completed onboarding on the website widget: "${lead.name}" (${lead.email || lead.phone})`,
          { channel: 'Web Chatbot', actionUrl: `${process.env.APP_URL || 'https://eabt-ai-team-project.vercel.app'}/chats` }
        );
      }

      messages.push({ role: 'assistant', content: fullResponse, ts: Date.now() });
      await supabase
        .from('conversations')
        .update({
          messages,
          stage: newStage,
          user_web_online: true,
          user_last_seen_web: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      sendChunk({ done: true, stage: newStage, lead, suggestions: [], adminsOnline });
      return res.end();
    }

    // ── ESCALATED STAGE ───────────────────────────────────────
    if (conv.stage === 'escalated') {
      if (adminsOnline) {
        // Only hand off to human agent if they have already replied
        const hasAdminReply = messages.some(m => m.role === 'admin' || m.adminName);
        if (hasAdminReply) {
          await supabase
            .from('conversations')
            .update({
              messages,
              user_web_online: true,
              user_last_seen_web: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', conv.id);
          sendChunk({ done: true, stage: 'escalated', lead, suggestions: [], messages, adminsOnline });
          return res.end();
        }
      }
      // No human has replied yet (or no agent online) — fall through to AI
    }

    // ── RESOLVED STAGE ───────────────────────────────────────
    if (conv.stage === 'resolved') {
      await supabase.from('conversations').update({ stage: 'active', updated_at: new Date().toISOString() }).eq('id', conv.id);
      conv.stage = 'active';
    }

    // ── SATISFACTION RESPONSE ─────────────────────────────────
    const prevMsgs = (conv.messages || []).filter(m => !m.role?.startsWith('__'));
    const lastAssistantMsg = [...prevMsgs].reverse().find(m => m.role === 'assistant');
    if (lastAssistantMsg?.satisfactionCheck) {
      const lower = message.toLowerCase().trim();
      const isYes = /^(yes|yeah|yep|yup|sure|ok|okay|satisfied|thanks|thank you|great|good|perfect|that'?s? all|done|resolved|helpful|got it|understood|appreciate)/.test(lower);
      const isNo  = /^(no|nope|nah|not |unsatisfied|not helpful|need more|more help|still|another|can you|could you|what about|how about)/.test(lower);

      if (isYes) {
        messages.push({ role: 'assistant', content: "That's great! I'm glad I could help. Feel free to start a new chat any time you need assistance.", ts: Date.now() });
        await supabase.from('conversations').update({ messages, stage: 'resolved', updated_at: new Date().toISOString() }).eq('id', conv.id);
        sendChunk({ done: true, stage: 'resolved', lead, suggestions: [], adminsOnline });
        return res.end();
      }

      if (isNo) {
        const watNow2 = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
        const inHours2 = watNow2.getDay() >= 1 && watNow2.getDay() <= 5 && watNow2.getHours() >= 8 && watNow2.getHours() < 18;
        if (inHours2 && conv.stage !== 'escalated') {
          await supabase.from('escalations').insert({ conversation_id: conv.id, school_id: school.id, lead_id: lead.id, reason: 'user_request' });
          conv.stage = 'escalated';

          messages.push({ role: 'assistant', content: "No problem! Let me connect you with a support agent who can help further.", ts: Date.now() });
          await supabase.from('conversations').update({ messages, stage: 'escalated', updated_at: new Date().toISOString() }).eq('id', conv.id);

          const fullTranscript = zoho.formatConversationTranscript(messages, lead, school, { reason: 'user_request' });

          await zoho.syncLeadToZoho(lead, school, { status: 'Escalated', source: 'Website Chatbot' });
          await zoho.createEscalationTask(lead, school, 'Visitor expressed dissatisfaction / requested human', message, fullTranscript);
          await zoho.sendCliqAlert(school, lead, `Visitor expressed dissatisfaction / requested human advisor: "${message}"`, { channel: 'Web Chatbot', reason: 'User Request' });

          try {
            await email.sendEscalationEmail({ school, lead, conversation: { ...conv, messages }, reason: 'user_request' });
          } catch (e) {
            console.error('[Web Chat] Escalation email error:', e.message);
          }

          sendChunk({ done: true, stage: 'escalated', lead, suggestions: [], adminsOnline, messages });
        } else {
          messages.push({ role: 'assistant', content: "No problem! Our support team is offline right now (Mon–Fri, 8am–6pm WAT). Please open a ticket or message us on WhatsApp and we'll follow up.", ts: Date.now() });
          await supabase.from('conversations').update({ messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
          sendChunk({ done: true, stage: conv.stage, lead, suggestions: [], adminsOnline, offHoursTicketPrompt: true });
        }
        return res.end();
      }
    }

    // ── ACTIVE STAGE ──────────────────────────────────────────
    const chunks = await searchKnowledgeBase(message, school.id);
    const context =
      chunks.length > 0
        ? chunks.map(c => c.content).join('\n\n---\n\n')
        : 'No specific information found in the knowledge base for this query.';

    const systemPrompt = buildActiveSystemPrompt(school.name, lead.name || 'there', context);

    const messageHistory = messages
      .filter(m => !m.role?.startsWith('__'))
      .slice(-10)
      .map((m, i, arr) => {
        if (m.role === 'user' && i === arr.length - 1 && messageWithAttachments !== message) {
          return { role: 'user', content: messageWithAttachments };
        }
        return { role: m.role, content: m.content };
      });

    await chatStream(systemPrompt, messageHistory, (chunk) => {
      fullResponse += chunk;
      sendChunk({ chunk });
    });

    const hasEscalation = detectEscalation(message) || detectEscalation(fullResponse);
    const cleanResponse = stripEscalateToken(fullResponse);

    const fallbackPhrase = 'do not have that specific detail';
    const currentResponseFailed = fullResponse.toLowerCase().includes(fallbackPhrase);

    const shouldEscalate = hasEscalation || currentResponseFailed;

    // Business hours: Mon–Fri 8am–6pm WAT (UTC+1)
    const watNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
    const withinBusinessHours = watNow.getDay() >= 1 && watNow.getDay() <= 5
      && watNow.getHours() >= 8 && watNow.getHours() < 18;

    let newStage = conv.stage;

    if (shouldEscalate && withinBusinessHours && newStage !== 'escalated') {
      const reason = hasEscalation ? 'user_request' : 'failed_attempts';
      await supabase.from('escalations').insert({
        conversation_id: conv.id,
        school_id: school.id,
        lead_id: lead.id,
        reason,
      });
      newStage = 'escalated';
      conv.stage = 'escalated';

      const fullTranscript = zoho.formatConversationTranscript([...messages, { role: 'assistant', content: cleanResponse }], lead, school, { reason });

      await zoho.syncLeadToZoho(lead, school, { status: 'Escalated', source: 'Website Chatbot' });

      // Trigger Zoho CRM Task and Zoho Cliq Alert
      await zoho.createEscalationTask(lead, school, reason, message, fullTranscript);
      await zoho.sendCliqAlert(
        school,
        lead,
        `Chatbot escalation: "${message}" (${reason === 'user_request' ? 'Visitor requested human' : 'Knowledge Base Fallback'})`,
        { channel: 'Web Chatbot', reason }
      );

      try {
        await email.sendEscalationEmail({ school, lead, conversation: { ...conv, messages }, reason });
      } catch (e) {
        console.error('[Web Chat] Escalation email error:', e.message);
      }
    } else if (shouldEscalate && !withinBusinessHours) {
      // Off-hours escalation alert to Cliq and Task for next day follow-up
      const fullTranscript = zoho.formatConversationTranscript([...messages, { role: 'assistant', content: cleanResponse }], lead, school, { reason: 'Off-Hours Escalation' });
      await zoho.syncLeadToZoho(lead, school, { status: 'Escalated', source: 'Website Chatbot' });
      await zoho.createEscalationTask(lead, school, 'Off-Hours Escalation', message, fullTranscript);
      await zoho.sendCliqAlert(
        school,
        lead,
        `Off-hours chatbot escalation from ${lead.name || 'Visitor'}: "${message}"`,
        { channel: 'Web Chatbot', reason: 'Off-Hours Escalation' }
      );
    }

    const askSatisfaction = !shouldEscalate && newStage !== 'escalated';
    messages.push({ role: 'assistant', content: cleanResponse, satisfactionCheck: askSatisfaction, ts: Date.now() });

    await supabase
      .from('conversations')
      .update({
        messages,
        stage: newStage,
        user_web_online: true,
        user_last_seen_web: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.id);

    const suggestions = await generateSuggestions(school.name, cleanResponse);

    const offHoursTicketPrompt = shouldEscalate && !withinBusinessHours;

    sendChunk({
      done: true,
      stage: newStage,
      lead,
      suggestions,
      adminsOnline,
      offHoursTicketPrompt,
      askSatisfaction,
      ...(newStage === 'escalated' ? { messages } : {}),
    });
    return res.end();
  } catch (error) {
    console.error('chat error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
