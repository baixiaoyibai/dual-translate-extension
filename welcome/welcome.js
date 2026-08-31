/* v1.2.3 fix: 将内联脚本移至外部文件，避免违反 MV3 CSP (script-src 'self') */
document.getElementById('goSettingsBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'openOptions' }).catch(() => {
    chrome.runtime.openOptionsPage();
  });
  chrome.runtime.sendMessage({ action: 'closeWelcomeTab' }).catch(() => window.close());
});

document.getElementById('closeBtn').addEventListener('click', async () => {
  // v1.2.3 fix: 先 await updateSettings 完成，再发送 closeWelcomeTab，避免设置未持久化 tab 已被移除。
  // 同时添加 .catch() 防止未捕获的 Promise 拒绝（background SW 未就绪或 tab 已关闭时 sendMessage 可能 reject）。
  await chrome.runtime.sendMessage({ action: 'updateSettings', path: 'general.hasCompletedWelcome', value: true }).catch(e => console.warn('[welcome] updateSettings failed:', e));
  chrome.runtime.sendMessage({ action: 'closeWelcomeTab' }).catch(() => {
    // fallback: 若 background 关闭失败，尝试自行关闭
    window.close();
  });
});

// v1.2.17 UX: 前置检测 API 配置状态——未配置时主按钮明确引导配置，已配置则降低引导噪音
(async () => {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getApiStatus' });
    const notice = document.getElementById('apiStatusNotice');
    const goBtn = document.getElementById('goSettingsBtn');
    if (!notice || !goBtn) return;
    const configured = res && res.configuredCount ? res.configuredCount : 0;
    const available = res && res.availableCount ? res.availableCount : 0;
    if (configured === 0) {
      notice.textContent = '尚未配置翻译 API——点击下方按钮完成第一步配置，配置后即可开始翻译';
      notice.classList.add('notice-warning');
      notice.style.display = 'block';
      goBtn.textContent = '去配置 API 密钥';
    } else if (available > 0) {
      notice.textContent = `已检测到 ${available} 个可用翻译 API，可直接打开外文网页体验`;
      notice.classList.add('notice-ok');
      notice.style.display = 'block';
    } else {
      notice.textContent = `已配置 ${configured} 个 API，但当前均不可用——可前往设置检查密钥或额度`;
      notice.classList.add('notice-warning');
      notice.style.display = 'block';
      goBtn.textContent = '检查 API 状态';
    }
  } catch (e) {
    // 检测失败不影响欢迎页正常使用
    console.warn('[welcome] getApiStatus failed:', e);
  }
})();
