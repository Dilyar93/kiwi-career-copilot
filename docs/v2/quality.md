# V2 质量策略

## 当前原则

当前产品阶段不建设新的 evaluation 项目。质量工作分成两类：

1. **持续工程检查**：每次改动都要做，防止回归和数据/安全错误。
2. **最终产品评价**：产品主要旅程完成后再做，用于判断真实效果、成本和发布准备。

“不优先做 evaluation”不等于跳过测试，也不等于允许 Agent 编造事实。

## 持续工程检查

按改动范围选择最小充分集合：

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
.venv/bin/pytest agent_service -q
corepack pnpm build
corepack pnpm test:e2e
```

- 纯文档改动检查链接、路径和事实即可。
- 领域逻辑或 schema 改动必须有最小自动化回归。
- 浏览器/DOM 生命周期改动运行相关 fixture/E2E。
- API、repository、Agent 工具或材料安全改动运行 Python tests。
- 发布前再运行完整构建与 E2E。

文档不长期写死测试数量；数量变化不等于覆盖质量变化。

## 当前保留的最小数据

现有分析记录中的以下字段足够支持开发诊断和未来成本复盘：

- model/Provider 标识。
- prompt version。
- created time、model/tool call usage 和 token usage。
- 安全的 tool arguments/result summary。
- recommendation、finding、next actions 和错误响应。

产品重设计时，仅在明确要回答某个问题时增加最小事件，例如首次设置是否完成、核心动作是否失败。不要预先搭建 telemetry 平台、dashboard 或云端用户追踪。

## 当前不投入的工作

- 扩大合成案例数量。
- 重复运行多模型 benchmark。
- 为面试生成漂亮的评测报告。
- 在真实资料与交互尚未可用时优化离线百分比。
- 为了证明“是 Agent”而让所有场景调用更多工具。

旧的 Profile/Evidence 合成 evaluation runner 与 cases 已删除，因为它们会把过期工具路径固化为正确答案。当前只保留最小本地 FunctionModel contract tests；收尾阶段基于届时产品重新设计真实评价样本。

## 收尾阶段的最终评价

到 [路线图阶段 7](roadmap.md#阶段-7最终验证与发布) 再按真实产品需要确定样本和指标，至少关注：

- hard blocker 和 unknown 是否被正确处理。
- 推荐是否与事实和用户判断一致。
- CV/Cover Letter 是否出现 unsupported claim。
- 用户实际保留、修改或拒绝了哪些建议。
- 从打开岗位到准备好材料的真实耗时。
- 单次分析成本、失败率和恢复体验。
- 新用户能否独立安装、建档并完成首个任务。

结果应同时报告样本、失败案例和限制，不只给百分比。作品展示和商店材料只能引用已经复现的结论。
