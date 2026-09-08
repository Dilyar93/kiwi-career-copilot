# Stage 2 实施计划：Career Knowledge Base

状态：已完成。本文作为 Stage 2 实施与验证记录保留；CV workspace、代码仓库导入和语义检索不属于 Stage 2 退出条件。

## 1. 用户结果

用户不再先填写一套内部数据表，而是把已有职业资料交给 Kiwi：多份 CV、Visa、证书和项目文档等。Kiwi 自动理解、分类和组织这些来源，只在真实冲突、处理失败或即将产生无来源对外声明时要求确认。

最终用户应能：

- 在一个资料库中保存并区分多份 CV 和其他职业资料。
- 在文件卡片上看懂每份资料的用途、处理状态、敏感程度和概要。
- 让 Agent 先使用结构化事实，必要时搜索片段、打开章节或回到原件。
- 看见结论和材料中的事实来自哪个文件、页面、章节或代码路径。
- 保留 Professional、Part-time、Summer 和岗位定制 CV，不被合并覆盖。
- 默认不审核抽取结果，只处理真正影响任务的冲突和高风险 review items。

## 2. 已确认的产品原则

### Source-first

- 原始来源是最终可回查依据；结构化事实是用于查询的派生层，不取代原件。
- 每条抽取 Claim 必须属于一个 Source 并带原文定位；不存在脱离来源、覆盖所有文件的全局 Fact。
- 跨文件只建立 Claim Cluster 和 Resolution，不把不同用途 CV 压平成一份 Profile。
- 上传时保存尽可能完整，首次理解抓取常用重点，每次任务只披露必要信息。
- 结构化信息不足、冲突或需要核验时，Agent 可以逐层读取更深内容。
- 一份资料没有提到某项经历，不等于用户不具备该经历。

### Agent-native，但不把所有步骤模型化

- 普通代码负责文件校验、哈希、解析、切片、索引、权限和持久化。
- Agent 负责判断资料用途、需要哪些事实、是否继续检索、何时打开原文以及问什么问题。
- 文件类型和用途可以自动建议，但用户始终能修正。
- 不公开或伪造模型隐藏思维；展示的是处理状态、工具动作、来源和结果。

### 默认零审核，异常驱动

- 成功解析和有原文支持的 Claim 自动进入来源索引，不要求用户逐条勾选。
- 文件之间的缺席、措辞、排序和用途差异不是冲突。
- 只有同一语义事实在相同时间/范围内不能同时成立，才建立 conflict review item。
- 低置信信息先保留为未知；只有任务真正需要时才回查或询问。
- 用户确认形成独立 Resolution，不修改原文件，也不删除历史 Claim。

### 完整产品体验与最小实现复杂度并存

- “简单实现”不能成为简陋交互、数据丢失或大量手工校对的理由。
- “现代”不等于默认引入 GraphRAG、多 Agent、分布式队列或外部向量数据库。
- 先在当前 FastAPI、SQLite、PydanticAI 和 React 边界内完成完整纵切；只有现有边界被真实数据证明不足时才增加基础设施。

## 3. 启动本计划时的实现与目标差距

本计划启动时的代码是 Profile-first：只接受 PDF/DOCX/TXT CV，模型将内容压入固定 Profile/Evidence 建议，用户再进入三步表单确认；原件虽已保存，但只提供逐行关键词检索。当前进度以第 9 节为准。

需要改变为：

| 当前 | 目标 |
|---|---|
| “导入现有 CV” | “添加职业资料” |
| 文件依附于 Candidate Profile | Source 可以在 Profile 建立前独立存在 |
| 固定 CV 抽取 schema | 先识别用途，再提取绑定该 Source 和原文位置的 Claims |
| 用户逐项重建或确认资料 | 默认自动入库，只把真实冲突送入 review inbox |
| 单层原文行搜索 | Claim → chunk → parent section → original source |
| 多份 CV 被合并为同一 Profile | 多份 CV 是独立 source/artifact variant |
| 已确认 Evidence 才可参与分析 | source-backed 可用于有引用的分析；高风险和对外新声明需要确认 |

## 4. 目标信息模型

这些是产品概念，不要求每个概念立即对应独立服务或复杂表结构。

### Source

不可变的上传来源和当前处理状态：

- 文件 ID、SHA-256、原文件名、媒体类型、大小和导入时间。
- `kind`：CV、Visa、project、certificate、education、portfolio、other。
- `purpose tags`：professional、part-time、summer、work-rights、project-evidence 等。
- 敏感等级、语言、时间范围、关联项目/组织。
- `processing / ready / needs-attention / failed` 状态和可理解的错误。
- 原始内容、完整提取文本、解析器和分析版本。

