# 双语翻译助手 — 项目状况报告（第二次独立审查）

> 审查时间：2026-07-24
> 审查范围：全部 JS 核心逻辑、CSS、HTML 界面
> 项目路径：`D:/Tools/edge_translater/dual-translate-extension/`
> 审查方法：独立读源码 + 用 `xxd`/`od` 比对原始字节（避免编辑工具的字符替换干扰），逐项验证前置报告的 17 个 bug
> 前置报告：`CODE_REVIEW_REPORT.md`（仅供参考，不预设立场）

---

## 1. 总体评价

代码整体质量中上，工程结构清晰。MV3 Service Worker、ES Module、`chrome.storage` 分层、API 优先级、缓存策略都是教科书式的实现。但仍存在**一个会让日文页面翻译彻底失效的运行时正则 bug**，以及若干 UI/资源管理细节问题。最大问题是：除 `content.css` 之外的 UI（popup/options/welcome）**完全没有暗色模式支持**，这与"现代浏览器扩展"的体验预期有明显落差；以及一个新发现的**对照面板原文列颜色失效**（CSS 语法错位）。

**关键数字**：
- 前置报告列出 17 项 bug，本次复核实证 11 项真实存在、3 项部分成立、2 项误报、1 项重复（计数详见第 3 节）。
- 本次独立发现 **4 个前置报告未列出的新 bug**（见第 2 节）。

**总体评级**：功能完整可用，但在国际化（暗色模式）、无障碍、错误处理一致性上有明显改进空间。

---

## 2. Bug 发现（按严重度排序）

### 🔴 Bug-V2-1 [CRITICAL] — 对照面板"原文"列颜色丢失（CSS 语法错位）

- **文件**：`content.js:849`
- **代码**：
  ```js
  row.innerHTML=`<div style="flex:1;font-size:13px:color:var(--dt-text-primary);min-width:0;line-height:1.6">${escapeHtml(seg.text)}</div><div style="flex:1;font-size:13px;color:${color};min-width:0;line-height:1.6">${escapeHtml(tr)}</div>`;
  ```
- **问题**：原文列的内联样式中，`font-size:13px` 之后用了**冒号** `:` 而不是分号 `;`，导致后续的 `color:var(--dt-text-primary)` 实际上**没被解析**（整段被视作非法声明，浏览器丢弃）。第二个 div 用 `;` 是正确的。
- **触发条件**：切换到"对照面板"模式查看译文时。
- **影响**：原文列文字退回到 `body` 默认色（一般是黑色，但失去了"dim secondary text"的视觉效果），对照面板两侧的视觉对比度差异丢失；暗色模式下"原文"可能因继承导致亮色，与已正确设置的"译文"色（用户自选色）形成不一致。
- **修复建议**：把 `font-size:13px:color` 改为 `font-size:13px;color`。同一行 line 849。

> 注：这是**前置报告未列出**的新 bug。用 `xxd` 确认原始字节：`1   3   p   x   :   c   o   l   o   r`，确实是字面意义的 `:`。

### 🔴 Bug-V2-2 [CRITICAL] — `detectPageLanguage()` 正则非法转义，JS 语法错误

- **文件**：`content.js:328`
- **代码**：
  ```js
  else if(/[\u3040-\u309F\u\u30A0-\u30FF]/.test(ch)){ja++;cjk++;total++;}
  ```
- **问题**：正则字面量中存在 `\u\u30A0`——一个 `\u` 后没有 4 位十六进制字符。V8 在解析此源码行时会直接抛 `SyntaxError: Invalid Unicode escape sequence`，导致整个 `content.js` 模块加载失败。
- **触发条件**：用户启用扩展、访问任意页面；`content.js` 在 `document_idle` 注入；解析阶段即抛错。
- **影响**：
  - 整个 content script **不会运行**（MV3 中一个语法错误会让整个 IIFE 顶层挂掉）。
  - 用户看到：扩展图标点开是 popup 正常，但**任何页面上不会翻译**、不会注入 loading、不会注入 panel。
  - console 报错：`Uncaught SyntaxError: Invalid \u escape in regular expression`。
- **修复建议**：把 `\u\u30A0` 改成 `\u30A0`（片假名范围起始），或更直观地：
  ```js
  else if (/[\u3040-\u309F\u30A0-\u30FF]/.test(ch)) { ja++; cjk++; total++; }
  ```
- **严重度重申**：这是本次审查最严重的问题——**它会让扩展表面上看起来安装了但所有功能都失效**。建议作为发布前的 P0 必修。

> 验证：用 `awk 'NR==328' content.js | xxd` 输出 `5c75 5c75 3330 4130` 确认字节序列就是字面的 `\u\u30A0`，不是 read_file 工具的渲染副作用。

### 🟠 Bug-V2-3 [HIGH] — `textCache` 跨源语言命中，错误返回旧翻译

- **文件**：`content.js:22`（定义）、`content.js:712-718`（使用）
- **代码**：
  ```js
  const textCache = new Map();
  // ...
  const cachedTranslation = textCache.get(normText(seg.text));
  ```
- **问题**：`textCache` 是纯文本键值缓存，**不包含 `sourceLang` 维度**。全局缓存 `lib/translation-cache.js:26-28` 用 `_key(sourceLang, norm)` 包含源语言，没有此问题；但**页面级 textCache 只看原文键**。
- **触发条件**：用户在 popup 中切换源语言（auto → en → ja → all），且翻译内容里"Hello" 既被英文翻译又被日文翻译（或曾经翻译过"Hello"为某段中文，然后切换为日文时，假设日文也包含"Hello"这个词——这在日文网站中不常见，但如果原文里有英文专有名词如 "Apple"）。
- **影响**：错误地把英文翻译结果当作日文翻译使用，结果不准确。
- **修复建议**：
  ```js
  // textCache 键应包含 sourceLang
  const cacheKey = `${sourceLang}::${normText(seg.text)}`;
  ```

### 🟠 Bug-V2-4 [HIGH] — `reload()` 清除所有 API 状态导致配额冷却失效

