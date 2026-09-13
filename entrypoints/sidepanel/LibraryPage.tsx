import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  AgentApiError,
  addCandidateSource,
  clearCandidateLibrary,
  deleteCandidateSource,
  getAgentToken,
  getCandidateLibrary,
  getCandidateSourceContent,
  reprocessCandidateSource,
  resolveCandidateConflict,
  updateCandidateSource,
  type CandidateLibrary,
  type CandidateSourceMetadataUpdate,
  type CandidateSourceSummary,
} from '../../src/agent/agent-client';
import { getRuntimeLocale, t, type TranslationKey } from '../../src/i18n';

const sourceKindLabels: Record<CandidateSourceSummary['kind'], TranslationKey> = {
  cv: 'librarySourceKindCv', visa: 'librarySourceKindVisa', project: 'librarySourceKindProject',
  certificate: 'librarySourceKindCertificate', education: 'librarySourceKindEducation',
  portfolio: 'librarySourceKindPortfolio', other: 'librarySourceKindOther',
};
const sourceStatusLabels: Record<CandidateSourceSummary['status'], TranslationKey> = {
  processing: 'librarySourceStatusProcessing', ready: 'librarySourceStatusReady',
  'needs-attention': 'librarySourceStatusNeedsAttention',
};
const sourceSensitivityLabels: Record<CandidateSourceSummary['sensitivity'], TranslationKey> = {
  standard: 'librarySourceSensitivityStandard', personal: 'librarySourceSensitivityPersonal',
  'highly-sensitive': 'librarySourceSensitivityHigh',
};
const sourceKindIcons: Record<CandidateSourceSummary['kind'], string> = {
  cv: 'CV', visa: 'ID', project: 'PRJ', certificate: 'CERT', education: 'EDU',
  portfolio: 'PORT', other: 'DOC',
};
const MAX_CANDIDATE_DOCUMENT_BYTES = 2 * 1024 * 1024;
const candidateImportErrorLabels: Partial<Record<AgentApiError['code'], TranslationKey>> = {
  'import-unsupported': 'libraryImportUnsupported',
  'import-document-limit': 'libraryImportLimitExceeded',
  'import-no-text': 'libraryImportNoText', 'import-unreadable': 'libraryImportUnreadable',
  'import-timeout': 'libraryImportTimeout', 'import-limit': 'libraryImportFailed',
  'import-model-error': 'libraryImportFailed', unauthorized: 'agentUnauthorized',
  'invalid-token': 'agentNotConfigured', unavailable: 'libraryServiceUnavailable',
};

function fileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const encoded = result.split(',', 2)[1];
      if (encoded) resolve(encoded); else reject(new Error('FILE_READ_FAILED'));
    };
    reader.readAsDataURL(file);
  });
}

