# V2 架构设计

## 1. 架构目标

V2 在不破坏 V1 SEEK 筛选功能的前提下，增加三个边界清晰的能力：

1. 浏览器把当前 SEEK 岗位提取为标准化 `JobPosting`。
2. 本地 Agent 根据岗位、候选人事实和工具 observation 动态决策。
3. 确定性材料引擎把 Agent 的结构化计划变成可审核的 CV 和 cover letter。

目标不是让 LLM 控制一切，而是让它负责不确定环境中的规划，把计算、渲染、持久化和权限留给可靠代码。

## 2. 现有基础与改动边界

| 现有组件 | V2 处理方式 |
|---|---|
| `SiteAdapter` 和 SEEK list-card extractor | 保留，用于 V1 列表筛选 |
| `PageController`、MutationObserver、URL watcher | 保留并复用页面生命周期思路 |
| Background message router 和 Zod schema | 保留；只增加必要消息 |
| React Side Panel | 增加独立 Agent/CV 页面，不先重构全部旧页面 |
| IndexedDB job seen/dismissed state | 保留为 V1 浏览状态 |
| Python Agent 数据 | 单独存入本地 SQLite，不塞进 V1 settings export |
| Trade Me adapter/entrypoint | V2 移除，不作为兼容目标 |

不要把当前仓库整体移动到新的 `extension/` 子目录。新增 `agent/` 和少量前端模块即可。

## 3. 总体数据流

```text
SEEK DOM
  │
  ▼
SeekListingAdapter ───────────────→ V1 filters
  │
SeekJobDetailAdapter
  │ JobPosting
  ▼
React Side Panel
  │ authenticated loopback HTTP
  ▼
FastAPI Local Agent Service
  │
  ├── PydanticAI Job Application Agent
  ├── deterministic tools
  ├── Candidate/Evidence repositories
  ├── CV/cover-letter preparation
  └── SQLite run/application history
```

Content Script 不调用 LLM，不读取 Candidate 私人数据，也不直接访问互联网。它只提取当前页面并返回结构化岗位。

## 4. 网站适配层

### 4.1 两个独立 contract

列表筛选和完整岗位分析的 DOM 需求不同，不应继续塞进同一个方法。

现有 `SiteAdapter` 原样保留，概念上承担 listing 能力；两周内不为了命名整齐把它重命名或拆文件。只新增完整岗位 contract：

```ts
interface JobDetailAdapter {
  readonly id: JobSourceId;
  canHandle(url: URL): boolean;
  extractCurrentJob(document: Document, url: URL): ExtractJobDetailResult;
}
```

这里的 contract 重点是职责边界，不要求现在创建动态插件系统或重构现有列表代码。

SEEK 使用现有 `SiteAdapter` 并新增 `JobDetailAdapter`。未来网站可以只实现其中一种能力，不要求所有网站同时支持筛选和 Agent 分析。

### 4.2 标准化 JobPosting

浏览器和 Python 服务之间的最小稳定契约：

```ts
interface JobPosting {
  schemaVersion: 1;
  source: JobSourceId;
  externalId: string | null;
  canonicalUrl: string;
  applicationUrl: string | null;
  title: string;
  company: string | null;
  location: string | null;
  employmentType: string | null;
  salaryText: string | null;
  description: string;
  postedAt: string | null;
  postedAtText: string | null;
  closesAt: string | null;
  closesAtText: string | null;
  extractedAt: string;
  extractionWarnings: string[];
}
```

规则：

- `description` 为空则不允许开始 Agent 分析。
- 页面没有提供的信息必须是 `null`，不能由 extractor 猜测。
- `postedAt`/`closesAt` 只保存页面明确给出且能可靠标准化的日期；原始文本保存在对应 `*Text` 字段供审计。
- `externalId`、canonical URL 和现有 job identity 尽量复用。
- Selector 变化时 fail-open，并向 Side Panel 返回 extraction error。

### 4.3 新网站增加方式

增加网站只允许触碰：

- 新的 content-script entrypoint 和 manifest match。
- 该网站的 selector/extractor/adapter。
- 新的 HTML fixtures 和 adapter contract tests。
- `JobSourceId` 注册表和展示名称。

Agent、Candidate、CV 和 evaluation 代码不得引用 SEEK DOM selector。

## 5. 本地服务与 API 边界

### 5.1 最小 API

```text
GET  /health
POST /v1/analyses
GET  /v1/analyses/{analysis_id}
POST /v1/analyses/{analysis_id}/materials
GET  /v1/applications
PATCH /v1/applications/{application_id}
```

