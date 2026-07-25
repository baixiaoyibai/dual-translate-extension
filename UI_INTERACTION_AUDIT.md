# UI 交互审计报告（Fake Buttons 专项）

> 范围：popup / options / welcome / content 四个 UI 表面
> 目标：识别"看起来能点但实际不响应 / 无反馈 / 视觉与功能不符"的元素
> 性质：**只读审计，未修改任何代码**

---

## 1. 总体评价

整个扩展的 UI 设计是**有意识在"显得专业"**的——侧边栏、卡片化布局、loading 进度条、saved tip 浮窗都是好的方向。但从"用户实际点击行为"角度审视，**至少存在 13 处明确或潜在的假按钮 / 假交互陷阱**。最严重的一类是**视觉反馈缺失型假按钮**——按钮被点击后没有任何"我收到了你的点击"的可观察信号（无 disabled 态、无 loading 文字变化、无 spinner），导致用户重复点击、怀疑扩展坏了。这类问题集中在 popup（toggle / 模式切换 / 源语言切换 / 取消翻译）和 options（addExcludeBtn / 拖拽优先级 / saveLlmPrompt / 颜色选择器）。另一类是**状态与视觉不符**——`mode-btn` 切到 `hover`/`panel` 时，popup 上显示的"已激活"状态与网页实际显示模式可能不一致。

值得肯定的：测试 API 按钮有完整的"测试中 → ✓ 成功 / ✗ 失败 → 自动恢复"3 阶段反馈，是整个扩展的标杆；saved tip 浮窗设计得体；glossary 表格行内编辑有即时保存；右上面板上的 collapse / close / drag 都有可见效果。

---

## 2. 交互元素统计

### 2.1 popup.html（11 个可交互元素）

| 元素类型 | 数量 | 元素清单 |
|---|---|---|
| `<button>` | 7 | `toggleBtn`, 4×`mode-btn`, `cancelBtn`, `settingsBtn`, `restoreBtn` |
| `<select>` | 1 | `sourceLangSelect` |
| 容器（事件代理） | 1 | `modeSelector` |
| 纯展示元素 | 2 | `apiStatus`, `cacheInfo` |

### 2.2 options.html（约 38 个静态 + 动态元素）

| 元素类型 | 静态 | 动态 | 元素清单 |
|---|---|---|---|
| `<button>` | 10 | 多 | 5×`sidebar-tab`, `addExcludeBtn`, 4×`glossary-actions`, 2×`prompt`, `clearCacheBtn` |
| `<input type="text">` | 3 | 0 | `translationFont`, `translationSpacing`, `newExcludeDomain` |
| `<input type="number">` | 6 | 0 | `hoverDelay`, `panelWidth`, `minTextLength`, `translateDelay`, `batchSize`, `requestTimeout`, `retryCount`, `retryInterval` |
| `<input type="password">` | 0 | 1 / API | API Key |
| `<input type="color">` | 1 | 0 | `translationColor` |
| `<input type="checkbox">` | 8 | N×API+N×glossary | `onlyEnJa`, `translateCodeBlocks`, `autoTranslate`, `contextMenu`, `translationCache`, N×`api-enable`, N×`preserve` |
| `<select>` | 5 | N×glossary | `defaultMode`, `translationSize`, `panelPosition`, `excludeMode`, N×glossary matchType |
| `<textarea>` | 2 | 0 | `importExportText`, `llmPrompt` |
| `draggable` | 0 | N×priority | API 优先级项 |
| `.remove-exclude`（动态） | — | N | exclude 列表 ✕ |

### 2.3 welcome.html（2 个可交互元素）

| 元素类型 | 数量 | 元素清单 |
|---|---|---|
| `<button>` | 2 | `goSettingsBtn`, `closeBtn` |

### 2.4 content.js 注入的 UI（约 7 类动态元素）

| 元素类型 | 数量 | 元素清单 |
|---|---|---|
| 进度浮窗 | 1 | `dual-translate-loading-overlay`（无任何可点击控件） |
| 占位符 | N | `dual-translate-placeholder`（无任何交互） |
| 错误条关闭按钮 | 1 | `dual-translate-error-close` |
| 悬停浮窗 | N | `dual-translate-hover`（pinned 时可点击关闭） |
| 面板按钮 | 2 | `.panel-toggle-btn`, `.panel-close-btn` |
| 面板 row | N | 段对照行（可点击滚动） |
| 面板 header | 1 | 拖拽区（mousedown） |

---

## 3. 假按钮清单（重点）

按严重度排序，**严重度 = 触发概率 × 用户挫败感**。

