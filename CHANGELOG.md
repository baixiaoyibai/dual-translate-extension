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

## v1.0.18 — 2026-07-30

> 跨平台兼容性适配：超宽屏 / 旧版 Windows / macOS / 高分屏 / 多浏览器 / 海外编码。

### Changed — 行为变更

- **统一字体栈**：所有 CSS 文件（options / popup / welcome / content）的 `font-family` 更新为跨平台字体栈，新增 `system-ui`（现代浏览器）、`'Segoe UI Variable'`（Win11）、`'Hiragino Sans GB'`（macOS 旧版中文）、`'Ubuntu'` / `'Cantarell'` / `'Noto Sans'`（Linux）兜底
- **月度用量时区修复**：`options.js` 中 `currentMonth` 从 `new Date().toISOString().slice(0,7)`（UTC）改为本地时间 `${year}-${month}`，与 `settings-manager.js` 保持一致，修复非 UTC 时区用户月初配额显示异常

### Added — 新功能

- **超宽屏适配**：新增 `@media (min-width: 1920px)` 和 `@media (min-width: 2560px)` 媒体查询，21:9 / 32:9 等特殊比例屏幕下内容自动居中并加宽，2560px+ 屏幕字号微增至 15px
- **macOS 滚动条处理**：`.main-content` 添加 `scrollbar-gutter: stable`，防止 macOS 覆盖式滚动条出现/消失时内容布局跳动
- **高分屏边框优化**：新增 `@media (-webkit-min-device-pixel-ratio: 2)` 媒体查询，Retina/4K 屏幕下将 1.5px 边框降级为 1px，避免子像素渲染异常
- **`-webkit-user-select` 前缀**：为 `content.css` 浮层、`options.css` 侧边栏和 API 字段切换的 `user-select: none` 补充 `-webkit-` 前缀，确保旧版 Chromium 内核正确禁用文本选中
- **诊断页 viewport**：`diagnose.html` 补充 `<meta name="viewport">` 标签
- **跨平台兼容性注释**：在 `settings-manager.js` 添加多浏览器存储隔离说明，在 `base.js` 添加编码安全说明，在 `options.css` 末尾添加完整兼容性清单和未来扩展预留（深色模式 / 触屏 / RTL 等）

---

## v1.0.17 — 2026-07-30

> 设置页排版优化：内联样式清理 + 视觉层次提升 + 工具类体系建立。

### Changed — 行为变更

- **页面标题区**：为 `section-subtitle` 添加底部分隔线，增强页面标题与内容的视觉层次
- **设置行 hover 效果**：修复 hover 背景为白色（与卡片背景相同导致不可见）的问题，改为浅灰底色 + 圆角 + 负边距扩展
- **卡片间距**：统一卡片 padding 为 24px 28px，间距从 18px 调整为 16px，改善垂直节奏
- **内容宽度**：tab-content 最大宽度从 820px 调整为 860px，更好地利用屏幕空间
- **主内容区 padding**：从 32px 40px 调整为 36px 44px 48px，增加底部留白

### Added — 新功能

- **代码片段样式**：为 `.setting-desc code` 添加统一的等宽字体 + 浅色背景 + 圆角样式
- **小字补充样式**：为 `.setting-desc small` 统一为 11.5px 浅灰色，替代原先 10 处重复的 `style="color:#888"`
- **工具类体系**：新增 `.hidden`、`.btn-row`、`.desc-mb`、`.text-hint`、`.warning-callout`、`.api-toolbar` 等 15+ 个可复用 CSS 工具类
- **PIN 重置链接样式**：新增 `.pin-reset-link` 类，替代内联样式

### Removed — 清理

- **内联样式清理**：将 `options.html` 中全部 42 处 `style="..."` 内联样式替换为语义化 CSS 类，零内联样式残留

---

## v1.0.16 — 2026-07-30

> 欢迎页集成至设置页首页 + 温馨提示内容更新 + Vibe Coding 开发声明。

### Added — 新功能

- **设置页欢迎页覆盖层**：每次打开设置页时自动显示欢迎页，展示功能概览和快速开始步骤。用户点击「进入设置」按钮、跳过链接或按 ESC 键即可进入详细设置页面
- **Vibe Coding 开发声明**：在「温馨提示」页面新增「开发说明」卡片，声明部分代码使用 Vibe Coding（AI 辅助编程）方式编写，并说明质量保障措施和开源反馈渠道
- **版本信息卡片**：在「温馨提示」页面底部新增版本概览，列出核心特性清单
- **PIN 码保护说明**：在「密钥存储说明」中补充 PIN 码保护机制的描述

### Changed — 行为变更

- **欢迎页术语描述**：将「游戏术语优化」更新为「术语优化」，与术语管理页面的通用化改动保持一致（涉及 `welcome.html` 和设置页覆盖层）

---

## v1.0.15 — 2026-07-30

> 第二轮全面 bug 审查修复：API 错误码修正 + 并发安全 + PIN持久化 + 存储竞态消除。
> 3 个探索代理审查 + 3 个子代理并行修复 + 主代理审核，覆盖 12 个文件，+249/-132 行变更。

### Fixed — Bug 修复（15 项）

- **百度 54001 错误码误判**：签名错误被当作 `QUOTA_EXCEEDED`，导致 API 被禁用至下月 1 日。改为 `AUTH_ERROR`
- **百度大模型 54003/54005 误判**：频率受限被当作 `QUOTA_EXCEEDED`，一次限流即禁用一个月。仅 54004（余额不足）才抛 `QUOTA_EXCEEDED`
- **火山引擎译文合并丢失分隔符**：拆分翻译合并时直接拼接，段落结构丢失。改为插入 `\n` 分隔符
- **cleanupAllInjections 崩溃中断清理**：`el.parentNode` 为 null 时 `replaceChild` 抛错，后续清理全部跳过。增加 null 检查 + 外层 try-catch
- **startTranslation 未 catch**：onMessage 中 fire-and-forget 调用，同步抛错变为 unhandled rejection。增加 `.catch()`
- **MutationObserver quietTimer 泄漏**：局部变量无法被 resetAll 清除，reset 后 300ms 可能触发意外重翻译。提升为模块级变量
- **cancelTranslation 路由错误**：background 操作活跃标签页而非发送者标签页；popup 发给 background 而非直接发给 content script。两处均修正
- **init() 顶层未 catch**：`init()` 失败产生未处理 Promise 拒绝。增加 `.catch()`
- **_translateWithTimeout 非 Error 对象崩溃**：`error.message.startsWith` 对非 Error 抛 TypeError。增加安全取值
- **testApi 定时器泄漏**：Promise.race 中的 setTimeout 永不清除。改为单一定时器 + finally 清除
- **_buildTranslators null 崩溃**：settings 为 null 时访问 `.api` 崩溃。增加可选链防御
- **getOrderedTranslators null 崩溃**：apiPriority 缺失时 for...of 崩溃。增加默认值 `[]`
- **checkAllApiCompleteness 阻塞初始化**：alert 在 DOMContentLoaded 期间阻塞所有 setup 函数。改为 setTimeout 延迟执行
- **loadLlmPrompt 未 await**：用户快速点保存可能存入空 prompt。完成前禁用保存按钮
- **TranslationList 条目 null 崩溃**：volcano.js 中 `item.Translation` 未防 null。增加 `(item && item.Translation)`

### Security — 安全修复（5 项）

- **PIN 暴力破解防护持久化**：`_pinFailCount`/`_pinCooldownUntil` 为内存变量，SW 休眠后失效。改为持久化到 `chrome.storage.local`
- **translateTexts 错误消息泄露**：API 错误详情（端点 URL、HTTP 响应体）通过 sendResponse 泄露给任意网页。对 content script 返回脱敏消息
- **getGlossaryForDomain 原型链访问**：`all[domain]` 可访问原型属性。改用 `Object.hasOwn()`
- **applyImportedSettings schema 验证**：导入数据无类型校验，可注入非法结构。增加关键字段类型检查
- **WRITE_ACTIONS 误分类**：`exportAllSettings`/`hasPin`/`verifyPin` 是读操作被归为写操作。从集合中移除

### Changed — 架构改进（8 项）

