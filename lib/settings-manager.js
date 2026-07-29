/**
 * 跨平台存储隔离说明（v1.0.18）
 * ============================================
 * chrome.storage API 的数据是按「浏览器配置文件 + 扩展 ID」隔离的：
 * - Chrome 和 Edge 各有独立的存储空间，互不干扰
 * - 同一浏览器的不同 Profile（配置文件）也互相隔离
 * - 因此用户在多个浏览器同时安装本扩展时，设置数据各自独立
 *   这是预期行为，无需额外处理
 *
 * 若未来需要跨浏览器同步，可考虑：
 * - 使用 chrome.storage.sync（受配额限制，且仍限于同一浏览器账号）
 * - 导入/导出功能（已实现，见 options.js 的 exportSettings/importSettings）
 */
const SETTINGS_KEY = 'dual_translate_settings';
const GLOSSARY_KEY = 'dual_translate_glossary';
const GLOSSARY_INIT_KEY = 'dual_translate_glossary_initialized';
const API_STATUS_KEY = 'dual_translate_api_status';
const DAILY_USAGE_KEY = 'dual_translate_daily_usage';
const RESET_DATE_KEY = 'dual_translate_reset_date';
const RESET_MONTH_KEY = 'dual_translate_reset_month';
const LOCAL_API_KEYS_KEY = 'dual_translate_api_keys_local';
const MONTHLY_USAGE_KEY = 'dual_translate_monthly_usage';
// PIN 码安全保护相关存储键
const PIN_HASH_KEY = 'dual_translate_pin_hash';
const PIN_SALT_KEY = 'dual_translate_pin_salt';

const MONTHLY_RESET_APIS = ['baidu', 'baidu_llm', 'volcano'];

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
    // v1.0.8: 自定义月度额度限制
    quotaLimits: {}
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
    logLevel: 2,
    toggleTranslateShortcut: 'Alt+T'
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

class SettingsManager {
  constructor() {
    this.settings = null;
    this._hostPatternCache = new Map();
    this._pinFailCount = 0;
    this._pinCooldownUntil = 0;
    this._apiStatusCache = null;
  }

  _getCompiledPattern(pattern) {
    if (this._hostPatternCache.has(pattern)) {
      return this._hostPatternCache.get(pattern);
    }
    let p = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    p = p.replace(/\\\*/g, '.*');
    p = p.replace(/^\.\*\\\./, '(?:.*\\.)?');
    const regex = new RegExp('^' + p + '$', 'i');
    this._hostPatternCache.set(pattern, regex);
    return regex;
  }

  async loadSettings() {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const isFirstInstall = !result[SETTINGS_KEY];

    if (isFirstInstall) {
      this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      this._ensureApiDefaults();
    } else {
      this.settings = this._deepMerge(DEFAULT_SETTINGS, result[SETTINGS_KEY]);
      this._ensureApiDefaults();
    }

    // v1.0.6 migration: 如果 sync storage 中仍有 apiKeys（旧版本遗留），
    // 迁移到 local storage 并从 sync 中删除
    await this._migrateSyncKeysToLocal(result[SETTINGS_KEY]);

    // 从 local 加载 apiKeys（local storage 中的非空值优先于 sync/default 中的值）
    await this._loadApiKeysFromLocal();

    return this.settings;
  }

  // v1.0.6 migration: 将旧版本存在 sync 中的 apiKeys 迁移到 local storage
  async _migrateSyncKeysToLocal(syncSettings) {
    if (!syncSettings || !syncSettings.api || !syncSettings.api.apiKeys) return;
    const syncKeys = syncSettings.api.apiKeys;
    const hasRealKey = Object.values(syncKeys).some(k =>
      k && typeof k === 'object' && Object.values(k).some(v => typeof v === 'string' && v.length > 0)
    );
    if (!hasRealKey) return;
    try {
      // 合并到 local（不覆盖 local 中已有的非空值）
      const stored = await chrome.storage.local.get(LOCAL_API_KEYS_KEY);
      const localKeys = stored[LOCAL_API_KEYS_KEY] || {};
      for (const [apiName, keyObj] of Object.entries(syncKeys)) {
        if (!keyObj || typeof keyObj !== 'object') continue;
        if (!localKeys[apiName]) localKeys[apiName] = {};
        for (const [field, value] of Object.entries(keyObj)) {
          if (typeof value === 'string' && value.length > 0) {
            // 只在 local 中没有非空值时才迁移
            if (!localKeys[apiName][field] || localKeys[apiName][field].length === 0) {
              localKeys[apiName][field] = value;
            }
          }
        }
      }
      await chrome.storage.local.set({ [LOCAL_API_KEYS_KEY]: localKeys });
      // 从 sync 中删除 apiKeys
      const cleaned = JSON.parse(JSON.stringify(syncSettings));
      delete cleaned.api.apiKeys;
      await chrome.storage.sync.set({ [SETTINGS_KEY]: cleaned });
      console.info('[settings-manager] migrated apiKeys from sync to local');
    } catch (error) {
      console.warn('[settings-manager] migration error:', error);
    }
  }