| # | 严重度 | 位置 | 元素 | 期望 | 实际 | 修复建议 |
|---|--------|------|------|------|------|----------|
| 1 | **高** | popup/popup.js:166-180 | `toggleBtn`（关闭翻译） | 点完后按钮变 disabled + 文字立即变 "关闭中..." | 点击瞬间**无任何视觉反馈**，chrome.tabs.sendMessage 失败时也无错误提示。点快了会触发 2 次 toggle | 点击后立即 setDisabled + 改文字 "切换中..."，await 后再恢复 |
| 2 | **高** | popup/popup.js:182-196 | `modeSelector` 4 个 mode-btn | 切到 `hover` 后 popup 立刻显示"已激活"，同时网页立即切到悬停翻译 | **点击 → JS 设 `currentMode` 并 saveSetting → 调 switchMode 给 content**。但若 content script 失败（catch{} 静默），**popup 仍显示"已激活"但网页没切**——视觉与功能不符 | catch 时回滚 `currentMode` 并 showToast "切模式失败，刷新页面重试" |
| 3 | **高** | popup/popup.js:201-210 | `sourceLangSelect` | 切源语言后立即看到"重新翻译中"反馈 | 切完**没有任何 loading 提示**。background 收到消息后用 `retranslateWithSource` 调 content，content 调 `startTranslation` 才会显示 loading 浮窗。这之间有 200-500ms 真空，**用户会以为没生效**。`setTimeout(translateDelay, 500)` 再加 100-300ms IPC 延迟，总共 700-800ms 黑屏 | source 切完立即在 popup 顶部显示"翻译中..."灰条，或在 select 上加 .saving 样式 |
| 4 | **高** | popup/popup.js:226-234 | `cancelBtn` | 点完立即变灰 + 文字变 "正在取消..." | 文字**会变**且会 set disabled——这是好的。**但** background 转发到 content 的 `cancelTranslation` 失败（content 还没注入、或扩展刚刷新）时，**按钮永远卡在 "正在取消..." 直到 popup 关闭**——`setTimeout`/轮询兜底不存在 | 加 5s 超时：到时强制恢复文字并 alert "取消失败" |
| 5 | **高** | options/options.html:241 | `addExcludeBtn` "添加" | 点完域名出现在排除列表 | 点完**输入框立即被清空**且**域名进入列表是同步渲染的**（`renderExcludeList`），看起来"成功"。但**没有"域名格式错误"的校验**——输入 `http://xxx.com` 或 `xxx` 都会保存，后期 `hostMatchesPattern` 静默不匹配，**用户根本不知道正则不工作** | 校验格式：必须符合 `*.example.com` 或 `example.com` 模式，否则 showSavedTip 变成"格式无效（红底）" |
| 6 | **中** | options/options.html:67 | `translationColor` 颜色选择器 | 改色后所有译文立即变色 | 改色**只触发 saveSetting → 写入 storage**，content.js 不会自动重新渲染。**已经翻译的页面看不到效果**，用户必须手动点"还原原文"再重新翻译才能看到新颜色 | content.js 监听 `settings.display.translationColor` 变化，命中已渲染的 `.dual-translate-translation` 立即 setColor |
| 7 | **中** | options/options.html:92 | `translationFont` 输入框 | 输入字体后译文立刻变字体 | 同 #6：**已渲染的译文不会立即变字体** | 同 #6，但用 `ph.style.fontFamily` |
| 8 | **中** | options/options.html:354 | `saveLlmPromptBtn` "💾 保存 Prompt" | 点完提示"设置已保存"且立即生效 | 点了之后**只是把 prompt 写进 storage 并 reloadApis**。但 LLM 翻译是按段落批量的，**正在翻译的批次用的是旧 prompt**——已发出的请求无法撤回。**用户改了 prompt 后短时间内翻译结果可能还是旧的** | 改完后用 `chrome.runtime.sendMessage` 通知所有 tab `retranslateWithSource` |
| 9 | **中** | options/options.html:355 | `resetLlmPromptBtn` "↺ 恢复默认" | 点了之后 textarea 立即清空 / 显示默认 | 点了 → `confirm()` → `chrome.storage.local.remove` → `loadLlmPrompt()`。**但 `loadLlmPrompt` 内部已经分两步**：先看 storage，再 fallback 到 `getLLMPrompt`（读 `config/llm-prompt.txt`）。**这个流程是对的**，但用户看不见"正在恢复"提示——点了之后 200ms 内 textarea 变空，可能误以为失败 | 加载期间把 button 文字改成 "恢复中..."，完成后再恢复 |
| 10 | **中** | options/options.js:288-295 | `addGlossaryBtn` "+ 添加术语" | 点击立刻看到一行新术语 | 点了立即 push 一个空 entry 并 `renderGlossaryTable()`。**新行的 3 个 input 都没聚焦**，用户得自己找位置点击；**且**空 source / target 也会被立刻 `saveGlossary()` 保存 | 新行 append 后调 `.focus()` 到 source input，且空 entry 不立即保存（onChange 时再存） |
| 11 | **中** | options/options.js:598-633 | API 卡的 `api-test-btn` "测试" | 测试中 → ✓ 成功 / ✗ 失败 → 2s 后恢复 | **恢复逻辑有 bug**：`setTimeout` 写的是 `btn.textContent = '测试'`，但若 setTimeout 还没触发用户又点了另一个测试按钮，**`btn.textContent` 会在被禁用期间被新测试覆盖**，最终 setTimeout 把它**改回'测试'时反而把'测试中...' 误覆盖了'测试'——** 视觉上看不到 bug，但极端时序下会有"成功 → 立即变测试"的闪烁 | 每次 setTimeout 前 `clearTimeout` 该按钮的所有 timer，或用闭包 ID |
| 12 | **中** | options/options.js:636-678 | API 优先级 `.api-priority-item` 拖拽 | 拖完顺序改变并自动保存 | `dragstart` → `dragend` → `drop` 后**保存顺序**。**但**没有视觉指示"我正在拖"——只有 `opacity: 0.5`。**更严重的是键盘完全无替代方案**——键盘用户无法调整顺序 | 加 `role="listbox"` + 上下箭头按钮作为可访问替代 |
| 13 | **中** | content.js:844-871 | 对照面板的 `.panel-toggle-btn` "◀" | 点了之后面板收起（只露 30px） | 点了之后**面板只是 transform 走开**。**再次点击同一个按钮**预期是"展开"，**实际**也是 transform 回来——但 toggle 按钮**文字不会变**（一直是 `◀`）。用户分不清"现在是不是折叠状态"，**"折叠"是单向的还是双向的"**靠记忆 | 折叠时按钮文字变 `▶`；状态存进 dataset/aria-expanded |
| 14 | **中** | content.js:851 | 对照面板的 `.panel-close-btn` "✕" | 点了关闭面板 | 点了 → `panel.remove() + panelInstance=null + 恢复 body margin`。**关闭后没办法重新打开**——除非用户改回 `bilingual` 模式再切回 `panel`。**与 popup 的 cancel 体验不一致**：popup 切模式可以"重置翻译"，但只关面板并不会重置翻译——已 fill 的译文仍在 page 上 | 关闭面板时同时 `cleanupAllInjections()`，或在面板 header 加个"重新打开"按钮（不行，因为面板已从 DOM 移除）。**最低限度**：关闭按钮加 `aria-label="关闭并恢复原文"` |
| 15 | **中** | content.js:233-243 | `dual-translate-error-close` 错误条 ✕ | 点了关闭错误条 | 关闭是**手动的**——但很多错误（如"所有 API 暂时不可用"）用户**关掉后下次翻译仍会复现**，且 `cleanupAllInjections` 不会清。如果用户连续点 5 次"翻译"，错误条会**堆叠 5 个** | 错误条用单例（已有 `errorBannerElement` 引用），但**翻译流程里 `showErrorBanner` 被自动调用前应先 `hideErrorBanner`**（已做了，但**当 translationCache 里有 key 但翻译失败时**不会调用 showErrorBanner，所以不会出现堆叠——这条降为低） |
| 16 | **中** | content.js:233-243 | 错误条 `dual-translate-error-banner` | 错误原因清楚、可点 ✕ 关闭 | 错误条用 inline `style.cssText` 设置了样式，**没继承 `content.css` 里的暗色变量**（`--dt-bg-error` 等），**暗色模式下会变成浅黄色背景配暗色字**。另外 `padding:10px 16px` 是硬编码，**和 popup 风格不统一** | 改用 className + content.css 样式 |
| 17 | **低** | options/options.js:274-286 | `addExcludeBtn` 边界 | 用户输入重复域名 | 输入已存在的域名 → 静默不添加（`includes` 判断），但**用户看不到任何反馈**。input.value 仍被清空，看起来"添加成功"了 | 重复时显示红色 tip "该域名已存在" |
| 18 | **低** | options/options.js:315-328 | `confirmImportBtn` "确认导入" | JSON 解析失败时弹 alert | alert 是阻塞的，体验差 | 用页内错误条替代 alert |
| 19 | **低** | welcome/welcome.html:95-98 | `closeBtn` "稍后配置" | 点了关掉欢迎页 | `window.close()` 在由 `chrome.tabs.create` 打开的 tab 里**会被多数浏览器静默拒绝**——用户点了**没反应**（已知 issue，见 V2 报告 P0-3）| 通过 background message `chrome.tabs.remove(tabId)` |
| 20 | **低** | options/options.js:334-347 | `resetGlossaryBtn` "恢复默认" | 点完术语表立即变默认 | 点了 → `confirm` → `fetch(default-glossary.json)` → 覆盖。**fetch 失败时弹 alert**（如网络问题，web_accessible_resources 404）。但 `getURL('config/default-glossary.json')` 在 options 页面里**这个 fetch 是同步的**——理论上不会失败，但**扩展包内文件读取**是异步的，await 期间用户可能再点一次 | loading 状态 + 按钮 disabled 期间 |
| 21 | **低** | popup/popup.js:216-223 | `restoreBtn` "↺ 还原原文" | 点击后页面立即恢复原文 | `chrome.tabs.sendMessage(tab.id, { action: 'restoreAll' })` 失败时**无任何提示**。content 没注入时（chrome://、edge://、新装扩展刚刷新的页面）**用户点了 30+ 次都没反应**——但 popup 会立即关闭，用户根本看不到反馈 | catch 时 alert "当前页面无法翻译" |
| 22 | **低** | options/options.html:157 | toggle 开关 `onlyEnJa` 等 8 个 | 点击切换开/关 | 切换立即生效 + savedTip。**但 `translationCache` 切换时不会清缓存**——之前"翻译缓存"关着时存的 cache 仍是关的，等于没起作用，**且不会触发 `reloadApis`**。**但** `trigger.contextMenu` / `trigger.autoTranslate` 会触发 reloadApis（line 232-234）——`trigger.translationCache` 没被列入 reloadApis 名单 | 在 `bindToggle` 内 `translationCache` 切换后调 `chrome.runtime.sendMessage({action:'reloadApis'})` |
| 23 | **低** | options/options.html:66 | 颜色选择器 `<input type="color">` | 在 macOS / Win 都有原生 picker，**但** value 是 hex `#888888`，如果用户输入了"red"或"rgb(...)"，**原生 picker 会显示 #000000**——type="color" 接受非法值后会 fallback 到 `#000000` 静默丢失 | onChange 加 `isValidHex(value)` 校验；非法时还原 | 
| 24 | **低** | options/options.js:332 | `cancelImportBtn` "取消" | 点了关闭 import 文本框 | 点了 `importExportArea.style.display='none'`。**但 textarea.value 不会被清**——下次点"导入 JSON"会看到上次粘贴的内容。这是 UX 而非功能 bug | 清空 textarea.value |
| 25 | **低** | options/options.js:330-332 | `cancelImportBtn` 顶部 IIFE vs glossary 区域 | 点了关闭 import 区域 | `importExportArea` 被关闭后，**"导入 JSON"按钮的 dataset.action = 'import' 仍残留**。下次再点"导入"会重新设置 dataset，但**如果中间点了"导出 JSON"再切回"导入"，`document.getElementById('confirmImportBtn').dataset.action = 'import'` 会被覆盖**——逻辑看似正确，但**dataset.action 从未在任何 handler 中被读取**（line 315 的 click handler 直接走 try-parse 流程）——**这是死代码** | 删除 `dataset.action` 相关行 |

