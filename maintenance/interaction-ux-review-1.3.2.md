# dual-translate-extension v1.3.2 交互 / 用户体验复核报告

- 审查人：interaction-ux-auditor（子代理）
- 范围：content.js、background.js、popup/popup.js、popup/popup.html、options/options.js、options/options.html、welcome/welcome.js、welcome/welcome.html、content.css、lib/settings-manager.js、lib/api-metadata.js
- 方法：只读静态通读 + 精确行号定位 + 与上轮 report/fix-log 交叉比对；仅输出本报告，未修改任何源码
- 基线：`npm run verify` 实跑 **exit 0**（`npm run check` 全绿；`npm test`：model-name 28/28、settings-manager、consistency、api-manager 全部通过）

---

## 一、摘要

1. **6 个延后 interaction P3 全部仍在**（位置有行号漂移，但问题原样存在），逐一给出精确 file:line 见下。
2. 上轮 v1.3.0 已修的 5 项 P2（C8 面板折叠持久化、C9/NO_API 引导、P2-1 延迟重检、P2-2 'all' 归一化、P2-3 开关方向）经复核**均已正确落地**，未回退（佐证：background.js:307 白名单含 `display.panelCollapsed`；background.js:703-711 `_sanitizeErrorCode`；content.js:600-603 延迟重检；content.js:1293-1295 / popup.js:505-506 / background.js:740 'all'→'auto'；content.js:1644-1645 toggleTranslation 读权威开关）。
3. **新发现 5 项**，其中 1 项为明确缺陷（P2），其余 4 项为低风险体验/清理项（P3）。
4. 最影响用户感知的是：popup「翻译中文页英文」开关方向写反（功能失效/反向）、设置页每次打开都弹整屏欢迎盖层、以及「开关/还原」与当前标签页能力耦合带来的「内部页无法操作 + 误导性 alert」。

> 计数：本次共 11 条 findings —— P2 ×1、P3 ×10（含 6 项复核 P3 + 4 项新 P3）。

---

## 二、P3 逐项复核（6 项延后项）

### F1（复核 P3-1）关闭翻译时徽章短暂不同步（竞态）—— **仍存在**
- 严重度：P3
- 文件:行号：`content.js:1647-1648`；`background.js:807-815`（idle 判定在 `background.js:810`）
- 现况：`toggleTranslation()` 关闭分支（快捷键 Alt+T → background `background.js:262-264` → `toggleTranslate` → `content.js:1752`）先 `resetAll()`，然后**无 await、并行 fire-and-forget** 发送 `updateSettings(translationEnabled=false)`（1647）与 `setIconState('idle')`（1648）。`updateIcon` 的 idle 分支（810）依赖 `settingsManager.settings.general.translationEnabled === false` 决定是否显示 ⏸。两条消息并发到达 SW，若 `setIconState` 先于 `updateSetting` 完成后执行，`translationEnabled` 仍为 true → 不显示 ⏸，且**后续无任何补发**，该 tab 徽章可能一直缺失 ⏸。
- 复现条件：任意英文页 → 按 Alt+T 关闭翻译 → 观察图标徽章无 ⏸（或需再触发一次图标更新才出现）。
- 最小修法：`await sendMessage('updateSettings',{...false})` 后再发 `setIconState('idle')`；或将 idle 分支判定改为由 updateSettings 完成后再调用 updateIcon。
- 风险：极低（单点顺序修正）。
- 用户可感知：是（开关已关但图标仍像“开启”）。

### F2（复核 P3-2）popup 主开关/还原原文与当前 tab 能力耦合 —— **仍存在**
- 严重度：P3
- 文件:行号：`popup/popup.js:218-250`（开关，耦合点 227-243、误导 alert 241）、`popup/popup.js:364-373`（还原原文，alert 370）
- 现况：开关先 `await updateSettings`（已持久化），再向**当前 active tab** 发 `startTranslation`/ `restoreAll`；若该页无 content script（chrome:// 、edge:// 、扩展商店页、新标签页），catch 分支会把**已保存的全局开关回滚**并弹「当前页面无法翻译，请在普通网页上重试」。即：在内部页上用户**无法**通过 popup 开启/关闭翻译，且提示文案与“这其实是全局开关”语义不符。
- 复现条件：打开 chrome://extensions 或空白新标签页 → 打开 popup → 点「关闭翻译」→ 弹 alert、开关被回滚、图标状态不变。
- 最小修法：设置写入与页面指令解耦——写入开关**不因 tab 指令失败而回滚**；仅把「还原/开启当前页」的失败与「保存设置」的失败分开处理（开启翻译在无 content 页可仅保存、待下次导航生效；关闭翻译本就只需保存全局态）。同时把无 content 页的失败提示降级为非阻塞（如仅更新按钮提示，不弹 alert）。
- 风险：低（改动集中在 popup toggle 的 catch 分支）。
- 用户可感知：是（内部页无法开关 + 误导弹窗）。

