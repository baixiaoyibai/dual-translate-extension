# dual-translate-extension v1.3.0 安全审查报告（任务 t2 · security-auditor）

- 审查对象：`D:\Tools\edge_translater\dual-translate-extension`（MV3 扩展，git tag `v1.3.0`，commit `28a434c`）
- 审查范围：`manifest.json`、`background.js`、`content.js`、`options/options.*`、`popup/popup.*`、`welcome/welcome.*`、`diagnose.html`、`lib/*.js`（含 `api-adapters/*`）、`config/default-glossary.json`、`package.json`
- 对比基线：仓库外历史报告 `project-audit-report.md` 与 `security-report-t2.md`（v1.2.15 结论：严重 0 / 高 0 / 中 3 / 低 8）
- 审查方式：`git diff e6bb6cc(v1.2.16)..28a434c(v1.3.0)` 变更面审 + 全仓静态扫描（eval/innerHTML/密钥/端点/CSP/依赖）+ 只读，未实际向第三方端点发起请求。

## 结论先行

**v1.3.0 赋能层（新增 526 行/改 86 行）：未引入新的 S/A/B 级安全问题；上一版 3 个中危项（M1 权限收窄 / M2 PIN 慢哈希 / M3 端点 HTTPS 校验）已在 v1.2.16 落地并在 v1.3.0 源码中核实，无旧问题复发。**

严重度分布：**S（严重）0 / A（高）0 / B（中）0 / C（低·信息·观察）9 项**。其中 C1–C4 为历史低危项在 v1.3.0 中仍未修复（续保），C5–C7 为信息/平台特征项，C8–C9 为本次新增待跨组核实的非安全观察。

---

## 一、回归对比：v1.2.15 中危 3 项是否修复 / 复发

| 旧编号 | 旧结论 | v1.3.0 现状 | 判定 |
|---|---|---|---|
| M1 全站点 `<all_urls>` | `manifest.json:26,39` 过度申请 | `manifest.json:26,38-40` 已收窄为 `content_scripts.matches` 与 `host_permissions` 均为 `["http://*/*","https://*/*"]`；`web_accessible_resources.matches`（54-59）同步为 http/https | ✅ 已修复，无复发 |
| M2 PIN 快速 SHA-256 可离线爆破 | `settings-manager.js:1304-1311` | `settings-manager.js:28-30,1373-1390` 改为 PBKDF2-HMAC-SHA256（100000 次迭代，`crypto.subtle.deriveBits`），旧 SHA-256 哈希验证成功后自动升级（1297-1317），恒定时间比较保留（1334-1339） | ✅ 已修复，无复发 |
| M3 端点 HTTPS 校验不覆盖落盘路径 | 仅 UI/导入层 | `settings-manager.js:680-720` 新增 `_isEndpointAllowed`/`_assertSafeEndpoints`，并在 `saveSettings`（735-736）与 `applyImportedSettings`（843-844）统一强制 `https://`（`localhost`/`127.0.0.1`/`[::1]` 例外） | ✅ 已修复，无复发 |

补充核实（密钥隔离链，均正常）：
- content script 的 `getSettings` 返回剥离 `apiKeys` 与 `customProviders[].apiKey` 的深拷贝（`background.js:325-346`）；`exportAllSettings` 清除密钥（522-532）；诊断页掩码显示。
- 密钥仅存 `chrome.storage.local`（键 `dual_translate_api_keys_local`，`settings-manager.js:23`），写 `sync` 前剥离密钥（787-809）。
- 动态渲染全部走 textContent / escapeContent / escapeAttr，生产代码无 `eval` / `new Function` / `document.write` / `insertAdjacentHTML`（仅 `tests/` 测试夹具含 `new Function`，非运行时）。

---

## 二、风险分级清单

### 🔴 S · 严重（0 项）
无。

### 🟠 A · 高（0 项）
无。

### 🟡 B · 中（0 项）
上一版 3 个中危已全部修复，且本轮未发现需要按中危处置的新问题。

### 🟢 C · 低 / 信息 / 观察（9 项）