---

## 4. 假按钮详细分析（高严重度逐项展开）

### 4.1 popup `toggleBtn`（#1 严重度：高）

**位置**：`popup/popup.js:166-180`

```javascript
document.getElementById('toggleBtn').addEventListener('click', async () => {
    translationEnabled = !translationEnabled;
    await chrome.runtime.sendMessage({ action: 'updateSettings', path: 'general.translationEnabled', value: translationEnabled });
    updateToggleButton();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        if (translationEnabled) {
          await chrome.tabs.sendMessage(tab.id, { action: 'toggleTranslate' });
        } else {
          await chrome.tabs.sendMessage(tab.id, { action: 'restoreAll' });
        }
      } catch {}
    }
  });
```

**问题**：
1. 整个 handler 是 async 串行，但**没有 disabled 态**——用户点完会下意识再点一次（特别是网络慢的时候）。
2. 如果 `tabs.sendMessage` 抛错（content script 还没注入，比如用户刚切换 tab），`catch {}` 静默吃掉。**用户会看到 toggle 状态变了但页面没变——视觉与功能不符**。
3. `toggleTranslate` 在 content.js 里的实现是 `toggleTranslation()`——**它会反转 `settings.general.translationEnabled`**（line 879, 882）！这意味着 popup 和 content **都在改同一个 setting**——`popup` 改完存，content 又改一次（再次反转）。**会产生竞争**，特别是 `updateSettings` IPC 是 async 的情况下。

