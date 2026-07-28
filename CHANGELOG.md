# 更新日志

> 本文件记录双语翻译助手扩展每个版本的变更。
> 当前版本请见 [README.md](./README.md)。

## 版本格式说明

- **Added** — 新功能
- **Fixed** — Bug 修复
- **Changed** — 行为变更
- **Removed** — 删除功能/文件
- **Security** — 安全修复

---

## v1.0.6 — 2026-07-28

> P0/P1 缺口修复批（10 项功能补齐）。`manifest.json` 版本号未变更（hotfix 风格）。
> 3 个子代理并发实施，主代理合并 + 校验 + commit。

### Added — P1 用户体验补齐（6 项）

- **P1-4 导出/导入全部设置**
  - `background.js` 新增 `case 'exportAllSettings'` / `case 'importAllSettings'`
  - 导出 JSON 含 `version / exportedAt / settings（去 apiKeys） / glossary / customPrompt`
  - `options/options.html` 在「高级设置 → 日志级别」之后追加「💼 数据管理」section card（导出 / 导入两个按钮 + 隐藏 file input）
  - `options/options.js` 在 `setupAdvancedSettings()` 末尾追加 3 个 listener：export / import trigger / import file change
  - 导入后弹 alert 提示密钥需重填 + 500ms `location.reload()` 刷新界面
- **P1-7 popup 今日用量**
  - `popup/popup.html` 在 API 状态 section 之后追加「今日用量」section
  - `popup/popup.js` 新增 `loadDailyUsage()`，按 `usage._date === new Date().toDateString()` 判定今日，水平条形图 + 千分位字符数
  - `popup/popup.css` 末尾追加 `.api-usage` 样式（max-height 100px + overflow-y）
- **P1-8 快捷键自定义**
  - `lib/settings-manager.js` `DEFAULT_SETTINGS.general` 追加 `toggleTranslateShortcut: 'Alt+T'`
  - `background.js` `init()` 末尾追加 `chrome.commands.update` 应用用户设置；`updateSettings` case 末尾追加运行时应用
  - `options/options.html` 在「显示设置 → 交互设置 → hoverDelay」之后追加 `<select id="toggleTranslateShortcut">`（5 个 Chrome 兼容组合）
  - `options/options.js` `setupDisplaySettings` 末尾追加 select 绑定
  - `manifest.json` `commands.toggle-translate.description` 更新为「切换翻译开关（可在「显示设置 → 交互设置」中自定义）」
  - 说明：Chrome MV3 限制，浏览器设置 UI 中仍显示 `Alt+T` 建议值，扩展 handler 会响应新快捷键
- **P1-10 "仅翻译选中文本"右键菜单**
  - `background.js` `setupContextMenu` 追加 `translate-selection-only` 菜单项
  - `onClicked` 追加 `else if` 分支，复用 `showSelectionTranslation` action（content.js 已有实现）
  - 选中文字后右键即可在不修改页面的情况下独立翻译

### Fixed — P0 缺陷修复（3 项）

- **P0-1 对照面板按钮样式脱节**
  - `content.css` 末尾追加 `.dual-translate-panel button.panel-toggle-btn` / `.panel-close-btn` 样式（hover / focus-visible 走 `--dt-*` 变量体系，CSS 选择器优先级覆盖 `content.js:1101` 的 inline style）
- **P0-2 package.json TODO 字面量清理**
  - `author` 由 `"TODO: 替换为你的 GitHub 用户名"` → `"unknown"`
  - `repository.url` 由 `"TODO: 替换为你的 GitHub 仓库地址"` → `"https://example.com/your-repo"`
  - 不编造虚假 GitHub 信息，留待发布时填入
- **P0-3 README host_permissions 警告强化**
  - 在「安全性 → 权限说明」section 之前插入 `>` 引用块警告框：Edge/Chrome 首次安装时的 `<all_urls>` 警告是翻译类扩展行业惯例，扩展**不会**上传页面内容

### Changed — P1 易用性改进（3 项）

- **P1-5 黑名单/白名单模式加示例**
  - `options/options.html`「列表模式」`setting-desc` 内追加 `<br>` + `<small>` 示例：黑名单 `*.example.com` 匹配子域 + 裸域；白名单留空 = 全翻
- **P1-6 高级参数联动提示**
  - `options/options.html` 在 `retryCount` 之后追加 `.setting-row` 警示块，引用 `--warning-light` / `--warning` 变量
  - 说明 batchSize / requestTimeout / retryCount 互相影响：批量越大越省请求但丢段越多；超时越短越快放弃但慢 API 失败率高
