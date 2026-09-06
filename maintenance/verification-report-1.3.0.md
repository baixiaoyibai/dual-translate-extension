# dual-translate-extension v1.3.0 回归验证与维护验收报告（任务 t5 · qa-verifier）

- 验收人：qa-verifier（回归验证工程师，独立质检方）
- 验收日期：2026-09-06
- 验收对象：maintenance-engineer 对 v1.3.0 维护批的修复结果（P1-1 + 安全 C1–C4 加固 + 回归测试补充）
- 输入材料（以工作区根目录 `D:\Tools\edge_translater\maintenance\` 为准）：
  - `interaction-review-1.3.0.md`（t1）
  - `security-review-1.3.0.md`（t2）
  - `api-data-review-1.3.0.md`（t3）
  - `fix-log-1.3.0.md`（t4）
- 验证方式：`npm run verify` / `npm run check` 实跑 + `git diff` 抽查 + 版本与敏感信息核对。

---

## 一、验收结论

**【验收结论：通过】**

本批维护改动无回归，唯一 P1 项（api-data-review P1-1）已修复并有回归测试证据，安全 C1–C4 低风险加固均已落地且与 fix-log 描述一致，改动全部落在允许范围内且未夹带密钥等敏感信息，三处版本一致，审查报告与修复日志齐全可读。t1–t3 中其余 P2/P3 与 C5–C9 项不属本批 P0/P1 范围，已在 fix-log 第二节标为延后并给出理由（最终闭环落在 t7）。

---

## 二、验收命令结果（实跑）

| 命令 | 结果 | exit code | 证据 |
| --- | --- | --- | --- |
| `npm run verify` | 通过 | 0 | `npm run check && npm test` 全绿：`node --check` 覆盖 background/content/diagnose/lib(api-manager、api-registry、settings-manager、translation-cache、escape-utils、api-metadata) / lib/api-adapters(base、baidu、baidu-llm、volcano、llm-generic) / popup / options / welcome，全部 SYNTAX OK；`npm test` 依次通过 `model-name`（28/28 passed）、`settings-manager`（settings-manager tests passed）、`consistency`（consistency tests passed）、`api-manager`（api-manager P1-1 cooldown test passed）。 |
| `npm run check` | 通过 | 0 | 同上，命令单独复跑 exit 0。 |

---

## 三、逐项核验结果

### 1. P0/P1 闭环核验（t1–t3 × fix-log）

| 报告 | 结论 | P0/P1 判定 | 闭环状态 |
| --- | --- | --- | --- |
| t1 交互逻辑 | 未发现确认的 P0/P1 | 无 P0、无 P1（仅 P2-1/P2-2/P2-3/C8/C9 及若干 P3） | 无需修复项；P2/P3 已延后并有理由 |
| t2 安全 | S 0 / A 0 / B 0 / C·信息·观察 9 项 | 无等价于 P0/P1 的中高危 | C1–C4 已加固修复；C5–C9 维持/延后并有理由 |
| t3 API 与数据链路 | 无 P0；1 个 P1；2 个 P2；7 个 P3 | **P1-1（连续 3 次一般性错误后 API 永久禁用）** | **已修复**（见下）；P2/P3 延后并有理由 |

**P1-1 修复证据（已核实源码与测试）：**
- `lib/api-manager.js` 新增常量 `ERROR_COOLDOWN_MS = 5 * 60 * 1000`；`_handleApiError` 一般性错误分支在 `consecutiveErrors >= 3` 时写入 `cooldownUntil = Date.now() + ERROR_COOLDOWN_MS`；`_isApiUsable()` 对 `error` 状态在 `!cooldownUntil || Date.now() >= cooldownUntil` 时返回可用（冷却到期自动恢复）。与 fix-log 描述一致。
- 新增 `tests/api-manager.test.js`，覆盖 4 个场景（冷却中禁停 / 到期恢复 / 历史无 cooldownUntil 字段可恢复 / <3 次仍可用），已纳入 `npm test`，实跑 `api-manager P1-1 cooldown test passed`。

**t1–t3 中每个 P0/P1 均有对应处理结论：** 唯一 P1（P1-1）已修复且有测试证据；其余无 P0/P1。不满足“已修复即未记录理由”的情形，闭环成立。

### 2. 改动文件范围与敏感信息抽查

`git diff --stat` 与 `git status` 显示的改动文件：

- 修改：`CHANGELOG.md`、`background.js`、`content.js`、`lib/api-manager.js`、`options/options.js`、`package.json`
- 新增：`tests/api-manager.test.js`、`maintenance/`（报告与修复日志）

范围核对：
- 全部落在任务 in-scope 内（`maintenance/`、`content.js`、`background.js`、`lib/`、`options/options.js`、`package.json`、`tests/`、`CHANGELOG.md`）。
- 未改动 out-of-scope 文件（`options/options.css`、`popup/popup.css`、`content.css`、`icons/`、`docs/`、`config/` 均未动），无越界夹带。
- `git diff` 内容与 fix-log 变更清单逐条吻合：C1（`options.js` `latestVersion` 过 `escapeAttr`）、C4（回退函数补 `.replace(/'/g,'&#39;')`）、C2（`background.js` `_pushLog` 新增 `redactString` 掩码 Bearer/sk-/AKIA）、C3（`content.js` `applyTranslationStyles` 写 CSS 变量前做 hex/数值+单位/字体白名单校验）。

敏感信息抽查：
- 对改动文件全量 diff 做了 `sk-[A-Za-z0-9]{8,}` / `AKIA[0-9A-Z]{16}` / `Bearer <长密文>` / `api_key` / `secret` 形态扫描，**零命中**。
- 改动方向均为“增加脱敏 / 增加校验 / 增加冷却”，未引入任何真实密钥、令牌或私有配置；`tests/api-manager.test.js` 仅用 mock `chrome` 与内存 `statusCache.test`，无真实凭据。

### 3. 版本一致性

| 位置 | 版本 | 判定 |
| --- | --- | --- |
| `manifest.json` → `version` | `1.3.0` | 一致 |
| `package.json` → `version` | `1.3.0` | 一致 |
| `CHANGELOG.md` | 顶部 released 版本 `## v1.3.0 (2026-08-31)`；新增 `## Unreleased` 维护区块置于其上（符合变更日志惯例） | 一致 |

结论：`manifest.json`、`package.json`、`CHANGELOG.md` 三处版本一致，均为 `1.3.0`，无漂移。

### 4. 报告与修复日志存在性与可读性

四个文件均存在于工作区根目录 `maintenance/`，内容可读、段落完整：

- `maintenance/interaction-review-1.3.0.md`（15753 B）✅
- `maintenance/security-review-1.3.0.md`（14467 B）✅
- `maintenance/api-data-review-1.3.0.md`（9876 B）✅
- `maintenance/fix-log-1.3.0.md`（5897 B）✅

（备注：`dual-translate-extension/maintenance/` 下存在 api 报告与 fix-log 的子目录副本，按 captain 指示以根目录 `maintenance/` 为准、忽略子目录副本；副本未影响本次核验结论。）

---

## 四、遗留问题清单（本轮 t5 范围外，交 t6/t7 闭环）

以下项均不属本批 P0/P1 修复范围，fix-log 第二节已明确标为“延后”并给出理由，最终闭环由 t6（P2 低风险修复）与 t7（P2 修复后最终验收）承接：

| 编号 | 问题 | 等级 | 延后理由 |
| --- | --- | --- | --- |
| interaction P2-1 | `checkAndTranslate` 延迟启动未重检开关，关闭后页面又被翻回（content.js:589） | P2 | 超出 P0/P1 范围 |
| interaction P2-2 | `retrySegment`/popup 手动翻译透传 `sourceLanguage='all'` 致火山等 API 失败（content.js:1279、popup.js:504-508、background.js:724） | P2 | 超出 P0/P1 范围 |
| interaction P2-3 | `toggleTranslation` 以局部 segments/cache 推断开关方向致快捷键失灵/反向（content.js:1626-1637） | P2 | 超出 P0/P1 范围 |
| api P2-1 | 清空单个密钥字段无法删除 local 密钥（settings-manager.js:754-790） | P2 | 涉及“空字符串 vs 显式删除”契约，需产品/UI 决策 |
| api P2-2 | 百度 LLM 54003/54005 未映射 RATE_LIMITED（baidu-llm.js:49-57） | P2 | 超出 P0/P1 范围 |
| interaction P3-1~P3-6 / api P3-1~P3-7 | 徽章竞态、多标签还原、指纹重扫、状态摘要滞后、saveApiStatus 未串行化、cache 键跨语言窗口、火山 region/service 硬编码、双份默认值漂移等 | P3 | 低优先，后续维护轮次 |
| security C5/C6/C7 | web_accessible_resources 暴露术语表、密钥明文存 local、custom provider 任意 HTTPS 端点 | 信息/观察 | 正向基线 / 平台特征 / 设计取舍，维持现状 |
| security C8 / C9 | panelCollapsed 持久化被内容白名单拦截；NO_API「打开设置」横幅因错误掩码不可达 | P2（定级由 interaction 确认） | 未达 P0/P1；C8 建议下一轮一行白名单放行，C9 涉及 content↔background 错误码契约需产品决策 |

**无 P0 遗留；无未说明理由的 P0/P1 遗留。**