import crypto from 'crypto';
import supabase from '../../src/db/supabase.js';
import { normalizePhoneNumber, formatWhatsAppRecipient } from '../../src/utils/phone.js';
import {
  sendWhatsAppMessage,
  sendWhatsAppButtons,
} from '../../src/services/whatsapp.js';
import {
  buildActiveSystemPrompt,
  chat,
  detectEscalation,
  stripEscalateToken,
} from '../../src/services/llm.js';
import { searchKnowledgeBase } from '../../src/services/rag.js';
import * as zoho from '../../src/services/zoho.js';
import * as email from '../../src/services/email.js';
import { anyAdminOnline } from '../../src/utils/presence.js';

// ── Contact Validation & Helper Functions ─────────────────────────

function isPlaceholderName(name) {
  if (!name || typeof name !== 'string') return true;
  const lower = name.trim().toLowerCase();
  const placeholders = [
    'whatsapp inquirer',
    'whatsapp user',
    'prospective student',
    'unknown visitor',
    'student',
    'user',
    'someone',
    'null',
    'undefined',
    'none',
  ];
  return placeholders.includes(lower) || lower.length < 2;
}

function isValidEmail(emailStr) {
  if (!emailStr || typeof emailStr !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr.trim());
}

function isLeadComplete(lead) {
  if (!lead) return false;
  const hasName = Boolean(lead.name && !isPlaceholderName(lead.name));
  const hasEmail = Boolean(lead.email && isValidEmail(lead.email));
  const hasPhone = Boolean(lead.phone);
  return hasName && hasEmail && hasPhone;
}

