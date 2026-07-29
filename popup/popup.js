let currentMode = 'bilingual';
let translationEnabled = true;
let cachedSettings = null;
let cancelPollTimer = null;

// v1.2.2 fix: chrome.runtime.sendMessage 在 MV3 下可能因 Service Worker
// 冷启动而瞬时失败（如 "Could not establish connection"）。此包装函数提供
// 最多 3 次重试、递增间隔（200/400/800ms），提升 popup 与 background 通信可靠性。
async function sendMessageWithRetry(message, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

document.addEventListener('DOMContentLoaded', async () => {
  // v1.2.2 fix: loadState 失败不应导致 popup 完全失灵。
  // 原先无 try/catch，loadState 抛错会中断后续 setupEventListeners()，
  // 使所有按钮无响应。现包裹 try/catch，失败时设置默认状态并继续初始化。
  try {
    await loadState();
  } catch (e) {
    console.warn('[popup] loadState failed:', e);
    cachedSettings = null;
    currentMode = 'bilingual';
    translationEnabled = true;
    updateToggleButton();
    updateModeButtons();
  }
  await Promise.all([loadApiStatus(), loadDailyUsage(), loadCacheInfo()]);
  setupEventListeners();
});

async function loadState() {
  const [response, [tab]] = await Promise.all([
    sendMessageWithRetry({ action: 'getSettings' }),
    chrome.tabs.query({ active: true, currentWindow: true })
  ]);
  cachedSettings = response?.settings || null;
  if (response && response.settings) {
    currentMode = response.settings.general.lastMode || response.settings.display.defaultMode || 'bilingual';
    translationEnabled = response.settings.general.translationEnabled !== false;
    updateToggleButton();
    updateModeButtons();
  }

  if (tab) {
    try {
      const statusRes = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
      if (statusRes) {
        currentMode = statusRes.mode || currentMode;
        updateModeButtons();
        const translating = statusRes?.translating || false;
        updateCancelButton(translating);
        if (translating) {
          startCancelButtonPolling(tab.id);
        }
      }
    } catch {}
  }
  
  await loadSourceLanguage();
}

function updateToggleButton() {
  const btn = document.getElementById('toggleBtn');
  const icon = btn.querySelector('.toggle-icon');
  const text = btn.querySelector('.toggle-text');
  if (translationEnabled) {
    btn.className = 'toggle-btn active';
    if (icon) icon.textContent = '⏸';
    if (text) text.textContent = '关闭翻译';
  } else {
    btn.className = 'toggle-btn inactive';
    if (icon) icon.textContent = '▶';
    if (text) text.textContent = '开启翻译';
  }
}

function updateModeButtons() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === currentMode);
  });
}

function updateCancelButton(translating) {
  const btn = document.getElementById('cancelBtn');
  if (!btn) return;
  if (translating) {
    btn.style.display = 'flex';
    btn.disabled = false;
    btn.classList.remove('cancelling');
    btn.querySelector('.cancel-text').textContent = '取消翻译';
  } else {
    btn.style.display = 'none';
    btn.disabled = false;
    btn.classList.remove('cancelling');
  }
}

function startCancelButtonPolling(tabId) {
  stopCancelButtonPolling();
  cancelPollTimer = setInterval(async () => {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { action: 'getStatus' });
      if (!res || !res.translating) {
        updateCancelButton(false);
        stopCancelButtonPolling();
      }
    } catch {
      // content script 不可用，隐藏按钮
      updateCancelButton(false);
      stopCancelButtonPolling();
    }
  }, 1000);
}

function stopCancelButtonPolling() {
  if (cancelPollTimer) {
    clearInterval(cancelPollTimer);
    cancelPollTimer = null;
  }
}

async function loadSourceLanguage() {
  const settings = cachedSettings;
  if (settings && settings.api) {
    const sourceLang = settings.api.sourceLanguage || 'auto';
    const select = document.getElementById('sourceLangSelect');
    if (select) {
      select.value = sourceLang;
    }
  }
}

