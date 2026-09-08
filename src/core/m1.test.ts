import { describe, expect, it } from 'vitest';
import {
  canonicalizeJobUrl,
  createJobIdentity,
} from './jobs/job-identity';
import { normalizeJob } from './jobs/job-normalizer';
import type { RawJob } from './jobs/job-types';
import { evaluateJob } from './rules/rule-engine';
import type { FilterRule } from './rules/rule-types';
import { normalizeText } from './text/normalize-text';
import {
  isValidPrefixWildcardPattern,
  matchesPrefixWildcard,
} from './text/wildcard-matcher';

const rawJob: RawJob = {
  source: 'seek-nz',
  externalId: null,
  canonicalUrl: null,
  title: 'Part-time Commercial Cleaner',
  company: 'Acme Recruitment',
  locationText: 'Hamilton Central, Waikato',
  summaryText: 'Join our commercial cleaning team.',
  pageUrl: 'https://www.seek.co.nz/jobs',
  extractedAt: 1,
  adapterVersion: 1,
};

describe('text matching', () => {
  it('normalizes punctuation, whitespace, case, and macrons', () => {
    expect(normalizeText('  Ngāruawāhia — HAMILTON  CENTRAL ')).toBe(
      'ngaruawahia hamilton central',
    );
    expect(normalizeText('Ngāruawāhia', { stripMarks: false })).toBe(
      'ngāruawāhia',
    );
  });

  it('only accepts a single-token trailing wildcard', () => {
    expect(matchesPrefixWildcard('commercial cleaner', 'clean*')).toBe(true);
    expect(matchesPrefixWildcard('commercial unclean', 'clean*')).toBe(false);
    expect(isValidPrefixWildcardPattern('*')).toBe(false);
    expect(isValidPrefixWildcardPattern('cl*ean')).toBe(false);
    expect(isValidPrefixWildcardPattern('commercial clean*')).toBe(false);
  });
});

describe('job normalization and identity', () => {
  it('normalizes fields and canonical URLs without changing display text', () => {
    const job = normalizeJob({
      ...rawJob,
      canonicalUrl: '/job/123/?utm_source=test#details',
    });
    expect(job.title).toBe(rawJob.title);
    expect(job.normalizedTitle).toBe('part time commercial cleaner');
    expect(job.canonicalUrl).toBe('https://www.seek.co.nz/job/123');
    expect(canonicalizeJobUrl('https://user:secret@example.com/job/1')).toBe(
      'https://example.com/job/1',
    );
    expect(canonicalizeJobUrl('javascript:alert(1)')).toBeNull();
  });

  it('uses ID, URL, then a non-persistent fallback', async () => {
    const idIdentity = await createJobIdentity(
      normalizeJob({ ...rawJob, externalId: '123', canonicalUrl: '/job/123' }),
    );
    expect(idIdentity).toMatchObject({
      primaryKey: 'seek-nz:123',
      basis: 'external-id',
      persistent: true,
    });

    const urlIdentity = await createJobIdentity(
      normalizeJob({ ...rawJob, canonicalUrl: '/job/123?tracking=one' }),
    );
    expect(urlIdentity).toMatchObject({
      basis: 'canonical-url',
      persistent: true,
    });

    const fallbackIdentity = await createJobIdentity(normalizeJob(rawJob));
    expect(fallbackIdentity).toMatchObject({
      basis: 'fallback-fingerprint',
      persistent: false,
    });
    expect(fallbackIdentity?.fallbackFingerprint).toHaveLength(64);
    expect(
      await createJobIdentity(normalizeJob({ ...rawJob, title: '  ' })),
    ).toBeNull();
  });
});

describe('rule engine', () => {
  const base = { enabled: true, createdAt: 1, updatedAt: 1 };
  const rules: FilterRule[] = [
    {
      ...base,
      id: 'keyword',
      type: 'exclude-keyword',
      pattern: 'clean*',
      matchMode: 'prefix-wildcard',
      fields: ['title'],
    },
    {
      ...base,
      id: 'company',
      type: 'exclude-company',
      pattern: 'Acme',
      matchMode: 'contains',
    },
    {
      ...base,
      id: 'distance',
      type: 'max-distance',
      maximumKm: 40,
    },
  ];

  it('collects every reason in the required priority order', () => {
    const result = evaluateJob(normalizeJob(rawJob), {
      rules,
      jobState: { status: 'dismissed' },
      distance: {
        centreDistanceKm: 70,
        conservativeDistanceKm: 65,
        confidence: 'high',
        originUncertaintyKm: 1,
        destinationUncertaintyKm: 4,
        distanceEligible: true,
      },
    });

    expect(result.visible).toBe(false);
    expect(result.reasons.map(({ ruleType }) => ruleType)).toEqual([
      'dismissed',
      'exclude-company',
      'exclude-keyword',
      'max-distance',
    ]);
    expect(result.reasons[2]).toMatchObject({
      matchedField: 'title',
      label: 'clean*',
    });
  });

  it('uses whole tokens and phrases and fails open for invalid input', () => {
    const job = normalizeJob({ ...rawJob, title: 'Cleaner' });
    const keyword = (pattern: string, matchMode: 'contains' | 'phrase') =>
      evaluateJob(job, {
        rules: [
          {
            ...base,
            id: pattern,
            type: 'exclude-keyword',
            pattern,
            matchMode,
            fields: ['all'],
          },
        ],
      }).visible;

    expect(keyword('clean', 'contains')).toBe(true);
    expect(keyword('commercial cleaning', 'phrase')).toBe(false);
    expect(keyword('clean*', 'contains')).toBe(true);
  });

  it('keeps jobs when distance is not eligible', () => {
    const result = evaluateJob(normalizeJob(rawJob), {
      rules: [rules[2]!],
      distance: {
        centreDistanceKm: 70,
        conservativeDistanceKm: 65,
        confidence: 'unknown',
        originUncertaintyKm: 1,
        destinationUncertaintyKm: 4,
        distanceEligible: false,
      },
    });
    expect(result.visible).toBe(true);
    expect(result.distance?.confidence).toBe('unknown');
    expect(result.distance).not.toHaveProperty('distanceEligible');
  });
});
