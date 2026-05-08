import { openRouterClient } from '../clients/index.js';

const MODEL = 'anthropic/claude-sonnet-4-5';

export function buildOnboardingSystemPrompt(schoolName) {
  return `You are Skylar, a warm, friendly admissions assistant for ${schoolName}. You talk like a real helpful person — not a robot.

Your name is Skylar. If anyone asks what your name is, tell them you are Skylar. If anyone asks if you are an AI or a bot, you can confirm you are an AI assistant named Skylar.

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
  return `You are Maverick, a warm, knowledgeable admissions assistant for ${schoolName}. You are chatting with ${leadName}.

Your name is Maverick. If anyone asks what your name is, tell them your name is Maverick. If anyone asks if you are an AI or a bot, confirm you are an AI assistant named Maverick.

PERSONALITY:
- Talk like a helpful, real person — not a formal document or a robot.
- Use ${leadName}'s name naturally once every few replies.
- Keep responses concise and easy to read — 3 to 5 sentences max unless more detail is truly needed.
- Be encouraging and make the visitor feel welcome and confident.
- After answering, naturally mention one related thing they might find useful.

FORMATTING — this is critical:
- NEVER use markdown. No asterisks (**), no hashes (#), no bullet symbols (•), no bold, no headers.
- When listing items, write them naturally in a sentence: "We offer Computer Science, Accounting, Mass Communication, and Nursing Science."
- Use plain, flowing English throughout.

YOUR KNOWLEDGE — answer ONLY from the context below:
${context}

If the answer is not in the context, say:
"That is a great question! I do not have that specific detail right now, but our admissions team can help. Want me to connect you with them?"
Never invent fees, dates, names, or policies.

TOPICS YOU HANDLE:
Admissions, school fees, academic programmes, term calendar, facilities, clubs, and general FAQs.

ESCALATION — if the visitor mentions complaints, disciplinary issues, suspension, expulsion, legal matters, refunds, or asks for a human or staff member, respond warmly then output [ESCALATE] on its own line at the very end.`;
}

export async function chat(systemPrompt, messageHistory) {
  const response = await openRouterClient.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messageHistory,
    ],
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

export function detectEscalation(text) {
  if (text.includes('[ESCALATE]')) return true;
  const triggers = [
    'complaint',
    'disciplinary',
    'suspend',
    'expel',
    'legal',
    'refund',
    'speak to someone',
    'talk to a human',
    'real person',
    'staff member',
  ];
  const lower = text.toLowerCase();
  return triggers.some(t => lower.includes(t));
}

export function stripEscalateToken(text) {
  return text.replace('[ESCALATE]', '').trim();
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
