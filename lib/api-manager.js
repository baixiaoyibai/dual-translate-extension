import { createTranslatorFromSettings, createTranslatorForTest } from './api-registry.js';
import { settingsManager } from './settings-manager.js';

class ApiManager {
  constructor() {
    this.translators = new Map();
    this.statusCache = {};
    // v1.1.0 perf: 缓存内置 LLM prompt，避免每次 reload 都 fetch config/llm-prompt.txt
    this._llmPromptCached = null;
  }

  async init() {
    await settingsManager.loadSettings();
    await settingsManager.resetApiQuotaIfNeeded();
    [this.statusCache, this.llmSystemPrompt, this.glossaryPromptSuffix] = await Promise.all([
      settingsManager.getApiStatus(),
      this._loadLlmPrompt(),
      this._loadGlossaryPromptSuffix()
    ]);
    this._buildTranslators();
  }

  async _loadLlmPrompt() {
    // v1.1.0 perf: 自定义 prompt 仍每次检查 storage（变更检测），但内置 prompt 仅首次 fetch 并缓存
    try {
      const custom = await chrome.storage.local.get('dual_translate_custom_llm_prompt');
      if (custom['dual_translate_custom_llm_prompt']) return custom['dual_translate_custom_llm_prompt'];
    } catch {}
    // 无自定义 prompt：复用缓存的内置 prompt，避免每次 reload 都 fetch config/llm-prompt.txt
    // v1.1.0 fix: 仅缓存非空值，空字符串表示 fetch 失败，下次 reload 时重试
    if (this._llmPromptCached) return this._llmPromptCached;
    try {
      const resp = await fetch(chrome.runtime.getURL('config/llm-prompt.txt'));
      if (resp.ok) { const t = await resp.text(); if (t && t.trim()) { this._llmPromptCached = t; return t; } }
    } catch {}
    this._llmPromptCached = '';
    return '';
  }

  async _loadGlossaryPromptSuffix() {
    try {
      const g = await settingsManager.getGlossary();
      if (!g || typeof g !== 'object') return '';
      const lines = [];
      for (const scopeEntries of Object.values(g)) {
        if (!Array.isArray(scopeEntries)) continue;
        for (const e of scopeEntries) {
          if (!e || !e.source) continue;
          if (e.preserve) lines.push(`保留原文: ${e.source}`);
          else if (e.target) lines.push(`${e.source} -> ${e.target}`);
        }
      }
      if (lines.length === 0) return '';
      return '\n\n## 用户自定义术语表（须严格遵守）\n' + lines.join('\n');
    } catch { return ''; }
  }

  _buildTranslators() {
    if (!settingsManager.settings?.api) return;
    this.translators.clear();
    const settings = settingsManager.settings;
    const fullPrompt = (this.llmSystemPrompt || '') + (this.glossaryPromptSuffix || '');
    const enabledApis = settings.api.enabledApis || {};
    const shared = { fullPrompt, glossaryHint: this.glossaryPromptSuffix };

    for (const apiName of settings.api.apiPriority) {
      if (!enabledApis[apiName]) continue;
      // 自定义供应商不需要 apiKeys 条目
      if (!settings.api.apiKeys?.[apiName] && !apiName.startsWith('custom_')) continue;

      const translator = createTranslatorFromSettings(apiName, settings, shared);
      if (translator) {
        this.translators.set(apiName, translator);
      }
    }
  }

  async reload() {
    await settingsManager.resetApiQuotaIfNeeded();
    [this.statusCache, this.llmSystemPrompt, this.glossaryPromptSuffix] = await Promise.all([
      settingsManager.getApiStatus(),
      this._loadLlmPrompt(),
      this._loadGlossaryPromptSuffix()
    ]);
    this._buildTranslators();
  }

  getOrderedTranslators() {
    const priority = settingsManager.settings?.api?.apiPriority || [];
    const ordered = [];
    for (const apiName of priority) {
      if (this.translators.has(apiName)) {
        ordered.push({ name: apiName, translator: this.translators.get(apiName) });
      }
    }
    return ordered;
  }

  _isApiUsable(apiName) {
    const status = this.statusCache[apiName];
    if (!status) return true;
    // v1.2.12 fix: P2-21 + X-1 — 配额重置时间已过则恢复可用
    if (status.status === 'quota_exceeded' && status.quotaResetAt && Date.now() >= status.quotaResetAt) {
      return true;
    }
    if (status.status === 'quota_exceeded') return false;
    if (status.status === 'auth_error') return false;
    // v1.2.12 fix: X-1 — rate_limited 状态检查 cooldownUntil，过期则自动恢复
    if (status.status === 'rate_limited') {
      if (!status.cooldownUntil || Date.now() >= status.cooldownUntil) return true;
      return false;
    }
    if (status.status === 'error' && status.consecutiveErrors >= 3) return false;
    return true;
  }

