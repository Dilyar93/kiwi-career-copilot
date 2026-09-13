# V2 当前状态

状态：V2 是开发版本，当前依赖本机服务；未来发布形态尚未确定，也不是已发布版本。

## 1. 当前可用纵切

- V1 SEEK 列表负向筛选、隐藏岗位、通勤和页面增强继续可用；Trade Me 已从运行代码移除。
- Side Panel 会随当前 SEEK tab/详情变化主动同步，Current Job 位于 Job 区域，筛选能力位于 Search 区域。
- 本地 Agent 服务使用 PydanticAI + Alibaba Qwen3.7-Plus，绑定 loopback 并校验 token 与扩展 identity/origin。
- Job Agent 能读取安全的 Library catalogue，自主选择 Claims、chunks、指定原件和申请历史工具；没有系统强制的 work-right/availability/evidence workflow。
- 分析支持安全进度事件、结构化结论、Agent 自己提出的 clarification、回答后 continuation、checkpoint/resume 和 usage/tool summary 日志。
- Career Library 可上传 PDF、DOCX、TXT、Markdown，自动分类、摘要、切片和提取 Source-bound Claims；卡片保持紧凑，内部 Claims 不再铺给用户逐条审核。
- 文件可修正类型/用途/敏感度、重新理解、打开原件和单份删除；只有处理失败或真实排他冲突进入 Review Inbox。
- Analysis 完成且至少一种材料可用时，可从 ready CV Source 生成 Agent 允许的 ATS HTML CV、Cover Letter 或两者；Side Panel 只显示材料摘要，完整尺寸预览、当前 Cover Letter 编辑和下载位于独立扩展标签页。
- SQLite 保存 Sources、chunks/Claims/Resolutions、岗位、分析、材料 snapshot 和申请状态；Library 可从 UI 整体清空。

以上属于 code complete。Stage 1 SEEK 基础交互和 Stage 2 的两份不同用途 CV、Visa、课表、独立项目 Markdown、敏感资料下钻、追问/续跑、失败恢复与首个材料链路已经达到作者范围的 product complete，并经过作者真实走查；尚未完成未参与开发用户的独立验证或 V2 发布验证。

## 2. 本轮架构收敛

候选人数据现在只有一条运行路径：

```text
Source + extracted text
  → Claims / chunks / original
  → Agent-owned retrieval and reasoning
  → analysis / materials
```

已删除未上线的 CandidateProfile/EvidenceRecord schema、SQLite 表、API、编辑 UI、浏览器备份、CLI import/render、示例 JSON、材料 fallback 和绑定旧工具轨迹的 evaluation runner。数据库升级为 schema v8：保留用户已上传 Sources，清除适用旧版本中的 Agent runs/application snapshots，并清理高敏感来源遗留的 identity/contact Claims 及相关 conflict resolutions。

Agent 当前四个工具：

- `get_candidate_claims`
- `search_candidate_documents`
- `open_candidate_source`
- `check_application_history`

`check_work_eligibility`、`check_availability`、`get_candidate_profile` 和 `search_candidate_evidence` 已删除。代码不再强迫某类岗位调用某工具、在模型问题后追加系统问题、把 unknown 改写为 gap，或根据检索路径降级 Agent 推荐。保留的确定性校验只处理 hard blocker 与材料动作的安全一致性、clarification questions 去重、候选资料来源引用、隐私和数据完整性。

`Recommendation.termination_reason` 当前仅作为兼容字段保留，不是 UI、clarification continuation 或材料动作的状态来源；这些流程以具体的问题、blocker 和 action 字段为准。该字段已经写入 SQLite 中的分析记录，同时是 Python Pydantic 与前端 Zod 严格 schema 的一部分。只有在一次协调的 API/schema 迁移中同步处理既有记录、服务端模型、前端 schema 和测试 fixture 时才删除，不为单个字段单独展开迁移。

## 3. Knowledge Base 真实边界

- 文件先经过大小、格式和确定性解析校验；失败输入不会入库。解析成功后，Source 原件、全文与 chunks 在模型理解前先本地持久化；后续模型理解失败不丢失已入库文件。
- 当前上传理解会把完整提取文本发送给配置的 Provider。UI 需要清楚披露，不能声称上传时完全本地处理。
- Claims 是文件绑定的派生检索记录，不是全局 Profile，也不在普通 UI 罗列。
- Agent 自己决定是否先查 Claims、再搜 chunks 或打开原件。普通检索排除高敏感 chunks；Agent 可按 catalogue 中的 source ID 主动读取确切高敏感来源。
- 高敏感来源的导入 contract 要求模型不提取 identity/contact 与证件标识，并只生成任务有用的 rights/conditions/validity 等 Claims；服务端确定性排除 identity/contact categories，其余更宽的语义范围仍依赖模型遵守 contract。Agent 当前调用可读取所选片段或原文，但 ToolEvent、checkpoint 和 UI 只保留来源与长度等安全摘要，不复制高敏感正文。
- 本地 Claim/chunk 搜索使用去 stop-word 的精确 token/FTS5；分页根据剩余 context 动态计算并提供 cursor，不存在全局“最多 40 Claims”或“两次检索”业务上限。
- Claim 抽取由模型按来源结构产生完整逻辑记录和动态 attributes；代码只验证 sourceText 能回到原文。跨文件语义 key 稳定性和深层冲突识别仍依赖模型质量，需要真实多 CV 校准。

