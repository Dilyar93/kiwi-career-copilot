import { browser } from 'wxt/browser';
import type { AdapterHealthResult } from '../adapters/site-adapter';
import type { SiteId } from '../core/jobs/job-types';
import { DiagnosticsStateSchema } from './storage-schemas';
import type { DiagnosticsState } from './storage-types';

export const DIAGNOSTICS_KEY = 'diagnostics';
const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const defaults: DiagnosticsState = {
  schemaVersion: 1,
  debugLogging: false,
  adapters: {},
};

export async function getDiagnostics(
  now = Date.now(),
): Promise<DiagnosticsState> {
  const stored = (await browser.storage.local.get(DIAGNOSTICS_KEY))[
    DIAGNOSTICS_KEY
  ] as unknown;
  if (stored === undefined) return defaults;
  const legacy = typeof stored === 'object' && stored !== null
    ? stored as {
        schemaVersion?: unknown;
        debugLogging?: unknown;
        adapters?: Record<string, unknown>;
      }
    : {};
  const parsed = DiagnosticsStateSchema.safeParse({
    schemaVersion: legacy.schemaVersion,
    debugLogging: legacy.debugLogging,
    adapters: legacy.adapters?.['seek-nz']
      ? { 'seek-nz': legacy.adapters['seek-nz'] }
      : {},
  });
  const diagnostics = parsed.success ? parsed.data : defaults;
  const adapters = Object.fromEntries(
    Object.entries(diagnostics.adapters).filter(
      ([, health]) => health && health.checkedAt >= now - RETENTION_MS,
    ),
  );
  if (
    Object.keys(adapters).length !== Object.keys(diagnostics.adapters).length ||
    Object.keys(legacy.adapters ?? {}).length !== Object.keys(diagnostics.adapters).length
  ) {
    const cleaned = DiagnosticsStateSchema.parse({ ...diagnostics, adapters });
    await browser.storage.local.set({ [DIAGNOSTICS_KEY]: cleaned });
    return cleaned;
  }
  return diagnostics;
}

export async function setDebugLogging(
  enabled: boolean,
): Promise<DiagnosticsState> {
  const diagnostics = DiagnosticsStateSchema.parse({
    ...(await getDiagnostics()),
    debugLogging: enabled,
  });
  await browser.storage.local.set({ [DIAGNOSTICS_KEY]: diagnostics });
  return diagnostics;
}

export async function recordAdapterHealth(
  siteId: SiteId,
  health: AdapterHealthResult,
): Promise<void> {
  const diagnostics = await getDiagnostics();
  if (diagnostics.adapters[siteId]?.checkedAt === health.checkedAt) return;
  await browser.storage.local.set({
    [DIAGNOSTICS_KEY]: DiagnosticsStateSchema.parse({
      ...diagnostics,
      adapters: { ...diagnostics.adapters, [siteId]: health },
    }),
  });
}
