import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { cpus, platform, release } from 'node:os';
import { resolve } from 'node:path';
import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const extensionPath = resolve('.output/chrome-mv3');
const fixtureUrl = 'https://nz.seek.com/jobs?jobId=1001&jobfilter-fixture=1';
const fixtureHtml = await readFile(
  resolve('tests/e2e/jobs.fixture.html'),
  'utf8',
);

const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({ browserName }, use) => {
    if (browserName !== 'chromium') throw new Error('Extension E2E requires Chromium');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    serviceWorker ??= await context.waitForEvent('serviceworker');
    await use(serviceWorker.url().split('/')[2]!);
  },
});

async function openFixture(
  context: BrowserContext,
  page: Page,
): Promise<string[]> {
  const requests: string[] = [];
  await context.route('https://nz.seek.com/**', async (route) => {
    requests.push(route.request().url());
    if (route.request().resourceType() === 'document') {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: fixtureHtml,
      });
    } else {
      await route.abort();
    }
  });
  await page.goto(fixtureUrl);
  await expect(page.locator('.jobfilter-card-controls')).toHaveCount(5);
  return requests;
}

async function openSidePanel(
  context: BrowserContext,
  extensionId: string,
  jobsPage: Page,
): Promise<Page> {
  let [serviceWorker] = context.serviceWorkers();
  serviceWorker ??= await context.waitForEvent('serviceworker');
  await expect.poll(() => serviceWorker.evaluate(async () => {
    const extensionApi = (globalThis as unknown as {
      chrome: { sidePanel: { getOptions(input: object): Promise<{ path?: string }> } };
    }).chrome;
    return (await extensionApi.sidePanel.getOptions({})).path;
  })).toBe('sidepanel.html');

  const panel = await context.newPage();
  await jobsPage.bringToFront();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole('heading', { name: 'Kiwi Career Copilot' })).toBeVisible();
  return panel;
}

async function addCleanerRule(panel: Page): Promise<void> {
  await panel.getByRole('button', { name: 'Search', exact: true }).click();
  await panel.getByRole('button', { name: 'Add rule', exact: true }).click();
  await panel.getByLabel('Pattern').fill('clean*');
  await panel.getByLabel('Match mode').selectOption('prefix-wildcard');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
}

test('loads the extension and completes the rule, dismiss, restore, and DOM-update flow', async ({
  context,
  extensionId,
  page,
}) => {
  const requests = await openFixture(context, page);
  const panel = await openSidePanel(context, extensionId, page);
  const cleaner = page.locator('[data-job-id="1001"]');
  const retail = page.locator('[data-job-id="1002"]');

  await expect.poll(() => retail.evaluate((card) => ({
    isolation: getComputedStyle(card).isolation,
    controlsZIndex: getComputedStyle(
      card.querySelector('.jobfilter-card-controls')!,
    ).zIndex,
  }))).toEqual({ isolation: 'isolate', controlsZIndex: '2' });

  await addCleanerRule(panel);
  await expect(cleaner).toHaveClass(/jobfilter-hidden/);

  await page.getByRole('button', { name: 'Show hidden jobs', exact: true }).click();
  await expect(cleaner).toBeVisible();
  await page.getByRole('button', { name: 'Hide filtered jobs', exact: true }).click();

  await retail.evaluate((card) => {
    card.style.position = 'relative';
    const overlay = document.createElement('a');
    overlay.href = '#host-card-click';
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '1',
    });
    card.append(overlay);
    card.addEventListener('click', () => {
      location.hash = 'host-card-click';
    });
  });
  await retail.getByRole('button', { name: 'Hide with Kiwi', exact: true }).click();
  expect(page.url()).not.toContain('#host-card-click');
  await expect(retail).toHaveClass(/jobfilter-hidden/);
  await page.reload();
  await expect(page.locator('.jobfilter-card-controls')).toHaveCount(5);
  await expect(page.locator('[data-job-id="1002"]')).toHaveClass(/jobfilter-hidden/);

  await panel.getByRole('button', { name: 'Hidden jobs', exact: true }).click();
  const dismissed = panel.locator('.job-list li').filter({ hasText: 'Retail Assistant' });
  await dismissed.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.locator('[data-job-id="1002"]')).not.toHaveClass(/jobfilter-hidden/);

  await page.locator('[data-automation="searchResults"]').evaluate((root) => {
    root.insertAdjacentHTML('beforeend', `<article data-automation="normalJob" data-job-id="1006">
      <h2><a data-automation="jobTitle" href="/job/1006">Office Cleaner</a></h2>
      <span data-automation="jobCompany">Example New</span>
      <span data-automation="jobLocation">Hamilton</span>
    </article>`);
  });
  await expect(page.locator('[data-job-id="1006"]')).toHaveClass(/jobfilter-hidden/);
  expect([...new Set(requests)]).toEqual([fixtureUrl]);
});

