# dual-translate-extension v1.3.0 交互逻辑审查报告

- 审查人：interaction-auditor（交互逻辑审查工程师）
- 范围：content.js、background.js、popup/popup.js、popup/popup.html、options/options.js、options/options.html、welcome/welcome.js、welcome/welcome.html、diagnose.js、diagnose.html
- 方法：静态通读 + `node --check` 语法验证（全部通过；content.js/background.js/popup.js/options.js/welcome.js/diagnose.js/settings-manager.js 均 exit=0）
- 结论摘要：**未发现确认的 P0/P1 交互缺陷**；发现 5 个 P2（1 个状态机竞态、2 个源语言契约不一致、1 个设置持久化被拦截 C8、1 个错误契约掩码致引导不可达 C9）与若干 P3。所有 P2 均为低风险、可本地化修复的单项缺陷，不会破坏数据完整性或造成大范围功能失效。

---

## 一、消息契约核对（content.js ↔ background.js ↔ popup/options）

已逐一核对消息 type 与 payload：

| 消息 action | 发送方 | 接收方 | 契约是否一致 |
|---|---|---|---|
| translateTexts | content / popup | background | 一致。返回 `{translations:[{index,original,translation}]}`，调用方按 index/original 回填 |
| getSettings | content / popup / options / diagnose | background | 一致。扩展页返回完整 settings，content 返回去 apiKeys 的精简副本 |
| updateSettings | content / popup / options / welcome | background | 一致。content 仅放行 `general.translationEnabled`/`general.lastMode`/`display.defaultMode` |
| saveSettings / saveGlossary / testApi / clearApi / reloadApis / clearCache / clearLogs | options / popup | background | 一致，均在 WRITE_ACTIONS 白名单保护下 |
| checkAndTranslate / toggleTranslate / startTranslation / switchMode / getStatus / restoreAll / retranslateWithSource / cancelTranslation / showSelectionTranslation | background / popup → content | content | 一致，content onMessage 全覆盖 |
| getApiStatus / getDailyUsage / getMonthlyUsage / getGlossary / hasPin / verifyPin / exportAllSettings / getLogs / getLLMPrompt 等 | options / popup | background | 一致，敏感读均有 `_isExtensionSender` 校验 |

未发现「消息类型不匹配」「响应字段错位」「handler 缺失」类问题。`getStatus` 返回 `{mode, translating, segmentCount}` 与 popup 消费一致；`getCacheStats` 返回 `{active, expired, total, sizeKB}` 与 popup 消费一致。

---

## 二、已确认问题清单

### P2-1【状态机竞态】自动翻译的延迟启动未重检开关，关掉翻译后页面可能又被翻回来

- 文件:行号：`content.js:589`（入口 `checkAndTranslate` 位于 `content.js:570`-`590`，`startTranslation` 位于 `content.js:871`）
- 触发路径：
  1. 页面加载 → background `tabs.onUpdated` 发 `checkAndTranslate`；
  2. `checkAndTranslate` 通过 `translationEnabled`/`autoTranslate`/区域规则检查后，以 `setTimeout(() => startTranslation(), translateDelay)`（默认 500ms，可在选项页调大）延迟执行；
  3. `startTranslation()` 内部**不重新校验** `settings.general.translationEnabled`；
  4. 在延迟窗口内用户从 popup 点击「关闭翻译」或按快捷键关闭：`restoreAll`→`resetAll` 会清空 DOM、断开 observer、置 `translationCompletedOnce=false`；
  5. 但已排队的 `setTimeout` 仍会触发 `startTranslation`，把页面重新翻译。
- 复现步骤：把设置里「翻译延迟」调大到 2s 以上 → 打开一个会触发自动翻译的英文页 → 立即（延迟窗口内）从 popup 关闭翻译 → 观察页面在 ~2s 后被再次翻译。
- 修复建议：`checkAndTranslate` 的延迟回调内（或 `startTranslation` 入口按 opts 区分）重新检查 `settings.general.translationEnabled !== false && settings.trigger.autoTranslate`；更稳妥的做法是给延迟启动加一个「代际号/取消 token」，`resetAll` 时递增使旧回调失效。（注意：SPA 路由路径 `content.js:1787` 已做 `translationEnabled` 重检，本问题仅剩下 `checkAndTranslate` 这条延迟通道。）

