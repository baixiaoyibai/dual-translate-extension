let settings = null;
// v1.0.4: 域名专属术语表（§3.3）— glossaryByDomain: { _global: [...], "host": [...], "*.wildcard": [...] }
let glossaryByDomain = { _global: [] };
let currentScope = '_global';
let apiStatus = {};
let dailyUsage = {};

const API_DISPLAY_NAMES = (typeof window !== 'undefined' && window.API_DISPLAY_NAMES) ? window.API_DISPLAY_NAMES : {};
const API_FREE_QUOTAS = (typeof window !== 'undefined' && window.API_FREE_QUOTAS) ? window.API_FREE_QUOTAS : {};
const API_CONFIG_FIELDS = {
  baidu: [
    { key: 'appId', label: 'App ID', type: 'text' },
    { key: 'secretKey', label: '密钥', type: 'password' }
  ],
  deepseek: [
    { key: 'apiKey', label: 'API Key', type: 'password' }
  ],
  glm: [
    { key: 'apiKey', label: 'API Key', type: 'password' }
  ],
  baidu_llm: [
    { key: 'appId', label: 'APP ID', type: 'text' },
    { key: 'apiKey', label: 'API Key', type: 'password' }
  ],
  volcano: [
    { key: 'accessKey', label: 'Access Key', type: 'text' },
    { key: 'secretKey', label: 'Secret Key', type: 'password' }
  ],
  tongyi: [
    { key: 'apiKey', label: 'API Key', type: 'password' }
  ],
  zhipu: [
    { key: 'apiKey', label: 'API Key', type: 'password' }
  ],
  yi: [
    { key: 'apiKey', label: 'API Key', type: 'password' }
  ],
  doubao: [
    { key: 'apiKey', label: 'API Key', type: 'password' }
  ],
  custom: [
    { key: 'displayName', label: '显示名称', type: 'text', default: '自定义大模型' },
    { key: 'apiKey', label: 'API Key', type: 'password' }
  ]
};

const DEFAULT_API_ENDPOINTS = (typeof window !== 'undefined' && window.API_ENDPOINTS_DEFAULT) ? window.API_ENDPOINTS_DEFAULT : {};
const DEFAULT_API_MODELS = (typeof window !== 'undefined' && window.API_MODELS_DEFAULT) ? window.API_MODELS_DEFAULT : {};

// === API 密钥安全管理状态 ===
let apiUnlocked = false;          // 解锁状态（页面级，刷新后重置为 false）
// v1.2.2 fix: Bug 1 - 移除前端独立失败计数 (pinFailCount/pinCooldownUntil)，完全依赖后端返回的 error 消息
let pinDialogMode = null;         // 当前 PIN 对话框模式：'verify' | 'setup' | 'reset'
const INCOMPLETE_WARN_KEY = 'dual_translate_incomplete_warned'; // sessionStorage 键

// 掩码函数：密钥中间部分用 • 替换
function maskKey(value) {
  if (!value) return '';
  const v = String(value);
  if (v.length <= 4) return '••••';
  if (v.length <= 8) return v.slice(0, 2) + '••••' + v.slice(-2);
  if (v.length <= 12) return v.slice(0, 3) + '••••' + v.slice(-2);
  return v.slice(0, 4) + '••••' + v.slice(-3);
}

// 检查 API 配置完整性
function checkApiCompleteness(apiName, keys, provider) {
  const missing = [];
  if (apiName.startsWith('custom_')) {
    if (!provider?.apiKey) missing.push('API Key');
    if (!provider?.endpoint) missing.push('Endpoint URL');
    if (!provider?.model) missing.push('Model');
  } else {
    const fields = API_CONFIG_FIELDS[apiName] || [{ key: 'apiKey', label: 'API Key' }];
    for (const f of fields) {
      if (!keys?.[f.key]) missing.push(f.label);
    }
  }
  return { complete: missing.length === 0, missing };
}

document.addEventListener('DOMContentLoaded', async () => {
  // 全局错误捕获：确保任何未捕获的异常都能被记录
  window.addEventListener('error', (e) => {
    console.error('[options] 全局错误:', e.message, e.filename + ':' + e.lineno);
  });

  // 欢迎页覆盖层：每次打开设置页都显示，用户交互后隐藏
  try { setupWelcomeOverlay(); } catch(e) { console.error('[options] setupWelcomeOverlay:', e); }

  // 诊断工具提前初始化（不依赖 settings 数据，确保一定能用）
  try { setupDiagnostics(); } catch(e) { console.error('[options] setupDiagnostics 失败:', e); }

  // 预热 background 的 API 缓存（fire-and-forget，失败不影响设置页加载）
  chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});

  // v1.0.7 fix: 带重试的 loadAllData —— SW 冷启动时首批消息可能超时
  let loadSuccess = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await loadAllData();
      loadSuccess = true;
      break;
    } catch(e) {
      console.error(`[options] loadAllData 第 ${attempt} 次失败:`, e);
      if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }

  // v1.0.7 fix: 即使 loadAllData 成功，也要验证 apiKeys 是否真正加载
  // 场景：getSettings 返回了 settings 但 apiKeys 为空（SW 刚醒，reloadApiKeys 尚未完成）
  if (loadSuccess && settings) {
    const hasApiKeys = _hasNonEmptyApiKeys(settings.api?.apiKeys);
    if (!hasApiKeys) {
      console.warn('[options] settings 已加载但 apiKeys 为空，尝试直接重新获取...');
      try {
        const retryRes = await chrome.runtime.sendMessage({ action: 'getSettings' });
        if (retryRes && retryRes.settings) {
          settings = retryRes.settings;
          console.log('[options] 重新获取 settings 成功，apiKeys 数量:',
            Object.keys(settings.api?.apiKeys || {}).length);
        }
      } catch(e) {
        console.error('[options] 重新获取 settings 失败:', e);
      }
    }
  }

  // 每个 setup 独立 try-catch：一个失败不影响其他
  try { setupTabSwitching(); } catch(e) { console.error('[options] setupTabSwitching:', e); }
  try { setupDisplaySettings(); } catch(e) { console.error('[options] setupDisplaySettings:', e); }
  try { setupRulesSettings(); } catch(e) { console.error('[options] setupRulesSettings:', e); }
  try { setupGlossaryManagement(); } catch(e) { console.error('[options] setupGlossaryManagement:', e); }
  try { setupApiManagement(); } catch(e) { console.error('[options] setupApiManagement:', e); }
  try { setupQuotaSettings(); } catch(e) { console.error('[options] setupQuotaSettings:', e); }
  try { setupTips(); } catch(e) { console.error('[options] setupTips:', e); }
  try { setupAdvancedSettings(); } catch(e) { console.error('[options] setupAdvancedSettings:', e); }

  // 如果 settings 仍为 null，在 API 区域显示错误提示
  if (!settings) {
    const container = document.getElementById('apiCardsContainer');
    if (container) {
      container.innerHTML = '<div style="padding:20px;color:#f44336;">⚠ 无法加载设置数据。请尝试刷新页面，或点击上方"刷新API配置"按钮。</div>';
    }
    updateApiDebugStatus();
  }
});

// v1.0.7: 检查 apiKeys 是否包含至少一个非空值
function _hasNonEmptyApiKeys(apiKeys) {
  if (!apiKeys || typeof apiKeys !== 'object') return false;
  return Object.values(apiKeys).some(k =>
    k && typeof k === 'object' &&
    Object.values(k).some(v => typeof v === 'string' && v.length > 0)
  );
}

// v1.0.7: 手动刷新 API 配置（用户点击"刷新API配置"按钮时调用）
async function refreshApiSettings() {
  const container = document.getElementById('apiCardsContainer');
  const statusEl = document.getElementById('apiDebugStatus');
  if (container) {
    container.innerHTML = '<div style="padding:20px;color:#888;">正在重新加载 API 配置...</div>';
  }
  if (statusEl) { statusEl.textContent = '正在刷新...'; statusEl.style.color = '#888'; }
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (res && res.settings) {
      settings = res.settings;
      const keyCount = Object.keys(settings.api?.apiKeys || {}).length;
      const hasKeys = _hasNonEmptyApiKeys(settings.api?.apiKeys);
      console.log('[options] refreshApiSettings: 成功, apiKeys 数量:', keyCount, '有非空值:', hasKeys);
      renderApiCards();
      renderApiPriority();
      renderApiUsage();
      renderQuotaLimits();
      renderMonthlyUsage();
      showSavedTip();
    } else {
      if (container) {
        container.innerHTML = '<div style="padding:20px;color:#f44336;">⚠ 刷新失败：未收到有效数据。</div>';
      }
      if (statusEl) { statusEl.textContent = '⚠ 刷新失败'; statusEl.style.color = '#f44336'; }
    }
  } catch(e) {
    console.error('[options] refreshApiSettings 失败:', e);
    if (container) {
      container.innerHTML = `<div style="padding:20px;color:#f44336;">⚠ 刷新失败：${escapeAttr(e.message || '未知错误')}</div>`;
    }
    if (statusEl) { statusEl.textContent = '⚠ 刷新失败: ' + escapeAttr(e.message || '未知错误'); statusEl.style.color = '#f44336'; }
  }
}

function showSavedTip() {
  const tip = document.getElementById('savedTip');
  if (!tip) return;
  tip.classList.add('show');
  setTimeout(() => tip.classList.remove('show'), 1500);
}

async function loadAllData() {
  // 使用 Promise.allSettled 确保单个消息失败不会导致全部数据加载失败
  const results = await Promise.allSettled([
    chrome.runtime.sendMessage({ action: 'getSettings' }),
    chrome.runtime.sendMessage({ action: 'getGlossary' }),
    chrome.runtime.sendMessage({ action: 'getApiStatus' }),
    chrome.runtime.sendMessage({ action: 'getDailyUsage' })
  ]);

  // 调试日志：帮助定位数据加载问题
  console.log('[options] loadAllData results:', results.map((r, i) => ({
    idx: i,
    status: r.status,
    hasValue: r.status === 'fulfilled' && r.value != null,
    error: r.status === 'rejected' ? r.reason?.message : undefined
  })));

  const res = results[0].status === 'fulfilled' ? results[0].value : null;
  const glossaryRes = results[1].status === 'fulfilled' ? results[1].value : null;
  const apiRes = results[2].status === 'fulfilled' ? results[2].value : null;
  const usageRes = results[3].status === 'fulfilled' ? results[3].value : null;

  if (res && res.settings) {
    settings = res.settings;
    // 调试日志：检查 apiKeys 是否被正确加载
    const apiKeys = settings.api?.apiKeys || {};
    const keySummary = {};
    for (const [name, obj] of Object.entries(apiKeys)) {
      if (obj && typeof obj === 'object') {
        keySummary[name] = {};
        for (const [field, val] of Object.entries(obj)) {
          keySummary[name][field] = (typeof val === 'string' && val.length > 0) ? '有值' : '空';
        }
      }
    }
    console.log('[options] settings.api 摘要:', {
      apiPriority: settings.api?.apiPriority,
      enabledApis: settings.api?.enabledApis,
      apiKeysSummary: keySummary
    });
  } else {
    console.error('[options] getSettings 返回无效:', res);
  }
  if (glossaryRes && glossaryRes.glossary) {
    glossaryByDomain = glossaryRes.glossary;
    if (!glossaryByDomain._global) glossaryByDomain._global = [];
  }
  if (apiRes && apiRes.status) {
    apiStatus = apiRes.status;
  }
  if (usageRes) {
    dailyUsage = usageRes;
  }

  // 保存当前 settings 到 window，供 checkAllApiCompleteness 使用
  window.__currentSettings = settings;

  // 检查所有 API 完整性，首次进入时警告1次
  // v1.0.7 fix: 用 setTimeout 延迟执行，避免 alert 阻塞 DOMContentLoaded 期间的 setup 函数
  setTimeout(() => checkAllApiCompleteness(), 100);
}

async function saveSetting(path, value) {
  await chrome.runtime.sendMessage({ action: 'updateSettings', path, value });
}

async function saveAllSettings(newSettings) {
  await chrome.runtime.sendMessage({ action: 'saveSettings', settings: newSettings });
  settings = newSettings;
}

function setupWelcomeOverlay() {
  const overlay = document.getElementById('welcomeOverlay');
  if (!overlay) return;

  const enterBtn = document.getElementById('welcomeEnterBtn');
  const skipLink = document.getElementById('welcomeSkipLink');

  // v1.2.2 fix: Bug 12 - 将 escHandler 提取为命名函数，使 hideOverlay 能在按钮关闭时移除监听器
  function escHandler(e) {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      hideOverlay();
    }
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
    // 移除 ESC 键监听器，避免通过按钮关闭时遗留
    document.removeEventListener('keydown', escHandler);
    // 延迟移除 DOM 节点，避免覆盖层残留拦截交互
    setTimeout(() => { overlay.remove(); }, 300);
  }

  if (enterBtn) {
    enterBtn.addEventListener('click', hideOverlay);
  }
  if (skipLink) {
    skipLink.addEventListener('click', (e) => {
      e.preventDefault();
      hideOverlay();
    });
  }

  // ESC 键也可关闭欢迎页
  document.addEventListener('keydown', escHandler);
}

function setupTabSwitching() {
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      // v1.0.8: 切换到温馨提示页时，将当前显示设置应用到翻译示例
      if (tab.dataset.tab === 'tips') {
        setupTips();
      }
    });
  });
}

