import { BaiduTranslator } from './api-adapters/baidu.js';
import { BaiduLlmTranslator } from './api-adapters/baidu-llm.js';
import { LLMGenericTranslator } from './api-adapters/llm-generic.js';
import { settingsManager } from './settings-manager.js';

const LLM_PROVIDERS = {
  deepseek: { name: 'deepseek', displayName: 'DeepSeek', model: 'deepseek-chat' },
  glm: { name: 'glm', displayName: '智谱GLM(免费)', model: 'GLM-4-Flash-250414' },
  tongyi: { name: 'tongyi', displayName: '通义千问', model: 'qwen-plus' },
  zhipu: { name: 'zhipu', displayName: '智谱GLM', model: 'glm-4-flash' },
  yi: { name: 'yi', displayName: '零一万物', model: 'yi-34b-chat' },
  doubao: { name: 'doubao', displayName: '豆包', model: 'doubao-pro-32k' }
};

class ApiManager {
  constructor() {
    this.translators = new Map();
    this.statusCache = {};
  }

  async init() {
    await settingsManager.loadSettings();
    await settingsManager.resetApiQuotaIfNeeded();
    this.statusCache = await settingsManager.getApiStatus();
    this.llmSystemPrompt = await this._loadLlmPrompt();
    this.glossaryPromptSuffix = await this._loadGlossaryPromptSuffix();
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
    const enabledApis = settings.api.enabledApis || {};
    const apiKeys = settings.api.apiKeys || {};
    const apiEndpoints = settings.api.apiEndpoints || {};
    const apiModels = settings.api.apiModels || {};

    for (const apiName of settings.api.apiPriority) {
      if (!enabledApis[apiName]) continue;
      if (!apiKeys[apiName] && !apiName.startsWith('custom_')) continue;

      if (apiName === 'baidu') {
        const t = new BaiduTranslator({
          appId: apiKeys[apiName]?.appId || '',
          secretKey: apiKeys[apiName]?.secretKey || '',
          endpoint: apiEndpoints[apiName]
        });
        if (t.isConfigured()) this.translators.set(apiName, t);
      } else if (apiName === 'baidu_llm') {
        const t = new BaiduLlmTranslator({
          appId: apiKeys[apiName]?.appId || '',
          apiKey: apiKeys[apiName]?.apiKey || '',
          endpoint: apiEndpoints[apiName] || 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate',
          glossaryHint: this.glossaryPromptSuffix
        });
        if (t.isConfigured()) this.translators.set(apiName, t);
      } else if (LLM_PROVIDERS[apiName]) {
        const provider = LLM_PROVIDERS[apiName];
        const t = new LLMGenericTranslator({
          apiKey: apiKeys[apiName]?.apiKey || '',
          baseUrl: apiEndpoints[apiName] || '',
          model: apiModels[apiName] || provider.model,
          name: apiName,
          displayName: provider.displayName,
          systemPrompt: (this.llmSystemPrompt || '') + (this.glossaryPromptSuffix || '')
        });
        if (t.isConfigured()) this.translators.set(apiName, t);
      } else if (apiName === 'custom') {
        const displayName = apiKeys[apiName]?.displayName || '自定义大模型';
        const t = new LLMGenericTranslator({
          apiKey: apiKeys[apiName]?.apiKey || '',
          baseUrl: apiEndpoints[apiName] || '',
          model: apiModels[apiName] || '',
          name: 'custom',
          displayName: displayName,
          systemPrompt: (this.llmSystemPrompt || '') + (this.glossaryPromptSuffix || '')
        });
        if (t.isConfigured()) this.translators.set(apiName, t);
      } else if (apiName.startsWith('custom_')) {
        const providerId = apiName.slice(7);
        const provider = (settings.api.customProviders || []).find(p => p.id === providerId);
        if (!provider || !provider.enabled) continue;

        const t = new LLMGenericTranslator({
          apiKey: provider.apiKey || '',
          baseUrl: provider.endpoint || '',
          model: provider.model || '',
          name: apiName,
          displayName: provider.name || apiName,
          systemPrompt: (this.llmSystemPrompt || '') + (this.glossaryPromptSuffix || '')
        });
        if (t.isConfigured()) this.translators.set(apiName, t);
      }
    }
  }

  async reload() {
    this.statusCache = await settingsManager.getApiStatus();
    this.llmSystemPrompt = await this._loadLlmPrompt();
    this.glossaryPromptSuffix = await this._loadGlossaryPromptSuffix();
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
      try {
        const results = await this._translateWithTimeout(translator, textArray, sourceLang, targetLang, name);
        await settingsManager.saveApiStatus(name, { status: 'available' });
        const totalChars = textArray.reduce((sum, t) => sum + t.length, 0);
        await settingsManager.addDailyUsage(name, totalChars);
        return results;
      } catch (error) {
        lastError = error;
        await this._handleApiError(name, error);
      }
    }