两周内不增加通用 CRUD API。Candidate Profile 初始数据通过经 Pydantic 校验的 JSON 导入；图形化编辑器属于 shareable release。

`POST /v1/analyses` 接收 `JobPosting` 和当前求职模式，返回：

- `analysis_id`
- structured recommendation
- 可展示的 tool events
- usage/latency metadata
- clarification questions

`POST /materials` 必须由用户主动触发。它使用已保存的分析和用户批准的计划生成材料，不重新猜测岗位或候选人事实。

### 5.2 通信与安全

- 服务只绑定 `127.0.0.1`，不绑定所有网卡。
- Side Panel 负责 loopback 请求；Content Script 不请求本地服务。
- 使用共享本地 token 和自定义 header，服务端 fail-closed。
- 严格限制允许的 Chrome extension Origin、HTTP method、content type 和 body size。
- 不把 API Key 返回给扩展，也不写入浏览器同步存储。
- 日志默认不记录完整 CV、地址、电话、签证号或模型原始 prompt。
- Job description 是不可信输入；Prompt 必须明确它只是数据，不能覆盖系统指令。
- 分析工具默认为只读；写状态和生成材料由 HTTP handler 在用户动作后执行。

开发版本可以用配置文件完成配对，但不得为了演示关闭 token 或 Origin 校验。

## 6. Agent 设计

### 6.1 Framework

使用 PydanticAI 单 Agent：

- 官方 Agent loop 负责模型轮次和 function tools。
- Pydantic model 负责输入、tool 参数和最终输出。
- `RunContext` dependencies 提供 repository、当前时间和配置。
- 使用 usage limit、最大 tool turns 和总 timeout。
- 使用事件流生成可展示 tool trace，不展示隐藏 chain-of-thought。

参考：

