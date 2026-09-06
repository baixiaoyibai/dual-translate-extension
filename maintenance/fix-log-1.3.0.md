# dual-translate-extension v1.3.0 修复日志

- 修复人：maintenance-engineer（维护修复工程师）
- 输入：interaction-review-1.3.0.md、security-review-1.3.0.md、api-data-review-1.3.0.md（以本根目录 maintenance/ 为准）
- 修复原则：仅处理确认的 P0/P1、获批的低风险安全加固项与 captain 指定的低风险 P2；改动小、无大重构、无新功能、不改现有文案/产品行为（除 bug 修复必需）。
- 结论：P0 无；P1 共 1 项已修复；P2 共 7 项已修复（api P2-1/P2-2 + interaction P2-1~P2-5）；安全侧 C1/C2/C3/C4 已修复。剩余 P3 与信息/观察项（C5/C6/C7）延后（见第二节）。

## 一、已修复

### P1

#### P1-1【连续 3 次一般性错误后 API 被永久禁用，无冷却/自动恢复】
- 编号引用：api-data-review-1.3.0.md · P1-1
- 文件：lib/api-manager.js
- 改动摘要：新增模块常量 `ERROR_COOLDOWN_MS = 5 * 60 * 1000`；`_handleApiError` 一般性错误分支在 `consecutiveErrors >= 3` 时写入 `cooldownUntil`；`_isApiUsable` 对 `error` 状态在 `cooldownUntil` 缺失或到期后恢复可用（对齐 `rate_limited` 冷却语义）。
- 验证：`npm run check` exit 0；`npm test` exit 0（含新增 api-manager 测试）

### P2

#### api P2-1【清空单个 API 密钥字段无法删除 local 已存密钥】
- 编号引用：api-data-review-1.3.0.md · P2-1
- 文件：lib/settings-manager.js、options/options.js、tests/settings-manager.test.js
- 改动摘要：`mergeNonEmptyKeys` 支持 incoming 字段值为 `null` 时显式删除 local 对应密钥字段；options.js 密钥输入框清空时写入 `null`（区别于「空串＝未变更」）；补测试断言「清空单字段后 local 键被删除」。
- 验证：`npm run check` exit 0；`npm test` exit 0（settings-manager 通过新增用例）

#### api P2-2【百度 LLM 54003/54005 未映射 RATE_LIMITED】
- 编号引用：api-data-review-1.3.0.md · P2-2
- 文件：lib/api-adapters/baidu-llm.js
- 改动摘要：`54003`/`54005` 显式抛出 `RATE_LIMITED`，与 base.js HTTP 429 语义一致，享受 60s 冷却自动恢复。
- 验证：`npm run check` exit 0

#### interaction P2-1【自动翻译延迟启动未重检开关，关闭后页面又被翻回】
- 编号引用：interaction-review-1.3.0.md · P2-1
- 文件：content.js
- 改动摘要：`checkAndTranslate` 延迟回调内重检 `settings.general.translationEnabled !== false` 与 `settings.trigger.autoTranslate`，不满足则不再启动翻译。
- 验证：`npm run check` exit 0

#### interaction P2-2【retrySegment / popup 手动翻译把 sourceLanguage='all' 原样透传】
- 编号引用：interaction-review-1.3.0.md · P2-2
- 文件：content.js、popup/popup.js、background.js
- 改动摘要：三处统一将 `'all'` 归一化为 `'auto'`；background `handleTranslateTexts` 增加 `'all'`→`'auto'` 防御性兜底。
- 验证：`npm run check` exit 0

#### interaction P2-3【toggleTranslation 以局部 segments/cache 推断方向，快捷键失灵/反向】
- 编号引用：interaction-review-1.3.0.md · P2-3
- 文件：content.js
- 改动摘要：`toggleTranslation` 改为读取权威 `settings.general.translationEnabled` 决定开关方向（true→关、false→开）。
- 验证：`npm run check` exit 0

#### interaction P2-4（C8）【panelCollapsed 持久化被 content-script updateSettings 白名单拦截】
- 编号引用：interaction-review-1.3.0.md · P2-4（原 security-review C8）
- 文件：background.js
- 改动摘要：`allowedPaths` 显式加入 `display.panelCollapsed`（非敏感字段），使面板折叠状态持久化生效。
- 验证：`npm run check` exit 0

