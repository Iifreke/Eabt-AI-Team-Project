/**
 * Returns a consistent AI agent name per school and session.
 * The same session always gets the same name (deterministic via session hash).
 */

const SCHOOL_NAMES = {
  abu:        ['Teni', 'Emma', 'Tola'],
  babcock:    ['Bisola', 'Adebola', 'Janet'],
  backock:    ['Bisola', 'Adebola', 'Janet'], // typo alias
  uniabuja:   ['George', 'Amina', 'Chiamaka'],
  igbinedion: ['Ngozi', 'Hassana', 'Chinedu'],
  kenbridge:  ['Folashade', 'Abubakar', 'Emeka'],
};

const DEFAULT_NAMES = ['Teni', 'Emma', 'Tola', 'Bisola', 'George', 'Amina'];

function simpleHash(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * @param {string} schoolSlug - e.g. 'abu', 'babcock', 'uniabuja'
 * @param {string} sessionId  - conversation/session ID for consistent picking
 * @returns {string} agent first name
 */
export function getAgentName(schoolSlug = '', sessionId = '') {
  const slug = schoolSlug.toLowerCase().trim();
  const pool = SCHOOL_NAMES[slug] || DEFAULT_NAMES;
  return pool[simpleHash(sessionId || slug) % pool.length];
}
