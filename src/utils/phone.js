/**
 * Utility functions for phone number parsing, normalization (E.164),
 * and WhatsApp formatting.
 */

/**
 * Normalizes phone numbers to E.164 international format.
 * Specifically handles Nigerian local prefixes (070, 080, 081, 090, 091, etc.)
 * as well as raw international digits.
 *
 * @param {string} phone - Raw input phone number string
 * @returns {string|null} - Normalized E.164 phone string (e.g. "+2348031234567") or null if invalid
 */
export function normalizePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return null;

  // Strip all non-digit characters except leading +
  let cleaned = phone.trim().replace(/[^\d+]/g, '');

  if (!cleaned) return null;

  // If starts with +, strip + for digit processing
  const hasPlus = cleaned.startsWith('+');
  let digits = cleaned.replace(/^\+/, '');

  // Handle Nigerian 11-digit local numbers starting with 0 (e.g. 08031234567)
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+234${digits.slice(1)}`;
  }

  // Handle Nigerian 10-digit numbers without leading 0 (e.g. 8031234567)
  if (digits.length === 10 && (digits.startsWith('7') || digits.startsWith('8') || digits.startsWith('9'))) {
    return `+234${digits}`;
  }

  // Handle numbers that start with 234 without + (e.g. 2348031234567)
  if (digits.startsWith('234') && digits.length >= 12 && digits.length <= 14) {
    return `+${digits}`;
  }

  // If already had a + and is between 8 and 15 digits
  if (hasPlus && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  // If generic international number (length 10-15)
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  // Fallback: return formatted if has at least 7 digits
  if (digits.length >= 7) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Formats a normalized E.164 phone number for the Meta WhatsApp Cloud API.
 * Meta expects digits only with country code, without the leading '+'.
 *
 * @param {string} phone
 * @returns {string|null} - Digits only string (e.g. "2348031234567")
 */
export function formatWhatsAppRecipient(phone) {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return null;
  return normalized.replace(/^\+/, '');
}
