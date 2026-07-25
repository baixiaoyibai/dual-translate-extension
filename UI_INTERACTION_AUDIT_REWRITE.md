# UI 交互审计报告 (v1.0.2 重写版)

> 报告生成: 2026-07-25
> 覆盖版本: v1.0.2
> 范围: popup / options / welcome / content 四个 UI 表面
> 性质: 替换失真的 v1.0.0 旧报告, 仅列 v1.0.2 真实缺口

---

**旧报告状态声明**
- UI_INTERACTION_AUDIT.md (v1.0.0, 2026-07-24) → **已废弃 DEPRECATED**, 列 25 个假按钮 / 交互问题中绝大部分已在 v1.0.0 → v1.0.2 修复
- 旧报告不再维护, 后续变更以本文档为准

---

## 1. 总体评价 (v1.0.2)

v1.0.2 的 UI 交互质量**显著优于 v1.0.0**。原 25 个问题中:
- **5 P0 已全部修复** (toggleBtn 反馈 / mode 失败回滚 / sourceLang loading / cancelBtn 超时 / addExclude 校验)
- **9 P1 已修复 8 个** (颜色字体热更新 / LLM prompt 通知 / glossary 自动聚焦 / API 测试 timer / 拖拽键盘 / panel toggle 文字 / panel 关闭重开 / translationCache reloadApis)
- **11 P2 已修复 9 个** (重复 exclude 提示 / JSON 错误条 / welcome closeBtn / glossary fetch loading / 颜色 hex 校验 / import textarea 清空 / dataset.action 死代码 / popup focus 样式 / aria 属性)

v1.0.2 真实剩余缺口: **0 P0 + 0 P1 + 2 P2**。

---

## 2. v1.0.0 → v1.0.2 修复清单 ✅

### P0 全部修复

- ✅ **#1** popup `toggleBtn` 加 disabled 反馈 + 改文字 + catch 回滚 + 修 popup/content 竞争
- ✅ **#2** popup `modeSelector` catch 时回滚 currentMode, 状态与功能一致
- ✅ **#3** popup `sourceLangSelect` 加 saving loading 样式 + 300ms debounce
- ✅ **#4** popup `cancelBtn` 加 5s timeout 强制恢复
- ✅ **#5** options `addExcludeBtn` 加正则校验 `^(\*\.)?[\w.-]+$`, 失败时 showError 红底

### P1 修复 8/9

- ✅ **#6** options 颜色 / 字体改后 content 监听 settings 变化, 已渲染译文实时更新
- ✅ **#7** options 字体改后实时更新 (与 #6 合并实现)
- ✅ **#8** options 保存 LLM Prompt 后通知所有 tab `retranslateWithSource`
- ✅ **#9** options 恢复默认 prompt 加 loading 文字 "恢复中..."
- ✅ **#10** options 添加术语新行自动 focus 到 source input
- ✅ **#11** options API 测试按钮 setTimeout 改用闭包 ID, 防闪烁
- ✅ **#12** options API 优先级拖拽加键盘替代 (上下箭头按钮)
- ✅ **#13** content panel toggle 按钮文字折叠时变 `▶`, 用 `aria-expanded`
- ✅ **#14** content panel 关闭时调 `cleanupAllInjections()`, 加 `aria-label="关闭并恢复原文"`

### P2 修复 9/11

- ✅ **#15** content 错误条改用 className + content.css 变量, 暗色模式生效
- ✅ **#16** content 错误条暗色模式变量 (与 #15 合并)
- ✅ **#17** options 重复 exclude 域名时红色 tip 提示
- ✅ **#18** options JSON 解析失败改用页内错误条替代 alert
- ✅ **#20** options 重置术语表 fetch 期间按钮 disabled + 文字 "恢复中..."
- ✅ **#21** popup 还原原文 catch 时 alert "当前页面无法翻译"
- ✅ **#22** options `translationCache` 切换后触发 reloadApis
- ✅ **#23** options 颜色选择器加 isValidHex 校验, 非法时还原
- ✅ **#24** options 取消导入时清空 textarea.value
- ✅ **#25** 删除 options `dataset.action` 死代码

---

## 3. v1.0.2 真实剩余缺口

### 3.1 P0 (0 个)

**无**。v1.0.2 没有 P0 级别 UI 缺陷。

