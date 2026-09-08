import { useEffect, useState } from 'react';
import {
  getAgentToken,
  getMaterials,
  type AgentMaterials,
} from '../../src/agent/agent-client';
import { downloadFile } from '../../src/browser/download';
import { getRuntimeLocale, setRuntimeLocale, t } from '../../src/i18n';
import { getPreferences } from '../../src/storage/settings-repository';

export default function MaterialsPage({
  analysisId = new URLSearchParams(window.location.search).get('analysisId'),
}: { analysisId?: string | null } = {}) {
  const [materials, setMaterials] = useState<AgentMaterials | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const preferences = await getPreferences();
        setRuntimeLocale(preferences.locale);
        document.documentElement.lang = preferences.locale;
        if (!analysisId) {
          setError(t('materialsInvalidLink'));
          return;
        }
        const bundle = await getMaterials(await getAgentToken(), analysisId);
        setMaterials(bundle);
        setCoverLetter(bundle.cover_letter?.text ?? '');
        document.title = `${t('materialsPageTitle')} — Kiwi`;
      } catch {
        setError(t('materialsUnavailable'));
      }
    })();
  }, [analysisId]);

  if (error) return <main className="materials-message" role="alert"><h1>Kiwi</h1><p>{error}</p></main>;
  if (!materials) return <main className="materials-message" role="status">
    <span className="spinner" aria-hidden="true" /><p>{t('materialsLoading')}</p>
  </main>;

  const generated = new Intl.DateTimeFormat(getRuntimeLocale(), {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(materials.generated_at));
  const cvHtml = materials.cv_html;

  return <main className="materials-page">
    <header className="materials-header">
      <div><span className="brand">Kiwi Career Copilot</span>
        <h1>{t('materialsPageTitle')}</h1><p>{t('materialsPageIntro')}</p></div>
      <div className="header-actions">
        {cvHtml && <button type="button" onClick={() => downloadFile(
          cvHtml, 'tailored-cv.html', 'text/html',
        )}>{t('agentDownloadCv')}</button>}
        {materials.cover_letter && <button type="button" className="secondary" onClick={() => downloadFile(
          coverLetter, 'cover-letter.txt', 'text/plain',
        )}>{t('agentDownloadCoverLetter')}</button>}
      </div>
    </header>
    <p className="generated-at">{t('materialsGenerated', { date: generated })}</p>
    <div className={`materials-workspace${cvHtml ? '' : ' single'}`}>
      <aside className="materials-sidebar">
        {materials.cv_change_plan && <section>
          <h2>{t('agentMaterialPlan')}</h2>
          <ul>{materials.cv_change_plan.changes.map((change) => <li key={change}>{change}</li>)}</ul>
          <p className="muted">{t('agentSourcesUsed', {
            count: materials.cv_change_plan.selected_source_refs.length,
          })}</p>
        </section>}
        {materials.cover_letter && <section>
          <label htmlFor="cover-letter">{t('agentCoverLetter')}</label>
          <p className="muted">{t('materialsCoverLetterHelp')}</p>
          <textarea id="cover-letter" value={coverLetter}
            onChange={(event) => setCoverLetter(event.target.value)} />
        </section>}
      </aside>
      {cvHtml && <section className="cv-workspace" aria-labelledby="cv-title">
        <h2 id="cv-title">{t('materialsCvTitle')}</h2>
        <div className="cv-canvas">
          <iframe title={t('materialsCvTitle')} sandbox="" srcDoc={cvHtml.replace(
            ' contenteditable="true" spellcheck="true"', '',
          )} />
        </div>
      </section>}
    </div>
  </main>;
}
