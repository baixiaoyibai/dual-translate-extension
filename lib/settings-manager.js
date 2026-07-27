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
    panelWidth: 400,
    // v1.0.2: 新增 DOM 范围控制（§3.2 需求，修复 §10.2 未实现）
    translatePageTitle: true,
    translateImgAlt: true
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
    retryInterval: 5,
    // v1.0.3: 懒加载 —— 仅翻译视口内段落，滚动时再补全（§3.4 性能优化）
    lazyTranslate: true
  },
  general: {
    hasCompletedWelcome: false,
    lastMode: 'bilingual',
    translationEnabled: true,
    // v1.0.2: 新增日志级别（§3.6 需求，修复 §10.2 未实现）
    // 0=silent 1=error 2=warn 3=info 4=debug
    logLevel: 2
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
    // ===== 路径安全校验 =====
    // 背景：原实现接受任意点分隔路径，可覆写 settings 对象的任意字段，
    //       存在原型污染（如 __proto__）与内部属性覆写风险。此处增加防御性校验。

    // 1. 格式校验：每一段必须以「字母」开头，后接字母/数字/下划线，段间以点分隔。
    //    - 天然拒绝 __proto__、_constructor 等以下划线开头的危险字段；
    //    - 拒绝空段、首尾点、连续点以及含特殊字符的路径。
    const PATH_FORMAT = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/;
    if (typeof path !== 'string' || !PATH_FORMAT.test(path)) {
      console.warn('[settings-manager] updateSetting 拒绝非法路径格式:', path);
      throw new Error(`非法的 setting 路径格式: ${String(path)}`);
    }

    // 2. 顶层前缀白名单：path 的第一段必须是受支持的配置分组。
    //    不逐一枚举完整路径，仅校验顶层分组，避免新增字段时因漏配而破坏功能。
    const ALLOWED_PREFIXES = new Set(['display', 'rules', 'trigger', 'api', 'advanced', 'general']);
    const topKey = path.split('.', 1)[0];
    if (!ALLOWED_PREFIXES.has(topKey)) {
      console.warn('[settings-manager] updateSetting 拒绝未授权的顶层分组:', topKey);
      throw new Error(`未授权的 setting 顶层分组: ${topKey}`);
    }

    // 3. 原型污染关键字拦截：即便通过了格式与前缀校验，仍拒绝访问
    //    constructor / prototype 等可沿原型链造成污染的属性名（防御性纵深）。
    //    合法业务字段不会使用这些名字，故不会破坏现有功能。
    const keys = path.split('.');
    if (keys.some(k => k === 'constructor' || k === 'prototype')) {
      console.warn('[settings-manager] updateSetting 拒绝访问原型链相关字段:', path);
      throw new Error(`禁止访问的 setting 路径: ${path}`);
    }

    // 4. 特例拦截：api.apiKeys 由 saveSettings 单独迁移至 chrome.storage.local，
    //    不应通过 updateSetting 直接覆写，否则会污染/丢失真实密钥。
    //    api.sourceLanguage、api.enabledApis 等普通字段仍可正常更新。
    if (path === 'api.apiKeys') {
      console.warn('[settings-manager] updateSetting 拒绝直接修改 api.apiKeys（密钥走 local 存储）');
      throw new Error('不允许通过 updateSetting 修改 api.apiKeys');
    }

    // ===== 通过校验，执行原写入逻辑 =====
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

  // v1.0.4: 域名专属术语表（§3.3）— 返回结构化对象 { _global, "host": [...], "*.wildcard": [...] }
  async getGlossary() {
    const result = await chrome.storage.sync.get([GLOSSARY_KEY, GLOSSARY_INIT_KEY]);
    if (result[GLOSSARY_INIT_KEY]) {
      const stored = result[GLOSSARY_KEY];
      // 向后兼容: 旧 array 格式 → 包成 _global
      if (Array.isArray(stored)) return { _global: stored };
      if (stored && typeof stored === 'object') return stored;
      return { _global: [] };
    }
    try {
      const resp = await fetch(chrome.runtime.getURL('config/default-glossary.json'));
      if (resp.ok) {
        const defaults = await resp.json();
        if (Array.isArray(defaults) && defaults.length > 0) {
          const wrapped = { _global: defaults };
          await chrome.storage.sync.set({ [GLOSSARY_KEY]: wrapped, [GLOSSARY_INIT_KEY]: true });
          return wrapped;
        }
      }
    } catch {}
    await chrome.storage.sync.set({ [GLOSSARY_INIT_KEY]: true });
    return { _global: [] };
  }

  // v1.0.4: 域名专属术语表（§3.3）— 直接存结构化对象
  async saveGlossary(glossary) {
    await chrome.storage.sync.set({ [GLOSSARY_KEY]: glossary });
  }

  // v1.0.4: 合并全局 + 精确域名 + 通配符域名，返回该域名应应用的扁平 entries 数组
  // 通配符 `*.foo.com` 匹配 `*.foo.com` 任意子域，**也匹配**裸域 `foo.com`（glob 惯例）
  async getGlossaryForDomain(domain) {
    const all = await this.getGlossary();
    const result = [];
    if (all._global) result.push(...all._global);
    if (domain && all[domain]) result.push(...all[domain]);
    if (domain) {
      for (const key of Object.keys(all)) {
        if (!key.startsWith('*.')) continue;
        const suffix = key.slice(1); // ".foo.com"
        if (domain.endsWith(suffix) || domain === suffix.slice(1)) {
          result.push(...all[key]);
        }
      }
    }
    return result;
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