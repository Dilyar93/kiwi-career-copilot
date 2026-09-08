import type {
  CardDecorationContext,
  CardDecorationHandle,
  SiteAdapter,
} from '../adapters/site-adapter';
import { createJobIdentity, type JobIdentity } from '../core/jobs/job-identity';
import type { NormalizedJob } from '../core/jobs/job-types';
import { evaluateJob } from '../core/rules/rule-engine';
import type { EvaluationResult } from '../core/rules/rule-types';
import type {
  ExtensionMessage,
  MessageResponseMap,
} from '../messaging/message-types';
import { sendExtensionMessage } from '../messaging/content-client';
import { PageSummary } from './page-summary';
import { UndoToast } from './undo-toast';
import { VisibilityTracker } from './visibility-tracker';

export type SendMessage = <T extends ExtensionMessage>(
  message: T,
) => Promise<MessageResponseMap[T['type']]>;

interface CardState {
  card: HTMLElement;
  job: NormalizedJob;
  identity: JobIdentity;
  evaluation: EvaluationResult;
  seen: boolean;
  dismissed: boolean;
  signature: string;
  decoration: CardDecorationHandle;
}

export interface PageProcessingSummary {
  scanned: number;
  shown: number;
  hidden: number;
  hiddenReasons: Array<{
    type: EvaluationResult['reasons'][number]['ruleType'];
    count: number;
  }>;
  parsedLocationCount: number;
  showHidden: boolean;
}

export class CardProcessor {
  private readonly states = new Map<HTMLElement, CardState>();
  private readonly sessionDismissed = new Set<string>();
  private readonly sessionSeen = new Set<string>();
  private readonly visibility = new VisibilityTracker();
  private readonly toast: UndoToast;
  private summary: PageSummary | undefined;
  private showHidden = false;

  constructor(
    private readonly adapter: SiteAdapter,
    private readonly send: SendMessage = sendExtensionMessage,
    private readonly document: Document = window.document,
    private readonly onSummary?: (summary: PageProcessingSummary) => void,
  ) {
    this.toast = new UndoToast(document);
  }

  setSummaryAnchor(anchor: HTMLElement): void {
    this.summary?.destroy();
    this.summary = new PageSummary(this.document, anchor, () => {
      void this.send({ type: 'OPEN_SIDE_PANEL' }).catch(() => undefined);
    }, (show) => {
      this.showHidden = show;
      this.renderSummary();
    }, this.showHidden);
    this.renderSummary();
  }

  clearSummary(): void {
    this.summary?.destroy();
    this.summary = undefined;
  }

  setShowHidden(show: boolean): void {
    this.showHidden = show;
    this.document.documentElement.classList.toggle('jobfilter-show-hidden', show);
    this.summary?.setShowHidden(show);
    this.renderSummary();
  }

  forgetSessionDismissals(keys?: readonly string[]): void {
    if (keys) keys.forEach((key) => this.sessionDismissed.delete(key));
    else this.sessionDismissed.clear();
  }

  pruneDisconnected(): void {
    for (const [card, state] of this.states) {
      if (card.isConnected) continue;
      this.visibility.unobserve(card);
      state.decoration.destroy();
      this.states.delete(card);
    }
    this.renderSummary();
  }

  async processCards(cards: HTMLElement[], force = false): Promise<void> {
    const uniqueCards = [...new Set(cards)];
    try {
      const extracted = await Promise.all(
        uniqueCards.map(async (card) => {
          const result = this.adapter.extractJob(card, new URL(this.document.URL));
          if (!result.ok) return null;
          const identity = await createJobIdentity(result.job);
          return identity ? { card, job: result.job, identity } : null;
        }),
      );
      const jobs = extracted.filter(
        (value): value is NonNullable<typeof value> => value !== null,
      );
      if (!jobs.length) {
        this.renderSummary();
        return;
      }

      const context = await this.send({
        type: 'GET_PAGE_CONTEXT',
        payload: {
          siteId: this.adapter.id,
          jobs: jobs.map(({ identity, job }) => ({
            key: identity.primaryKey,
            locationText: job.locationText,
          })),
        },
      });
      const activeProfile = context.filterSettings.profiles.find(
        ({ id }) => id === context.filterSettings.activeProfileId,
      );
      const activeRuleIds = new Set(activeProfile?.ruleIds ?? []);
      const rules = activeProfile?.enabled
        ? context.filterSettings.rules.filter(({ id }) => activeRuleIds.has(id))
        : [];

      for (const { card, job, identity } of jobs) {
        const signature = `${identity.fallbackFingerprint}:${this.adapter.version}:${context.filterSettings.configurationRevision}`;
        const current = this.states.get(card);
        if (!force && current?.signature === signature) continue;

        const record = context.jobStates[identity.primaryKey];
        const dismissed =
          record?.status === 'dismissed' ||
          this.sessionDismissed.has(identity.primaryKey);
        const seen =
          record !== undefined || this.sessionSeen.has(identity.primaryKey);
        const distance = context.distances?.[identity.primaryKey];
        const evaluation: EvaluationResult = {
          ...evaluateJob(job, {
          rules,
          jobState: dismissed
            ? { status: 'dismissed' }
            : seen
              ? { status: 'seen' }
              : null,
          distance,
          }),
          distanceUnavailable: Boolean(context.distanceEnabled && !distance),
        };

        let state: CardState;
        const decorationContext = (): CardDecorationContext => ({
          identity,
          evaluation: state.evaluation,
          seen: state.seen,
          dismissed: state.dismissed,
          onDismiss: () => this.dismiss(state),
          onRestore: () => void this.restore(state),
        });

        if (current) {
          state = {
            ...current,
            job,
            identity,
            evaluation,
            seen,
            dismissed,
            signature,
          };
          this.states.set(card, state);
          state.decoration.update(decorationContext());
        } else {
          state = {
            card,
            job,
            identity,
            evaluation,
            seen,
            dismissed,
            signature,
            decoration: undefined as unknown as CardDecorationHandle,
          };
          state.decoration = this.adapter.decorateCard(card, decorationContext());
          this.states.set(card, state);
        }
        this.apply(state);
      }
      this.renderSummary();
    } catch {
      this.failOpen(uniqueCards);
    }
  }

