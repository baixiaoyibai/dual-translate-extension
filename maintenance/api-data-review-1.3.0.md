# API 层与数据链路代码审查报告 — dual-translate-extension v1.3.0

审查人：api-auditor
范围：lib/api-manager.js、lib/api-registry.js、lib/api-metadata.js、lib/api-adapters/*、lib/translation-cache.js、lib/escape-utils.js、lib/settings-manager.js、tests/settings-manager.test.js、tests/model-name.test.js、tests/consistency.test.js

方法：静态通读 + 手工推导 / 伪代码走查；对百度 MD5 用已知向量做了本机验证（为空串、`abc`、`The quick brown fox…` 输出均与标准 MD5 一致，实现正确）；未实际调用外部 API。

结论：发现 1 个 P1、2 个 P2、7 个 P3。未发现需要阻断下线的 P0。三项现有测试全部通过，但其中两项存在“只校验副本、未校验权威副本”的覆盖盲区（见 P3-5/P3-6）。

---

## P1

### P1-1 连续 3 次一般性错误后 API 被永久禁用，无冷却/自动恢复机制
- 文件:行号：`lib/api-manager.js:99-115`（判定）、`lib/api-manager.js:217-261`（写入，尤其 `253-259`）
- 缺陷描述：`_isApiUsable()` 对 `status.status === 'error'` 且 `consecutiveErrors >= 3` 返回不可用；但 `_handleApiError()` 对普通错误只递增 `consecutiveErrors`，既不写 `cooldownUntil`，也没有任何按时间过期恢复的判定。全代码库中 `consecutiveErrors` 只在「翻译成功 / 测试成功 / RATE_LIMITED」路径归零（`api-manager.js:157/250/302`），`resetApiQuotaIfNeeded()`（`lib/settings-manager.js:1042-1102`）只重置 `quota_exceeded`，从不重置 `error` 状态。因此 `consecutiveErrors` 一旦到达 3 就是“死锁”——provider 因不可用被 `translate()` 跳过，而跳过意味着永远不可能取得一次成功来归零。
- 触发条件：某 provider 因网络超时（AbortError 不重试、直接记错误）、HTTP 5xx、`响应解析失败`、`NO_TRANSLATION_RESULT` 等临时性/可恢复故障连续失败 3 次。
- 影响：该 provider 之后被静默排除出轮换（`translate()` 第 140 行 continue），仅当用户手动进设置页“测试”成功或清除该 API 才能恢复；当多个 provider 都经历 3 次瞬时失败后，整体翻译返回“所有翻译服务暂时不可用”，需要人工介入。这属于“失败后错误切换 / 冷却状态误置”类逻辑缺陷。
- 修复建议：为 `error` 状态增加类似 `rate_limited` 的 `cooldownUntil`（例如 5 分钟），并在 `_isApiUsable()` 中按 `Date.now() >= cooldownUntil` 恢复；或/并在 `resetApiQuotaIfNeeded()` 的日度重置里同时清零 `error` 的 `consecutiveErrors`。赋 0 语义应与 `rate_limited` 分支（第 250 行）一致。

---

## P2

### P2-1 清空单个 API 密钥字段无法删除 local 中已存密钥
- 文件:行号：`lib/settings-manager.js:754-790`（合并逻辑 `760-783`）
- 缺陷描述：`saveSettings()` 的密钥合并只把「非空字符串」写入 local，空字符串被当作“未变更”跳过（`mergeNonEmptyKeys` 第 766 行 `value.length > 0`）。因此用户在设置页把某个字段（如 baidu `secretKey`、deepseek `apiKey`）清空后保存，空值不会写入 `dual_translate_api_keys_local`；`saveAllSettings` 随后从 background 拉回 `getSettings`（`options/options.js:328-333`），被 `_loadApiKeysFromLocal` 合并回内存的仍是旧密钥，输入框也会回到旧的掩码值。
- 触发条件：用户仅删除单个 API 密钥字段（而非整卡“清除”）。整卡清除走 `handleClearApi`（`background.js:610-695`）不受影响。
- 影响：无法单独移除某个密钥字段；失效/泄露的旧密钥残留在本地存储，可能随导出被带出。属密钥管理一致性缺陷。
- 修复建议：为 `api.apiKeys` 增加“显式删除”语义——例如 UI 清空字段时发送显式删除信号，或在合并时允许 incoming 中 `null` 值表示删除（把空字符串与“删除”区分开）；同时在单元测试中补一条“清空单字段后 local 键被删除”的用例。

### P2-2 百度 LLM 频率限制错误码未映射 RATE_LIMITED
- 文件:行号：`lib/api-adapters/baidu-llm.js:49-57`
- 缺陷描述：代码注释明确 `54003/54005 是频率受限`，但实现上把它们落入 `throw new Error(data.error_msg || ...)` 的普通错误分支（`56` 行），走 `_handleApiError` 的 `consecutiveErrors` 累加路径；而 base.js 对 HTTP 429 已映射为 `RATE_LIMITED`（60s 冷却，`lib/api-adapters/base.js:34-38`）。两者对“频率限制”的处理策略不一致。
- 触发条件：百度 LLM（aiTextTranslate）返回 54003（访问频率受限）或 54005（长 query 请求频繁/QPS 超限）。
- 影响：本应 60 秒冷却自动恢复的限流被当成普通错误计数，叠加 P1-1 会让 provider 更快被永久禁用，且无法享受限流后的自动恢复。
- 修复建议：在 `baidu-llm.js` 中将 `54003`/`54005` 显式映射为 `throw new Error('RATE_LIMITED')`，与 429 语义一致。

---

## P3

### P3-1 状态摘要未应用“过期恢复”判定，UI 展示滞后
- 文件:行号：`lib/api-manager.js:315-333`
- 说明：`getApiStatusSummary()` 直接返回 `statusCache` 里的 `status/reason`，没有复用 `_isApiUsable()` 中「rate_limited 冷却到期 / quota_exceeded 重置时间已过」的判定。结果是限流冷却到期或额度重置后，popup 仍显示旧状态，直到下一次成功翻译才刷新为 available。实际可用但展示滞后。

### P3-2 saveApiStatus 未纳入 _enqueueWrite 串行化
- 文件:行号：`lib/api-manager.js:217-261`、`lib/settings-manager.js:1018-1031`
- 说明：`saveApiStatus()` 直接 `chrome.storage.local.get/set` 单键读写，不经过 `_enqueueWrite`。虽然 `_handleApiError` 从内存 `statusCache` 传入 `baseStatus`，但「读 baseStatus → await 写 storage → 回写 statusCache」之间仍非原子；跨标签页并发翻译/测试对同一 `apiStatus_<name>` 键可能丢失一次计数更新。低概率、低影响。

### P3-3 translation-cache 键在 sourceLang='auto' 下存在跨语言污染窗口
- 文件:行号：`lib/translation-cache.js:95-98`
- 说明：缓存键为 `sourceLang + '\u0001' + targetLang + '\u0001' + norm`。当 `sourceLang='auto'`（默认路径）时，键中的源语言是字面量 `auto`，不反映实际检测到的源语言；相同归一化文本（如常见短句/标题）在不同页面分别以英语、日语出现时命中同一条目，可能返回跨语言的旧译文。属已知折中，风险低（目标语言已被正确纳入，见 v1.2.12 P1-4 修复）。

### P3-4 火山引擎 region / service 硬编码，自定义接入点可能签名失败
- 文件:行号：`lib/api-adapters/volcano.js:15-16`
- 说明：`this.region = 'cn-north-1'`、`this.service = 'translate'` 为硬编码。v1.2.3 只从 endpoint 解析了 `host`（第 17-22 行），未从接入点推导 region/service；用户在非 `cn-north-1` 或不同 service 的自定义接入点上会因 credentialScope 不匹配而 V4 签名认证失败。低频（默认接入点不受影响）。

### P3-5 DEFAULT_MODEL_NAMES / DEFAULT_MODEL_VARIANTS 双份漂移风险
- 文件:行号：`content.js:120-152` 与 `lib/api-metadata.js:88-107`（`DEFAULT_SETTINGS.rules.customModelNames / customModelVariants`）
- 说明：两份列表当前逐项一致，但 `tests/model-name.test.js:46-51` 只加载 `content.js` 自身的 `DEFAULT_MODEL_NAMES/DEFAULT_MODEL_VARIANTS` 做断言，**不校验** `api-metadata.js` 的权威副本。任一侧将来修改导致漂移时，现有测试无法发现。

### P3-6 settings-manager 本地默认副本与 api-metadata 权威副本双份漂移风险
- 文件:行号：`lib/settings-manager.js:34-269`（LEGACY_DEFAULT_SETTINGS）、`lib/settings-manager.js:275-299`（本地 API_ENDPOINTS_DEFAULT / API_MODELS_DEFAULT）与 `lib/api-metadata.js:22-159`
- 说明：`DEFAULT_SETTINGS = globalThis.DEFAULT_SETTINGS || LEGACY_DEFAULT_SETTINGS`（第 273 行），且 `_ensureApiDefaults()` 使用 settings-manager 内部的 `API_ENDPOINTS_DEFAULT/API_MODELS_DEFAULT`（第 564/574 行）而非 global 版本。三处当前内容一致；但 `tests/settings-manager.test.js:6-8` 用正则剥离 `import './api-metadata.js'` 后，被测对象实际是 **LEGACY fallback**，未验证与 api-metadata 权威 `DEFAULT_SETTINGS` 的一致性。

### P3-7 apiPriority 含无效占位条目 'custom'
- 文件:行号：`lib/api-metadata.js:145`（`DEFAULT_SETTINGS.api.apiPriority`）
- 说明：`apiPriority` 默认数组含 `custom`，但 `api-registry.js` 只注册 `custom_<id>` 形态的自定义供应商，不存在名为 `custom` 的条目；`_buildTranslators`（`lib/api-manager.js:66-75`）对其 `API_REGISTRY['custom']` 取不到而返回 null，该条目惰性无效。仅造成阅读/维护迷惑，无功能影响。

---

## 已核验无缺陷项（供回归参考）
- 百度标准翻译 MD5 签名：`lib/api-adapters/baidu.js:80-206` 实现为标准 MD5（UTF-8 字节、小端、correct 输出），签名串 `appId+q+salt+secretKey` 与参数拼接一致，未发现签名错误。
- 火山 V4 签名结构（canonical request/stringToSign/HMAC 派生链/`X-Date` UTC 格式）静态核对无误；默认接入点路径正确。
- `isAlreadyChinese`（`background.js:7-42` 与 `content.js:215-253`）当前行为一致，`tests/consistency.test.js` 有覆盖。
- `escapeContent`（`content.js:1625`）与 `escapeAttr`（`lib/escape-utils.js:13-20`）输出一致，`tests/consistency.test.js` 有覆盖。
- `_enqueueWrite` 写锁结构正确（失败不污染后续、调用方可得 rejection，`tests/settings-manager.test.js` 的 M3 校验通过）。
- 密钥 sync→local 迁移、`saveSettings` 对 sync 的 apiKeys 剥离、customProviders 密钥抽取，`tests/settings-manager.test.js` 覆盖通过。