- **文件**：`lib/api-manager.js:128-132`
- **代码**：
  ```js
  async reload() {
    await chrome.storage.local.remove('dual_translate_api_status');
    this.statusCache = {};
    await this.init();
  }
  ```
- **问题**：`reload()` 无条件清除所有 API 的 `quota_exceeded` / `auth_error` / `consecutiveErrors` 状态，再重新 `init()`。这意味着：在某个 API 配额耗尽的同一天里，用户**每修改一次设置**（如改改颜色、点下开关），就会让该 API 重新被尝试，结果是请求必失败 + 浪费时间 + 给用户更长的等待。
- **触发条件**：用户进入 options 页面 → 切换任意开关 / 改颜色 / 排序 / 添加自定义供应商 → 触发 `saveAllSettings()` → `chrome.runtime.sendMessage({ action: 'reloadApis' })` → `apiManager.reload()` 清空。
- **影响**：
  - 配额冷却失效：本来设计 `quota_exceeded` 状态应持续到下个零点/下个月，但被 `reload()` 频繁清掉。
  - 多次无用 API 调用（每个耗尽 API 都会重新尝试失败）。
  - `resetApiQuotaIfNeeded()`（settings-manager.js:419）的日/月重置逻辑变得**形同虚设**，因为 quota_exceeded 状态在 reset 之前就被清空了。
- **修复建议**：
  ```js
  async reload() {
    // 只重建 translators 列表，保留状态
    this.statusCache = await settingsManager.getApiStatus();
    this.llmSystemPrompt = await this._loadLlmPrompt();
    this.glossaryPromptSuffix = await this._loadGlossaryPromptSuffix();
    this._buildTranslators();
  }
  ```

### 🟠 Bug-V2-5 [HIGH] — hostname 匹配在 background / content 间行为不一致

- **文件**：
  - `lib/settings-manager.js:503-512`（`_hostMatches`，后台使用）
  - `content.js:278-294`（`hostMatchesPattern`，content script 使用）
