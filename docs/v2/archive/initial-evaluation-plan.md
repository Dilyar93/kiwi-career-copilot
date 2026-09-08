# V2 Agent Evaluation 方案

## 1. 评测目标

评测不是为了证明模型“聪明”，而是回答四个产品问题：

1. Agent 是否识别了会改变申请决定的硬条件？
2. Agent 是否真的根据 observation 改变工具和行动路径？
3. 生成材料是否只使用候选人的真实 evidence？
4. 工具是否让真实申请更快、更一致，而不是只增加步骤？

## 2. 三层验证

### 2.1 Deterministic tests

适用于：

- SEEK fixtures 和 `JobPosting` 提取。
- Work-right、availability、date parsing。
- Job identity 和 duplicate application。
- Candidate/Evidence schema。
- Evidence ID validation。
- CV rendering snapshot 中不存在未选择内容。
- API token、Origin、body limit 和错误处理。

这些测试不调用真实 LLM。

### 2.2 Agent evaluation

对匿名化 `JobPosting`、Candidate snapshot 和人工 ground truth 运行真实模型，记录最终结果和完整 tool events。

至少覆盖：

- Citizenship/PR 或 work-right hard blocker。
- 学期时长/工时冲突。
- 已申请或重复岗位。
- 高匹配、evidence 充分。
- 高匹配但缺少 portfolio evidence。
- 有少量短期可补 gap。
- 长期能力差距。
- 缺少截止日期或其他关键信息。
- JD 要求 Candidate 没有的技能。
- JD 中含有类似指令的非可信文本，用于 prompt-injection 防护。

### 2.3 Live pilot

用项目作者的真实 SEEK 使用过程验证：

- 至少分析 5 个真实岗位。
- 至少为 1 个真实岗位生成并人工审核材料。
- 记录人工分析耗时与使用工具后的耗时。
- 记录生成 CV/cover letter 的实际修改量。
- 记录 Agent 建议是否改变了申请、补强或跳过决定。

## 3. Dataset 结构

建议每个 case 使用一个目录或一条 JSON record：

```json
{
  "case_id": "work_rights_blocker_01",
  "job": {},
  "candidate_snapshot_id": "candidate-example-v1",
  "expected": {
    "recommendation": "SKIP",
    "hard_blockers": ["citizen_or_pr_only"],
    "must_call_tools": [
      "check_application_history",
      "check_work_eligibility"
    ],
    "must_not_generate_materials": true,
    "relevant_evidence_ids": [],
    "forbidden_candidate_claims": []
  }
}
```

规则：

- 先写人工 expected，再运行 Agent，避免按结果倒推 ground truth。
- 真实 JD 必须匿名化公司敏感信息和用户数据，但保留影响判断的要求。
- Candidate snapshot 必须版本化，防止后来增加 evidence 改写历史评测含义。
- Prompt/model/tool 版本必须随结果保存。

两周最低 12 个 case，建议分布：

| 类型 | 数量 |
|---|---:|
| Hard blocker | 3 |
| Availability/日期冲突 | 2 |
| Apply，高 evidence | 3 |
| Evidence/portfolio gap | 2 |
| Unknown/需要澄清 | 2 |

有时间扩展到 20 个，但不为了数量复制相似 case。

## 4. 核心指标

### 4.1 Hard Blocker Recall

```text
正确识别的人工 hard blockers / 人工 hard blockers 总数
```

Hard blocker 漏判比多报一个 `uncertain` 更严重。小样本必须报告 `6/6`，不能只写 `100%`。

### 4.2 Recommendation Agreement

```text
与人工 Apply/Maybe/Skip 相同的 cases / cases 总数
```

同时保存 disagreement 列表，判断是 Agent 错误、ground truth 不稳定还是信息不足。

### 4.3 Requirement Extraction Coverage

人工标出的关键 hard/preferred requirements 中，Agent 找到了多少。只评估会影响 decision、evidence selection 或 next action 的要求，不追求抽取所有句子。

### 4.4 Evidence Precision

```text
真正支持生成 claim 的 evidence references / 所有 evidence references
```

