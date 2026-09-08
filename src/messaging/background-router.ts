import { ZodError } from 'zod';
import { browser, type Browser } from 'wxt/browser';
import { createJobIdentity } from '../core/jobs/job-identity';
import type { SiteId } from '../core/jobs/job-types';
import { distanceToCandidates } from '../location/distance';
import { NzLocationProvider } from '../location/nz-location-provider';
import {
  clearJobStateData,
  dismissJob,
  getJobStates,
  listDismissedJobs,
  markJobSeen,
  restoreJob,
} from '../storage/job-state-repository';
import {
  getDiagnostics,
  recordAdapterHealth,
  setDebugLogging,
} from '../storage/diagnostics-repository';
import {
  getFilterSettings,
  getPreferences,
  setFilterSettings,
  setPreferences,
} from '../storage/settings-repository';
import {
  clearCommuteOrigins,
  getCommuteOrigin,
  saveBrowserOrigin,
  saveKnownPlaceOrigin,
  saveManualOrigin,
} from '../storage/origin-repository';
import {
  ExtensionMessageSchema,
  type ExtensionMessage,
  type MessageResponseMap,
  type PageStatus,
} from './message-types';

class UnauthorizedMessageError extends Error {}
const pageStatuses = new Map<number, PageStatus>();
let locationProvider: Promise<NzLocationProvider> | undefined;

export async function broadcastExtensionMessage(message: object): Promise<void> {
  const tabs = await browser.tabs.query({}).catch(() => []);
  await Promise.all([
    browser.runtime.sendMessage(message).catch(() => undefined),
    ...tabs.flatMap(({ id }) => id === undefined
      ? []
      : [Promise.resolve()
          .then(() => browser.tabs.sendMessage(id, message))
          .catch(() => undefined)]),
  ]);
}

function getLocationProvider(): Promise<NzLocationProvider> {
  locationProvider ??= NzLocationProvider.load(
    browser.runtime.getURL('/data/locations/nz/locations.compact.json'),
  ).catch((error: unknown) => {
    locationProvider = undefined;
    throw error;
  });
  return locationProvider;
}

async function setActiveOrigin(originId: string | null): Promise<void> {
  const settings = await getFilterSettings();
  const now = Date.now();
  await setFilterSettings({
    ...settings,
    profiles: settings.profiles.map((profile) =>
      profile.id === settings.activeProfileId
        ? { ...profile, activeOriginId: originId, updatedAt: now }
      : profile,
    ),
  });
  await broadcastExtensionMessage({ type: 'SETTINGS_CHANGED' });
}

function siteForUrl(input: string | undefined): SiteId | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:') return null;
    if (['www.seek.co.nz', 'nz.seek.com'].includes(url.hostname)) return 'seek-nz';
  } catch {
    return null;
  }
  return null;
}

function assertTrustedSender(sender: Browser.runtime.MessageSender): void {
  if (sender.id !== browser.runtime.id) throw new UnauthorizedMessageError();
}

function assertExtensionPage(sender: Browser.runtime.MessageSender): void {
  if (
    sender.tab
    && !sender.url?.startsWith(browser.runtime.getURL('/'))
  ) {
    throw new UnauthorizedMessageError();
  }
}

function assertSiteSender(
  sender: Browser.runtime.MessageSender,
  siteId: SiteId,
): void {
  if (siteForUrl(sender.tab?.url) !== siteId) {
    throw new UnauthorizedMessageError();
  }
}

