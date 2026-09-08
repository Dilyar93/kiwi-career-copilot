import { canonicalizeJobUrl } from '../../core/jobs/job-identity';
import { JobPostingSchema } from '../../core/jobs/job-posting';
import type { ExtractJobDetailResult } from '../job-detail-adapter';
import { SEEK_SELECTORS } from './seek-selectors';

function firstElement<T extends Element>(
  root: ParentNode,
  selectors: readonly string[],
): T | null {
  for (const selector of selectors) {
    const element = root.querySelector<T>(selector);
    if (element) return element;
  }
  return null;
}

function cleanText(element: Element | null): string | null {
  if (!element) return null;
  const text = element instanceof HTMLElement && element.innerText
    ? element.innerText
    : element.textContent;
  return text
    ?.replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || null;
}

function firstText(root: ParentNode, selectors: readonly string[]): string | null {
  return cleanText(firstElement(root, selectors));
}

function matchingText(root: ParentNode, pattern: RegExp): string | null {
  for (const element of root.querySelectorAll('time, span, p')) {
    const text = cleanText(element);
    if (text && text.length <= 200 && pattern.test(text)) return text;
  }
  return null;
}

function relativePostedDate(text: string | null, now: Date): string | null {
  if (!text) return null;
  const match = text.match(/^Posted\s+(?:(today)|(\d+)\s*([mhdw]))(?:\s+ago)?$/i);
  if (!match) return null;

  const date = new Date(now);
  if (!match[1]) {
    const amount = Number(match[2]);
    const unit = match[3]?.toLowerCase();
    if (unit === 'w') date.setUTCDate(date.getUTCDate() - amount * 7);
    else if (unit === 'd') date.setUTCDate(date.getUTCDate() - amount);
  }
  return date.toISOString().slice(0, 10);
}

function externalId(
  root: Element,
  pageUrl: URL,
  applicationHref: string | null,
): string | null {
  return (
    root.getAttribute('data-job-id')?.trim() ||
    root.getAttribute('data-jobid')?.trim() ||
    pageUrl.pathname.match(/\/job\/(\d+)(?:[/?#]|$)/)?.[1] ||
    pageUrl.searchParams.get('jobId')?.trim() ||
    applicationHref?.match(/\/job\/(\d+)(?:[/?#]|$)/)?.[1] ||
    null
  );
}

function hasCollapsedDescription(root: ParentNode): boolean {
  return Array.from(root.querySelectorAll('button')).some((button) =>
    /^(?:show|read|view)\s+more$/i.test(cleanText(button) || ''),
  );
}

export function extractSeekJobDetail(
  document: Document,
  pageUrl: URL,
  now = new Date(),
): ExtractJobDetailResult {
  try {
    const root = firstElement<HTMLElement>(document, SEEK_SELECTORS.detail.roots);
    if (!root) {
      return {
        ok: false,
        reason: 'not-a-job-detail',
        diagnostics: { missingFields: [] },
      };
    }

    const title = firstText(root, SEEK_SELECTORS.detail.titles);
    if (!title) {
      return {
        ok: false,
        reason: 'missing-title',
        diagnostics: { missingFields: ['title'] },
      };
    }

    const description = firstText(root, SEEK_SELECTORS.detail.descriptions);
    if (!description) {
      return {
        ok: false,
        reason: 'missing-description',
        diagnostics: { missingFields: ['description'] },
      };
    }

    const applyLink = firstElement<HTMLAnchorElement>(
      root,
      SEEK_SELECTORS.detail.applyLinks,
    );
    const applicationHref = applyLink?.getAttribute('href') || null;
    const jobId = externalId(root, pageUrl, applicationHref);
    const canonicalInput = pageUrl.pathname.match(/\/job\/\d+(?:[/?#]|$)/)
      ? pageUrl.href
      : jobId
        ? `/job/${jobId}`
        : null;
    const canonicalUrl = canonicalInput
      ? canonicalizeJobUrl(canonicalInput, pageUrl.origin)
      : null;
    if (!canonicalUrl) {
      return {
        ok: false,
        reason: 'missing-job-url',
        diagnostics: { missingFields: ['canonicalUrl'] },
      };
    }

    const company = firstText(root, SEEK_SELECTORS.detail.companies);
    const location = firstText(root, SEEK_SELECTORS.detail.locations);
    const employmentType = firstText(root, SEEK_SELECTORS.detail.employmentTypes);
    const salaryText = firstText(root, SEEK_SELECTORS.detail.salaries);
    const applicationUrl = applicationHref
      ? canonicalizeJobUrl(applicationHref, pageUrl.origin)
      : null;
    const postedAtText = matchingText(root, /^Posted\s+/i);
    const postedAt = relativePostedDate(postedAtText, now);
    const closesAtText = matchingText(root, /^(?:Closes|Closing date)\s+/i);
    const missingFields = [
      !company && 'company',
      !location && 'location',
      !employmentType && 'employmentType',
      !salaryText && 'salaryText',
      !applicationUrl && 'applicationUrl',
      !postedAt && 'postedAt',
      !closesAtText && 'closesAt',
    ].filter((field): field is string => Boolean(field));
    const extractionWarnings = missingFields.map((field) => `missing:${field}`);
    if (hasCollapsedDescription(root)) {
      extractionWarnings.push('description-may-be-collapsed');
    }

    const parsed = JobPostingSchema.safeParse({
      schemaVersion: 1,
      source: 'seek-nz',
      externalId: jobId,
      canonicalUrl,
      applicationUrl,
      title,
      company,
      location,
      employmentType,
      salaryText,
      description,
      postedAt,
      postedAtText,
      closesAt: null,
      closesAtText,
      extractedAt: now.toISOString(),
      extractionWarnings,
    });
    if (!parsed.success) {
      return {
        ok: false,
        reason: 'parse-error',
        diagnostics: {
          missingFields: parsed.error.issues.map((issue) => issue.path.join('.')),
        },
      };
    }

    return { ok: true, job: parsed.data, diagnostics: { missingFields } };
  } catch {
    return {
      ok: false,
      reason: 'parse-error',
      diagnostics: { missingFields: [] },
    };
  }
}
