import { normalizeJob } from '../../core/jobs/job-normalizer';
import type { ExtractJobResult } from '../site-adapter';
import { SEEK_CARD_SELECTOR, SEEK_SELECTORS } from './seek-selectors';

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

function firstText(root: ParentNode, selectors: readonly string[]): string | null {
  return firstElement<HTMLElement>(root, selectors)?.textContent?.trim() || null;
}

function combinedText(
  root: ParentNode,
  selectors: readonly string[],
): string | null {
  const values = selectors.flatMap((selector) =>
    Array.from(root.querySelectorAll<HTMLElement>(selector), (element) =>
      element.textContent?.trim(),
    ),
  );
  const unique = [...new Set(values.filter((value): value is string => Boolean(value)))];
  return unique.join(' · ') || null;
}

function externalId(card: HTMLElement, href: string | null): string | null {
  const attributeId =
    card.getAttribute('data-job-id') ||
    card.getAttribute('data-jobid') ||
    card.getAttribute('data-listing-id');
  return attributeId?.trim() || href?.match(/\/job\/(\d+)(?:[/?#]|$)/)?.[1] || null;
}

export function extractSeekJob(
  card: HTMLElement,
  pageUrl: URL,
  adapterVersion: number,
): ExtractJobResult {
  try {
    const titleLink = firstElement<HTMLAnchorElement>(card, SEEK_SELECTORS.titles);
    if (!card.matches(SEEK_CARD_SELECTOR) && !titleLink) {
      return {
        ok: false,
        reason: 'not-a-job-card',
        diagnostics: { missingFields: [] },
      };
    }

    const title = titleLink?.textContent?.trim() || firstText(card, SEEK_SELECTORS.titles);
    if (!title) {
      return {
        ok: false,
        reason: 'missing-title',
        diagnostics: { missingFields: ['title'] },
      };
    }

    const href = titleLink?.getAttribute('href') || null;
    const company = firstText(card, SEEK_SELECTORS.companies);
    const locationText = firstText(card, SEEK_SELECTORS.locations);
    const summaryText = combinedText(card, SEEK_SELECTORS.summaries);

    return {
      ok: true,
      job: normalizeJob({
        source: 'seek-nz',
        externalId: externalId(card, href),
        canonicalUrl: href,
        title,
        company,
        locationText,
        summaryText,
        pageUrl: pageUrl.href,
        extractedAt: Date.now(),
        adapterVersion,
      }),
      diagnostics: {
        missingFields: [
          !href && 'url',
          !company && 'company',
          !locationText && 'location',
          !summaryText && 'summary',
        ].filter((field): field is string => Boolean(field)),
      },
    };
  } catch {
    return {
      ok: false,
      reason: 'parse-error',
      diagnostics: { missingFields: [] },
    };
  }
}
