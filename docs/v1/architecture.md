# V1 实际架构快照

状态：冻结。本文按当前代码还原 V1 SEEK 功能的实际结构，供 V2 回归和维护使用。

## 系统结构

```text
SEEK search DOM
  → SEEK listing extractor
  → NormalizedJob / stable identity
  → rule engine + distance decision + saved state
  → card decorator / page summary
  ↔ background message router
  ↔ Side Panel

Persistent state
  ├─ chrome.storage.sync / local
  └─ IndexedDB job state
```

V1 没有远程服务或 LLM。V2 新增的 Python Agent 服务不属于 V1 架构。

## 主要模块

| 边界 | 当前代码 | 职责 |
|---|---|---|
| 页面入口 | `entrypoints/seek.content/` | 在 SEEK 页面启动处理器 |
| 网站提取 | `src/adapters/seek/` | 从职位卡片读取站点字段 |
| 页面生命周期 | `src/browser/` | MutationObserver、URL 变化、卡片处理和装饰 |
| 领域逻辑 | `src/core/` | 文本规范化、职位身份和规则判断 |
| 地点 | `src/location/` | 新西兰地点解析和保守距离 |
| 消息 | `src/messaging/` | content/background/Side Panel 间的严格消息协议 |
| 存储 | `src/storage/` | 设置、职位状态、迁移、诊断和导入导出 |
| 用户界面 | `entrypoints/sidepanel/` | 规则、距离、状态和设置页面 |
| 国际化 | `src/i18n/` | 英文与简体中文文案 |

## 关键数据流

### 页面过滤

1. Content script 扫描当前可见/已加载职位卡片。
2. SEEK extractor 只提取当前 DOM 中已有字段。
3. Job normalizer 和 identity 模块产生稳定的领域表示。
4. Rule engine 按明确优先级判断关键词、类别、公司、用户状态和距离。
5. Card decorator 隐藏或标记卡片并更新页面统计。
6. MutationObserver 对新增卡片重复相同流程，不删除原 DOM 节点。

### 状态同步

Side Panel 通过 background router 读取/修改设置，content script 接收变化并重新计算当前页。页面状态、规则和长期职位状态分开保存，输入通过 Zod schema 校验。

## 保守决策原则

- 规则只在明确定义的字段上匹配。
- 地点解析失败、地点过宽或距离边界不确定时保留职位。
- 站点结构异常时记录 diagnostics 并 fail open。
- 职位身份优先使用站点 ID，其次 canonical URL/稳定指纹。

## 测试边界

- Vitest 覆盖领域规则、存储、消息、地点和 Side Panel 行为。
- Playwright 使用本地 fixture 验证扩展生命周期和用户路径。
- 真实网站 smoke test 仍是发现 SEEK DOM 漂移的必要手段；fixture 不能证明线上永久兼容。

## 维护约束

- V2 改动不得破坏 SEEK 列表过滤主流程。
- 不为恢复 Trade Me 修改这一架构。
- 新网站应提供独立 adapter 和真实样本，而不是把站点判断散落到规则引擎。
- Side Panel 可以在 V2 重构，但 V1 领域逻辑和存储行为应由回归测试保护。
