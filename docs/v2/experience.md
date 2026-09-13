# V2 产品信息架构与交互规范

状态：阶段 1 设计基线与阶段 2 Source-only Career Library 均已实现并通过作者真实 SEEK/资料走查；长期岗位工作区是当前下一阶段。实现变化若影响用户旅程或界面层级，应同步更新本文。

## 1. 设计目标

Side Panel 是用户浏览 SEEK 时的求职 companion，不是设置面板、技术仪表盘或功能目录。用户打开后应立即看到当前岗位、系统是否已同步，以及唯一最重要的下一步。

整体体验采用“安静、可信、任务导向”的方向：减少顶层入口、统一控件层级、用渐进展开承载复杂信息，不用大面积数据装饰制造“AI dashboard”感。

## 2. 参考产品与采用原则

- [Teal Job Search Companion](https://help.tealhq.com/en/articles/9524956-teal-job-search-companion-bookmark-jobs) 打开扩展后自动填入当前岗位，用户只需复核并执行主要动作。采用“自动识别当前上下文 + 可修正 + 单一主行动”。
- [Simplify Copilot](https://help.simplify.jobs/en/articles/1749022-installing-and-setting-up-copilot) 让一份 profile 持续服务后续申请，并强调用户最终复核和提交。采用“统一事实源 + 用户控制”。
- [Huntr Extension](https://help.huntr.co/en/articles/9859408-the-huntr-chrome-extension) 将扩展聚焦在保存当前岗位、autofill 和少量 quick actions，完整管理回到明确的 Job Board。采用“扩展做当前任务，长期对象进入工作区”。
- [Chrome Side Panel 指南](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) 将 Side Panel 定位为伴随网页、保持持续上下文的界面。采用“随当前 tab/URL 自动同步，不要求手动刷新”。

不复制竞品的账号墙、SaaS 数据上传、自动提交或大而全 dashboard。

## 3. 核心用户旅程

- 首次使用：打开 SEEK 岗位 → Kiwi 自动识别 → 看到 Agent 未连接引导 → 在 Settings 完成配对 → 返回 Job 分析。
- 日常判断：切换 SEEK 岗位 → Kiwi 自动同步 → 查看实时检查 → 必要时回答 Agent 追问 → 查看是否值得申请、硬性风险与下一步 → 按建议准备材料；材料生成后可标记已申请。
- 准备申请：从已完成分析确认计划 → 生成并查看岗位材料 → 临时编辑 Cover Letter → 下载 → 用户自行检查和提交；当前 CV 仅供预览。
- 回看与筛选：在 Search 修改排除/通勤条件，或从 Hidden jobs 恢复岗位；长期岗位记录待阶段 3 建立独立工作区。

前两条已完成真实走查；材料已有独立全页面预览纵切，长期岗位回看仍待 Stage 3 工作区，不伪装成已完成能力。

## 4. 当前一级信息架构

当前只显示已有真实能力的四个一级区域；原 Profile 已改为 Source-first Library：

```text
Job
├─ 当前 SEEK 岗位
├─ Agent 建议与下一步
└─ 准备材料；材料生成后可标记已申请

Career Library
├─ 添加资料：PDF/DOCX/TXT/Markdown → 立即保存 → 自动分类、概要和内部来源索引
├─ Needs your attention（按需出现）：只处理失败来源或跨来源真实冲突
├─ Source cards（默认）：紧凑展示每份资料的用途、状态和添加时间
├─ Source detail：文件概要、元数据、打开原件、重新理解和删除
└─ Library settings：资料库级危险操作

Search
├─ 当前 SEEK 搜索状态：紧凑的扫描/显示/隐藏数据与显示开关
├─ Exclusions：关键词/公司规则
├─ Commute：通勤起点与最大距离
└─ Hidden jobs：用户隐藏记录与恢复

Settings
├─ General：语言与显示偏好
├─ Career Agent：本地服务连接
├─ Data & privacy：导入、导出与隐私
└─ Advanced
   ├─ Diagnostics：高级诊断
   └─ Danger zone：清除数据
```

原来的 Overview 与 Agent 合并为 `Job`；Filters、Hidden、Commute 合并为 `Search`。Library 默认回答“我已经交给 Kiwi 哪些资料、系统从每份资料理解了什么”；不存在脱离文件的全局 Facts 页面，也不向用户暴露旧 Profile/Evidence 兼容层。未来 Jobs、Applications、Career 只有在相应工作区真正可用后才加入，不显示没有内容的占位导航。

## 5. Job 页面信息优先级

从上到下必须是：

1. 当前岗位身份与自动同步状态。
2. 当前最重要行动：配置、选择岗位、分析或继续准备申请。
3. Agent 运行状态：只展示真实检查活动和当前规划状态，不展示 chain-of-thought。
4. Agent 推荐与一句话层级：是否值得申请、硬性风险、下一步。
5. 若存在 clarification questions，在申请动作前显示问题与回答框；全部回答后继续同一岗位分析。
6. 用户操作：按建议准备可用材料；材料生成后可标记已申请。待澄清时隐藏准备动作，不在当前岗位页平铺通用状态按钮。
7. 匹配、差距和未知，通过分组/折叠渐进显示。
8. 完整 tool trace、模型和诊断只放在“分析详情”中。

不得把 raw tool trace、adapter version、parsed field counts 放在默认首屏。

## 6. 自动同步状态

Side Panel 必须响应：

- 打开面板时主动要求当前 content script 重新报告状态。
- 用户切换 tab 时读取新 tab。
- 当前 tab URL/加载状态变化时重新读取。
- SEEK SPA 或卡片状态变化时接收 `PAGE_STATUS_CHANGED`。
- 当前岗位变化时使 Job 页面重新提取，而不是要求用户点击 Refresh。

手动重试只作为失败恢复动作出现，不作为正常流程。

## 7. 页面注入元素

任何插入 SEEK 的元素都必须一眼可识别为扩展能力：

- 使用统一的 `Kiwi` 品牌标记和与 Side Panel 一致的青绿色。
- 页面汇总条的主动作叫 `Open Kiwi`，不是含糊的 `Settings`。
- 卡片动作叫 `Hide with Kiwi`，并带品牌标记；恢复时明确为 `Undo hide`。
- 注入区与 SEEK 内容之间有边界、轻背景和独立字体，不伪装成 SEEK 原生控件。
- 每张卡只有一个直接动作；距离、已查看和命中原因是次要状态标签。

## 8. 组件与视觉层级

### 控件

- Primary button：每个区域最多一个，实心品牌色。
- Secondary button：描边，用于替代动作。
- Quiet button：无边框，用于编辑、重试或展开。
- Danger button：只在确认删除/清除时使用，不与普通编辑同权重。
- Checkbox 只用于多选；开/关偏好使用统一 switch 外观。
- 页面导航、分段导航、按钮和输入框的高度/圆角保持同一体系。

### 内容

- Page title 说明当前任务，辅助文案不超过两行。
- Card 只承载一个信息主题。
- 状态使用文本 + 图形/颜色，不能只靠颜色。
- 说明性长文本放在折叠区或次级文案。
- 默认 400px Side Panel 下不出现横向滚动；320px 仍可操作。

### 视觉基线

- 中性浅灰背景、白色内容卡、深墨色正文、青绿色主色。
- 避免装饰性大渐变、巨大统计数字和过多阴影。
- 8px 间距基线，主要内容 16px padding，44px 最小主要点击高度。
- 遵守 `prefers-reduced-motion`，保留清晰 focus-visible。

## 9. 状态要求

| 情况 | 默认呈现 | 可执行动作 |
|---|---|---|
| 非 SEEK 页面 | 说明当前支持 SEEK | 打开/切换到 SEEK 后自动同步 |
| SEEK 搜索页未选岗位 | 显示搜索活动与选择岗位指引 | 在网页选择一个岗位 |
| 岗位读取中 | skeleton/简短同步提示 | 无需操作 |
| 岗位读取失败 | 明确原因，不显示旧岗位 | 重试同步 |
| Agent 未配置 | setup 卡片 | 打开 Settings |
| Agent 分析中 | 禁用重复请求；显示真实已完成工具检查与正在规划状态 | 等待或保留当前岗位 |
| Agent 需要补充事实 | 显示问题、短回答框和“仅用于当前岗位”说明；申请动作暂不出现 | 回答后继续分析 |
| 分析完成 | 推荐、关键原因、下一步 | 按建议准备材料；生成后标记已申请 |
| 服务/Key 失败 | 产品语言说明问题 | 打开 Agent settings / 重试 |

## 10. 本阶段验收

- 一级导航收敛为 Job、Library、Search、Settings 四项，V1 能力没有丢失。
- Side Panel 打开、切 tab、同 tab 导航或 SEEK 状态变化时自动同步。
- 首屏以当前岗位和下一步为中心，不再以低价值 Overview 统计为中心。
- Settings 的四个同级分组使用一致标题层级，diagnostics/danger 收入 Advanced。
- Agent trace 默认折叠。
- Clarification questions 不是只读清单；用户可以回答，继续运行后得到新的结构化结论。
- 所有 SEEK 注入控件明确显示 Kiwi 品牌归属。
- 英文和中文文案表达同一层级，键盘与小宽度可用。
