import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import {
  checkAgentHealth,
  getAgentToken,
  saveAgentToken,
  type AgentHealthResult,
} from '../../src/agent/agent-client';
import { downloadFile } from '../../src/browser/download';
import type {
  FilterRule,
  LocalFilterSettings,
  RuleField,
} from '../../src/core/rules/rule-types';
import type {
  CommuteOrigin,
  KnownLocation,
} from '../../src/location/location-types';
import {
  getRuntimeLocale,
  setRuntimeLocale,
  t,
  type TranslationKey,
} from '../../src/i18n';
import { sendExtensionMessage } from '../../src/messaging/content-client';
import type { PageStatus } from '../../src/messaging/message-types';
import {
  createExportBundle,
  MAX_IMPORT_BYTES,
  mergeImportedRules,
  parseImportBundle,
  type ExportBundle,
} from '../../src/storage/import-export';
import type {
  DiagnosticsState,
  JobStateRecord,
  SyncedPreferences,
} from '../../src/storage/storage-types';
import AgentPage from './AgentPage';
import LibraryPage from './LibraryPage';

type Page = 'job' | 'library' | 'search' | 'settings';
type SearchSection = 'rules' | 'distance' | 'dismissed';
type ExclusionType =
  | 'exclude-keyword'
  | 'exclude-company';
type ExclusionRule = Exclude<FilterRule, { type: 'max-distance' }>;
type MatchMode = 'contains' | 'phrase' | 'prefix-wildcard' | 'exact';

const navIconPaths: Record<Page, string> = {
  job: 'M5 7h14v12H5V7Zm4 0V5h6v2M5 11h14M9 14h6',
  library: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  search: 'M3 5h18l-7 8v5l-4 2v-7L3 5Z',
  settings: 'M4 7h10m4 0h2m-6-2v4M4 17h2m4 0h10m-13-2v4M4 12h4m4 0h8m-11-2v4',
};

function NavIcon({ page }: { page: Page }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={navIconPaths[page]} />
    </svg>
  );
}

interface RuleDraft {
  id: string | null;
  type: ExclusionType;
  pattern: string;
  matchMode: MatchMode;
  fields: RuleField[];
}

const ruleFields: RuleField[] = [
  'title',
  'company',
  'location',
  'summary',
  'all',
];

function emptyDraft(): RuleDraft {
  return {
    id: null,
    type: 'exclude-keyword',
    pattern: '',
    matchMode: 'contains',
    fields: ['title'],
  };
}

function editDraft(rule: FilterRule): RuleDraft | null {
  if (rule.type === 'max-distance') return null;
  return {
    id: rule.id,
    type: rule.type,
    pattern: rule.pattern,
    matchMode: rule.matchMode,
    fields: rule.type === 'exclude-keyword' ? rule.fields : ['title'],
  };
}

