# 版本兼容性审计报告（v1.3.2 → v1.3.3 维护批）

- 审计人角色：compat-auditor（版本兼容性审计员）
- 日期：2026-09-21（v1.3.2 基线）
- 仓库：`dual-translate-extension` @ commit `cf2d4e9`（v1.3.2，工作树干净）
- 审计范围：1.2.x / 1.3.0 / 1.3.1 → 1.3.2 升级路径、设置迁移（`settingsVersion`/`migrateSettings`/`_migrateSyncKeysToLocal`）、`dual_translate_*` 存储键跨版本读写一致性、options 导出/导入格式前后兼容、chrome.storage sync/local 遗留数据与 PIN 数据兼容、CHANGELOG/README 版本承诺与实际行为一致性。
- 审计方法：git 历史（v1.2.14…v1.3.2 各 tag 差异）+ 根目录三个 release zip 与 git tag 的逐文件哈希比对 + 代码走读 + 本地测试套件运行 + 关键数据结构程序化比对（LEGACY_DEFAULT_SETTINGS vs api-metadata DEFAULT_SETTINGS 深度比对）。
- 本报告仅审计，未修改任何代码。

## 0. 结论摘要

| 级别 | 数量 | 编号 |
|------|------|------|
| P1（高危：静默数据丢失/承诺功能失效） | 1 | F-1 |
| P2（中危：行为与文档承诺不符/体验缺陷） | 3 | F-2 ~ F-4 |
| P3（低危：遗留数据残留/防御不足/文档漂移） | 6 | F-5 ~ F-10 |

升级路径总体健康：`settingsVersion` 全系保持 1，迁移幂等；`_deepMerge` 保留旧字段并以默认值补齐新字段（如 v1.3.0 新增 `display.panelCollapsed` 对 1.2.16 升级用户自动补默认）；导出/导入格式自 v1.0.6 起向后兼容；PIN 旧 SHA-256 哈希可平滑升级为 PBKDF2；legacy sync apiKeys → local 迁移链路完整且有测试覆盖。核心问题集中在 **chrome.storage.sync 单项 8KB 配额与术语表（glossary）的冲突** 及若干文档/监听器漂移。

---

## 1. P1 发现

### F-1【P1】默认术语表超出 chrome.storage.sync 单项配额：种子写入静默失败，默认术语永久丢失；超限用户术语表编辑被静默丢弃

**事实链**：

1. `config/default-glossary.json` 实测 **160 条、紧凑 JSON ≈ 11,020 字节**（文件本体 12,400 字节，自首个 git snapshot 起未变过）。而 `chrome.storage.sync` 的单条目配额 `QUOTA_BYTES_PER_ITEM = 8,192` 字节（`unlimitedStorage` 权限只解除 local 配额，对 sync 无效）。
2. 首次初始化路径 `lib/settings-manager.js:934-946`（`getGlossary()`）：
   ```js
   const wrapped = { _global: defaults };
   await chrome.storage.sync.set({ [GLOSSARY_KEY]: wrapped, [GLOSSARY_INIT_KEY]: true }); // 11KB > 8KB，必然 QUOTA_BYTES_PER_ITEM 拒绝
   ...
   } catch {}
   await chrome.storage.sync.set({ [GLOSSARY_INIT_KEY]: true });   // 兜底：只写入 init 标记
   return { _global: [] };
   ```
   `catch {}` 吞掉配额错误后仍写入 `dual_translate_glossary_initialized = true`。此后所有 `getGlossary()` 命中"init 已置位但 glossary 键不存在"分支（settings-manager.js:927-933），**永远返回空术语表** —— README.md:13/107 宣称的"内置 100+ 专业术语"实际从未生效（对全新安装用户与从未成功落盘的老用户均如此）。
3. 用户编辑路径：`lib/settings-manager.js:988` `saveGlossary()` 同样写入 sync。术语表一旦超过 8KB（默认表本身 11KB，域名 scope 累积后很容易超），`chrome.storage.sync.set` 拒绝并抛错；而 `options/options.js` 中 8 处 `saveGlossary()` 调用点（785、858、882、941、953、990、1001、1013 行）均为 `.catch(e => console.warn(...))`，**失败只进控制台，UI 仍提示"已保存"** —— 用户编辑被静默丢弃（数据丢失）。（第 9 处 913 行在"恢复默认"流程内，有 alert，见下条。）
4. 唯一会向用户暴露错误的是"恢复默认术语表"按钮（options.js:898-918，有 try/catch + alert），但报出的是 Chrome 原始配额错误文案，用户无法理解。

**影响**：跨所有版本（自 v1.0.4 引入 glossary 起）存在，1.2.x→1.3.2 升级用户同样受影响（其 INIT 标记已置位、glossary 键从未成功写入或早已超限）。属于"文档承诺功能实际失效 + 用户数据静默丢失"。

