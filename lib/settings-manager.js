const SETTINGS_KEY = 'dual_translate_settings';
const GLOSSARY_KEY = 'dual_translate_glossary';
const GLOSSARY_INIT_KEY = 'dual_translate_glossary_initialized';
const API_STATUS_KEY = 'dual_translate_api_status';
const DAILY_USAGE_KEY = 'dual_translate_daily_usage';
const LAST_TRANSLATION_MODE_KEY = 'dual_translate_last_mode';
const RESET_DATE_KEY = 'dual_translate_reset_date';
const RESET_MONTH_KEY = 'dual_translate_reset_month';
const INSTALLED_KEYS_KEY = 'dual_translate_installed_keys';
const LOCAL_API_KEYS_KEY = 'dual_translate_api_keys_local';

const MONTHLY_RESET_APIS = ['baidu', 'baidu_llm'];

const DEFAULT_SETTINGS = {
  display: {
    defaultMode: 'bilingual',
    translationColor: '#888888',
    translationSize: '85%',
    translationFont: '',
    translationSpacing: '4px',
    hoverDelay: 200,
    panelPosition: 'right',
    panelWidth: 400
  },
  rules: {
    onlyEnJa: true,
    translateCodeBlocks: false,
    minTextLength: 3
  },
  trigger: {
    autoTranslate: true,
    excludeList: [
      '*.baidu.com',
      '*.taobao.com',
      '*.tmall.com',
      '*.jd.com',
      '*.163.com',
      '*.qq.com',
      '*.sina.com',
      '*.sina.com.cn',
      '*.sohu.com',
      '*.zhihu.com',
      '*.douban.com',
      '*.bilibili.com',
      '*.bilibili.tv',
      '*.b23.tv',
      '*.csdn.net',
      '*.cnblogs.com',
      '*.jianshu.com',
      '*.oschina.net',
      '*.segmentfault.com',
      '*.juejin.cn',
      '*.juejin.im',
      '*.acfun.cn',
      '*.tieba.baidu.com',
      '*.smzdm.com',
      '*.meituan.com',
      '*.dianping.com',
      '*.ele.me',
      '*.amap.com',
      '*.douyin.com',
      '*.kuaishou.com',
      '*.xiaohongshu.com',
      '*.weibo.com',
      '*.weibo.cn',
      '*.ixigua.com',
      '*.huya.com',
      '*.douyu.com',
      '*.panda.tv',
      '*.zhanqi.tv',
      '*.iqiyi.com',
      '*.iq.com',
      '*.youku.com',
      '*.tudou.com',
      '*.mgtv.com',
      '*.pptv.com',
      '*.yangshipin.cn',
      '*.kugou.com',
      '*.kuwo.cn',
      '*.ifeng.com',
      '*.xinhuanet.com',
      '*.people.com.cn',
      '*.cctv.com',
      '*.cntv.cn',
      '*.alipay.com',
      '*.1688.com',
      '*.pinduoduo.com',
      '*.vip.com',
      '*.mogujie.com',
      '*.suning.com',
      '*.dangdang.com',
      '*.ctrip.com',
      '*.qunar.com',
      '*.tuniu.com',
      '*.elong.com',
      '*.mafengwo.cn',
      '*.ly.com',
      '*.fliggy.com',
      '*.12306.cn',
      '*.58.com',
      '*.ganji.com',
      '*.anjuke.com',
      '*.lianjia.com',
      '*.fang.com',
      '*.zhaopin.com',
      '*.51job.com',
      '*.lagou.com',
      '*.bosszhipin.com',
      '*.liepin.com',
      '*.autohome.com.cn',
      '*.dongchedi.com',
      '*.yiche.com',
      '*.mi.com',
      '*.miui.com',
      '*.vmall.com',
      '*.huawei.com',
      '*.aliyun.com',
      '*.tencent.com',
      '*.huaweicloud.com',
      '*.modelscope.cn',
      '*.xfyun.cn',
      '*.iflytek.com',
      '*.open.bigmodel.cn',
      '*.volcengine.com',
      '*.lingyiwanwu.com',
      '*.dashscope.aliyuncs.com',
      '*.deepseek.com',
      '*.gitee.com',
      '*.dingtalk.com',
      '*.feishu.cn',
      '*.yuque.com',
      '*.kdocs.cn',
      '*.wps.cn',
      '*.youdao.com',
      '*.v2ex.com',
      '*.linux.do',
      '*.hostloc.com',
      '*.hupu.com',
      '*.mihoyo.com',
      '*.hoyolab.com',
      '*.taptap.com',
      '*.nga.cn',
      '*.ngabbs.com',
      '*.3dmgame.com',
      '*.gamersky.com',
      '*.gcores.com',
      '*.xiaoheihe.net',
      '*.17173.com',
      '*.duowan.com'
    ],
    excludeMode: 'blacklist',
    contextMenu: true,
    translateDelay: 500,
    translationCache: true
  },
  api: {
    enabledApis: {
      baidu: true,
      deepseek: true,
      baidu_llm: true,
      glm: true
    },
    apiPriority: ['baidu', 'glm', 'deepseek', 'baidu_llm', 'custom', 'tongyi', 'zhipu', 'yi', 'doubao'],
    apiKeys: {
      baidu: { appId: '', secretKey: '' },
      deepseek: { apiKey: '' },
      glm: { apiKey: '' },
      baidu_llm: { appId: '', apiKey: '' }
    },
    apiEndpoints: {},
    apiModels: {},
    customProviders: [],
    sourceLanguage: 'auto'
  },
  advanced: {
    batchSize: 10,
    requestTimeout: 10,
    retryCount: 1,
    retryInterval: 5
  },
  general: {
    hasCompletedWelcome: false,
    lastMode: 'bilingual',
    translationEnabled: true
  }
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
  custom: ''
};