### F3（复核 P3-3）多标签页下关闭翻译只还原当前标签 —— **仍存在**
- 严重度：P3
- 文件:行号：`popup/popup.js:235`（关闭仅向 active tab 发 `restoreAll`）；开启方向同理 `popup/popup.js:231`（仅 active tab `startTranslation`）
- 现况：`translationEnabled` 是全局开关，但 DOM 还原/翻译动作只作用于 active tab。关闭后其他已翻译标签的译文保留到下次导航/刷新才消失；同理，在某页开启后，其他已加载英文页不会自动开始翻译。
- 复现条件：开两个英文 tab 都完成翻译 → 在其中一个 popup 关闭翻译 → 另一个 tab 译文仍在。
- 最小修法：如需闭环，需要向所有含 content 的 tab 广播 `restoreAll`/ `startTranslation`（或依赖 storage.onChanged 在各 tab 自行响应）。改动面较大。
- 风险：中（涉及多 tab 广播与状态一致性）。
- 用户可感知：是（多标签场景的一致性问题），但非每开必现，接受为已知限制。

### F4（复核 P3-4）动态页周期重扫 / 指纹重扫 —— **仍存在**
- 严重度：P3
- 文件:行号：`content.js:838-860`（setupPeriodicRescan）、`content.js:866-875`（getPageTextFingerprint）
- 现况：指纹取 `document.body.textContent` 全长/首尾 2000 字符哈希（867），**未排除 `dual-translate-*` 注入译文**，也包含时间戳/广告/实时数据等动态文本。`autoRescan` 开启时，任何可见文本变化都会在 ≥2s（interval 与 lastRetranslateTime 双闸）后触发一次完整 `startTranslation`（cleanup + 重新提取 + 重新调 API）。注入译文本身变化（如 LLM 非确定性译文）也可能被计入指纹，存在“每间隔重译一次”的放大效应。
- 复现条件：开启 autoRescan 的英文 Live/自增数据页（带时间戳/广告轮播）→ 观察每 2～5s 页面译文闪烁重译、API 用量持续增长。
- 最小修法：指纹采样改为“排除 `dual-translate-*` 子树”的 TreeWalker 文本拼接（复用 extractSegments 的 acceptNode 过滤思路）；可选地稳定化高频变化区域。
- 风险：低（采样函数局部改动）；注意保持 O(采样上限) 防大页面卡顿。
- 用户可感知：是（动态页重复翻译 + 多余 API 消耗）。

### F5（复核 P3-5）options 冗余 reloadApis —— **仍存在**
- 严重度：P3
- 文件:行号：`options/options.js:119`（加载预热）、`1401`、`1430`、`1469`（每次 `saveAllSettings` 成功后又补发 `reloadApis`）；背景 `saveSettings` 已 `apiManager.reload()`（`background.js:388`），`reloadApis` 亦会 `reload()`（`background.js:456-458`）。`options.js:673`（`trigger.contextMenu` 借道 reloadApis 重建右键菜单）属正当但职责混淆。
- 现况：`saveAllSettings → background saveSettings → apiManager.reload()`，外层 `.then` 又 `reloadApis → apiManager.reload() + setupContextMenu()`，同一次保存触发两次 reload（读 storage + fetch prompt + 重建 translator），属重复工作，非正确性缺陷。
- 复现条件：options 任意 API 字段 change → 观察日志/网络有冗余重载。
- 最小修法：删除 `1401/1430/1469` 等 saveAllSettings 后的 `reloadApis` 补发；把「重建右键菜单」抽成独立 action，仅 `trigger.contextMenu` 切换时调用。
- 风险：低（删除多余发送即可；需确认删后右键菜单刷新仍由 673 单独覆盖）。
- 用户可感知：否（纯性能/职责清理）。

