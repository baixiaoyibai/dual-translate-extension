# dual-translate-extension v1.3.2 修复日志

- 修复人：captain（本轮 AgentTeams 成员 spawn 故障，经用户确认改为 captain 直接执行 + 子代理并行审查）
- 输入：interaction-ux-review-1.3.2.md、api-data-review-1.3.2.md（本轮子代理审查报告）
- 修复原则：优先用户可感知的体验优化与明确缺陷；局部最小化改动，无新功能、无架构重构、无 UI 大改；不改现有文案（除 bug 修复必需）。标记「建议延后」的项不修并记录理由。
- 结论：P2 共 1 项已修复；P3 共 8 项已修复（interaction F1/F2/F4/F5/F6/F9 共 6 项 + api P3-1/P3-6/N1 计 3 项，其中 F6 与 F9 同源合并为 1 处改动，故记 8 个独立缺陷点）；其余 P3 与信息项延后（见第三节）。

## 一、已修复

> 编号以审查报告为准：interaction-ux-review-1.3.2.md（F1~F11）与 api-data-review-1.3.2.md（P3-1~P3-7、N1）。

### P2

#### F7 popup「翻译中文页英文」开关写入方向颠倒
- 文件：popup/popup.js
- 改动：skipChineseSegmentsToggle change 处理器写入值由 `value: !skipChinese` 修正为 `value: skipChinese`（旧 checked == 新 skip），与加载映射（checked = !skip）对齐。
- 验证：`npm run verify` exit 0。

### P3 / 体验优化

#### F9 + F6 设置页每次打开都弹欢迎盖层；hasCompletedWelcome 死字段
- 文件：options/options.js
- 改动：setupWelcomeOverlay 初始隐藏盖层避免闪屏；新增 applyWelcomeCompletionState() 在 settings 加载后按 hasCompletedWelcome 决定移除/展示；hideOverlay() 关闭时持久化该标记。死字段接上读取方。
- 验证：`npm run verify` exit 0。

#### F1 关闭翻译后徽章 ⏸ 偶发缺失（竞态）
- 文件：content.js
- 改动：toggleTranslation 关闭分支改为先 await updateSettings 再发 setIconState，消除并发竞态。
- 验证：`npm run verify` exit 0。

#### F4 动态页周期重扫放大重译
- 文件：content.js
- 改动：getPageTextFingerprint 改用 TreeWalker 采样，跳过 parentElement 类名含 dual-translate- 的注入子树，与 MutationObserver 的 text 节点跳过逻辑一致。
- 验证：`npm run verify` exit 0。

#### F2 popup 主开关在内部页被回滚 + 误导 alert
- 文件：popup/popup.js
- 改动：开关已持久化后，向当前 tab 发指令失败（无 content script）时不再回滚全局开关、不再弹 alert，仅 console.warn 保留状态。
- 验证：`npm run verify` exit 0。

#### F5 options 冗余 reloadApis
- 文件：options/options.js
- 改动：删除 saveAllSettings 成功后的 3 处冗余 reloadApis 补发（background saveSettings 已 apiManager.reload()；右键菜单重建由 contextMenu 开关单独路径负责）。
- 验证：`npm run verify` exit 0。

#### api P3-1 API 状态摘要展示滞后
- 文件：lib/api-manager.js
- 改动：getApiStatusSummary 对可自动恢复类状态复用 _isApiUsable 的过期判定，到期后归一为 available 并清空 reason，与 getAvailableCount 对齐。
- 验证：`npm run verify` exit 0。

#### api N1 error 冷却恢复后 consecutiveErrors 不清零
- 文件：lib/api-manager.js
- 改动：_handleApiError 一般性错误分支中，上次冷却已过期则 consecutiveErrors 从 1 重新起算、cooldownUntil 置 0，避免「连续 3 次」退化为「累计 3 次」。
- 验证：`npm run verify` exit 0。

#### api P3-6 默认值副本漂移（panelCollapsed）
- 文件：lib/api-metadata.js、tests/consistency.test.js
- 改动：权威副本 DEFAULT_SETTINGS.display 补齐 panelCollapsed: false；测试新增「权威副本含 panelCollapsed:false」防漂移断言。
- 验证：`npm run verify` exit 0（consistency 新增断言通过）。

## 二、版本与文档

- manifest.json、package.json 版本号 1.3.1 → 1.3.2。
- CHANGELOG.md 新增 v1.3.2 条目。

## 三、确认但未修复 / 延后（理由）

- interaction F3（多标签页只还原当前 tab）：需多 tab 广播 + 状态一致性，改动面较大。
- interaction F8（popup 原生 alert 体验割裂）：批量低值 UI 观感优化。
- interaction F10（快捷键 Alt+T 与当前 tab 耦合）：与 F2 同根因的快捷键形态，需将开关裁决上移 background，改动较大。
- interaction F11（humanizeTranslateError 三处重复漂移）：文案一致性/维护成本，非功能缺陷。
- api P3-2（saveApiStatus 未串行化）：低概率计数 +1，不改变可用方向。
- api P3-3（auto 缓存键跨语言污染）：可达面已收窄（主路径已 auto→具体语言），低风险。
- api P3-4（火山 region/service 硬编码）：低频自定义接入点，默认接入点不受影响。
- api P3-5（模型名双份漂移测试盲区）：当前列表仍一致，仅测试盲区。
- api P3-7（apiPriority 'custom' 占位）：仅阅读/维护迷惑，无功能影响。

> 无 P0/P1 遗留；本轮唯一 P2（F7）已修复；无未说明理由的遗留修复项。