- **P1-9 自定义供应商 endpoint URL 校验**
  - `options/options.js` 末尾新增 `isValidEndpointUrl()`（拒绝非 http/https 协议）
  - `renderApiCards()` custom 段 + `renderCustomProviders()` 中 endpoint 字段在保存前校验，失败 alert + 回滚 input

### 工程

- 新增 `.agent-collision-rules.md`（3 子代理并发协作说明，未提交）
- `npm run check`（12 个 `node --check`）全部通过

### Fixed — v1.0.6 hotfix（审计后修复 8 项真 bug）

> 主代理在合并后立即审计上一批 10 项 P0/P1 改动，发现 8 项真 bug（3 严重 + 3 中等 + 2 次要），本批逐一修复。`manifest.json` 版本号未变更。

#### 严重（3 项）

- **B1 [P0-1] 对照面板按钮 CSS 修复实际不生效**
  - 原修复仅加 CSS 规则，但 `content.js:1101` 的 inline `style="background:none;..."` specificity `(1,0,0,0)` 远高于外部 CSS 的 `(0,0,2,0)`，inline 永远胜出
  - 修：从 `content.js:1101` 移除两个按钮的 inline `style` 属性，CSS 现在正确生效
- **B3 [P1-4] 导入不走 `_ensureApiDefaults`**
  - 原 `case 'importAllSettings'` 直接 `saveSettings(message.data.settings)`，但 `saveSettings` 不做字段兜底
  - 导入旧版/缺字段的 JSON 后，`api.apiEndpoints` / `apiModels` / `customProviders` / `enabledApis` 全是 undefined，`api-manager.js:91` 会 fallback 到空字符串导致全部 API 不可用
  - 修（v1.0.6 初版）：`lib/settings-manager.js` 新增公开方法 `applyImportedSettings(importedSettings)` = `_deepMerge(DEFAULT, imported)` + `_ensureApiDefaults()` + `saveSettings`
  - **v1.0.6 简化**：上述用 `.call({ settings: merged })` 临时绑 `this` 是反模式（脆弱，依赖 `_ensureApiDefaults` 只用 `this.settings`），改为**复用现有 `loadSettings()`** —— 先把 import 数据写入 sync，再 `loadSettings()` 走 `_deepMerge` + `_ensureApiDefaults` 标准流程，最后补调 `_loadApiKeysFromLocal()` 恢复 local 端密钥。**0 风险、6 行代码、无 `.call` 黑魔法**
- **B12 [P1-10] 新增的"仅翻译选中文本"菜单项与原菜单完全等价**
  - 两个菜单项都调 `showSelectionTranslation` 弹同一个 floating div，"不修改页面"的承诺本来就是原菜单的行为
  - 修：删除 `translate-selection-only` 菜单项及 `onClicked` 中的 `else if` 分支（11 行代码回滚）

#### 中等（3 项）

- **B7/B8 [P1-8] 快捷键被 Chrome 拒绝时无提示**
  - 用户在 select 选 `Ctrl+T` 等被系统保留的组合，`chrome.commands.update` 抛异常被 catch 静默吞掉，UI 还显示"✓ 已保存"，但实际未生效
  - 修（v1.0.6 初版）：`background.js` `case 'updateSettings'` 内 `commands.update` 失败时回传 `{ success: false, error }`；`options/options.js` 收到失败时**回滚 select.value + 回滚 storage + alert**
  - **v1.0.6 简化**：将 `commands.update` 调用**提前到 `settingsManager.updateSetting` 之前** —— 失败时**根本不写 storage**，options 端不再需要回滚 storage（也无需提前赋值 `settings.general.toggleTranslateShortcut`），只需回滚 select.value。**storage 不会留下"被 Chrome 拒绝的"快捷键**，handler 从 14 行简化为 9 行
- **B11 [P1-9] 预置 LLM 端点未校验**
  - 原 `isValidEndpointUrl` 只在 `custom_` 段和 `custom-provider-field` 生效；预置 API（deepseek/glm/tongyi 等）的 endpoint input 走主分支未校验
  - 修：在主分支 `if (field === 'endpoint')` 入口加 `isValidEndpointUrl` 校验，失败 alert + 回滚 input
- **B14/B15 [P1-4] 导入无 magic 字段校验 + 无文件大小限制**
  - 任何 JSON 只要含 `version` + `settings` 字段就被接受并写进 sync（可能污染其他扩展的配置）；500MB 恶意 JSON 会让 `file.text()` 吃光内存
  - 修：options 端先 `file.size > 5MB` 拒绝，再校验 `s.api.apiPriority` 必须是 array + `s.display` 和 `s.general` 必须存在，失败 alert 拒绝

