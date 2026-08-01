# 双语翻译助手

一个给 Edge / Chrome 浏览器用的翻译扩展（Manifest V3）。浏览英文或日文网页时，自动帮你翻译成简体中文，支持 4 种显示方式，内置 4 个免费翻译接口自动轮换，支持专业术语自定义。

> **版本变更历史请见 [CHANGELOG.md](./CHANGELOG.md)**，当前版本：**v1.2.11**

## 有什么用

- 看英文 / 日文网页，自动翻成中文
- 4 种显示方式（双语对照 / 仅译文 / 悬停翻译 / 对照面板）
- 内置 4 个免费翻译接口（默认启用），**配额耗尽自动切换下一个**，不会翻译中断
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

- **打开网页自动翻译**：访问英文或日文网页后等待几秒即可
- **手动开关翻译**：点击浏览器右上角扩展图标，在弹出面板里点按钮——**开启状态下显示「关闭翻译」（按钮⏸），关闭状态下显示「开启翻译」（按钮▶）**
- **切换显示模式**：在弹窗里点 4 个模式按钮，**立即生效**，不刷新页面
- **翻译选中的文字**：选中一段文字 → 右键 → 点「翻译选中文字」

### 快捷键

按 `Alt+T` 快速切换翻译开关。

### 4 种显示模式

**双语对照**　原文下面跟着一行译文，最常用的模式。

**仅译文**　只显示中文，鼠标悬停看原文。排版最清爽。

**悬停翻译**　鼠标放到段落上才弹出翻译。原文不动，翻译按需显示。

**对照面板**　页面右侧或下方出现原文 / 译文对照表。适合仔细对比。

## 翻译接口

扩展默认启用 4 个翻译接口（百度机器翻译 / 百度大模型翻译 / DeepSeek / 智谱 GLM），按以下优先级使用：

**接口 1**　**百度机器翻译**（通用文本）　标准版5万字符/月，高级版100万字符/月　每月 1 号重置

**接口 2**　**百度大模型翻译**　无独立免费额度　每月 1 号重置

**接口 3**　**DeepSeek**　无免费额度，按量付费　每天 0 点重置

**接口 4**　**智谱 GLM**（免费版）　完全免费，不限量

如果第一个接口配额耗尽，会自动切到第二个，依此类推。**全部用完会提示「所有翻译服务暂时不可用」**。

### 添加更多预置接口

除上面 4 个默认启用的接口外，扩展还预置了 5 个可启用的供应商（在「API 管理」里勾选即可）：

- **火山引擎机器翻译**：200万字符/月（免费），`https://www.volcengine.com/product/translate`
- **通义千问**（阿里云百炼）：100万Token/模型（一次性），`https://dashscope.console.aliyun.com`
- **智谱 GLM**（付费版，与免费版独立）：`https://open.bigmodel.cn`
- **零一万物**：`https://platform.lingyiwanwu.com`
- **豆包**（火山方舟）：50万Token/模型（一次性），`https://console.volcengine.com/ark`

加上前面 4 个默认启用的，共 **9 个预置供应商** 可在「API 管理」里自由调整优先级。

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
- 检查弹窗里的翻译开关是不是绿色（已启用）
- 设置 → 翻译规则 → 「自动翻译」要打开
- 网页本身是中文不会翻译
- 检查该网站是不是被你加到黑名单了

**翻译得不准确怎么办？**
- 切换不同显示模式试试（不同模式可能调不同接口）
- 在「术语管理」里加专用词
- 在「高级设置」里调整 LLM prompt

**所有接口都显示「额度不足」？**
- 等第二天 0 点（DeepSeek / GLM 自动恢复）
- 等下个月 1 号（百度自动恢复）
- 在「API 管理」里加新接口

**翻译效果不理想？**
- 试试自定义 LLM prompt 强调特定场景
- 用术语管理覆盖你常用的词

## 安全性

- **API 密钥存在本地**（`chrome.storage.local`），**不会跨设备同步**到 Google 账户
- **密钥 PIN 码保护**：设置页所有密钥默认掩码显示，需验证 6 位 PIN 码后才能查看 / 编辑 / 复制；PIN 码使用 SHA-256 + 盐值哈希存储；页面刷新后自动锁定
- **导出设置不含密钥**：导出的配置文件会自动清除所有 API 密钥和自定义供应商密钥
- 翻译请求只发到你配置的翻译接口，**扩展本身不上传任何数据**
- 排除列表默认包含 100+ 国内主流站点（百度、淘宝、B 站等），避免在中文页面误触发
- **v1.1.0 安全加固**：
  - API 端点强制 HTTPS（仅 localhost 允许 HTTP），防止密钥明文传输
  - 敏感操作 sender 双重身份校验（URL 前缀 + 扩展 ID），防御跨扩展伪造
  - 写操作白名单机制，content script 仅能持久化非敏感设置（翻译开关/模式）
  - 翻译输入校验（上限 500 条/每条 10000 字符），防止资源耗尽攻击
  - 术语表保存结构校验，拦截原型链污染
  - 所有动态 HTML 输出统一使用 escapeAttr 转义，防止 XSS

> ⚠️ **首次安装时的浏览器警告**
> 
> Edge/Chrome 在加载此扩展时会弹出"**读取并更改您在所有网站上的所有数据**"的警告。这是**翻译类扩展的行业惯例**（Google Translate、沉浸式翻译等同类扩展都采用 `<all_urls>`）。本扩展**不会**上传任何页面内容到任何第三方服务器（详见下方"扩展不会做什么"）。

