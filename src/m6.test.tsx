// @vitest-environment happy-dom

import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser, type Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import App from '../entrypoints/sidepanel/App';
import LibraryPage from '../entrypoints/sidepanel/LibraryPage';
import { FixtureAdapter } from './adapters/fixture-adapter';
import { CardProcessor, type SendMessage } from './browser/card-processor';
import type { FilterRule, LocalFilterSettings } from './core/rules/rule-types';
import { setRuntimeLocale } from './i18n';
import { routeMessage } from './messaging/background-router';
import type { ExtensionMessage, PageStatus } from './messaging/message-types';
import { DATABASE_NAME, closeDatabase } from './storage/database';
import {
  createExportBundle,
  MAX_IMPORT_BYTES,
  mergeImportedRules,
  parseImportBundle,
} from './storage/import-export';
import { createDefaultFilterSettings } from './storage/migration';
import type {
  DiagnosticsState,
  JobStateRecord,
  SyncedPreferences,
} from './storage/storage-types';

const preferences: SyncedPreferences = {
  schemaVersion: 1,
  locale: 'en-NZ',
  ui: { showDistance: true, showSeen: true },
};

const health: PageStatus['health'] = {
  status: 'healthy',
  detectedCardCount: 2,
  extractedJobCount: 2,
  missingIdCount: 0,
  missingUrlCount: 0,
  missingTitleCount: 0,
  missingLocationCount: 0,
  selectorVersion: 1,
  checkedAt: Date.now(),
};

const pageStatus: PageStatus = {
  siteId: 'seek-nz',
  scanned: 2,
  shown: 1,
  hidden: 1,
  hiddenReasons: [{ type: 'exclude-keyword', count: 1 }],
  parsedLocationCount: 0,
  showHidden: false,
  health,
  updatedAt: 10,
};

const candidateData = {
  sources: [],
  conflicts: [],
};

const dismissedJob: JobStateRecord = {
  key: 'seek-nz:123',
  source: 'seek-nz',
  identityBasis: 'external-id',
  externalId: '123',
  canonicalUrl: 'https://www.seek.co.nz/job/123',
  title: 'Commercial Cleaner',
  company: 'Example Services',
  locationText: 'Hamilton',
  status: 'dismissed',
  dismissReason: null,
  firstSeenAt: 1,
  lastSeenAt: 2,
  statusUpdatedAt: 2,
};

const diagnostics: DiagnosticsState = {
  schemaVersion: 1,
  debugLogging: false,
  adapters: { 'seek-nz': health },
};

beforeEach(() => {
  fakeBrowser.reset();
  setRuntimeLocale('en-NZ');
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await closeDatabase();
  await deleteDB(DATABASE_NAME);
});

describe('runtime locale updates', () => {
  it('updates an existing injected card without reloading the page', async () => {
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const settings = createDefaultFilterSettings(() => 'profile');
    const send = (async (message: ExtensionMessage) => {
      if (message.type === 'GET_PAGE_CONTEXT') {
        return { filterSettings: settings, jobStates: {} };
      }
      throw new Error(`Unexpected message: ${message.type}`);
    }) as SendMessage;
    document.body.innerHTML = `<main data-jobfilter-fixture-list>
      <article data-jobfilter-fixture-job data-job-id="1">
        <a data-job-url href="/job/1"><span data-title>Retail Assistant</span></a>
      </article>
    </main>`;
    const adapter = new FixtureAdapter();
    const card = adapter.findJobCards(document)[0]!;
    const processor = new CardProcessor(adapter, send, document);

    await processor.processCards([card]);
    expect(card.querySelector('.jobfilter-dismiss')?.textContent).toBe('Hide with Kiwi');
    setRuntimeLocale('zh-CN');
    await processor.processCards([card], true);
    expect(card.querySelector('.jobfilter-dismiss')?.textContent).toBe('使用 Kiwi 隐藏');
    processor.dispose();
  });
});