### Chunk

可检索、可回到原文的内容单元：

- source、顺序、页码、章节标题、代码路径和字符范围。
- 精确 child chunk 及其 parent section。
- 原文内容与用于搜索的上下文。
- 关键词全文索引；语义索引在混合检索增量启用。

### Source Claim

从单一来源提取的观察，不冒充跨来源的最终真相：

- 每条 Claim 只属于一个 Source。
- 一条 Claim 表达一条完整、可独立理解的逻辑记录，而不是被拆散的字段。例如一段教育记录同时包含学位、学校和已有日期，一段工作记录同时包含公司、职位和已有日期。
- `title + statement + attributes`：标题和陈述供 Agent 理解，动态 attributes 由模型根据该文件的类型、标题、布局和内容选择，不使用一套 CV 专用固定表单。
- 日期、学校、职位、公司等属于同一记录的属性不能各自成为孤立 Claim；技能等本身独立的信息可以单独成记录。
- 精确 source/chunk 引用。
- 语义 key、适用范围、时间范围和 `source-backed / low-confidence / stale` 状态。
- 提取方式、时间和置信依据。

### Claim Cluster

- 将不同 Source 中谈论同一语义事实的 Claims 关联起来，但不复制或覆盖原 Claim。
- 多来源值一致时增加支持度；文件遗漏、不同措辞和 CV 内容取舍不构成冲突。
- 值不同时先比较时间、用途和适用范围；只有仍不能同时成立时才生成 conflict。

### Resolution

- 用户只对 conflict 或高风险事项作出 Resolution。
- Resolution 记录用户选择、涉及的 Claims、适用范围和确认时间。
- 新来源出现后，如果超出原 Resolution 覆盖的 Claim 集合，重新评估而不是静默沿用。

### Artifact / CV Variant

- 每份既有 CV 都作为独立来源和 artifact 保留。
- Master Knowledge 是事实全集，不是一份必须直接提交的 CV。
- Professional、Part-time、Summer 和岗位定制 CV 是不同选择、排序、措辞和模板的视图。
- 缺席只表示该 variant 没有展示，不表示事实不存在。

### Review Item

只为以下情况产生：

- 高影响信息：Visa、工作权利、有效期和关键日期。
- 同一语义事实在相同范围/时间内存在不可同时成立的来源 Claim。
- 解析失败、低置信度或无法定位原文。
- Agent 准备创建一个来源中不存在的新对外声明。

## 5. 上传与理解流程

```text
选择文件或连接来源
→ 立即保存原件并显示处理状态
→ 校验 MIME/大小/哈希，拒绝危险输入
→ 使用适合格式的确定性解析器提取元素
→ 自动识别 kind、purpose、sensitivity 和概要
→ 按标题/页面/代码路径建立父子切片
→ 按资料用途提取 Source-bound Claims
→ 关联同主题 Claim，并区分补充、版本差异和真实冲突
→ 建立全文检索索引；真实词法召回不足时再增加语义索引
→ 生成少量 review items
→ Source 进入 ready 或 needs-attention
```

模型分类或抽取失败不能导致原件消失。重复文件通过内容哈希识别；用户可以保留有意义的版本，也可以取消重复导入。

## 6. Agent 检索与披露流程

```text
把岗位的决策关键要求拆成独立 requirements
→ 本地扫描全部 Claims，并为每项 requirement 分别排序候选证据
→ 信息是否充分且无冲突？
  ├─ 是：用 Claim 和来源完成任务
  └─ 否：按 source kind / purpose / time 过滤并搜索 child chunks
          → 片段上下文是否充分？
            ├─ 是：引用片段
            └─ 否：打开 parent section、PDF 页面或代码文件
                    → 仍不确定：询问用户
```

Agent 至少需要逐步获得以下能力：

1. `get_candidate_claims(requirements)`
2. `search_candidate_sources(requirements, filters)`
3. `open_candidate_source(source_ref, context)`

检索边界限制的是发给模型的上下文，不限制本地索引参与候选排序。结果按 requirement 报告覆盖、候选总量和是否因上下文预算截断；一个主题不能占满整个结果。候选不足或截断时，Agent 可用更窄的表达继续检索或下钻原文。不得把“检索不到”解释为“不具备”；不得把一个 Source 的 Claim 静默提升为全局事实；Resolution 高于未解决 Claim，冲突必须显式呈现。