**C1（续保低危）：更新检查 `tag_name` 未转义直插 innerHTML**
- 文件:行号：`options/options.js:2433-2454`（`latestVersion` 由 `data.tag_name` 派生后拼入 `<code>v${latestVersion}</code>`，未过 `escapeAttr`）
- 漏洞描述：GitHub release 的 `tag_name` 字段未经转义进入 `showUpdateStatus` 的 `innerHTML`。
- 可利用条件：当前受 GitHub 发布时间标签字符集约束（仅 `[0-9A-Za-z._-]`），实际无法注入 `<>&"'`；仅当 GitHub 侧数据被污染/替换时才可能，属纵深防御缺口，非可利用。
- 复现/验证：`node --check` 通过，代码路径仅能读到 `latestVersion`；无法在真实 GitHub 数据上触发注入。
- 修复建议：`latestVersion` 同样套 `escapeAttr()`，与 2463-2464 行的 `downloadUrl`/`releaseUrl` 处理保持一致。

**C2（续保低危）：运行时日志字符串参数不脱敏**
- 文件:行号：`background.js:72-93`
- 漏洞描述：`_pushLog` 的 `redact` 仅对对象键名（`apiKey/secretKey/token/password/...`）置 `[REDACTED]`；`typeof a === 'string'` 的字符串参数原样写入环形日志缓冲（90-91 行），诊断页日志查看器可读到。
- 可利用条件：若某处 `console.warn('sk-...')` 或适配器把密钥以字符串参数形式打印，密钥会入日志缓冲（仅扩展自身诊断页可读，非网页上下文）。
- 复现/验证：`background.js:90-91` 无字符串掩码逻辑；`_getLogEntries` 原样导出。
- 修复建议：对 `≥16 位` 且命中 `sk-`/`AKIA`/长 base64/`Bearer` 模式的高熵字符串也做掩码（保留短路径信息不破坏排障）。

**C3（续保低危）：`applyTranslationStyles` CSS 变量写入无白名单兜底**
- 文件:行号：`content.js:562-568`
- 漏洞描述：`settings.display.translationColor/Size/Spacing/Font` 直接 `root.style.setProperty(...)` 写入 CSS 变量，存储层无校验，目前依赖 options UI 的正则；异常设置值可被注入样式属性（如 `;background:url(http://...)` 之类被赋值到 custom property 时实际为字符串，风险有限）。
- 可利用条件：需先篡改 `chrome.storage`（另一扩展/恶意导入/手工 devtools 改写），再由 content script 应用；属纵深防御缺口。
- 复现/验证：`content.js:565-568` 无正则/白名单兜底。
- 修复建议：在 content.js 侧同样对 `translationColor`（`#hex`）、`translationSize/Spacing`（数值+单位）、`translationFont`（字体名白名单）做校验后再写入。

**C4（续保低危）：`options.js` 的 `escapeAttr` 降级回退少转义单引号**
- 文件:行号：`options/options.js:9-17`（回退函数只转义 `& " < >`，缺 `'`；对比 `lib/escape-utils.js:13-20` 完整 5 实体）
- 漏洞描述：仅当 `lib/escape-utils.js` 加载失败、`window.escapeAttr` 缺失时才启用回退；当前所有属性上下文均为双引号包裹，单引号缺失暂无处利用。
- 复现/验证：`options.html` 已正常加载 `escape-utils.js`，回退函数实际为死代码路径。
- 修复建议：回退函数补齐 `'` 转义（`.replace(/'/g,'&#39;')`），与 `escape-utils` 完全一致。

**C5（信息·属正向基线）：`web_accessible_resources` 暴露 `default-glossary.json`**
- 文件:行号：`manifest.json:54-59`
- 漏洞描述：全 http(s) 站点可 fetch `chrome-extension://<id>/config/default-glossary.json`。
- 风险评估：已全量审阅 `config/default-glossary.json`（163 行），内容为游戏术语表，**无任何密钥/凭据/个人信息**；配合固定扩展 ID 可被站点读取，但泄露面为零。
- 修复建议：维持现状即可；唯一约束是**确保未来任何版本不要把密钥/私有配置写入该文件**。