## 4. 当前 UI 状态

- 四个一级区域为 Job、Library、Search、Settings。
- Library 首屏只有明确上传入口、需要处理 inbox、紧凑 Source cards 和折叠的数据重置；没有 Manual details、Facts/Experience tabs 或 Claims 清单。
- Source card 限制为横向紧凑结构，文件名和摘要单行截断；点击进入独立详情，删除按钮 hover 不改变尺寸。
- 上传期间显示文件名、spinner 和“已保存后正在理解”的持续状态。
- Job 分析把进度放在当前操作附近；完成后的工具动作默认收进解释详情，不展示隐藏思维。
- 生成申请材料后从 Side Panel 打开独立 `Application materials` 页面；该页面从 SQLite 中的 analysis snapshot 恢复，不在窄侧栏内嵌完整 CV。
- Settings 同类 section 使用一致标题层级；高级诊断和危险操作默认折叠。

## 5. 尚未完成

### 后续产品阶段

- Jobs/Application workspace、截止日期、岗位回看和状态队列。
- FlowCV 风格结构化 CV 编辑、实时预览、章节排序/显隐、多个基础 CV、岗位 variants 和 diff approval。
- Cover Letter 版本、编辑持久化、恢复与批准流程。
- 可复用的高风险 Claim 分级、确认状态和跨岗位用户 assertion；当前 Library 只有来源冲突 Resolution，决策关键但证据不足的信息只通过岗位 clarification 处理。未来若实现，应使用用户批准的 Source-compatible assertion，不复活 Profile 表单。
- 官网来源补全、任意公司当前详情页读取和项目代码来源。
- 跨岗位 requirements/gaps、学习计划、GitHub/LinkedIn 改进和申请复盘。
- 面向朋友的安装、Provider 配置、升级、迁移与恢复体验。
- 最终真实评价、开源整理、Stage 7 展示/发布材料更新和是否重新上架商店；现有 `docs/showcase/` 是 Stage 2 结束时冻结的实习作品集快照。

## 6. 已知风险

- Qwen 抽取的 Claim key/attributes 是动态输出；不完整关系、同义 key 和错误 classification 只能通过真实材料继续校准，不能靠给 CV 写一套固定表来掩盖。
- FTS5 是词法搜索；Agent 可换 query 或打开指定原件，但同义召回在资料规模增长后可能需要 embedding。没有真实漏召回证据前不增加向量数据库。
- 打开原件会把该 Source 的完整抽取文本发送给 Provider；当前以上传时披露和 Agent 对确切 Source 的主动选择作为边界，不提供逐次读取弹窗。
- 将既有来源改为高敏感会清理活动 Claim 索引并阻止后续读取 identity/contact categories，但不会追溯删除修改前已完成的分析或材料 snapshot；若敏感度设置需要承担历史数据撤回语义，必须设计明确、可确认的删除流程。
- material renderer 依赖已抽取 Claims，不能完整保留复杂原 CV 版式；当前输出是第一版 ATS HTML，不是 FlowCV workspace。
- 多 CV 材料生成目前按精确用途标签、否则按最近上传选择基础 CV；模型产生的自由标签不能保证精确命中，进入材料工作区时必须改为显式、可见的基础 CV 选择。
- Runtime 去重、上下文压缩、result-first finalization、checkpoint/resume 和自适应分页已完成代码纵切，但软策略只经过有限的真实 Qwen runs；继续使用现有 usage、缓存命中、压缩比例和失败类别做日常校准，不把它作为独立阶段或另建 evaluation 平台。
- 本地服务仍需用户配置环境变量并启动进程，朋友还不能无指导使用。

## 7. 当前下一步

Stage 2 已完成并关闭；跨文件冲突与 Resolution 已有 repository、API 和 UI 自动化覆盖，当前真实资料没有产生冲突，因此没有为阶段验收制造虚假冲突。下一开发阶段是 [Stage 3 Jobs/Application Workspace](stage-3-job-application-workspace-plan.md)：先把已经存在的岗位、分析、状态和材料持久化变成可回看的全页面产品工作区，再进入多基础 CV、岗位 variant 与 FlowCV 式材料编辑。不再扩建旧 Profile、专用业务 checker、evaluation 平台或新的硬限制。
