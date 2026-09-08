import { browser } from 'wxt/browser';
import type { LocalFilterSettings } from '../core/rules/rule-types';
import {
  createDefaultFilterSettings,
  migrateFilterSettings,
} from './migration';
import { FilterSettingsSchema, PreferencesSchema } from './storage-schemas';
import type { SyncedPreferences } from './storage-types';

export const FILTER_SETTINGS_KEY = 'filterSettings';
export const PREFERENCES_KEY = 'preferences';

const defaultPreferences: SyncedPreferences = {
  schemaVersion: 1,
  locale: 'en-NZ',
  ui: { showDistance: true, showSeen: true },
};

export async function getFilterSettings(): Promise<LocalFilterSettings> {
  const stored = (await browser.storage.local.get(FILTER_SETTINGS_KEY))[
    FILTER_SETTINGS_KEY
  ] as unknown;
  if (stored === undefined) {
    const settings = createDefaultFilterSettings();
    await browser.storage.local.set({ [FILTER_SETTINGS_KEY]: settings });
    return settings;
  }

  const settings = migrateFilterSettings(stored);
  if (
    typeof stored === 'object' &&
    stored !== null &&
    'schemaVersion' in stored &&
    stored.schemaVersion !== settings.schemaVersion
  ) {
    await browser.storage.local.set({ [FILTER_SETTINGS_KEY]: settings });
  }
  return settings;
}

export async function setFilterSettings(
  input: LocalFilterSettings,
): Promise<LocalFilterSettings> {
  const parsed = FilterSettingsSchema.parse(input);
  const current = await getFilterSettings();
  const settings = FilterSettingsSchema.parse({
    ...parsed,
    schemaVersion: 2,
    configurationRevision: current.configurationRevision + 1,
  });
  await browser.storage.local.set({ [FILTER_SETTINGS_KEY]: settings });
  return settings;
}

export async function getPreferences(): Promise<SyncedPreferences> {
  const stored = (await browser.storage.sync.get(PREFERENCES_KEY))[
    PREFERENCES_KEY
  ] as unknown;
  if (stored === undefined) {
    await browser.storage.sync.set({ [PREFERENCES_KEY]: defaultPreferences });
    return defaultPreferences;
  }
  return PreferencesSchema.parse(stored);
}

export async function setPreferences(
  input: SyncedPreferences,
): Promise<SyncedPreferences> {
  const preferences = PreferencesSchema.parse(input);
  await browser.storage.sync.set({ [PREFERENCES_KEY]: preferences });
  return preferences;
}