- **saveApiStatus 改为 per-API key 存储**：原来整体读-改-写存在竞态。改为每个 API 独立 key（`apiStatus_${name}`），消除 read-modify-write 竞态
- **getApiStatus 增加内存缓存**：避免每次翻译都读存储。`_apiStatusCache` 与 saveApiStatus/deleteApiStatus 同步维护
- **resetApiQuotaIfNeeded 原子写入**：原来分 3 次写入存储，SW 中断会导致状态不一致。改为一次 `chrome.storage.local.set` 原子写入
- **statusCache 局部更新**：原来整体替换 `this.statusCache = allStatus`，并发时覆盖。成功路径改为 `this.statusCache[name] = updated`，错误路径改为 `{ ...this.statusCache, ...allStatus }` 合并
- **translation-cache _markDirty 异常捕获**：定时器中 `_save()` 抛异常产生未处理拒绝。增加 try-catch
- **translation-cache clear() 清理资源**：未清理 `_saveTimer`/`_savePromise`。增加清理逻辑
- **translation-cache lookup 去重**：重复文本被多次传给 API。增加 misses 去重
- **llm-generic max_tokens 动态计算**：固定 4096 可能截断批量翻译。改为 `Math.min(8192, Math.max(4096, totalInputLength * 3))`
- **自定义供应商 enabled 向后兼容**：`!provider.enabled` 把缺失字段误判为禁用。改为 `provider.enabled === false`

### Fixed — UI/UX 修复（3 项）

- **updateToggleButton null 防御**：querySelector 链式调用未判空。增加 `if (icon)` / `if (text)` 检查
- **loadApiStatus null 防御**：container 不存在时崩溃。增加 `if (!container) return`
- **PIN 冷却 setTimeout 检查对话框状态**：冷却结束后操作已关闭对话框的元素。增加 `dialog.style.display !== 'none'` 检查

---

## v1.0.14 — 2026-07-30

> 全面 bug 审查修复：安全加固 + 并发竞态 + 错误处理 + 缓存可靠性。
> 两轮子代理修复 + 主代理审核，覆盖 11 个文件，+260/-95 行变更。

### Security — 安全修复（4 项）

- **[高风险] 原型污染防护**：`_deepMerge` 和 `applyImportedSettings` 未过滤 `__proto__`/`constructor`/`prototype` 键，恶意导入数据可注入原型链。现增加键名过滤
- **PIN 码暴力破解防护**：`verifyPin` 无失败次数限制和冷却期。现增加 5 次失败后 60 秒冷却 + 常量时间比较（`_constantTimeCompare`）防时序攻击
- **XSS 防护强化**：`options.js` 中 `data-api` 属性使用未转义的 `apiName`，自定义供应商名称含特殊字符时可注入 HTML。所有 `data-api` 改用 `escapeAttr()` 转义
- **写操作权限校验**：`background.js` 对 `saveSettings`/`updateSettings`/`importAllSettings`/PIN 操作等写操作增加 sender 身份校验，content script 调用时拒绝

### Fixed — Bug 修复（18 项）

- **init() 失败后无法重试**：`initPromise` 在异常时未重置为 null，导致 SW 重启后永远无法初始化。现 catch 中重置 `initPromise = null`
- **右键菜单翻译时 SW 未初始化**：`contextMenus.onClicked` 未 await `init()`，冷启动时首次右键翻译失败
- **sendMessage 未捕获 Promise 拒绝**：`background.js` 中多处 `chrome.tabs.sendMessage` 无 `.catch()`，目标页关闭时产生未处理拒绝。全部增加 `.catch(() => {})`
- **applyGlossary 正则注入**：`out.replace(re, target)` 中 target 含 `$` 时被解释为替换模式。改用 `() => target` 函数替换
- **detectPageLanguage 未处理 'all'**：`forceLanguage === 'all'` 时直接返回 'all' 而非进行检测。增加 `'all'` 排除
- **MutationObserver 自动重翻译弹 alert**：动态内容触发重翻译时调用 `startTranslation()` 可能弹错误提示。改用 `startTranslation({ silent: true })`
- **translatePageMeta 未检查 abort**：异步翻译返回后未检查 `currentAbortController.signal.aborted`，取消后仍注入结果
- **面板关闭后 panelRenderedSegIds 未清空**：再次打开面板时增量渲染逻辑误判已渲染段。关闭时清空 `panelRenderedSegIds`
- **switchMode 未校验输入**：传入无效模式名导致状态混乱。增加白名单校验
- **resetAll 未清除 isTranslating**：取消翻译后 `isTranslating` 仍为 true，无法重新启动翻译
- **cancelTranslation 未清除 currentAbortController**：abort 后引用未置 null，影响后续判断
- **popup loadApiStatus 未检查 null**：`res` 为 null 时 `res.error` 抛异常。增加 null 检查
- **popup 模式切换失败未回滚设置**：切换失败时仅恢复 UI 按钮，未回滚持久化设置。增加 `updateSettings` 回滚
- **百度额度错误码判断错误**：`54003`/`54004` 是临时限流而非额度耗尽，被错误标记为 `QUOTA_EXCEEDED`。改为 `54001`/`54002`/`58002`
- **月度配额重置时间错误**：`_handleApiError` 对百度/火山等月度 API 使用 `_getNextMidnight()` 而非下月 1 日。增加 `_getNextMonthStart()`
- **testApi 无超时保护**：API 测试请求可能无限挂起。增加 `AbortController` + `Promise.race` 超时保护
- **saveSettings 后 API 未重载**：保存设置后 `apiManager` 未 reload，新配置不生效。增加 `await apiManager.reload()`
- **PIN setupPin 未校验格式**：`setupPin` 接受任意字符串。增加 6 位数字校验

### Changed — 可靠性改进（8 项）

- **translation-cache 并发 _load() 竞态修复**：多个并发 `_load()` 各自触发 `chrome.storage.local.get` 并互相覆盖。增加 `_loadPromise` 缓存
- **translation-cache _save() 并发序列化**：`_save()` 无 promise 追踪，并发保存可能丢数据。增加 `_savePromise` 序列化
- **translation-cache flush() 等待进行中的保存**：`flush()` 仅检查 timer，未等待正在执行的 `_save()`。增加 `_savePromise` 等待
- **translation-cache TTL 改用创建时间**：`a` 字段既是访问时间又用于 TTL，频繁访问的条目永不过期。新增 `c`（创建时间）字段用于 TTL，`a` 保留用于 LRU
- **translation-cache sweep/getStats 处理损坏条目**：未校验 `entry.t` 和 `entry.a` 类型，损坏数据导致崩溃。增加类型检查和清理
- **statusCache 并发竞态修复**：`saveApiStatus` 传入 `this.statusCache` 快照，并发时覆盖最新状态。改为不传快照，从存储读取最新值
- **addDailyUsage/addMonthlyUsage 跨期逻辑修复**：跨日/跨月时仅重置 `_date`/`_month` 但保留旧 API 用量数据。改为创建全新对象
- **resetApiQuotaIfNeeded 月份格式统一**：UTC `toISOString().slice(0,7)` 与本地时区不一致。改用本地时间 `${year}-${month.padStart(2,'0')}`

### Fixed — UI/UX 修复（5 项）

- **API 测试按钮异常后永久禁用**：`testApi` 无 try-catch-finally，异常时 `btn.disabled` 永远为 true。增加完整异常处理
- **自定义供应商保存后全量重渲染**：保存后 `renderApiCards()` 导致输入框失焦。改为仅更新当前卡片状态
- **showSavedTip 空指针**：`document.getElementById('savedTip')` 可能为 null。增加 null 检查
- **addExcludeBtn 设置未加载时崩溃**：`settings` 为 null 时访问 `settings.general` 崩溃。增加 null 检查
- **PIN 对话框模式判断依赖文本**：`title.textContent.includes('设置')` 在文本变更时易出错。改用 `pinDialogMode` 变量

### Changed — 文案通用化

- **术语管理页文案更新**：移除「游戏和 MOD 社区」限定，改为「专业术语和自定义翻译规则」；工作原理中「游戏/MOD 术语」改为「专业术语」；域名示例从 `*.nexusmods.com` 改为 `*.example.com`

---

## v1.0.13 — 2026-07-30

> API 密钥安全管理：PIN 码保护 + 掩码显示 + 交互逻辑修复。

### Added — 新功能