### P2-2【源语言契约】retrySegment 与 popup 文本翻译把 `sourceLanguage='all'` 原样透传给翻译服务

- 文件:行号：`content.js:1279`（`retrySegment`）、`popup.js:504`-`508`（`setupManualTranslate`）；背景未归一化处 `background.js:724`
- 触发路径：设置源语言为「所有非中文」（popup 下拉 `value="all"`，见 `popup.html:55`）后：
  - 「段失败点击重试」`retrySegment` 直接用 `settings.api.sourceLanguage`（=`'all'`）发 `translateTexts`；
  - popup「文本翻译」手动翻译同样直接透传 `cachedSettings.api.sourceLanguage`（=`'all'`）。
- 影响：`api-adapters/base.js` 对 `'all'` 无专门映射——火山引擎走 `_mapSourceLanguage` 返回原样 `'all'` 作为 `SourceLanguage`（非法值，请求失败）；LLM 系走 `_mapLanguageToChinese('all')` 落到 `'原文'`（语义错误；百度系会兜底 `'auto'` 反而正常）。正文批量路径 `content.js:1372`（`translateSegments`）与标题/alt 路径 `content.js:1099`（`translatePageMeta`）已用 `detectPageLanguage` 归一化，唯独这两处未归一化，属契约不一致。
- 复现步骤：popup 源语言选「所有非中文」，配置火山引擎为可用 API，「文本翻译」粘贴英文 → 观察请求失败/报错；或对某段失败译文点「重试」→ 同样失败。
- 修复建议：将 popup 手动翻译与 `retrySegment` 中的 `sourceLang` 统一归一化——`'all'`/`'auto'` 时转为 `'auto'`（或复用与 content 一致的检测逻辑），且背景 `handleTranslateTexts` 增加 `'all'`→`'auto'` 的防御性兜底。

### P2-3【状态机】toggleTranslation 以页面局部状态（segments/cache）推断开/关方向，快捷键开关会失灵或反向

- 文件:行号：`content.js:1626`-`1637`（`toggleTranslation`），被 background 快捷键 `toggle-translate`（`background.js:253`-`264` → 发 `toggleTranslate` → `content.js:1735`）调用
- 触发路径：`toggleTranslation` 以 `segments.length > 0 || translationCache.size > 0` 判定「已翻译→执行关闭」，否则「未翻译→执行开启」。但该判据与持久化的 `general.translationEnabled` 无关：
  1. 自动翻译开启且页面无翻译内容（骨架屏/纯中文被跳过/segments 提取为 0）→ `segments.length===0`、cache 空 → 按快捷键会被判为「开启」，执行 `updateSettings(translationEnabled=true)` + `startTranslation()`，**无法用它关闭**全局开关；
  2. 与 popup「开启/关闭翻译」读自 `general.translationEnabled` 的按钮文案（`popup.js:51`、`79`-`87`）状态不一致，快捷键语义（「切换翻译开关」）与 UI 语义发散。
- 复现步骤：在中文页（自动翻译被跳过、无译文）按 Alt+T → 观察扩展仍处于开启态且重新分析页面，没有变为「关闭」；popup 仍显示「关闭翻译」。
- 修复建议：`toggleTranslation` 改为读取权威 `settings.general.translationEnabled` 决定方向（`true→关`、`false→开`），关闭时总是 `resetAll`+写 false，开启时总是写 true+`startTranslation`；不要依赖 `segments`/`translationCache` 是否非空。

### P2-4（C8，security-auditor 转来并确认）【设置持久化】对照面板折叠状态被 content 写白名单拦截，跨会话永不持久化

- 状态：**已核实为真**，P2。
- 文件:行号：`content.js:1584`-`1587`（读/写）、`background.js:301`-`303`（`allowedPaths` 白名单，仅 `['general.translationEnabled','general.lastMode','display.defaultMode']`）、`lib/settings-manager.js:48`（默认值 `panelCollapsed:false`）、`CHANGELOG.md:52`（宣称已支持）
- 触发路径：
  1. PANEL 模式下用户点击面板折叠/展开按钮 → `content.js:1587` 发送 `updateSettings {path:'display.panelCollapsed', value:collapsed}`；
  2. background `handleMessage` 因 `message.action==='updateSettings'` 且 sender 为 content script（`!_isExtensionSender`）进入白名单分支；
  3. `display.panelCollapsed` 不在 `allowedPaths` → 返回 `{error:'Permission denied: content script can only update non-sensitive settings'}`；
  4. content 端 `.catch(()=>{})` 吞掉该响应，用户无任何感知。
