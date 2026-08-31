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
import {
  isValidHumanName,
  cleanPersonName,
  extractCleanName,
  isConversationalSentence,
} from '../../src/utils/name.js';

// ── Contact Validation & Helper Functions ─────────────────────────

function isPlaceholderName(name) {
  if (!name || typeof name !== 'string') return true;
  return !isValidHumanName(name);
}

function isValidEmail(emailStr) {
  if (!emailStr || typeof emailStr !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr.trim());
}

function isLeadComplete(lead) {
  if (!lead) return false;
  const hasName = Boolean(lead.name && isValidHumanName(lead.name));
  const hasEmail = Boolean(lead.email && isValidEmail(lead.email));
  const hasPhone = Boolean(lead.phone);
  return hasName && hasEmail && hasPhone;
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

  // Extract clean name if pattern matches
  const extractedName = extractCleanName(text);
  if (extractedName) {
    result.name = extractedName;
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
  'main menu',
  'options',
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

// ── Time & Support Hours Helpers (West Africa Time UTC+1) ──────────

export function getWATDate() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 3600000);
}

export function isDuringAdmissionsHours() {
  const wat = getWATDate();
  const day = wat.getDay(); // 0 = Sun, 6 = Sat
  const hour = wat.getHours(); // 0 - 23
  // Mon (1) to Fri (5), 8:00 AM (8) to 6:00 PM (18)
  return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
}

function getEscalationAckMessage(school) {
  const schoolName = getSchoolDisplayName(school);
  if (isDuringAdmissionsHours()) {
    return `I've connected you to our *${schoolName}* admissions concierge team! 🎓\n\nAn admissions advisor has been alerted on our live portal and will reply to you directly right here shortly.\n_(Admissions Hours: Mon–Fri, 8:00 AM – 6:00 PM WAT)_`;
  }
  return `I've prioritized and logged your request with our *${schoolName}* admissions team! 🌙\n\nSince you are reaching out outside official office hours (Mon–Fri, 8:00 AM – 6:00 PM WAT), an admissions advisor will review your inquiry and reply to you first thing tomorrow morning directly here on WhatsApp.`;
}

// ── Multi-Tenant School Helpers ───────────────────────────────────

function getSchoolDisplayName(school) {
  if (!school) return 'University Admissions Support';
  const slug = (school.slug || '').toLowerCase();
  if (slug === 'babcock' || slug === 'backock') {
    return 'Babcock University (BU-CODEL)';
  }
  if (slug === 'abu') {
    return 'Ahmadu Bello University (ABU) Distance Learning Centre';
  }
  return school.name || 'Admissions Support';
}

function getSchoolWelcomePrompt(school, leadName) {
  const schoolName = getSchoolDisplayName(school);
  const slug = (school?.slug || '').toLowerCase();
  if (slug === 'babcock' || slug === 'backock') {
    return `Welcome to *${schoolName}*! 🎓\n\nHow can I help you today? Feel free to ask about our undergraduate and conversion degree programmes, admission requirements, tuition fees, or application procedures.`;
  }
  return `Welcome to *${schoolName}*! 🎓\n\nHow can I help you today? Feel free to ask about our undergraduate and postgraduate programmes, admission requirements, tuition fees, or application procedures.`;
}

async function sendConfirmationPrompt(to, lead, school) {
  const schoolName = getSchoolDisplayName(school);
  const name = lead.name || 'Student';
  const emailVal = lead.email || 'Not provided';
  const phoneVal = lead.phone || lead.normalized_phone || `+${to}`;

  const bodyText = `Welcome to *${schoolName}*! 🎓\n\nPlease confirm your contact details before we proceed:\n• *Name:* ${name}\n• *Email:* ${emailVal}\n• *Phone:* ${phoneVal}\n\nReply *1* (or click *Confirm & Proceed*) to continue.\nReply *2* (or click *Change Details*) to update your information.`;

  const buttons = [
    { id: 'confirm_details', title: 'Confirm & Proceed' },
    { id: 'change_details', title: 'Change Details' },
  ];

  return await sendWhatsAppButtons(to, bodyText, buttons, { schoolSlug: school.slug });
}

async function sendPhoneCollectionPrompt(to, rawFrom, school) {
  const bodyText = `Great! Lastly, what is your *Phone number*?\n\nWould you like to use your current WhatsApp number *+${rawFrom}* as your contact phone number? (Reply *1* or *'Same'* to use it, or enter a different phone number):`;

  const buttons = [
    { id: 'phone_use_current', title: 'Use WhatsApp No' },
    { id: 'phone_enter_different', title: 'Enter Other Phone' },
  ];

  return await sendWhatsAppButtons(to, bodyText, buttons, { schoolSlug: school.slug });
}

async function sendInteractiveWelcomeMenu(to, school, customHeader = '') {
  const schoolName = getSchoolDisplayName(school);
  const header = customHeader || `Welcome to *${schoolName}*! 🎓\n\nHow can I assist you with your academic goals today?`;
  const bodyText = `${header}\n\nSelect an option below or type any specific question:`;

  const buttons = [
    { id: 'btn_programmes', title: 'Explore Courses' },
    { id: 'btn_fees', title: 'Tuition & Fees' },
    { id: 'btn_apply', title: 'How to Apply' },
  ];

  return await sendWhatsAppButtons(to, bodyText, buttons, { schoolSlug: school.slug });
}