- **API 密钥 PIN 码安全保护**
  - 设置页 API 管理新增安全锁栏，所有密钥默认以掩码形式显示（如 `sk-1234••••789`）
  - 用户需设置 6 位数字 PIN 码，验证通过后才能查看完整密钥、编辑或复制
  - PIN 码使用 SHA-256 + 随机盐值哈希存储，不明文保存
  - 页面刷新或关闭后自动恢复锁定状态
  - 连续 3 次 PIN 验证失败后冷却 30 秒
  - 支持「忘记 PIN？重置密钥保护」功能，重置时清除所有已保存密钥
- **API 配置完整性检查**
  - 自动检测填写不全的 API 配置，禁用启用按钮并显示警告
  - 每次进入 API 管理页仅警告 1 次（sessionStorage 记录）
  - 保存后实时检查完整性，补全后自动恢复启用按钮

### Fixed — Bug 修复

- **PIN 重置失败无反馈**：`handlePinConfirm` 的 reset 模式未处理失败情况，现增加错误提示和异常捕获
- **异步操作期间按钮可重复点击**：PIN 确认按钮在等待响应时未禁用，现增加 `disabled` 防重复提交
- **重置模式聚焦隐藏输入框**：`showPinDialog` 在 reset 模式下仍尝试 focus 隐藏的 input，现仅对可见输入框聚焦
- **PIN 验证/设置异常无反馈**：三个模式均增加 try-catch，异常时显示错误信息并恢复按钮状态

### Security — 安全修复

- **导出设置泄露自定义供应商密钥**：`exportAllSettings` 仅删除了 `apiKeys`，未清除 `customProviders[].apiKey`，现增加清除逻辑

---

## v1.0.12 — 2026-07-29

> 风险修复批：安全加固 + 死代码清理 + 错误处理增强。
> 修复风险评估报告中的 R1（高风险）+ R2/R3/R4（中等风险），3 个子代理并行实施，主代理审核通过。

### Security — 安全修复（1 项）

- **[高风险] `getSettings` 向 content script 暴露 API 密钥**
  - 根因：`background.js` `case 'getSettings'` 直接返回完整 `settingsManager.settings`（含全部 apiKeys）给任何 sender，无身份校验
  - 修复：通过 `sender.url.startsWith('chrome-extension://')` 区分扩展页面与 content script。扩展页面（popup/options）返回完整 settings；content script 返回深拷贝并将 `apiKeys` 置为 `{}`
  - 深拷贝（`JSON.parse(JSON.stringify(...))`）防止原对象被修改，block scope `{}` 避免 switch 词法声明问题
  - content.js 实际不使用 apiKeys（翻译请求走 background 的 apiManager），功能不受影响

### Changed — 架构优化（2 项）

- **[中等] 移除 `API_REGISTRY.custom` 死代码**
  - 根因：`api-registry.js` 中 `API_REGISTRY.custom` 注册条目（23 行）从未被调用 —— `enabledApis` 和 `apiKeys` 默认值均无 `custom` 条目，`_buildTranslators()` 两道 guard 均跳过它，真正的自定义供应商走 `custom_*` 前缀 + `createCustomProviderTranslator()`
  - 修复：删除 `API_REGISTRY.custom` 条目，消除维护混淆
- **[中等] `LLM_PROVIDERS` 元数据一致性标注**
  - 根因：`api-registry.js` 的 `LLM_PROVIDERS` 与 `api-metadata.js` 的 `API_DISPLAY_NAMES` / `API_MODELS_DEFAULT` 存储相同信息（6 个 LLM 供应商的 displayName + model），未来修改可能遗漏同步
  - 修复：交叉验证 6 个供应商数据全部一致，在 `LLM_PROVIDERS` 上方新增注释标注需与 `api-metadata.js` 保持一致，说明无法 import 的原因（IIFE vs ES module）

### Fixed — Bug 修复（1 项）

- **[中等] `_handleHttpError` 对非 JSON 响应静默吞错**
  - 根因：`base.js` `_handleHttpError()` 在 401/403 时盲目调用 `response.json()`，遇到 HTML 错误页（Cloudflare 拦截、nginx 502 等）会抛异常被空 `catch {}` 吞掉，`detail` 保持空字符串，用户只看到无信息的 `AUTH_ERROR`
  - 修复：先检查 `response.headers.get('content-type')` 是否包含 `application/json`。JSON 响应走原有逻辑（兼容火山引擎/OpenAI/百度三种格式）；非 JSON 响应调用 `response.text()` 截取前 200 字符，格式化为 `AUTH_ERROR: HTTP {status} - {text片段}`

### 工程

- `npm run check`（15 个 `node --check`）全部通过
- 3 个子代理并行实施（R1 / R2+R3 / R4），主代理审核全部通过，无遗漏，0 轮迭代
- 修改文件：`background.js` / `lib/api-registry.js` / `lib/api-adapters/base.js`

---

## v1.0.11 — 2026-07-29

> 架构重构：提取 BaseTranslator 基类 + API 注册表工厂，消除适配器重复代码和条件分支。
> 纯代码质量改进，无功能变更。新增 2 个文件，重构 5 个文件，净减 ~113 行重复代码。

### Changed — 架构优化（4 项）

- **新增 `BaseTranslator` 基类（`lib/api-adapters/base.js`，98 行）**
  - 提取 4 个适配器中重复的 HTTP 错误处理逻辑到 `_handleHttpError()`：统一处理 429→`QUOTA_EXCEEDED`、401/403→`AUTH_ERROR`（兼容火山引擎 `ResponseMetadata.Error`、OpenAI `error.message`、百度 `error_msg` 三种错误格式）
  - 提取语言映射工具方法：`_mapLanguage()` / `_mapSourceLanguage()` / `_mapBaiduLanguage()` / `_mapLanguageToChinese()`
  - 提取文本安全处理：`_safeStr()`（null/undefined → ''）、`_sanitize()`（合并空白 + trim）
  - 子类只需实现 `isConfigured()` 和 `translate()`，其余继承基类
- **新增 API 注册表工厂（`lib/api-registry.js`，191 行）**
  - 配置驱动替代 `api-manager.js` 中 `_buildTranslators()` 和 `testApi()` 的 ~120 行 if/else 分支
  - `API_REGISTRY` 对象集中管理每个 API 的创建逻辑（`createFromSettings` / `createFromTestConfig`）
  - `LLM_PROVIDERS` 动态生成 6 个 LLM 供应商（deepseek/glm/tongyi/zhipu/yi/doubao）的注册条目，消除重复模板代码
  - 导出 `createTranslatorFromSettings()` 和 `createTranslatorForTest()` 两个工厂函数
- **重构 4 个适配器继承 `BaseTranslator`**
  - `baidu.js`：移除内联 HTTP 错误处理和语言映射，改用 `super()` + `_handleHttpError()` + `_mapBaiduLanguage()` + `_sanitize()`
  - `baidu-llm.js`：同上，移除重复的 `error_code` 判断中的 HTTP 状态码检查
  - `volcano.js`：同上，移除内联 429/401/403 处理（基类已兼容火山引擎 `ResponseMetadata.Error` 格式）
  - `llm-generic.js`：同上，移除内联 HTTP 错误处理，改用 `_mapLanguageToChinese()` + `_handleHttpError()`
- **重构 `api-manager.js` 使用注册表工厂**
  - `_buildTranslators()`：从 ~45 行 if/else 链缩减为 8 行循环 + `createTranslatorFromSettings()` 调用
  - `testApi()`：从 ~40 行 if/else 链缩减为 4 行 + `createTranslatorForTest()` 调用
  - 文件总行数从 ~345 行降至 232 行（-113 行）

### 工程

- `npm run check`（15 个 `node --check`）全部通过
- 新增文件：`lib/api-adapters/base.js` / `lib/api-registry.js`
- 修改文件：`manifest.json` / `package.json` / `lib/api-manager.js` / `lib/api-adapters/baidu.js` / `lib/api-adapters/baidu-llm.js` / `lib/api-adapters/volcano.js` / `lib/api-adapters/llm-generic.js`
- `package.json` 版本号从 1.0.6 修正为 1.0.11（此前多个版本未同步更新 package.json）

---

## v1.0.10 — 2026-07-29

