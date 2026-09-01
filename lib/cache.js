/**
 * cache — tiny in-memory TTL cache.
 * Keyed by string; entries expire after `ttlMs`.
 * No eviction beyond expiry; cap size to avoid unbounded growth.
 */
class TtlCache {
  constructor({ ttlMs = 30000, max = 500 } = {}) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.store = new Map();
  }

  get(key) {
    const rec = this.store.get(key);
    if (!rec) return undefined;
    if (Date.now() > rec.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Touch on read to keep hot entries alive (LRU-ish)
    this.store.delete(key);
    this.store.set(key, rec);
    return rec.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.store.size >= this.max) {
      // Evict oldest (first inserted) — Map preserves insertion order
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

// Shared caches
const searchCache = new TtlCache({ ttlMs: parseInt(process.env.CACHE_TTL_MS || '45000', 10), max: 200 });
const homeCache = new TtlCache({ ttlMs: parseInt(process.env.HOME_CACHE_TTL_MS || '20000', 10), max: 10 });

module.exports = { TtlCache, searchCache, homeCache };