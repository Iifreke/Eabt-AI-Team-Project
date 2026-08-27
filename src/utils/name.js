/**
 * Human Name Extraction and Validation Engine
 * Ensures visitor inquiries, greetings, and complaints are never erroneously treated as person names.
 */

// Regex patterns with word boundaries for sentence/inquiry words
const SENTENCE_KEYWORD_PATTERNS = [
  // Greetings & Conversational Starts
  /\b(?:hello|hey|hi|good\s+(?:morning|afternoon|evening|day)|greetings)\b/i,
  /\b(?:sirma|sir|madam)\b/i,
  // Common sentence phrases & inquiries
  /\b(?:enquir(?:y|ies|e)|inquir(?:y|ies|e))\b/i,
  /\b(?:want\s+to|like\s+to|need\s+to|trying\s+to|having|wish\s+to)\b/i,
  /\b(?:help|assist|support\s+team|support)\b/i,
  /\b(?:how\s+(?:much|can|do|is)|what\s+is|where\s+is|when\s+is|can\s+i|could\s+i)\b/i,
  /\b(?:please|pls|plz|kindly|thank\s+you|thanks)\b/i,
  // Academic & admission query terms
  /\b(?:admission|admissions|jamb|dlc|codel|babcock|abu|postgraduate|undergraduate)\b/i,
  /\b(?:nursing|conversion|tuition|fees?|portal|slips?|exams?|quiz(?:zes)?|courses?|programmes?|programs?)\b/i,
  /\b(?:deferment|regularization|transcripts?|applications?|apply|register|registration|screening)\b/i,
  // Issues & complaints
  /\b(?:missed|issues?|challenges?|problems?|unable|not\s+showing|not\s+working|complains?|complaints?)\b/i,
  /\b(?:writing\s+to|waiting\s+for|feedback|responses?|because\s+of)\b/i,
  // Placeholder names
  /\b(?:whatsapp\s+inquirer|whatsapp\s+user|prospective\s+student|unknown\s+visitor|students?|users?|someone|anonymous|null|undefined|none)\b/i,
];

/**
 * Checks if a string contains non-name conversational content.
 */
export function isConversationalSentence(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.trim();

  // If text contains question mark, exclamation, or multiple lines
  if (/[?!]/.test(lower)) return true;
  if (lower.split(/\n+/).length > 1) return true;

  // If text has 5 or more words, it's almost certainly a full sentence/question
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length >= 5) return true;

  // Check against sentence/inquiry patterns
  for (const pattern of SENTENCE_KEYWORD_PATTERNS) {
    if (pattern.test(lower)) return true;
  }

  return false;
}

/**
 * Validates whether a string is a clean, acceptable human name.
 */
export function isValidHumanName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();

  // Length check
  if (trimmed.length < 2 || trimmed.length > 35) return false;

  // Must only contain letters, spaces, hyphens, and apostrophes
  if (!/^[a-zA-ZÀ-ÿ]+(?:[' -][a-zA-ZÀ-ÿ]+)*$/.test(trimmed)) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  // Human names are typically 1 to 4 words
  if (words.length < 1 || words.length > 4) return false;

  // Check against disallowed keywords
  for (const pattern of SENTENCE_KEYWORD_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  return true;
}

/**
 * Formats a name with Title Case.
 */
export function formatTitleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Strips common prefixes and cleans a raw string intended to be a person name.
 */
export function cleanPersonName(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let cleaned = raw
    .trim()
    // Remove greetings prefix
    .replace(/^(?:good\s+(?:morning|afternoon|evening|day)[,.\s!]*|hello[,.\s!]*|hi[,.\s!]*|hey[,.\s!]*)/i, '')
    // Remove "my name is", "i am", "i'm", "im", "this is", "call me", "name:"
    .replace(/^(?:my\s+name\s+is|i\s+am|i'm|im|this\s+is|call\s+me|name\s*[:=-]|it's|it\s+is)\s+/i, '')
    // Remove titles like Mr., Mrs., Dr., Prof., etc.
    .replace(/^(?:mr|mrs|ms|miss|dr|prof|pst|pastor|engr|arc|barr)\.?\s+/i, '')
    // Remove non-name characters
    .replace(/[^a-zA-ZÀ-ÿ\s'-]/g, '')
    .trim();

  if (!isValidHumanName(cleaned)) {
    return '';
  }

  return formatTitleCase(cleaned);
}

/**
 * Extracts a valid human name from an introductory message if present.
 * e.g. "Good day, my name is Excel Agbonifo, I want to ask..." -> "Excel Agbonifo"
 * e.g. "Good evening Im Olajumoke pls i want to make enquiry..." -> "Olajumoke"
 */
export function extractCleanName(text) {
  if (!text || typeof text !== 'string') return null;

  // Patterns for intro statements
  const introPatterns = [
    /(?:my\s+name\s+is|i\s+am|i'm|\bim\b|this\s+is|call\s+me|name\s*[:=-])\s+([^,.\n!?;]+)/i,
    /^(?:mr|mrs|ms|miss|dr|prof)\.?\s+([^,.\n!?;]+)/i,
  ];

  for (const pattern of introPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let rawCandidate = match[1].trim();
      // Cut off trailing conversational clauses like "pls", "please", "and I", "who", "from"
      rawCandidate = rawCandidate.replace(/\s+(?:pls|please|plz|and|who|from|i\s+want|i\s+would|i\s+am|i'm|i\s+need).*/i, '');
      
      const words = rawCandidate.split(/\s+/).filter(Boolean).slice(0, 3);
      const candidateStr = words.join(' ');
      const cleaned = cleanPersonName(candidateStr);
      if (cleaned && isValidHumanName(cleaned)) {
        return cleaned;
      }
    }
  }

  // If the entire text itself is a clean name without sentence patterns
  if (!isConversationalSentence(text)) {
    const fullCleaned = cleanPersonName(text);
    if (fullCleaned && isValidHumanName(fullCleaned)) {
      return fullCleaned;
    }
  }

  return null;
}
