/* v1.2.3 fix: 将内联脚本移至外部文件，避免违反 MV3 CSP (script-src 'self') */
const SETTINGS_KEY = 'dual_translate_settings';
const LOCAL_API_KEYS_KEY = 'dual_translate_api_keys_local';

// v1.2.12 fix: P1-3 — 安全的 JSON 渲染函数（用 textContent 防 XSS）
function renderJsonAsPre(outEl, obj) {
  if (!outEl) return;
  outEl.textContent = '';
  const pre = document.createElement('pre');
  pre.textContent = (typeof obj === 'string') ? obj : JSON.stringify(obj, null, 2);
  outEl.appendChild(pre);
}

// v1.3.3 security P3-1: 与设置页 maskApiValue 相同语义的掩码——长度 ≤6 全遮蔽，
// 防止短密钥经「前4+****+后2」掩码后近乎原文泄露。
function maskSecret(val) {
  if (typeof val !== 'string' || val.length === 0) return val;
  if (val.length <= 6) return '****';
  return val.substring(0, 4) + '****' + val.slice(-2);
}

// v1.3.3 security P2-1: 掩码 apiKeys 对象与 customProviders 数组中的密钥字段。
// customProviders[].apiKey 与内置厂商密钥同等敏感（诊断页无需解锁 PIN 即可直达），必须一并掩码。
function maskSensitiveFields(api) {
  if (!api || typeof api !== 'object') return;
  if (api.apiKeys && typeof api.apiKeys === 'object') {
    for (const v of Object.values(api.apiKeys)) {
      if (v && typeof v === 'object') {
        for (const f of Object.keys(v)) v[f] = maskSecret(v[f]);
      }
    }
  }
  if (Array.isArray(api.customProviders)) {
    for (const provider of api.customProviders) {
      if (provider && typeof provider === 'object' && typeof provider.apiKey === 'string' && provider.apiKey.length > 0) {
        provider.apiKey = maskSecret(provider.apiKey);
      }
    }
  }
}

async function checkSync() {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  const settings = result[SETTINGS_KEY];
  const out = document.getElementById('syncOutput');
  if (!settings) {
    out.textContent = '';
    const span = document.createElement('span');
    span.className = 'empty';
    span.textContent = '未找到 settings!';
    out.appendChild(span);
    return;
  }
  const display = JSON.parse(JSON.stringify(settings));
  // v1.3.3 security P2-1: customProviders[].apiKey 同步掩码（此前仅掩码内置 apiKeys，自定义供应商密钥明文展示）
  maskSensitiveFields(display.api);
  renderJsonAsPre(out, display);
  return result[SETTINGS_KEY];
}

async function checkLocal() {
  const result = await chrome.storage.local.get(LOCAL_API_KEYS_KEY);
  const keys = result[LOCAL_API_KEYS_KEY];
  const out = document.getElementById('localOutput');
  if (!keys) {
    out.textContent = '';
    const span = document.createElement('span');
    span.className = 'empty';
    span.textContent = '未找到 local apiKeys!';
    out.appendChild(span);
    return null;
  }
  const display = JSON.parse(JSON.stringify(keys));
  for (const v of Object.values(display)) {
    if (v && typeof v === 'object') {
      for (const f of Object.keys(v)) v[f] = maskSecret(v[f]);
    }
  }
  renderJsonAsPre(out, display);
  return keys;
}

async function checkSettings() {
  const out = document.getElementById('msgOutput');
  let res;
  try {
    res = await chrome.runtime.sendMessage({ action: 'getSettings' });
  } catch (e) {
    out.textContent = '';
    const span = document.createElement('span');
    span.className = 'empty';
    span.textContent = '获取设置失败: ' + (e.message || String(e));
    out.appendChild(span);
    return null;
  }
  if (!res || !res.settings) {
    out.textContent = '';
    const span = document.createElement('span');
    span.className = 'empty';
    span.textContent = 'getSettings 返回无效!';
    out.appendChild(span);
    return null;
  }
  const display = JSON.parse(JSON.stringify(res.settings));
  // v1.3.3 security P2-1: getSettings 消息中的 customProviders[].apiKey 同步掩码，
  // 诊断页无需解锁 PIN 即可直达，自定义供应商密钥不得明文展示
  maskSensitiveFields(display.api);
  if (!display.api || !display.api.apiKeys) {
    out.textContent = '';
    const span = document.createElement('span');
    span.className = 'empty';
    span.textContent = 'settings.api.apiKeys 不存在!';
    out.appendChild(span);
    return res.settings;
  }
  renderJsonAsPre(out, display.api);
  return res.settings;
}