  async _loadApiKeysFromLocal() {
    try {
      const stored = await chrome.storage.local.get(LOCAL_API_KEYS_KEY);
      const localKeys = stored[LOCAL_API_KEYS_KEY];
      if (localKeys && typeof localKeys === 'object' && Object.keys(localKeys).length > 0) {
        // v1.0.7: 清理 local storage 中已废弃的 API 密钥（如 tencent）
        let cleaned = false;
        for (const name of Object.keys(localKeys)) {
          if (!this._isValidApiName(name)) {
            delete localKeys[name];
            cleaned = true;
            console.log(`[settings-manager] 从 local storage 清理废弃 API 密钥: ${name}`);
          }
        }
        if (cleaned) {
          await chrome.storage.local.set({ [LOCAL_API_KEYS_KEY]: localKeys });
        }
        this._mergeKeysIntoApi(localKeys);
        // v1.0.7: 恢复 customProviders 的 apiKey
        if (Array.isArray(this.settings.api.customProviders)) {
          for (const provider of this.settings.api.customProviders) {
            if (!provider || !provider.id) continue;
            const apiName = `custom_${provider.id}`;
            const storedKey = localKeys[apiName];
            if (storedKey && typeof storedKey === 'object' && typeof storedKey.apiKey === 'string' && storedKey.apiKey.length > 0) {
              if (!provider.apiKey || provider.apiKey.length === 0) {
                provider.apiKey = storedKey.apiKey;
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('[settings-manager] _loadApiKeysFromLocal error:', error);
    }
  }

  // v1.0.6 fix: 从 storage 重新加载 apiKeys，确保 getSettings 返回的密钥不丢失
  // 关键：只用非空值覆盖，避免空值抹掉已加载的真实密钥
  // v1.0.6 fix2: 增加 sync storage 回退 —— 兼容旧版本数据（迁移未执行或失败时密钥仍在 sync 中）
  async reloadApiKeys() {
    if (!this.settings || !this.settings.api) return;
    try {
      // 1. 先从 local storage 加载
      const stored = await chrome.storage.local.get(LOCAL_API_KEYS_KEY);
      const localKeys = stored[LOCAL_API_KEYS_KEY];
      if (localKeys && typeof localKeys === 'object' && Object.keys(localKeys).length > 0) {
        if (!this.settings.api.apiKeys) {
          this.settings.api.apiKeys = {};
        }
        for (const [apiName, keyObj] of Object.entries(localKeys)) {
          // v1.0.7: 跳过已废弃的 API（如 tencent）
          if (!this._isValidApiName(apiName)) continue;
          if (!keyObj || typeof keyObj !== 'object') continue;
          if (!this.settings.api.apiKeys[apiName]) {
            this.settings.api.apiKeys[apiName] = {};
          }
          for (const [field, value] of Object.entries(keyObj)) {
            // 只用非空值覆盖：空字符串不覆盖已有密钥
            if (typeof value === 'string' && value.length > 0) {
              this.settings.api.apiKeys[apiName][field] = value;
            }
          }
        }
      }

      // 2. 回退：如果 local 中没有非空密钥，尝试从 sync storage 加载（旧版本兼容）
      const hasNonEmpty = this.settings.api.apiKeys && Object.values(this.settings.api.apiKeys).some(k =>
        k && typeof k === 'object' && Object.values(k).some(v => typeof v === 'string' && v.length > 0)
      );
      if (!hasNonEmpty) {
        const syncResult = await chrome.storage.sync.get(SETTINGS_KEY);
        const syncSettings = syncResult[SETTINGS_KEY];
        if (syncSettings && syncSettings.api && syncSettings.api.apiKeys) {
          const syncKeys = syncSettings.api.apiKeys;
          if (!this.settings.api.apiKeys) this.settings.api.apiKeys = {};
          for (const [apiName, keyObj] of Object.entries(syncKeys)) {
            // v1.0.7: 跳过已废弃的 API（如 tencent）
            if (!this._isValidApiName(apiName)) continue;
            if (!keyObj || typeof keyObj !== 'object') continue;
            if (!this.settings.api.apiKeys[apiName]) this.settings.api.apiKeys[apiName] = {};
            for (const [field, value] of Object.entries(keyObj)) {
              if (typeof value === 'string' && value.length > 0) {
                this.settings.api.apiKeys[apiName][field] = value;
              }
            }
          }
          // 如果从 sync 中找到了密钥，触发迁移到 local（并从 sync 中删除）
          const nowHasNonEmpty = Object.values(this.settings.api.apiKeys).some(k =>
            k && typeof k === 'object' && Object.values(k).some(v => typeof v === 'string' && v.length > 0)
          );
          if (nowHasNonEmpty) {
            await chrome.storage.local.set({ [LOCAL_API_KEYS_KEY]: this.settings.api.apiKeys });
            // 从 sync 中删除 apiKeys
            const cleaned = JSON.parse(JSON.stringify(syncSettings));
            delete cleaned.api.apiKeys;
            await chrome.storage.sync.set({ [SETTINGS_KEY]: cleaned });
            console.info('[settings-manager] reloadApiKeys: 已将密钥从 sync 迁移到 local');
          }
        }
      }

      // v1.0.7: 恢复 customProviders 的 apiKey（从 local storage 中读取，sync 中已被剥离）
      if (Array.isArray(this.settings.api.customProviders) && localKeys) {
        for (const provider of this.settings.api.customProviders) {
          if (!provider || !provider.id) continue;
          const apiName = `custom_${provider.id}`;
          const storedKey = localKeys[apiName];
          if (storedKey && typeof storedKey === 'object' && typeof storedKey.apiKey === 'string' && storedKey.apiKey.length > 0) {
            // 只在内存中 apiKey 为空时恢复（避免覆盖用户刚输入的值）
            if (!provider.apiKey || provider.apiKey.length === 0) {
              provider.apiKey = storedKey.apiKey;
            }
          }
        }
      }
    } catch (error) {
      console.warn('[settings-manager] reloadApiKeys error:', error);
    }
  }

  _mergeKeysIntoApi(keysData) {
    // v1.0.6: local storage 中的非空值优先覆盖 sync/default 中的值
    // 空字符串不覆盖已有密钥，避免 local 中的空值抹掉 sync 中的真实密钥
    if (!this.settings.api.apiKeys) {
      this.settings.api.apiKeys = {};
    }
    for (const [apiName, keyObj] of Object.entries(keysData)) {
      // v1.0.7: 跳过已废弃的 API（如 tencent）
      if (!this._isValidApiName(apiName)) continue;
      if (!keyObj || typeof keyObj !== 'object') continue;
      if (!this.settings.api.apiKeys[apiName]) {
        this.settings.api.apiKeys[apiName] = {};
      }
      for (const [field, value] of Object.entries(keyObj)) {
        if (typeof value === 'string' && value.length > 0) {
          this.settings.api.apiKeys[apiName][field] = value;
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

    // v1.0.7: 清理已废弃的 API（如 tencent）—— 代码中已移除但用户存储中可能残留
    this._cleanupObsoleteApis();
  }

  // v1.0.7: 清理 apiPriority / apiKeys / apiEndpoints / apiModels / enabledApis 中
  // 不在有效集合内的 API 名称（有效 = DEFAULT_SETTINGS.apiPriority 中的名称 + custom_ 前缀）
  _cleanupObsoleteApis() {
    const api = this.settings.api;
    if (Array.isArray(api.apiPriority)) {
      const before = api.apiPriority.length;
      api.apiPriority = api.apiPriority.filter(name => this._isValidApiName(name));
      if (api.apiPriority.length < before) {
        console.log(`[settings-manager] 清理了 ${before - api.apiPriority.length} 个废弃 API 优先级条目`);
      }
    }
    for (const objKey of ['apiKeys', 'apiEndpoints', 'apiModels', 'enabledApis']) {
      const obj = api[objKey];
      if (obj && typeof obj === 'object') {
        for (const name of Object.keys(obj)) {
          if (!this._isValidApiName(name)) {
            delete obj[name];
            console.log(`[settings-manager] 清理废弃 API 条目: ${objKey}[${name}]`);
          }
        }
      }
    }
  }

  // v1.0.7: 判断 API 名称是否有效（在 DEFAULT_SETTINGS.apiPriority 中，或以 custom_ 开头）
  _isValidApiName(name) {
    if (typeof name !== 'string') return false;
    if (name.startsWith('custom_')) return true;
    return DEFAULT_SETTINGS.api.apiPriority.includes(name);
  }

  _deepMerge(target, source) {
    const result = JSON.parse(JSON.stringify(target));
    for (const key of Object.keys(source)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
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
    const syncData = typeof structuredClone !== 'undefined' ? structuredClone(clonedSettings) : JSON.parse(JSON.stringify(clonedSettings));
    if (syncData.api && syncData.api.apiKeys) {
      const apiKeys = syncData.api.apiKeys;
      // v1.0.6 safety: 检查是否有非空密钥
      const hasAnyNonEmpty = Object.values(apiKeys).some(keyObj =>
        keyObj && typeof keyObj === 'object' &&
        Object.values(keyObj).some(v => typeof v === 'string' && v.length > 0)
      );
      if (hasAnyNonEmpty) {
        // 有真实密钥：存到 local，从 sync 中删除
        delete syncData.api.apiKeys;
        try {
          // v1.0.7 fix: 合而非覆盖 —— 先读取 local 中已有的密钥，
          // 只用 incoming 中的非空值覆盖对应字段，保留 incoming 中缺失的 API 的已有密钥
          const stored = await chrome.storage.local.get(LOCAL_API_KEYS_KEY);
          const existingKeys = stored[LOCAL_API_KEYS_KEY] || {};
          const mergedKeys = JSON.parse(JSON.stringify(existingKeys));
          for (const [apiName, keyObj] of Object.entries(apiKeys)) {
            if (!keyObj || typeof keyObj !== 'object') continue;
            if (!mergedKeys[apiName]) mergedKeys[apiName] = {};
            for (const [field, value] of Object.entries(keyObj)) {
              if (typeof value === 'string' && value.length > 0) {
                mergedKeys[apiName][field] = value;
              }
            }
          }
          await chrome.storage.local.set({ [LOCAL_API_KEYS_KEY]: mergedKeys });
        } catch (error) {
          console.warn('Failed to save API keys to local:', error);
        }
      } else {
        // 全空密钥：不删除 sync 中的 apiKeys（可能含旧版密钥），也不覆盖 local
        // 防止设置页未正确加载密钥时 saveAllSettings 发送全空 apiKeys 导致密钥永久丢失
        console.warn('[settings-manager] saveSettings: apiKeys 全空，跳过写入（保护现有密钥）');
      }
    }

    // v1.0.6 fix: 防止内存覆盖 —— 如果 incoming apiKeys 全空但内存中有非空密钥，
    // 保留内存中的密钥，避免设置页未正确加载密钥时 saveAllSettings 发送全空 apiKeys
    // 导致 this.settings 被空值覆盖，后续 getSettings 返回空密钥
    if (clonedSettings.api && this.settings && this.settings.api) {
      const incomingKeys = clonedSettings.api.apiKeys || {};
      const hasNonEmptyIncoming = Object.values(incomingKeys).some(k =>
        k && typeof k === 'object' && Object.values(k).some(v => typeof v === 'string' && v.length > 0)
      );
      if (!hasNonEmptyIncoming && this.settings.api.apiKeys) {
        const existingNonEmpty = Object.values(this.settings.api.apiKeys).some(k =>
          k && typeof k === 'object' && Object.values(k).some(v => typeof v === 'string' && v.length > 0)
        );
        if (existingNonEmpty) {
          clonedSettings.api.apiKeys = JSON.parse(JSON.stringify(this.settings.api.apiKeys));
          // 持久化到 local storage
          try {
            await chrome.storage.local.set({ [LOCAL_API_KEYS_KEY]: clonedSettings.api.apiKeys });
          } catch(e) { console.warn('[settings-manager] saveSettings: 持久化密钥到 local 失败:', e); }
          // 从 syncData 中删除
          if (syncData.api) delete syncData.api.apiKeys;
          console.info('[settings-manager] saveSettings: incoming apiKeys 全空，保留内存中现有密钥');
        }
      }
    }

    this.settings = clonedSettings;
    if (settings.trigger && settings.trigger.excludeList) {
      this._hostPatternCache.clear();
    }

    // v1.0.7: 将 customProviders 中的 apiKey 提取到 local storage，防止随 sync 同步泄漏
    if (syncData.api && Array.isArray(syncData.api.customProviders)) {
      const customKeyMap = {};
      let hasCustomKeys = false;
      for (const provider of syncData.api.customProviders) {
        if (provider && typeof provider.apiKey === 'string' && provider.apiKey.length > 0) {
          customKeyMap[`custom_${provider.id}`] = { apiKey: provider.apiKey };
          hasCustomKeys = true;
          // 从 sync 数据中移除 apiKey，保留其他字段
          provider.apiKey = '';
        }
      }
      if (hasCustomKeys) {
        try {
          const stored = await chrome.storage.local.get(LOCAL_API_KEYS_KEY);
          const existingKeys = stored[LOCAL_API_KEYS_KEY] || {};
          for (const [apiName, keyObj] of Object.entries(customKeyMap)) {
            existingKeys[apiName] = keyObj;
          }
          await chrome.storage.local.set({ [LOCAL_API_KEYS_KEY]: existingKeys });
        } catch (error) {
          console.warn('[settings-manager] Failed to save custom provider keys to local:', error);
        }
      }
    }

    await chrome.storage.sync.set({ [SETTINGS_KEY]: syncData });
  }

  async applyImportedSettings(importedSettings) {
    if (!importedSettings || typeof importedSettings !== 'object') {
      throw new Error('导入数据格式无效（settings 不是对象）');
    }
    // 清理危险键
    const cleaned = JSON.parse(JSON.stringify(importedSettings, (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
      return value;
    }));
    // 确保关键字段类型正确
    if (cleaned.api) {
      if (!Array.isArray(cleaned.api.apiPriority)) cleaned.api.apiPriority = [];
      if (typeof cleaned.api.enabledApis !== 'object' || cleaned.api.enabledApis === null) cleaned.api.enabledApis = {};
      if (!Array.isArray(cleaned.api.customProviders)) cleaned.api.customProviders = [];
    }
    if (cleaned.trigger) {
      if (!Array.isArray(cleaned.trigger.excludeList)) cleaned.trigger.excludeList = [];
    }
    if (cleaned.advanced) {
      if (typeof cleaned.advanced.requestTimeout !== 'number' || cleaned.advanced.requestTimeout < 1) cleaned.advanced.requestTimeout = 10;
    }
    await chrome.storage.sync.set({ [SETTINGS_KEY]: cleaned });
    await this.loadSettings();
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
    if (path === 'api.apiKeys' || path.startsWith('api.apiKeys.')) {
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
    if (keys.includes('excludeList')) {
      this._hostPatternCache.clear();
    }
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
    if (domain && Object.hasOwn(all, domain)) result.push(...all[domain]);
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
    // 先检查内存缓存
    if (this._apiStatusCache) return this._apiStatusCache;
    // 从存储读取所有 apiStatus_ 前缀的键
    const all = await chrome.storage.local.get(null);
    const status = {};
    for (const key of Object.keys(all)) {
      if (key.startsWith('apiStatus_')) {
        const apiName = key.slice(10);
        status[apiName] = all[key];
      }
    }
    this._apiStatusCache = status;
    return status;
  }

  async saveApiStatus(apiName, statusUpdate) {
    const statusKey = `apiStatus_${apiName}`;
    // 只读取和写入单个 API 的状态，避免整体覆盖（修复 read-modify-write 竞态）
    const existing = await chrome.storage.local.get(statusKey);
    const current = existing[statusKey] || {};
    const updated = { ...current, ...statusUpdate, updatedAt: Date.now() };
    await chrome.storage.local.set({ [statusKey]: updated });
    // 更新内存缓存
    if (!this._apiStatusCache) this._apiStatusCache = {};
    this._apiStatusCache[apiName] = updated;
    return this._apiStatusCache;
  }

  // 删除单个 API 的状态（供 background.js clearApi 调用）
  async deleteApiStatus(apiName) {
    const statusKey = `apiStatus_${apiName}`;
    await chrome.storage.local.remove(statusKey);
    if (this._apiStatusCache) {
      delete this._apiStatusCache[apiName];
    }
  }

  async resetApiQuotaIfNeeded() {
    const now = new Date();
    const today = now.toDateString();
    // v1.0.10 fix: 月份格式统一为 YYYY-MM
    // v1.0.11 fix: 改用本地时间，避免 UTC 与本地时区不一致导致月初配额提前/延后重置
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    // 读取所有键（包括 apiStatus_ 前缀的状态键和日期标记）
    const all = await chrome.storage.local.get(null);
    const needDailyReset = all[RESET_DATE_KEY] !== today;
    const needMonthlyReset = all[RESET_MONTH_KEY] !== currentMonth;

    // 不需要重置时直接返回
    if (!needDailyReset && !needMonthlyReset) return;

    const updates = {};
    let changed = false;

    for (const key of Object.keys(all)) {
      if (!key.startsWith('apiStatus_')) continue;
      const apiName = key.slice(10);
      const status = all[key];
      if (!status || status.status !== 'quota_exceeded') continue;

      if (needDailyReset && !MONTHLY_RESET_APIS.includes(apiName)) {
        updates[key] = { ...status, status: 'available', reason: 'daily_reset', updatedAt: Date.now() };
        changed = true;
      } else if (needMonthlyReset && MONTHLY_RESET_APIS.includes(apiName)) {
        updates[key] = { ...status, status: 'available', reason: 'monthly_reset', updatedAt: Date.now() };
        changed = true;
      }
    }

    // 原子写入：日期标记 + 变更的 API 状态一次性写入（修复非原子写入问题）
    const setObj = {
      [RESET_DATE_KEY]: today,
      [RESET_MONTH_KEY]: currentMonth
    };
    if (changed) {
      Object.assign(setObj, updates);
    }
    await chrome.storage.local.set(setObj);

    // 更新内存缓存
    if (changed && this._apiStatusCache) {
      for (const [key, val] of Object.entries(updates)) {
        const apiName = key.slice(10);
        this._apiStatusCache[apiName] = val;
      }
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
    let usage = await this.getDailyUsage();
    const today = new Date().toDateString();
    if (usage._date !== today) {
      // 跨日：创建全新对象，不保留旧数据
      usage = { _date: today };
    }
    usage[apiName] = (usage[apiName] || 0) + charCount;
    await chrome.storage.local.set({ [DAILY_USAGE_KEY]: usage });
    // v1.0.8: 同时累计月度用量
    await this.addMonthlyUsage(apiName, charCount);
    return usage;
  }

  // v1.0.8: 月度用量统计（用于自定义额度限制）
  async getMonthlyUsage() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; // YYYY-MM
    const result = await chrome.storage.local.get(MONTHLY_USAGE_KEY);
    const usage = result[MONTHLY_USAGE_KEY] || {};
    if (usage._month !== currentMonth) {
      return { _month: currentMonth };
    }
    return usage;
  }

  async addMonthlyUsage(apiName, charCount) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    let usage = await this.getMonthlyUsage();
    if (usage._month !== currentMonth) {
      // 跨月：创建全新对象，不保留旧数据
      usage = { _month: currentMonth };
    }
    usage[apiName] = (usage[apiName] || 0) + charCount;
    await chrome.storage.local.set({ [MONTHLY_USAGE_KEY]: usage });
    return usage;
  }

  // v1.0.8: 检查 API 是否已达到自定义额度限制的 97%
  // v1.0.9: 支持 daily/monthly 重置周期
  // 返回 true 表示已达限制，应切换到下一个 API
  async isApiQuotaReached(apiName) {
    const limits = this.settings?.api?.quotaLimits || {};
    const limit = limits[apiName];
    if (!limit || !limit.enabled || !limit.limit || limit.limit <= 0) return false;

    const usage = limit.resetType === 'daily'
      ? await this.getDailyUsage()
      : await this.getMonthlyUsage();
    const used = usage[apiName] || 0;

    // 如果用户设置的单位是 token，按 1 token ≈ 2 字符 的估算转换
    const limitInChars = limit.unit === 'tokens' ? limit.limit * 2 : limit.limit;
    return used >= limitInChars * 0.97;
  }

  // v1.0.8: 获取 API 用量百分比（用于 UI 显示）
  // v1.0.9: 支持 daily/monthly 重置周期
  async getApiUsagePercentage(apiName) {
    const limits = this.settings?.api?.quotaLimits || {};
    const limit = limits[apiName];
    if (!limit || !limit.enabled || !limit.limit || limit.limit <= 0) return null;

    const usage = limit.resetType === 'daily'
      ? await this.getDailyUsage()
      : await this.getMonthlyUsage();
    const used = usage[apiName] || 0;
    const limitInChars = limit.unit === 'tokens' ? limit.limit * 2 : limit.limit;
    return Math.min(100, Math.round((used / limitInChars) * 100));
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
      const regex = this._getCompiledPattern(pattern);
      const matched = regex.test(hostname);

      if (!matched && pattern.startsWith('*.') && hostname === pattern.substring(2)) {
        return true;
      }

      return matched;
    } catch {
      return hostname === pattern;
    }
  }

  // ============ PIN 码安全保护 ============
  async hasPin() {
    const result = await chrome.storage.local.get([PIN_HASH_KEY]);
    return !!result[PIN_HASH_KEY];
  }

  async setupPin(pin) {
    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
      throw new Error('PIN 必须为 6 位数字');
    }
    const salt = this._generateSalt();
    const hash = await this._hashPin(pin, salt);
    await chrome.storage.local.set({
      [PIN_HASH_KEY]: hash,
      [PIN_SALT_KEY]: salt
    });
  }

  async verifyPin(pin) {
    // 从存储读取持久化的失败计数和冷却时间（SW 重启后仍生效）
    const stateData = await chrome.storage.local.get(['_pinFailCount', '_pinCooldownUntil']);
    this._pinFailCount = stateData._pinFailCount || 0;
    this._pinCooldownUntil = stateData._pinCooldownUntil || 0;

    // 冷却期检查
    if (this._pinCooldownUntil > Date.now()) {
      const wait = Math.ceil((this._pinCooldownUntil - Date.now()) / 1000);
      return { success: false, error: `请等待 ${wait} 秒后再试` };
    }
    const result = await chrome.storage.local.get([PIN_HASH_KEY, PIN_SALT_KEY]);
    if (!result[PIN_HASH_KEY]) {
      return { success: false, error: 'PIN 未设置' };
    }
    if (!result[PIN_SALT_KEY]) {
      return { success: false, error: 'PIN 数据损坏，请重置 PIN' };
    }
    const hash = await this._hashPin(pin, result[PIN_SALT_KEY]);
    if (this._constantTimeCompare(hash, result[PIN_HASH_KEY])) {
      this._pinFailCount = 0;
      this._pinCooldownUntil = 0;
      // 成功后清除持久化的失败计数和冷却时间
      await chrome.storage.local.remove(['_pinFailCount', '_pinCooldownUntil']);
      return { success: true };
    } else {
      this._pinFailCount++;
      if (this._pinFailCount >= 5) {
        this._pinCooldownUntil = Date.now() + 60000; // 60秒冷却
        // 持久化冷却时间，重置失败计数
        await chrome.storage.local.set({ _pinFailCount: 0, _pinCooldownUntil: this._pinCooldownUntil });
        this._pinFailCount = 0;
        return { success: false, error: 'PIN 错误次数过多，请等待 60 秒后再试' };
      }
      // 持久化失败计数
      await chrome.storage.local.set({ _pinFailCount: this._pinFailCount, _pinCooldownUntil: this._pinCooldownUntil });
      return { success: false, error: `PIN 错误，还剩 ${5 - this._pinFailCount} 次机会` };
    }
  }

  _constantTimeCompare(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return result === 0;
  }

  async resetPin() {
    // 重置 PIN 同时清除所有密钥（安全措施，防止攻击者重置后利用残留密钥）
    await chrome.storage.local.remove([PIN_HASH_KEY, PIN_SALT_KEY, LOCAL_API_KEYS_KEY]);
    // 清除内存中的 apiKeys
    if (this.settings?.api?.apiKeys) {
      for (const apiName of Object.keys(this.settings.api.apiKeys)) {
        for (const field of Object.keys(this.settings.api.apiKeys[apiName])) {
          this.settings.api.apiKeys[apiName][field] = '';
        }
      }
    }
    // 清除 customProviders 的 apiKey
    if (this.settings?.api?.customProviders) {
      for (const p of this.settings.api.customProviders) {
        p.apiKey = '';
      }
    }
    await this.saveSettings(this.settings);
  }

  _generateSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async _hashPin(pin, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

const settingsManager = new SettingsManager();
export { settingsManager, DEFAULT_SETTINGS };