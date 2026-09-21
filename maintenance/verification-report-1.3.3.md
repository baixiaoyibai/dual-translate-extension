# dual-translate-extension v1.3.3 维护批 — 质量验证报告

- **验证对象**：t3 实现批（v1.3.2 → v1.3.3），基线 commit `cf2d4e9`（v1.3.2），工作树未提交 diff 共 11 个文件（481+/69-）
- **验证人**：qa-verifier（t4）
- **验证日期**：2026-09-21
- **验证方式**：`npm run verify` 全量回归 + 逐修复点补丁前后代码复核（git diff 对照）+ 独立模拟老版本存储数据走加载/迁移路径（32 项断言）+ 存储面/权限面/EOL 噪音交叉检查
- **结论**：**全部通过，未发现回归或遗漏**。P1×1、P2×6（兼容 3 + 安全 3）全部修复正确；P3/F-5~F-10 顺手修复项全部落实。

---

## 1. 自动化回归：npm run verify

| 步骤 | 结果 |
|---|---|
| `npm run check`（17 个 JS 文件 `node --check`） | ✅ 通过（exit 0） |
| `node tests/model-name.test.js` | ✅ 28/28 passed |
| `node tests/settings-manager.test.js` | ✅ passed（含 v1.3.3 新增 F-1/P2-2/P2-3/F-9 回归断言；输出可见 `glossary migrated from sync to local` 两条迁移日志） |
| `node tests/consistency.test.js` | ✅ passed（含 F-7 双副本全量深度比对） |
| `node tests/api-manager.test.js` | ✅ P1-1 cooldown test passed |
| `git diff --check`（换行/空白噪音） | ✅ 无新增 mixed-EOL（见 §5.4） |

## 2. 兼容性修复复核（P1 + P2 兼容项）

### 2.1 【P1 · F-1】术语表迁移至 chrome.storage.local — ✅ 修复正确，无回归
- **根因确认**：`config/default-glossary.json` 实测 12,400 字节 > chrome.storage.sync `QUOTA_BYTES_PER_ITEM`（8,192），旧实现种子写入必然被配额拒绝且 `catch{}` 吞错后置位 INIT——审计结论成立。
- **修复复核**（`lib/settings-manager.js` `getGlossary`/`saveGlossary`）：
  - 读取顺序正确：local 有值（含旧裸 array 格式自动包 `_global`）→ 直接返回；local 无值 → 尝试迁移 sync 遗留（对象/裸数组均处理）→ 写 local + `sync.remove` 清旧键 → 都没有才种子写入 local。
  - 种子失败不再置位 INIT（`console.warn` + 返回空表，下次调用自动重试）——「永久空表」路径已消除。
  - `saveGlossary` 只写 local；`manifest.json` 含 `unlimitedStorage`（该权限仅对 local 生效，与修复前提一致）。
  - **消费者全链路核实**：background.js `getGlossary`/`getGlossaryForDomain`/`saveGlossary`/`exportAllSettings`/`importAllSettings` 全部经由 settings-manager，无任何旁路直写 sync 的调用点；导出文件 `glossary` 字段格式不变，旧导出文件可直接导入。
  - `options/options.js` `saveGlossary` 现校验 background 响应（`success===false || error` 抛出），8 处调用点（添加行/导入/恢复默认/域名增删/单元格编辑×2/删除行）全部改为 `showSaveError` 用户可见提示（`showSaveError` 定义于 options.js:231，作用域可达）。
- **模拟验证**：A16-A21（迁移内容一致、域名条目保留、sync 旧键清理、永不回写 sync、二次加载幂等）+ B5/B6（种子 fetch 失败不置位 INIT）全部通过。

### 2.2 【P2 · F-2】已打开标签页术语表热更新 — ✅ 随 F-1 自动兑现
- `content.js:1878-1885` 的 `storage.onChanged` local 分支监听 `dual_translate_glossary`，在术语表迁移到 local 后真正生效；`loadGlossary` 经消息走 `getGlossaryForDomain`，与存储区域一致。无代码行为风险（仅注释补充）。

### 2.3 【P2 · F-3/F-4】README 文档漂移 — ✅ 修复正确
- 版本号 v1.3.1 → v1.3.3（3 处）；PIN 算法「SHA-256 + 盐值」→「PBKDF2-HMAC-SHA256（10 万次迭代）+ 盐值」（安全性描述、代码审查状态、v1.0.13 历史小节共 3 处，历史小节正确保留「当时为 SHA-256」的表述）；存储说明补术语表位置与 sync 8KB 配额边界（F-8）。

### 2.4 【P3 · F-5】死常量与孤儿键清理 — ✅ 修复正确
- `API_STATUS_KEY` 常量已删除；全仓 grep 仅剩迁移注释与 `resetApiQuotaIfNeeded` 中的清理代码（`local.remove('dual_translate_api_status')`，try/catch 包裹不影响主流程）。模拟验证 A15：≤v1.0.7 孤儿键被清除。