test('applies conservative distance rules and keeps unknown and hybrid locations', async ({
  context,
  extensionId,
  page,
}) => {
  await openFixture(context, page);
  const panel = await openSidePanel(context, extensionId, page);
  await panel.getByRole('button', { name: 'Search', exact: true }).click();
  await panel.getByRole('button', { name: 'Commute', exact: true }).click();
  await panel.getByLabel('Choose a New Zealand place').fill('Hamilton Central');
  await panel.getByLabel('Distance', { exact: true })
    .getByRole('button', { name: 'Search', exact: true }).click();
  const result = panel.locator('.job-list li').filter({ hasText: 'Hamilton Central' }).first();
  await result.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(panel.getByText('Commute origin saved.', { exact: true })).toBeVisible();
  await panel.getByLabel('Maximum straight-line distance (km)').fill('5');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel.getByText('Maximum distance saved.', { exact: true })).toBeVisible();

  await expect(page.locator('[data-job-id="1003"]')).toHaveClass(/jobfilter-hidden/);
  await expect(page.locator('[data-job-id="1004"]')).not.toHaveClass(/jobfilter-hidden/);
  await expect(page.locator('[data-job-id="1004"] .jobfilter-distance'))
    .toHaveText('Distance unavailable');
  await expect(page.locator('[data-job-id="1005"]')).not.toHaveClass(/jobfilter-hidden/);
  await expect(page.locator('[data-job-id="1005"] .jobfilter-distance'))
    .toContainText('Approx.');
});

