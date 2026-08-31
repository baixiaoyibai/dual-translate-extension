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
  setupManualTranslate();
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
  await loadSkipChineseSegments();
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

async function loadSkipChineseSegments() {
  const skip = cachedSettings?.rules?.skipChineseSegments !== false;
  const toggle = document.getElementById('skipChineseSegmentsToggle');
  if (toggle) toggle.checked = !skip;
}

async function loadApiStatus() {
  const container = document.getElementById('apiStatus');
  if (!container) return;
  try {
    const res = await sendMessageWithRetry({ action: 'getApiStatus' });
    if (!res || res.error) {
      // v1.2.17 UX: 未配置 API 时提供一键跳转设置的入口，而不是只给一句提示
      container.innerHTML = '<div class="no-api-warning">请先配置至少一个翻译 API<button id="goSettingsFromApiStatus" class="go-settings-btn">前往设置 →</button></div>';
      bindGoSettings(container);
      return;
    }
    if (!res || !res.status || Object.keys(res.status).length === 0) {
      container.innerHTML = '<div class="no-api-warning">未检测到已配置的 API<button id="goSettingsFromApiStatus" class="go-settings-btn">前往设置 →</button></div>';
      bindGoSettings(container);
      return;
    }
    renderApiStatus(res.status, res.configuredCount, res.availableCount);
  } catch {
    container.innerHTML = '<div class="no-api-warning">无法获取 API 状态</div>';
  }
}

// v1.2.17 UX: 绑定「前往设置」跳转（供 API 状态区使用）
function bindGoSettings(container) {
  const btn = container.querySelector('#goSettingsFromApiStatus');
  if (btn) {
    btn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage().catch(() => {});
    });
  }
}