async function checkAll() {
  const syncSettings = await checkSync();
  const localKeys = await checkLocal();
  const msgSettings = await checkSettings();

  const table = document.getElementById('keyTable');
  while (table.rows.length > 1) table.deleteRow(1);

  const allApis = new Set([
    ...Object.keys(syncSettings?.api?.apiKeys || {}),
    ...Object.keys(localKeys || {}),
    ...Object.keys(msgSettings?.api?.apiKeys || {})
  ]);

  for (const apiName of [...allApis].sort()) {
    const syncObj = syncSettings?.api?.apiKeys?.[apiName] || {};
    const localObj = localKeys?.[apiName] || {};
    const msgObj = msgSettings?.api?.apiKeys?.[apiName] || {};
    const allFields = new Set([...Object.keys(syncObj), ...Object.keys(localObj), ...Object.keys(msgObj)]);
    for (const field of allFields) {
      const row = table.insertRow();
      row.insertCell().textContent = apiName;
      row.insertCell().textContent = field;
      row.insertCell().innerHTML = syncObj[field] ? '<span class="ok">有值</span>' : '<span class="empty">空</span>';
      row.insertCell().innerHTML = localObj[field] ? '<span class="ok">有值</span>' : '<span class="empty">空</span>';
      row.insertCell().innerHTML = msgObj[field] ? '<span class="ok">有值</span>' : '<span class="empty">空</span>';
    }
  }
}

async function migrateKeys() {
  const syncResult = await chrome.storage.sync.get(SETTINGS_KEY);
  const syncSettings = syncResult[SETTINGS_KEY];
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
  // v1.3.3 compat F-6: 迁移语义与 settings-manager._migrateSyncKeysToLocal 对齐——
  // 仅补充 local 中缺失的非空密钥，不覆盖 local 已有非空值（避免把部分失败的旧迁移残留
  // 回滚成 sync 旧值）；并同步迁移 custom_<id> 供应商密钥。
  const customKeys = {};
  for (const provider of (syncSettings.api.customProviders || [])) {
    if (provider && provider.id && typeof provider.apiKey === 'string' && provider.apiKey.length > 0) {
      customKeys[`custom_${provider.id}`] = { apiKey: provider.apiKey };
    }
  }
  const allKeys = { ...apiKeys, ...customKeys };
  if (!confirm('确认将 sync storage 中的 apiKeys 迁移到 local storage？\n（仅补充 local 中缺失的密钥，不会覆盖 local 已有的新密钥）')) return;
  const stored = await chrome.storage.local.get(LOCAL_API_KEYS_KEY);
  const localKeys = stored[LOCAL_API_KEYS_KEY] || {};
  for (const [apiName, keyObj] of Object.entries(allKeys)) {
    if (!keyObj || typeof keyObj !== 'object') continue;
    if (!localKeys[apiName]) localKeys[apiName] = {};
    for (const [field, value] of Object.entries(keyObj)) {
      if (typeof value === 'string' && value.length > 0) {
        if (!localKeys[apiName][field] || localKeys[apiName][field].length === 0) {
          localKeys[apiName][field] = value;
        }
      }
    }
  }
  await chrome.storage.local.set({ [LOCAL_API_KEYS_KEY]: localKeys });
  delete syncSettings.api.apiKeys;
  if (Array.isArray(syncSettings.api.customProviders)) {
    for (const provider of syncSettings.api.customProviders) {
      if (provider && typeof provider.apiKey === 'string') provider.apiKey = '';
    }
  }
  await chrome.storage.sync.set({ [SETTINGS_KEY]: syncSettings });
  alert('迁移完成！请重新加载扩展并检查设置页。');
  await checkAll();
}

// v1.2.3 fix: 为 async 事件处理器添加安全包装，防止未捕获的 Promise 拒绝污染控制台
function safeAsync(fn) {
  return (...args) => fn(...args).catch(e => console.error('[diagnose]', e));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnCheckAll').addEventListener('click', safeAsync(checkAll));
  document.getElementById('btnCheckSync').addEventListener('click', safeAsync(checkSync));
  document.getElementById('btnCheckLocal').addEventListener('click', safeAsync(checkLocal));
  document.getElementById('btnCheckSettings').addEventListener('click', safeAsync(checkSettings));
  document.getElementById('btnMigrateKeys').addEventListener('click', safeAsync(migrateKeys));
});
