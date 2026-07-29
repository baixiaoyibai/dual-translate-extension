import { settingsManager } from './lib/settings-manager.js';
import { apiManager } from './lib/api-manager.js';
import { translationCache } from './lib/translation-cache.js';

// v1.0.7: storage key 常量（与 settings-manager.js 保持一致）
const LOCAL_API_KEYS_KEY = 'dual_translate_api_keys_local';
const DAILY_USAGE_KEY = 'dual_translate_daily_usage';

// v1.0.19: 运行时日志缓冲区（环形队列，最多 500 条）
// 供设置页诊断工具中的日志查看器使用
const LOG_BUFFER_MAX = 500;
// v1.1.0 perf: 预分配定长数组 + 写指针，避免每次超限都 O(n) shift
const logBuffer = new Array(LOG_BUFFER_MAX);
let logHead = 0;   // 下一个写入位置（取模回绕）
let logCount = 0;   // 当前有效条数（<= LOG_BUFFER_MAX）
let logSeq = 0;

function _getLogLevel() {
  return settingsManager.settings?.general?.logLevel ?? 2;
}

function _pushLog(level, args) {
  const entry = {
    seq: ++logSeq,
    ts: Date.now(),
    level, // 'error' | 'warn' | 'info' | 'debug'
    msg: args.map(a => {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ')
  };
  // v1.1.0 perf: 直接覆写槽位并回绕写指针，O(1) 写入，不再调用 O(n) 的 shift
  logBuffer[logHead] = entry;
  logHead = (logHead + 1) % LOG_BUFFER_MAX;
  if (logCount < LOG_BUFFER_MAX) logCount++;
}

// v1.1.0 perf: 将环形缓冲区按逻辑顺序导出为密集数组，供读取端使用
function _getLogEntries() {
  if (logCount < LOG_BUFFER_MAX) {
    // 未写满：有效条目集中在 [0, logCount)
    return logBuffer.slice(0, logCount);
  }
  // 写满后：tail 起始于 logHead，按时间顺序拼回
  return logBuffer.slice(logHead).concat(logBuffer.slice(0, logHead));
}

// 覆写 console 方法，在保留原生行为的同时写入缓冲区
['error', 'warn', 'info', 'debug', 'log'].forEach(level => {
  const native = console[level].bind(console);
  const mapped = level === 'log' ? 'info' : level;
  console[level] = (...args) => {
    native(...args);
    const lv = _getLogLevel();
    const priority = { error: 1, warn: 2, info: 3, debug: 4 }[mapped] || 3;
    if (lv >= priority) _pushLog(mapped, args);
  };
});

let initialized = false;
let initPromise = null;

async function init() {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await settingsManager.loadSettings();
      await apiManager.init();
      try { await translationCache.sweep(); } catch {}
      setupContextMenu();
      setupCommands();
      // 定期维护：重置API配额 + 清理缓存
      await settingsManager.resetApiQuotaIfNeeded();
      try {
        const s = settingsManager.settings.general?.toggleTranslateShortcut;
        if (s && s !== 'Alt+T') {
          await chrome.commands.update({ name: 'toggle-translate', shortcut: s });
        }
      } catch (e) {
        // v1.0.6 hotfix6: 失败回滚 storage，避免下次启动重复失败并产生噪音
        console.warn('[dual-translate] update shortcut failed, rolling back to Alt+T:', e.message);
        try {
          await settingsManager.updateSetting('general.toggleTranslateShortcut', 'Alt+T');
        } catch (e2) {
          console.warn('[dual-translate] rollback also failed:', e2.message);
        }
      }
      initialized = true;
    } catch(e) {
      initPromise = null; // 允许重试
      throw e;
    }
  })();
  return initPromise;
}

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    if (settingsManager.settings.trigger.contextMenu === false) return;
    chrome.contextMenus.create({
      id: 'translate-selection',
      title: '翻译选中文字',
      contexts: ['selection']
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  await init();
  if (info.menuItemId === 'translate-selection' && info.selectionText) {
    try {
      if (!apiManager.translators || apiManager.translators.size === 0) {
        await apiManager.reload();
      }
      const results = await apiManager.translate([info.selectionText], 'auto', 'zh');
      const translation = results[0]?.translation || '翻译失败';
      chrome.tabs.sendMessage(tab.id, {
        action: 'showSelectionTranslation',
        original: info.selectionText,
        translation: translation
      }).catch(() => {});
    } catch (error) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'showSelectionTranslation',
        original: info.selectionText,
        translation: '翻译失败: ' + error.message
      }).catch(() => {});
    }
  }
});

