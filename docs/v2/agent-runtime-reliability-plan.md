# Agent Runtime 可靠性计划

状态：执行中。增量 A–D 已完成代码纵切，剩余真实 Qwen/资料校准。本计划是 Stage 2 的横向可靠性增量，优先修复“模型已经工作和计费，但用户拿不到结果”；它不改变 Career Knowledge Base 的 Source-first 产品方向，也不引入第二套 Agent framework。

| 增量 | 当前状态 | 代码事实 |
|---|---|---|
| A. 去重与压缩 | 已完成 | 单次运行保存私有 observation 与精简 ledger；规范化后的相同普通检索复用结果；原文因不进入安全 checkpoint 而允许按需重读；上下文达到模型窗口压力后压缩旧 tool result；PydanticAI 缺失的 Qwen3.7-Plus 窗口元数据按官方 1M 规格补齐 |
| B. 结果优先收尾 | 已完成 | 连续无新信息、压缩后仍有上下文压力或接近框架请求保险丝时，当前 Agent 隐藏检索工具并输出安全结构化结果 |
| C. Checkpoint 与恢复 | 已完成代码纵切 | analysis 启动和每次 ToolEvent 后更新现有 `agent_runs`；失败/中断保存安全错误码；相同岗位与资料 fingerprint 重试时恢复同一 run 和 observation；回答问题时继承上一轮已验证 Ledger |
| D. 自适应检索分页 | 已完成代码纵切 | Claims/chunks 仍在本地全量排序，返回量由模型剩余 context 决定；按 requirement 轮转并返回 `nextCursor`，Agent 可继续到后续页 |
| E. 真实使用校准 | 持续 | 已完成多次真实 Qwen 分析、追问 continuation 和失败 checkpoint 重启恢复；Provider 数组序列化与来源引用别名问题已在工具/输出信任边界正规化，继续依据真实 usage 收敛成本 |

## 1. 用户结果

一次岗位分析应满足：

- 正常情况下返回完整、带来源的判断。
- 信息不足时返回明确的 unknown 和可回答问题，而不是为了追求确定性无限检索。
- 接近运行边界时停止扩张上下文，使用已取得的 observation 生成暂定但可用的结果。
- 网络、Provider 或进程中断后保留已完成检查，后续可以恢复，不必从零重复消费。
- 只有无法形成任何安全结论时才显示失败；失败信息和本地日志必须能说明停在哪一层。

## 2. 当前问题

当前 PydanticAI tool loop 会把此前模型请求和完整工具返回持续带入后续请求。Claims、chunks 和 Profile 结果即使已经被模型理解，仍会在每一轮重复占用上下文；累计 token 因此同时计算多次相同内容。此前的 80k 累计 token 上限又在 Provider 返回并计费后检查，导致已付费结果被丢弃。

紧急修复先移除了累计 token/output、产品总超时和浏览器中止。增量 A–D 随后补上运行期 observation/requirement ledger、完全相同调用去重、按上下文窗口压缩、接近最终保险丝前的 finalization、失败 checkpoint/继续和带 cursor 的自适应检索分页。不同 query 即使暂时零命中也仍是 Agent 主动取得的新 observation，不会被系统当成无进展；只有完全重复调用才进入循环收敛。真实 Qwen 使用已完成失败 checkpoint、进程重启和同一 run 恢复，并暴露、修复了工具数组被编码成字符串及已打开 Source 使用基础 ID 引用导致最终结果被丢弃的问题。当前剩余工作是不建设独立评测平台，继续从日常分析观察重复读取、上下文和费用。

## 3. 设计原则

### Agent 决策与 Runtime 治理分开

Agent 决定检查哪些要求、选择什么工具、如何修改检索表达以及证据何时足够。Runtime 负责上下文、缓存、进度、资源、安全、持久化和恢复。Runtime 不规定固定业务步骤，也不替 Agent 判断岗位是否匹配。

### 结果优先，硬边界只作最后熔断

- 能在请求前判断的边界必须在请求前处理，不能等待已计费响应后再丢弃。
- 软边界触发 context compaction、禁止无效重复和 finalization。
- 最后熔断仍用于防无限循环，但触发后优先用现有 observation 形成 `provisional` 结果。
- 不用一个 token 数同时承担成本、上下文质量和循环检测三种职责。

### 事实状态独立于聊天记录

模型消息是交互记录，不是运行真相。Runtime 保存结构化的 Observation Ledger：工具、规范化参数、结果摘要、完整私有 observation、来源引用、首次/最近序号和是否来自缓存。Requirement coverage 从工具返回逐步形成；找不到只能是 unresolved，不是 absence。

### 自适应上下文，不无限堆叠

- 当前工具返回完整保留一轮，让模型读取新 observation。
- 已进入 Ledger 的旧工具结果在下一轮替换为短引用；动态 runtime instruction 提供去重后的当前 Ledger。
- 优先使用模型 profile 暴露的 context-window 占用比例触发压缩；模型没有窗口元数据时才使用保守的本地字符估算。
- 检索结果逐步演进为按 requirement 的 cursor/coverage；单轮上下文预算不限制本地候选总量。

### 可恢复而不是重跑

每次工具 observation 后持久化 checkpoint。checkpoint 不保存隐藏推理，只保存岗位输入摘要、工具事件、Observation Ledger、usage 和运行状态。恢复时使用这些状态构造新上下文，不重放已完成的外部调用。

