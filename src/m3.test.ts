// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixtureAdapter } from './adapters/fixture-adapter';
import { CardProcessor, type SendMessage } from './browser/card-processor';
import { MutationController } from './browser/mutation-controller';
import { PageController } from './browser/page-controller';
import { UrlWatcher } from './browser/url-watcher';
import type { LocalFilterSettings } from './core/rules/rule-types';
import type { ExtensionMessage } from './messaging/message-types';

let intersectionCallback: IntersectionObserverCallback;

class FakeIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }
}

const settings: LocalFilterSettings = {
  schemaVersion: 2,
  configurationRevision: 1,
  rules: [
    {
      id: 'cleaners',
      type: 'exclude-keyword',
      pattern: 'clean*',
      matchMode: 'prefix-wildcard',
      fields: ['title'],
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  profiles: [
    {
      id: 'default',
      name: 'Default',
      ruleIds: ['cleaners'],
      activeOriginId: null,
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  activeProfileId: 'default',
};

function fixtureCard(id: string, title: string): string {
  return `<article data-jobfilter-fixture-job data-job-id="${id}">
    <a data-job-url href="/job/${id}"><span data-title>${title}</span></a>
    <span data-company>Example Company</span>
    <span data-location>Hamilton</span>
  </article>`;
}

function setFixture(): void {
  document.body.innerHTML = `<main data-jobfilter-fixture-list>
    ${fixtureCard('cleaner', 'Commercial Cleaner')}
    ${fixtureCard('retail', 'Retail Assistant')}
  </main>`;
}

function messenger(messages: ExtensionMessage[] = []): SendMessage {
  return (async (message: ExtensionMessage) => {
    messages.push(message);
    switch (message.type) {
      case 'GET_PAGE_CONTEXT':
        return { filterSettings: settings, jobStates: {} };
      case 'DISMISS_JOB':
        return { key: `seek-nz:${message.payload.job.externalId}`, persisted: true };
      case 'RESTORE_JOB':
        return { restored: true };
      case 'MARK_SEEN':
        return { key: `seek-nz:${message.payload.job.externalId}`, persisted: true };
      case 'OPEN_SIDE_PANEL':
        return { opened: true };
      default:
        throw new Error(`Unexpected message: ${message.type}`);
    }
  }) as SendMessage;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  window.history.replaceState({}, '', '/jobs');
  setFixture();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('jobfilter-show-hidden');
});

describe('card processing', () => {
  it('keeps only one page summary when content initialization repeats', () => {
    const root = document.querySelector<HTMLElement>('[data-jobfilter-fixture-list]')!;
    const first = new CardProcessor(new FixtureAdapter(), messenger());
    const second = new CardProcessor(new FixtureAdapter(), messenger());

    first.setSummaryAnchor(root);
    second.setSummaryAnchor(root);

    expect(document.querySelectorAll('[data-jobfilter-summary]')).toHaveLength(1);
    first.dispose();
    second.dispose();
  });

  it('filters, decorates once, summarizes, dismisses, and undoes', async () => {
    const adapter = new FixtureAdapter();
    const processor = new CardProcessor(adapter, messenger());
    const root = document.querySelector<HTMLElement>('[data-jobfilter-fixture-list]')!;
    const cards = adapter.findJobCards(root);
    processor.setSummaryAnchor(root);
    await processor.processCards(cards);
    await processor.processCards(cards);

    expect(cards[0]?.classList.contains('jobfilter-hidden')).toBe(true);
    expect(cards[1]?.classList.contains('jobfilter-hidden')).toBe(false);
    expect(cards[1]?.querySelectorAll('.jobfilter-card-controls')).toHaveLength(1);
    expect(document.querySelector('.jobfilter-summary')?.textContent).toContain(
      'Scanned 2 · Shown 1 · Hidden 1',
    );
    document
      .querySelector<HTMLButtonElement>('.jobfilter-summary button')
      ?.click();
    expect(document.documentElement.classList).toContain('jobfilter-show-hidden');

    const hostCardClick = vi.fn();
    cards[1]?.addEventListener('click', hostCardClick);
    cards[1]?.querySelector<HTMLButtonElement>('.jobfilter-dismiss')?.click();
    expect(hostCardClick).not.toHaveBeenCalled();
    expect(cards[1]?.classList.contains('jobfilter-hidden')).toBe(true);
    expect(document.querySelector('.jobfilter-toast')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('.jobfilter-toast button')?.click();
    await vi.waitFor(() =>
      expect(cards[1]?.classList.contains('jobfilter-hidden')).toBe(false),
    );
    processor.dispose();
  });

  it('releases an optimistic dismissal restored from another extension page', async () => {
    const adapter = new FixtureAdapter();
    const processor = new CardProcessor(adapter, messenger());
    const retail = adapter.findJobCards(document)[1]!;
    await processor.processCards([retail]);
    retail.querySelector<HTMLButtonElement>('.jobfilter-dismiss')?.click();
    expect(retail.classList).toContain('jobfilter-hidden');

    processor.forgetSessionDismissals(['seek-nz:retail']);
    await processor.processCards([retail], true);
    expect(retail.classList).not.toContain('jobfilter-hidden');
    processor.dispose();
  });

  it('marks a card seen only after 50% visibility for 800ms', async () => {
    const messages: ExtensionMessage[] = [];
    const adapter = new FixtureAdapter();
    const processor = new CardProcessor(adapter, messenger(messages));
    const retail = adapter.findJobCards(document)[1]!;
    await processor.processCards([retail]);

    intersectionCallback(
      [
        {
          target: retail,
          isIntersecting: true,
          intersectionRatio: 0.5,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    await vi.advanceTimersByTimeAsync(799);
    expect(retail.querySelector('.jobfilter-seen')?.textContent).toBe('');
    await vi.advanceTimersByTimeAsync(1);
    expect(retail.querySelector('.jobfilter-seen')?.textContent).toBe('Seen');
    expect(messages.filter(({ type }) => type === 'MARK_SEEN')).toHaveLength(1);
    processor.dispose();
  });

  it('fails open when page context cannot be loaded', async () => {
    const adapter = new FixtureAdapter();
    const card = adapter.findJobCards(document)[0]!;
    card.classList.add('jobfilter-hidden');
    const processor = new CardProcessor(
      adapter,
      (() => Promise.reject(new Error('offline'))) as SendMessage,
    );
    await processor.processCards([card]);
    expect(card.classList.contains('jobfilter-hidden')).toBe(false);
    processor.dispose();
  });
});

describe('page lifecycle', () => {
  it('batches and deduplicates mutation nodes', async () => {
    const root = document.querySelector<HTMLElement>('[data-jobfilter-fixture-list]')!;
    const batches: Node[][] = [];
    const controller = new MutationController(root, (nodes) => {
      batches.push(nodes);
    });
    controller.start();
    const wrapper = document.createElement('div');
    root.append(wrapper);
    wrapper.append(document.createElement('span'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(batches).toHaveLength(1);
    expect(new Set(batches[0]).size).toBe(batches[0]?.length);
    controller.stop();
  });

  it('detects SPA URL changes without changing history itself', async () => {
    const changed = vi.fn();
    const watcher = new UrlWatcher(() => location.href, changed, 50);
    watcher.start();
    window.history.pushState({}, '', '/jobs?page=2');
    await vi.advanceTimersByTimeAsync(50);
    expect(changed).toHaveBeenCalledOnce();
    watcher.stop();
  });

  it('automatically filters a newly added fixture card', async () => {
    const controller = new PageController(
      new FixtureAdapter(),
      messenger(),
      document,
    );
    await controller.start();
    const root = document.querySelector<HTMLElement>('[data-jobfilter-fixture-list]')!;
    root.insertAdjacentHTML('beforeend', fixtureCard('new', 'Office Cleaner'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    const added = root.querySelector<HTMLElement>('[data-job-id="new"]')!;
    await vi.waitFor(() =>
      expect(added.classList.contains('jobfilter-hidden')).toBe(true),
    );
    added.querySelector<HTMLElement>('[data-title]')!.textContent =
      'Office Assistant';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() =>
      expect(added.classList.contains('jobfilter-hidden')).toBe(false),
    );
    controller.stop();
  });
});