function setupCommands() {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-translate') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: 'toggleTranslate' }).catch(() => {});
      }
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err?.message || String(err) });
  });
  return true;
});

function _isExtensionSender(sender) {
  if (!sender) return false;
  // v1.1.0 security: 双重校验——URL 前缀 + 扩展 ID，防止跨扩展伪造
  const url = typeof sender.url === 'string' ? sender.url : '';
  return url.startsWith('chrome-extension://') && sender.id === chrome.runtime.id;
}

// v1.1.0 perf: 将写操作白名单提升为模块级常量，避免每条消息都重新构造 Set
// v1.1.0 security: 补充敏感写操作（saveGlossary/clearCache/clearLogs/testApi），统一拦截非扩展页面的调用
const WRITE_ACTIONS = new Set([
  'updateSettings', 'saveSettings', 'importAllSettings', 'reloadApis', 'clearApi',
  'setupPin', 'resetPin', 'saveGlossary', 'clearCache', 'clearLogs', 'testApi'
]);

async function handleMessage(message, sender) {
  await init();

  // 安全修复：写操作仅允许扩展自身页面调用，content script 调用时拒绝
  if (WRITE_ACTIONS.has(message.action) && !_isExtensionSender(sender)) {
    return { error: 'Permission denied' };
  }

  switch (message.action) {
    case 'translateTexts':
      // v1.1.0 perf: 移除翻译前的冗余 flush——handleTranslateTexts 在翻译结束后已统一 flush
      return await handleTranslateTexts(message, sender);

    case 'getSettings': {
      // v1.0.6 fix: 确保返回的 settings 包含 local storage 中的最新 apiKeys
      // 场景：SW 重启后 settingsManager.settings 可能未正确合并 apiKeys，
      //       导致设置页 API 卡片密钥为空，但 popup（走 apiManager）仍正常
      await settingsManager.reloadApiKeys();
      // 安全修复：区分 sender 来源，避免向 content script 暴露 apiKeys
      // 扩展自身页面（popup/options，sender.url 以 chrome-extension:// 开头）返回完整 settings（含 apiKeys）
      // content script（sender.tab 存在，sender.url 为网页地址）返回不含 apiKeys 的精简 settings
      const senderUrl = sender && typeof sender.url === 'string' ? sender.url : '';
      const isExtensionPage = senderUrl.startsWith('chrome-extension://');
      if (isExtensionPage) {
        return { settings: settingsManager.settings };
      }
      // 非 extension 页面（content script 等）：深拷贝并将 apiKeys 置空，防止密钥泄露给网页
      // v1.1.0 perf: 优先 structuredClone；回退时仅深拷贝 api 段，避免整体 JSON 序列化开销
      const _raw = settingsManager.settings;
      let safeSettings;
      if (typeof structuredClone === 'function') {
        safeSettings = structuredClone(_raw);
      } else {
        safeSettings = { ..._raw };
        if (_raw && _raw.api) safeSettings.api = JSON.parse(JSON.stringify(_raw.api));
      }
      if (safeSettings && safeSettings.api) {
        safeSettings.api.apiKeys = {};
        if (Array.isArray(safeSettings.api.customProviders)) {
          for (const p of safeSettings.api.customProviders) { if (p) p.apiKey = ''; }
        }
      }
      return { settings: safeSettings };
    }

    case 'updateSettings':
      if (message.path === 'general.toggleTranslateShortcut' && typeof message.value === 'string') {
        try {
          await chrome.commands.update({ name: 'toggle-translate', shortcut: message.value });
        } catch (e) {
          console.warn('[dual-translate] apply shortcut failed:', e.message);
          return { success: false, error: '该快捷键被浏览器或系统保留，请换一个（例如 Alt+Y）' };
        }
      }
      await settingsManager.updateSetting(message.path, message.value);

      // 如果更新的是 api.sourceLanguage，通知活跃 tab 重新翻译
      if (message.path === 'api.sourceLanguage') {
        // 读取 translationEnabled 状态
        const enabled = settingsManager.getSetting('general.translationEnabled');
        if (enabled !== false) {
          const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
          if (tab && tab.url && tab.url.startsWith('http')) {
            try {
              await chrome.tabs.sendMessage(tab.id, {action:'retranslateWithSource'});
            } catch {
              // content script 未加载，忽略
            }
          }
        }
      }

      return { success: true };

    case 'saveSettings':
      await settingsManager.saveSettings(message.settings);
      await apiManager.reload();
      return { success: true };

    case 'getApiStatus':
      // v1.1.0 security: API 状态属敏感读，仅允许扩展页面调用
      if (!_isExtensionSender(sender)) return { error: 'unauthorized' };
      const summary = apiManager.getApiStatusSummary();
      // v1.1.0 perf: 用 Map 缓存自定义供应商，O(1) 查找替代循环内 find()
      const customProviders = settingsManager.settings.api.customProviders || [];
      const providerMap = new Map(customProviders.map(p => [p.id, p]));
      // 附加 displayName
      for (const [name, info] of Object.entries(summary)) {
        if (name.startsWith('custom_')) {
          const provider = providerMap.get(name.slice(7));
          info.displayName = provider ? provider.name : name;
        }
      }
      return {
        status: summary,
        configuredCount: apiManager.getConfiguredCount(),
        availableCount: apiManager.getAvailableCount()
      };

    case 'testApi':
      // v1.1.0 perf: 移除测试前冗余 flush（testApi 不写缓存，无需提前刷盘）
      // v1.1.0 security: 已纳入 WRITE_ACTIONS，仅扩展页面可调用
      return await apiManager.testApi(message.apiName, message.apiConfig);

    case 'getDailyUsage':
      // v1.1.0 security: 用量数据属敏感读，仅允许扩展页面调用
      if (!_isExtensionSender(sender)) return { error: 'unauthorized' };
      return await settingsManager.getDailyUsage();

    case 'getMonthlyUsage':
      // v1.1.0 security: 用量数据属敏感读，仅允许扩展页面调用
      if (!_isExtensionSender(sender)) return { error: 'unauthorized' };
      return { usage: await settingsManager.getMonthlyUsage() };

    case 'getGlossary':
      return { glossary: await settingsManager.getGlossary() };

    case 'getGlossaryForDomain':
      return { glossary: await settingsManager.getGlossaryForDomain(message.domain) };

    case 'saveGlossary':
      await settingsManager.saveGlossary(message.glossary);
      return { success: true };

    case 'setIconState':
      await updateIcon(sender.tab?.id, message.state);
      return { success: true };

    case 'getLLMPrompt':
      // v1.1.0 security: LLM 提示词属敏感读，仅允许扩展页面调用
      if (!_isExtensionSender(sender)) return { error: 'unauthorized' };
      try {
        const response = await fetch(chrome.runtime.getURL('config/llm-prompt.txt'));
        const text = await response.text();
        return { prompt: text };
      } catch {
        return { prompt: '' };
      }

    case 'reloadApis':
      await apiManager.reload();
      setupContextMenu();
      return {
        configuredCount: apiManager.getConfiguredCount(),
        availableCount: apiManager.getAvailableCount(),
        status: apiManager.getApiStatusSummary()
      };

    case 'clearApi':
      // v1.0.7: 一键清除单个 API 的所有配置信息
      return await handleClearApi(message.apiName);

    case 'hasPin': {
      // v1.1.0 security: PIN 状态属敏感读，仅允许扩展页面调用
      if (!_isExtensionSender(sender)) return { error: 'unauthorized' };
      const has = await settingsManager.hasPin();
      return { has };
    }

    case 'setupPin': {
      const pin = String(message.pin || '');
      if (!/^\d{6}$/.test(pin)) {
        return { success: false, error: 'PIN 必须为 6 位数字' };
      }
      await settingsManager.setupPin(pin);
      return { success: true };
    }

    case 'verifyPin': {
      // v1.1.0 security: PIN 校验属敏感读，仅允许扩展页面调用
      if (!_isExtensionSender(sender)) return { error: 'unauthorized' };
      const pin = String(message.pin || '');
      const result = await settingsManager.verifyPin(pin);
      return result;
    }

    case 'resetPin': {
      await settingsManager.resetPin();
      // v1.1.0 perf: PIN 重置与 API 配置无关，无需 reload apiManager
      return { success: true };
    }

    case 'getCacheStats':
      return await translationCache.getStats();

    case 'clearCache':
      await translationCache.clear();
      return { success: true };

    case 'openOptions':
      chrome.runtime.openOptionsPage();
      return { success: true };

    case 'closeWelcomeTab':
      // 关闭发送此消息的 tab（welcome 页面由 chrome.tabs.create 打开，window.close() 在 tab 里被静默拒绝）
      if (sender && sender.tab && typeof sender.tab.id === 'number') {
        try {
          await chrome.tabs.remove(sender.tab.id);
        } catch {
          // tab 可能已被用户手动关闭，忽略
        }
      }
      return { success: true };

    case 'cancelTranslation':
      if (sender?.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, { action: 'cancelTranslation' }).catch(() => {});
      }
      return { success: true };

    case 'exportAllSettings': {
      // v1.1.0 security: 导出全部设置属敏感读，仅允许扩展页面调用
      if (!_isExtensionSender(sender)) return { error: 'unauthorized' };
      const settings = JSON.parse(JSON.stringify(settingsManager.settings));
      if (settings.api && settings.api.apiKeys) delete settings.api.apiKeys;
      // 安全：清除自定义供应商的 apiKey，防止随导出文件泄露
      if (settings.api && Array.isArray(settings.api.customProviders)) {
        for (const provider of settings.api.customProviders) {
          if (provider) provider.apiKey = '';
        }
      }
      const glossary = await settingsManager.getGlossary();
      let customPrompt = '';
      try {
        const p = await chrome.storage.local.get('dual_translate_custom_llm_prompt');
        customPrompt = p['dual_translate_custom_llm_prompt'] || '';
      } catch {}
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings,
        glossary,
        customPrompt
      };
    }

    case 'importAllSettings':
      if (!message.data || typeof message.data !== 'object') {
        return { success: false, error: '导入数据格式无效' };
      }
      if (!message.data.settings || typeof message.data.settings !== 'object') {
        return { success: false, error: '导入的设置数据无效' };
      }
      await settingsManager.applyImportedSettings(message.data.settings);
      if (message.data.glossary) await settingsManager.saveGlossary(message.data.glossary);
      if (typeof message.data.customPrompt === 'string') {
        if (message.data.customPrompt) {
          await chrome.storage.local.set({ 'dual_translate_custom_llm_prompt': message.data.customPrompt });
        } else {
          await chrome.storage.local.remove('dual_translate_custom_llm_prompt');
        }
      }
      await apiManager.reload();
      return { success: true };

    case 'getLogs':
      // v1.1.0 security: 运行时日志属敏感读，仅允许扩展页面调用
      if (!_isExtensionSender(sender)) return { error: 'unauthorized' };
      // v1.0.19: 供诊断工具日志查看器使用
      // 可选参数: level (过滤级别), limit (返回条数上限), since (起始 seq)
      {
        const level = message.level || 'all';
        const limit = Math.min(message.limit || 500, LOG_BUFFER_MAX);
        const since = message.since || 0;
        let logs = _getLogEntries().filter(e => e.seq > since);
        if (level !== 'all') {
          const priority = { error: 1, warn: 2, info: 3, debug: 4 };
          const threshold = priority[level] || 4;
          logs = logs.filter(e => (priority[e.level] || 3) <= threshold);
        }
        logs = logs.slice(-limit);
        return { logs, total: logCount, nextSeq: logSeq };
      }

    case 'clearLogs':
      // v1.1.0 perf: 环形缓冲区重置 head/count，旧条目将被覆写
      logHead = 0;
      logCount = 0;
      logSeq = 0;
      console.info('[dual-translate] 日志缓冲区已由诊断工具清空');
      return { success: true, cleared: true };

    case 'getLogConfig':
      // v1.1.0 security: 日志配置属敏感读，仅允许扩展页面调用
      if (!_isExtensionSender(sender)) return { error: 'unauthorized' };
      // v1.0.19: 返回当前日志配置信息
      return {
        logLevel: settingsManager.settings?.general?.logLevel ?? 2,
        bufferSize: logCount,
        maxBufferSize: LOG_BUFFER_MAX
      };

    default:
      return { error: `Unknown action: ${message.action}` };
  }
}

