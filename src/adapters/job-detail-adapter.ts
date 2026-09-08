import type { JobPosting } from '../core/jobs/job-posting';
import type { SiteId } from '../core/jobs/job-types';
import type { ExtractionDiagnostics } from './site-adapter';

export type ExtractJobDetailResult =
  | {
      ok: true;
      job: JobPosting;
      diagnostics: ExtractionDiagnostics;
    }
  | {
      ok: false;
      reason:
        | 'not-a-job-detail'
        | 'missing-title'
        | 'missing-description'
        | 'missing-job-url'
        | 'parse-error';
      diagnostics: ExtractionDiagnostics;
    };

export interface JobDetailAdapter {
  readonly id: SiteId;
  canHandle(url: URL): boolean;
  extractCurrentJob(document: Document, url: URL): ExtractJobDetailResult;
}
