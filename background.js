import { settingsManager } from './lib/settings-manager.js';
import { apiManager } from './lib/api-manager.js';
import { translationCache } from './lib/translation-cache.js';

// v1.0.7: storage key 常量（与 settings-manager.js 保持一致）
const LOCAL_API_KEYS_KEY = 'dual_translate_api_keys_local';
const API_STATUS_KEY = 'dual_translate_api_status';
const DAILY_USAGE_KEY = 'dual_translate_daily_usage';

let initialized = false;
let initPromise = null;

async function init() {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
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
      });
    } catch (error) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'showSelectionTranslation',
        original: info.selectionText,
        translation: '翻译失败: ' + error.message
      });
    }
  }
});

function setupCommands() {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-translate') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: 'toggleTranslate' });
      }
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  await init();
  // v1.0.7 perf: flush 防抖缓存写入，确保 SW 休眠前脏数据已落盘
  try { await translationCache.flush(); } catch {}

  switch (message.action) {
    case 'translateTexts':
      return await handleTranslateTexts(message);

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
      const safeSettings = JSON.parse(JSON.stringify(settingsManager.settings));
      if (safeSettings && safeSettings.api) {
        safeSettings.api.apiKeys = {};
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
      return { success: true };

    case 'getApiStatus':
      const summary = apiManager.getApiStatusSummary();
      // 附加 displayName
      for (const [name, info] of Object.entries(summary)) {
        if (name.startsWith('custom_')) {
          const provider = (settingsManager.settings.api.customProviders || []).find(p => p.id === name.slice(7));
          info.displayName = provider ? provider.name : name;
        }
      }
      return {
        status: summary,
        configuredCount: apiManager.getConfiguredCount(),
        availableCount: apiManager.getAvailableCount()
      };

    case 'testApi':
      return await apiManager.testApi(message.apiName, message.apiConfig);

    case 'getDailyUsage':
      return await settingsManager.getDailyUsage();

    case 'getMonthlyUsage':
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
      const pin = String(message.pin || '');
      const result = await settingsManager.verifyPin(pin);
      return result;
    }

    case 'resetPin': {
      await settingsManager.resetPin();
      await apiManager.reload();
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
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          await chrome.tabs.sendMessage(tab.id, { action: 'cancelTranslation' });
        }
      } catch {}
      return { success: true };

    case 'exportAllSettings': {
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
    const statusStored = await chrome.storage.local.get(API_STATUS_KEY);
    const statusData = statusStored[API_STATUS_KEY] || {};
    if (statusData[apiName]) {
      delete statusData[apiName];
      await chrome.storage.local.set({ [API_STATUS_KEY]: statusData });
    }

    // 5. 清除用量数据
    const usageStored = await chrome.storage.local.get(DAILY_USAGE_KEY);
    const usageData = usageStored[DAILY_USAGE_KEY] || {};
    if (usageData[apiName]) {
      delete usageData[apiName];
      await chrome.storage.local.set({ [DAILY_USAGE_KEY]: usageData });
    }

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

async function handleTranslateTexts(message) {
  try {
    // v1.0.6 perf: 不再每批 reload——reload 会读 storage + fetch prompt + 重建全部 translator
    // 仅在 init() 和 updateSettings/reloadApis 时 reload，翻译批次直接复用已构建的实例
    if (!apiManager.translators || apiManager.translators.size === 0) {
      await apiManager.reload();
    }
    const sourceLang = message.sourceLang || 'auto';
    const texts = message.texts || [];
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
    return { error: error.message, translations: [] };
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

init();
