# V2 架构

本文件描述当前代码边界。产品目标和阶段分别见 [product.md](product.md) 与 [roadmap.md](roadmap.md)。

## 1. 系统结构

```text
SEEK page
  → content script / SEEK adapters
  → JobPosting
  → Side Panel
  → loopback HTTP API (FastAPI)
  → PydanticAI single decision Agent
  → Source/Claim/chunk/history tools
  → SQLite
  ↘ Alibaba Model Studio / Qwen3.7-Plus
```

浏览器扩展负责当前页面读取、V1 列表筛选、交互和连接配置。本地服务负责私人职业资料、Agent loop、分析/材料/申请状态和数据校验。模型 Provider 负责语言理解、调查选择和职业判断。

## 2. Agent-native 不变量

Agent 是岗位分析的唯一语义决策者：它看到岗位和安全的 Library catalogue 后，自主决定需要验证什么、如何组织 query、是否读取 Claim、搜索 chunks、打开指定原件、查询申请历史、继续检索、提问或结束。

普通代码只负责：

- 执行 Agent 请求的本地读取与排序。
- authentication、schema、provenance、privacy 和数据完整性。
- observation 去重、上下文压力处理、checkpoint 与恢复。
- 稳定的渲染和显式用户操作。

普通代码不得：

- 根据岗位词语写 work-right、availability、行业经验等业务分支。
- 强迫所有岗位调用同一工具或按同一顺序运行。
- 在模型追问后再由系统拼接“unknown 问题”。
- 因某个测试案例而硬编码推荐、问题或事实解释。

可靠性 finalization 只会在重复无新信息或真实上下文压力时暂时收起工具，让同一个 Agent 用现有 observation 安全结束；它不能修改 recommendation、制造问题或把 unknown 改成 gap。输出 validator 只校验 hard blocker 与材料动作的安全一致性、clarification questions 去重，以及候选资料 `source.*` / `document.*` 引用是否来自运行期检索；`termination_reason` 不作为工作流状态源。

## 3. Candidate Knowledge

唯一权威链路是：

```text
CandidateSource 原件
  → extracted_text
  → ordered chunks + SQLite FTS5
  → source-owned Claims + exact source ranges
  → optional conflict Resolution
  → Agent observations
```

不存在运行中的 Candidate Profile、EvidenceRecord、兼容回退或 JSON/CLI 导入路径。

### Source

PDF、DOCX、TXT 和 Markdown 先经过大小、格式和确定性解析校验；校验或解析失败的输入不会入库。解析成功后，原件、全文与 chunks 先保存在本地 SQLite，再由受约束模型根据文件自身类别、结构和内容产生 classification、summary 和完整逻辑记录型 Claims。后续模型理解失败时保留已入库原件并标记 `needs-attention`。

Claim 是检索索引，不是全局事实：每条绑定一个 Source、完整 statement、动态 attributes 和能在抽取文本中重新定位的 verbatim sourceText。教育、工作或项目的机构/角色/日期属于同一逻辑记录，不能拆成孤立字段。

相同排他 key 在不同来源出现共同属性冲突时才进入 Review Inbox。Resolution 独立保存，不改写原件或 Claim。普通侧重点差异、缺失字段和可累积经历不构成冲突。

### 三层读取

Agent 可使用四个工具：

1. `get_candidate_claims(requirements, cursor)`：按 Agent 给出的 requirements 在全部 ready Claims 中本地排序，返回带来源的候选页。
2. `search_candidate_documents(requirements, source_ids, cursor)`：搜索 chunks；未指定 source 时默认排除高敏感原文，指定 ID 表示 Agent 有意识地下钻该来源。
3. `open_candidate_source(source_id)`：读取一个 ready Source 的完整抽取文本。
4. `check_application_history(current_job_identity)`：读取当前岗位申请历史。

Claims/chunks 的分页只适配模型剩余上下文，不限制本地总召回；返回 `nextCursor`，由 Agent 决定是否继续。检索无结果只是一条 observation，不能由代码解释为“用户没有”。

## 4. 敏感资料边界

