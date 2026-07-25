import { settingsManager } from './lib/settings-manager.js';
import { apiManager } from './lib/api-manager.js';
import { translationCache } from './lib/translation-cache.js';

let initialized = false;

async function init() {
  if (initialized) return;
  await settingsManager.loadSettings();
  await apiManager.init();
  try { await translationCache.sweep(); } catch {}
  setupContextMenu();
  setupCommands();
  // 定期维护：重置API配额 + 清理缓存
  await settingsManager.resetApiQuotaIfNeeded();
  try { await translationCache.sweep(); } catch {}
  initialized = true;
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
      await apiManager.reload();
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

  switch (message.action) {
    case 'translateTexts':
      return await handleTranslateTexts(message);

    case 'getSettings':
      return { settings: settingsManager.settings };

    case 'updateSettings':
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
      await apiManager.reload();
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

    case 'getGlossary':
      return { glossary: await settingsManager.getGlossary() };

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

    case 'getCacheStats':
      return await translationCache.getStats();

    case 'clearCache':
      await translationCache.clear();
      return { success: true };

    case 'openOptions':
      chrome.runtime.openOptionsPage();
      return { success: true };

    case 'cancelTranslation':
      // 转发到当前活跃 tab 的 content script
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          await chrome.tabs.sendMessage(tab.id, { action: 'cancelTranslation' });
        }
      } catch {
        // content script 未加载或已关闭，忽略
      }
      return { success: true };

    default:
      return { error: `Unknown action: ${message.action}` };
  }
}

async function handleTranslateTexts(message) {
  try {
    await apiManager.reload();
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

    return { translations };
  } catch (error) {
    return { error: error.message, translations: [] };
  }
}

async function updateIcon(tabId, state) {
  if (!tabId) return;
  let iconPath = {};
  let title = '双语翻译助手';

  switch (state) {
    case 'translating':
      title = '翻译中...';
      break;
    case 'translated':
      title = '翻译完成';
      break;
    case 'unavailable':
      title = '翻译不可用';
      break;
    case 'idle':
    default:
      title = '双语翻译助手';
      break;
  }

  try {
    await chrome.action.setTitle({ tabId, title });
    await chrome.action.setBadgeText({ tabId, text: state === 'translating' ? '...' : (state === 'translated' ? '✓' : '') });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: state === 'translating' ? '#2196F3' : '#4CAF50' });
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

const INSTALLED_KEYS_KEY = 'dual_translate_installed_keys';

chrome.runtime.onInstalled.addListener(async (details) => {
  const INSTALLED_KEYS_KEY = 'dual_translate_installed_keys';
  async function migrateApiKeysToStorage() {
    const existing = await chrome.storage.local.get(INSTALLED_KEYS_KEY);
    if (existing[INSTALLED_KEYS_KEY] && Object.keys(existing[INSTALLED_KEYS_KEY]).length > 0) {
      return;
    }
    try {
      const resp = await fetch(chrome.runtime.getURL('config/api-keys.json'));
      if (!resp.ok) return;
      const keysData = await resp.json();
      if (!keysData || typeof keysData !== 'object') return;
      await chrome.storage.local.set({ [INSTALLED_KEYS_KEY]: keysData });
    } catch (error) {
      console.log('Failed to migrate API keys:', error);
    }
  }

  if (details.reason === 'install') {
    await migrateApiKeysToStorage();
    await init();
    await settingsManager.updateSetting('general.hasCompletedWelcome', false);
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
  } else if (details.reason === 'update') {
    await migrateApiKeysToStorage();
    await init();
  }
});

// MV3 Service Worker 会在空闲约30秒后休眠，setInterval 会被清除，因此改为在 init() 中执行定期维护

init();
