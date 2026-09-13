# V2 设计演变与偏差

本文集中记录旧企划与当前方向的差异。旧文不逐段加批注；AI 遇到冲突时以当前产品文档为准。

## 决策记录

| 主题 | 早期设计/表述 | 当前决定 | 原因与影响 |
|---|---|---|---|
| 项目目的 | 为两周实习展示构建 Real AI Skill | 首先做真实可用、能吸引并留住用户的产品；展示是自然结果 | 技术纵切和 demo 不能代替 onboarding、交互、日常价值与可靠性 |
| 推进方式 | 10 个工作日、Day 1–10、两周门槛 | 按产品阶段和退出条件推进 | AI 已显著压缩编码时间，继续强调两周会错误判断完成度 |
| Evaluation | 两周核心交付，提前建设 12–20 cases、runner 和报告 | 当前仅维护已有自动化保障和最小运行元数据；完整评估放在收尾阶段 | 现阶段最大风险是产品不可用，不是缺少更多 benchmark |
| 展示 | tool trace、架构图、演示脚本和结果叙事被列为主要交付 | 默认 UI 先服务用户任务；Stage 2 完成后冻结一份基于已复现事实的实习作品集快照，Stage 7 再按最终产品更新；trace 属于详情 | 面试叙事不能主导产品信息架构，但一个已经闭环的阶段可以独立作为真实作品展示 |
| Trade Me | V1/V2 曾计划双站点 | V2 SEEK-only，Trade Me 退役 | 上线后确认 Trade Me 不可靠；不继续投入修复 |
| 网站扩展 | 提前设计多个来源和注册机制 | 列表增强与详情读取分开；阶段 5 的 Job Enrichment 再考虑“任意公司官网当前详情页手动读取” | 满足真实资料补全需求，但不做通用列表识别、注入或提前建设插件系统 |
| Agent framework | 曾讨论不使用 framework 或自行实现模型层 | 使用 PydanticAI 单一主决策 Agent；CV 导入只是受约束的结构化抽取组件 | 复用成熟 tool loop、类型化依赖和 structured output；不自建同类框架，也不把固定抽取伪装成多 Agent |
| Provider abstraction | 原企划提出自定义 `LLMProvider`，兼容 OpenAI/Anthropic/Ollama | 依赖 PydanticAI 模型适配；当前代码仅正式接受 Alibaba Provider | 当前只有一个产品需求，不维护一套重复抽象 |
| 模型 | 初期默认 OpenAI，之后考虑 Gemini/其他模型 | 默认 Qwen3.7-Plus | 平衡价格与能力；真实在线质量仍需验证 |
| Agent 形态 | 可能引入 LangGraph、多 Agent，随后又以七个专用检查工具和 validator 强制路径 | 保持一个主决策 Agent + 四个通用能力工具；Agent 自主决定查 Claims、chunks、指定原件或历史，也可直接结束 | 专用 work-right/availability 工具与强制调用把岗位语义写回代码，形成了伪 Agent workflow；可靠性机制只能治理循环和恢复，不能替 Agent 作业务判断 |
| Unknown 与追问 | 安全层曾要求每个 unknown 都有 clarification，并在 gap 降级后自动拼问题 | unknown 只表达当前无法建立事实；是否提问及其对推荐/材料的影响由 Agent 判断，护栏只做来源和断言安全校验 | preferred 条件未知不一定值得打断用户；确定性代码不能代替 Agent 判断问题能否改变决策 |
| 运行与成本限制 | 为单次分析设置 80k 累计 token、工具/请求次数、90 秒服务端和 95 秒浏览器硬上限 | 不设这些自定义终止值；使用 observation 去重、按模型窗口压缩上下文和同一 Agent 的无工具 finalizing，保留框架最终保险丝、输出安全和文件/API 边界 | 累计 token 在供应商已返回并计费后才检查，越界会丢弃已付费结果；按“是否有新信息”和实际上下文压力治理，比在末端用一个数字同时控制成本、质量和循环更合理 |
| Candidate 数据 | 两周版以 JSON/CLI 导入，之后实现 Profile 表单和 CV 建议确认 | Source、Source-bound Claim、chunk 和 Resolution 是唯一候选资料路径；未发布的 Profile/Evidence 表、API、UI、CLI、备份和示例全部删除 | 没有已发布 V2 数据需要兼容；双轨只会制造冲突、死代码和错误回退。不同用途文件保持独立，用户只处理真实异常 |
| 高风险 Claim 确认 | Stage 2 曾计划为 Visa、工作权利、关键日期等建立通用 Review Item 和确认状态 | 当前 Library 只处理失败来源和真实来源冲突；单一来源 Claim 可带引用参与分析，决策关键但证据不足时由 Agent 在当前岗位提问 | 当前没有稳定的风险分类和跨岗位确认语义；为几个预想类别建立新表、API 和 Inbox 会重新引入默认逐项审核。真实使用证明需要后，再设计 Source-compatible user assertion 和失效规则 |
| CV | 两周版接受单一 ATS HTML 与系统打印 | 仍从一个可靠模板开始，但目标是多个基础 CV/岗位 variant、差异与编辑工作区 | 真实痛点是多版本管理，不是展示一次生成 |
| Cover Letter | 文档描述为 evidence-grounded Agent generator，代码曾只有确定性模板 | 当前由受约束材料 Agent 使用 Source/Claim、原文检索片段和 clarification 生成可编辑初稿；引用由服务端验证 | 已形成真实生成纵切，但版本、批准、重新打开和编辑持久化仍属于阶段 4 |
| Tool trace | 被当作 Agent 真实性的主要 UI 证据 | 保留可审计数据，正常界面默认折叠 | 用户首先需要结论和行动，不是技术日志 |
| Job enrichment | 早期两周范围外 | 保留为阶段 5 的后续产品能力 | SEEK 信息不足和官网来源是用户真实痛点，但应在核心 UX 稳定后做 |
| RAG / Retrieval | 原企划包含向量检索，之后延后并先做结构化 evidence/tag 与逐行搜索 | Stage 2 建立 Claim → chunk → original 的分层词法检索；parent section 和混合语义检索只在真实需要出现后增加 | 多份 CV、Visa 和项目资料带来了真实的跨来源召回需求；当前 Claims + FTS5 + original 已覆盖小规模资料，不引入 GraphRAG 或外部向量基础设施 |
| Stage 2 边界 | Stage 2 后期计划同时包含多 CV variant、FlowCV workspace、GitHub/local folder/ZIP 和语义索引 | Stage 2 以 Source-only 知识库、来源绑定 Claims、词法 chunks、原件下钻和异常处理闭环结束；基础 CV/岗位 variant 进入 Stage 4，代码来源和语义检索按真实需要后续扩展 | 避免用相邻阶段能力制造永远无法结束的知识库阶段；现有小规模资料已由 Claims + FTS5 + original 覆盖 |
| 长期工作区界面 | Side Panel 同时承载当前岗位、长期岗位、材料预览和未来 CV 编辑 | Side Panel 保持当前网页 companion；Jobs、Applications、CV variants 和长期对象进入独立全页面 workspace | 窄侧栏适合当前上下文和快速动作，不适合列表、版本、比较和完整编辑 |
| Job 工作区状态 | 当前岗位页和早期 Stage 3 计划提出 `Maybe / Preparing / Applied / Skipped / Archived` 人工状态 | Workspace 直接展示 Agent Recommendation、截止日期、材料和已申请事实；分析与材料进展自动得出，只有实际提交由用户确认 `Applied` | `MAYBE / SKIP` 已由 Recommendation 表达，`Analysed / Preparing` 可以从数据得出；额外状态会重复信息并增加点击。归档只在真实列表规模证明需要后考虑 |
| 商店发布 | V1 已上线，V2 一度明确不考虑 | 当前不是主线；产品可用后再决定 | 不提前消耗大量合规精力，但安全/隐私不能延期 |

## 原企划中尚未实现的主要能力

- 外部公司官网岗位发现与来源比较。
- 完整 CV workspace、多个基础 CV/岗位版本，以及 Cover Letter 版本与批准流程。
- ATS/application form assistant。
- 跨岗位 Career Intelligence、GitHub 和 LinkedIn coach。
- 可分享安装、配置、升级和数据迁移。
- RAG、额外网站和更广泛 Provider 支持。

这些不是“漏做完两周计划”，而是仍位于后续产品阶段。优先级以 [路线图](roadmap.md) 为准。

## 何时新增决策

只有满足以下任一情况才追加：

- 当前产品原则或阶段顺序发生改变。
- 代码采用了与架构文档不同且会影响后续开发的边界。
- 一个已承诺能力被取消、显著缩小或延期。
- 新依赖、Provider、网站或数据边界改变了维护/隐私成本。

普通实现细节、每日进度和临时 bug 不写入本文件。