- [PydanticAI Agents](https://pydantic.dev/docs/ai/core-concepts/agent/)
- [PydanticAI Function Tools](https://pydantic.dev/docs/ai/tools-toolsets/tools/)

第一版不引入 LangGraph。若一个 run 必须在浏览器/服务重启后从中断点恢复，才依据真实需求评估 LangGraph persistence/interrupt。

### 6.2 Agent 状态

一次分析 run 至少包含：

```text
goal
job_posting
job_mode
observations[]
tool_events[]
clarifications[]
recommendation
termination_reason
```

不持久化模型的隐藏 reasoning。持久化内容只包括：

- Agent 接收到的可审核输入摘要。
- 工具名称、经过脱敏的参数和结构化结果。
- 最终结构化输出。
- 模型、prompt version、时间、token usage 和错误。

### 6.3 Core tools

两周核心限制为五个只读工具：

1. `get_candidate_profile(sections)`：返回完成当前判断所需的结构化个人事实。
2. `check_application_history(job_identity)`：检查是否已分析、准备或申请过。
3. `check_work_eligibility(job_requirements)`：确定性比较用户确认过的 work-right facts 与岗位要求。
4. `check_availability(job_schedule)`：确定性比较 hours、date range、job mode 和人工录入 availability。
5. `search_candidate_evidence(query, limit)`：搜索带 ID、tags 和来源的真实经历。

不是 Agent tool 的操作：

- 读取 DOM：它是初始 observation，由 extension 完成。
- 保存 run/application：HTTP handler 在成功后事务保存。
- HTML/PDF 渲染：确定性 material renderer。
- 最终提交：只由用户执行。

未来的 `find_official_job_posting` 只有在 Core 验收通过后增加。

### 6.4 Agent-first 硬性约束

```text
observe → choose tool → receive result → re-plan → continue/stop
```

以下任一情况出现，Agent 阶段判定失败：

- 所有职位总是调用相同工具并保持相同顺序。
- 工具结果不会改变后续路径或 recommendation。
- 遇到 hard blocker 后仍无条件生成 CV 和 cover letter。
- 信息不足时编造事实，而不是标记 unknown 或提出 clarification。
- 实际运行没有 tool events，只有一次大 prompt 生成完整答案。
- Agent 直接修改 Candidate facts 或自动提交申请。

安全不依赖 Agent 自觉：如果输出包含 hard requirement 结论但对应工具未被调用，output validator 拒绝结果并允许有限重试。

### 6.5 最终结构化结果

最少字段：

```text
recommendation: APPLY | MAYBE | SKIP
fit: HIGH | MEDIUM | LOW
readiness: HIGH | MEDIUM | LOW
hard_blockers[]
strong_matches[]
partial_matches[]
gaps[]
unknowns[]
clarification_questions[]
cv_action: KEEP | TAILOR | DO_NOT_GENERATE
cover_letter_action: GENERATE | OPTIONAL | DO_NOT_GENERATE
next_actions[]
evidence_ids[]
```

每个 blocker、match、gap 和 material claim 都应尽可能保存 evidence/source reference，而不只是自然语言。

## 7. Candidate、Evidence 与 Career Memory

### 7.1 Candidate Profile

结构化存储确定性事实：

- Personal/contact details。
- Education 和预计毕业日期。
- Work rights 和用户确认日期。
- Availability、semester/summer mode。
- Location/relocation preferences。
- Skills level。
- Languages、driver licence 等申请字段。
- Job preferences。

Work-right tool 输出只能是 `compatible`、`incompatible` 或 `uncertain`，并附原因；它不是法律意见。

### 7.2 Evidence Record

```text
id
kind: experience | project | education | portfolio | achievement
title
statement
tags[]
source
verified_by_user
created_at
updated_at
```

Evidence ID 必须稳定，例如 `project.job_filter.evaluation`。第一版使用结构化 tag/关键词搜索；只有真实评测证明召回不足时才上 RAG。

### 7.3 Career gap

每次分析可以保存 gap observation：

```text
requirement
category
importance
status: hard_blocker | evidence_gap | quick_improvement | long_term_gap | unknown
deadline
job_key
source
```

两周只保存数据，不承诺完整职业统计 dashboard。后续可以按出现频率、目标岗位、已有基础和学习成本生成 backlog。

## 8. CV 与 Cover Letter

### 8.1 Master Candidate Data

Master 数据是唯一事实源，不为每个岗位复制整份可编辑 CV。

### 8.2 CV Change Plan

Agent 输出结构化计划：

- 选择哪些 evidence。
- 调整 section/bullet 顺序。
- 突出哪些技能。
- 建议哪些受约束的改写。
- 哪些内容保持不变或隐藏。

用户批准后，材料生成器产生 `CVVariant` snapshot。

### 8.3 Evidence policy

- 不得增加 Candidate Profile/Evidence 中不存在的技能、经历、职责、成就或数字。
- 每个实质性生成 claim 必须列出 evidence IDs。
- 不存在的 evidence ID 由程序直接拒绝。
- 有 ID 不代表语义一定成立；evaluation 中必须人工审核 entailment。
- 优先选择和排序原 bullet，其次才是轻微改写。
- 未经 evidence 支持的量化指标不得生成。

### 8.4 Rendering

- 只维护一个 ATS-friendly HTML/CSS 模板。
- 使用确定性布局和浏览器打印保存 PDF。
- 不在两周内实现自由拖拽、多主题或复杂分页引擎。
- 保存输入 snapshot、change plan、最终文本和生成时间，以便重建。

Cover letter 同样先生成结构化段落计划和 evidence references，再生成最终文本。

## 9. SQLite 最小模型

避免过早建立大量高度规范化表。两周内使用五个核心存储对象：

```text
candidate_profile   单一 profile JSON + schema version
evidence            独立 evidence records，支持 tags 查询
jobs                标准化 JobPosting snapshot
applications        status + analysis/material snapshots
agent_runs           input summary + tool trace + output + model metadata
```

允许在 application snapshot 中暂存 CV variant、cover letter 和 gaps。只有查询需求证明 JSON snapshot 不够时才拆新表。

数据库和私人导入文件放入未跟踪的本地数据目录；仓库只提交虚构示例。

## 10. 错误与恢复

- Job extraction 失败：显示具体缺失字段，不发送空 JD。
- Agent server 不可用：保留 V1 功能并显示启动说明。
- LLM timeout/rate limit：run 记录为 failed，可由用户重试，不重复写 application。
- Structured output 校验失败：框架有限重试，仍失败则显示可诊断错误。
- Tool 失败：Agent 收到结构化 error observation，可选择降级或输出 unknown。
- Material validation 失败：不输出可下载文件，展示 unsupported claims。
- Side Panel 关闭：已完成结果可从 SQLite 重新读取；两周内不保证未完成 run 跨关闭恢复。

## 11. 版本与可观察性

每个 run 保存：

- App version。
- Prompt version。
- Candidate schema version。
- Model/provider。
- Tool names and versions。
- Job extraction version。
- Latency、token usage、termination reason。

这既用于调试，也用于在 evaluation 中解释结果变化。不得把隐藏 chain-of-thought 作为产品日志或展示内容。