- **问题**：两个实现逻辑不同：
  - `_hostMatches` 直接把 `*.xxx.com` 转成 `^.*\.xxx\.com$`，**无法匹配裸域名 `xxx.com`**，且默认带 `i` flag。
  - `hostMatchesPattern` 用 `^\.\*\\\.\` → `(?:.*\.)?` 做了可选前缀处理，能匹配裸域名，但**没有 `i` flag**。
- **影响**：
  - 用户在 options 排除列表加 `*.example.com`：
    - 在后台 `shouldAutoTranslate(url)` 中（首次访问触发自动翻译判定），裸域名 `example.com` **不**被匹配 → 本应排除的页面被翻译。
    - 在 content script 中（`shouldAutoTranslate(hostname)`），裸域名 **会**被匹配 → 排除生效。
  - 同一份配置、两端行为不同，违反"单一事实源"原则。
- **修复建议**：把匹配逻辑提取到 `lib/host-matcher.js` 公共模块，统一使用一致的正则（推荐 `^(?:.*\.)?example\.com$` + `i` flag）。

### 🟡 Bug-V2-6 [MEDIUM] — `sendMessage` 包装器永远不 reject，UI 可能卡死

- **文件**：`content.js:250-252`
- **代码**：
  ```js
  function sendMessage(action, data={}) {
    return new Promise(r => chrome.runtime.sendMessage({action,...data}, resp => r(resp||{})));
  }
  ```
- **问题**：当 Service Worker 处于休眠、被卸载、或 message 通道异常时，`chrome.runtime.sendMessage` 的 callback 可能根本不触发（既不 success 也不 error），导致这个 Promise **永久 pending**。
- **触发条件**：用户长时间不操作扩展后，Chrome 主动休眠 SW（默认 30 秒空闲）；此时再触发翻译，SW 会被唤醒，但少数情况唤醒过程中 content ↔ background 通信异常。
- **影响**：所有 `await sendMessage(...)` 的代码路径都会 hang：
  - `startTranslation()` 中 line 479 `await sendMessage('setIconState', ...)` hang → loading overlay 不消失。
  - `translateSegments` 中 line 742 `await sendMessage('translateTexts', ...)` hang → 当前批永远不返回。
- **修复建议**：
  ```js
  function sendMessage(action, data={}, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('SEND_MESSAGE_TIMEOUT')), timeoutMs);
      chrome.runtime.sendMessage({action, ...data}, (resp) => {
        clearTimeout(t);
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(resp || {});
      });
    });
  }
  ```

### 🟡 Bug-V2-7 [MEDIUM] — `migrateApiKeysToStorage` 重复定义，且 `migrateApiKeysToStorageIfMissing` 是死代码

- **文件**：`background.js:271-296`（顶层定义 + 死函数）、`background.js:299-314`（onInstalled listener 内重复定义）
- **问题**：
  - 顶层定义了 `migrateApiKeysToStorage()` 和 `migrateApiKeysToStorageIfMissing()`，后者是死代码（永远不会被调用）。
  - `onInstalled` listener 内部又**重新定义**了一份**逻辑完全相同**的 `migrateApiKeysToStorage`，与顶层定义同名但作用域不同。
- **影响**：
  - 死代码增加维护成本，新人易混淆"该调哪个"。
  - onInstalled 内部的版本只在 install/update 时被调用 —— 这是**预期行为**，但**顶层版本只在顶层初始化的路径上**（line 329 `init()` 没用到它，line 263 `shouldAutoTranslate` 也没用），所以顶层版本实际上是**永远不被调用**的死代码。
  - 真实生效的是 onInstalled 内部版本，但每次 SW 唤醒时 SW 全局变量是新的，所以顶层定义永远不会和它冲突。
- **修复建议**：删掉顶层 `migrateApiKeysToStorage` 和 `migrateApiKeysToStorageIfMissing`，只保留 onInstalled 内部版本（或者反过来，把 onInstalled 内部版本提到顶层 + 让 onInstalled listener 引用它）。

### 🟡 Bug-V2-8 [MEDIUM] — 两个 `DOMContentLoaded` listener 在 options.js 竞态

- **文件**：`options/options.js:73-82` 和 `options/options.js:917-948`
- **问题**：两个 `DOMContentLoaded` listener 并列。前者调用 `loadAllData()`（异步），后者（line 917）注册 `addCustomProviderBtn` 的 click 事件，事件 handler 中**直接访问 `settings.api.customProviders`**（line 919）—— 如果用户在 `loadAllData()` 完成前**极快地**点击"添加供应商"按钮，会触发 `TypeError: Cannot read properties of null (reading 'customProviders')`。
- **触发条件**：极端情况，但**实际可触发**：用户装好扩展首次打开 options → 在 `await chrome.runtime.sendMessage({ action: 'reloadApis' })`（line 74）返回前疯狂点击页面。
- **影响**：
  - 抛错后 handler 中 `providers.push(newProvider)` 之前的 `settings.api.customProviders || []` 在 line 919 会因 settings.api 为 null 而 short-circuit 到 `|| []`，所以**实际不会抛错** —— 这点要修正：line 919 是 `(settings.api.customProviders || [])`，所以 null protection 已经存在。**但 line 932 `settings.api.apiPriority.indexOf('custom')` 仍然在 settings.api 为 null 时会抛错**。
  - 即便不抛错，按钮事件中 `saveAllSettings(settings)` 会把 partial settings 写入 storage，导致**覆盖真实数据**。
- **修复建议**：把 line 917-948 的 handler 合并到 line 73 的 listener 内部，所有初始化都 `await` 完成后才注册 click handler。

### 🟡 Bug-V2-9 [MEDIUM] — `_splitTranslations` 的 `===` 分隔符与原文中的 `===` 冲突

- **文件**：`lib/api-adapters/llm-generic.js:23, 87`
- **代码**：
  ```js
  userPrompt = `...每段原文之间用分隔符 === 隔开...\n\n${texts.join('\n===\n')}`;
  // ...
  let parts = content.split('===').map(s => s.trim());
  ```
- **问题**：分隔符 `===` 也可能合法地出现在原文里（数学符号、代码、Markdown 标题）。
  - 假设 `texts = ['Use === for strict equality', 'OK']` → prompt 中是 `Use === for strict equality\n===\nOK`
  - LLM 不一定会按 prompt 提示在每段译文之间插入 `===`，**即使遵守了**，如果译文里包含 `===`，解析也会错位。
  - `_splitTranslations` 中的兜底逻辑（line 90-97 fallback to `\n` split）非常脆弱，仅按行数对齐。
- **影响**：原文或译文中含 `===` 时，段落对应关系错位，译文错配。
- **修复建议**：使用 NUL 字符 `\u0000` 或双方极少出现的 emoji（如 `🟦`）作为分隔符；prompt 明确要求 LLM 用相同分隔符。

### 🟡 Bug-V2-10 [MEDIUM] — popup.js 中"源语言"变更监听触发 2 次独立 `sendMessage`

- **文件**：`popup/popup.js:201-220`
- **代码**：
  ```js
  sourceLangSelect.addEventListener('change', async (e) => {
    const newLang = e.target.value;
    await chrome.runtime.sendMessage({ action: 'updateSettings', path: 'api.sourceLanguage', value: newLang });
    // ...
    await chrome.runtime.sendMessage(tab.id, { action: 'retranslateWithSource' });
  });
  ```
- **问题**：
  - `updateSettings` 在 background 中又会触发 `chrome.tabs.sendMessage(tab.id, {action:'retranslateWithSource'})`（background.js:84-97）。
  - popup 中又发了一次同样的消息（line 214）。
  - content script 中 `retranslateWithSource` handler 是 `resetAll(); startTranslation();`（content.js:935）—— **被调用 2 次**。
- **影响**：切换源语言会**重新翻译两次**，中间隔几十毫秒，第一次的中间产物（loading overlay、placeholder）会被第二次立刻覆盖。在慢网或大页面场景下，用户看到两次 loading 闪烁，且消耗双倍 API 配额。
- **修复建议**：删除 popup.js line 214 的手动 retranslate 调用（background 已经会做）。

### 🔵 Bug-V2-11 [LOW] — `updateSetting` 写盘全量 settings（chrome.storage.sync 100KB 限制）

- **文件**：`lib/settings-manager.js:354-368`
- **问题**：每次 `updateSetting(path, value)` 都调用 `saveSettings(this.settings)` 写整个 settings 对象到 `chrome.storage.sync`。`chrome.storage.sync` 单项上限 8KB、总配额 100KB。
- **影响**：默认设置 100 多条 `*.xxx.com` 排除列表（line 32-148，约 4KB JSON）+ 大量 UI 设置（< 2KB）→ 写入约 6KB 每次。任何时候用户切换一项 → 6KB IO 同步到所有登录设备。
- **修复建议**：使用 `chrome.storage.sync.set` 拆分多个 key（如 `dual_translate_settings_display`, `dual_translate_settings_rules` ...），或改用 `chrome.storage.local`（无配额问题，仅本地存储）。

### 🔵 Bug-V2-12 [LOW] — `_handleApiError` 状态保存有竞态

- **文件**：`lib/api-manager.js:213-236`
- **问题**：
  - Line 213-234 写 status。
  - Line 235 重新 `getApiStatus()` 读取整个 status → 写回 `this.statusCache`。
  - 但**多 API 并行错误**时（如百度和 DeepSeek 同时失败），两个 `_handleApiError` 都会**完整重写 `this.statusCache`**。后者覆盖前者，导致丢失部分状态。
- **触发条件**：translate() 内部 line 162-176 是 `for...of await`，所以**单线程顺序**调用 `_handleApiError`，**实际不会触发竞态**。但 SW 休眠后唤醒、且背景有其他 `translate()` 并发时（popup 右键翻译 + content 翻译同时），可能出现。
- **影响**：罕见情况下 status 状态丢失。
- **修复建议**：直接 `this.statusCache[apiName] = ...` 局部更新，避免整体重读。

### 🔵 Bug-V2-13 [LOW] — `migrateApiKeysToStorage` 写入 storage.local 但已被 `clear()` 清空

- **文件**：`background.js:286`
- **问题**：`api-keys.json` 是空文件 `{}`（前置报告已清空），所以 line 282 `const keysData = await resp.json()` 得到 `{}`，line 286 写入 storage 一个空对象。下次 line 274 的 `Object.keys(...).length > 0` 检查会**通过**（因为对象存在，但 keys 长度 0 不通过），所以下次还会**再走一次** `fetch`。
- **影响**：每次 SW 唤醒都会多一次不必要的 `fetch`（虽然缓存的 `fetch` 命中率高），不是严重问题。
- **修复建议**：用 `if (Object.keys(existing).length === 0)` 同时检查存在和长度；或加一个 `migrated: true` 标志。

### 🔵 Bug-V2-14 [LOW] — `dailyUsage` 月度重置不清理 `_date` 字段外的 key

- **文件**：`lib/settings-manager.js:419-454`
- **问题**：跨日时 `resetApiQuotaIfNeeded` 把 `quota_exceeded` 重置为 `available`，但 `dailyUsage._date` 字段（在 `addDailyUsage` line 469-475 中按日重置）跨日会自动重置，OK；`dailyUsage[apiName]` 累加值也会随 `_date` 改变而从 0 重新开始。但**`apiStatus` 中如果 key 同时有 `consecutiveErrors: 5`（quota_exceeded 之外的字段）**，跨日重置不会清 `consecutiveErrors`。
- **影响**：连续错误计数会跨日累积，达到 3 后 line 149 `if (status.status === 'error' && status.consecutiveErrors >= 3) return false;` 让 API 永久不可用，直到下次错误把它推上 3+。
- **修复建议**：跨日重置时同时把 `consecutiveErrors` 归零。

### 🔵 Bug-V2-15 [LOW] — `welcome.html` 关闭按钮用 `window.close()`，常被浏览器拒绝

- **文件**：`welcome/welcome.html:96-98`
- **问题**：`window.close()` 在脚本不是由用户直接打开的窗口时（如扩展自动 `chrome.tabs.create` 打开）会被多数浏览器静默拒绝。
- **影响**："稍后配置"按钮可能无效果，welcome 标签页留作"无法关闭的孤儿"。
- **修复建议**：在 `chrome.tabs.create` 时记录 tabId，关闭时调 `chrome.tabs.remove(tabId)` 通过 background message。

### 🔵 Bug-V2-16 [LOW] — `sendMessage('translationStatus', ...)` 发送给 background 的消息无对应 handler

- **文件**：`content.js:480, 490, 504, 514, 521` 发送 `action: 'translationStatus'`
- **问题**：background.js `handleMessage`（line 70-182）的 switch 中**没有 `case 'translationStatus'`**——会进入 `default: return { error: 'Unknown action: ...' }`。每次翻译开始/结束都会向 background 发消息，全部被拒。
- **影响**：功能上无影响（background 不需要知道状态），但产生无用 IPC，且 popup 轮询 `getStatus` 的逻辑完全独立于这个 signal。
- **修复建议**：删掉 content.js 中所有 `sendMessage('translationStatus', ...)`，或补上 background handler。

### 🔵 Bug-V2-17 [LOW] — content.js 顶层变量污染

- **文件**：`content.js:1-26`
- **问题**：`currentMode`, `settings`, `isTranslating`, `currentAbortController`, `translationCache`（页面级，**与 `lib/translation-cache.js` 全局缓存同名**）等 20+ 顶层变量。虽然被注入到页面 isolated world，但 IIFE 包裹（line 947 `(function init()...`) 只包了 init 函数，**其他函数都在顶层**。
- **影响**：污染 content script 自己的全局（不污染页面），但调试时若开发者同时在 DevTools console 中访问这些变量，会困惑（同名变量）。
- **修复建议**：用 IIFE 包裹整个文件（`(function() { 'use strict'; ... })()`），所有变量用 `const/let` 在 IIFE 内。

### 🔵 Bug-V2-18 [LOW] — `_getNextMidnight` 在 DST 切换日可能差 1 小时

- **文件**：`lib/api-manager.js:238-243`
- **问题**：`setHours(24, 0, 0, 0)` 在夏令时切换日会回退或跳过 1 小时；某些时区下 `quotaResetAt` 计算会有 23 或 25 小时。
- **影响**：仅在中国/UTC 等无 DST 时区无影响。
- **修复建议**：用 `Date.UTC(...)` 计算次日 0 点的 UTC 时间戳。

---

## 3. 前置报告复核

按前置报告 `CODE_REVIEW_REPORT.md` 的 17 个 bug 编号（注意前置报告是数字编号，与我用的 V2 编号不同），逐项验证如下：

| 前置 # | 简述 | 我的判定 | 证据 |
|--------|------|----------|------|
| Bug-1 | content.js:328 正则 `\u\u30A0` 语法错误 | ✅ **真实存在** | `xxd` 输出 `5c75 5c75 3330 4130`（字面的 `\u\u30A0`）。这是 P0 必修。 |
| Bug-2 | hostname 匹配 background/content 不一致 | ✅ **真实存在** | `_hostMatches`（settings-manager.js:503）生成的 `^.*\.example\.com$` 确实不匹配裸域名 `example.com`；`hostMatchesPattern`（content.js:278）用 `(?:.*\.)?` 处理。前置报告准确。 |
| Bug-3 | api-manager.js `reload()` 清除所有 API 状态 | ✅ **真实存在** | lib/api-manager.js:128-132 一字不差。前置报告准确。 |
| Bug-4 | 翻译颜色内联 style，暗色失效 | ✅ **真实存在** | content.js:673 `ph.style.cssText = ...color:${color}...` 确实覆盖了 CSS 变量；但**前置报告忽略了一个事实**：content.css 已经有 `prefers-color-scheme: dark` 媒体查询（line 181-203），所以**只有翻译文字本身**失效，loading overlay / tooltip / panel 容器**是支持暗色的**。前置报告定性为"暗色模式彻底失效"略夸张。 |
| Bug-5 | `panelInstance` 引用悬挂 | ⚠️ **部分成立 / 实际误报** | 前置报告说 `cleanupAllInjections`（content.js:391）不清理 panelInstance 引用。**事实**：line 391 确实没清，**但** content.js:838-839 `updatePanel()` 一开始就 `panelInstance=null`，且 content.js:913 `resetAll()` 中也 `panelInstance=null`。唯一会"只走 cleanupAllInjections 而不调 resetAll/updatePanel"的路径是用户中途切模式，但 `switchMode`（line 884-895）会调 `cleanupAllInjections` 后再调 `updatePanel` —— 所以引用一定会被清。**没有真实的内存泄漏路径**。 |
| Bug-6 | `handleTranslateTexts` cache store 后不更新 hits | ⚠️ **部分成立** | background.js:202 `await translationCache.store(freshResults, sourceLang)` 之后 hits Map 没合并。前置报告自己说"无功能损失"。**确实无功能影响**，但 `freshMap` 已经按原文键匹配，逻辑完整。建议改成 `for (const [k,v] of freshMap) hits.set(k,v)` 让 hits 完整（未来重构时有用）。 |
| Bug-7 | `textCache` 无 sourceLang 维度 | ✅ **真实存在** | content.js:22 `const textCache = new Map();`，line 714 `textCache.get(normText(seg.text))` 确认键仅含 normalized 文本。前置报告准确。我把它升级为 V2 Bug-3（HIGH）。 |
| Bug-8 | `escapeHtml` 仅用于面板 | ⚠️ **部分成立** | 前置报告说"安全但函数使用不一致"。**事实**：`fillTranslations`（line 672）用 `textContent`（安全），`updatePanel`（line 849）和 `showSelectionTranslation`（line 921）用 `innerHTML` + `escapeHtml`（安全），`showErrorBanner`（line 237）`escapeHtml(text)`（安全）。**整体确实安全**，只是风格不一致。前置报告定性偏低，应为 INFO。 |
| Bug-9 | `confirmImportBtn` 导出/导入逻辑混淆 | ✅ **真实存在** | options.js:297-328。点击"导出" → 文本域显示 JSON → 按钮文字**仍是**"确认导入"（line 302 `document.getElementById('confirmImportBtn').textContent = '确认导入';`）→ 用户点"确认导入"会**把刚导出的内容再导入一遍**（这是正确行为，但 UX 困惑）。前置报告准确。 |
| Bug-10 | 未捕获的 Promise rejections（多处） | ✅ **真实存在** | background.js:11, 16, 203, 257；content.js:524 等多处 `catch {}` 静默吞错。前置报告准确。 |
| Bug-11 | 重复函数定义 `migrateApiKeysToStorage` | ✅ **真实存在** | background.js:271（顶层）和 line 300（onInstalled listener 内）确实定义了同名函数。我把它升级为 V2 Bug-7，附带发现 line 293 的 `migrateApiKeysToStorageIfMissing` 是**死代码**。 |
| Bug-12 | MD5 非 BMP 字符处理 | ✅ **真实存在** | lib/api-adapters/baidu.js:159 `s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24)` —— 使用 `charCodeAt`（UTF-16 code unit）拼接 4 字节当成 32-bit 整数。**Emoji 或 CJK 扩展区字符**（如 `𠮷`，UTF-16 surrogate pair）会让 MD5 签名计算**错误**，百度返回签名错误。**真实 bug**。前置报告准确。 |
| Bug-13 | LRU 全排序 O(n log n) | ✅ **真实存在** | lib/translation-cache.js:69 `keys.sort((a, b) => cache[a].a - cache[b].a);` —— 每次 store 都全量排序。`MAX_ENTRIES = 10000` 时最坏情况 O(n log n) ≈ 13 万次比较。前置报告准确。 |
| Bug-14 | `cache.getStats` 中 `JSON.stringify(cache)` 阻塞 | ✅ **真实存在** | lib/translation-cache.js:98 `const sizeBytes = JSON.stringify(cache).length;` —— 10000 条 entry 序列化大约 1-5MB JSON，UI 线程阻塞 10-100ms。前置报告准确。 |
| Bug-15 | `===` 分隔符冲突 | ✅ **真实存在** | lib/api-adapters/llm-generic.js:23, 87。我把它升级为 V2 Bug-9。 |
| Bug-16 | 设置页"导出"和"导入"共用按钮 | ✅ **真实存在** | options.js:297-328，与 Bug-9 重复。 |
| Bug-17 | （无独立编号，"全局变量污染"项） | ✅ **真实存在** | content.js 顶层 20+ 变量。我列为 V2 Bug-17。 |

**前置报告外的新发现**（本次独立审查）：
- **V2 Bug-1**（CRITICAL）：`updatePanel` 原文列 CSS 颜色语法错位（`font-size:13px:color`）。
- **V2 Bug-6**（MEDIUM）：`sendMessage` 包装器永不 reject，UI 可能 hang。
- **V2 Bug-10**（MEDIUM）：popup 源语言变更触发 2 次 retranslate。
- **V2 Bug-16**（LOW）：`translationStatus` 消息发给 background 但无对应 handler。

---

## 4. 代码质量

### 4.1 优点

- **MV3 实践规范**：`manifest.json` 字段齐全；`background.type: 'module'` 正确；`host_permissions` 与 `permissions` 分离；`web_accessible_resources` 显式声明。
- **分层合理**：`lib/` 公共模块、API 适配器独立成文件、UI 页面（popup/options/welcome）独立目录。
- **缓存策略**：`lib/translation-cache.js` 的 3 天 TTL + 1 小时命中刷新 + 10000 条 LRU 上限是合理的工程取舍。
- **错误处理**：API 适配器统一抛 `QUOTA_EXCEEDED` / `AUTH_ERROR` / `TIMEOUT` 等语义化错误，`apiManager._handleApiError` 集中处理。
- **可读性**：中文注释多，意图清晰；`METRIC_LABELS` / `AI_MODEL_NAMES` Set 数据驱动；`isMetricOrRepetitiveText` 等纯函数易测试。

### 4.2 缺点

- **风格不一致**：content.js 前 26 行空行整齐，从 line 27 起突然挤成无空行密集代码。`background.js:329` 末尾 `// MV3 Service Worker 会在空闲约30秒后休眠` 注释暗示**之前有 setInterval**被删除，但**没删干净**。
- **行长度失控**：content.js 多行 > 200 字符，line 215, 642, 842-863 普遍超长。
- **调试代码遗留**：`console.debug`（line 263）、`console.log`（line 289, 312）开发期应去除或 gate。
- **魔法数字**：content.js 多处 `z-index: 2147483646/2147483647`、`translateX(calc(100% - 30px))`、`Math.max(200, Math.min(800, ...))` 散落各处，应抽常量。
- **重复代码**：
  - `getApiStatusSummary` / `getApiDisplayName` 在 options.js:414-421 和 background.js:108-114 类似逻辑各自实现。
  - `popup.js:140-145` 的 `statusTexts` 字典在 options.js:518-522 重复定义。
  - `displayNames` 字典在 popup.js:129-138、options.js:6-16、api-manager.js:6-13 三处定义。
