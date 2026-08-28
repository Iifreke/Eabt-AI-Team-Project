/**
 * Lead Quality & Intent Scoring Engine
 * Computes engagement tier and intent tags to help admissions officers prioritize prospective students.
 */

const HIGH_INTENT_KEYWORDS = [
  /\b(?:appl(?:y|ying|ication)|register|registration|admissions?\s+form|screening|admitted)\b/i,
  /\b(?:tuition|fees?|cost|payment|instalments?|bank|account|pay|paystack)\b/i,
  /\b(?:how\s+to\s+join|enroll|enrolment|start\s+application|portal|apply\.abudlc\.edu\.ng|codel\.babcock\.edu\.ng)\b/i,
];

const MEDIUM_INTENT_KEYWORDS = [
  /\b(?:nursing|bnsc|computer\s+science|accounting|economics|mass\s+comm|business\s+admin|public\s+health|mph|public\s+admin|mpa|mim|mlcj|miad|mdrm|blis|sociology|political\s+science|international\s+studies)\b/i,
  /\b(?:conversion|postgraduate|undergraduate|masters?|msc|mba|phd|pgd|pgde|pgdm|degree|direct\s+entry|transfer)\b/i,
  /\b(?:requirements?|waec|neco|jamb|duration|curriculum|syllabus|credits?|exam\s+centers?|proctored)\b/i,
];

/**
 * Calculates a lead's intent score, quality tier, and descriptive tags.
 *
 * @param {Object} lead - Lead record (name, email, phone)
 * @param {Array<Object>} [messages=[]] - User and bot conversation messages
 * @returns {{ score: number, tier: 'HOT'|'WARM'|'COLD', label: string, tags: string[] }}
 */
export function calculateLeadScore(lead, messages = []) {
  if (!lead) {
    return { score: 0, tier: 'COLD', label: '❄️ Cold', tags: ['Unqualified'] };
  }

  let score = 0;
  const tags = new Set();

  // 1. Profile Completeness (Max 45 points)
  if (lead.name && lead.name.length >= 2) {
    score += 15;
  }
  if (lead.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    score += 15;
  }
  if (lead.phone || lead.normalized_phone) {
    score += 15;
  }

  // 2. Interaction Depth (Max 15 points)
  const userMessages = (messages || []).filter(m => m.role === 'user');
  if (userMessages.length >= 4) {
    score += 15;
    tags.add('Engaged User');
  } else if (userMessages.length >= 2) {
    score += 10;
  } else if (userMessages.length === 1) {
    score += 5;
  }

  // 3. Conversational Intent Keyword Analysis (Max 40 points)
  const allUserText = userMessages.map(m => m.content || '').join(' ');

  let hasHighIntent = false;
  for (const pattern of HIGH_INTENT_KEYWORDS) {
    if (pattern.test(allUserText)) {
      score += 20;
      hasHighIntent = true;
      if (/fee|tuition|cost|payment|instalment|paystack/i.test(allUserText)) tags.add('Fee Inquirer');
      if (/appl|register|form|portal/i.test(allUserText)) tags.add('Ready to Apply');
      if (/screening/i.test(allUserText)) tags.add('Screening Inquirer');
      break;
    }
  }

  let hasMediumIntent = false;
  for (const pattern of MEDIUM_INTENT_KEYWORDS) {
    if (pattern.test(allUserText)) {
      score += 15;
      hasMediumIntent = true;
      if (/conversion|direct\s+entry/i.test(allUserText)) tags.add('Conversion Prospect');
      if (/nursing|bnsc/i.test(allUserText)) tags.add('Nursing Inquirer');
      if (/mba/i.test(allUserText)) tags.add('MBA Prospect');
      if (/postgraduate|masters|msc|mph|mpa|pgde|pgdm/i.test(allUserText)) tags.add('Postgraduate');
      if (/transfer/i.test(allUserText)) tags.add('Transfer Applicant');
      if (/requirements|waec|jamb/i.test(allUserText)) tags.add('Checking Requirements');
      break;
    }
  }

  if (lead.zoho_contact_id) {
    score += 5;
    tags.add('Zoho Synced');
  }

  // Bound score between 0 and 100
  const finalScore = Math.min(100, Math.max(0, score));

  let tier = 'COLD';
  let label = '❄️ Cold';

  if (finalScore >= 65 || (hasHighIntent && score >= 50)) {
    tier = 'HOT';
    label = '🔥 Hot';
  } else if (finalScore >= 35 || hasMediumIntent) {
    tier = 'WARM';
    label = '⚡ Warm';
  }

  if (tags.size === 0) {
    tags.add(tier === 'HOT' ? 'High Priority' : tier === 'WARM' ? 'General Prospect' : 'New Visitor');
  }

  return {
    score: finalScore,
    tier,
    label,
    tags: Array.from(tags).slice(0, 3),
  };
}
