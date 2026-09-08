import type { SiteId } from '../core/jobs/job-types';
import type { AppLocale } from '../i18n';
import type { AdapterHealthResult } from '../adapters/site-adapter';

export interface UiSettings {
  showDistance: boolean;
  showSeen: boolean;
}

export interface SyncedPreferences {
  schemaVersion: 1;
  locale: AppLocale;
  ui: UiSettings;
}

export type PersonalJobStatus = 'seen' | 'dismissed';

export interface JobStateRecord {
  key: string;
  source: SiteId;
  identityBasis: 'external-id' | 'canonical-url';
  externalId: string | null;
  canonicalUrl: string | null;
  title: string;
  company: string | null;
  locationText: string | null;
  status: PersonalJobStatus;
  dismissReason: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
  statusUpdatedAt: number;
}

export interface DiagnosticsState {
  schemaVersion: 1;
  debugLogging: boolean;
  adapters: Partial<Record<SiteId, AdapterHealthResult>>;
}
