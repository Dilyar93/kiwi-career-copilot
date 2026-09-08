// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SeekAdapter } from './adapters/seek/seek-adapter';
import { createJobIdentity } from './core/jobs/job-identity';
import type { CardDecorationContext } from './adapters/site-adapter';

const pageUrl = new URL('https://www.seek.co.nz/jobs?where=Waikato');
const detailFixture = readFileSync('tests/fixtures/seek-job-detail.html', 'utf8');
const partialDetailFixture = readFileSync(
  'tests/fixtures/seek-job-detail-missing.html',
  'utf8',
);
const dynamicDetailFixture = readFileSync(
  'tests/fixtures/seek-job-detail-dynamic.html',
  'utf8',
);

const fixture = `<section data-automation="searchResults">
  <article data-automation="normalJob" data-job-id="12345678">
    <h3><a data-automation="jobTitle" href="/job/12345678?type=standard#apply">Commercial Cleaner</a></h3>
    <span data-automation="jobCompany">Example Services</span>
    <span data-automation="jobLocation">Hamilton Central, Waikato</span>
    <p data-automation="jobShortDescription">Evening commercial cleaning work.</p>
  </article>
  <article data-automation="normalJob">
    <h3><a data-automation="jobTitle" href="/job/87654321">Retail Assistant</a></h3>
    <span data-automation="jobCompany">Example Retail</span>
    <span data-automation="jobLocation">Hamilton, Waikato</span>
  </article>
</section>`;

beforeEach(() => {
  document.body.innerHTML = fixture;
});