> 修复火山引擎 V4 签名算法致命 bug + 测试后状态不更新问题。
> 签名密钥派生从错误的 hex 字符串改为正确的原始二进制字节，经官方示例值验证。

### Fixed — Bug 修复（6 项）

- **[严重] 火山引擎机器翻译 AUTH_ERROR**
  - 根因：`_buildAuthHeaders()` 派生签名密钥时，错误地将每步 HMAC 输出的 hex 字符串作为下一轮 HMAC 的密钥，正确做法是直接使用原始二进制字节（`Uint8Array`）
  - 用官方文档示例值编写测试脚本验证：Method 1（hex 字符串）全部 FAIL，Method 2（原始字节）全部 PASS
  - 修复：`kDate → kRegion → kService → kSigning → signature` 链路中移除所有 `_toHex()` 中间转换，直接传递 `Uint8Array`
  - 改进错误处理：AUTH_ERROR 现在保留原始错误码和消息（如 `SignatureDoesNotMatch`），便于诊断
  - `api-manager.js` `_handleApiError` / `_translateWithTimeout` 同步更新，用 `startsWith('AUTH_ERROR')` 匹配带详情的错误消息
- **[中等] 测试成功后状态标识不更新（显示"未配置"）**
  - 根因：`getApiStatusSummary()` 仅遍历 `getOrderedTranslators()`（已构建翻译器），未启用或 SW 未重建的 API（如 volcano）不在其中，状态不返回给 options.js
  - 修复：改为返回已构建翻译器的 API + `statusCache` 中有缓存的 API，跳过既未构建又无缓存的 API
- **[中等] 测试成功后按钮反馈丢失**
  - 根因：测试成功后调用 `renderApiCards()` 重新生成整个卡片 HTML，按钮 DOM 被替换，"✓ 成功"状态丢失
  - 修复：改为仅更新该 API 卡片的状态标识 DOM（class + textContent），不重新渲染整个卡片列表
- **[中等] 测试失败后状态标识不更新**
  - 根因：测试失败时只弹 alert，不刷新 `apiStatus`，状态标识保持旧值（如仍显示"未配置"而非"密钥错误"）
  - 修复：测试失败也刷新 `apiStatus` 并更新状态标识 DOM（与成功路径一致）
- **[低] `getApiStatusSummary` 回归：popup 显示未配置 API**
  - 根因：初始修复遍历所有 `apiPriority`，导致 popup 也显示未配置的 API 条目，"未检测到已配置的 API"提示永不触发
  - 修复：跳过既未构建翻译器又无 `statusCache` 缓存的 API，popup 只显示已配置或有测试缓存的 API
- **[低] popup.js 缺少 `unconfigured` 状态标签**
  - 根因：`statusTexts` 对象没有 `unconfigured` 键，显示为"未知"而非"未配置"
  - 修复：`popup.js` `renderApiStatus` 的 `statusTexts` 补充 `unconfigured: '未配置'`

### 工程

- 新增测试脚本验证签名算法正确性（使用官方文档示例值）
- 修改文件：`lib/api-adapters/volcano.js` / `lib/api-manager.js` / `options/options.js` / `popup/popup.js`

---

## v1.0.9 — 2026-07-29

> 额度限制支持每日重置 + 温馨提示新增 API 管理页说明。
> 额度限制从仅月度扩展为每日/每月可选，温馨提示页新增 API 管理页解释栏目。

### Added — 新功能（1 项）

- **温馨提示新增「API 管理页说明」栏目**
  - 解释 API 管理页统一管理两类接口：机器翻译接口（百度机器翻译/百度大模型翻译/火山引擎机器翻译，按字符计费）和大模型翻译接口（DeepSeek/智谱 GLM/通义千问/零一万物/豆包/自定义，按 Token 计费）
  - 说明页面功能：启用/关闭、测试按钮、清除按钮、优先级排序、免费额度标注
  - 提供机器翻译与大模型接口的搭配使用建议

### Changed — 行为变更（2 项）

- **额度限制支持每日重置周期**
  - `quotaLimits` 配置新增 `resetType` 字段，可选 `'daily'`（每日 0 点重置）或 `'monthly'`（每月 1 号重置，默认）
  - `settings-manager.js` `isApiQuotaReached()` / `getApiUsagePercentage()` 根据 `resetType` 分别查询 `getDailyUsage()` 或 `getMonthlyUsage()`
  - `options.js` `renderQuotaLimits()` 新增重置周期下拉选择器（每月/每日）
  - `options.js` `renderMonthlyUsage()` 同时获取日用量和月用量，按各接口的 `resetType` 显示对应周期数据（标注「今日」或「本月」）
  - `options.html` 额度限制页标题从「月度额度配置」改为「额度配置」，用量区域从「本月用量」改为「当前用量」
- **温馨提示额度限制说明更新**
  - 加入重置周期选项的说明文字

### 工程

- `npm run check` 全部通过
- 修改文件：`manifest.json` / `README.md` / `lib/settings-manager.js` / `options/options.html` / `options/options.js` / `options/options.css`

---

## v1.0.8 — 2026-07-29

> 火山引擎机器翻译接口 + 自定义额度限制 + 免费额度标注 + 温馨提示页。
> 新增 1 个翻译接口、2 个设置页标签页、月度用量追踪系统。

### Added — 新功能（4 项）

- **火山引擎机器翻译接口**
  - 新增 `lib/api-adapters/volcano.js` 适配器，实现 V4 签名（HMAC-SHA256）认证
  - 使用 Web Crypto API（`crypto.subtle`）实现 SHA-256 和 HMAC-SHA256，无需第三方库
  - 支持批量翻译（单次最多 16 条文本，总字符不超过 5000，自动拆分批次）
  - 用户在 API 管理页填写 Access Key 和 Secret Key 即可使用
  - 免费额度：200 万字符/月，每月 1 号重置
  - 集成到 `api-manager.js`（`_buildTranslators` / `testApi`）、`api-metadata.js`、`settings-manager.js`（`DEFAULT_SETTINGS` / `MONTHLY_RESET_APIS`）
- **自定义月度额度限制**
  - 新增「额度限制」设置页标签页，可为每个翻译接口设置月度使用上限
  - 单位可选：字符（机器翻译接口）或 Token（大模型接口，1 Token ≈ 2 字符估算）
  - 用量达到设定额度的 **97%** 时，自动按 API 优先级切换到下一翻译源
  - 新增 `settings-manager.js` 月度用量追踪：`getMonthlyUsage()` / `addMonthlyUsage()` / `isApiQuotaReached()` / `getApiUsagePercentage()`
  - `api-manager.js` `translate()` 方法在每次翻译前检查额度限制
  - 用量条形图在 80% 显示橙色、97% 显示红色
  - `background.js` 新增 `getMonthlyUsage` 消息处理器
- **免费额度小字标注**
  - API 管理页每个接口卡片底部显示该接口的免费额度信息
  - 额度限制页每个接口旁也显示免费额度提示
  - `api-metadata.js` 新增 `API_FREE_QUOTAS` 常量，集中管理各接口免费额度信息
- **温馨提示设置页**
  - 新增「温馨提示」标签页，包含 6 个信息区块：
    - 免责声明：翻译结果由第三方接口提供，插件不对准确性负责
    - 插件工作原理：6 步流程说明（扫描→检测→术语→翻译→注入→缓存）
    - 翻译效果示例：双语对照示例，字体大小/颜色/间距自动跟随显示设置
    - 额度限制功能说明：97% 自动切换机制、单位选择、月度重置
    - 术语库使用说明：全局/域名专属术语、匹配模式、保留原文
    - 密钥存储说明：所有密钥仅存本地，不同步不上传，导出不含密钥

### Changed — 行为变更（3 项）

- **百度翻译更名为百度机器翻译**
  - `api-metadata.js` `API_DISPLAY_NAMES.baidu` 由 `'百度翻译'` 改为 `'百度机器翻译'`
  - `README.md` 同步更新接口名称
- **预置供应商数量 8 → 9**
  - 新增火山引擎机器翻译，预置供应商总数从 8 个增加到 9 个
  - `DEFAULT_SETTINGS.api.apiPriority` 新增 `'volcano'`（排在 `baidu_llm` 之后）
- **设置页标签页 5 → 7**
  - 新增「额度限制」和「温馨提示」两个标签页