**建议修复**（供 1.3.3 维护批参考，均需另行评审）：
- 将术语表迁移到 `chrome.storage.local`（需同步更新 README"sync 存配置"的表述，或说明术语表为设备本地）；迁移时兼容读取旧 sync 键；
- 或按 scope 拆分为多个 sync 条目（`dual_translate_glossary_<scope>`，每条 < 8KB），保留跨设备同步能力；
- 至少：`getGlossary()` 种子失败时不要置位 INIT，或捕获配额错误后降级为"运行时直接读取打包文件 default-glossary.json"而不落盘；`options.js` 所有 `saveGlossary()` 失败必须走 `showSaveError()`/alert 告知用户，禁止 `console.warn` 吞掉。

---

## 2. P2 发现

### F-2【P2】content.js 术语表热更新监听器监听了错误的存储区域 —— CHANGELOG v1.2.15 的承诺未兑现

- `lib/settings-manager.js:988`：`saveGlossary()` 写入 **sync** 区域（`dual_translate_glossary` 自首个 snapshot 起就在 sync）。
- `content.js:1874-1884`：`chrome.storage.onChanged` 监听器只在 **local** 分支处理 `changes.dual_translate_glossary`（1881 行，v1.2.15 fix C-2 引入）；sync 分支（1859-1873）只处理 `dual_translate_settings`。
- 结果：用户在设置页修改术语表后，**已打开的标签页永远不会收到术语表刷新**，必须手动刷新页面。
- CHANGELOG.md:144（v1.2.15）明确承诺"修复 glossary 变更不刷新：chrome.storage.onChanged 现在监听 dual_translate_glossary 变化，实时重新加载术语表，无需刷新页面"——**承诺与实际行为不符**。

**建议修复**：在 sync 分支同时处理 `changes.dual_translate_glossary`（与 `dual_translate_settings` 并列），或将监听统一到 glossary 实际所在的区域；补一条回归测试。

### F-3【P2】README"当前版本"标注停留在 v1.3.1，违反自身发布检查清单

- `README.md:5`："当前版本：**v1.3.1**"，而 `manifest.json`/`package.json` 均为 1.3.2；CHANGELOG 已有 v1.3.2 条目。
- README.md:329-333 自述的发布检查清单第 3 条要求"每次版本升级必须同步更新 README 顶部「当前版本」"——v1.3.2 发布时遗漏。
- 根目录 `dual-translate-extension_v1.3.2.zip`（用户实际下载物）内的 README 同样是 v1.3.1（已逐文件哈希比对，zip 与 git HEAD 仅 CRLF 差异，内容一致），即发布物同样带着过期版本号。
- 用户按 README 判断是否需要更新时会得到错误结论。

**建议修复**：README.md:5 更新为 v1.3.2（若 1.3.3 发布则直接标 1.3.3），并考虑在 CI（`.github/workflows/ci.yml`）加一条"manifest/package/README 版本号一致性"检查防止再漏。

### F-4【P2】README 多处仍宣称 PIN 使用"SHA-256 + 盐值哈希"，与 v1.2.16 起的实际 PBKDF2 实现不符

- 实际实现：`lib/settings-manager.js:29-30, 1381-1398` —— PBKDF2-HMAC-SHA256、100,000 次迭代，旧 SHA-256 哈希验证通过后自动升级（1305-1325 行，兼容性处理正确且有测试）。
- 过期表述：`README.md:148`（"PIN 码使用 SHA-256 + 盐值哈希存储"）、`README.md:242`、`README.md:263`（历史条目）。
- CHANGELOG v1.2.16 已正确记录升级，但 README 现行安全承诺部分（147-149 行的"数据与隐私"章节）未跟进，**低估了实际安全强度**，属于安全文档漂移。

**建议修复**：README.md:148 改为"PBKDF2-HMAC-SHA256（10 万次迭代）+ 盐值"；242/263 为历史版本记录可保留原貌但建议加注。

---

## 3. P3 发现

### F-5【P3】`API_STATUS_KEY = 'dual_translate_api_status'` 为死常量；旧单键状态数据（≤v1.0.7 格式）从未迁移也从未清理

- `lib/settings-manager.js:19` 定义后全文件无任何读写（`getApiStatus/saveApiStatus` 实际使用 per-API 的 `apiStatus_<name>` local 键，见 1014-1048 行）。
- git 考古：v1.0.7 及之前状态存于单键 `dual_translate_api_status`（background.js 当年读写过，见 `26898f0:background.js:307-312`）；v1.0.13-15 期间改为 per-API 键，**未提供旧键清理或迁移**。≤1.0.7 升级用户的 local 存储中将永久残留该孤儿键（值不大，且 `unlimitedStorage` 无配额压力，属数据卫生问题；旧状态语义上也无需迁移——旧 quota_exceeded 标记被丢弃反而无害）。
- 建议：删除死常量；在 `resetApiQuotaIfNeeded` 或一次性迁移中 `chrome.storage.local.remove('dual_translate_api_status')`。