- **函数命名混乱**：`seg` / `bp` / `ht` / `eh` / `lh` / `ch` / `cn` / `dnt` / `dtn` / `ap` / `bn` / `iw` / `se` / `tc` / `tg` 等单字母或双字母缩写出现频率过高（content.js:548-628），新人无法快速理解。

### 4.3 测试覆盖

- 无单元测试、无集成测试、无 E2E 测试。
- 建议优先覆盖：`hostMatchesPattern`（纯函数）、`detectPageLanguage`（含 Bug-V2-2 修复后的回归）、`_splitTranslations`（Bug-V2-9）、MD5 签名（Bug-12）。

### 4.4 构建/工程化

- 无 `package.json`，无 `eslint` / `prettier` / `rollup` / `esbuild`。
- 无 CI 配置、无 `.github/` 目录。
- Service Worker 包含 ES Module（`background.js` 顶部 3 个 `import`），每次唤醒需要重新解析多个文件，可考虑 esbuild bundle 成单文件以降低唤醒延迟（虽 MV3 已优化）。
- 无 Source Map。

---

## 5. UI/UX 交互评估

### 5.1 Popup 面板（`popup/popup.html` + `popup.css` + `popup.js`）

**评分：7.0/10**

| 维度 | 评价 | 评分 |
|------|------|------|
| 布局 | 360px 宽标准弹窗，2×2 模式按钮，结构紧凑 | 8 |
| 交互反馈 | 模式按钮 active 样式 ✓、toggle 按钮 active/inactive ✓、加载态 ✓ | 8 |
| 加载态 | API Status "加载中..." ✓、缓存 "加载中..." ✓ | 8 |
| 错误态 | 无 API 时显示红色警告 "请先在设置中配置" ✓ | 8 |
| 空态 | "未检测到已配置的 API" ✓ | 8 |
| 暗色模式 | ❌ 整个 popup.css 无 `prefers-color-scheme: dark`，白底刺眼 | 2 |
| 无障碍 | 无 `aria-*`、无 `role`、按钮无 `aria-label`、键盘 focus 样式缺失 | 3 |
| 文案 | 简洁清晰 ✓ | 9 |
| 取消翻译 | 橙色按钮显眼但与主题蓝不协调；轮询 500ms 检测翻译结束（popup.js:74-89）有轻量开销 | 7 |
| 源语言变更 | 触发 2 次 retranslate（V2 Bug-10），用户看到 2 次 loading 闪烁 | 5 |