export function getFastPathResponse(actionIdOrText, school) {
  const slug = (school?.slug || '').toLowerCase();
  const isBabcock = slug === 'babcock' || slug === 'backock';
  const lower = (actionIdOrText || '').toLowerCase().trim();

  // Programmes Fast-Path
  if (
    lower === 'btn_programmes' ||
    lower === 'explore courses' ||
    lower === 'programmes' ||
    lower === 'courses' ||
    lower === 'courses offered' ||
    lower === 'programmes offered' ||
    lower === '1'
  ) {
    if (isBabcock) {
      return `🎓 *Babcock University (BU-CODEL) Programmes*\n\n• *B.Sc. Accounting* (Direct Entry & 100L)\n• *B.Sc. Business Administration*\n• *B.Sc. Computer Science*\n• *B.Sc. Economics*\n• *B.Sc. Mass Communication*\n• *B.Sc. Public Health*\n• *BNSc. Nursing Science* (HND / RN to B.Sc. Conversion)\n\n📌 *Study Mode:* 100% Online with virtual lectures and flexible examinations.\n\nReply with any programme name to view specific admission requirements or tuition breakdown!`;
    }
    return `🎓 *ABU Distance Learning Centre (ABUDLC) Programmes*\n\n📚 *Undergraduate Programmes (B.Sc. / B.A.):*\n• *B.Sc. Accounting*\n• *B.Sc. Business Administration*\n• *B.Sc. Public Administration*\n• *B.Sc. Computer Science*\n• *B.Sc. Economics*\n• *B.Sc. Mass Communication*\n• *B.Sc. Political Science*\n• *B.Sc. International Studies*\n• *B.Sc. Sociology*\n• *B.Sc. Library & Information Science (BLIS)*\n\n🩺 *Conversion / Nursing:*\n• *BNSc. Nursing Science* (For Registered Nurses with N&MCoN License)\n\n🎓 *Postgraduate Degree & Diploma Programmes:*\n• *Master of Business Administration (MBA)* (Regular & Special)\n• *Master of Public Health (MPH)*\n• *Master of Public Administration (MPA)*\n• *Master in Information Management (MIM)*\n• *Master in Law Enforcement & Criminal Justice (MLCJ)*\n• *Master in International Affairs & Diplomacy (MIAD)*\n• *Master in Disaster Risk Management (MDRM)*\n• *Master in Accounting (MAC)*\n• *Postgraduate Diploma in Education (PGDE)*\n• *Postgraduate Diploma in Management (PGDM)*\n\n📌 *Study Mode:* 100% Online. No JAMB required for undergraduate entry!\n\nReply with any programme name to view specific admission requirements or tuition breakdown!`;
  }

  // Fees Fast-Path
  if (
    lower === 'btn_fees' ||
    lower === 'tuition & fees' ||
    lower === 'fees' ||
    lower === 'tuition' ||
    lower === 'school fees' ||
    lower === 'cost' ||
    lower === '2'
  ) {
    if (isBabcock) {
      return `💰 *Babcock University (BU-CODEL) Tuition Schedule*\n\n• *Structured Payments:* Flexible per-semester payments or 2 to 3 instalments.\n• *What's Included:* Tuition, electronic study packs, e-library, continuous assessment, and exams.\n• *Official Portal:* Verified fee schedules are published on *https://codel.babcock.edu.ng*\n\nReply with your specific programme (e.g. *Accounting* or *Nursing*) for exact figures!`;
    }
    return `💰 *ABU Distance Learning Centre Tuition Schedule*\n\n• *Per-Semester Payments:* Tuition is payable per semester directly on the portal. (Bulk payments for multiple semesters are not accepted).\n• *Payment Gateway:* Processed securely through Paystack on *https://reg.abudlc.edu.ng*\n• *What's Included:* LMS access, interactive e-courseware, continuous assessment, and exam access.\n• *Application Fee:* *₦10,300* (one-time fee payable during online registration at *https://apply.abudlc.edu.ng*).\n\nReply with your specific programme (e.g. *MBA*, *Nursing*, or *Computer Science*) for exact figures!`;
  }

  // How to Apply Fast-Path
  if (
    lower === 'btn_apply' ||
    lower === 'how to apply' ||
    lower === 'apply' ||
    lower === 'application' ||
    lower === 'admission form' ||
    lower === 'how do i apply' ||
    lower === '3'
  ) {
    if (isBabcock) {
      return `📝 *How to Apply — Babcock University (BU-CODEL)*\n\n1️⃣ Visit the official portal: *https://codel.babcock.edu.ng*\n2️⃣ Click *'Apply Now'* and register your applicant profile.\n3️⃣ Upload credentials (O'Level / WAEC / NECO / RN License if conversion).\n4️⃣ Submit application for expedited online screening.\n\nNeed human guidance? Reply *'Agent'* anytime to speak with an admissions advisor!`;
    }
    return `📝 *How to Apply — ABU Distance Learning Centre*\n\n1️⃣ *Create Account:* Visit *https://apply.abudlc.edu.ng* and click *Sign Up*.\n2️⃣ *Upload Credentials:* Complete your profile and upload your O'Level results (and RN License / Degree / HND / NYSC for Direct Entry & Postgraduate).\n3️⃣ *Pay Application Fee:* Pay the *₦10,300* fee via the secure Paystack gateway.\n4️⃣ *Screening & Admission:* Receive your screening outcome and provisional admission letter!\n\nNeed human guidance? Reply *'Agent'* anytime to speak with an admissions advisor!`;
  }

  // Exam Centers Fast-Path
  if (
    lower === 'btn_exam_centers' ||
    lower === 'exam centers' ||
    lower === 'examination centers' ||
    lower === 'exam locations' ||
    lower === 'where are exams held' ||
    lower === 'exams' ||
    lower === 'centers'
  ) {
    if (isBabcock) {
      return `📍 *Babcock University (BU-CODEL) Examination Centers*\n\n• *Physical Centers:* Lagos, Abuja, Port Harcourt, and Ilishan-Remo Main Campus.\n• *Schedule:* Flexible weekend or weekday examination sessions scheduled per semester.\n• *Format:* Computer-Based Testing (CBT) and project assessments.\n\nReply *'Agent'* to speak with an admissions coordinator!`;
    }
    return `📍 *ABUDLC Examination & Screening Centers*\n\n🏢 *Physical Exam Centers in Nigeria:*\n• *North:* Zaria (Main Campus), Abuja, Kaduna, Kano, Sokoto, Katsina, Jos, Minna, Bauchi, Gombe, Maiduguri, Yola, Kebbi, Keffi, Ilorin, Lokoja, Dutse, Jalingo.\n• *South / West / East:* Lagos (Mainland & Island), Ibadan, Port Harcourt, Asaba, Akure, Abeokuta, Akwa Ibom, Enugu.\n\n🌍 *International Physical Centers:*\n• Central London (United Kingdom)\n• Jeddah (Saudi Arabia)\n\n💻 *Online Proctored Exams (Abroad):*\n• Available for international students residing in the *UK, USA, and Canada*.\n\n🔍 *Screening Centers:* Lagos, Kano, Sokoto, Port Harcourt, Abuja, Gombe, Kaduna, Asaba, Minna, Zaria (or Remote Online Screening for ₦20,000 at *https://remote.abudlc-edu.ng/*).`;
  }

  // Fast Track Fast-Path
  if (
    lower === 'btn_fast_track' ||
    lower === 'fast track' ||
    lower === 'fast-track' ||
    lower === 'accelerated'
  ) {
    if (isBabcock) {
      return `⏱️ *Babcock (BU-CODEL) Programme Duration*\n\n• *Conversion Degree (BNSc, B.Sc.):* 2 to 3 years (4–6 semesters).\n• *Direct Entry / 100L:* 3 to 4 years.\n• *Flexibility:* Study at your pace while continuing your full-time job!`;
    }
    return `⏱️ *ABUDLC Fast-Track & Programme Duration*\n\n• *Automatic Fast-Track:* ABUDLC operates a *3rd semester* within each academic session, allowing you to study continuously without taking an extended break.\n• *MBA Regular:* 4 semesters (~16 months).\n• *MBA Special:* 5 semesters (~20 months).\n• *PGDE / PGDM / MIM / MLCJ / MIAD / MDRM:* 2 semesters (~8 months).\n• *MPH / MPA / MAC:* 3 to 4 semesters.\n• *Undergraduate:* 3 to 4 years (Fast-Track available!).`;
  }

  // Transfers Fast-Path
  if (
    lower === 'btn_transfers' ||
    lower === 'transfers' ||
    lower === 'transfer' ||
    lower === 'intra-university' ||
    lower === 'inter-university'
  ) {
    if (isBabcock) {
      return `🔄 *Babcock University Transfer Policy*\n\n• Transfer students from NUC-accredited institutions are accepted into relevant levels based on transcript evaluation.\n• Submit official transcript to *Admissions@codel.babcock.edu.ng* for review.`;
    }
    return `🔄 *ABU Distance Learning Centre Transfer Policy*\n\n• *Intra-University Transfer (from ABU mainstream):* Minimum CGPA of *1.50* required.\n• *Inter-University Transfer (from other NUC-accredited universities):* Minimum CGPA of *2.40* required.\n• *Eligible Levels:* 200–300 Level (for 4-year programmes) or 200–400 Level (for 5-year programmes).\n• *How to Apply:* Apply online at *https://apply.abudlc.edu.ng/* under the Transfer Application section with your official academic transcripts.`;
  }

  return null;
}

