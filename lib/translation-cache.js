const CACHE_KEY = 'dual_translate_text_cache';
const CACHE_TTL = 3 * 24 * 60 * 60 * 1000;
const REFRESH_THRESHOLD = 60 * 60 * 1000;
const MAX_ENTRIES = 10000;
// v1.1.0 perf: 字节大小上限（约 8MB）与批量淘汰数量（10%），降低全量排序频率
const MAX_SIZE_BYTES = 8 * 1024 * 1024;
const EVICT_BATCH = Math.max(1, Math.floor(MAX_ENTRIES * 0.1));

class TranslationCache {
  constructor() {
    this._mem = null;
    this._approxSizeBytes = 0;
    this._saveTimer = null;
    this._loadPromise = null;
    this._savePromise = null;
    // v1.1.0 perf: 记录最近一次落盘时间，供 flush() 最小间隔节流使用
    this._lastSaveTime = 0;
  }

  async _load() {
    if (this._mem) return this._mem;
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = (async () => {
      try {
        const result = await chrome.storage.local.get(CACHE_KEY);
        const raw = result[CACHE_KEY];
        this._mem = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        // 从存储恢复时一次性计算 sizeBytes（避免增量估算偏差累积）
        this._approxSizeBytes = 0;
        for (const k of Object.keys(this._mem)) {
          const entry = this._mem[k];
          if (entry && typeof entry.t === 'string') {
            this._approxSizeBytes += (entry.t.length * 2) + 60;
          }
        }
        return this._mem;
      } finally {
        this._loadPromise = null;
      }
    })();
    return this._loadPromise;
  }

  async _save() {
    if (this._savePromise) {
      // 已有保存操作进行中，等待完成后再次保存以确保最新数据落盘
      await this._savePromise;
    }
    this._savePromise = (async () => {
      try {
        await chrome.storage.local.set({ [CACHE_KEY]: this._mem });
        // v1.1.0 perf: 记录最近一次落盘时间，供 flush() 最小间隔节流判断
        this._lastSaveTime = Date.now();
      } finally {
        this._savePromise = null;
      }
    })();
    return this._savePromise;
  }

