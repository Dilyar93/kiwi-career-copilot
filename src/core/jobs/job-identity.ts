import type { NormalizedJob, SiteId } from './job-types';
import type { JobPosting } from './job-posting';

export interface JobIdentity {
  primaryKey: string;
  source: SiteId;
  basis: 'external-id' | 'canonical-url' | 'fallback-fingerprint';
  persistent: boolean;
  externalId: string | null;
  canonicalUrlHash: string | null;
  fallbackFingerprint: string;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function canonicalizeJobUrl(
  input: string,
  baseUrl?: string,
): string | null {
  try {
    const url = new URL(input, baseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    url.username = '';
    url.password = '';
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return null;
  }
}

export async function createJobIdentity(
  job: NormalizedJob,
): Promise<JobIdentity | null> {
  if (!job.normalizedTitle) return null;

  const fallbackFingerprint = await sha256(
    [
      job.source,
      job.normalizedTitle,
      job.normalizedCompany ?? '',
      job.normalizedLocationText ?? '',
    ].join('\u001f'),
  );
  const externalId = job.externalId?.trim() || null;

  if (externalId) {
    return {
      primaryKey: `${job.source}:${externalId}`,
      source: job.source,
      basis: 'external-id',
      persistent: true,
      externalId,
      canonicalUrlHash: null,
      fallbackFingerprint,
    };
  }

  const canonicalUrl = job.canonicalUrl
    ? canonicalizeJobUrl(job.canonicalUrl, job.pageUrl)
    : null;

  if (canonicalUrl) {
    const canonicalUrlHash = await sha256(canonicalUrl);
    return {
      primaryKey: `${job.source}:url:${canonicalUrlHash}`,
      source: job.source,
      basis: 'canonical-url',
      persistent: true,
      externalId: null,
      canonicalUrlHash,
      fallbackFingerprint,
    };
  }

  return {
    primaryKey: `${job.source}:fallback:${fallbackFingerprint}`,
    source: job.source,
    basis: 'fallback-fingerprint',
    persistent: false,
    externalId: null,
    canonicalUrlHash: null,
    fallbackFingerprint,
  };
}

export async function createJobPostingIdentity(job: JobPosting): Promise<string> {
  const externalId = job.externalId?.trim();
  return externalId
    ? `${job.source}:${externalId}`
    : `${job.source}:url:${await sha256(job.canonicalUrl)}`;
}