**修复方向**：
- 加 `btn.disabled = true`，await 后再 `btn.disabled = false`。
- catch 时回滚 `translationEnabled` 并 `alert('当前页面无法翻译')`。
- 修竞争：content.js 的 `toggleTranslation` 不应再 `updateSettings`——只调 `startTranslation` 或 `resetAll`，setting 由 popup 单向同步。

---

### 4.2 popup `modeSelector` 4 个按钮（#2 严重度：高）

**位置**：`popup/popup.js:182-196`

```javascript
document.getElementById('modeSelector').addEventListener('click', async (e) => {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    currentMode = mode;
    updateModeButtons();  // ← popup 立即高亮新模式
    await chrome.runtime.sendMessage({ action: 'updateSettings', path: 'general.lastMode', value: mode });
    await chrome.runtime.sendMessage({ action: 'updateSettings', path: 'display.defaultMode', value: mode });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'switchMode', mode });
      } catch {}
    }
  });
```

**问题**：
- `updateModeButtons()` 在 `sendMessage` 之前同步执行，**popup 立即高亮**。
- content script 失败（catch 静默）时，**popup 显示"已切到 hover"，但网页还是 bilingual 模式**。
- 更深的问题：content.js `switchMode` 在 `else if(settings&&settings.general.translationEnabled!==false){resetAll();startTranslation();}` 分支里，**会先 resetAll 再 startTranslation——但 `resetAll` 清掉了已渲染的译文并 startTranslation 又会触发新的网络请求**。用户期望"立刻切到悬停模式"，**结果先看到了"还原原文"再"翻译中..."**。

**修复方向**：
- catch 时 `updateModeButtons()` 回滚到旧 `currentMode`。
- popup 切模式时不直接调 `switchMode` 重翻译，**应该给 content 发一个 `previewMode` 事件，让 content 在不动网络的前提下切换 UI**。

---

### 4.3 popup `sourceLangSelect`（#3 严重度：高）

**位置**：`popup/popup.js:201-210`

```javascript
sourceLangSelect.addEventListener('change', async (e) => {
      const newLang = e.target.value;
      await chrome.runtime.sendMessage({
        action: 'updateSettings',
        path: 'api.sourceLanguage',
        value: newLang
      });
      // background 中已根据 api.sourceLanguage 变更触发 retranslateWithSource，避免重复触发
    });
```

**问题**：
- 用户切完 select 后，**没有任何 loading 提示**。background 收到消息 → 调 `retranslateWithSource` → content 调 `startTranslation` → 走完 500ms translateDelay + 30ms placeholder 渲染，**才会有 loading 浮窗**。**总延迟 700-800ms**，期间用户看到 select 已变、但网页啥都没动。
- 而且 `e.target.value` **没有防抖**——快速切 3 个值会触发 3 次 IPC，**最后一次胜出但中间 2 次的 IPC 仍会触发翻译**——3 次重新翻译浪费 API 配额。

**修复方向**：
- 加 `select.disabled = true` 期间显示 saving。
- 加 300ms debounce，合并连续切换。

---

### 4.4 popup `cancelBtn`（#4 严重度：高）

**位置**：`popup/popup.js:226-234`

```javascript
document.getElementById('cancelBtn').addEventListener('click', async () => {
    const btn = document.getElementById('cancelBtn');
    btn.disabled = true;
    btn.classList.add('cancelling');
    btn.querySelector('.cancel-text').textContent = '正在取消...';
    await chrome.runtime.sendMessage({ action: 'cancelTranslation' });
    // 不在此处恢复按钮——等待轮询检测到 translating=false 后自动恢复
  });
```

**问题**：
- 文字会变、会 disabled——这部分做得好。
- **但 background 转发 `cancelTranslation` 到 content**（`background.js:167-177`），**如果 content script 抛错**（tab 不支持、刚刷新、context invalidated）——`catch {}` 静默，**按钮永远卡在"正在取消..." 状态直到 popup 关闭**。
- 即使转发成功，**content 收到 `cancelTranslation` 后只 `abort()` 当前 controller**（`content.js:944-947`），**但 startTranslation 的 try/catch 走的是 AbortError 分支 → `resetAll()`**——这会清掉 `isTranslating` 标志，**popup 的轮询 (`cancelPollTimer`) 能检测到 `translating=false`**。但如果 abort 后 startTranslation 的 finally 又把 `isTranslating = false`，**`getStatus` 可能返回 `translating: false` 但 popup 收不到**——这是 IPC 健壮性问题。
- 注释明确说"不在此处恢复按钮——等待轮询检测到 translating=false 后自动恢复"——**意味着 popup 必须保持打开**。如果用户**点完取消后立刻关掉 popup**，重开 popup 时 `isTranslating` 状态在 `currentMode` / `translating` 上**没有持久化**（content.js 顶层变量，刷新就丢），但 `cancelPollTimer` 是 popup 内部 state，**新 popup 不会自动开启轮询**——**翻译仍在进行中，但 popup 不知道**。