**具体问题**：
1. **取消按钮用 #ff5722 橙色**（popup.html:21），与蓝主题对比突兀；建议改为次色或与关闭按钮同色。
2. **源语言变更后无即时反馈**——没有 "✓ 已切换" 提示。
3. **API 状态列表 max-height: 120px** 截断，无 "展开" 按钮。
4. **缓存信息行只有一行**，无"清除缓存"按钮，要清除必须去 options 页。
5. **键盘 tab 顺序**：select → toggle → 4 个 mode 按钮 → API 状态（无焦点）→ 设置按钮 → 还原按钮 → 取消按钮。**取消按钮初始 `display:none`**，导致键盘 focus 跳到 setIconState 触发后才发现；建议加 `aria-live="polite"` 给取消按钮。

### 5.2 Options 设置页（`options/options.html` + `options.css` + `options.js`）

**评分：7.5/10**

| 维度 | 评价 | 评分 |
|------|------|------|
| 布局 | 左右分栏 + 5 标签页，结构清晰；RWD 768px 断点 ✓ | 8 |
| 交互反馈 | 右下角 "✓ 设置已保存" 提示 ✓；开关 toggle 样式流畅 ✓ | 8 |
| 加载态 | API 用量区 "加载中..." ✓；缓存统计 "加载中..." ✓ | 8 |
| 错误态 | 术语表 JSON 导入失败 `alert()` ✓；API 测试失败 alert + 按钮变色 ✓ | 8 |
| 空态 | "暂无用量数据" ✓ | 8 |
| 暗色模式 | ❌ 整个 options.css 无 `prefers-color-scheme: dark`，深色侧边栏在暗色系统下变成白底 | 2 |
| 无障碍 | 无 `aria-*`、无 `role`、颜色选择器无 label 关联 | 3 |
| 拖拽排序 | 视觉反馈（透明度）✓，但缺少 `dragenter`/`dragleave` 占位符 | 6 |
| Prompt 编辑器 | 无字数统计，大模型 prompt 有 4-8K token 限制 | 5 |

