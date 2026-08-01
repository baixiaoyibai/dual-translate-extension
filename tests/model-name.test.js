// tests/model-name.test.js
// 模型名识别回归测试：直接从 content.js 真实代码加载（vm 沙箱），
// 验证 isAiModelName 对"应跳过翻译的模型名"与"不应误判的普通文本"的行为。
// 运行：node tests/model-name.test.js（或 npm test）
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
  setTimeout, clearTimeout, setInterval, clearInterval,
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

const settings = {
  rules: {
    customModelNames: sandbox.DEFAULT_MODEL_NAMES,
    customModelVariants: sandbox.DEFAULT_MODEL_VARIANTS
  }
};

const tests = [
  // 应识别为模型名（跳过翻译）
  ['glm-4.1v-thingking-flash', true, 'glm 视觉+拼写变体 紧贴'],
  ['glm 4.6v flash', true, 'glm 视觉 空格分隔'],
  ['GLM-4.1V-Thingking-Flash', true, '大小写无关'],
  ['glm 4.6v', true, 'glm 视觉基础'],
  ['gpt5.6pro', true, 'gpt 紧贴'],
  ['deepseek-v4-pro', true, 'deepseek 紧贴'],
  ['deepseek v4 pro', true, 'deepseek 空格'],
  ['kimi k3', true, 'kimi k3 空格'],
  ['kimi k3 pro', true, 'kimi k3 pro'],
  ['kimi-k3-pro', true, 'kimi k3 紧贴'],
  ['kimi k3 thinking', true, 'kimi k3 thinking'],
  ['DeepSeek V4 Pro', true, 'DeepSeek 大写'],
  ['deepseek v4', true, 'deepseek v4'],
  ['deepseek v4.5 pro', true, 'deepseek v4.5 pro'],
  ['deepseek v3', true, 'deepseek v3'],
  ['deepseek r1', true, 'deepseek r1'],
  ['glm-4v', true, 'glm 视觉'],
  ['glm-4-flash', true, 'glm 4 flash'],
  ['glm 4.5 thinking', true, 'glm 4.5 thinking'],
  // 不应误判为模型名（应正常翻译）
  ['gpt 4 is fast', false, '普通句子'],
  ['the gpt 4 is fast', false, '普通句子2'],
  ['claude is great', false, 'claude 普通句子'],
  ['python3.10', false, 'python 不在基础名'],
  ['html5', false, 'html 不在基础名'],
  ['windows11', false, 'windows 不在基础名'],
  ['Hello World', false, '普通文本'],
  ['DeepSeek Coding Plan', false, '套餐名非模型名'],
  ['glm is good', false, 'glm 普通句子']
];

let pass = 0;
let fail = 0;
const failures = [];
for (const [input, expected, desc] of tests) {
  const actual = sandbox.isAiModelName(input, settings);
  const ok = actual === expected;
  if (ok) pass++; else { fail++; failures.push([input, expected, actual, desc]); }
  console.log((ok ? 'OK' : 'NG') + '  ' + input.padEnd(28) + ' => ' + String(actual).padEnd(5) + ' (expected ' + expected + ')  ' + desc);
}
console.log('\n' + pass + '/' + (pass + fail) + ' passed');
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const [input, expected, actual, desc] of failures) {
    console.log('  ' + input + ': expected ' + expected + ', got ' + actual + ' (' + desc + ')');
  }
  process.exit(1);
}
process.exit(0);