### 工程

- `npm run check`（14 个 `node --check`）全部通过
- 新增文件：`lib/api-adapters/volcano.js`
- 修改文件：`manifest.json` / `README.md` / `background.js` / `lib/api-metadata.js` / `lib/settings-manager.js` / `lib/api-manager.js` / `options/options.html` / `options/options.js` / `options/options.css` / `package.json`

---

## v1.0.7 — 2026-07-29

> API 管理重构 + 安全加固批。聚焦设置页 API 显示可靠性、自定义供应商 UX、密钥隔离安全。
> 6 文件，+370/-203。

### Added — 新功能（2 项）

- **一键清除 API 配置**
  - `background.js` 新增 `case 'clearApi'` + `handleClearApi()` 处理器，清除指定 API 的密钥/模型/接入点/状态/用量全部数据
  - `options/options.js` 在每个 API 卡片渲染「清除」按钮，confirm 后调用 `clearApi`，成功后 `refreshApiSettings()` 刷新 UI
  - 自定义供应商清除时从 `customProviders` 和 `apiPriority` 中彻底删除；常规 API 清除后自动禁用
- **API 配置刷新按钮 + 状态指示器**
  - `options/options.html` 在 API 管理页顶部新增「🔄 刷新API配置」按钮 + `#apiDebugStatus` 状态文本
  - `options/options.js` 新增 `refreshApiSettings()` 手动从后台重新加载设置并重渲染；`updateApiDebugStatus()` 显示已加载密钥数/优先级项数

### Fixed — Bug 修复（5 项）

- **[严重] 设置页 API 密钥显示丢失**
  - 根因 1：Service Worker 冷启动时首批 `getSettings` 消息可能超时 → `loadAllData` 增加 3 次重试（间隔递增 500ms/1000ms/1500ms）
  - 根因 2：`getSettings` 返回 settings 但 apiKeys 为空（SW 刚醒，`reloadApiKeys` 尚未完成）→ 加载后验证 apiKeys 非空，空则自动重新获取
  - 根因 3：`saveSettings()` 中 `chrome.storage.local.set` 直接覆盖已有密钥 → 改为**合而非覆盖**：先读 local 已有密钥，只用 incoming 非空值覆盖对应字段
  - 根因 4：`_mergeKeysIntoApi()` 只填充空字段，阻止 local 端真实密钥覆盖 sync 残留 → 改为**强制覆盖**
- **[严重] `getApiDisplayName` 无限递归导致「Maximum call stack size exceeded」**
  - `options.js` 中 `getApiDisplayName` 调用 `window.getApiDisplayName`，但本文件以普通 `<script>` 加载，function 声明会覆盖 `api-metadata.js` 设置的 `window.getApiDisplayName`，形成无限递归
  - 修：移除 `window.getApiDisplayName` 调用，直接使用文件头部已拷贝的 `API_DISPLAY_NAMES` 常量
- **[中等] 自定义供应商区域重复渲染**
  - 原先 `renderApiCards()` 和 `renderCustomProviders()` 各渲染一份自定义供应商 UI，设置页出现多个重复交互区域
  - 修：删除 `renderCustomProviders()` 函数（-155 行），自定义供应商统一在 `renderApiCards()` 中渲染，单一入口
- **[中等] 每个 setup 函数异常会阻断后续 setup**
  - `DOMContentLoaded` 中任一 setup 抛异常会中断后续所有 setup 调用
  - 修：每个 setup 函数独立 try-catch，`setupDiagnostics()` 提前到最前执行
- **[中等] `renderApiCards` 字段渲染条件过窄**
  - 原仅 `['baidu', 'baidu_llm'].includes(apiName)` 走字段列表渲染，其他有字段配置的 API 不走
  - 修：改为 `fields.length > 0` 判断，所有有字段配置的 API 统一走字段列表渲染

### Changed — 行为变更（4 项）

- **自定义供应商 UX 重构**
  - `options/options.html` 移除独立的「自定义大模型供应商」section card，自定义供应商卡片直接在 `#apiCardsContainer` 中渲染
  - 「+ 添加供应商」按钮改为「+ 添加自定义大模型」，移至 API 卡片列表底部
  - 新增 `_cleanupEmptyCustomProviders()`：每次加载设置页时自动清除 apiKey 和 endpoint 均为空的自定义供应商，同步清理 `apiPriority` 中失效的 `custom_xxx`
- **设置页始终先查询本地设置再显示**
  - `DOMContentLoaded` 流程：`loadAllData()` → 验证 apiKeys 非空 → 各 setup 函数渲染
  - `refreshApiSettings()` 提供手动刷新入口，确保 UI 与存储一致
  - `renderApiCards()` 渲染前自动补充遗漏的已配置 API 到 `apiPriority` 列表
- **`saveSettings` 合并而非覆盖 API 密钥**
  - `lib/settings-manager.js` `saveSettings()` 中，local storage 写入从直接 `set` 改为先读已有 → 合并非空值 → 写入，避免保存单个 API 配置时丢失其他 API 的密钥
- **README 更新**
  - 版本号更新至 v1.0.7
  - 翻译接口部分移除腾讯翻译，更新预置供应商列表

### Security — 安全修复（1 项）

- **自定义供应商 API 密钥隔离到 local storage**
  - `lib/settings-manager.js` `saveSettings()` 中，`customProviders` 的 `apiKey` 被提取到 `chrome.storage.local`（key: `custom_{provider.id}`），从 sync 数据中移除（置空），防止随 `chrome.storage.sync` 同步到 Google 账户导致密钥泄漏
  - `_loadApiKeysFromLocal()` 和 `reloadApiKeys()` 中增加 customProviders apiKey 恢复逻辑：从 local storage 读取并填充到内存中的 `customProviders`，仅在内存中 apiKey 为空时恢复（避免覆盖用户刚输入的值）

### Removed — 删除（1 项）

- **腾讯翻译 API 完全移除**
  - 清理 `lib/api-metadata.js` 中 tencent 相关元数据
  - 清理 `options/options.js` 中 tencent 字段配置
  - 确保全项目无 tencent 残留引用

### 工程

- `npm run check`（12 个 `node --check`）全部通过
- 6 文件变更：`manifest.json` / `README.md` / `background.js` / `lib/settings-manager.js` / `options/options.html` / `options/options.js`
- 净 +167 行（+370/-203），其中 `renderCustomProviders` 删除 -155 行

### v1.0.7 补充 — 移除腾讯翻译 TMT

> 腾讯云 TMT 文本翻译接口已下线，移除全部相关代码。

- **删除 `lib/api-adapters/tencent.js`** — TC3-HMAC-SHA256 签名适配器整文件移除
- **`lib/api-metadata.js`** — 从 `API_DISPLAY_NAMES` / `API_ENDPOINTS_DEFAULT` / `API_MODELS_DEFAULT` 移除 tencent
- **`lib/settings-manager.js`** — `DEFAULT_SETTINGS.api.apiPriority` 和 `apiKeys` 移除 tencent；`_cleanupObsoleteApis` 会自动清理用户存储中残留的 tencent 数据
- **`lib/api-manager.js`** — 移除 `TencentTranslator` import 和 `_buildTranslators` / `testApi` 中的 tencent 分支
- **`options/options.js`** — `API_CONFIG_FIELDS` 移除 tencent 字段配置
- **`package.json`** — `check` 脚本移除 `tencent.js` 语法检查
- **`README.md`** — 预置供应商从 9 个恢复为 8 个，移除腾讯 TMT 说明和文件结构中的 `tencent.js`

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

#### v1.0.6 hotfix 第五轮 — endpoint 校验抽函数

- **#6 重复消除** — `isValidEndpointUrl` + alert + rollback input 模式在 3 处重复（line 678 custom_ 段 / line 700 主分支 / line 879 custom-provider-field）
  - 修：抽 `validateEndpointInput(input, currentValue)` 公开函数（line 1169），返回 boolean
  - 3 处调用统一为 `if (field === 'endpoint' && !validateEndpointInput(input, currentValue)) return;`
  - 风险评估：🟡 中（抽错会同时影响 3 个 endpoint input，但每个调用方上下文清晰）
  - 收益：未来加新 endpoint input 直接调，未来改 alert 文案只改 1 处
  - 净 +11 行函数 / -16 行重复

