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
        .insert({ school_id: school.id, session_id: sessionId, stage: 'onboarding' })
        .select()
        .single();
      conv = newConv;
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

    // Ensure conversation has lead_id linked (so admin dashboard shows lead names)
    if (!conv.lead_id && lead?.id) {
      await supabase
        .from('conversations')
        .update({ lead_id: lead.id })
        .eq('id', conv.id);
      conv.lead_id = lead.id;
    }

    // Extract text from any readable attachments so the AI can see the content
    const attachmentText = await extractAttachmentText(attachments);
    const messageWithAttachments = attachmentText
      ? `${message}\n\n${attachmentText}`
      : message;

    // Append user message (store original text in DB, AI gets enriched version)
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
    const { count: onlineCount } = await supabase
      .from('admin_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'online');
    const adminsOnline = (onlineCount || 0) > 0;

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
      if (fromUser.phone || fromBot.phone) lead.phone = fromUser.phone || fromBot.phone;

      // Update lead in DB
      await supabase
        .from('leads')
        .update({ name: lead.name, email: lead.email, phone: lead.phone, updated_at: new Date().toISOString() })
        .eq('id', lead.id);

      // Check if onboarding complete
      let newStage = 'onboarding';
      if (lead.name && lead.email && lead.phone) {
        newStage = 'active';
        conv.stage = 'active';
        zoho.syncLeadToZoho(lead, school).catch(console.error);
      }

      messages.push({ role: 'assistant', content: fullResponse, ts: Date.now() });
      await supabase
        .from('conversations')
        .update({ messages, stage: newStage, updated_at: new Date().toISOString() })
        .eq('id', conv.id);

      sendChunk({ done: true, stage: newStage, lead, suggestions: [], adminsOnline });
      return res.end();
    }

    // ── ESCALATED STAGE ───────────────────────────────────────
    if (conv.stage === 'escalated') {
      if (adminsOnline) {
        // Human agent is available — just store the message and let the agent reply
        await supabase
          .from('conversations')
          .update({ messages, updated_at: new Date().toISOString() })
          .eq('id', conv.id);
        sendChunk({ done: true, stage: 'escalated', lead, suggestions: [], messages, adminsOnline });
        return res.end();
      }
      // No human agent available — fall through to AI so the user isn't left in silence
      // The AI responds using the knowledge base; the widget shows the offline/ticket banner
    }


    // ── ACTIVE STAGE ──────────────────────────────────────────
    const chunks = await searchKnowledgeBase(message, school.id);
    const context =
      chunks.length > 0
        ? chunks.map(c => c.content).join('\n\n---\n\n')
        : 'No specific information found in the knowledge base for this query.';

    const systemPrompt = buildActiveSystemPrompt(school.name, lead.name || 'there', context);

    // Build history — replace the last user message with the attachment-enriched version
    const messageHistory = messages.slice(-10).map((m, i, arr) => {
      if (m.role === 'user' && i === arr.length - 1 && messageWithAttachments !== message) {
        return { role: 'user', content: messageWithAttachments };
      }
      return { role: m.role, content: m.content };
    });

    await chatStream(systemPrompt, messageHistory, (chunk) => {
      fullResponse += chunk;
      sendChunk({ chunk });
    });

    const hasEscalation = detectEscalation(fullResponse);
    const cleanResponse = stripEscalateToken(fullResponse);

    // Check if THIS response failed (not accumulated) — so AI can keep helping on later messages
    const fallbackPhrase = 'do not have that specific detail';
    const currentResponseFailed = fullResponse.toLowerCase().includes(fallbackPhrase);

    // Trigger on: user requested human OR this specific answer wasn't in the knowledge base
    const shouldEscalate = hasEscalation || currentResponseFailed;

    // Business hours: Mon–Fri 8am–6pm WAT (UTC+1)
    const watNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
    const withinBusinessHours = watNow.getDay() >= 1 && watNow.getDay() <= 5
      && watNow.getHours() >= 8 && watNow.getHours() < 18;

    let newStage = conv.stage;

    if (shouldEscalate && withinBusinessHours && newStage !== 'escalated') {
      // During business hours → escalate to human agent (only once)
      const reason = hasEscalation ? 'user_request' : 'failed_attempts';
      await supabase.from('escalations').insert({
        conversation_id: conv.id,
        school_id: school.id,
        lead_id: lead.id,
        reason,
      });
      newStage = 'escalated';
      conv.stage = 'escalated';
      email.sendEscalationEmail({ school, lead, conversation: { ...conv, messages }, reason }).catch(console.error);
    }
    // Outside business hours: stay active, AI keeps working — just show ticket prompt below

    messages.push({ role: 'assistant', content: cleanResponse, ts: Date.now() });

    if (newStage === 'escalated' && adminsOnline) {
      // Human agent is online — show handoff notice
      messages.push({
        role: 'assistant',
        content: "I've connected you with our support team. They'll reply here shortly — you can keep sending messages and they'll see them.",
        ts: Date.now() + 1,
      });
    } else if (shouldEscalate && !withinBusinessHours) {
      // Outside business hours — AI keeps running but suggest ticket for this unanswered need
      const ticketPrompt = hasEscalation
        ? "Our support team is offline right now (available Mon–Fri, 8am–6pm WAT). You can still chat with me, or open a ticket and we'll reply to your email."
        : "I wasn't able to find a complete answer to that. Our support team is offline right now (Mon–Fri, 8am–6pm WAT). Feel free to keep chatting with me, or open a ticket and we'll reply to your email.";
      messages.push({
        role: 'assistant',
        content: ticketPrompt,
        ts: Date.now() + 1,
      });
    }

    await supabase
      .from('conversations')
      .update({
        messages,
        stage: newStage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.id);

    const suggestions = await generateSuggestions(school.name, cleanResponse);

    // Only signal ticket prompt on this specific response — not sticky across messages
    const offHoursTicketPrompt = shouldEscalate && !withinBusinessHours;

    // Include full messages when escalating so widget rebuilds immediately without waiting for poll
    sendChunk({ done: true, stage: newStage, lead, suggestions, adminsOnline, offHoursTicketPrompt, ...(newStage === 'escalated' ? { messages } : {}) });
    return res.end();
  } catch (error) {
    console.error('chat error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