#### 次要（2 项）

- **B5 [P1-7] `loadDailyUsage` 函数位置错乱**
  - 定义在 `popup.js:151` 但被 `DOMContentLoaded:27` 调用，靠 hoisting 勉强工作
  - 修：移到文件末尾，调用点不变

#### v1.0.6 hotfix 第二轮 — 简化过度设计

> 审计 hotfix 自身，发现 3 处过度设计：
> 1. B3 的 `.call({ settings: merged })` 反模式（脆弱、依赖未声明的内部契约）
> 2. B7/B8 的 14 行 handler 含 4 个状态变量（newVal/oldVal/内存同步/storage 回滚），实际只需"失败回滚 UI"
> 3. CSS 死代码 `.dual-translate-panel-close-all` + 重复的 `color` 规则

- **B3 简化**：见上
- **B7/B8 简化**：见上
- **CSS 清理**：删除 `.dual-translate-panel button` 重复 `color` 规则（被 panel-toggle/close 内部 color 覆盖）+ 删除 `.dual-translate-panel-close-all` 死代码占位
- **review 整体收益**：v1.0.6 hotfix 第二轮净 **-5 行**（-18 / +13），同时**消除了 1 个反模式 + 1 处死代码**

#### v1.0.6 总体净改动（v1.0.5 → v1.0.6 hotfix2）

- 13 文件，+379/-12（其中 CHANGELOG 独占 94 行）
- 真实代码 +285 行，**整体价值密度合理**
- 删除冗余菜单项 1 个 + 死代码 1 处
- 新增公开方法 0 个（B3 简化为复用 `loadSettings`）

#### v1.0.6 hotfix 第三轮 — 低风险 5 项清理

> 审计 hotfix2 剩余的过度设计点，挑出 5 项低风险改动一并提交。

- **#1 死代码 — `popup.js` `escapeHtml` 兜底函数**
  - 8 行函数（line 18-25 旧）只定义不调用，`lib/escape-utils.js` 已通过 IIFE 注入 `window.escapeHtml`
  - 风险评估：🟢 极低（`escapeAttr` 兜底保留即可覆盖所有使用场景）
  - 修：删 8 行
- **#2 性能 — `popup.js` 轮询频率 500ms → 1000ms**
  - 旧 500ms 偏密，CPU/唤醒开销偏大；翻译完成通常 2-5 秒，1000ms 足够
  - 风险评估：🟢 低（最坏情况：用户晚 0.5 秒看到取消按钮消失，可接受）
  - 修：1 行
- **#3 逻辑重复 — `loadDailyUsage` 3 个空状态判断合并为 1 个**
  - 旧 line 325 `_date !== today` 和 line 336 `items.length === 0` 显示**相同提示**但分两个 return
  - 修：把 `_date` 检查与 `for` 循环合并（`if (usage._date === today) { ... fill items }`），`items.length === 0` 自动覆盖两种情况
  - 风险评估：🟢 低（语义不变）
  - 修：5 行变 3 行
- **#5 UX 缺陷 — 快捷键下拉框删 `Ctrl+T` / `Ctrl+Shift+T`**
  - 这两个组合被 Chrome 系统保留，**永远**会被 `commands.update` 拒绝
  - 放在下拉框里只会让用户点了再被 alert 弹回，**纯误导**
  - 风险评估：🟢 低（Chrome 未来若开放这些组合需手动加回，但目前不开放）
  - 修：2 行 option
- **#8 撤回** — CSS selector 合并初判错误：3 个 rule 各自属性不同（base/hover/focus-visible），无法合并 selector
- **总收益**：5 项改动净 -10 行 / +3 行，**零风险**

---

## v1.0.5 — 2026-07-25

### Security

- **4 处 XSS 修复**（P1-01 / P1-02 / P2-01 + 兜底）
  - 新增 `lib/escape-utils.js`（IIFE 暴露 `window.escapeAttr` / `window.escapeHtml`，5 实体转义）
  - `options/options.js:552` `provider.name` 插值改为 `escapeAttr`
  - `options/options.js:829` `provider.id` 插值改为 `escapeAttr`
  - `popup/popup.js:154` `displayName` 插值改为 `escapeAttr`
  - `popup/popup.js:1-26` 加 `typeof window.escapeAttr` 兜底（escape-utils.js 加载失败时回退内联实现）