function renderApiStatus(statusMap, configuredCount, availableCount) {
  const container = document.getElementById('apiStatus');
  const displayNames = (typeof API_DISPLAY_NAMES !== 'undefined') ? API_DISPLAY_NAMES : {};
  const statusTexts = {
    available: '可用',
    quota_exceeded: '额度不足',
    rate_limited: '频率限制',
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
          translationEnabled = prevState;
          updateToggleButton();
          await sendMessageWithRetry({ action: 'updateSettings', path: 'general.translationEnabled', value: prevState }).catch(() => {});
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
    // v1.2.13 fix: Bug #2 — 之前 oldLang 在 change 触发时已被浏览器更新为 NEW value，
    // 回滚等于无操作。改为在 mousedown/focus 时缓存真正的旧值
    let previousSourceLang = sourceLangSelect.value;
    sourceLangSelect.addEventListener('mousedown', () => {
      previousSourceLang = sourceLangSelect.value;
    });
    sourceLangSelect.addEventListener('focus', () => {
      previousSourceLang = sourceLangSelect.value;
    });
    sourceLangSelect.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') previousSourceLang = sourceLangSelect.value;
    });
    sourceLangSelect.addEventListener('change', (e) => {
      const oldLang = previousSourceLang;
      const newLang = e.target.value;
      previousSourceLang = newLang;
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
          sourceLangSelect.value = oldLang;
          previousSourceLang = oldLang;
          alert('切换源语言失败');
        } finally {
          sourceLangSelect.disabled = false;
          if (sourceLangHint) sourceLangHint.style.display = 'none';
        }
      }, 300);
      // background 中已根据 api.sourceLanguage 变更触发 retranslateWithSource，避免重复触发
    });
  }

  const skipToggle = document.getElementById('skipChineseSegmentsToggle');
  if (skipToggle) {
    // v1.2.13 fix: Bug #2 — 缓存旧 checked 状态，失败时回滚到旧值
    let previousSkipChecked = skipToggle.checked;
    skipToggle.addEventListener('mousedown', () => {
      previousSkipChecked = skipToggle.checked;
    });
    skipToggle.addEventListener('focus', () => {
      previousSkipChecked = skipToggle.checked;
    });
    skipToggle.addEventListener('keydown', (e) => {
      if (e.key === ' ') previousSkipChecked = skipToggle.checked;
    });
    skipToggle.addEventListener('change', async () => {
      const skipChinese = previousSkipChecked;
      try {
        await sendMessageWithRetry({ action: 'updateSettings', path: 'rules.skipChineseSegments', value: !skipChinese });
        previousSkipChecked = !skipChinese;
      } catch (e) {
        skipToggle.checked = skipChinese;
        previousSkipChecked = skipChinese;
      }
    });
  }

  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage().catch(() => alert('无法打开设置页'));
  });

  // v1.2.17 UX: 诊断工具入口——修复「入口不可发现」问题，翻译异常时用户可自助排查
  const diagnoseBtn = document.getElementById('diagnoseBtn');
  if (diagnoseBtn) {
    diagnoseBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('diagnose.html') });
      window.close();
    });
  }

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

  // 停止翻译按钮点击事件（v1.2.17 UX: 文案由「取消翻译」改为「停止翻译」，与「关闭翻译」明确区分）
  document.getElementById('cancelBtn').addEventListener('click', async () => {
    const btn = document.getElementById('cancelBtn');
    const cancelText = btn.querySelector('.cancel-text');
    const originalText = cancelText.textContent;
    const restoreCancelBtn = () => { btn.disabled = false; btn.classList.remove('cancelling'); cancelText.textContent = originalText; };
    btn.disabled = true;
    btn.classList.add('cancelling');
    cancelText.textContent = '正在停止...';
    let recovered = false;
    const timeoutId = setTimeout(() => {
      if (!recovered) {
        restoreCancelBtn();
        alert('停止超时，当前页面可能无响应，建议刷新页面');
      }
    }, 5000);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'cancelTranslation' });
        } catch (e) {
          throw new Error('当前页面未能确认停止操作');
        }
      }
      recovered = true;
      clearTimeout(timeoutId);
      restoreCancelBtn();
    } catch (e) {
      recovered = true;
      clearTimeout(timeoutId);
      restoreCancelBtn();
      alert('当前页面无法停止翻译，可能是页面未加载翻译脚本，请刷新页面后重试');
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

// v1.2.17 UX: 将技术性错误映射为普通用户可理解的文案（popup 文本翻译用）
function humanizeTranslateError(m) {
  const s = String(m || '');
  if (s.includes('NO_API') || s.includes('没有可用')) return '尚未配置翻译 API，请先在设置中添加密钥';
  if (s.includes('额度') || /quota/i.test(s)) return '翻译服务额度不足，请检查额度或更换翻译源';
  if (s.includes('频率') || /rate.?limit/i.test(s)) return '翻译请求过于频繁，请稍后再试';
  if (s.includes('超时') || /timeout/i.test(s)) return '网络超时，请稍后重试';
  if (/auth|401|403|密钥/i.test(s)) return '密钥校验失败，请检查 API 密钥是否正确';
  if (/network|fetch/i.test(s)) return '网络异常，请检查网络后重试';
  return s || '翻译失败，请稍后重试';
}

// v1.2.15: Manual text translation - bilingual side-by-side layout
function setupManualTranslate() {
  const input = document.getElementById('manualTranslateInput');
  const btn = document.getElementById('manualTranslateBtn');
  const result = document.getElementById('manualTranslateResult');
  if (!input || !btn || !result) return;

  btn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) {
      result.textContent = '请输入要翻译的文本';
      result.className = 'manual-translate-result error';
      return;
    }
    if (text.length > 10000) {
      result.textContent = '文本超过 10000 字符限制';
      result.className = 'manual-translate-result error';
      return;
    }

    btn.disabled = true;
    btn.textContent = '翻译中...';
    result.textContent = '正在翻译...';
    result.className = 'manual-translate-result loading';

    try {
      const sourceLang = (cachedSettings && cachedSettings.api && cachedSettings.api.sourceLanguage) || 'auto';
      const resp = await sendMessageWithRetry({
        action: 'translateTexts',
        texts: [text],
        sourceLang: sourceLang
      });
      if (resp && resp.translations && resp.translations.length > 0 && resp.translations[0].translation) {
        result.textContent = resp.translations[0].translation;
        result.className = 'manual-translate-result';
      } else if (resp && resp.error) {
        // v1.2.17 UX: 错误文案人话化，避免向用户暴露原始技术错误
        result.textContent = humanizeTranslateError(resp.error);
        result.className = 'manual-translate-result error';
      } else {
        result.textContent = '翻译失败，未获得结果';
        result.className = 'manual-translate-result error';
      }
    } catch (e) {
      result.textContent = humanizeTranslateError(e && e.message ? e.message : String(e));
      result.className = 'manual-translate-result error';
    } finally {
      btn.disabled = false;
      btn.textContent = '翻译';
    }
  });
}
