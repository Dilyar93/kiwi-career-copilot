import type { JobIdentity } from '../core/jobs/job-identity';
import type { NormalizedJob } from '../core/jobs/job-types';
import { getDatabase } from './database';
import type { JobStateRecord } from './storage-types';

const SEEN_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;

function canPersist(identity: JobIdentity): boolean {
  return identity.persistent && identity.basis !== 'fallback-fingerprint';
}

function createRecord(
  job: NormalizedJob,
  identity: JobIdentity,
  status: 'seen' | 'dismissed',
  now: number,
  dismissReason: string | null,
  existing?: JobStateRecord,
): JobStateRecord {
  if (!canPersist(identity)) throw new Error('Job identity is not persistent');
  return {
    key: identity.primaryKey,
    source: job.source,
    identityBasis: identity.basis as 'external-id' | 'canonical-url',
    externalId: identity.externalId,
    canonicalUrl: job.canonicalUrl,
    title: job.title,
    company: job.company,
    locationText: job.locationText,
    status,
    dismissReason,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
    statusUpdatedAt:
      existing?.status === status ? existing.statusUpdatedAt : now,
  };
}

export async function markJobSeen(
  job: NormalizedJob,
  identity: JobIdentity,
  now = Date.now(),
): Promise<JobStateRecord | null> {
  if (!canPersist(identity)) return null;
  const database = await getDatabase();
  const existing = await database.get('jobStates', identity.primaryKey);
  const record = createRecord(
    job,
    identity,
    existing?.status ?? 'seen',
    now,
    existing?.dismissReason ?? null,
    existing,
  );
  await database.put('jobStates', record);
  return record;
}

export async function dismissJob(
  job: NormalizedJob,
  identity: JobIdentity,
  reason: string | null,
  now = Date.now(),
): Promise<JobStateRecord | null> {
  if (!canPersist(identity)) return null;
  const database = await getDatabase();
  const existing = await database.get('jobStates', identity.primaryKey);
  const record = createRecord(
    job,
    identity,
    'dismissed',
    now,
    reason,
    existing,
  );
  await database.put('jobStates', record);
  return record;
}

export async function restoreJob(key: string): Promise<boolean> {
  const database = await getDatabase();
  const exists = (await database.getKey('jobStates', key)) !== undefined;
  if (exists) await database.delete('jobStates', key);
  return exists;
}

export async function getJobStates(
  keys: string[],
): Promise<Record<string, JobStateRecord>> {
  const uniqueKeys = [...new Set(keys)];
  const database = await getDatabase();
  const transaction = database.transaction('jobStates');
  const records = await Promise.all(
    uniqueKeys.map((key) => transaction.store.get(key)),
  );
  await transaction.done;
  return Object.fromEntries(
    records.filter((record): record is JobStateRecord => record !== undefined).map(
      (record) => [record.key, record],
    ),
  );
}

export async function listDismissedJobs(): Promise<JobStateRecord[]> {
  const database = await getDatabase();
  const records = await database.getAllFromIndex(
    'jobStates',
    'by-status',
    'dismissed',
  );
  return records
    .filter((record) => record.source === 'seek-nz')
    .sort((a, b) => b.statusUpdatedAt - a.statusUpdatedAt);
}

export async function cleanupExpiredSeen(now = Date.now()): Promise<number> {
  const database = await getDatabase();
  const keys = await database.getAllKeysFromIndex(
    'jobStates',
    'by-status-last-seen',
    IDBKeyRange.bound(['seen', 0], ['seen', now - SEEN_RETENTION_MS], false, true),
  );
  const transaction = database.transaction('jobStates', 'readwrite');
  await Promise.all([
    ...keys.map((key) => transaction.store.delete(key)),
    transaction.done,
  ]);
  return keys.length;
}

export async function clearJobStateData(): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(
    ['jobStates', 'metadata'],
    'readwrite',
  );
  await Promise.all([
    transaction.objectStore('jobStates').clear(),
    transaction.objectStore('metadata').clear(),
    transaction.done,
  ]);
}