async function loadApiStatus() {
  const container = document.getElementById('apiStatus');
  if (!container) return;
  try {
    const res = await sendMessageWithRetry({ action: 'getApiStatus' });
    if (!res || res.error) {
      container.innerHTML = '<div class="no-api-warning">请先在设置中配置至少一个翻译 API</div>';
      return;
    }
    if (!res || !res.status || Object.keys(res.status).length === 0) {
      container.innerHTML = '<div class="no-api-warning">未检测到已配置的 API，请前往设置页面配置</div>';
      return;
    }
    renderApiStatus(res.status, res.configuredCount, res.availableCount);
  } catch {
    container.innerHTML = '<div class="no-api-warning">无法获取 API 状态</div>';
  }
}

function renderApiStatus(statusMap, configuredCount, availableCount) {
  const container = document.getElementById('apiStatus');
  const displayNames = (typeof API_DISPLAY_NAMES !== 'undefined') ? API_DISPLAY_NAMES : {};
  const statusTexts = {
    available: '可用',
    quota_exceeded: '额度不足',
    error: '异常',
    auth_error: '密钥错误',
    unconfigured: '未配置'
  };

  let html = '';
  for (const [name, info] of Object.entries(statusMap)) {
    const status = info.status || 'unconfigured';
    const displayName = info.displayName || displayNames[name] || name;
    const statusLabel = statusTexts[status] || '未知';
    const reason = (info.reason && info.reason !== 'daily_reset' && info.reason !== 'monthly_reset') ? info.reason : '';
    const text = reason ? `${statusLabel} (${escapeAttr(reason)})` : statusLabel;
    html += `
      <div class="api-status-item">
        <span class="api-status-dot ${status}"></span>
        <span class="api-status-name">${escapeAttr(displayName)}</span>
        <span class="api-status-text">${text}</span>
      </div>
    `;
  }
  if (configuredCount > 0 && availableCount === 0) {
    html += '<div class="no-api-warning" style="margin-top:8px">所有 API 暂时不可用</div>';
  }
  container.innerHTML = html;
}

