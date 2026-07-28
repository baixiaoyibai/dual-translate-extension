let settings = null;
// v1.0.4: 域名专属术语表（§3.3）— glossaryByDomain: { _global: [...], "host": [...], "*.wildcard": [...] }
let glossaryByDomain = { _global: [] };
let currentScope = '_global';
let apiStatus = {};
let dailyUsage = {};

const API_DISPLAY_NAMES = (typeof window !== 'undefined' && window.API_DISPLAY_NAMES) ? window.API_DISPLAY_NAMES : {};
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

document.addEventListener('DOMContentLoaded', async () => {
  await chrome.runtime.sendMessage({ action: 'reloadApis' });
  await loadAllData();
  setupTabSwitching();
  setupDisplaySettings();
  setupRulesSettings();
  setupGlossaryManagement();
  setupApiManagement();
  setupAdvancedSettings();
});

function showSavedTip() {
  const tip = document.getElementById('savedTip');
  tip.classList.add('show');
  setTimeout(() => tip.classList.remove('show'), 1500);
}

async function loadAllData() {
  const res = await chrome.runtime.sendMessage({ action: 'getSettings' });
  if (res && res.settings) {
    settings = res.settings;
  }
  const glossaryRes = await chrome.runtime.sendMessage({ action: 'getGlossary' });
  if (glossaryRes && glossaryRes.glossary) {
    glossaryByDomain = glossaryRes.glossary;
    if (!glossaryByDomain._global) glossaryByDomain._global = [];
  }
  const apiRes = await chrome.runtime.sendMessage({ action: 'getApiStatus' });
  if (apiRes && apiRes.status) {
    apiStatus = apiRes.status;
  }
  const usageRes = await chrome.runtime.sendMessage({ action: 'getDailyUsage' });
  if (usageRes) {
    dailyUsage = usageRes;
  }
}

async function saveSetting(path, value) {
  await chrome.runtime.sendMessage({ action: 'updateSettings', path, value });
}

async function saveAllSettings(newSettings) {
  await chrome.runtime.sendMessage({ action: 'saveSettings', settings: newSettings });
  settings = newSettings;
}

function setupTabSwitching() {
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
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
    if (path === 'trigger.contextMenu' || path === 'trigger.autoTranslate' || path === 'trigger.translationCache') {
      chrome.runtime.sendMessage({ action: 'reloadApis' });
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
    saveGlossary();
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
    document.getElementById('confirmImportBtn').dataset.action = 'import';
  });

  document.getElementById('confirmImportBtn').addEventListener('click', () => {
    const text = document.getElementById('importExportText').value.trim();
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('格式错误');
      glossaryByDomain[currentScope] = data;
      renderGlossaryTable();
      saveGlossary();
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
    saveGlossary();
  });

  // v1.0.4: 删除当前 scope（_global 不可删）
  document.getElementById('deleteScopeBtn').addEventListener('click', () => {
    if (currentScope === '_global') { alert('全局范围不可删除'); return; }
    if (!confirm(`确定删除域名范围 "${currentScope}" 的所有术语？`)) return;
    delete glossaryByDomain[currentScope];
    currentScope = '_global';
    populateScopeSelect();
    renderGlossaryTable();
    saveGlossary();
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
      saveGlossary();
    });
  });

  tbody.querySelectorAll('select[data-field]').forEach(select => {
    select.addEventListener('change', () => {
      const idx = parseInt(select.dataset.index);
      const arr = getCurrentEntries();
      if (!arr[idx]) return;
      arr[idx].matchType = select.value;
      saveGlossary();
    });
  });

  tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      const arr = getCurrentEntries();
      if (idx < 0 || idx >= arr.length) return;
      arr.splice(idx, 1);
      renderGlossaryTable();
      saveGlossary();
    });
  });
}

async function saveGlossary() {
  await chrome.runtime.sendMessage({ action: 'saveGlossary', glossary: glossaryByDomain });
}

if (typeof window.escapeAttr !== 'function') {
  window.escapeAttr = function(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };
}
if (typeof window.escapeHtml !== 'function') {
  window.escapeHtml = function(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };
}

