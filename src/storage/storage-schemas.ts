import { z } from 'zod';
import type { NormalizedJob } from '../core/jobs/job-types';
import type { AdapterHealthResult } from '../adapters/site-adapter';
import { normalizeText } from '../core/text/normalize-text';
import { isValidPrefixWildcardPattern } from '../core/text/wildcard-matcher';
import type {
  FilterRule,
  LocalFilterSettings,
} from '../core/rules/rule-types';
import type {
  DiagnosticsState,
  JobStateRecord,
  SyncedPreferences,
} from './storage-types';
import type { CommuteOrigin } from '../location/location-types';

const timestamp = z.number().finite().nonnegative();
const httpUrl = z
  .string()
  .max(2_000)
  .refine((input) => {
    try {
      const url = new URL(input);
      return (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, 'Invalid HTTP(S) URL');
const plainPattern = z.string().max(200).superRefine((pattern, context) => {
  if (!normalizeText(pattern) || pattern.includes('*')) {
    context.addIssue({ code: 'custom', message: 'Invalid pattern' });
  }
});

const baseRule = {
  id: z.string().min(1).max(200),
  enabled: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
};

const RuleFieldSchema = z.enum([
  'title',
  'company',
  'location',
  'summary',
  'all',
]);

export const FilterRuleSchema: z.ZodType<FilterRule> = z
  .discriminatedUnion('type', [
    z.strictObject({
      ...baseRule,
      type: z.literal('exclude-keyword'),
      pattern: z.string().max(200),
      matchMode: z.enum(['contains', 'phrase', 'prefix-wildcard']),
      fields: z
        .array(RuleFieldSchema)
        .min(1)
        .max(5)
        .refine((fields) => new Set(fields).size === fields.length),
    }),
    z.strictObject({
      ...baseRule,
      type: z.literal('exclude-company'),
      pattern: plainPattern,
      matchMode: z.enum(['contains', 'exact']),
    }),
    z.strictObject({
      ...baseRule,
      type: z.literal('max-distance'),
      maximumKm: z.number().finite().positive(),
    }),
  ])
  .superRefine((rule, context) => {
    if (rule.type !== 'exclude-keyword') return;
    const normalized = normalizeText(rule.pattern.replaceAll('*', ''));
    const valid =
      normalized.length > 0 &&
      (rule.matchMode === 'prefix-wildcard'
        ? isValidPrefixWildcardPattern(rule.pattern)
        : !rule.pattern.includes('*') &&
          (rule.matchMode === 'phrase' || !normalized.includes(' ')));
    if (!valid) {
      context.addIssue({ path: ['pattern'], code: 'custom', message: 'Invalid pattern' });
    }
  });

const FilterProfileSchema = z.strictObject({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  ruleIds: z.array(z.string().min(1).max(200)),
  activeOriginId: z.string().min(1).max(200).nullable(),
  enabled: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const FilterSettingsSchema: z.ZodType<LocalFilterSettings> = z
  .strictObject({
    schemaVersion: z.literal(2),
    configurationRevision: z.number().int().nonnegative(),
    rules: z.array(FilterRuleSchema),
    profiles: z.array(FilterProfileSchema).min(1),
    activeProfileId: z.string().min(1).max(200),
  })
  .superRefine((settings, context) => {
    const ruleIds = new Set(settings.rules.map(({ id }) => id));
    const profileIds = new Set(settings.profiles.map(({ id }) => id));
    if (ruleIds.size !== settings.rules.length) {
      context.addIssue({ path: ['rules'], code: 'custom', message: 'Duplicate rule ID' });
    }
    if (profileIds.size !== settings.profiles.length) {
      context.addIssue({ path: ['profiles'], code: 'custom', message: 'Duplicate profile ID' });
    }
    if (!profileIds.has(settings.activeProfileId)) {
      context.addIssue({ path: ['activeProfileId'], code: 'custom', message: 'Unknown profile' });
    }
    for (const [index, profile] of settings.profiles.entries()) {
      if (profile.ruleIds.some((id) => !ruleIds.has(id))) {
        context.addIssue({
          path: ['profiles', index, 'ruleIds'],
          code: 'custom',
          message: 'Unknown rule',
        });
      }
    }
  });

export const PreferencesSchema: z.ZodType<SyncedPreferences> = z.strictObject({
  schemaVersion: z.literal(1),
  locale: z.enum(['en-NZ', 'zh-CN']),
  ui: z.strictObject({
    showDistance: z.boolean(),
    showSeen: z.boolean(),
  }),
});

export const CommuteOriginSchema: z.ZodType<CommuteOrigin> = z.strictObject({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().nonnegative().nullable(),
  uncertaintyKm: z.number().finite().min(0.1),
  countryCode: z.literal('NZ'),
  knownLocationId: z.string().min(1).max(200).nullable(),
  source: z.enum(['browser-geolocation', 'known-place', 'manual-coordinate']),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const NormalizedJobSchema: z.ZodType<NormalizedJob> = z.strictObject({
  source: z.literal('seek-nz'),
  externalId: z.string().max(200).nullable(),
  canonicalUrl: httpUrl.nullable(),
  title: z.string().min(1).max(500),
  normalizedTitle: z.string().max(500),
  company: z.string().max(500).nullable(),
  normalizedCompany: z.string().max(500).nullable(),
  locationText: z.string().max(500).nullable(),
  normalizedLocationText: z.string().max(500).nullable(),
  summaryText: z.string().max(5_000).nullable(),
  normalizedSummaryText: z.string().max(5_000).nullable(),
  pageUrl: httpUrl,
  extractedAt: timestamp,
  adapterVersion: z.number().int().positive(),
});

export const AdapterHealthSchema: z.ZodType<AdapterHealthResult> =
  z.strictObject({
    status: z.enum(['healthy', 'degraded', 'broken']),
    detectedCardCount: z.number().int().nonnegative(),
    extractedJobCount: z.number().int().nonnegative(),
    missingIdCount: z.number().int().nonnegative(),
    missingUrlCount: z.number().int().nonnegative(),
    missingTitleCount: z.number().int().nonnegative(),
    missingLocationCount: z.number().int().nonnegative(),
    selectorVersion: z.number().int().positive(),
    checkedAt: timestamp,
  });

export const DiagnosticsStateSchema: z.ZodType<DiagnosticsState> =
  z.strictObject({
    schemaVersion: z.literal(1),
    debugLogging: z.boolean(),
    adapters: z.strictObject({
      'seek-nz': AdapterHealthSchema.optional(),
    }),
  });

export const JobStateRecordSchema: z.ZodType<JobStateRecord> = z.strictObject({
  key: z.string().min(1).max(500),
  source: z.literal('seek-nz'),
  identityBasis: z.enum(['external-id', 'canonical-url']),
  externalId: z.string().max(200).nullable(),
  canonicalUrl: httpUrl.nullable(),
  title: z.string().min(1).max(500),
  company: z.string().max(500).nullable(),
  locationText: z.string().max(500).nullable(),
  status: z.enum(['seen', 'dismissed']),
  dismissReason: z.string().max(200).nullable(),
  firstSeenAt: timestamp,
  lastSeenAt: timestamp,
  statusUpdatedAt: timestamp,
});
