# V2 两周实施计划

## 1. 时间假设与交付原则

计划按 10 个工作日、总计约 50–70 个专注小时制定。若实际只有 25–35 小时，执行文末“最低成功线”。

工作原则：

- 每天结束都留下可运行状态。
- 先解决最可能阻塞完整闭环的风险。
- 每个非平凡逻辑至少有一个能失败的自动化检查。
- 不以目录、类或接口数量衡量进度，只以用户可完成的真实行为衡量。
- 所有新功能必须保持现有 SEEK 筛选功能可用。

## 2. 阶段门槛

| Gate | 最晚时间 | 必须证明 |
|---|---:|---|
| A — Job observation | Day 2 | 真实 SEEK 当前职位可提取成完整 `JobPosting` |
| B — Agent decision | Day 5 | 固定 fixtures 产生不同的 tool trace 和结构化推荐 |
| C — Browser vertical slice | Day 7 | 浏览器点击 Analyse 到结果展示和持久化完整跑通 |
| D — Application preparation | Day 8 | 从批准的分析生成 evidence-grounded CV variant 和 cover letter |
| E — Validation | Day 10 | 自动评测、真实申请演练、文档和演示均可复现 |

如果 Gate 延误，立即按照“砍功能顺序”缩减，不得通过跳过测试或伪造 fixture 结果宣布完成。

## 3. Day-by-day

### Day 1 — 固定范围、清理声明、捕获真实输入

交付：V2 明确 SEEK-only；获得匿名化真实 SEEK 当前职位 fixture。

任务：

- 记录当前 `typecheck`、lint、Vitest 和 E2E 基线。
- 从 README、manifest/entrypoints、i18n 和验收中移除 Trade Me 支持声明。
- 删除或禁用 Trade Me runtime entrypoint；保留 Git 历史，不投入修复。
- 定义 TypeScript/Pydantic 对齐的 `JobPosting` 契约。
- 捕获至少三个匿名化真实 SEEK detail DOM fixture：完整、字段缺失、动态切换。
- 确认列表页选择不同岗位时，哪一块 DOM/ID 代表“当前职位”。

检查：

- V1 SEEK 列表筛选仍通过。
- fixtures 不包含姓名、邮箱、cookie、token 或用户私人数据。

### Day 2 — JobDetailAdapter

交付：当前岗位稳定变成 `JobPosting`。

任务：

- 新增 `JobDetailAdapter` 最小 contract。
- 实现 SEEK detail extractor 和 extraction diagnostics。
- 处理 selected-job 变化、SPA 更新和 description 展开状态。
- 增加 Side Panel → active tab → content script 的读取消息。
- description 不完整时提示用户展开；不自动点击页面。

检查：

- 三种 fixture contract tests。
- 切换岗位后不会返回上一岗位内容。
- 缺少 description 时 fail closed，不调用 Agent。

Gate A：必须在真实 SEEK 页面验证一次。

### Day 3 — Local Agent Service 与安全通信

交付：扩展可以安全连接本地 FastAPI，并提交/读取假分析结果。

任务：

- 创建最小 Python package、锁定依赖和启动命令。
- 实现 `/health` 和 `/v1/analyses` 的 Pydantic request/response。
- 服务只绑定 loopback。
- 实现共享 token、Origin/CORS、body limit 和统一错误格式。
- 为扩展增加最小 loopback 权限和 server health UI。
- 不在 Content Script 中 fetch。

检查：

- 正确 token 成功；缺失/错误 token 被拒绝。
- 非扩展 Origin 被拒绝。
- Agent server 关闭时 V1 继续工作。

### Day 4 — Candidate、Evidence、SQLite 与基础 CV

交付：真实个人资料可私下导入；一个 ATS 模板能生成 Master CV。

任务：

- 定义 `CandidateProfile`、`EvidenceRecord` 和 schema version。
- 创建虚构 example profile；私人文件和数据库加入 `.gitignore`。
- 实现 JSON import validation 和 SQLite 初始化/迁移入口。
- 整理项目作者至少 15–30 条 evidence，使用稳定 ID 和 tags。
- 实现一个 HTML/CSS ATS 模板和浏览器打印样式。
- 从 Master Candidate Data 生成基础 CV，不接 Agent。

检查：

- 无效 profile/evidence 导入失败且不覆盖已有数据。
- HTML 中只出现已导入事实。
- 打印预览基本可读，无明显截断。

### Day 5 — PydanticAI 单 Agent 与核心工具

交付：fixture 输入能完成真实动态 tool loop。

任务：

- 定义 Agent instructions、RunContext dependencies 和 structured output。
- 实现五个核心只读工具。
- 实现最大 turns、timeout、usage limit 和 tool/result redaction。
- 为 `hard blocker`、`portfolio gap`、`availability conflict`、`normal apply` 准备场景。
- 把 tool events 转成可持久化、可展示的结构。

检查：

- 至少三类场景产生不同调用路径。
- Hard blocker 可以提前终止，不生成材料建议。
- 信息缺失输出 `unknown`/clarification。
- 相同输入可重复运行并保存模型/prompt version。

Gate B：若所有 fixtures 走相同工具顺序，不算完成。

### Day 6 — Side Panel Agent UI

交付：用户可以在扩展中发起分析并理解 Agent 做了什么。

任务：

