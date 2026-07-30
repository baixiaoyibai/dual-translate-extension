/* v1.2.3 fix: 将内联脚本移至外部文件，避免违反 MV3 CSP (script-src 'self') */
document.getElementById('goSettingsBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openOptions' }).catch(() => {
    chrome.runtime.openOptionsPage();
  });
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