// v1.0.7: 一键清除单个 API 的所有配置（密钥/模型/接入点/状态/用量）
async function handleClearApi(apiName) {
  if (!apiName) return { success: false, error: '缺少 apiName' };
  try {
    const settings = settingsManager.settings;

    // 1. 自定义供应商：从 customProviders 和 apiPriority 中彻底删除
    if (apiName.startsWith('custom_')) {
      const providerId = apiName.slice(7);
      if (settings.api.customProviders) {
        settings.api.customProviders = settings.api.customProviders.filter(p => p.id !== providerId);
      }
      settings.api.apiPriority = settings.api.apiPriority.filter(n => n !== apiName);
    } else {
      // 2. 常规 API：清除密钥、模型、接入点
      if (settings.api.apiKeys && settings.api.apiKeys[apiName]) {
        delete settings.api.apiKeys[apiName];
      }
      if (settings.api.apiEndpoints) {
        delete settings.api.apiEndpoints[apiName];
      }
      if (settings.api.apiModels) {
        delete settings.api.apiModels[apiName];
      }
      // 禁用该 API
      if (settings.api.enabledApis) {
        settings.api.enabledApis[apiName] = false;
      }
    }

    // 3. 清除本地存储中的密钥
    const stored = await chrome.storage.local.get(LOCAL_API_KEYS_KEY);
    const localKeys = stored[LOCAL_API_KEYS_KEY] || {};
    if (localKeys[apiName]) {
      delete localKeys[apiName];
      await chrome.storage.local.set({ [LOCAL_API_KEYS_KEY]: localKeys });
    }

    // 4. 清除 API 状态
    await settingsManager.deleteApiStatus(apiName);

    // 5. 清除用量数据
    const usageStored = await chrome.storage.local.get(DAILY_USAGE_KEY);
    const usageData = usageStored[DAILY_USAGE_KEY] || {};
    if (usageData[apiName]) {
      delete usageData[apiName];
      await chrome.storage.local.set({ [DAILY_USAGE_KEY]: usageData });
    }
    // v1.1.0 fix: 直接写 storage 后必须使内存缓存失效，否则 isApiQuotaReached 仍返回旧用量
    settingsManager._dailyUsageCache = null;
    settingsManager._monthlyUsageCache = null;

    // 6. 保存设置（sync + local）
    await settingsManager.saveSettings(settings);

    // 7. 重新加载 API 管理器
    await apiManager.reload();

    console.info(`[background] clearApi: 已清除 ${apiName} 的所有配置`);
    return { success: true };
  } catch (error) {
    console.error('[background] clearApi error:', error);
    return { success: false, error: error.message };
  }
}

