// lib/api-metadata.js
// 共用 API 元数据（显示名 / 默认端点 / 默认模型），供 options.html / popup.html 加载
// IIFE 模式挂全局，与 escape-utils.js 风格一致
// options.js / popup.js 通过 window.API_DISPLAY_NAMES 等访问

(function(global) {
  'use strict';

  const API_DISPLAY_NAMES = {
    baidu: '百度机器翻译',
    deepseek: 'DeepSeek',
    glm: '智谱GLM(免费)',
    baidu_llm: '百度大模型翻译',
    tongyi: '通义千问',
    zhipu: '智谱GLM',
    yi: '零一万物',
    doubao: '豆包',
    volcano: '火山引擎机器翻译',
    custom: '自定义大模型'
  };

  const API_ENDPOINTS_DEFAULT = {
    baidu: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
    deepseek: 'https://api.deepseek.com',
    glm: 'https://open.bigmodel.cn/api/paas/v4',
    tongyi: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
    yi: 'https://api.lingyiwanwu.com',
    doubao: 'https://ark.cn-beijing.volces.com/api/v3',
    baidu_llm: 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate',
    volcano: 'https://translate.volcengineapi.com',
    custom: ''
  };

  const API_MODELS_DEFAULT = {
    baidu: '',
    deepseek: 'deepseek-chat',
    glm: 'GLM-4-Flash-250414',
    tongyi: 'qwen-plus',
    zhipu: 'glm-4-flash',
    yi: 'yi-34b-chat',
    doubao: 'doubao-pro-32k',
    baidu_llm: '',
    volcano: '',
    custom: ''
  };

  // 各 API 免费额度信息（用于设置页小字标注）
  const API_FREE_QUOTAS = {
    baidu: '标准版5万字符/月，高级版100万字符/月',
    deepseek: '无免费额度，按量付费',
    glm: '完全免费，不限量',
    baidu_llm: '无独立免费额度',
    tongyi: '100万Token/模型（一次性，3个月有效）',
    zhipu: '无免费额度，按量付费',
    yi: '无免费额度，按量付费',
    doubao: '50万Token/模型（一次性）',
    volcano: '200万字符/月',
    custom: ''
  };

  // Single source of truth for settings defaults shared by extension pages and
  // the background module. Keep legacy fields here for upgrade compatibility.
  const DEFAULT_SETTINGS = {
    settingsVersion: 1,
    display: {
      defaultMode: 'bilingual',
      translationColor: '#888888',
      translationSize: '85%',
      translationFont: '',
      translationSpacing: '4px',
      hoverDelay: 200,
      tooltipDelay: 300,
      panelPosition: 'right',
      panelWidth: 400,
      translatePageTitle: true,
      translateImgAlt: true
    },
    rules: {
      autoDetectLang: true,
      onlyEnJa: true,
      skipChineseSegments: true,
      translateCodeBlocks: false,
      translateAltText: true,
      translateTitle: true,
      translateUI: true,
      minTextLength: 3,
      customModelNames: [
        'gpt', 'chatgpt', 'o1', 'o3', 'o4', 'dall-e', 'whisper', 'sora', 'gpt-4o',
        'claude', 'gemini', 'gemma', 'palm', 'bard', 'llama', 'codellama',
        'mistral', 'mixtral', 'falcon', 'deepseek', 'glm', 'chatglm',
        'qwen', 'qwen2', 'qwen2.5', 'qwen3', 'qwq', 'tongyi qianwen',
        'ernie', 'yi', 'doubao', 'seed', 'kimi', 'moonshot', 'hunyuan',
        'spark', 'sensechat', 'baichuan', 'step', 'minimax', 'abab',
        'cohere', 'command', 'stable-diffusion', 'midjourney',
        'copilot', 'cursor', 'windsurf', 'devin', 'perplexity', 'pi', 'groq', 'cerebras',
        '豆包', '通义千问', '文心一言', '混元', '讯飞星火',
        '商汤日日新', '百川', '盘古', '天工', '悟道', '孟子', '智谱', '山海', '小冰'
      ],
      customModelVariants: [
        'turbo', 'flash', 'pro', 'mini', 'plus', 'ultra', 'opus', 'sonnet',
        'haiku', 'lightning', 'large', 'vision', 'chat', 'instruct', 'base',
        'codex', 'nano', 'xl', 'max', 'medium', 'small', 'distill', 'preview',
        'alpha', 'beta', 'exp', 'experimental', 'moe', 'thinking', 'reasoning',
        'coder', 'fast', 'search', 'sync', 'high', 'low', 'hd', 'long', 'sol',
        '标准版', '专业版', '增强版', '旗舰版', '极速版', '轻量版', '基础版'
      ],
      autoRescan: { enabled: false, interval: 5, idleOnly: true }
    },
    trigger: {
      autoTranslate: true,
      excludeList: ['*.baidu.com', '*.taobao.com', '*.tmall.com', '*.jd.com', '*.163.com',
        '*.qq.com', '*.sina.com', '*.sina.com.cn', '*.sohu.com', '*.zhihu.com',
        '*.douban.com', '*.bilibili.com', '*.bilibili.tv', '*.b23.tv', '*.csdn.net',
        '*.cnblogs.com', '*.jianshu.com', '*.oschina.net', '*.segmentfault.com',
        '*.juejin.cn', '*.juejin.im', '*.acfun.cn', '*.tieba.baidu.com',
        '*.smzdm.com', '*.meituan.com', '*.dianping.com', '*.ele.me', '*.amap.com',
        '*.douyin.com', '*.kuaishou.com', '*.xiaohongshu.com', '*.weibo.com', '*.weibo.cn',
        '*.ixigua.com', '*.huya.com', '*.douyu.com', '*.panda.tv', '*.zhanqi.tv',
        '*.iqiyi.com', '*.iq.com', '*.youku.com', '*.tudou.com', '*.mgtv.com',
        '*.pptv.com', '*.yangshipin.cn', '*.kugou.com', '*.kuwo.cn', '*.ifeng.com',
        '*.xinhuanet.com', '*.people.com.cn', '*.cctv.com', '*.cntv.cn', '*.alipay.com',
        '*.1688.com', '*.pinduoduo.com', '*.vip.com', '*.mogujie.com', '*.suning.com',
        '*.dangdang.com', '*.ctrip.com', '*.qunar.com', '*.tuniu.com', '*.elong.com',
        '*.mafengwo.cn', '*.ly.com', '*.fliggy.com', '*.12306.cn', '*.58.com',
        '*.ganji.com', '*.anjuke.com', '*.lianjia.com', '*.fang.com', '*.zhaopin.com',
        '*.51job.com', '*.lagou.com', '*.bosszhipin.com', '*.liepin.com', '*.autohome.com.cn',
        '*.dongchedi.com', '*.yiche.com', '*.mi.com', '*.miui.com', '*.vmall.com',
        '*.huawei.com', '*.aliyun.com', '*.huaweicloud.com', '*.modelscope.cn', '*.xfyun.cn',
        '*.iflytek.com', '*.open.bigmodel.cn', '*.volcengine.com', '*.lingyiwanwu.com',
        '*.dashscope.aliyuncs.com', '*.deepseek.com', '*.gitee.com', '*.dingtalk.com',
        '*.feishu.cn', '*.yuque.com', '*.kdocs.cn', '*.wps.cn', '*.youdao.com',
        '*.v2ex.com', '*.linux.do', '*.hostloc.com', '*.hupu.com', '*.mihoyo.com',
        '*.hoyolab.com', '*.taptap.com', '*.nga.cn', '*.ngabbs.com', '*.3dmgame.com',
        '*.gamersky.com', '*.gcores.com', '*.xiaoheihe.net', '*.17173.com', '*.duowan.com'],
      excludeMode: 'blacklist',
      contextMenu: true,
      translateDelay: 500,
      translationCache: true,
      scrollTranslate: true,
      shortcutKey: 'Alt+T'
    },
    api: {
      enabledApis: { baidu: true, deepseek: true, baidu_llm: true, glm: true },
      apiPriority: ['baidu', 'glm', 'deepseek', 'baidu_llm', 'volcano', 'custom', 'tongyi', 'zhipu', 'yi', 'doubao'],
      apiKeys: {
        baidu: { appId: '', secretKey: '' },
        deepseek: { apiKey: '' },
        glm: { apiKey: '' },
        baidu_llm: { appId: '', apiKey: '' },
        volcano: { accessKey: '', secretKey: '' }
      },
      apiEndpoints: {},
      apiModels: {},
      customProviders: [],
      sourceLanguage: 'auto',
      quotaLimits: {}
    },
    advanced: {
      batchSize: 10,
      requestTimeout: 10,
      retryCount: 1,
      retryInterval: 5,
      lazyTranslate: true,
      logLevel: 'warn'
    },
    general: {
      hasCompletedWelcome: false,
      lastMode: 'bilingual',
      translationEnabled: true,
      logLevel: 2,
      toggleTranslateShortcut: 'Alt+T'
    }
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
  global.API_FREE_QUOTAS = API_FREE_QUOTAS;
  global.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  global.getApiDisplayName = getApiDisplayName;
})(typeof window !== 'undefined' ? window : self);