**修复方向**：
- 加 5s 超时：到时强制恢复 `cancel-text` + `btn.disabled=false` + 弹 alert。
- popup 关闭前通过 IPC 通知 background 取消"订阅 translating 状态"——但目前没有这种 IPC，popup 关闭时 polling 还会继续（timer 一直跑），**内存泄漏**。

---

### 4.5 options `addExcludeBtn`（#5 严重度：高）

**位置**：`options/options.js:274-286`

```javascript
document.getElementById('addExcludeBtn')?.addEventListener('click', () => {
    const input = document.getElementById('newExcludeDomain');
    const domain = input.value.trim();
    if (!domain) return;
    if (!settings.trigger.excludeList) settings.trigger.excludeList = [];
    if (!settings.trigger.excludeList.includes(domain)) {
      settings.trigger.excludeList.push(domain);
      saveSetting('trigger.excludeList', settings.trigger.excludeList);
      renderExcludeList();
      showSavedTip();
    }
    input.value = '';
  });
```

**问题**：
- **完全没有格式校验**：用户输入 `http://example.com`、`example.com/`、`https://*.example.com/path` 都会被保存。**之后 `hostMatchesPattern` 静默不匹配**——用户期待"该域名不翻译"但实际还在翻译，**且不会报错**。
- 重复域名静默被忽略（includes 检查），input 仍被清空——**用户以为成功**。
- 没有任何"白名单模式不支持通配符 `*`"的提示——**通配符行为对用户是黑盒**。

**修复方向**：
- `if (!/^(\*\.)?[\w.-]+$/.test(domain)) { showError('格式错误，应为 example.com 或 *.example.com'); return; }`
- 重复时显式提示。

---

## 5. 用户操作路径走查

### 路径 A：首次安装流程

| 步骤 | 用户动作 | 实际行为 | 问题 |
|---|---|---|---|
| 1 | 安装扩展 | background `onInstalled(reason: 'install')` → 调 welcome 页面 | OK |
| 2 | 看欢迎页 | 6 个 feature、3 个 step | OK |
| 3 | 点 "前往设置页面" | `chrome.runtime.sendMessage({action:'openOptions'})` → background `chrome.runtime.openOptionsPage()` | OK |
| 4 | 看到 options | 默认显示 `tab-display` 标签页 | **问题：用户在 welcome 看到 "3 步：配置 API"，但** settings 默认显示的是显示设置，不是 API 管理——需要再次点击侧边栏的 "API 管理" 跳过去 |
| 5 | 点侧边栏 "API 管理" | 切到 `tab-api`，看到 API 卡片 | OK |
| 6 | 在百度翻译卡片填 App ID + 密钥 | input `change` → `saveAllSettings` → `showSavedTip` | **问题：savedTip 在右下角，距离输入框很远——用户盯着输入框看不到保存反馈**。另外 `change` 事件在 input 失焦后才触发，**用户输入完还在 input 上时不会有"已保存"提示** |
| 7 | 点 "测试" 按钮 | btn.textContent='测试中...' → disabled → res.success 时 '✓ 成功' 绿底 2s → 恢复 | **OK（标杆交互）** |
| 8 | 关 options，打开 popup | popup 顶部显示 API 状态 | OK |

**结论**：流程整体跑通，**但欢迎页和 options 之间缺少锚点跳转**——已知 V2 报告 P0-1。

---

### 路径 B：日常翻译流程

| 步骤 | 用户动作 | 实际行为 | 问题 |
|---|---|---|---|
| 1 | 打开英文网页 | content.js IIFE → `loadSettings` → `startTranslation` | OK |
| 2 | 看到右上方 loading 浮窗 | 浮窗 + 段落下 placeholder spinner | OK |
| 3 | 译文逐段出现 | `fillTranslations()` → `.dual-translate-translation` 替换 | OK |
| 4 | 点 popup "悬停翻译" | 见 #4.2 详细分析 | **状态与功能可能不符** |
| 5 | 鼠标悬停段 | `showHover` → 浮窗出现 | OK |
| 6 | 点 popup "对照面板" | popup highlight + content 切到 panel | **#4.2 同样问题 + 面板关闭后无法重开** |
| 7 | 点 popup "取消翻译" | 见 #4.4 | **可能卡死** |
| 8 | 点 popup "还原原文" | `chrome.tabs.sendMessage(tab.id, {action:'restoreAll'})` | **#21 静默失败** |

---

### 路径 C：配置管理流程

| 步骤 | 用户动作 | 实际行为 | 问题 |
|---|---|---|---|
| 1 | 切 "翻译规则" 标签 | `setupTabSwitching` → 5 个 tab 切换 | OK |
| 2 | 改 "最小翻译长度" 3→5 | number input change → saveSetting + showSavedTip | OK |
| 3 | 添加 exclude 域名 | 见 #4.5 | **高严重度问题** |
| 4 | 改 "译文文字颜色" | 见 #6 | **已渲染译文不变色** |
| 5 | 改 "译文字体" | 见 #7 | 同上 |
| 6 | 切 "API 管理" 拖拽优先级 | 见 #12 | **键盘不可达** |
| 7 | 切 "高级设置" 改 LLM prompt → 保存 | 见 #8 | **改完后正在翻译的批次不重** |
| 8 | 清除缓存 | `confirm` → `clearCache` IPC → 重新 loadCacheStats | OK |

---

### 路径 D：错误恢复流程