describe('SEEK adapter contract', () => {
  it('matches only the specified SEEK origins', () => {
    const adapter = new SeekAdapter();
    expect(adapter.canHandle(pageUrl)).toBe(true);
    expect(adapter.canHandle(new URL('https://nz.seek.com/jobs'))).toBe(true);
    expect(adapter.canHandle(new URL('http://www.seek.co.nz/jobs'))).toBe(false);
    expect(adapter.canHandle(new URL('https://seek.com/jobs'))).toBe(false);
    expect(adapter.canHandle(new URL('https://www.trademe.co.nz/a/jobs/'))).toBe(false);
  });

  it('finds cards and extracts normalized fields and identity inputs', async () => {
    const adapter = new SeekAdapter();
    const root = adapter.findListRoots(document)[0]!;
    const cards = adapter.findJobCards(root);
    const result = adapter.extractJob(cards[0]!, pageUrl);

    expect(cards).toHaveLength(2);
    expect(result).toMatchObject({
      ok: true,
      job: {
        externalId: '12345678',
        canonicalUrl: 'https://www.seek.co.nz/job/12345678',
        title: 'Commercial Cleaner',
        company: 'Example Services',
        locationText: 'Hamilton Central, Waikato',
        summaryText: 'Evening commercial cleaning work.',
      },
    });
    if (!result.ok) throw new Error('Expected extracted job');
    expect((await createJobIdentity(result.job))?.basis).toBe('external-id');
  });

  it('falls back from a missing ID to URL, then to a session fingerprint', async () => {
    const adapter = new SeekAdapter();
    const second = adapter.findJobCards(document)[1]!;
    second
      .querySelector('a')
      ?.setAttribute('href', '/job/example-retail-assistant');
    const urlResult = adapter.extractJob(second, pageUrl);
    if (!urlResult.ok) throw new Error('Expected URL fallback job');
    expect((await createJobIdentity(urlResult.job))?.basis).toBe('canonical-url');

    second.querySelector('a')?.removeAttribute('href');
    const fallbackResult = adapter.extractJob(second, pageUrl);
    if (!fallbackResult.ok) throw new Error('Expected fingerprint fallback job');
    expect((await createJobIdentity(fallbackResult.job))?.basis).toBe(
      'fallback-fingerprint',
    );
    expect(fallbackResult.diagnostics.missingFields).toContain('url');
  });

  it('fails open on a missing title', () => {
    const adapter = new SeekAdapter();
    const card = adapter.findJobCards(document)[0]!;
    card.querySelector('[data-automation="jobTitle"]')?.remove();
    expect(adapter.extractJob(card, pageUrl)).toMatchObject({
      ok: false,
      reason: 'missing-title',
    });
    expect(card.classList.contains('jobfilter-hidden')).toBe(false);
    expect(adapter.runHealthCheck(document, pageUrl).status).toBe('degraded');
  });

  it('does not duplicate card controls', async () => {
    const adapter = new SeekAdapter();
    const card = adapter.findJobCards(document)[0]!;
    const result = adapter.extractJob(card, pageUrl);
    if (!result.ok) throw new Error('Expected extracted job');
    const identity = (await createJobIdentity(result.job))!;
    const context: CardDecorationContext = {
      identity,
      evaluation: { visible: true, reasons: [] },
      seen: false,
      dismissed: false,
      onDismiss() {},
      onRestore() {},
    };

    adapter.decorateCard(card, context);
    adapter.decorateCard(card, context);
    expect(card.querySelectorAll('[data-jobfilter-controls]')).toHaveLength(1);
    expect(card.classList.contains('jobfilter-card')).toBe(true);
  });

  it('reports healthy, broken, and explicit no-results states', () => {
    const adapter = new SeekAdapter();
    expect(adapter.runHealthCheck(document, pageUrl)).toMatchObject({
      status: 'healthy',
      detectedCardCount: 2,
      extractedJobCount: 2,
      missingIdCount: 0,
    });

    document.body.innerHTML = '<main></main>';
    expect(adapter.runHealthCheck(document, pageUrl).status).toBe('broken');
    document.body.innerHTML = '<main data-automation="noSearchResults"></main>';
    expect(adapter.runHealthCheck(document, pageUrl).status).toBe('healthy');
  });

  it('extracts a validated current posting and reports partial descriptions', () => {
    const adapter = new SeekAdapter();
    const detailDocument = new DOMParser().parseFromString(detailFixture, 'text/html');
    const result = adapter.extractCurrentJob(
      detailDocument,
      new URL('https://nz.seek.com/job/90000001?tracking=one#apply'),
    );

    expect(result).toMatchObject({
      ok: true,
      job: {
        schemaVersion: 1,
        source: 'seek-nz',
        externalId: '90000001',
        canonicalUrl: 'https://nz.seek.com/job/90000001',
        applicationUrl: 'https://nz.seek.com/job/90000001/apply',
        title: 'Junior Software Developer',
        company: 'Example Logistics',
        location: 'Wellington Central, Wellington',
        employmentType: 'Full time',
      },
    });
    if (!result.ok) throw new Error('Expected current job detail');
    expect(result.job.description).toContain('Strong SQL and database fundamentals');

    const partialDocument = new DOMParser().parseFromString(
      partialDetailFixture,
      'text/html',
    );
    const partial = adapter.extractCurrentJob(
      partialDocument,
      new URL('https://nz.seek.com/jobs?jobId=90000002'),
    );
    if (!partial.ok) throw new Error('Expected partial current job detail');
    expect(partial.job.extractionWarnings).toEqual(
      expect.arrayContaining(['missing:company', 'description-may-be-collapsed']),
    );
    partialDocument.querySelector('[data-automation="jobAdDetails"]')?.remove();
    expect(
      adapter.extractCurrentJob(
        partialDocument,
        new URL('https://nz.seek.com/jobs?jobId=90000002'),
      ),
    ).toMatchObject({ ok: false, reason: 'missing-description' });
  });

  it('reads the currently selected job after the SPA replaces its detail root', () => {
    const adapter = new SeekAdapter();
    const detailDocument = new DOMParser().parseFromString(
      dynamicDetailFixture,
      'text/html',
    );
    const selectedUrl = new URL('https://nz.seek.com/jobs?jobId=90000004');
    const initialSignature = adapter.getPageSignature(detailDocument, selectedUrl);
    const first = adapter.extractCurrentJob(
      detailDocument,
      new URL('https://nz.seek.com/jobs?jobId=90000003'),
    );
    const next = detailDocument.querySelector<HTMLTemplateElement>('#next-job')!;
    detailDocument
      .querySelector('[data-automation="jobDetailsPage"]')
      ?.replaceWith(next.content.firstElementChild!.cloneNode(true));
    expect(adapter.getPageSignature(detailDocument, selectedUrl)).not.toBe(initialSignature);
    const second = adapter.extractCurrentJob(
      detailDocument,
      new URL('https://nz.seek.com/jobs?jobId=90000004'),
    );

    expect(first).toMatchObject({ ok: true, job: { title: 'Support Engineer' } });
    expect(second).toMatchObject({
      ok: true,
      job: { externalId: '90000004', title: 'Platform Engineer' },
    });
  });
});
