let cachedSettings = null;
let activeTabId = null;
let pageStatus = null;
let statusPort = null;
let pageBusy = false;
let modeBusy = false;
let servicesConfigured = null;

const $ = id => document.getElementById(id);

async function send(message) {
  // A translation request is sent once. Providers handle their own retry policy.
  const response = await chrome.runtime.sendMessage(message);
  if (response?.error || response?.success === false) throw new Error(response.error || '操作未完成，请重试');
  return response;
}

function feedback(message = '') {
  $('feedback').textContent = message;
  $('feedback').hidden = !message;
}

function renderPage() {
  const enabled = cachedSettings?.general.translationEnabled !== false;
  const active = !!pageStatus?.pageActive;
  const allowed = pageStatus?.siteAllowed !== false;
  const needsSetup = pageStatus && enabled && allowed && !active && servicesConfigured === false;
  $('toggleBtn').setAttribute('aria-checked', String(enabled));
  $('pageTranslateBtn').disabled = pageBusy || !pageStatus || (!active && (!enabled || !allowed));
  $('pageTranslateBtn').classList.toggle('restore', active);
  $('pageTranslateBtn').textContent = pageBusy ? '正在处理…' : active ? '还原此页' : needsSetup ? '配置翻译服务' : '翻译此页';
  $('pageHeading').textContent = !pageStatus ? '当前页面无法翻译' : !enabled ? '网页翻译已暂停' : !allowed ? '此网站已排除' : needsSetup ? '先配置翻译服务' : active ? '继续阅读' : '准备翻译';
  const done = pageStatus?.translatedCount ?? 0;
  const failed = pageStatus?.failedCount ?? 0;
  $('pageStatus').textContent = !pageStatus ? '请打开普通网页，更新扩展后请刷新已有网页。' : !enabled ? '开启下方总开关后，可继续翻译。' : !allowed ? '可在设置的「翻译规则」中调整网站列表。' : active ?
    (pageStatus.translating ? `已完成 ${done} 段，正在继续翻译。` : failed ? `已完成 ${done} 段，${failed} 段失败，可点击页面提示重试。` : `已完成 ${done} 段，新内容出现时会继续补译。`) : needsSetup ? '填写一个信任服务的密钥后，即可开始翻译。' : '按当前阅读方式翻译，随时可还原原文。';
  if (pageStatus?.mode) renderMode(pageStatus.mode);
}

function renderMode(mode) {
  document.querySelectorAll('.mode-btn').forEach(button => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = modeBusy;
  });
}

async function refreshPageStatus() {
  try {
    const response = await chrome.tabs.sendMessage(activeTabId, { action: 'getStatus' });
    if (!response || response.error) throw new Error('unavailable');
    applyStatus(response);
  } catch { pageStatus = null; renderPage(); }
}

function applyStatus(status) {
  pageStatus = status;
  if (cachedSettings && typeof status.enabled === 'boolean') cachedSettings.general.translationEnabled = status.enabled;
  renderPage();
}

function subscribeToStatus() {
  const port = chrome.tabs.connect(activeTabId, { name: 'translation-status' });
  statusPort = port;
  port.onMessage.addListener(applyStatus);
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    if (statusPort !== port) return;
    statusPort = null;
    pageStatus = null;
    renderPage();
  });
}

chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (tabId !== activeTabId || change.status !== 'complete' || !cachedSettings) return;
  await refreshPageStatus();
  if (pageStatus && !statusPort) subscribeToStatus();
});

async function savePreference(path, value, control) {
  control.disabled = true;
  feedback();
  try {
    await send({ action: 'updateSettings', path, value });
    const keys = path.split('.');
    cachedSettings[keys[0]][keys[1]] = value;
    return true;
  } catch (error) { feedback(error.message); return false; }
  finally { control.disabled = false; }
}

