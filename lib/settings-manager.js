import './api-metadata.js';

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
// v1.3.3 compat F-5: 删除死常量 API_STATUS_KEY（'dual_translate_api_status'，自 v1.0.13 起 per-API 键取代单键聚合，
// 该常量已无任何读写方）；≤v1.0.7 升级用户残留的孤儿数据在 resetApiQuotaIfNeeded 中一次性清理。
const DAILY_USAGE_KEY = 'dual_translate_daily_usage';
const RESET_DATE_KEY = 'dual_translate_reset_date';
const RESET_MONTH_KEY = 'dual_translate_reset_month';
const LOCAL_API_KEYS_KEY = 'dual_translate_api_keys_local';
const MONTHLY_USAGE_KEY = 'dual_translate_monthly_usage';
// PIN 码安全保护相关存储键
const PIN_HASH_KEY = 'dual_translate_pin_hash';
const PIN_SALT_KEY = 'dual_translate_pin_salt';
// v1.2.16 security: M2 — PIN 使用 PBKDF2-HMAC-SHA256 慢哈希，替代可被离线爆破的快速 SHA-256。
const PIN_PBKDF2_ITERATIONS = 100000;
const PIN_HASH_PREFIX = 'pbkdf2$';

const MONTHLY_RESET_APIS = ['baidu', 'baidu_llm', 'volcano'];

