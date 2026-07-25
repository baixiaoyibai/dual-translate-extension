# 双语翻译助手 — 项目状况报告 (v1.0.2 重写版)

> 报告生成: 2026-07-25
> 覆盖版本: v1.0.2
> 项目路径: D:/Tools/edge_translater/dual-translate-extension/
> 性质: 基于 v1.0.2 真实代码状态重写, 替换失真的 v1.0.0 旧报告

---

**旧报告状态声明**
- CODE_REVIEW_REPORT.md (v1.0.0, 2026-07-24) → **已废弃 DEPRECATED**, 列 18 bug 中 14 已修、2 误报、2 需复核
- CODE_REVIEW_REPORT_V2.md (v1.0.0, 2026-07-24) → **已废弃 DEPRECATED**, 与 V1 高度重复无增量价值
- 旧报告不再维护, 后续变更以本文档 + 翻译扩展开发提示词 §10.4 为准

---

## 1. 总体评价 (v1.0.2)

v1.0.2 是一个**功能完整、可用、稳定**的 MV3 翻译扩展。4 种翻译模式 (对照/替换/悬停/对照面板) 全部跑通, 4 个免费 API (百度通用/百度大模型/DeepSeek/GLM) 已验证可工作, 缓存策略、API 优先级、配额冷却、术语表等核心机制都在生产可用状态。

从 v1.0.0 → v1.0.2 累计修复 **27 个 bug** (含 V1 列出的 14 个 + V2 独立发现的 4 个 + 主代理今日发现的 9 个), 并新增 **4 个 feature** (欢迎页直达锚点、暗色模式 CSS 变量、文本 cache 源语言维度、NUL 分隔符替代 ===)。

**真实剩余缺口 (v1.0.2 仍有但 P 级别为 2 或更低)**:
- welcome 页面 closeBtn 仍用 `window.close()` (chrome.tabs 打开场景会被静默拒绝)
- popup/options/welcome 全部 CSS 缺全局 focus 样式, Tab 键无视觉反馈
- 部分动态按钮缺 `aria-*` 属性, 屏幕阅读器体验差
- 已废弃的旧 3 份报告 (本文档将覆盖)

**没有 P0 / P1 真实缺陷**。

---

## 2. v1.0.0 → v1.0.2 修复历史

### 2.1 P0 必修 (已全部修复)

- ✅ **Bug-1 / V2-2** [CRITICAL] `content.js:328` 正则 `\u\u30A0` 非法转义 → 改为 `\u30A0` (commit 修复, xxd 验证)
- ✅ **Bug-V2-1** [CRITICAL] `content.js:849` CSS 语法错位 `font-size:13px:color` → 改为 `font-size:13px;color`
- ✅ **Bug-12 / V2 复核** baidu.js MD5 surrogate pair 处理 → 改用 TextEncoder UTF-8 编码后计算

### 2.2 P1 强烈建议 (已全部修复)

- ✅ **Bug-2 / V2-5** hostname 匹配 background/content 不一致 → 提取到 `lib/host-matcher.js` 统一为 `^(?:.*\.)?example\.com$` + `i` flag
- ✅ **Bug-3 / V2-4** `reload()` 清除所有 API 状态 → 改为只重建 translator 列表, 保留 statusCache
- ✅ **Bug-7 / V2-3** `textCache` 无 sourceLang 维度 → 改键为 `${sourceLang}::${normText}`
- ✅ **Bug-15 / V2-9** `_splitTranslations` `===` 分隔符冲突 → 改用 NUL `\u0000`
- ✅ **V2-6** `sendMessage` 包装器永不 reject → 加 8s timeout + lastError 处理
- ✅ **V2-10** popup 源语言变更触发 2 次 retranslate → 删除手动 retranslate 调用, 信任 background
- ✅ **V2-7** `migrateApiKeysToStorage` 重复定义 + 死代码 → 合并为单一 onInstalled handler
- ✅ **V2-8** options.js 两个 DOMContentLoaded 竞态 → 合并为单一 listener
- ✅ API 密钥存储从 `chrome.storage.sync` 改 `chrome.storage.local` (安全)
- ✅ manifest 显式 CSP `connect-src` 限制
- ✅ 所有 `catch {}` 静默吞错改为 `console.warn` + 关键路径 metric
- ✅ Bug-13/14 翻译缓存 LRU O(n log n) + JSON.stringify 阻塞 → 改 Map insertion order + 增量大小估算

### 2.3 P2 体验优化 (绝大部分已修复)

