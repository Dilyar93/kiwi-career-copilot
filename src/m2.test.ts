import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser, type Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createJobIdentity } from './core/jobs/job-identity';
import { normalizeJob } from './core/jobs/job-normalizer';
import type { RawJob } from './core/jobs/job-types';
import type { FilterRule } from './core/rules/rule-types';
import { routeMessage } from './messaging/background-router';
import { DATABASE_NAME, closeDatabase, getDatabase } from './storage/database';
import { DIAGNOSTICS_KEY, getDiagnostics } from './storage/diagnostics-repository';
import {
  cleanupExpiredSeen,
  dismissJob,
  getJobStates,
  markJobSeen,
  restoreJob,
} from './storage/job-state-repository';
import { migrateFilterSettings } from './storage/migration';
import {
  getFilterSettings,
  getPreferences,
  setFilterSettings,
} from './storage/settings-repository';

const rawJob: RawJob = {
  source: 'seek-nz',
  externalId: '123',
  canonicalUrl: 'https://www.seek.co.nz/job/123',
  title: 'Part-time Cleaner',
  company: 'Acme',
  locationText: 'Hamilton',
  summaryText: null,
  pageUrl: 'https://www.seek.co.nz/jobs',
  extractedAt: 1,
  adapterVersion: 1,
};

const extensionSender = {
  id: browser.runtime.id,
  url: `chrome-extension://${browser.runtime.id}/sidepanel.html`,
} as Browser.runtime.MessageSender;

const extensionTabSender = {
  ...extensionSender,
  tab: {
    id: 2,
    url: `chrome-extension://${browser.runtime.id}/sidepanel.html`,
  },
} as Browser.runtime.MessageSender;

const seekSender = {
  id: browser.runtime.id,
  tab: { id: 1, url: 'https://www.seek.co.nz/jobs' },
} as Browser.runtime.MessageSender;

beforeEach(async () => {
  fakeBrowser.reset();
  await closeDatabase();
  await deleteDB(DATABASE_NAME);
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  await closeDatabase();
  await deleteDB(DATABASE_NAME);
});

