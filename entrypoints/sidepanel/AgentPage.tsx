import { useEffect, useState } from 'react';
import { z } from 'zod';
import { browser } from 'wxt/browser';
import {
  AgentAnalysisSchema,
  AgentApiError,
  analyseJob,
  continueAnalysis,
  generateMaterials,
  getAgentToken,
  getMaterials,
  updateApplicationStatus,
  type AgentAnalysis,
  type AgentJobMode,
  type AgentMaterials,
  type AgentProgress,
  type ApplicationStatus,
} from '../../src/agent/agent-client';
import { createJobPostingIdentity } from '../../src/core/jobs/job-identity';
import { JobPostingSchema, type JobPosting } from '../../src/core/jobs/job-posting';
import { t, type TranslationKey } from '../../src/i18n';

const CurrentJobSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    job: JobPostingSchema,
    diagnostics: z.strictObject({ missingFields: z.array(z.string()) }),
  }),
  z.strictObject({
    ok: z.literal(false),
    reason: z.enum([
      'not-a-job-detail',
      'missing-title',
      'missing-description',
      'missing-job-url',
      'parse-error',
    ]),
    diagnostics: z.strictObject({ missingFields: z.array(z.string()) }),
  }),
]);

const modeLabels: Record<AgentJobMode, TranslationKey> = {
  internship: 'agentModeInternship',
  graduate: 'agentModeGraduate',
  'part-time': 'agentModePartTime',
  'full-time': 'agentModeFullTime',
  summer: 'agentModeSummer',
};

const toolLabels: Record<AgentAnalysis['tool_events'][number]['tool_name'], TranslationKey> = {
  get_candidate_claims: 'agentToolClaims',
  check_application_history: 'agentToolHistory',
  search_candidate_documents: 'agentToolDocuments',
  open_candidate_source: 'agentToolOpenSource',
};

const recommendationLabels: Record<
  AgentAnalysis['recommendation']['recommendation'],
  TranslationKey
> = {
  APPLY: 'agentRecommendApply',
  MAYBE: 'agentRecommendMaybe',
  SKIP: 'agentRecommendSkip',
};

const levelLabels: Record<'HIGH' | 'MEDIUM' | 'LOW', TranslationKey> = {
  HIGH: 'agentLevelHigh',
  MEDIUM: 'agentLevelMedium',
  LOW: 'agentLevelLow',
};

const analysisErrorLabels: Record<AgentApiError['code'], TranslationKey> = {
  'invalid-token': 'agentNotConfigured',
  unauthorized: 'agentUnauthorized',
  'library-empty': 'agentLibraryEmpty',
  'step-limit': 'agentStepLimit',
  timeout: 'agentTimeout',
  'output-invalid': 'agentOutputInvalid',
  'model-error': 'agentModelError',
  'invalid-job': 'agentInvalidJob',
  'clarification-invalid': 'agentClarificationInvalid',
  'import-unsupported': 'agentAnalysisFailed',
  'import-document-limit': 'agentAnalysisFailed',
  'import-no-text': 'agentAnalysisFailed',
  'import-unreadable': 'agentAnalysisFailed',
  'import-timeout': 'agentAnalysisFailed',
  'import-limit': 'agentAnalysisFailed',
  'import-model-error': 'agentAnalysisFailed',
  rejected: 'agentAnalysisFailed',
  unavailable: 'agentServiceUnavailable',
};

function storageKey(job: JobPosting): string {
  return `agentLatestAnalysis:${job.source}:${job.externalId ?? job.canonicalUrl}`;
}

function traceSummary(event: AgentAnalysis['tool_events'][number]): string {
  const result = event.result;
  if (typeof result.reason === 'string') return result.reason;
  if (Array.isArray(result.reasons)) return result.reasons.filter(
    (item): item is string => typeof item === 'string',
  ).join(' ');
  if (Array.isArray(result.claims)) return t('agentClaimsFound', { count: result.claims.length });
  if (Array.isArray(result.sourceFiles)) return result.sourceFiles.join(', ') || t('agentNoDocuments');
  if (event.tool_name === 'open_candidate_source' && typeof result.fileName === 'string') {
    return result.fileName;
  }
  if (typeof result.status === 'string') return result.status;
  if (event.tool_name === 'check_application_history' && typeof result.found === 'boolean') {
    return result.found ? t('agentHistoryFound') : t('agentHistoryNotFound');
  }
  return t('agentToolCompleted');
}