function setupApiManagement() {
  renderApiCards();
  renderCustomProviders();
  renderApiPriority();
  renderApiUsage();
}

function getApiDisplayName(apiName) {
  if (typeof window.getApiDisplayName === 'function') return window.getApiDisplayName(apiName, settings?.api?.customProviders);
  if (API_DISPLAY_NAMES[apiName]) return API_DISPLAY_NAMES[apiName];
  if (apiName.startsWith('custom_')) {
    const provider = (settings.api.customProviders || []).find(p => p.id === apiName.slice(7));
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
      
      return `
        <div class="api-card">
          <div class="api-card-header">
            <span class="api-card-name">
              <label class="toggle-switch" style="vertical-align:middle;margin-right:8px;">
                <input type="checkbox" class="api-enable" data-api="${apiName}" ${enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
              ${escapeAttr(provider.name)}
            </span>
            <span class="api-card-status ${statusClass}">${status?.status === 'available' ? '可用' : status?.status === 'quota_exceeded' ? '额度不足' : status?.status === 'error' ? '异常' : status?.status === 'auth_error' ? '密钥错误' : '未配置'}</span>
            <button class="btn btn-sm api-test-btn" data-api="${apiName}">测试</button>
          </div>
          <div class="api-card-body">
            <div class="api-field-group">
              <span class="api-field-label">显示名称</span>
              <input type="text" class="api-field" data-api="${apiName}" data-field="name" value="${escapeAttr(provider.name)}">
            </div>
            <div class="api-field-group">
              <span class="api-field-label">API Key</span>
              <input type="password" class="api-field" data-api="${apiName}" data-field="apiKey" value="${escapeAttr(provider.apiKey)}">
            </div>
            <div class="api-field-group">
              <span class="api-field-label">Endpoint</span>
              <input type="text" class="api-field" data-api="${apiName}" data-field="endpoint" value="${escapeAttr(provider.endpoint)}">
            </div>
            <div class="api-field-group">
              <span class="api-field-label">模型</span>
              <input type="text" class="api-field" data-api="${apiName}" data-field="model" value="${escapeAttr(provider.model)}">
            </div>
            <div class="api-field-group">
              <label class="toggle-switch" style="vertical-align:middle;">
                <input type="checkbox" class="api-toggle" data-api="${apiName}" data-field="enabled" ${provider.enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
              <span style="margin-left:8px;">启用</span>
            </div>
          </div>
        </div>
      `;
    }

    let fieldsHtml = '';
    if (['baidu', 'baidu_llm'].includes(apiName)) {
      fieldsHtml = fields.map(f => `
        <div class="api-field-group">
          <span class="api-field-label">${escapeAttr(f.label)}</span>
          <input type="${f.type || 'text'}" class="api-field" data-api="${apiName}" data-field="${f.key}"
            value="${escapeAttr(keys[f.key] || '')}" placeholder="${escapeAttr(f.default || '')}">
        </div>
      `).join('');
    } else {
      fieldsHtml = `
        <div class="api-field-group">
          <span class="api-field-label">API Key</span>
          <input type="password" class="api-field" data-api="${apiName}" data-field="apiKey" value="${escapeAttr(keys.apiKey || '')}">
        </div>
      `;
    }

    if (['deepseek', 'glm', 'tongyi', 'zhipu', 'yi', 'doubao', 'custom'].includes(apiName)) {
      fieldsHtml += `
        <div class="api-field-group">
          <span class="api-field-label">Endpoint</span>
          <input type="text" class="api-field" data-api="${apiName}" data-field="endpoint"
            value="${escapeAttr(settings.api.apiEndpoints?.[apiName] || DEFAULT_API_ENDPOINTS[apiName] || '')}">
        </div>
        <div class="api-field-group">
          <span class="api-field-label">模型</span>
          <input type="text" class="api-field" data-api="${apiName}" data-field="model"
            value="${escapeAttr(settings.api.apiModels?.[apiName] || DEFAULT_API_MODELS[apiName] || '')}">
        </div>
      `;
    }

    const statusText = status?.status === 'available' ? '可用'
      : status?.status === 'quota_exceeded' ? '额度不足'
      : status?.status === 'error' ? '异常'
      : status?.status === 'auth_error' ? '密钥错误'
      : '未配置';

    return `
      <div class="api-card">
        <div class="api-card-header">
          <span class="api-card-name">
            <label class="toggle-switch" style="vertical-align:middle;margin-right:8px;">
              <input type="checkbox" class="api-enable" data-api="${apiName}" ${enabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
            ${escapeAttr(getApiDisplayName(apiName))}
          </span>
          <span class="api-card-status ${statusClass}">${statusText}</span>
          <button class="btn btn-sm api-test-btn" data-api="${apiName}">测试</button>
        </div>
        <div class="api-card-body">
          ${fieldsHtml}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.api-enable').forEach(cb => {
    cb.addEventListener('change', () => {
      settings.api.enabledApis[cb.dataset.api] = cb.checked;
      saveAllSettings(settings).then(() => {
        chrome.runtime.sendMessage({ action: 'reloadApis' });
        showSavedTip();
      });
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
          if (field === 'endpoint' && input.value && !isValidEndpointUrl(input.value)) {
            alert('Endpoint 格式无效，应以 http:// 或 https:// 开头，例如 https://api.openai.com');
            input.value = provider.endpoint;
            return;
          }
          provider[field] = input.value;
        } else if (field === 'enabled') {
          provider.enabled = input.checked;
        }
        
        saveAllSettings(settings).then(() => {
          chrome.runtime.sendMessage({ action: 'reloadApis' });
          showSavedTip();
          renderCustomProviders();
          renderApiCards();
          renderApiPriority();
        });
        return;
      }
      
      // 处理常规API
      if (field === 'endpoint') {
        if (input.value && !isValidEndpointUrl(input.value)) {
          alert('Endpoint 格式无效，应以 http:// 或 https:// 开头，例如 https://api.openai.com');
          input.value = settings.api.apiEndpoints?.[apiName] || '';
          return;
        }
        if (!settings.api.apiEndpoints) settings.api.apiEndpoints = {};
        settings.api.apiEndpoints[apiName] = input.value;
      } else if (field === 'model') {
        if (!settings.api.apiModels) settings.api.apiModels = {};
        settings.api.apiModels[apiName] = input.value;
      } else {
        if (!settings.api.apiKeys[apiName]) settings.api.apiKeys[apiName] = {};
        settings.api.apiKeys[apiName][field] = input.value;
      }
      saveAllSettings(settings).then(() => {
        chrome.runtime.sendMessage({ action: 'reloadApis' });
        showSavedTip();
      });
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
      btn.disabled = false;
      if (res && res.success) {
        btn.textContent = '✓ 成功';
        btn.style.background = '#4CAF50';
        btn.style.color = '#fff';
        // v1.0.5 hotfix: 测试成功时刷新本地 apiStatus 缓存并重渲染, 让状态 badge 立即反映新状态
        // 否则 background 已写 status='available' (api-manager.js testApi), 但 options 页面内存里还是旧 error
        try {
          const fresh = await chrome.runtime.sendMessage({ action: 'getApiStatus' });
          if (fresh && fresh.status) {
            apiStatus = fresh.status;
            renderApiCards();
            renderApiUsage();
          }
        } catch {}
        btn._testRestoreTimer = setTimeout(() => { btn.textContent = '测试'; btn.style.background = ''; btn.style.color = ''; btn._testRestoreTimer = null; }, 2000);
      } else {
        btn.textContent = '✗ 失败';
        btn.style.background = '#f44336';
        btn.style.color = '#fff';
        alert('测试失败：' + ((res && res.error) || '未知错误'));
        btn._testRestoreTimer = setTimeout(() => { btn.textContent = '测试'; btn.style.background = ''; btn.style.color = ''; btn._testRestoreTimer = null; }, 2000);
      }
    });
  });
}

function renderApiPriority() {
  const container = document.getElementById('apiPriorityList');
  if (!settings) return;
  const priority = settings.api.apiPriority || [];

  container.innerHTML = priority.map(apiName => `
    <div class="api-priority-item" data-api="${apiName}">
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
          chrome.runtime.sendMessage({ action: 'reloadApis' });
          showSavedTip();
        });
      }
    });
    item.setAttribute('draggable', 'true');
  });
}

