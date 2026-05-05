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
import { searchKnowledgeBase } from '../../src/services/rag.js';
import * as zoho from '../../src/services/zoho.js';
import * as email from '../../src/services/email.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { message, schoolId, sessionId } = req.body;

    if (!message || !schoolId || !sessionId) {
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

    // Append user message
    const messages = conv.messages || [];
    messages.push({ role: 'user', content: message, ts: Date.now() });

    // Setup SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const sendChunk = (data) => {
      res.write('data: ' + JSON.stringify(data) + '\n\n');
    };

    let fullResponse = '';

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

      sendChunk({ done: true, stage: newStage, lead, suggestions: [] });
      return res.end();
    }

    // ── ESCALATED STAGE ───────────────────────────────────────
    if (conv.stage === 'escalated') {
      const msg =
        'Our support team has been notified and will be in touch with you shortly at ' +
        (lead.email || 'the email you provided') +
        '. Is there anything else I can help you with in the meantime?';

      for (const char of msg) {
        sendChunk({ chunk: char });
        await new Promise(r => setTimeout(r, 8));
      }

      sendChunk({ done: true, stage: 'escalated', lead, suggestions: [] });
      return res.end();
    }

    // ── ACTIVE STAGE ──────────────────────────────────────────
    const chunks = await searchKnowledgeBase(message, school.id);
    const context =
      chunks.length > 0
        ? chunks.map(c => c.content).join('\n\n---\n\n')
        : 'No specific information found in the knowledge base for this query.';

    const systemPrompt = buildActiveSystemPrompt(school.name, lead.name || 'there', context);
    const messageHistory = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

    await chatStream(systemPrompt, messageHistory, (chunk) => {
      fullResponse += chunk;
      sendChunk({ chunk });
    });

    const hasEscalation = detectEscalation(fullResponse);
    const cleanResponse = stripEscalateToken(fullResponse);

    // Track failed answers
    const fallbackPhrase = 'do not have that specific detail';
    if (fullResponse.toLowerCase().includes(fallbackPhrase)) {
      conv.failed_attempts = (conv.failed_attempts || 0) + 1;
    }

    const shouldEscalate = hasEscalation || conv.failed_attempts >= 3;
    let newStage = conv.stage;

    if (shouldEscalate) {
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

    messages.push({ role: 'assistant', content: cleanResponse, ts: Date.now() });

    await supabase
      .from('conversations')
      .update({
        messages,
        stage: newStage,
        failed_attempts: conv.failed_attempts || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.id);

    const suggestions = await generateSuggestions(school.name, cleanResponse);

    sendChunk({ done: true, stage: newStage, lead, suggestions });
    return res.end();
  } catch (error) {
    console.error('chat error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
