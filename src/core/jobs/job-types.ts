export type SiteId = 'seek-nz';

export interface NormalizedJob {
  source: SiteId;
  externalId: string | null;
  canonicalUrl: string | null;
  title: string;
  normalizedTitle: string;
  company: string | null;
  normalizedCompany: string | null;
  locationText: string | null;
  normalizedLocationText: string | null;
  summaryText: string | null;
  normalizedSummaryText: string | null;
  pageUrl: string;
  extractedAt: number;
  adapterVersion: number;
}

export type RawJob = Omit<
  NormalizedJob,
  | 'normalizedTitle'
  | 'normalizedCompany'
  | 'normalizedLocationText'
  | 'normalizedSummaryText'
>;