**C6（信息·平台特征）：密钥明文存 `chrome.storage.local`**
- 文件:行号：`lib/settings-manager.js:23,754-809`
- 漏洞描述：密钥未加密落盘（浏览器扩展平台常态），但已从 `sync` 剥离、绝不跨设备同步，PIN 已升级 PBKDF2。
- 风险评估：拿到浏览器 profile 的本地进程仍可读明文密钥，属主机级攻击面；PIN 仅防误操作/临时窥屏，不应被宣传为加密保护。
- 修复建议：README/设置页明示；长期可选 WebCrypto 加密（成本高，非本版本必需）。

**C7（信息·设计取舍）：自定义供应商允许任意 HTTPS 端点（Bearer 直发密钥）**
- 文件:行号：`lib/settings-manager.js:683-695,711-718`；`lib/api-adapters/llm-generic.js:42-47`；`lib/api-registry.js:167-179`
- 漏洞描述：`_assertSafeEndpoints` 只强制 `https://`，不限制域名归属；导入或配置的 custom provider 端点指向 `https://attacker.example` 时，翻译请求会把该 provider 的 API Key 以 `Authorization: Bearer` 发往该端点（"自带端点"功能）。
- 风险评估：这是"用户自备 API 端点"功能的本性，v1.2.16 已堵住最有危害的 `http://` 明文外发路径；剩余风险是"导入不可信设置文件 + 使用其中配置的密钥"的社会工程场景，非代码漏洞。
- 修复建议：设置页/导入对话框明确提示"仅从可信来源导入设置"，可选对内置厂商（baidu/deepseek/glm/...）端点做域名白名单，自定义供应商保持任意 HTTPS。

**C8（本次新增·非安全观察，跨组转发）：`panelCollapsed` 持久化被 content-script 白名单拦截**
- 文件:行号：`content.js:1584-1587` 发送 `updateSettings {path:'display.panelCollapsed'}`；`background.js:301-303` `allowedPaths` 仅 `['general.translationEnabled','general.lastMode','display.defaultMode']`
- 描述：v1.3.0 新增"对照面板折叠状态持久化"，但 content script 发起的 `updateSettings` 路径 `display.panelCollapsed` 不在安全白名单内，被 `Permission denied` 拒绝 → 折叠状态跨会话**不会持久化**，与 CHANGELOG 宣称不符。
- 处置建议：属交互逻辑缺陷，交由 interaction-auditor 定级；安全侧建议——若需放行，把 `display.panelCollapsed` 显式加入 allowedPaths（该字段非敏感，放行无安全影响）。

**C9（本次新增·非安全观察，跨组转发）：NO_API「打开设置」横幅可能因后台错误掩码而失效**
- 文件:行号：`content.js:1442-1448`（`errMsg.includes('NO_API')` 决定 `showSettings`）；`background.js:768-770`（非扩展 sender 一律返回通用 `'翻译失败，请重试'`）
- 描述：v1.3.0 的 NO_API 引导入口依赖 `errMsg` 命中 `NO_API`，但 `translateTexts` 对 content script 已把原始错误掩码为通用文案，`NO_API` 可能永远不会到达 content script，导致新引导按钮不触发。
- 处置建议：属交互逻辑缺陷，交由 interaction-auditor；安全侧无风险（掩码方向是对的，只是与前端 UI 契约脱节）。建议在 background 对 content script 返回一个**脱敏的错误码**（如 `NO_API`/`QUOTA` 枚举），而非完整 message，兼顾可用性与不泄密。

---

## 三、逐项核查记录（供回归留档）

### 1) manifest 权限最小化 ✅
- `permissions`：`storage / activeTab / contextMenus / unlimitedStorage`（manifest.json:32-37），无 `scripting`。
- `host_permissions` 与 `content_scripts.matches`：均已收窄为 `http(s)`（38-40, 26），无 `file/ftp`。
- `CSP`：`script-src 'self'; object-src 'self'`（42-44），无 `unsafe-eval`。
- `externally_connectable` 缺省 → 外部网页无法直呼 background（保持）。
- 备注：`unlimitedStorage` 属可选项（配合 translation-cache 明文 3 天缓存，见历史低危 8），非必需但风险低，暂列信息。