function setupDisplaySettings() {
  if (!settings) return;
  const d = settings.display;

  const defaultMode = document.getElementById('defaultMode');
  defaultMode.value = d.defaultMode;
  defaultMode.addEventListener('change', () => {
    settings.display.defaultMode = defaultMode.value;
    saveSetting('display.defaultMode', defaultMode.value);
    showSavedTip();
  });

  const translationColor = document.getElementById('translationColor');
  translationColor.value = d.translationColor;
  translationColor.addEventListener('change', () => {
    settings.display.translationColor = translationColor.value;
    saveSetting('display.translationColor', translationColor.value);
    showSavedTip();
  });

  const translationSize = document.getElementById('translationSize');
  translationSize.value = d.translationSize;
  translationSize.addEventListener('change', () => {
    settings.display.translationSize = translationSize.value;
    saveSetting('display.translationSize', translationSize.value);
    showSavedTip();
  });

  const translationFont = document.getElementById('translationFont');
  translationFont.value = d.translationFont || '';
  translationFont.addEventListener('change', () => {
    const v = translationFont.value;
    // P2-02 兜底: 即便绕过 HTML pattern, JS 也拒绝危险值
    if (v && !/^[\w\s,.'"\-]{0,100}$/.test(v)) {
      alert('字体名包含非法字符，请使用字母/数字/常见符号');
      translationFont.value = d.translationFont || '';
      return;
    }
    settings.display.translationFont = v;
    saveSetting('display.translationFont', v);
    showSavedTip();
  });

  const translationSpacing = document.getElementById('translationSpacing');
  translationSpacing.value = d.translationSpacing;
  translationSpacing.addEventListener('change', () => {
    const v = translationSpacing.value;
    // P2-02 兜底: 拒绝含 ; { } ( ) 等 CSS 注入字符
    if (!/^[0-9]+(\.[0-9]+)?(px|em|rem|%|vh|vw)?$/.test(v)) {
      alert('间距格式不合法，应为数字+单位 (如 4px / 1.5em / 50%)');
      translationSpacing.value = d.translationSpacing;
      return;
    }
    settings.display.translationSpacing = v;
    saveSetting('display.translationSpacing', v);
    showSavedTip();
  });

  const hoverDelay = document.getElementById('hoverDelay');
  hoverDelay.value = d.hoverDelay;
  hoverDelay.addEventListener('change', () => {
    settings.display.hoverDelay = parseInt(hoverDelay.value);
    saveSetting('display.hoverDelay', parseInt(hoverDelay.value));
    showSavedTip();
  });

  const panelPosition = document.getElementById('panelPosition');
  panelPosition.value = d.panelPosition;
  panelPosition.addEventListener('change', () => {
    settings.display.panelPosition = panelPosition.value;
    saveSetting('display.panelPosition', panelPosition.value);
    showSavedTip();
  });

  const panelWidth = document.getElementById('panelWidth');
  panelWidth.value = d.panelWidth;
  panelWidth.addEventListener('change', () => {
    settings.display.panelWidth = parseInt(panelWidth.value);
    saveSetting('display.panelWidth', parseInt(panelWidth.value));
    showSavedTip();
  });

  // v1.0.2: §3.2 页面元素翻译开关
  bindToggle('translatePageTitle', 'display.translatePageTitle', d.translatePageTitle !== false);
  bindToggle('translateImgAlt', 'display.translateImgAlt', d.translateImgAlt !== false);

  const toggleTranslateShortcutEl = document.getElementById('toggleTranslateShortcut');
  if (toggleTranslateShortcutEl) {
    const cur = settings.general?.toggleTranslateShortcut || 'Alt+T';
    toggleTranslateShortcutEl.value = cur;
    toggleTranslateShortcutEl.addEventListener('change', async () => {
      const oldVal = settings.general?.toggleTranslateShortcut || 'Alt+T';
      const res = await chrome.runtime.sendMessage({ action: 'updateSettings', path: 'general.toggleTranslateShortcut', value: toggleTranslateShortcutEl.value });
      if (res && res.success === false) {
        alert('快捷键设置失败：' + (res.error || '未知错误'));
        toggleTranslateShortcutEl.value = oldVal;
      } else {
        settings.general.toggleTranslateShortcut = toggleTranslateShortcutEl.value;
        showSavedTip();
      }
    });
  }
}

function setupRulesSettings() {
  if (!settings) return;
  const r = settings.rules;
  const t = settings.trigger;

  bindToggle('onlyEnJa', 'rules.onlyEnJa', r.onlyEnJa);
  bindToggle('translateCodeBlocks', 'rules.translateCodeBlocks', r.translateCodeBlocks);
  bindNumber('minTextLength', 'rules.minTextLength', r.minTextLength);
  bindToggle('autoTranslate', 'trigger.autoTranslate', t.autoTranslate);
  bindToggle('contextMenu', 'trigger.contextMenu', t.contextMenu);
  bindNumber('translateDelay', 'trigger.translateDelay', t.translateDelay);
  bindToggle('translationCache', 'trigger.translationCache', t.translationCache);

  const excludeMode = document.getElementById('excludeMode');
  excludeMode.value = t.excludeMode;
  excludeMode.addEventListener('change', () => {
    settings.trigger.excludeMode = excludeMode.value;
    saveSetting('trigger.excludeMode', excludeMode.value);
    showSavedTip();
  });

  renderExcludeList();
}

function bindToggle(elementId, path, value) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.checked = value;
  el.addEventListener('change', () => {
    saveSetting(path, el.checked);
    const keys = path.split('.');
    let current = settings;
    for (let i = 0; i < keys.length - 1; i++) current = current[keys[i]];
    current[keys[keys.length - 1]] = el.checked;
    if (path === 'trigger.contextMenu') {
      // v1.2.2 fix: reloadApis 添加 .catch 避免未捕获 promise 拒绝
      chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});
    }
    showSavedTip();
  });
}

function bindNumber(elementId, path, value) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.value = value;
  el.addEventListener('change', () => {
    saveSetting(path, parseInt(el.value));
    const keys = path.split('.');
    let current = settings;
    for (let i = 0; i < keys.length - 1; i++) current = current[keys[i]];
    current[keys[keys.length - 1]] = parseInt(el.value);
    showSavedTip();
  });
}

function renderExcludeList() {
  const container = document.getElementById('excludeList');
  const list = settings.trigger.excludeList || [];
  container.innerHTML = list.map((domain, i) => `
    <div class="exclude-item">
      <span>${escapeAttr(domain)}</span>
      <button data-index="${i}" class="remove-exclude">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.remove-exclude').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      settings.trigger.excludeList.splice(idx, 1);
      saveSetting('trigger.excludeList', settings.trigger.excludeList);
      renderExcludeList();
      showSavedTip();
    });
  });
}

document.getElementById('addExcludeBtn')?.addEventListener('click', () => {
  if (!settings) { alert('设置正在加载中，请稍候...'); return; }
  const input = document.getElementById('newExcludeDomain');
  const domain = input.value.trim();
  if (!domain) return;
  if (!/^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
    alert('格式无效，应为 example.com 或 *.example.com');
    return;
  }
  if (!settings.trigger.excludeList) settings.trigger.excludeList = [];
  if (settings.trigger.excludeList.includes(domain)) {
    alert('该域名已存在');
    return;
  }
  settings.trigger.excludeList.push(domain);
  saveSetting('trigger.excludeList', settings.trigger.excludeList);
  renderExcludeList();
  showSavedTip();
  input.value = '';
});

function getCurrentEntries() {
  if (!glossaryByDomain[currentScope]) glossaryByDomain[currentScope] = [];
  return glossaryByDomain[currentScope];
}

function populateScopeSelect() {
  const select = document.getElementById('glossaryScope');
  if (!select) return;
  select.innerHTML = '';
  const keys = Object.keys(glossaryByDomain).sort((a, b) => {
    if (a === '_global') return -1;
    if (b === '_global') return 1;
    return a.localeCompare(b);
  });
  for (const k of keys) {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = (k === '_global') ? '🌐 全局' : k;
    if (k === currentScope) opt.selected = true;
    select.appendChild(opt);
  }
}

function setupGlossaryManagement() {
  populateScopeSelect();

  document.getElementById('addGlossaryBtn').addEventListener('click', () => {
    getCurrentEntries().push({ source: '', target: '', matchType: 'exact', preserve: false });
    renderGlossaryTable();
    // v1.2.2 fix: Bug 5 - 添加 .catch 防止未处理的 Promise 拒绝
    saveGlossary().catch(e => console.warn('[glossary] saveGlossary failed:', e));
    const rows = document.querySelectorAll('#glossaryTable tbody tr');
    if (rows.length) {
      const lastRow = rows[rows.length - 1];
      const firstInput = lastRow.querySelector('input');
      if (firstInput) firstInput.focus();
    }
  });

  document.getElementById('exportGlossaryBtn').addEventListener('click', () => {
    const area = document.getElementById('importExportArea');
    area.style.display = 'block';
    const textarea = document.getElementById('importExportText');
    // 导出仅当前 scope（v1.0.4 域名专属）
    textarea.value = JSON.stringify(getCurrentEntries(), null, 2);
    const btn = document.getElementById('confirmImportBtn');
    const orig = btn.textContent;
    btn.textContent = '已导出 ✓';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 3000);
  });

  document.getElementById('importGlossaryBtn').addEventListener('click', () => {
    const area = document.getElementById('importExportArea');
    area.style.display = 'block';
    const textarea = document.getElementById('importExportText');
    textarea.value = '';
    textarea.placeholder = '在此粘贴 JSON 格式的术语表...';
    document.getElementById('confirmImportBtn').textContent = '确认导入';
  });

  document.getElementById('confirmImportBtn').addEventListener('click', () => {
    const text = document.getElementById('importExportText').value.trim();
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('格式错误');
      glossaryByDomain[currentScope] = data;
      renderGlossaryTable();
      // v1.2.2 fix: Bug 5 - 添加 .catch 防止未处理的 Promise 拒绝
      saveGlossary().catch(e => console.warn('[glossary] saveGlossary failed:', e));
      document.getElementById('importExportArea').style.display = 'none';
      showSavedTip();
    } catch (e) {
      alert('JSON 格式无效：' + e.message);
    }
  });

  document.getElementById('cancelImportBtn').addEventListener('click', () => {
    document.getElementById('importExportArea').style.display = 'none';
  });

  document.getElementById('resetGlossaryBtn').addEventListener('click', async () => {
    if (!confirm('确定恢复默认术语表？当前自定义的术语将被覆盖。')) return;
    try {
      const resp = await fetch(chrome.runtime.getURL('config/default-glossary.json'));
      const defaults = await resp.json();
      if (!Array.isArray(defaults)) throw new Error('默认术语表格式错误');
      // 恢复默认 → 写入 _global
      glossaryByDomain._global = defaults;
      // 清理其他 scope（让用户重头开始）
      for (const k of Object.keys(glossaryByDomain)) {
        if (k !== '_global') delete glossaryByDomain[k];
      }
      currentScope = '_global';
      populateScopeSelect();
      renderGlossaryTable();
      await saveGlossary();
      showSavedTip();
    } catch (e) {
      alert('恢复默认术语表失败：' + e.message);
    }
  });

  // v1.0.4: 切换 scope 重新渲染
  document.getElementById('glossaryScope').addEventListener('change', (e) => {
    currentScope = e.target.value;
    renderGlossaryTable();
  });

  // v1.0.4: 添加新域名 scope
  document.getElementById('addScopeBtn').addEventListener('click', () => {
    const input = document.getElementById('addCustomScope');
    const host = (input.value || '').trim();
    if (!host) { alert('请输入域名，如 example.com 或 *.example.com'); return; }
    if (host === '_global') { alert('_global 是保留名'); return; }
    if (glossaryByDomain[host]) { alert('该域名已存在'); currentScope = host; populateScopeSelect(); renderGlossaryTable(); return; }
    // 简单校验：必须是字母数字 + . + - + *
    if (!/^[a-z0-9.*-]+$/i.test(host)) { alert('域名格式无效'); return; }
    glossaryByDomain[host] = [];
    currentScope = host;
    input.value = '';
    populateScopeSelect();
    renderGlossaryTable();
    // v1.2.2 fix: Bug 5 - 添加 .catch 防止未处理的 Promise 拒绝
    saveGlossary().catch(e => console.warn('[glossary] saveGlossary failed:', e));
  });

  // v1.0.4: 删除当前 scope（_global 不可删）
  document.getElementById('deleteScopeBtn').addEventListener('click', () => {
    if (currentScope === '_global') { alert('全局范围不可删除'); return; }
    if (!confirm(`确定删除域名范围 "${currentScope}" 的所有术语？`)) return;
    delete glossaryByDomain[currentScope];
    currentScope = '_global';
    populateScopeSelect();
    renderGlossaryTable();
    // v1.2.2 fix: Bug 5 - 添加 .catch 防止未处理的 Promise 拒绝
    saveGlossary().catch(e => console.warn('[glossary] saveGlossary failed:', e));
  });

  renderGlossaryTable();
}

function renderGlossaryTable() {
  const tbody = document.getElementById('glossaryBody');
  const entries = getCurrentEntries();
  tbody.innerHTML = entries.map((entry, i) => `
    <tr>
      <td><input type="text" value="${escapeAttr(entry.source)}" data-index="${i}" data-field="source"></td>
      <td><input type="text" value="${escapeAttr(entry.target)}" data-index="${i}" data-field="target"></td>
      <td>
        <select data-index="${i}" data-field="matchType">
          <option value="exact" ${entry.matchType === 'exact' ? 'selected' : ''}>精确匹配</option>
          <option value="fuzzy" ${entry.matchType === 'fuzzy' ? 'selected' : ''}>模糊匹配</option>
        </select>
      </td>
      <td>
        <label class="toggle-switch">
          <input type="checkbox" data-index="${i}" data-field="preserve" ${entry.preserve ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td><button class="btn btn-danger btn-sm" data-index="${i}" data-action="delete">删除</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('input[data-field]').forEach(input => {
    input.addEventListener('change', () => {
      const idx = parseInt(input.dataset.index);
      const field = input.dataset.field;
      const arr = getCurrentEntries();
      if (!arr[idx]) return;
      arr[idx][field] = input.type === 'checkbox' ? input.checked : input.value;
      // v1.2.2 fix: Bug 5 - 添加 .catch 防止未处理的 Promise 拒绝
      saveGlossary().catch(e => console.warn('[glossary] saveGlossary failed:', e));
    });
  });

  tbody.querySelectorAll('select[data-field]').forEach(select => {
    select.addEventListener('change', () => {
      const idx = parseInt(select.dataset.index);
      const arr = getCurrentEntries();
      if (!arr[idx]) return;
      arr[idx].matchType = select.value;
      // v1.2.2 fix: Bug 5 - 添加 .catch 防止未处理的 Promise 拒绝
      saveGlossary().catch(e => console.warn('[glossary] saveGlossary failed:', e));
    });
  });

  tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      const arr = getCurrentEntries();
      if (idx < 0 || idx >= arr.length) return;
      arr.splice(idx, 1);
      renderGlossaryTable();
      // v1.2.2 fix: Bug 5 - 添加 .catch 防止未处理的 Promise 拒绝
      saveGlossary().catch(e => console.warn('[glossary] saveGlossary failed:', e));
    });
  });
}

async function saveGlossary() {
  await chrome.runtime.sendMessage({ action: 'saveGlossary', glossary: glossaryByDomain });
}

const API_STATUS_LABELS = { available: '可用', quota_exceeded: '额度不足', error: '异常', auth_error: '密钥错误' };
function getStatusLabel(status) { return API_STATUS_LABELS[status] || '未配置'; }

function setupApiManagement() {
  // v1.0.7: 绑定刷新按钮（即使 settings 为 null 也允许刷新）
  const refreshBtn = document.getElementById('refreshApiBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshApiSettings);
  }

  // v1.0.7: 绑定添加自定义大模型按钮
  const addBtn = document.getElementById('addCustomProviderBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (!settings) return;
      const providers = settings.api.customProviders || [];
      const newProvider = {
        id: 'provider_' + Date.now(),
        name: '新大模型',
        apiKey: '',
        endpoint: '',
        model: '',
        enabled: true
      };
      providers.push(newProvider);
      settings.api.customProviders = providers;

      // 将 'custom_' + newProvider.id 加入 apiPriority
      const idx = settings.api.apiPriority.indexOf('custom');
      if (idx >= 0) {
        settings.api.apiPriority.splice(idx + 1, 0, 'custom_' + newProvider.id);
      } else {
        settings.api.apiPriority.push('custom_' + newProvider.id);
      }

      saveAllSettings(settings).then(() => {
        // v1.2.2 fix: reloadApis 添加 .catch 避免未捕获 promise 拒绝
        chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});
        renderApiCards();
        renderApiPriority();
        renderApiUsage();
        // v1.0.19: 新增自定义供应商后联动刷新额度限制和月度用量标签页
        renderQuotaLimits();
        renderMonthlyUsage();
        showSavedTip();
        // v1.2.2 fix: saveAllSettings.then 链添加 .catch 捕获保存失败
      }).catch(e => console.warn('[options] saveAllSettings failed:', e));
    });
  }

  // === API 安全锁按钮及 PIN 对话框事件绑定 ===
  const unlockApiBtn = document.getElementById('unlockApiBtn');
  if (unlockApiBtn) {
    unlockApiBtn.addEventListener('click', handleUnlockClick);
  }

  const pinCancelBtn = document.getElementById('pinCancelBtn');
  if (pinCancelBtn) {
    pinCancelBtn.addEventListener('click', hidePinDialog);
  }

  const pinConfirmBtn = document.getElementById('pinConfirmBtn');
  if (pinConfirmBtn) {
    pinConfirmBtn.addEventListener('click', handlePinConfirm);
  }

  const pinInputEl = document.getElementById('pinInput');
  if (pinInputEl) {
    pinInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handlePinConfirm();
    });
    pinInputEl.addEventListener('input', (e) => {
      // 只允许数字，最多6位
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });
  }

  const resetPinLink = document.getElementById('resetPinLink');
  if (resetPinLink) {
    resetPinLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('重置 PIN 将清除所有已保存的 API 密钥，确定继续？')) {
        showPinDialog('reset');
      }
    });
  }

  const pinDialog = document.getElementById('pinDialog');
  if (pinDialog) {
    // 点击对话框外部关闭
    pinDialog.addEventListener('click', (e) => {
      if (e.target === pinDialog) {
        hidePinDialog();
      }
    });
  }

  if (!settings) return;
  // v1.0.7: 加载时自动清除未填写的自定义大模型
  _cleanupEmptyCustomProviders();
  renderApiCards();
  renderApiPriority();
  renderApiUsage();
}

