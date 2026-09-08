# Kiwi Job Search Enhancer 浏览器扩展

## 产品需求与技术开发说明书 v1.1（合并版）

**文档日期：** 2026-08-06
**目标开发工具：** Codex
**目标平台：** Chrome / Microsoft Edge 桌面版
**扩展标准：** Manifest V3
**首发范围：** 新西兰全国
**默认界面语言：** English (New Zealand)
**运行方式：** v1 local-first，不部署业务后端
**首批支持网站：**

* SEEK New Zealand
* Trade Me Jobs

---

# 1. 项目目标

开发一个面向新西兰求职者的浏览器扩展，在受支持的招聘网站搜索结果页面上增加网站本身缺少的个人筛选和状态管理功能。

产品首发覆盖新西兰全国，不限定用户所在城市或地区。Waikato、Hamilton、Cambridge 等地点只作为开发和测试样例，不属于产品名称或产品范围限制。

扩展的单一用途定义为：

> Enhance job-search result pages with personal exclusion filters, approximate distance filtering, and local job-status management.

中文释义：

> 通过个人排除规则、近似距离筛选和本地职位状态管理，增强招聘网站的搜索结果页面。

扩展不替代 SEEK 或 Trade Me，也不建立独立职位聚合网站。用户仍然在原网站上：

* 选择网站提供的新西兰地区；
* 选择 part-time、casual 等工作类型；
* 设置工资、发布时间、职位类别等网站已有条件；
* 正常翻页或滚动浏览。

扩展只负责在网站已经展示出来的职位结果上增加：

1. 排除关键词；
2. 排除类别；
3. 排除公司；
4. 距离筛选；
5. “不感兴趣，不再显示”；
6. 已看过标记；
7. 当前页过滤统计；
8. 新加载职位的自动过滤；
9. 跨页面保存个人状态。

以上功能均服务于同一用途。不得加入通用广告拦截、密码管理、网页翻译、通用笔记、新闻聚合、AI 聊天或电商比价等无关工具。

## 1.1 产品命名

在正式完成品牌和商标检索前，使用以下内部名称：

```text
Repository name: job-filter-extension
Internal project name: JobFilter
Package namespace: jobfilter
Display name: Kiwi Job Search Enhancer
```

`Kiwi Job Search Enhancer` 是当前工作名称，不视为已完成品牌核准。最终名称不得包含 Waikato、Hamilton、SEEK、Trade Me、Google、Chrome、Microsoft 或 Edge，不得暗示得到任何招聘网站授权；发布前必须完成新西兰商标、域名和应用商店重名检查。

商店描述可以说明支持 SEEK NZ 和 Trade Me Jobs，但必须同时声明本扩展为独立产品，与两家网站不存在隶属、认可或赞助关系。不得使用第三方招聘网站 Logo 作为扩展图标。

---

# 2. 必须遵守的产品边界

## 2.1 不做爬虫

扩展不得：

* 自动遍历 SEEK 或 Trade Me 的全部分页；
* 自动点击“下一页”；
* 自动触发无限滚动；
* 在后台定时打开搜索页面；
* 使用 `fetch`、XHR 或隐藏接口请求职位列表；
* 调用 SEEK 或 Trade Me 的内部 API；
* 拦截、复制或重放网站网络请求；
* 自动打开职位详情页；
* 批量下载完整职位描述；
* 使用 Playwright、Selenium 或 Puppeteer抓取在线职位；
* 绕过验证码、访问限制或限流；
* 将职位数据上传到外部服务器；
* 将两个网站的数据集中重新发布。

SEEK 和 Trade Me 的现行条款均限制未经授权的自动化访问或提取。内容脚本仍可能被视为 automated process/tool；只处理用户当前页面、且不建立数据集，可以降低技术和数据处理范围，但不是条款中的明确豁免，也不代表平台已经授权。

公开发布或收费目前属于阻断项：发布前必须取得相关平台书面许可，或取得基于当时条款、产品实际行为和新西兰适用法律的合格法律意见，明确确认可以继续。两者均没有时，不提交 Chrome Web Store 或 Edge Add-ons。不得用“只读 DOM”假设绕过该门槛。

## 2.2 不重复实现网站已有筛选

扩展不得重新实现：

* 工作类型选择；
* 正向类别筛选；
* 工资筛选；
* 发布时间筛选；
* 网站已有关键词搜索；
* 网站已有排序；
* 网站已有地区选择；
* SEEK 的 New to you 等已有功能。

扩展只实现网站没有的“负向筛选”和个人状态管理。

## 2.3 只处理用户当前看到的内容

扩展只能读取当前网页 DOM 中已经由网站展示的职位卡片。

普通分页行为：

```text
用户打开第 1 页
→ 扩展过滤第 1 页

用户手动点击第 2 页
→ 扩展过滤第 2 页
```

无限滚动行为：

```text
用户主动向下滚动
→ 网站加载更多职位
→ 扩展检测新卡片
→ 扩展过滤新卡片
```

扩展不得为了补足可见职位数量而主动加载下一页。

例如一页原有 20 个职位，过滤掉 15 个后，只显示剩余 5 个，不自动请求下一页。

---

# 3. 核心用户场景

## 3.1 排除清洁类工作

用户在 SEEK 搜索：

```text
Region: Waikato（仅作为测试样例）
Work type: Part time
```

扩展规则：

```text
排除关键词：
cleaner
cleaning
housekeeper
housekeeping
commercial cleaning
```

结果中标题、摘要或类别命中规则的职位自动隐藏。

## 3.2 排除某个职位类别

用户仍可使用网站自身的正向类别筛选。

扩展额外允许：

```text
排除类别：
Cleaning Services
Housekeeping
Door-to-door Sales
```

只有当职位卡片或页面数据中确实包含类别信息时，类别规则才生效。

扩展不得为了获得类别而自动访问职位详情页。

## 3.3 不再显示某个职位

每张职位卡片增加一个按钮：

```text
不感兴趣
```

点击后：

* 当前卡片立即隐藏；
* 职位 ID 保存到本地数据库；
* 有稳定职位 ID 或 URL 时，同一职位之后出现在不同页、不同关键词搜索或不同地区搜索中仍然隐藏；
* 用户可以在侧边栏的“不感兴趣记录”中恢复。

## 3.4 距离筛选

用户在网站上选择一个新西兰地区或 All New Zealand。

扩展保存一个通勤起点，例如：

```text
Hamilton 的一个已知地点
或
用户当前定位
```

用户设置：

```text
最大近似距离：40 km
```

职位位置为：

* Hamilton Central：显示；
* Cambridge：根据距离显示；
* Te Awamutu：根据距离显示；
* Morrinsville：根据距离显示；
* Auckland：隐藏；
* Waikato：范围过宽，不按距离隐藏；
* Multiple locations：根据能够识别的位置作保守判断。

---

# 4. 第一版功能范围

## 4.1 必须实现

### F01：关键词排除

用户可以建立多个关键词规则。

规则可选择匹配字段：

* 标题；
* 公司；
* 地点；
* 类别；
* 卡片摘要；
* 所有可用字段。

第一版支持三种匹配方式：

1. 包含词：某个规范化 token 完整相等；
2. 完整短语：连续的规范化 token 序列相等；
3. 前缀通配符：模式必须是单个 token 加末尾 `*`，匹配 token 前缀。

例子：

```text
cleaner
commercial cleaning
clean*
```

其中：

```text
clean*
```

可以匹配：

* cleaner；
* cleaners；
* cleaning。

第一版不开放任意正则表达式，避免错误表达式、性能问题和 ReDoS 风险。

匹配器不得把用户输入直接编译为正则。标点和连续空格先按第 13 节规范化；空模式、只有 `*`、中间或开头带 `*` 的模式必须在保存时拒绝。

### F02：类别排除

用户可以输入类别名称。

类别匹配：

* 忽略大小写；
* 忽略前后空格；
* 连续空格视为一个空格；
* 可忽略英文标点；
* 可选择是否忽略 Māori macron。

当类别不可从当前职位卡片可靠获取时：

* 不隐藏职位；
* 将类别状态标记为 `unknown`；
* 不得通过额外网络请求补充类别。

### F03：公司排除

用户可以添加公司黑名单，例如：

```text
Company A
Company B Recruitment
```

公司名称规范化后精确或包含匹配。

### F04：不感兴趣

每张职位卡片提供：

```text
× 不感兴趣
```

点击后记录：

* 来源网站；
* 职位 ID（若可用）；
* 标准化职位 URL（若可用）；
* 标题；
* 公司；
* 地点；
* 操作时间；
* 状态；
* 可选原因。

第一版原因选项：

* 工作内容不感兴趣；
* 距离太远；
* 公司不感兴趣；
* 工作时间不合适；
* 其他。

