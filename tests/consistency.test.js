// tests/consistency.test.js
// 双实现一致性回归测试：
//   1. content.js 内联 escapeContent 与 lib/escape-utils.js escapeAttr 输出一致
//   2. background.js 与 content.js 的 isAlreadyChinese 行为一致
// 防止 v1.2.7 曾出现的“两处阈值不一致”类问题再次漂移。
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadContentFunctions() {
  const contentPath = path.join(__dirname, '..', 'content.js');
  const code = fs.readFileSync(contentPath, 'utf8');

  const win = {
    addEventListener: () => {},
    dispatchEvent: () => {},
    localStorage: { getItem: () => null, setItem: () => {} }
  };
  const sandbox = {
    console,
    location: { hostname: 'example.com', href: 'https://example.com' },
    document: {
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      body: { dataset: {} }
    },
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    fetch: async () => ({ json: async () => ({}) }),
    // 仅提取纯函数做一致性断言，不执行 content.js 的异步初始化/超时逻辑。
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    chrome: {
      runtime: { onMessage: { addListener: () => {} }, sendMessage: () => Promise.resolve({}) },
      storage: {
        onChanged: { addListener: () => {} },
        local: { get: async () => ({}), set: async () => {} },
        sync: { get: async () => ({}), set: async () => {} }
      },
      i18n: { getMessage: () => '' }
    },
    window: win,
    self: win
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return {
    escapeContent: sandbox.escapeContent,
    isAlreadyChinese: sandbox.isAlreadyChinese
  };
}

function loadEscapeAttr() {
  const escapePath = path.join(__dirname, '..', 'lib', 'escape-utils.js');
  const code = fs.readFileSync(escapePath, 'utf8');
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.escapeAttr;
}

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`function ${name} not found in source`);

  const bodyStart = source.indexOf('{', start);
  if (bodyStart === -1) throw new Error(`function ${name} body not found`);

  let depth = 0;
  let end = -1;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`function ${name} braces unbalanced`);

  return source.slice(start, end + 1);
}

function loadBackgroundIsAlreadyChinese() {
  const backgroundPath = path.join(__dirname, '..', 'background.js');
  const code = fs.readFileSync(backgroundPath, 'utf8');
  const fnSource = extractFunction(code, 'isAlreadyChinese');
  // eslint-disable-next-line no-new-func
  return new Function(`return (${fnSource})`)();
}

function loadAuthoritativeDefaults() {
  const metaPath = path.join(__dirname, '..', 'lib', 'api-metadata.js');
  const code = fs.readFileSync(metaPath, 'utf8');
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.DEFAULT_SETTINGS;
}

// v1.3.3 compat F-7: 加载 settings-manager.js 的 LEGACY_DEFAULT_SETTINGS（fallback 副本）
function loadLegacyDefaults() {
  const smPath = path.join(__dirname, '..', 'lib', 'settings-manager.js');
  const code = fs.readFileSync(smPath, 'utf8')
    .replace(/^import[^;]+;\s*/m, '')
    .replace(/^export\s*\{[^}]*\};?\s*$/m, '')
    + '\nreturn LEGACY_DEFAULT_SETTINGS;';
  const chromeMock = {
    runtime: { id: 'test-extension' },
    storage: {
      sync: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      local: { get: async () => ({}), set: async () => {}, remove: async () => {} }
    }
  };
  // eslint-disable-next-line no-new-func
  const factory = new Function('console', 'chrome', 'structuredClone', code);
  return factory(console, chromeMock, value => JSON.parse(JSON.stringify(value)));
}