function humanizeTranslateError(message) {
  const text = String(message || '');
  if (/NO_API|没有可用/.test(text)) return '请先在设置中配置翻译服务。';
  if (/QUOTA|quota|额度/.test(text)) return '翻译服务额度不足，请检查余额或切换服务。';
  if (/RATE_LIMITED|频率/.test(text)) return '请求过于频繁，请稍后重试。';
  if (/timeout|abort|超时/i.test(text)) return '请求超时，请检查网络后重试。';
  if (/auth|401|403|密钥/i.test(text)) return '密钥校验失败，请在设置中检查。';
  if (/fetch|network/i.test(text)) return '网络连接失败，请稍后重试。';
  return '翻译未完成，请重试或打开故障排查。';
}

async function loadServices() {
  try {
    const response = await send({ action: 'getApiStatus' });
    servicesConfigured = response.configuredCount > 0;
    renderPage();
    $('serviceSummary').textContent = response.configuredCount ? `${response.availableCount} / ${response.configuredCount} 可用` : '待配置';
    const statusNames = { available: '可用', quota_exceeded: '额度不足', rate_limited: '频率限制', error: '异常', auth_error: '密钥错误', unconfigured: '未配置' };
    $('apiStatus').innerHTML = Object.entries(response.status || {}).map(([name, item]) => {
      const status = Object.hasOwn(statusNames, item.status) ? item.status : 'unconfigured';
      return `<div class="api-status-item"><span class="api-status-dot ${status}"></span><span>${escapeAttr(item.displayName || API_DISPLAY_NAMES[name] || name)}</span><span class="api-status-text">${escapeAttr(statusNames[status])}</span></div>`;
    }).join('');
    if (!response.configuredCount) {
      $('apiStatus').innerHTML = '<p class="no-api-warning">配置一个信任的服务后即可翻译。</p><button id="configureServiceBtn" class="secondary-button">配置翻译服务</button>';
      $('configureServiceBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
    }
  } catch { $('serviceSummary').textContent = '暂时不可用'; }
}

async function loadServiceDetails() {
  const outcomes = await Promise.allSettled([send({ action: 'getDailyUsage' }), send({ action: 'getCacheStats' })]);
  if (outcomes[0].status === 'fulfilled') {
    const usage = outcomes[0].value;
    const rows = usage?._date === new Date().toDateString() ? Object.entries(usage).filter(([name, value]) => name !== '_date' && typeof value === 'number') : [];
    $('apiUsage').innerHTML = rows.length ? rows.map(([name, value]) => `<div class="api-usage-item"><span>${escapeAttr(API_DISPLAY_NAMES[name] || name)}</span><span>${value.toLocaleString()} 字符</span></div>`).join('') : '今日尚未使用';
  } else $('apiUsage').textContent = '用量暂时不可用';
  if (outcomes[1].status === 'fulfilled') {
    const stats = outcomes[1].value;
    $('cacheInfo').textContent = `会话缓存 ${stats.active} 条 · ${stats.sizeKB} KB，关闭浏览器后清除`;
  } else $('cacheInfo').textContent = '缓存信息暂时不可用';
}

function setupEvents() {
  $('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage().catch(() => feedback('无法打开设置，请重试。')));
  $('diagnoseBtn').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('diagnose.html') }).catch(() => feedback('无法打开诊断页面。')));
  $('pageTranslateBtn').addEventListener('click', async () => {
    if (pageBusy || !pageStatus) return;
    if (!pageStatus.pageActive && servicesConfigured === false) {
      chrome.runtime.openOptionsPage().catch(() => feedback('无法打开设置，请重试。'));
      return;
    }
    pageBusy = true;
    feedback();
    renderPage();
    try {
      const response = await chrome.tabs.sendMessage(activeTabId, { action: pageStatus.pageActive ? 'restoreAll' : 'startTranslation' });
      if (response?.error) throw new Error(response.error);
      await refreshPageStatus();
    } catch (error) { feedback(error.message || '页面暂时无法响应，请刷新后重试。'); }
    finally { pageBusy = false; renderPage(); }
  });
  $('toggleBtn').addEventListener('click', async () => {
    const value = cachedSettings.general.translationEnabled === false;
    await savePreference('general.translationEnabled', value, $('toggleBtn'));
    await refreshPageStatus();
  });
  $('modeSelector').addEventListener('click', async event => {
    const button = event.target.closest('.mode-btn');
    if (!button || modeBusy || button.classList.contains('active')) return;
    modeBusy = true;
    renderMode(button.dataset.mode);
    const ok = await savePreference('display.defaultMode', button.dataset.mode, button);
    modeBusy = false;
    renderMode(ok ? button.dataset.mode : cachedSettings.general.lastMode);
    if (ok) {
      cachedSettings.general.lastMode = button.dataset.mode;
      if (pageStatus) {
        try { await chrome.tabs.sendMessage(activeTabId, { action: 'switchMode', mode: button.dataset.mode }); }
        catch { feedback('偏好已保存，刷新网页后生效。'); }
      }
    }
  });
  $('sourceLangSelect').addEventListener('change', async event => {
    const control = event.target;
    const previous = cachedSettings.api.sourceLanguage;
    if (!await savePreference('api.sourceLanguage', control.value, control)) control.value = previous;
  });
  $('skipChineseSegmentsToggle').addEventListener('change', async event => {
    const control = event.target;
    if (!await savePreference('rules.skipChineseSegments', !control.checked, control)) control.checked = !control.checked;
  });
  $('serviceSection').addEventListener('toggle', () => {
    if ($('serviceSection').open) loadServiceDetails();
  });
  $('manualSection').addEventListener('toggle', () => {
    if ($('manualSection').open) $('manualTranslateInput').focus();
  });
  const input = $('manualTranslateInput');
  input.addEventListener('input', () => { $('inputCount').textContent = `${input.value.length.toLocaleString()} / 10,000`; });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $('manualTranslateBtn').click(); }
  });
  $('manualTranslateBtn').addEventListener('click', async () => {
    const text = input.value.trim();
    const result = $('manualTranslateResult');
    result.hidden = false;
    result.classList.remove('error');
    if (!text) { result.textContent = '请输入要翻译的文本。'; input.focus(); return; }
    const button = $('manualTranslateBtn');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = '翻译中…';
    result.textContent = '正在翻译…';
    result.setAttribute('aria-busy', 'true');
    try {
      const source = cachedSettings.api.sourceLanguage;
      const response = await send({ action: 'translateTexts', texts: [text], sourceLang: source === 'all' ? 'auto' : source });
      const value = response?.translations?.[0]?.translation;
      if (!value) throw new Error('empty');
      result.textContent = value;
    } catch (error) { result.classList.add('error'); result.textContent = humanizeTranslateError(error.message); }
    finally { button.disabled = false; button.textContent = '翻译文本'; result.setAttribute('aria-busy', 'false'); }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  $('extensionVersion').textContent = 'v' + chrome.runtime.getManifest().version;
  try {
    const [response, [tab], commands] = await Promise.all([
      send({ action: 'getPageSettings' }), chrome.tabs.query({ active: true, currentWindow: true }), chrome.commands.getAll()
    ]);
    cachedSettings = response.settings;
    activeTabId = tab?.id ?? null;
    try { const url = new URL(tab.url); $('pageHost').textContent = /^https?:$/.test(url.protocol) ? url.hostname : '浏览器页面'; } catch { $('pageHost').textContent = '当前页面'; }
    const shortcut = commands.find(command => command.name === 'toggle-translate')?.shortcut;
    if (shortcut) { $('shortcutHint').textContent = shortcut; $('shortcutHint').hidden = false; }
    $('sourceLangSelect').value = cachedSettings.api.sourceLanguage || 'auto';
    $('skipChineseSegmentsToggle').checked = cachedSettings.rules.skipChineseSegments === false;
    renderMode(cachedSettings.general.lastMode || cachedSettings.display.defaultMode);
    setupEvents();
    $('toggleBtn').disabled = false;
    await refreshPageStatus();
    if (pageStatus) subscribeToStatus();
    loadServices();
  } catch { feedback('无法读取设置，请重新打开弹窗。'); renderPage(); }
});
window.addEventListener('pagehide', () => { statusPort?.disconnect(); statusPort = null; });
