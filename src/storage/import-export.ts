import { z } from 'zod';
import type { LocalFilterSettings } from '../core/rules/rule-types';
import {
  FilterSettingsSchema,
  PreferencesSchema,
  CommuteOriginSchema,
} from './storage-schemas';
import type { SyncedPreferences } from './storage-types';
import type { CommuteOrigin } from '../location/location-types';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const ExportBundleSchema = z.strictObject({
  format: z.literal('jobfilter'),
  version: z.literal(2),
  exportedAt: z.iso.datetime(),
  preferences: PreferencesSchema,
  filterSettings: FilterSettingsSchema,
  commuteOrigins: CommuteOriginSchema.array().max(1).optional(),
});

export type ExportBundle = z.infer<typeof ExportBundleSchema>;

export function createExportBundle(
  preferences: SyncedPreferences,
  filterSettings: LocalFilterSettings,
  now = new Date(),
  commuteOrigins?: CommuteOrigin[],
): ExportBundle {
  return ExportBundleSchema.parse({
    format: 'jobfilter',
    version: 2,
    exportedAt: now.toISOString(),
    preferences,
    filterSettings,
    ...(commuteOrigins && { commuteOrigins }),
  });
}

export function parseImportBundle(input: string): ExportBundle {
  if (new TextEncoder().encode(input).byteLength > MAX_IMPORT_BYTES) {
    throw new Error('IMPORT_TOO_LARGE');
  }
  return ExportBundleSchema.parse(JSON.parse(input) as unknown);
}

export function mergeImportedRules(
  current: LocalFilterSettings,
  imported: LocalFilterSettings,
): LocalFilterSettings {
  const existingIds = new Set(current.rules.map(({ id }) => id));
  const addedRules = imported.rules.filter(({ id }) => !existingIds.has(id));
  if (!addedRules.length) return current;
  const activeProfile = current.profiles.find(
    ({ id }) => id === current.activeProfileId,
  );
  if (!activeProfile) return current;
  const addedIds = addedRules.map(({ id }) => id);
  return FilterSettingsSchema.parse({
    ...current,
    rules: [...current.rules, ...addedRules],
    profiles: current.profiles.map((profile) =>
      profile.id === activeProfile.id
        ? {
            ...profile,
            ruleIds: [...new Set([...profile.ruleIds, ...addedIds])],
            updatedAt: Date.now(),
          }
        : profile,
    ),
  });
}
