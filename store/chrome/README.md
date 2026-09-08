# Chrome submission files

- Upload package: `../../.output/job-filter-extension-0.8.0-chrome.zip`
- Store icon: `assets/store-icon-128.png`
- Screenshots: `assets/screenshot-overview-640x400.png` and
  `assets/screenshot-filters-640x400.png`
- Small promo tile: `assets/small-promo-440x280.png`
- Listing copy: `listing.en-NZ.md`
- Privacy answers: `privacy-practices.md`

Generate current assets and package with:

```bash
corepack pnpm build
corepack pnpm store:assets
corepack pnpm package:chrome
corepack pnpm release:check
```

External account actions remain: deploy `site/` to a public HTTPS host, add the
resulting URLs and a monitored contact email to the Developer Dashboard, upload
the ZIP, complete distribution settings and submit for review.