class SettingsManager {
  constructor() {
    this.settings = null;
    this.cache = null;
  }

  async loadSettings() {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const isFirstInstall = !result[SETTINGS_KEY];

    if (isFirstInstall) {
      this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      this._ensureApiDefaults();
      await this._loadApiKeysFromFile();
    } else {
      this.settings = this._deepMerge(DEFAULT_SETTINGS, result[SETTINGS_KEY]);
      this._ensureApiDefaults();
    }

    // 从 local 加载 apiKeys 覆盖（避免密钥随 sync 跨设备同步）
    await this._loadApiKeysFromLocal();

    return this.settings;
  }

  async _loadApiKeysFromFile() {
    try {
      const stored = await chrome.storage.local.get(INSTALLED_KEYS_KEY);
      const storedKeys = stored[INSTALLED_KEYS_KEY];
      if (storedKeys && typeof storedKeys === 'object' && Object.keys(storedKeys).length > 0) {
        this._mergeKeysIntoApi(storedKeys);
        return;
      }
    } catch (error) {
    }

    try {
      const resp = await fetch(chrome.runtime.getURL('config/api-keys.json'));
      if (!resp.ok) return;
      const keysData = await resp.json();
      if (!keysData || typeof keysData !== 'object') return;
      this._mergeKeysIntoApi(keysData);
    } catch (error) {
    }
  }

  async _loadApiKeysFromLocal() {
    try {
      const stored = await chrome.storage.local.get(LOCAL_API_KEYS_KEY);
      const localKeys = stored[LOCAL_API_KEYS_KEY];
      if (localKeys && typeof localKeys === 'object' && Object.keys(localKeys).length > 0) {
        this._mergeKeysIntoApi(localKeys);
      }
    } catch (error) {
    }
  }

  _mergeKeysIntoApi(keysData) {
    if (!this.settings.api.apiKeys) {
      this.settings.api.apiKeys = {};
    }
    for (const [apiName, keyObj] of Object.entries(keysData)) {
      if (!keyObj || typeof keyObj !== 'object') continue;
      if (!this.settings.api.apiKeys[apiName]) {
        this.settings.api.apiKeys[apiName] = {};
      }
      for (const [field, value] of Object.entries(keyObj)) {
        if (typeof value === 'string' && value.length > 0) {
          const current = this.settings.api.apiKeys[apiName][field];
          if (!current || current.length === 0) {
            this.settings.api.apiKeys[apiName][field] = value;
          }
        }
      }
    }
  }