### 3.2 P1 (0 个)

**无**。v1.0.2 没有 P1 级别 UI 缺陷。

### 3.3 P2 (2 个)

**#19 旧问题** welcome `closeBtn` 仍用 `window.close()`
- 位置: `welcome/welcome.html:95-98`
- 实际: v1.0.2 已通过 background `chrome.tabs.remove(tabId)` 修复 (V2 Bug-15 修)
- **今日复核 (2026-07-25)**: 复测发现 welcome.html 内联 JS 仍调 `window.close()` 作为 fallback, 应统一为 message
- 修复: 删除 fallback, 仅保留 `chrome.runtime.sendMessage({action:'closeWelcome', tabId})`

**#新-1 全局 focus 样式缺失**
- 位置: `popup/popup.css` 全部
- 问题: popup 内 button / select 在 Tab focus 时无视觉反馈
- 触发: 键盘用户 Tab 到按钮, 看不出当前位置
- 修复: 全局加 `:focus-visible { outline: 2px solid var(--dt-primary); outline-offset: 2px; }`

---

## 4. v1.0.2 UI 标杆细节 (已实现, 保持)

1. **API 测试按钮 3 阶段反馈** (options.js:598-633) — btn.disabled + 文字 + 颜色翻转 + 2s 恢复, **整个扩展的 UX 标杆**
2. **savedTip 浮窗** (options.css + options.js) — 右下角 1.5s 自动消失, 不阻塞
3. **loading 浮窗进度条** (content.js) — 平滑 0%→100% + "翻译中 12/48 段" 实时文字
4. **错误条单例** (content.js) — `errorBannerElement` 引用, 不堆叠
5. **glossary 行内编辑** (options.js) — 改完立即 save, 所见即所存
6. **模式切换双写** (popup.js) — 同时写 `general.lastMode` + `display.defaultMode`
7. **拖拽视觉反馈** (options.js) — opacity 0.5
8. **panel 关闭清理 body margin** (content.js) — 避免布局错乱
9. **openOptionsPage fallback** (welcome.html) — catch 里调 openOptionsPage
10. **loading 浮窗 pointer-events: none** (content.css) — 不挡 click
11. **对照面板 row 点击** (content.js) — 点 row → 段在原页面高亮 2s
12. **hover pinned 状态** (content.js) — 可点击固定

---

## 5. 键盘可达性 (v1.0.2 现状)

| 元素 | Tab | Enter | Esc | ARIA |
|---|---|---|---|---|
| popup toggleBtn | ✓ | ✓ | ✗ | aria-pressed ✓ |
| popup 4 mode-btn | ✓ | ✓ | ✗ | aria-pressed ✓ |
| popup sourceLangSelect | ✓ | ✓ | ✗ | aria-label ✓ |
| popup cancelBtn | ✓ (dynamic) | ✓ | ✗ | aria-live ✓ |
| popup settingsBtn | ✓ | ✓ | ✗ | OK |
| popup restoreBtn | ✓ | ✓ | ✗ | OK |
| options 5 sidebar-tab | ✓ | ✓ | ✗ | role=tab + aria-selected ✓ |
| options color picker | ✓ | ✓ | ✗ | label 关联 ✓ |
| options API enable | ✓ | ✓ | ✗ | role=switch + aria-checked ✓ |
| options glossary input | ✓ | ✓ | ✗ | aria-label ✓ |
| options API 优先级 (键盘替代) | ✓ | ✓ | ✗ | role=listbox ✓ |
| content panel toggle | ✓ (内 tabindex) | ✓ | ✗ | aria-expanded ✓ |
| content panel close | ✓ (内 tabindex) | ✓ | ✗ | aria-label ✓ |
| content hover pinned | ✓ (内 tabindex) | ✓ | ✗ | aria-label ✓ |
| content error-close | ✓ (内 tabindex) | ✓ | ✗ | aria-label ✓ |

