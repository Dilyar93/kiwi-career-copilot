import { browser } from 'wxt/browser';
import type {
  AdapterHealthResult,
  SiteAdapter,
} from '../adapters/site-adapter';
import { setRuntimeLocale } from '../i18n';
import { sendExtensionMessage } from '../messaging/content-client';
import type { SendMessage } from './card-processor';
import {
  CardProcessor,
  type PageProcessingSummary,
} from './card-processor';
import { MutationController } from './mutation-controller';
import { UrlWatcher } from './url-watcher';

export class PageController {
  private readonly processor: CardProcessor;
  private readonly urlWatcher: UrlWatcher;
  private mutations: MutationController[] = [];
  private started = false;
  private health: AdapterHealthResult | undefined;
  private summary: PageProcessingSummary | undefined;

  constructor(
    private readonly adapter: SiteAdapter,
    private readonly send: SendMessage = sendExtensionMessage,
    private readonly document: Document = window.document,
  ) {
    this.processor = new CardProcessor(adapter, send, document, (summary) => {
      this.summary = summary;
      void this.reportStatus();
    });
    this.urlWatcher = new UrlWatcher(
      () =>
        `${this.document.location.href}:${this.adapter.getPageSignature(
          this.document,
          new URL(this.document.URL),
        )}`,
      () => this.rebuild(),
    );
  }

  private readonly onRuntimeMessage = (message: unknown) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) {
      return;
    }
    if (
      message.type === 'SET_SHOW_HIDDEN' &&
      'payload' in message &&
      typeof message.payload === 'object' &&
      message.payload !== null &&
      'show' in message.payload &&
      typeof message.payload.show === 'boolean'
    ) {
      this.processor.setShowHidden(message.payload.show);
      return;
    }
    if (message.type === 'REFRESH_PAGE_STATUS') {
      return this.processAll(true);
    }
    if (message.type === 'JOB_STATES_CHANGED') {
      const payload = 'payload' in message && typeof message.payload === 'object'
        && message.payload !== null ? message.payload : null;
      if (payload && 'restoredKeys' in payload && Array.isArray(payload.restoredKeys)) {
        this.processor.forgetSessionDismissals(
          payload.restoredKeys.filter((key): key is string => typeof key === 'string'),
        );
      } else if (payload && 'reset' in payload && payload.reset === true) {
        this.processor.forgetSessionDismissals();
      }
      return this.processAll(true);
    } else if (message.type === 'SETTINGS_CHANGED') {
      return this.processAll(true);
    } else if (message.type === 'PREFERENCES_CHANGED') {
      return this.refreshPreferences();
    }
  };

  async start(): Promise<void> {
    if (this.started || !this.adapter.canHandle(new URL(this.document.URL))) return;
    this.started = true;
    browser.runtime.onMessage.addListener(this.onRuntimeMessage);
    await this.loadPreferences();
    this.urlWatcher.start();
    await this.rebuild();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.urlWatcher.stop();
    browser.runtime.onMessage.removeListener(this.onRuntimeMessage);
    this.stopMutations();
    this.processor.dispose();
    void this.send({ type: 'CLEAR_PAGE_STATUS' }).catch(() => undefined);
  }

  private async rebuild(): Promise<void> {
    this.stopMutations();
    this.processor.pruneDisconnected();
    const roots = this.adapter.findListRoots(this.document);
    if (roots[0]) this.processor.setSummaryAnchor(roots[0]);
    else this.processor.clearSummary();
    await this.processAll(true);
    this.mutations = roots.map((root) => {
      const controller = new MutationController(root, (nodes) => {
        const cards = nodes.flatMap((node) => {
          const root =
            node instanceof Element || node instanceof DocumentFragment
              ? node
              : node.parentElement;
          return root ? this.adapter.findJobCards(root) : [];
        });
        return this.processor.processCards(cards);
      });
      controller.start();
      return controller;
    });
  }

  private async processAll(force: boolean): Promise<void> {
    const url = new URL(this.document.URL);
    const roots = this.adapter.findListRoots(this.document);
    const cards = roots.flatMap((root) => this.adapter.findJobCards(root));
    this.health = this.adapter.runHealthCheck(this.document, url);
    if (this.health.status === 'broken') {
      this.processor.failOpen(cards);
      await this.reportStatus();
      return;
    }
    await this.processor.processCards(cards, force);
    await this.reportStatus();
  }

  private async loadPreferences(): Promise<void> {
    try {
      const preferences = await this.send({ type: 'GET_PREFERENCES' });
      setRuntimeLocale(preferences.locale);
      this.document.documentElement.classList.toggle(
        'jobfilter-hide-seen',
        !preferences.ui.showSeen,
      );
      this.document.documentElement.classList.toggle(
        'jobfilter-hide-distance',
        !preferences.ui.showDistance,
      );
    } catch {
      // English defaults and visible seen markers are fail-open UI defaults.
    }
  }

  private async refreshPreferences(): Promise<void> {
    await this.loadPreferences();
    await this.processAll(true);
  }

  private async reportStatus(): Promise<void> {
    if (!this.health || !this.summary) return;
    await this.send({
      type: 'REPORT_PAGE_STATUS',
      payload: {
        siteId: this.adapter.id,
        ...this.summary,
        health: this.health,
        updatedAt: Date.now(),
      },
    }).catch(() => undefined);
  }

  private stopMutations(): void {
    for (const mutation of this.mutations) mutation.stop();
    this.mutations = [];
  }
}