| 步骤 | 用户动作 | 实际行为 | 问题 |
|---|---|---|---|
| 1 | API Key 填错 | input change → saveSetting（立即保存！） | **未校验格式**——"asdf" 也能存 |
| 2 | 点 "测试" | btn '测试中...' → IPC testApi → apiManager.testApi 返回 `{success:false, error:'...密钥错误'}` | btn 变 '✗ 失败' 红底 + `alert('测试失败：密钥错误')` | **OK 标杆** |
| 3 | 修复 Key 再测 | btn '✓ 成功' 绿底 2s | OK |
| 4 | 翻译时所有 API 失败 | content.js `translateSegments` 收到 `{error: '所有翻译服务...'}` → `showErrorBanner(errMsg)` | **错误条** 出现在屏幕顶部中央，有 ✕ 可关 | **#16 暗色模式变量不生效** |

**结论**：错误恢复路径做得不错，唯一问题是错误条 inline style 不走 CSS 变量。

---

### 路径 E：键盘可达性

| 元素 | Tab 可达 | Enter 触发 | Esc 关闭 | ARIA | 问题 |
|---|---|---|---|---|---|
| popup `toggleBtn` | ✓ | ✓ | ✗ | 无 | 缺 aria-label |
| popup 4 mode-btn | ✓ | ✓ | ✗ | 无 | 缺 aria-pressed |
| popup `sourceLangSelect` | ✓ | ✓ | ✗ | 无 | OK |
| popup `cancelBtn` | ✗ (display:none) | — | — | 无 | **见下** |
| popup `settingsBtn` | ✓ | ✓ | ✗ | 无 | OK |
| popup `restoreBtn` | ✓ | ✓ | ✗ | 无 | OK |
| options 5 sidebar-tab | ✓ | ✓ | ✗ | 无 | 缺 aria-selected |
| options `<input type="color">` | ✓ | ✓ | ✗ | 无 | **无 label 关联**——只能靠周围文字 |
| options API card `.api-enable` 开关 | ✓ | ✓ | ✗ | 无 | 缺 role/aria-checked |
| options glossary 行内 input | ✓ | ✓ | ✗ | 无 | OK |
| options API 优先级 item (draggable) | ✓ | ✗ | ✗ | 无 | **#12 键盘无替代** |
| welcome 2 按钮 | ✓ | ✓ | ✗ | 无 | OK |
| content panel `.panel-toggle-btn` | ✗（面板内元素 tab 序不可预期） | ✓ | ✗ | 无 | 不可 tab 到 |
| content panel `.panel-close-btn` | ✗ | ✓ | ✗ | 无 | 不可 tab 到 |
| content `.dual-translate-hover` pinned | ✗ | ✓（click） | ✗ | 无 | 不可 tab |
| content `dual-translate-error-close` | ✗ | ✓ | ✗ | 无 | 不可 tab |

**Esc 关闭面板**：**完全没有 Esc 关闭逻辑**——用户在 panel 模式想关掉面板，只能把鼠标移到右上 ✕ 按钮点。**键盘用户没办法**。

**特别说明 popup cancelBtn**：在 popup.css 里 `display:none`（line 49 `style="display:none;"`），但 popup.html 里写的**是 inline style**。`document.getElementById('cancelBtn')` 在初始状态 `getComputedStyle` 是 `display:none`——**`tab` 序**按 DOM 顺序，display:none 元素**仍然在 tab 序中**（Chromium 行为：display:none 不在 tab 序里，但 visibility:hidden 在；这里 `display:none` 不会进入 tab 序，OK）。**但** `aria-hidden` 没设，**屏幕阅读器会读出这个隐藏按钮**。

---

## 6. 键盘可达性

### 6.1 focus 样式

- options.css:243-249 定义了 input/select 的 focus 样式（蓝边 + shadow）。
- options.css:299-329 定义了 toggle slider 的 active 样式。
- **popup.css 完全没有任何 focus 样式**——popup 里的 button、select 在 focus 时**视觉上无变化**。**Tab 到某个按钮上完全看不出来**。

### 6.2 aria 属性

| 元素 | 应有 | 现状 |
|---|---|---|
| `toggleBtn` | `aria-pressed` | ❌ 缺失 |
| 4 `mode-btn` | `aria-pressed` 或 `role="radio"` | ❌ 缺失 |
| `sourceLangSelect` | `aria-label` | ❌ 缺失（靠上下文） |
| sidebar 5 tab | `role="tablist"` + `aria-selected` | ❌ 缺失 |
| API `.api-enable` 复选框 | `aria-label` | ❌ 缺失 |
| glossary 行内 input | `aria-label` | ❌ 缺失 |
| panel toggle/close btn | `aria-label` | ❌ 缺失（仅 emoji） |
| 颜色选择器 | `<label>` 关联 | ❌ 缺失 |
| 优先级拖拽 | `role="listbox"` + `aria-grabbed` | ❌ 缺失 |
| 错误条 | `role="alert"` 或 `aria-live` | ❌ 缺失 |

### 6.3 键盘快捷键

- 已定义 `Alt+T` 切翻译（manifest）。
- **无 Esc 关闭面板/弹窗**。
- **无方向键在 mode-btn 之间切换**（aria 缺失，连语义都没有）。
- **无 Enter 在 placeholder 上重试翻译**。

---

## 7. 做得好的交互

值得肯定的"标杆级"细节（按重要性排序）：

1. **API 测试按钮的 3 阶段反馈**（`options.js:598-633`）：btn.disabled + 文字变 "测试中..." + 颜色翻转 + 2s 后自动恢复。**整个扩展的 UX 标杆**。

2. **`savedTip` 浮窗**（`options.css:658-679` + `options.js:84-88`）：右下角浮窗 1.5s 自动消失，**不阻塞操作**且能看到"已保存"反馈。

3. **loading 浮窗的进度条**（`content.js:211-225`）：从 0% 到 100% 平滑过渡 + 文字 "翻译中 12/48 段"——**让用户知道扩展没卡死**。