敏感资料遵循“本地完整保存、按任务最小披露”：例如 Visa 的完整解析结果留在本地，普通分析先使用工作权利 Claim，确需其他条件时再检索相关片段。上传界面必须明确说明提取文本会发送给已配置 Provider；用户完成上传即授权该来源用于后续 Agent 分析。Agent 可根据任务主动下钻高敏感来源，当前不增加每次读取弹窗。若未来增加共享账户、不同 Provider 或远程服务，再重新设计逐次授权。

## 7. 不同来源的处理策略

### 多份 CV

- 自动建议用途，不自动互相覆盖。
- 保留结构、原文和版本关系。
- 抽取可复用事实，但把“未出现”视为内容取舍。

### Visa 与高敏感文件

- 完整保留，优先抽取工作权利、限制、有效期和精确条款引用。
- 高影响 Claim 必须保留原文引用，Agent 作重要判断时可回到原件；不把模型归纳当作法律结论。
- 默认只向分析模型发送必要事实或片段。

### 项目文档

- 按标题、章节、表格和所属项目切片。
- 识别职责、技术、成果、指标和可展示链接，并保留原文。

### 代码来源

- 优先支持 GitHub URL 或本地目录；ZIP 作为受限导入方式。
- 不执行代码；限制总大小和文件数；忽略二进制、构建产物、依赖目录和 `.git`。
- 在任何云端发送前扫描并排除常见密钥与私人配置。
- 优先读取 README、包清单、测试、入口和 Agent 按任务选择的代码文件。

## 8. 产品界面

旧 `Profile` 入口现已替换为用户可理解的 `Library / 资料库`，不会把数据库字段直接摊给用户。`Facts` 与 `Experience` 不作为和文件并列的主导航；它们是内部检索维度，只有冲突或处理失败时才进入用户的 Review Inbox。

首屏包含：

- 一个明确的“添加职业资料”入口，接受多个文件并说明本地/云端处理边界。
- 大图标 Source cards：文件名、自动识别用途、标签、敏感等级、处理状态和更新时间。
- 卡片保持紧凑，只显示文件身份、用途、状态和添加时间；点击或键盘激活后进入文件操作详情。
- Claims 是内部检索索引，不作为内容清单发送到浏览器或要求用户逐条检查；文件详情只展示概要、元数据和原件/重试/删除等操作。
- Review inbox 只在存在真实冲突或高风险问题时出现，并直接展示各文件的值和来源。
- Source、Claims、chunks 和 Resolution 是唯一候选资料路径；未发布的旧 Profile/Evidence 运行层不保留兼容回退。
- 求职偏好、当前 availability 等可能不属于文件的内容，由 Agent 在任务需要时询问并单独保存。

处理状态必须可见：已接收、解析中、正在理解、可用、需要处理或失败。失败时保留已安全保存的原件，并提供重试、修正类型或删除入口。

## 9. 实施增量

### A. Source 基础与迁移（已完成，2026-09-07）

- 将现有 `candidate_documents` 演进为独立 Source，不再依赖 Profile 才能存在。
- 保存哈希、媒体类型、kind、purpose tags、敏感等级、概要和处理状态。
- 旧 CV 无损迁移为 `kind=cv` 的 Source。
- 增加结构化 chunk 与原文定位；先使用 SQLite FTS5。
- 通用资料上传支持 PDF、DOCX、TXT、Markdown；模型自动建议分类和概要。

完成条件：没有 Profile 也能上传资料；旧文件仍可检索；分类失败不丢原件。

### B. Source-bound Claims（代码纵切已完成，待真实资料校准）

- 每次理解资料时提取绑定 Source、语义 key 和原文定位的完整记录型 Claims。
- 模型按文件自己的类别、结构和内容生成动态 attributes；教育、工作、项目等记录不能被拆成孤立日期、机构或职位字段。
- 相同事实跨来源只建立关联；不创建可覆盖来源的全局 Fact。
- 先用 SQLite 关系和确定性分组识别同 key 的不同值；时间/范围语义深化按真实资料迭代。
- 用户 Resolution 独立保存，不改写 Source Claim。

完成条件：导入两份资料后，每条理解结果都可回到各自文件；真实冲突可确认，普通内容差异不要求审核。

当前实现：模型输出 `title + 完整 statement + 动态 attributes` 的来源记录；服务端只保存能在提取原文中重新定位的 Claim；SQLite schema v7 保存 Claim 和独立 Resolution，并只在相同排他语义 key 的共同属性出现不同值时识别冲突，字段缺席不构成冲突。旧 Profile/Evidence 与过期 Agent runs 已迁移删除，Source 原件、chunks 和有效 Claims 保留；高敏感来源不索引 identity/contact。时间、用途和适用范围的深层语义判定留给真实资料校准。

