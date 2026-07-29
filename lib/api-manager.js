import { createTranslatorFromSettings, createTranslatorForTest } from './api-registry.js';
import { settingsManager } from './settings-manager.js';

class ApiManager {
  constructor() {
    this.translators = new Map();
    this.statusCache = {};
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
    try {
      const custom = await chrome.storage.local.get('dual_translate_custom_llm_prompt');
      if (custom['dual_translate_custom_llm_prompt']) return custom['dual_translate_custom_llm_prompt'];
    } catch {}
    try {
      const resp = await fetch(chrome.runtime.getURL('config/llm-prompt.txt'));
      if (resp.ok) { const t = await resp.text(); if (t && t.trim()) return t; }
    } catch {}
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
    const settings = settingsManager.settings;
    const ordered = [];
    for (const apiName of settings.api.apiPriority) {
      if (this.translators.has(apiName)) {
        ordered.push({ name: apiName, translator: this.translators.get(apiName) });
      }
    }
    return ordered;
  }

  _isApiUsable(apiName) {
    const status = this.statusCache[apiName];
    if (!status) return true;
    if (status.status === 'quota_exceeded') return false;
    if (status.status === 'auth_error') return false;
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

    let lastError = null;
    for (const { name, translator } of ordered) {
      if (!this._isApiUsable(name)) {
        continue;
      }
      // v1.0.8: 检查自定义月度额度限制（达到 97% 自动切换）
      if (await settingsManager.isApiQuotaReached(name)) {
        console.log(`[api-manager] ${name} 已达自定义额度限制 97%，切换到下一个翻译源`);
        continue;
      }
      try {
        const results = await this._translateWithTimeout(translator, textArray, sourceLang, targetLang, name);
        // v1.0.10 fix: 处理 null/undefined 文本，避免 t.length 抛异常
        const totalChars = textArray.reduce((sum, t) => sum + String(t == null ? '' : t).length, 0);
        await settingsManager.addDailyUsage(name, totalChars);
        if (this.statusCache[name]?.status !== 'available') {
          // M18: 不传入 this.statusCache 快照，让 saveApiStatus 从存储读取最新值，避免并发竞态
          this.statusCache = await settingsManager.saveApiStatus(name, { status: 'available' });
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
    const timeout = (settings.advanced.requestTimeout || 10) * 1000;
    let lastError = null;
    const maxRetries = settings.advanced.retryCount || 1;

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
        if (error.message === 'QUOTA_EXCEEDED' || error.message.startsWith('AUTH_ERROR')) {
          throw error;
        }
        if (attempt < maxRetries) {
          const baseInterval = (settings.advanced.retryInterval || 5) * 1000;
          await new Promise(resolve => setTimeout(resolve, baseInterval * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  async _handleApiError(apiName, error) {
    const message = error.message || '';
    let allStatus;
    // M18: 每次从 this.statusCache 读取最新值，不传入快照参数，避免并发竞态
    if (message === 'QUOTA_EXCEEDED') {
      // M19: 月度重置的 API（百度/火山）quotaResetAt 应为下个月1日而非次日午夜
      const isMonthly = ['baidu', 'baidu_llm', 'volcano'].includes(apiName);
      const quotaResetAt = isMonthly ? this._getNextMonthStart() : this._getNextMidnight();
      allStatus = await settingsManager.saveApiStatus(apiName, {
        status: 'quota_exceeded',
        reason: '额度耗尽',
        quotaResetAt
      });
    } else if (message.startsWith('AUTH_ERROR')) {
      // v1.0.10 fix: 兼容 "AUTH_ERROR: detail" 和 "AUTH_ERROR (detail)" 两种格式
      // 提取 detail 时去除前缀的冒号/空格/括号，避免 popup 显示双括号
      const detail = message.length > 10
        ? message.substring(10).replace(/^[\s:()]+/, '').replace(/[()]+$/, '').trim()
        : '';
      allStatus = await settingsManager.saveApiStatus(apiName, {
        status: 'auth_error',
        reason: detail || '密钥无效'
      });
    } else {
      const current = this.statusCache[apiName] || {};
      const consecutiveErrors = (current.consecutiveErrors || 0) + 1;
      allStatus = await settingsManager.saveApiStatus(apiName, {
        status: 'error',
        reason: message,
        consecutiveErrors
      });
    }
    this.statusCache = allStatus;
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

    try {
      // H9: 为 testApi 增加超时保护，避免测试请求无限挂起
      const timeout = (settingsManager.settings?.advanced?.requestTimeout || 10) * 1000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      // 传递 signal 给 translate（如果 translate 支持），并用 Promise.race 作为超时保护
      await Promise.race([
        translator.translate(['Hello world'], 'en', 'zh', controller.signal),
        new Promise((_, reject) => setTimeout(() => reject(new Error('测试超时')), timeout))
      ]);
      clearTimeout(timer);
      // v1.0.5 hotfix: 测试成功时清掉 error 计数, 让 popup/options 立即显示"可用"
      await settingsManager.saveApiStatus(apiName, { status: 'available' });
      this.statusCache = await settingsManager.getApiStatus();
      return { success: true };
    } catch (error) {
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