test('starts in English, updates both surfaces to Chinese, and exposes keyboard names', async ({
  context,
  extensionId,
  page,
}) => {
  await openFixture(context, page);
  const panel = await openSidePanel(context, extensionId, page);
  await expect(page.getByRole('button', { name: 'Hide with Kiwi' }).first()).toBeVisible();
  expect(await panel.locator('button').evaluateAll((buttons) =>
    buttons.filter((button) =>
      !(button.getAttribute('aria-label') || button.textContent?.trim()),
    ).length,
  )).toBe(0);

  const settings = panel.getByRole('button', { name: 'Settings', exact: true });
  await settings.focus();
  await panel.keyboard.press('Enter');
  await expect(panel.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await panel.getByLabel('Language').selectOption('zh-CN');

  await expect(panel.getByRole('heading', { name: 'Kiwi 求职助手' })).toBeVisible();
  await expect(page.getByRole('button', { name: '使用 Kiwi 隐藏' }).first()).toBeVisible();
  await expect(page.locator('a[data-automation="jobTitle"]', {
    hasText: 'Commercial Cleaner',
  })).toBeVisible();
});

test('returns the active SEEK job to the side panel context', async ({
  context,
  extensionId,
  page,
}) => {
  await openFixture(context, page);
  const panel = await openSidePanel(context, extensionId, page);
  await page.bringToFront();
  const result = await panel.evaluate(async () => {
    const extensionApi = (globalThis as unknown as {
      chrome: {
        tabs: {
          query(input: object): Promise<Array<{ id?: number }>>;
          sendMessage(tabId: number, message: object): Promise<unknown>;
        };
      };
    }).chrome;
    const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error('No active SEEK tab');
    return extensionApi.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_JOB' });
  });

  expect(result).toMatchObject({
    ok: true,
    job: {
      schemaVersion: 1,
      externalId: '1001',
      canonicalUrl: 'https://nz.seek.com/job/1001',
      title: 'Commercial Cleaner',
      company: 'Example Services',
      description: 'Clean commercial offices during weekday evenings.',
    },
  });
});

test('updates the side panel after one delayed SEEK SPA job selection', async ({
  context,
  extensionId,
  page,
}) => {
  await openFixture(context, page);
  const panel = await openSidePanel(context, extensionId, page);
  await expect(panel.getByRole('heading', { name: 'Commercial Cleaner' })).toBeVisible();

  await page.evaluate(() => history.pushState({}, '', '/jobs?jobId=1002'));
  await page.waitForTimeout(700);
  await page.locator('[data-automation="jobDetailsPage"]').evaluate((root) => {
    root.setAttribute('data-job-id', '1002');
    root.innerHTML = '<div aria-label="Loading job details"></div>';
  });
  await expect(panel.getByRole('heading', { name: 'Commercial Cleaner' })).toBeVisible();
  await expect(panel.getByText('Couldn’t read this job')).toHaveCount(0);

  await page.waitForTimeout(200);
  await page.locator('[data-automation="jobDetailsPage"]').evaluate((root) => {
    root.innerHTML = `<h1 data-automation="job-detail-title">Retail Assistant</h1>
      <span data-automation="advertiser-name">Example Retail</span>
      <span data-automation="job-detail-location">Cambridge, Waikato</span>
      <span data-automation="job-detail-work-type">Part time</span>
      <a data-automation="job-detail-apply" href="/job/1002/apply">Apply</a>
      <div data-automation="jobAdDetails"><p>Help customers and replenish stock.</p></div>`;
  });

  await expect(panel.getByRole('heading', { name: 'Retail Assistant' })).toBeVisible();
});

test('loads saved application materials in a full-width extension page', async ({
  context,
  extensionId,
}) => {
  const analysisId = '72155ef0-4fd1-4c9c-b7cd-a5361f3899dc';
  const token = 'e2e-token-that-is-at-least-32-characters';
  let [serviceWorker] = context.serviceWorkers();
  serviceWorker ??= await context.waitForEvent('serviceworker');
  await serviceWorker.evaluate(async (value) => {
    const extensionApi = (globalThis as unknown as {
      chrome: { storage: { local: { set(input: object): Promise<void> } } };
    }).chrome;
    await extensionApi.storage.local.set({ agentConnectionToken: value });
  }, token);
  await context.route(
    `http://127.0.0.1:8765/v1/analyses/${analysisId}/materials`,
    async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        material_id: 'material-1', analysis_id: analysisId,
        job_identity: 'seek-nz:1001',
        cv_change_plan: {
          analysis_id: analysisId, selected_source_refs: ['source.cv.record-1'],
          base_source_id: 'source.cv', emphasized_skills: ['testing'],
          changes: ['Emphasise browser testing experience.'],
        },
        cv_html: '<!doctype html><html><body><main>Full-size tailored CV</main></body></html>',
        cover_letter: {
          text: 'Kia ora hiring team,\n\nI built browser-level tests.',
          source_refs: ['source.cv.record-1'],
        },
        generated_at: '2026-09-08T00:00:00Z',
      }),
    }),
  );

  const materialsPage = await context.newPage();
  await materialsPage.goto(
    `chrome-extension://${extensionId}/materials.html?analysisId=${analysisId}`,
  );
  await expect(materialsPage.getByRole('heading', { name: 'Application materials' })).toBeVisible();
  await expect(materialsPage.getByLabel('Editable cover letter')).toHaveValue(
    /browser-level tests/,
  );
  const preview = materialsPage.getByTitle('Tailored CV');
  await expect(preview).toBeVisible();
  expect((await preview.boundingBox())?.width).toBeGreaterThan(600);
});