### C. Source-native 资料库 UI（代码纵切已完成，待真实资料走查）

- 移除 `Facts / Experience` 并列主导航，默认只有添加资料、Source cards 和按需出现的 Review Inbox。
- 卡片不展开长内容；点击后进入文件概要和操作详情。
- 支持修正分类、重试、查看来源和删除单份资料。
- 删除旧 Profile/Evidence 编辑、API、备份与内部回退，不让两个候选数据真相并存。

完成条件：用户可以连续添加两份不同用途 CV 和一份非 CV 文档；没有冲突时不需要逐条操作，有冲突时能在文件语境内完成处理。

当前实现：上传后直接入库，不再进入 Profile 建议审核；`Facts / Experience`、临时兼容入口和内部 Claim 清单均已退出产品界面；首屏使用紧凑 Source cards，冲突 inbox 按需出现；分类、用途和敏感度可修正，并支持重新理解、打开原件和单份删除。

### D. 分层 Agent Retrieval（已完成代码纵切，已完成首轮真实走查）

- 将当前 chunk 搜索演进为 Source Claim、chunk、parent/original 三层工具。
- FTS5 负责精确术语；语义检索负责同义表达，并合并排序结果。
- 每次输出保留人能理解的文件名、章节和原文引用。
- 记录实际工具动作，不展示隐藏 chain-of-thought。

完成条件：结构化事实缺失时 Agent 能找到项目文档或其他 CV 中的相关内容；找不到时转为未知。

当前实现：Agent 看到不含正文的 Library catalogue，自主决定 requirements、工具、query、source ID、读取层次和停止时机。`get_candidate_claims` 与 `search_candidate_documents` 只执行 Agent 的检索请求，本地全量排序后按剩余 context 分页并返回 `nextCursor`；`open_candidate_source` 可打开一个明确选择的 ready 原件。通用 chunk 搜索排除高敏感正文，Agent 仍可按 catalogue 中的确切 source ID 主动搜索或打开它。系统不根据召回结果生成 gap/unknown/追问，也不强迫工具路径。当前文档规模下 chunk + original 已覆盖深层读取，独立 parent-section 层只有真实大文档定位成本出现后再增加。

运行边界：产品分析不设置累计 token、tool-call/request 或整轮耗时上限，避免供应商已经计费后再丢弃完整响应；浏览器也不以固定时长中止长分析。检索仍按每项 requirement 报告覆盖和截断，并可继续缩窄查询；当前先记录真实 usage，再根据实际重复调用与上下文增长做收敛。

### E. CV Variants（移交 Stage 4）

- 将导入 CV 保留为独立 artifact。
- 支持用途标签、基础 CV、岗位 variant 和版本关系。
- 与阶段 4 的 FlowCV 式编辑、模板、diff 和材料生成衔接。

完成条件：Professional、Part-time 和 Summer CV 可以并存，生成岗位版本不会污染其他版本或 Master Knowledge。

### F. 代码与敏感来源深化（移出 Stage 2）

- GitHub/local folder/受限 ZIP ingestion。
- 代码结构索引、按需语义检索和来源路径引用。
- Visa 等高敏感资料的授权披露与可选本地处理策略。

这些能力保留为后期资料库扩展：项目 Markdown 已可作为普通 Source；GitHub/local folder/ZIP、代码路径索引和额外授权策略只有在真实使用需要时实现。

## 10. Stage 2 退出条件

- 不运行命令、不先建 Profile，也能添加、理解、查看和删除职业资料，并完成岗位分析。
- 至少两份不同用途 CV、一份 Visa/证书类文档和一个项目 README/Markdown 完成真实走查。
- 原件、chunk、Source Claim、Resolution 和分析结论之间可以回溯。
- 用户无需逐字段重新录入或确认已有 CV；只处理真实冲突和高价值 review items。
- Agent 在事实不足时能逐层检索，在无结果或冲突时询问用户。
- 多份 CV Source 独立存在，缺席不会被误判为能力缺失；基础 CV 与岗位 variant 的编辑关系由 Stage 4 建立。
- 解析、模型或索引失败不会覆盖既有资料或丢失已上传原件。

## 11. 当前明确不做

- GraphRAG、知识图数据库和分布式向量服务。
- 多 Agent ingestion 编排。
- 执行用户上传的代码。
- 声称自动处理任意格式、任意仓库和任意扫描件。
- 在真实资料检索证明需要前增加 reranker 或复杂召回评测平台。
