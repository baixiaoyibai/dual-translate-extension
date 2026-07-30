/* v1.2.3 fix: 将内联脚本移至外部文件，避免违反 MV3 CSP (script-src 'self') */
const SETTINGS_KEY = 'dual_translate_settings';
const LOCAL_API_KEYS_KEY = 'dual_translate_api_keys_local';

async function checkSync() {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  const settings = result[SETTINGS_KEY];
  const out = document.getElementById('syncOutput');
  if (!settings) {
    out.innerHTML = '<span class="empty">未找到 settings!</span>';
    return;
  }
  const display = JSON.parse(JSON.stringify(settings));
  if (display.api && display.api.apiKeys) {
    for (const [k, v] of Object.entries(display.api.apiKeys)) {
      if (typeof v === 'object') {
        for (const [f, val] of Object.entries(v)) {
          if (typeof val === 'string' && val.length > 0) {
            display.api.apiKeys[k][f] = val.substring(0, 4) + '****' + val.slice(-2);
          }
        }
      }
    }
  }
  out.innerHTML = '<pre>' + JSON.stringify(display, null, 2) + '</pre>';
  return result[SETTINGS_KEY];
}

async function checkLocal() {
  const result = await chrome.storage.local.get(LOCAL_API_KEYS_KEY);
  const keys = result[LOCAL_API_KEYS_KEY];
  const out = document.getElementById('localOutput');
  if (!keys) {
    out.innerHTML = '<span class="empty">未找到 local apiKeys!</span>';
    return null;
  }
  const display = JSON.parse(JSON.stringify(keys));
  for (const [k, v] of Object.entries(display)) {
    if (typeof v === 'object') {
      for (const [f, val] of Object.entries(v)) {
        if (typeof val === 'string' && val.length > 0) {
          display[k][f] = val.substring(0, 4) + '****' + val.slice(-2);
        }
      }
    }
  }
  out.innerHTML = '<pre>' + JSON.stringify(display, null, 2) + '</pre>';
  return keys;
}

async function checkSettings() {
  const res = await chrome.runtime.sendMessage({ action: 'getSettings' });
  const out = document.getElementById('msgOutput');
  if (!res || !res.settings) {
    out.innerHTML = '<span class="empty">getSettings 返回无效!</span>';
    return null;
  }
  const display = JSON.parse(JSON.stringify(res.settings));
  if (display.api && display.api.apiKeys) {
    for (const [k, v] of Object.entries(display.api.apiKeys)) {
      if (typeof v === 'object') {
        for (const [f, val] of Object.entries(v)) {
          if (typeof val === 'string' && val.length > 0) {
            display.api.apiKeys[k][f] = val.substring(0, 4) + '****' + val.slice(-2);
          }
        }
      }
    }
  } else {
    out.innerHTML = '<span class="empty">settings.api.apiKeys 不存在!</span>';
    return res.settings;
  }
  out.innerHTML = '<pre>' + JSON.stringify(display.api, null, 2) + '</pre>';
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
  if (!confirm('确认将 sync storage 中的 apiKeys 迁移到 local storage？')) return;
  await chrome.storage.local.set({ [LOCAL_API_KEYS_KEY]: apiKeys });
  delete syncSettings.api.apiKeys;
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