    const allExhausted = ordered.every(({ name }) => !this._isApiUsable(name));
    if (allExhausted) {
      throw new Error('所有翻译服务暂时不可用，请稍后手动重试');
    }
    throw lastError || new Error('TRANSLATION_FAILED');
  }

  async _translateWithTimeout(translator, texts, sourceLang, targetLang, apiName) {
    const settings = settingsManager.settings;
    const timeout = (settings.advanced.requestTimeout || 10) * 1000;
    let lastError = null;
    const maxRetries = settings.advanced.retryCount || 1;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let timeoutHandle = null;
      try {
        const result = await Promise.race([
          translator.translate(texts, sourceLang, targetLang).catch(e => { throw e; }),
          new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('TIMEOUT')), timeout);
          })
        ]);
        if (timeoutHandle) clearTimeout(timeoutHandle);
        return result;
      } catch (error) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        lastError = error;
        if (error.message === 'QUOTA_EXCEEDED' || error.message === 'AUTH_ERROR') {
          throw error;
        }
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  async _handleApiError(apiName, error) {
    const message = error.message || '';
    if (message === 'QUOTA_EXCEEDED') {
      await settingsManager.saveApiStatus(apiName, {
        status: 'quota_exceeded',
        reason: '额度耗尽',
        quotaResetAt: this._getNextMidnight()
      });
    } else if (message === 'AUTH_ERROR') {
      await settingsManager.saveApiStatus(apiName, {
        status: 'auth_error',
        reason: '密钥无效'
      });
    } else {
      const currentStatus = this.statusCache[apiName] || {};
      const consecutiveErrors = (currentStatus.consecutiveErrors || 0) + 1;
      await settingsManager.saveApiStatus(apiName, {
        status: 'error',
        reason: message,
        consecutiveErrors
      });
    }
    this.statusCache = await settingsManager.getApiStatus();
  }

  _getNextMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime();
  }

  async testApi(apiName, apiConfig) {
    let translator;
    if (apiName === 'baidu') {
      translator = new BaiduTranslator({
        appId: apiConfig.appId || '',
        secretKey: apiConfig.secretKey || '',
        endpoint: settingsManager.settings.api.apiEndpoints?.[apiName]
      });
    } else if (apiName === 'baidu_llm') {
      translator = new BaiduLlmTranslator({
        appId: apiConfig.appId || '',
        apiKey: apiConfig.apiKey || '',
        endpoint: settingsManager.settings.api.apiEndpoints?.[apiName] || 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate'
      });
    } else if (LLM_PROVIDERS[apiName]) {
      translator = new LLMGenericTranslator({
        apiKey: apiConfig.apiKey || '',
        baseUrl: settingsManager.settings.api.apiEndpoints?.[apiName] || '',
        model: settingsManager.settings.api.apiModels?.[apiName] || LLM_PROVIDERS[apiName].model,
        name: apiName,
        displayName: LLM_PROVIDERS[apiName].displayName
      });
    } else if (apiName === 'custom') {
      translator = new LLMGenericTranslator({
        apiKey: apiConfig.apiKey || '',
        baseUrl: settingsManager.settings.api.apiEndpoints?.[apiName] || '',
        model: settingsManager.settings.api.apiModels?.[apiName] || '',
        name: 'custom',
        displayName: apiConfig.displayName || '自定义大模型'
      });
    } else if (apiName.startsWith('custom_')) {
      const providerId = apiName.slice(7);
      const provider = (settingsManager.settings.api.customProviders || []).find(p => p.id === providerId);
      if (!provider) {
        return { success: false, error: '供应商配置未找到' };
      }
      translator = new LLMGenericTranslator({
        apiKey: provider.apiKey || '',
        baseUrl: provider.endpoint || '',
        model: provider.model || '',
        name: apiName,
        displayName: provider.name || apiName
      });
    }

    if (!translator || !translator.isConfigured()) {
      return { success: false, error: 'API 未配置或配置不完整' };
    }

    try {
      await translator.translate(['Hello world'], 'en', 'zh');
      // v1.0.5 hotfix: 测试成功时清掉 error 计数, 让 popup/options 立即显示"可用"
      // 之前 _handleApiError 累计的 consecutiveErrors 不被测试清掉, 用户体验割裂
      await settingsManager.saveApiStatus(apiName, { status: 'available' });
      this.statusCache = await settingsManager.getApiStatus();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getApiStatusSummary() {
    const ordered = this.getOrderedTranslators();
    const summary = {};
    for (const { name } of ordered) {
      const status = this.statusCache[name];
      summary[name] = {
        status: status?.status || 'available',
        reason: status?.reason || '',
        updatedAt: status?.updatedAt || 0
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