/**
 * High-Performance In-Memory LRU Cache with TTL
 * Ensures sub-millisecond retrieval of repeated embeddings, RAG queries, and fast responses.
 */

export class MemoryCache {
  /**
   * @param {number} [maxSize=1000] - Maximum number of cached items
   * @param {number} [defaultTtlMs=6 * 60 * 60 * 1000] - Default TTL in ms (6 hours)
   */
  constructor(maxSize = 1000, defaultTtlMs = 6 * 60 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
    this.cache = new Map();
  }

  /**
   * Generates a sanitized lookup key.
   * @param {string} rawKey
   */
  normalizeKey(rawKey) {
    if (!rawKey) return '';
    return String(rawKey).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Retrieves a cached value if present and not expired.
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const normKey = this.normalizeKey(key);
    const item = this.cache.get(normKey);

    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(normKey);
      return null;
    }

    // Refresh LRU position (delete and re-insert)
    this.cache.delete(normKey);
    this.cache.set(normKey, item);

    return item.value;
  }

  /**
   * Sets a value in the cache with an optional TTL.
   * @param {string} key
   * @param {any} value
   * @param {number} [ttlMs]
   */
  set(key, value, ttlMs) {
    const normKey = this.normalizeKey(key);
    const ttl = ttlMs || this.defaultTtlMs;
    const expiresAt = Date.now() + ttl;

    // Evict oldest if exceeding maxSize
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(normKey, { value, expiresAt });
  }

  /**
   * Checks if a key exists and is valid in cache.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Clears the entire cache.
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Returns current cache size.
   */
  get size() {
    return this.cache.size;
  }
}

// Global Singleton Cache Instances
export const embeddingCache = new MemoryCache(2000, 12 * 60 * 60 * 1000); // 12h for embeddings
export const ragQueryCache = new MemoryCache(1000, 4 * 60 * 60 * 1000);    // 4h for RAG context
export const fastResponseCache = new MemoryCache(500, 2 * 60 * 60 * 1000);  // 2h for FAQ replies