type DocumentSource = { fileName: string; excerpt: string };

function documentSources(events: AgentAnalysis['tool_events']): Map<string, DocumentSource> {
  const result = new Map<string, DocumentSource>();
  for (const event of events) {
    const items = [
      ...(Array.isArray(event.result.sources) ? event.result.sources : []),
      ...(Array.isArray(event.result.claims) ? event.result.claims : []),
    ];
    for (const value of items) {
      if (!value || typeof value !== 'object') continue;
      const item = value as Record<string, unknown>;
      if (
        typeof item.sourceRef === 'string' &&
        typeof item.fileName === 'string' &&
        (typeof item.excerpt === 'string' || typeof item.statement === 'string')
      ) {
        result.set(item.sourceRef, {
          fileName: item.fileName,
          excerpt: String(item.excerpt ?? item.statement),
        });
      }
    }
  }
  return result;
}

function Findings({
  title,
  items,
  sources,
}: {
  title: TranslationKey;
  items: AgentAnalysis['recommendation']['hard_blockers'];
  sources: Map<string, DocumentSource>;
}) {
  if (!items.length) return null;
  return (
    <section className="agent-findings">
      <h3>{t(title)}</h3>
      <ul className="job-list">
        {items.map((item, index) => (
          <li key={`${item.category}-${index}`}>
            <strong>{item.summary}</strong>
            <small className="finding-sources">
              <span>{t('agentSources')}:</span>
              {item.source_refs.map((sourceRef) => {
                const source = sources.get(sourceRef);
                return source ? (
                  <span className="document-source" key={sourceRef}>
                    <b>{source.fileName}</b>
                    <q>{source.excerpt}</q>
                  </span>
                ) : <span key={sourceRef}>{sourceRef}</span>;
              })}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AnalysisResult({ result }: { result: AgentAnalysis }) {
  const recommendation = result.recommendation;
  const sources = documentSources(result.tool_events);
  return (
    <div className="agent-result">
      <section className={`decision-card ${recommendation.recommendation.toLowerCase()}`}>
        <span className="eyebrow">{t('agentDecision')}</span>
        <strong>{t(recommendationLabels[recommendation.recommendation])}</strong>
        <dl>
          <div><dt>{t('agentFit')}</dt><dd>{t(levelLabels[recommendation.fit])}</dd></div>
          <div><dt>{t('agentReadiness')}</dt><dd>{t(levelLabels[recommendation.readiness])}</dd></div>
        </dl>
      </section>

      <Findings title="agentHardBlockers" items={recommendation.hard_blockers} sources={sources} />
      {!!recommendation.next_actions.length && (
        <section className="section-card next-actions-card">
          <h3>{t('agentNextActions')}</h3>
          <ol>
            {recommendation.next_actions.map((action) => <li key={action}>{action}</li>)}
          </ol>
        </section>
      )}
      <details className="result-details">
        <summary>
          <span>{t('agentEvidenceAndGaps')}</span>
          <span className="summary-count">{
            recommendation.strong_matches.length +
            recommendation.partial_matches.length +
            recommendation.gaps.length +
            recommendation.unknowns.length
          }</span>
        </summary>
        <div className="details-content">
          <Findings title="agentStrongMatches" items={recommendation.strong_matches} sources={sources} />
          <Findings title="agentPartialMatches" items={recommendation.partial_matches} sources={sources} />
          <Findings title="agentGaps" items={recommendation.gaps} sources={sources} />
          <Findings title="agentUnknowns" items={recommendation.unknowns} sources={sources} />
        </div>
      </details>
      <details className="result-details technical-details">
        <summary>{t('agentAnalysisDetails')}</summary>
        <div className="details-content">
          {result.tool_events.length ? (
            <ol className="trace-list">
              {result.tool_events.map((event) => (
                <li key={event.sequence}>
                  <strong>{t(toolLabels[event.tool_name])}</strong>
                  <span>{traceSummary(event)}</span>
                </li>
              ))}
            </ol>
          ) : <p className="muted">{t('agentNoTools')}</p>}
          <p className="technical-meta">{result.model} · {result.prompt_version}</p>
        </div>
      </details>
    </div>
  );
}

function AnalysisProgress({
  tools,
}: {
  tools: AgentAnalysis['tool_events'][number]['tool_name'][];
}) {
  return (
    <section className="analysis-progress" role="status" aria-live="polite">
      <span className="sync-spinner" aria-hidden="true" />
      <div>
        <strong>{t('agentAnalysing')}</strong>
        <p>{tools.length ? t('agentChoosingNextCheck') : t('agentAnalysingStatus')}</p>
        {!!tools.length && (
          <ul>
            {tools.map((tool) => <li key={tool}>✓ {t(toolLabels[tool])}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}

function ClarificationForm({
  questions,
  busy,
  onSubmit,
}: {
  questions: string[];
  busy: boolean;
  onSubmit(answers: Array<{ question: string; answer: string }>): void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  return (
    <form
      className="section-card clarification-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(questions.map((question) => ({ question, answer: answers[question] ?? '' })));
      }}
    >
      <div className="section-copy">
        <h3>{t('agentQuestions')}</h3>
        <p>{t('agentClarificationIntro')}</p>
      </div>
      {questions.map((question, index) => (
        <label key={question}>
          <span>{index + 1}. {question}</span>
          <textarea
            required
            maxLength={2_000}
            rows={3}
            value={answers[question] ?? ''}
            onChange={(event) => setAnswers({ ...answers, [question]: event.target.value })}
            placeholder={t('agentClarificationPlaceholder')}
          />
        </label>
      ))}
      <small className="muted">{t('agentClarificationPrivacy')}</small>
      <button type="submit" disabled={busy}>{
        busy ? t('agentAnalysing') : t('agentContinueAnalysis')
      }</button>
    </form>
  );
}

export default function AgentPage({
  activeTabId,
  contextVersion,
  onOpenSettings,
}: {
  activeTabId: number | null;
  contextVersion: number;
  onOpenSettings(): void;
}) {
  const [job, setJob] = useState<JobPosting | null>(null);
  const [jobState, setJobState] = useState<'syncing' | 'empty' | 'ready' | 'error'>('syncing');
  const [agentConfigured, setAgentConfigured] = useState<boolean | null>(null);
  const [jobMode, setJobMode] = useState<AgentJobMode>('graduate');
  const [result, setResult] = useState<AgentAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressTools, setProgressTools] = useState<
    AgentAnalysis['tool_events'][number]['tool_name'][] | null
  >(null);
  const [continuing, setContinuing] = useState(false);
  const [generatingMaterials, setGeneratingMaterials] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<ApplicationStatus | null>(null);
  const [materials, setMaterials] = useState<AgentMaterials | null>(null);
  const [error, setError] = useState('');

  async function readCurrentJob(): Promise<JobPosting | null> {
    setJobState('syncing');
    if (activeTabId === null) {
      setJob(null);
      setResult(null);
      setError('');
      setJobState('empty');
      return null;
    }
    try {
      const parsed = CurrentJobSchema.safeParse(
        await browser.tabs.sendMessage(activeTabId, { type: 'GET_CURRENT_JOB' }),
      );
      if (!parsed.success) {
        setJob(null);
        setResult(null);
        setError(t('agentExtractionFailed'));
        setJobState('error');
        return null;
      }
      if (!parsed.data.ok) {
        setJob(null);
        setResult(null);
        setError(parsed.data.reason === 'not-a-job-detail'
          ? ''
          : t('agentExtractionFailed'));
        setJobState(parsed.data.reason === 'not-a-job-detail' ? 'empty' : 'error');
        return null;
      }
      setJob(parsed.data.job);
      setError('');
      setJobState('ready');
      const stored = await browser.storage.local.get(storageKey(parsed.data.job));
      const saved = AgentAnalysisSchema.safeParse(stored[storageKey(parsed.data.job)]);
      setResult(saved.success ? saved.data : null);
      if (saved.success) {
        try {
          setMaterials(await getMaterials(await getAgentToken(), saved.data.analysis_id));
        } catch {
          setMaterials(null);
        }
      } else {
        setMaterials(null);
      }
      return parsed.data.job;
    } catch {
      setJob(null);
      setResult(null);
      setError('');
      setJobState('empty');
      return null;
    }
  }

  useEffect(() => {
    void readCurrentJob();
  }, [activeTabId, contextVersion]);

  useEffect(() => {
    void getAgentToken().then((token) => setAgentConfigured(token.trim().length >= 32));
  }, []);

  async function run() {
    if (loading) return;
    setLoading(true);
    setContinuing(false);
    setProgressTools([]);
    setError('');
    try {
      const current = await readCurrentJob();
      if (!current) return;
      if (current.extractionWarnings.includes('description-may-be-collapsed')) {
        setError(t('agentExpandDescription'));
        return;
      }
      const token = await getAgentToken();
      const next = await analyseJob(token, current, jobMode, fetch, showProgress);
      await browser.storage.local.set({ [storageKey(current)]: next });
      setResult(next);
      setMaterials(null);
    } catch (cause) {
      if (cause instanceof AgentApiError && cause.code === 'invalid-token') {
        setAgentConfigured(false);
      }
      setError(t(cause instanceof AgentApiError
        ? analysisErrorLabels[cause.code]
        : 'agentAnalysisFailed'));
    } finally {
      setLoading(false);
      setProgressTools(null);
    }
  }

  function showProgress(progress: AgentProgress) {
    if (progress.type !== 'tool') return;
    setProgressTools((current) => current?.includes(progress.toolName)
      ? current
      : [...(current ?? []), progress.toolName]);
  }

  async function continueRun(answers: Array<{ question: string; answer: string }>) {
    if (!result || loading) return;
    setLoading(true);
    setContinuing(true);
    setProgressTools([]);
    setError('');
    try {
      const next = await continueAnalysis(
        await getAgentToken(), result.analysis_id, answers, fetch, showProgress,
      );
      if (job) await browser.storage.local.set({ [storageKey(job)]: next });
      setResult(next);
      setMaterials(null);
    } catch (cause) {
      setError(t(cause instanceof AgentApiError
        ? analysisErrorLabels[cause.code]
        : 'agentAnalysisFailed'));
    } finally {
      setLoading(false);
      setContinuing(false);
      setProgressTools(null);
    }
  }

  async function prepareMaterials() {
    if (!result || loading) return;
    setLoading(true);
    setGeneratingMaterials(true);
    setError('');
    try {
      const next = await generateMaterials(await getAgentToken(), result.analysis_id);
      setMaterials(next);
    } catch {
      setError(t('agentMaterialsFailed'));
    } finally {
      setLoading(false);
      setGeneratingMaterials(false);
    }
  }

  async function markApplied() {
    if (!job || updatingStatus) return;
    setUpdatingStatus(true);
    setError('');
    try {
      const [token, identity] = await Promise.all([
        getAgentToken(),
        createJobPostingIdentity(job),
      ]);
      setApplicationStatus(await updateApplicationStatus(token, identity, 'applied'));
    } catch {
      setError(t('agentStatusFailed'));
    } finally {
      setUpdatingStatus(false);
    }
  }

  function openMaterials() {
    if (!materials) return;
    const url = new URL(browser.runtime.getURL('/materials.html'));
    url.searchParams.set('analysisId', materials.analysis_id);
    void browser.tabs.create({ url: url.href });
  }

  const collapsed = job?.extractionWarnings.includes('description-may-be-collapsed');
  const awaitingAnswers = Boolean(result?.recommendation.clarification_questions.length);
  const materialSourceCount = materials?.cv_change_plan?.selected_source_refs.length
    ?? materials?.cover_letter?.source_refs.length ?? 0;
  return (
    <section aria-labelledby="agent-title" aria-busy={loading}>
      <div className="page-heading">
        <span className="eyebrow">{t('jobWorkspace')}</span>
        <h2 id="agent-title">{t('agentTitle')}</h2>
        <p>{t('agentIntro')}</p>
      </div>

      {jobState === 'syncing' && !job && (
        <div className="job-empty-state" role="status">
          <span className="sync-spinner" aria-hidden="true" />
          <strong>{t('syncingCurrentJob')}</strong>
          <p>{t('syncingCurrentJobHelp')}</p>
        </div>
      )}
      {jobState === 'empty' && (
        <div className="job-empty-state">
          <span className="empty-icon" aria-hidden="true">↗</span>
          <strong>{t('agentNoJobTitle')}</strong>
          <p>{t('agentNoSeekJob')}</p>
          <small>{t('agentAutoSync')}</small>
        </div>
      )}
      {jobState === 'error' && (
        <div className="job-empty-state">
          <span className="empty-icon" aria-hidden="true">!</span>
          <strong>{t('agentReadFailedTitle')}</strong>
          <p>{t('agentExtractionFailed')}</p>
          <button type="button" className="secondary" onClick={() => void readCurrentJob()}>
            {t('retrySync')}
          </button>
        </div>
      )}
      {job && (
        <section className="current-job-card" aria-labelledby="agent-job-title">
          <span className="synced-label"><span aria-hidden="true" />{t('agentSynced')}</span>
          <h3 id="agent-job-title">{job.title}</h3>
          <p>{[job.company, job.location, job.employmentType].filter(Boolean).join(' · ')}</p>
        </section>
      )}
      {collapsed && <p role="alert" className="availability-note">{t('agentExpandDescription')}</p>}
      {error && jobState !== 'error' && <p role="alert" className="error">{error}</p>}

      {job && agentConfigured === false && (
        <section className="setup-callout">
          <div>
            <strong>{t('agentSetupTitle')}</strong>
            <p>{t('agentSetupIntro')}</p>
          </div>
          <button type="button" onClick={onOpenSettings}>
            {t('openAgentSettings')}
          </button>
        </section>
      )}
      {job && agentConfigured === true && (
        <div className="analysis-controls">
          <label>
            {t('agentJobMode')}
            <select value={jobMode} onChange={(event) => setJobMode(event.target.value as AgentJobMode)}>
              {Object.entries(modeLabels).map(([mode, label]) => (
                <option key={mode} value={mode}>{t(label)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="full-button"
            disabled={loading || collapsed}
            onClick={() => void run()}
          >
            {progressTools !== null && !continuing ? t('agentAnalysing') : t('agentAnalyse')}
          </button>
        </div>
      )}
      {progressTools !== null && !continuing && <AnalysisProgress tools={progressTools} />}
      {result && (
        <>
          <AnalysisResult result={result} />
          {awaitingAnswers && (
              <ClarificationForm
                key={result.analysis_id}
                questions={result.recommendation.clarification_questions}
                busy={loading}
                onSubmit={(answers) => void continueRun(answers)}
              />
            )}
          {progressTools !== null && continuing && <AnalysisProgress tools={progressTools} />}
          {!awaitingAnswers &&
            !result.recommendation.hard_blockers.length &&
            (result.recommendation.cv_action !== 'DO_NOT_GENERATE' ||
              result.recommendation.cover_letter_action !== 'DO_NOT_GENERATE') && (
              <section className="section-card materials-callout">
                <div className="section-copy">
                  <h3>{t('agentMaterials')}</h3>
                  <p>{t('agentMaterialsIntro')}</p>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void prepareMaterials()}
                >
                  {generatingMaterials ? t('agentPreparingMaterials') : t('agentPrepare')}
                </button>
              </section>
            )}
          {generatingMaterials && (
            <section className="analysis-progress" role="status" aria-live="polite">
              <span className="sync-spinner" aria-hidden="true" />
              <div>
                <strong>{t('agentPreparingMaterials')}</strong>
                <p>{t('agentPreparingMaterialsHelp')}</p>
              </div>
            </section>
          )}
          {materials && job && (
            <section className="section-card agent-materials">
              <h3>{t('agentMaterials')}</h3>
              {materials.cv_change_plan && <>
                <strong>{t('agentMaterialPlan')}</strong>
                <ul>{materials.cv_change_plan.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}</ul>
              </>}
              <p className="muted">
                {t('agentSourcesUsed', { count: materialSourceCount })}
              </p>
              <p className="muted">{t('agentOpenMaterialsHelp')}</p>
              <button type="button" onClick={openMaterials}>{t('agentOpenMaterials')}</button>
              <button
                type="button"
                className="secondary"
                disabled={updatingStatus || applicationStatus === 'applied'}
                onClick={() => void markApplied()}
              >
                {applicationStatus === 'applied' ? t('agentStatusApplied') : t('agentMarkApplied')}
              </button>
              {updatingStatus && (
                <p role="status" className="saved-status saving">
                  <span className="sync-spinner" aria-hidden="true" />
                  <span>{t('agentStatusSaving')}</span>
                </p>
              )}
              {applicationStatus === 'applied' && (
                <p role="status" className="saved-status">
                  <span className="saved-status-icon" aria-hidden="true">✓</span>
                  <span>{t('agentApplicationStatus', { status: t('agentStatusApplied') })}</span>
                  <strong>{t('agentStatusSaved')}</strong>
                </p>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
