import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  JobStateRecord,
  PersonalJobStatus,
} from './storage-types';

export const DATABASE_NAME = 'jobfilter';
const DATABASE_VERSION = 1;

interface JobFilterDatabase extends DBSchema {
  jobStates: {
    key: string;
    value: JobStateRecord;
    indexes: {
      'by-status': PersonalJobStatus;
      'by-status-last-seen': [PersonalJobStatus, number];
    };
  };
  metadata: {
    key: string;
    value: { key: string; value: unknown };
  };
}

let databasePromise: Promise<IDBPDatabase<JobFilterDatabase>> | undefined;

export function getDatabase(): Promise<IDBPDatabase<JobFilterDatabase>> {
  databasePromise ??= openDB<JobFilterDatabase>(
    DATABASE_NAME,
    DATABASE_VERSION,
    {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const states = database.createObjectStore('jobStates', {
            keyPath: 'key',
          });
          states.createIndex('by-status', 'status');
          states.createIndex('by-status-last-seen', [
            'status',
            'lastSeenAt',
          ]);
          database.createObjectStore('metadata', { keyPath: 'key' });
        }
      },
    },
  );
  return databasePromise;
}

export async function closeDatabase(): Promise<void> {
  if (!databasePromise) return;
  (await databasePromise).close();
  databasePromise = undefined;
}
