import { chromium } from '@playwright/test';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const extensionPath = resolve(root, '.output/chrome-mv3');
const output = resolve(root, 'store/chrome/assets');
const fixtureHtml = await readFile(resolve(root, 'tests/e2e/jobs.fixture.html'), 'utf8');

await mkdir(output, { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});

try {
  await context.route('https://nz.seek.com/**', (route) =>
    route.request().resourceType() === 'document'
      ? route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: fixtureHtml,
        })
      : route.abort(),
  );
  const jobs = await context.newPage();
  await jobs.goto('https://nz.seek.com/jobs?jobfilter-fixture=1');
  await jobs.locator('.jobfilter-card-controls').first().waitFor();

  const worker = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker');
  const extensionId = worker.url().split('/')[2];
  const panel = await context.newPage();
  await jobs.bringToFront();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.setViewportSize({ width: 640, height: 400 });
  await panel.getByRole('heading', { name: 'Current page' }).waitFor();
  await panel.evaluate(() => {
    globalThis.document.documentElement.style.zoom = '0.82';
  });
  await panel.screenshot({
    path: resolve(output, 'screenshot-overview-640x400.png'),
  });
  await panel.getByRole('button', { name: 'Filters', exact: true }).click();
  await panel.getByRole('heading', { name: 'Exclusion rules' }).waitFor();
  await panel.screenshot({
    path: resolve(output, 'screenshot-filters-640x400.png'),
  });

  const promo = await context.newPage();
  await promo.setViewportSize({ width: 440, height: 280 });
  const background = await readFile(resolve(output, 'promo-background-source.png'));
  const icon = await readFile(resolve(root, 'public/icon-128.png'));
  await promo.setContent(`<style>
    *{box-sizing:border-box}html,body{margin:0;width:440px;height:280px;overflow:hidden}
    body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:white}
    .tile{position:relative;width:440px;height:280px;overflow:hidden;background:#061f3e}
    .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(3,19,44,.2),rgba(3,19,44,0))}
    .content{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;width:295px;padding:30px}
    .brand{display:flex;align-items:center;gap:10px;margin-bottom:20px;font-size:13px;font-weight:750}
    .brand img{width:42px;height:42px;border:1px solid rgba(255,255,255,.24);border-radius:11px;box-shadow:0 6px 18px rgba(0,0,0,.25)}
    h1{margin:0 0 9px;font-size:27px;line-height:1.06;letter-spacing:-.035em}
    p{margin:0;color:#bdebe6;font-size:14px;font-weight:600}
  </style><main class="tile">
    <img class="bg" src="data:image/png;base64,${background.toString('base64')}" alt="">
    <div class="shade"></div>
    <div class="content">
      <div class="brand"><img src="data:image/png;base64,${icon.toString('base64')}" alt="">Kiwi Job Search Enhancer</div>
      <h1>Less noise.<br>Better job searching.</h1>
      <p>Local-first filters for New Zealand job seekers.</p>
    </div>
  </main>`);
  await promo.screenshot({ path: resolve(output, 'small-promo-440x280.png') });
  await copyFile(resolve(root, 'public/icon-128.png'), resolve(output, 'store-icon-128.png'));
} finally {
  await context.close();
}