  failOpen(cards: HTMLElement[]): void {
    for (const card of cards) {
      card.classList.remove('jobfilter-hidden');
      const state = this.states.get(card);
      if (state) {
        state.evaluation = { visible: true, reasons: [] };
        state.decoration.update(this.decorationContext(state));
      }
    }
    this.renderSummary();
  }

  dispose(): void {
    this.visibility.disconnect();
    this.toast.clear();
    this.clearSummary();
    for (const state of this.states.values()) state.decoration.destroy();
    this.states.clear();
    this.document.documentElement.classList.remove('jobfilter-show-hidden');
  }

  private decorationContext(state: CardState): CardDecorationContext {
    return {
      identity: state.identity,
      evaluation: state.evaluation,
      seen: state.seen,
      dismissed: state.dismissed,
      onDismiss: () => this.dismiss(state),
      onRestore: () => void this.restore(state),
    };
  }

  private apply(state: CardState): void {
    state.card.classList.toggle('jobfilter-hidden', !state.evaluation.visible);
    state.card.dataset.jobfilterProcessed = '1';
    state.card.dataset.jobfilterAdapterVersion = String(this.adapter.version);
    state.card.dataset.jobfilterJobKey = state.identity.primaryKey;
    state.card.dataset.jobfilterSignature = state.signature;
    state.decoration.update(this.decorationContext(state));

    if (state.evaluation.visible && !state.seen) {
      this.visibility.observe(state.card, () => this.markSeen(state));
    } else {
      this.visibility.unobserve(state.card);
    }
  }

  private dismiss(state: CardState): void {
    this.sessionDismissed.add(state.identity.primaryKey);
    state.dismissed = true;
    state.evaluation = {
      ...state.evaluation,
      visible: false,
      reasons: [
        { ruleId: 'dismissed', ruleType: 'dismissed', label: 'dismissed' },
        ...state.evaluation.reasons.filter(({ ruleType }) => ruleType !== 'dismissed'),
      ],
    };
    this.apply(state);
    this.renderSummary();
    this.toast.show(state.job.title, () => void this.restore(state));
    void this.send({
      type: 'DISMISS_JOB',
      payload: { job: state.job, reason: null },
    }).catch(() => undefined);
  }

  private async restore(state: CardState): Promise<void> {
    this.sessionDismissed.delete(state.identity.primaryKey);
    await this.send({
      type: 'RESTORE_JOB',
      payload: { jobKey: state.identity.primaryKey },
    }).catch(() => undefined);
    await this.processCards([state.card], true);
  }

  private markSeen(state: CardState): void {
    this.sessionSeen.add(state.identity.primaryKey);
    state.seen = true;
    state.decoration.update(this.decorationContext(state));
    void this.send({ type: 'MARK_SEEN', payload: { job: state.job } }).catch(
      () => undefined,
    );
  }

  private renderSummary(): void {
    const states = [...this.states.values()].filter(({ card }) => card.isConnected);
    const hidden = states.filter(({ evaluation }) => !evaluation.visible).length;
    this.summary?.update({
      scanned: states.length,
      shown: states.length - hidden,
      hidden,
    });
    const reasons = new Map<
      EvaluationResult['reasons'][number]['ruleType'],
      number
    >();
    for (const { evaluation } of states) {
      if (evaluation.visible) continue;
      for (const { ruleType } of evaluation.reasons) {
        reasons.set(ruleType, (reasons.get(ruleType) ?? 0) + 1);
      }
    }
    this.onSummary?.({
      scanned: states.length,
      shown: states.length - hidden,
      hidden,
      hiddenReasons: [...reasons].map(([type, count]) => ({ type, count })),
      parsedLocationCount: states.filter(({ evaluation }) => evaluation.distance).length,
      showHidden: this.showHidden,
    });
  }
}