  async translate(texts, sourceLang, targetLang) {
    if (!texts || (Array.isArray(texts) && texts.length === 0)) return [];
    const textArray = Array.isArray(texts) ? texts : [texts];
    const ordered = this.getOrderedTranslators();
    if (ordered.length === 0) {
      throw new Error('NO_API_CONFIGURED');
    }

    // v1.1.0 perf: 并行预检查所有翻译源的自定义额度状态，避免循环内逐个 await 串行读存储
    const quotaReachedSet = new Set();
    // v1.1.0 fix: 单个 API 额度检查异常不应中断整个翻译，失败时视为未达限制
    await Promise.all(ordered.map(async ({ name }) => {
      try {
        if (await settingsManager.isApiQuotaReached(name)) {
          quotaReachedSet.add(name);
        }
      } catch (e) {
        console.warn(`[api-manager] quota check failed for ${name}:`, e.message);
      }
    }));

    let lastError = null;
    for (const { name, translator } of ordered) {
      if (!this._isApiUsable(name)) {
        continue;
      }
      // v1.0.8: 检查自定义月度额度限制（达到 97% 自动切换）
      if (quotaReachedSet.has(name)) {
        console.log(`[api-manager] ${name} 已达自定义额度限制 97%，切换到下一个翻译源`);
        continue;
      }
      try {
        const results = await this._translateWithTimeout(translator, textArray, sourceLang, targetLang, name);
        // v1.0.10 fix: 处理 null/undefined 文本，避免 t.length 抛异常
        const totalChars = textArray.reduce((sum, t) => sum + String(t == null ? '' : t).length, 0);
        await settingsManager.addDailyUsage(name, totalChars);
        if (this.statusCache[name]?.status !== 'available') {
          // v1.1.0 fix: 测试成功时重置错误计数，避免历史错误导致 API 在下次失败时立即不可用
          // v1.2.2 fix: BUG-3 清除旧 reason 字段，避免翻译成功后仍残留上次失败的错误描述
          // v1.2.12 fix: X-1 — 翻译成功时清除 rate_limited 的冷却标记
          const updatedStatus = await settingsManager.saveApiStatus(name, { status: 'available', consecutiveErrors: 0, reason: '', cooldownUntil: 0 }, this.statusCache[name] || {});
          this.statusCache[name] = updatedStatus[name] || { status: 'available' };
        } else {
          // v1.2.2 fix: BUG-5 status 已为 available 时跳过 saveApiStatus 以避免不必要的存储写入，
          // 但需检查并清除残留的 reason 字段（可能来自历史失败状态未被覆盖的情况）
          if (this.statusCache[name]?.reason) {
            const updatedStatus = await settingsManager.saveApiStatus(name, { reason: '' }, this.statusCache[name] || {});
            this.statusCache[name] = updatedStatus[name] || { status: 'available' };
          }
        }
        return results;
      } catch (error) {
        lastError = error;
        await this._handleApiError(name, error);
      }
    }

    if (!lastError) {
      throw new Error('所有翻译服务暂时不可用，请稍后手动重试');
    }
    throw lastError;
  }

