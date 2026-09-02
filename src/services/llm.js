import { openRouterClient } from '../clients/index.js';

const MODEL = 'anthropic/claude-sonnet-4-5';

export function buildOnboardingSystemPrompt(schoolName) {
  return `You are Maverick, a warm, friendly admissions assistant for ${schoolName}. You talk like a real helpful person — not a robot.

Your name is Maverick. If anyone asks what your name is, tell them you are Maverick. If anyone asks if you are an AI or a bot, you can confirm you are an AI assistant named Maverick.

Your ONLY job right now is to collect the visitor's contact details naturally, one at a time, in this order:

Step 1 — Ask for their full name
Step 2 — Ask for their email address
Step 3 — Ask for their phone number

Once all three are collected, say something like:
"Perfect, thank you [name]! So, what would you like to know about ${schoolName}? I am happy to help with anything."

Rules you must never break:
- Ask ONE question at a time. Never bundle questions.
- Do NOT answer school questions until all 3 details are collected.
- If they ask a school question before finishing, redirect warmly: "I would love to help with that! I just need your [missing field] first so our team can follow up with you personally."
- Do not explain why you are collecting the details.
- NEVER use markdown, asterisks (**), hashes (#), or bullet symbols (•). Write in plain, natural sentences only.`;
}

export function buildActiveSystemPrompt(schoolName, leadName, context) {
  return `You are Maverick, the premier admissions concierge and elite academic advisor for ${schoolName}. You are conversing with ${leadName}.

CRITICAL BEHAVIOR DIRECTIVE — STRICT CLOSED-DOMAIN KNOWLEDGEBASE ONLY:
1. STRICT ACCURACY: Rely SOLELY on the provided KNOWLEDGEBASE CONTEXT below. Do not invent fees, dates, programmes, or requirements not explicitly documented.
2. ABSOLUTE ZERO HALLUCINATION: If a specific detail is not stated in the context, respond gracefully:
"That is a great question! I do not have that specific detail right now in my knowledge base, but our admissions team can help. Want me to connect you with them?"
3. STICK TO SCOPE: If asked general non-admissions queries, politely and warmly redirect back to admissions at ${schoolName}.

KNOWLEDGEBASE CONTEXT:
${context}

COMMUNICATION STYLE & LUXURY CONCIERGE EXPERIENCE:
- Tone: Warm, executive, highly prestigious, and encouraging (like an elite university admissions director).
- WhatsApp-Optimized Formatting:
  • Use *bold* (single asterisk) for key terms, fees, deadlines, and portal URLs (e.g. *apply.abudlc.edu.ng*).
  • Use clean bullet points (•) for listing requirements, steps, or features.
  • Keep paragraphs short (2 to 3 sentences max) for effortless mobile reading.
  • Use tasteful educational emojis (🎓, 📝, 💰, ⏱️, ✅, 📌) to enhance readability.
- Personalization: Address ${leadName} warmly by name.
- ESCALATION DIRECTIVE: If the visitor mentions complaints, refunds, portal technical issues that cannot be resolved, disciplinary matters, or explicitly asks for a human advisor, reply warmly and append [ESCALATE] on its own line at the very end.`;
}

export async function chat(systemPrompt, messageHistory) {
  try {
    const response = await openRouterClient.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messageHistory,
      ],
      temperature: 0.0,
      max_tokens: 1024,
      stream: false,
    });
    return response.choices[0].message.content;
  } catch (err) {
    console.warn('[LLM Service] OpenRouter chat fallback:', err.message);
    return "That is a great question! I do not have that specific detail right now in my knowledge base, but our admissions team can help. Want me to connect you with them?";
  }
}

export async function chatStream(systemPrompt, messageHistory, onChunk) {
  const stream = await openRouterClient.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messageHistory,
    ],
    temperature: 0.0,
    max_tokens: 1024,
    stream: true,
  });

  let fullText = '';
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || '';
    if (text) {
      fullText += text;
      onChunk(text);
    }
  }
  return fullText;
}

export async function generateSuggestions(schoolName, lastBotMessage) {
  try {
    const response = await openRouterClient.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You generate follow-up question suggestions for a school admissions chatbot. Return ONLY a valid JSON array of exactly 3 short questions. No markdown. No explanation. No preamble.',
        },
        {
          role: 'user',
          content: `School: ${schoolName}\nBot just said: "${lastBotMessage}"\nGenerate 3 natural follow-up questions a parent would ask.\nKeep each under 10 words.\nReturn only: ["q1","q2","q3"]`,
        },
      ],
      max_tokens: 150,
      stream: false,
    });

    const content = response.choices[0].message.content.trim();
    return JSON.parse(content);
  } catch {
    return [
      'What are the school fees?',
      'How do I apply?',
      'When does term start?',
    ];
  }
}

// Static phrases that always mean "get me a human" regardless of sentence shape.
const ESCALATION_PHRASES = [
  'complaint',
  'disciplinary',
  'suspend',
  'expel',
  'legal',
  'refund',
  'real person',
  'real human',
  'live person',
  'staff member',
  'human being',
  'customer service',
  'customer support',
  'support team',
  'support agent',
  'live agent',
  'human support',
  'human help',
  'escalate',
  'speak to an advisor',
  'speak to an admissions advisor',
  'speak to advisor',
  'speak to human',
  'talk to advisor',
  'talk to human',
  'admissions officer',
  'admissions advisor',
  'live human',
  'human advisor',
  'speak with advisor',
  'speak with an advisor',
  'speak with human',
  'human',
  'advisor',
  'adviser',
];

// Catches the many ways people phrase "connect me to a human" —
// "speak with a human", "reach admin", "talk to someone", "connect me to an agent",
// "I want a human", "need an agent", "speak to advisor", etc.
const ESCALATION_REQUEST_RE =
  /\b(talk|speak|chat|want|need|get me|connect me|transfer me|put me|reach)\s*(to|with)?\s*(a|an|the)?\s*(human|person|someone|agent|admin|administrator|representative|rep|staff|manager|advisor|adviser|officer)\b/i;

export function detectEscalation(text) {
  if (!text) return false;
  if (/\[ESCALATE(?::[^\]]*)?\]/i.test(text)) return true;
  const lower = text.toLowerCase().trim();
  if (lower === 'human' || lower === 'advisor' || lower === 'adviser' || lower === 'agent' || lower === 'rep' || lower === 'officer') return true;
  if (ESCALATION_PHRASES.some(t => lower.includes(t))) return true;
  return ESCALATION_REQUEST_RE.test(text);
}

export function stripEscalateToken(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\[ESCALATE(?::[^\]]*)?\]/gi, '').trim();
}

export function extractLeadFields(text) {
  const result = { name: null, email: null, phone: null };

  // Email
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (emailMatch) result.email = emailMatch[0];

  // Nigerian phone
  const phoneMatch = text.match(/(0|\+234)[789][01]\d{8}/);
  if (phoneMatch) result.phone = phoneMatch[0];

  // Name patterns
  const namePatterns = [
    /my name is ([A-Za-z]+(?: [A-Za-z]+)+)/i,
    /i am ([A-Za-z]+(?: [A-Za-z]+)+)/i,
    /i'm ([A-Za-z]+(?: [A-Za-z]+)+)/i,
    /this is ([A-Za-z]+(?: [A-Za-z]+)+)/i,
    /call me ([A-Za-z]+(?: [A-Za-z]+)+)/i,
  ];
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.name = match[1];
      break;
    }
  }

  return result;
}
