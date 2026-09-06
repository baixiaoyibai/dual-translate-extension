// api-manager P1-1: 一般性错误连续 3 次后进入冷却，冷却到期自动恢复（不再永久禁用）。
'use strict';

const fs = require('fs');

const source = fs.readFileSync(require.resolve('../lib/api-manager.js'), 'utf8')
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export\s*\{[^}]*\};?\s*$/m, '')
  + '\nreturn { apiManager };';

const chromeMock = {
  runtime: { getURL: () => 'chrome-extension://test/' }
};

const factory = new Function('chrome', source);
const { apiManager } = factory(chromeMock);

async function main() {
  const now = Date.now();

  // 连续 3 次一般性错误 + 冷却未到期 → 不可用
  apiManager.statusCache.test = { status: 'error', consecutiveErrors: 3, cooldownUntil: now + 60 * 1000 };
  if (apiManager._isApiUsable('test') !== false) throw new Error('P1-1: should stay disabled during cooldown');

  // 冷却到期 → 自动恢复
  apiManager.statusCache.test = { status: 'error', consecutiveErrors: 3, cooldownUntil: now - 1 };
  if (apiManager._isApiUsable('test') !== true) throw new Error('P1-1: should recover after cooldown');

  // 历史遗留的 error 状态（无 cooldownUntil 字段）→ 允许恢复（不再死锁）
  apiManager.statusCache.test = { status: 'error', consecutiveErrors: 5 };
  if (apiManager._isApiUsable('test') !== true) throw new Error('P1-1: legacy error status should recover');

  // 不足 3 次错误 → 仍可用
  apiManager.statusCache.test = { status: 'error', consecutiveErrors: 2 };
  if (apiManager._isApiUsable('test') !== true) throw new Error('P1-1: <3 errors should stay usable');

  console.log('api-manager P1-1 cooldown test passed');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});