由人工审核 entailment。引用了存在的 ID 但其内容不支持 claim，仍然算错误。

### 4.5 Unsupported Candidate Claim Rate

```text
无充分 evidence 支持的候选人 claims / 所有候选人 claims
```

目标为 `0/N`。这必须通过程序 ID 校验和人工语义审核共同确认，不能因为输出带 citation 就自动记为零。

### 4.6 Tool Path Appropriateness

逐 case 检查：

- 必须工具是否被调用。
- 无必要的昂贵工具是否被调用。
- Tool result 是否改变了下一步。
- Hard blocker 后是否及时停止。
- Unknown 是否触发 clarification 或保守结论。

不要求 Agent 的工具顺序与人工完全一致，只要求结果充分、安全且路径合理。

### 4.7 Practical Utility

真实 pilot 记录：

- 从打开岗位到形成申请决定的用时。
- 从决定申请到得到可提交材料的用时。
- CV/cover letter 人工修改字符数或修改段落数。
- 每个岗位的模型调用次数、token 和估算成本。
- 因重复申请、hard blocker 或明显低匹配而节省的无效准备次数。

## 5. Agent-first 验收

以下必须通过：

### Path diversity

至少观察到三条不同路径，例如：

```text
history → work rights → SKIP

history → profile → evidence search → APPLY

history → profile → availability → clarification → MAYBE
```

### Re-planning

至少一个 case 证明 tool observation 改变后续行为。例如把 work-right tool fixture 从 `compatible` 改为 `incompatible`，Agent 应停止 evidence/CV 路径并改变 recommendation。

### Early termination

Hard blocker case 不继续生成 CV change plan 或 cover letter。

### Unknown handling

缺失 deadline、hours 或 work-right requirement 时不能编造值；必须输出 unknown、clarification 或未来 research action。

### No hidden fixed workflow

如果 runner 发现所有 case 的工具集合和顺序完全相同，则 Agent-first 验收失败，即使 recommendation agreement 很高。

## 6. 材料评测

每份 CV variant 检查：

- 所有技能均存在于 Candidate Profile/Evidence。
- 所有 experience/project bullet 均有 evidence ID。
- 所有数字、百分比、规模和结果均有明确来源。
- 岗位关键词的使用不改变事实含义。
- Change Plan 与最终 CV snapshot 一致。
- 未选中的 Master Data 没有意外出现。
- HTML 语义和打印结果可读。

每份 cover letter 检查：

- 公司、岗位名称和来源正确。
- 动机与岗位相关，但不假装知道未知公司事实。
- 候选人经历可追踪。
- 已知 gap 没有被改写成已有经验。
- 不包含占位符、提示词或内部 evidence ID。

## 7. 可重复性

Evaluation runner 必须保存：

```text
run_id
timestamp
git/app version
model/provider
model settings
prompt version
tool schema version
candidate snapshot version
case id
tool events
structured output
latency
usage
score details
```

随机性无法完全消除，因此：

- 调试时先使用一次运行快速反馈。
- 发布评测对关键 case 可运行 3 次，报告一致性。
- 模型或 prompt 改动后运行同一数据集比较，而不是更换成更容易的 cases。

## 8. 结果报告模板

README 或面试材料使用真实数字填写：

```text
Dataset: __ anonymized jobs
Hard blockers: __/__ correctly identified
Recommendation agreement: __/__
Evidence references supported: __/__
Unsupported candidate claims: __/__
Distinct tool paths observed: __
Median analysis time: before __ / after __
Median application-material time: before __ / after __
Model cost per analysed job: __
```

不得预先填写漂亮数字，也不得把模型自评当成人工 ground truth。

## 9. 面试演示脚本

准备三个短 case，而不是展示所有页面：

1. Hard blocker：Agent 调用 eligibility 后提前停止。
2. High fit：Agent 搜索多个 evidence，生成岗位 CV 和 cover letter。
3. Missing information：Agent 输出 unknown/clarification；未来版本可按需查公司官网。

最后展示 evaluation report 和一次真实申请时间对比。讲解重点按以下顺序：

```text
Problem → Agent decision loop → deterministic tools
→ evidence safety → evaluation → real result → known limits
```