- 影响范围：面板折叠/展开状态只在当前会话内存中生效；刷新页面后 `updatePanel` 重新读 `settings.display.panelCollapsed`（恒为默认 false）→ 折叠偏好丢失。与 CHANGELOG「对照面板折叠状态持久化」宣称不符。无安全影响（该字段为非敏感 UI 偏好）。
- 复现步骤：PANEL 模式 → 点击 🖼/▶ 折叠面板 → 刷新页面 → 面板重新展开，未保持折叠态。
- 修复建议：将 `'display.panelCollapsed'` 加入 `background.js:302` 的 `allowedPaths` 白名单（单行改动，无安全风险，仅影响该 tab 的 UI 偏好）。

### P2-5（C9，security-auditor 转来并确认）【错误契约】NO_API「打开设置」引导对 content 调用永远不可达

- 状态：**已核实为真，且比转述更严重**，P2。
- 文件:行号：`content.js:1442`-`1448`（NO_API 判定与 `showSettings` 分支）、`content.js:494`（humanize 的 NO_API 分支）、`background.js:768`-`770`（对 content script 的脱敏掩码）
- 触发路径：
  1. 未配置任何翻译 API（或唯一可用 provider 未配置密钥）时，`apiManager.translate` 抛 `NO_API_CONFIGURED`（`lib/api-manager.js:122`）；
  2. background `handleTranslateTexts` 的 catch 中 `_isExtensionSender(sender)` 对 content script 为 false → 统一返回 `{error:'翻译失败，请重试', translations:[]}`（`background.js:770`），原始 `NO_API_CONFIGURED` 被掩码；
  3. content `translateSegments` 收到该响应，`errMsg='翻译失败，请重试'`；`errMsg.includes('NO_API')`（`content.js:1444`/`1446`）恒为 false，且 `includes('所有翻译服务'|'暂时不可用'|'AUTH_ERROR'|'QUOTA_EXCEEDED')` 也均不命中；
  4. 结果：整段 `if(...)`（`content.js:1444`-`1451`，含 `showErrorBanner({showSettings:isNoApi})`）永不执行，直接落到底部「标记空译文」循环 → 所有段落显示「该段翻译失败，点击重试」占位，**没有任何**「打开设置」横幅或可理解的引导。
- 影响范围：新装未配置 API 的首次体验——页面被静默标记为逐段失败、点击重试仍失败，用户无从得知需「先配置 API」。v1.2.17 的 NO_API 引导（`content.js:507`-`513`、`494`）对**主路径（content script 自动翻译）实质死代码**；仅 popup/扩展页路径（`_isExtensionSender=true`，返回原始错误）能看到正确文案，但 popup 手动翻译走的是 `humanizeTranslateError(resp.error)`（`popup.js:513`-`515`）而非这段 showSettings 逻辑。
- 复现步骤：全新 profile 安装扩展且不配置任何 API → 打开英文页（自动翻译开启）→ 观察页面仅出现逐段「该段翻译失败，点击重试」，顶部无「尚未配置翻译 API / 打开设置」横幅。
- 修复建议（任选其一，建议组合）：
  1. `background.js:768`-`770` 对 content script 返回**脱敏的错误码枚举**而非纯文案，例如 `{error:'NO_API', translations:[]}` / `{error:'AUTH_ERROR', ...}` / `{error:'QUOTA_EXCEEDED', ...}` 等稳定标识，content 端按枚举匹配（保留对用户文案的人话化仍在 content/popup 完成）；或
  2. 在 `handleTranslateTexts` 的 catch 中针对 `NO_API_CONFIGURED`/`AUTH_ERROR`/`QUOTA_EXCEEDED` 等确定类错误，额外返回 `errorCode` 字段供 content 判定；content `content.js:1444` 改判 `resp.errorCode`。