// v1.0.7: 清除未填写的自定义供应商（apiKey 和 endpoint 均为空）
function _cleanupEmptyCustomProviders() {
  if (!settings?.api?.customProviders) return;
  const before = settings.api.customProviders.length;
  settings.api.customProviders = settings.api.customProviders.filter(p => {
    const hasContent = (p.apiKey && p.apiKey.length > 0) || (p.endpoint && p.endpoint.length > 0);
    return hasContent;
  });
  if (settings.api.customProviders.length < before) {
    // 同步清理 apiPriority 中失效的 custom_xxx
    const validIds = new Set(settings.api.customProviders.map(p => 'custom_' + p.id));
    settings.api.apiPriority = settings.api.apiPriority.filter(name => {
      if (name.startsWith('custom_')) return validIds.has(name);
      return true;
    });
    console.log(`[options] 清理了 ${before - settings.api.customProviders.length} 个未填写的自定义大模型`);
    saveAllSettings(settings).then(() => {
      // v1.2.2 fix: reloadApis 添加 .catch 避免未捕获 promise 拒绝
      chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});
      // v1.0.19: 清理自定义供应商后联动刷新额度限制和月度用量
      renderQuotaLimits();
      renderMonthlyUsage();
      // v1.2.2 fix: saveAllSettings.then 链添加 .catch 捕获保存失败
    }).catch(e => console.warn('[options] saveAllSettings failed:', e));
  }
}

// v1.0.7: 更新 API 调试状态指示器
function updateApiDebugStatus() {
  const statusEl = document.getElementById('apiDebugStatus');
  if (!statusEl) return;
  if (!settings) {
    statusEl.textContent = '⚠ 设置未加载';
    statusEl.style.color = '#f44336';
    return;
  }
  const apiKeys = settings.api?.apiKeys || {};
  const allNames = Object.keys(apiKeys);
  const configuredNames = allNames.filter(name => {
    const obj = apiKeys[name];
    return obj && typeof obj === 'object' &&
      Object.values(obj).some(v => typeof v === 'string' && v.length > 0);
  });
  const priority = settings.api?.apiPriority || [];
  statusEl.textContent = `已加载 ${configuredNames.length}/${allNames.length} 个 API 密钥，优先级列表 ${priority.length} 项`;
  statusEl.style.color = configuredNames.length > 0 ? '#4caf50' : '#f44336';
}

function getApiDisplayName(apiName) {
  // v1.0.7 fix: 不能调用 window.getApiDisplayName —— 本函数以普通 <script> 加载，
  // function 声明会覆盖 api-metadata.js 设置的 window.getApiDisplayName，导致无限递归。
  // API_DISPLAY_NAMES 已在文件头部从 window.API_DISPLAY_NAMES 拷贝，直接用即可。
  if (API_DISPLAY_NAMES[apiName]) return API_DISPLAY_NAMES[apiName];
  if (apiName.startsWith('custom_')) {
    const provider = (settings?.api?.customProviders || []).find(p => p.id === apiName.slice(7));
    return provider ? provider.name : apiName;
  }
  return apiName;
}

function renderApiCards() {
  const container = document.getElementById('apiCardsContainer');
  if (!settings) return;
  const priority = settings.api.apiPriority || [];
  const enabledApis = settings.api.enabledApis || {};
  const apiKeys = settings.api.apiKeys || {};

  // 调试日志：渲染前的数据状态
  console.log('[options] renderApiCards 开始渲染:', {
    priorityLength: priority.length,
    priority: priority,
    apiKeysNames: Object.keys(apiKeys),
    enabledApis: enabledApis
  });

  if (priority.length === 0) {
    container.innerHTML = '<div style="padding:20px;color:#888;">API 优先级列表为空，请检查设置数据。</div>';
    return;
  }

  // 确保 apiPriority 包含所有已配置密钥的 API（防止 priority 列表遗漏已配置的 API）
  // v1.0.7: 仅补充已知 API 名称，过滤已废弃的 API（如 tencent）
  const knownApiNames = new Set([...Object.keys(API_DISPLAY_NAMES), ...(settings.api.apiPriority || [])]);
  const configuredApis = Object.keys(apiKeys).filter(name => {
    if (!name.startsWith('custom_') && !knownApiNames.has(name)) return false;
    const obj = apiKeys[name];
    return obj && typeof obj === 'object' && Object.values(obj).some(v => typeof v === 'string' && v.length > 0);
  });
  for (const apiName of configuredApis) {
    if (!priority.includes(apiName)) {
      priority.push(apiName);
      console.log('[options] renderApiCards: 补充遗漏的已配置 API 到 priority:', apiName);
    }
  }

  container.innerHTML = priority.map(apiName => {
      const enabled = enabledApis[apiName] !== false;
    const status = apiStatus[apiName];
    const statusClass = status?.status || 'unconfigured';
    const keys = apiKeys[apiName] || {};
    const fields = API_CONFIG_FIELDS[apiName] || [];
    
    // 处理自定义供应商
    if (apiName.startsWith('custom_')) {
      const provider = (settings.api.customProviders || []).find(p => p.id === apiName.slice(7));
      if (!provider) return '';

      // 完整性检查
      const { complete, missing } = checkApiCompleteness(apiName, null, provider);
      const incompleteTag = complete ? '' : '<span class="api-card-status unconfigured">⚠ 配置不全</span>';
      const enableAttr = complete ? (enabled ? 'checked' : '') : '';
      const enableDisabled = complete ? '' : 'disabled';
      const warningHtml = complete ? '' : `<div class="api-incomplete-warning"><strong>⚠ 填写不全</strong>：缺少 ${missing.join('、')}。已保存当前内容，但该接口不会启用。</div>`;

      // 锁定状态下输入框的公共属性
      const lockAttrs = apiUnlocked ? '' : 'readonly oncopy="return false" oncut="return false" oncontextmenu="return false"';

      // 显示名称（非密钥，锁定时 readonly，值保持明文）
      const nameValue = escapeAttr(provider.name);
      const nameInput = apiUnlocked
        ? `<input type="text" class="api-field" data-api="${escapeAttr(apiName)}" data-field="name" value="${nameValue}">`
        : `<input type="text" class="api-field locked" ${lockAttrs} data-api="${escapeAttr(apiName)}" data-field="name" value="${nameValue}">`;

      // API Key（密钥，锁定时掩码 + readonly）
      const apiKeyValue = apiUnlocked ? escapeAttr(provider.apiKey) : escapeAttr(maskKey(provider.apiKey));
      const apiKeyInput = apiUnlocked
        ? `<input type="password" class="api-field" data-api="${escapeAttr(apiName)}" data-field="apiKey" value="${apiKeyValue}"><span class="api-field-toggle" data-api="${escapeAttr(apiName)}" data-field="apiKey">👁</span>`
        : `<input type="text" class="api-field locked" ${lockAttrs} data-api="${escapeAttr(apiName)}" data-field="apiKey" value="${apiKeyValue}">`;

      // Endpoint（非密钥，锁定时 readonly）
      const endpointValue = escapeAttr(provider.endpoint);
      const endpointInput = apiUnlocked
        ? `<input type="text" class="api-field" data-api="${escapeAttr(apiName)}" data-field="endpoint" value="${endpointValue}">`
        : `<input type="text" class="api-field locked" ${lockAttrs} data-api="${escapeAttr(apiName)}" data-field="endpoint" value="${endpointValue}">`;

      // 模型（非密钥，锁定时 readonly）
      const modelValue = escapeAttr(provider.model);
      const modelInput = apiUnlocked
        ? `<input type="text" class="api-field" data-api="${escapeAttr(apiName)}" data-field="model" value="${modelValue}">`
        : `<input type="text" class="api-field locked" ${lockAttrs} data-api="${escapeAttr(apiName)}" data-field="model" value="${modelValue}">`;

      // 自定义供应商内部启用开关（锁定时禁用）
      const toggleDisabled = apiUnlocked ? '' : 'disabled';

      return `
        <div class="api-card" data-api="${escapeAttr(apiName)}">
          <div class="api-card-header">
            <span class="api-card-name">
              <label class="toggle-switch" style="vertical-align:middle;margin-right:8px;">
                <input type="checkbox" class="api-enable" data-api="${escapeAttr(apiName)}" ${enableAttr} ${enableDisabled}>
                <span class="toggle-slider"></span>
              </label>
              ${escapeAttr(provider.name)}
            </span>
            <span class="api-card-status ${statusClass}">${getStatusLabel(status?.status)}</span>
            ${incompleteTag}
            <button class="btn btn-sm api-test-btn" data-api="${escapeAttr(apiName)}">测试</button>
            <button class="btn btn-sm btn-danger api-clear-btn" data-api="${escapeAttr(apiName)}">清除</button>
          </div>
          ${warningHtml}
          <div class="api-card-body">
            <div class="api-field-group">
              <span class="api-field-label">显示名称</span>
              ${nameInput}
            </div>
            <div class="api-field-group">
              <span class="api-field-label">API Key</span>
              ${apiKeyInput}
            </div>
            <div class="api-field-group">
              <span class="api-field-label">Endpoint</span>
              ${endpointInput}
            </div>
            <div class="api-field-group">
              <span class="api-field-label">模型</span>
              ${modelInput}
            </div>
            <div class="api-field-group">
              <label class="toggle-switch" style="vertical-align:middle;">
                <input type="checkbox" class="api-toggle" data-api="${escapeAttr(apiName)}" data-field="enabled" ${provider.enabled ? 'checked' : ''} ${toggleDisabled}>
                <span class="toggle-slider"></span>
              </label>
              <span style="margin-left:8px;">启用</span>
            </div>
          </div>
        </div>
      `;
    }

    let fieldsHtml = '';
    // 锁定状态下输入框的公共属性
    const lockAttrs = apiUnlocked ? '' : 'readonly oncopy="return false" oncut="return false" oncontextmenu="return false"';
    // 有自定义字段配置的 API（baidu, baidu_llm 等）按字段列表渲染
    if (fields.length > 0) {
      fieldsHtml = fields.map(f => {
        const isSensitive = (f.type === 'password');
        // 锁定时：密钥字段显示掩码，非密钥字段保持明文
        const fieldValue = apiUnlocked
          ? escapeAttr(keys[f.key] || '')
          : (isSensitive ? escapeAttr(maskKey(keys[f.key] || '')) : escapeAttr(keys[f.key] || ''));
        const inputAttrs = apiUnlocked
          ? `type="${f.type || 'text'}" class="api-field"`
          : `type="text" class="api-field locked" ${lockAttrs}`;
        // 解锁状态下，密钥字段旁边显示可见性切换按钮
        const toggleBtn = (apiUnlocked && isSensitive)
          ? `<span class="api-field-toggle" data-api="${escapeAttr(apiName)}" data-field="${f.key}">👁</span>`
          : '';
        return `
          <div class="api-field-group">
            <span class="api-field-label">${escapeAttr(f.label)}</span>
            <input ${inputAttrs} data-api="${escapeAttr(apiName)}" data-field="${f.key}"
              value="${fieldValue}" placeholder="${escapeAttr(f.default || '')}">
            ${toggleBtn}
          </div>
        `;
      }).join('');
    } else {
      // 默认渲染（无配置字段的 API，统一按 apiKey 密钥处理）
      const fieldValue = apiUnlocked ? escapeAttr(keys.apiKey || '') : escapeAttr(maskKey(keys.apiKey || ''));
      const inputAttrs = apiUnlocked
        ? `type="password" class="api-field"`
        : `type="text" class="api-field locked" ${lockAttrs}`;
      const toggleBtn = apiUnlocked ? `<span class="api-field-toggle" data-api="${escapeAttr(apiName)}" data-field="apiKey">👁</span>` : '';
      fieldsHtml = `
        <div class="api-field-group">
          <span class="api-field-label">API Key</span>
          <input ${inputAttrs} data-api="${escapeAttr(apiName)}" data-field="apiKey" value="${fieldValue}">
          ${toggleBtn}
        </div>
      `;
    }

    if (['deepseek', 'glm', 'tongyi', 'zhipu', 'yi', 'doubao', 'custom'].includes(apiName)) {
      // Endpoint / 模型（非密钥，锁定时 readonly，值保持明文）
      const endpointValue = escapeAttr(settings.api.apiEndpoints?.[apiName] || DEFAULT_API_ENDPOINTS[apiName] || '');
      const modelValue = escapeAttr(settings.api.apiModels?.[apiName] || DEFAULT_API_MODELS[apiName] || '');
      const epAttrs = apiUnlocked
        ? `type="text" class="api-field"`
        : `type="text" class="api-field locked" ${lockAttrs}`;
      fieldsHtml += `
        <div class="api-field-group">
          <span class="api-field-label">Endpoint</span>
          <input ${epAttrs} data-api="${escapeAttr(apiName)}" data-field="endpoint" value="${endpointValue}">
        </div>
        <div class="api-field-group">
          <span class="api-field-label">模型</span>
          <input ${epAttrs} data-api="${escapeAttr(apiName)}" data-field="model" value="${modelValue}">
        </div>
      `;
    }

    const statusText = getStatusLabel(status?.status);
    const freeQuota = API_FREE_QUOTAS[apiName];
    const freeQuotaHtml = freeQuota ? `<div class="api-free-quota">${escapeAttr(freeQuota)}</div>` : '';

    // 完整性检查
    const { complete, missing } = checkApiCompleteness(apiName, keys, null);
    const incompleteTag = complete ? '' : '<span class="api-card-status unconfigured">⚠ 配置不全</span>';
    const enableAttr = complete ? (enabled ? 'checked' : '') : '';
    const enableDisabled = complete ? '' : 'disabled';
    const warningHtml = complete ? '' : `<div class="api-incomplete-warning"><strong>⚠ 填写不全</strong>：缺少 ${missing.join('、')}。已保存当前内容，但该接口不会启用。</div>`;

    return `
      <div class="api-card" data-api="${escapeAttr(apiName)}">
        <div class="api-card-header">
          <span class="api-card-name">
            <label class="toggle-switch" style="vertical-align:middle;margin-right:8px;">
              <input type="checkbox" class="api-enable" data-api="${escapeAttr(apiName)}" ${enableAttr} ${enableDisabled}>
              <span class="toggle-slider"></span>
            </label>
            ${escapeAttr(getApiDisplayName(apiName))}
          </span>
          <span class="api-card-status ${statusClass}">${statusText}</span>
          ${incompleteTag}
          <button class="btn btn-sm api-test-btn" data-api="${escapeAttr(apiName)}">测试</button>
          <button class="btn btn-sm btn-danger api-clear-btn" data-api="${escapeAttr(apiName)}">清除</button>
        </div>
        ${warningHtml}
        <div class="api-card-body">
          ${fieldsHtml}
          ${freeQuotaHtml}
        </div>
      </div>
    `;
  }).join('');

  // v1.0.7: 渲染后更新调试状态指示器
  updateApiDebugStatus();

  container.querySelectorAll('.api-enable').forEach(cb => {
    cb.addEventListener('change', () => {
      settings.api.enabledApis[cb.dataset.api] = cb.checked;
      saveAllSettings(settings).then(() => {
        // v1.2.2 fix: reloadApis 添加 .catch 避免未捕获 promise 拒绝
        chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});
        // v1.0.19 fix: renderQuotaLimits/renderApiUsage 不依赖 enabledApis，重绘只会销毁额度输入框焦点
        // 仅刷新月度用量显示（可能因 API 禁用而停止累计）
        renderMonthlyUsage();
        showSavedTip();
        // v1.2.2 fix: saveAllSettings.then 链添加 .catch 捕获保存失败
      }).catch(e => console.warn('[options] saveAllSettings failed:', e));
    });
  });

  container.querySelectorAll('.api-field').forEach(input => {
    input.addEventListener('change', () => {
      const apiName = input.dataset.api;
      const field = input.dataset.field;
      
      // 处理自定义供应商
      if (apiName.startsWith('custom_')) {
        const provider = (settings.api.customProviders || []).find(p => p.id === apiName.slice(7));
        if (!provider) return;

        if (field === 'name' || field === 'apiKey' || field === 'endpoint' || field === 'model') {
          if (field === 'endpoint' && !validateEndpointInput(input, provider.endpoint)) return;
          provider[field] = input.value;
        } else if (field === 'enabled') {
          provider.enabled = input.checked;
        }
        
        saveAllSettings(settings).then(async () => {
          // v1.2.2 fix: reloadApis 添加 .catch 避免未捕获 promise 拒绝
          chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});
          showSavedTip();
          // 保存后完整性检查：不完整则禁用启用
          const { complete } = checkApiCompleteness(apiName, null, provider);
          if (!complete) {
            settings.api.enabledApis[apiName] = false;
            await saveAllSettings(settings);
          }
          // 只更新当前卡片状态，不全量重渲染
          const card = input.closest('.api-card');
          if (card) {
            const cb = card.querySelector('.api-enable');
            if (cb) {
              if (!complete) { cb.checked = false; cb.disabled = true; }
              else { cb.disabled = false; }
            }
          }
          renderApiPriority();
          // v1.2.2 fix: saveAllSettings.then 链添加 .catch 捕获保存失败
        }).catch(e => console.warn('[options] saveAllSettings failed:', e));
        return;
      }
      
      // 处理常规API
      if (field === 'endpoint') {
        const current = settings.api.apiEndpoints?.[apiName];
        if (!validateEndpointInput(input, current)) return;
        if (!settings.api.apiEndpoints) settings.api.apiEndpoints = {};
        settings.api.apiEndpoints[apiName] = input.value;
      } else if (field === 'model') {
        if (!settings.api.apiModels) settings.api.apiModels = {};
        settings.api.apiModels[apiName] = input.value;
      } else {
        if (!settings.api.apiKeys[apiName]) settings.api.apiKeys[apiName] = {};
        settings.api.apiKeys[apiName][field] = input.value;
      }
      saveAllSettings(settings).then(async () => {
        // v1.2.2 fix: reloadApis 添加 .catch 避免未捕获 promise 拒绝
        chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});
        showSavedTip();
        // 保存后新增完整性检查
        const keys = settings.api.apiKeys[apiName] || {};
        const { complete, missing } = checkApiCompleteness(apiName, keys, null);
        const card = input.closest('.api-card');
        if (!complete) {
          settings.api.enabledApis[apiName] = false;
          await saveAllSettings(settings);
          if (card) {
            const cb = card.querySelector('.api-enable');
            if (cb) { cb.checked = false; cb.disabled = true; }
            showIncompleteWarning(card, missing);
          }
        } else {
          if (card) {
            const cb = card.querySelector('.api-enable');
            if (cb) { cb.disabled = false; }
            hideIncompleteWarning(card);
          }
        }
        // v1.2.2 fix: saveAllSettings.then 链添加 .catch 捕获保存失败
      }).catch(e => console.warn('[options] saveAllSettings failed:', e));
    });
  });

  container.querySelectorAll('.api-test-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const apiName = btn.dataset.api;
      // 清除该按钮上一次的恢复 timer，避免极端时序下新测试被旧 timer 覆盖文字
      if (btn._testRestoreTimer) {
        clearTimeout(btn._testRestoreTimer);
        btn._testRestoreTimer = null;
      }
      btn.textContent = '测试中...';
      btn.disabled = true;
      try {
      let config = settings.api.apiKeys?.[apiName] || {};

      // 处理自定义供应商的测试配置
      if (apiName.startsWith('custom_')) {
        const provider = (settings.api.customProviders || []).find(p => p.id === apiName.slice(7));
        if (provider) {
          config = {
                      apiKey: provider.apiKey,
                      displayName: provider.name,
            endpoint: provider.endpoint,
            model: provider.model
          };
        }
      }

      const res = await chrome.runtime.sendMessage({ action: 'testApi', apiName, apiConfig: config });
      if (res && res.success) {
        btn.textContent = '✓ 成功';
        btn.style.background = '#4CAF50';
        btn.style.color = '#fff';
        // v1.0.10: 刷新 apiStatus 并仅更新状态标识 DOM，不重新渲染整个卡片列表
        // （重新渲染会替换按钮 DOM，导致"✓ 成功"反馈丢失）
        try {
          const fresh = await chrome.runtime.sendMessage({ action: 'getApiStatus' });
          if (fresh && fresh.status) {
            apiStatus = fresh.status;
            // 直接更新该 API 卡片的状态标识
            const card = btn.closest('.api-card');
            if (card) {
              const statusEl = card.querySelector('.api-card-status');
              if (statusEl) {
                const newStatus = apiStatus[apiName];
                const statusValue = newStatus?.status || 'available';
                statusEl.className = `api-card-status ${statusValue}`;
                statusEl.textContent = getStatusLabel(statusValue);
              }
            }
            renderApiUsage();
          }
        } catch {}
        btn._testRestoreTimer = setTimeout(() => { btn.textContent = '测试'; btn.style.background = ''; btn.style.color = ''; btn._testRestoreTimer = null; }, 2000);
      } else {
        btn.textContent = '✗ 失败';
        btn.style.background = '#f44336';
        btn.style.color = '#fff';
        // v1.0.10: 测试失败也刷新 apiStatus 并更新状态标识
        // background 的 testApi 已将错误状态写入 statusCache，但 options 不刷新就会显示旧状态
        try {
          const fresh = await chrome.runtime.sendMessage({ action: 'getApiStatus' });
          if (fresh && fresh.status) {
            apiStatus = fresh.status;
            const card = btn.closest('.api-card');
            if (card) {
              const statusEl = card.querySelector('.api-card-status');
              if (statusEl) {
                const newStatus = apiStatus[apiName];
                const statusValue = newStatus?.status || 'error';
                statusEl.className = `api-card-status ${statusValue}`;
                statusEl.textContent = getStatusLabel(statusValue);
              }
            }
            renderApiUsage();
          }
        } catch {}
        alert('测试失败：' + ((res && res.error) || '未知错误'));
        btn._testRestoreTimer = setTimeout(() => { btn.textContent = '测试'; btn.style.background = ''; btn.style.color = ''; btn._testRestoreTimer = null; }, 2000);
      }
      } catch(e) {
        btn.textContent = '✗ 错误';
        btn.style.background = '#f44336';
        btn.style.color = '#fff';
        alert('测试出错：' + (e.message || '未知错误'));
        btn._testRestoreTimer = setTimeout(() => { btn.textContent = '测试'; btn.style.background = ''; btn.style.color = ''; btn._testRestoreTimer = null; }, 2000);
      } finally {
        btn.disabled = false;
      }
    });
  });

  // v1.0.7: 一键清除按钮 —— 清除该 API 的密钥、模型、接入点等所有信息
  container.querySelectorAll('.api-clear-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const apiName = btn.dataset.api;
      const displayName = getApiDisplayName(apiName);
      if (!confirm(`确定清除「${displayName}」的所有配置信息？\n\n这将删除：密钥、模型、接入点等数据，且不可恢复。`)) return;

      // v1.2.2 fix: Bug 11 - 防止重复点击
      btn.disabled = true;
      try {
        const res = await chrome.runtime.sendMessage({ action: 'clearApi', apiName });
        if (res && res.success) {
          showSavedTip();
          // 重新从后台加载最新设置，确保 UI 与存储一致
          await refreshApiSettings();
        } else {
          alert('清除失败：' + ((res && res.error) || '未知错误'));
        }
      } catch(e) {
        alert('清除失败：' + (e.message || '未知错误'));
      } finally {
        btn.disabled = false;
      }
    });
  });

  // 密钥可见性切换按钮（事件委托）：点击 👁 切换 password ↔ text
  container.querySelectorAll('.api-field-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const apiName = toggle.dataset.api;
      const field = toggle.dataset.field;
      const input = container.querySelector(`input.api-field[data-api="${apiName}"][data-field="${field}"]`);
      if (input) {
        if (input.type === 'password') {
          input.type = 'text';
          toggle.textContent = '🙈';
        } else {
          input.type = 'password';
          toggle.textContent = '👁';
        }
      }
    });
  });
}

