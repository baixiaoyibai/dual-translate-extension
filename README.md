# 双语翻译助手

一个给 Edge / Chrome 浏览器用的翻译扩展（Manifest V3）。浏览英文或日文网页时，按需翻译成简体中文，支持 4 种显示方式、翻译接口自动轮换和专业术语。

> **版本变更历史请见 [CHANGELOG.md](./CHANGELOG.md)**，当前版本：**v1.4.0**

## 有什么用

- 看英文 / 日文网页，点击「翻译此页」开始，也可在设置中启用自动翻译
- 4 种显示方式（双语对照 / 仅译文 / 悬停翻译 / 对照面板）
- 支持百度、DeepSeek、智谱等翻译服务，需自行配置密钥；服务失败时按设置的优先级轮换
- 另支持 5 个预置供应商（火山引擎机器翻译 / 通义千问 / 智谱 GLM 付费版 / 零一万物 / 豆包），加自定义接口共 9+ 个可用
- 内置 100+ 专业术语（如 `tank→坦克`、`aggro→仇恨`、`load order→加载顺序`），可自定义扩展
- 支持自定义翻译接口（baseURL + API Key + model 即可接入）

## 安装方法

### 推荐：从 Release 下载 zip

1. 打开 [Releases 页面](https://github.com/baixiaoyibai/dual-translate-extension/releases)
2. 下载最新版本的 `dual-translate-extension_v*.zip`
3. 解压到任意位置（解压后会有个 `dual-translate-extension/` 文件夹）
4. 按下方「手动加载」步骤安装

### 手动加载

**Edge 浏览器**

1. 地址栏输入 `edge://extensions/`
2. 打开左下角「**开发人员模式**」开关
3. 点击「**加载解压缩的扩展**」
4. 选择解压后的 `dual-translate-extension` 文件夹
5. 装好后会自动弹出引导页

**Chrome 浏览器**

步骤一样，地址栏用 `chrome://extensions/`，其他完全相同。

## 怎么用

### 日常操作

- 在扩展弹窗点击「翻译此页」开始，按钮变为「还原此页」，再次点击可停止后续翻译并恢复原文。
- 「暂停所有网页翻译」是总开关，恢复总开关后可再次点击「翻译此页」。
- 当前页面开启后，网页内选项卡、展开内容、SPA 替换段落和滚动加载会增量补译。切回浏览器标签页时会重新检查可见内容。
- 切换 4 种显示模式会立即应用到已开启的页面。段落翻译失败后可点击失败提示重试。
- 选中文字后，可从右键菜单发起翻译。弹窗里的「文本翻译」也支持主动粘贴文本。
- 首次安装默认手动触发。升级会沿用已保存的自动翻译偏好，自动翻译开关位于「设置 → 翻译规则」。启用后，符合网站列表的页面可读文本会自动发送至配置的服务。

### 快捷键

按 `Alt+T` 翻译或还原当前页面，可在设置中自定义。

### 更新已加载的扩展

在 `edge://extensions/` 找到本扩展并点击「重新加载」，随后刷新需要翻译的网页。沿用现有加载目录可保留已保存的设置和密钥。

### 4 种显示模式

**双语对照**　原文下面跟着一行译文，最常用的模式。

**仅译文**　只显示中文，鼠标悬停看原文。排版最清爽。

**悬停翻译**　鼠标放到段落上才弹出翻译。原文不动，翻译按需显示。

**对照面板**　页面右侧或下方出现原文 / 译文对照表。适合仔细对比。

## 翻译接口

扩展预置百度机器翻译、百度大模型翻译、DeepSeek、智谱 GLM、火山引擎、通义千问、零一万物和豆包等服务。在「API 管理」中配置密钥、启用服务并调整优先级。实际可用服务取决于账号权限、模型和余额，额度及计费以各服务商控制台为准。

服务失败或额度不足时，会尝试优先级中的下一个可用服务。配置多个服务意味着待翻译文本可能发送给多个已启用的服务商。可仅启用自己信任的服务，或配置本机兼容接口。

### 添加自定义接口

任何 OpenAI 兼容 API 都能接入：

- 在「API 管理」点 **+ 添加自定义接口**
- 填入 baseURL、API Key、model 三个字段
- 保存后会自动加进 API 优先级列表，可拖拽调整顺序

## 设置说明

右键点扩展图标 → 选「扩展选项」，或者在弹窗里点「**设置**」按钮。

设置页分 7 个标签页：

**显示设置**　译文颜色、大小、字体、间距、悬停延迟、面板位置和宽度

**翻译规则**　自动翻译开关、代码块翻译、按钮文字翻译、最小翻译长度、不翻译的网站（黑名单）

**术语管理**　内置 100+ 专业术语，可自定义增删改、导入导出

**API 管理**　启用 / 关闭接口、修改密钥（PIN 码保护，掩码显示）、拖拽调整使用顺序、「测试」按钮验证连通，各接口旁标注免费额度

**额度限制**　为每个接口设置每日或每月使用上限（字符或 Token），达到 97% 自动切换到下一翻译源

**关于**　免责声明、插件工作原理、翻译效果示例、API 管理页说明、额度限制说明、术语库使用说明、密钥存储说明

**高级设置**　每批翻译段数、请求超时、失败重试次数、LLM 翻译 prompt 模板

## 常见问题

**为什么打开网页没有翻译？**

- 点击弹窗「翻译此页」，并确认翻译总开关已开启
- 如需自动触发，在设置 → 翻译规则打开「自动翻译」
- 中文段落按设置跳过；日文与中文页面里的英文可按段落规则翻译
- 检查该网站是不是被你加到黑名单了

**翻译得不准确怎么办？**

- 在 API 管理中调整服务优先级后重试
- 在「术语管理」里加专用词
- 在「高级设置」里调整 LLM prompt

**所有接口都显示「额度不足」？**

- 在服务商控制台检查余额、额度和账号权限
- 等待临时限流冷却后重试
- 在「API 管理」里加新接口

**翻译效果不理想？**

- 试试自定义 LLM prompt 强调特定场景
- 用术语管理覆盖你常用的词

**翻译报错了怎么办？**

- 错误提示已用大白话说明原因（如「密钥校验失败」「网络超时」），按提示处理即可
- 页面顶部的错误横幅带「重试」按钮；未配置 API 时带「打开设置」按钮
- 单段翻译失败时，直接点那段文字即可重译该段
- 仍找不到原因？点弹窗里的「故障排查」，用一键全面检查自助诊断

## 隐私与数据流

翻译需要把文本发送给你配置的翻译服务。请求包含待翻译的可读文本、源语言/目标语言、模型及翻译提示词；大模型请求还会带上当前网站实际命中的术语。API 密钥或签名用于向所选服务鉴权。服务提供商能接触到提交的文本，其保存和使用方式受该服务条款约束。个人账号页面、邮件、订单和聊天中的可见文本也可能含有个人信息，请通过手动触发和网站白名单控制翻译范围。

- 新安装默认手动触发。需要自动翻译时，可在「翻译规则 → 网站排除列表」选择白名单模式并填写信任的网站。
- 网页自动扫描会跳过表单、输入框、密码框、可编辑区、`translate="no"`、`.notranslate`、隐藏区域和脚本。嵌在普通段落中的编辑区也会排除。右键选区和弹窗输入由用户主动提交，请在操作前检查内容。
- 请求从扩展后台直接发往所配置的接口。统一强制省略 Cookie、Referer 并拒绝 HTTP 重定向，端点要求 HTTPS，本机回环地址可用 HTTP。
- 密钥和术语表保存到本机 `chrome.storage.local`。local 和 sync 限扩展可信上下文访问，网页内容脚本通过后台消息获取页面所需设置。
- 设置页支持 PIN 验证及密钥掩码，PIN 使用 PBKDF2-HMAC-SHA256 和随机盐。密钥仍以浏览器扩展存储的形式保存在本机，PIN 提供界面访问控制。
- 配置导出会剥离 API 密钥。通用偏好保存在 `chrome.storage.sync`，浏览器开启同步时可能同步这些偏好，术语表通过导出/导入迁移。
- CSP 限制脚本为扩展内置文件，翻译响应按文本或转义后的内容展示。

### 缓存与权限

原文和译文缓存使用 `chrome.storage.session`，随浏览器会话结束清除，最多 5000 条并受容量预算约束。扩展 Service Worker 短暂休眠期间可复用会话缓存。缓存按网站和语言隔离，旧版本磁盘上的翻译缓存会在后台初始化时清除。设置页的「清空缓存」同时清除已打开页面的文本复用缓存。隐私浏览的后台请求绕过共享会话缓存。浏览器会话存储的生命周期见 Chrome 官方文档。[Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)

`host_permissions` 包含 HTTP/HTTPS 网站，用于网页内容脚本和自定义翻译服务的跨域请求。浏览器安装时会提示读取和更改网站数据。可在 Edge 扩展详情中进一步限制本扩展的网站访问范围。

### 翻译范围

普通网页 DOM 中的可读文本、开启的标题与图片 alt 会参与翻译。iframe、Shadow DOM、图片里的文字和浏览器内部页面需要各自的专门适配。复杂站点可通过「故障排查」检查配置后，再提交可复现的公开页面示例。

### 体验参考

本轮参考沉浸式翻译的网页翻译入口、逐段双语展示和显示原文操作，优化当前插件的翻译/还原按钮与动态页面补译。[Edge 商店页面](https://microsoftedge.microsoft.com/addons/detail/amkbmndfnliijdhojkpoglbnaaahippg)、[官方网页翻译说明](https://immersivetranslate.com/zh-Hans/docs/features/webpage/)

## 文件结构

```
dual-translate-extension/
├── manifest.json                  扩展配置（MV3）
├── background.js                  Service Worker，消息路由 + 翻译调度
├── content.js                     注入网页的翻译脚本
├── content.css                    翻译 UI 样式
├── popup/                         扩展图标弹出面板
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/                       完整设置页（7 个标签页）
│   ├── options.html
│   ├── options.css
│   └── options.js
├── lib/
│   ├── api-manager.js             API 调度、优先级、超时重试、错误恢复
│   ├── api-registry.js            API 翻译器注册表（配置驱动替代 if/else 分支）
│   ├── api-metadata.js            API 元数据（供 options/popup UI 用）
│   ├── settings-manager.js        用户配置管理（含密钥隔离、域名排除缓存）
│   ├── translation-cache.js       翻译结果会话缓存（容量与过期控制）
│   ├── escape-utils.js            HTML 转义工具
│   └── api-adapters/
│       ├── base.js               翻译适配器基类（共享错误处理 + 语言映射）
│       ├── baidu.js               百度通用翻译
│       ├── baidu-llm.js           百度大模型翻译
│       ├── volcano.js             火山引擎机器翻译（V4 签名）
│       └── llm-generic.js         DeepSeek / GLM / 自定义 LLM
├── config/
│   ├── default-glossary.json      默认术语表（100+ 条）
│   └── llm-prompt.txt             LLM 翻译 prompt 模板
├── welcome/                       安装引导页
├── icons/                         扩展图标
├── .github/                       GitHub 社区文件（Issue/PR 模板、CI 工作流）
├── CHANGELOG.md                   完整变更日志
├── CONTRIBUTING.md                贡献指南
├── LICENSE                        MIT 许可证
└── package.json                   npm check 脚本
```

## 开发说明

- **架构**：MV3 Service Worker + ES Module
- **存储**：sync 保存一般偏好，local 保存密钥、术语表和 API 状态，session 保存翻译原文和译文缓存。术语表导出/导入支持跨设备迁移。
- **缓存策略**：浏览器会话内复用，按网站、源语言和目标语言隔离；关闭缓存或清空缓存后阻止旧的进行中结果重新写回。
- **错误恢复**：API 配额耗尽时标记 `quota_exceeded`，密钥错误时标记 `auth_error`，冷却期内不重试；超时后 AbortController 中止 fetch 节省 API 额度
- **国际化**：当前全中文硬编码（如果计划开源给国际用户，需要抽到 `_locales/`）
- **代码质量**：经 17 轮迭代，含性能优化 20 项（charCodeAt 热路径、事件委托、防抖写入、Promise.all 并行化等），累计修复 13 项严重 bug + 70 项中等风险问题 + 清理 220+ 行死代码/冗余。v1.0.11 架构重构提取 BaseTranslator 基类 + API 注册表工厂，消除适配器重复代码 ~113 行。v1.0.14-15 两轮全面 bug 审查修复 70 项（安全 9 + bug 33 + 可靠性 16 + UI/UX 8 + 架构 4）。全项目通过 `npm run check`（15 项语法检查）
- **密钥安全**：所有 API 密钥（含自定义供应商）存储在 `chrome.storage.local`，**不随 sync 同步**；`saveSettings` 合并而非覆盖密钥，防止单次保存丢失其他 API 配置；v1.0.13 新增 PIN 码保护（v1.2.16 起升级为 PBKDF2-HMAC-SHA256 慢哈希 + 盐值），设置页密钥掩码显示，导出时自动清除所有密钥

### 代码审查状态

v1.0.15 第二轮全面 bug 审查修复：

- **API 错误码**：百度 54001 改为 AUTH_ERROR（原误判为 QUOTA_EXCEEDED）、百度大模型 54003/54005 不再禁用一个月
- **安全**：PIN 暴力破解防护持久化到 storage（SW 重启后仍生效）、翻译错误消息对 content script 脱敏、原型链访问防护、导入 schema 验证
- **并发**：saveApiStatus 改为 per-API key 存储（消除 read-modify-write 竞态）、resetApiQuotaIfNeeded 原子写入、statusCache 局部更新
- **可靠性**：cleanupAllInjections 防崩兜底、quietTimer 模块级管理、testApi 定时器泄漏修复、llm-generic max_tokens 动态计算
- **存储格式变更**：API 状态从单键聚合改为 per-API 独立键（`apiStatus_${name}`），旧数据自动忽略并在翻译过程中自然重建

v1.0.14 全面 bug 审查修复：

- **安全**：原型污染防护（`_deepMerge`/`applyImportedSettings` 过滤危险键）、PIN 暴力破解防护（5 次失败 60 秒冷却 + 常量时间比较）、XSS 防护强化（`data-api` 属性转义）、写操作 sender 身份校验
- **并发**：translation-cache `_load()`/`_save()` promise 缓存序列化、`statusCache` 不再传快照改为读最新值
- **可靠性**：TTL 改用创建时间、`sweep`/`getStats` 处理损坏条目、`init()` 失败可重试、`testApi` 超时保护、月度配额重置时间修正
- **UI/UX**：API 测试按钮异常恢复、自定义供应商保存不再全量重渲染、PIN 对话框模式判断改用变量

v1.0.13 API 密钥安全管理：

- **安全**：PIN 码保护（当时为 SHA-256 + 盐值哈希，v1.2.16 起已升级为 PBKDF2-HMAC-SHA256），密钥掩码显示，导出时清除自定义供应商密钥
- **UX**：PIN 对话框三模式（设置/验证/重置），异步操作防重复提交，配置完整性检查
- **修复**：PIN 重置失败无反馈、异步按钮可重复点击、重置模式聚焦隐藏输入框

v1.0.12 风险修复：

- **安全**：`getSettings` 增加 sender 身份校验，content script 不再接收 apiKeys
- **清理**：移除 `API_REGISTRY.custom` 死代码（23 行），消除维护混淆
- **错误处理**：`_handleHttpError` 增加 Content-Type 检查，非 JSON 响应 fallback 到 text() 并截取错误片段

v1.0.11 架构重构：

- **基类提取**：创建 `BaseTranslator` 基类，4 个适配器继承，消除重复 HTTP 错误处理和语言映射代码
- **注册表工厂**：创建 `api-registry.js`，配置驱动替代 `api-manager.js` 中 ~120 行 if/else 分支
- **净减代码**：`api-manager.js` 从 ~345 行降至 232 行（-113 行），无功能变更

v1.0.7 新增修复：

- **严重**：设置页 API 密钥显示丢失（SW 冷启动 + saveSettings 覆盖 + _mergeKeysIntoApi 不覆盖）、`getApiDisplayName` 无限递归
- **安全**：自定义供应商 apiKey 从 sync 剥离到 local，防止跨设备同步泄漏
- **UX**：自定义供应商重复渲染消除、一键清除按钮、自动清理空供应商、设置加载重试

v1.0.6 期间做了 5 次全项目代码审查（子代理并发审核），已修复的问题包括：

- **严重**：`switchMode` 竞态导致并发翻译、custom providers 永远不构建、`escapeHtml` 实体不全、`translate()` 成功后 statusCache 不更新导致 consecutiveErrors 永不重置、`cleanupAllInjections` 未清增量追踪状态导致 HOVER/PANEL 重翻译失效、`switchMode` abort 旧翻译后旧 catch 破坏新翻译
- **高风险**：取消翻译成功后弹误报 alert、百度 API `error_code` 类型不匹配、面板关闭清空全部监听器、月度配额跨年失效、`auth_error` 不阻止重试、abort 后仍注入翻译、`reload()` 缺少 resetApiQuotaIfNeeded、防抖缓存 SW 休眠前未 flush
- **安全**：XSS 转义强化、快捷键回滚、API 错误 UI 提示完善、非 AbortError 异常添加用户提示
- **性能**：charCodeAt 热路径替换 regex、fillTranslations 消除 O(n²) 全文档扫描、AbortController 中止超时 fetch、事件委托替代逐段监听器、storage 批量读/防抖写入/正则预编译缓存、Promise.all 并行化（init/reload/popup/options/loadState/loadAllData/updateIcon）
- **清理**：删除 `lib/logger.js`（死代码）、`escapeHtml`（零调用）、`INSTALLED_KEYS_KEY`（从未写入的 storage key）、大量死 CSS 规则和冗余变量

历史审查报告已随开源清理移除。剩余已知风险（留待后续版本）：

- `api-registry.js` 的 `LLM_PROVIDERS` 与 `api-metadata.js` 的 `API_DISPLAY_NAMES` / `API_MODELS_DEFAULT` 仍为两份独立维护的数据（IIFE vs ES module 不兼容无法 import，已加注释标注同步要求）

## 版本迭代逻辑

> **以下规则适用于 v1.1.0 及之后的所有版本**，供未来开发者或 AI 大模型在更新维护本项目时遵循。

版本号采用 **语义化版本（SemVer）** 三段式：`主版本.中版本.小版本`（如 `1.2.3`）。

### 升级规则

| 变更类型 | 版本升级方式 | 示例 |
|----------|-------------|------|
| 用户可直观感知的功能性改动，或较大的视觉效果改动 | **升级中版本** | `1.1.0` → `1.2.0` |
| 漏洞修复、性能优化、代码重构等非用户可直观感知的更新 | **升级小版本** | `1.1.0` → `1.1.1` |
| 不兼容的架构变更或重大重构（极少） | **升级主版本** | `1.x.x` → `2.0.0` |

### 判定标准

**升级中版本（如 1.1.0 → 1.2.0）的场景：**
- 新增用户可操作的功能（如新的翻译模式、新的设置项）
- 较大的 UI / UX 视觉改动（如设置页重新排版、新增页面）
- 用户交互流程的明显变化（如新增欢迎引导页）
- 诊断工具等开发者辅助功能的新增

**升级小版本（如 1.1.0 → 1.1.1）的场景：**
- Bug 修复（不影响用户已有操作流程）
- 性能优化（不改变功能，仅提升效率 / 降低资源占用）
- 安全加固（防御性编程增强，用户无感知）
- 代码重构 / 内部架构调整（对外行为不变）
- 跨平台兼容性微调（CSS 媒体查询调整、字体栈修正等）
- 文档更新、注释补充

### 操作要求

每次版本升级时，**必须同步更新以下文件**：
1. `manifest.json` — 扩展实际版本号（浏览器读取此字段）
2. `package.json` — npm 包版本号
3. `README.md` — 顶部「当前版本」标注
4. `CHANGELOG.md` — 新增版本条目，按格式记录变更

代码中的版本注释（如 `// v1.1.0 perf:`）用于标注改动所属版本，**不需要在版本升级时批量修改历史注释**。

## 注意事项

- **API 密钥需要在设置页「API 管理」里自己填入**——扩展不内置任何密钥，使用前先配置可用接口
- 扩展本身是**个人项目**，按 MIT 协议开源
- Edge 和 Chrome 都支持

## 许可证

MIT License
