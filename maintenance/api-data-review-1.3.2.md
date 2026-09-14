# API 层与数据链路复查报告 — dual-translate-extension v1.3.2（v1.3.1 修复后复核）

- 复查人：api-auditor
- 复查对象：v1.3.1 维护批（commit `26984ff`）之后；范围 lib/api-manager.js、lib/api-registry.js、lib/api-metadata.js、lib/settings-manager.js、lib/translation-cache.js、lib/escape-utils.js、lib/api-adapters/*.js、background.js、content.js（翻译/缓存路径）、tests/*.test.js
- 基线：`npm run verify` **exit 0** —— `node --check` 覆盖 background/content/diagnose/lib 及全部 api-adapters、popup/options/welcome 全绿；`npm test` 依次通过 model-name（28/28 passed）、settings-manager、consistency、api-manager P1-1，全部通过。
- 方法：`git diff 28a434c..26984ff` 逐文件核对 + 静态通读 + 对三处“默认副本”（api-metadata 权威副本 / settings-manager LEGACY 副本 / settings-manager API_ENDPOINTS/API_MODELS 副本）做程序化深比对。

---

## 摘要

- 7 个延后 API P3 复核结果：**7/7 仍存在**，行号已按 v1.3.1 重定位。
- 其中 **P3-6 已不再是“风险”而是“已发生的漂移”**：权威副本 `api-metadata.js` 的 `DEFAULT_SETTINGS.display` 缺少 `panelCollapsed: false`，而 settings-manager 的 `LEGACY_DEFAULT_SETTINGS.display` 有（`settings-manager.js:48`）。由于 `settings-manager.js` 首行 `import './api-metadata.js'` 使 `globalThis.DEFAULT_SETTINGS` 恒为权威副本，LEGACY 副本实际是死代码，全新安装时 `display.panelCollapsed` 为 `undefined` 而非 `false`（目前无功能影响，因 content.js 用 `===true` 读取）。
- 额外扫描 v1.3.1 修复：**未发现新的 P0/P1/P2**；发现 **1 项新 P3**（N1：error 冷却到期恢复后 `consecutiveErrors` 不归零，单次失败即再次触发 5 分钟冷却）。
- 新问题扫描结论：P2-2 百度 RATE_LIMITED 映射、P2-1 null 删除密钥、C2 日志脱敏、C9 `_sanitizeErrorCode`、C3 CSS 白名单均未引入 API/数据链路回归（其中 C3 白名单与 options.html 既有 `pattern` 约束一致，非过度清洗）。
- **总计 8 项 finding，按严重度：P1=0，P2=0，P3=8。**

---

## 一、7 个延后 P3 复核

### P3-1 状态摘要未应用「过期恢复」判定（仍存在，且新影响 error 冷却）
- 编号 / 严重度：P3-1 / P3
- 文件:行号：`lib/api-manager.js:324-342`（`getApiStatusSummary`），关键行 `336`（`status: cachedStatus?.status || ...`）、`337`（`reason`）、`338`（`updatedAt`）
- 触发条件：某 API 进入 `rate_limited`（60s 冷却）/`quota_exceeded`（日/月重置）/`error`（5 分钟冷却）后，冷却到点或重置时间已过，popup 打开 `getApiStatus`（background.js:395-413）时仍返回旧 status；只有下一次成功翻译才会刷新为 `available`。P1-1 引入 error 冷却后本问题扩大：`getAvailableCount()`（`api-manager.js:348-350`）已按 `_isApiUsable` 把恢复的 API 计入可用，但 summary 仍显示 `error`，两处数字在 UI 上互相矛盾。
- 建议的最小修法：在 `getApiStatusSummary()` 内对每个 apiName 调用 `_isApiUsable(name)`，若可恢复类状态（quota_exceeded/rate_limited/error）已过期则把 `status` 归一为 `available`（可保留 `reason` 标注“冷却已结束/额度已重置”）。
- 风险：仅展示滞后，不影响实际翻译可用性；但会让用户误判服务仍不可用。
- 结论：**建议本轮修复**（用户可见，改动集中在第 324-342 行，数行内完成）。

### P3-2 saveApiStatus 未纳入 _enqueueWrite 串行化（仍存在）
- 编号 / 严重度：P3-2 / P3
- 文件:行号：`lib/settings-manager.js:1026-1039`（`saveApiStatus`，未走 `_enqueueWrite`；对照同文件 `saveSettings` 第 733 行走 `_enqueueWrite`）
- 触发条件：两个标签页同时翻译同一 API 且都失败，两个 `_handleApiError` 在 `chrome.storage.local.get/set` 的 await 点交错；都基于同一份 `current`（api-manager.js:228 同步读 `statusCache`），第二次写覆盖第一次，丢失一次 `consecutiveErrors` 计数或状态更新。
- 建议的最小修法：把 `saveApiStatus` 内部读改写包进 `this._enqueueWrite(async () => { ... })`（与 saveSettings 同锁）。
- 风险：低概率、低影响（计数少 +1，不改变最终不可用/可用方向）。
- 结论：**建议延后**。

### P3-3 translation-cache 键在 sourceLang='auto' 下跨语言污染窗口（仍存在）
- 编号 / 严重度：P3-3 / P3
- 文件:行号：`lib/translation-cache.js:95-98`（`_key`：`sourceLang + '' + targetLang + '' + norm`）
- 触发条件：传入 `sourceLang='auto'`（字面量）时，键中的源语言是 `auto` 而非真实语言；同一归一化短句（标题/短词）先以英语后以日语出现时命中同一条目，返回跨语言旧译文。复核补充：v1.3.1 后**主页面翻译路径**（`content.js:1387-1388` `translateSegments` 经 `detectPageLanguage`）已把 auto→具体页语言，故字面 `auto` 的实际可达面收窄为：`content.js:1294-1296` `retrySegment`（源语言 auto 时原文照传 'auto'）与 popup 手动翻译（`popup/popup.js` normalized 后传 'auto'）。底层缺陷本身不变。
- 建议的最小修法：键改存“检测后的源语言”，或在有真实检测结果时不要在键里用 `auto`；至少对 `retrySegment` 复用 `detectPageLanguage` 得到具体语言再发请求。
- 风险：低（目标语言已纳入，见 v1.2.12 P1-4；仅同语言短文本跨语言误命中）。
- 结论：**建议延后**。

### P3-4 火山引擎 region/service 硬编码（仍存在）
- 编号 / 严重度：P3-4 / P3
- 文件:行号：`lib/api-adapters/volcano.js:15-16`（`this.region = 'cn-north-1'`、`this.service = 'translate'`）
- 触发条件：用户配置非 `cn-north-1` 或非 `translate` 服务的自定义接入点；`credentialScope`（volcano.js:227 用 `this.region`/`this.service`）与真实接入点不匹配，V4 签名（`_buildAuthHeaders`，206-257）认证失败。默认接入点不受影响。
- 建议的最小修法：从自定义 endpoint/host 推导 region/service（提供可配置字段回退到默认），或在 options 增加 region/service 输入项。
- 风险：低频（默认接入点不受影响）；一旦命中则表现为认证失败难排查。
- 结论：**建议延后**。

### P3-5 DEFAULT_MODEL_NAMES / DEFAULT_MODEL_VARIANTS 双份漂移风险（仍存在，当前仍一致）
- 编号 / 严重度：P3-5 / P3
- 文件:行号：`content.js:120-143`（DEFAULT_MODEL_NAMES）、`content.js:145-152`（DEFAULT_MODEL_VARIANTS） vs `lib/api-metadata.js:88-99`（customModelNames）、`lib/api-metadata.js:100-107`（customModelVariants）
- 触发条件：任一侧将来增删模型名/后缀；`tests/model-name.test.js:46-51` 只用 content.js 自身常量做断言，**不校验 api-metadata 权威副本**，漂移无法被测试发现。本轮程序化比对确认两份列表当前逐项一致（names 67 项、variants 46 项）。
- 建议的最小修法：测试内同时加载 api-metadata 的 `DEFAULT_SETTINGS.rules.customModelNames/customModelVariants` 做 deep-equal 断言；或运行时让 content.js 直接引用权威数组（content 无法 import ESM，需挂 window 全局或构建注入）。
- 风险：仅测试盲区 + 潜在漂移；当前无实际功能错误。
- 结论：**建议延后**（补一条一致性断言即可，随下一轮测试批次顺带做）。

### P3-6 settings-manager 本地默认副本与 api-metadata 权威副本漂移（仍存在，且已出现 1 处实际漂移）
- 编号 / 严重度：P3-6 / P3
- 文件:行号：
  - 权威副本 `lib/api-metadata.js:22-159`（`DEFAULT_SETTINGS`，含 display 66-78 / apiPriority 145）
  - 本地副本 `lib/settings-manager.js:34-269`（`LEGACY_DEFAULT_SETTINGS`，display 36-52）
  - 本地端点/模型副本 `lib/settings-manager.js:275-286`（API_ENDPOINTS_DEFAULT）、`288-299`（API_MODELS_DEFAULT）
- 实际漂移实例：`settings-manager.js:48` `panelCollapsed: false` 存在于 LEGACY display，但 **`api-metadata.js` 的 `DEFAULT_SETTINGS.display`（66-78）缺少该字段**。程序化深比对确认这是三副本间**唯一**差异（LEGACY vs META：仅 `$.display.panelCollapsed`；ENDPOINTS/MODELS 与 META 完全一致）。
- 触发条件：`settings-manager.js` 首行 import api-metadata 使 `globalThis.DEFAULT_SETTINGS` 恒存在，`DEFAULT_SETTINGS = globalThis.DEFAULT_SETTINGS || LEGACY`（273 行）永远取权威副本 → LEGACY 的 `panelCollapsed` 成为死值；全新安装 `this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))`（347 行）后 `display.panelCollapsed` 为 `undefined`。
- 影响：当前无可见功能错误（content.js:1600 用 `settings?.display?.panelCollapsed===true`，`undefined` 与 `false` 行为一致）；但证实了“权威/本地双副本漂移”风险已发生，且 `tests/settings-manager.test.js:6-8` 剥离 import 后测的是 LEGACY 回退副本，**测不到权威副本**，故无法捕获此类漂移。
- 建议的最小修法：在 `api-metadata.js` 的 `DEFAULT_SETTINGS.display` 补 `panelCollapsed: false`（一行，消除漂移）；测试补一条“剥离 import 后的 LEGACY/defaults 与 api-metadata DEFAULT_SETTINGS deep-equal”断言（拦截未来漂移）。
- 风险：低（无功能影响）；但作为唯一已发生的漂移实例，是 P3 里最值得先清的“数据一致性债务”。
- 结论：**建议本轮修复**（一行补齐 + 一条断言）。

### P3-7 apiPriority 含无效占位条目 'custom'（仍存在）
- 编号 / 严重度：P3-7 / P3
- 文件:行号：`lib/api-metadata.js:145`（`apiPriority: [..., 'custom', ...]`）；镜像副本 `lib/settings-manager.js:236`；惰性失效点 `lib/api-manager.js:68-77`（`_buildTranslators` 对 'custom' 取 `API_REGISTRY['custom']` 得 undefined→createTranslatorFromSettings 返回 null）。
- 触发条件：无（任何版本）。`_isValidApiName`（settings-manager.js:661-665）因 'custom' 在 `DEFAULT_SETTINGS.api.apiPriority` 中被判为“有效”，`_cleanupObsoleteApis` 也不会清除它，故该占位条目长期残留。
- 建议的最小修法：从两处 `apiPriority` 移除 `'custom'`；若担心旧用户存储已含 'custom'，在 `_cleanupObsoleteApis` 中显式过滤 `name === 'custom'`。
- 风险：仅阅读/维护迷惑，无功能影响。
- 结论：**建议延后**（可随 P3-6 的优先级数组清理一并处理，一行级）。

---

## 二、v1.3.1 修复后新问题扫描

### N1 error 冷却到期恢复后 consecutiveErrors 不归零，单次失败即再次触发 5 分钟冷却（新 P3）
- 编号 / 严重度：N1 / P3（v1.3.1 P1-1 修复引入的次生语义问题）
- 文件:行号：`lib/api-manager.js:115-119`（`_isApiUsable` 的 error 分支只判断 `cooldownUntil` 到期，**不清理** `consecutiveErrors`）、`lib/api-manager.js:258-267`（`_handleApiError` error 分支 `consecutiveErrors = (current.consecutiveErrors||0)+1`，且 `>=3` 时重写 `cooldownUntil = now + 5min`）
- 触发条件：某 API 连续失败 3 次 → 5 分钟冷却；冷却到期 `_isApiUsable` 恢复 true（但 `statusCache[name].consecutiveErrors` 仍是 3，`cooldownUntil` 仍为过去时间）；下一次调用只要再失败一次，`consecutiveErrors` 变 4，`cooldownUntil` 被重写为 now+5min → 单次瞬时失败即再次整 5 分钟禁用。即“连续 3 次”实际退化为“自上次成功后累计 3 次”，对波动型 provider 变相收紧冷却。
- 建议的最小修法：在 `_isApiUsable` 判定 error 冷却到期恢复时，同步（或惰性）把 `statusCache[apiName].consecutiveErrors` 归零/将状态归一为 available，使恢复后重新按“连续 3 次”从零计数；或在 `_handleApiError` 写入时若 `current.cooldownUntil` 已过期则从 1 重新起算。
- 风险：低（仍能恢复，只是比预期更易进入冷却；不构成永久禁用）。
- 结论：**建议本轮修复**（就地一行~数行，与 P3-1 可合并为一次 status 归一化改造）。

---

## 三、结论汇总

| 编号 | 严重度 | 状态 | 建议 |
| --- | --- | --- | --- |
| P3-1 | P3 | 仍存在（且受 P1-1 扩大） | 建议本轮修复 |
| P3-2 | P3 | 仍存在 | 建议延后 |
| P3-3 | P3 | 仍存在（可达面收窄） | 建议延后 |
| P3-4 | P3 | 仍存在 | 建议延后 |
| P3-5 | P3 | 仍存在（当前一致） | 建议延后 |
| P3-6 | P3 | 仍存在（已漂移：panelCollapsed） | 建议本轮修复 |
| P3-7 | P3 | 仍存在 | 建议延后 |
| N1 | P3 | 新增 | 建议本轮修复 |

无 P0/P1/P2 遗留；无未说明的修复项。