function renderCustomProviders() {
  const container = document.getElementById('customProvidersContainer');
  if (!container) return;
  
  const providers = settings.api.customProviders || [];
  
  container.innerHTML = providers.map(provider => {
    const apiName = `custom_${provider.id}`;
    const status = apiStatus[apiName];
    const statusClass = status?.status || 'unconfigured';
    const statusText = status?.status === 'available' ? '可用'
      : status?.status === 'quota_exceeded' ? '额度不足'
      : status?.status === 'error' ? '异常'
      : status?.status === 'auth_error' ? '密钥错误'
      : '未配置';
    
    return `
      <div class="custom-provider-card">
        <div class="custom-provider-header">
          <span class="custom-provider-name">${escapeAttr(provider.name)}</span>
          <span class="custom-provider-status ${statusClass}">${statusText}</span>
          <button class="btn btn-sm custom-provider-test-btn" data-api="${apiName}">测试</button>
          <button class="btn btn-sm btn-danger custom-provider-delete-btn" data-id="${escapeAttr(provider.id)}">删除</button>
        </div>
        <div class="custom-provider-body">
          <div class="api-field-group">
            <span class="api-field-label">显示名称</span>
            <input type="text" class="custom-provider-field" data-provider-id="${escapeAttr(provider.id)}" data-field="name" value="${escapeAttr(provider.name)}">
          </div>
          <div class="api-field-group">
            <span class="api-field-label">API Key</span>
            <input type="password" class="custom-provider-field" data-provider-id="${escapeAttr(provider.id)}" data-field="apiKey" value="${escapeAttr(provider.apiKey)}">
          </div>
          <div class="api-field-group">
            <span class="api-field-label">Endpoint</span>
            <input type="text" class="custom-provider-field" data-provider-id="${escapeAttr(provider.id)}" data-field="endpoint" value="${escapeAttr(provider.endpoint)}">
          </div>
          <div class="api-field-group">
            <span class="api-field-label">模型</span>
            <input type="text" class="custom-provider-field" data-provider-id="${escapeAttr(provider.id)}" data-field="model" value="${escapeAttr(provider.model)}">
          </div>
          <div class="api-field-group">
            <label class="toggle-switch" style="vertical-align:middle;">
              <input type="checkbox" class="custom-provider-toggle" data-provider-id="${escapeAttr(provider.id)}" data-field="enabled" ${provider.enabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
            <span style="margin-left:8px;">启用</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // 绑定字段修改事件
  container.querySelectorAll('.custom-provider-field').forEach(input => {
    input.addEventListener('change', () => {
      const providerId = input.dataset.providerId;
      const field = input.dataset.field;
      const provider = (settings.api.customProviders || []).find(p => p.id === providerId);
      if (!provider) return;

      if (field === 'endpoint' && input.value && !isValidEndpointUrl(input.value)) {
        alert('Endpoint 格式无效，应以 http:// 或 https:// 开头，例如 https://api.openai.com');
        input.value = provider.endpoint;
        return;
      }

      provider[field] = input.value;
      saveAllSettings(settings).then(() => {
        chrome.runtime.sendMessage({ action: 'reloadApis' });
        showSavedTip();
        renderCustomProviders();
        renderApiCards();
        renderApiPriority();
      });
    });
  });
  
  // 绑定开关事件
  container.querySelectorAll('.custom-provider-toggle').forEach(toggle => {
    toggle.addEventListener('change', () => {
      const providerId = toggle.dataset.providerId;
      const field = toggle.dataset.field;
      const provider = (settings.api.customProviders || []).find(p => p.id === providerId);
      if (!provider) return;
      
      provider[field] = toggle.checked;
      saveAllSettings(settings).then(() => {
        chrome.runtime.sendMessage({ action: 'reloadApis' });
        showSavedTip();
        renderCustomProviders();
        renderApiCards();
        renderApiPriority();
      });
    });
  });
  
  // 绑定测试按钮事件
  container.querySelectorAll('.custom-provider-test-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const apiName = btn.dataset.api;
      const providerId = apiName.slice(7);
      const provider = (settings.api.customProviders || []).find(p => p.id === providerId);
      if (!provider) return;
      
      btn.textContent = '测试中...';
      btn.disabled = true;
      const config = {
        apiKey: provider.apiKey,
        displayName: provider.name
      };
      const res = await chrome.runtime.sendMessage({ action: 'testApi', apiName, apiConfig: config });
      btn.disabled = false;
      if (res && res.success) {
        btn.textContent = '✓ 成功';
        btn.style.background = '#4CAF50';
        btn.style.color = '#fff';
        // v1.0.5 hotfix: 自定义供应商测试成功时也刷新 status + 重渲染
        try {
          const fresh = await chrome.runtime.sendMessage({ action: 'getApiStatus' });
          if (fresh && fresh.status) {
            apiStatus = fresh.status;
            renderApiCards();
            renderApiUsage();
          }
        } catch {}
        btn._testRestoreTimer = setTimeout(() => { btn.textContent = '测试'; btn.style.background = ''; btn.style.color = ''; btn._testRestoreTimer = null; }, 2000);
      } else {
        btn.textContent = '✗ 失败';
        btn.style.background = '#f44336';
        btn.style.color = '#fff';
        alert('测试失败：' + ((res && res.error) || '未知错误'));
        btn._testRestoreTimer = setTimeout(() => { btn.textContent = '测试'; btn.style.background = ''; btn.style.color = ''; btn._testRestoreTimer = null; }, 2000);
      }
    });
  });
  
  // 绑定删除按钮事件
  container.querySelectorAll('.custom-provider-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const providerId = btn.dataset.id;
      if (!confirm('确定删除此自定义供应商？')) return;
      
      // 从 customProviders 中删除
      settings.api.customProviders = (settings.api.customProviders || []).filter(p => p.id !== providerId);
      
      // 从 apiPriority 中删除对应的 custom_xxx
      settings.api.apiPriority = settings.api.apiPriority.filter(name => name !== `custom_${providerId}`);
      
      saveAllSettings(settings).then(() => {
        chrome.runtime.sendMessage({ action: 'reloadApis' });
        showSavedTip();
        renderCustomProviders();
        renderApiCards();
        renderApiPriority();
      });
    });
  });
}

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

  loadLlmPrompt();

  document.getElementById('saveLlmPromptBtn').addEventListener('click', async () => {
    const prompt = document.getElementById('llmPrompt').value;
    await chrome.storage.local.set({ 'dual_translate_custom_llm_prompt': prompt });
    chrome.runtime.sendMessage({ action: 'reloadApis' });
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

// 添加自定义供应商
(() => {
  document.getElementById('addCustomProviderBtn')?.addEventListener('click', () => {
    const providers = settings.api.customProviders || [];
    const newProvider = {
      id: 'provider_' + Date.now(),
      name: '新供应商',
      apiKey: '',
      endpoint: '',
      model: '',
      enabled: true
    };
    providers.push(newProvider);
    settings.api.customProviders = providers;

    // 将 'custom_' + newProvider.id 加入 apiPriority（排在 custom 后面）
    const idx = settings.api.apiPriority.indexOf('custom');
    if (idx >= 0) {
      settings.api.apiPriority.splice(idx + 1, 0, 'custom_' + newProvider.id);
    } else {
      settings.api.apiPriority.push('custom_' + newProvider.id);
    }

    saveAllSettings(settings).then(() => {
      chrome.runtime.sendMessage({ action: 'reloadApis' });
      renderCustomProviders();
      renderApiCards();
      renderApiPriority();
      renderApiUsage();
      showSavedTip();
    });
  });
})();

function isValidEndpointUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
