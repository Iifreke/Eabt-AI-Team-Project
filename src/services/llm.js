import { openRouterClient } from '../clients/index.js';

const MODEL = 'anthropic/claude-sonnet-4-5';

export function buildOnboardingSystemPrompt(schoolName) {
  return `You are a warm and friendly admissions assistant for ${schoolName}.

Your ONLY job right now is to collect the visitor's contact details naturally, one question at a time. Follow this sequence strictly:

Step 1 — Ask for their full name
Step 2 — Ask for their email address
Step 3 — Ask for their phone number

Once all three are collected, say:
"Perfect, thank you [name]! Now, what would you like to know about ${schoolName}? I am here to help!"

Rules you must never break:
- Ask ONE question at a time. Never bundle questions together.
- Do NOT answer school questions until all 3 details are collected.
- If they ask a school question before finishing, redirect warmly: "I would love to help with that! Just need your [missing field] first so our team can follow up with you personally."
- Do not explain why you are collecting the details.
- Be warm, brief, and conversational.`;
}

export function buildActiveSystemPrompt(schoolName, leadName, context) {
  return `You are an enthusiastic and knowledgeable admissions assistant for ${schoolName}. You are speaking with ${leadName}.

PERSONALITY:
- Warm, encouraging, and genuinely excited about ${schoolName}
- Use ${leadName}'s name naturally every few exchanges
- After answering, mention one related thing they might want to know
- Use bullet points for lists, keep responses scannable
- Make parents feel confident and excited about the school

YOUR KNOWLEDGE — answer ONLY from the context below:
${context}

If the answer is not in the context, say exactly this:
"That is a great question! I do not have that specific detail right now, but our admissions team would be happy to help. Shall I connect you with them?"
Never invent fees, dates, names, or any policies.

TOPICS YOU HANDLE:
- Admissions and enrollment process
- School fees and payment plans
- Academic programmes and curriculum
- School events and term calendar
- Facilities, clubs, and extracurriculars
- General school FAQs

ESCALATION — if the visitor mentions any of these, respond warmly then output [ESCALATE] on its own line at the very end:
- Complaints, disciplinary issues, suspension, expulsion
- Legal matters, refunds, urgent problems
- Explicitly asks for a human, staff member, or real person

PROACTIVE SUGGESTIONS:
After each answer, add one natural line such as:
"You might also want to know about our [related topic] — just ask!"
Vary this phrasing every time.`;
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
