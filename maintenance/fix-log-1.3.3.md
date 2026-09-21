# dual-translate-extension v1.3.3 修复日志

- 修复人：maintenance-engineer（AgentTeams 成员，t3 实现批）
- 输入：maintenance/compat-review-1.3.3.md（t1 版本兼容性审计）、maintenance/security-review-1.3.3.md（t2 用户安全审计）、maintenance/verification-report-1.3.3.md（t4 质量验证）
- 收尾与提交：captain（t5 原指派 maintenance-engineer → qa-verifier，两者先后因 API 5 小时配额超限中断；由 captain 接手完成日期校正、提交前核对与 git 提交，见文末「四、提交与收尾」）
- 修复原则：修复两份审计报告全部 P1 与 P2 findings；P3 仅在顺手、低风险、局部的前提下酌情处理；局部最小化改动，无新功能、无 UI 大改、不动测试基建（未新增测试文件、未改 npm test/check/verify 脚本）。P3-3（host_permissions）与 P3-4（PIN 体系边界）按审计建议维持现状，仅文档层面强化。
- 结论：P1 共 1 项已修复；P2 共 6 项已修复（兼容性 3 + 安全 3）；P3 顺手修复共 9 项（安全 P3-1/P3-2/P3-5 + 兼容 F-5/F-6/F-7/F-8/F-9/F-10）。npm run verify 全绿（17 文件语法检查 + 4 个测试文件），t4 模拟老版本存储专项回归 32/32 通过。

## 一、已修复

> 编号以审计报告为准：compat-review-1.3.3.md（F-1~F-10）、security-review-1.3.3.md（P2-1~P2-3、P3-1~P3-5）。

### P1

#### F-1 默认术语表超出 chrome.storage.sync 单项配额：种子写入静默失败、默认术语永久丢失；超限用户编辑被静默丢弃
- 文件：lib/settings-manager.js、options/options.js
- 改动：术语表（`dual_translate_glossary`）存储区域由 sync 迁移到 local（享有 `unlimitedStorage`，无 8KB 单项限制）。`getGlossary` 读取顺序：local 有值（含旧裸 array 格式自动包 `_global`）直接返回 → local 无值时迁移 sync 遗留数据（对象/裸数组均处理，写 local + `sync.remove` 清旧键，幂等）→ 都没有才种子写入 local；种子失败不再置位 INIT 标记（下次调用自动重试），消除「永久返回空表」路径。`saveGlossary` 只写 local。options 侧 `saveGlossary` 校验 background 响应，失败抛出；8 处调用点由 `console.warn` 改为 `showSaveError` 用户可见提示，不再「UI 提示已保存、实际写入失败」。
- 验证：tests/settings-manager.test.js 新增断言（迁移内容/裸数组格式/sync 旧键清理/种子成功置位 INIT/失败不置位/saveGlossary 只写 local）；t4 模拟 A16-A21、B5/B6 通过；`npm run verify` exit 0。
- 行为变更：术语表不再跨设备同步（README/CHANGELOG 已注明，导出/导入格式不变可迁移）。

### P2（兼容性）

#### F-2 content.js 术语表监听器区域错误 —— CHANGELOG v1.2.15 承诺未兑现
- 文件：content.js（注释）、lib/settings-manager.js（实质）
- 改动：F-1 将术语表迁入 local 后，content.js 既有的 `storage.onChanged` local 分支监听真正生效，设置页修改术语表后已打开标签页实时刷新；补充注释说明区域一致性。
- 验证：t4 复核确认监听链路与存储区域一致（loadGlossary → getGlossaryForDomain → settings-manager local 读取）。

#### F-3 README「当前版本」标注停留在 v1.3.1
- 文件：README.md
- 改动：顶部当前版本更新为 v1.3.3（随本批版本号）。
- 验证：t4 文档复核。

#### F-4 README 三处宣称 PIN 为「SHA-256 + 盐值」，实际 v1.2.16 起 PBKDF2
- 文件：README.md
- 改动：安全性描述与「密钥安全」小节更正为「PBKDF2-HMAC-SHA256（10 万次迭代）+ 盐值」；v1.0.13 历史小节保留「当时为 SHA-256」并加注已升级，避免篡改历史记录。
- 验证：t4 文档复核。

