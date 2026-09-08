# Stage 3 实施计划：Jobs/Application Workspace

状态：下一开发阶段。Stage 2 完成项目文档 smoke test 后开始实施。

## 1. 用户结果

用户分析一个岗位后，不再只能依赖当前 SEEK 页面或浏览器缓存找到结果。Kiwi 提供一个可长期打开的全页面工作区，让用户查看所有已分析岗位、理解当前状态、恢复分析或材料，并知道接下来何时做什么。

完成后，用户应能：

- 离开 SEEK 后仍找到此前分析过的岗位。
- 按状态和截止日期找到需要优先处理的岗位。
- 打开岗位详情，查看最新建议、关键依据、下一步和已有材料。
- 从同一岗位回到 SEEK/申请入口，或继续准备和查看材料。
- 重新分析同一岗位而不生成第二个重复岗位。

## 2. 产品边界

### Side Panel

Side Panel 继续是当前网页 companion，只处理：

- 当前 SEEK 岗位同步与分析。
- Agent 追问和当前最重要动作。
- 快速保存状态、准备材料或打开完整工作区。

### Full-page Workspace

长期对象进入独立扩展页面：

```text
Workspace
├─ Jobs：已分析岗位、状态、截止日期和筛选
└─ Job detail：最新分析、关键依据、下一步、材料和历史
```

Stage 3 不提前显示空的 CV、Career 或 Analytics 导航。Stage 4 在同一全页面壳中加入 Materials/CV workspace。

## 3. 当前可复用代码事实

- `jobs` 已保存完整 `JobPosting` snapshot。
- `agent_runs` 已保存分析、工具摘要、usage、checkpoint 和最终 response。
- `applications` 已按稳定 job identity 聚合 analysis IDs、状态和材料 snapshots。
- 已有 `GET /v1/applications`、`PATCH /v1/applications/{id}`、`GET /v1/analyses/{id}` 和材料读取 API。
- Side Panel 已能建立稳定岗位 identity、缓存当前结果并打开全页面材料。

Stage 3 应扩展这些边界，不创建第二套岗位数据库、浏览器端长期真相或状态机框架。SQLite 是工作区权威数据；浏览器 storage 只保留当前页面快速恢复缓存。

## 4. 信息与状态模型

### Job workspace record

列表和详情至少需要：

- job identity、标题、公司、地点、canonical/application URL。
- employment type、posted/closes date 及原始文本。
- 最新 recommendation、fit、readiness 和一句关键原因。
- 当前状态、最新 analysis ID、analysis 数量、material 是否存在和更新时间。

优先从现有 `jobs + applications + agent_runs` 组合读取；没有证明查询量或迁移需求前，不复制成新表。

### 状态语义

- `Analysed`：系统已完成分析，尚无用户承诺。
- `Maybe`：用户希望稍后比较或补充信息，是可操作队列。
- `Preparing`：已经生成材料，系统自动进入。
- `Applied`：用户确认已提交，用于回看和后续结果。
- `Skipped`：用户明确不申请，但保留判断记录。
- `Archived`：从活跃列表隐藏，不等于删除。

状态必须影响列表分组、筛选或下一步；不再把无用途的状态按钮平铺在当前岗位页。

### 截止日期

SEEK 已提取的日期直接显示并保留来源。缺失时显示 `Unknown`，允许用户显式补充或修正；系统不得把模型猜测写成确定日期。外部官网补全属于后续 Job Enrichment。

## 5. 主要交互

### 入口

- Side Panel 的完成结果提供 `Open workspace`。
- 已生成材料继续直接提供 `Open materials`；二者不是互斥入口。
- Workspace 使用独立 extension tab，可刷新、复制 URL 并从 SQLite 恢复。

### Jobs list

- 默认显示活跃岗位，按截止日期紧迫度和更新时间排序。
- 支持最小必要的状态筛选和文本搜索。
- 每行只显示岗位身份、状态、推荐、截止日期、更新时间和材料标记。
- 空状态解释如何从 SEEK 分析第一个岗位。

### Job detail

- 首屏先显示岗位、状态、推荐和下一步。
- 展开查看 blockers、matches、gaps、unknowns 和来源。
- 显示最新材料并打开材料页；没有材料时按 analysis action 提供准备入口。
- 提供原岗位和申请入口。
- 历史分析只显示时间和结论摘要，用户主动选择后再展开。

## 6. Agent-native 与数据边界

- Workspace 展示和组织已经产生的 Agent 结论，不重新用代码解释岗位语义。
- 排序可使用确定日期和用户状态；不得根据职位关键词生成业务优先级。
- 同一岗位 identity 负责去重，重新分析追加 run 并更新 latest，不覆盖历史。
- Agent 的 clarification answers 仍绑定对应 run。跨岗位可复用回答后续应由 Agent 提议、用户确认，再保存为 Source-compatible user assertion；Stage 3 工作区不通过隐式复制完成它。
- 删除私人数据、改变 Library 和最终提交仍需要明确用户动作。

## 7. 实施增量

### A. Workspace read model

- 扩展 application list response，组合岗位显示信息、最新 recommendation、截止日期和材料状态。
- 增加读取单个 workspace job detail 的 API，复用现有 analysis/material repository。
- 明确浏览器 storage 不是工作区权威来源。

完成条件：不用读取浏览器当前 tab，也能从 API 完整展示岗位列表和一个岗位详情。

### B. Full-page shell 与 Jobs list

- 新增独立 workspace entrypoint，复用当前视觉 token、Agent 连接和本地 API client。
- 实现 loading、empty、error、筛选和基础响应式布局。
- Side Panel 增加清楚的工作区入口。

完成条件：关闭 SEEK 后仍可打开工作区并找到真实已分析岗位。

### C. Job detail 与行动

- 展示最新分析、状态、截止日期、来源摘要、材料和外部链接。
- 支持 Maybe、Applied、Skipped、Archived 和截止日期修正。
- 支持打开既有材料；需要重新分析时引导回岗位，不伪造离线最新 JD。

完成条件：用户可以从一个页面理解并推进岗位，不需要回忆每个状态按钮的意义。

### D. 恢复与产品走查

- 验证同一岗位多次分析、材料生成、扩展重载和服务重启后的归属关系。
- 使用至少三个真实岗位覆盖：有截止日期、无截止日期、有材料。
- 修正文案、空状态、错误恢复和窄/宽窗口交互。

完成条件：真实岗位列表、详情、状态、材料恢复和外部入口完成一次端到端走查。

## 8. Stage 3 退出条件

- 用户离开 SEEK 后仍能找到、理解并继续此前岗位。
- 同一岗位的多个分析、材料和状态归属清楚，不产生重复岗位。
- 状态能驱动真实队列和筛选，不是孤立元数据。
- 已知/未知截止日期表达清楚，用户修正可持久化。
- 全页面工作区刷新、扩展重载和本地服务重启后均可恢复。
- Side Panel 保持当前岗位 companion，没有被长期列表和编辑器重新塞满。

## 9. 当前不做

- 任意公司网站详情读取和自动官网搜索。
- FlowCV 式 CV 编辑、variant diff 和可靠 PDF 分页；这些属于 Stage 4。
- 跨岗位 gap 聚合、学习计划、GitHub/LinkedIn coach。
- 云同步、账号系统、协作和自动提交申请。
- 新 Agent framework、向量数据库、复杂事件总线或独立 evaluation 平台。