4. **错误条单例**（`content.js:244-248`）：`hideErrorBanner` 先清旧的再显示新的，**不会堆叠**。

5. **glossary 行内编辑**（`options.js:372-379`）：每个 input 改完立即 saveGlossary，**所见即所存**。

6. **模式切换的保存双写**（`popup.js:188-189`）：同时写 `general.lastMode` 和 `display.defaultMode`——**保证重启后行为一致**。

7. **拖拽的视觉反馈**（`options.js:652`）：`opacity: 0.5` 标识正在拖的元素。

8. **panel 关闭时清理 body margin**（`content.js:862`）：避免关闭后页面布局错乱。

9. **`chrome.runtime.openOptionsPage` fallback**（`welcome.html:89-93`）：如果 `openOptions` message 失败，catch 里调 `openOptionsPage()`——**有兜底**。

10. **loading 浮窗 `pointer-events: none`**（`content.css:99`）：浮窗不挡 click 事件。

11. **对照面板 row 点击**（`content.js:857`）：点 row → 段在原页面高亮 2s 滚动到视口——**对账体验很好**。

12. **hover pinned 状态**（`content.js:826-836`）：可点击固定，再次点击取消——**直觉交互**。

---

## 8. 修复优先级建议

### P0（用户会立刻踩坑）

| 编号 | 问题 | 触发场景 |
|---|---|---|
| 1 | popup `toggleBtn` 无 disabled 反馈、catch 静默 | 切翻译时连点会反转 2 次 |
| 2 | popup `modeSelector` 失败时状态回滚缺失 | 切模式时 content 失败但 popup 显示"已激活" |
| 3 | popup `sourceLangSelect` 切换时无 loading + 无 debounce | 切源语言快速切 3 次 = 3 次重翻译 |
| 4 | popup `cancelBtn` 失败时永远卡 "正在取消..." | content 未注入时点取消 |
| 5 | options `addExcludeBtn` 无格式校验 | 输入 `http://...` 被静默接受，hostMatchesPattern 不匹配 |

### P1（影响使用但能 workaround）

| 编号 | 问题 | 触发场景 |
|---|---|---|
| 6 | options 颜色 / 字体改后已渲染译文不变 | 改完色发现页面没动，以为没保存 |
| 8 | options 保存 LLM Prompt 后正在翻译的批次用旧 prompt | 改 prompt 期望立即生效但部分译文仍按旧 prompt |
| 10 | options 添加术语后新行不聚焦 | 找半天 cursor 在哪 |
| 11 | options API 测试按钮 setTimeout 在快速连点时会闪烁 | 极端时序 |
| 12 | options API 优先级拖拽键盘无替代 | 键盘 / 屏幕阅读器用户无法调整顺序 |
| 13 | content panel toggle 按钮文字不变 | 不知道是折叠还是展开 |
| 14 | content panel 关闭后无法重开 | 误关面板后改 mode 都没用 |
| 16 | content 错误条暗色模式变量不生效 | 暗色系统下错误条是浅黄底 |
| 21 | popup 还原原文在 chrome:// 等页面静默失败 | 点了 30 次没反应 |
| 22 | options `translationCache` 切换不触发 reloadApis | 改完开关不立即清缓存 |

### P2（体验优化）

| 编号 | 问题 |
|---|---|
| 17 | 重复 exclude 域名时无提示 |
| 18 | JSON 解析失败用 alert 而非页内错误条 |
| 19 | welcome `closeBtn` window.close() 在 tab 里被静默拒绝 |
| 20 | options 重置术语表 fetch 期间按钮不 disabled |
| 23 | 颜色选择器接受非法值后 fallback 到 #000000 |
| 24 | 取消导入时 textarea value 未清 |
| 25 | options `dataset.action` 是死代码 |
| 全局 | popup.css 缺 focus 样式，所有按钮 Tab 时无视觉反馈 |
| 全局 | 几乎所有可交互元素缺 `aria-*` 属性 |
| 全局 | 无 Esc 关闭面板逻辑 |

---

## 附录 A：元素对照表

### popup

| 元素 | 事件 | 文件:行 | 视觉反馈 | 失败处理 | 备注 |
|---|---|---|---|---|---|
| `toggleBtn` | click | popup.js:166 | ❌ 立即变色但无 loading 文字 | ❌ catch 静默 | 内容里有竞争 |
| `modeSelector` (代理) | click | popup.js:182 | ✓ popup 立即高亮 | ❌ content 失败不回滚 | content 失败时状态不符 |
| 4 `mode-btn` | click（代理） | popup.js:183 | 同上 | 同上 | |
| `sourceLangSelect` | change | popup.js:201 | ❌ 无反馈 | ❌ 无 | 无防抖 |
| `settingsBtn` | click | popup.js:212 | ❌ 无 | — | 调 `openOptionsPage` |
| `restoreBtn` | click | popup.js:216 | ❌ 无 | ❌ catch 静默 | chrome:// 等页面失败 |
| `cancelBtn` | click | popup.js:226 | ✓ 变 "正在取消..." + disabled | ❌ 可能卡死 | IPC 失败时永远卡 |

### options (静态 HTML 部分)