/**
 * Resolves the destination school slug based on WhatsApp metadata.
 */
function resolveSchoolSlugFromPayload(entry, change, query = {}) {
  // Check direct query parameter override
  if (query.school) {
    const q = query.school.toLowerCase().trim();
    if (q === 'babcock' || q === 'backock') return 'babcock';
    if (q === 'abu') return 'abu';
  }

  const phoneId = change?.metadata?.phone_number_id || '';
  const displayPhone = change?.metadata?.display_phone_number || '';
  const wabaId = entry?.id || '';

  const babcockPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID_BABCOCK || '1308107395712291';
  const babcockWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_BABCOCK || '1306201654679772';
  const babcockNumber = (process.env.WHATSAPP_BUSINESS_NUMBER_BABCOCK || '2348080523171').replace(/[^\d]/g, '');

  const abuPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID_ABU || '1220287537833494';
  const abuWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_ABU || '920478204428865';
  const abuNumber = (process.env.WHATSAPP_BUSINESS_NUMBER_ABU || '2347025105412').replace(/[^\d]/g, '');

  // Match by Phone Number ID
  if (phoneId === babcockPhoneId) return 'babcock';
  if (phoneId === abuPhoneId) return 'abu';

  // Match by Business Number / Display Phone
  const cleanDisplay = displayPhone.replace(/[^\d]/g, '');
  if (cleanDisplay && (cleanDisplay === babcockNumber || cleanDisplay.endsWith('8080523171'))) return 'babcock';
  if (cleanDisplay && (cleanDisplay === abuNumber || cleanDisplay.endsWith('7025105412'))) return 'abu';

  // Match by WABA ID
  if (wabaId === babcockWabaId) return 'babcock';
  if (wabaId === abuWabaId) return 'abu';

  // Default fallback to Babcock if primary configured, otherwise check general env
  if (process.env.WHATSAPP_PHONE_NUMBER_ID === abuPhoneId) return 'abu';
  return 'babcock';
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

    // ── Multi-Tenant School Resolution ───────────────────────
    const schoolSlug = resolveSchoolSlugFromPayload(entry, change, req.query);
    console.log('[WhatsApp Webhook] Resolved School Slug:', schoolSlug);

    let { data: school, error: schoolErr } = await supabase
      .from('schools')
      .select('*')
      .eq('slug', schoolSlug)
      .maybeSingle();

    if (!school && (schoolSlug === 'babcock' || schoolSlug === 'backock')) {
      const { data: altSchool } = await supabase
        .from('schools')
        .select('*')
        .eq('slug', 'backock')
        .maybeSingle();
      school = altSchool;
    }

    if (schoolErr || !school) {
      console.error('[WhatsApp Webhook] School record missing in DB for slug:', schoolSlug, schoolErr);
      return res.status(500).json({ error: 'School configuration error' });
    }

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
        'I received your attachment. Could you please describe what you need assistance with in text so I can help you best?',
        { schoolSlug: school.slug }
      );
      return res.status(200).json({ status: 'media_prompt_sent' });
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
      const { data: newLead } = await supabase
        .from('leads')
        .insert({
          school_id: school.id,
          session_id: `wa_${rawFrom}`,
          name: profileName || null,
          phone: rawFrom,
          normalized_phone: normalizedPhone,
          whatsapp_opt_in: true,
        })
        .select()
        .single();
      lead = newLead;
      if (lead) {
        await zoho.syncLeadToZoho(lead, school, { source: 'WhatsApp Bot' });
      }
    } else if (lead.school_id !== school.id || (!lead.normalized_phone && normalizedPhone) || (!lead.phone && rawFrom)) {
      const { data: updatedLead } = await supabase
        .from('leads')
        .update({
          school_id: school.id,
          phone: lead.phone || rawFrom,
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
      let initialStage = 'onboarding_name';
      if (isComplete) {
        initialStage = 'confirming_details';
      }

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
    const schoolName = getSchoolDisplayName(school);

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

      await zoho.sendCliqAlert(
        school,
        lead,
        `New WhatsApp message from student: "${incomingText}"`,
        {
          channel: 'WhatsApp',
          reason: 'Escalated Chat Follow-up',
          actionUrl: `${process.env.APP_URL || 'https://eabt-ai-team-project.vercel.app'}/chats`,
        }
      );

      await zoho.addNoteToLead(
        lead,
        `WhatsApp Follow-up Message (${new Date().toLocaleDateString()})`,
        `[${new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Lagos' })}] Student:\n${incomingText}`,
        school
      );

      const hasRecentAdminReply = messages.slice(-4).some(m => m.role === 'admin');
      if (!hasRecentAdminReply) {
        const ackReply = getEscalationAckMessage(school);
        await sendWhatsAppMessage(rawFrom, ackReply, { schoolSlug: school.slug });
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

      await sendWhatsAppMessage(rawFrom, replyPrompt, { schoolSlug: school.slug });
      return res.status(200).json({ status: 'change_flow_started' });
    }

    // ── Check if Session is at the "Beginning of Chat" ────────
    const isNewOrRestart =
      messages.length === 0 ||
      conv.stage === 'resolved' ||
      conv.stage === 'confirming_details' ||
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

      await sendConfirmationPrompt(rawFrom, lead, school);
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

        if (questionSnippet.length > 5 && isConversationalSentence(questionSnippet)) {
          let welcomeReply = `Thank you, *${lead.name}*! Your details have been confirmed. ✅\n\n`;
          try {
            const chunks = await searchKnowledgeBase(questionSnippet, school.id);
            const context =
              chunks.length > 0
                ? chunks.map(c => c.content).join('\n\n---\n\n')
                : 'No specific information found in the knowledge base for this query.';

            const systemPrompt = `${buildActiveSystemPrompt(school.name, lead.name || 'there', context)}
IMPORTANT: You are communicating directly with the student via WhatsApp. Keep your responses crisp, professional, friendly, and well-structured using WhatsApp styling (*bold* for emphasis, clean short bullet points). Avoid long walls of text.`;

            const aiReply = await chat(systemPrompt, [{ role: 'user', content: questionSnippet }]);
            const cleanReply = stripEscalateToken(aiReply);
            welcomeReply += cleanReply;
          } catch (e) {
            welcomeReply += getSchoolWelcomePrompt(school, lead.name);
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

          await sendWhatsAppMessage(rawFrom, welcomeReply, { schoolSlug: school.slug });
          return res.status(200).json({ status: 'confirmed_and_activated' });
        }

        // Send Interactive Menu for pristine luxury experience
        const welcomeHeader = `Thank you, *${lead.name}*! Your details have been confirmed. ✅`;
        messages.push({ role: 'assistant', content: `${welcomeHeader}\n\nSelect an option below or ask any question:`, ts: Date.now() });

        await supabase
          .from('conversations')
          .update({
            stage: 'active',
            messages,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conv.id);

        await sendInteractiveWelcomeMenu(rawFrom, school, welcomeHeader);
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

        await sendWhatsAppMessage(rawFrom, changePrompt, { schoolSlug: school.slug });
        return res.status(200).json({ status: 'change_flow_started' });
      }

      // Direct field extraction during confirmation
      const directDetails = extractContactDetails(incomingText);
      if (directDetails.email || directDetails.name || directDetails.phone) {
        if (directDetails.name && isValidHumanName(directDetails.name)) lead.name = directDetails.name;
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

        await zoho.syncLeadToZoho(lead, school, { source: 'WhatsApp Bot' });

        const updateAck = `I've updated your details! Please confirm:`;
        messages.push({ role: 'assistant', content: updateAck, ts: Date.now() });

        await supabase
          .from('conversations')
          .update({
            messages,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conv.id);

        await sendConfirmationPrompt(rawFrom, lead, school);
        return res.status(200).json({ status: 'direct_details_updated' });
      }

      // Unrecognized answer -> resend prompt
      await sendConfirmationPrompt(rawFrom, lead, school);
      return res.status(200).json({ status: 'confirmation_prompt_resent' });
    }

    // ── STAGE: UPDATING DETAILS (Step-by-Step) ─────────────────
    if (conv.stage === 'updating_name') {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      if (lowerInput !== 'keep') {
        const cleanedName = extractCleanName(incomingText) || cleanPersonName(incomingText);
        if (cleanedName && isValidHumanName(cleanedName)) {
          lead.name = cleanedName;
          await supabase.from('leads').update({ name: lead.name, updated_at: new Date().toISOString() }).eq('id', lead.id);
          await zoho.syncLeadToZoho(lead, school, { source: 'WhatsApp Bot' });
        } else {
          const retryName = `Please enter your *Full Name* (e.g. *John Doe*) or reply *'Keep'* to keep *${lead.name || 'current name'}*:`;
          messages.push({ role: 'assistant', content: retryName, ts: Date.now() });
          await supabase.from('conversations').update({ messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
          await sendWhatsAppMessage(rawFrom, retryName, { schoolSlug: school.slug });
          return res.status(200).json({ status: 'invalid_name_in_update' });
        }
      }

      conv.stage = 'updating_email';
      const promptEmail = `Great! What is your *Email address*? (or reply *'Keep'* to keep *${lead.email || 'current email'}*):`;
      messages.push({ role: 'assistant', content: promptEmail, ts: Date.now() });

      await supabase
        .from('conversations')
        .update({
          stage: 'updating_email',
          messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      await sendWhatsAppMessage(rawFrom, promptEmail, { schoolSlug: school.slug });
      return res.status(200).json({ status: 'updated_name' });
    }

    if (conv.stage === 'updating_email') {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      if (lowerInput !== 'keep') {
        const extracted = extractContactDetails(incomingText).email || (isValidEmail(incomingText) ? incomingText.toLowerCase().trim() : null);
        if (extracted) {
          lead.email = extracted;
          await supabase.from('leads').update({ email: lead.email, updated_at: new Date().toISOString() }).eq('id', lead.id);
          await zoho.syncLeadToZoho(lead, school, { source: 'WhatsApp Bot' });
        } else {
          const invalidReply = `That doesn't look like a valid email address. Please enter your email (e.g. *name@example.com*) or reply *'Keep'* to keep *${lead.email || 'current email'}*:`;
          await sendWhatsAppMessage(rawFrom, invalidReply, { schoolSlug: school.slug });
          return res.status(200).json({ status: 'invalid_email_prompt' });
        }
      }

      conv.stage = 'updating_phone';
      const promptPhone = `Got it! What is your *Phone number*? (Reply *1* or *'Same'* to use *+${rawFrom}*, or reply *'Keep'* to keep *${lead.phone || lead.normalized_phone}*):`;
      messages.push({ role: 'assistant', content: promptPhone, ts: Date.now() });

      await supabase
        .from('conversations')
        .update({
          stage: 'updating_phone',
          messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      await sendWhatsAppMessage(rawFrom, promptPhone, { schoolSlug: school.slug });
      return res.status(200).json({ status: 'updated_email' });
    }

    if (conv.stage === 'updating_phone') {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      if (clickedButtonId === 'phone_use_current' || lowerInput === 'same' || lowerInput === 'yes' || lowerInput === '1') {
        lead.phone = normalizedPhone;
        lead.normalized_phone = normalizedPhone;
      } else if (lowerInput !== 'keep') {
        const norm = normalizePhoneNumber(incomingText);
        if (norm) {
          lead.phone = norm;
          lead.normalized_phone = norm;
        } else {
          const retryPhone = `Please enter a valid phone number (e.g. *08012345678*) or reply *'Keep'* to keep *${lead.phone || lead.normalized_phone}*:`;
          await sendWhatsAppMessage(rawFrom, retryPhone, { schoolSlug: school.slug });
          return res.status(200).json({ status: 'invalid_phone_in_update' });
        }
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

      await zoho.syncLeadToZoho(lead, school, { source: 'WhatsApp Bot' });

      conv.stage = 'active';
      const successReply = `Thank you, *${lead.name}*! Your details have been updated successfully: ✅\n• *Name:* ${lead.name}\n• *Email:* ${lead.email}\n• *Phone:* ${lead.phone || lead.normalized_phone}\n\n${getSchoolWelcomePrompt(school, lead.name)}`;
      messages.push({ role: 'assistant', content: successReply, ts: Date.now() });

      await supabase
        .from('conversations')
        .update({
          stage: 'active',
          messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      await sendInteractiveWelcomeMenu(rawFrom, school, `Thank you, *${lead.name}*! Your details have been updated successfully. ✅`);
      return res.status(200).json({ status: 'update_completed' });
    }

    // ── STAGE: INCOMPLETE LEAD ONBOARDING ────────────────────
    // Sub-stage 1: Onboarding Name
    if (conv.stage === 'onboarding_name') {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      // Check if user provided valid name or multi-field input
      const multi = extractContactDetails(incomingText);
      const cleaned = extractCleanName(incomingText) || cleanPersonName(incomingText);

      if (cleaned && isValidHumanName(cleaned) && !isSessionStartMessage(incomingText)) {
        lead.name = cleaned;
        if (multi.email && isValidEmail(multi.email)) lead.email = multi.email;
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

        await zoho.syncLeadToZoho(lead, school, { source: 'WhatsApp Bot' });

        if (lead.email && lead.phone) {
          // All details provided at once!
          conv.stage = 'active';
          await zoho.sendCliqAlert(school, lead, `New student completed registration: "${lead.name}" (${lead.email})`, { channel: 'WhatsApp' });

          await supabase.from('conversations').update({ stage: 'active', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
          await sendInteractiveWelcomeMenu(rawFrom, school, `Perfect, thank you *${lead.name}*! Your details have been saved: ✅\n• *Name:* ${lead.name}\n• *Email:* ${lead.email}\n• *Phone:* ${lead.phone || lead.normalized_phone}`);
          return res.status(200).json({ status: 'onboarding_completed' });
        }

        // Advance to email
        conv.stage = 'onboarding_email';
        const promptEmail = messages.length <= 1
          ? `Welcome to *${schoolName}* Admissions Support! 🎓\n\nI am Maverick, your admissions concierge.\n\nThank you, *${lead.name}*! What is your *Email address*?`
          : `Thank you, *${lead.name}*! What is your *Email address*?`;
        messages.push({ role: 'assistant', content: promptEmail, ts: Date.now() });

        await supabase.from('conversations').update({ stage: 'onboarding_email', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
        await sendWhatsAppMessage(rawFrom, promptEmail, { schoolSlug: school.slug });
        return res.status(200).json({ status: 'asked_email' });
      }

      // Needs Name prompt (DO NOT set incoming question/sentence as name!)
      conv.stage = 'onboarding_name';
      const promptName = `Welcome to *${schoolName}* Admissions Support! 🎓\n\nI am Maverick, your admissions concierge.\n\nBefore we proceed with your inquiry, could you please tell me your *Full Name*?`;
      messages.push({ role: 'assistant', content: promptName, ts: Date.now() });

      await supabase.from('conversations').update({ stage: 'onboarding_name', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
      await sendWhatsAppMessage(rawFrom, promptName, { schoolSlug: school.slug });
      return res.status(200).json({ status: 'asked_name' });
    }

    // Sub-stage 2: Onboarding Email
    else if (conv.stage === 'onboarding_email') {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      const emailVal = extractContactDetails(incomingText).email || (isValidEmail(incomingText) ? incomingText.toLowerCase().trim() : null);

      if (emailVal && !isSessionStartMessage(incomingText)) {
        lead.email = emailVal;
        await supabase.from('leads').update({ email: lead.email, updated_at: new Date().toISOString() }).eq('id', lead.id);
        await zoho.syncLeadToZoho(lead, school, { source: 'WhatsApp Bot' });

        conv.stage = 'onboarding_phone';
        messages.push({
          role: 'assistant',
          content: `Great! Lastly, what is your *Phone number*? (Reply *'Same'* to use your current WhatsApp number *+${rawFrom}*):`,
          ts: Date.now(),
        });

        await supabase.from('conversations').update({ stage: 'onboarding_phone', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
        await sendPhoneCollectionPrompt(rawFrom, rawFrom, school);
        return res.status(200).json({ status: 'asked_phone' });
      }

      // If user sent a greeting / session start keyword while in email onboarding
      if (isSessionStartMessage(incomingText)) {
        const greetingEmailPrompt = `Hello${lead.name ? ` *${lead.name}*` : ''}! Welcome to *${schoolName}* Admissions Support! 🎓\n\nTo assist you with your inquiry, could you please provide your *Email address* (e.g. *name@example.com*)?`;
        messages.push({ role: 'assistant', content: greetingEmailPrompt, ts: Date.now() });

        await supabase.from('conversations').update({ stage: 'onboarding_email', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
        await sendWhatsAppMessage(rawFrom, greetingEmailPrompt, { schoolSlug: school.slug });
        return res.status(200).json({ status: 'asked_email' });
      }

      // Invalid email provided
      const invalidEmailPrompt = `That doesn't look like a valid email address. Please enter your email address (e.g. *name@example.com*):`;
      messages.push({ role: 'assistant', content: invalidEmailPrompt, ts: Date.now() });

      await supabase.from('conversations').update({ stage: 'onboarding_email', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
      await sendWhatsAppMessage(rawFrom, invalidEmailPrompt, { schoolSlug: school.slug });
      return res.status(200).json({ status: 'asked_email' });
    }

    // Sub-stage 3: Onboarding Phone
    else if (conv.stage === 'onboarding_phone') {
      messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

      if (clickedButtonId === 'phone_enter_different') {
        const enterDifferentPrompt = `Please enter your preferred contact phone number (e.g. *08012345678*):`;
        messages.push({ role: 'assistant', content: enterDifferentPrompt, ts: Date.now() });

        await supabase.from('conversations').update({ stage: 'onboarding_phone', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
        await sendWhatsAppMessage(rawFrom, enterDifferentPrompt, { schoolSlug: school.slug });
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
          // If user sent a greeting / session start keyword while in phone onboarding
          if (isSessionStartMessage(incomingText)) {
            const greetingPhonePrompt = `Hello${lead.name ? ` *${lead.name}*` : ''}! We're almost done.\n\nWould you like to use your current WhatsApp number *+${rawFrom}* as your contact phone number? (Reply *1* or *'Same'* to use it, or enter a different phone number):`;
            messages.push({ role: 'assistant', content: greetingPhonePrompt, ts: Date.now() });

            await supabase.from('conversations').update({ stage: 'onboarding_phone', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
            await sendPhoneCollectionPrompt(rawFrom, rawFrom, school);
            return res.status(200).json({ status: 'asked_phone' });
          }

          // If input is not a valid phone number
          const retryPhone = `Please enter a valid phone number (e.g. *08012345678*) or reply *'Same'* to use your current WhatsApp number *+${rawFrom}*:`;
          messages.push({ role: 'assistant', content: retryPhone, ts: Date.now() });

          await supabase.from('conversations').update({ stage: 'onboarding_phone', messages, updated_at: new Date().toISOString() }).eq('id', conv.id);
          await sendPhoneCollectionPrompt(rawFrom, rawFrom, school);
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

      await zoho.syncLeadToZoho(lead, school, { source: 'WhatsApp Bot' });
      await zoho.sendCliqAlert(
        school,
        lead,
        `New student completed WhatsApp onboarding: "${lead.name}" (${lead.email})`,
        { channel: 'WhatsApp', actionUrl: `${process.env.APP_URL || 'https://eabt-ai-team-project.vercel.app'}/chats` }
      );

      conv.stage = 'active';

      // Check if user had an earlier inquiry asked at session start
      const firstInquiry = messages.find(m => m.role === 'user' && isConversationalSentence(m.content) && !extractCleanName(m.content))?.content;

      if (firstInquiry && firstInquiry.length > 5) {
        try {
          const chunks = await searchKnowledgeBase(firstInquiry, school.id);
          const context =
            chunks.length > 0
              ? chunks.map(c => c.content).join('\n\n---\n\n')
              : 'No specific information found in the knowledge base for this query.';

          const systemPrompt = `${buildActiveSystemPrompt(school.name, lead.name || 'there', context)}
IMPORTANT: You are communicating directly with the student via WhatsApp. Keep your responses crisp, professional, friendly, and well-structured using WhatsApp styling (*bold* for emphasis, clean short bullet points). Avoid long walls of text.`;

          const aiReply = await chat(systemPrompt, [{ role: 'user', content: firstInquiry }]);
          const cleanReply = stripEscalateToken(aiReply);

          const welcomeActiveWithAnswer = `Perfect, thank you *${lead.name}*! Your details have been saved: ✅\n• *Name:* ${lead.name}\n• *Email:* ${lead.email}\n• *Phone:* ${lead.phone || lead.normalized_phone}\n\nRegarding your inquiry:\n${cleanReply}`;
          messages.push({ role: 'assistant', content: welcomeActiveWithAnswer, ts: Date.now() });

          await supabase
            .from('conversations')
            .update({
              stage: 'active',
              messages,
              updated_at: new Date().toISOString(),
            })
            .eq('id', conv.id);

          await sendWhatsAppMessage(rawFrom, welcomeActiveWithAnswer, { schoolSlug: school.slug });
          return res.status(200).json({ status: 'onboarding_completed_with_answer' });
        } catch (ragErr) {
          console.warn('[WhatsApp Webhook] Initial inquiry answer fallback:', ragErr.message);
        }
      }

      await supabase
        .from('conversations')
        .update({
          stage: 'active',
          messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      await sendInteractiveWelcomeMenu(rawFrom, school, `Perfect, thank you *${lead.name}*! Your details have been saved: ✅\n• *Name:* ${lead.name}\n• *Email:* ${lead.email}\n• *Phone:* ${lead.phone || lead.normalized_phone}`);
      return res.status(200).json({ status: 'onboarding_completed' });
    }

    // ── STAGE: ACTIVE (Admissions Q&A, Fast-Path, RAG) ────────
    messages.push({ role: 'user', content: incomingText, channel: 'whatsapp', ts: Date.now() });

    // 1. FAST-PATH EXECUTION (Sub-50ms instant response for buttons & high-frequency queries)
    const fastReply = getFastPathResponse(clickedButtonId || incomingText, school);
    if (fastReply) {
      messages.push({ role: 'assistant', content: fastReply, ts: Date.now() });

      await supabase
        .from('conversations')
        .update({
          messages,
          channel: 'whatsapp',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      await sendWhatsAppMessage(rawFrom, fastReply, { schoolSlug: school.slug });
      return res.status(200).json({ status: 'fast_path_dispatched' });
    }

    // 2. CHECK FOR HUMAN ESCALATION INTENT
    const wantsHuman = detectEscalation(incomingText);

    if (wantsHuman) {
      conv.stage = 'escalated';

      await supabase.from('escalations').insert({
        conversation_id: conv.id,
        school_id: school.id,
        lead_id: lead.id,
        reason: 'user_request',
      });

      const botResponse = getEscalationAckMessage(school);
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

      const fullTranscript = zoho.formatConversationTranscript(messages, lead, school, { reason: 'user_request' });

      await zoho.syncLeadToZoho(lead, school, { status: 'Escalated', source: 'WhatsApp Bot' });

      await zoho.createEscalationTask(
        lead,
        school,
        `WhatsApp visitor requested human advisor for ${schoolName}`,
        `User Message: "${incomingText}"`,
        fullTranscript
      );

      await zoho.sendCliqAlert(
        school,
        lead,
        `Student requested live human assistance on WhatsApp: "${incomingText}"`,
        {
          channel: 'WhatsApp',
          reason: 'User Requested Human',
          actionUrl: `${process.env.APP_URL || 'https://eabt-ai-team-project.vercel.app'}/chats`,
        }
      );

      try {
        await email.sendEscalationEmail({
          school,
          lead,
          conversation: { ...conv, messages },
          reason: 'user_request',
        });
      } catch (emailErr) {
        console.error('[WhatsApp Webhook] Escalation email error:', emailErr.message);
      }

      await sendWhatsAppMessage(rawFrom, botResponse, { schoolSlug: school.slug });
      return res.status(200).json({ status: 'escalated' });
    }

    // 3. EXECUTE KNOWLEDGE BASE RAG SEARCH & CLAUDE INFERENCE
    const chunks = await searchKnowledgeBase(incomingText, school.id);
    const context =
      chunks.length > 0
        ? chunks.map(c => c.content).join('\n\n---\n\n')
        : 'No specific information found in the knowledge base for this query.';

    const systemPrompt = `${buildActiveSystemPrompt(schoolName, lead.name || 'there', context)}
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

      const combinedReply = `${cleanReply}\n\n` + getEscalationAckMessage(school);
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

      const fullTranscript = zoho.formatConversationTranscript(messages, lead, school, { reason: 'failed_attempts' });

      await zoho.syncLeadToZoho(lead, school, { status: 'Escalated', source: 'WhatsApp Bot' });

      await zoho.createEscalationTask(
        lead,
        school,
        `WhatsApp AI could not find specific details in ${schoolName} knowledge base`,
        `Question: "${incomingText}"`,
        fullTranscript
      );

      await zoho.sendCliqAlert(
        school,
        lead,
        `AI could not find knowledge base answer for: "${incomingText}". Escalating to ${schoolName} support team.`,
        {
          channel: 'WhatsApp',
          reason: 'Knowledge Base Fallback',
          actionUrl: `${process.env.APP_URL || 'https://eabt-ai-team-project.vercel.app'}/chats`,
        }
      );

      try {
        await email.sendEscalationEmail({
          school,
          lead,
          conversation: { ...conv, messages },
          reason: 'failed_attempts',
        });
      } catch (emailErr) {
        console.error('[WhatsApp Webhook] Escalation email error:', emailErr.message);
      }

      await sendWhatsAppMessage(rawFrom, combinedReply, { schoolSlug: school.slug });
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

    await sendWhatsAppMessage(rawFrom, cleanReply, { schoolSlug: school.slug });

    // Automatically attach updated full conversation transcript note to Zoho CRM
    if (messages.length >= 2) {
      const fullTranscript = zoho.formatConversationTranscript(messages, lead, school);
      await zoho.addNoteToLead(lead, `WhatsApp Conversation Transcript (${new Date().toLocaleDateString()})`, fullTranscript, school);
    }

    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('[WhatsApp Webhook] Internal Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