// v1.3.3 compat F-7: 全量深度比对，返回差异路径列表（空数组 = 完全一致）
function deepCompare(a, b, path, diffs) {
  if (a === b) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push(`${path}: 数组长度 ${a.length} vs ${b.length}`);
      return;
    }
    a.forEach((v, i) => deepCompare(v, b[i], `${path}[${i}]`, diffs));
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) deepCompare(a[k], b[k], `${path}.${k}`, diffs);
    return;
  }
  diffs.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const content = loadContentFunctions();
  const escapeAttr = loadEscapeAttr();
  const backgroundIsAlreadyChinese = loadBackgroundIsAlreadyChinese();

  // ---------- escapeContent / escapeAttr ----------
  const escapeCases = [
    ['', ''],
    [null, ''],
    [undefined, ''],
    ['&<>"\'', '&amp;&lt;&gt;&quot;&#39;'],
    ['<script>alert("x")</script>', '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'],
    ['中文 & English', '中文 &amp; English'],
    ['a\'b"c<d>e&f', 'a&#39;b&quot;c&lt;d&gt;e&amp;f']
  ];
  for (const [input, expected] of escapeCases) {
    const contentOut = content.escapeContent(input);
    const libOut = escapeAttr(input);
    assert(contentOut === libOut, `escapeContent/escapeAttr 不一致: ${JSON.stringify(input)} -> content=${contentOut}, lib=${libOut}`);
    assert(contentOut === expected, `escapeContent 输出与预期不符: ${JSON.stringify(input)} -> ${contentOut}`);
  }

  // ---------- isAlreadyChinese ----------
  const chineseCases = [
    ['', false, '空串'],
    ['   ', false, '空白'],
    ['这是测试', false, '4 个汉字不足阈值'],
    ['这是一个测试', true, '5 个汉字达到阈值'],
    ['中文中文中文中文中文', true, '纯中文'],
    ['中文中文中文中文中文a', true, '少量拉丁仍达 80%'],
    ['Hello 世界', false, '中英混合'],
    ['中文字符串包含English测试长句', false, '拉丁占比高'],
    ['こんにちは、世界', false, '含日文假名'],
    ['안녕하세요', false, '韩文'],
    ['abc', false, '纯拉丁'],
    ['', false, '边界']
  ];
  for (const [input, expected, desc] of chineseCases) {
    const bg = backgroundIsAlreadyChinese(input);
    const ct = content.isAlreadyChinese(input);
    assert(bg === ct, `isAlreadyChinese 双实现不一致: ${JSON.stringify(input)} (${desc}) -> background=${bg}, content=${ct}`);
    assert(bg === expected, `isAlreadyChinese 预期不符: ${JSON.stringify(input)} (${desc}) -> actual=${bg}`);
  }

  // ---------- 默认值副本一致性（P3-6 防漂移）----------
  const metaDefaults = loadAuthoritativeDefaults();
  assert(metaDefaults && metaDefaults.display, 'api-metadata DEFAULT_SETTINGS 缺少 display');
  assert(metaDefaults.display.panelCollapsed === false,
    '权威副本 DEFAULT_SETTINGS.display 缺少 panelCollapsed:false（与 settings-manager LEGACY 副本漂移）');

  // ---------- v1.3.3 compat F-7: 默认值双副本全量深度比对 ----------
  // v1.3.2 曾因权威副本漏 panelCollapsed 出过漂移，当时的回归网只断言了单字段。
  // 现升级为 LEGACY_DEFAULT_SETTINGS（settings-manager fallback 副本）与权威副本的
  // 全量深度比对：任何字段（含数组逐项）漂移直接 fail 并给出差异路径。
  const legacyDefaults = loadLegacyDefaults();
  assert(legacyDefaults && legacyDefaults.display, 'settings-manager LEGACY_DEFAULT_SETTINGS 缺少 display');
  const driftDiffs = [];
  deepCompare(legacyDefaults, metaDefaults, 'DEFAULT_SETTINGS', driftDiffs);
  assert(driftDiffs.length === 0,
    `DEFAULT_SETTINGS 双副本漂移（settings-manager LEGACY vs api-metadata 权威），共 ${driftDiffs.length} 处:\n${driftDiffs.slice(0, 10).join('\n')}`);

  console.log('consistency tests passed');
}

main();