async function handleTranslateTexts(message, sender) {
  try {
    // v1.1.0 security: 输入校验，防止畸形/超大请求耗尽资源
    const MAX_TEXTS = 500;
    const MAX_TEXT_LEN = 10000;
    if (!Array.isArray(message.texts)) {
      return { error: 'texts must be an array', translations: [] };
    }
    if (message.texts.length > MAX_TEXTS) {
      return { error: `texts length exceeds limit (${MAX_TEXTS})`, translations: [] };
    }
    for (const t of message.texts) {
      if (typeof t !== 'string') {
        return { error: 'each text must be a string', translations: [] };
      }
      if (t.length > MAX_TEXT_LEN) {
        return { error: `text length exceeds limit (${MAX_TEXT_LEN})`, translations: [] };
      }
    }
    if (message.sourceLang != null && typeof message.sourceLang !== 'string') {
      return { error: 'sourceLang must be a string', translations: [] };
    }
    // v1.0.6 perf: 不再每批 reload——reload 会读 storage + fetch prompt + 重建全部 translator
    // 仅在 init() 和 updateSettings/reloadApis 时 reload，翻译批次直接复用已构建的实例
    if (!apiManager.translators || apiManager.translators.size === 0) {
      await apiManager.reload();
    }
    const sourceLang = message.sourceLang || 'auto';
    const texts = message.texts;
    const cacheEnabled = settingsManager.settings.trigger.translationCache !== false;

    let hits = new Map();
    let misses = texts;
    if (cacheEnabled && texts.length > 0) {
      const r = await translationCache.lookup(texts, sourceLang);
      hits = r.hits;
      misses = r.misses;
    }

    let freshResults = [];
    if (misses.length > 0) {
      freshResults = await apiManager.translate(misses, sourceLang, 'zh');
      if (cacheEnabled) {
        try { await translationCache.store(freshResults, sourceLang); } catch {}
      }
    }

    const freshMap = new Map();
    for (const r of freshResults) {
      if (r && r.original != null) {
        const norm = String(r.original).trim().replace(/\s+/g, ' ');
        if (norm && typeof r.translation === 'string' && r.translation) {
          freshMap.set(norm, r.translation);
        }
      }
    }

    const translations = texts.map((text, i) => {
      const norm = String(text == null ? '' : text).trim().replace(/\s+/g, ' ');
      const cached = hits.get(norm);
      if (cached !== undefined) return { index: i, original: text, translation: cached };
      const fresh = freshMap.get(norm);
      if (fresh !== undefined) return { index: i, original: text, translation: fresh };
      return { index: i, original: text, translation: '' };
    });

    try { await translationCache.flush(); } catch {}
    return { translations };
  } catch (error) {
    const isExtSender = _isExtensionSender(sender);
    return { error: isExtSender ? (error.message || '翻译失败') : '翻译失败，请重试', translations: [] };
  }
}

async function updateIcon(tabId, state) {
  if (!tabId) return;
  let title = '双语翻译助手';

  switch (state) {
    case 'translating':
      title = '翻译中...';
      break;
    case 'translated':
      title = '翻译完成';
      break;
    case 'idle':
    default:
      title = '双语翻译助手';
      break;
  }

  try {
    await Promise.all([
      chrome.action.setTitle({ tabId, title }),
      chrome.action.setBadgeText({ tabId, text: state === 'translating' ? '...' : (state === 'translated' ? '✓' : '') }),
      chrome.action.setBadgeBackgroundColor({ tabId, color: state === 'translating' ? '#2196F3' : '#4CAF50' })
    ]);
  } catch {}
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    await init();
    if (settingsManager.shouldAutoTranslate(tab.url)) {
      chrome.tabs.sendMessage(tabId, { action: 'checkAndTranslate', url: tab.url }).catch(() => {});
    }
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await init();
    await settingsManager.updateSetting('general.hasCompletedWelcome', false);
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
  } else if (details.reason === 'update') {
    await init();
  }
});

// MV3 Service Worker 会在空闲约30秒后休眠，setInterval 会被清除，因此改为在 init() 中执行定期维护

init().catch(e => console.error('[dual-translate] init failed:', e));