function SourceDetail({ source, busy, onBack, onUpdate, onReprocess, onOpen, onDelete }: {
  source: CandidateSourceSummary;
  busy: boolean;
  onBack(): void;
  onUpdate(update: CandidateSourceMetadataUpdate): Promise<boolean>;
  onReprocess(): void;
  onOpen(): void;
  onDelete(): void;
}) {
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState(source.kind);
  const [sensitivity, setSensitivity] = useState(source.sensitivity);
  const [purposeTags, setPurposeTags] = useState(source.purposeTags.join(', '));

  return <section className="source-detail" aria-labelledby="source-detail-title">
    <button type="button" className="quiet-button library-back" onClick={onBack}>
      {t('libraryBackToSources')}
    </button>
    <header className="section-card source-detail-header">
      <span className={`source-kind-icon ${source.kind}`} aria-hidden="true">
        {sourceKindIcons[source.kind]}
      </span>
      <div className="source-detail-title">
        <div className="source-detail-kicker">
          <span className="eyebrow">{t(sourceKindLabels[source.kind])}</span>
          <span className={`source-status ${source.status}`}>{t(sourceStatusLabels[source.status])}</span>
        </div>
        <h3 id="source-detail-title">{source.fileName}</h3>
        <p>{source.summary}</p>
      </div>
      <div className="source-meta source-detail-meta">
        <span>{t(sourceSensitivityLabels[source.sensitivity])}</span>
        <span>{t('librarySourceDocumentMeta', {
          size: Math.ceil(source.sizeBytes / 1024),
          date: new Intl.DateTimeFormat(getRuntimeLocale(), { dateStyle: 'medium' })
            .format(new Date(source.importedAt)),
        })}</span>
      </div>
      {!!source.purposeTags.length && <div className="source-tags">
        {source.purposeTags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>}
      <div className="source-detail-actions">
        <button type="button" className="secondary small" disabled={busy} onClick={onOpen}>
          {t('libraryOpenOriginal')}
        </button>
        <button type="button" className="secondary small" disabled={busy}
          onClick={() => setEditing((value) => !value)}>{t('edit')}</button>
        <button type="button" className="quiet-button small" disabled={busy}
          onClick={onReprocess}>{t('libraryReprocessSource')}</button>
      </div>
      {editing && <form className="source-metadata-form" onSubmit={(event) => {
        event.preventDefault();
        const tags = [...new Set(purposeTags.split(',').map((tag) => (
          tag.trim().toLowerCase().replace(/\s+/g, '-')
        )).filter(Boolean))];
        void onUpdate({ kind, sensitivity, purposeTags: tags }).then((saved) => {
          if (saved) setEditing(false);
        });
      }}>
        <label>{t('librarySourceType')}
          <select value={kind} onChange={(event) => setKind(
            event.target.value as CandidateSourceSummary['kind'],
          )}>{Object.entries(sourceKindLabels).map(([value, label]) => (
              <option value={value} key={value}>{t(label)}</option>
            ))}</select>
        </label>
        <label>{t('librarySourceSensitivity')}
          <select value={sensitivity} onChange={(event) => setSensitivity(
            event.target.value as CandidateSourceSummary['sensitivity'],
          )}>{Object.entries(sourceSensitivityLabels).map(([value, label]) => (
              <option value={value} key={value}>{t(label)}</option>
            ))}</select>
        </label>
        <label className="full-row">{t('librarySourcePurposeTags')}
          <input value={purposeTags} onChange={(event) => setPurposeTags(event.target.value)}
            placeholder={t('librarySourcePurposePlaceholder')} />
        </label>
        <div className="actions full-row">
          <button type="submit" className="small" disabled={busy}>{t('save')}</button>
          <button type="button" className="quiet-button small" disabled={busy}
            onClick={() => setEditing(false)}>{t('cancel')}</button>
        </div>
      </form>}
    </header>
    <button type="button" className="danger quiet-danger" disabled={busy} onClick={onDelete}>
      {t('libraryDeleteSource')}
    </button>
  </section>;
}

export default function LibraryPage({ onOpenSettings }: { onOpenSettings(): void }) {
  const [data, setData] = useState<CandidateLibrary | null>(null);
  const [importingFileName, setImportingFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourceBusyId, setSourceBusyId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try { setData(await getCandidateLibrary(await getAgentToken())); }
      catch { setError(t('libraryServiceUnavailable')); }
      finally { setLoading(false); }
    })();
  }, []);

  async function resetWorkspace() {
    if (!data || busy || !window.confirm(t('libraryResetConfirm'))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      setData(await clearCandidateLibrary(await getAgentToken()));
      setSelectedSourceId(null);
      setMessage(t('libraryResetComplete'));
    } catch { setError(t('libraryResetFailed')); }
    finally { setBusy(false); }
  }

  async function chooseCandidateDocument(file?: File) {
    setMessage('');
    if (!file) return;
    if (file.size > MAX_CANDIDATE_DOCUMENT_BYTES) {
      setError(t('libraryImportLimitExceeded')); return;
    }
    setImportingFileName(file.name); setImporting(true); setError('');
    try {
      const result = await addCandidateSource(
        await getAgentToken(), file.name, await fileAsBase64(file),
      );
      setData((current) => current ? {
        sources: [result.source, ...current.sources.filter((item) => item.id !== result.source.id)],
        conflicts: result.conflicts,
      } : current);
      setMessage(t(result.warnings.includes('duplicate-source')
        ? 'librarySourceDuplicate'
        : result.warnings.includes('source-understanding-failed')
          ? 'librarySourceSavedNeedsAttention' : 'librarySourceSaved'));
    } catch (cause) {
      setError(t(cause instanceof AgentApiError
        ? candidateImportErrorLabels[cause.code] ?? 'libraryImportFailed'
        : 'libraryImportUnreadable'));
    } finally { setImporting(false); setImportingFileName(''); }
  }

  async function resolveConflict(conflictId: string, selectedClaimId: string | null) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      setData(await resolveCandidateConflict(await getAgentToken(), conflictId, selectedClaimId));
      setMessage(t('libraryConflictResolved'));
    } catch { setError(t('libraryConflictResolveFailed')); }
    finally { setBusy(false); }
  }

  async function saveSourceMetadata(sourceId: string, update: CandidateSourceMetadataUpdate) {
    setSourceBusyId(sourceId); setError(''); setMessage('');
    try {
      const saved = await updateCandidateSource(await getAgentToken(), sourceId, update);
      setData((current) => current ? {
        ...current,
        sources: current.sources.map((source) => source.id === sourceId ? saved : source),
      } : current);
      setMessage(t('librarySourceUpdated'));
      return true;
    } catch { setError(t('librarySourceActionFailed')); return false; }
    finally { setSourceBusyId(null); }
  }

  async function reprocessSource(sourceId: string) {
    setSourceBusyId(sourceId); setError(''); setMessage('');
    try {
      const result = await reprocessCandidateSource(await getAgentToken(), sourceId);
      setData((current) => current ? {
        ...current,
        sources: current.sources.map((source) => source.id === sourceId ? result.source : source),
        conflicts: result.conflicts,
      } : current);
      setMessage(t(result.warnings.includes('source-understanding-failed')
        ? 'librarySourceSavedNeedsAttention' : 'librarySourceReprocessed'));
    } catch { setError(t('librarySourceActionFailed')); }
    finally { setSourceBusyId(null); }
  }

  async function openSource(sourceId: string) {
    setSourceBusyId(sourceId); setError('');
    try {
      const url = URL.createObjectURL(await getCandidateSourceContent(await getAgentToken(), sourceId));
      await browser.tabs.create({ url });
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { setError(t('librarySourceActionFailed')); }
    finally { setSourceBusyId(null); }
  }

  async function removeSource(source: CandidateSourceSummary) {
    if (!window.confirm(t('libraryDeleteSourceConfirm', { file: source.fileName }))) return;
    setSourceBusyId(source.id); setError(''); setMessage('');
    try {
      setData(await deleteCandidateSource(await getAgentToken(), source.id));
      setSelectedSourceId(null);
      setMessage(t('librarySourceDeleted'));
    } catch { setError(t('librarySourceActionFailed')); }
    finally { setSourceBusyId(null); }
  }

  const selectedSource = data?.sources.find((source) => source.id === selectedSourceId) ?? null;
  const attentionSources = data?.sources.filter((source) => source.status === 'needs-attention') ?? [];

  return <section aria-labelledby={selectedSource ? 'source-detail-title' : 'library-title'}
    aria-busy={loading || busy || importing || Boolean(sourceBusyId)}>
    {!selectedSource && <div className="page-heading">
      <h2 id="library-title">{t('libraryTitle')}</h2><p>{t('libraryIntro')}</p>
    </div>}
    {loading && <p role="status">{t('loading')}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status" className="success">{message}</p>}
    {!loading && !data && <section className="setup-callout">
      <div><strong>{t('libraryConnectTitle')}</strong><p>{t('libraryConnectIntro')}</p></div>
      <button type="button" onClick={onOpenSettings}>{t('openAgentSettings')}</button>
    </section>}
    {data && selectedSource ? <SourceDetail source={selectedSource}
      busy={sourceBusyId === selectedSourceId} onBack={() => setSelectedSourceId(null)}
      onUpdate={(update) => saveSourceMetadata(selectedSourceId!, update)}
      onReprocess={() => void reprocessSource(selectedSourceId!)}
      onOpen={() => void openSource(selectedSourceId!)}
      onDelete={() => void removeSource(selectedSource)} /> : data && <>
      <section className="section-card source-upload-card">
        <div className="section-copy"><h3>{t('libraryImportTitle')}</h3>
          <p>{t('libraryImportIntro')}</p></div>
        <label>{t('libraryChooseCv')}<input type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={importing} onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = '';
            void chooseCandidateDocument(file);
          }} /></label>
        {importing && <section className="analysis-progress" role="status" aria-live="polite">
          <span className="sync-spinner" aria-hidden="true" />
          <div><strong>{t('libraryImporting', { file: importingFileName })}</strong>
            <p>{t('libraryImportingHelp')}</p></div>
        </section>}
      </section>
      {!!(data.conflicts.length || attentionSources.length) && <section
        className="section-card conflict-inbox" aria-labelledby="conflicts-title">
        <div className="section-title-row"><div><span className="eyebrow">
          {t('libraryNeedsAttention')}</span><h3 id="conflicts-title">{t('libraryConflictsTitle', {
            count: data.conflicts.length + attentionSources.length,
          })}</h3></div></div>
        {!!data.conflicts.length && <p>{t('libraryConflictsIntro')}</p>}
        {attentionSources.map((source) => <article className="claim-conflict" key={source.id}>
          <strong>{source.fileName}</strong><span>{t('librarySourceNeedsReprocess')}</span>
          <button type="button" className="secondary small"
            onClick={() => setSelectedSourceId(source.id)}>{t('libraryReviewSource')}</button>
        </article>)}
        {data.conflicts.map((conflict) => <article className="claim-conflict" key={conflict.id}>
          <strong>{conflict.title}</strong><div className="conflict-options">
            {conflict.claims.map((claim) => <button type="button" className="secondary"
              disabled={busy} key={claim.id}
              onClick={() => void resolveConflict(conflict.id, claim.id)}>
              <strong>{claim.statement}</strong><span>{claim.fileName}</span>
            </button>)}
          </div><button type="button" className="quiet-button" disabled={busy}
            onClick={() => void resolveConflict(conflict.id, null)}>{
              t('libraryConflictContextual')
            }</button>
        </article>)}
      </section>}
      <section className="source-library" aria-labelledby="source-library-title">
        <div className="heading-row"><div><h3 id="source-library-title">
          {t('librarySourcesTitle')}</h3><p className="muted">{t('librarySourcesIntro')}</p>
        </div></div>
        {!data.sources.length && <p className="empty-state">{t('librarySourcesEmpty')}</p>}
        <div className="source-grid">{data.sources.map((source) => <button type="button"
          className="source-card" key={source.id} onClick={() => setSelectedSourceId(source.id)}>
          <div className="source-card-head"><span className={`source-kind-icon ${source.kind}`}
            aria-hidden="true">{sourceKindIcons[source.kind]}</span>
            <div className="source-card-copy"><div className="source-card-kicker">
              <span className="eyebrow">{t(sourceKindLabels[source.kind])}</span>
              <span className={`source-status ${source.status}`}>{
                t(sourceStatusLabels[source.status])
              }</span></div>
              <strong className="source-file-name" title={source.fileName}>{source.fileName}</strong>
              {source.summary !== source.fileName && <span className="source-card-summary">
                {source.summary}</span>}
              <span className="source-card-meta">{t('librarySourceCardMeta', {
                date: new Intl.DateTimeFormat(getRuntimeLocale(), { dateStyle: 'medium' })
                  .format(new Date(source.importedAt)),
              })}</span>
            </div><span className="source-open-icon" aria-hidden="true">›</span>
          </div>
        </button>)}</div>
      </section>
      <details className="library-controls"><summary>{t('libraryLibrarySettings')}</summary>
        <div><p className="muted">{t('libraryResetHelp')}</p>
          <button type="button" className="danger small" disabled={busy}
            onClick={() => void resetWorkspace()}>{t('libraryReset')}</button></div>
      </details>
    </>}
  </section>;
}