  _markDirty() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(async () => {
      this._saveTimer = null;
      try { await this._save(); } catch (e) { console.warn('[cache] auto save failed:', e); }
    }, 5000);
  }

  async flush(force = false) {
    // v1.1.0 perf: flush 也遵守最小间隔（2 秒），除非显式强制，避免被高频调用时绕过 debounce 频繁写入
    // _markDirty 已有 5 秒 debounce；此处在 flush 路径上再加一道节流，保护落盘频率
    const MIN_FLUSH_INTERVAL = 2000;
    if (this._saveTimer) {
      // 有待执行的 debounce timer
      if (!force && this._lastSaveTime && (Date.now() - this._lastSaveTime) < MIN_FLUSH_INTERVAL) {
        // 距上次落盘不足 2 秒：保留 timer，让 debounce 稍后再写，避免频繁写入
        return;
      }
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      await this._save();
    } else if (this._savePromise) {
      // 没有待执行的 timer，但有正在进行的保存操作，等待其完成
      await this._savePromise;
    } else if (force) {
      // 无 timer 但显式强制：立即落盘
      await this._save();
    }
  }

  _norm(text) {
    return String(text == null ? '' : text).trim().replace(/\s+/g, ' ');
  }

  _key(sourceLang, targetLang, norm) {
    // v1.2.12 fix: P1-4 — 缓存键加入 targetLang，避免切换目标语言时返回错误的旧翻译
    return sourceLang + '\u0001' + (targetLang || 'zh') + '\u0001' + norm;
  }

  async lookup(texts, sourceLang, targetLang) {
    const cache = await this._load();
    const now = Date.now();
    const hits = new Map();
    const misses = [];
    let dirty = false;
    for (const text of texts) {
      const norm = this._norm(text);
      // v1.1.0 perf: 保存已归一化文本，避免去重循环里再次调用 _norm（消除重复归一化）
      if (!norm) { misses.push({ text, norm }); continue; }
      const key = this._key(sourceLang, targetLang, norm);
      const entry = cache[key];
      // TTL 使用创建时间 c（向后兼容旧数据的 a）
      const created = entry ? (entry.c || entry.a) : 0;
      if (entry && typeof entry.t === 'string' && (now - created < CACHE_TTL)) {
        hits.set(norm, entry.t);
        // a 用于 LRU 最近访问时间，仅在超过刷新阈值时更新
        if (now - (entry.a || created) > REFRESH_THRESHOLD) {
          entry.a = now;
          dirty = true;
        }
      } else {
        misses.push({ text, norm });
        if (entry) {
          if (typeof entry.t === 'string') {
            this._approxSizeBytes = Math.max(0, this._approxSizeBytes - (entry.t.length * 2) - 60);
          }
          delete cache[key];
          dirty = true;
        }
      }
    }
    if (dirty) this._markDirty();
    // 去重 misses（复用首轮已算好的 norm，无需再次 _norm）
    const uniqueMisses = [];
    const seenNorms = new Set();
    for (const m of misses) {
      if (!seenNorms.has(m.norm)) {
        seenNorms.add(m.norm);
        uniqueMisses.push(m.text);
      }
    }
    return { hits, misses: uniqueMisses };
  }

  async store(results, sourceLang, targetLang) {
    if (!results || results.length === 0) return;
    const cache = await this._load();
    const now = Date.now();
    for (const r of results) {
      if (!r || r.original == null) continue;
      if (typeof r.translation !== 'string' || !r.translation) continue;
      const norm = this._norm(r.original);
      if (!norm) continue;
      // v1.2.12 fix: P1-4 — 缓存键加入 targetLang
      const k = this._key(sourceLang, targetLang, norm);
      const prev = cache[k];
      // 增量更新 sizeBytes：减去旧的，加上新的（粗略估算：UTF-16 字节 ≈ 2×char 长度 + 键与元数据）
      if (prev && typeof prev.t === 'string') {
        this._approxSizeBytes -= (prev.t.length * 2) + 60;
      }
      cache[k] = { t: r.translation, c: now, a: now };
      this._approxSizeBytes += (r.translation.length * 2) + 60;
    }
    const keys = Object.keys(cache);
    // v1.1.0 perf: 条目数超限 或 字节大小超 8MB 时触发批量淘汰
    // 一次性删除最老的 EVICT_BATCH（10% = 1000 条），降低全量排序频率；
    // 删除一批后若仍超字节上限则继续删，直到低于 8MB
    if (keys.length > MAX_ENTRIES || this._approxSizeBytes > MAX_SIZE_BYTES) {
      const sorted = keys
        .map(k => {
          const entry = cache[k];
          // LRU 排序使用访问时间 a，兼容旧数据的创建时间 c
          const sortTime = entry ? (entry.a || entry.c || 0) : Infinity;
          return { k, a: sortTime };
        })
        .sort((a, b) => a.a - b.a);
      // 至少删除 EVICT_BATCH 条；若条目数远超上限则删到 MAX_ENTRIES 以下
      const toDelete = Math.max(EVICT_BATCH, keys.length - MAX_ENTRIES);
      let deleted = 0;
      for (let i = 0; i < sorted.length && (deleted < toDelete || this._approxSizeBytes > MAX_SIZE_BYTES); i++) {
        const key = sorted[i].k;
        const entry = cache[key];
        if (entry && typeof entry.t === 'string') {
          this._approxSizeBytes -= (entry.t.length * 2) + 60;
          delete cache[key];
        } else if (entry) {
          delete cache[key];
        }
        deleted++;
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
      const entry = cache[key];
      // 清理损坏条目（无 t 字段或时间戳无效）和过期条目
      if (!entry || typeof entry.t !== 'string') {
        delete cache[key];
        changed = true;
        continue;
      }
      const created = entry.c || entry.a || 0;
      if (created === 0 || now - created >= CACHE_TTL) {
        this._approxSizeBytes = Math.max(0, this._approxSizeBytes - (entry.t.length * 2) - 60);
        delete cache[key];
        changed = true;
      }
    }
    if (changed) await this._save();
  }

  async clear() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    if (this._savePromise) { try { await this._savePromise; } catch {} }
    this._mem = {};
    this._approxSizeBytes = 0;
    await chrome.storage.local.remove(CACHE_KEY);
  }

  async getStats() {
    const cache = await this._load();
    const now = Date.now();
    let active = 0, expired = 0;
    for (const key of Object.keys(cache)) {
      const entry = cache[key];
      if (!entry || typeof entry.t !== 'string') { expired++; continue; }
      const created = entry.c || entry.a || 0;
      if (created > 0 && now - created < CACHE_TTL) active++;
      else expired++;
    }
    return { active, expired, total: active + expired, sizeKB: Math.max(0, Math.round(this._approxSizeBytes / 1024)) };
  }
}

const translationCache = new TranslationCache();
export { translationCache };