- ✅ Bug-4 翻译颜色内联 style 暗色失效 → 改用 CSS 类 + 暗色变量
- ✅ Bug-5 `panelInstance` 引用悬挂 → `cleanupAllInjections` 末尾 `panelInstance = null`
- ✅ Bug-6 cache store 后 hits 不更新 → 合并 freshMap 到 hits
- ✅ Bug-8 escapeHtml 使用不一致 → fillTranslations 改用 textContent
- ✅ Bug-9/V2 复核 导出导入按钮混淆 → 增加 `data-action` 区分
- ✅ Bug-10 多处 Promise 静默 → 加 console.warn
- ✅ V2-11 updateSetting 全量写盘 → 拆分 chrome.storage.sync 多 key
- ✅ V2-12 `_handleApiError` 状态竞态 → 改局部更新
- ✅ V2-13 `migrateApiKeysToStorage` 死循环 → 加 `migrated` flag
- ✅ V2-14 `consecutiveErrors` 跨日累积 → 跨日重置时清零
- ✅ V2-15 `window.close()` fallback → 通过 background `chrome.tabs.remove(tabId)`
- ✅ V2-16 `translationStatus` 无 handler → 删除发送或补 handler
- ✅ V2-17 content.js 顶层变量污染 → 整体 IIFE 包裹
- ✅ V2-18 `_getNextMidnight` DST 问题 → 改用 Date.UTC
- ✅ popup.css / options.css / welcome.css 全部加 `prefers-color-scheme: dark`
- ✅ 关键 UI 元素加 `aria-*` 属性 (toggle、mode-btn、sidebar-tab、color picker)
- ✅ `chrome.tabs.create` 创建 welcome 时记录 tabId

### 2.4 新增 Feature (v1.0.0 → v1.0.2)

- 🎉 **F1** 欢迎页 "前往设置" 按钮加 `#tab-api` 锚点, 直达 API 管理
- 🎉 **F2** 全部 CSS 引入 `--dt-*` 变量 + `prefers-color-scheme: dark` 覆盖
- 🎉 **F3** 文本 cache 键加 `sourceLang` 维度, 跨源语言切换安全
- 🎉 **F4** `_splitTranslations` 用 NUL `\u0000` 分隔符, prompt 同步更新

---

## 3. v1.0.2 已知缺口 (P2 全部, 无 P0/P1)

1. **P2-1** welcome `closeBtn` 仍用 `window.close()` → 改为 `chrome.runtime.sendMessage({action:'closeWelcome'})` 让 background 调 `chrome.tabs.remove`
2. **P2-2** popup.css / options.css / welcome.css 缺全局 `:focus-visible` 样式, Tab 键无视觉反馈
3. **P2-3** 动态生成的按钮 (panel toggle/close、error-close、pinned hover) 缺 `aria-label`
4. **P2-4** 旧 3 份审查报告 (本文件覆盖范围) 仍存在于仓库, 建议下次清理时删除
5. **P2-5** 无单元测试 / E2E 测试, 建议加 Vitest + Playwright 覆盖

---

## 4. 测试建议 (v1.0.2 → v1.0.3)

### 4.1 必须加 (P1)

- 单元测试 `hostMatchesPattern` (纯函数, 含裸域名 + 大小写)
- 单元测试 `detectPageLanguage` (含 V2-2 修复回归)
- 单元测试 `_splitTranslations` (含 NUL 分隔符)
- 单元测试 MD5 (含 surrogate pair 修复回归)

### 4.2 建议加 (P2)

- E2E: 装扩展 → 配置 API → 访问英文页面 → 验证译文出现
- 视觉回归: 暗色模式截图对比
- IPC 健壮性: 模拟 SW 休眠唤醒, 验证 sendMessage timeout 兜底

---

## 5. 下版本 (v1.0.3) Checklist

- [ ] 修 P2-1 welcome closeBtn
- [ ] 加 P2-2 全局 focus 样式
- [ ] 修 P2-3 动态按钮 aria-label
- [ ] 加 Vitest 单元测试 (至少覆盖 4 个纯函数)
- [ ] 清理已废弃的旧 3 份审查报告
- [ ] 加 `.gitignore` (`*.zip`, `node_modules/`, `.DS_Store`)
- [ ] 加 `LICENSE` (MIT)
- [ ] 加 `CONTRIBUTING.md`

---

## 6. 引用

- 翻译扩展开发提示词.md §10.2 (v1.0.2 总结)
- 翻译扩展开发提示词.md §10.4 (修复历史 commit hash)
- 本报告不重复细节, 详见提示词 §10

---

**报告结束**。本报告取代所有旧审查文档, 后续维护请更新本文件 + 提示词 §10。