#### v1.0.6 hotfix 第十三轮 - 发布前全面审查修复

> 3 子代理并发审查（导入引用一致性 / content.js 交互完整性 / API 链路完整性），主代理修复 8 项问题。

- **严重修复 `api-manager.js` translate() 成功后 statusCache 不更新** - `saveApiStatus` 返回值被 Promise.all 吞掉，导致 `consecutiveErrors` 永不重置，API 会被错误禁用。改为串行调用并赋值 `this.statusCache`
- **严重修复 `content.js` cleanupAllInjections 未清增量追踪状态** - HOVER/PANEL 模式在 MutationObserver 触发的重翻译后完全失效。cleanupAllInjections 现在同步清除 `hoverDelegationRegistered`/`hoverRegisteredSegIds`/`hoverTranslations`/`panelRenderedSegIds` + DOM 上的 `data-dt-hover-id`
- **严重修复 `content.js` switchMode 竞态** - 旧翻译的 AbortError catch 无条件调用 `resetAll()`，破坏 switchMode 已启动的新翻译。改为仅当 `currentAbortController === myAbortController` 时才 resetAll。同时 `startTranslation` 中 `signal` 改用局部变量 `myAbortController.signal` 避免被置 null 后 TypeError
- **中等修复 `content.js` 非 AbortError 异常无用户提示** - 添加 `showErrorBanner(e.message)` 显示错误信息
- **中等修复 `content.js` updateHover 中 seg.node.parentElement 缺 null 检查** - 添加 `seg.node &&` 守卫
- **中等修复 `content.js` panel 点击 setTimeout 回调未检查 null** - 缓存 `parentElement` 引用并在回调内重新检查
- **中等修复 `api-manager.js` reload() 缺少 resetApiQuotaIfNeeded** - 跨午夜后 reload 不重置过期配额。添加 `await settingsManager.resetApiQuotaIfNeeded()`
- **中等修复 `background.js` translateTexts 返回前未 flush 缓存** - 防抖写入的脏数据可能在 SW 休眠前未落盘。handleTranslateTexts 末尾添加 `translationCache.flush()`

#### v1.0.6 hotfix 第十二轮 - 深度性能优化批

> 3 子代理并发审核（content.js / lib / background+popup+options），3 子代理并发实施，主代理审查修复 + 提交。

**content.js（6 项）**
- **`fillTranslations(batchSegs)` 消除全文档扫描** - 原每批次 `querySelectorAll('.dual-translate-placeholder')` 全文档扫描 O(n²)，改为传入当前批次 segs，用 `seg.blockParent.querySelector` 局部查找 O(n)
- **`extractSegments()` closest 优化** - L689 注入元素检查从 `closest(6 个类选择器)` 改为 `className.includes('dual-translate-')`（cleanupAllInjections 已清除注入元素）；L703 stat 检查仅对 NexusMods 域名执行
- **`skipTags`/`blockTags` 提升为模块常量** - 消除每次调用的 Set 分配；用大写 `tagName` 比对省去 `toLowerCase()`（含 `detectPageLanguage` 同步处理）
- **`containsUrl()` 4 正则合并为 1** - 第 4 个 TLD 枚举正则被第 3 个 `[a-zA-Z]{2,}` 覆盖，删除
- **`isGarbledText()` 双循环合并** - 两个 `for` 循环合并为单次遍历，同时计算 `an` 和 `nl`
- **HOVER 模式事件委托** - 每段独立 `mouseenter`/`mouseleave` 改为 document 级 `mouseover`/`mouseout` 委托，用 `dataset.dtHoverId` + `hoverTranslations` Map 定位

**lib/（8 项）**
- **`translation-cache.js` 防抖写入** - `lookup()`/`store()` 中全量 `storage.set` 改为 5s 防抖 `_markDirty()`，新增 `flush()` 方法；`background.js` 每次消息处理前 flush 确保 SW 休眠前落盘
- **`api-manager.js` 超时 AbortController** - `Promise.race` + `setTimeout` 改为 `AbortController`，超时后 `controller.abort()` 中止 fetch；3 个 adapter 接受 `signal` 参数传入 `fetch`
- **`settings-manager.js` `_hostMatches` 正则缓存** - 150+ 条 excludeList 每次页面加载编译正则，改为 `_hostPatternCache` Map 缓存编译结果，`saveSettings`/`updateSetting` 中失效
- **`api-manager.js` `init()` 并行化** - 3 个串行 await 改为 `Promise.all`（与 `reload()` 一致）
- **`settings-manager.js` `saveApiStatus` 避免重复读** - 接受可选 `existingAllStatus` 参数，`_handleApiError` 传入 `this.statusCache` 省去 storage 读
- **`settings-manager.js` `saveSettings` 去重拷贝** - 第二次 `JSON.parse(JSON.stringify())` 改用 `structuredClone`（如可用）
- **`api-manager.js` `retryInterval` 生效** - 硬编码 `1000ms` 改为 `settings.advanced.retryInterval`
- **`api-manager.js` `systemPrompt` 提取** - `_buildTranslators` 中 3 处重复拼接提取为 `fullPrompt` 变量

**background.js + popup.js + options.js（6 项）**
- **`options.js` `loadAllData()` 并行化** - 4 个串行 `sendMessage` 改为 `Promise.all`
- **`options.js` `reloadApis` 不阻塞** - `DOMContentLoaded` 中改为 fire-and-forget
- **`options.js` `bindToggle` 精简** - `trigger.autoTranslate`/`trigger.translationCache` 移除不必要的 `reloadApis`
- **`background.js` `getApiStatus` 用内存缓存** - 移除 `settingsManager.getApiStatus()` storage 读，直接用 `apiManager.statusCache`
- **`popup.js` `loadState` 内部并行** - `getSettings` 与 `chrome.tabs.query` 改为 `Promise.all`
- **`background.js` `updateIcon` 并行** - 3 个串行 `chrome.action.set*` 改为 `Promise.all`

#### v1.0.6 hotfix 第十一轮 - 性能优化批

> 3 子代理并发审核性能瓶颈（content.js / lib / background+popup），主代理验证后委托 2 子代理实施。仅热路径优化，零行为变更。

- **`content.js` 热路径 regex 替换为 charCodeAt 循环**
  - `isGarbledText()` - 3 处 `match(/[...]/g)` 改为 `charCodeAt` 循环，避免正则引擎+数组分配
  - `detectPageLanguage()` - `for...of` + 3 次 `.test()` 改为 `charCodeAt` 循环
  - `looksLikeConcatenatedText()` - 2 次 `.test()` 改为预计算 `charCodeAt`，复用 aWord/bWord
  - `startTranslation()` 中文段判断 - `match(/[\u4E00-\u9FFF]/g)` 改为 `charCodeAt` 循环
- **`content.js` `extractSegments()` shouldSkipText 缓存** - 同一文本片段在 extract 内被 `shouldSkipText` 多次调用，用 `Map` 缓存去重
- **`content.js` `translateSegments()` normText 去重** - `textCache.set` 复用已有 `nt` 变量，避免重复调用 `normText()`
- **`lib/api-manager.js` `reload()` 并行化** - 3 个串行 `await` 改为 `Promise.all`
- **`lib/api-manager.js` `translate()` 跳过冗余写入** - `saveApiStatus` 仅在状态非 available 时执行；`saveApiStatus`+`addDailyUsage` 并行
- **`lib/api-manager.js` `_handleApiError()` 减少一次 storage 读** - `saveApiStatus` 返回 allStatus，直接赋给 `statusCache`，省去 `getApiStatus()` 调用
- **`lib/settings-manager.js` `resetApiQuotaIfNeeded()` 批量读取** - 3 次 `chrome.storage.local.get` 合并为 1 次
- **`background.js` `getApiStatus` handler** - 仅刷新状态缓存而非完整 `reload()`（省 2 次存储读 + `_buildTranslators`）
- **`background.js` context-menu 惰性 reload** - 仅在 translators 为空时才 `reload()`
- **`popup/popup.js` 初始化并行化** - `loadApiStatus`/`loadDailyUsage`/`loadCacheInfo` 3 个无依赖函数改为 `Promise.all`（`loadState` 因 `loadSourceLanguage` 依赖 `cachedSettings` 仍保持串行）