- **安全约束（security-auditor 补充）**：`background.js:768`-`770` 对 content 的掩码是**正确的安全行为，必须保留**——只允许回传枚举/脱敏摘要（稳定错误码），**绝不把原始 `error.message` 回传给 content script**；本次修复是「补充枚举」补齐 UI 契约，而不是「移除掩码放回原文案」。

---

## 三、P3（低优先，建议后续清理）

1. **关闭翻译时徽章可能短暂不同步** — `content.js:1630`-`1631`：快捷键关闭路径并行 fire-and-forget 发送 `updateSettings(translationEnabled=false)` 与 `setIconState('idle')`，background `updateIcon` 的 `idle` 分支按 `settingsManager.settings.general.translationEnabled` 判断是否显示 ⏸（`background.js:793`-`798`），两条消息存在竞态，首次可能不显示 ⏸，后续自然纠正。建议先 await `updateSettings` 再发 `setIconState`。
2. **popup 主开关/还原原文依赖当前 tab 存在 content script** — `popup.js:227`-`241`、`364`-`372`：在 `chrome://`、空白新标签页等无 content 的页面，点「开启/关闭翻译」或「还原原文」会回滚设置并弹「请在普通网页上重试」。开关是全局状态却与当前 tab 能力耦合。建议：设置写入与页面指令解耦，把「还原原文」的失败与「保存设置」的失败分开处理。
3. **多标签页下关闭翻译只还原当前标签** — 关闭 `translationEnabled` 仅向 active tab 发 `restoreAll`（`popup.js:235`），其他已翻译标签的 DOM 译文保留到下次导航/刷新。属已知可接受限制，非每次必现缺陷，仅记录。
4. **周期重扫对动态页面可能频繁重译** — `content.js:824`-`846`：`rules.autoRescan` 启用时，`getPageTextFingerprint` 取 `document.body.textContent` 含注入译文与时间戳/广告等动态文本，内容持续变化的页面会每 ≥2s 触发一次 `startTranslation`（受 `lastRetranslateTime` 限制）。需在动态页复现确认影响面，建议指纹采样时排除 `dual-translate-*` 节点与已知高频变化区域。
5. **options 冗余 reloadApis** — `options.js:1400`/`1429`/`1467`：`saveAllSettings` 内部（background `saveSettings`）已 `apiManager.reload()`，外层又补发 `reloadApis`；`bindToggle('trigger.contextMenu')` 通过 `reloadApis` 借道重建右键菜单（`options.js:672`）。属重复工作/职责混淆，非正确性缺陷。
6. **`hasCompletedWelcome` 基本已成残留** — `options.js:100`（`setupWelcomeOverlay` 每次打开都显示）与 `background.js:838` 仅安装时置 false，但无读取方按它控制欢迎页弹出，仅「恢复默认设置」时保留/置位（`options.js:2341`-`2348`）。

---

## 四、误报 / 需复现确认 / 设计内说明

- **`getGlossaryForDomain` 未加 `_isExtensionSender`（`background.js:429`）**：判定为**设计内**。content script 需按域名获取术语表做原文替换；Web 页面无法直接调用 `chrome.runtime.sendMessage`，且消息按扩展 ID 路由，不存在跨扩展伪造读取面。不视为漏洞。
- **快捷键 `chrome.commands.update` 失败回滚（`background.js:139`-`151`）**：部分浏览器对带 `suggested_key` 的命令调用 update 会抛「无法修改」；代码已 try/catch 并回滚 storage 到 `Alt+T`，属优雅降级，非缺陷。
- **`switchMode` 中断旧翻译的 finally/catch 代际判定（`content.js:1651`-`1662`、`962`、`972`）**：旧 translation 的 catch/finally 不会误 reset 新翻译（`currentAbortController` 已被 switchMode 置空/替换），逻辑正确，未复现竞态。
- **`showSelectionTranslation` 悬浮计数（`content.js:1712`-`1728`）**：递减后 `_activeHoverCount` 有 `<0` 置 0 兜底，未发现泄漏。
- **MutationObserver 自触发重译**：注入元素 class 前缀 `dual-translate-*` 已被 observer 跳过（`content.js:755`-`773`），未发现重复注入回路。但「动态页周期重扫」见 P3-4，需实测确认。