**具体问题**：
1. **侧边栏渐变背景**（`linear-gradient(180deg, #1a2734 0%, #1e3a52 100%)`）在深色主题下反而变成"亮色"对比，刺眼。建议在 `prefers-color-scheme: dark` 下用更深的背景或反白文字。
2. **两个 DOMContentLoaded 竞态**（V2 Bug-8）。
3. **API 卡片状态颜色**（`.api-card-status.available` 等）用浅色背景，**暗色模式下背景接近文字色**，对比度不足（仅是亮色模式验证）。
4. **导出 / 导入按钮混淆**（V2 复用 Bug-9）。
5. **API 用量进度条**（options.js:847-856）按最大用量归一化，单 API 1000 字符和 100000 字符时显示一样窄；建议同时显示绝对数。
6. **customProviders 添加按钮**（options.js:917-948）的事件绑定在第二个 DOMContentLoaded 中（V2 Bug-8）。
7. **术语表 escapeAttr 行为**（options.js:403-405）把 `"` 转 `&quot;`，但在 HTML 属性值内 `&quot;` 不会被解析为 `"`，所以**用户的 `"` 会显示为字面 `&quot;` 文本**。**新发现的 minor bug**，建议在 input 元素上用 `.value` 而非 `value="..."` 字符串拼接。

