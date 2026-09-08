# 本地试用与后续发布指南

本文适用于当前 `0.8.0`。它既可以本地加载，也包含 Chrome Web Store
候选发布包、商店素材、隐私说明和 Dashboard 填写文案。

## 一、本地加载试用

项目已生成以下目录和安装包：

- Chrome 解压目录：`.output/chrome-mv3`
- Edge 解压目录：`.output/edge-mv3`
- Chrome ZIP：`.output/job-filter-extension-0.8.0-chrome.zip`
- Edge ZIP：`.output/job-filter-extension-0.8.0-edge.zip`

本地加载直接使用解压目录，不需要使用 ZIP。

### Chrome

1. 打开 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择项目中的 `.output/chrome-mv3` 目录。
5. 可选：在浏览器工具栏的扩展菜单中固定 `Kiwi Job Search Enhancer`。

### Edge

1. 打开 `edge://extensions/`。
2. 打开“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择项目中的 `.output/edge-mv3` 目录。

### 第一次试用建议

1. 人工打开一个支持的职位结果页。目前声明的精确地址范围是：
   - `https://www.seek.co.nz/*`
   - `https://nz.seek.com/*`
2. 点击扩展工具栏按钮，确认右侧 Side Panel 打开。
3. 在“排除规则”中新建关键词规则，例如标题匹配 `clean*`。
4. 确认命中的卡片隐藏，并试用“显示隐藏职位”。
5. 对一个职位点击“不感兴趣”，刷新页面后确认仍隐藏，再到 Side Panel 恢复。
6. 在“距离”中选择一个已知新西兰地点；也可以主动点击当前位置并决定是否授权。
7. 在设置中切换中英文，确认 Side Panel 和页面按钮立即更新。
8. 关闭并重新打开浏览器，确认规则和不感兴趣记录仍在。

注意：2026 年 8 月 7 日测试时，`www.seek.co.nz` 会跳转到
`nz.seek.com`，当前本地构建已支持两个精确域名。

### 没有出现控件时

- 先检查地址是否落在上面的精确范围内。
- 在 Side Panel 的“当前页面”查看适配器状态和扫描数量。
- 在职位页面开发者工具中检查控制台错误。
- 在扩展管理页点击该扩展的 Service Worker“检查视图”，检查后台错误。
- 修改代码或重新构建后，必须回到扩展管理页点击“重新加载”。

### 更新本地构建

在项目目录执行：

```bash
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm build:edge
```

然后在 `chrome://extensions/` 或 `edge://extensions/` 点击扩展的“重新加载”，
再刷新职位页面。更新前可先从设置中导出配置；重新加载通常保留同一路径扩展的
本地数据，但不要把它当作备份。

如要彻底清除数据，使用 Side Panel 设置中的“清除本地数据”，然后卸载扩展。

## 二、本地发布前完整检查

首次安装 Playwright 浏览器：

```bash
corepack pnpm exec playwright install --with-deps chromium
```

每个候选版本运行：

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
corepack pnpm build:edge
corepack pnpm store:assets
corepack pnpm package:chrome
corepack pnpm package:edge
corepack pnpm release:check
```

`release:check` 应显示 `internalChecks: passed` 和 `releaseEligible: true`。

还要按 [M8 发布准备记录](release-readiness-0.8.md) 在最新版 Chrome Stable 和
Edge Stable 中人工测试真实网站。真实网站只能人工测试，不能加入 Playwright。

## 三、提交前的发布者操作

- [ ] 把 `site/` 部署到稳定的公开 HTTPS 地址。
- [ ] 在 Chrome Developer Dashboard 配置持续有人查看的联系邮箱。
- [ ] 填入部署后的隐私政策网址；产品主页和外部支持网址可选。
- [ ] 使用 `store/chrome/` 中的文案和图片完成 Listing 与 Privacy 表单。
- [ ] 在最新版 Chrome Stable 对实际支持页面完成一次人工 Smoke Test。
- [ ] 发布者自行复核提交时有效的网站条款、商店政策和适用法律。

### 用 GitHub Pages 部署静态页面（最省事方案）

插件源码可以继续保持私有，只公开不含源码的静态说明页面：

1. 在 GitHub 新建一个公开仓库，例如 `kiwi-job-search-enhancer-site`。
2. 只把本项目 `site/` **里面的文件**上传到新仓库根目录。不要上传整个项目、
   `.output/`、源码、构建包或任何密钥。
3. 打开新仓库的 **Settings → Pages**。
4. 在 **Build and deployment** 中选择 **Deploy from a branch**，分支选
   `main`，目录选 `/(root)`，然后保存。
5. 等待 GitHub 完成部署。页面地址通常是：
   `https://<GitHub 用户名>.github.io/kiwi-job-search-enhancer-site/`。
