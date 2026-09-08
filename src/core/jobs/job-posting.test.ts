import { describe, expect, it } from 'vitest';
import { createJobPostingIdentity } from './job-identity';
import { JobPostingSchema } from './job-posting';

const posting = {
  schemaVersion: 1,
  source: 'seek-nz',
  externalId: '90000001',
  canonicalUrl: 'https://nz.seek.com/job/90000001',
  applicationUrl: 'https://nz.seek.com/job/90000001/apply',
  title: 'Junior Software Developer',
  company: 'Example Logistics',
  location: 'Wellington Central, Wellington',
  employmentType: 'Full time',
  salaryText: null,
  description: 'Build and support warehouse management software.',
  postedAt: '2026-08-25',
  postedAtText: 'Posted 10d ago',
  closesAt: null,
  closesAtText: null,
  extractedAt: '2026-09-04T10:00:00.000Z',
  extractionWarnings: [],
} as const;

describe('JobPosting boundary contract', () => {
  it('accepts a complete posting and rejects unsafe or incomplete input', () => {
    expect(JobPostingSchema.parse(posting)).toEqual(posting);
    expect(() => JobPostingSchema.parse({ ...posting, description: ' ' })).toThrow();
    expect(() => JobPostingSchema.parse({
      ...posting,
      canonicalUrl: 'javascript:alert(1)',
    })).toThrow();
    expect(() => JobPostingSchema.parse({ ...posting, unknown: true })).toThrow();
  });

  it('uses the same stable identity shape as the Agent service', async () => {
    const job = JobPostingSchema.parse(posting);
    await expect(createJobPostingIdentity(job)).resolves.toBe('seek-nz:90000001');
    await expect(createJobPostingIdentity({ ...job, externalId: null })).resolves.toMatch(
      /^seek-nz:url:[a-f0-9]{64}$/,
    );
  });
});
