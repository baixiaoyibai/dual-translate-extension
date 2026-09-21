# dual-translate-extension v1.3.3 维护批 · 用户安全审计报告（任务 t2 · security-auditor）

- 审计对象：`D:\Tools\edge_translater\dual-translate-extension`（工作区，git HEAD `cf2d4e9` = v1.3.2，工作树干净）
- 审计重点（按任务书）：① API 密钥的存储/合并/导出/日志泄露面；② XSS/注入面（DOM 写入点转义覆盖）；③ manifest 权限最小化；④ PIN PBKDF2 与解锁逻辑；⑤ 更新检查（GitHub release fetch）的供应链/SSRF/重定向风险。
- 审计方式：v1.3.0→HEAD（`git diff 28a434c..cf2d4e9`）变更面复审 + 全仓静态扫描（innerHTML/insertAdjacentHTML/eval/密钥字面量/端点/CSP/权限）+ 逐文件人工走读（background.js 793 行、options.js 3118 行、content.js 1782 行、popup.js 501 行、diagnose.js 165 行、welcome.js 45 行、lib/* 全部适配器与 settings-manager 1410 行）+ 只读回归验证（`node --check` 全部通过；`npm test`：model-name 28/28、settings-manager、consistency、api-manager 全部通过）。**未做任何代码修改。**

## 结论先行

**v1.3.1/v1.3.2 相对 v1.3.0 未引入新的严重/高危安全问题；上一轮（security-review-1.3.0.md）C1–C4、C8、C9 共 6 项已确认修复（见 §四 回归核实）。本轮新发现 P2 级 3 项、P3 级 5 项，无 P1。**

核心密钥隔离链（local 存储、sync 剥离、导出脱敏、content script 掩码、PIN 锁定 UI 掩码）在 v1.3.2 保持完好；本轮 P2 项集中在两个旁路：**诊断页（diagnose.html）对自定义供应商密钥的明文展示**，以及**导入设置文件可改写内置厂商端点 / 在诊断页注入未转义标记**。

---

## 一、P2（中危，建议本批修复）

### P2-1 诊断页明文展示自定义供应商 apiKey（绕过 PIN 掩码 UX）
- 文件:行号：`diagnose.js:89-108`（`checkSettings` 对 `res.settings` 仅掩码 `api.apiKeys`，随后 `renderJsonAsPre(out, display.api)` 整段渲染 `api`）；同型问题 `diagnose.js:26-38`（`checkSync` 只掩码 `apiKeys`，旧版本迁移失败时 sync 中 `customProviders[].apiKey` 也会原文展示）。
- 漏洞描述：`_loadApiKeysFromLocal`（`lib/settings-manager.js:434-445`）会把 `custom_<id>` 的 apiKey 恢复进内存 `settings.api.customProviders[].apiKey`；`getSettings`（扩展页 sender）返回完整深拷贝。诊断页 `checkSettings` 渲染 `display.api` 时**未掩码 customProviders 数组**，自定义供应商的 API Key 以明文出现在「getSettings 消息」JSON 里。
- 可利用条件：diagnose.html 可由 popup「诊断工具」按钮（`popup.js:356-362`）直达，**无需解锁 PIN**。任何能短暂接触已打开浏览器的人（同事/维修/共享电脑）都可看到自定义供应商密钥明文。内置厂商密钥因走 `api.apiKeys` 被掩码，不受此影响。
- 复现/验证（静态走读）：`diagnose.js:90-99` 掩码循环仅遍历 `display.api.apiKeys`；`display.api.customProviders` 未处理即渲染。
- 修复建议：`checkSettings`/`checkSync` 渲染前对 `display.api.customProviders[].apiKey` 同样做 `maskApiValue` 式掩码（并统一长度保护，见 P3-1）；或复用 background `exportAllSettings` 的剥离逻辑（`background.js:533-537`）后再渲染。

### P2-2 导入设置文件 → 设置页诊断工具未转义字段的存储型标记注入（受 CSP 兜底）
- 文件:行号：`options/options.js:3312-3314`（`runSettingsIntegrityDiagnosis` 设置概览：`s.general?.logLevel`、`s.advanced?.batchSize`、`s.advanced?.requestTimeout` 直接拼入 `html` 未经 `escapeAttr`）；`options/options.js:3108-3110`（用量诊断表：`limit.toLocaleString()` 当 `quota?.limit` 为字符串时原样返回，未转义插入）。
- 漏洞描述：`applyImportedSettings`（`lib/settings-manager.js:830-857`）仅校验 apiPriority/enabledApis/customProviders/excludeList/requestTimeout 的类型；`general.logLevel`、`advanced.batchSize`、`api.quotaLimits.<name>.limit` 等字段无类型校验。恶意导入文件可把这些字段设为 `<img src=x onerror=…>` 之类的标记串，持久化进 storage，用户打开「设置完整性验证 / 用量数据检查」诊断时经 `resultDiv.innerHTML = html` 注入。
- 缓解与残留风险：MV3 CSP `script-src 'self'`（manifest.json:42-44）会阻止内联事件处理器执行，因此**不能直接拿到扩展权限或 chrome API**；但注入的静态标记仍可做钓鱼伪装（伪造 PIN 对话框外观）、`<meta http-equiv=refresh>`/`<img src=https://attacker/…>` 信标等，不应依赖 CSP 单层兜底。
- 修复建议：① 对 3312-3314 三处补 `escapeAttr()`（数值型先 `Number()` 归一）；② `runUsageDiagnosis` 中对 `limit`/`usageRate` 等数值先做 `Number.isFinite` 校验再渲染；③ 在 `applyImportedSettings` 中对数值型字段（logLevel、batchSize、retryCount、quotaLimits[].limit）做类型归一，非数字回退默认值。

### P2-3 内置厂商端点可被导入文件改写为任意 HTTPS 主机（真实密钥随请求外发）
- 文件:行号：`lib/settings-manager.js:683-695`（`_isEndpointAllowed` 只校验协议 https/localhost，不限主机）；`lib/api-registry.js:34-118`（内置 baidu/baidu_llm/volcano/deepseek/glm/tongyi/zhipu/yi/doubao 的翻译器均从 `settings.api.apiEndpoints[apiName]` 取端点）；`options/options.js:2286`（导入路径直达）。
- 漏洞描述：v1.2.16 M3 堵住了明文 `http://` 外发，但 **https + 任意主机仍被放行，且端点覆盖对内置厂商同样生效**。恶意导入文件把 `api.apiEndpoints.baidu_llm = https://attacker.example` 后，下一次翻译请求会把 local storage 中**用户的真实密钥**以 `Authorization: Bearer …`（baidu_llm/LLM 系）或 MD5 签名参数（baidu，`lib/api-adapters/baidu.js:21-31`）发往攻击者主机。这是对 1.3.0 报告 C7 的升级：C7 只评估了自定义供应商场景，本轮确认**内置厂商 + 已存真实密钥**同样可被导入文件劫持。
- 可利用条件：用户导入恶意设置文件（有 confirm 提示但文案未提及端点风险）且 local 中已有真实密钥。
- 修复建议：对**内置厂商**端点实施官方域名白名单（baidu→fanyi-api.baidu.com、deepseek→api.deepseek.com、glm/zhipu→open.bigmodel.cn、tongyi→dashscope.aliyuncs.com、yi→api.lingyiwanwu.com、doubao→ark.cn-beijing.volces.com、volcano→translate.volcengineapi.com），`_assertSafeEndpoints` 校验放行白名单或空值；自定义供应商保持任意 HTTPS（自带端点功能本性）；导入 confirm 文案明确提示「仅从可信来源导入」。

---

## 二、P3（低危/信息，可随批顺手加固）

### P3-1 diagnose.js 掩码无长度保护，短密钥近乎全泄露
- 文件:行号：`diagnose.js:32`、`diagnose.js:59`、`diagnose.js:95`（`val.substring(0,4) + '****' + val.slice(-2)`）。
- 描述：长度 ≤ 6 的值（如 6 位 PIN 相似长度的短 token）经此掩码后等于原文；且对所有密钥固定暴露前 4 后 2 共 6 个字符，与 options.js `maskApiValue`（`options/options.js:2673-2677`，含 `length<=6 → '****'` 保护）不一致。
- 修复建议：diagnose.js 复用同一掩码语义（≤8 显示 `****`），并统一两处掩码实现。

### P3-2 `_pushLog` 字符串脱敏模式覆盖不全
- 文件:行号：`background.js:86-90`（`redactString` 仅 `Bearer …`/`sk-…`/`AKIA…` 三种模式）。
- 描述：v1.3.0 C2 已部分修复；残留缺口：火山引擎 AKLT… 前缀、百度 secretKey（32 位十六进制）、数组形式的字符串参数（`redact` 只对对象键名生效，数组元素递归 `redact` 但裸字符串数组元素仍为原串）不会命中现有正则。当前全部适配器均未把密钥打进 console，属纵深防御缺口，暂无实际泄露路径。
- 修复建议：补充 `AKLT[A-Za-z0-9]{12,}` 与 `[a-f0-9]{32}`（长十六进制）模式；或统一约定"密钥永不入 console"并在 code review checklist 固化。

### P3-3 manifest 权限面（http/https 全站）与 web_accessible_resources
- 文件:行号：`manifest.json:24-31`（content_scripts matches http/https）、`manifest.json:38-41`（host_permissions 同）、`manifest.json:54-59`（default-glossary.json 对全 http/https 站点可读）。
- 描述：全站注入是本扩展核心功能所需（任意外文网页翻译），自 v1.2.16 已从 `<all_urls>` 收窄为 http/https（无 file/ftp）。`permissions`（storage/activeTab/contextMenus/unlimitedStorage）最小化合理，无 `scripting`/`tabs`/`webRequest`。CSP `script-src 'self'; object-src 'self'` 无 unsafe-eval。default-glossary.json 已复核（163 行游戏术语，无密钥/个人信息），泄露面为零。
- 修复建议：维持现状；可选增强——host_permissions 迁移 `optional_host_permissions` + 首次使用时请求，或至少在商店说明里解释全站权限用途。**约束：后续版本严禁把任何密钥/私有配置放进 web_accessible_resources。**

### P3-4 PIN 体系边界（信息）
- 文件:行号：`background.js:476-483`（setupPin 不校验已存在 PIN，可被任意扩展页上下文覆写）；`lib/settings-manager.js:1283-1340`（verifyPin 冷却状态 `_pinFailCount/_pinCooldownUntil` 明文存 local，本机进程/DevTools 可清除）；`lib/settings-manager.js:1349-1367`（resetPin 连带清除全部密钥，方向正确）。
- 描述：PBKDF2-HMAC-SHA256 100k 迭代 + 随机 16 字节 salt + 恒定时间比较 + 5 次/60s 冷却（SW 重启仍生效）+ 旧 SHA-256 哈希验证后自动升级（`settings-manager.js:1265-1406`）——实现质量良好。但密钥本体在 local 明文、PIN 仅是 UI 层防窥屏（options.html:659-676 已如实向用户披露），DevTools/本机进程可直接读 storage，PIN 不是加密边界。6 位数字（1e6 空间）对离线 GPU 爆破（100k 迭代）约数小时量级，属可接受但建议知晓。
- 修复建议：setupPin 增加已有 PIN 时要求先 verify（防无感覆写）；长期可选 WebCrypto 以 PIN 派生密钥加密 local 密钥（成本高，非必需）。

### P3-5 更新检查供应链面（GitHub release fetch）
- 文件:行号：`options/options.js:2416-2506`（checkForUpdates）、`options/options.js:2523-2530`（safeUrl）。
- 描述：正面核实——`tag_name` 派生的 latestVersion 已过 `escapeAttr`（2473，v1.3.0 C1 已修复）、release notes 前 300 字符过 `escapeAttr`（2478-2479）、15s AbortController 超时（2433-2434）、`rel="noopener noreferrer"`、fetch 无自定义 redirect 跟随风险（GitHub API 重定向仅指向 github 域）。残留：`assets[0].browser_download_url` 经 `safeUrl` 只要求 https，**任意 https 主机均可**（仓库失陷时可诱导下载恶意 zip）；SSRF 面为零（URL 固定、无用户输入拼入）。
- 修复建议：`safeUrl` 对下载/发布链接收紧为 `github.com`/`objects.githubusercontent.com` 域白名单；商店分发版可提示以商店更新为准。

---

## 三、逐项核查记录（按任务书五点）

### 1) API 密钥的存储/合并/导出/日志泄露面 ✅（旁路见 P2-1）
- 存储隔离：密钥唯一落点 `chrome.storage.local`（`dual_translate_api_keys_local`，settings-manager.js:23）；写 sync 前剥离 `api.apiKeys`（797）与 `customProviders[].apiKey`（801-817）；sync→local 旧数据迁移（369-413）与 reloadApiKeys 兜底（455-534）均先合并后删 sync，无误删路径。
- 合并语义：`saveSettings` 内 local 基线 + incoming 非空覆盖 + null 显式删除（v1.3.0 fix P2-1，settings-manager.js:760-782），写串行化 `_enqueueWrite`（722-729），无并发覆盖泄漏。`updateSetting` 显式禁止 `api.apiKeys` 直写（894-897）。
- 导出：`exportAllSettings`（background.js:527-551）删除 apiKeys、清空 customProviders[].apiKey——**导出文件不含明文密钥** ✅（与 options.html:672 的用户文档一致）。
- content script 读取：`getSettings` 对非扩展 sender 深拷贝后 apiKeys 置空、customProviders[].apiKey 置空（background.js:335-351）✅。
- 日志：`_pushLog` 对象键名脱敏（background.js:73-85，含 apiKey/secretKey/accessKey/authorization/token/password/prompt/request.body）+ 字符串 Bearer/sk-/AKIA 模式（86-90）；诊断日志查看器输出前再过 `escapeAttr`（options.js:3417）✅。残留模式缺口见 P3-2。
- 诊断页：options.js 四个诊断工具均 `maskApiValue` + `escapeAttr` 双重处理（2738-2740 等）✅；diagnose.js 内置密钥掩码 ✅ 但自定义供应商明文（P2-1）与短值泄漏（P3-1）❌。

### 2) XSS/注入面 ✅（旁路见 P2-2）
- 全仓无 `eval`/`new Function`（运行时）/`document.write`/`insertAdjacentHTML`；innerHTML 写入点逐一走读：
  - content.js：译文填充用 `ph.textContent = translation`（1258）——**翻译服务返回的 HTML 永远按文本渲染** ✅；hover 气泡 textContent（1590）；面板行/选区/加载/错误横幅均 `escapeContent`（1642、1752、473、514）；title/alt 走 `document.title`/`setAttribute`（1188-1191，无 HTML 解析）；CSS 变量写入有白名单校验（562-579，v1.3.0 C3 已修复）✅。
  - options.js：API 卡片、优先级、额度、用量、glossary 表格、排除列表全部字段值经 `escapeAttr`（579/635 为静态骨架 + textContent 回填；716-721、962-980、1222+、1912-1917、2013+、2149-2162 等）；1668 的 missing 字段为静态标签常量；更新检查见 §3-5。
  - popup.js：状态/用量条目均 `escapeAttr`（206、455）；静态 innerHTML 三处（159/164/170）；manual 翻译结果 textContent（513）。
  - welcome.js：全部 textContent ✅。diagnose.js：JSON 渲染 `renderJsonAsPre` 用 textContent（6-12，v1.2.12 P1-3 修复保持）✅，135-137 innerHTML 为纯静态字符串。
  - glossary：`renderGlossaryTable` source/target 均转义（964-965）；`saveGlossary` 结构校验 + 原型链污染拦截（953-987）；content.js 侧 regex 特殊字符转义（53）。
  - **例外（P2-2）**：3312-3314 / 3110 数值型字段未转义且导入路径缺类型校验。
- 模型名/自定义供应商名：渲染处 `escapeAttr(provider.name)`（1245/1279/1915）✅。

### 3) manifest 权限最小化 ✅（见 P3-3）
permissions 最小集；CSP 无 unsafe-eval；无 externally_connectable；background 消息处理对写操作与敏感读统一 `_isExtensionSender` 双重校验（URL 前缀 + 扩展 ID，background.js:281-313、395-607），content script 仅能改 4 个非敏感路径（含 v1.3.2 新放行的 `display.panelCollapsed`，非敏感，放行安全）。

### 4) PIN PBKDF2 与解锁逻辑 ✅（边界见 P3-4）
PBKDF2-HMAC-SHA256 · 100000 迭代 · 256-bit · 随机 salt；旧 SHA-256 哈希验证通过后透明升级（1317-1325）；恒定时间比较（1342-1347）；失败计数/冷却持久化（1283-1339）；resetPin 连带清除全部密钥防残留利用（1349-1367）；PIN 格式 `六{6}` 双端校验。

### 5) 更新检查供应链/SSRF ✅（残留见 P3-5）
固定 URL `https://api.github.com/repos/…/releases/latest`，无用户输入拼 URL（无 SSRF）；15s 超时；403 速率限制友好提示；tag_name/notes/版本号全部转义（C1 已修复）；`safeUrl` https 白名单阻 `javascript:`/`data:`；`rel=noopener noreferrer`。仓库本身是信任锚，`data.body`（release notes）按不可信数据处理并转义 ✅。

### 6) 回归验证（只读）
- `node --check`：background.js / content.js / options.js / popup.js / diagnose.js / lib/settings-manager.js 全部 SYNTAX OK。
- `npm test`：model-name 28/28、settings-manager（迁移/密钥隔离/PBKDF2）、consistency、api-manager P1-1 cooldown 全部通过。
- git 工作树干净，未做任何修改（本任务仅审计）。

---

## 四、上一轮（v1.3.0 报告 C1–C9）回归核实

| 旧编号 | v1.3.2 现状 | 判定 |
|---|---|---|
| C1 tag_name 未转义 | `options.js:2473` `escapeAttr(latestVersion)` 已加；notes 2479、URL 2482-2483 同样处理 | ✅ 已修复 |
| C2 字符串日志不脱敏 | `background.js:86-90` `redactString` 已加（Bearer/sk-/AKIA）；模式覆盖不全 → 本轮 P3-2 续保 | ✅ 已修复（留增强） |
| C3 CSS 变量无白名单 | `content.js:565-578` color/size/spacing/font 四重正则白名单 + 安全回退 | ✅ 已修复 |
| C4 降级 escapeAttr 缺单引号 | `options.js:9-18` 回退函数已含 `&#39;`，与 lib/escape-utils.js 一致 | ✅ 已修复 |
| C5 WAR 暴露 default-glossary.json | 维持现状，文件复核无敏感内容（续列 P3-3） | ✅ 按建议维持 |
| C6 密钥明文 local | 平台常态，已向用户如实披露（P3-4 续列） | ✅ 按建议维持 |
| C7 自定义供应商任意 HTTPS 端点 | 未加内置厂商域名白名单，且本轮确认**内置厂商端点同样可被导入改写** → 升级为本轮 P2-3 | ⚠️ 升级续列 |
| C8 panelCollapsed 白名单拦截 | `background.js:307` allowedPaths 已含 `display.panelCollapsed` | ✅ 已修复 |
| C9 NO_API 错误码契约 | `background.js:703-711` `_sanitizeErrorCode` 已加，content script 收到枚举错误码（`content.js:1472-1475` 可触发引导） | ✅ 已修复 |

---

## 五、给下游（maintenance-engineer / qa-verifier）的交接

1. **建议本批修复**：P2-1（diagnose.js 掩码 customProviders）、P2-2（诊断工具数值字段转义 + applyImportedSettings 类型归一）、P2-3（内置厂商端点域名白名单）。三者改动局部、均不涉及翻译主链路，回归成本低。
2. **可随手加固**（P3）：P3-1 掩码长度保护统一、P3-2 日志模式补齐、P3-5 safeUrl 域名白名单。P3-3/P3-4 为设计取舍，建议仅在文档层面强化，不动代码。
3. 验证建议：修复 P2-2 后用恶意字段（`batchSize: "<img>"`）导入复测诊断页无注入；修复 P2-3 后导入含非官方端点的文件应被 `_assertSafeEndpoints` 拒绝且报错文案可读；修复 P2-1 后 diagnose 页「getSettings 消息」中 customProviders 的 apiKey 应显示掩码。

*报告生成：security-auditor，任务 t2，attempt 472a846d-b49c-4aa2-998d-1d6305f9dd31（v1.3.3 维护批，基线 v1.3.2 / cf2d4e9）*
