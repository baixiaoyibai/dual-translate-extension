const CACHE_KEY = 'dual_translate_text_cache';
const MAX_ENTRIES = 5000;
const CACHE_TTL = 3 * 24 * 60 * 60 * 1000;

class TranslationCache {
  constructor() {
    this.entries = null;
    this.pending = Promise.resolve();
    this.generation = 0;
    this.saveTimer = null;
  }

  // Serialize changes so a slow save cannot restore a cleared cache.
  _run(operation) {
    const next = this.pending.then(async () => {
      if (!this.entries) {
        const stored = await chrome.storage.session.get(CACHE_KEY);
        this.entries = new Map(stored[CACHE_KEY] || []);
      }
      return operation(this.entries);
    });
    this.pending = next.catch(() => {});
    return next;
  }

  _key(domain, source, target, norm) {
    return JSON.stringify([domain, source, target, norm]);
  }

  lookup(texts, source, target, domain) {
    return this._run(entries => {
      const hits = new Map();
      const missing = new Map();
      for (const text of texts) {
        const norm = text.trim().replace(/\s+/g, ' ');
        const entry = entries.get(this._key(domain, source, target, norm));
        if (entry && Date.now() - entry.created < CACHE_TTL) hits.set(norm, entry.translation);
        else if (!missing.has(norm)) missing.set(norm, text);
      }
      return { hits, misses: [...missing.values()] };
    });
  }

  store(results, source, target, domain, generation) {
    return this._run(async entries => {
      if (generation !== this.generation) return;
      const now = Date.now();
      for (const { original, translation } of results) {
        if (!original || !translation) continue;
        const norm = original.trim().replace(/\s+/g, ' ');
        const key = this._key(domain, source, target, norm);
        entries.delete(key);
        entries.set(key, { translation, created: now });
      }
      // Bound memory immediately; coalesce session storage writes across batches.
      this._trim(entries);
      if (!this.saveTimer) this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this._run(current => this._persist(current)).catch(() => {});
      }, 1000);
    });
  }

  _size(entries) {
    let total = 0;
    for (const [key, entry] of entries) total += (key.length + entry.translation.length) * 2 + 256;
    return total;
  }

  _trim(entries) {
    // Leave room for the browser's accounting overhead and other session keys.
    const budget = chrome.storage.session.QUOTA_BYTES / 2;
    let bytes = this._size(entries);
    for (const [key, entry] of entries) {
      if (entries.size <= MAX_ENTRIES && bytes <= budget) break;
      entries.delete(key);
      bytes -= (key.length + entry.translation.length) * 2 + 256;
    }
  }

  async _persist(entries) {
    if (entries.size) await chrome.storage.session.set({ [CACHE_KEY]: [...entries] });
    else await chrome.storage.session.remove(CACHE_KEY);
  }

  sweep() {
    return this._run(async entries => {
      const before = entries.size;
      const now = Date.now();
      for (const [key, entry] of entries) {
        if (now - entry.created >= CACHE_TTL) entries.delete(key);
      }
      if (entries.size !== before) await this._persist(entries);
    });
  }

  clear() {
    this.generation++;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    return this._run(async entries => {
      entries.clear();
      await chrome.storage.session.remove(CACHE_KEY);
    });
  }

  getStats() {
    return this._run(entries => {
      const now = Date.now();
      let active = 0;
      for (const entry of entries.values()) if (now - entry.created < CACHE_TTL) active++;
      return {
        active, expired: entries.size - active, total: entries.size,
        sizeKB: Math.round(this._size(entries) / 1024)
      };
    });
  }
}

const translationCache = new TranslationCache();
export { translationCache };
