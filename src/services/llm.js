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
  return `You are Maverick, an admissions assistant for ${schoolName}. You are chatting with ${leadName}.

CRITICAL BEHAVIOR DIRECTIVE — STRICT CLOSED-DOMAIN KNOWLEDGEBASE ONLY:
1. ABSOLUTELY NO EXTERNAL KNOWLEDGE: You must rely SOLELY and EXCLUSIVELY on the provided KNOWLEDGEBASE CONTEXT below. Under no circumstances should you use pre-trained world knowledge, general facts, outside trivia, math, history, or external assumptions.
2. ABSOLUTE ZERO HALLUCINATION: If the information required to answer the user's query is NOT explicitly stated in the provided context, DO NOT try to guess, assume, or answer it.
3. MANDATORY FALLBACK: Whenever a query cannot be answered directly from the provided context, respond EXACTLY:
"That is a great question! I do not have that specific detail right now in my knowledge base, but our admissions team can help. Want me to connect you with them?"
4. STICK TO SCOPE: If the user asks general non-admissions questions (e.g. general knowledge, programming, weather, general math, other schools), state that it is not in your knowledge base and offer to connect with admissions.

KNOWLEDGEBASE CONTEXT:
${context}

PERSONALITY & FORMATTING:
- Talk like a helpful, friendly person — not a robot.
- Use ${leadName}'s name naturally once every few replies.
- Keep responses concise and easy to read (3 to 5 sentences max).
- NEVER use markdown. No asterisks (**), no hashes (#), no bullet symbols (•), no bold, no headers. Write in plain, natural sentences only.
- ESCALATION: If the visitor mentions complaints, disciplinary issues, suspension, expulsion, legal matters, refunds, or asks for a human or staff member, respond warmly then output [ESCALATE] on its own line at the very end.`;
}

export async function chat(systemPrompt, messageHistory) {
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
];

// Catches the many ways people phrase "connect me to a human" —
// "speak with a human", "reach admin", "talk to someone", "connect me to an agent",
// "I want a human", "need an agent", etc.
const ESCALATION_REQUEST_RE =
  /\b(talk|speak|chat|want|need|get me|connect me|transfer me|put me|reach)\s*(to|with)?\s*(a|an|the)?\s*(human|person|someone|agent|admin|administrator|representative|rep|staff|manager)\b/i;

export function detectEscalation(text) {
  if (!text) return false;
  if (/\[ESCALATE(?::[^\]]*)?\]/i.test(text)) return true;
  const lower = text.toLowerCase();
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