- 新增独立 Agent 页面组件，不继续扩大现有 `App.tsx` 主体。
- 显示当前职位摘要、Analyse 按钮、server 状态和错误。
- 显示 recommendation、fit、readiness、blockers、matches、gaps、unknowns。
- 显示安全的 tool trace：工具、状态和结果摘要，不显示 chain-of-thought。
- 支持重试和读取最近一次结果。

检查：

- 键盘可访问，loading/error/status 有语义化提示。
- 重复点击不会创建并发重复分析。
- Side Panel 重开后可恢复已完成结果。

### Day 7 — 完整分析闭环和 Application History

交付：真实 SEEK → Agent → Side Panel → SQLite 闭环。

任务：

- 统一现有 job identity 与服务端 job/application key。
- 保存 job snapshot、analysis、tool trace 和 application status。
- `check_application_history` 能影响 Agent 路径。
- 增加用户动作：准备申请、Maybe、Skip/Archive。
- 真实运行至少三个不同 SEEK 岗位。

检查：

- 同一岗位不会误建多个 application。
- 再次分析能发现历史记录。
- 数据库失败不会显示虚假的成功状态。

Gate C：到此必须已经是可用的 Real Agent 产品；后续材料功能不能阻塞它。

### Day 8 — Targeted CV 与 Cover Letter

交付：从用户批准的分析生成并导出岗位材料。

任务：

- 定义 `CVChangePlan` 和 `CVVariant`。
- Agent 选择、排序和突出 evidence，并给出受约束改写。
- 验证所有引用 evidence ID 存在。
- 生成一个岗位版 HTML CV snapshot。
- 生成带 evidence references 的 cover letter。
- 用户可以编辑、批准和打印/保存 PDF。

检查：

- 无 evidence 的 claim 被拒绝。
- Master Candidate Data 不被岗位 variant 隐式覆盖。
- 同一 analysis 可以重新生成，但旧 snapshot 保留。
- Hard blocker 状态默认不出现生成材料按钮。

Gate D：使用一个真实目标岗位完成一次材料准备。

### Day 9 — Evaluation 与 Career Gap 记录

交付：项目能回答“如何验证”和“结果怎样”。

任务：

- 建立 12–20 个匿名化岗位和人工 ground truth。
- 实现 evaluation runner 和机器可读 report。
- 测量 blocker、recommendation、evidence、unsupported claim、tool path、latency 和 cost。
- 保存 gap observations 和 deadline，不做完整 dashboard。
- 根据失败案例只修 prompt/tool/schema 的根因，不为单一案例打补丁。

检查：

- Evaluation 可用一条命令重复运行。
- Ground truth 与模型输出分开保存。
- 小样本同时报告分子/分母，不只报百分比。

### Day 10 — 真实演练、回归、文档和缓冲

交付：可展示、可安装、可复现的 V2 Core MVP。

任务：

- 用真实 SEEK 完成一次从发现岗位到导出材料的演练。
- 运行 TypeScript/Python unit、typecheck、lint、build 和 extension E2E。
- 验证 V1 SEEK 过滤无回归。
- 更新根 README：problem、what was built、agent behavior、privacy、setup、validation、results。
- 补充一张简单架构图、一段演示流程和已知限制。
- 统一项目版本叙事，不再同时出现“V1.0 已上线”和 package `0.8.0` 的冲突。

Gate E：任何无法复现的结果不得写进 README。

## 4. Definition of Done

V2 Core MVP 只有同时满足以下条件才算完成：

- 现有 SEEK filters 仍工作。
- Trade Me 不再被宣传为受支持能力。
- 当前真实 SEEK 岗位能稳定提取完整 JD。
- Agent 至少有三条由 observation 驱动的不同 tool path。
- Hard blocker 会改变后续行动并阻止无意义材料生成。
- Unknown 不会被自动转换成候选人事实。
- Candidate claims 可追踪到 evidence IDs。
- 能生成、审核并导出一个岗位版 CV 和 cover letter。
- 分析、材料和申请状态可以重新打开。
- 私人数据、数据库和 API Key 不进入 Git。
- 自动评测和最小真实使用结果已记录。
- README 能清楚讲述 problem、build、validation、results。

## 5. 砍功能顺序

发生延期时，按顺序从上到下删除，不能删除安全、evidence 和 Agent-first 验收：

1. Streaming 动画和精细 UI。
2. Cover letter 多版本/语气选项。
3. Profile 图形化编辑，保留 JSON import。
4. CV 自动分页优化，保留浏览器打印。
5. Career gap 汇总界面，保留 gap 数据保存。
6. PDF 自动文件生成，保留 HTML 和系统打印。

不得砍掉：真实 SEEK 提取、动态 tool loop、结构化输出、evidence 校验、application history 和 evaluation。

## 6. 最低成功线（25–35 小时）

若可用时间不足，交付范围收敛为：

```text
SEEK JobPosting
→ PydanticAI 动态工具调用
→ 结构化 recommendation + tool trace
→ Candidate/Evidence/History
→ CV Change Plan + HTML CV
→ 小型 evaluation report
```

Cover letter 可保留为纯文本；PDF 使用浏览器打印；Profile 使用 JSON；不做材料编辑 UI。

## 7. 两周后第一批任务

Core 完成后才进入：

1. 朋友可用的 onboarding/configuration。
2. 公司官网岗位搜索和来源对比。
3. 高频 requirements/gaps dashboard。
4. GitHub portfolio coach。
5. Application form assistant。