### F-6【P3】diagnose.js 的手动密钥迁移工具与 settings-manager 迁移语义不一致，可能用旧 sync 值覆盖新 local 值

- `diagnose.js:142-163`（`migrateKeys`）：`chrome.storage.local.set({ [LOCAL_API_KEYS_KEY]: apiKeys })` **整体覆盖** local 键，且不处理 `custom_<id>` 供应商密钥；
- 对照 `lib/settings-manager.js:369-413`（`_migrateSyncKeysToLocal`）：仅以非空值补齐 local、不覆盖 local 已有非空值，并处理 customProviders。
- 场景：v1.0.6 迁移部分失败/中断的用户，sync 中残留旧密钥而 local 已有新密钥；用户在诊断页点"迁移密钥"会把 local 的新密钥**回滚**成 sync 的旧值（有 confirm 弹窗，故降为 P3）。
- 建议：diagnose 的迁移复用 settings-manager 的合并语义，或直接调用其 `_migrateSyncKeysToLocal`。

### F-7【P3】DEFAULT_SETTINGS 双副本防漂移测试覆盖过弱

- `lib/settings-manager.js:34-269`（LEGACY_DEFAULT_SETTINGS，fallback 副本）与 `lib/api-metadata.js:64-175`（权威副本）当前**经程序化深度比对完全一致**（本次审计验证，含数组逐项）。
- 但 `tests/consistency.test.js:159-163` 只断言了 `display.panelCollapsed === false` 一个字段——v1.3.2 刚因该漂移出过问题（api-metadata 漏 panelCollapsed），回归网却只盖住这一个点。
- 建议：测试改为对两副本做全量深度比对（可复用本审计的 diff 逻辑），任何字段漂移直接 fail。

### F-8【P3】`dual_translate_settings`（sync）单项体积余量有限，超限时保存失败缺少防护与文档

- 默认值紧凑 JSON 实测 **4,242 字节**，配额 8,192 字节，余量约 3.9KB。`customProviders`（每条约 200B）+ `quotaLimits` + 用户自增 `excludeList` 累积后可超限；超限时 `chrome.storage.sync.set` 抛错会沿 `saveSettings` 上抛（background.js:383-393 有 catch 并回传 UI），用户至少能看到失败，但无预防性提示。
- 建议：文档标注限制；或保存前估算体积，超限时提示；长期可考虑把 customProviders 等大字段迁往 local（apiKeys 已是先例）。

### F-9【P3】导入路径对非 apiKeys 字段的 null 值无校验，null 会原样落盘

- `applyImportedSettings`（settings-manager.js:830-857）仅校验 apiPriority/enabledApis/customProviders/excludeList/requestTimeout 的类型；`_deepMerge` 对 null 直接透传。恶意/畸形导入文件写 `trigger.autoTranslate: null`、`display.defaultMode: null` 等会被持久化到 sync，随后依赖 falsy 语义的代码（如 `shouldAutoTranslate`，settings-manager.js:1236）行为改变。
- v1.3.1 的 null 语义仅对 `api.apiKeys` 有意引入（显式删除），其余字段无此契约。
- 建议：`applyImportedSettings` 对顶层已知分组做 null 剥离或类型校验。

### F-10【P3】pre-v1.0.6 导出文件被拒绝的提示不够明确

- `options/options.js:2282`：`if (!data.version) throw new Error('文件格式无效（缺少 version 字段）')`。v1.0.6 之前的导出文件没有 `version` 字段，会被拒。1.2.x→1.3.2 场景无影响（v1.0.6 起格式稳定：`{version, exportedAt, settings, glossary, customPrompt}`，`glossary`/`customPrompt` 缺省时导入端有守卫，向后兼容良好）。
- 建议：错误文案补充"仅支持 v1.0.6 之后导出的文件"。

---

## 4. 验证通过的兼容性项（正向清单）

