import type { JobIdentity } from '../core/jobs/job-identity';
import type { NormalizedJob, SiteId } from '../core/jobs/job-types';
import type { EvaluationResult } from '../core/rules/rule-types';

export interface ExtractionDiagnostics {
  missingFields: string[];
}

export type ExtractJobResult =
  | {
      ok: true;
      job: NormalizedJob;
      diagnostics: ExtractionDiagnostics;
    }
  | {
      ok: false;
      reason:
        | 'not-a-job-card'
        | 'missing-title'
        | 'unsupported-layout'
        | 'parse-error';
      diagnostics: ExtractionDiagnostics;
    };

export interface CardDecorationContext {
  identity: JobIdentity;
  evaluation: EvaluationResult;
  seen: boolean;
  dismissed: boolean;
  onDismiss(): void;
  onRestore(): void;
}

export interface CardDecorationHandle {
  update(context: CardDecorationContext): void;
  destroy(): void;
}

export interface AdapterHealthResult {
  status: 'healthy' | 'degraded' | 'broken';
  detectedCardCount: number;
  extractedJobCount: number;
  missingIdCount: number;
  missingUrlCount: number;
  missingTitleCount: number;
  missingLocationCount: number;
  selectorVersion: number;
  checkedAt: number;
}

export interface SiteAdapter {
  readonly id: SiteId;
  readonly version: number;
  canHandle(url: URL): boolean;
  findListRoots(document: Document): HTMLElement[];
  findJobCards(root: ParentNode): HTMLElement[];
  extractJob(card: HTMLElement, pageUrl: URL): ExtractJobResult;
  decorateCard(
    card: HTMLElement,
    context: CardDecorationContext,
  ): CardDecorationHandle;
  getPageSignature(document: Document, url: URL): string;
  runHealthCheck(document: Document, url: URL): AdapterHealthResult;
}