原因只用于个人记录，不自动创建新规则。

### F05：撤销操作

隐藏职位后，页面顶部显示短暂提示：

```text
已隐藏 “Part-time Retail Assistant”    撤销
```

撤销时间不少于 8 秒。

侧边栏中也必须可以永久恢复。

### F06：已看过状态

职位卡片第一次进入浏览器可视区域时，记录为 `seen`。

要求：

* 使用 `IntersectionObserver`；
* 卡片至少 50% 可见；
* 连续可见至少 800ms；
* 不因为页面加载就将所有职位直接标记为已看过。

已看过职位不自动隐藏，只增加低干扰标记。

### F07：当前页自动过滤

页面加载完成后：

1. 读取当前配置；
2. 找到所有职位卡片；
3. 提取职位信息；
4. 运行规则；
5. 隐藏命中的职位；
6. 显示统计。

### F08：动态内容过滤

使用 `MutationObserver` 监听职位列表区域。

新职位卡片出现后自动处理。

必须：

* 批量处理新增节点；
* 防抖；
* 避免重复处理；
* 不观察整个 DOM 的所有属性变化；
* 页面切换后清理旧 Observer。

### F09：跨页状态

以下状态必须跨页面和搜索条件生效：

* 不感兴趣；
* 已看过；
* 已收藏，若后续实现；
* 已申请，若后续实现。

唯一识别优先顺序：

1. 网站职位 ID；
2. 标准化职位详情 URL；
3. 来源、标题、公司、地点组成的哈希。

前两种身份允许持久跨页状态；第三种 fallback 只用于当前会话，避免把后来重新发布的相似职位永久误隐藏。

### F10：距离筛选

支持：

* 使用当前位置；
* 将当前位置保存为固定通勤起点；
* 从新西兰全国地点列表中手动选择起点；
* 设置最大距离；
* 关闭距离筛选；
* 显示识别置信度；
* 地点未知时默认保留。

v1 只在界面中启用一个通勤起点和一个距离规则。数据记录使用独立 ID，以便未来增加多个起点或 Profile，但 v1 不实现多起点管理界面。

---

# 5. 明确不进入第一版的功能

以下功能不在 v1 实现；除非进入对应里程碑，不为它们创建空目录、权限或占位业务代码：

* 自动加载下一页；
* 自动汇总多个搜索页面；
* 邮件导入；
* 驾车时间；
* 公交时间；
* 地图显示；
* 自动申请；
* 简历匹配；
* AI 职位推荐；
* 云同步职位历史；
* 手机浏览器支持；
* Firefox 正式适配；
* 跨平台重复职位合并；
* 自动从职位详情提取工作地址；
* 读取用户 SEEK 或 Trade Me 账户数据；
* 对网站网络请求进行监听；
* 自动创建网站搜索条件。
* 支付、订阅、许可证和账户系统；
* 多套筛选 Profile 和多起点管理界面；
* 产品分析或远程反馈上报。

---

# 6. 技术选型

## 6.1 基础框架

使用：

```text
WXT
TypeScript
React
Manifest V3
pnpm
```

WXT 当前支持 TypeScript、Manifest V3、Chrome、Edge、Firefox 等目标，并提供内容脚本、后台脚本和构建入口管理。项目使用 React 仅构建侧边栏和设置页面，核心规则引擎必须是无 UI 依赖的纯 TypeScript。

初始化：

```bash
pnpm dlx wxt@latest init
```

选择：

```text
React
TypeScript
pnpm
```

创建后提交 lockfile，不允许在生产构建时动态下载远程代码。

## 6.2 建议依赖

```text
react
react-dom
zod
idb
```

开发依赖：

```text
vitest
@testing-library/react
@playwright/test
eslint
prettier
```

避免引入大型状态管理框架。侧边栏状态可使用 React Context 或轻量 store。

ID 使用 `crypto.randomUUID()`，不为此引入 `nanoid`。依赖在首次使用它的里程碑再安装：React 测试工具到 M6，Playwright 到 M8。

## 6.3 浏览器最低版本

Chrome 构建：

```json
{
  "minimum_chrome_version": "116"
}
```

原因：

* Chrome Side Panel API 在 Manifest V3 中可用；
* `sidePanel.open()` 从 Chrome 116 起可由用户操作触发；
* Chrome 与 Edge 桌面版是第一版目标。

Edge 不在 Manifest 中声明独立最低版本。发布前必须在当时的 Edge Stable 上验证 `sidePanel`、存储、定位和内容脚本；商店页面只列出实际验证过的版本。Chrome 与 Edge 共用业务代码，可使用少量浏览器专属构建配置，但不得维护两套规则引擎。

## 6.4 商业化边界

v1 不实现支付、账户、许可证或远程权益刷新。Free core 至少包含基础排除规则、不感兴趣、已查看、一个通勤起点、一个距离规则、SEEK NZ、Trade Me Jobs 和两种界面语言。

当首个已验证的 Pro 功能进入开发时，再在 `src/commercial/` 中加入可替换的 `EntitlementService`；规则引擎、网站适配器、地点解析器、DOM 处理器和存储 repository 不得依赖具体支付 SDK。

预期边界如下，不要求在 v1 创建单一实现的占位接口：

```ts
export type FeatureId =
  | "multiple-profiles"
  | "advanced-rules"
  | "cloud-sync"
  | "additional-sites";

export type SubscriptionPlan =
  | "free"
  | "pro"
  | "lifetime"
  | "development";

export interface EntitlementService {
  isEnabled(feature: FeatureId): Promise<boolean>;
  getPlan(): Promise<SubscriptionPlan>;
  refresh(): Promise<void>;
}
```

商业模式只在 1.x 验证后决定订阅或一次性 Pro licence。不得通过广告注入、affiliate 职位链接或出售职位浏览、规则、状态及位置数据变现。

---

# 7. 权限设计

建议权限：

```ts
manifest: {
  permissions: [
    "storage",
    "sidePanel",
    "geolocation"
  ]
}
```

两个静态 content script 分别声明精确 `matches`：

```text
https://www.seek.co.nz/*
https://nz.seek.com/*
https://www.trademe.co.nz/a/jobs/*
```

说明：

## `storage`

保存：

* 用户规则；
* 页面配置；
* 职位状态；
* 通勤起点；
* 适配器诊断。

## `sidePanel`

展示配置和状态管理界面。

## `geolocation`

Chrome 的 `geolocation` 权限不能声明为 optional permission。为了在 Side Panel 中使用 `navigator.geolocation`，它必须作为安装时权限声明；安装后调用通常不会再出现独立的扩展定位授权提示。

扩展仍然只能在用户点击“Use my current location”后调用定位，并在按钮附近先解释用途。若不接受安装权限，用户可以不安装扩展；若定位服务不可用或权限后来被撤销，必须回退到全国地点列表。

不得：

* 安装后立即请求定位；
* 在后台持续定位；
* 使用 `watchPosition()`；
* 每次打开职位页面自动重新定位。

## 站点访问

第一版使用静态 `content_scripts.matches` 自动处理上述两个明确 URL 范围。由于扩展不从 background/Side Panel 对招聘网站发起跨域请求，也不程序化注入脚本，不重复声明 `host_permissions`。

未来增加网站时，只加入该网站的精确 match pattern；若改为运行时授权，则使用精确的 optional host permission。不得申请 `https://*/*` 作为“未来兼容”。

## 不申请的权限

第一版不得申请：

```text
tabs
history
webRequest
declarativeNetRequest
cookies
downloads
clipboardRead
clipboardWrite
unlimitedStorage
```

除非后续明确证明功能必须使用。

---

# 8. 总体架构

```text
┌─────────────────────────────────┐
│ SEEK / Trade Me 当前搜索结果页  │
└───────────────┬─────────────────┘
                │ DOM
                ▼
┌─────────────────────────────────┐
│ Content Script                  │
│                                 │
│ - URL 检测                      │
│ - Site Adapter                  │
│ - MutationObserver              │
│ - 职位卡片装饰                  │
│ - 隐藏/恢复 DOM                 │
└───────────────┬─────────────────┘
                │ normalized job
                ▼
┌─────────────────────────────────┐
│ Core Rule Engine                │
│                                 │
│ - 关键词规则                    │
│ - 类别规则                      │
│ - 公司规则                      │
│ - 距离规则                      │
│ - 状态规则                      │
└───────────────┬─────────────────┘
                │ runtime message
                ▼
┌─────────────────────────────────┐
│ Background Service Worker       │
│                                 │
│ - 数据库访问                    │
│ - 设置读取                      │
│ - schema migration              │
│ - 消息路由                      │
│ - Side Panel 控制               │
│ - LocationProvider / 地点缓存   │
└───────────────┬─────────────────┘
                ▼
┌─────────────────────────────────┐
│ Local Storage                   │
│                                 │
│ chrome.storage.sync（公开偏好） │
│ IndexedDB                       │
│ chrome.storage.local            │
└─────────────────────────────────┘
```