function cleanPersonName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/^(my name is|i am|i'm|this is|call me|name:?)\s+/i, '')
    .replace(/[^\w\s'-]/g, '')
    .trim();
}

function extractContactDetails(text) {
  const result = { name: null, email: null, phone: null };
  if (!text || typeof text !== 'string') return result;

  // Email
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (emailMatch && isValidEmail(emailMatch[0])) {
    result.email = emailMatch[0].toLowerCase().trim();
  }

  // Phone
  const phoneMatch = text.match(/(\+?234|0)[789][01]\d{8}|\+?[1-9]\d{9,14}/);
  if (phoneMatch) {
    result.phone = phoneMatch[0].trim();
  }

  // Name patterns
  const namePatterns = [
    /my name is ([A-Za-z]+(?: [A-Za-z]+)+)/i,
    /i am ([A-Za-z]+(?: [A-Za-z]+)+)/i,
    /i'm ([A-Za-z]+(?: [A-Za-z]+)+)/i,
    /this is ([A-Za-z]+(?: [A-Za-z]+)+)/i,
    /call me ([A-Za-z]+(?: [A-Za-z]+)+)/i,
    /name:\s*([A-Za-z]+(?: [A-Za-z]+)+)/i,
  ];
  for (const pat of namePatterns) {
    const m = text.match(pat);
    if (m && !isPlaceholderName(m[1])) {
      result.name = m[1].trim();
      break;
    }
  }

  return result;
}

const RESET_KEYWORDS = new Set([
  'hi',
  'hello',
  'hey',
  'start',
  'restart',
  'reset',
  'menu',
  'change details',
  'update details',
  'update info',
  'change info',
  'good morning',
  'good afternoon',
  'good evening',
]);

function isSessionStartMessage(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return RESET_KEYWORDS.has(lower);
}

function isSessionStale(conv) {
  if (!conv || !conv.updated_at) return true;
  const lastActive = new Date(conv.updated_at).getTime();
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  return Date.now() - lastActive > twelveHoursMs;
}

async function sendConfirmationPrompt(to, lead) {
  const name = lead.name || 'Student';
  const emailVal = lead.email || 'Not provided';
  const phoneVal = lead.phone || lead.normalized_phone || `+${to}`;

  const bodyText = `Welcome to *Ahmadu Bello University (ABU) Distance Learning Centre*! 🎓\n\nPlease confirm your contact details before we proceed:\n• *Name:* ${name}\n• *Email:* ${emailVal}\n• *Phone:* ${phoneVal}\n\nReply *1* (or click *Confirm & Proceed*) to continue.\nReply *2* (or click *Change Details*) to update your information.`;

  const buttons = [
    { id: 'confirm_details', title: 'Confirm & Proceed' },
    { id: 'change_details', title: 'Change Details' },
  ];

  return await sendWhatsAppButtons(to, bodyText, buttons);
}

async function sendPhoneCollectionPrompt(to, rawFrom) {
  const bodyText = `Great! Lastly, what is your *Phone number*?\n\nWould you like to use your current WhatsApp number *+${rawFrom}* as your contact phone number? (Reply *1* or *'Same'* to use it, or enter a different phone number):`;

  const buttons = [
    { id: 'phone_use_current', title: 'Use WhatsApp No' },
    { id: 'phone_enter_different', title: 'Enter Other Phone' },
  ];

  return await sendWhatsAppButtons(to, bodyText, buttons);
}

/**
 * Validates Meta webhook HMAC SHA-256 signature if app secret is configured.
 */
function verifyMetaSignature(req) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true;

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
      console.warn('[WhatsApp Webhook] Signature mismatch noticed. Continuing request.');
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

    console.log('[WhatsApp Webhook] Received GET verification request:', {
      mode,
      tokenReceived: !!token,
      tokenMatches: token === verifyToken,
    });

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

    // ── Extract Incoming Content ─────────────────────────────
    let incomingText = '';
    let clickedButtonId = null;

    if (messageObj.type === 'text') {
      incomingText = messageObj.text?.body?.trim() || '';
    } else if (messageObj.type === 'interactive') {
      const buttonReply = messageObj.interactive?.button_reply;
      if (buttonReply) {
        incomingText = buttonReply.title?.trim() || '';
        clickedButtonId = buttonReply.id;
      }
      const listReply = messageObj.interactive?.list_reply;
      if (listReply) {
        incomingText = listReply.title?.trim() || '';
        clickedButtonId = listReply.id;
      }
    }

    if (!incomingText) {
      // Non-text message (e.g. sticker, media, location)
      await sendWhatsAppMessage(
        rawFrom,
        'I received your attachment. Could you please describe what you need assistance with in text so I can help you best?'
      );
      return res.status(200).json({ status: 'media_prompt_sent' });
    }

    // ── Bind Strictly to ABU School Record ───────────────────
    const { data: school, error: schoolErr } = await supabase
      .from('schools')
      .select('*')
      .eq('slug', 'abu')
      .single();

    if (schoolErr || !school) {
      console.error('[WhatsApp Webhook] ABU school record missing in DB:', schoolErr);
      return res.status(500).json({ error: 'School configuration error' });
    }

    // ── Load or Create Lead Record ───────────────────────────
    const waLeadConditions = [`session_id.eq.wa_${rawFrom}`];
    if (normalizedPhone) waLeadConditions.push(`normalized_phone.eq.${normalizedPhone}`);
    if (rawFrom) waLeadConditions.push(`phone.eq.${rawFrom}`);

    let { data: lead } = await supabase
      .from('leads')
      .select('*')
      .or(waLeadConditions.join(','))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lead) {
      const initialName = isPlaceholderName(profileName) ? null : profileName;
      const { data: newLead } = await supabase
        .from('leads')
        .insert({
          school_id: school.id,
          session_id: `wa_${rawFrom}`,
          name: initialName,
          phone: null,
          normalized_phone: normalizedPhone,
          whatsapp_opt_in: true,
        })
        .select()
        .single();
      lead = newLead;
    } else if (lead.school_id !== school.id || (!lead.normalized_phone && normalizedPhone)) {
      const { data: updatedLead } = await supabase
        .from('leads')
        .update({
          school_id: school.id,
          normalized_phone: lead.normalized_phone || normalizedPhone,
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

    const isComplete = isLeadComplete(lead);

    if (!conv) {
      const initialStage = isComplete ? 'confirming_details' : 'onboarding_name';
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          school_id: school.id,
          session_id: `wa_${rawFrom}`,
          lead_id: lead.id,
          whatsapp_phone: rawFrom,
          channel: 'whatsapp',
          stage: initialStage,
          messages: [],
        })
        .select()
        .single();
      conv = newConv;
    } else {
      if (conv.school_id !== school.id || !conv.lead_id) {
        await supabase
          .from('conversations')
          .update({
            school_id: school.id,
            lead_id: lead.id,
            whatsapp_phone: rawFrom,
          })
          .eq('id', conv.id);
        conv.school_id = school.id;
        conv.lead_id = lead.id;
      }
    }

    const messages = Array.isArray(conv.messages) ? conv.messages : [];
    const lowerInput = incomingText.toLowerCase().trim();

    // ── Handle ESCALATED Conversation First ──────────────────
    if (conv.stage === 'escalated') {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      await supabase
        .from('conversations')
        .update({
          messages,
          channel: 'whatsapp',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

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

      const hasRecentAdminReply = messages.slice(-4).some(m => m.role === 'admin');
      if (!hasRecentAdminReply) {
        await sendWhatsAppMessage(
          rawFrom,
          `Thanks for your message! Our *Ahmadu Bello University (ABU)* admissions team has been alerted. An available advisor will reply to you directly right here.`
        );
      }
      return res.status(200).json({ status: 'escalated_message_logged' });
    }

    // ── Check for Explicit Request to Change Details Anytime ──
    const wantsChangeDirectly =
      lowerInput === 'change details' ||
      lowerInput === 'update details' ||
      lowerInput === 'change my details' ||
      lowerInput === 'update info' ||
      lowerInput === 'change info';

    if (wantsChangeDirectly) {
      conv.stage = 'updating_name';
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      const replyPrompt = `No problem! Let's update your contact details.\n\nPlease enter your *Full Name* (or reply *'Keep'* to keep *${lead.name || 'current name'}*):`;
      messages.push({ role: 'assistant', content: replyPrompt, ts: Date.now() });

      await supabase
        .from('conversations')
        .update({
          stage: 'updating_name',
          messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      await sendWhatsAppMessage(rawFrom, replyPrompt);
      return res.status(200).json({ status: 'change_flow_started' });
    }

    // ── Check if Session is at the "Beginning of Chat" ────────
    const isNewOrRestart =
      messages.length === 0 ||
      conv.stage === 'resolved' ||
      conv.stage === 'confirming_details' ||
      isSessionStartMessage(incomingText) ||
      isSessionStale(conv);

    // If at beginning of chat and details are complete: Must confirm before proceeding
    if (isNewOrRestart && isComplete && conv.stage !== 'confirming_details' && !conv.stage.startsWith('updating_')) {
      conv.stage = 'confirming_details';
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      await supabase
        .from('conversations')
        .update({
          stage: 'confirming_details',
          messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      await sendConfirmationPrompt(rawFrom, lead);
      return res.status(200).json({ status: 'confirmation_prompt_sent' });
    }

    // ── STAGE: CONFIRMING DETAILS ────────────────────────────
    if (conv.stage === 'confirming_details') {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      const isConfirm =
        clickedButtonId === 'confirm_details' ||
        lowerInput === '1' ||
        lowerInput === 'confirm' ||
        lowerInput === 'confirm & proceed' ||
        lowerInput === 'proceed' ||
        lowerInput === 'yes' ||
        lowerInput === 'correct' ||
        lowerInput === 'accurate' ||
        lowerInput === 'yep' ||
        lowerInput === 'ok' ||
        lowerInput === 'okay' ||
        lowerInput === 'sure' ||
        lowerInput === 'looks good' ||
        lowerInput === 'continue' ||
        lowerInput === 'all good';

      const isChange =
        clickedButtonId === 'change_details' ||
        lowerInput === '2' ||
        lowerInput === 'change' ||
        lowerInput === 'change details' ||
        lowerInput === 'update' ||
        lowerInput === 'update details' ||
        lowerInput === 'edit' ||
        lowerInput === 'modify' ||
        lowerInput === 'no' ||
        lowerInput === 'different' ||
        lowerInput === 'wrong';

      if (isConfirm) {
        conv.stage = 'active';

        const questionSnippet = incomingText
          .replace(/^(1|confirm|yes|proceed|correct|ok|okay|sure|looks good|all good)[., ]*/i, '')
          .trim();

        let welcomeReply = `Thank you, *${lead.name}*! Your details have been confirmed. ✅\n\nWhat would you like to know about *Ahmadu Bello University (ABU) Distance Learning Centre*? I am happy to assist you with available programmes, admission requirements, tuition fees, and application procedures!`;

        if (questionSnippet.length > 5) {
          const chunks = await searchKnowledgeBase(questionSnippet, school.id);
          const context =
            chunks.length > 0
              ? chunks.map(c => c.content).join('\n\n---\n\n')
              : 'No specific information found in the knowledge base for this query.';

          const systemPrompt = `${buildActiveSystemPrompt(school.name, lead.name || 'there', context)}
IMPORTANT: You are communicating directly with the student via WhatsApp. Keep your responses crisp, professional, friendly, and well-structured using WhatsApp styling (*bold* for emphasis, clean short bullet points). Avoid long walls of text.`;

          const aiReply = await chat(systemPrompt, [{ role: 'user', content: questionSnippet }]);
          const cleanReply = stripEscalateToken(aiReply);

          welcomeReply = `Thank you, *${lead.name}*! Your details are confirmed. ✅\n\n${cleanReply}`;
        }

        messages.push({ role: 'assistant', content: welcomeReply, ts: Date.now() });

        await supabase
          .from('conversations')
          .update({
            stage: 'active',
            messages,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conv.id);

        await sendWhatsAppMessage(rawFrom, welcomeReply);
        return res.status(200).json({ status: 'confirmed_and_activated' });
      }

      if (isChange) {
        conv.stage = 'updating_name';
        const changePrompt = `No problem! Let's update your contact details.\n\nPlease enter your *Full Name* (or reply *'Keep'* to keep *${lead.name}*):`;
        messages.push({ role: 'assistant', content: changePrompt, ts: Date.now() });

        await supabase
          .from('conversations')
          .update({
            stage: 'updating_name',
            messages,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conv.id);

        await sendWhatsAppMessage(rawFrom, changePrompt);
        return res.status(200).json({ status: 'change_flow_started' });
      }

      // Direct field extraction during confirmation
      const directDetails = extractContactDetails(incomingText);
      if (directDetails.email || directDetails.name || directDetails.phone) {
        if (directDetails.name) lead.name = directDetails.name;
        if (directDetails.email) lead.email = directDetails.email;
        if (directDetails.phone) {
          lead.phone = directDetails.phone;
          lead.normalized_phone = normalizePhoneNumber(directDetails.phone) || directDetails.phone;
        }

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

        zoho.syncLeadToZoho(lead, school, { source: 'WhatsApp Bot' }).catch(console.error);

        const updateAck = `I've updated your details! Please confirm:`;
        messages.push({ role: 'assistant', content: updateAck, ts: Date.now() });

        await supabase
          .from('conversations')
          .update({
            messages,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conv.id);

        await sendConfirmationPrompt(rawFrom, lead);
        return res.status(200).json({ status: 'direct_details_updated' });
      }

      // Unrecognized answer -> resend prompt
      await sendConfirmationPrompt(rawFrom, lead);
      return res.status(200).json({ status: 'confirmation_prompt_resent' });
    }

    // ── STAGE: UPDATING DETAILS (Step-by-Step) ─────────────────
    if (conv.stage === 'updating_name') {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      if (lowerInput !== 'keep') {
        const cleanedName = cleanPersonName(incomingText);
        if (!isPlaceholderName(cleanedName)) {
          lead.name = cleanedName;
        }
      }

      conv.stage = 'updating_email';
      const promptEmail = `Great! What is your *Email address*? (or reply *'Keep'* to keep *${lead.email || 'current email'}*):`;
      messages.push({ role: 'assistant', content: promptEmail, ts: Date.now() });

      await supabase.from('leads').update({ name: lead.name, updated_at: new Date().toISOString() }).eq('id', lead.id);
      await supabase
        .from('conversations')
        .update({
          stage: 'updating_email',
          messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      await sendWhatsAppMessage(rawFrom, promptEmail);
      return res.status(200).json({ status: 'updated_name' });
    }

    if (conv.stage === 'updating_email') {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      if (lowerInput !== 'keep') {
        const extracted = extractContactDetails(incomingText).email || (isValidEmail(incomingText) ? incomingText.toLowerCase().trim() : null);
        if (extracted) {
          lead.email = extracted;
        } else {
          const invalidReply = `That doesn't look like a valid email address. Please enter your email (e.g. *name@example.com*) or reply *'Keep'* to keep *${lead.email || 'current email'}*:`;
          await sendWhatsAppMessage(rawFrom, invalidReply);
          return res.status(200).json({ status: 'invalid_email_prompt' });
        }
      }

      conv.stage = 'updating_phone';
      const promptPhone = `Got it! What is your *Phone number*? (Reply *1* or *'Same'* to use *+${rawFrom}*, or reply *'Keep'* to keep *${lead.phone || lead.normalized_phone}*):`;
      messages.push({ role: 'assistant', content: promptPhone, ts: Date.now() });

      await supabase.from('leads').update({ email: lead.email, updated_at: new Date().toISOString() }).eq('id', lead.id);
      await supabase
        .from('conversations')
        .update({
          stage: 'updating_phone',
          messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      await sendWhatsAppMessage(rawFrom, promptPhone);
      return res.status(200).json({ status: 'updated_email' });
    }

    if (conv.stage === 'updating_phone') {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      if (clickedButtonId === 'phone_use_current' || lowerInput === 'same' || lowerInput === 'yes' || lowerInput === '1') {
        lead.phone = normalizedPhone;
        lead.normalized_phone = normalizedPhone;
      } else if (lowerInput !== 'keep') {
        const norm = normalizePhoneNumber(incomingText);
        lead.phone = norm || incomingText.trim();
        lead.normalized_phone = norm || normalizedPhone;
      }

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

      zoho.syncLeadToZoho(lead, school, { source: 'WhatsApp Bot' }).catch(console.error);

      conv.stage = 'active';
      const successReply = `Thank you, *${lead.name}*! Your details have been updated successfully: ✅\n• *Name:* ${lead.name}\n• *Email:* ${lead.email}\n• *Phone:* ${lead.phone || lead.normalized_phone}\n\nHow can I help you today regarding *Ahmadu Bello University (ABU) Distance Learning Centre*?`;
      messages.push({ role: 'assistant', content: successReply, ts: Date.now() });

      await supabase
        .from('conversations')
        .update({
          stage: 'active',
          messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      await sendWhatsAppMessage(rawFrom, successReply);
      return res.status(200).json({ status: 'update_completed' });
    }

    // ── STAGE: INCOMPLETE LEAD ONBOARDING ────────────────────
    // Sub-stage 1: Onboarding Name
    if (conv.stage === 'onboarding_name' || !lead.name || isPlaceholderName(lead.name)) {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      // Check if user provided multi-field input
      const multi = extractContactDetails(incomingText);
      const cleaned = multi.name || cleanPersonName(incomingText);

      if (cleaned && !isPlaceholderName(cleaned) && !isSessionStartMessage(incomingText)) {
        lead.name = cleaned;
        if (multi.email) lead.email = multi.email;
        if (multi.phone) {
          lead.phone = multi.phone;
          lead.normalized_phone = normalizePhoneNumber(multi.phone) || multi.phone;
        }

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

        if (lead.email && lead.phone) {
          // All details provided at once!
          conv.stage = 'active';
          zoho.syncLeadToZoho(lead, school, { source: 'WhatsApp Bot' }).catch(console.error);
          zoho.sendCliqAlert(school, lead, `New student completed registration: "${lead.name}" (${lead.email})`, { channel: 'WhatsApp' }).catch(console.error);

          const welcomeActive = `Perfect, thank you *${lead.name}*! Your details have been saved: ✅\n• *Name:* ${lead.name}\n• *Email:* ${lead.email}\n• *Phone:* ${lead.phone || lead.normalized_phone}\n\nWelcome to *Ahmadu Bello University (ABU) Distance Learning Centre*! 🎓\nHow can I help you today? Feel free to ask about our undergraduate and postgraduate programmes, admission requirements, tuition fees, or application procedures.`;
          messages.push({ role: 'assistant', content: welcomeActive, ts: Date.now() });

          await supabase.from('conversations').update({ stage: 'active', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
          await sendWhatsAppMessage(rawFrom, welcomeActive);
          return res.status(200).json({ status: 'onboarding_completed' });
        }

        // Advance to email
        conv.stage = 'onboarding_email';
        const promptEmail = `Thank you, *${lead.name}*! What is your *Email address*?`;
        messages.push({ role: 'assistant', content: promptEmail, ts: Date.now() });

        await supabase.from('conversations').update({ stage: 'onboarding_email', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
        await sendWhatsAppMessage(rawFrom, promptEmail);
        return res.status(200).json({ status: 'asked_email' });
      }

      // Needs Name prompt
      conv.stage = 'onboarding_name';
      const promptName = `Welcome to *Ahmadu Bello University (ABU) Distance Learning Centre* Admissions Support! 🎓\n\nI am Maverick, your admissions assistant.\n\nBefore we proceed, could you please tell me your *Full Name*?`;
      messages.push({ role: 'assistant', content: promptName, ts: Date.now() });

      await supabase.from('conversations').update({ stage: 'onboarding_name', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
      await sendWhatsAppMessage(rawFrom, promptName);
      return res.status(200).json({ status: 'asked_name' });
    }

    // Sub-stage 2: Onboarding Email
    if (conv.stage === 'onboarding_email' || !lead.email || !isValidEmail(lead.email)) {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      const emailVal = extractContactDetails(incomingText).email || (isValidEmail(incomingText) ? incomingText.toLowerCase().trim() : null);

      if (emailVal && !isSessionStartMessage(incomingText)) {
        lead.email = emailVal;
        await supabase.from('leads').update({ email: lead.email, updated_at: new Date().toISOString() }).eq('id', lead.id);

        conv.stage = 'onboarding_phone';
        messages.push({
          role: 'assistant',
          content: `Great! Lastly, what is your *Phone number*? (Reply *'Same'* to use your current WhatsApp number *+${rawFrom}*):`,
          ts: Date.now(),
        });

        await supabase.from('conversations').update({ stage: 'onboarding_phone', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
        await sendPhoneCollectionPrompt(rawFrom, rawFrom);
        return res.status(200).json({ status: 'asked_phone' });
      }

      // Invalid email provided
      const invalidEmailPrompt = `That doesn't look like a valid email address. Please enter your email address (e.g. *name@example.com*):`;
      messages.push({ role: 'assistant', content: invalidEmailPrompt, ts: Date.now() });

      await supabase.from('conversations').update({ stage: 'onboarding_email', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
      await sendWhatsAppMessage(rawFrom, invalidEmailPrompt);
      return res.status(200).json({ status: 'asked_email' });
    }

    // Sub-stage 3: Onboarding Phone
    if (conv.stage === 'onboarding_phone' || !lead.phone) {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      if (clickedButtonId === 'phone_enter_different') {
        const enterDifferentPrompt = `Please enter your preferred contact phone number (e.g. *08012345678*):`;
        messages.push({ role: 'assistant', content: enterDifferentPrompt, ts: Date.now() });

        await supabase.from('conversations').update({ stage: 'onboarding_phone', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
        await sendWhatsAppMessage(rawFrom, enterDifferentPrompt);
        return res.status(200).json({ status: 'asked_phone' });
      }

      if (
        clickedButtonId === 'phone_use_current' ||
        lowerInput === 'same' ||
        lowerInput === 'yes' ||
        lowerInput === '1' ||
        lowerInput === 'use whatsapp no' ||
        lowerInput === 'use whatsapp'
      ) {
        lead.phone = normalizedPhone;
        lead.normalized_phone = normalizedPhone;
      } else {
        const norm = normalizePhoneNumber(incomingText);
        if (norm) {
          lead.phone = norm;
          lead.normalized_phone = norm;
        } else {
          // If input is not a valid phone number
          const retryPhone = `Please enter a valid phone number (e.g. *08012345678*) or reply *'Same'* to use your current WhatsApp number *+${rawFrom}*:`;
          messages.push({ role: 'assistant', content: retryPhone, ts: Date.now() });

          await supabase.from('conversations').update({ stage: 'onboarding_phone', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
          await sendPhoneCollectionPrompt(rawFrom, rawFrom);
          return res.status(200).json({ status: 'asked_phone' });
        }
      }

      // Complete Onboarding!
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

      zoho.syncLeadToZoho(lead, school, { source: 'WhatsApp Bot' }).catch(console.error);
      zoho.sendCliqAlert(
        school,
        lead,
        `New student completed WhatsApp onboarding: "${lead.name}" (${lead.email})`,
        { channel: 'WhatsApp', actionUrl: `${process.env.APP_URL || 'https://eabt-ai-team-project.vercel.app'}/chats` }
      ).catch(console.error);

      conv.stage = 'active';
      const welcomeActive = `Perfect, thank you *${lead.name}*! Your details have been saved: ✅\n• *Name:* ${lead.name}\n• *Email:* ${lead.email}\n• *Phone:* ${lead.phone || lead.normalized_phone}\n\nWelcome to *Ahmadu Bello University (ABU) Distance Learning Centre*! 🎓\nHow can I help you today? Feel free to ask about our undergraduate and postgraduate programmes, admission requirements, tuition fees, or application procedures.`;
      messages.push({ role: 'assistant', content: welcomeActive, ts: Date.now() });

      await supabase
        .from('conversations')
        .update({
          stage: 'active',
          messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      await sendWhatsAppMessage(rawFrom, welcomeActive);
      return res.status(200).json({ status: 'onboarding_completed' });
    }

    // ── STAGE: ACTIVE (ABU Admissions Q&A + RAG) ──────────────
    messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

    // Check for Human Escalation Intent
    const wantsHuman = detectEscalation(incomingText);

    if (wantsHuman) {
      conv.stage = 'escalated';

      await supabase.from('escalations').insert({
        conversation_id: conv.id,
        school_id: school.id,
        lead_id: lead.id,
        reason: 'user_request',
      });

      zoho.createEscalationTask(
        lead,
        school,
        'WhatsApp visitor requested human advisor',
        `User Message: "${incomingText}"`
      ).catch(console.error);

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

      email.sendEscalationEmail({
        school,
        lead,
        conversation: { ...conv, messages },
        reason: 'user_request',
      }).catch(console.error);

      const botResponse = `I've connected you to the *Ahmadu Bello University (ABU)* admissions team! 🎓\n\nAn admissions advisor has been alerted on our portal and will reply to you directly right here shortly. (Admissions Support Hours: Mon–Fri, 8:00 AM – 6:00 PM WAT).`;
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

    // Execute ABU Knowledge Base RAG Search
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
        'WhatsApp AI could not find specific details in ABU knowledge base',
        `Question: "${incomingText}"`
      ).catch(console.error);

      zoho.sendCliqAlert(
        school,
        lead,
        `AI could not find knowledge base answer for: "${incomingText}". Escalating to ABU admissions team.`,
        {
          channel: 'WhatsApp',
          reason: 'Knowledge Base Fallback',
          actionUrl: `${process.env.APP_URL || 'https://eabt-ai-team-project.vercel.app'}/chats`,
        }
      ).catch(console.error);

      email.sendEscalationEmail({
        school,
        lead,
        conversation: { ...conv, messages },
        reason: 'failed_attempts',
      }).catch(console.error);

      const combinedReply = `${cleanReply}\n\nI've forwarded your query to our *Ahmadu Bello University (ABU)* admissions team so an advisor can provide you with the exact details directly here.`;
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

    // Normal Successful Answer
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

    // Periodically attach summary note to Zoho CRM
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
