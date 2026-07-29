// lib/api-registry.js
// API 翻译器注册表 —— 配置驱动替代 if/else 分支
// 消除 api-manager.js 中 _buildTranslators() 和 testApi() 的 ~120 行重复分支
//
// 每个 API 注册条目包含：
//   - createFromSettings(settings, sharedConfig) → Translator | null（从持久化设置构建）
//   - createFromTestConfig(apiConfig, settings) → Translator | null（从测试配置构建）
//   - isCustomProvider: boolean（是否为自定义供应商，走 customProviders 数组）

import { BaiduTranslator } from './api-adapters/baidu.js';
import { BaiduLlmTranslator } from './api-adapters/baidu-llm.js';
import { VolcanoTranslator } from './api-adapters/volcano.js';
import { LLMGenericTranslator } from './api-adapters/llm-generic.js';

// LLM 供应商元数据（display name + default model）
// 注意：此处的 displayName 与 model 需与 api-metadata.js 中的
// API_DISPLAY_NAMES / API_MODELS_DEFAULT 保持一致。
// 由于 api-metadata.js 采用 IIFE + window 全局变量模式（非 ES module），
// 无法在此处直接 import，故单独维护并在此标注，后续修改任一处需同步更新。
const LLM_PROVIDERS = {
  deepseek: { displayName: 'DeepSeek', model: 'deepseek-chat' },
  glm: { displayName: '智谱GLM(免费)', model: 'GLM-4-Flash-250414' },
  tongyi: { displayName: '通义千问', model: 'qwen-plus' },
  zhipu: { displayName: '智谱GLM', model: 'glm-4-flash' },
  yi: { displayName: '零一万物', model: 'yi-34b-chat' },
  doubao: { displayName: '豆包', model: 'doubao-pro-32k' }
};

/**
 * API 注册表
 * key: apiName, value: { createFromSettings, createFromTestConfig }
 */
const API_REGISTRY = {
  baidu: {
    createFromSettings(settings, shared) {
      const keys = settings.api.apiKeys?.baidu || {};
      const t = new BaiduTranslator({
        appId: keys.appId || '',
        secretKey: keys.secretKey || '',
        endpoint: settings.api.apiEndpoints?.baidu
      });
      return t.isConfigured() ? t : null;
    },
    createFromTestConfig(apiConfig, settings) {
      return new BaiduTranslator({
        appId: apiConfig.appId || '',
        secretKey: apiConfig.secretKey || '',
        endpoint: settings.api.apiEndpoints?.baidu
      });
    }
  },

  baidu_llm: {
    createFromSettings(settings, shared) {
      const keys = settings.api.apiKeys?.baidu_llm || {};
      const t = new BaiduLlmTranslator({
        appId: keys.appId || '',
        apiKey: keys.apiKey || '',
        endpoint: settings.api.apiEndpoints?.baidu_llm || 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate',
        glossaryHint: shared.glossaryHint
      });
      return t.isConfigured() ? t : null;
    },
    createFromTestConfig(apiConfig, settings) {
      return new BaiduLlmTranslator({
        appId: apiConfig.appId || '',
        apiKey: apiConfig.apiKey || '',
        endpoint: settings.api.apiEndpoints?.baidu_llm || 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate'
      });
    }
  },

  volcano: {
    createFromSettings(settings, shared) {
      const keys = settings.api.apiKeys?.volcano || {};
      const t = new VolcanoTranslator({
        accessKey: keys.accessKey || '',
        secretKey: keys.secretKey || '',
        endpoint: settings.api.apiEndpoints?.volcano
      });
      return t.isConfigured() ? t : null;
    },
    createFromTestConfig(apiConfig, settings) {
      return new VolcanoTranslator({
        accessKey: apiConfig.accessKey || '',
        secretKey: apiConfig.secretKey || '',
        endpoint: settings.api.apiEndpoints?.volcano
      });
    }
  }
};

// 为 LLM_PROVIDERS 中的每个供应商动态生成注册条目
for (const [apiName, provider] of Object.entries(LLM_PROVIDERS)) {
  API_REGISTRY[apiName] = {
    createFromSettings(settings, shared) {
      const keys = settings.api.apiKeys?.[apiName] || {};
      const t = new LLMGenericTranslator({
        apiKey: keys.apiKey || '',
        baseUrl: settings.api.apiEndpoints?.[apiName] || '',
        model: settings.api.apiModels?.[apiName] || provider.model,
        name: apiName,
        displayName: provider.displayName,
        systemPrompt: shared.fullPrompt
      });
      return t.isConfigured() ? t : null;
    },
    createFromTestConfig(apiConfig, settings) {
      return new LLMGenericTranslator({
        apiKey: apiConfig.apiKey || '',
        baseUrl: settings.api.apiEndpoints?.[apiName] || '',
        model: settings.api.apiModels?.[apiName] || provider.model,
        name: apiName,
        displayName: provider.displayName
      });
    }
  };
}

/**
 * 从持久化设置创建翻译器（用于 _buildTranslators）
 * @param {string} apiName - API 名称
 * @param {object} settings - 完整设置对象
 * @param {object} shared - { fullPrompt, glossaryHint } 共享配置
 * @returns {BaseTranslator|null} 已配置的翻译器，或 null（未配置/无效）
 */
export function createTranslatorFromSettings(apiName, settings, shared) {
  // 自定义供应商走 customProviders 数组
  if (apiName.startsWith('custom_')) {
    return createCustomProviderTranslator(apiName, settings, shared);
  }
  const entry = API_REGISTRY[apiName];
  if (!entry) return null;
  return entry.createFromSettings(settings, shared);
}

/**
 * 从测试配置创建翻译器（用于 testApi）
 * @param {string} apiName - API 名称
 * @param {object} apiConfig - 用户当前输入的配置
 * @param {object} settings - 完整设置对象（用于读取 endpoint/model 默认值）
 * @returns {BaseTranslator|null} 翻译器实例
 */
export function createTranslatorForTest(apiName, apiConfig, settings) {
  // 自定义供应商：优先使用 apiConfig，回退到存储的 provider 值
  if (apiName.startsWith('custom_')) {
    const providerId = apiName.slice(7);
    const provider = (settings.api.customProviders || []).find(p => p.id === providerId);
    if (!provider) return null;
    const t = new LLMGenericTranslator({
      apiKey: apiConfig?.apiKey || provider.apiKey || '',
      baseUrl: apiConfig?.endpoint || provider.endpoint || '',
      model: apiConfig?.model || provider.model || '',
      name: apiName,
      displayName: apiConfig?.displayName || provider.name || apiName
    });
    return t;
  }
  const entry = API_REGISTRY[apiName];
  if (!entry) return null;
  return entry.createFromTestConfig(apiConfig || {}, settings);
}

/**
 * 创建自定义供应商翻译器
 */
function createCustomProviderTranslator(apiName, settings, shared) {
  const providerId = apiName.slice(7);
  const provider = (settings.api.customProviders || []).find(p => p.id === providerId);
  if (!provider || !provider.enabled) return null;
  const t = new LLMGenericTranslator({
    apiKey: provider.apiKey || '',
    baseUrl: provider.endpoint || '',
    model: provider.model || '',
    name: apiName,
    displayName: provider.name || apiName,
    systemPrompt: shared.fullPrompt
  });
  return t.isConfigured() ? t : null;
}

export { LLM_PROVIDERS };