// === 不完整警告显示函数 ===

function showIncompleteWarning(card, missingFields) {
  if (!card) return;
  let warning = card.querySelector('.api-incomplete-warning');
  if (!warning) {
    warning = document.createElement('div');
    warning.className = 'api-incomplete-warning';
    card.insertBefore(warning, card.children[1] || null);
  }
  warning.innerHTML = `<strong>⚠ 填写不全</strong>：缺少 ${missingFields.join('、')}。已保存当前内容，但该接口不会启用。`;
}

function hideIncompleteWarning(card) {
  if (!card) return;
  const warning = card.querySelector('.api-incomplete-warning');
  if (warning) warning.remove();
}

// === PIN 码验证逻辑 ===

function showPinDialog(mode) {
  // mode: 'verify' | 'setup' | 'reset'
  pinDialogMode = mode;
  const dialog = document.getElementById('pinDialog');
  const title = document.getElementById('pinDialogTitle');
  const desc = document.getElementById('pinDialogDesc');
  const input = document.getElementById('pinInput');
  const error = document.getElementById('pinError');
  const confirmBtn = document.getElementById('pinConfirmBtn');
  const resetLink = document.getElementById('resetPinLink');

  if (!dialog) return;

  error.style.display = 'none';
  error.textContent = '';
  input.value = '';

  if (mode === 'setup') {
    title.textContent = '设置 PIN 码';
    desc.textContent = '首次使用，请设置 6 位 PIN 码用于保护密钥安全';
    resetLink.style.display = 'none';
    input.style.display = '';
    confirmBtn.textContent = '确认';
  } else if (mode === 'verify') {
    title.textContent = '输入 PIN 码';
    desc.textContent = '请输入 PIN 码以解锁密钥编辑';
    resetLink.style.display = 'block';
    input.style.display = '';
    confirmBtn.textContent = '确认';
  } else if (mode === 'reset') {
    title.textContent = '重置密钥保护';
    desc.textContent = '重置 PIN 将清除所有已保存的 API 密钥，确定继续？';
    resetLink.style.display = 'none';
    input.style.display = 'none';
    confirmBtn.textContent = '确认重置';
  }

  // v1.2.2 fix: Bug 1 - 移除前端冷却检查，后端会在 verifyPin 响应中返回冷却提示
  confirmBtn.disabled = false;

  dialog.style.display = 'flex';
  // 仅在输入框可见时聚焦（reset 模式下隐藏了输入框）
  if (input.style.display !== 'none') {
    setTimeout(() => input.focus(), 50);
  }
}

function hidePinDialog() {
  const dialog = document.getElementById('pinDialog');
  if (dialog) dialog.style.display = 'none';
}

async function handlePinConfirm() {
  const input = document.getElementById('pinInput');
  const error = document.getElementById('pinError');
  const title = document.getElementById('pinDialogTitle');
  const confirmBtn = document.getElementById('pinConfirmBtn');
  const pin = input.value.trim();

  // 防止异步操作期间重复提交
  if (confirmBtn?.disabled) return;

  if (pinDialogMode === 'setup') {
    // setup 模式：需要校验 PIN 格式
    if (!/^\d{6}$/.test(pin)) {
      error.textContent = '请输入 6 位数字 PIN 码';
      error.style.display = 'block';
      return;
    }
    if (confirmBtn) confirmBtn.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'setupPin', pin });
      if (resp?.success) {
        hidePinDialog();
        await setApiUnlockState(true);
      } else {
        error.textContent = resp?.error || '设置失败';
        error.style.display = 'block';
      }
    } catch(e) {
      error.textContent = '设置失败：' + (e.message || '未知错误');
      error.style.display = 'block';
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
    }
  } else if (pinDialogMode === 'reset') {
    // reset 模式：不校验 PIN，直接执行重置
    if (confirmBtn) confirmBtn.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'resetPin' });
      if (resp?.success) {
        hidePinDialog();
        await setApiUnlockState(false);
        // 重新加载设置页数据
        await loadAllData();
        renderApiCards();
        renderApiPriority();
        renderApiUsage();
        alert('PIN 和所有密钥已重置，请重新配置 API');
      } else {
        // 重置失败也要给用户反馈
        error.textContent = resp?.error || '重置失败，请重试';
        error.style.display = 'block';
      }
    } catch(e) {
      error.textContent = '重置失败：' + (e.message || '未知错误');
      error.style.display = 'block';
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
    }
  } else {
    // verify 模式：需要校验 PIN 格式
    if (!/^\d{6}$/.test(pin)) {
      error.textContent = '请输入 6 位数字 PIN 码';
      error.style.display = 'block';
      return;
    }
    if (confirmBtn) confirmBtn.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'verifyPin', pin });
      if (resp?.success) {
        hidePinDialog();
        await setApiUnlockState(true);
      } else {
        // v1.2.2 fix: Bug 1 - 完全依赖后端返回的 error 消息（后端使用5次/60秒策略）
        // 后端失败时返回 { success: false, error: 'PIN 错误，还剩 X 次机会' }
        // 后端锁定时返回 { success: false, error: 'PIN 错误次数过多，请等待 60 秒后再试' }
        error.textContent = resp?.error || 'PIN 验证失败';
        error.style.display = 'block';
        if (confirmBtn) confirmBtn.disabled = false;
        input.value = '';
        input.focus();
      }
    } catch(e) {
      error.textContent = '验证失败：' + (e.message || '未知错误');
      error.style.display = 'block';
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }
}

