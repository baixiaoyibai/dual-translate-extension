# 贡献指南

感谢你对双语翻译助手项目的兴趣！本文档说明了参与贡献的流程。

## 如何贡献

### 报告 Bug

1. 在 [Issues](https://github.com/baixiaoyibai/dual-translate-extension/issues) 搜索是否已有相同问题
2. 如果没有，点击「New issue」选择 Bug 报告模板
3. 填写浏览器类型/版本、扩展版本、复现步骤、预期行为和实际行为
4. 如果可能，附上浏览器控制台（F12）的错误日志截图

### 提交功能建议

1. 在 [Issues](https://github.com/baixiaoyibai/dual-translate-extension/issues) 中描述你想要的功能
2. 说明使用场景和期望的交互方式
3. 如果有能力，欢迎直接提交 Pull Request

### 提交代码

1. Fork 本仓库
2. 创建分支：`git checkout -b feature/your-feature-name`（功能）或 `git checkout -b fix/your-bugfix-name`（修复）
3. 提交更改，编写清晰的 commit message
4. 推送到你的 Fork 并提交 Pull Request

## 开发环境

### 前置要求

- Node.js >= 18（仅用于语法检查脚本）
- Edge 或 Chrome 浏览器

### 本地运行

1. Clone 仓库
2. 打开 Edge：`edge://extensions/` → 开启「开发人员模式」→「加载解压缩的扩展」→ 选择项目根目录
3. Chrome 同理：`chrome://extensions/`

### 语法检查

提交前请运行语法检查：

```bash
npm run check
```

该脚本会对所有 JS 文件执行 `node --check` 语法验证。

## 代码规范

### 版本迭代规则

版本号采用语义化版本：`主版本.中版本.小版本`（如 `1.2.3`）。

| 变更类型 | 版本升级 | 示例 |
|----------|----------|------|
| 用户可直观感知的功能/视觉改动 | 升级中版本 | `1.1.0 → 1.2.0` |
| Bug 修复、性能优化、安全加固 | 升级小版本 | `1.1.0 → 1.1.1` |
| 不兼容的架构变更 | 升级主版本 | `1.x.x → 2.0.0` |

每次版本升级需同步更新：`manifest.json`、`package.json`、`README.md`（顶部版本标注）、`CHANGELOG.md`。

### 安全要求

- **绝对不要在代码中硬编码 API 密钥、邮箱、IP 或本地路径**
- API 密钥必须通过 `chrome.storage.local` 存储，不得放入 sync storage
- 所有用户输入必须经过 HTML 转义（使用 `escape-utils.js`）
- 写操作必须校验 sender 身份（扩展 ID + URL 前缀）
- 翻译缓存操作必须序列化，防止并发数据丢失

### 代码风格

- 使用 ES Module（`import`/`export`）
- 异步操作必须有错误处理（`.catch()` 或 `try/catch`）
- fire-and-forget 的 Promise 调用必须附加 `.catch()`
- CSS 使用变量而非内联样式
- 函数声明在非 ES module 脚本中不得与全局函数重名（避免无限递归）

## Pull Request 要求

- PR 标题简明描述变更内容
- 如果修复 Bug，在 PR 描述中附上对应 Issue 编号
- 确保通过 `npm run check` 语法检查
- 不要提交 `node_modules/`、`.env`、构建产物等文件