- **2 处 CSS 注入修复**
  - `options/options.html:92` 字体名 input 加 `pattern` 校验
  - `options/options.html:101` 间距 input 加 `pattern` 校验
  - `options/options.js:160-178` 字体/间距 change handler 加 JS 兜底 sanitize

> commit: `d61e377`

### Fixed — v1.0.5 hotfix（未提交，工作树中）

> 本批为 v1.0.5 安全修复完成后的功能性 hotfix，**`manifest.json` 版本号未变更**。
> 修复 7 项功能 bug + 删除 1 个冗余占位文件。

- **模式切换（switchMode）不重置 DOM**（`content.js`）
  - 旧路径：`cleanupAllInjections` + 段清理 + `placePendingSpans` + `fillTranslations` + 显式调 HOVER/PANEL
  - 新路径：`resetAll` + 清 `isTranslating` + `startTranslation` 全流程
  - 现象：切到「仅译文」模式后，原文未隐藏（`hideOriginalText` 的 `replaceChild` 因 `seg.node` 已被 DOM churn detached 而静默失败）
- **首屏翻译时术语表未生效**（`content.js`）
  - 旧：`loadGlossary();`（fire-and-forget）
  - 新：`await loadGlossary();`
  - 现象：首屏翻译时 `glossaryEntries` 还是空数组，术语替换失效
- **API 测试成功不持久化状态**（`lib/api-manager.js`）
  - 旧：测试成功仅返回 `{ success: true }`，不更新持久状态
  - 新：测试成功时 `saveApiStatus(apiName, { status: 'available' })` + 刷新 `statusCache`
  - 现象：连续 3 次错误后 API 被永久跳过，测试成功无法解除标记
- **测试按钮成功不刷新 options 页面状态**（`options/options.js`）
  - 旧：测试成功只显示 "✓ 成功"，2 秒后恢复，badge 不更新
  - 新：成功后 `await getApiStatus` → 更新内存 `apiStatus` → `renderApiCards()` + `renderApiUsage()`
  - 现象：持久层写 OK，但 options 页面内存还是旧 status，状态 badge 不刷新
- **「添加自定义供应商」按钮无反应**（`options/options.js:1073`）
  - 旧：`document.addEventListener('DOMContentLoaded', () => {...});`（`<script>` 在 `</body>` 前，DOMContentLoaded 已触发，第二个 listener 永不执行）
  - 新：IIFE `(() => {...})();`
  - 现象：「+ 添加自定义供应商」按钮点不动
- **翻译缓存开关形同虚设**（`options/options.js`）
  - 旧：`if (path === 'trigger.contextMenu' || path === 'trigger.autoTranslate')` 触发 `reloadApis`
  - 新：加 `|| path === 'trigger.translationCache'`
  - 现象：关闭/开启缓存开关后，旧 cache 继续生效
- **`console.log` 错用为告警**（`background.js:309`）
  - 旧：`console.log('Failed to migrate API keys:', error);`
  - 新：`console.warn(...)`

### Removed

- **`config/api-keys.json`** — 内容为 `{}`（2 字节占位空对象）
  - 迁移代码已能处理 `fetch` 404 情况（`background.js:304` 的 `if (!resp.ok) return;`）
  - 删后减少 1 个误导性文件

---

## v1.0.4 — 2026-07-25

### Added

- **按域名专属术语表**（§3.3）
  - `lib/settings-manager.js`：`getGlossary()` 返回结构化对象 `{ _global, 'host': [...], '*.wildcard': [...] }`
  - 旧 array 格式自动升级为 `{ _global: [...] }`（向后兼容）
  - 首次加载从 `default-glossary.json` 注入 `_global`
  - 新增 `getGlossaryForDomain(domain)`：合并全局 + 精确 + 通配符
  - 通配符 `*.foo.com` 匹配裸域 `foo.com` + 任意子域（glob 惯例）
  - `background.js` 新增 `case 'getGlossaryForDomain'` IPC handler
  - `content.js` `loadGlossary()` 用 `location.hostname` 调 `getGlossaryForDomain`
  - `options/options.html` glossary section 加 scope 选择器 + 添加/删除按钮
  - `options/options.js` `glossaryByDomain` 数据结构替换 `glossaryEntries`；`currentScope` 状态机 + `getCurrentEntries()` 隔离

> commit: `185a83f`

---

## v1.0.3 — 2026-07-25

### Added

