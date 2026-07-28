const CACHE_KEY = 'dual_translate_text_cache';
const CACHE_TTL = 3 * 24 * 60 * 60 * 1000;
const REFRESH_THRESHOLD = 60 * 60 * 1000;
const MAX_ENTRIES = 10000;

class TranslationCache {
  constructor() {
    this._mem = null;
    this._approxSizeBytes = 0;
    this._saveTimer = null;
  }

  async _load() {
    if (this._mem) return this._mem;
    const result = await chrome.storage.local.get(CACHE_KEY);
    this._mem = result[CACHE_KEY] || {};
    // 从存储恢复时一次性计算 sizeBytes（避免增量估算偏差累积）
    this._approxSizeBytes = 0;
    for (const k of Object.keys(this._mem)) {
      const entry = this._mem[k];
      if (entry && typeof entry.t === 'string') {
        this._approxSizeBytes += (entry.t.length * 2) + 60;
      }
    }
    return this._mem;
  }

  async _save() {
    await chrome.storage.local.set({ [CACHE_KEY]: this._mem });
  }

  _markDirty() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(async () => {
      this._saveTimer = null;
      await this._save();
    }, 5000);
  }

  async flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      await this._save();
    }
  }

  _norm(text) {
    return String(text == null ? '' : text).trim().replace(/\s+/g, ' ');
  }

  _key(sourceLang, norm) {
    return sourceLang + '\u0001' + norm;
  }

  async lookup(texts, sourceLang) {
    const cache = await this._load();
    const now = Date.now();
    const hits = new Map();
    const misses = [];
    let dirty = false;
    for (const text of texts) {
      const norm = this._norm(text);
      if (!norm) { misses.push(text); continue; }
      const key = this._key(sourceLang, norm);
      const entry = cache[key];
      if (entry && (now - entry.a < CACHE_TTL)) {
        hits.set(norm, entry.t);
        if (now - entry.a > REFRESH_THRESHOLD) {
          entry.a = now;
          dirty = true;
        }
      } else {
        misses.push(text);
        if (entry) { delete cache[key]; dirty = true; }
      }
    }
    if (dirty) this._markDirty();
    return { hits, misses };
  }

  async store(results, sourceLang) {
    if (!results || results.length === 0) return;
    const cache = await this._load();
    const now = Date.now();
    for (const r of results) {
      if (!r || r.original == null) continue;
      if (typeof r.translation !== 'string' || !r.translation) continue;
      const norm = this._norm(r.original);
      if (!norm) continue;
      const k = this._key(sourceLang, norm);
      const prev = cache[k];
      // 增量更新 sizeBytes：减去旧的，加上新的（粗略估算：UTF-16 字节 ≈ 2×char 长度 + 键与元数据）
      if (prev) {
        this._approxSizeBytes -= (prev.t.length * 2) + 60;
      }
      cache[k] = { t: r.translation, a: now };
      this._approxSizeBytes += (r.translation.length * 2) + 60;
    }
    const keys = Object.keys(cache);
    if (keys.length > MAX_ENTRIES) {
      // v1.0.6 perf: 一次性按时间排序后批量删除，O(n log n) 替代 O(n²) 逐条查找最老条目
      const toDelete = keys.length - MAX_ENTRIES;
      const sorted = keys
        .map(k => ({ k, a: cache[k] ? cache[k].a : Infinity }))
        .sort((a, b) => a.a - b.a);
      for (let i = 0; i < toDelete; i++) {
        const key = sorted[i].k;
        if (cache[key]) {
          this._approxSizeBytes -= (cache[key].t.length * 2) + 60;
          delete cache[key];
        }
      }
    }
    this._markDirty();
  }

  async sweep() {
    await this.flush();
    const cache = await this._load();
    const now = Date.now();
    let changed = false;
    for (const key of Object.keys(cache)) {
      if (now - cache[key].a >= CACHE_TTL) { delete cache[key]; changed = true; }
    }
    if (changed) await this._save();
  }

  async clear() {
    this._mem = {};
    await chrome.storage.local.remove(CACHE_KEY);
  }

  async getStats() {
    const cache = await this._load();
    const now = Date.now();
    let active = 0, expired = 0;
    for (const key of Object.keys(cache)) {
      if (now - cache[key].a < CACHE_TTL) active++;
      else expired++;
    }
    return { active, expired, total: active + expired, sizeKB: Math.round(this._approxSizeBytes / 1024) };
  }
}

const translationCache = new TranslationCache();
export { translationCache };