async function handleUnlockClick() {
  if (apiUnlocked) {
    // 已解锁 → 锁定
    await setApiUnlockState(false);
    return;
  }
  // 未解锁 → 检查是否已设置 PIN
  // v1.2.2 fix: sendMessage 调用包裹 try/catch，捕获异常并记录
  let resp;
  try {
    resp = await chrome.runtime.sendMessage({ action: 'hasPin' });
  } catch (e) {
    console.warn('[options] handleUnlockClick: 查询 PIN 状态失败:', e);
    return;
  }
  if (resp?.has) {
    showPinDialog('verify');
  } else {
    showPinDialog('setup');
  }
}

async function setApiUnlockState(unlocked) {
  apiUnlocked = unlocked;
  const bar = document.getElementById('apiSecurityBar');
  const btn = document.getElementById('unlockApiBtn');

  if (bar) {
    const icon = bar.querySelector('.security-icon');
    const text = bar.querySelector('.security-text');
    const hint = bar.querySelector('.security-hint');
    if (unlocked) {
      bar.className = 'api-security-bar unlocked';
      if (icon) icon.textContent = '🔓';
      if (text) text.textContent = '已解锁';
      if (hint) hint.textContent = '刷新或关闭页面后自动锁定';
    } else {
      bar.className = 'api-security-bar locked';
      if (icon) icon.textContent = '🔒';
      if (text) text.textContent = '密钥已锁定';
      if (hint) hint.textContent = '输入 PIN 码后可查看和修改密钥';
    }
  }
  if (btn) {
    btn.textContent = unlocked ? '🔒 锁定' : '🔓 解锁';
  }
  // 重新渲染 API 卡片以更新输入框状态
  renderApiCards();
}

// 检查所有 API 完整性，首次进入时警告1次
function checkAllApiCompleteness() {
  const s = window.__currentSettings || settings || {};
  const apiPriority = s.api?.apiPriority || [];
  const incompleteApis = [];
  for (const apiName of apiPriority) {
    const keys = s.api?.apiKeys?.[apiName] || {};
    const provider = apiName.startsWith('custom_')
      ? (s.api?.customProviders || []).find(p => p.id === apiName.slice(7))
      : null;
    const { complete, missing } = checkApiCompleteness(apiName, keys, provider);
    // 仅当该 API 有部分已填写内容但又不完整时才警告
    if (!complete && keys && Object.values(keys).some(v => v)) {
      incompleteApis.push({ apiName, missing });
    }
  }
  if (incompleteApis.length > 0 && !sessionStorage.getItem(INCOMPLETE_WARN_KEY)) {
    sessionStorage.setItem(INCOMPLETE_WARN_KEY, '1');
    const names = incompleteApis.map(a => a.apiName).join('、');
    alert(`以下 API 配置不全：${names}\n已保存已填写的内容，但不会启用。请补全缺失字段后启用。`);
  }
}

function renderApiPriority() {
  const container = document.getElementById('apiPriorityList');
  if (!settings) return;
  const priority = settings.api.apiPriority || [];

  container.innerHTML = priority.map(apiName => `
    <div class="api-priority-item" data-api="${escapeAttr(apiName)}">
      <span class="drag-handle">☰</span>
      <span>${escapeAttr(getApiDisplayName(apiName))}</span>
    </div>
  `).join('');

  let draggedItem = null;
  container.querySelectorAll('.api-priority-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedItem = item;
      item.style.opacity = '0.5';
    });
    item.addEventListener('dragend', () => {
      draggedItem.style.opacity = '1';
      draggedItem = null;
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (draggedItem && draggedItem !== item) {
        const items = Array.from(container.children);
        const fromIndex = items.indexOf(draggedItem);
        const toIndex = items.indexOf(item);
        container.insertBefore(draggedItem, toIndex > fromIndex ? item.nextSibling : item);
        const newOrder = Array.from(container.children).map(el => el.dataset.api);
        settings.api.apiPriority = newOrder;
        saveAllSettings(settings).then(() => {
          // v1.2.2 fix: reloadApis 添加 .catch 避免未捕获 promise 拒绝
          chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});
          // v1.0.19: 优先级变化后联动刷新额度限制和用量显示
          renderQuotaLimits();
          renderApiUsage();
          renderMonthlyUsage();
          showSavedTip();
          // v1.2.2 fix: saveAllSettings.then 链添加 .catch 捕获保存失败
        }).catch(e => console.warn('[options] saveAllSettings failed:', e));
      }
    });
    item.setAttribute('draggable', 'true');
  });
}

// v1.0.7: renderCustomProviders 已移除 —— 自定义供应商现在统一在 renderApiCards 中渲染

function renderApiUsage() {
  const container = document.getElementById('apiUsageContainer');
  if (!container) return;

  const priority = settings?.api?.apiPriority || [];
  const today = new Date().toDateString();
  const isToday = dailyUsage._date === today;

  const items = [];
  for (const apiName of priority) {
    if (!API_DISPLAY_NAMES[apiName] && !apiName.startsWith('custom_')) continue;
    const count = isToday ? (dailyUsage[apiName] || 0) : 0;
    const displayName = getApiDisplayName(apiName);
    items.push({ name: apiName, displayName, count: count });
  }

  if (items.length === 0) {
    container.innerHTML = '<div class="api-usage-empty">暂无用量数据</div>';
    return;
  }

  const maxCount = Math.max(...items.map(i => i.count), 1);
  container.innerHTML = items.map(item => {
    const pct = Math.round((item.count / maxCount) * 100);
    return `
      <div class="api-usage-item">
        <span class="api-usage-name">${escapeAttr(item.displayName)}</span>
        <div class="api-usage-bar"><div class="api-usage-bar-fill" style="width:${pct}%"></div></div>
        <span class="api-usage-count">${item.count.toLocaleString()} 字符</span>
      </div>
    `;
  }).join('');
}

// v1.0.8: 额度限制设置
function setupQuotaSettings() {
  if (!settings) return;
  renderQuotaLimits();
  renderMonthlyUsage();
}

function renderQuotaLimits() {
  const container = document.getElementById('quotaLimitsContainer');
  if (!container || !settings) return;
  const priority = settings.api.apiPriority || [];
  const quotaLimits = settings.api.quotaLimits || {};

  const items = priority.filter(name => API_DISPLAY_NAMES[name] || name.startsWith('custom_'));

  if (items.length === 0) {
    container.innerHTML = '<div style="padding:12px;color:#888;">暂无可配置的翻译接口</div>';
    return;
  }

  container.innerHTML = items.map(apiName => {
    const limit = quotaLimits[apiName] || { enabled: false, limit: 0, unit: 'chars', resetType: 'monthly' };
    const displayName = getApiDisplayName(apiName);
    const freeQuota = API_FREE_QUOTAS[apiName];
    // v1.1.0 security: apiName 可能来自存储中的自定义供应商，统一转义后再插入属性
    const apiNameAttr = escapeAttr(apiName);
    return `
      <div class="quota-setting-row" data-api="${apiNameAttr}">
        <div class="quota-setting-info">
          <label class="toggle-switch">
            <input type="checkbox" class="quota-enable" data-api="${apiNameAttr}" ${limit.enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
          <span class="quota-api-name">${escapeAttr(displayName)}</span>
          ${freeQuota ? `<span class="quota-free-hint">${escapeAttr(freeQuota)}</span>` : ''}
        </div>
        <div class="quota-setting-controls">
          <input type="number" class="quota-limit-input" data-api="${apiNameAttr}" value="${limit.limit || 0}" min="0" placeholder="0">
          <select class="quota-unit-select" data-api="${apiNameAttr}">
            <option value="chars" ${limit.unit === 'chars' ? 'selected' : ''}>字符</option>
            <option value="tokens" ${limit.unit === 'tokens' ? 'selected' : ''}>Token</option>
          </select>
          <select class="quota-reset-select" data-api="${apiNameAttr}">
            <option value="monthly" ${limit.resetType !== 'daily' ? 'selected' : ''}>每月</option>
            <option value="daily" ${limit.resetType === 'daily' ? 'selected' : ''}>每日</option>
          </select>
        </div>
      </div>
    `;
  }).join('');

  // 绑定事件
  container.querySelectorAll('.quota-enable').forEach(cb => {
    cb.addEventListener('change', () => {
      const apiName = cb.dataset.api;
      if (!settings.api.quotaLimits) settings.api.quotaLimits = {};
      if (!settings.api.quotaLimits[apiName]) settings.api.quotaLimits[apiName] = { enabled: false, limit: 0, unit: 'chars', resetType: 'monthly' };
      settings.api.quotaLimits[apiName].enabled = cb.checked;
      saveAllSettings(settings).then(() => {
        // v1.2.2 fix: reloadApis 添加 .catch 避免未捕获 promise 拒绝
        chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});
        showSavedTip();
        // v1.2.2 fix: saveAllSettings.then 链添加 .catch 捕获保存失败
      }).catch(e => console.warn('[options] saveAllSettings failed:', e));
    });
  });

  container.querySelectorAll('.quota-limit-input').forEach(input => {
    input.addEventListener('change', () => {
      const apiName = input.dataset.api;
      const val = parseInt(input.value) || 0;
      if (!settings.api.quotaLimits) settings.api.quotaLimits = {};
      if (!settings.api.quotaLimits[apiName]) settings.api.quotaLimits[apiName] = { enabled: false, limit: 0, unit: 'chars', resetType: 'monthly' };
      settings.api.quotaLimits[apiName].limit = val;
      saveAllSettings(settings).then(() => {
        // v1.2.2 fix: reloadApis 添加 .catch 避免未捕获 promise 拒绝
        chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});
        showSavedTip();
        // v1.2.2 fix: saveAllSettings.then 链添加 .catch 捕获保存失败
      }).catch(e => console.warn('[options] saveAllSettings failed:', e));
    });
  });

  container.querySelectorAll('.quota-unit-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const apiName = sel.dataset.api;
      if (!settings.api.quotaLimits) settings.api.quotaLimits = {};
      if (!settings.api.quotaLimits[apiName]) settings.api.quotaLimits[apiName] = { enabled: false, limit: 0, unit: 'chars', resetType: 'monthly' };
      settings.api.quotaLimits[apiName].unit = sel.value;
      saveAllSettings(settings).then(() => {
        // v1.2.2 fix: reloadApis 添加 .catch 避免未捕获 promise 拒绝
        chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});
        showSavedTip();
        // v1.2.2 fix: saveAllSettings.then 链添加 .catch 捕获保存失败
      }).catch(e => console.warn('[options] saveAllSettings failed:', e));
    });
  });

  container.querySelectorAll('.quota-reset-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const apiName = sel.dataset.api;
      if (!settings.api.quotaLimits) settings.api.quotaLimits = {};
      if (!settings.api.quotaLimits[apiName]) settings.api.quotaLimits[apiName] = { enabled: false, limit: 0, unit: 'chars', resetType: 'monthly' };
      settings.api.quotaLimits[apiName].resetType = sel.value;
      saveAllSettings(settings).then(() => {
        // v1.2.2 fix: reloadApis 添加 .catch 避免未捕获 promise 拒绝
        chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});
        renderMonthlyUsage();
        showSavedTip();
        // v1.2.2 fix: saveAllSettings.then 链添加 .catch 捕获保存失败
      }).catch(e => console.warn('[options] saveAllSettings failed:', e));
    });
  });
}

async function renderMonthlyUsage() {
  const container = document.getElementById('monthlyUsageContainer');
  if (!container || !settings) return;

  try {
    const monthlyRes = await chrome.runtime.sendMessage({ action: 'getMonthlyUsage' });
    const dailyRes = await chrome.runtime.sendMessage({ action: 'getDailyUsage' });
    const monthlyUsage = monthlyRes?.usage || {};
    // v1.0.10 fix: 重命名局部变量，避免遮蔽全局 dailyUsage
    const freshDailyUsage = dailyRes || {};
    const priority = settings.api.apiPriority || [];
    const quotaLimits = settings.api.quotaLimits || {};
    // v1.0.18 fix: 改用本地时间，与 settings-manager.js 保持一致，避免 UTC 时区偏移导致月初配额显示异常
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const today = now.toDateString();
    const isThisMonth = monthlyUsage._month === currentMonth;
    const isToday = freshDailyUsage._date === today;

    const items = [];
    for (const apiName of priority) {
      if (!API_DISPLAY_NAMES[apiName] && !apiName.startsWith('custom_')) continue;
      const limit = quotaLimits[apiName];
      const isDaily = limit?.resetType === 'daily';
      const count = isDaily
        ? (isToday ? (freshDailyUsage[apiName] || 0) : 0)
        : (isThisMonth ? (monthlyUsage[apiName] || 0) : 0);
      const displayName = getApiDisplayName(apiName);
      const limitInChars = limit?.enabled && limit?.limit > 0
        ? (limit.unit === 'tokens' ? limit.limit * 2 : limit.limit)
        : 0;
      const pct = limitInChars > 0 ? Math.min(100, Math.round((count / limitInChars) * 100)) : 0;
      const periodLabel = isDaily ? '今日' : '本月';
      items.push({ name: apiName, displayName, count, limit: limitInChars, pct, enabled: limit?.enabled, periodLabel });
    }

    if (items.length === 0) {
      container.innerHTML = '<div class="api-usage-empty">暂无用量数据</div>';
      return;
    }

    container.innerHTML = items.map(item => {
      const limitText = item.enabled && item.limit > 0
        ? ` / ${item.limit.toLocaleString()} (${item.pct}%)`
        : '';
      // v1.2.2 fix: Bug 4 - 使用已定义的 CSS 变量 --accent 替代未定义的 --primary-color
      const barColor = item.pct >= 97 ? '#f44336' : (item.pct >= 80 ? '#ff9800' : 'var(--accent)');
      return `
        <div class="api-usage-item">
          <span class="api-usage-name">${escapeAttr(item.displayName)}</span>
          <div class="api-usage-bar"><div class="api-usage-bar-fill" style="width:${item.pct || (item.count > 0 ? 5 : 0)}%;background:${barColor}"></div></div>
          <span class="api-usage-count">${escapeAttr(item.periodLabel)} ${item.count.toLocaleString()} 字符${escapeAttr(limitText)}</span>
        </div>
      `;
    }).join('');
  } catch(e) {
    container.innerHTML = '<div class="api-usage-empty">加载失败</div>';
  }
}

// v1.0.8: 温馨提示设置
function setupTips() {
  // 将当前显示设置应用到翻译示例
  const translationEl = document.querySelector('.tips-example-translation');
  const originalEl = document.querySelector('.tips-example-original');
  if (!translationEl || !originalEl || !settings) return;

  const d = settings.display;
  if (d.translationColor) {
    translationEl.style.color = d.translationColor;
  }
  if (d.translationSize) {
    translationEl.style.fontSize = d.translationSize;
  }
  if (d.translationFont) {
    translationEl.style.fontFamily = d.translationFont;
  }
  if (d.translationSpacing) {
    translationEl.style.marginTop = d.translationSpacing;
  }
}

