# V2：Personal Career & Application Copilot

状态：当前开发主线。本文是 AI 和人类进入 V2 文档的第一站。

V2 首先是一个能被真实使用、愿意持续使用的产品。开源、作品展示、完整 evaluation 和商店发布都是后续结果，不能反过来主导当前产品设计。

## 一句话定义

一个以 SEEK 为当前入口、local-first 的个人求职 Agent：它从用户的多份 CV、项目、工作权利及其他职业来源建立可追溯知识库，帮助理解岗位、判断是否申请、准备多份岗位材料、记录申请，并逐步形成职业能力改进计划。

## 当前事实

- V1 的 SEEK 负向筛选能力继续保留。
- V2 的岗位判断主流程已经成型；Stage 2 的 Source-only Career Knowledge Base 已完成代码和真实资料纵切，包括独立项目 Markdown 的岗位检索走查。
- 当前默认模型为 Alibaba Qwen3.7-Plus，通过 PydanticAI 调用。
- 当前只支持 SEEK；Trade Me 已退役。
- 第一轮信息架构和 UI/交互重设计已通过作者真实 SEEK 走查；旧 Profile/Evidence 编辑与兼容运行路径已经删除，Library 是候选人资料的唯一产品入口。
- 下一开发阶段是 Jobs/Application Workspace；详细边界见 [Stage 3 实施计划](stage-3-job-application-workspace-plan.md)。

## 权威文档

| 文档 | 回答的问题 | 何时读取 |
|---|---|---|
| [产品定义](product.md) | 为谁解决什么问题，产品如何工作，什么属于范围 | 所有产品/功能任务 |
| [当前状态](current-state.md) | 今天实际实现了什么、缺什么、有哪些风险 | 开始任何改动前 |
| [阶段路线图](roadmap.md) | 当前先做什么，完成标准是什么 | 规划和拆任务时 |
| [Stage 2 Career Knowledge Base 计划](stage-2-career-knowledge-base-plan.md) | 资料库重构的已完成边界与验证记录 | Stage 2 历史核对 |
| [Stage 3 Jobs/Application Workspace 计划](stage-3-job-application-workspace-plan.md) | 如何把已保存分析变成可持续使用的岗位工作区 | 当前产品与开发任务 |
| [Agent Runtime 可靠性计划](agent-runtime-reliability-plan.md) | Agent 如何去重、压缩上下文、优雅结束和恢复 | Agent 循环、成本、上下文或失败恢复任务 |
| [架构](architecture.md) | 浏览器、本地服务、Agent、数据和网站如何分工 | 技术设计和编码时 |
| [产品体验](experience.md) | 当前信息架构、自动同步、界面层级和控件规范 | UI/交互任务 |
| [设计演变](decisions.md) | 为什么旧计划没有照做或被延期 | 遇到历史冲突时 |
| [质量策略](quality.md) | 当前要跑哪些检查，完整 evaluation 何时做 | 测试、埋点和收尾时 |

旧企划、两周计划和早期评测方案在 [archive](archive/README.md)。它们不是当前指令。
AI 会话的读取、更新和归档规则见 [Vibe-coding 文档约定](../ai-development.md)。

## 决策优先级

文档冲突时按以下顺序处理：

1. `product.md` 的产品原则和安全边界。
2. `roadmap.md` 的当前阶段与退出条件。
3. `current-state.md` 的已实现事实。
4. `architecture.md` 的当前约束。
5. `decisions.md` 和历史资料。

如果代码与 `current-state.md` 不一致，先检查代码和测试，再更新状态文档；不要为了让代码符合过时文档而改代码。

## 当前工作方式

- 按阶段推进，不以“两周”“第几天”判断完成度。
- 先完成当前阶段的用户结果，再扩展下一层能力。
- Agent 负责语义判断、检索规划和追问；普通代码只执行能力并负责数据校验、来源、隐私、持久化和恢复，禁止用业务 `if/else` 代替 Agent 判断。
- 产品主界面优先展示用户任务、结论、证据和下一步；tool trace 属于解释/诊断详情。
- 修改代码时运行相称的自动化检查；当前不扩建 benchmark、评测报告或展示脚本。
- 不为未来网站、模型、RAG、多 Agent 或 SaaS 预建抽象。