### 2) API Key 存储与读取 ✅
- 密钥单独存 `chrome.storage.local`（`dual_translate_api_keys_local`），不同步；custom provider 的 `apiKey` 写 sync 前清空。
- `getSettings`/`exportAllSettings`/诊断页均无密钥外泄路径（已核实 `background.js:325-346,522-532`）。
- PIN：PBKDF2-HMAC-SHA256·100000 迭代 + 随机 salt + 恒定时间比较 + 60s/5 次冷却（`settings-manager.js:1258-1390`），旧 SHA-256 平滑升级。

### 3) XSS 与注入清点 ✅
- 生产代码无 `eval/new Function/document.write/insertAdjacentHTML`（扫描仅命中 `tests/` 夹具）。
- content.js：`escapeContent` 5 实体（`content.js:1623-1625`）；本次新增 `humanizeTranslateError` 的返回一律经 `escapeContent`（473/514）或 textContent（1570/1721）落地；标题/alt 用 `setAttribute`（1162-1164）；hover/面板/选区译文均 textContent 或 escapeContent。
- options.js：本次新增的 gloss导出文件名、`activateTabByName` 选择器、`checkAllApiCompleteness` 横幅、`apiIncompleteText` 均为内部值或 textContent，无注入面；`renderGlossaryTable` 对 entry.source/target 用 `escapeAttr`（941-944）。
- popup.js：新增 `humanizeTranslateError` 结果用 `textContent` 赋值（511-525）；新增 `container.innerHTML` 两处为**纯静态字符串**（159/164），无插值。
- welcome.js：`notice.textContent` 赋值（新增检测逻辑），无 innerHTML。
- 结论：v1.3.0 增删面未引入新 XSS。

### 4) 外部网络请求 ✅
- 全部请求在 background SW 发起；content script 仅发 runtime 消息，密钥不进页面上下文。
- 厂家端点默认值全部 `https://`（`settings-manager.js:276-284`）；用户可编辑端点经 `_assertSafeEndpoints` 强制 https（含导入路径）。
- 更新检查：`https://api.github.com/...`（`options.js:2417`），下载链接过 `safeUrl`（2504 起）+ `escapeAttr`。
- 认证：百度 MD5 签名、火山 V4 HMAC（secret 不上行）、LLM 系 Bearer；无内置共享密钥（全仓扫描 `sk-/AKIA/Bearer 长密文` 无命中）。

### 5) 供应链与发布面 ✅
- `package.json` 零第三方运行时依赖（无 `dependencies`）。
- 发布 zip `dual-translate-extension_v1.3.0.zip` 共 34 项，**仅生产文件**（无 `tests/`、`node_modules/`、`config/api-keys.json`、`*.md` 报告、`.git`）；zip 内 `manifest.json` 版本 `1.3.0` 与 git HEAD 一致。
- `config/default-glossary.json` 与 `config/llm-prompt.txt` 均无敏感信息。

### 6) 回归验证（只读，未发起第三方请求）
- `node --check` 覆盖 background/content/popup/options/welcome/settings-manager 全部通过（SYNTAX OK）。
- `npm test`：`model-name` 28/28、`settings-manager`（迁移/密钥隔离/PBKF2）、`consistency`（双实现转义与中文检测一致性）全部通过。

---

## 四、给下游（maintenance-engineer / qa-verifier）的交接

1. **安全侧无 S/A/B 问题，无需修复性改动**；可直接进入低风险维护流程。
2. 可选随手加固（均 C 级，风险低、改动小）：C1 补 `escapeAttr`、C2 字符串日志掩码、C3 CSS 变量兜底、C4 降级函数补单引号。
3. 跨组转发（非安全，但影响 v1.3.0 宣称的功能）：C8 `panelCollapsed` 白名单放行、C9 NO_API 错误码契约——请 interaction-auditor 定级后交由 maintenance-engineer 修复。

*报告生成：security-auditor，任务 t2，attempt 9ae35e36-9743-41a2-8a4d-17592f99dfaa*