#### interaction P2-5（C9）【NO_API「打开设置」横幅因后台错误掩码而失效】
- 编号引用：interaction-review-1.3.0.md · P2-5（原 security-review C9）
- 文件：background.js、content.js
- 改动摘要：background 对 content script 返回脱敏错误码枚举（新增 `_sanitizeErrorCode`：NO_API / AUTH_ERROR / QUOTA_EXCEEDED / RATE_LIMITED 等稳定标识，不再回传原文完整错误）；content.js 横幅按枚举判定（`isNoApi` 判 `NO_API`）并补 `RATE_LIMITED`，使 NO_API「打开设置」引导可正常触发。
- 验证：`npm run check` exit 0

### Security（低风险加固）

#### C1【更新检查 `tag_name` 未转义直插 innerHTML】
- 编号引用：security-review-1.3.0.md · C1
- 文件：options/options.js
- 改动摘要：由 GitHub `tag_name` 派生的 `latestVersion` 拼入 `innerHTML` 前经 `escapeAttr()` 转义。
- 验证：`npm run check` exit 0

#### C4【options.js `escapeAttr` 降级回退少转义单引号】
- 编号引用：security-review-1.3.0.md · C4
- 文件：options/options.js
- 改动摘要：回退函数补齐 `.replace(/'/g, '&#39;')`，与 `lib/escape-utils.js` 的 5 实体转义一致。
- 验证：`npm run check` exit 0

#### C2【运行时日志字符串参数不脱敏】
- 编号引用：security-review-1.3.0.md · C2
- 文件：background.js
- 改动摘要：`_pushLog` 新增 `redactString`，掩码字符串参数中 `Bearer`/`sk-`/`AKIA` 形态密钥，防止进入诊断页日志查看器。
- 验证：`npm run check` exit 0

#### C3【applyTranslationStyles CSS 变量写入无白名单兜底】
- 编号引用：security-review-1.3.0.md · C3
- 文件：content.js
- 改动摘要：写入 `--dt-trans-*` 前校验颜色（hex）、字号/间距（数值+单位）、字体（字符白名单，对齐 options.html pattern），异常值回退安全默认值。
- 验证：`npm run check` exit 0

### 回归测试补充

- 文件：tests/api-manager.test.js、tests/settings-manager.test.js、package.json
- 改动摘要：新增 `tests/api-manager.test.js` 覆盖 P1-1 冷却自动恢复判定，并入 `npm test`；`tests/settings-manager.test.js` 补 api P2-1 清空删除用例。
- 验证：`npm test` exit 0

## 二、确认但未修复 / 延后

### P3（超出本轮 P0/P1/P2 范围，低优先建议后续清理）
- interaction P3-1 ~ P3-6（徽章竞态、开关与当前 tab 能力耦合、多标签还原、指纹重扫、冗余 reloadApis、残留 hasCompletedWelcome）。
- api P3-1 ~ P3-7（状态摘要滞后、saveApiStatus 未串行化、auto 缓存键跨语言窗口、火山 region/service 硬编码、双份默认值漂移与测试盲区、apiPriority 'custom' 占位）。

### 信息 / 观察项（维持现状）
- security C5 / C6 / C7 —— 正向基线 / 平台特征 / 设计取舍，无需改动。

## 三、变更文件清单

- lib/api-manager.js（P1-1）
- lib/settings-manager.js（api P2-1）
- lib/api-adapters/baidu-llm.js（api P2-2）
- background.js（C2、interaction P2-4、interaction P2-5、interaction P2-2 兜底）
- content.js（C3、interaction P2-1/P2-2/P2-3/P2-5）
- options/options.js（C1、C4、api P2-1 UI）
- popup/popup.js（interaction P2-2）
- tests/api-manager.test.js（新增）
- tests/settings-manager.test.js（api P2-1 用例）
- package.json（test 脚本纳入 api-manager 测试）
- CHANGELOG.md（Unreleased 区块）
- maintenance/fix-log-1.3.0.md（本文件）

## 四、回归验证汇总

| 命令 | 结果 |
| --- | --- |
| `npm run check` | 通过（exit 0；node --check 全绿） |
| `npm test` | 通过（exit 0；model-name 28/28 + settings-manager + consistency + api-manager P1-1） |