### P2（安全）

#### P2-1 诊断页明文展示自定义供应商 apiKey（绕过 PIN 掩码）
- 文件：diagnose.js
- 改动：新增 `maskSensitiveFields` 统一掩码 `api.apiKeys` 与 `customProviders[].apiKey`，在 `checkSettings`（getSettings 消息）与 `checkSync`（sync 存储检查）两处渲染前生效；诊断页无需解锁 PIN 即可直达，自定义供应商密钥不再明文展示。
- 验证：t4 复核（含非字符串/空串边界无崩溃路径）。

#### P2-2 设置页诊断工具存储型标记注入（导入字段缺类型校验）
- 文件：options/options.js、lib/settings-manager.js
- 改动：双防线。渲染侧：设置概览三处数值字段（logLevel/batchSize/requestTimeout）补 `escapeAttr(String(...))`；用量诊断 `limit` 补 `Number.isFinite` 数值校验。写入侧：`applyImportedSettings` 新增 `_normalizeImportedSettings`——`general.logLevel`（0-4 整数，否则回退 2）、`advanced.batchSize/requestTimeout/retryCount/retryInterval`（非有限数值或 <1 回退默认）、`api.quotaLimits[].limit`（非数字整条丢弃）类型归一，标记串无法再持久化进 storage。
- 验证：tests/settings-manager.test.js 恶意导入断言 + t4 模拟 C1-C4；`npm run verify` exit 0。

#### P2-3 内置厂商端点可被导入文件改写为任意 HTTPS 主机（真实密钥外发）
- 文件：lib/settings-manager.js
- 改动：新增 `BUILTIN_ENDPOINT_HOSTS` 官方域名白名单（baidu/baidu_llm→fanyi-api.baidu.com、volcano→translate.volcengineapi.com、deepseek→api.deepseek.com、glm/zhipu→open.bigmodel.cn、tongyi→dashscope.aliyuncs.com、yi→api.lingyiwanwu.com、doubao→ark.cn-beijing.volces.com），`_assertSafeEndpoints` 对内置厂商端点强制白名单或本机 localhost 测试地址；custom 槽位与自定义供应商（custom_ 前缀）保持任意 HTTPS（自带端点功能本性），报错文案可读。
- 验证：tests/settings-manager.test.js（劫持/后缀仿冒域名拒绝、官方域与 localhost 放行、custom 不受限）+ t4 逐项比对 9 个默认端点主机全部命中白名单，无误伤。

### P3 / 顺手加固

#### P3-1 diagnose.js 掩码无长度保护（与 P2-1 同处改动）
- 文件：diagnose.js
- 改动：`maskSecret` 对长度 ≤6 的值全遮蔽 `****`，与设置页 `maskApiValue` 语义一致，短密钥不再近乎原文泄露。

#### P3-2 _pushLog 字符串脱敏模式不全
- 文件：background.js
- 改动：`redactString` 追加火山引擎 `AKLT` 前缀与 32 位十六进制（百度 secretKey 形态）模式。

#### P3-5 safeUrl 下载域任意 https
- 文件：options/options.js
- 改动：`safeUrl` 由任意 https 收紧为 `github.com`/`objects.githubusercontent.com` 域白名单，防止仓库 release 元数据被篡改后诱导下载任意主机的文件。

#### F-5 死常量 dual_translate_api_status 与 ≤v1.0.7 孤儿数据
- 文件：lib/settings-manager.js
- 改动：删除死常量 `API_STATUS_KEY`；`resetApiQuotaIfNeeded` 读取 local 时一次性清理孤儿键（每日至多一次，try/catch 不影响主流程）。
- 验证：t4 模拟 A15 通过。

#### F-6 diagnose.js 手动密钥迁移工具覆盖语义不一致
- 文件：diagnose.js
- 改动：`migrateKeys` 改为与 `_migrateSyncKeysToLocal` 一致的合并语义（仅补 local 缺失的非空密钥，不覆盖 local 已有非空值），并同步迁移 `custom_<id>` 供应商密钥；confirm 文案注明合并语义。t4 逐行对照确认与主迁移路径一致。

