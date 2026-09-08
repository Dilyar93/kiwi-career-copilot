import { z } from 'zod';
import type { LocalFilterSettings } from '../core/rules/rule-types';
import type { DistanceMetadata } from '../core/rules/rule-types';
import type { CommuteOrigin, KnownLocation } from '../location/location-types';
import {
  AdapterHealthSchema,
  FilterSettingsSchema,
  NormalizedJobSchema,
  PreferencesSchema,
} from '../storage/storage-schemas';
import type {
  DiagnosticsState,
  JobStateRecord,
  SyncedPreferences,
} from '../storage/storage-types';

export const PageStatusSchema = z
  .strictObject({
    siteId: z.literal('seek-nz'),
    scanned: z.number().int().nonnegative(),
    shown: z.number().int().nonnegative(),
    hidden: z.number().int().nonnegative(),
    hiddenReasons: z.array(
      z.strictObject({
        type: z.enum([
          'exclude-keyword',
          'exclude-company',
          'max-distance',
          'dismissed',
        ]),
        count: z.number().int().nonnegative(),
      }),
    ),
    parsedLocationCount: z.number().int().nonnegative(),
    showHidden: z.boolean(),
    health: AdapterHealthSchema,
    updatedAt: z.number().finite().nonnegative(),
  })
  .refine(({ scanned, shown, hidden }) => shown + hidden === scanned, {
    message: 'Invalid page counts',
  });

export type PageStatus = z.infer<typeof PageStatusSchema>;

const empty = <T extends string>(type: T) =>
  z.strictObject({ type: z.literal(type) });

export const ExtensionMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('GET_PAGE_CONTEXT'),
    payload: z.strictObject({
      siteId: z.literal('seek-nz'),
      jobs: z
        .array(
          z.strictObject({
            key: z.string().min(1).max(500),
            locationText: z.string().max(500).nullable(),
          }),
        )
        .max(500),
    }),
  }),
  z.strictObject({
    type: z.literal('DISMISS_JOB'),
    payload: z.strictObject({
      job: NormalizedJobSchema,
      reason: z.string().max(200).nullable(),
    }),
  }),
  z.strictObject({
    type: z.literal('RESTORE_JOB'),
    payload: z.strictObject({ jobKey: z.string().min(1).max(500) }),
  }),
  z.strictObject({
    type: z.literal('MARK_SEEN'),
    payload: z.strictObject({ job: NormalizedJobSchema }),
  }),
  empty('GET_PREFERENCES'),
  z.strictObject({
    type: z.literal('SET_PREFERENCES'),
    payload: PreferencesSchema,
  }),
  empty('GET_FILTER_SETTINGS'),
  z.strictObject({
    type: z.literal('SET_FILTER_SETTINGS'),
    payload: FilterSettingsSchema,
  }),
  empty('GET_COMMUTE_ORIGIN'),
  z.strictObject({
    type: z.literal('SEARCH_LOCATIONS'),
    payload: z.strictObject({
      query: z.string().min(1).max(200),
      limit: z.number().int().min(1).max(50).optional(),
    }),
  }),
  z.strictObject({
    type: z.literal('SET_KNOWN_ORIGIN'),
    payload: z.strictObject({ locationId: z.string().min(1).max(200) }),
  }),
  z.strictObject({
    type: z.literal('SET_BROWSER_ORIGIN'),
    payload: z.strictObject({
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      accuracyMeters: z.number().finite().nonnegative().max(1_000_000),
    }),
  }),
  z.strictObject({
    type: z.literal('SET_MANUAL_ORIGIN'),
    payload: z.strictObject({
      label: z.string().min(1).max(200),
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      uncertaintyKm: z.number().finite().min(0.1).max(20_000),
    }),
  }),
  empty('CLEAR_COMMUTE_ORIGIN'),
  z.strictObject({
    type: z.literal('REPORT_PAGE_STATUS'),
    payload: PageStatusSchema,
  }),
  z.strictObject({
    type: z.literal('GET_PAGE_STATUS'),
    payload: z.strictObject({ tabId: z.number().int().nonnegative() }),
  }),
  empty('CLEAR_PAGE_STATUS'),
  empty('GET_DISMISSED_JOBS'),
  empty('GET_DIAGNOSTICS'),
  z.strictObject({
    type: z.literal('SET_DEBUG_LOGGING'),
    payload: z.strictObject({ enabled: z.boolean() }),
  }),
  empty('CLEAR_LOCAL_DATA'),
  empty('OPEN_SIDE_PANEL'),
]);

export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;

export interface MessageResponseMap {
  GET_PAGE_CONTEXT: {
    filterSettings: LocalFilterSettings;
    jobStates: Record<string, JobStateRecord>;
    distances: Record<string, DistanceMetadata & { distanceEligible: boolean }>;
    distanceEnabled: boolean;
  };
  DISMISS_JOB: { key: string | null; persisted: boolean };
  RESTORE_JOB: { restored: boolean };
  MARK_SEEN: { key: string | null; persisted: boolean };
  GET_PREFERENCES: SyncedPreferences;
  SET_PREFERENCES: SyncedPreferences;
  GET_FILTER_SETTINGS: LocalFilterSettings;
  SET_FILTER_SETTINGS: LocalFilterSettings;
  GET_COMMUTE_ORIGIN: CommuteOrigin | null;
  SEARCH_LOCATIONS: KnownLocation[];
  SET_KNOWN_ORIGIN: CommuteOrigin;
  SET_BROWSER_ORIGIN: CommuteOrigin;
  SET_MANUAL_ORIGIN: CommuteOrigin;
  CLEAR_COMMUTE_ORIGIN: { cleared: true };
  REPORT_PAGE_STATUS: { reported: true };
  GET_PAGE_STATUS: PageStatus | null;
  CLEAR_PAGE_STATUS: { cleared: true };
  GET_DISMISSED_JOBS: JobStateRecord[];
  GET_DIAGNOSTICS: DiagnosticsState;
  SET_DEBUG_LOGGING: DiagnosticsState;
  CLEAR_LOCAL_DATA: { cleared: true };
  OPEN_SIDE_PANEL: { opened: true };
}

export type MessageResponse =
  | { ok: true; data: unknown }
  | {
      ok: false;
      error: 'INVALID_MESSAGE' | 'UNAUTHORIZED' | 'INTERNAL_ERROR';
    };