function setupAdvancedSettings() {
  if (!settings) return;
  const a = settings.advanced;

  bindNumber('batchSize', 'advanced.batchSize', a.batchSize);
  bindNumber('requestTimeout', 'advanced.requestTimeout', a.requestTimeout);
  bindNumber('retryCount', 'advanced.retryCount', a.retryCount);
  bindNumber('retryInterval', 'advanced.retryInterval', a.retryInterval);

  // v1.0.3: §3.4 懒加载开关
  bindToggle('lazyTranslate', 'advanced.lazyTranslate', a.lazyTranslate !== false);

  // v1.0.2: §3.6 日志级别（0-4）
  const logLevelEl = document.getElementById('logLevel');
  if (logLevelEl) {
    const curLevel = (settings.general && typeof settings.general.logLevel === 'number') ? settings.general.logLevel : 2;
    logLevelEl.value = String(curLevel);
    logLevelEl.addEventListener('change', () => {
      const v = parseInt(logLevelEl.value);
      if (!settings.general) settings.general = {};
      settings.general.logLevel = v;
      saveSetting('general.logLevel', v);
      showSavedTip();
    });
  }

  // v1.0.7 fix: loadLlmPrompt 完成前禁用保存按钮，防止用户快速点击存入空值
  const saveLlmPromptBtn = document.getElementById('saveLlmPromptBtn');
  if (saveLlmPromptBtn) saveLlmPromptBtn.disabled = true;
  loadLlmPrompt().finally(() => { if (saveLlmPromptBtn) saveLlmPromptBtn.disabled = false; });

  document.getElementById('saveLlmPromptBtn').addEventListener('click', async () => {
    const prompt = document.getElementById('llmPrompt').value;
    await chrome.storage.local.set({ 'dual_translate_custom_llm_prompt': prompt });
    // v1.2.2 fix: reloadApis 添加 .catch 避免未捕获 promise 拒绝
    chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});
    showSavedTip();
  });

  document.getElementById('resetLlmPromptBtn').addEventListener('click', async () => {
    if (!confirm('确定恢复默认 Prompt？')) return;
    await chrome.storage.local.remove('dual_translate_custom_llm_prompt');
    await loadLlmPrompt();
    showSavedTip();
  });

  loadCacheStats();
  document.getElementById('clearCacheBtn').addEventListener('click', async () => {
    if (!confirm('确定清除全部翻译缓存？下次翻译将重新调用 API。')) return;
    await chrome.runtime.sendMessage({ action: 'clearCache' });
    await loadCacheStats();
    showSavedTip();
  });

  document.getElementById('exportAllSettingsBtn')?.addEventListener('click', async () => {
    try {
      const data = await chrome.runtime.sendMessage({ action: 'exportAllSettings' });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `dual-translate-settings-${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showSavedTip();
    } catch (e) {
      alert('导出失败：' + e.message);
    }
  });

  document.getElementById('importAllSettingsBtn')?.addEventListener('click', () => {
    document.getElementById('importAllSettingsFile').click();
  });

  document.getElementById('importAllSettingsFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('文件超过 5MB 限制，拒绝导入（防止恶意大文件）');
      e.target.value = '';
      return;
    }
    if (!confirm(`确定导入「${file.name}」？当前所有设置（不含 API 密钥）将被覆盖。`)) {
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !data.settings) throw new Error('文件格式无效（缺少 settings 字段）');
      if (!data.version) throw new Error('文件格式无效（缺少 version 字段）');
      const s = data.settings;
      if (!s.api || !Array.isArray(s.api.apiPriority)) throw new Error('文件不是双语翻译助手的设置（缺少 api.apiPriority）');
      if (!s.display || !s.general) throw new Error('文件不是双语翻译助手的设置（缺少 display/general）');
      await chrome.runtime.sendMessage({ action: 'importAllSettings', data });
      showSavedTip();
      alert('导入成功！API 密钥需要重新在「API 管理」中填写。');
      setTimeout(() => location.reload(), 500);
    } catch (err) {
      alert('导入失败：' + err.message);
    } finally {
      e.target.value = '';
    }
  });
}

async function loadCacheStats() {
  const el = document.getElementById('cacheStats');
  if (!el) return;
  try {
    const stats = await chrome.runtime.sendMessage({ action: 'getCacheStats' });
    if (stats && stats.total !== undefined) {
      el.innerHTML = `有效缓存：<strong>${stats.active}</strong> 条　|　已过期：${stats.expired} 条　|　总占用：${stats.sizeKB} KB`;
    }
  } catch {
    el.textContent = '无法获取缓存信息';
  }
}

async function loadLlmPrompt() {
  const custom = await chrome.storage.local.get('dual_translate_custom_llm_prompt');
  if (custom['dual_translate_custom_llm_prompt']) {
    document.getElementById('llmPrompt').value = custom['dual_translate_custom_llm_prompt'];
  } else {
    const res = await chrome.runtime.sendMessage({ action: 'getLLMPrompt' });
    document.getElementById('llmPrompt').value = (res && res.prompt) || '';
  }
}

// v1.0.7: addCustomProviderBtn 的事件绑定已移至 setupApiManagement 中

function isValidEndpointUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    // v1.1.0 security: 强制 HTTPS 防止 API 密钥明文传输
    // 允许 localhost/127.0.0.1 使用 HTTP（仅开发调试场景）
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      return u.protocol === 'https:' || u.protocol === 'http:';
    }
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateEndpointInput(input, currentValue) {
  if (input.value && !isValidEndpointUrl(input.value)) {
    alert('Endpoint 格式无效：必须使用 HTTPS（例如 https://api.openai.com）。仅 localhost/127.0.0.1 允许 HTTP（开发调试）。');
    input.value = currentValue || '';
    return false;
  }
  return true;
}

// ============ 诊断工具（集成自 diagnose.html） ============
const DIAG_SETTINGS_KEY = 'dual_translate_settings';
const DIAG_LOCAL_API_KEYS_KEY = 'dual_translate_api_keys_local';

function setupDiagnostics() {
  const btn = document.getElementById('diagnoseStorageBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      _hideAllDiagResults('diagnoseResult');
      runStorageDiagnosis();
    });
  }

  // v1.0.19: 新增诊断工具绑定
  const apiConfigBtn = document.getElementById('diagnoseApiConfigBtn');
  if (apiConfigBtn) {
    apiConfigBtn.addEventListener('click', () => {
      _hideAllDiagResults('diagnoseApiConfigResult');
      runApiConfigDiagnosis();
    });
  }

  const apiStatusBtn = document.getElementById('diagnoseApiStatusBtn');
  if (apiStatusBtn) {
    apiStatusBtn.addEventListener('click', () => {
      _hideAllDiagResults('diagnoseApiStatusResult');
      runApiStatusDiagnosis();
    });
  }

  const usageBtn = document.getElementById('diagnoseUsageBtn');
  if (usageBtn) {
    usageBtn.addEventListener('click', () => {
      _hideAllDiagResults('diagnoseUsageResult');
      runUsageDiagnosis();
    });
  }

  const integrityBtn = document.getElementById('diagnoseIntegrityBtn');
  if (integrityBtn) {
    integrityBtn.addEventListener('click', () => {
      _hideAllDiagResults('diagnoseIntegrityResult');
      runSettingsIntegrityDiagnosis();
    });
  }

  const logBtn = document.getElementById('diagnoseLogBtn');
  if (logBtn) {
    logBtn.addEventListener('click', () => {
      _hideAllDiagResults('diagnoseLogResult');
      setupLogViewer();
      loadLogs();
    });
  }
}

// v1.0.19: 隐藏所有诊断结果区域，仅显示指定的那个
function _hideAllDiagResults(exceptId) {
  const ids = [
    'diagnoseResult', 'diagnoseApiConfigResult', 'diagnoseApiStatusResult',
    'diagnoseUsageResult', 'diagnoseIntegrityResult', 'diagnoseLogResult'
  ];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) {
      if (id === exceptId) {
        el.classList.remove('hidden');
        el.style.display = 'block';
      } else {
        el.classList.add('hidden');
        el.style.display = 'none';
      }
    }
  }
}

// 脱敏显示密钥：前4位 + **** + 后2位
function maskApiValue(val) {
  if (typeof val !== 'string' || val.length === 0) return '';
  if (val.length <= 6) return '****';
  return val.substring(0, 4) + '****' + val.slice(-2);
}

async function runStorageDiagnosis() {
  const resultDiv = document.getElementById('diagnoseResult');
  if (!resultDiv) return;
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div class="diag-loading">正在检查 Storage 状态...</div>';

  try {
    // 并行读取三个来源，任一失败不影响其他
    const [syncRes, localRes, msgRes] = await Promise.allSettled([
      chrome.storage.sync.get(DIAG_SETTINGS_KEY),
      chrome.storage.local.get(DIAG_LOCAL_API_KEYS_KEY),
      chrome.runtime.sendMessage({ action: 'getSettings' })
    ]);

    const syncSettings = syncRes.status === 'fulfilled' ? syncRes.value[DIAG_SETTINGS_KEY] : null;
    const localKeys = localRes.status === 'fulfilled' ? localRes.value[DIAG_LOCAL_API_KEYS_KEY] : null;
    const msgSettings = (msgRes.status === 'fulfilled' && msgRes.value) ? msgRes.value.settings : null;

    const syncApiKeys = syncSettings?.api?.apiKeys || {};
    const localApiKeys = localKeys || {};
    const msgApiKeys = msgSettings?.api?.apiKeys || {};

    // 收集所有 API 名称
    const allApis = new Set([
      ...Object.keys(syncApiKeys),
      ...Object.keys(localApiKeys),
      ...Object.keys(msgApiKeys)
    ]);

    let html = '';

    // 三个来源概览
    const syncCount = Object.keys(syncApiKeys).length;
    const localCount = Object.keys(localApiKeys).length;
    const msgCount = Object.keys(msgApiKeys).length;
    html += '<div class="diag-overview">';
    html += `<div class="diag-source"><span class="diag-source-label">Sync Storage:</span> <span class="${syncCount ? 'diag-ok' : 'diag-empty'}">${syncSettings ? '存在 settings' : '未找到 settings'} / apiKeys: ${syncCount} 个</span></div>`;
    html += `<div class="diag-source"><span class="diag-source-label">Local Storage:</span> <span class="${localCount ? 'diag-ok' : 'diag-empty'}">${localKeys ? '存在密钥' : '未找到密钥'} / apiKeys: ${localCount} 个</span></div>`;
    html += `<div class="diag-source"><span class="diag-source-label">getSettings 消息:</span> <span class="${msgCount ? 'diag-ok' : 'diag-empty'}">${msgSettings ? '返回正常' : '返回无效'} / apiKeys: ${msgCount} 个</span></div>`;
    html += '</div>';

    // 密钥对比表格
    if (allApis.size === 0) {
      html += '<div class="diag-empty-msg">未发现任何已配置的 API 密钥</div>';
    } else {
      html += '<table class="diag-table">';
      html += '<thead><tr><th>API</th><th>字段</th><th>Sync 值</th><th>Local 值</th><th>getSettings 值</th></tr></thead><tbody>';
      for (const apiName of [...allApis].sort()) {
        const syncObj = syncApiKeys[apiName] || {};
        const localObj = localApiKeys[apiName] || {};
        const msgObj = msgApiKeys[apiName] || {};
        const allFields = new Set([...Object.keys(syncObj), ...Object.keys(localObj), ...Object.keys(msgObj)]);
        for (const field of allFields) {
          const sv = syncObj[field];
          const lv = localObj[field];
          const mv = msgObj[field];
          html += '<tr>'
            + `<td>${escapeAttr(apiName)}</td>`
            + `<td>${escapeAttr(field)}</td>`
            + `<td class="${sv ? 'diag-ok' : 'diag-empty'}">${sv ? escapeAttr(maskApiValue(sv)) : '空'}</td>`
            + `<td class="${lv ? 'diag-ok' : 'diag-empty'}">${lv ? escapeAttr(maskApiValue(lv)) : '空'}</td>`
            + `<td class="${mv ? 'diag-ok' : 'diag-empty'}">${mv ? escapeAttr(maskApiValue(mv)) : '空'}</td>`
            + '</tr>';
        }
      }
      html += '</tbody></table>';
    }

    // 迁移按钮：仅当 sync 中有真实密钥时显示
    const hasSyncKeys = Object.values(syncApiKeys).some(k =>
      k && typeof k === 'object' && Object.values(k).some(v => typeof v === 'string' && v.length > 0)
    );
    if (hasSyncKeys) {
      html += '<div class="diag-migrate-area">';
      html += '<button class="btn btn-primary" id="migrateKeysBtn">迁移 Sync→Local 密钥</button>';
      html += '<span class="setting-desc">将 sync 中的 API 密钥复制到 local，然后从 sync 中删除（避免 sync 配额限制导致密钥丢失）</span>';
      html += '</div>';
    }

    resultDiv.innerHTML = html;

    // 绑定迁移按钮
    const migrateBtn = document.getElementById('migrateKeysBtn');
    if (migrateBtn) {
      migrateBtn.addEventListener('click', migrateSyncToLocal);
    }
  } catch (e) {
    resultDiv.innerHTML = `<div class="diag-error">诊断失败：${escapeAttr(e.message || String(e))}</div>`;
  }
}

async function migrateSyncToLocal() {
  try {
    const syncResult = await chrome.storage.sync.get(DIAG_SETTINGS_KEY);
    const syncSettings = syncResult[DIAG_SETTINGS_KEY];
    if (!syncSettings || !syncSettings.api || !syncSettings.api.apiKeys) {
      alert('Sync storage 中没有 apiKeys，无需迁移');
      return;
    }
    const apiKeys = syncSettings.api.apiKeys;
    const hasReal = Object.values(apiKeys).some(k =>
      k && typeof k === 'object' && Object.values(k).some(v => typeof v === 'string' && v.length > 0)
    );
    if (!hasReal) {
      alert('Sync storage 中的 apiKeys 全为空，无需迁移');
      return;
    }
    if (!confirm('确认将 sync storage 中的 apiKeys 迁移到 local storage？\n\n迁移后将从 sync 中删除密钥，避免 sync 存储配额限制导致密钥丢失。')) return;

    // 复制到 local
    await chrome.storage.local.set({ [DIAG_LOCAL_API_KEYS_KEY]: apiKeys });
    // 从 sync 中删除
    delete syncSettings.api.apiKeys;
    await chrome.storage.sync.set({ [DIAG_SETTINGS_KEY]: syncSettings });

    // 通知 background 重新加载 API 缓存
    chrome.runtime.sendMessage({ action: 'reloadApis' }).catch(() => {});

    alert('迁移完成！建议重新加载扩展并刷新设置页以确认密钥状态。');
    // 重新运行诊断以刷新结果
    runStorageDiagnosis();
  } catch (e) {
    alert('迁移失败：' + (e.message || String(e)));
  }
}

// ============ v1.0.19: 新增诊断工具 ============

// 工具2: API 配置概览
async function runApiConfigDiagnosis() {
  const resultDiv = document.getElementById('diagnoseApiConfigResult');
  if (!resultDiv) return;
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div class="diag-loading">正在检查 API 配置...</div>';

  try {
    const msgRes = await chrome.runtime.sendMessage({ action: 'getSettings' });
    const s = msgRes?.settings || settings || {};
    const priority = s.api?.apiPriority || [];
    const apiKeys = s.api?.apiKeys || {};
    const enabledApis = s.api?.enabledApis || {};
    const apiEndpoints = s.api?.apiEndpoints || {};
    const apiModels = s.api?.apiModels || {};
    const customProviders = s.api?.customProviders || [];
    const quotaLimits = s.api?.quotaLimits || {};

    let configured = 0, enabled = 0, incomplete = 0, total = 0;

    let html = '<div class="diag-section-title">API 配置概览</div>';

    // 摘要
    for (const apiName of priority) {
      if (!API_DISPLAY_NAMES[apiName] && !apiName.startsWith('custom_')) continue;
      total++;
      const keys = apiKeys[apiName] || {};
      const provider = apiName.startsWith('custom_')
        ? customProviders.find(p => p.id === apiName.slice(7))
        : null;
      const { complete, missing } = checkApiCompleteness(apiName, keys, provider);
      const hasContent = apiName.startsWith('custom_')
        ? (provider?.apiKey || provider?.endpoint)
        : Object.values(keys).some(v => v);
      if (hasContent) configured++;
      if (complete && hasContent) enabled++;
      if (!complete && hasContent) incomplete++;
    }

    html += '<div class="diag-summary">';
    html += `<div class="diag-summary-item"><span>总数</span><span class="diag-summary-value">${total}</span></div>`;
    html += `<div class="diag-summary-item"><span>已配置</span><span class="diag-summary-value ok">${configured}</span></div>`;
    html += `<div class="diag-summary-item"><span>完整可用</span><span class="diag-summary-value ok">${enabled}</span></div>`;
    html += `<div class="diag-summary-item"><span>配置不全</span><span class="diag-summary-value ${incomplete > 0 ? 'warn' : ''}">${incomplete}</span></div>`;
    html += '</div>';

    // 详细列表
    html += '<table class="diag-table">';
    html += '<thead><tr><th>API</th><th>启用</th><th>密钥</th><th>模型</th><th>端点</th><th>配额限制</th><th>完整性</th></tr></thead><tbody>';

    for (const apiName of priority) {
      if (!API_DISPLAY_NAMES[apiName] && !apiName.startsWith('custom_')) continue;
      const displayName = getApiDisplayName(apiName);
      const keys = apiKeys[apiName] || {};
      const provider = apiName.startsWith('custom_')
        ? customProviders.find(p => p.id === apiName.slice(7))
        : null;
      const { complete, missing } = checkApiCompleteness(apiName, keys, provider);

      const isEnabled = enabledApis[apiName] !== false;
      const hasContent = apiName.startsWith('custom_')
        ? (provider?.apiKey || provider?.endpoint)
        : Object.values(keys).some(v => v);

      const model = apiName.startsWith('custom_') ? (provider?.model || '') : (apiModels[apiName] || DEFAULT_API_MODELS[apiName] || '');
      const endpoint = apiName.startsWith('custom_') ? (provider?.endpoint || '') : (apiEndpoints[apiName] || DEFAULT_API_ENDPOINTS[apiName] || '');
      const quota = quotaLimits[apiName];

      html += '<tr>';
      html += `<td>${escapeAttr(displayName)}</td>`;
      html += `<td>${isEnabled ? '<span class="diag-ok">✓</span>' : '<span class="diag-empty">✗</span>'}</td>`;
      html += `<td class="${hasContent ? 'diag-ok' : 'diag-empty'}">${hasContent ? '已配置' : '空'}</td>`;
      html += `<td>${escapeAttr(model || '默认')}</td>`;
      html += `<td>${endpoint ? escapeAttr(endpoint.substring(0, 40)) + (endpoint.length > 40 ? '...' : '') : '默认'}</td>`;
      html += `<td>${quota?.enabled ? `${quota.limit} ${quota.unit}/${quota.resetType === 'daily' ? '日' : '月'}` : '未限制'}</td>`;
      html += `<td class="${complete ? 'diag-ok' : 'diag-empty'}">${complete ? '完整' : '缺: ' + escapeAttr(missing.join(', '))}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table>';

    // 优先级链路
    html += '<div class="diag-section-title">翻译优先级链路（从上到下依次尝试）</div>';
    html += '<div class="diag-chain-container">';
    const chainItems = priority.filter(name => API_DISPLAY_NAMES[name] || name.startsWith('custom_'));
    chainItems.forEach((apiName, idx) => {
      const isEnabled = enabledApis[apiName] !== false;
      const keys = apiKeys[apiName] || {};
      const provider = apiName.startsWith('custom_')
        ? customProviders.find(p => p.id === apiName.slice(7))
        : null;
      const hasContent = apiName.startsWith('custom_')
        ? (provider?.apiKey || provider?.endpoint)
        : Object.values(keys).some(v => v);
      const isActive = isEnabled && hasContent;
      const cls = isActive ? 'diag-chain-item active' : 'diag-chain-item skipped';
      html += `<span class="${cls}">${escapeAttr(getApiDisplayName(apiName))}</span>`;
      if (idx < chainItems.length - 1) html += '<span class="diag-chain-arrow">→</span>';
    });
    html += '</div>';

    resultDiv.innerHTML = html;
  } catch (e) {
    resultDiv.innerHTML = `<div class="diag-error">诊断失败：${escapeAttr(e.message || String(e))}</div>`;
  }
}

// 工具3: API 状态与轮转链路
async function runApiStatusDiagnosis() {
  const resultDiv = document.getElementById('diagnoseApiStatusResult');
  if (!resultDiv) return;
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div class="diag-loading">正在检查 API 状态...</div>';

  try {
    const [statusRes, configRes] = await Promise.allSettled([
      chrome.runtime.sendMessage({ action: 'getApiStatus' }),
      chrome.runtime.sendMessage({ action: 'getSettings' })
    ]);

    const statusData = statusRes.status === 'fulfilled' ? statusRes.value : null;
    const configData = configRes.status === 'fulfilled' ? configRes.value : null;
    const s = configData?.settings || settings || {};
    const priority = s.api?.apiPriority || [];
    const enabledApis = s.api?.enabledApis || {};
    const apiKeys = s.api?.apiKeys || {};
    const customProviders = s.api?.customProviders || [];
    const statusMap = statusData?.status || {};

    let available = 0, exhausted = 0, errorCount = 0, disabled = 0, unconfigured = 0;

    let html = '<div class="diag-section-title">API 运行状态</div>';

    // 摘要
    for (const apiName of priority) {
      if (!API_DISPLAY_NAMES[apiName] && !apiName.startsWith('custom_')) continue;
      const st = statusMap[apiName];
      const isEnabled = enabledApis[apiName] !== false;
      const keys = apiKeys[apiName] || {};
      const provider = apiName.startsWith('custom_')
        ? customProviders.find(p => p.id === apiName.slice(7))
        : null;
      const hasContent = apiName.startsWith('custom_')
        ? (provider?.apiKey || provider?.endpoint)
        : Object.values(keys).some(v => v);

      if (!hasContent) { unconfigured++; continue; }
      if (!isEnabled) { disabled++; continue; }

      const status = st?.status || 'available';
      if (status === 'available') available++;
      else if (status === 'quota_exceeded') exhausted++;
      else if (status === 'error' || status === 'auth_error') errorCount++;
    }

    html += '<div class="diag-summary">';
    html += `<div class="diag-summary-item"><span>可用</span><span class="diag-summary-value ok">${available}</span></div>`;
    html += `<div class="diag-summary-item"><span>配额耗尽</span><span class="diag-summary-value ${exhausted > 0 ? 'warn' : ''}">${exhausted}</span></div>`;
    html += `<div class="diag-summary-item"><span>错误</span><span class="diag-summary-value ${errorCount > 0 ? 'err' : ''}">${errorCount}</span></div>`;
    html += `<div class="diag-summary-item"><span>已禁用</span><span class="diag-summary-value">${disabled}</span></div>`;
    html += `<div class="diag-summary-item"><span>未配置</span><span class="diag-summary-value">${unconfigured}</span></div>`;
    html += '</div>';

    // 详细状态表
    html += '<table class="diag-table">';
    html += '<thead><tr><th>API</th><th>状态</th><th>原因</th><th>上次更新</th><th>重试次数</th></tr></thead><tbody>';

    for (const apiName of priority) {
      if (!API_DISPLAY_NAMES[apiName] && !apiName.startsWith('custom_')) continue;
      const displayName = getApiDisplayName(apiName);
      const st = statusMap[apiName];
      const isEnabled = enabledApis[apiName] !== false;
      const keys = apiKeys[apiName] || {};
      const provider = apiName.startsWith('custom_')
        ? customProviders.find(p => p.id === apiName.slice(7))
        : null;
      const hasContent = apiName.startsWith('custom_')
        ? (provider?.apiKey || provider?.endpoint)
        : Object.values(keys).some(v => v);

      let statusText, statusClass;
      if (!hasContent) { statusText = '未配置'; statusClass = 'unconfigured'; }
      else if (!isEnabled) { statusText = '已禁用'; statusClass = 'disabled'; }
      else {
        const status = st?.status || 'available';
        if (status === 'available') { statusText = '可用'; statusClass = 'available'; }
        else if (status === 'quota_exceeded') { statusText = '配额耗尽'; statusClass = 'exhausted'; }
        else if (status === 'error') { statusText = '错误'; statusClass = 'error'; }
        else if (status === 'auth_error') { statusText = '认证错误'; statusClass = 'error'; }
        else { statusText = status; statusClass = 'unconfigured'; }
      }

      const reason = st?.reason || '-';
      const updatedAt = st?.updatedAt ? new Date(st.updatedAt).toLocaleString('zh-CN') : '-';
      const retryCount = st?.retryCount ?? '-';

      html += '<tr>';
      html += `<td>${escapeAttr(displayName)}</td>`;
      html += `<td><span class="diag-status-badge ${statusClass}">${statusText}</span></td>`;
      html += `<td>${escapeAttr(reason)}</td>`;
      html += `<td>${updatedAt}</td>`;
      html += `<td>${retryCount}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table>';

    // 实际轮转链路（仅显示当前可用的 API）
    html += '<div class="diag-section-title">当前可用轮转链路</div>';
    const activeChain = priority.filter(apiName => {
      if (!API_DISPLAY_NAMES[apiName] && !apiName.startsWith('custom_')) return false;
      const isEnabled = enabledApis[apiName] !== false;
      const keys = apiKeys[apiName] || {};
      const provider = apiName.startsWith('custom_')
        ? customProviders.find(p => p.id === apiName.slice(7))
        : null;
      const hasContent = apiName.startsWith('custom_')
        ? (provider?.apiKey || provider?.endpoint)
        : Object.values(keys).some(v => v);
      const st = statusMap[apiName];
      return isEnabled && hasContent && (!st || st.status === 'available');
    });

    if (activeChain.length === 0) {
      html += '<div class="diag-empty-msg">当前没有可用的 API，翻译功能将无法使用</div>';
    } else {
      html += '<div class="diag-chain-container">';
      activeChain.forEach((apiName, idx) => {
        html += `<span class="diag-chain-item active">${escapeAttr(getApiDisplayName(apiName))}</span>`;
        if (idx < activeChain.length - 1) html += '<span class="diag-chain-arrow">→</span>';
      });
      html += '</div>';
    }

    resultDiv.innerHTML = html;
  } catch (e) {
    resultDiv.innerHTML = `<div class="diag-error">诊断失败：${escapeAttr(e.message || String(e))}</div>`;
  }
}

// 工具4: 用量数据检查
async function runUsageDiagnosis() {
  const resultDiv = document.getElementById('diagnoseUsageResult');
  if (!resultDiv) return;
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div class="diag-loading">正在检查用量数据...</div>';

  try {
    const [dailyRes, monthlyRes, configRes] = await Promise.allSettled([
      chrome.runtime.sendMessage({ action: 'getDailyUsage' }),
      chrome.runtime.sendMessage({ action: 'getMonthlyUsage' }),
      chrome.runtime.sendMessage({ action: 'getSettings' })
    ]);

    const daily = dailyRes.status === 'fulfilled' ? dailyRes.value : {};
    const monthly = monthlyRes.status === 'fulfilled' ? monthlyRes.value?.usage : {};
    const s = configRes.status === 'fulfilled' ? configRes.value?.settings : settings || {};
    const priority = s.api?.apiPriority || [];
    const quotaLimits = s.api?.quotaLimits || {};

    const today = new Date().toDateString();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    let html = '<div class="diag-section-title">用量数据检查</div>';

    // 日期标记检查
    html += '<div class="diag-config-card">';
    html += `<div><strong>每日用量日期标记:</strong> ${escapeAttr(daily._date || '缺失')} ${daily._date === today ? '<span class="diag-ok">✓ 当天</span>' : '<span class="diag-empty">⚠ 非当天，将在下次翻译时重置</span>'}</div>`;
    html += `<div><strong>每月用量月份标记:</strong> ${escapeAttr(monthly._month || '缺失')} ${monthly._month === currentMonth ? '<span class="diag-ok">✓ 当月</span>' : '<span class="diag-empty">⚠ 非当月，将在下次翻译时重置</span>'}</div>`;
    html += '</div>';

    // 用量明细表
    html += '<table class="diag-table">';
    html += '<thead><tr><th>API</th><th>今日用量</th><th>本月用量</th><th>配额限制</th><th>配额单位</th><th>重置周期</th><th>使用率</th></tr></thead><tbody>';

    let totalDaily = 0, totalMonthly = 0;

    for (const apiName of priority) {
      if (!API_DISPLAY_NAMES[apiName] && !apiName.startsWith('custom_')) continue;
      const displayName = getApiDisplayName(apiName);
      const dCount = (daily._date === today) ? (daily[apiName] || 0) : 0;
      const mCount = (monthly._month === currentMonth) ? (monthly[apiName] || 0) : 0;
      totalDaily += dCount;
      totalMonthly += mCount;

      const quota = quotaLimits[apiName];
      const limit = quota?.enabled ? quota.limit : 0;
      const unit = quota?.unit || 'chars';
      const resetType = quota?.resetType || 'monthly';

      let usageRate = '-';
      let usageClass = '';
      if (limit > 0) {
        const used = resetType === 'daily' ? dCount : mCount;
        const pct = Math.round((used / limit) * 100);
        usageRate = pct + '%';
        if (pct >= 90) usageClass = 'diag-empty';
        else if (pct >= 70) usageClass = 'diag-warn';
      }

      html += '<tr>';
      html += `<td>${escapeAttr(displayName)}</td>`;
      html += `<td>${dCount.toLocaleString()}</td>`;
      html += `<td>${mCount.toLocaleString()}</td>`;
      html += `<td>${limit > 0 ? limit.toLocaleString() : '无限制'}</td>`;
      html += `<td>${unit === 'chars' ? '字符' : 'Token'}</td>`;
      html += `<td>${resetType === 'daily' ? '每日' : '每月'}</td>`;
      html += `<td class="${usageClass}">${usageRate}</td>`;
      html += '</tr>';
    }

    // 合计行
    // v1.2.2 fix: Bug 9 - 使用已定义的 CSS 变量 --bg-hover 替代未定义的 --bg-secondary
    html += '<tr style="font-weight:600;background:var(--bg-hover);">';
    html += `<td>合计</td>`;
    html += `<td>${totalDaily.toLocaleString()}</td>`;
    html += `<td>${totalMonthly.toLocaleString()}</td>`;
    html += '<td colspan="4"></td>';
    html += '</tr>';
    html += '</tbody></table>';

    // 读取本地存储中的原始 apiStatus 数据
    html += '<div class="diag-section-title">API 状态存储详情（local storage）</div>';
    const allLocal = await chrome.storage.local.get(null);
    const statusKeys = Object.keys(allLocal).filter(k => k.startsWith('apiStatus_'));
    if (statusKeys.length === 0) {
      html += '<div class="diag-empty-msg">未发现 API 状态存储数据</div>';
    } else {
      html += '<table class="diag-table">';
      html += '<thead><tr><th>存储键</th><th>状态</th><th>原因</th><th>更新时间</th></tr></thead><tbody>';
      for (const key of statusKeys.sort()) {
        const st = allLocal[key];
        const apiName = key.slice(10);
        const displayName = API_DISPLAY_NAMES[apiName] || apiName;
        html += '<tr>';
        html += `<td>${escapeAttr(displayName)}</td>`;
        html += `<td>${escapeAttr(st?.status || 'unknown')}</td>`;
        html += `<td>${escapeAttr(st?.reason || '-')}</td>`;
        html += `<td>${st?.updatedAt ? new Date(st.updatedAt).toLocaleString('zh-CN') : '-'}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table>';
    }

    resultDiv.innerHTML = html;
  } catch (e) {
    resultDiv.innerHTML = `<div class="diag-error">诊断失败：${escapeAttr(e.message || String(e))}</div>`;
  }
}

// 工具5: 设置完整性验证
async function runSettingsIntegrityDiagnosis() {
  const resultDiv = document.getElementById('diagnoseIntegrityResult');
  if (!resultDiv) return;
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div class="diag-loading">正在验证设置完整性...</div>';

  try {
    const msgRes = await chrome.runtime.sendMessage({ action: 'getSettings' });
    const s = msgRes?.settings || settings || {};

    const issues = [];
    const warnings = [];

    // 1. 检查基本结构
    const requiredSections = ['display', 'trigger', 'api', 'advanced', 'general'];
    for (const section of requiredSections) {
      if (!s[section]) issues.push(`缺少配置节: ${section}`);
    }

    // 2. 检查 api 结构
    if (s.api) {
      if (!Array.isArray(s.api.apiPriority)) issues.push('api.apiPriority 不是数组');
      if (typeof s.api.enabledApis !== 'object') issues.push('api.enabledApis 不是对象');
      if (typeof s.api.apiKeys !== 'object') issues.push('api.apiKeys 不是对象');
      if (!Array.isArray(s.api.customProviders)) issues.push('api.customProviders 不是数组');

      // 3. 检查 apiPriority 中的条目是否都在已知 API 中
      const knownNames = new Set([...Object.keys(API_DISPLAY_NAMES)]);
      // 添加已配置的自定义供应商
      if (Array.isArray(s.api.customProviders)) {
        for (const p of s.api.customProviders) {
          if (p?.id) knownNames.add('custom_' + p.id);
        }
      }
      for (const name of (s.api.apiPriority || [])) {
        if (!knownNames.has(name) && !name.startsWith('custom_')) {
          warnings.push(`apiPriority 中存在未知 API: ${name}`);
        }
      }

      // 4. 检查 apiKeys 中的条目是否都在 apiPriority 中
      for (const name of Object.keys(s.api.apiKeys || {})) {
        if (!name.startsWith('custom_') && !(s.api.apiPriority || []).includes(name)) {
          warnings.push(`apiKeys 中有 API 不在 apiPriority 中: ${name}`);
        }
      }

      // 5. 检查 customProviders 的完整性
      if (Array.isArray(s.api.customProviders)) {
        for (const p of s.api.customProviders) {
          if (!p.id) issues.push(`自定义供应商缺少 id 字段`);
          if (!p.name) warnings.push(`自定义供应商 ${p.id || '未知'} 缺少 name 字段`);
          if (!p.apiKey && !p.endpoint) warnings.push(`自定义供应商 ${p.name || p.id || '未知'} 的 apiKey 和 endpoint 均为空`);
        }
      }

      // 6. 检查 quotaLimits 结构
      if (s.api.quotaLimits && typeof s.api.quotaLimits === 'object') {
        for (const [name, limit] of Object.entries(s.api.quotaLimits)) {
          if (typeof limit !== 'object') { issues.push(`quotaLimits.${name} 不是对象`); continue; }
          if (limit.enabled && (!limit.limit || limit.limit <= 0)) {
            warnings.push(`quotaLimits.${name} 已启用但限额为 0`);
          }
          if (limit.unit && !['chars', 'tokens'].includes(limit.unit)) {
            issues.push(`quotaLimits.${name} 的 unit 值无效: ${limit.unit}`);
          }
          if (limit.resetType && !['daily', 'monthly'].includes(limit.resetType)) {
            issues.push(`quotaLimits.${name} 的 resetType 值无效: ${limit.resetType}`);
          }
        }
      }
    }

    // 7. 检查 general 结构
    if (s.general) {
      if (typeof s.general.logLevel !== 'number' || s.general.logLevel < 0 || s.general.logLevel > 4) {
        issues.push(`general.logLevel 值无效: ${s.general.logLevel}（应为 0-4）`);
      }
      if (typeof s.general.translationEnabled !== 'boolean') {
        warnings.push(`general.translationEnabled 不是布尔值: ${typeof s.general.translationEnabled}`);
      }
    }

    // 8. 检查 advanced 结构
    if (s.advanced) {
      if (typeof s.advanced.batchSize !== 'number' || s.advanced.batchSize < 1 || s.advanced.batchSize > 50) {
        warnings.push(`advanced.batchSize 值异常: ${s.advanced.batchSize}（建议 1-50）`);
      }
      if (typeof s.advanced.requestTimeout !== 'number' || s.advanced.requestTimeout < 1 || s.advanced.requestTimeout > 60) {
        warnings.push(`advanced.requestTimeout 值异常: ${s.advanced.requestTimeout}（建议 1-60）`);
      }
    }

    // 9. 检查 display 结构
    if (s.display) {
      const validModes = ['bilingual', 'translation-only', 'hover', 'panel'];
      // v1.2.2 fix: Bug 3 - 字段名应为 defaultMode 而非 mode
      if (!validModes.includes(s.display.defaultMode)) {
        issues.push(`display.defaultMode 值无效: ${s.display.defaultMode}`);
      }
    }

    // 10. 检查 trigger 结构
    if (s.trigger) {
      // v1.2.2 fix: Bug 3 - trigger 结构使用 excludeList 而非 whitelist/blacklist
      if (!Array.isArray(s.trigger.excludeList)) warnings.push('trigger.excludeList 不是数组');
      if (!['whitelist', 'blacklist'].includes(s.trigger.excludeMode)) {
        issues.push(`trigger.excludeMode 值无效: ${s.trigger.excludeMode}`);
      }
    }

    // 11. 检查本地存储中的 apiKeys 与 sync 中的是否一致
    const localRes = await chrome.storage.local.get(DIAG_LOCAL_API_KEYS_KEY);
    const localKeys = localRes[DIAG_LOCAL_API_KEYS_KEY] || {};
    const syncApiKeys = s.api?.apiKeys || {};
    const syncApiNames = new Set(Object.keys(syncApiKeys));
    const localApiNames = new Set(Object.keys(localKeys));
    for (const name of syncApiNames) {
      if (!localApiNames.has(name)) {
        warnings.push(`sync 中有 apiKeys.${name} 但 local 中没有（可能需要迁移）`);
      }
    }

    let html = '<div class="diag-section-title">设置完整性验证结果</div>';
    html += '<div class="diag-summary">';
    html += `<div class="diag-summary-item"><span>错误</span><span class="diag-summary-value ${issues.length > 0 ? 'err' : 'ok'}">${issues.length}</span></div>`;
    html += `<div class="diag-summary-item"><span>警告</span><span class="diag-summary-value ${warnings.length > 0 ? 'warn' : 'ok'}">${warnings.length}</span></div>`;
    html += '</div>';

    if (issues.length > 0) {
      html += '<div class="diag-section-title">错误（需要修复）</div>';
      html += '<div class="diag-error">';
      for (const issue of issues) html += `<div>• ${escapeAttr(issue)}</div>`;
      html += '</div>';
    }

    if (warnings.length > 0) {
      html += '<div class="diag-section-title">警告（建议检查）</div>';
      html += '<div class="diag-config-card" style="background:#fef3c7;">';
      for (const w of warnings) html += `<div>• ${escapeAttr(w)}</div>`;
      html += '</div>';
    }

    if (issues.length === 0 && warnings.length === 0) {
      html += '<div class="diag-config-card" style="background:#d1fae5;color:#065f46;">';
      html += '<div>✓ 所有设置项验证通过，未发现异常</div>';
      html += '</div>';
    }

    // 设置概览
    html += '<div class="diag-section-title">设置概览</div>';
    html += '<div class="diag-config-card">';
    // v1.2.2 fix: 设置概览使用新字段名 defaultMode（原为 mode）
    html += `<div><strong>翻译模式:</strong> ${escapeAttr(s.display?.defaultMode || '未设置')}</div>`;
    html += `<div><strong>源语言:</strong> ${escapeAttr(s.api?.sourceLanguage || 'auto')}</div>`;
    html += `<div><strong>日志级别:</strong> ${s.general?.logLevel ?? '未设置'}</div>`;
    html += `<div><strong>批量大小:</strong> ${s.advanced?.batchSize ?? '未设置'} 段</div>`;
    html += `<div><strong>超时时间:</strong> ${s.advanced?.requestTimeout ?? '未设置'} 秒</div>`;
    html += `<div><strong>懒加载:</strong> ${s.advanced?.lazyTranslate ? '开启' : '关闭'}</div>`;
    html += `<div><strong>翻译缓存:</strong> ${s.trigger?.translationCache ? '开启' : '关闭'}</div>`;
    // v1.2.2 fix: 使用新字段名 excludeList/excludeMode 替代旧的 whitelist/blacklist
    html += `<div><strong>排除列表数量:</strong> ${s.trigger?.excludeList?.length || 0}</div>`;
    html += `<div><strong>排除模式:</strong> ${escapeAttr(s.trigger?.excludeMode || '未设置')}</div>`;
    html += `<div><strong>快捷键:</strong> ${escapeAttr(s.general?.toggleTranslateShortcut || 'Alt+T')}</div>`;
    html += `<div><strong>自定义供应商数量:</strong> ${s.api?.customProviders?.length || 0}</div>`;
    html += `<div><strong>配额限制数量:</strong> ${Object.keys(s.api?.quotaLimits || {}).length}</div>`;
    html += '</div>';

    resultDiv.innerHTML = html;
  } catch (e) {
    resultDiv.innerHTML = `<div class="diag-error">诊断失败：${escapeAttr(e.message || String(e))}</div>`;
  }
}

// 工具6: 运行日志查看器
let _logViewerInitialized = false;
let _logLoadingInFlight = false;

function setupLogViewer() {
  if (_logViewerInitialized) return;
  _logViewerInitialized = true;

  const refreshBtn = document.getElementById('diagLogRefreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadLogs);

  const clearBtn = document.getElementById('diagLogClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', async () => {
    if (!confirm('确认清空所有运行日志？此操作不可撤销。')) return;
    clearBtn.disabled = true;
    clearBtn.textContent = '清空中...';
    try {
      await chrome.runtime.sendMessage({ action: 'clearLogs' });
      await loadLogs();
    } catch (e) {
      console.error('[diag] clearLogs failed:', e);
    } finally {
      clearBtn.disabled = false;
      clearBtn.textContent = '🗑 清空日志';
    }
  });

  const copyBtn = document.getElementById('diagLogCopyBtn');
  if (copyBtn) copyBtn.addEventListener('click', copyLogs);

  const filterSel = document.getElementById('diagLogLevelFilter');
  if (filterSel) filterSel.addEventListener('change', loadLogs);
}

async function loadLogs() {
  // v1.0.19 fix: 并发保护，防止快速连续点击导致 innerHTML 竞争覆写
  if (_logLoadingInFlight) return;
  _logLoadingInFlight = true;

  const listEl = document.getElementById('diagLogList');
  const infoEl = document.getElementById('diagLogInfo');
  const refreshBtn = document.getElementById('diagLogRefreshBtn');
  if (!listEl) { _logLoadingInFlight = false; return; }

  if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.textContent = '加载中...'; }
  listEl.innerHTML = '<div class="diag-log-empty">正在加载日志...</div>';

  try {
    const filterSel = document.getElementById('diagLogLevelFilter');
    const level = filterSel?.value || 'all';

    // v1.0.19 fix: 并行请求日志和配置，避免串行延迟
    const [logsRes, configRes] = await Promise.allSettled([
      chrome.runtime.sendMessage({ action: 'getLogs', level, limit: 500 }),
      chrome.runtime.sendMessage({ action: 'getLogConfig' })
    ]);

    // 日志请求失败才报错，配置请求失败不影响日志展示
    if (logsRes.status !== 'fulfilled') {
      throw logsRes.reason || new Error('getLogs 请求失败');
    }

    const res = logsRes.value;
    const logs = res?.logs || [];
    const total = res?.total ?? 0;

    // 更新信息栏（配置请求失败时降级显示）
    if (infoEl) {
      const levelText = { 0: '静默', 1: '仅错误', 2: '警告', 3: '信息', 4: '调试' };
      const configData = configRes.status === 'fulfilled' ? configRes.value : null;
      const lv = configData?.logLevel ?? 2;
      infoEl.textContent = `缓冲区: ${total} 条 | 日志级别: ${levelText[lv] || lv} | 显示: ${logs.length} 条`;
    }

    if (logs.length === 0) {
      listEl.innerHTML = '<div class="diag-log-empty">暂无日志记录</div>';
      return;
    }

    listEl.innerHTML = logs.map(entry => {
      const time = new Date(entry.ts).toLocaleTimeString('zh-CN', { hour12: false }) +
        '.' + String(entry.ts % 1000).padStart(3, '0');
      const levelText = { error: 'ERROR', warn: 'WARN', info: 'INFO', debug: 'DEBUG' }[entry.level] || entry.level.toUpperCase();
      return `<div class="diag-log-entry">`
        + `<span class="diag-log-time">${time}</span>`
        + `<span class="diag-log-level ${entry.level}">${levelText}</span>`
        + `<span class="diag-log-msg">${escapeAttr(entry.msg)}</span>`
        + `</div>`;
    }).join('');

    // 自动滚动到底部（最新日志）
    listEl.scrollTop = listEl.scrollHeight;
  } catch (e) {
    listEl.innerHTML = `<div class="diag-log-empty" style="color:#f48771;">加载日志失败: ${escapeAttr(e.message || String(e))}</div>`;
  } finally {
    _logLoadingInFlight = false;
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = '🔄 刷新'; }
  }
}

async function copyLogs() {
  try {
    const filterSel = document.getElementById('diagLogLevelFilter');
    const level = filterSel?.value || 'all';
    const res = await chrome.runtime.sendMessage({ action: 'getLogs', level, limit: 500 });
    const logs = res?.logs || [];

    if (logs.length === 0) {
      alert('没有日志可复制');
      return;
    }

    const text = logs.map(entry => {
      const time = new Date(entry.ts).toISOString();
      return `[${time}] [${entry.level.toUpperCase()}] ${entry.msg}`;
    }).join('\n');

    await navigator.clipboard.writeText(text);
    alert(`已复制 ${logs.length} 条日志到剪贴板`);
  } catch (e) {
    alert('复制失败: ' + (e.message || String(e)));
  }
}
