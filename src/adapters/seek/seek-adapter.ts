import { decorateCard } from '../../browser/card-decorator';
import type {
  ExtractJobDetailResult,
  JobDetailAdapter,
} from '../job-detail-adapter';
import type {
  AdapterHealthResult,
  CardDecorationContext,
  CardDecorationHandle,
  ExtractJobResult,
  SiteAdapter,
} from '../site-adapter';
import { extractSeekJob } from './seek-extractor';
import { extractSeekJobDetail } from './seek-detail-extractor';
import { SEEK_CARD_SELECTOR, SEEK_SELECTORS } from './seek-selectors';

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function cardToken(card: HTMLElement): string {
  return (
    card.getAttribute('data-job-id') ||
    card.querySelector<HTMLAnchorElement>('a[href*="/job/"]')?.getAttribute('href') ||
    card.textContent?.trim().slice(0, 80) ||
    ''
  );
}

function detailToken(document: Document): string {
  const root = document.querySelector<HTMLElement>(SEEK_SELECTORS.detail.roots.join(','));
  if (!root) return '';
  return [
    root.getAttribute('data-job-id'),
    root.querySelector<HTMLAnchorElement>(SEEK_SELECTORS.detail.applyLinks.join(','))
      ?.getAttribute('href'),
    root.querySelector(SEEK_SELECTORS.detail.titles.join(','))?.textContent?.trim(),
  ].join(':');
}

export class SeekAdapter implements SiteAdapter, JobDetailAdapter {
  readonly id = 'seek-nz';
  readonly version = 1;

  canHandle(url: URL): boolean {
    return url.protocol === 'https:' &&
      ['www.seek.co.nz', 'nz.seek.com'].includes(url.hostname);
  }

  findListRoots(document: Document): HTMLElement[] {
    const roots = SEEK_SELECTORS.listRoots.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)),
    );
    if (roots.length) return unique(roots);

    const cards = this.findJobCards(document);
    const parent = cards[0]?.parentElement;
    return parent && cards.every((card) => parent.contains(card)) ? [parent] : [];
  }

  findJobCards(root: ParentNode): HTMLElement[] {
    const cards = SEEK_SELECTORS.cards.flatMap((selector) =>
      Array.from(root.querySelectorAll<HTMLElement>(selector)),
    );
    if (root instanceof Element) {
      const containingCard = root.closest<HTMLElement>(SEEK_CARD_SELECTOR);
      if (containingCard) cards.unshift(containingCard);
    }
    for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href*="/job/"]')) {
      const card = link.closest<HTMLElement>('article');
      if (card) cards.push(card);
    }
    return unique(cards);
  }

  extractJob(card: HTMLElement, pageUrl: URL): ExtractJobResult {
    return extractSeekJob(card, pageUrl, this.version);
  }

  extractCurrentJob(document: Document, pageUrl: URL): ExtractJobDetailResult {
    return extractSeekJobDetail(document, pageUrl);
  }

  decorateCard(
    card: HTMLElement,
    context: CardDecorationContext,
  ): CardDecorationHandle {
    return decorateCard(card, context);
  }

  getPageSignature(document: Document, url: URL): string {
    const cards = this.findJobCards(document);
    return [
      url.pathname,
      url.search,
      cards.length,
      cards[0] ? cardToken(cards[0]) : '',
      cards.at(-1) ? cardToken(cards.at(-1)!) : '',
      detailToken(document),
    ].join(':');
  }

  runHealthCheck(document: Document, url: URL): AdapterHealthResult {
    const cards = this.findJobCards(document);
    const results = cards.map((card) => this.extractJob(card, url));
    const extracted = results.filter((result) => result.ok);
    const successRate = cards.length ? extracted.length / cards.length : 0;
    const missingLocationCount = extracted.filter(
      ({ job }) => !job.locationText,
    ).length;
    const noResults = SEEK_SELECTORS.noResults.some(
      (selector) => document.querySelector(selector) !== null,
    );
    const manyMissingLocations =
      extracted.length > 0 && missingLocationCount / extracted.length >= 0.5;

    return {
      status: noResults
        ? 'healthy'
        : successRate < 0.5
          ? 'broken'
          : successRate < 0.9 || manyMissingLocations
            ? 'degraded'
            : 'healthy',
      detectedCardCount: cards.length,
      extractedJobCount: extracted.length,
      missingIdCount: extracted.filter(({ job }) => !job.externalId).length,
      missingUrlCount: extracted.filter(({ job }) => !job.canonicalUrl).length,
      missingTitleCount: results.filter(
        (result) => !result.ok && result.reason === 'missing-title',
      ).length,
      missingLocationCount,
      selectorVersion: this.version,
      checkedAt: Date.now(),
    };
  }
}