test('runs the browser-to-Agent-to-SQLite analysis slice', async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  await openFixture(context, page);
  const token = 'e2e-token-that-is-at-least-32-characters';
  const serverPort = 18765;
  await context.route('http://127.0.0.1:8765/**', async (route) => {
    const url = new URL(route.request().url());
    url.port = String(serverPort);
    await route.continue({ url: url.href });
  });
  const server = spawn('.venv/bin/python', ['tests/e2e/agent_server.py'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PYTHONPATH: '.',
      JOBFILTER_AGENT_TOKEN: token,
      JOBFILTER_EXTENSION_ORIGIN: `chrome-extension://${extensionId}`,
      JOBFILTER_DATABASE_PATH: testInfo.outputPath('agent.sqlite3'),
      JOBFILTER_AGENT_PORT: String(serverPort),
    },
    stdio: 'ignore',
  });
  try {
    await expect.poll(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${serverPort}/health`, {
          headers: {
            Origin: `chrome-extension://${extensionId}`,
            'X-Jobfilter-Token': token,
          },
        });
        return response.ok;
      } catch {
        return false;
      }
    }).toBe(true);

    const panel = await openSidePanel(context, extensionId, page);
    await panel.getByRole('button', { name: 'Settings', exact: true }).click();
    await panel.getByLabel('Pairing token').fill(token);
    await panel.getByRole('button', { name: 'Save and test connection' }).click();
    await expect(panel.getByText('Local Agent server connected.')).toBeVisible();

    await panel.getByRole('button', { name: 'Job', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Commercial Cleaner' })).toBeVisible();
    await panel.getByRole('button', { name: 'Analyse this job' }).click();
    await expect(panel.getByText('Good fit — apply', { exact: true })).toBeVisible();
    await panel.getByText('How Kiwi reached this result', { exact: true }).click();
    await expect(panel.getByText('Check your source-backed facts')).toBeVisible();
    await panel.getByRole('button', { name: 'Prepare application' }).click();
    await expect(panel.getByRole('button', { name: 'Open full-page materials' })).toBeVisible();
    const materialsPagePromise = context.waitForEvent('page');
    await panel.getByRole('button', { name: 'Open full-page materials' }).click();
    const materialsPage = await materialsPagePromise;
    await expect(materialsPage.getByRole('heading', { name: 'Application materials' })).toBeVisible();
    await expect(materialsPage.getByTitle('Tailored CV')).toBeVisible();
    await expect(materialsPage.getByLabel('Editable cover letter')).toHaveValue(
      /Created unit and browser-level tests/,
    );

    const applications = await fetch(`http://127.0.0.1:${serverPort}/v1/applications`, {
      headers: {
        Origin: `chrome-extension://${extensionId}`,
        'X-Jobfilter-Token': token,
      },
    });
    expect(await applications.json()).toMatchObject([{
      job_identity: 'seek-nz:1001',
      status: 'preparing',
    }]);
  } finally {
    server.kill('SIGTERM');
    if (server.exitCode === null) {
      await new Promise<void>((resolveExit) => server.once('exit', () => resolveExit()));
    }
  }
});

test('processes a 100-card mutation batch within the development budget', async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  await openFixture(context, page);
  const panel = await openSidePanel(context, extensionId, page);
  await addCleanerRule(panel);

  const startedAt = await page.evaluate(() => {
    const target = globalThis as typeof globalThis & { jobfilterLongTasks: number[] };
    target.jobfilterLongTasks = [];
    new PerformanceObserver((list) => {
      target.jobfilterLongTasks.push(...list.getEntries().map(({ duration }) => duration));
    }).observe({ type: 'longtask', buffered: true });
    return performance.now();
  });
  await page.locator('[data-automation="searchResults"]').evaluate((root) => {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 100; index += 1) {
      const card = document.createElement('article');
      card.dataset.automation = 'normalJob';
      card.dataset.jobId = `batch-${index}`;
      card.innerHTML = `<h2><a data-automation="jobTitle" href="/job/${20_000 + index}">${
        index % 2 ? 'Office Cleaner' : 'Office Assistant'
      }</a></h2><span data-automation="jobCompany">Fixture Company</span><span data-automation="jobLocation">Hamilton</span>`;
      fragment.append(card);
    }
    root.append(fragment);
  });
  await expect(page.locator('[data-job-id^="batch-"][data-jobfilter-processed="1"]'))
    .toHaveCount(100);
  const elapsedMs = await page.evaluate((start) => performance.now() - start, startedAt);
  const maxLongTaskMs = await page.evaluate(() => Math.max(
    0,
    ...(globalThis as typeof globalThis & { jobfilterLongTasks: number[] })
      .jobfilterLongTasks,
  ));
  const report = {
    browser: context.browser()?.version() ?? 'Playwright bundled Chromium',
    machine: `${platform()} ${release()}, ${cpus().length} CPUs`,
    fixture: '100 cards added in one DOM fragment (includes 100ms debounce)',
    ruleCount: 1,
    state: 'warm service worker and settings cache',
    wallElapsedMs: Number(elapsedMs.toFixed(1)),
    maxLongTaskMs: Number(maxLongTaskMs.toFixed(1)),
  };
  await testInfo.attach('performance.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  expect(report.maxLongTaskMs).toBeLessThanOrEqual(50);
  expect(report.wallElapsedMs).toBeLessThanOrEqual(500);
});