  async _translateWithTimeout(translator, texts, sourceLang, targetLang, apiName) {
    const settings = settingsManager.settings;
    const timeout = ((settings.advanced.requestTimeout ?? 10) > 0 ? settings.advanced.requestTimeout : 10) * 1000;
    let lastError = null;
    // v1.2.3 fix: 使用 Number.isFinite 替代 ||，避免 retryCount=0 时被误判为默认值 1
    const maxRetries = Math.max(0, Number.isFinite(settings.advanced.retryCount) ? settings.advanced.retryCount : 1);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      try {
        const result = await translator.translate(texts, sourceLang, targetLang, controller.signal);
        clearTimeout(timeoutId);
        return result;
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error;
        const msg = (error && error.message) ? error.message : String(error);
        if (msg === 'QUOTA_EXCEEDED' || msg === 'RATE_LIMITED' || msg.startsWith('AUTH_ERROR')) {
          throw error;
        }
        if (attempt < maxRetries) {
          // The options UI stores this value in minutes.
          const baseInterval = (settings.advanced.retryInterval || 5) * 60 * 1000;
          await new Promise(resolve => setTimeout(resolve, baseInterval * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  async _handleApiError(apiName, error) {
    const msg = (error && error.message) ? error.message : String(error);
    let allStatus;
    // M18: 每次从 this.statusCache 读取最新值，不传入快照参数，避免并发竞态
    // v1.2.3 fix: 将内存中的 current 状态传入 saveApiStatus，消除 storage read-modify-write 竞态导致的计数丢失
    const current = this.statusCache[apiName] || {};
    if (msg === 'QUOTA_EXCEEDED') {
      // M19: 月度重置的 API（百度/火山）quotaResetAt 应为下个月1日而非次日午夜
      const isMonthly = ['baidu', 'baidu_llm', 'volcano'].includes(apiName);
      const quotaResetAt = isMonthly ? this._getNextMonthStart() : this._getNextMidnight();
      allStatus = await settingsManager.saveApiStatus(apiName, {
        status: 'quota_exceeded',
        reason: '额度耗尽',
        quotaResetAt
      }, current);
    } else if (msg.startsWith('AUTH_ERROR')) {
      // v1.0.10 fix: 兼容 "AUTH_ERROR: detail" 和 "AUTH_ERROR (detail)" 两种格式
      // 提取 detail 时去除前缀的冒号/空格/括号，避免 popup 显示双括号
      const detail = msg.length > 10
        ? msg.substring(10).replace(/^[\s:()]+/, '').replace(/[()]+$/, '').trim()
        : '';
      allStatus = await settingsManager.saveApiStatus(apiName, {
        status: 'auth_error',
        reason: detail || '密钥无效'
      }, current);
    } else if (msg === 'RATE_LIMITED') {
      // v1.2.12 fix: X-1 — 频率限制，60 秒冷却后自动恢复（不等日/月重置）
      const cooldownUntil = Date.now() + 60 * 1000;
      allStatus = await settingsManager.saveApiStatus(apiName, {
        status: 'rate_limited',
        reason: '频率限制（60s 冷却）',
        cooldownUntil,
        // 冷却结束后应恢复可用，清零错误计数
        consecutiveErrors: 0
      }, current);
    } else {
      const consecutiveErrors = (current.consecutiveErrors || 0) + 1;
      allStatus = await settingsManager.saveApiStatus(apiName, {
        status: 'error',
        reason: msg,
        consecutiveErrors
      }, current);
    }
    this.statusCache = { ...this.statusCache, ...allStatus };
  }

  _getNextMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime();
  }

  _getNextMonthStart() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    return next.getTime();
  }

  async testApi(apiName, apiConfig) {
    const translator = createTranslatorForTest(apiName, apiConfig, settingsManager.settings);

    if (!translator) {
      return { success: false, error: apiName.startsWith('custom_') ? '供应商配置未找到' : 'API 未配置或配置不完整' };
    }
    if (!translator.isConfigured()) {
      return { success: false, error: 'API 未配置或配置不完整' };
    }

    let raceTimer;
    try {
      // H9: 为 testApi 增加超时保护，避免测试请求无限挂起
      const timeout = (settingsManager.settings?.advanced?.requestTimeout || 10) * 1000;
      const controller = new AbortController();
      const timeoutPromise = new Promise((_, reject) => {
        raceTimer = setTimeout(() => { controller.abort(); reject(new Error('测试超时')); }, timeout);
      });
      await Promise.race([
        translator.translate(['Hello world'], 'en', 'zh', controller.signal),
        timeoutPromise
      ]);
      clearTimeout(raceTimer);
      // v1.0.5 hotfix: 测试成功时清掉 error 计数, 让 popup/options 立即显示"可用"
      // v1.1.0 fix: 测试成功时重置错误计数，避免历史错误导致 API 在下次失败时立即不可用
      // v1.2.2 fix: BUG-3 清除旧 reason 字段，避免测试成功后仍残留上次失败的错误描述
      const updatedStatus = await settingsManager.saveApiStatus(apiName, { status: 'available', consecutiveErrors: 0, reason: '' }, this.statusCache[apiName] || {});
      // v1.1.0 perf: 仅更新被测 API 的状态，避免全量 getApiStatus() 刷新
      this.statusCache[apiName] = updatedStatus[apiName] || { status: 'available' };
      return { success: true };
    } catch (error) {
      clearTimeout(raceTimer); // 确保清除
      try { await this._handleApiError(apiName, error); } catch (statusError) {
        console.warn('[api-manager] failed to persist test error status:', statusError);
      }
      return { success: false, error: error.message };
    }
  }

  getApiStatusSummary() {
    // v1.0.10: 返回已构建翻译器的 API + statusCache 中有缓存的 API
    // （覆盖测试后写入 status 但翻译器尚未重建的情况，如 volcano 测试成功后）
    // 不返回未配置且无缓存的 API，避免 popup 显示过多无关条目
    const priority = settingsManager.settings?.api?.apiPriority || [];
    const summary = {};
    for (const apiName of priority) {
      const isBuilt = this.translators.has(apiName);
      const cachedStatus = this.statusCache[apiName];
      // 跳过既未构建又无缓存的 API
      if (!isBuilt && !cachedStatus) continue;
      summary[apiName] = {
        status: cachedStatus?.status || (isBuilt ? 'available' : 'unconfigured'),
        reason: cachedStatus?.reason || '',
        updatedAt: cachedStatus?.updatedAt || 0
      };
    }
    return summary;
  }

  getConfiguredCount() {
    return this.translators.size;
  }

  getAvailableCount() {
    return this.getOrderedTranslators().filter(({ name }) => this._isApiUsable(name)).length;
  }
}

const apiManager = new ApiManager();
export { apiManager };
