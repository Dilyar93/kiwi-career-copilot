# 项目文档入口

本目录按产品版本组织。V2 是当前开发主线；V1 只用于理解产品来源和兼容已有功能。

## AI 阅读顺序

仓库根目录的 [`AGENTS.md`](../AGENTS.md) 是 coding agent 自动发现的简短入口。开始任何产品或开发任务前，按任务需要读取：

1. [V2 文档入口](v2/README.md)：当前目标、边界、术语和文档权威顺序。
2. [V2 当前状态](v2/current-state.md)：代码已经做到什么、还缺什么。
3. 按任务读取 [产品定义](v2/product.md)、[阶段路线图](v2/roadmap.md)、[架构](v2/architecture.md)、[体验规范](v2/experience.md) 或 [质量策略](v2/quality.md)；处理当前阶段时再读取路线图链接的实施计划。
4. 最后核对实际代码、tests 和配置，再决定应修改实现还是文档。

不要从 `archive/` 中的旧计划推导当前任务。需要解释历史选择时，先读 [V2 设计演变](v2/decisions.md)，再按需查原始文档。

## 版本目录

- [V1](v1/README.md)：已上线版本的产品快照、实现对照和历史资料。
- [V2](v2/README.md)：当前 Personal Career & Application Copilot。
- [Vibe-coding 文档约定](ai-development.md)：AI 会话如何读取、更新、归档和判断完成度。

## 公开展示材料

- [English project showcase](showcase/README.md)：V2 Stage 2 结束时冻结的英文实习作品集快照，包含项目概览和技术深潜；它不是当前产品或开发事实的权威来源。

## 文档维护规则

- `product.md` 描述产品应该是什么，不记录每日进度。
- `current-state.md` 描述仓库今天真实是什么；实现状态变化时更新。
- `roadmap.md` 只描述阶段顺序和退出条件，不绑定天数。
- `architecture.md` 同时区分“当前实现”和“目标边界”，不得把计划写成已实现。
- `decisions.md` 集中记录已改变、放弃或延期的设计，不在旧文中穿插批注。
- 历史原文只归档，不作为当前指令，也不反复修改。
- Git 历史不能还原早期本地开发过程，不用于推断当前产品意图；以 living docs、代码、tests 和配置为准。
- 自动化测试是持续工程保障；完成的阶段可以冻结一份基于已复现事实的作品集快照，完整产品评价、发布材料和最终 Showcase 更新放在收尾阶段。