### 5.3 欢迎引导页（`welcome/welcome.html` + `welcome.css`）

**评分：7.0/10**

| 维度 | 评价 | 评分 |
|------|------|------|
| 布局 | 居中卡片 + 渐变背景，视觉吸引力高 | 9 |
| 交互反馈 | 按钮 hover transform ✓ | 8 |
| 加载态 | 纯静态，不需要 | N/A |
| 暗色模式 | ❌ 完全不支持，紫色渐变在暗色系统下对比度过高 | 2 |
| 无障碍 | 缺少 `role="dialog"` / `aria-labelledby` | 4 |
| 文案 | 3 步引导清晰 ✓ | 9 |
| "稍后配置"按钮 | `window.close()` 常被拒绝（V2 Bug-15） | 4 |

**具体问题**：
1. **缺少 API 配置直达链接** —— 第一步引导"配置翻译 API"，但按钮只去 options 主页，没有锚点跳到 `#tab-api`。
2. **无翻译演示图/GIF** —— 纯文字引导单薄，建议加 1 张对比截图。
3. **`window.close()` 不可靠**（V2 Bug-15）。

---

## 6. 优化建议

### 6.1 性能优化

| # | 建议 | 优先级 | 说明 |
|---|------|--------|------|
| 1 | 修复 Bug-V2-1（CSS 颜色 typo） | P0 | 一行修复，立即生效 |
| 2 | 修复 Bug-V2-2（正则 `\u\u30A0`） | P0 | 整个扩展功能依赖此修复 |
| 3 | `JSON.stringify(cache)` 替换为增量大小估算 | P1 | lib/translation-cache.js:98，10000 条会阻塞 UI 10-100ms |
| 4 | LRU 改用 Map 的 insertion order 做 FIFO（已经是了，但排序要 O(n log n) 改成 O(n) 单次扫） | P1 | lib/translation-cache.js:69 |
| 5 | textCache 改用 WeakRef 或加 sourceLang 维度 | P1 | content.js:22（V2 Bug-3） |
| 6 | 缓存 `getOrderedTranslators()` 结果 | P2 | api-manager.js:134-143，每次 translate() 都重建 |
| 7 | `extractSegments` 在超大页面超时 | P2 | content.js:546-628，无最大节点数限制 |
| 8 | debounce MutationObserver retranslate 间隔至少 2s | P2 | content.js:407-456 |

### 6.2 安全加固

| # | 建议 | 优先级 | 说明 |
|---|------|--------|------|
| 1 | 密钥改存 `chrome.storage.local` | P1 | 当前 settings 在 sync，会跨设备同步密钥到用户 Google 账户 |
| 2 | 显式 CSP | P2 | MV3 默认严格但可加固 |
| 3 | `showLoading(title, subtitle)` 参数化 | P2 | content.js:211-218，参数若改为外部传入需 escapeHtml（当前安全） |
| 4 | `window.close()` 加 fallback | P3 | welcome.html:97 |
| 5 | MD5 处理 surrogate pair | P1 | baidu.js:159，已在 V2 Bug-12 列出 |

### 6.3 构建/工程化

| # | 建议 | 说明 |
|---|------|------|
| 1 | 加 `package.json` + `eslint` + `prettier` | 统一代码风格 |
| 2 | 用 esbuild bundle `background.js`（含 imports） | SW 唤醒更快 |
| 3 | 加 GitHub Actions CI | 跑 lint + 简单 Node 单元测试 |
| 4 | 提取 `_locales/zh_CN/messages.json` | 为国际化打基础 |
| 5 | 加 Source Map | 调试 |
| 6 | 加 `.editorconfig` + `.gitattributes` | 跨平台协作 |
| 7 | 用 TypeScript 重写 | 配合 strict mode 减少低级 bug（V2 Bug-1, V2 Bug-2 都不可能发生） |

### 6.4 测试

| # | 建议 | 优先级 |
|---|------|--------|
| 1 | 单元测试 `hostMatchesPattern` | P1 |
| 2 | 单元测试 `detectPageLanguage`（含 V2 Bug-2 修复回归） | P1 |
| 3 | 单元测试 `_splitTranslations` | P1 |
| 4 | 单元测试 MD5（含 surrogate pair） | P1 |
| 5 | E2E 测试：装扩展 → 配置 → 访问 nexusmods.com → 验证译文出现 | P2 |

---

## 7. 开源前 Checklist

### P0（必须修）
- [ ] **V2 Bug-1**：修 `content.js:849` `font-size:13px:color` → `font-size:13px;color`
- [ ] **V2 Bug-2**：修 `content.js:328` `\u\u30A0` → `\u30A0`
- [ ] **V2 Bug-12**（前置 Bug-12）：修 baidu.js MD5 处理 surrogate pair
- [ ] 检查 `config/api-keys.json` 是空 `{}`（已确认）✓
- [ ] 跑一遍 4 个免费 API（百度通用/百度大模型/DeepSeek/GLM）至少成功一次