- 原始文件和索引保存在本机；上传理解会把提取文本发送给用户配置的模型 Provider，UI 必须明确说明。
- 高敏感 Source 的导入 contract 要求模型不建立 identity/contact、证件号、客户号、出生信息或国籍 Claims，并只提取与任务有关的权利、限制、条件和有效期。服务端在初次保存、敏感度变更、数据库迁移和统一读取边界确定性排除 identity/contact categories；其余更宽的语义范围依赖模型遵守导入 contract。
- 通用 chunk search 不返回高敏感来源；Agent 可以从 catalogue 选择确切 source ID 搜索或打开原文。该选择不会触发系统业务拒绝。
- UI、持久化 ToolEvent 和日志只保存安全摘要，不保存模型隐藏思维或打开的敏感全文。
- 模型读取能力不等于发布权限；对外材料仍受来源引用和用户最终确认约束。

## 5. Agent 运行与恢复

每轮 analysis 在第一次模型调用前写 checkpoint，每个 ToolEvent 后更新去重 observation ledger。相同岗位内容、模式、clarification、Library fingerprint 和 prompt version 的失败运行可继续；任一输入变化会新建 run。完成结果、tool summaries 和 usage 保存在 SQLite。

产品不设置自定义累计 token、tool-call/request 或整轮超时，以免 Provider 已计费后丢弃完整返回。保留框架最终循环保险丝、单工具 timeout、输出重试和输入大小/类型边界。较旧 tool result 只在存在可信 context-window 信息且进入压力区间时压缩为 ledger 引用。

Clarification answers 当前属于该岗位 continuation，并以 `clarification.N` 作为本轮可引用事实；不会静默变成跨岗位全局资料。跨岗位用户确认记忆尚未实现，后续应作为 Source-compatible 的用户 assertion 设计，不能复活 Profile 表单。

## 6. Materials

```text
completed Analysis
  → choose ready CV Source matching job mode, else latest ready CV
  → collect usable Source Claims + retrieved excerpts + job clarifications
  → constrained material Agent selects sources and drafts content
  → validate source refs and supported skills
  → deterministic escaped ATS HTML + Cover Letter
  → MaterialBundle snapshot
```

材料生成不写回 Source/Claim。CV 与 Cover Letter 是独立可选产物：只要 Analysis 允许其中一种就可准备材料，不要求两者同时生成。当前 CV 只支持一个基础 Source、内容强调/排序，以及独立扩展页面中的完整尺寸预览、Cover Letter 临时编辑和下载；多基础 CV、岗位 variant、diff approval、编辑持久化和完整材料工作区属于后续阶段。

## 7. 网站与 API 边界

当前运行入口是 SEEK-only。`JobPosting` 隔离网站 DOM 与 Agent/存储/材料，领域层不得引用 SEEK selector。Trade Me 已退役。

阶段 5 的 Job Enrichment 可增加“读取用户当前打开的公司招聘详情页”，但不建立通用站点插件系统：generic reader 输出可验证预览，经用户确认后进入同一 `JobPosting` 边界。

当前 API：

- `GET /health`
- `GET|DELETE /v1/candidate-library`
- `POST /v1/candidate-sources`
- `PATCH /v1/candidate-sources/{source_id}`
- `POST /v1/candidate-sources/{source_id}/reprocess`
- `GET /v1/candidate-sources/{source_id}/content`
- `DELETE /v1/candidate-sources/{source_id}`
- `POST /v1/candidate-conflicts/{conflict_id}/resolve`
- `POST /v1/analyses`
- `POST /v1/analyses/{analysis_id}/continue`
- `GET /v1/analyses/{analysis_id}`
- `GET|POST /v1/analyses/{analysis_id}/materials`
- `GET /v1/applications`
- `PATCH /v1/applications/{application_id}`

Analysis POST 支持 NDJSON 安全活动事件；这些是已完成工具动作，不是 chain-of-thought。

## 8. 存储与演进

SQLite schema v8 包含 `candidate_sources`、`source_chunks`/FTS5、`source_claims`、`claim_resolutions`、`jobs`、`agent_runs` 和 `applications`。从 v1–v7 打开数据库时删除适用版本中未发布的 Profile/Evidence 表与旧 prompt runs，保留 Source 原件/chunks/Claims；同时清理高敏感来源中旧 identity/contact Claims 及其 conflict resolutions。

数据库、API key、个人原件和生成材料不进入 Git。服务只绑定 `127.0.0.1`，要求共享 token 和精确 extension identity/origin，请求经过大小和严格 schema 校验。

新抽象必须由第二个真实实现或已出现的查询需求证明；当前不增加向量数据库、GraphRAG、多 Agent、Provider wrapper 或通用 capability registry。