6. 用无痕窗口确认以下地址能够直接打开：
   `https://<GitHub 用户名>.github.io/kiwi-job-search-enhancer-site/privacy.html`。
7. 在 Chrome Developer Dashboard 的 **Privacy** 页面，把该地址填入
   **Privacy policy URL**。
8. 可选：把 `index.html` 填为 Homepage URL，把 `support.html` 填为
   Support URL；同时完成开发者联系邮箱验证。

不需要购买域名、运行服务器或维护数据库。只有插件名称、运营者联系方式、权限或
数据处理方式发生变化时，才需要更新这些静态页面。GitHub Pages 的 HTTPS 说明见
[官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)。

## 四、准备候选发布包

1. 在 `package.json` 更新版本号；已发布过的版本必须使用更高的新版本号。
2. 更新 `site/changelog.html`、README 和发布准备记录。
3. 完成上一节全部自动检查和人工检查。
4. 运行 `package:chrome` 和 `package:edge`。
5. 最后人工打开两个 ZIP 内的 `manifest.json`，确认名称、版本、权限和匹配地址。
6. 保存测试记录、源代码版本、两个 ZIP 的校验值和最终公开页面快照。

权限说明应保持简单且与实际行为一致：

- `storage`：保存本地规则、偏好、地点和职位状态。
- `sidePanel`：提供扩展控制界面。
- `geolocation`：仅在用户点击后取得一次位置并在本地处理。
- 两个精确内容脚本范围：只处理用户已经打开的当前职位结果页。

## 五、Chrome Web Store 提交流程

官方入口：[Chrome Web Store 发布文档](https://developer.chrome.com/docs/webstore/publish/)。

1. 注册 Chrome Web Store 开发者账号、接受协议并支付一次性注册费。
2. 在 Developer Dashboard 新建项目，上传 Chrome ZIP。
3. 填写 Store Listing，包括最终名称、说明、图标、截图、必需的隐私链接和可选的
   外部支持链接。
4. 在 Privacy 中如实填写单一用途、权限理由和用户数据处理。
5. 在 Distribution 中选择国家/地区和可见性；各种可见性都会接受相同政策审核。
6. 在 Test instructions 中说明如何打开支持页面、Side Panel 和验证主要功能。
7. 提交审核。建议首次使用 deferred publishing，审核通过后再人工确认发布。

## 六、Microsoft Edge Add-ons 提交流程

官方入口：[Edge 扩展发布文档](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)。

1. 使用 Microsoft 账号注册 Partner Center 的 Edge 开发者计划；当前官方说明
   Edge 扩展开发者注册不收费。
2. 创建新扩展并上传 Edge ZIP。
3. 填写 Availability，包括可见性和发布市场。
4. 填写 Properties、Privacy：单一用途、权限理由、无远程代码、数据实践和隐私政策。
5. 为英文及计划支持的其他语言填写商店说明、图标和截图。
6. 填写 certification testing notes，说明测试网址和操作步骤，然后提交认证。

## 七、发布后的维护

- 监控商店审核邮件、支持渠道和网站 DOM 变化。
- 每次更新都提高版本号、更新 changelog、重新执行完整门禁和双浏览器人工测试。
- 条款、权限、数据处理或支持域名变化时，先更新法律/隐私材料再发新版。
- 平台撤回许可、条款不再允许或适配器失效时，停止分发或及时下架/禁用对应适配器。