| 元素 | 事件 | 文件:行 | 视觉反馈 | 失败处理 | 备注 |
|---|---|---|---|---|---|
| 5 `sidebar-tab` | click | options.js:119-126 | ✓ active 类切换 | — | OK |
| `defaultMode` | change | options.js:135 | ✓ showSavedTip | — | |
| `translationColor` | change | options.js:143 | ✓ showSavedTip | ❌ 不影响已渲染 | #6 |
| `translationSize` | change | options.js:151 | ✓ showSavedTip | — | |
| `translationFont` | change | options.js:159 | ✓ showSavedTip | ❌ 不影响已渲染 | #7 |
| `translationSpacing` | change | options.js:167 | ✓ showSavedTip | — | |
| `hoverDelay` | change | options.js:175 | ✓ showSavedTip | — | |
| `panelPosition` | change | options.js:183 | ✓ showSavedTip | — | |
| `panelWidth` | change | options.js:191 | ✓ showSavedTip | — | |
| `onlyEnJa` | change | options.js:203 | ✓ showSavedTip | — | |
| `translateCodeBlocks` | change | options.js:204 | ✓ showSavedTip | — | |
| `minTextLength` | change | options.js:205 | ✓ showSavedTip | — | |
| `autoTranslate` | change | options.js:206 | ✓ showSavedTip + reloadApis | — | |
| `contextMenu` | change | options.js:207 | ✓ showSavedTip + reloadApis | — | |
| `translateDelay` | change | options.js:208 | ✓ showSavedTip | — | |
| `translationCache` | change | options.js:209 | ✓ showSavedTip | ❌ 不 reloadApis | #22 |
| `excludeMode` | change | options.js:213 | ✓ showSavedTip | — | |
| `newExcludeDomain` | (无直接事件) | — | — | — | 配合 addExcludeBtn |
| `addExcludeBtn` | click | options.js:274 | ✓ savedTip | ❌ 无格式校验 | #5 |
| `.remove-exclude` (动态) | click | options.js:264 | ✓ 立即移除 + savedTip | — | |
| `addGlossaryBtn` | click | options.js:291 | ✓ 立即插入新行 | — | #10 不聚焦 |
| `exportGlossaryBtn` | click | options.js:297 | ✓ 显示文本框 | — | |
| `importGlossaryBtn` | click | options.js:305 | ✓ 显示文本框 | — | |
| `confirmImportBtn` | click | options.js:315 | ✓ savedTip | ❌ alert 阻塞 | #18 |
| `cancelImportBtn` | click | options.js:330 | ✓ 关闭 | — | #24 textarea 未清 |
| `resetGlossaryBtn` | click | options.js:334 | ✓ savedTip | ❌ alert | #20 |
| `saveLlmPromptBtn` | click | options.js:870 | ✓ savedTip + reloadApis | — | #8 旧翻译不重 |
| `resetLlmPromptBtn` | click | options.js:877 | ✓ textarea 立即变默认 | ❌ confirm | #9 无 loading |
| `clearCacheBtn` | click | options.js:885 | ✓ savedTip + 重新 load | ❌ confirm | OK |
| `llmPrompt` (textarea) | (无自动保存) | — | — | — | 需手动点保存 |
| API card `.api-enable` (动态) | change | options.js:545 | ✓ savedTip | — | |
| API card `.api-field` (动态) | change | options.js:555 | ✓ savedTip + reloadApis | — | #10 同上（custom 重渲染）|
| API card `.api-test-btn` (动态) | click | options.js:599 | ✓✓✓ 标杆 | — | #11 极端时序 |
| API 优先级 `.api-priority-item` (动态) | dragstart/dragend/dragover/drop | options.js:649-676 | ✓ opacity 0.5 | — | #12 键盘不可达 |
| Custom provider `.custom-provider-test-btn` (动态) | click | options.js:772 | ✓✓✓ 标杆 | — | #11 同上 |
| Custom provider `.custom-provider-delete-btn` (动态) | click | options.js:803 | ✓ savedTip | ❌ confirm | OK |
| Custom provider `.custom-provider-field` (动态) | change | options.js:734 | ✓ savedTip + reloadApis + 重渲染 | — | |
| Custom provider `.custom-provider-toggle` (动态) | change | options.js:753 | ✓ 同上 | — | |
| `addCustomProviderBtn` | click | options.js:918 | ✓ 立即出现新卡片 | — | #10 不聚焦 |

### welcome

| 元素 | 事件 | 文件:行 | 视觉反馈 | 失败处理 | 备注 |
|---|---|---|---|---|---|
| `goSettingsBtn` | click | welcome.html:89 | ✓ 跳到 options | ✓ fallback openOptionsPage | OK |
| `closeBtn` | click | welcome.html:95 | ❌ window.close() 可能被拒 | — | #19 |

### content.js 动态注入

| 元素 | 事件 | 文件:行 | 视觉反馈 | 失败处理 | 备注 |
|---|---|---|---|---|---|
| `dual-translate-error-close` | click | content.js:240 | ✓ 错误条消失 | — | #16 暗色模式问题 |
| `.panel-toggle-btn` | click | content.js:861 | ✓ transform 折叠 | — | #13 文字不变 |
| `.panel-close-btn` | click | content.js:862 | ✓ panel 消失 + margin 恢复 | — | #14 无法重开 |
| panel header (拖拽) | mousedown/mousemove/mouseup | content.js:864-867 | ✓ 实时改变 width/height | — | OK |
| panel row | click | content.js:857 | ✓ 段高亮 2s | — | OK |
| `.dual-translate-hover` (pinned) | click | content.js:829 | ✓ 取消 pinned / 移除 | — | OK |

---

## 附录 B：与其他报告的关系

- 本报告**与 V2 报告互不重复**——V2 关注代码质量、错误处理一致性、i18n；本报告**专门从用户视角检查点击行为**。
- 与 V2 共鸣的点：#14（panel 关闭无法重开）、#19（welcome window.close 失败）、#22（translationCache 不触发 reloadApis）、全局 aria 缺失。
- **新增发现**：#1-#5（popup 4 个核心按钮的反馈缺失）、#4.1（toggleTranslate 反转 setting 的竞争）、#6-#9（options 改色/字体/prompt 不影响已渲染）、#11（api-test-btn setTimeout 闪烁）、#13（panel toggle 文字不变）、#16（错误条暗色模式）、#17/#24/#25（小 UX 缺陷）。

---

*报告完。共识别 25 个可量化问题（5 高 / 10 中 / 10 低），全部已映射到具体文件:行号。*