### F6（复核 P3-6）残留 hasCompletedWelcome —— **仍存在**
- 严重度：P3
- 文件:行号：`options/options.js:101`（每次打开都调 `setupWelcomeOverlay`）、`options/options.js:345-379`（hideOverlay 仅隐藏 DOM，不写 flag）；写入点 `welcome/welcome.js:12`（=true）、`background.js:854`（安装时=false）、`options/options.js:2343-2351`（重置时保留/设 true）。**无任何读取方**据此控制“是否弹欢迎”。
- 现况：`hasCompletedWelcome` 只有写、无读，成为死字段（默认值 `lib/settings-manager.js:261`、`lib/api-metadata.js:168`）。其直接用户后果见 F9。
- 复现条件：静态核对即可确认（无 reader）。
- 最小修法：见 F9（与“欢迎盖层每次弹出”一并修复，给 flag 接上读取方）。
- 风险：低。
- 用户可感知：间接（flag 本身不可见，但导致 F9 的可感知问题）。

---

## 三、新发现（v1.3.1 之后仍存在）

### F7（新 · N1）popup「翻译中文页英文」开关写入方向反了 —— **判定 P2，单选修复**
- 严重度：P2
- 文件:行号：`popup/popup.js:339-348`（缺陷在 **342**）、佐证：加载映射 `popup/popup.js:146-149`（`toggle.checked = !skip`）、文案 `popup/popup.html:64-65`；对照 options 正确实现 `options/options.js:513`（`bindToggle` 直接 `checked=skip`）。
- 现况：popup 把 checkbox 语义定义为 `checked = !skip`（标签“翻译中文页英文”），但 change 处理器写的是 `value: !skipChinese`，其中 `skipChinese === previousSkipChecked`（旧 checked）。正确目标应为 skip_new = !新checked = 旧checked。因此**首次点击写回旧值（等于没改），之后点击方向全部取反**。用户在 popup 里开/关“翻译中文页英文”要么无效、要么反着生效；重开 popup 显示又回退。
- 复现条件：默认（skipChineseSegments=true，开关显示“关”）→ popup 点开“翻译中文页英文”→ 中文页里的英文段仍被跳过（无变化）→ 再点一次 → 反而表现为关闭/open 反相。
- 最小修法：`value: !skipToggle.checked`（即写“关闭=skip、开启=不 skip”，与加载映射一致）；同步修 `previousSkipChecked` 追踪。或干脆与 options 一致直接 `checked=skip` 并改 popup 文案为“跳过含中文的段落”。
- 风险：低（单行 + 追踪一致性）。
- 用户可感知：**是（高）**——popup 快捷开关完全不可信/失效。

### F8（新 · N2）popup 错误反馈使用原生 alert()，体验割裂 —— **P3**
- 严重度：P3
- 文件:行号：`popup/popup.js:241 / 271 / 316 / 352 / 370 / 388 / 407`
- 现况：popup 层所有失败提示走浏览器原生 `alert()`（模态、样式突兀、文案与动作非对应），与 popup 概貌和 options 的 inline toast（`showSavedTip/showSaveError`）风格不一致；部分 alert 文案（如“当前页面无法翻译，请在普通网页上重试”）对“这其实是全局开关”的语义有误导。
- 复现条件：任意失败路径（内部页开关、模式切换失败、停止超时）即触发。
- 最小修法：popup 增加一个内联提示条/toast，替换 7 处 alert；文案按动作区分“仅当前页不可用”与“已保存”。
- 风险：低（仅 UI 提示层）。
- 用户可感知：是（低频、观感/一致性）。