export function routeMessage<T extends ExtensionMessage>(
  input: T,
  sender: Browser.runtime.MessageSender,
): Promise<MessageResponseMap[T['type']]>;
export function routeMessage(
  input: unknown,
  sender: Browser.runtime.MessageSender,
): Promise<unknown>;
export async function routeMessage(
  input: unknown,
  sender: Browser.runtime.MessageSender,
): Promise<unknown> {
  const message = ExtensionMessageSchema.parse(input);
  assertTrustedSender(sender);

  switch (message.type) {
    case 'GET_PAGE_CONTEXT': {
      assertSiteSender(sender, message.payload.siteId);
      const [filterSettings, jobStates] = await Promise.all([
        getFilterSettings(),
        getJobStates(message.payload.jobs.map(({ key }) => key)),
      ]);
      const activeProfile = filterSettings.profiles.find(
        ({ id }) => id === filterSettings.activeProfileId,
      );
      const origin = await getCommuteOrigin(activeProfile?.activeOriginId ?? null);
      if (!origin) {
        return { filterSettings, jobStates, distances: {}, distanceEnabled: false };
      }
      try {
        const provider = await getLocationProvider();
        const distances = Object.fromEntries(message.payload.jobs.flatMap(({ key, locationText }) => {
          const resolution = provider.resolveLocation(locationText ?? '');
          const distance = distanceToCandidates(origin, resolution.candidates, resolution.confidence);
          return distance ? [[key, { ...distance, distanceEligible: resolution.distanceEligible }]] : [];
        }));
        return { filterSettings, jobStates, distances, distanceEnabled: true };
      } catch {
        return { filterSettings, jobStates, distances: {}, distanceEnabled: true };
      }
    }
    case 'DISMISS_JOB': {
      assertSiteSender(sender, message.payload.job.source);
      const identity = await createJobIdentity(message.payload.job);
      const record = identity
        ? await dismissJob(
            message.payload.job,
            identity,
            message.payload.reason,
          )
        : null;
      if (record) {
        await broadcastExtensionMessage({ type: 'JOB_STATES_CHANGED' });
      }
      return { key: identity?.primaryKey ?? null, persisted: record !== null };
    }
    case 'RESTORE_JOB': {
      const siteId = siteForUrl(sender.tab?.url);
      if (siteId && !message.payload.jobKey.startsWith(`${siteId}:`)) {
        throw new UnauthorizedMessageError();
      }
      if (!siteId) assertExtensionPage(sender);
      const restored = await restoreJob(message.payload.jobKey);
      if (restored) {
        await broadcastExtensionMessage({
          type: 'JOB_STATES_CHANGED',
          payload: { restoredKeys: [message.payload.jobKey] },
        });
      }
      return { restored };
    }
    case 'MARK_SEEN': {
      assertSiteSender(sender, message.payload.job.source);
      const identity = await createJobIdentity(message.payload.job);
      const record = identity
        ? await markJobSeen(message.payload.job, identity)
        : null;
      return { key: identity?.primaryKey ?? null, persisted: record !== null };
    }
    case 'GET_PREFERENCES':
      return getPreferences();
    case 'SET_PREFERENCES':
      assertExtensionPage(sender);
      return setPreferences(message.payload);
    case 'GET_FILTER_SETTINGS':
      return getFilterSettings();
    case 'SET_FILTER_SETTINGS': {
      assertExtensionPage(sender);
      const settings = await setFilterSettings(message.payload);
      await broadcastExtensionMessage({ type: 'SETTINGS_CHANGED' });
      return settings;
    }
    case 'GET_COMMUTE_ORIGIN': {
      assertExtensionPage(sender);
      const settings = await getFilterSettings();
      const profile = settings.profiles.find(({ id }) => id === settings.activeProfileId);
      return getCommuteOrigin(profile?.activeOriginId ?? null);
    }
    case 'SEARCH_LOCATIONS': {
      assertExtensionPage(sender);
      return (await getLocationProvider()).searchLocations(
        message.payload.query,
        message.payload.limit,
      );
    }
    case 'SET_KNOWN_ORIGIN': {
      assertExtensionPage(sender);
      const knownLocation = (await getLocationProvider()).getLocationById(
        message.payload.locationId,
      );
      if (!knownLocation) throw new Error('Unknown location');
      const origin = await saveKnownPlaceOrigin(knownLocation);
      await setActiveOrigin(origin.id);
      return origin;
    }
    case 'SET_BROWSER_ORIGIN': {
      assertExtensionPage(sender);
      const origin = await saveBrowserOrigin(
        message.payload.latitude,
        message.payload.longitude,
        message.payload.accuracyMeters,
      );
      await setActiveOrigin(origin.id);
      return origin;
    }
    case 'SET_MANUAL_ORIGIN': {
      assertExtensionPage(sender);
      const origin = await saveManualOrigin(
        message.payload.label,
        message.payload.latitude,
        message.payload.longitude,
        message.payload.uncertaintyKm,
      );
      await setActiveOrigin(origin.id);
      return origin;
    }
    case 'CLEAR_COMMUTE_ORIGIN':
      assertExtensionPage(sender);
      await clearCommuteOrigins();
      await setActiveOrigin(null);
      return { cleared: true };
    case 'REPORT_PAGE_STATUS': {
      assertSiteSender(sender, message.payload.siteId);
      if (sender.tab?.id === undefined) throw new UnauthorizedMessageError();
      pageStatuses.set(sender.tab.id, message.payload);
      await recordAdapterHealth(message.payload.siteId, message.payload.health);
      void browser.runtime
        .sendMessage({
          type: 'PAGE_STATUS_CHANGED',
          payload: { tabId: sender.tab.id },
        })
        .catch(() => undefined);
      return { reported: true };
    }
    case 'GET_PAGE_STATUS':
      assertExtensionPage(sender);
      return pageStatuses.get(message.payload.tabId) ?? null;
    case 'CLEAR_PAGE_STATUS':
      if (
        sender.tab?.id === undefined ||
        siteForUrl(sender.tab.url) === null
      ) {
        throw new UnauthorizedMessageError();
      }
      pageStatuses.delete(sender.tab.id);
      return { cleared: true };
    case 'GET_DISMISSED_JOBS':
      assertExtensionPage(sender);
      return listDismissedJobs();
    case 'GET_DIAGNOSTICS':
      assertExtensionPage(sender);
      return getDiagnostics();
    case 'SET_DEBUG_LOGGING':
      assertExtensionPage(sender);
      return setDebugLogging(message.payload.enabled);
    case 'CLEAR_LOCAL_DATA':
      assertExtensionPage(sender);
      await Promise.all([browser.storage.local.clear(), clearJobStateData()]);
      await broadcastExtensionMessage({
        type: 'JOB_STATES_CHANGED',
        payload: { reset: true },
      });
      return { cleared: true };
    case 'OPEN_SIDE_PANEL': {
      if (siteForUrl(sender.tab?.url) === null || sender.tab?.id === undefined) {
        throw new UnauthorizedMessageError();
      }
      await browser.sidePanel.open({ tabId: sender.tab.id });
      return { opened: true };
    }
  }
}

export function clearPageStatus(tabId: number): void {
  pageStatuses.delete(tabId);
}

export function messageErrorCode(
  error: unknown,
): 'INVALID_MESSAGE' | 'UNAUTHORIZED' | 'INTERNAL_ERROR' {
  if (error instanceof ZodError) return 'INVALID_MESSAGE';
  if (error instanceof UnauthorizedMessageError) return 'UNAUTHORIZED';
  return 'INTERNAL_ERROR';
}
