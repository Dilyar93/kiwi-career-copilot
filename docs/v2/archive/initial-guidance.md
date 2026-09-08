# V2 指导计划：Personal Career & Application Copilot

状态：已确认，作为 V2 开发的指导性计划。

本文档集把 [`original-proposal.md`](original-proposal.md) 中的产品构想收敛为当时的可执行方案。本文现已归档；若与当前文档冲突，以 [`../README.md`](../README.md) 为准。

## 文档导航

- [`initial-architecture.md`](initial-architecture.md)：当时的目标架构、Agent 边界、网站适配、数据模型和安全约束。
- [`two-week-plan.md`](two-week-plan.md)：两周实施顺序、阶段门槛、验收条件和砍功能顺序。
- [`initial-evaluation-plan.md`](initial-evaluation-plan.md)：当时的 Agent、evidence、材料生成和真实使用评测方法。
- [`baseline-2026-09-04.md`](baseline-2026-09-04.md)：V2 开始前的可运行基线和真实 SEEK DOM 检查记录。

## North Star

V2 的长期目标不是一个“给 JD 打分”的插件，而是一个 local-first 的个人求职工作台：

```text
Candidate Profile / Evidence
            ↓
职位发现、提取与信息补全
            ↓
硬条件、匹配度、差距、截止日期
            ↓
立即申请 / 补强后申请 / 长期准备 / 跳过
            ↓
Targeted CV + Cover Letter
            ↓
申请记录与结果
            ↓
技能、GitHub、LinkedIn 改进计划
            └──────────────→ 新的 Candidate Evidence
```

系统首先解决项目作者的真实求职问题，之后再提高到可以分享给朋友本地使用的程度。它不是 SaaS，也不是自动海投机器人。

## 已确认的产品与技术决策

### 1. Agent-first，而不是固定 workflow

Agent 必须根据 observation 自主决定下一步调用哪个工具，并在收到工具结果后重新规划。不同职位应该产生不同的 tool trace。

确定性代码仍然负责：

- Work-right、时间和日期计算。
- 输入、输出和 evidence ID 校验。
- HTML/CSS 简历渲染。
- SQLite 事务和状态保存。
- 权限、安全与敏感操作确认。

Agent 负责：

- 决定需要检查哪些信息。
- 决定是否提前终止、继续检索或向用户提问。
- 区分 hard blocker、evidence gap、短期补强和长期能力差距。
- 决定是否需要定制 CV、需要突出哪些 evidence、是否需要 cover letter。

### 2. V2 为 SEEK-only

现有 Trade Me 支持实际上不可可靠使用。V2 将：

- 不再宣称支持 Trade Me。
- 从运行入口、权限、用户界面和验收条件中移除 Trade Me。
- 保留通用网站 Adapter 设计，而不是保留失效实现。
- 未来通过同一 Adapter contract 重新增加其他网站。

### 3. 增量升级，不重写 V1

继续复用现有：

- WXT、React 和 Manifest V3 工程。
- SEEK 列表页提取、过滤、卡片装饰和 SPA/MutationObserver 生命周期。
- Zod 消息校验、storage repository、i18n 和测试基础设施。
- V1 的负向筛选、距离、已查看和隐藏功能。

V2 只增加完整职位提取、Agent 服务、Candidate/Evidence、简历材料和申请记录。

### 4. 使用轻量 Agent framework

本地服务采用：

```text
Python + FastAPI + PydanticAI + Pydantic + SQLite
```

- 使用 PydanticAI 的 tool loop、类型化 dependencies、structured output、重试和事件流。
- 第一版只正式测试一个 LLM Provider。
- 不自行实现 `LLMProvider` 接口；PydanticAI 已提供模型适配层。
- 不做 Multi-agent。
- 暂不使用 LangGraph；只有出现跨进程长时间暂停/恢复或复杂多阶段审批时才重新评估。

### 5. 简历是一等核心能力

V2 不复制 FlowCV 的自由设计能力，而是解决实际痛点：

- 一份 Master Candidate Data。
- 一个稳定的 ATS-friendly 模板。
- 不限数量的岗位定制版本。
- 通过 `CV Change Plan` 选择、排序、突出和轻微改写已有 evidence。
- 每份岗位简历保存 snapshot，可重新生成和审计。
- 使用浏览器原生打印保存 PDF。

### 6. Local-first 与 Human-in-the-loop

- Candidate、evidence、申请历史和材料默认保存在本机。
- 云端模型仅获得完成当前任务所需的最小上下文。
- 敏感声明、材料最终确认、表单填写和提交始终由用户控制。
- 不自动提交申请。

## 两周交付范围

两周目标是一条可以真实使用和演示的完整申请闭环：

```text
打开 SEEK 当前职位
→ Analyse Job
→ Agent 动态调用本地工具
→ 展示 Apply / Maybe / Skip、依据和 tool trace
→ 用户选择申请
→ 生成 CV Change Plan、岗位版 CV 和 Cover Letter
→ 用户审核并导出
→ 保存申请状态
→ 使用匿名化职位集评测
```

两周必须交付：

- SEEK 完整职位提取和标准化 `JobPosting`。
- Candidate Profile 和带稳定 ID 的 Evidence Library。
- PydanticAI 单 Agent 和真实动态工具调用。
- Work-right、availability、history、evidence 工具。
- 结构化分析结果、可见 tool trace 和错误状态。
- Master CV、一个 ATS 模板、岗位 variant 和浏览器 PDF 导出。
- Evidence-grounded cover letter。
- SQLite application/analysis/run history。
- 12–20 个匿名化岗位评测集和可重复 runner。
- README 中可演示的 problem/build/validation/results 叙事。

## 两周明确不做

- Trade Me 修复。
- Generic ATS 表单扫描或自动填写。
- 自动提交申请。
- RAG、embedding 或 vector database。
- CV/visa/timetable PDF 解析。
- 多 Agent、LangGraph、Temporal 或分布式任务。
- 多模型兼容性承诺。
- FlowCV 式拖拽编辑器和多主题系统。
- 自动联网补全岗位。
- 自动修改 GitHub 或 LinkedIn。
- 非技术用户安装器、SaaS、多用户或 Chrome Store 重新发布。

## 两周后的路线图

只有两周验收全部通过后，才按以下顺序扩展：

1. **Shareable Local Release**：Profile onboarding、API Key 配置、数据迁移、导入导出和更简单的本地服务启动。
2. **Job Source Enrichment**：按需查找公司官网原始岗位，补充截止日期、完整 JD 和申请入口，并保存来源。
3. **Career Intelligence**：跨岗位聚合高频 hard requirements 和 skill gaps，生成短期/长期改进 backlog。
4. **Portfolio Coach**：读取公开 GitHub 仓库并建议 README、demo、架构图、测试和 evidence 改进；LinkedIn 先输出人工 checklist。
5. **Application Assistant**：表单识别、已知字段建议、未知问题澄清和敏感字段确认；仍由用户批准填写和提交。
6. **Additional Job Sites**：用 Adapter contract 增加新网站；不复活旧的失效 Trade Me 代码。
7. **RAG**：只有结构化 evidence 搜索在真实数据上出现可测量的召回不足时才引入。

## 计划变更规则

开发中发现新想法时，先归入两类：

- 阻止当前完整闭环或验收：进入当前阶段。
- 不阻止当前闭环：记录到路线图，不改变两周范围。

任何新增依赖、抽象或服务都必须回答：它当前消除了什么已经存在的失败或重复代码。如果答案只是“以后可能需要”，则后置。