#### F-7 DEFAULT_SETTINGS 双副本防漂移测试过弱
- 文件：tests/consistency.test.js
- 改动：防漂移断言由单字段（panelCollapsed）升级为 `LEGACY_DEFAULT_SETTINGS` 与权威副本（api-metadata.js）的全量深度比对（含数组逐项），漂移时输出差异路径。
- 验证：`npm run verify` exit 0（当前两副本零漂移）。

#### F-8 settings sync 单项体积余量缺文档
- 文件：README.md
- 改动：存储说明补术语表位置与 sync 单项 8KB 配额边界说明（含跨设备迁移建议）。

#### F-9 导入路径 null 值透传
- 文件：lib/settings-manager.js
- 改动：`_normalizeImportedSettings` 的 `stripNulls` 仅在 `api.apiKeys` 子树保留 null（v1.3.1 显式删除密钥契约不变，测试断言覆盖），其余字段 null 一律剥离不落盘。
- 验证：tests/settings-manager.test.js + t4 模拟。

#### F-10 pre-v1.0.6 导出文件被拒提示不明确
- 文件：options/options.js
- 改动：报错文案补充「仅支持 v1.0.6 及之后导出的文件」。

## 二、版本与文档

- manifest.json、package.json 版本号 1.3.2 → 1.3.3。
- CHANGELOG.md 新增 v1.3.3 条目（Fixed/Changed/Security/Tests 四节，风格对齐 v1.3.2）。
- README.md：当前版本 v1.3.3、PIN 算法表述更正、存储/术语表说明更新（F-3/F-4/F-8）。
- 回归测试扩入既有测试文件（tests/settings-manager.test.js、tests/consistency.test.js），未新增测试文件、未改 npm test 脚本；测试 chrome mock 最小扩展（sync.get 数组读取、sync.remove、runtime.getURL）以覆盖新行为。

## 三、确认但未修复 / 延后（理由）

- **安全 P3-3（全站 host_permissions）**：核心功能所需（任意外文网页翻译），v1.2.16 已从 `<all_urls>` 收窄为 http/https；按审计建议维持现状。
- **安全 P3-4（PIN 为 UI 级边界、setupPin 无已有 PIN 校验）**：属设计取舍，本地明文存储为平台常态且已向用户如实披露；按审计建议维持现状。
- **32-hex 脱敏模式较宽**（t4 观察项）：`\b[a-f0-9]{32}\b` 会误伤日志中合法 32 位十六进制串（如内容哈希），方向为 fail-safe；若未来日志可用性受损再收紧上下文。
- **数组内 null 不递归剥离**（t4 观察项）：如 `excludeList: [null]` 边缘形态，v1.3.1 起导出文件不含此类值，风险极低，可在后续维护批补齐。

> 无 P0/P1 遗留；本批全部 P1（1 项）与 P2（6 项）均已修复；无未说明理由的遗留修复项。

## 四、提交与收尾

- **批次日期校正**：本批 compat-review / verification-report / CHANGELOG 条目原标注 2026-09-15，与实际执行日期不符（t1~t4 均执行于 2026-09-21），已统一校正为 2026-09-21。
- **移交经过**：t5（总结 + git 提交）原指派 maintenance-engineer，因 API 5 小时配额超限（429 RATE_LIMIT）中断；改派 qa-verifier 后同样中断；最终由 captain 完成收尾。
- **提交前核对**：复跑 `npm run verify` 全绿（exit 0）；`git status` 清单与计划一致（11 个代码/文档改动 + 本批 4 份 maintenance 报告，无计划外文件、无 .env/密钥/发布 zip）；`git diff --check` 无新增空白/EOL 噪音。
- **提交**：单提交 `v1.3.3: 项目维护——版本兼容性与用户安全专项修复（术语表 sync→local 迁移 P1；端点白名单/密钥掩码/导入类型校验等 6 项 P2）`，提交到本地 master（按既有维护批惯例未推送、未打 tag）。