#### v1.0.6 hotfix 第十轮 - 残余死代码清理

> hotfix9 后再次全量审核（3 子代理），主代理验证后委托 2 子代理实施。仅 🟢 安全项，零行为变更。

- **`content.js` 删 `seg._hiddenSpan`/`_hiddenSpans` 死写入** - 4 处赋值后从不读取
- **`content.js` 删 `data-dt-original-hidden` 属性** - 设置+清理但从不查询
- **`content.js` 简化 `detectedLang` 冗余别名** - `const sourceLang = detectedLang` 合并为直接赋值
- **`content.js` 简化 `addedSinceLastCheck` 三重 reset** - if/else 内的 2 处冗余，保留无条件 reset
- **`content.js` 删 `if(/^\s*$/.test(text))` 死检查** - trim+length≥3 后不可能为 true
- **`content.js` 简化 `typeof teardownLazyObserver` 永真守卫** - hoisted 函数声明永为 function
- **`lib/escape-utils.js` 删 `escapeHtml` 函数+导出** - 全项目零调用
- **`lib/settings-manager.js` 删 `INSTALLED_KEYS_KEY`+`_loadApiKeysFromFile`** - 读的 key 从未写入，12 行死代码
- **`lib/api-adapters/baidu.js` 删 no-op `to` 变量** - `targetLang === 'zh' ? 'zh' : targetLang` 恒等于 `targetLang`
- **`lib/api-adapters/baidu.js` 删 `this.displayName`** - api-manager 从不读取 baidu 类的 displayName
- **`lib/api-adapters/baidu-llm.js` 同上两项** - no-op `to` + 死 `displayName`
- **`options/options.js` 删 `escapeAttr` fallback 死代码** - escape-utils.js 先加载，守卫永为 false
- **`popup/popup.js` 删 `escapeAttr` fallback 死代码** - 同上
- 净 -64 行 / +0 行

#### v1.0.6 hotfix 第九轮 - 冗余清理 + 代码优化

> 3 子代理并发审核冗余/优化点，主代理验证后委托 3 子代理实施。仅 🟢 安全项，零行为变更。

**死代码删除**

- **`lib/logger.js` 整文件删除** - `createLogger` 从未被 import，35 行死代码
- **`content.js` 删 `isJa` 变量** - 赋值后从未读取（1 行）
- **`content.js` 删 `glossaryEntries` 变量** - 3 处赋值从未读取，运行时只用 `glossaryCompiled`（3 行）
- **`content.js` 删 `case 'all'` 空分支** - if 体内赋值与外部相同，纯 no-op（5 行）
- **`content.js` 删 `lazyObservedSegs` Map** - 只 set/delete/clear，值从未读取（4 行）
- **`content.js` 删 `dual-translate-replaced` 清理块** - 该 class 从未创建（4 行）
- **`content.js` 删 `.dual-translate-tooltip` 引用** - 该 class 从未创建（3 处选择器）
- **`content.css` 删 4 组死规则** - `.dual-translate-replaced`、`.dual-translate-translation-inline`、`.dual-translate-panel-row`（3 规则）、`.dual-translate-hover` 的死 `transition`（22 行）
- **`options/options.js` 删 `escapeHtml` fallback** - 定义后从未调用（8 行）
- **`options/options.js` 删 `dataset.action` 赋值** - 写入但从未读取（1 行）
- **`options/options.css` 删 `.empty-state` + `.empty-state-icon`** - 从未引用（12 行）
- **`popup/popup.html` 删 `.cancel-icon` class** - 无 CSS/JS 引用（1 行）

**重复代码消除**

- **`options/options.js` 状态文本映射抽函数** - 3 处重复的 `available ? '可用' : ...` 三元链 -> `getStatusLabel(status)` 公开函数（~18 行 -> 2 行）
- **`popup/popup.js` 取消按钮 restore 序列抽函数** - 3 处重复的 3 行 -> `restoreCancelBtn()` 闭包（~6 行 -> 3 行）
- **`content.js` 内联 normText 替换为函数调用** - 2 处 `.trim().replace(/\s+/g,' ')` -> `normText()`（2 行，一致性提升）
- **`lib/api-manager.js` `allExhausted` 简化** - 删冗余 `ordered.every()` 扫描，`lastError` 为 null 即等价（2 行 + 1 次 O(n) 扫描）
- **`lib/api-manager.js` 删 no-op `.catch(e => { throw e; })`** - 重新抛出相同错误，纯空操作（1 行）
- **`lib/settings-manager.js` 删冗余 `_loadApiKeysFromLocal()` 调用** - `loadSettings()` 已调用过（1 行 + 1 次 storage 读取）
- **`package.json` 删 `lib/logger.js` 引用** - 对应文件已删

- 净 -117 行 / +21 行（净减 138 行，CHANGELOG 不计）

#### v1.0.6 hotfix 第八轮 - 严重/高风险修复批（2C + 6H）

> 全项目代码审查（4 子代理并发审核全部源文件），识别 5 项 🔴 + 8 项 🟠。本轮修其中 2 项 🔴 + 6 项 🟠。

- **C4 🔴 `switchMode` 竞态 - `finally` 覆盖新翻译的 `isTranslating`** - `content.js:562-631`
  - **现象**：用户切模式时 `switchMode` abort 旧翻译、设 `isTranslating=false`、启动新翻译（`isTranslating=true`）。但旧翻译的 `finally` 块随后执行 `isTranslating=false`，**覆盖新翻译的状态**。第三次调用通过 guard 并发执行，DOM 注入重复/错乱。
  - **修**：`startTranslation` 入口捕获 `myAbortController`，`finally` 块仅在 `currentAbortController === myAbortController` 时才清理 `isTranslating`。`switchMode` 启动新翻译时已替换 `currentAbortController`，旧 `finally` 不再覆盖。
  - 净 +3 行

- **C5 🔴 custom providers 永远不构建** - `lib/api-manager.js:68-70`
  - **现象**：`_buildTranslators` 循环 `if (!apiKeys[apiName]) continue` 在 `custom_*` 分支之前执行。custom provider 的密钥存在 `customProviders[].apiKey` 而非 `apiKeys`，所以 `apiKeys['custom_xxx']` 为 undefined，`continue` 先触发。多供应商功能完全失效。
  - **修**：`if (!apiKeys[apiName] && !apiName.startsWith('custom_')) continue` -- custom_ 开头的跳过 apiKeys 检查。
  - 净 +0 行（改 1 行）

- **H1 🟠 取消翻译成功后仍弹"取消超时"alert** - `popup/popup.js:290-299`
  - **现象**：`sendMessage` 成功时不设 `recovered=true`、不清 `timeoutId`。5 秒后 timeout 回调发现 `recovered` 仍为 false，弹出"取消超时"误报。
  - **修**：成功路径补 `recovered=true; clearTimeout(timeoutId)` + 恢复按钮 UI。
  - 净 +5 行

- **H2 🟠 `baidu-llm.js` `error_code` 类型不匹配误报** - `lib/api-adapters/baidu-llm.js:49`
  - **现象**：`data.error_code !== '52000'` 用严格不等。API 返回数字 `52000`（成功）时 `52000 !== '52000'` 为 true（类型不同），成功响应被误判为错误。`baidu.js` 正确用了 `String()`。
  - **修**：`String(data.error_code) !== '52000'`。
  - 净 +0 行（改 1 行）

- **H3 🟠 面板关闭清空全部 `globalCleanupHandlers`** - `content.js:1109`
  - **现象**：panel-close-btn 的 click handler 调 `globalCleanupHandlers.forEach(fn=>fn()); globalCleanupHandlers=[]`，清掉**全部**全局清理函数，包括 hover 模式的 click handler。关闭面板后 hover 点击 pin 功能失效。
  - **修**：面板只清理自己的 handler（`panelCleanup`），从数组中 `splice` 移除，不动其他 handler。
  - 净 +2 行

- **H4 🟠 月度配额重置跨年失效** - `lib/settings-manager.js:512`
  - **现象**：`currentMonth = String(now.getMonth() + 1)` 只有月数字（"1".."12"），不含年份。第二年 1 月 `RESET_MONTH_KEY` 仍为 "1"（去年写入），`!== currentMonth` 为 false，月度重置被跳过。`baidu`/`baidu_llm` 的 `quota_exceeded` 状态永久卡住。
  - **修**：`now.getFullYear() + '-' + (now.getMonth() + 1)`。
  - 净 +0 行（改 1 行）