function setupEventListeners() {
  document.getElementById('toggleBtn').addEventListener('click', async () => {
    const btn = document.getElementById('toggleBtn');
    if (btn.disabled) return;
    btn.disabled = true;
    const prevState = translationEnabled;
    translationEnabled = !translationEnabled;
    try {
      await sendMessageWithRetry({ action: 'updateSettings', path: 'general.translationEnabled', value: translationEnabled });
      updateToggleButton();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        try {
          if (translationEnabled) {
            await chrome.tabs.sendMessage(tab.id, { action: 'startTranslation' });
            updateCancelButton(true);
            startCancelButtonPolling(tab.id);
          } else {
            await chrome.tabs.sendMessage(tab.id, { action: 'restoreAll' });
          }
        } catch (e) {
          alert('当前页面无法翻译，请在普通网页上重试');
        }
      }
    } catch (e) {
      translationEnabled = prevState;
      updateToggleButton();
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('modeSelector').addEventListener('click', async (e) => {
    const btn = e.target.closest('.mode-btn');
    if (!btn || btn.classList.contains('active')) return;
    const mode = btn.dataset.mode;
    const prevMode = currentMode;
    currentMode = mode;
    updateModeButtons();
    try {
      await sendMessageWithRetry({ action: 'updateSettings', path: 'general.lastMode', value: mode });
      await sendMessageWithRetry({ action: 'updateSettings', path: 'display.defaultMode', value: mode });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'switchMode', mode });
        } catch (e) {
          currentMode = prevMode;
          updateModeButtons();
          sendMessageWithRetry({ action: 'updateSettings', path: 'general.lastMode', value: prevMode }).catch(() => {});
          sendMessageWithRetry({ action: 'updateSettings', path: 'display.defaultMode', value: prevMode }).catch(() => {});
          alert('切换显示模式失败，请在普通网页上重试');
        }
      }
    } catch (e) {
      currentMode = prevMode;
      updateModeButtons();
      sendMessageWithRetry({ action: 'updateSettings', path: 'general.lastMode', value: prevMode }).catch(() => {});
      sendMessageWithRetry({ action: 'updateSettings', path: 'display.defaultMode', value: prevMode }).catch(() => {});
    }
  });

  // 源语言选择器变更监听
  const sourceLangSelect = document.getElementById('sourceLangSelect');
  const sourceLangHint = document.getElementById('sourceLangHint');
  if (sourceLangSelect) {
    let sourceLangDebounceTimer = null;
    sourceLangSelect.addEventListener('change', (e) => {
      const newLang = e.target.value;
      sourceLangSelect.disabled = true;
      if (sourceLangHint) sourceLangHint.style.display = 'block';
      clearTimeout(sourceLangDebounceTimer);
      sourceLangDebounceTimer = setTimeout(async () => {
        try {
          await sendMessageWithRetry({
            action: 'updateSettings',
            path: 'api.sourceLanguage',
            value: newLang
          });
        } catch (err) {
          alert('切换源语言失败');
        } finally {
          sourceLangSelect.disabled = false;
          if (sourceLangHint) sourceLangHint.style.display = 'none';
        }
      }, 300);
      // background 中已根据 api.sourceLanguage 变更触发 retranslateWithSource，避免重复触发
    });
  }

  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('restoreBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'restoreAll' });
      } catch (e) {
        alert('当前页面无法翻译，请在普通网页上重试');
      }
    }
  });

  // 取消翻译按钮点击事件
  document.getElementById('cancelBtn').addEventListener('click', async () => {
    const btn = document.getElementById('cancelBtn');
    const cancelText = btn.querySelector('.cancel-text');
    const originalText = cancelText.textContent;
    const restoreCancelBtn = () => { btn.disabled = false; btn.classList.remove('cancelling'); cancelText.textContent = originalText; };
    btn.disabled = true;
    btn.classList.add('cancelling');
    cancelText.textContent = '正在取消...';
    let recovered = false;
    const timeoutId = setTimeout(() => {
      if (!recovered) {
        restoreCancelBtn();
        alert('取消超时，请刷新页面重试');
      }
    }, 5000);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        try { await chrome.tabs.sendMessage(tab.id, { action: 'cancelTranslation' }); } catch {}
      }
      recovered = true;
      clearTimeout(timeoutId);
      restoreCancelBtn();
    } catch (e) {
      recovered = true;
      clearTimeout(timeoutId);
      restoreCancelBtn();
      alert('当前页面无法取消，请刷新页面');
    }
  });
}

async function loadCacheInfo() {
  const el = document.getElementById('cacheInfo');
  if (!el) return;
  try {
    const stats = await sendMessageWithRetry({ action: 'getCacheStats' });
    if (stats && stats.total !== undefined) {
      el.textContent = `已缓存 ${stats.active} 条译文（${stats.sizeKB} KB）`;
    } else {
      el.textContent = '缓存未启用';
    }
  } catch {
    el.textContent = '缓存信息不可用';
  }
}

async function loadDailyUsage() {
  const container = document.getElementById('apiUsage');
  if (!container) return;
  try {
    const usage = await sendMessageWithRetry({ action: 'getDailyUsage' });
    if (!usage) {
      container.innerHTML = '<div class="status-loading">暂无数据</div>';
      return;
    }
    const today = new Date().toDateString();
    const displayNames = (typeof API_DISPLAY_NAMES !== 'undefined') ? API_DISPLAY_NAMES : {};
    const items = [];
    if (usage._date === today) {
      for (const [name, count] of Object.entries(usage)) {
        if (name === '_date' || typeof count !== 'number') continue;
        const displayName = displayNames[name] || name;
        items.push({ name, displayName, count });
      }
    }
    if (items.length === 0) {
      container.innerHTML = '<div class="status-loading">今日尚未使用</div>';
      return;
    }
    const max = Math.max(...items.map(i => i.count), 1);
    container.innerHTML = items.map(i => {
      const pct = Math.min(100, Math.round((i.count / max) * 100));
      return `
        <div class="api-usage-item">
          <span class="name">${escapeAttr(i.displayName)}</span>
          <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
          <span class="count">${i.count.toLocaleString()}</span>
        </div>
      `;
    }).join('');
  } catch {
    container.innerHTML = '<div class="status-loading">无法获取用量</div>';
  }
}