### 权限说明（`host_permissions: ["<all_urls>"]`）

扩展声明了 `host_permissions: ["<all_urls>"]`，这是翻译类扩展的行业惯例（Google Translate、沉浸式翻译等同类扩展均采用）。需要该权限的原因：

- **网页内容注入**：翻译功能依赖 content script 在任意网页上扫描段落文本、注入双语对照 / 译文节点。在 Manifest V3 中，content script 的注入受 `host_permissions` 约束，若权限不足，访问大多数网页时翻译脚本不会加载，核心功能将完全失效。
- **自定义翻译接口**：用户可在「API 管理」中填入**任意 baseURL** 的 OpenAI 兼容接口。这些请求由 Service Worker 发起，必须有对应 host 权限才能跨域访问。由于 baseURL 由用户自由配置、域名不可穷举，无法用预置域名列表覆盖。

**为什么不用 `optional_host_permissions` 动态申请？**

- 对 content script 不可行：`chrome.permissions.request` 必须在用户手势（点击）中调用，而用户访问新网页时没有可用的手势上下文，无法在导航时自动授权，会导致每打开一个新站点都要手动点扩展图标授权，体验不可接受。
- 仅对自定义 API 部分可行，但需要额外处理 URL 解析、编辑后旧权限回收、测试按钮前置授权等边界情况，且 `<all_urls>` 作为可选权限申请会触发更显著的警告，得不偿失。

**扩展不会做什么（可审计承诺）**：

- 扩展**不会**把页面内容上传到任何第三方服务器——翻译请求只发往你在设置页配置的翻译接口（百度 / DeepSeek / 智谱 / 自定义等），请求内容仅限待翻译的文本片段
- 扩展**不会**收集浏览历史、Cookie、账号信息或任何身份标识
- 源码按 MIT 协议开源，CSP 严格限制为 `script-src 'self'; object-src 'self'`，**不允许加载或执行任何远程代码**，杜绝远程脚本注入风险
- API 密钥存在 `chrome.storage.local`，**不跨设备同步**，不上传到任何服务器

### 数据存储说明

扩展会把以下数据存在浏览器本地（`chrome.storage.local`），**不会上传到任何服务器**：

- **API 密钥**：所有翻译接口的 appId / secretKey / apiKey
- **翻译缓存**：翻译过的原文和译文（3 天 TTL，自动过期；最多 10000 条 LRU 淘汰）
- **API 状态**：每个接口的 quota_exceeded 标记（决定冷却期内是否跳过该接口）

**翻译缓存会在磁盘上保留 3 天**——如果你需要清理，手动去 Chrome 设置 → 扩展 → 找到本扩展 → 「清除数据」即可立即清空。

## 文件结构

```
dual-translate-extension/
├── manifest.json                  扩展配置（MV3）
├── background.js                  Service Worker，消息路由 + 翻译调度
├── content.js                     注入网页的翻译脚本（1334 行）
├── content.css                    翻译 UI 样式（315 行）
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
│   ├── translation-cache.js       翻译结果缓存（LRU + 3 天 TTL + 防抖写入）
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
- **存储**：`chrome.storage.sync` 存用户配置（不含密钥），`chrome.storage.local` 存 API 密钥、翻译缓存、API 状态
- **缓存策略**：翻译结果持久化到 `chrome.storage.local`，3 天 TTL 自动过期，最多 10000 条 LRU 淘汰；防抖写入（5 秒合并）；服务重启后缓存仍在
- **错误恢复**：API 配额耗尽时标记 `quota_exceeded`，密钥错误时标记 `auth_error`，冷却期内不重试；超时后 AbortController 中止 fetch 节省 API 额度
- **国际化**：当前全中文硬编码（如果计划开源给国际用户，需要抽到 `_locales/`）
- **代码质量**：经 17 轮迭代，含性能优化 20 项（charCodeAt 热路径、事件委托、防抖写入、Promise.all 并行化等），累计修复 13 项严重 bug + 70 项中等风险问题 + 清理 220+ 行死代码/冗余。v1.0.11 架构重构提取 BaseTranslator 基类 + API 注册表工厂，消除适配器重复代码 ~113 行。v1.0.14-15 两轮全面 bug 审查修复 70 项（安全 9 + bug 33 + 可靠性 16 + UI/UX 8 + 架构 4）。全项目通过 `npm run check`（15 项语法检查）
- **密钥安全**：所有 API 密钥（含自定义供应商）存储在 `chrome.storage.local`，**不随 sync 同步**；`saveSettings` 合并而非覆盖密钥，防止单次保存丢失其他 API 配置；v1.0.13 新增 PIN 码保护（SHA-256 + 盐值哈希），设置页密钥掩码显示，导出时自动清除所有密钥

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

- **安全**：PIN 码保护（SHA-256 + 盐值哈希），密钥掩码显示，导出时清除自定义供应商密钥
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

- **API 密钥需要在设置页「API 管理」里自己填入**——扩展不内置任何密钥，开箱即用前先配一个免费接口
- 扩展本身是**个人项目**，按 MIT 协议开源
- Edge 和 Chrome 都支持

## 许可证

MIT License
