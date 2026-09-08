import { normalizeText } from '../text/normalize-text';
import { canonicalizeJobUrl } from './job-identity';
import type { NormalizedJob, RawJob } from './job-types';

function normalizeOptional(value: string | null): string | null {
  if (value === null) return null;
  return normalizeText(value) || null;
}

export function normalizeJob(job: RawJob): NormalizedJob {
  return {
    ...job,
    canonicalUrl: job.canonicalUrl
      ? canonicalizeJobUrl(job.canonicalUrl, job.pageUrl)
      : null,
    normalizedTitle: normalizeText(job.title),
    normalizedCompany: normalizeOptional(job.company),
    normalizedLocationText: normalizeOptional(job.locationText),
    normalizedSummaryText: normalizeOptional(job.summaryText),
  };
}