const LEGACY_DEFAULT_SETTINGS = {
  settingsVersion: 1,
  display: {
    defaultMode: 'bilingual',
    translationColor: '#888888',
    translationSize: '85%',
    translationFont: '',
    translationSpacing: '4px',
    hoverDelay: 200,
    // legacy: older settings used this for tooltip-style hover UI.
    tooltipDelay: 300,
    panelPosition: 'right',
    panelWidth: 400,
    // v1.2.17 UX: 对照面板折叠状态跨会话记忆
    panelCollapsed: false,
    // v1.0.2: 新增 DOM 范围控制（§3.2 需求，修复 §10.2 未实现）
    translatePageTitle: true,
    translateImgAlt: true
  },
  rules: {
    // legacy compatibility: keep older stored fields stable even when current UI no longer binds them.
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
      'claude',
      'gemini', 'gemma', 'palm', 'bard',
      'llama', 'codellama',
      'mistral', 'mixtral', 'falcon',
      'deepseek',
      'glm', 'chatglm',
      'qwen', 'qwen2', 'qwen2.5', 'qwen3', 'qwq', 'tongyi qianwen',
      'ernie',
      'yi',
      'doubao', 'seed',
      'kimi', 'moonshot',
      'hunyuan',
      'spark',
      'sensechat',
      'baichuan',
      'step',
      'minimax', 'abab',
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
    // v1.2.13 fix: 新增「自动重新扫描」设置 —— 解决页面内动态加载/SPA 路由切换后漏翻译
    autoRescan: {
      enabled: false,         // 默认关闭，避免无谓 CPU 占用
      interval: 5,            // 检测间隔（秒），可选 2/5/10/30/60
      idleOnly: true          // 仅当标签页可见（前台）时扫描，后台标签页跳过
    }
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
    translationCache: true,
    scrollTranslate: true,
    shortcutKey: 'Alt+T'
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
    lazyTranslate: true,
    logLevel: 'warn'
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

// api-metadata.js is the single runtime source shared by options/popup pages.
// Keep the embedded object only as a fallback if the metadata script cannot load.
const DEFAULT_SETTINGS = globalThis.DEFAULT_SETTINGS || LEGACY_DEFAULT_SETTINGS;

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

// v1.3.3 security P2-3: 内置厂商端点官方域名白名单。
// 背景：v1.2.16 M3 只校验协议（https/localhost），不限主机——恶意导入文件可把 baidu_llm 等
// 内置厂商端点改写为任意 HTTPS 主机，使 local 存储中的用户真实密钥以 Bearer/签名参数外发。
// 修复：内置厂商端点必须命中官方域名（或本机 localhost 测试地址）；
// 自定义供应商（custom 槽位与 custom_ 前缀）保持任意 HTTPS（自带端点功能本性）。
const BUILTIN_ENDPOINT_HOSTS = {
  baidu: ['fanyi-api.baidu.com'],
  baidu_llm: ['fanyi-api.baidu.com'],
  volcano: ['translate.volcengineapi.com'],
  deepseek: ['api.deepseek.com'],
  glm: ['open.bigmodel.cn'],
  zhipu: ['open.bigmodel.cn'],
  tongyi: ['dashscope.aliyuncs.com'],
  yi: ['api.lingyiwanwu.com'],
  doubao: ['ark.cn-beijing.volces.com']
};

class SettingsManager {
  constructor() {
    this.settings = null;
    this._hostPatternCache = new Map();
    this._pinFailCount = 0;
    this._pinCooldownUntil = 0;
    this._apiStatusCache = null;
    // v1.1.0 perf: 配额重置幂等标记，避免 init/reload/background 多次调用的冗余存储读写
    this._lastQuotaResetDate = null;
    // v1.1.0 perf: 每日/每月用量内存缓存，避免 isApiQuotaReached 循环内逐个读存储
    this._dailyUsageCache = null;
    this._monthlyUsageCache = null;
    // v1.2.13 fix: P2-18 写操作串行化 promise chain，消除 read-modify-write 竞态
    this._writeChain = Promise.resolve();
    this._usageWriteChain = Promise.resolve();
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

  migrateSettings(rawSettings) {
    const migrated = rawSettings && typeof rawSettings === 'object'
      ? JSON.parse(JSON.stringify(rawSettings))
      : {};
    const version = Number.isInteger(migrated.settingsVersion) ? migrated.settingsVersion : 0;
    // v0 -> v1 is intentionally non-destructive: existing default/legacy fields
    // are normalized by _deepMerge and _ensureApiDefaults below.
    if (version < 1) migrated.settingsVersion = 1;
    return migrated;
  }

  async loadSettings() {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const isFirstInstall = !result[SETTINGS_KEY];
    const storedSettings = isFirstInstall ? null : this.migrateSettings(result[SETTINGS_KEY]);

    if (isFirstInstall) {
      this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      this._ensureApiDefaults();
    } else {
      this.settings = this._deepMerge(DEFAULT_SETTINGS, storedSettings);
      this._ensureApiDefaults();
    }

    // v1.0.6 migration: 如果 sync storage 中仍有 apiKeys（旧版本遗留），
    // 迁移到 local storage 并从 sync 中删除
    await this._migrateSyncKeysToLocal(result[SETTINGS_KEY]);

    // 从 local 加载 apiKeys（local storage 中的非空值优先于 sync/default 中的值）
    await this._loadApiKeysFromLocal();

    if (!isFirstInstall && result[SETTINGS_KEY].settingsVersion !== this.settings.settingsVersion) {
      await this.saveSettings(this.settings);
    }

    return this.settings;
  }

  // v1.0.6 migration: 将旧版本存在 sync 中的 apiKeys 迁移到 local storage
  async _migrateSyncKeysToLocal(syncSettings) {
    if (!syncSettings || !syncSettings.api) return;
    const syncKeys = syncSettings.api.apiKeys || {};
    const customKeys = {};
    for (const provider of syncSettings.api.customProviders || []) {
      if (provider && provider.id && typeof provider.apiKey === 'string' && provider.apiKey.length > 0) {
        customKeys[`custom_${provider.id}`] = { apiKey: provider.apiKey };
      }
    }
    const allKeys = { ...syncKeys, ...customKeys };
    const hasRealKey = Object.values(allKeys).some(k =>
      k && typeof k === 'object' && Object.values(k).some(v => typeof v === 'string' && v.length > 0)
    );
    if (!hasRealKey) return;
    try {
      // 合并到 local（不覆盖 local 中已有的非空值）
      const stored = await chrome.storage.local.get(LOCAL_API_KEYS_KEY);
      const localKeys = stored[LOCAL_API_KEYS_KEY] || {};
      for (const [apiName, keyObj] of Object.entries(allKeys)) {
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
      if (Array.isArray(cleaned.api.customProviders)) {
        for (const provider of cleaned.api.customProviders) {
          if (provider && typeof provider.apiKey === 'string') provider.apiKey = '';
        }
      }
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
    // v1.2.3 fix: 防御 null/非对象值，避免 Object.keys(null) 抛出 TypeError 导致初始化失败
    const ep = this.settings.api.apiEndpoints;
    if (!ep || typeof ep !== 'object' || Object.keys(ep).length === 0) {
      this.settings.api.apiEndpoints = JSON.parse(JSON.stringify(API_ENDPOINTS_DEFAULT));
    } else {
      for (const [key, value] of Object.entries(API_ENDPOINTS_DEFAULT)) {
        if (this.settings.api.apiEndpoints[key] === undefined) {
          this.settings.api.apiEndpoints[key] = value;
        }
      }
    }
    const models = this.settings.api.apiModels;
    if (!models || typeof models !== 'object' || Object.keys(models).length === 0) {
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

    // v1.2.13 fix: Bug #3 — 旧版本用户存储中没有 rules.autoRescan，初始化默认值
    if (!this.settings.rules) this.settings.rules = {};
    if (!this.settings.rules.autoRescan || typeof this.settings.rules.autoRescan !== 'object') {
      this.settings.rules.autoRescan = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.rules.autoRescan));
    } else {
      // 合并：保留用户已有的字段，补全缺失的
      const def = DEFAULT_SETTINGS.rules.autoRescan;
      for (const k of Object.keys(def)) {
        if (this.settings.rules.autoRescan[k] === undefined) {
          this.settings.rules.autoRescan[k] = def[k];
        }
      }
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

  // v1.2.16 security: M3 — 统一 HTTPS 端点校验。
  // 所有持久化路径（saveSettings / applyImportedSettings）都经由此处校验，
  // 防止恶意导入或手工篡改把 API 密钥发往明文 http 端点。
  _isEndpointAllowed(endpoint) {
    if (typeof endpoint !== 'string' || endpoint === '') return false;
    try {
      const u = new URL(endpoint);
      if (u.protocol === 'https:') return true;
      if (u.protocol === 'http:') {
        return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
      }
      return false;
    } catch {
      return false;
    }
  }

  // v1.3.3 security P2-3: 内置厂商端点校验——命中官方域名白名单，或本机 localhost 测试地址。
  // 非内置厂商（custom 槽位 / custom_ 前缀 / 未知名称）不受此限制，仍走任意 HTTPS。
  _isBuiltinEndpointAllowed(name, endpoint) {
    const allowedHosts = BUILTIN_ENDPOINT_HOSTS[name];
    if (!allowedHosts) return true;
    try {
      const host = new URL(endpoint).hostname.toLowerCase();
      return allowedHosts.includes(host)
        || host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    } catch {
      return false;
    }
  }

  _assertSafeEndpoints(settings) {
    if (!settings || typeof settings !== 'object') return;
    const api = settings.api;
    if (!api || typeof api !== 'object') return;

    if (api.apiEndpoints && typeof api.apiEndpoints === 'object') {
      for (const [name, endpoint] of Object.entries(api.apiEndpoints)) {
        // 空字符串表示“未配置”，允许保存；非空必须通过 HTTPS/localhost 校验。
        if (endpoint !== '' && !this._isEndpointAllowed(endpoint)) {
          throw new Error(`API 接口地址不安全: ${name}（必须使用 HTTPS，仅 localhost/127.0.0.1 允许 HTTP）`);
        }
        // v1.3.3 security P2-3: 内置厂商端点只允许官方域名，防止导入文件劫持端点外发真实密钥。
        if (endpoint !== '' && !this._isBuiltinEndpointAllowed(name, endpoint)) {
          throw new Error(`内置 API「${name}」的接口地址必须为官方域名（${BUILTIN_ENDPOINT_HOSTS[name].join(' 或 ')}）或本机 localhost 测试地址`);
        }
      }
    }

    if (Array.isArray(api.customProviders)) {
      for (const provider of api.customProviders) {
        if (!provider || typeof provider !== 'object') continue;
        const endpoint = provider.endpoint;
        if (endpoint !== undefined && endpoint !== '' && !this._isEndpointAllowed(endpoint)) {
          throw new Error(`自定义 API 接口地址不安全: ${provider.id || 'unknown'}（必须使用 HTTPS，仅 localhost/127.0.0.1 允许 HTTP）`);
        }
      }
    }
  }

  // v1.2.13 fix: P2-18 — 写操作串行化，所有写 local/sync 的方法都通过此 enqueue，
  // 避免两个 saveSettings 并发执行时 get-modify-set 顺序错乱导致数据丢失
  _enqueueWrite(fn) {
    const next = this._writeChain.then(() => fn(), () => fn());
    // 链上始终保留一个 resolved promise，失败不污染后续
    this._writeChain = next.catch(() => {});
    return next;
  }

  async saveSettings(settings) {
    if (!settings) return;
    return this._enqueueWrite(async () => {
      const incomingSettings = JSON.parse(JSON.stringify(settings));
      // v1.2.16 security: M3 — 统一端点校验下沉到落盘前，覆盖 saveSettings 与导入路径。
      this._assertSafeEndpoints(incomingSettings);
      // v1.2.13 compat: 保存时以已持久化的 sync settings 为基线，再叠加 incoming。
      // 这样旧版本遗留但当前 UI 不认识的字段不会因为一次局部保存被清掉。
      let storedSyncSettings = null;
      try {
        const storedSync = await chrome.storage.sync.get(SETTINGS_KEY);
        storedSyncSettings = storedSync && storedSync[SETTINGS_KEY] ? storedSync[SETTINGS_KEY] : null;
      } catch (e) {
        console.warn('[settings-manager] saveSettings: load existing sync settings failed:', e);
      }
      const baseSettings = storedSyncSettings || this.settings || DEFAULT_SETTINGS;
      const clonedSettings = this._deepMerge(baseSettings, incomingSettings);
      // 提取 apiKeys 单独存 local，避免随 sync 跨设备同步
      const syncData = typeof structuredClone !== 'undefined' ? structuredClone(clonedSettings) : JSON.parse(JSON.stringify(clonedSettings));
      // v1.2.13 fix: Bug #1b — 统一 apiKeys 处理：incoming 视为"想要保留的字段"，
      // 仅当字段为非空字符串时覆盖 local；空字段视为"未变更"，保留 local 已有值。
      // 这样既防止了"全空保护"误触发的保存失败（之前的 P2-18 关联 bug），
      // 也避免 settings-manager 内存中的陈旧数据反向覆盖用户真实输入。
      if (clonedSettings.api) {
        // 始终从 local 读取最新密钥作为基线，incoming 仅用非空字段做合并
        const stored = await chrome.storage.local.get(LOCAL_API_KEYS_KEY);
        const mergedKeys = JSON.parse(JSON.stringify(stored[LOCAL_API_KEYS_KEY] || {}));
        let anyChange = false;

        const mergeNonEmptyKeys = (keysObj, overwrite) => {
          if (!keysObj || typeof keysObj !== 'object') return;
          for (const [apiName, keyObj] of Object.entries(keysObj)) {
            if (!keyObj || typeof keyObj !== 'object') continue;
            if (!mergedKeys[apiName]) mergedKeys[apiName] = {};
            for (const [field, value] of Object.entries(keyObj)) {
              // v1.3.0 fix P2-1: incoming 中 null 表示显式删除该字段，清空单个密钥后能真正移除 local 中已存密钥
              if (value === null) {
                if (overwrite && mergedKeys[apiName][field] !== undefined) {
                  delete mergedKeys[apiName][field];
                  anyChange = true;
                }
                continue;
              }
              if (typeof value === 'string' && value.length > 0) {
                if ((overwrite || !mergedKeys[apiName][field]) && mergedKeys[apiName][field] !== value) {
                  mergedKeys[apiName][field] = value;
                  anyChange = true;
                }
              }
            }
          }
        };

        // 旧版本可能仍把 apiKeys 存在 sync；local 优先，sync 仅补空。
        mergeNonEmptyKeys(storedSyncSettings && storedSyncSettings.api && storedSyncSettings.api.apiKeys, false);
        // incoming 代表用户本次输入，非空值优先覆盖。
        mergeNonEmptyKeys(incomingSettings.api && incomingSettings.api.apiKeys, true);

        if (anyChange) {
          await chrome.storage.local.set({ [LOCAL_API_KEYS_KEY]: mergedKeys });
        }
        // v1.2.13 fix: Bug #1c — 让内存中的 apiKeys 与 storage 保持一致，
        // 否则 settingsManager.settings.api.apiKeys 会保留 incoming 的"局部切片"
        // (例如只有 baidu，丢失 deepseek)，下一次 _ensureApiDefaults 或 UI 读取会误用。
        clonedSettings.api.apiKeys = mergedKeys;
        // sync 中永远不存 apiKeys（始终从 local 加载）
        if (syncData.api) delete syncData.api.apiKeys;
      }

      // v1.0.7: 将 customProviders 中的 apiKey 提取到 local storage，防止随 sync 同步泄漏
      if (syncData.api && Array.isArray(syncData.api.customProviders)) {
        const stored2 = await chrome.storage.local.get(LOCAL_API_KEYS_KEY);
        const existingKeys = JSON.parse(JSON.stringify(stored2[LOCAL_API_KEYS_KEY] || {}));
        let anyCustom = false;
        for (const provider of syncData.api.customProviders) {
          if (provider && typeof provider.apiKey === 'string' && provider.apiKey.length > 0) {
            const key = `custom_${provider.id}`;
            existingKeys[key] = { apiKey: provider.apiKey };
            anyCustom = true;
            // 从 sync 数据中移除 apiKey，保留其他字段
            provider.apiKey = '';
          }
        }
        if (anyCustom) {
          await chrome.storage.local.set({ [LOCAL_API_KEYS_KEY]: existingKeys });
        }
      }

      // 写 sync：必须在所有 local 写完后才能更新 this.settings
      await chrome.storage.sync.set({ [SETTINGS_KEY]: syncData });
      // v1.2.13 fix: Bug #1b — this.settings 必须在 storage 写完后赋值，
      // 之前在写之前赋值会导致并发 getSettings 返回未持久化的状态
      this.settings = clonedSettings;
      if (this.settings.trigger && this.settings.trigger.excludeList) {
        this._hostPatternCache.clear();
      }
    });
  }

  // v1.3.3 security P2-2 / compat F-9: 导入字段类型归一 + null 剥离（就地修改）。
  // 数值型字段非法 → 回退默认值；quotaLimits 条目 limit 非数字 → 丢弃该条目；
  // 对象中除 api.apiKeys 子树（null = 显式删除密钥）以外的 null 值全部剥离，防止透传落盘。
  _normalizeImportedSettings(settings) {
    if (!settings || typeof settings !== 'object') return;
    if (settings.general && typeof settings.general === 'object') {
      if (!Number.isInteger(settings.general.logLevel)
        || settings.general.logLevel < 0 || settings.general.logLevel > 4) {
        settings.general.logLevel = 2;
      }
    }
    if (settings.advanced && typeof settings.advanced === 'object') {
      const advDefaults = { batchSize: 10, requestTimeout: 10, retryCount: 1, retryInterval: 5 };
      for (const [field, fallback] of Object.entries(advDefaults)) {
        const v = settings.advanced[field];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) {
          settings.advanced[field] = fallback;
        }
      }
    }
    if (settings.api && typeof settings.api === 'object'
      && settings.api.quotaLimits && typeof settings.api.quotaLimits === 'object'
      && !Array.isArray(settings.api.quotaLimits)) {
      for (const [name, quota] of Object.entries(settings.api.quotaLimits)) {
        if (!quota || typeof quota !== 'object' || Array.isArray(quota)
          || typeof quota.limit !== 'number' || !Number.isFinite(quota.limit)) {
          delete settings.api.quotaLimits[name];
        }
      }
    }
    const stripNulls = (value, underApiKeys, parentIsApi) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      const out = {};
      for (const [key, v] of Object.entries(value)) {
        const childIsApiKeys = parentIsApi && key === 'apiKeys';
        if (v === null) {
          // 仅 api.apiKeys 子树保留 null（v1.3.1 显式删除密钥契约）；其余 null 剥离不落盘
          if (underApiKeys || childIsApiKeys) out[key] = v;
          continue;
        }
        out[key] = stripNulls(v, underApiKeys || childIsApiKeys, key === 'api');
      }
      return out;
    };
    const stripped = stripNulls(settings, false, false);
    for (const key of Object.keys(settings)) delete settings[key];
    Object.assign(settings, stripped);
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
    // v1.3.3 security P2-2 / compat F-9: 导入字段类型归一 + null 剥离。
    // 背景：applyImportedSettings 之前只校验 apiPriority/enabledApis/customProviders/excludeList/requestTimeout，
    // logLevel/batchSize/quotaLimits[].limit 等字段无类型校验，恶意导入文件可把标记串持久化进 storage，
    // 在设置页诊断工具的 innerHTML 拼接点注入（受 MV3 CSP 兜底但仍可钓鱼伪装/信标）；
    // 非数值字段回退默认值。null 语义仅保留给 api.apiKeys 显式删除（v1.3.1 契约），其余字段 null 一律剥离。
    this._normalizeImportedSettings(cleaned);
    // v1.2.16 security: M3 — 导入路径统一复用 saveSettings 的端点校验（含 customProviders）。
    this._assertSafeEndpoints(cleaned);
    // Reuse the normal save path so API keys and custom-provider secrets are
    // extracted to local storage and never written to sync storage.
    await this.saveSettings(cleaned);
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

    // ===== 通过校验，在副本上更新并成功落盘后替换内存 =====
    const nextSettings = JSON.parse(JSON.stringify(this.settings));
    let current = nextSettings;
    for (let i = 0; i < keys.length - 1; i++) {
      // v1.2.3 fix: 防御路径中间节点为 boolean/number/string 等基本类型时被误覆盖为空对象
      if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    await this.saveSettings(nextSettings);
    if (keys.includes('excludeList')) this._hostPatternCache.clear();
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
  // v1.3.3 fix F-1: 术语表存储区域由 sync 迁移到 local。
  // 背景：chrome.storage.sync 单项配额 QUOTA_BYTES_PER_ITEM = 8KB（unlimitedStorage 权限只解除 local 配额），
  // 而默认术语表约 11KB——旧实现在 sync 上种子写入必然被配额拒绝，且 catch{} 吞掉错误后仍置位 INIT 标记，
  // 导致默认术语表从未生效；用户术语表超过 8KB 后编辑也被静默丢弃。local 区域无此限制。
  // 兼容：读取时自动将旧版本已成功写入 sync 的术语表（≤8KB，含旧 array 格式）迁移到 local 并清理 sync 旧键，幂等。
  async getGlossary() {
    const local = await chrome.storage.local.get([GLOSSARY_KEY, GLOSSARY_INIT_KEY]);
    const storedLocal = local[GLOSSARY_KEY];
    // 向后兼容: 旧 array 格式 → 包成 _global
    if (Array.isArray(storedLocal)) return { _global: storedLocal };
    if (storedLocal && typeof storedLocal === 'object') return storedLocal;

    // 旧版本数据迁移：sync 中可能存有 ≤8KB 的旧术语表（或旧 array 格式）
    try {
      const sync = await chrome.storage.sync.get([GLOSSARY_KEY, GLOSSARY_INIT_KEY]);
      const storedSync = sync[GLOSSARY_KEY];
      if (Array.isArray(storedSync) || (storedSync && typeof storedSync === 'object')) {
        const migrated = Array.isArray(storedSync) ? { _global: storedSync } : storedSync;
        await chrome.storage.local.set({ [GLOSSARY_KEY]: migrated, [GLOSSARY_INIT_KEY]: true });
        await chrome.storage.sync.remove([GLOSSARY_KEY, GLOSSARY_INIT_KEY]);
        console.info('[settings-manager] glossary migrated from sync to local');
        return migrated;
      }
    } catch (error) {
      console.warn('[settings-manager] glossary sync→local migration failed:', error);
    }

    // 首次初始化：种子默认术语表写入 local。
    // v1.3.3 fix F-1: 写入失败时不置位 INIT 标记（下次调用自动重试），不再出现“永久返回空表”。
    try {
      const resp = await fetch(chrome.runtime.getURL('config/default-glossary.json'));
      if (resp.ok) {
        const defaults = await resp.json();
        if (Array.isArray(defaults) && defaults.length > 0) {
          const wrapped = { _global: defaults };
          await chrome.storage.local.set({ [GLOSSARY_KEY]: wrapped, [GLOSSARY_INIT_KEY]: true });
          return wrapped;
        }
      }
    } catch (error) {
      console.warn('[settings-manager] default glossary seed failed (will retry on next call):', error);
    }
    return { _global: [] };
  }

  // v1.0.4: 域名专属术语表（§3.3）— 直接存结构化对象
  async saveGlossary(glossary) {
    // v1.1.0 security: 写入前校验术语表结构，拒绝非法数据污染存储
    // 合法结构：对象 -> { scope: [{ source, target?, preserve? }, ...] }
    if (!glossary || typeof glossary !== 'object' || Array.isArray(glossary)) {
      throw new Error('术语表格式无效：必须为对象');
    }
    for (const [scope, entries] of Object.entries(glossary)) {
      if (typeof scope !== 'string' || scope === '') {
        throw new Error(`术语表格式无效：scope 键非法 (${String(scope)})`);
      }
      // 防御原型链污染
      if (scope === '__proto__' || scope === 'constructor' || scope === 'prototype') {
        throw new Error(`术语表格式无效：禁止的 scope 键 (${scope})`);
      }
      if (!Array.isArray(entries)) {
        throw new Error(`术语表格式无效：scope "${scope}" 的值必须为数组`);
      }
      for (const e of entries) {
        if (!e || typeof e !== 'object' || Array.isArray(e)) {
          throw new Error(`术语表格式无效：scope "${scope}" 中存在非对象条目`);
        }
        // v1.1.0 fix: 允许 source 为空（用户正在编辑的新条目），仅校验非空条目的结构
        if (typeof e.source !== 'string') {
          throw new Error(`术语表格式无效：scope "${scope}" 中条目 source 必须为字符串`);
        }
        if (e.source === '' && (!e.target || e.target === '')) {
          continue; // 空条目跳过，不视为错误
        }
        // target 可选（preserve 模式下可能无 target），但若存在必须为字符串
        if (e.target !== undefined && typeof e.target !== 'string') {
          throw new Error(`术语表格式无效：scope "${scope}" 中存在 target 类型错误的条目`);
        }
        // preserve 可选，若存在必须为布尔
        if (e.preserve !== undefined && typeof e.preserve !== 'boolean') {
          throw new Error(`术语表格式无效：scope "${scope}" 中存在 preserve 类型错误的条目`);
        }
      }
    }
    // v1.3.3 fix F-1: 写入 local（unlimitedStorage，无 8KB 单项配额），不再因 sync 配额静默丢数据
    await chrome.storage.local.set({ [GLOSSARY_KEY]: glossary });
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

  async saveApiStatus(apiName, statusUpdate, baseStatus) {
    const statusKey = `apiStatus_${apiName}`;
    // 只读取和写入单个 API 的状态，避免整体覆盖（修复 read-modify-write 竞态）
    // v1.2.3 fix: 支持传入 baseStatus（来自内存缓存），避免并发时 storage 读取与内存状态不一致导致计数丢失
    const current = (baseStatus && typeof baseStatus === 'object')
      ? { ...baseStatus }
      : ((await chrome.storage.local.get(statusKey))[statusKey] || {});
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
    // v1.1.0 perf: 幂等保护 —— 同一天内已执行过则直接跳过，避免 init/reload/background
    // 多次调用产生的冗余 chrome.storage.local.get(null) 读取与写入
    if (this._lastQuotaResetDate === today) return;
    // v1.0.10 fix: 月份格式统一为 YYYY-MM
    // v1.0.11 fix: 改用本地时间，避免 UTC 与本地时区不一致导致月初配额提前/延后重置
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    // 读取所有键（包括 apiStatus_ 前缀的状态键和日期标记）
    const all = await chrome.storage.local.get(null);
    // v1.3.3 compat F-5: 一次性清理 ≤v1.0.7 遗留的单键聚合 API 状态数据（现无任何读取方，旧 quota 标记语义已废弃）
    if (all['dual_translate_api_status'] !== undefined) {
      try { await chrome.storage.local.remove('dual_translate_api_status'); } catch {}
    }
    const needDailyReset = all[RESET_DATE_KEY] !== today;
    const needMonthlyReset = all[RESET_MONTH_KEY] !== currentMonth;

    // 不需要重置时直接返回（标记今日已检查，后续同日调用直接跳过）
    if (!needDailyReset && !needMonthlyReset) {
      this._lastQuotaResetDate = today;
      return;
    }

    const updates = {};
    let changed = false;

    for (const key of Object.keys(all)) {
      if (!key.startsWith('apiStatus_')) continue;
      const apiName = key.slice(10);
      const status = all[key];
      if (!status || status.status !== 'quota_exceeded') continue;

      if (needDailyReset && !MONTHLY_RESET_APIS.includes(apiName)) {
        // v1.2.2 fix: BUG-2 重置配额时同时清零 consecutiveErrors，避免日度重置后历史错误计数残留导致 API 仍被判定不可用
        updates[key] = { ...status, status: 'available', reason: 'daily_reset', consecutiveErrors: 0, updatedAt: Date.now() };
        changed = true;
      } else if (needMonthlyReset && MONTHLY_RESET_APIS.includes(apiName)) {
        // v1.2.2 fix: BUG-2 月度重置时同时清零 consecutiveErrors，与日度重置保持一致，避免历史错误计数残留导致 API 仍被判定不可用
        updates[key] = { ...status, status: 'available', reason: 'monthly_reset', consecutiveErrors: 0, updatedAt: Date.now() };
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
    // v1.1.0 perf: 标记今日已完成配额重置，后续同日调用直接跳过
    this._lastQuotaResetDate = today;
  }

  async getDailyUsage() {
    const today = new Date().toDateString();
    // v1.1.0 perf: 优先使用内存缓存，避免 isApiQuotaReached 循环内逐个读存储
    if (this._dailyUsageCache && this._dailyUsageCache._date === today) {
      return this._dailyUsageCache;
    }
    const result = await chrome.storage.local.get(DAILY_USAGE_KEY);
    const usage = result[DAILY_USAGE_KEY] || {};
    if (usage._date !== today) {
      // 跨日：返回并缓存空对象（当日首次写入时由 addDailyUsage 更新）
      this._dailyUsageCache = { _date: today };
      return this._dailyUsageCache;
    }
    this._dailyUsageCache = usage;
    return usage;
  }

  async addDailyUsage(apiName, charCount) {
    const run = async () => {
      try {
        let usage = await this.getDailyUsage();
        const today = new Date().toDateString();
        if (usage._date !== today) usage = { _date: today };
        usage[apiName] = (usage[apiName] || 0) + charCount;
        await chrome.storage.local.set({ [DAILY_USAGE_KEY]: usage });
        this._dailyUsageCache = usage;
        try { await this._addMonthlyUsageUnlocked(apiName, charCount); } catch (e) {
          console.warn('[settings-manager] addMonthlyUsage failed (daily usage preserved):', e);
        }
        return usage;
      } catch (e) {
        console.warn('[settings-manager] addDailyUsage failed:', e);
        return this._dailyUsageCache || { _date: new Date().toDateString() };
      }
    };
    const next = this._usageWriteChain.then(run, run);
    this._usageWriteChain = next.catch(() => {});
    return next;
  }

  // v1.0.8: 月度用量统计（用于自定义额度限制）
  async getMonthlyUsage() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; // YYYY-MM
    // v1.1.0 perf: 优先使用内存缓存，避免 isApiQuotaReached 循环内逐个读存储
    if (this._monthlyUsageCache && this._monthlyUsageCache._month === currentMonth) {
      return this._monthlyUsageCache;
    }
    const result = await chrome.storage.local.get(MONTHLY_USAGE_KEY);
    const usage = result[MONTHLY_USAGE_KEY] || {};
    if (usage._month !== currentMonth) {
      // 跨月：返回并缓存空对象（当月首次写入时由 addMonthlyUsage 更新）
      this._monthlyUsageCache = { _month: currentMonth };
      return this._monthlyUsageCache;
    }
    this._monthlyUsageCache = usage;
    return usage;
  }

  async addMonthlyUsage(apiName, charCount) {
    const next = this._usageWriteChain.then(
      () => this._addMonthlyUsageUnlocked(apiName, charCount),
      () => this._addMonthlyUsageUnlocked(apiName, charCount)
    );
    this._usageWriteChain = next.catch(() => {});
    return next;
  }

  async _addMonthlyUsageUnlocked(apiName, charCount) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    let usage = await this.getMonthlyUsage();
    if (usage._month !== currentMonth) {
      // 跨月：创建全新对象，不保留旧数据
      usage = { _month: currentMonth };
    }
    usage[apiName] = (usage[apiName] || 0) + charCount;
    // v1.2.12 fix: P1-5 — 内部 storage 写入也加 try-catch，避免抛出导致翻译结果被丢弃
    try {
      await chrome.storage.local.set({ [MONTHLY_USAGE_KEY]: usage });
      // v1.1.0 perf: 写入后更新内存缓存，使后续 isApiQuotaReached 直接命中缓存
      this._monthlyUsageCache = usage;
    } catch (e) {
      console.warn('[settings-manager] addMonthlyUsage storage write failed:', e);
    }
    return usage;
  }

  // v1.0.8: 检查 API 是否已达到自定义额度限制的 97%
  // v1.0.9: 支持 daily/monthly 重置周期
  // 返回 true 表示已达限制，应切换到下一个 API
  // v1.1.0 perf: getDailyUsage/getMonthlyUsage 已带内存缓存，循环内多次调用不再逐个读存储
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
    this._pinFailCount = parseInt(stateData._pinFailCount, 10) || 0;
    this._pinCooldownUntil = parseInt(stateData._pinCooldownUntil, 10) || 0;

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
    const storedHash = result[PIN_HASH_KEY];
    const salt = result[PIN_SALT_KEY];
    let hash;
    let isLegacyHash = false;
    if (typeof storedHash === 'string' && storedHash.startsWith(PIN_HASH_PREFIX)) {
      hash = await this._hashPin(pin, salt);
    } else {
      // 兼容 v1.2.15 及更早版本的 SHA-256 PIN 哈希；验证成功后自动升级为 PBKDF2。
      hash = await this._legacyHashPin(pin, salt);
      isLegacyHash = true;
    }
    if (this._constantTimeCompare(hash, storedHash)) {
      this._pinFailCount = 0;
      this._pinCooldownUntil = 0;
      // 成功后清除持久化的失败计数和冷却时间
      await chrome.storage.local.remove(['_pinFailCount', '_pinCooldownUntil']);
      // v1.2.16 security: M2 — 旧版 SHA-256 哈希验证通过后立即升级为 PBKDF2。
      if (isLegacyHash) {
        const newSalt = this._generateSalt();
        const newHash = await this._hashPin(pin, newSalt);
        await chrome.storage.local.set({
          [PIN_HASH_KEY]: newHash,
          [PIN_SALT_KEY]: newSalt
        });
      }
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
    return this._bytesToHex(arr);
  }

  _bytesToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // v1.2.16 security: M2 — PBKDF2-HMAC-SHA256 慢哈希（默认 10 万次迭代）。
  async _hashPin(pin, salt) {
    const encoder = new TextEncoder();
    const saltBytes = Uint8Array.from(salt.match(/.{2}/g).map(hex => parseInt(hex, 16)));
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(pin),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations: PIN_PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    return `${PIN_HASH_PREFIX}${PIN_PBKDF2_ITERATIONS}$${this._bytesToHex(bits)}`;
  }

  // v1.2.15 及更早版本的 PIN 哈希格式（SHA-256），仅供旧哈希验证与平滑升级。
  async _legacyHashPin(pin, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return this._bytesToHex(hashBuffer);
  }
}

const settingsManager = new SettingsManager();
export { settingsManager, DEFAULT_SETTINGS };