describe('settings storage and migration', () => {
  it('migrates legacy rules into the default profile', () => {
    const rule: FilterRule = {
      id: 'rule-1',
      type: 'exclude-company',
      pattern: 'Acme',
      matchMode: 'exact',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    };
    const settings = migrateFilterSettings(
      { schemaVersion: 0, configurationRevision: 2, rules: [rule] },
      () => 'profile-1',
    );
    expect(settings).toMatchObject({
      schemaVersion: 2,
      configurationRevision: 2,
      activeProfileId: 'profile-1',
    });
    expect(settings.profiles[0]?.ruleIds).toEqual(['rule-1']);
  });

  it('drops retired category rules when migrating v1 settings', () => {
    const settings = migrateFilterSettings({
      schemaVersion: 1,
      configurationRevision: 3,
      rules: [
        {
          id: 'category', type: 'exclude-category', pattern: 'Cleaning',
          matchMode: 'contains', ignoreMacrons: true, enabled: true,
          createdAt: 1, updatedAt: 1,
        },
        {
          id: 'company', type: 'exclude-company', pattern: 'Acme',
          matchMode: 'exact', enabled: true, createdAt: 1, updatedAt: 1,
        },
      ],
      profiles: [{
        id: 'profile', name: 'Default', ruleIds: ['category', 'company'],
        activeOriginId: null, enabled: true, createdAt: 1, updatedAt: 1,
      }],
      activeProfileId: 'profile',
    });

    expect(settings.schemaVersion).toBe(2);
    expect(settings.rules.map(({ id }) => id)).toEqual(['company']);
    expect(settings.profiles[0]?.ruleIds).toEqual(['company']);
  });

  it('stores public preferences in sync and increments rule revisions locally', async () => {
    expect((await getPreferences()).locale).toBe('en-NZ');
    const initial = await getFilterSettings();
    const updated = await setFilterSettings({
      ...initial,
      rules: [
        {
          id: 'rule-1',
          type: 'exclude-keyword',
          pattern: 'clean*',
          matchMode: 'prefix-wildcard',
          fields: ['title'],
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      profiles: [
        { ...initial.profiles[0]!, ruleIds: ['rule-1'] },
      ],
    });
    expect(updated.configurationRevision).toBe(1);
    const keywordRule = updated.rules[0];
    if (keywordRule?.type !== 'exclude-keyword') throw new Error('Missing rule');
    await expect(
      setFilterSettings({
        ...updated,
        rules: [{ ...keywordRule, pattern: '*' }],
      }),
    ).rejects.toThrow();
  });

  it('creates both required IndexedDB stores', async () => {
    expect(Array.from((await getDatabase()).objectStoreNames)).toEqual([
      'jobStates',
      'metadata',
    ]);
  });

  it('drops retired adapter diagnostics while keeping SEEK health', async () => {
    const health = {
      status: 'healthy',
      detectedCardCount: 1,
      extractedJobCount: 1,
      missingIdCount: 0,
      missingUrlCount: 0,
      missingTitleCount: 0,
      missingLocationCount: 0,
      selectorVersion: 1,
      checkedAt: 10,
    };
    await browser.storage.local.set({
      [DIAGNOSTICS_KEY]: {
        schemaVersion: 1,
        debugLogging: false,
        adapters: { 'seek-nz': health, 'trademe-jobs-nz': health },
      },
    });

    expect(await getDiagnostics(10)).toEqual({
      schemaVersion: 1,
      debugLogging: false,
      adapters: { 'seek-nz': health },
    });
    expect((await browser.storage.local.get(DIAGNOSTICS_KEY))[DIAGNOSTICS_KEY])
      .toEqual({ schemaVersion: 1, debugLogging: false, adapters: { 'seek-nz': health } });
  });
});

describe('job state repository', () => {
  it('marks, dismisses, batches, and restores persistent jobs', async () => {
    const job = normalizeJob(rawJob);
    const identity = (await createJobIdentity(job))!;
    const seen = await markJobSeen(job, identity, 10);
    const dismissed = await dismissJob(job, identity, 'distance', 20);
    expect(seen?.status).toBe('seen');
    expect(dismissed).toMatchObject({
      status: 'dismissed',
      firstSeenAt: 10,
      lastSeenAt: 20,
      dismissReason: 'distance',
    });
    expect(Object.keys(await getJobStates([identity.primaryKey, identity.primaryKey]))).toEqual([
      identity.primaryKey,
    ]);
    expect(await restoreJob(identity.primaryKey)).toBe(true);
    expect(await getJobStates([identity.primaryKey])).toEqual({});
  });

  it('expires only old seen records and never persists fallback identities', async () => {
    const day = 24 * 60 * 60 * 1_000;
    const now = 100 * day;
    const oldSeenJob = normalizeJob({ ...rawJob, externalId: 'old-seen' });
    const dismissedJob = normalizeJob({ ...rawJob, externalId: 'dismissed' });
    const oldSeenIdentity = (await createJobIdentity(oldSeenJob))!;
    const dismissedIdentity = (await createJobIdentity(dismissedJob))!;
    await markJobSeen(oldSeenJob, oldSeenIdentity, day);
    await dismissJob(dismissedJob, dismissedIdentity, null, day);

    expect(await cleanupExpiredSeen(now)).toBe(1);
    expect(await getJobStates([oldSeenIdentity.primaryKey])).toEqual({});
    expect(await getJobStates([dismissedIdentity.primaryKey])).toHaveProperty(
      dismissedIdentity.primaryKey,
    );

    const fallbackJob = normalizeJob({
      ...rawJob,
      externalId: null,
      canonicalUrl: null,
    });
    expect(
      await markJobSeen(fallbackJob, (await createJobIdentity(fallbackJob))!),
    ).toBeNull();
  });
});

describe('runtime message routing', () => {
  it('broadcasts saved filter changes to open job tabs', async () => {
    const settings = await getFilterSettings();
    vi.spyOn(browser.tabs, 'query').mockImplementation((async () => [
      { id: 1, url: 'https://nz.seek.com/jobs' } as Browser.tabs.Tab,
    ]) as typeof browser.tabs.query);
    const sendMessage = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue();

    await routeMessage({
      type: 'SET_FILTER_SETTINGS',
      payload: settings,
    }, extensionSender);

    expect(sendMessage).toHaveBeenCalledWith(1, { type: 'SETTINGS_CHANGED' });
  });

  it('rejects unknown and mismatched-site messages', async () => {
    await expect(routeMessage({ type: 'UNKNOWN' }, extensionSender)).rejects.toThrow();
    await expect(
      routeMessage(
        { type: 'MARK_SEEN', payload: { job: normalizeJob(rawJob) } },
        {
          ...seekSender,
          id: 'another-extension',
        },
      ),
    ).rejects.toThrow();
    await expect(
      routeMessage(
        {
          type: 'MARK_SEEN',
          payload: {
            job: { ...normalizeJob(rawJob), canonicalUrl: 'javascript:alert(1)' },
          },
        },
        seekSender,
      ),
    ).rejects.toThrow();
  });

  it('persists a dismissal and returns its state in one page-context request', async () => {
    const job = normalizeJob(rawJob);
    const dismissed = await routeMessage(
      { type: 'DISMISS_JOB', payload: { job, reason: null } },
      seekSender,
    );
    expect(dismissed.persisted).toBe(true);

    const context = await routeMessage(
      {
        type: 'GET_PAGE_CONTEXT',
        payload: {
          siteId: 'seek-nz',
          jobs: [{ key: dismissed.key!, locationText: job.locationText }],
        },
      },
      seekSender,
    );
    expect(context.jobStates[dismissed.key!]?.status).toBe('dismissed');
    expect(context.filterSettings.schemaVersion).toBe(2);

    await expect(routeMessage(
      { type: 'RESTORE_JOB', payload: { jobKey: dismissed.key! } },
      extensionTabSender,
    )).resolves.toEqual({ restored: true });
    expect(await getJobStates([dismissed.key!])).toEqual({});
  });
});