| 项 | 结论 | 证据 |
|----|------|------|
| settingsVersion 迁移（0→1，幂等） | ✅ | settings-manager.js:330-339；version 非 integer（含缺失/字符串）归 0 后补 1；版本不一致时落盘（361-363） |
| 旧字段保留 / 新字段补默认 | ✅ | `_deepMerge`（667-678）保留 UI 不再绑定的 legacy 字段（tooltipDelay、trigger.shortcutKey、rules.translateUI 等有意保留）；1.2.16→1.3.0 新增 `display.panelCollapsed` 对老用户经默认合并补齐 |
| sync apiKeys → local 迁移（含 customProviders） | ✅ | settings-manager.js:369-413（非空合并、不覆盖 local、sync 清除）；`reloadApiKeys` 的 sync 回退（455-534）；v1.0.7 废弃 API（tencent）清理（632-665） |
| PIN 跨版本兼容 | ✅ | v1.2.15 及更早 SHA-256 哈希验证通过后自动升级 PBKDF2（settings-manager.js:1305-1325）；tests/settings-manager.test.js 覆盖 |
| 导出格式（无密钥） | ✅ | background.js:527-551：剥离 apiKeys 与 customProviders[].apiKey；`{version:1, exportedAt, settings, glossary, customPrompt}` 自 v1.0.6 稳定 |
| 导入格式（旧文件、防污染） | ✅ | options.js:2266-2298 + settings-manager.js:830-857：__proto__/constructor/prototype 过滤、端点 HTTPS 强校验、合并语义（导入不删除文件中缺失的新字段，1.2.x 旧导出文件可安全导入 1.3.2） |
| 恢复默认设置 | ✅ | options.js:2308-2395：从权威 DEFAULT_SETTINGS 出发，保留 apiKeys/customProviders/端点/模型/glossary/PIN/hasCompletedWelcome |
| content-script 可写路径白名单 | ✅ | background.js:307：`general.translationEnabled / general.lastMode / display.defaultMode / display.panelCollapsed`（v1.3.1 增补 panelCollapsed，与 content.js 写入一致） |
| storage.onChanged apiKeys 保护 | ✅ | content.js:1853-1873：sync 变更时保留 local apiKeys 引用（v1.2.13 Bug #4 修复仍有效） |
| 术语表 legacy 数组格式 | ✅ | settings-manager.js:929-930：旧 array 格式自动包 `{_global: [...]}`（受 F-1 配额问题影响的除外） |
| 日/月用量与配额重置标记 | ✅ | `dual_translate_daily_usage._date`(toDateString) 与 `dual_translate_reset_month`(YYYY-MM) 格式跨版本稳定；v1.0.10 前旧格式月份值不匹配 → 触发一次月度重置（无害自愈） |
| release zip 与 git tag 一致性 | ✅ | 三个 zip 与对应 tag/HEAD 逐文件 SHA-256 比对：仅 CRLF 换行差异，内容一致；zip manifest 版本号 1.3.0/1.3.1/1.3.2 正确 |
| settings-manager 跨版本差异 | ✅ | v1.2.16→v1.3.0：+panelCollapsed；v1.3.0→v1.3.1：+null 显式删除密钥；v1.3.1→v1.3.2：无差异（本文件三版本间仅 ~16 行变更，无 schema 变更） |

## 5. 测试与证据

执行的验证命令（均在 `dual-translate-extension` 下）：

| 命令 | 结果 |
|------|------|
| `node tests/model-name.test.js` | 28/28 passed |
| `node tests/settings-manager.test.js` | passed（覆盖 sync→local 密钥迁移、null 删除密钥、PIN PBKDF2 及旧哈希升级） |
| `node tests/consistency.test.js` | passed |
| `node tests/api-manager.test.js` | passed |
| 程序化比对 LEGACY_DEFAULT_SETTINGS vs api-metadata DEFAULT_SETTINGS | 逐字段一致（含数组顺序） |
| 实测 DEFAULT_SETTINGS 紧凑 JSON | 4,242 B（配额 8,192 B） |
| 实测 { _global: default-glossary } 紧凑 JSON | 11,020 B（**超**配额 8,192 B → F-1） |
| zip ↔ tag 哈希比对（10 个关键文件 × 3 版本） | 仅 CRLF 差异 |

## 6. 附录：各版本设置相关变更（git 考古摘要）

- **v1.2.14**：引入 `settingsVersion` + `migrateSettings` 幂等迁移；customProviders 密钥 sync→local；导入路径复用密钥隔离。
- **v1.2.16**：PIN 升级 PBKDF2（带旧哈希自动升级）；端点 HTTPS 强校验下沉到 saveSettings/applyImportedSettings。
- **v1.3.0**：`display.panelCollapsed` 新增（LEGACY 副本）；导出/导入 UI 增强；无 schema 变更。
- **v1.3.1**：`saveSettings` 密钥合并支持 null 显式删除；content-script 白名单加 panelCollapsed；'all'→'auto' 源语言归一。
- **v1.3.2**：api-metadata 权威副本补 panelCollapsed（漂移修复）；settings-manager 无变更。

—— 以上 findings 建议在 1.3.3 维护批中按 P1 → P2 → P3 顺序排期修复；F-1 涉及存储区域迁移，需与安全审计（密钥/数据泄露面）协调评审。
