# V2 当前状态

状态日期：2026-09-08。V2 是开发中的本地产品，不是已发布版本。

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

以上属于 code complete。Stage 1 SEEK 基础交互和 Stage 2 的两份不同用途 CV、Visa、课表、独立项目 Markdown、敏感资料下钻、追问/续跑、失败恢复与首个材料链路已经经过作者真实走查。

## 2. 本轮架构收敛

候选人数据现在只有一条运行路径：

```text
Source + extracted text
  → Claims / chunks / original
  → Agent-owned retrieval and reasoning
  → analysis / materials
```

已删除未上线的 CandidateProfile/EvidenceRecord schema、SQLite 表、API、编辑 UI、浏览器备份、CLI import/render、示例 JSON、材料 fallback 和绑定旧工具轨迹的 evaluation runner。数据库升级为 schema v7：保留用户已上传 Sources，清除旧 Agent runs/application snapshots 与高敏感来源的 identity/contact Claims。

Agent 当前四个工具：

- `get_candidate_claims`
- `search_candidate_documents`
- `open_candidate_source`
- `check_application_history`

`check_work_eligibility`、`check_availability`、`get_candidate_profile` 和 `search_candidate_evidence` 已删除。代码不再强迫某类岗位调用某工具、在模型问题后追加系统问题、把 unknown 改写为 gap，或根据检索路径降级 Agent 推荐。保留的确定性校验只处理 contract consistency、合法来源、隐私和数据完整性。

## 3. Knowledge Base 真实边界

- Source 原件在模型理解前先本地持久化；抽取失败不丢文件。
- 当前上传理解会把完整提取文本发送给配置的 Provider。UI 需要清楚披露，不能声称上传时完全本地处理。
- Claims 是文件绑定的派生检索记录，不是全局 Profile，也不在普通 UI 罗列。
- Agent 自己决定是否先查 Claims、再搜 chunks 或打开原件。普通检索排除高敏感 chunks；Agent 可按 catalogue 中的 source ID 主动读取确切高敏感来源。
- 高敏感来源不索引 identity/contact 与证件标识，只保存任务有用的 rights/conditions/validity 等 Claims。Agent 当前调用可读取所选片段或原文，但 ToolEvent、checkpoint 和 UI 只保留来源与长度等安全摘要，不复制高敏感正文。
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
- 跨岗位复用的用户确认信息；应作为用户批准的 Source-compatible assertion，不复活 Profile 表单。
- 官网来源补全、任意公司当前详情页读取和项目代码来源。
- 跨岗位 requirements/gaps、学习计划、GitHub/LinkedIn 改进和申请复盘。
- 面向朋友的安装、Provider 配置、升级、迁移与恢复体验。
- 最终真实评价、开源整理、展示材料和是否重新上架商店。

## 6. 已知风险

- Qwen 抽取的 Claim key/attributes 是动态输出；不完整关系、同义 key 和错误 classification 只能通过真实材料继续校准，不能靠给 CV 写一套固定表来掩盖。
- FTS5 是词法搜索；Agent 可换 query 或打开指定原件，但同义召回在资料规模增长后可能需要 embedding。没有真实漏召回证据前不增加向量数据库。
- 打开原件会把该 Source 的完整抽取文本发送给 Provider；当前以上传时披露和 Agent 对确切 Source 的主动选择作为边界，不提供逐次读取弹窗。
- material renderer 依赖已抽取 Claims，不能完整保留复杂原 CV 版式；当前输出是第一版 ATS HTML，不是 FlowCV workspace。
- 多 CV 材料生成目前按精确用途标签、否则按最近上传选择基础 CV；模型产生的自由标签不能保证精确命中，进入材料工作区时必须改为显式、可见的基础 CV 选择。
- 本地服务仍需用户配置环境变量并启动进程，朋友还不能无指导使用。

## 7. 当前下一步

Stage 2 已完成并关闭；跨文件冲突与 Resolution 已有 repository、API 和 UI 自动化覆盖，当前真实资料没有产生冲突，因此没有为阶段验收制造虚假冲突。下一开发阶段是 [Stage 3 Jobs/Application Workspace](stage-3-job-application-workspace-plan.md)：先把已经存在的岗位、分析、状态和材料持久化变成可回看的全页面产品工作区，再进入多基础 CV、岗位 variant 与 FlowCV 式材料编辑。不再扩建旧 Profile、专用业务 checker、evaluation 平台或新的硬限制。
