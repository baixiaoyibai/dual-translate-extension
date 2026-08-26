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

  console.log('consistency tests passed');
}

main();