---

# 9. 项目目录建议

```text
job-filter-extension/
├── entrypoints/
│   ├── background.ts
│   ├── seek.content.ts
│   ├── trademe.content.ts
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   └── options/
│       ├── index.html
│       ├── main.tsx
│       └── App.tsx
│
├── src/
│   ├── adapters/
│   │   ├── adapter-registry.ts
│   │   ├── site-adapter.ts
│   │   ├── seek/
│   │   │   ├── seek-adapter.ts
│   │   │   ├── seek-selectors.ts
│   │   │   ├── seek-extractor.ts
│   │   │   └── seek-decorator.ts
│   │   └── trademe/
│   │       ├── trademe-adapter.ts
│   │       ├── trademe-selectors.ts
│   │       ├── trademe-extractor.ts
│   │       └── trademe-decorator.ts
│   │
│   ├── core/
│   │   ├── jobs/
│   │   │   ├── job-types.ts
│   │   │   ├── job-normalizer.ts
│   │   │   └── job-identity.ts
│   │   ├── rules/
│   │   │   ├── rule-engine.ts
│   │   │   ├── keyword-rule.ts
│   │   │   ├── category-rule.ts
│   │   │   ├── company-rule.ts
│   │   │   ├── distance-rule.ts
│   │   │   └── status-rule.ts
│   │   ├── distance/
│   │   │   └── haversine.ts
│   │   └── text/
│   │       ├── normalize-text.ts
│   │       └── wildcard-matcher.ts
│   │
│   ├── locations/
│   │   ├── location-provider.ts
│   │   ├── provider-registry.ts
│   │   └── nz/
│   │       ├── nz-location-provider.ts
│   │       ├── nz-location-resolver.ts
│   │       └── nz-location-types.ts
│   │
│   ├── browser/
│   │   ├── card-processor.ts
│   │   ├── mutation-controller.ts
│   │   ├── url-watcher.ts
│   │   ├── visibility-tracker.ts
│   │   └── page-summary.ts
│   │
│   ├── storage/
│   │   ├── database.ts
│   │   ├── job-state-repository.ts
│   │   ├── settings-repository.ts
│   │   ├── migration.ts
│   │   └── export-import.ts
│   │
│   ├── messaging/
│   │   ├── message-types.ts
│   │   ├── content-client.ts
│   │   └── background-router.ts
│   │
│   ├── ui/
│   │   ├── components/
│   │   ├── pages/
│   │   └── styles/
│   ├── i18n/
│   │   ├── index.ts
│   │   ├── en-NZ.json
│   │   └── zh-CN.json
│   │
│   └── diagnostics/
│       ├── adapter-health.ts
│       └── logger.ts
│
├── data/
│   └── locations/
│       └── nz/
│           └── aliases.manual.json
│
├── scripts/
│   └── build-nz-location-dataset.ts
│
├── public/
│   ├── _locales/
│   │   ├── en/
│   │   │   └── messages.json
│   │   └── zh_CN/
│   │       └── messages.json
│   └── data/
│       └── locations/
│           └── nz/
│               ├── manifest.json
│               ├── locations.compact.json
│               ├── aliases.compact.json
│               ├── regions.json
│               └── ATTRIBUTION.md
│
├── tests/
│   ├── unit/
│   ├── adapters/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
│
├── wxt.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

`src/commercial/`、账户、licensing 和 billing 目录只在首个商业功能进入开发时创建。

---

# 10. Site Adapter 设计

核心逻辑不得出现 SEEK 或 Trade Me 的选择器。

定义统一接口：

```ts
export type SiteId = "seek-nz" | "trademe-jobs-nz";

export interface SiteAdapter {
  readonly id: SiteId;
  readonly version: number;

  canHandle(url: URL): boolean;

  findListRoots(document: Document): HTMLElement[];

  findJobCards(root: ParentNode): HTMLElement[];

  extractJob(card: HTMLElement, pageUrl: URL): ExtractJobResult;

  decorateCard(
    card: HTMLElement,
    context: CardDecorationContext
  ): CardDecorationHandle;

  getPageSignature(document: Document, url: URL): string;

  runHealthCheck(document: Document): AdapterHealthResult;
}
```

## 10.1 ExtractJobResult

```ts
export type ExtractJobResult =
  | {
      ok: true;
      job: NormalizedJob;
      diagnostics: ExtractionDiagnostics;
    }
  | {
      ok: false;
      reason:
        | "not-a-job-card"
        | "missing-title"
        | "unsupported-layout"
        | "parse-error";
      diagnostics: ExtractionDiagnostics;
    };
```

## 10.2 选择器原则

选择器优先级：

1. 网站提供的稳定 `data-*` 属性；
2. 语义化元素和职位详情链接；
3. ARIA 属性；
4. 稳定组件结构；
5. CSS class；
6. 文本和结构启发式。

不得依赖：

* 自动生成的 CSS 哈希；
* 单纯的 `nth-child`；
* 颜色；
* 像素位置；
* 英文按钮文本作为唯一判断；
* 整页固定 DOM 层级。

选择器集中保存在：

```text
seek-selectors.ts
trademe-selectors.ts
```

网站结构变化时，只修改对应适配器。

## 10.3 Fail-open 原则

适配器不确定时必须显示职位，而不是隐藏职位。

例如：

* 无法解析职位 ID：继续使用 URL 或 fallback fingerprint；
* 无法解析 URL：只有在仍可生成 fallback fingerprint 时继续处理，否则允许显示且不保存跨页状态；
* 无法识别地点：允许显示；
* 类别缺失：跳过类别规则；
* 页面结构改变：停止过滤并显示诊断；
* 规则引擎异常：恢复所有卡片。

不得因为解析失败而误隐藏职位。

---

# 11. 标准化职位模型

```ts
export interface NormalizedJob {
  source: SiteId;

  externalId: string | null;
  canonicalUrl: string | null;

  title: string;
  normalizedTitle: string;

  company: string | null;
  normalizedCompany: string | null;

  locationText: string | null;
  normalizedLocationText: string | null;

  categoryText: string | null;
  normalizedCategoryText: string | null;

  summaryText: string | null;
  normalizedSummaryText: string | null;

  pageUrl: string;