function buildRule(draft: RuleDraft, current?: FilterRule): FilterRule | null {
  const pattern = draft.pattern.trim();
  if (!pattern || (draft.type === 'exclude-keyword' && !draft.fields.length)) {
    return null;
  }
  const now = Date.now();
  const base = {
    id: draft.id ?? crypto.randomUUID(),
    enabled: current?.enabled ?? true,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
  if (draft.type === 'exclude-keyword') {
    const matchMode = draft.matchMode === 'exact' ? 'contains' : draft.matchMode;
    return { ...base, type: draft.type, pattern, matchMode, fields: draft.fields };
  }
  const matchMode = draft.matchMode === 'exact' ? 'exact' : 'contains';
  return { ...base, type: draft.type, pattern, matchMode };
}

function siteName(): string {
  return t('seekSite');
}

function statusName(status: PageStatus['health']['status']): string {
  return t(status);
}

function matchModeName(mode: ExclusionRule['matchMode']): string {
  return t(mode === 'prefix-wildcard' ? 'prefixWildcard' : mode);
}

function localityTypeName(type: KnownLocation['localityType']): string {
  const keys: Record<KnownLocation['localityType'], TranslationKey> = {
    suburb: 'suburb',
    locality: 'locality',
    town: 'town',
    city: 'city',
    district: 'district',
    region: 'region',
  };
  return t(keys[type]);
}

function copyDiagnostics(
  siteId: PageStatus['siteId'],
  health: PageStatus['health'],
): Promise<void> {
  return navigator.clipboard.writeText(JSON.stringify({
    adapterId: siteId,
    adapterVersion: health.selectorVersion,
    status: health.status,
    detectedCardCount: health.detectedCardCount,
    extractedJobCount: health.extractedJobCount,
    missingIdCount: health.missingIdCount,
    missingUrlCount: health.missingUrlCount,
    missingTitleCount: health.missingTitleCount,
    missingLocationCount: health.missingLocationCount,
    checkedAt: health.checkedAt,
  }, null, 2));
}

function download(bundle: ExportBundle): void {
  downloadFile(
    JSON.stringify(bundle, null, 2),
    `jobfilter-settings-${bundle.exportedAt.slice(0, 10)}.json`,
    'application/json',
  );
}

function SearchStatus({
  status,
  tabId,
  onShowHidden,
}: {
  status: PageStatus | null;
  tabId: number | null;
  onShowHidden(show: boolean): Promise<void>;
}) {
  if (!status) {
    return (
      <section className="search-status" aria-labelledby="search-activity-title">
        <div>
          <h3 id="search-activity-title">{t('searchActivityTitle')}</h3>
          <p>{t('searchActivityEmpty')}</p>
        </div>
        <span className="health-badge muted-status">{t('waitingForSeek')}</span>
      </section>
    );
  }
  return (
    <section className="search-status" aria-labelledby="search-activity-title">
      <div className="search-status-copy">
        <div>
          <h3 id="search-activity-title">{t('searchActivityTitle')}</h3>
          <div className="compact-stats">
            <span>{t('shown')} <strong>{status.shown}</strong></span>
            <span>{t('hidden')} <strong>{status.hidden}</strong></span>
            <span>{t('scanned')} <strong>{status.scanned}</strong></span>
          </div>
        </div>
        <span className={`health-badge ${status.health.status}`}>
          {t('filteringActive')}
        </span>
      </div>
      <label className="switch-row">
        <input
          type="checkbox"
          checked={status.showHidden}
          disabled={tabId === null}
          onChange={(event) => void onShowHidden(event.target.checked)}
        />
        <span>{t('showHiddenSwitch')}</span>
      </label>
    </section>
  );
}

function RuleEditor({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: RuleDraft;
  onChange(draft: RuleDraft): void;
  onSave(event: FormEvent): void;
  onCancel(): void;
}) {
  const keyword = draft.type === 'exclude-keyword';
  return (
    <form className="panel-card" onSubmit={onSave}>
      <h3>{draft.id ? t('editRule') : t('addRule')}</h3>
      <label>
        {t('ruleType')}
        <select
          value={draft.type}
          onChange={(event) => {
            const type = event.target.value as ExclusionType;
            onChange({
              ...draft,
              type,
              matchMode: 'contains',
            });
          }}
        >
          <option value="exclude-keyword">{t('keyword')}</option>
          <option value="exclude-company">{t('company')}</option>
        </select>
      </label>
      <label>
        {t('pattern')}
        <input
          value={draft.pattern}
          maxLength={200}
          required
          onChange={(event) => onChange({ ...draft, pattern: event.target.value })}
        />
      </label>
      <label>
        {t('matchMode')}
        <select
          value={draft.matchMode}
          onChange={(event) =>
            onChange({ ...draft, matchMode: event.target.value as MatchMode })
          }
        >
          <option value="contains">{t('contains')}</option>
          {keyword && <option value="phrase">{t('phrase')}</option>}
          {keyword && <option value="prefix-wildcard">{t('prefixWildcard')}</option>}
          {!keyword && <option value="exact">{t('exact')}</option>}
        </select>
      </label>
      {keyword && (
        <fieldset>
          <legend>{t('fields')}</legend>
          <div className="field-grid">
            {ruleFields.map((field) => (
              <label className="check-row" key={field}>
                <input
                  type="checkbox"
                  checked={draft.fields.includes(field)}
                  onChange={(event) => {
                    const fields = event.target.checked
                      ? field === 'all'
                        ? ['all'] as RuleField[]
                        : [...draft.fields.filter((value) => value !== 'all'), field]
                      : draft.fields.filter((value) => value !== field);
                    onChange({ ...draft, fields });
                  }}
                />
                {t(field)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="actions">
        <button type="submit">{t('save')}</button>
        <button type="button" className="secondary" onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}

function RulesPage({
  settings,
  onSave,
}: {
  settings: LocalFilterSettings;
  onSave(settings: LocalFilterSettings): Promise<void>;
}) {
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [error, setError] = useState('');
  const groups: Array<[ExclusionType, TranslationKey]> = [
    ['exclude-keyword', 'keywordRules'],
    ['exclude-company', 'companyRules'],
  ];

  async function saveRule(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const current = settings.rules.find(({ id }) => id === draft.id);
    const rule = buildRule(draft, current);
    if (!rule) {
      setError(t('invalidRule'));
      return;
    }
    const isNew = !current;
    const next: LocalFilterSettings = {
      ...settings,
      rules: isNew
        ? [...settings.rules, rule]
        : settings.rules.map((item) => item.id === rule.id ? rule : item),
      profiles: settings.profiles.map((profile) =>
        isNew && profile.id === settings.activeProfileId
          ? { ...profile, ruleIds: [...profile.ruleIds, rule.id], updatedAt: Date.now() }
          : profile,
      ),
    };
    try {
      await onSave(next);
      setDraft(null);
      setError('');
    } catch {
      setError(t('invalidRule'));
    }
  }

  async function updateRule(rule: FilterRule) {
    await onSave({
      ...settings,
      rules: settings.rules.map((item) => item.id === rule.id ? rule : item),
    });
  }

  async function deleteRule(rule: FilterRule) {
    if (!window.confirm(t('deleteRuleConfirm'))) return;
    await onSave({
      ...settings,
      rules: settings.rules.filter(({ id }) => id !== rule.id),
      profiles: settings.profiles.map((profile) => ({
        ...profile,
        ruleIds: profile.ruleIds.filter((id) => id !== rule.id),
        updatedAt: Date.now(),
      })),
    });
  }

  return (
    <section aria-labelledby="rules-title">
      <div className="heading-row">
        <h2 id="rules-title">{t('exclusionRules')}</h2>
        <button type="button" onClick={() => setDraft(emptyDraft())}>
          {t('addRule')}
        </button>
      </div>
      <p className="page-intro">{t('rulesIntro')}</p>
      {error && <p role="alert" className="error">{error}</p>}
      {draft && (
        <RuleEditor
          draft={draft}
          onChange={setDraft}
          onSave={(event) => void saveRule(event)}
          onCancel={() => setDraft(null)}
        />
      )}
      {groups.map(([type, label]) => {
        const rules = settings.rules.filter(
          (rule): rule is ExclusionRule => rule.type === type,
        );
        return (
          <section key={type} className="rule-group">
            <h3>{t(label)}</h3>
            {!rules.length && <p className="muted">{t('noRules')}</p>}
            {rules.map((rule) => (
              <div className="rule-row" key={rule.id}>
                <label className="check-row grow">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(event) => void updateRule({
                      ...rule,
                      enabled: event.target.checked,
                      updatedAt: Date.now(),
                    })}
                  />
                  <span><strong>{rule.pattern}</strong><small>{matchModeName(rule.matchMode)}</small></span>
                </label>
                <button
                  type="button"
                  className="secondary small"
                  onClick={() => setDraft(editDraft(rule))}
                >
                  {t('edit')}
                </button>
                <button
                  type="button"
                  className="danger small"
                  onClick={() => void deleteRule(rule)}
                >
                  {t('delete')}
                </button>
              </div>
            ))}
          </section>
        );
      })}
    </section>
  );
}

function DismissedPage({
  jobs,
  onRestore,
}: {
  jobs: JobStateRecord[];
  onRestore(keys: string[]): Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const normalized = query.toLocaleLowerCase(getRuntimeLocale());
  const visible = useMemo(
    () => jobs.filter((job) =>
      [job.title, job.company, job.locationText]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase(getRuntimeLocale()).includes(normalized)),
    ),
    [jobs, normalized],
  );
  return (
    <section aria-labelledby="dismissed-title">
      <div className="heading-row">
        <h2 id="dismissed-title">{t('dismissedJobs')}</h2>
        {!!jobs.length && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (window.confirm(t('restoreAllConfirm'))) {
                void onRestore(jobs.map(({ key }) => key));
              }
            }}
          >
            {t('restoreAll')}
          </button>
        )}
      </div>
      <p className="page-intro">{t('dismissedIntro')}</p>
      <label>
        {t('search')}
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {!visible.length && <p className="empty-state">{t('noDismissedJobs')}</p>}
      <ul className="job-list">
        {visible.map((job) => (
          <li key={job.key} className="panel-card">
            <strong>{job.title}</strong>
            <span>{job.company ?? t('notProvided')}</span>
            <span>{job.locationText ?? t('notProvided')}</span>
            <span>{t('source')}: {siteName()}</span>
            <span>{t('hiddenAt')}: {new Intl.DateTimeFormat(getRuntimeLocale(), {
              dateStyle: 'medium', timeStyle: 'short',
            }).format(job.statusUpdatedAt)}</span>
            <span>{t('reason')}: {job.dismissReason ?? t('notProvided')}</span>
            <button type="button" onClick={() => void onRestore([job.key])}>
              {t('restore')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DistancePage({
  origin,
  settings,
  onOrigin,
  onSettings,
}: {
  origin: CommuteOrigin | null;
  settings: LocalFilterSettings;
  onOrigin(origin: CommuteOrigin | null): Promise<void>;
  onSettings(settings: LocalFilterSettings): Promise<void>;
}) {
  const profile = settings.profiles.find(({ id }) => id === settings.activeProfileId);
  const distanceRule = settings.rules.find((rule) =>
    rule.type === 'max-distance' && profile?.ruleIds.includes(rule.id),
  );
  const [maximumKm, setMaximumKm] = useState(
    distanceRule?.type === 'max-distance' ? String(distanceRule.maximumKm) : '',
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KnownLocation[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function useCurrentLocation() {
    setError('');
    setMessage('');
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10_000,
          maximumAge: 5 * 60 * 1000,
        }),
      );
      const saved = await sendExtensionMessage({
        type: 'SET_BROWSER_ORIGIN',
        payload: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        },
      });
      await onOrigin(saved);
      setMessage(t('originSaved'));
    } catch {
      setError(t('geolocationFailed'));
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      setResults(await sendExtensionMessage({
        type: 'SEARCH_LOCATIONS',
        payload: { query: query.trim(), limit: 12 },
      }));
    } catch {
      setError(t('locationSearchFailed'));
    }
  }

  async function chooseLocation(locationId: string) {
    const saved = await sendExtensionMessage({
      type: 'SET_KNOWN_ORIGIN',
      payload: { locationId },
    });
    await onOrigin(saved);
    setResults([]);
    setQuery('');
    setMessage(t('originSaved'));
  }

  async function saveMaximum(event: FormEvent) {
    event.preventDefault();
    const maximum = Number(maximumKm);
    if (!Number.isFinite(maximum) || maximum <= 0) {
      setError(t('invalidDistance'));
      return;
    }
    const now = Date.now();
    const rule: FilterRule = distanceRule?.type === 'max-distance'
      ? { ...distanceRule, enabled: true, maximumKm: maximum, updatedAt: now }
      : {
          id: crypto.randomUUID(),
          type: 'max-distance',
          enabled: true,
          maximumKm: maximum,
          createdAt: now,
          updatedAt: now,
        };
    await onSettings({
      ...settings,
      rules: distanceRule
        ? settings.rules.map((item) => item.id === rule.id ? rule : item)
        : [...settings.rules, rule],
      profiles: settings.profiles.map((item) =>
        !distanceRule && item.id === settings.activeProfileId
          ? { ...item, ruleIds: [...item.ruleIds, rule.id], updatedAt: now }
          : item,
      ),
    });
    setError('');
    setMessage(t('distanceSaved'));
  }

  async function disableMaximum() {
    if (!distanceRule) return;
    await onSettings({
      ...settings,
      rules: settings.rules.map((rule) =>
        rule.id === distanceRule.id ? { ...rule, enabled: false, updatedAt: Date.now() } : rule,
      ),
    });
    setMessage(t('distanceDisabled'));
  }

  return (
    <section aria-labelledby="distance-title">
      <h2 id="distance-title">{t('distance')}</h2>
      <p className="page-intro">{t('distanceIntro')}</p>
      <p className="privacy">{t('geolocationExplanation')}</p>
      {origin ? (
        <div className="panel-card">
          <strong>{origin.source === 'browser-geolocation' ? t('currentLocation') : origin.label}</strong>
          <p className="muted">{t('originUncertainty', {
            distance: Math.max(0.1, origin.uncertaintyKm).toFixed(1),
          })}</p>
          <button
            type="button"
            className="danger small"
            onClick={() => void sendExtensionMessage({ type: 'CLEAR_COMMUTE_ORIGIN' })
              .then(() => onOrigin(null))}
          >
            {t('clearOrigin')}
          </button>
        </div>
      ) : <p className="empty-state">{t('noOrigin')}</p>}
      <button type="button" onClick={() => void useCurrentLocation()}>
        {t('useCurrentLocation')}
      </button>

      <form onSubmit={(event) => void search(event)}>
        <label>
          {t('chooseKnownPlace')}
          <input
            value={query}
            maxLength={200}
            required
            placeholder={t('locationSearchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button type="submit" className="secondary">{t('search')}</button>
      </form>
      {!!results.length && (
        <ul className="job-list" aria-label={t('locationResults')}>
          {results.map((location) => (
            <li className="panel-card" key={location.id}>
              <strong>{location.canonicalName}</strong>
              <span>{localityTypeName(location.localityType)} · {location.regionCode ?? t('notProvided')}</span>
              <button type="button" onClick={() => void chooseLocation(location.id)}>
                {t('select')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="panel-card" onSubmit={(event) => void saveMaximum(event)}>
        <label>
          {t('maximumDistance')}
          <input
            type="number"
            min="1"
            max="5000"
            step="1"
            value={maximumKm}
            onChange={(event) => setMaximumKm(event.target.value)}
          />
        </label>
        <div className="actions">
          <button type="submit">{t('save')}</button>
          {distanceRule?.enabled && (
            <button type="button" className="secondary" onClick={() => void disableMaximum()}>
              {t('turnOff')}
            </button>
          )}
        </div>
      </form>
      <p className="muted">{t('straightLineExplanation')}</p>
      <p className="muted">
        {t('locationDataAttribution')}{' '}
        <a href="https://data.linz.govt.nz/layer/113764-nz-suburbs-and-localities/" target="_blank" rel="noreferrer">
          LINZ Data Service
        </a>
      </p>
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="success">{message}</p>}
    </section>
  );
}

function SearchWorkspace({
  section,
  settings,
  dismissed,
  origin,
  status,
  tabId,
  onSection,
  onSettings,
  onRestore,
  onOrigin,
  onShowHidden,
}: {
  section: SearchSection;
  settings: LocalFilterSettings;
  dismissed: JobStateRecord[];
  origin: CommuteOrigin | null;
  status: PageStatus | null;
  tabId: number | null;
  onSection(section: SearchSection): void;
  onSettings(settings: LocalFilterSettings): Promise<void>;
  onRestore(keys: string[]): Promise<void>;
  onOrigin(origin: CommuteOrigin | null): Promise<void>;
  onShowHidden(show: boolean): Promise<void>;
}) {
  const sections: Array<[SearchSection, TranslationKey]> = [
    ['rules', 'searchExclusions'],
    ['distance', 'searchCommute'],
    ['dismissed', 'searchHidden'],
  ];
  return (
    <section aria-labelledby="search-title">
      <div className="page-heading">
        <h2 id="search-title">{t('searchControls')}</h2>
        <p>{t('searchControlsIntro')}</p>
      </div>
      <SearchStatus status={status} tabId={tabId} onShowHidden={onShowHidden} />
      <nav className="section-nav" aria-label={t('searchControls')}>
        {sections.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={section === id ? 'active' : ''}
            aria-label={t(label)}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => onSection(id)}
          >
            {t(label)}
            {id === 'dismissed' && dismissed.length > 0 && (
              <span className="nav-count">{dismissed.length}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="section-content">
        {section === 'rules' && (
          <RulesPage
            settings={settings}
            onSave={onSettings}
          />
        )}
        {section === 'distance' && (
          <DistancePage
            origin={origin}
            settings={settings}
            onOrigin={onOrigin}
            onSettings={onSettings}
          />
        )}
        {section === 'dismissed' && (
          <DismissedPage jobs={dismissed} onRestore={onRestore} />
        )}
      </div>
    </section>
  );
}

function SettingsPage({
  preferences,
  settings,
  diagnostics,
  origin,
  onPreferences,
  onSettings,
  onDebugLogging,
  onImportOrigin,
  onClear,
}: {
  preferences: SyncedPreferences;
  settings: LocalFilterSettings;
  diagnostics: DiagnosticsState;
  origin: CommuteOrigin | null;
  onPreferences(preferences: SyncedPreferences): Promise<void>;
  onSettings(settings: LocalFilterSettings): Promise<void>;
  onDebugLogging(enabled: boolean): Promise<void>;
  onImportOrigin(origin: CommuteOrigin): Promise<void>;
  onClear(): Promise<void>;
}) {
  const [candidate, setCandidate] = useState<ExportBundle | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [includeExportOrigin, setIncludeExportOrigin] = useState(false);
  const [includeImportOrigin, setIncludeImportOrigin] = useState(false);

  async function chooseFile(file?: File) {
    setMessage('');
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError(t('fileTooLarge'));
      return;
    }
    try {
      setCandidate(parseImportBundle(await file.text()));
      setIncludeImportOrigin(false);
      setError('');
    } catch {
      setCandidate(null);
      setError(t('invalidImport'));
    }
  }

  async function applyImport(includePreferences: boolean) {
    if (!candidate) return;
    await onSettings(mergeImportedRules(settings, candidate.filterSettings));
    if (includePreferences) await onPreferences(candidate.preferences);
    if (includeImportOrigin && candidate.commuteOrigins?.[0]) {
      await onImportOrigin(candidate.commuteOrigins[0]);
    }
    setCandidate(null);
    setMessage(t('importSuccess'));
  }

  const adapterDiagnostics = Object.entries(diagnostics.adapters);
  return (
    <section aria-labelledby="settings-title">
      <div className="page-heading">
        <h2 id="settings-title">{t('settings')}</h2>
        <p>{t('settingsIntro')}</p>
      </div>
      <section className="section-card settings-group" aria-labelledby="general-settings-title">
        <div className="section-copy">
          <h3 id="general-settings-title">{t('generalSettings')}</h3>
          <p>{t('generalSettingsIntro')}</p>
        </div>
        <label className="setting-row">
          <span>{t('language')}</span>
          <select
            value={preferences.locale}
            onChange={(event) => void onPreferences({
              ...preferences,
              locale: event.target.value as SyncedPreferences['locale'],
            })}
          >
            <option value="en-NZ">{t('english')}</option>
            <option value="zh-CN">{t('chinese')}</option>
          </select>
        </label>
        <label className="setting-row switch-setting">
          <span>
            <strong>{t('showDistance')}</strong>
            <small>{t('showDistanceHelp')}</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.ui.showDistance}
            onChange={(event) => void onPreferences({
              ...preferences,
              ui: { ...preferences.ui, showDistance: event.target.checked },
            })}
          />
        </label>
        <label className="setting-row switch-setting">
          <span>
            <strong>{t('showSeen')}</strong>
            <small>{t('showSeenHelp')}</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.ui.showSeen}
            onChange={(event) => void onPreferences({
              ...preferences,
              ui: { ...preferences.ui, showSeen: event.target.checked },
            })}
          />
        </label>
      </section>

      <AgentServerSettings />

      <details className="settings-disclosure">
        <summary>
          <span><h3>{t('dataPrivacy')}</h3><small>{t('dataPrivacyIntro')}</small></span>
        </summary>
        <div className="disclosure-content">
          <p className="privacy">{t('privacy')}</p>
          <div className="setting-action">
            <div><strong>{t('exportSettings')}</strong><small>{t('exportSettingsHelp')}</small></div>
            {origin && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={includeExportOrigin}
                  onChange={(event) => setIncludeExportOrigin(event.target.checked)}
                />
                {t('includeOriginExport')}
              </label>
            )}
            <button
              type="button"
              className="secondary"
              onClick={() => download(createExportBundle(
                preferences,
                settings,
                new Date(),
                includeExportOrigin && origin ? [origin] : undefined,
              ))}
            >
              {t('exportSettings')}
            </button>
          </div>
          <div className="setting-action">
            <div><strong>{t('importSettings')}</strong><small>{t('importSettingsHelp')}</small></div>
            <input
              type="file"
              accept="application/json,.json"
              aria-label={t('chooseImport')}
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
          </div>
          {candidate && (
            <div className="import-preview">
              <p>{t('importSummary', { rules: candidate.filterSettings.rules.length })}</p>
              {candidate.commuteOrigins?.length && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={includeImportOrigin}
                    onChange={(event) => setIncludeImportOrigin(event.target.checked)}
                  />
                  {t('includeOriginImport')}
                </label>
              )}
              <div className="actions">
                <button type="button" onClick={() => void applyImport(true)}>
                  {t('mergeImport')}
                </button>
                <button type="button" className="secondary" onClick={() => void applyImport(false)}>
                  {t('importRulesOnly')}
                </button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="error">{error}</p>}
          {message && <p role="status" className="success">{message}</p>}
        </div>
      </details>

      <details className="settings-disclosure">
        <summary>
          <span><h3>{t('advancedSettings')}</h3><small>{t('advancedSettingsIntro')}</small></span>
        </summary>
        <div className="disclosure-content">
          <section className="advanced-section">
            <h4>{t('diagnostics')}</h4>
            <p className="muted">{t('diagnosticsIntro')}</p>
            <label className="setting-row switch-setting">
              <span>{t('debugLogging')}</span>
              <input
                type="checkbox"
                checked={diagnostics.debugLogging}
                onChange={(event) => void onDebugLogging(event.target.checked)}
              />
            </label>
            {!adapterDiagnostics.length && <p className="muted">{t('noDiagnostics')}</p>}
            {adapterDiagnostics.map(([siteId, health]) => health && (
              <div className="diagnostic" key={siteId}>
                <dl>
                  <div><dt>{t('site')}</dt><dd>{siteName()}</dd></div>
                  <div><dt>{t('adapterStatus')}</dt><dd>{statusName(health.status)}</dd></div>
                  <div><dt>{t('adapterVersion')}</dt><dd>{health.selectorVersion}</dd></div>
                  <div><dt>{t('scanned')}</dt><dd>{health.detectedCardCount}</dd></div>
                  <div><dt>{t('lastChecked')}</dt><dd>{new Intl.DateTimeFormat(
                    getRuntimeLocale(), { dateStyle: 'medium', timeStyle: 'short' },
                  ).format(health.checkedAt)}</dd></div>
                </dl>
                {health.status === 'broken' && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void copyDiagnostics(
                      siteId as PageStatus['siteId'], health,
                    ).catch(() => undefined)}
                  >
                    {t('copyDiagnostics')}
                  </button>
                )}
              </div>
            ))}
          </section>
          <section className="advanced-section danger-section">
            <h4>{t('dangerZone')}</h4>
            <p className="muted">{t('dangerZoneIntro')}</p>
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (window.confirm(t('clearDataConfirm'))) void onClear();
              }}
            >
              {t('clearLocalData')}
            </button>
          </section>
        </div>
      </details>
    </section>
  );
}

function AgentServerSettings() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<AgentHealthResult | 'checking' | null>(null);

  useEffect(() => {
    void getAgentToken().then(setToken);
  }, []);

  async function saveAndCheck(event: FormEvent) {
    event.preventDefault();
    setStatus('checking');
    const result = await checkAgentHealth(token);
    if (result.ok) await saveAgentToken(token.trim());
    setStatus(result);
  }

  const statusMessage = status === 'checking'
    ? t('agentChecking')
    : status?.ok
      ? t('agentConnected')
      : status?.reason === 'invalid-token'
        ? t('agentTokenInvalid')
        : status?.reason === 'unauthorized'
          ? t('agentUnauthorized')
          : status
            ? t('agentUnavailable')
            : '';

  return (
    <form className="section-card settings-group" onSubmit={(event) => void saveAndCheck(event)}>
      <div className="section-copy">
        <h3>{t('agentConnection')}</h3>
        <p>{t('agentServerIntro')}</p>
      </div>
      <label>
        {t('agentToken')}
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>
      <button type="submit" className="full-button" disabled={status === 'checking'}>
        {t('agentSaveAndTest')}
      </button>
      {statusMessage && (
        <p
          role={status !== 'checking' && !status?.ok ? 'alert' : 'status'}
          className={status !== 'checking' && !status?.ok ? 'error' : 'success'}
        >
          {statusMessage}
        </p>
      )}
    </form>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>('job');
  const [searchSection, setSearchSection] = useState<SearchSection>('rules');
  const [preferences, setPreferences] = useState<SyncedPreferences | null>(null);
  const [settings, setSettings] = useState<LocalFilterSettings | null>(null);
  const [dismissed, setDismissed] = useState<JobStateRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState | null>(null);
  const [origin, setOrigin] = useState<CommuteOrigin | null>(null);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [activeTabUrl, setActiveTabUrl] = useState('');
  const [contextVersion, setContextVersion] = useState(0);
  const [pageStatus, setPageStatus] = useState<PageStatus | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function refreshActiveTab() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    const tabId = tab?.id ?? null;
    setActiveTabId(tabId);
    setActiveTabUrl(tab?.url ?? '');
    setContextVersion((version) => version + 1);
    if (tabId === null) {
      setPageStatus(null);
      return;
    }
    try {
      await browser.tabs.sendMessage(tabId, { type: 'REFRESH_PAGE_STATUS' });
    } catch {
      if (/^https:\/\/(?:www\.seek\.co\.nz|nz\.seek\.com)\//.test(tab?.url ?? '')) {
        await browser.scripting.insertCSS({
          target: { tabId },
          files: ['content-scripts/seek.css'],
        }).catch(() => undefined);
        await browser.scripting.executeScript({
          target: { tabId },
          files: ['/content-scripts/seek.js'],
        }).catch(() => undefined);
        await browser.tabs.sendMessage(tabId, { type: 'REFRESH_PAGE_STATUS' })
          .catch(() => undefined);
      }
    }
    setPageStatus(await sendExtensionMessage({
      type: 'GET_PAGE_STATUS',
      payload: { tabId },
    }));
  }

  async function load() {
    setError('');
    try {
      const [nextPreferences, nextSettings, nextDismissed, nextDiagnostics, nextOrigin] =
        await Promise.all([
          sendExtensionMessage({ type: 'GET_PREFERENCES' }),
          sendExtensionMessage({ type: 'GET_FILTER_SETTINGS' }),
          sendExtensionMessage({ type: 'GET_DISMISSED_JOBS' }),
          sendExtensionMessage({ type: 'GET_DIAGNOSTICS' }),
          sendExtensionMessage({ type: 'GET_COMMUTE_ORIGIN' }),
        ]);
      setRuntimeLocale(nextPreferences.locale);
      setPreferences(nextPreferences);
      setSettings(nextSettings);
      setDismissed(nextDismissed);
      setDiagnostics(nextDiagnostics);
      setOrigin(nextOrigin);
      await refreshActiveTab();
    } catch {
      setError(t('unknownError'));
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const listener = (message: unknown) => {
      if (typeof message !== 'object' || message === null || !('type' in message)) return;
      if (
        message.type === 'PAGE_STATUS_CHANGED' &&
        'payload' in message &&
        typeof message.payload === 'object' &&
        message.payload !== null &&
        'tabId' in message.payload &&
        message.payload.tabId === activeTabId &&
        activeTabId !== null
      ) {
        void sendExtensionMessage({
          type: 'GET_PAGE_STATUS',
          payload: { tabId: activeTabId },
        }).then((status) => {
          setPageStatus(status);
          setContextVersion((version) => version + 1);
        });
      } else if (message.type === 'JOB_STATES_CHANGED') {
        void sendExtensionMessage({ type: 'GET_DISMISSED_JOBS' }).then(setDismissed);
      }
    };
    const onActivated = () => void refreshActiveTab();
    const onUpdated: Parameters<typeof browser.tabs.onUpdated.addListener>[0] = (
      tabId,
      change,
    ) => {
      if (tabId === activeTabId && (change.url || change.status === 'complete')) {
        void refreshActiveTab();
      }
    };
    browser.runtime.onMessage.addListener(listener);
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [activeTabId]);

  async function savePreferences(next: SyncedPreferences) {
    const saved = await sendExtensionMessage({
      type: 'SET_PREFERENCES',
      payload: next,
    });
    setRuntimeLocale(saved.locale);
    setPreferences(saved);
  }

  async function saveSettings(next: LocalFilterSettings) {
    setSettings(await sendExtensionMessage({
      type: 'SET_FILTER_SETTINGS',
      payload: next,
    }));
  }

  async function restore(keys: string[]) {
    await Promise.all(keys.map((jobKey) =>
      sendExtensionMessage({ type: 'RESTORE_JOB', payload: { jobKey } }),
    ));
    setDismissed((jobs) => jobs.filter(({ key }) => !keys.includes(key)));
  }

  async function showHidden(show: boolean) {
    if (activeTabId === null || !pageStatus) return;
    await browser.tabs.sendMessage(activeTabId, {
      type: 'SET_SHOW_HIDDEN',
      payload: { show },
    });
    setPageStatus({ ...pageStatus, showHidden: show });
  }

  async function clearLocalData() {
    await sendExtensionMessage({ type: 'CLEAR_LOCAL_DATA' });
    const [nextSettings, nextDiagnostics] = await Promise.all([
      sendExtensionMessage({ type: 'GET_FILTER_SETTINGS' }),
      sendExtensionMessage({ type: 'GET_DIAGNOSTICS' }),
    ]);
    setSettings(nextSettings);
    setDiagnostics(nextDiagnostics);
    setDismissed([]);
    setOrigin(null);
  }

  if (!loaded) return <main><p>{t('loading')}</p></main>;
  if (error || !preferences || !settings || !diagnostics) {
    return (
      <main>
        <p role="alert" className="error">{error || t('unknownError')}</p>
        <button type="button" onClick={() => void load()}>{t('retry')}</button>
      </main>
    );
  }

  const pages: Array<[Page, TranslationKey]> = [
    ['job', 'navJob'],
    ['library', 'navProfile'],
    ['search', 'navSearch'],
    ['settings', 'navSettings'],
  ];
  const onSeek = pageStatus !== null || /^https:\/\/(?:www\.seek\.co\.nz|nz\.seek\.com)\//.test(activeTabUrl);
  return (
    <main className="app-shell">
      <header className="product-header">
        <div className="brand-lockup">
          <img src="/icon-48.png" width="34" height="34" alt="" />
          <div>
            <h1>{t('appName')}</h1>
          </div>
        </div>
        <span className={`context-badge ${onSeek ? 'connected' : ''}`}>
          <span aria-hidden="true" />
          {t(onSeek ? 'seekConnected' : 'waitingForSeek')}
        </span>
      </header>
      <div className="product-content">
        {page === 'job' && (
          <div className="job-workspace">
            <AgentPage
              activeTabId={activeTabId}
              contextVersion={contextVersion}
              onOpenSettings={() => setPage('settings')}
            />
          </div>
        )}
        {page === 'search' && (
          <SearchWorkspace
            section={searchSection}
            settings={settings}
            dismissed={dismissed}
            origin={origin}
            status={pageStatus}
            tabId={activeTabId}
            onSection={setSearchSection}
            onSettings={saveSettings}
            onRestore={restore}
            onShowHidden={showHidden}
            onOrigin={async (nextOrigin) => {
              setOrigin(nextOrigin);
              setSettings(await sendExtensionMessage({ type: 'GET_FILTER_SETTINGS' }));
            }}
          />
        )}
        {page === 'library' && (
          <LibraryPage onOpenSettings={() => setPage('settings')} />
        )}
        {page === 'settings' && (
          <SettingsPage
            preferences={preferences}
            settings={settings}
            diagnostics={diagnostics}
            origin={origin}
            onPreferences={savePreferences}
            onSettings={saveSettings}
            onDebugLogging={async (enabled) => {
              setDiagnostics(await sendExtensionMessage({
                type: 'SET_DEBUG_LOGGING', payload: { enabled },
              }));
            }}
            onImportOrigin={async (imported) => {
              setOrigin(await sendExtensionMessage({
                type: 'SET_MANUAL_ORIGIN',
                payload: {
                  label: imported.label,
                  latitude: imported.latitude,
                  longitude: imported.longitude,
                  uncertaintyKm: imported.uncertaintyKm,
                },
              }));
              setSettings(await sendExtensionMessage({ type: 'GET_FILTER_SETTINGS' }));
            }}
            onClear={clearLocalData}
          />
        )}
      </div>
      <nav className="primary-nav" aria-label={t('appName')}>
        {pages.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={page === id ? 'active' : ''}
            aria-current={page === id ? 'page' : undefined}
            onClick={() => setPage(id)}
          >
            <NavIcon page={id} />
            <span>{t(label)}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
