# Release readiness

Reviewed 7 August 2026 for version `0.8.0`.

## Status

The repository’s automated release gate is open. `pnpm release:check` validates
the Chrome and Edge Manifest V3 builds, exact permissions and site matches,
absence of remote/dynamic code, geolocation constraints, public-site source,
Chrome listing copy, privacy-practices answers, required image dimensions and a
fresh Chrome ZIP.

The automated result is an engineering package-readiness signal, not a legal
opinion or a substitute for the Chrome Web Store review.

## Automated evidence

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm build:edge
pnpm store:assets
pnpm package:chrome
pnpm package:edge
pnpm release:check
```

Chrome submission material is under `store/chrome/` and the upload package is
`.output/job-filter-extension-0.8.0-chrome.zip`.

## Publisher actions outside the repository

- Deploy `site/` to stable public HTTPS hosting.
- Enter the resulting privacy-policy URL in Developer Dashboard; homepage and
  external support URLs are optional.
- Configure and monitor the publisher contact email.
- Paste `store/chrome/listing.en-NZ.md` and
  `store/chrome/privacy-practices.md` into the corresponding Dashboard fields.
- Complete a final manual smoke test in current Chrome Stable on the live pages
  the publisher chooses to support.
- Review current site terms, Chrome Web Store policies and applicable law before
  submission; the publisher owns that decision.

Private, unlisted and public Chrome Web Store items go through the same policy
review. Upload the Chrome ZIP, not `.output/chrome-mv3`.

---

## 中文摘要

仓库自动发布门禁已经打开；通过代表代码、安装包、商店文案、隐私说明和图片尺寸
满足本项目可自动验证的发布条件。它不替代 Chrome 审核或发布者对网站条款、适用
法律和真实页面兼容性的判断。

提交前仍需在仓库外完成：把 `site/` 部署到公开 HTTPS、在 Dashboard 填入隐私
政策网址及持续有人查看的联系邮箱，并在最新版 Chrome Stable 对真实页面做一次
人工 Smoke Test；产品主页和外部支持网址可选。