  extractedAt: number;
  adapterVersion: number;
}
```

第一版不得存储：

* 完整职位描述；
* 招聘人员邮箱；
* 招聘人员电话；
* 用户登录信息；
* 页面 Cookie；
* 页面 HTML；
* 图片；
* SEEK 或 Trade Me 账户信息。

---

# 12. 职位身份识别

```ts
export interface JobIdentity {
  primaryKey: string;
  source: SiteId;
  basis: "external-id" | "canonical-url" | "fallback-fingerprint";
  persistent: boolean;
  externalId: string | null;
  canonicalUrlHash: string | null;
  fallbackFingerprint: string;
}
```

生成优先级：

## 12.1 网站职位 ID

```text
seek-nz:12345678
trademe-jobs-nz:987654321
```

有稳定网站职位 ID 时使用它作为 `primaryKey`。缺失 ID 不属于提取失败。

## 12.2 URL 哈希

去除：

* tracking 参数；
* session 参数；
* fragment；
* 非身份相关查询参数。

保留职位详情路径和稳定 ID。

## 12.3 Fallback 指纹

```text
source
+ normalizedTitle
+ normalizedCompany
+ normalizedLocation
```

使用 Web Crypto 提供的 SHA-256。Fallback fingerprint 可能把重复发布或同名职位误认成同一职位，因此只用于当前页面/会话的去重和状态关联，`persistent` 必须为 `false`；跨会话的 `dismissed` 只接受网站职位 ID 或 canonical URL。若标题也缺失，则不生成身份，只允许显示卡片。

Fallback 指纹只能用于当前站点，不用于跨站合并。用户对只有 fallback 身份的卡片点击 Dismiss 时，当前卡片仍立即隐藏，但 UI 必须提示无法保证刷新后继续隐藏。

---

# 13. 文本规范化

```ts
export function normalizeText(
  input: string,
  options: { stripMarks?: boolean } = {},
): string {
  const stripMarks = options.stripMarks ?? true;
  const normalized = stripMarks
    ? input.normalize("NFKD").replace(/\p{M}/gu, "")
    : input.normalize("NFC");

  return normalized
    .toLocaleLowerCase("en-NZ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

注意：

* 保留原始文本用于展示；
* 规范化文本用于匹配；
* 对 Māori 名称同时生成带 macron 和无 macron 索引；
* 不修改网站原始显示内容。

示例：

```text
Te Awamutu → te awamutu
Ngāruawāhia → ngaruwahia
HAMILTON CENTRAL → hamilton central
```

对于 Māori 名称，地点别名文件需要人工核查，不能完全依赖去除音标。

---

# 14. 规则数据模型

```ts
export type RuleType =
  | "exclude-keyword"
  | "exclude-category"
  | "exclude-company"
  | "max-distance";

export type RuleField =
  | "title"
  | "company"
  | "location"
  | "category"
  | "summary"
  | "all";

export interface BaseRule {
  id: string;
  type: RuleType;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface KeywordRule extends BaseRule {
  type: "exclude-keyword";
  pattern: string;
  matchMode: "contains" | "phrase" | "prefix-wildcard";
  fields: RuleField[];
}

export interface CategoryRule extends BaseRule {
  type: "exclude-category";
  pattern: string;
  matchMode: "contains" | "exact";
  ignoreMacrons: boolean;
}

export interface CompanyRule extends BaseRule {
  type: "exclude-company";
  pattern: string;
  matchMode: "contains" | "exact";
}

export interface DistanceRule extends BaseRule {
  type: "max-distance";
  maximumKm: number;
}

export type FilterRule =
  | KeywordRule
  | CategoryRule
  | CompanyRule
  | DistanceRule;
```

起点由当前 Profile 的 `activeOriginId` 提供，`DistanceRule` 不再重复保存 `originId`。

Profile 和设置模型：

```ts
export interface FilterProfile {
  id: string;
  name: string;
  ruleIds: string[];
  activeOriginId: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LocalFilterSettings {
  schemaVersion: number;
  configurationRevision: number;
  rules: FilterRule[];
  profiles: FilterProfile[];
  activeProfileId: string;
}
```

v1 只创建一个名为 `Default` 的 Profile，不提供新增 Profile 的界面。

任何会改变过滤结果的规则、Profile 或通勤起点更新都必须递增 `configurationRevision`；页面处理签名只依赖这一统一版本号，不维护互相可能失配的多套版本。

---

# 15. 规则执行结果

```ts
export interface RuleMatch {
  ruleId: string;
  ruleType: RuleType | "dismissed";
  label: string;
  matchedField?: RuleField;
  matchedText?: string;
}

export interface EvaluationResult {
  visible: boolean;
  reasons: RuleMatch[];

  distance?: {
    centreDistanceKm: number;
    conservativeDistanceKm: number;
    confidence: LocationConfidence;
    originUncertaintyKm: number;
    destinationUncertaintyKm: number;
  };
}
```

一个职位可能同时命中多个规则。

例如：

```text
隐藏原因：
- 标题包含 cleaning
- 距离约 62 km
```

UI 默认只显示首要原因，但诊断信息保留全部原因。

---

# 16. 规则执行顺序

规则执行顺序：

```text
1. 不感兴趣状态
2. 公司排除
3. 类别排除
4. 关键词排除
5. 距离排除
```

伪代码：

```ts
export function evaluateJob(
  job: NormalizedJob,
  context: EvaluationContext
): EvaluationResult {
  const reasons: RuleMatch[] = [];

  if (context.jobState?.status === "dismissed") {
    reasons.push(createDismissedReason());
  }

  reasons.push(...evaluateCompanyRules(job, context.rules));
  reasons.push(...evaluateCategoryRules(job, context.rules));
  reasons.push(...evaluateKeywordRules(job, context.rules));

  const distanceResult = evaluateDistance(job, context);
  if (distanceResult.match) {
    reasons.push(distanceResult.match);
  }

  return {
    visible: reasons.length === 0,
    reasons,
    distance: distanceResult.metadata,
  };
}
```

所有规则是负向规则。

扩展不得自行决定一个职位“更适合”用户，也不得按自己的评分重排网站结果。

---

# 17. 页面 DOM 处理

## 17.1 不删除卡片

隐藏职位时不得调用：

```ts
card.remove();
```

应添加扩展专属 class：

```text
jobfilter-hidden
```

例如：

```css
.jobfilter-hidden {
  display: none !important;
}
```

这样可以：

* 随时恢复；
* 支持“显示已隐藏职位”；
* 避免网站框架因节点消失产生异常；
* 保留原页面顺序。

## 17.2 卡片处理标记

```html
<article
  data-jobfilter-processed="1"
  data-jobfilter-adapter-version="3"
  data-jobfilter-job-key="seek-nz:12345678"
>
```

不要只使用一个永久 `processed` 标记。

以下情况需要重新处理：

* 规则版本变化；
* 适配器版本变化；
* 职位卡片内容变化；
* 通勤起点变化；
* 最大距离变化；
* 用户恢复职位；
* 页面发生 SPA 导航。

建议维护：

```ts
interface ProcessingSignature {
  jobHash: string;
  adapterVersion: number;
  configurationRevision: number;
}
```

## 17.3 MutationObserver

Observer 只监听适配器返回的职位列表容器：

```ts
observer.observe(listRoot, {
  childList: true,
  subtree: true,
});
```

不得默认监听：

```ts
attributes: true
characterData: true
```

新增节点批量放入队列：

```text
MutationObserver
→ collect candidate nodes
→ queueMicrotask / requestAnimationFrame
→ deduplicate
→ process batch
```

建议防抖范围：

```text
50–150ms
```

## 17.4 SPA 页面变化

实现 `UrlWatcher`：

* 监听 `popstate`；
* 定期比较 `location.href`；
* 检测页面签名变化；
* URL 改变后清理旧 Observer；
* 重新运行适配器检测；
* 不修改网站的 History API。

---

# 18. 当前页统计 UI

在职位结果列表顶部加入一个轻量状态条：

```text
Kiwi Job Search Enhancer
Scanned 22 · Shown 9 · Hidden 13
[Show hidden jobs] [Settings]
```

展开后显示：

```text
Keyword: 8
Category: 2
Distance: 2
Dismissed: 1
Distance unavailable: 3
```

“地点未知”不属于隐藏数。

## 显示已隐藏

启用后：

* 隐藏卡片重新显示；
* 卡片降低透明度；
* 显示隐藏原因；
* 可以恢复“不感兴趣”职位；
* 不改变规则。

---

# 19. 职位卡片增强

每张卡片右上角或操作区域加入：

```text
[Dismiss]
```

已处理职位可附加小型状态：

```text
Approx. 18 km
Seen
```

不得：

* 覆盖网站原有按钮；
* 阻止职位链接点击；
* 改变网站申请流程；
* 使用与网站按钮完全相同的视觉样式；
* 冒充 SEEK 或 Trade Me 官方功能。

所有 CSS class 使用前缀：

```text
jobfilter-
```

DOM 节点使用：

```text
data-jobfilter-*
```

---

# 20. Side Panel 设计

侧边栏包含五个页面。

## 20.1 当前页面

显示：

* 当前网站；
* 当前页扫描数；
* 可见数；
* 隐藏数；
* 隐藏原因；
* 地点解析数量；
* 适配器状态；
* 显示/隐藏过滤结果开关。

## 20.2 排除规则

分组：

### 关键词

```text
clean*
housekeeping
door to door
```

每条规则可：

* 启用；
* 停用；
* 编辑；
* 删除；
* 选择匹配字段；
* 选择匹配模式。

### 类别

```text
Cleaning Services
Housekeeping
```

### 公司

```text
Example Recruitment
```

## 20.3 距离

显示：

```text
通勤起点：已保存的位置
定位精度：约 1.2 km
最大距离：40 km
距离类型：直线近似距离
```

按钮：

* 使用当前位置；
* 将当前位置保存为通勤起点；
* 从地点列表选择；
* 更新定位；
* 清除位置；
* 关闭距离筛选。

## 20.4 不感兴趣

列表字段：

* 标题；
* 公司；
* 地点；
* 来源；
* 隐藏时间；
* 原因；
* 恢复按钮。

支持搜索和批量清除过期记录。

## 20.5 设置与诊断

包含：

* 中文/英文界面；
* 显示距离开关；
* 显示已看过标记；
* 导出设置；
* 导入设置；
* 清除本地数据；
* 适配器版本；
* 最近一次解析状态；
* 调试日志开关。

---

# 21. 定位功能设计

## 21.1 插件能获得什么

用户点击“使用当前位置”后，扩展可以获得：

```ts
interface BrowserPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestamp: number;
}
```

定位结果不是完整地址。

第一版不需要知道：

* 门牌号；
* 街道名称；
* 邮编；
* 用户住址文本。

计算距离只需要：

```text
纬度 + 经度
```

定位的 `accuracy` 表示一个以米为单位的置信范围。`geolocation` 是安装时权限，不能作为 Chrome optional permission；因此产品必须把“用户主动点击按钮”作为调用边界，不能把“运行时一定再次弹窗”写进交互承诺。

## 21.2 请求定位方式

只从扩展侧边栏页面调用：

```ts
navigator.geolocation.getCurrentPosition(
  onSuccess,
  onError,
  {
    enableHighAccuracy: false,
    timeout: 10_000,
    maximumAge: 5 * 60 * 1000,
  }
);
```

不得从 SEEK 或 Trade Me content script 自动调用定位。

## 21.3 保存通勤起点

```ts
export interface CommuteOrigin {
  id: string;
  label: string;

  latitude: number;
  longitude: number;

  accuracyMeters: number | null;
  uncertaintyKm: number;

  countryCode: string;
  knownLocationId: string | null;

  source:
    | "browser-geolocation"
    | "known-place"
    | "manual-coordinate";

  createdAt: number;
  updatedAt: number;
}
```

经纬度本地保存时建议四舍五入至小数点后三位：

```text
在新西兰约 85–111 米级
```

这已经足够进行城镇间通勤距离筛选，同时避免保存不必要的精确位置。

通勤起点只存储在：

```text
chrome.storage.local
```

不得进入：

```text
chrome.storage.sync
```

不得上传远程服务。

## 21.4 为什么还要支持手动起点

浏览器当前位置可能是：

* 怀卡托大学；
* 图书馆；
* 咖啡馆；
* 用户当天所在地点；
* IP 推测位置。

这未必是实际通勤起点。

因此 v1 用户必须能够在以下方式中选择一个当前通勤起点：

* 将当前位置保存为通勤起点；
* 从全国地点列表选择 Hamilton、Cambridge、Christchurch 等地点；
* 清除当前起点。

浏览器定位的 `uncertaintyKm` 取 `accuracyMeters / 1000`，并为三位小数坐标舍入额外加 0.1 km；已知地点起点使用地点数据的 `uncertaintyKm`；手动坐标至少使用 0.1 km 舍入误差，且 UI 必须明确它由用户自行输入。多起点命名、保存和切换留到后续 Profile 功能。

---

# 22. 职位地点解析

职位卡片可能写：

```text
Hamilton Central, Waikato
Cambridge, Waikato
Te Awamutu, Waikato
Waikato
Hamilton & Cambridge
Work from home
Hybrid
Multiple locations
```

## 22.1 全国地点数据

扩展包内附带构建后的 `nz-locations` 数据集，覆盖新西兰全国，包括 North Island、South Island、Stewart Island / Rakiura、Chatham Islands 和数据源覆盖的近海岛屿。Waikato 不是独立数据包。

构建覆盖报告至少验证：Northland、Auckland、Waikato、Bay of Plenty、Gisborne、Hawke's Bay、Taranaki、Manawatū-Whanganui、Wellington、Tasman、Nelson、Marlborough、West Coast、Canterbury、Otago 和 Southland；岛屿覆盖按数据源实际记录验证。

优先数据源：

* LINZ NZ Suburbs and Localities；
* LINZ New Zealand Gazetteer；
* 仓库内经过人工检查的别名补充文件。

具体坐标和边界必须由许可清晰的数据源生成，不得由开发者或 Codex 凭记忆填写。Gazetteer 只允许导入与职位地点相关的 populated place/locality 类型，类型 allowlist 和排除数量必须进入构建记录。构建清单必须记录来源名称、下载地址或 layer id、数据版本或下载日期、许可证、输入文件 SHA-256 和记录数量；许可证以下载时该数据集页面的声明为准，不得仅依据“多数 LINZ 数据”为 CC BY 4.0 的概括。

发布包不得包含原始 polygon。构建脚本把运行时数据输出到 `public/data/locations/nz/`，只包含代表点、近似覆盖半径、名称、别名、类型和地区标识：

```ts
export interface KnownLocation {
  id: string;
  canonicalName: string;
  majorName: string | null;
  aliases: string[];

  latitude: number;
  longitude: number;
  uncertaintyKm: number;

  localityType:
    | "suburb"
    | "locality"
    | "town"
    | "city"
    | "district"
    | "region";

  regionCode: string | null;
  countryCode: "NZ";
}

export interface LocationDatasetManifest {
  id: "nz-locations";
  countryCode: "NZ";
  version: string;
  generatedAt: string;
  sources: Array<{
    name: string;
    url: string;
    version: string;
    licence: string;
    sha256: string;
  }>;
  sourceRecordCount: number;
  excludedRecordCount: number;
  locationCount: number;
}
```

对于 polygon，构建脚本使用位于面内的代表点，并计算能覆盖该面的近似半径作为 `uncertaintyKm`。只有点坐标的 Gazetteer 记录使用按 feature type 明确记录且可测试的保守半径映射；不得给所有地点写死同一个半径。district 和 region 可进入索引用于消歧义和展示，但单独命中时不参与自动距离隐藏。

署名随数据保存在 `public/data/locations/nz/ATTRIBUTION.md`，至少说明来源、许可证、修改方式和数据版本。若实际数据集为 CC BY 4.0，可使用经核对后的以下表述：

```text
Contains data sourced from Toitū Te Whenua Land Information New Zealand,
licensed for reuse under CC BY 4.0.
Data has been filtered, normalised and supplemented with aliases.
```

## 22.2 地点提供者接口

```ts
export interface LocationResolution {
  candidates: KnownLocation[];
  confidence: LocationConfidence;
  distanceEligible: boolean;
  reason: string | null;
}

export interface LocationProvider {
  readonly id: string;
  readonly countryCode: string;
  readonly dataVersion: string;

  normalizeLocationText(input: string): string;
  resolveLocation(input: string): LocationResolution;
  getLocationById(id: string): KnownLocation | null;
  searchLocations(query: string, limit?: number): KnownLocation[];
}

export class NewZealandLocationProvider implements LocationProvider {
  readonly id = "nz-locations";
  readonly countryCode = "NZ";
}
```

规则引擎只接收解析结果和坐标，不直接依赖 LINZ 文件结构或新西兰名称规则。v1 只有一个 provider；registry 只负责取得当前 provider，不实现动态插件系统。

LocationProvider 运行在 background service worker。距离筛选启用时，它从扩展包内部 URL 按需读取 compact JSON，批量解析当前页地点，并在当前 service worker 生命周期内缓存索引；浏览器挂起并重启 service worker 后允许重新初始化。不得调用外部 geocoding 服务。

## 22.3 地点匹配算法

全国范围内存在 Richmond 等重名地点，不能只用“最长 alias 命中即唯一结果”。步骤：

1. 规范化职位地点文本，同时保留带 macron 和无 macron 的索引；
2. 优先匹配包含 locality、major name 和 region 的组合别名；
3. 按 alias 长度从长到短寻找候选，优先更具体的地点类型；
4. 使用同一字符串中的 major name、region 和网站提供的地区上下文消歧义；
5. 无法唯一消歧时返回全部合理候选，不猜一个地点；
6. 对 `Hamilton / Cambridge` 等文本保留多个明确地点；
7. 计算置信度和是否允许距离排除。

`Hamilton Central, Waikato` 应优先匹配 Hamilton Central，而不是只匹配 Hamilton。对多个合理候选，只有所有候选的保守距离都超过上限时才可隐藏；等价实现可以取最小保守距离。

## 22.4 置信度

```ts
export type LocationConfidence =
  | "high"
  | "medium"
  | "low"
  | "unknown";
```

规则：

### High

* 精确匹配已知 suburb 或 town；
* 地点文本包含 locality + major name 或 region；
* 只有一个明确候选。

### Medium

* 匹配 city 名称；
* 文本存在额外模糊内容；
* 有多个相近候选但可合理选择。

### Low

* 只有 district；
* 地点非常宽泛；
* 多个相距较远候选。

### Unknown

* Remote；
* Work from home；
* Multiple locations 且无法解析；
* 地点字段为空。

## 22.5 未知和宽泛地点处理

默认策略：

```text
地点未知、只有 district 或 region → 保留职位
```

不得因为无法计算距离而隐藏。region 和 district 可以用于消歧义，但不能仅用其中心点过滤职位。

UI 显示：

```text
Distance unavailable
```

---

# 23. 距离算法

第一版使用 Haversine 公式计算球面直线距离。

```ts
export function haversineKm(
  a: Coordinates,
  b: Coordinates
): number {
  const earthRadiusKm = 6371.0088;

  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);

  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  const clamped = Math.min(1, Math.max(0, value));

  return (
    2 *
    earthRadiusKm *
    Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped))
  );
}
```

必须标注：

```text
近似直线距离，不是驾车距离
```

---

# 24. 保守距离过滤

职位地点通常只是 suburb 或 town，不是准确工作地址。

不能简单使用：

```text
城镇中心距离 > 最大距离
→ 隐藏
```

应考虑：

* 通勤起点不确定范围；
* 职位地点区域大小；
* 地点解析置信度。

计算：

```ts
const centreDistanceKm = haversineKm(origin, destination);

const conservativeDistanceKm = Math.max(
  0,
  centreDistanceKm
    - origin.uncertaintyKm
    - destination.uncertaintyKm
);
```

只有当：

```ts
conservativeDistanceKm > maximumKm
```

才隐藏职位。

示例：

```text
城镇中心距离：43 km
地点不确定范围：6 km
用户定位误差：1 km

保守距离：
43 - 6 - 1 = 36 km
```

如果用户最大距离是 40 km，则职位保留。

这样可以减少误删边界附近职位。

## 24.1 多地点职位

如果解析出多个地点：

```text
Hamilton / Cambridge
```

使用距离最近的有效地点。

逻辑：

```ts
minimum conservative distance
```

只要其中一个地点在范围内，就保留职位。

## 24.2 宽泛地区

如果只有：

```text
Waikato
```

不计算距离，不隐藏。

## 24.3 Remote 和 Hybrid

建议：

```text
Remote / Work from home → 不做距离排除
Hybrid + 可识别地点 → 显示距离，但默认不隐藏
```

后续可以增加独立配置。

---

# 25. 存储设计

Chrome 的 `storage.local` 当前默认约为 10 MB，`storage.sync` 总量约为 100 KB，并有单项和写入频率限制。`storage.sync` 会随浏览器账户同步，因此只用于非敏感公开偏好；个人规则、位置和不断增长的职位状态默认不得放入 sync。

## 25.1 chrome.storage.sync

只保存 Level 0 公开偏好：

```ts
interface SyncedPreferences {
  schemaVersion: number;
  locale: AppLocale;
  ui: UiSettings;
}
```

不保存：

* 排除规则和 Profile；
* 精确位置；
* 职位历史；
* 诊断日志。

## 25.2 chrome.storage.local

保存：

* 通勤起点；
* `LocalFilterSettings`（规则、默认 Profile 和 activeProfileId）；
* 当前页面临时配置；
* 适配器健康状态；
* 数据库元数据；
* 设置导入导出信息。

## 25.3 IndexedDB

职位状态使用 IndexedDB。

数据库：

```text
jobfilter
```

表：

```text
jobStates
metadata
```

职位状态：

```ts
export type PersonalJobStatus =
  | "seen"
  | "dismissed";

export interface JobStateRecord {
  key: string;
  source: SiteId;
  identityBasis: "external-id" | "canonical-url";
  externalId: string | null;
  canonicalUrl: string | null;

  title: string;
  company: string | null;
  locationText: string | null;

  status: PersonalJobStatus;
  dismissReason: string | null;

  firstSeenAt: number;
  lastSeenAt: number;
  statusUpdatedAt: number;
}
```

## 25.4 数据保留

默认：

```text
seen：90 天
dismissed：不自动删除，只能由用户恢复或清除
diagnostics：30 天
```

清理任务只在扩展被用户使用时运行，不使用后台高频定时任务。

## 25.5 隐私分层

* Level 0：语言和普通 UI 偏好，可放 `storage.sync`；
* Level 1：排除规则、公司/类别黑名单和 Profile，v1 默认只放 `storage.local`；
* Level 2：看过、隐藏及其时间，只放本地 IndexedDB；
* Level 3：通勤起点、浏览器定位和手动坐标，只放 `storage.local`。

Level 1–3 不得进入广告、普通日志或默认同步。所有本地数据必须支持一键删除。未来若增加同步或导出，必须分别取得明确选择，并对位置数据单独确认。

---

# 26. Content Script 与后台通信

内容脚本不得直接管理 IndexedDB。

使用类型安全消息：

```ts
export type ExtensionMessage =
  | {
      type: "GET_PAGE_CONTEXT";
      payload: {
        siteId: SiteId;
        jobs: Array<{
          key: string;
          locationText: string | null;
        }>;
      };
    }
  | {
      type: "DISMISS_JOB";
      payload: {
        job: NormalizedJob;
        reason: string | null;
      };
    }
  | {
      type: "RESTORE_JOB";
      payload: {
        jobKey: string;
      };
    }
  | {
      type: "MARK_SEEN";
      payload: {
        job: NormalizedJob;
      };
    }
  | {
      type: "GET_PREFERENCES";
  }
  | {
      type: "SET_PREFERENCES";
      payload: SyncedPreferences;
    }
  | {
      type: "GET_FILTER_SETTINGS";
    }
  | {
      type: "SET_FILTER_SETTINGS";
      payload: LocalFilterSettings;
    };
```

所有 payload 使用 Zod 校验。

后台收到未知消息时必须拒绝。

`GET_PAGE_CONTEXT` 一次返回当前规则、对应职位状态和批量地点解析结果。内容脚本再用这些数据运行纯 Rule Engine；不得为每张卡片分别请求状态或地点。

---

# 27. Side Panel 与页面同步

background 和扩展页面使用 `chrome.storage.onChanged`，background 再通过 `chrome.runtime` 广播给 content script。content script 不直接读取 storage。

Side Panel 只用 `chrome.tabs.query()` 取得当前 tab id，不读取需要 `tabs` 权限的敏感字段。页面类型和统计由该 tab 的 content script 上报，background 按 `sender.tab.id` 保存当前会话摘要，因此 v1 不申请 `tabs` 权限。

工作流：

```text
用户在侧边栏添加排除词
→ 保存规则
→ configurationRevision + 1
→ 广播 SETTINGS_CHANGED
→ 当前 SEEK/Trade Me content script 重新评估已有卡片
```

不得要求用户刷新页面。

同理：

```text
用户更新最大距离
→ 当前页面重新计算距离
```

---

# 28. 适配器健康检查

每个页面加载后运行：

```ts
interface AdapterHealthResult {
  status: "healthy" | "degraded" | "broken";

  detectedCardCount: number;
  extractedJobCount: number;
  missingIdCount: number;
  missingUrlCount: number;
  missingTitleCount: number;
  missingLocationCount: number;

  selectorVersion: number;
  checkedAt: number;
}
```

状态规则：

### Healthy

* 页面明确显示“无结果”；或
* 至少 90% 已检测卡片可提取标题，并能从 ID、URL 或 fallback fingerprint 生成身份；
* 无关键异常。

### Degraded

* 提取成功率在 50%（含）到 90% 之间，或非关键字段大量缺失；
* 仍然能安全运行关键词或状态规则。

### Broken

* 页面明显是职位列表、没有“无结果”状态，但找不到职位卡片；
* 标题或身份提取成功率低于 50%；
* DOM 结构不符合预期。

Broken 时：

* 不隐藏任何职位；
* 显示“网站页面结构可能已更新”；
* 提供复制诊断摘要按钮；
* 不复制完整 HTML。

---

# 29. 日志要求

默认关闭详细日志。

日志不得包含：

* 完整页面 HTML；
* Cookie；
* 登录信息；
* 完整精确坐标；
* 用户浏览历史；
* 职位完整描述。

允许日志：

```text
adapter id
adapter version
页面路径类型
找到的卡片数量
提取成功数量
字段缺失计数
规则命中计数
错误代码
```

生产版本不得大量输出到控制台。

---

# 30. 安全要求

必须：

* TypeScript strict mode；
* 禁止 `eval`；
* 禁止 `new Function`；
* 禁止远程 JavaScript；
* 不注入 page main world，除非确有必要；
* 优先使用 isolated content script world；
* 用户输入展示前转义；
* 用户关键词不转成任意正则；
* 规则保存前校验：pattern 规范化后非空且不超过 200 字符、fields 非空、`maximumKm` 为有限正数；
* 坐标保存前校验：latitude 在 -90 到 90、longitude 在 -180 到 180，所有数值必须有限；
* 所有 runtime 消息验证来源和结构；
* 后台只接受本扩展发出的消息，并核对 sender tab URL 是否属于对应 Site Adapter；
* 将 `storage.local` 和 `storage.sync` 的访问级别限制为 trusted contexts，content script 通过消息访问；
* 外部链接只打开原始职位 URL；
* 不保存身份认证数据；
* 不请求不必要的浏览器权限。

导入文件在 `JSON.parse` 前限制为 10 MB；超过限制直接拒绝。导入后的每个对象仍按当前 schema 校验，不因文件来自本机而信任。

---

# 31. 性能要求

以下数字是开发基准目标，不是未定义设备上的绝对保证。基准必须记录浏览器版本、机器、fixture、规则数量和冷热启动状态：

* 100 张职位卡片初次规则评估不超过 250ms；
* MutationObserver 单批处理不阻塞主线程超过 50ms；
* 单张卡片不得创建独立 Observer；
* 每个职位列表最多一个 MutationObserver；
* 规则变化时批量重新处理；
* IndexedDB 查询按职位 key 批量执行；
* 不为每个职位分别发送 runtime 消息；
* 地点索引按需初始化，并在当前 background service worker 生命周期内复用；
* 不重复读取整个数据库。

全国地点数据构建后必须记录压缩前后体积、记录数、首次加载时间和典型/重名查询耗时。若未先测量，不引入搜索服务或数据库依赖。

批量上下文请求：

```ts
GET_PAGE_CONTEXT({
  jobs: [...]
});
```

而不是：

```text
每张卡片发送一次 GET_JOB_STATE
```

---

# 32. 无障碍要求

扩展加入的按钮必须：

* 使用真实 `<button>`；
* 支持键盘 Tab；
* 支持 Enter 和 Space；
* 提供 `aria-label`；
* 焦点样式清晰；
* 不只依赖颜色表达状态。

例：

```tsx
<button type="button" aria-label={t("job.dismissAriaLabel")}>
  {t("job.dismiss")}
</button>
```

---

# 33. 国际化

v1 运行时界面支持：

```text
English (New Zealand) — en-NZ（默认）
简体中文 — zh-CN（用户手动切换）
```

即使浏览器或操作系统是中文，在没有已保存语言偏好时，首次启动的 Side Panel、Options 和注入页面按钮仍使用 `en-NZ`。语言选择保存到 `storage.sync`，切换后所有运行时界面立即更新，不要求刷新招聘网站；若同一用户的浏览器同步中已有明确选择，则恢复该选择不属于按浏览器语言自动切换。

国际化分两层：

### Manifest 和商店元数据

```text
public/_locales/en/messages.json
public/_locales/zh_CN/messages.json
```

Manifest 使用：

```json
{
  "default_locale": "en"
}
```

Chrome/Edge 的 Manifest 本地化由浏览器 locale 决定，用户不能通过扩展设置切换。因此中文浏览器可能在扩展管理页看到中文名称或描述；“运行时默认英文”不得错误解释为强制浏览器外壳也显示英文。

### 扩展运行时界面

```text
src/i18n/en-NZ.json
src/i18n/zh-CN.json
```

使用由设置控制的 translation service，不直接使用浏览器当前 locale：

```ts
export type AppLocale = "en-NZ" | "zh-CN";

export interface TranslationService {
  getLocale(): AppLocale;
  setLocale(locale: AppLocale): Promise<void>;
  t(
    key: TranslationKey,
    parameters?: Record<string, string | number>,
  ): string;
}
```

所有用户可见文本必须通过 translation key 获取。英文 key 和文案先完成，中文基于相同 key 翻译；地点和职位原始文本不翻译。

v1 文案基准：

```text
Kiwi Job Search Enhancer Kiwi Job Search Enhancer
Dismiss                  不感兴趣
Undo                     撤销
Seen                     已查看
Hidden                   已隐藏
Show hidden jobs         显示隐藏职位
Approx. 18 km            约 18 公里
Distance unavailable     距离未知
Use my current location  使用当前位置
Maximum distance         最大距离
Exclusion rules          排除规则
Keyword                  关键词
Category                 类别
Company                  公司
Current page             当前页面
Settings                 设置
Language                 语言
Privacy                  隐私
```

CI 必须验证两种语言 key 完全一致、不存在空翻译、placeholder 一致、默认 locale 为 `en-NZ`，并测试切换后无需刷新页面。

---

# 34. 设置导入导出

导出 JSON：

```ts
interface ExportBundle {
  format: "jobfilter";
  version: 1;
  exportedAt: string;

  preferences: SyncedPreferences;
  filterSettings: LocalFilterSettings;

  origins?: CommuteOrigin[];

  jobStates?: JobStateRecord[];
}
```

导入时：

* 校验版本；
* 校验 schema；
* 展示将导入的记录数量；
* 不自动覆盖；
* 支持合并；
* 支持仅导入规则；
* 不导入未知字段。

位置数据默认不包含在导出中，除非用户主动勾选。

---

# 35. 测试方案

## 35.1 单元测试

必须覆盖：

* 文本规范化；
* macron 处理；
* wildcard 匹配；
* 类别匹配；
* 公司匹配；
* Haversine 距离；
* 保守距离；
* 多地点选择；
* unknown 地点策略；
* 全国重名地点消歧；
* district/region 单独命中时不隐藏；
* LocationProvider contract；
* 地点数据 manifest 和输入哈希；
* 职位 ID；
* URL 规范化；
* fallback fingerprint；
* schema migration；
* 数据保留清理。
* 英文默认语言和中英文 key/placeholder 一致性。

## 35.2 Adapter Contract Test

每个适配器使用人工构造的最小 HTML fixture。

不得将整份 SEEK 或 Trade Me 页面 HTML 提交到仓库。

测试：

```text
能找到卡片
能提取标题
有 URL 时能规范化 URL
有 ID 时能提取 ID
缺少 ID 或 URL 时能按身份优先级回退
能提取公司
能提取地点
字段缺失时 fail-open
重复处理不重复注入按钮
```

## 35.3 集成测试

模拟：

* 首次页面扫描；
* 新增卡片；
* 规则改变；
* 不感兴趣；
* 撤销；
* 翻页后的新 DOM；
* SPA URL 变化；
* 适配器失败；
* 数据库迁移。

## 35.4 E2E 测试

使用 Playwright Bundled Chromium 加载扩展，对本地 fixture 网站进行测试。

Playwright 当前的扩展测试文档要求使用其打包的 Chromium 来侧载扩展。

E2E 必测：

1. 扩展加载；
2. Side Panel 打开；
3. 新建关键词规则；
4. 当前页卡片隐藏；
5. 显示已隐藏；
6. 点击不感兴趣；
7. 刷新后仍隐藏；
8. 恢复后显示；
9. 新增 DOM 卡片自动过滤；
10. 距离超限职位隐藏；
11. unknown 地点不隐藏；
12. 首次运行默认英文；
13. 切换中文后 Side Panel 和页面按钮无需刷新即更新。

## 35.5 线上手工 Smoke Test

只允许人工打开真实 SEEK 和 Trade Me 页面验证：

* 是否识别职位卡片；
* 是否正确显示按钮；
* 是否影响原页面；
* 是否正常翻页；
* 是否正常打开职位；
* 是否出现控制台错误。
* Chrome Stable 与 Edge Stable 的 Side Panel 是否行为一致。

不得将真实网站加入自动化持续测试。

---

# 36. 验收标准

## AC01：关键词过滤

给定规则：

```text
clean*
```

当标题为：

```text
Part-time Commercial Cleaner
```

职位必须隐藏，并显示原因：

```text
标题匹配：clean*
```

## AC02：当前页限制

当前页面过滤后只剩 3 个职位时：

* 不自动加载下一页；
* 不自动点击分页；
* 不发送额外职位列表请求。

## AC03：翻页

用户手动进入第 2 页后，新页面职位必须自动应用相同规则。

## AC04：无限滚动

用户滚动后网站新增职位卡片，新卡片必须在出现后自动过滤。

## AC05：不感兴趣

用户隐藏一个职位后：

* 当前卡片消失；
* 刷新后仍隐藏；
* 有稳定职位 ID 或 URL 时，其他搜索结果中出现同一职位仍隐藏；
* 用户可恢复。

## AC06：地点未知

职位地点为：

```text
Waikato
```

距离规则不得隐藏该职位。

## AC07：边界距离

最大距离：

```text
40 km
```

中心距离：

```text
43 km
```

地点不确定范围：

```text
6 km
```

职位必须保留。

## AC08：明确超距

最大距离：

```text
40 km
```

中心距离：

```text
70 km
```

地点不确定范围：

```text
5 km
```

职位必须隐藏。

## AC09：定位不可用

用户点击定位后，操作系统定位不可用、扩展权限被撤销或 API 返回错误时：

* 其他筛选功能正常；
* UI 提示可改用地点列表；
* 不自动重试或循环请求定位。

## AC10：适配器故障

网站 DOM 无法识别时：

* 不隐藏任何职位；
* 显示适配器异常；
* 网站自身功能保持正常。

## AC11：无额外抓取

通过浏览器 Network 面板验证：

* 插件不请求 SEEK 职位接口；
* 插件不请求 Trade Me 职位接口；
* 插件不请求职位详情；
* 插件不主动请求下一页。

## AC12：默认语言

在中文浏览器环境首次安装且没有已同步语言偏好时：

* Side Panel、Options 和页面内扩展按钮使用 English (New Zealand)；
* 用户手动切换中文后立即更新；
* 招聘网站原始职位文本不翻译。

## AC13：全国重名地点

当地点名称在新西兰存在多个合理候选且没有 major name 或 region 上下文时：

* 不任意选择一个候选；
* 只在所有合理候选的保守距离均超限时隐藏；
* 无法安全判断时保留职位。

## AC14：最小权限

发布 Manifest：

* 不包含 `https://*/*`；
* 静态 content script 与 `host_permissions` 不重复申请同一站点权限；
* 不包含未被 v1 功能使用的权限；
* `geolocation` 只因 v1 当前定位功能保留，且 API 只在用户点击后调用。

---

# 37. 开发里程碑

## M0：项目脚手架

交付：

* WXT + React + TypeScript；
* Manifest V3；
* background；
* side panel；
* lint；
* typecheck；
* Vitest；
* CI。

验收：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

全部通过。

## M1：核心领域模型

交付：

* NormalizedJob；
* JobIdentity；
* 规则模型；
* 文本规范化；
* wildcard；
* Rule Engine；
* 单元测试。

此阶段不得接入真实网站 DOM。

## M2：存储与消息

交付：

* IndexedDB；
* settings repository；
* job state repository；
* migration；
* runtime messaging；
* 批量状态读取；
* 单元和集成测试。

## M3：通用页面处理器

交付：

* CardProcessor；
* MutationController；
* UrlWatcher；
* IntersectionObserver；
* page summary；
* 卡片操作按钮；
* fail-open；
* 只面向本地 fixture 的测试 content script。

使用本地假页面测试。

## M4：SEEK Adapter

交付：

* SEEK URL 检测；
* SEEK 静态 content script 与精确 match pattern；
* 列表容器识别；
* 职位卡片识别；
* 字段提取；
* 卡片装饰；
* 健康检查；
* 手工 Smoke Test。

只处理当前 DOM。

## M5：Trade Me Adapter

交付内容与 M4 相同，并增加 Trade Me 静态 content script 与精确 match pattern。

## M6：Side Panel

交付：

* 规则管理；
* 页面统计；
* 不感兴趣记录；
* 设置；
* 导入导出；
* 诊断；
* 默认英文与手动中文切换。

## M7：地点与距离

交付：

* 用户定位；
* 通勤起点；
* 全国 NZ LocationProvider；
* 可复现的地点数据构建脚本；
* 全国 alias resolver 和重名消歧；
* Haversine；
* 保守距离；
* 距离 UI；
* 数据署名；
* 单元测试。

## M8：稳定性与发布

交付：

* Playwright 本地 fixture E2E；
* 权限检查；
* 性能检查；
* 可访问性；
* README；
* Product landing page、Privacy Policy、Terms、Support、Contact、Changelog；
* 数据删除、第三方署名、支持网站和已知限制页面；
* 手工安装包；
* Chrome ZIP 和 Edge ZIP；
* 平台书面许可或允许发布的合格法律意见；
* 当时有效的网站条款与商店政策发布复核。

## 37.1 发布阶段

```text
0.x Internal
→ 开发者自用，Hamilton / Waikato 为主要测试样例，不收费

0.x Beta
→ 仅在通过第 2.1 节门槛后邀请小范围新西兰用户，覆盖 Auckland、Wellington、Christchurch、Dunedin 等地区

1.0 Free Public Release
→ 全国地点、两家首发网站、英文默认、中文可选、无广告、local-first

1.x Commercial Validation
→ 只做主动选择的需求访谈或反馈，不上传坐标，不出售浏览数据

2.0 Pro
→ 仅在用户需求、维护成本、平台条款和商店审核均验证后开始
```

“Internal”或“Beta”标签本身不构成平台授权；任何向第三方分发的 Beta 都受第 2.1 节阻断条件约束。

---

# 38. Codex 工作规则

Codex 必须遵守：

1. 每次只实现一个里程碑；
2. 开始前阅读本说明书；
3. 不擅自增加网站请求；
4. 不擅自增加权限；
5. 不把站点选择器写入核心模块；
6. 不在缺少字段时猜测；
7. 所有解析失败均 fail-open；
8. 每个新功能必须有测试；
9. 修改数据结构必须增加 migration；
10. 提交前运行 lint、typecheck、test 和 build；
11. 不使用任意正则处理用户输入；
12. 不保存完整职位描述；
13. v1 和未明确批准的里程碑不创建远程后端；
14. 不实现自动翻页；
15. 不修改网站已有筛选控件。
16. 运行时默认语言固定为 `en-NZ`，不得按浏览器语言自动改为中文；
17. 不凭记忆填写地点坐标，全国数据必须由已记录许可和版本的数据集生成；
18. 不为未来网站、商业化或同步提前申请权限或创建空模块；
19. 不使用 SEEK、Trade Me、Chrome 或 Edge 作为产品品牌，也不使用第三方 Logo。

---

# 39. 建议给 Codex 的第一条指令

```text
请以《Kiwi Job Search Enhancer 浏览器扩展产品需求与技术开发说明书
v1.1（合并版）》作为唯一产品规格。

当前只实施 M0 和 M1，不接入 SEEK 或 Trade Me，不编写真实网站选择器。

要求：
1. 使用 WXT、React、TypeScript、pnpm 和 Manifest V3。
2. 开启 TypeScript strict。
3. 仓库名使用 job-filter-extension，内部 namespace 使用 jobfilter；
   只建立 M0/M1 实际使用的目录。
4. 实现 NormalizedJob、JobIdentity、FilterRule、
   normalizeText、wildcard matcher 和 RuleEngine。
5. wildcard 只支持末尾星号形式，例如 clean*。
6. RuleEngine 必须是纯 TypeScript，不依赖 DOM、React 或 Chrome API。
7. 默认运行时语言为 en-NZ；M0/M1 只建立最小翻译基础，不实现完整 UI。
8. 添加覆盖本里程碑非平凡逻辑的 Vitest 测试。
9. 添加 lint、typecheck、test、build 脚本。
10. M0/M1 不声明 geolocation 或未来网站权限；到使用它们的里程碑再添加。
11. 完成后输出：
    - 文件变更摘要；
    - 测试结果；
    - 未完成事项；
    - 下一里程碑建议。

禁止：
- 自动抓取；
- 网络请求；
- 自动翻页；
- 真实网站 DOM 解析；
- 添加后端；
- 使用任意正则表达式。
```

---

# 40. 最终产品判断标准

这个扩展成功的标准不是“收集了多少职位”，而是：

```text
用户继续正常使用 SEEK 和 Trade Me，
但每一页看到的都是经过个人负向筛选后的结果，
而且已经拒绝过的职位不会反复出现。
```

第一版应保持：

```text
简单
本地
透明
可撤销
不主动抓取
解析失败不误删
```

产品面向新西兰全国，Waikato 只作为测试样例。扩展架构必须允许未来通过新增一个 Site Adapter 支持其他招聘网站，而不修改规则引擎、位置系统、数据库和主要 UI；未来增加国家时通过新的 LocationProvider 接入，不把国家规则写入距离引擎。

公开发布的成功还要求：权限与实际功能一致、英文默认界面可用、全国地点数据有可复现来源与署名、Chrome/Edge 均通过手工 Smoke Test，并已取得第 2.1 节要求的平台许可或法律意见。

---

# 41. 开发与发布前待验证事项

以下事项不能仅靠本说明书证明完成，必须留下实际验证记录：

1. **网站适配器：** 在真实 SEEK NZ 和 Trade Me Jobs 的当前桌面页面上，分别验证登录/未登录、分页/动态加载和常见响应式宽度；规格不能保证 DOM 选择器长期稳定。
2. **字段可用性：** 记录两站职位卡片实际提供的 ID、URL、公司、地点、类别和摘要；类别或地点缺失时继续 fail-open，不通过详情页请求补齐。
3. **地点数据：** 运行全国构建脚本，核对每个输入数据集的实际许可证、版本、哈希、全国覆盖、重名结果、包体积和查询性能。
4. **平台条款：** 公开或商业发布前取得平台书面许可，或取得明确允许发布的合格法律意见；在此之前发布被阻断。DOM-only 设计不是授权证明。
5. **商店审核：** 使用最终 Manifest 填写 Chrome Web Store 和 Edge Add-ons 的 single purpose、权限与数据使用声明，确保描述与实际行为逐项一致。
6. **品牌与兼容性：** 完成商标、商店重名和域名检查；在准备发布时的 Chrome Stable、Edge Stable 及声明的最低 Chrome 版本上完成 Smoke Test。
