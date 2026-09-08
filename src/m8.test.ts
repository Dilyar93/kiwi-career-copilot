import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { normalizeJob } from './core/jobs/job-normalizer';
import { evaluateJob } from './core/rules/rule-engine';
import type { FilterRule } from './core/rules/rule-types';

describe('M8 performance budget', () => {
  it('evaluates 100 normalized cards with 20 rules in under 250ms', () => {
    const jobs = Array.from({ length: 100 }, (_, index) => normalizeJob({
      source: 'seek-nz',
      externalId: String(index),
      canonicalUrl: `https://www.seek.co.nz/job/${index}`,
      title: index % 2 ? 'Commercial Cleaner' : 'Office Assistant',
      company: 'Fixture Company',
      locationText: 'Hamilton',
      summaryText: 'A short local fixture summary.',
      pageUrl: 'https://www.seek.co.nz/jobs',
      extractedAt: 1,
      adapterVersion: 1,
    }));
    const rules: FilterRule[] = Array.from({ length: 20 }, (_, index) => ({
      id: `rule-${index}`,
      type: 'exclude-keyword',
      enabled: true,
      pattern: index === 19 ? 'clean*' : `unused${index}`,
      matchMode: index === 19 ? 'prefix-wildcard' : 'contains',
      fields: ['title'],
      createdAt: 1,
      updatedAt: 1,
    }));
    const startedAt = performance.now();
    const results = jobs.map((job) => evaluateJob(job, { rules }));
    const elapsedMs = performance.now() - startedAt;

    expect(results.filter(({ visible }) => !visible)).toHaveLength(50);
    expect(elapsedMs).toBeLessThanOrEqual(250);
  });
});