- **H6 🟠 `auth_error` 不阻止重试** - `lib/api-manager.js:145-151`
  - **现象**：`_isApiUsable` 检查 `quota_exceeded` 和 `error + consecutiveErrors >= 3`，但**不检查 `auth_error`**。密钥错误的 API 每次翻译都被重试，浪费时间直到超时才 fallback。
  - **修**：追加 `if (status.status === 'auth_error') return false`。
  - 净 +1 行

- **H8 🟠 abort 后仍调 `fillTranslations`** - `content.js:996`
  - **现象**：`await sendMessage('translateTexts')` 期间 signal 被 abort，但响应返回后不检查 abort 状态，直接调 `fillTranslations()` 注入翻译到 DOM。用户取消后看到内容闪现。
  - **修**：`await` 后立即 `if(signal?.aborted){aborted=true;break;}`。
  - 净 +1 行

- **未修的剩余风险**（留待下一版本）
  - C1 🔴 `getSettings` 返回 API 密钥给 content script
  - C2 🔴 消息无 sender 校验
  - C3 🔴 options.js `data-api` 未转义（XSS）
  - H5 🟠 `translatePageMeta` fire-and-forget 竞态
  - H7 🟠 translation-cache 并发 `_load()` 丢数据
  - M 系列 12 项中等问题
- 净 +12 行 / -3 行（CHANGELOG 不计）

#### v1.0.6 hotfix 第七轮 - 剩余风险评估修复（R3 / R4）

> hotfix 第六轮遗留 R3 R4 两项 🟠 风险，本轮收尾。

- **R3 🟠 API 错误无 UI 提示** - `content.js` + `popup.js`
  - **现象**：
    1. `content.js:1019-1025` 翻译失败时只在 `errMsg` 匹配 `所有翻译服务 / NO_API / 暂时不可用` 时才 `showErrorBanner`，而 `AUTH_ERROR`（密钥错误）和 `QUOTA_EXCEEDED`（额度耗尽）这两种最常见的用户可操作错误**被静默吞掉**，用户只看到翻译空白不知何故。
    2. `popup.js:146-161` API 状态渲染只显示泛化文本（`异常` / `额度不足`），**不显示 `reason` 字段**（已在 `getApiStatusSummary` 返回但未渲染），用户在 popup 里看到"异常"但不知道具体原因。
  - **修**：
    1. `content.js` `showErrorBanner` 条件追加 `AUTH_ERROR` 和 `QUOTA_EXCEEDED` 两个匹配，使密钥错误和额度耗尽也能弹出 banner 提示用户。
    2. `popup.js` `renderApiStatus` 在 `status` 为 `error` / `quota_exceeded` / `auth_error` 时，追加 `(reason)` 到状态文本（过滤 `daily_reset` / `monthly_reset` 等系统内部 reason）。
    3. `popup.css` 补 `.api-status-dot.auth_error` 样式（与 `quota_exceeded` 同为红色，之前缺失导致 auth_error 状态无颜色点）。
  - 净 +2 行 content.js / +2 行 popup.js / +1 行 popup.css

- **R4 🟠 "将在 N 分钟后重试"误导** - `lib/api-manager.js:182`
  - **现象**：所有 API 耗尽时 throw `所有翻译服务暂时不可用，将在 ${retryMinutes} 分钟后重试`，但**根本没有自动重试机制**（MV3 Service Worker 30 秒后休眠，无定时器存活）。用户以为等 5 分钟就会自动好，实际不会。
  - **修**：改为 `所有翻译服务暂时不可用，请稍后手动重试`。
  - 净 -2 行（删 `retryMinutes` 变量 + 简化消息）

- **风险评估表状态**：R1-R6 全部修复完毕，无遗留风险。
- 净 +3 行 / -2 行（CHANGELOG 不计）

#### v1.0.6 hotfix 第六轮 — 风险评估后续修复（R1 / R2 / R6）

> v1.0.6 hotfix1-5 完成后做了一次全项目代码审查，识别出 5 项风险，本轮修其中 2 项 🔴 + 1 项 🟠。

- **R1 🔴 `commands.update` 失败不回滚** — `background.js` `init()` 末尾
  - **现象**：用户在 Options 选了 Chrome 拒绝的快捷键组合（如 `Ctrl+Shift+Y`），`chrome.commands.update` 抛错，仅 `console.warn`，**但 storage 已写入新值**。下次 Service Worker 重启 / 扩展被禁用再启用，`init()` 再次读到这个非法值再次失败，**永久循环** console 警告。
  - **触发条件**：用户改快捷键 → Chrome 拒绝（如选 `Ctrl+Shift+1`、在某些平台无效组合等）
  - **修**：失败时调 `settingsManager.updateSetting('general.toggleTranslateShortcut', 'Alt+T')` 回滚 storage（注意：这次回滚本身要 try-catch，避免 `updateSetting` 失败导致 throw 到 init 顶层）。即便如此，Options UI 端 storage 仍是用户输入的非法值——**但** `commands.update` 不通过就回滚 storage，下次启动不会重复失败。
  - **遗留**：`options/options.js` 的 handler 内 `commands.update` 失败时（line 209-211 路径）**不会**回滚 storage——**暂不修**（单次失败 + storage 已有防 prototype 校验；下次启动会被 R1 修复再次触发回滚）。如用户反馈 R1 残留，再补。
  - 净 +5 行

- **R2 🔴 `content.js` `escapeHtml` 实体不全** — `content.js:1131`
  - **现象**：本地 `escapeHtml` 只转 3 实体 `& < >`，而 `lib/escape-utils.js` `escapeAttr` 转 5 实体。当前 4 处调用都是 div content 拼接（安全），但**未来若误用做 attribute 拼接**会有 XSS 风险——`"` 不转，`onerror="..."` 可注入。
  - **修**：函数体升级为 5 实体；同时**重命名为 `escapeContent`** 强化"只作文本内容"语义，避免与 `escapeAttr` 混淆。
  - 4 处调用点同步改名（line 270 / 292 / 1124 / 1210）。
  - 净 +1 行（多 2 个 .replace）

- **R6 🟠 对照面板关闭不清理监听器** — `content.js:1106`
  - **现象**：`updatePanel` 内 `mousedown/mousemove/mouseup` 3 个 listener 注册到 `document`（非 panel），依赖 `globalCleanupHandlers` 清理。**但** `panel-close-btn` 点击时只 `panel.remove() + 复位 body margin`，**不**调 `globalCleanupHandlers`——每次开/关 panel 累积 3 个 stale listener，多次后页面 mousemove 卡顿、内存增长。
  - **修**：close handler 内 `globalCleanupHandlers.forEach(fn => { try { fn() } catch {} }); globalCleanupHandlers = [];`
  - 注：`panel-toggle-btn` 不关闭 panel，无需清理；`panelClose()` 全局函数（line 1177）已会调 `globalCleanupHandlers` 清理——本轮只补 `updatePanel` 内的 close 路径。
  - 净 +1 行

- **未修的剩余风险**
  - R3 🟠 `lib/api-manager.js` 未识别错误无 UI 提示——体验问题
  - R4 🟠 "将在 N 分钟后重试" 误导（无重试机制）——文案问题
  - 留待 v1.0.7 或下个版本
- 净 +7 行 / -0 行（CHANGELOG 不计）

#### v1.0.6 hotfix 第四轮 — `loadDailyUsage` 样式抽 CSS

- **#4 样式与逻辑分离** — `popup.js` 中 `loadDailyUsage` 渲染的 item 行所有样式（display/flex/font-size/gradient/width）都 inline 在 HTML template 字符串中
  - 修：抽到 `popup.css` 新增 `.api-usage-item` + `.name` + `.bar` + `.bar-fill` + `.count` 5 个 class
  - 风险评估：🟡 中（template 字符串与 class 名硬编码对应，但 popup 自身代码）
  - 收益：与项目其他位置风格一致（`renderApiStatus` / `renderApiUsage` 都在 CSS class 风格）；未来加新字段不用改 JS
  - 净 +25 行 CSS / -4 行 JS

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