### F9（新 · N3）设置页每次打开都弹出整屏「欢迎」盖层 —— **P3（用户可感知，建议本轮）**
- 严重度：P3
- 文件:行号：`options/options.js:101`、`345-379`；`options/options.html:11-89`
- 现况：`setupWelcomeOverlay` 在每次 `DOMContentLoaded` 无条件调用，`hideOverlay` 只在当前文档移除盖层，不持久化“已读”。因此**每开一次设置页都要再点一次「进入设置/跳过」**，与顶部 `welcome/welcome.html` 的 install 引导（由 `background.js:854-856` 只在 install 打开）职责重叠。
- 复现条件：反复打开设置页，每次都先见整屏欢迎盖层。
- 最小修法：读取 `general.hasCompletedWelcome`（或新增 `setupWelcomeOverlay` 内判断 `settings.general.hasCompletedWelcome !== false` 即跳过），并在 hideOverlay 时写 true（复用 welcome.js:12 的路径）。这一改动同时消解 F6 的死 flag。
- 风险：低（需注意“首次安装”仍要展示，“恢复默认”不应重置为强制弹）。
- 用户可感知：**是（高）**。

### F10（新 · N4）全局快捷键 Alt+T 同样与当前 tab 耦合，内部页静默失效 —— **P3**
- 严重度：P3
- 文件:行号：`background/background.js:258-269`（向 active tab 发 `toggleTranslate`，失败静默 .catch）
- 现况：快捷键路径完全依赖 active tab 存在 content script（`toggleTranslation` 在 content 里才写 `updateSettings`，见 content.js:1642-1654）。在 chrome:// 等无 content 页按 Alt+T，`sendMessage` reject 被 `.catch(()=>{})` 吞掉，**全局开关纹丝不动且无任何提示**。这与 popup 的 F2 是同一根因的快捷键形态。
- 复现条件：聚焦 chrome://extensions → 按 Alt+T → 无反应（开关未切换、无提示）。
- 最小修法：把“切换全局开关”的裁决上移到 background（读/写 `general.translationEnabled`），content 只负责“按新状态翻译/还原 DOM”；或至少在有 content 的 tab 上执行、无 content 时仍写全局态。
- 风险：低（与 F2 一起做解耦，可复用）。
- 用户可感知：是。

### F11（新 · N5）humanizeTranslateError 三处重复且各自漂移 —— **P3（清理）**
- 严重度：P3
- 文件:行号：`background.js:195-216`、`content.js:492-501`、`popup/popup.js:467-476`
- 现况：同一“技术错误→人话”映射存在三份、关键词集不一致（如 background 有 `failed to fetch`/「没有可用」，content 缺 `failed to fetch`/「没有可用」，popup 缺 `abort` 分支却多 `timeout`），导致同一错误在页面横幅 / 右键 / popup 手动翻译三处文案偶有差异。
- 复现条件：静态核对即可；运行时表现为同类错误的提示措辞不一致。
- 最小修法：收敛为共享模块（content 无法 import ESM，可内联一份并注释同步，或由 background 返回统一枚举+文案，端上只做展示）。
- 风险：低（文案层）。
- 用户可感知：弱（一致性/维护成本）。

---

## 四、逐条处置结论

| 编号 | 标题 | 严重度 | 结论 |
|---|---|---|---|
| F1（P3-1） | 徽章短暂不同步（竞态） | P3 | **建议本轮修复**（一句话 await 顺序） |
| F2（P3-2） | 开关/还原与当前 tab 能力耦合 | P3 | **建议本轮修复**（写设置与页面指令解耦） |
| F3（P3-3） | 多标签页只还原当前标签 | P3 | 建议延后（需多 tab 广播，改动面较大） |
| F4（P3-4） | 动态页周期重扫/指纹重扫 | P3 | **建议本轮修复**（指纹排除注入节点，防重译放大） |
| F5（P3-5） | options 冗余 reloadApis | P3 | **建议本轮修复**（删冗余发送，低风险清理） |
| F6（P3-6） | 残留 hasCompletedWelcome | P3 | **建议本轮修复**（与 F9 一并接上读取方） |
| F7（N1） | popup「翻译中文页英文」开关写反 | P2 | **建议本轮修复（优先）** |
| F8（N2） | popup 原生 alert() 体验割裂 | P3 | 建议延后（批量低值优化） |
| F9（N3） | 设置页每次打开弹欢迎盖层 | P3 | **建议本轮修复（优先，同 F6）** |
| F10（N4） | 快捷键与当前 tab 耦合 | P3 | 建议延后（随 F2 解耦一并处理） |
| F11（N5） | humanizeTranslateError 三处重复漂移 | P3 | 建议延后（文案收敛） |