  _ensureApiDefaults() {
    if (!Array.isArray(this.settings.api.customProviders)) {
      this.settings.api.customProviders = [];
    }
    if (!this.settings.api.apiEndpoints || Object.keys(this.settings.api.apiEndpoints).length === 0) {
      this.settings.api.apiEndpoints = JSON.parse(JSON.stringify(API_ENDPOINTS_DEFAULT));
    } else {
      for (const [key, value] of Object.entries(API_ENDPOINTS_DEFAULT)) {
        if (this.settings.api.apiEndpoints[key] === undefined) {
          this.settings.api.apiEndpoints[key] = value;
        }
      }
    }
    if (!this.settings.api.apiModels || Object.keys(this.settings.api.apiModels).length === 0) {
      this.settings.api.apiModels = JSON.parse(JSON.stringify(API_MODELS_DEFAULT));
    } else {
      for (const [key, value] of Object.entries(API_MODELS_DEFAULT)) {
        if (this.settings.api.apiModels[key] === undefined) {
          this.settings.api.apiModels[key] = value;
        }
      }
    }
    if (!this.settings.api.enabledApis) {
      this.settings.api.enabledApis = {};
    }
    if (!this.settings.api.apiKeys) {
      this.settings.api.apiKeys = {};
    }

    const defaultEnabled = DEFAULT_SETTINGS.api.enabledApis;
    for (const key of Object.keys(defaultEnabled)) {
      if (this.settings.api.enabledApis[key] === undefined) {
        this.settings.api.enabledApis[key] = defaultEnabled[key];
      }
    }

    const defaultKeys = DEFAULT_SETTINGS.api.apiKeys;
    for (const key of Object.keys(defaultKeys)) {
      if (!this.settings.api.apiKeys[key]) {
        this.settings.api.apiKeys[key] = JSON.parse(JSON.stringify(defaultKeys[key]));
      }
    }

    const defaultPriority = DEFAULT_SETTINGS.api.apiPriority;
    if (!this.settings.api.apiPriority || this.settings.api.apiPriority.length === 0) {
      this.settings.api.apiPriority = [...defaultPriority];
    } else {
      for (const apiName of defaultPriority) {
        if (!this.settings.api.apiPriority.includes(apiName)) {
          this.settings.api.apiPriority.push(apiName);
        }
      }
    }
    
    // 确保百度置顶
    if (this.settings.api.apiPriority[0] !== 'baidu') {
      const idx = this.settings.api.apiPriority.indexOf('baidu');
      if (idx > 0) {
        this.settings.api.apiPriority.splice(idx, 1);
        this.settings.api.apiPriority.unshift('baidu');
      }
    }
    
    if (!this.settings.api.sourceLanguage) {
      this.settings.api.sourceLanguage = 'auto';
    }
  }

  _deepMerge(target, source) {
    const result = JSON.parse(JSON.stringify(target));
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  async saveSettings(settings) {
    if (!settings) return;
    const clonedSettings = JSON.parse(JSON.stringify(settings));

    // 提取 apiKeys 单独存 local，避免随 sync 跨设备同步
    if (clonedSettings.api && clonedSettings.api.apiKeys) {
      const apiKeys = clonedSettings.api.apiKeys;
      delete clonedSettings.api.apiKeys;
      try {
        await chrome.storage.local.set({ [LOCAL_API_KEYS_KEY]: apiKeys });
      } catch (error) {
        console.warn('Failed to save API keys to local:', error);
      }
    }

    this.settings = clonedSettings;
    await chrome.storage.sync.set({ [SETTINGS_KEY]: clonedSettings });
  }

  async updateSetting(path, value) {
    const keys = path.split('.');
    let current = this.settings;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    await this.saveSettings(this.settings);
  }

  getSetting(path) {
    const keys = path.split('.');
    let current = this.settings;
    for (const key of keys) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }
    return current;
  }

  async getGlossary() {
    const result = await chrome.storage.sync.get([GLOSSARY_KEY, GLOSSARY_INIT_KEY]);
    if (result[GLOSSARY_INIT_KEY]) {
      const stored = result[GLOSSARY_KEY];
      return (stored && stored.length > 0) ? stored : (Array.isArray(stored) ? stored : null);
    }
    try {
      const resp = await fetch(chrome.runtime.getURL('config/default-glossary.json'));
      if (resp.ok) {
        const defaults = await resp.json();
        if (Array.isArray(defaults) && defaults.length > 0) {
          await chrome.storage.sync.set({ [GLOSSARY_KEY]: defaults, [GLOSSARY_INIT_KEY]: true });
          return defaults;
        }
      }
    } catch {}
    await chrome.storage.sync.set({ [GLOSSARY_INIT_KEY]: true });
    return null;
  }