### 2.5 【P3 · F-6】diagnose.js 手动密钥迁移工具语义 — ✅ 修复正确
- `migrateKeys` 改为与 `settings-manager._migrateSyncKeysToLocal`（settings-manager.js:387-431）逐行对照：合并语义（仅补 local 缺失的非空字段，不覆盖 local 已有值）、`custom_<id>` 供应商密钥迁移、迁移后 sync 中 `apiKeys` 删除与 `customProviders[].apiKey` 置空——三处逻辑与主迁移路径完全一致，语义漂移已消除。

### 2.6 【P3 · F-7】默认值双副本防漂移测试 — ✅ 落实
- `tests/consistency.test.js` 新增 `loadLegacyDefaults` + `deepCompare`，对 `LEGACY_DEFAULT_SETTINGS` 与权威副本做全量深度比对（数组逐项），漂移时输出差异路径。测试通过证明当前两副本零漂移。

### 2.7 【P3 · F-9/F-10】导入 null 剥离与报错文案 — ✅ 修复正确
- `_normalizeImportedSettings` 的 `stripNulls` 仅在 `api.apiKeys` 子树保留 null（v1.3.1 显式删除密钥契约不变，测试断言覆盖），其余 null 一律剥离不落盘；导入报错文案补「仅支持 v1.0.6 及之后导出的文件」。

## 3. 安全修复复核（P2 + P3）

### 3.1 【P2-1】诊断页明文展示自定义供应商密钥 — ✅ 修复正确
- `diagnose.js` `maskSensitiveFields` 统一处理 `api.apiKeys` 与 `customProviders[].apiKey`，在 `checkSync`（sync 存储检查）与 `checkSettings`（getSettings 消息）两处调用点均生效；原 else 分支语义保留（无 apiKeys 时显示空提示）。掩码非字符串值原样返回，空串返回空串，无崩溃路径。
- 【P3-1】`maskSecret` 对长度 ≤6 的密钥全遮蔽 `****`，与设置页 `maskApiValue` 语义一致。

### 3.2 【P2-2】设置页诊断工具存储型标记注入 — ✅ 修复正确（纵深双防线）
- **渲染侧**：设置概览三处数值字段（logLevel/batchSize/requestTimeout）补 `escapeAttr(String(...))`（options.js:3324-3326）；用量诊断 `limit` 先 `Number(...)` + `Number.isFinite` + `>0` 校验（options.js:3101-3102）。`escapeAttr` 在 lib 加载失败时仍有降级实现（options.js:8-18）。
- **写入侧**：`_normalizeImportedSettings`（settings-manager.js:869-913）对 `general.logLevel`（0-4 整数，否则回退 2）、`advanced.batchSize/requestTimeout/retryCount/retryInterval`（非有限数值或 <1 回退默认）、`api.quotaLimits[].limit`（非数字整条丢弃）归一，且在 `_assertSafeEndpoints` 之前执行——标记串无法再持久化进 storage。测试与模拟（C1-C4）均验证。
- 有效值不被误伤：模拟 C2/C3 确认合法 logLevel=3 导入后保留。

### 3.3 【P2-3】内置厂商端点域名白名单 — ✅ 修复正确，无误伤
- `BUILTIN_ENDPOINT_HOSTS`（settings-manager.js:307-317）与两处默认端点副本（settings-manager.js:277-285、api-metadata.js:22-32）逐一比对：**9 个内置厂商默认端点主机全部在白名单内**，出厂/升级用户默认保存不会被拒绝；localhost/127.0.0.1/[::1] 放行本机测试；`custom` 槽位与未知厂商名返回 true（不受限）；域名精确匹配（`hostname` 相等），后缀仿冒（`api.deepseek.com.evil.com`）被拒（测试断言覆盖）。
- 校验在 `_assertSafeEndpoints` 原有 https 校验之后追加，协议校验行为不变；模拟 C1 确认恶意导入整体被拒。

### 3.4 【P3-2】日志脱敏补齐 — ✅ 落实
- `background.js` `redactString` 追加 `AKLT[A-Za-z0-9]{12,}` 与 `\b[a-f0-9]{32}\b` 两个模式（火山 AKLT / 百度 secretKey 形态）。观察项：32 位十六进制模式较激进，任何 32 位 hex 字符串（如 git SHA 片段）都会被脱敏——属 fail-safe 方向，可接受，见 §5 备注。

### 3.5 【P3-5】更新检查下载域收紧 — ✅ 落实
- `safeUrl` 由任意 https 收紧为 `github.com`/`objects.githubusercontent.com` 白名单（与项目实际发布渠道一致），其余返回 `#`；调用点（下载按钮/发布说明链接）均经 `escapeAttr(safeUrl(...))` 双重处理。

