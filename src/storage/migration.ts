import { z } from 'zod';
import type { LocalFilterSettings } from '../core/rules/rule-types';
import { FilterRuleSchema, FilterSettingsSchema } from './storage-schemas';

const LegacyFilterSettingsSchema = z.strictObject({
  schemaVersion: z.literal(0),
  configurationRevision: z.number().int().nonnegative(),
  rules: z.array(FilterRuleSchema),
});

type IdFactory = () => string;

export function createDefaultFilterSettings(
  idFactory: IdFactory = () => crypto.randomUUID(),
): LocalFilterSettings {
  const now = Date.now();
  const profileId = idFactory();
  return {
    schemaVersion: 2,
    configurationRevision: 0,
    rules: [],
    profiles: [
      {
        id: profileId,
        name: 'Default',
        ruleIds: [],
        activeOriginId: null,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    activeProfileId: profileId,
  };
}

export function migrateFilterSettings(
  input: unknown,
  idFactory: IdFactory = () => crypto.randomUUID(),
): LocalFilterSettings {
  const sanitized = dropRetiredCategories(input);
  if (
    typeof sanitized === 'object' &&
    sanitized !== null &&
    'schemaVersion' in sanitized &&
    sanitized.schemaVersion === 0
  ) {
    const legacy = LegacyFilterSettingsSchema.parse(sanitized);
    const now = Date.now();
    const profileId = idFactory();
    return FilterSettingsSchema.parse({
      schemaVersion: 2,
      configurationRevision: legacy.configurationRevision,
      rules: legacy.rules,
      profiles: [
        {
          id: profileId,
          name: 'Default',
          ruleIds: legacy.rules.map(({ id }) => id),
          activeOriginId: null,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      activeProfileId: profileId,
    });
  }
  if (
    typeof sanitized === 'object' &&
    sanitized !== null &&
    'schemaVersion' in sanitized &&
    sanitized.schemaVersion === 1
  ) {
    return FilterSettingsSchema.parse({ ...sanitized, schemaVersion: 2 });
  }
  return FilterSettingsSchema.parse(sanitized);
}

function dropRetiredCategories(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || !('rules' in input)) return input;
  if (!Array.isArray(input.rules)) return input;
  const rules = input.rules.filter((rule) =>
    typeof rule !== 'object' || rule === null || !('type' in rule) ||
    rule.type !== 'exclude-category',
  );
  const ruleIds = new Set(rules.flatMap((rule) =>
    typeof rule === 'object' && rule !== null && 'id' in rule && typeof rule.id === 'string'
      ? [rule.id]
      : [],
  ));
  const profiles = 'profiles' in input && Array.isArray(input.profiles)
    ? input.profiles.map((profile) =>
        typeof profile === 'object' && profile !== null &&
        'ruleIds' in profile && Array.isArray(profile.ruleIds)
          ? {
              ...profile,
              ruleIds: profile.ruleIds.filter(
                (id: unknown) => typeof id === 'string' && ruleIds.has(id),
              ),
            }
          : profile,
      )
    : undefined;
  return { ...input, rules, ...('profiles' in input ? { profiles } : {}) };
}