- **懒加载翻译（IntersectionObserver）**（§3.4 性能优化）
  - `content.js` 新增 `lazyTranslateObserver` / `teardownLazyObserver()` / `isSegInViewport(seg)`（200px 预加载容差） / `translateSegmentsLazy(segs, signal)`
  - `startTranslation` 内 `lazyTranslate` 开关智能分支：视口内段立即翻译 + 视口外段加入 `lazyPendingSegs` Map
  - `IntersectionObserver` 监听所有 `.dual-translate-placeholder[data-dt-seg]` span，滚动进入视口时补全翻译
  - HOVER/PANEL 模式自动禁用（这两模式不需要懒加载）
  - 无 `IntersectionObserver` 浏览器回退到 `translateSegments` 一次完成
  - `resetAll` 清理 observer（防内存泄露）
  - `lib/settings-manager.js` 新增 `advanced.lazyTranslate: true`（默认开启）
  - `options/options.html` 高级 tab 加「懒加载（视口内才翻译）」toggle
  - `options/options.js` 绑定 `bindToggle('lazyTranslate', 'advanced.lazyTranslate', ...)`

> commit: `d451011`

---

## v1.0.2 — 2026-07-25

### Added

> 4 项 §10.2 真缺口实现

- **翻译页面 `<title>`**（§3.2）
  - `settings-manager.js:25-26` 新增 `display.translatePageTitle` 默认 `true`
  - `content.js:686-756` `translatePageMeta()` 函数：收集 `<title>` + `img[alt]` 一次 batch 翻译，自动走 `cache.lookup` 复用
  - 原文存到 `<html data-dt-orig-title>` / `<img data-dt-orig-alt>`
  - `resetAll` 还原（`content.js:1036-1053`）
  - 跳过中文标题/alt，跳过 < 2 字符，alt 限长 200 字符
- **翻译图片 `alt` 文本**（§3.2）
  - `settings-manager.js:26` 新增 `display.translateImgAlt` 默认 `true`
  - 用 `Set` 去重避免重复翻译相同 alt
  - 改 alt 时检查 `img.isConnected` 避免被卸载的图片
- **术语表模糊匹配**（§3.3）
  - `content.js:34-60` `loadGlossary()` + `applyGlossary()` 函数
  - 接入点：`translateSegments:865-872` 翻译前先过 glossary，命中直接填 cache 不调 API
  - 接入点：`translatePageMeta:746` 翻译后也过一遍术语
  - exact = 大小写不敏感 + 全词 `\b\b`
  - fuzzy = 大小写不敏感 + 包含即替换
  - `loadSettings:308` 并行加载，失败不影响主翻译
- **日志级别**（§3.6）
  - 新建 `lib/logger.js`（35 行 ESM）：`createLogger(getLevel)` 返回 `{error/warn/info/debug}` 4 函数
  - 动态 level（`getLevel` 是函数，改设置立即生效）
  - `background.js` 引入 logger
  - `content.js:18-29` 内联 `dtError/dtWarn/dtInfo/dtDebug`（content_script 不能 ESM import）
  - `content.js` 7 处 `console.error/debug` 全部替换为 `dtError/dtDebug`
  - `settings-manager.js:189` 新增 `general.logLevel` 默认 `2`（warn）
  - `options.html:387-408` 高级 tab 加 `select`（0-4 共 5 档）
  - `options.js:898-911` `logLevel` 绑定

### Changed

- `manifest.json` 版本号 `1.0.1` → `1.0.2`

> commits: `628aa4d`（功能）, `5a35eed`（版本号）

---

## v1.0.1 — 2026-07-25

### Changed

- `manifest.json` 版本号 `1.0.0` → `1.0.1`（bug fix 累积）

### Fixed

- **UI 审计 5 个真缺口修复**（主代理核验 24 个问题后筛出的真缺口）
  - P0 #3 popup 切源语言后无 loading 提示（用户看到 700-800ms 黑屏）
    - `popup.html` 新增 `<div id='sourceLangHint'>翻译中...</div>`
    - `popup.js` change 事件时显示提示，300ms debounce 后隐藏
    - `popup.css` 新增 `.source-lang-hint` 灰条样式
  - P1 #10 options 添加术语后新行不聚焦
    - `options.js` `renderGlossaryTable` 后查最后一行 source input 调 `.focus()`
  - P1 #11 options API 测试按钮 `setTimeout` 闪烁（极端时序下覆盖）
    - `options.js` 用 `btn._testRestoreTimer` 跟踪句柄，下次点击前 `clearTimeout`
    - 顺手发现第 2 处同样代码（line 814 `renderApiUsage`），replace_all 一起修
  - P1 #13 content 对照面板 toggle 按钮文字不变（◀/▶ 状态不明）
    - `content.js:859` collapse 时按钮文字改 `▶`，展开时 `◀`
  - P1 #21 popup 还原原文在 `chrome://` 等页面静默失败
    - `popup.js` `catch {}` → `catch(e) { alert('当前页面无法翻译，请在普通网页上重试') }`