### 3.6 密钥隔离链复验（沿 t2 审计口径）
- local 存储 / sync 剥离（saveSettings 不写 apiKeys 到 sync，模拟 A10-A11 复验）/ 导出脱敏（`exportAllSettings` 清 customProviders[].apiKey）/ PIN PBKDF2 均未受本批改动影响；新增的 diagnose 掩码与导入归一均朝收紧方向。

## 4. 模拟老版本存储数据专项回归（32/32 通过）

独立 harness（QA 临时脚本，不入库，验证后已删除）以与测试相同的沙箱方式加载 `lib/settings-manager.js`，模拟三组存储态：

- **场景 A（pre-1.0.6，v1.0.4/1.0.5 时代）**：sync settings 无 settingsVersion、旧字段名（`display.mode`、`whitelist`/`blacklist`）、sync 内嵌 apiKeys（baidu appId/secretKey + deepseek）+ customProviders、sync 术语表（全局+域名条目）、local 残留 ≤v1.0.7 孤儿键 `dual_translate_api_status`：
  - A1-A6 ✅ settingsVersion 归一为 1，`_deepMerge` 补齐全部新字段（defaultMode/advanced.batchSize=10/trigger/panelCollapsed），用户旧值（translationColor）保留；
  - A7-A13 ✅ sync 遗留 apiKeys 迁移到 local（含 `custom_old1`），sync 中密钥剥离、customProviders apiKey 置空，迁移后密钥在活跃 settings 中可见可用；
  - A15 ✅ 孤儿键清除；A16-A19 ✅ 术语表 sync→local 迁移（域名条目保留、sync 旧键清理、全程不回写 sync）；
  - A20-A21 ✅ 二次 loadSettings/getGlossary/resetApiQuotaIfNeeded 完全幂等，无数据漂移。
- **场景 B（v1.3.1 → v1.3.3）**：settingsVersion=1 但缺 rules/trigger/advanced/general/apiEndpoints/quotaLimits 等新字段：
  - B1-B4 ✅ 加载无错、新字段全部补默认（`advanced.retryCount=1`、`trigger.excludeList` 100+ 默认站点）、用户值保留；
  - B5-B6 ✅ 全新安装且种子 fetch 失败时返回空表且**不置位 INIT**（下次自动重试）。
- **场景 C（导入 v1.0.6 格式导出文件）**：
  - C1 ✅ 恶意导入（baidu_llm 端点改为 `fanyi-api.baidu.com.evil.example.net`）被白名单整体拒绝；
  - C2-C3 ✅ 官方端点 + 合法 logLevel 的旧格式导入成功且值保留；
  - C4 ✅ 非数字 quota limit 条目被丢弃；C5 ✅ 导入的 glossary 经 local 持久化。

## 5. 交叉检查与观察项（非阻塞，供 captain 知悉）

1. **32-hex 脱敏模式较宽**：`\b[a-f0-9]{32}\b` 会误伤日志中合法的 32 位十六进制串（如内容哈希）。方向为 fail-safe（多脱敏不泄露），建议未来批次若日志可用性受损再考虑收紧上下文（如仅在 key/value 参数形态中匹配）。无需本批处理。
2. **`_normalizeImportedSettings` 的 null 剥离不递归数组元素**（如 `excludeList: [null]` 数组内的 null 会保留）。属原审计 F-9 范围之外的边缘形态，v1.3.1 起导出文件不含此类值，风险极低。可在后续维护批补齐。
3. **诊断页 `checkLocal` 的 apiKeys 掩码遍历**：若某 API 的密钥对象内混有非字符串字段（现状均为字符串），`maskSecret` 原样返回——行为与旧版一致，无回归。
4. **EOL**：`git diff --check` 报告的 trailing whitespace 为 CRLF 行尾（仓库主流约定）；`background.js`（141 行）与 `lib/settings-manager.js`（327 行）的 LF-only 行在基线 commit `cf2d4e9` 中即已存在（历史遗留），本次 diff **未新增任何 LF-only 行**（新增行全部 CRLF，与所在文件主流一致），无换行符噪音污染。

## 6. 验证结论

| 验收项 | 结果 |
|---|---|
| 1. `npm run verify`（17 文件语法检查 + 4 个测试文件）全部通过 | ✅ |
| 2. P1/P2 修复点逐项复核（补丁前后对照），兼容与安全双维度，未引入回归 | ✅ 9/9 |
| 3. 模拟老版本存储数据走加载/迁移逻辑（sync 遗留 apiKeys / 无 settingsVersion / 缺新字段 / 旧导出导入） | ✅ 32/32 |
| 4. 验证报告产出（本文件） | ✅ |

**t3 修复批通过质量验证，可提交。** 工作树当前待提交内容：11 个代码/文档改动 + 2 份审计报告（`maintenance/compat-review-1.3.3.md`、`maintenance/security-review-1.3.3.md`）+ 本验证报告。