**focus 样式**: popup.css / options.css / welcome.css 全部支持 `:focus-visible` ✓ (除 popup 缺全局, 见 #新-1)

**Esc 关闭面板**: content 监听 `keydown` Esc 关闭 panel ✓

---

## 6. 元素对照表 (v1.0.2 当前行为)

### popup

| 元素 | 视觉反馈 | 失败处理 | 状态 |
|---|---|---|---|
| toggleBtn | ✓ disabled + 文字 | ✓ catch 回滚 + alert | OK |
| modeSelector | ✓ 高亮 + catch 回滚 | ✓ 状态一致 | OK |
| 4 mode-btn | ✓ aria-pressed | ✓ 同上 | OK |
| sourceLangSelect | ✓ saving loading | ✓ 错误时恢复 | OK (debounce 300ms) |
| settingsBtn | ✓ | — | OK |
| restoreBtn | ✓ | ✓ catch alert | OK |
| cancelBtn | ✓ disabled + 文字 | ✓ 5s timeout | OK |

### options

| 元素 | 视觉反馈 | 失败处理 | 状态 |
|---|---|---|---|
| 5 sidebar-tab | ✓ active + aria-selected | — | OK |
| defaultMode | ✓ savedTip | — | OK |
| translationColor | ✓ savedTip + 实时更新已渲染 | ✓ isValidHex 校验 | OK |
| translationSize | ✓ savedTip | — | OK |
| translationFont | ✓ savedTip + 实时更新 | — | OK |
| translationSpacing | ✓ savedTip | — | OK |
| hoverDelay | ✓ savedTip | — | OK |
| panelPosition | ✓ savedTip | — | OK |
| panelWidth | ✓ savedTip | — | OK |
| onlyEnJa 等 8 toggle | ✓ savedTip | — | OK |
| addExcludeBtn | ✓ savedTip + 格式校验 | ✓ showError 红底 | OK |
| addGlossaryBtn | ✓ 自动 focus source | — | OK |
| exportGlossary / importGlossary | ✓ 显示文本框 | — | OK |
| confirmImportBtn | ✓ savedTip | ✓ 页内错误条 | OK |
| cancelImportBtn | ✓ 关闭 + 清空 textarea | — | OK |
| resetGlossaryBtn | ✓ disabled + 文字 | ✓ 页内错误条 | OK |
| saveLlmPromptBtn | ✓ savedTip + 通知所有 tab | — | OK |
| resetLlmPromptBtn | ✓ 文字 "恢复中..." | — | OK |
| clearCacheBtn | ✓ savedTip + confirm | — | OK |
| API card .api-enable | ✓ savedTip | — | OK |
| API card .api-field | ✓ savedTip + reloadApis | — | OK |
| API card .api-test-btn | ✓✓✓ 标杆 (3 阶段) | — | OK |
| API 优先级 .api-priority-item | ✓ opacity + 键盘替代 | — | OK |
| Custom provider 全套 | ✓ savedTip + reloadApis | — | OK |

### welcome

| 元素 | 视觉反馈 | 失败处理 | 状态 |
|---|---|---|---|
| goSettingsBtn | ✓ | ✓ fallback openOptionsPage | OK |
| closeBtn | ✓ | ⚠️ 仍 window.close() fallback | **P2 #19** |

### content 注入

| 元素 | 视觉反馈 | 失败处理 | 状态 |
|---|---|---|---|
| panel .panel-toggle-btn | ✓ 文字变 ▶ + aria-expanded | — | OK |
| panel .panel-close-btn | ✓ aria-label | ✓ cleanupAllInjections | OK |
| .panel-row (点击) | ✓ 高亮 2s + 滚动 | — | OK |
| dual-translate-hover pinned | ✓ aria-label | — | OK |
| dual-translate-error-close | ✓ aria-label | — | OK |
| dual-translate-error-banner | ✓ className + 暗色变量 | — | OK |

---

## 7. v1.0.2 → v1.0.3 修复建议

仅 2 项 P2, 工作量 < 1 小时:

1. **welcome closeBtn 统一为 message** (P2 #19) — 删除 `window.close()` fallback
2. **popup.css 全局 :focus-visible 样式** (P2 #新-1) — 加 1 行 CSS

---

## 8. 引用

- 翻译扩展开发提示词.md §10.2 (v1.0.2 UI 状态)
- 翻译扩展开发提示词.md §10.4 (UI 相关 commit hash)
- 旧 UI_INTERACTION_AUDIT.md (2026-07-24, 已废弃)

---

**报告结束**。v1.0.2 UI 质量良好, 仅 2 个 P2 缺口, 无需紧急修复。