> commit: `771496f`

### Fixed（紧随其后）

- **UI 审计 P2 真缺口 #19 + 全局 focus 样式**
  - #19 welcome `closeBtn` `window.close()` 在 tab 里被静默拒绝
    - `welcome.html:97` 改用 `chrome.runtime.sendMessage({action:'closeWelcomeTab'})` IPC
    - `background.js:172-182` 新增 `case 'closeWelcomeTab'`，用 `sender.tab.id` 安全关闭
    - 含 try/catch 兜底
  - 全局键盘焦点可见反馈（3 CSS 文件）
    - `popup.css:7-13` `button:focus-visible` / `select:focus-visible`（蓝色 outline）
    - `welcome.css:152-157` `.btn:focus-visible`（蓝色 outline）
    - `options.css:122-126` `.sidebar-tab:focus-visible`（白色 outline，匹配暗色侧边栏）
    - 用 `:focus-visible` 而非 `:focus`，鼠标点击不触发，避免视觉噪音

> commit: `26e9aa5`

### Fixed（早期修复，d186b62，已在新版本前完成）

- **修复 13 个 bug + 移除已停服腾讯翻译引用**
  - 🔴 致命（2/2）
    - P1 `content.js` `onMessage` IIFE 加 try/catch 兜底
    - P2 `background.js` `init()` 加 `initPromise` 锁，SW 唤醒并发只跑一次
  - 🟠 严重（5/5）
    - P3 `content.js` `showLoading` 走 `escapeHtml`（潜在 XSS 入口）
    - P4 `content.js` hostname 正则加 `i` flag
    - P5 `options/options.js` 13 处 user-controlled 插值加 `escapeAttr`
    - P6 `options/options.js` `escapeAttr` 补单引号 + null 安全
    - P7 `manifest.json` 加 `content_security_policy`
  - 🟡 一般（5/5）
    - Y1 `content.js` `popstate` + `hashchange` 触发 `resetAll`
    - Y2 `lib/api-manager.js` `timeoutHandle` 双路 `clearTimeout`
    - Y3 `content.js` `loadSettings` 幂等守卫
    - Y4 `content.js` AI 模型正则补未来版本
    - Y5 `lib/settings-manager.js` 删「确保百度置顶」
  - 🔵 建议（2/3）
    - Y6 `content.css` 删 `.dual-translate-tooltip` dead code
    - B1 `manifest.json` 删未用 `scripting` 权限
    - B2 `baidu.js` MD5 改 `crypto.subtle` **取消**（130 行非平凡重构，风险大于收益）
  - 🧹 腾讯翻译清理
    - 腾讯翻译 API 已停服，移除 `lib/api-manager.js:69` 死分支
    - 移除 `lib/settings-manager.js:118` 腾讯域名排除
    - 移除 `options/options.js:446` 腾讯渲染跳过

> commit: `d186b62`

---

## v1.0.0 — 2026-07-25

### Added

- 首次发布的 MV3 双语翻译扩展
- 4 种翻译模式：双语对照 / 仅译文 / 悬停翻译 / 对照面板
- 4 个免费翻译接口（百度通用 / 百度大模型 / DeepSeek / 智谱 GLM）
- 翻译缓存（`chrome.storage.local`，3 天 TTL，10000 条 LRU 淘汰）
- 术语表（游戏 / MOD 社区专用）
- API 优先级 + 配额冷却
- 暗色模式（popup / options / welcome / content 全部支持）
- 快捷键 `Alt+T` 切换翻译开关
- 快捷键「翻译选中文字」（右键菜单）
- 5 个设置标签页：显示 / 翻译规则 / 术语管理 / API 管理 / 高级

> commit: `18debfb`（初始 snapshot）

---

## 引用

- `README_REWRITE.md` — v1.0.2 综合报告
- `CODE_REVIEW_REPORT_V2_REWRITE.md` — v1.0.2 代码审查
- `UI_INTERACTION_AUDIT_REWRITE.md` — v1.0.2 UI 审计
- `git log --oneline` — 完整提交历史
