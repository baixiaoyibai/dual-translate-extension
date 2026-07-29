// lib/api-metadata.js
// 共用 API 元数据（显示名 / 默认端点 / 默认模型），供 options.html / popup.html 加载
// IIFE 模式挂全局，与 escape-utils.js 风格一致
// options.js / popup.js 通过 window.API_DISPLAY_NAMES 等访问

(function(global) {
  'use strict';

  const API_DISPLAY_NAMES = {
    baidu: '百度翻译',
    deepseek: 'DeepSeek',
    glm: '智谱GLM(免费)',
    baidu_llm: '百度大模型翻译',
    tencent: '腾讯翻译TMT',
    tongyi: '通义千问',
    zhipu: '智谱GLM',
    yi: '零一万物',
    doubao: '豆包',
    custom: '自定义大模型'
  };

  const API_ENDPOINTS_DEFAULT = {
    baidu: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
    deepseek: 'https://api.deepseek.com',
    glm: 'https://open.bigmodel.cn/api/paas/v4',
    tencent: '',
    tongyi: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
    yi: 'https://api.lingyiwanwu.com',
    doubao: 'https://ark.cn-beijing.volces.com/api/v3',
    baidu_llm: 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate',
    custom: ''
  };

  const API_MODELS_DEFAULT = {
    baidu: '',
    deepseek: 'deepseek-chat',
    glm: 'GLM-4-Flash-250414',
    tencent: '',
    tongyi: 'qwen-plus',
    zhipu: 'glm-4-flash',
    yi: 'yi-34b-chat',
    doubao: 'doubao-pro-32k',
    baidu_llm: '',
    custom: ''
  };

  function getApiDisplayName(apiName, customProviders) {
    if (API_DISPLAY_NAMES[apiName]) return API_DISPLAY_NAMES[apiName];
    if (apiName.startsWith('custom_')) {
      const provider = (customProviders || []).find(p => p.id === apiName.slice(7));
      return provider ? provider.name : apiName;
    }
    return apiName;
  }

  global.API_DISPLAY_NAMES = API_DISPLAY_NAMES;
  global.API_ENDPOINTS_DEFAULT = API_ENDPOINTS_DEFAULT;
  global.API_MODELS_DEFAULT = API_MODELS_DEFAULT;
  global.getApiDisplayName = getApiDisplayName;
})(typeof window !== 'undefined' ? window : self);