  async saveGlossary(glossary) {
    await chrome.storage.sync.set({ [GLOSSARY_KEY]: glossary });
  }

  async getApiStatus() {
    const result = await chrome.storage.local.get(API_STATUS_KEY);
    return result[API_STATUS_KEY] || {};
  }

  async saveApiStatus(apiName, status) {
    const allStatus = await this.getApiStatus();
    allStatus[apiName] = {
      ...status,
      updatedAt: Date.now()
    };
    await chrome.storage.local.set({ [API_STATUS_KEY]: allStatus });
    return allStatus;
  }

  async resetApiQuotaIfNeeded() {
    const now = new Date();
    const today = now.toDateString();
    const currentMonth = String(now.getMonth() + 1);

    let allStatus = await this.getApiStatus();
    let changed = false;

    const dateResult = await chrome.storage.local.get(RESET_DATE_KEY);
    if (dateResult[RESET_DATE_KEY] !== today) {
      for (const key of Object.keys(allStatus)) {
        if (!MONTHLY_RESET_APIS.includes(key) && allStatus[key].status === 'quota_exceeded') {
          allStatus[key].status = 'available';
          allStatus[key].reason = 'daily_reset';
          changed = true;
        }
      }
      await chrome.storage.local.set({ [RESET_DATE_KEY]: today });
    }

    const monthResult = await chrome.storage.local.get(RESET_MONTH_KEY);
    if (monthResult[RESET_MONTH_KEY] !== currentMonth) {
      for (const key of Object.keys(allStatus)) {
        if (MONTHLY_RESET_APIS.includes(key) && allStatus[key].status === 'quota_exceeded') {
          allStatus[key].status = 'available';
          allStatus[key].reason = 'monthly_reset';
          changed = true;
        }
      }
      await chrome.storage.local.set({ [RESET_MONTH_KEY]: currentMonth });
    }

    if (changed) {
      await chrome.storage.local.set({ [API_STATUS_KEY]: allStatus });
    }
  }

  async getDailyUsage() {
    const today = new Date().toDateString();
    const result = await chrome.storage.local.get(DAILY_USAGE_KEY);
    const usage = result[DAILY_USAGE_KEY] || {};
    if (usage._date !== today) {
      return { _date: today };
    }
    return usage;
  }

  async addDailyUsage(apiName, charCount) {
    const usage = await this.getDailyUsage();
    const today = new Date().toDateString();
    if (usage._date !== today) {
      usage._date = today;
      usage[apiName] = charCount;
    } else {
      usage[apiName] = (usage[apiName] || 0) + charCount;
    }
    await chrome.storage.local.set({ [DAILY_USAGE_KEY]: usage });
    return usage;
  }

  async getLastMode(tabId) {
    const result = await chrome.storage.local.get(`${LAST_TRANSLATION_MODE_KEY}_${tabId}`);
    return result[`${LAST_TRANSLATION_MODE_KEY}_${tabId}`] || this.settings.display.defaultMode;
  }

  async saveLastMode(tabId, mode) {
    await chrome.storage.local.set({ [`${LAST_TRANSLATION_MODE_KEY}_${tabId}`]: mode });
  }

  shouldAutoTranslate(url) {
    if (!this.settings.trigger.autoTranslate) return false;
    try {
      const hostname = new URL(url).hostname;
      const excludeList = this.settings.trigger.excludeList || [];
      const mode = this.settings.trigger.excludeMode || 'blacklist';
      const matched = excludeList.some(pattern => this._hostMatches(hostname, pattern));
      if (mode === 'blacklist') return !matched;
      if (mode === 'whitelist') return matched;
      return true;
    } catch {
      return true;
    }
  }

  _hostMatches(hostname, pattern) {
    try {
      let p = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      p = p.replace(/\\\*/g, '.*');
      p = p.replace(/^\.\*\\\./, '(?:.*\\.)?');
      const matched = new RegExp('^' + p + '$', 'i').test(hostname);

      // 兜底：若 pattern 形如 *.xxx.yyy，且正则未匹配成功，则检查 hostname 是否等于去除 "*." 后的根域名
      if (!matched && pattern.startsWith('*.') && hostname === pattern.substring(2)) {
        return true;
      }

      return matched;
    } catch {
      return hostname === pattern;
    }
  }
}

const settingsManager = new SettingsManager();
export { settingsManager, DEFAULT_SETTINGS };