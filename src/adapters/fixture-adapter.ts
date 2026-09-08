import { decorateCard } from '../browser/card-decorator';
import { normalizeJob } from '../core/jobs/job-normalizer';
import type {
  AdapterHealthResult,
  CardDecorationContext,
  CardDecorationHandle,
  ExtractJobResult,
  SiteAdapter,
} from './site-adapter';

const LIST_SELECTOR = '[data-jobfilter-fixture-list]';
const CARD_SELECTOR = '[data-jobfilter-fixture-job]';

function text(card: HTMLElement, name: string): string | null {
  return card.querySelector<HTMLElement>(`[data-${name}]`)?.textContent?.trim() || null;
}

export class FixtureAdapter implements SiteAdapter {
  readonly id = 'seek-nz';
  readonly version = 1;

  canHandle(url: URL): boolean {
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  }

  findListRoots(document: Document): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(LIST_SELECTOR));
  }

  findJobCards(root: ParentNode): HTMLElement[] {
    const cards = Array.from(root.querySelectorAll<HTMLElement>(CARD_SELECTOR));
    if (root instanceof Element) {
      const containingCard = root.closest<HTMLElement>(CARD_SELECTOR);
      if (containingCard) cards.unshift(containingCard);
    }
    return [...new Set(cards)];
  }

  extractJob(card: HTMLElement, pageUrl: URL): ExtractJobResult {
    if (!card.matches(CARD_SELECTOR)) {
      return { ok: false, reason: 'not-a-job-card', diagnostics: { missingFields: [] } };
    }
    const title = text(card, 'title');
    if (!title) {
      return {
        ok: false,
        reason: 'missing-title',
        diagnostics: { missingFields: ['title'] },
      };
    }
    const link = card.querySelector<HTMLAnchorElement>('a[data-job-url]');
    const company = text(card, 'company');
    const locationText = text(card, 'location');
    const summaryText = text(card, 'summary');
    return {
      ok: true,
      job: normalizeJob({
        source: this.id,
        externalId: card.dataset.jobId || null,
        canonicalUrl: link?.href || null,
        title,
        company,
        locationText,
        summaryText,
        pageUrl: pageUrl.href,
        extractedAt: Date.now(),
        adapterVersion: this.version,
      }),
      diagnostics: {
        missingFields: [
          !company && 'company',
          !locationText && 'location',
          !summaryText && 'summary',
        ].filter((field): field is string => Boolean(field)),
      },
    };
  }

  decorateCard(
    card: HTMLElement,
    context: CardDecorationContext,
  ): CardDecorationHandle {
    return decorateCard(card, context);
  }

  getPageSignature(document: Document, url: URL): string {
    return `${url.href}:${this.findListRoots(document).length}`;
  }

  runHealthCheck(document: Document, url: URL): AdapterHealthResult {
    const cards = this.findListRoots(document).flatMap((root) => this.findJobCards(root));
    const results = cards.map((card) => this.extractJob(card, url));
    const extracted = results.filter((result) => result.ok);
    const successRate = cards.length ? extracted.length / cards.length : 0;
    const noResults = document.querySelector('[data-jobfilter-fixture-empty]') !== null;
    return {
      status:
        noResults || successRate >= 0.9
          ? 'healthy'
          : successRate >= 0.5
            ? 'degraded'
            : 'broken',
      detectedCardCount: cards.length,
      extractedJobCount: extracted.length,
      missingIdCount: extracted.filter(({ job }) => !job.externalId).length,
      missingUrlCount: extracted.filter(({ job }) => !job.canonicalUrl).length,
      missingTitleCount: results.filter(
        (result) => !result.ok && result.reason === 'missing-title',
      ).length,
      missingLocationCount: extracted.filter(({ job }) => !job.locationText).length,
      selectorVersion: this.version,
      checkedAt: Date.now(),
    };
  }
}