### P1（强烈建议）
- [ ] **V2 Bug-3**：textCache 加 sourceLang 维度
- [ ] **V2 Bug-4**（前置 Bug-3）：`reload()` 不清除 API 状态
- [ ] **V2 Bug-5**（前置 Bug-2）：统一 hostname 匹配逻辑到公共模块
- [ ] **V2 Bug-6**：sendMessage 包装器加 timeout + lastError 处理
- [ ] **V2 Bug-9**（前置 Bug-15）：用 NUL 字符代替 `===` 分隔符
- [ ] **V2 Bug-10**：popup 源语言变更去除重复 retranslate
- [ ] 密钥改存 `chrome.storage.local`（安全）
- [ ] 显式 CSP 加到 manifest
- [ ] 所有 `catch {}` 加 `console.warn`

### P2（开源前应做）
- [ ] **V2 Bug-7**（前置 Bug-11）：删掉 background.js 重复定义
- [ ] **V2 Bug-8**：合并 options.js 两个 DOMContentLoaded
- [ ] popup.css 加 `prefers-color-scheme: dark`
- [ ] options.css 加 `prefers-color-scheme: dark`
- [ ] welcome.css 加 `prefers-color-scheme: dark`
- [ ] 关键 UI 元素加 `aria-*` 属性
- [ ] `welcome.html` 关闭按钮改用 `chrome.tabs.remove`
- [ ] `_splitTranslations` 用更稳健的分隔符（与 V2 Bug-9 合并）
- [ ] `lib/api-manager.js:128-132` `reload()` 不清除状态（V2 Bug-4）

### P3（后续改进）
- [ ] 加 `README.md`（功能、配置步骤、截图、协议）
- [ ] 加 `LICENSE`（建议 MIT 或 Apache 2.0）
- [ ] 加 `CONTRIBUTING.md`
- [ ] 加 `.gitignore`（`.zip`、`node_modules/`、`.DS_Store`）
- [ ] 加 GitHub Actions CI
- [ ] 引入 ESLint + Prettier
- [ ] 提取 `_locales/zh_CN/messages.json`
- [ ] 加单元测试（Vitest 或 Node 内置 `node:test`）
- [ ] 加 E2E 测试（Playwright + 扩展加载）
- [ ] 重构命名（消除 `seg` / `bp` / `ht` 等缩写）
- [ ] 加 Source Map
- [ ] 拆分子模块（host-matcher、ui-state、cache 三类）
- [ ] 增加图标 SVG 版本

---

## 附录 A：本次审查新增 bug 速查

| 编号 | 严重度 | 文件:行 | 简述 |
|------|--------|---------|------|
| V2-1 | 🔴 CRITICAL | content.js:849 | 对照面板原文列 CSS 颜色 typo（冒号代替分号） |
| V2-2 | 🔴 CRITICAL | content.js:328 | 正则 `\u\u30A0` 非法 Unicode 转义，整个 content script 无法加载 |
| V2-3 | 🟠 HIGH | content.js:22, 714 | textCache 无 sourceLang 维度 |
| V2-4 | 🟠 HIGH | lib/api-manager.js:128-132 | reload() 清除 quota_exceeded 状态 |
| V2-5 | 🟠 HIGH | settings-manager.js:503 / content.js:278 | hostname 匹配两端不一致 |
| V2-6 | 🟡 MEDIUM | content.js:250-252 | sendMessage 包装器永不 reject |
| V2-7 | 🟡 MEDIUM | background.js:271, 293, 300 | migrateApiKeysToStorage 重复 + 死代码 |
| V2-8 | 🟡 MEDIUM | options.js:73 vs 917 | 两个 DOMContentLoaded 竞态 |
| V2-9 | 🟡 MEDIUM | llm-generic.js:23, 87 | `===` 分隔符与原文冲突 |
| V2-10 | 🟡 MEDIUM | popup.js:201-220 | 源语言变更触发 2 次 retranslate |
| V2-11 | 🔵 LOW | settings-manager.js:354-368 | 每次 updateSetting 全量写 sync 存储 |
| V2-12 | 🔵 LOW | api-manager.js:213-236 | 多 API 并发错误时 status 覆盖 |
| V2-13 | 🔵 LOW | background.js:286 | api-keys.json 空对象导致重复 fetch |
| V2-14 | 🔵 LOW | settings-manager.js:419-454 | 跨日重置不清 consecutiveErrors |
| V2-15 | 🔵 LOW | welcome.html:97 | window.close() 不可靠 |
| V2-16 | 🔵 LOW | content.js:480, 490, 504, 514, 521 | translationStatus 消息无 handler |
| V2-17 | 🔵 LOW | content.js:1-26 | 顶层变量污染 |
| V2-18 | 🔵 LOW | api-manager.js:238-243 | DST 切换日 midnight 偏差 |

---

## 附录 B：前置报告误报修正

| 前置 # | 简述 | 修正 |
|--------|------|------|
| Bug-5 | `panelInstance` 引用悬挂 → 内存泄漏 | 实际不会泄漏。`updatePanel()`（content.js:838-839）和 `resetAll()`（content.js:913）都会 `panelInstance = null`；`cleanupAllInjections` 单独执行后必跟 `updatePanel`/`resetAll` 中的一个。 |
| Bug-6 | `handleTranslateTexts` cache store 后不更新 hits | 确实存在但无功能影响（`freshMap` 已正确匹配），定性应为 INFO 而非 MEDIUM。 |
| Bug-8 | escapeHtml 使用不一致 | 整体安全，风格问题，应为 INFO 而非 LOW。 |
| Bug-4 | 暗色模式彻底失效 | 实际只有 `fillTranslations` 译文文字失效；`content.css` 已有完整 `prefers-color-scheme: dark` 媒体查询，其他注入 UI（loading、tooltip、panel）支持暗色。**前置报告漏看了 content.css 181-203 行**。 |

---

**审查结束。本报告基于 947 行 content.js、329 行 background.js、948 行 options.js、262 行 popup.js、515 行 settings-manager.js、325 行 api-manager.js、3 个 API 适配器、4 个 HTML 页面、3 个 CSS 文件。**