describe('Side Panel', () => {
  it('keeps legacy profile forms out of the library and can reset all career data', async () => {
    await browser.storage.local.set({
      agentConnectionToken: 'test-token-that-is-at-least-32-characters',
    });
    const cleared = { sources: [], conflicts: [] };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => (
      new Response(JSON.stringify(init?.method === 'DELETE' ? cleared : candidateData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ));
    vi.stubGlobal('fetch', fetcher);

    render(<LibraryPage onOpenSettings={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Your sources' })).toBeTruthy();
    expect(screen.queryByText(/temporary compatibility/i)).toBeNull();
    fireEvent.click(screen.getByText('Library settings'));
    vi.stubGlobal('confirm', vi.fn(() => true));
    fireEvent.click(screen.getByRole('button', { name: 'Reset career workspace' }));
    expect(await screen.findByText(/Career workspace reset/)).toBeTruthy();
    expect(fetcher.mock.calls.at(-1)?.[1]?.method).toBe('DELETE');
  });

  it('keeps source indexing internal instead of showing extracted claim lists', async () => {
    await browser.storage.local.set({
      agentConnectionToken: 'test-token-that-is-at-least-32-characters',
    });
    const importedSource = {
      id: 'source.test',
      fileName: 'aroha-cv.txt',
      mediaType: 'text/plain',
      sizeBytes: 57,
      contentSha256: 'a'.repeat(64),
      kind: 'cv' as const,
      purposeTags: ['professional'],
      sensitivity: 'personal' as const,
      summary: 'Graduate developer CV with a Python automation project.',
      status: 'ready' as const,
      importedAt: '2026-09-07T00:00:00Z',
    };
    const preview = {
      source: importedSource,
      conflicts: [],
      warnings: [],
    };
    let finishPreview!: () => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).includes('/candidate-sources')) {
        return new Promise<Response>((resolve) => {
          finishPreview = () => resolve(new Response(JSON.stringify(preview), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          }));
        });
      }
      return new Response(JSON.stringify(candidateData), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetcher);

    render(<LibraryPage onOpenSettings={() => undefined} />);
    await screen.findByRole('heading', { name: 'Your sources' });
    fireEvent.change(screen.getByLabelText('Choose a file'), {
      target: { files: [new File([
        'Aroha Test\nBuilt a Python automation tool with tests.',
      ], 'aroha-cv.txt', { type: 'text/plain' })] },
    });
    expect(await screen.findByText('aroha-cv.txt selected — Kiwi is reading it now…'))
      .toBeTruthy();
    expect(screen.getByText(
      'The original is saved locally first. Kiwi is identifying the source and indexing what it says; keep this panel open.',
    )).toBeTruthy();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    finishPreview();
    expect(await screen.findByText(/Source saved and organised/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /aroha-cv.txt/ }));
    expect(screen.getByRole('heading', { name: 'aroha-cv.txt' })).toBeTruthy();
    expect(screen.queryByText('What Kiwi found')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toHaveProperty(
      'fileName', 'aroha-cv.txt',
    );
  });

  it('shows only source conflicts and lets the user resolve them in context', async () => {
    await browser.storage.local.set({
      agentConnectionToken: 'test-token-that-is-at-least-32-characters',
    });
    const sources = [2026, 2027].map((year) => ({
      id: `source.visa-${year}`,
      fileName: `visa-${year}.txt`,
      mediaType: 'text/plain',
      sizeBytes: 80,
      contentSha256: String(year).repeat(16),
      kind: 'visa' as const,
      purposeTags: ['work-rights'],
      sensitivity: 'highly-sensitive' as const,
      summary: 'Student visa work-right document.',
      status: 'ready' as const,
      importedAt: `2026-09-0${year - 2025}T00:00:00Z`,
    }));
    const claims = sources.map((source, index) => ({
      id: `claim.visa-${index}`,
      sourceId: source.id,
      fileName: source.fileName,
      category: 'work-rights' as const,
      key: 'work-rights.visa-expiry',
      title: 'Visa expiry',
      statement: `The visa expires on ${2026 + index}-10-01.`,
      attributes: { 'expiry-date': `${2026 + index}-10-01` },
      sourceText: `Visa expiry: ${2026 + index}-10-01`,
      sourceRef: `${source.id}.lines-1-1`,
      startLine: 1,
      endLine: 1,
      confidence: 'high' as const,
      exclusive: true,
      extractedAt: '2026-09-07T00:00:00Z',
    }));
    const conflictData = {
      ...candidateData,
      sources,
      conflicts: [{
        id: 'conflict.visa-expiry',
        key: 'work-rights.visa-expiry',
        title: 'Visa expiry',
        claims,
      }],
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => (
      new Response(JSON.stringify(init?.method === 'POST'
        ? { ...conflictData, conflicts: [] }
        : conflictData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ));
    vi.stubGlobal('fetch', fetcher);

    render(<LibraryPage onOpenSettings={() => undefined} />);
    expect(await screen.findByRole('heading', { name: '1 item(s) need review' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /expires on 2027-10-01.*visa-2027.txt/ }));
    expect(await screen.findByText(/Conflict resolved/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '1 item(s) need review' })).toBeNull();
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('/candidate-conflicts/');
  });

  it('injects the SEEK content script when an already-open tab has no receiver', async () => {
    vi.spyOn(browser.tabs, 'query').mockImplementation((async () => [{
      id: 7,
      url: 'https://nz.seek.com/jobs',
    } as Browser.tabs.Tab]) as typeof browser.tabs.query);
    const tabMessage = vi.spyOn(browser.tabs, 'sendMessage')
      .mockRejectedValueOnce(new Error('No receiving end'))
      .mockResolvedValue(undefined);
    const insertCSS = vi.spyOn(browser.scripting, 'insertCSS').mockResolvedValue();
    const executeScript = vi.spyOn(browser.scripting, 'executeScript').mockResolvedValue();
    vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async (input: unknown) => {
      const message = input as ExtensionMessage;
      const data = message.type === 'GET_PREFERENCES' ? preferences
        : message.type === 'GET_FILTER_SETTINGS' ? createDefaultFilterSettings(() => 'profile')
          : message.type === 'GET_DISMISSED_JOBS' ? []
            : message.type === 'GET_DIAGNOSTICS' ? diagnostics
              : message.type === 'GET_COMMUTE_ORIGIN' ? null
                : message.type === 'GET_PAGE_STATUS' ? pageStatus
                  : { cleared: true };
      return { ok: true, data };
    });

    render(<App />);

    await waitFor(() => expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['/content-scripts/seek.js'],
    }));
    expect(insertCSS).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['content-scripts/seek.css'],
    });
    expect(tabMessage.mock.calls.filter(([, message]) =>
      (message as { type?: string }).type === 'REFRESH_PAGE_STATUS')).toHaveLength(2);
  });

  it('loads statistics, manages rules and dismissed jobs, and switches language', async () => {
    let settings = createDefaultFilterSettings(() => 'profile');
    let nextPreferences = preferences;
    let jobs = [dismissedJob];
    vi.spyOn(browser.tabs, 'query').mockImplementation((async () => [
      { id: 7 } as Browser.tabs.Tab,
    ]) as typeof browser.tabs.query);
    const tabMessage = vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(
      async (_tabId, message) => (message as { type?: string }).type === 'GET_CURRENT_JOB'
        ? {
            ok: false,
            reason: 'not-a-job-detail',
            diagnostics: { missingFields: [] },
          }
        : undefined,
    );
    const runtimeMessage = vi
      .spyOn(browser.runtime, 'sendMessage')
      .mockImplementation(async (input: unknown) => {
        const message = input as ExtensionMessage;
        let data: unknown;
        switch (message.type) {
          case 'GET_PREFERENCES': data = nextPreferences; break;
          case 'GET_FILTER_SETTINGS': data = settings; break;
          case 'GET_DISMISSED_JOBS': data = jobs; break;
          case 'GET_DIAGNOSTICS': data = diagnostics; break;
          case 'GET_PAGE_STATUS': data = pageStatus; break;
          case 'SET_FILTER_SETTINGS':
            settings = {
              ...message.payload,
              configurationRevision: message.payload.configurationRevision + 1,
            };
            data = settings;
            break;
          case 'SET_PREFERENCES':
            nextPreferences = message.payload;
            data = nextPreferences;
            break;
          case 'RESTORE_JOB':
            jobs = jobs.filter(({ key }) => key !== message.payload.jobKey);
            data = { restored: true };
            break;
          default:
            data = { cleared: true };
        }
        return { ok: true, data };
      });

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Should you apply?' })).toBeTruthy();
    await waitFor(() => expect(tabMessage).toHaveBeenCalledWith(7, {
      type: 'REFRESH_PAGE_STATUS',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(screen.getByLabelText('Show filtered jobs on the page'));
    expect(tabMessage).toHaveBeenCalledWith(7, {
      type: 'SET_SHOW_HIDDEN', payload: { show: true },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    fireEvent.change(screen.getByLabelText('Pattern'), {
      target: { value: 'cleaner' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(settings.rules[0]).toMatchObject({
      type: 'exclude-keyword', pattern: 'cleaner', fields: ['title'],
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Hidden jobs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(screen.queryByText('Commercial Cleaner')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Language'), {
      target: { value: 'zh-CN' },
    });
    expect(await screen.findByRole('heading', { name: '设置' })).toBeTruthy();
    expect(runtimeMessage).toHaveBeenCalled();
  });

  it('analyses the current SEEK job once and shows the safe tool trace', async () => {
    await browser.storage.local.set({
      agentConnectionToken: 'test-token-that-is-at-least-32-characters',
    });
    vi.spyOn(browser.tabs, 'query').mockImplementation((async () => [
      { id: 7 } as Browser.tabs.Tab,
    ]) as typeof browser.tabs.query);
    const openTab = vi.spyOn(browser.tabs, 'create').mockResolvedValue(undefined);
    const currentJob = {
      schemaVersion: 1 as const,
      source: 'seek-nz' as const,
      externalId: '90000001',
      canonicalUrl: 'https://nz.seek.com/job/90000001',
      applicationUrl: null,
      title: 'Graduate Developer',
      company: 'Example Systems',
      location: 'Wellington',
      employmentType: 'Full time',
      salaryText: null,
      description: 'Build and test TypeScript tools.',
      postedAt: null,
      postedAtText: null,
      closesAt: null,
      closesAtText: null,
      extractedAt: '2026-09-05T00:00:00Z',
      extractionWarnings: [],
    };
    vi.spyOn(browser.tabs, 'sendMessage').mockImplementation((async () => ({
      ok: true,
      job: currentJob,
      diagnostics: { missingFields: [] },
    })) as typeof browser.tabs.sendMessage);
    vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async (input: unknown) => {
      const message = input as ExtensionMessage;
      const data = message.type === 'GET_PREFERENCES' ? preferences
        : message.type === 'GET_FILTER_SETTINGS' ? createDefaultFilterSettings(() => 'profile')
          : message.type === 'GET_DISMISSED_JOBS' ? []
            : message.type === 'GET_DIAGNOSTICS' ? diagnostics
              : message.type === 'GET_COMMUTE_ORIGIN' ? null
                : message.type === 'GET_PAGE_STATUS' ? pageStatus
                  : { cleared: true };
      return { ok: true, data };
    });
    let finishRequest!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise((resolve) => {
      finishRequest = resolve;
    }));
    vi.stubGlobal('fetch', fetcher);

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Graduate Developer' })).toBeTruthy();
    const analyse = screen.getByRole('button', { name: 'Analyse this job' });
    fireEvent.click(analyse);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect((analyse as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(analyse);
    expect(fetcher).toHaveBeenCalledTimes(1);

    finishRequest(new Response(JSON.stringify({
      analysis_id: 'ce3c5e3d-3912-47b1-9307-1c70f090da18',
      status: 'completed',
      recommendation: {
        recommendation: 'MAYBE', fit: 'HIGH', readiness: 'MEDIUM',
        hard_blockers: [], strong_matches: [], partial_matches: [{
          category: 'experience', summary: 'An imported CV mentions AWS deployment.',
          source_refs: ['document.cv1.line-4'],
        }], gaps: [],
        unknowns: [{
          category: 'availability', summary: 'Weekly hours are unclear.',
          source_refs: ['job.description'],
        }],
        clarification_questions: ['How many hours can you work each week?'],
        cv_action: 'DO_NOT_GENERATE', cover_letter_action: 'DO_NOT_GENERATE',
        next_actions: ['Confirm weekly hours.'],
        termination_reason: 'needs_clarification',
      },
      tool_events: [{
        sequence: 1,
        tool_name: 'search_candidate_documents',
        arguments: { query: 'AWS deployment' },
        result: {
          sourceRefs: ['document.cv1.line-4'], sourceFiles: ['aroha-cv.txt'],
          sources: [{
            sourceRef: 'document.cv1.line-4', fileName: 'aroha-cv.txt',
            excerpt: 'Deployed a Python service to AWS EC2 for a student project.',
          }],
        },
      }],
      usage: { model_calls: 2, tool_calls: 1, input_tokens: 100, output_tokens: 30, cost_usd: null },
      created_at: '2026-09-05T00:00:00Z',
      model: 'function:test',
      prompt_version: 'career-analysis-v3',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    expect(await screen.findByText('Promising — review first')).toBeTruthy();
    expect(screen.getByText('Deployed a Python service to AWS EC2 for a student project.')).toBeTruthy();
    expect(screen.queryByText('document.cv1.line-4')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Prepare application' })).toBeNull();
    fireEvent.change(screen.getByLabelText('1. How many hours can you work each week?'), {
      target: { value: 'I can work 30 hours each week.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue analysis' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(document.querySelector('.clarification-form + .analysis-progress')).toBeTruthy();
    expect(fetcher.mock.calls[1]?.[0]).toContain(
      '/v1/analyses/ce3c5e3d-3912-47b1-9307-1c70f090da18/continue?stream=true',
    );
    finishRequest(new Response(JSON.stringify({
      analysis_id: '72155ef0-4fd1-4c9c-b7cd-a5361f3899dc',
      status: 'completed',
      recommendation: {
        recommendation: 'APPLY', fit: 'HIGH', readiness: 'MEDIUM',
        hard_blockers: [], strong_matches: [], partial_matches: [], gaps: [], unknowns: [{
          category: 'experience',
          summary: 'Direct property-management experience is not established, but it is preferred.',
          source_refs: ['job.description'],
        }],
        clarification_questions: [], cv_action: 'DO_NOT_GENERATE', cover_letter_action: 'OPTIONAL',
        next_actions: ['Tailor the CV.'], termination_reason: 'completed',
      },
      tool_events: [{
        sequence: 1,
        tool_name: 'get_candidate_claims',
        arguments: { requirements: ['TypeScript'] },
        result: { sourceRefs: ['source.cv.lines-10-11'] },
      }],
      usage: { model_calls: 2, tool_calls: 1, input_tokens: 100, output_tokens: 30, cost_usd: null },
      created_at: '2026-09-05T00:01:00Z',
      model: 'function:test',
      prompt_version: 'career-analysis-v3',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    expect(await screen.findByText('Good fit — apply')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue analysis' })).toBeNull();
    expect(screen.getByText(/Direct property-management experience is not established/)).toBeTruthy();
    const details = screen.getByText('How Kiwi reached this result').closest('details');
    expect(details?.open).toBe(false);
    fireEvent.click(screen.getByText('How Kiwi reached this result'));
    expect(screen.getByText('Check your source-backed facts')).toBeTruthy();
    expect(screen.getByText('Completed.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Prepare application' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(fetcher.mock.calls[2]?.[0]).toContain(
      '/v1/analyses/72155ef0-4fd1-4c9c-b7cd-a5361f3899dc/materials',
    );
    expect(screen.getAllByText('Preparing your application…').length).toBeGreaterThan(0);
    const materialBundle = {
      material_id: 'material-1',
      analysis_id: '72155ef0-4fd1-4c9c-b7cd-a5361f3899dc',
      job_identity: 'seek-nz:90000001',
      cv_change_plan: null,
      cv_html: null,
      cover_letter: {
        text: 'Kia ora Example Systems,\n\nI am applying for this role.',
        source_refs: ['source.cv.lines-10-11'],
      },
      generated_at: '2026-09-05T00:02:00Z',
    };
    finishRequest(new Response(JSON.stringify(materialBundle), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));

    expect(screen.queryByText('CV change plan')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Open full-page materials' })).toBeTruthy();
    expect(screen.getByText('Grounded in 1 source records')).toBeTruthy();
    expect(screen.queryByTitle('Preview tailored CV')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open full-page materials' }));
    expect(openTab).toHaveBeenCalledWith({
      url: expect.stringMatching(/\/materials\.html\?analysisId=72155ef0-4fd1-4c9c-b7cd-a5361f3899dc$/),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mark applied' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    expect(screen.getByText('Saving application stage…')).toBeTruthy();
    finishRequest(new Response(JSON.stringify({
      job_identity: 'seek-nz:90000001',
      status: 'applied',
      job_mode: 'graduate',
      latest_analysis_id: '72155ef0-4fd1-4c9c-b7cd-a5361f3899dc',
      updated_at: '2026-09-05T00:03:00Z',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    expect(await screen.findByText('Application stage: Applied')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();

    cleanup();
    render(<App />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
    expect(fetcher.mock.calls[4]?.[0]).toContain(
      '/v1/analyses/72155ef0-4fd1-4c9c-b7cd-a5361f3899dc/materials',
    );
    finishRequest(new Response(JSON.stringify(materialBundle), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    expect(await screen.findByRole('button', { name: 'Open full-page materials' })).toBeTruthy();
  });
});

describe('settings import', () => {
  it('strictly validates bundles, enforces size, and merges without overwriting IDs', () => {
    const current = createDefaultFilterSettings(() => 'current-profile');
    const imported = createDefaultFilterSettings(() => 'import-profile');
    const first: FilterRule = {
      id: 'same', type: 'exclude-company', pattern: 'Current', matchMode: 'exact',
      enabled: true, createdAt: 1, updatedAt: 1,
    };
    const duplicate = { ...first, pattern: 'Imported' };
    const added: FilterRule = {
      id: 'added', type: 'exclude-keyword', pattern: 'cleaning',
      matchMode: 'contains', fields: ['title'], enabled: true,
      createdAt: 1, updatedAt: 1,
    };
    const currentWithRule: LocalFilterSettings = {
      ...current,
      rules: [first],
      profiles: [{ ...current.profiles[0]!, ruleIds: ['same'] }],
    };
    const importedWithRules: LocalFilterSettings = {
      ...imported,
      rules: [duplicate, added],
      profiles: [{ ...imported.profiles[0]!, ruleIds: ['same', 'added'] }],
    };
    const bundle = createExportBundle(preferences, importedWithRules, new Date(0));
    expect(parseImportBundle(JSON.stringify(bundle)).filterSettings.rules).toHaveLength(2);
    expect(mergeImportedRules(currentWithRule, importedWithRules).rules).toEqual([
      first, added,
    ]);
    expect(() => parseImportBundle(JSON.stringify({ ...bundle, unknown: true }))).toThrow();
    expect(() => parseImportBundle(' '.repeat(MAX_IMPORT_BYTES + 1))).toThrow(
      'IMPORT_TOO_LARGE',
    );
  });
});

describe('page status routing', () => {
  it('stores only validated session status and adapter diagnostics', async () => {
    const contentSender = {
      id: browser.runtime.id,
      tab: { id: 9, url: 'https://www.seek.co.nz/jobs' },
    } as Browser.runtime.MessageSender;
    const panelSender = {
      id: browser.runtime.id,
      url: `chrome-extension://${browser.runtime.id}/sidepanel.html`,
    } as Browser.runtime.MessageSender;

    await expect(routeMessage({
      type: 'REPORT_PAGE_STATUS', payload: pageStatus,
    }, contentSender)).resolves.toEqual({ reported: true });
    await expect(routeMessage({
      type: 'GET_PAGE_STATUS', payload: { tabId: 9 },
    }, panelSender)).resolves.toEqual(pageStatus);
    await expect(routeMessage({ type: 'GET_DIAGNOSTICS' }, panelSender)).resolves.toMatchObject({
      adapters: { 'seek-nz': health },
    });
  });
});