## 4. 目标运行状态

```text
planning
   ↓
observing ↔ tool call → update ledger/checkpoint
   │                    ├─ duplicate ordinary query → reuse
   │                    ├─ deliberate original read → local re-read, no full-text checkpoint
   │                    └─ no new information → mark no-progress
   ↓
context pressure / no progress / enough evidence
   ↓
finalizing（停止扩张检索，只基于 Ledger 生成结果）
   ├─ completed
   ├─ provisional（有未知项但可用）
   └─ failed（没有任何安全结果，保留 checkpoint）
```

`provisional` 不是低质量成功伪装：它必须说明哪些要求已核验、哪些仍未知、使用了哪些来源，以及用户可以回答什么或如何继续。

## 5. 实施增量

### A. 去重 Ledger 与上下文压缩

- 在现有 `AgentDependencies` 内增加单次运行的 Observation Ledger，不新增服务或数据库表。
- 为确定性只读工具建立规范化调用签名；相同普通检索复用首次 observation，不再次执行完整查询。原文全文不写入安全 checkpoint，需要恢复或上下文压缩后再次读取时从本地 Source 重读。
- 使用 PydanticAI `ProcessHistory` 在模型上下文进入压力区间后压缩已经进入 Ledger 的旧 tool results，只保留最新 observation 原文；模型没有 context-window 元数据时不凭空猜窗口大小。
- 使用动态 instructions 把去重 Ledger 注入当前请求；不把它发送给浏览器或当作 chain-of-thought。
- 记录缓存命中、压缩前后估算大小和 requirement coverage 到服务日志。

完成条件：重复工具调用不会再次返回大段内容；多轮分析的后续请求上下文不再线性重复全部旧 tool result；既有引用和输出校验仍通过。

### B. Result-first finalization

- 保留宽松的请求次数熔断作为最后保险，不再恢复累计 token 熔断。
- 在 context pressure、连续无进展或请求熔断前进入 finalizing。
- finalizing 仍在同一个 Agent run 内进行：Runtime 隐藏 function tools，只保留原有结构化输出与安全 validator；它不是第二个自主 Agent。
- finalizer 必须允许输出 informational unknown；是否产生 clarification 由同一 Agent 按其答案能否改变推荐或下一步判断，系统不为 unknown 自动撰写问题。不得为了返回结果放松 evidence、work-right 和 hard-blocker 材料安全规则。
- 若主 loop 已经产生合法最终结果，永远优先返回该结果。

完成条件：构造一个持续重复工具的测试场景时，API 返回 completed/provisional recommendation，而不是 `AGENT_STEP_LIMIT`。

### C. Checkpoint 与恢复

- analysis ID 在运行开始前生成；岗位 snapshot 和 processing run 先写入 SQLite。
- 每次 ToolEvent 后更新同一 run checkpoint，完成时原子写入最终 response。
- 失败 run 保留错误类别、最后安全阶段和可恢复状态，不保存 API Key、私人完整 prompt 或隐藏推理。
- Job 页面为可恢复 run 提供“继续分析”，恢复时复用 Ledger，不能重新执行相同工具调用。
- clarification continuation 继承上一轮已验证 observation；只有 Candidate fingerprint 未变化时才复用，资料改变后不得沿用旧来源。

完成条件：在至少一次工具返回后主动中断服务，重启后能从 checkpoint 继续并得到结果。

### D. 自适应检索上下文

- 将固定共享字符预算改为由模型 context window、当前上下文占用、requirement 数量和最终回答预留共同决定。
- 每个 requirement 返回 coverage、candidate count、当前 page 和 continuation cursor。
- Agent 只对未覆盖、高影响或截断的 requirement 继续取下一页或打开 parent/original。
- 完全相同的工具和参数被连续重复时进入 no-progress；不同 query、不同 source 或后续 cursor 属于 Agent 的新观察，即使零命中也不由系统提前夺走工具选择。

完成条件：资料数量增加时不会因全量注入超出模型窗口；目标证据在后续页时 Agent 可继续找到；没有证据时能及时转为 unknown。

### E. 真实使用校准

- 仅使用现有 run usage、工具路径、缓存命中、压缩比例、finalization 原因和失败类别做校准。
- 先观察作者真实岗位；有足够样本后再确定软阈值和最后熔断，不建设独立 evaluation 平台。
- 优化顺序是减少重复上下文和无进展调用，再考虑模型路由或更便宜的模型。

完成条件：能解释典型分析的 token 花在哪里，且边界值来源于真实分布而非拍脑袋。

## 6. 当前执行顺序与非目标

A–D 已完成代码纵切；自动化覆盖重复 observation、上下文压力、checkpoint 复用和 cursor 继续。Stage 2 已增加 Agent 按需打开指定原件，并删除会强迫业务路径的专用 checker/validator。下一步是 E：用当前 Qwen、真实岗位和真实资料验证，再依据日志调整软策略；可靠性策略不得重写 Agent 的推荐、unknown 或追问。

本计划不引入 LangGraph、多 Agent、外部队列、向量数据库、云端 telemetry 或按天排期。只有现有 PydanticAI capability、ToolEvent 和 SQLite 边界被证明不能支撑时，才重新评估基础设施。
