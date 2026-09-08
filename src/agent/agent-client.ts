import { z } from 'zod';
import { browser } from 'wxt/browser';
import { JobPostingSchema, type JobPosting } from '../core/jobs/job-posting';

export const AGENT_BASE_URL = 'http://127.0.0.1:8765';
export const AGENT_TOKEN_KEY = 'agentConnectionToken';
export const AgentTokenSchema = z.string().trim().min(32).max(512);

const AgentHealthSchema = z.strictObject({
  status: z.literal('ok'),
  service: z.literal('jobfilter-agent'),
  api_version: z.literal(1),
});

const FindingSchema = z.strictObject({
  category: z.enum([
    'work_rights',
    'availability',
    'history',
    'skills',
    'experience',
    'education',
    'other',
  ]),
  summary: z.string().trim().min(1).max(500),
  source_refs: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
});

export const RecommendationSchema = z.strictObject({
  recommendation: z.enum(['APPLY', 'MAYBE', 'SKIP']),
  fit: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  readiness: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  hard_blockers: z.array(FindingSchema),
  strong_matches: z.array(FindingSchema),
  partial_matches: z.array(FindingSchema),
  gaps: z.array(FindingSchema),
  unknowns: z.array(FindingSchema),
  clarification_questions: z.array(z.string().trim().min(1).max(500)).max(20),
  cv_action: z.enum(['KEEP', 'TAILOR', 'DO_NOT_GENERATE']),
  cover_letter_action: z.enum(['GENERATE', 'OPTIONAL', 'DO_NOT_GENERATE']),
  next_actions: z.array(z.string()),
  termination_reason: z.enum([
    'completed',
    'hard_blocker',
    'needs_clarification',
    'duplicate',
  ]),
});

const ToolEventSchema = z.strictObject({
  sequence: z.number().int().positive(),
  tool_name: z.enum([
    'get_candidate_claims',
    'check_application_history',
    'search_candidate_documents',
    'open_candidate_source',
  ]),
  arguments: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()),
});

export const AgentAnalysisSchema = z.strictObject({
  analysis_id: z.uuid(),
  status: z.literal('completed'),
  recommendation: RecommendationSchema,
  tool_events: z.array(ToolEventSchema),
  usage: z.strictObject({
    model_calls: z.number().int().nonnegative(),
    tool_calls: z.number().int().nonnegative(),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cost_usd: z.string().nullable(),
  }),
  created_at: z.iso.datetime(),
  model: z.string().trim().min(1).max(200),
  prompt_version: z.literal('career-analysis-v3'),
});

export type AgentAnalysis = z.infer<typeof AgentAnalysisSchema>;
export type AgentJobMode = 'internship' | 'graduate' | 'part-time' | 'full-time' | 'summer';
export type ApplicationStatus = 'analysed' | 'preparing' | 'maybe' | 'skipped' | 'applied' | 'archived';
export type AgentClarificationAnswer = { question: string; answer: string };
export type AgentProgress =
  | { type: 'planning' }
  | { type: 'tool'; toolName: AgentAnalysis['tool_events'][number]['tool_name'] };

const ShortTextSchema = z.string().trim().min(1).max(500);
const IdentifierSchema = z.string().trim().min(1).max(200)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

export const CandidateSourceSummarySchema = z.strictObject({
  id: IdentifierSchema,
  fileName: ShortTextSchema,
  mediaType: ShortTextSchema,
  sizeBytes: z.number().int().positive().max(2 * 1024 * 1024),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(['cv', 'visa', 'project', 'certificate', 'education', 'portfolio', 'other']),
  purposeTags: z.array(IdentifierSchema).max(20),
  sensitivity: z.enum(['standard', 'personal', 'highly-sensitive']),
  summary: ShortTextSchema,
  status: z.enum(['processing', 'ready', 'needs-attention']),
  importedAt: z.iso.datetime(),
});

export const CandidateSourceMetadataUpdateSchema = z.strictObject({
  kind: CandidateSourceSummarySchema.shape.kind,
  purposeTags: z.array(IdentifierSchema).max(20),
  sensitivity: CandidateSourceSummarySchema.shape.sensitivity,
});

export const CandidateSourceClaimSchema = z.strictObject({
  id: IdentifierSchema,
  sourceId: IdentifierSchema,
  fileName: ShortTextSchema,
  category: z.enum([
    'identity', 'contact', 'skill', 'experience', 'project', 'education',
    'work-rights', 'availability', 'certification', 'achievement', 'preference', 'other',
  ]),
  key: IdentifierSchema,
  title: ShortTextSchema,
  statement: z.string().trim().min(1).max(2_000),
  attributes: z.record(IdentifierSchema, ShortTextSchema),
  sourceText: z.string().trim().min(1).max(2_000),
  sourceRef: IdentifierSchema,
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  confidence: z.enum(['high', 'medium', 'low']),
  exclusive: z.boolean(),
  extractedAt: z.iso.datetime(),
});

export const CandidateClaimConflictSchema = z.strictObject({
  id: IdentifierSchema,
  key: IdentifierSchema,
  title: ShortTextSchema,
  claims: z.array(CandidateSourceClaimSchema).min(2).max(20),
});

export const CandidateLibrarySchema = z.strictObject({
  sources: z.array(CandidateSourceSummarySchema).max(100).default([]),
  conflicts: z.array(CandidateClaimConflictSchema).max(100).default([]),
});
const CandidateSourceDocumentSchema = z.strictObject({
  fileName: ShortTextSchema,
  contentBase64: z.string().min(1).max(3_000_000),
});

export type CandidateLibrary = z.infer<typeof CandidateLibrarySchema>;
export type CandidateSourceSummary = z.infer<typeof CandidateSourceSummarySchema>;
export type CandidateSourceMetadataUpdate = z.infer<typeof CandidateSourceMetadataUpdateSchema>;
export type CandidateSourceClaim = z.infer<typeof CandidateSourceClaimSchema>;
export type CandidateClaimConflict = z.infer<typeof CandidateClaimConflictSchema>;

export const CandidateSourceIngestResultSchema = z.strictObject({
  source: CandidateSourceSummarySchema,
  conflicts: z.array(CandidateClaimConflictSchema).max(100),
  warnings: z.array(z.enum([
    'pdf-pages-without-text',
    'source-understanding-failed',
    'duplicate-source',
  ])).max(3),
});

export type CandidateSourceIngestResult = z.infer<typeof CandidateSourceIngestResultSchema>;

const ApplicationSummarySchema = z.strictObject({
  job_identity: z.string().min(1),
  status: z.enum(['analysed', 'preparing', 'maybe', 'skipped', 'applied', 'archived']),
  job_mode: z.enum(['internship', 'graduate', 'part-time', 'full-time', 'summer']),
  latest_analysis_id: z.string().min(1),
  updated_at: z.iso.datetime(),
});

export const AgentMaterialsSchema = z.strictObject({
  material_id: z.string().min(1),
  analysis_id: z.string().min(1),
  job_identity: z.string().min(1),
  cv_change_plan: z.strictObject({
    analysis_id: z.string().min(1),
    selected_source_refs: z.array(z.string().min(1)),
    base_source_id: z.string().min(1).nullable(),
    emphasized_skills: z.array(z.string().min(1)),
    changes: z.array(z.string().min(1)),
  }).nullable(),
  cv_html: z.string().min(1).max(200_000).nullable(),
  cover_letter: z.strictObject({
    text: z.string().min(1).max(200_000),
    source_refs: z.array(z.string().min(1)),
  }).nullable(),
  generated_at: z.iso.datetime(),
});

export type AgentMaterials = z.infer<typeof AgentMaterialsSchema>;

export type AgentHealthResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-token' | 'unauthorized' | 'unavailable' };

export type AgentApiErrorCode =
  | 'invalid-token'
  | 'unauthorized'
  | 'library-empty'
  | 'step-limit'
  | 'timeout'
  | 'output-invalid'
  | 'model-error'
  | 'invalid-job'
  | 'clarification-invalid'
  | 'import-unsupported'
  | 'import-too-large'
  | 'import-no-text'
  | 'import-unreadable'
  | 'import-timeout'
  | 'import-limit'
  | 'import-model-error'
  | 'rejected'
  | 'unavailable';

export class AgentApiError extends Error {
  constructor(readonly code: AgentApiErrorCode) {
    super(code);
  }
}

const AgentErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
  }),
});

const ClarificationAnswersSchema = z.array(z.strictObject({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(2_000),
})).min(1).max(20);

const AnalysisStreamEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status'), stage: z.literal('planning') }),
  z.strictObject({ type: z.literal('tool'), event: ToolEventSchema }),
  z.strictObject({ type: z.literal('result'), analysis: AgentAnalysisSchema }),
  z.strictObject({ type: z.literal('error'), error: AgentErrorResponseSchema.shape.error }),
]);

function requestHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Jobfilter-Token': token,
    'X-Jobfilter-Extension-Id': browser.runtime.id,
  };
}

export async function getAgentToken(): Promise<string> {
  const stored = await browser.storage.local.get(AGENT_TOKEN_KEY);
  const parsed = AgentTokenSchema.safeParse(stored[AGENT_TOKEN_KEY]);
  return parsed.success ? parsed.data : '';
}

export async function saveAgentToken(token: string): Promise<void> {
  await browser.storage.local.set({
    [AGENT_TOKEN_KEY]: AgentTokenSchema.parse(token),
  });
}

export async function checkAgentHealth(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<AgentHealthResult> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) return { ok: false, reason: 'invalid-token' };

  try {
    const response = await fetcher(`${AGENT_BASE_URL}/health`, {
      headers: requestHeaders(parsedToken.data),
      signal: AbortSignal.timeout(2_000),
    });
    if (response.status === 401) return { ok: false, reason: 'unauthorized' };
    if (!response.ok || !AgentHealthSchema.safeParse(await response.json()).success) {
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function analyseJob(
  token: string,
  job: JobPosting,
  jobMode: AgentJobMode,
  fetcher: typeof fetch = fetch,
  onProgress?: (progress: AgentProgress) => void,
): Promise<AgentAnalysis> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new AgentApiError('invalid-token');
  const parsedJob = JobPostingSchema.parse(job);

  let response: Response;
  try {
    response = await fetcher(`${AGENT_BASE_URL}/v1/analyses${onProgress ? '?stream=true' : ''}`, {
      method: 'POST',
      headers: requestHeaders(parsedToken.data),
      body: JSON.stringify({ job: parsedJob, jobMode }),
    });
  } catch {
    throw new AgentApiError('unavailable');
  }
  try {
    if (onProgress && response.ok && response.headers.get('Content-Type')?.includes('application/x-ndjson')) {
      return await readAnalysisStream(response, onProgress);
    }
    return await readAnalysisResponse(response);
  } catch (cause) {
    if (cause instanceof AgentApiError) throw cause;
    throw new AgentApiError('unavailable');
  }
}

async function readAnalysisResponse(response: Response): Promise<AgentAnalysis> {
  if (response.status === 401) throw new AgentApiError('unauthorized');
  if (!response.ok) {
    const body = AgentErrorResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    throw body.success ? mappedError(body.data.error.code) : new AgentApiError('unavailable');
  }
  const parsed = AgentAnalysisSchema.safeParse(await response.json());
  if (!parsed.success) throw new AgentApiError('unavailable');
  return parsed.data;
}

async function readCandidateLibraryResponse(response: Response): Promise<CandidateLibrary> {
  if (response.status === 401) throw new AgentApiError('unauthorized');
  if (!response.ok) {
    const body = AgentErrorResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    throw body.success ? mappedError(body.data.error.code) : new AgentApiError('unavailable');
  }
  const parsed = CandidateLibrarySchema.safeParse(await response.json());
  if (!parsed.success) throw new AgentApiError('unavailable');
  return parsed.data;
}

function mappedError(code: string): AgentApiError {
  const errors: Record<string, AgentApiErrorCode> = {
    LIBRARY_EMPTY: 'library-empty',
    AGENT_STEP_LIMIT: 'step-limit',
    AGENT_TIMEOUT: 'timeout',
    AGENT_OUTPUT_INVALID: 'output-invalid',
    AGENT_MODEL_ERROR: 'model-error',
    VALIDATION_ERROR: 'invalid-job',
    ANALYSIS_NOT_FOUND: 'clarification-invalid',
    INVALID_CLARIFICATION: 'clarification-invalid',
    ANALYSIS_INPUTS_MISSING: 'clarification-invalid',
    CANDIDATE_FILE_UNSUPPORTED: 'import-unsupported',
    CANDIDATE_FILE_TOO_LARGE: 'import-too-large',
    CANDIDATE_FILE_NO_TEXT: 'import-no-text',
    CANDIDATE_FILE_UNREADABLE: 'import-unreadable',
    CANDIDATE_IMPORT_TIMEOUT: 'import-timeout',
    CANDIDATE_IMPORT_LIMIT: 'import-limit',
    CANDIDATE_IMPORT_MODEL_ERROR: 'import-model-error',
  };
  return new AgentApiError(errors[code] ?? 'unavailable');
}

async function readAnalysisStream(
  response: Response,
  onProgress: (progress: AgentProgress) => void,
): Promise<AgentAnalysis> {
  if (!response.body) throw new AgentApiError('unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: AgentAnalysis | null = null;

  const readLine = (line: string) => {
    if (!line.trim()) return;
    const parsed = AnalysisStreamEventSchema.safeParse(JSON.parse(line));
    if (!parsed.success) throw new AgentApiError('unavailable');
    const event = parsed.data;
    if (event.type === 'status') onProgress({ type: 'planning' });
    if (event.type === 'tool') onProgress({ type: 'tool', toolName: event.event.tool_name });
    if (event.type === 'result') result = event.analysis;
    if (event.type === 'error') throw mappedError(event.error.code);
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(readLine);
    if (done) break;
  }
  readLine(buffer);
  if (!result) throw new AgentApiError('unavailable');
  return result;
}

export async function continueAnalysis(
  token: string,
  analysisId: string,
  answers: AgentClarificationAnswer[],
  fetcher: typeof fetch = fetch,
  onProgress?: (progress: AgentProgress) => void,
): Promise<AgentAnalysis> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new AgentApiError('invalid-token');
  const parsedAnswers = ClarificationAnswersSchema.parse(answers);
  let response: Response;
  try {
    response = await fetcher(
      `${AGENT_BASE_URL}/v1/analyses/${encodeURIComponent(analysisId)}/continue${
        onProgress ? '?stream=true' : ''
      }`,
      {
        method: 'POST',
        headers: requestHeaders(parsedToken.data),
        body: JSON.stringify({ answers: parsedAnswers }),
      },
    );
  } catch {
    throw new AgentApiError('unavailable');
  }
  try {
    if (onProgress && response.ok && response.headers.get('Content-Type')?.includes('application/x-ndjson')) {
      return await readAnalysisStream(response, onProgress);
    }
    return await readAnalysisResponse(response);
  } catch (cause) {
    if (cause instanceof AgentApiError) throw cause;
    throw new AgentApiError('unavailable');
  }
}

export async function getCandidateLibrary(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<CandidateLibrary> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new AgentApiError('invalid-token');
  try {
    const response = await fetcher(`${AGENT_BASE_URL}/v1/candidate-library`, {
      headers: requestHeaders(parsedToken.data),
      signal: AbortSignal.timeout(5_000),
    });
    return await readCandidateLibraryResponse(response);
  } catch (cause) {
    if (cause instanceof AgentApiError) throw cause;
    throw new AgentApiError('unavailable');
  }
}

export async function addCandidateSource(
  token: string,
  fileName: string,
  contentBase64: string,
  fetcher: typeof fetch = fetch,
): Promise<CandidateSourceIngestResult> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new AgentApiError('invalid-token');
  const body = CandidateSourceDocumentSchema.parse({ fileName, contentBase64 });
  try {
    const response = await fetcher(`${AGENT_BASE_URL}/v1/candidate-sources`, {
      method: 'POST',
      headers: requestHeaders(parsedToken.data),
      body: JSON.stringify(body),
    });
    if (response.status === 401) throw new AgentApiError('unauthorized');
    if (!response.ok) {
      const error = AgentErrorResponseSchema.safeParse(await response.json().catch(() => null));
      throw error.success ? mappedError(error.data.error.code) : new AgentApiError('unavailable');
    }
    const parsed = CandidateSourceIngestResultSchema.safeParse(await response.json());
    if (!parsed.success) throw new AgentApiError('unavailable');
    return parsed.data;
  } catch (cause) {
    if (cause instanceof AgentApiError) throw cause;
    throw new AgentApiError('unavailable');
  }
}

export async function updateCandidateSource(
  token: string,
  sourceId: string,
  update: CandidateSourceMetadataUpdate,
  fetcher: typeof fetch = fetch,
): Promise<CandidateSourceSummary> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new AgentApiError('invalid-token');
  const parsedUpdate = CandidateSourceMetadataUpdateSchema.parse(update);
  try {
    const response = await fetcher(
      `${AGENT_BASE_URL}/v1/candidate-sources/${encodeURIComponent(sourceId)}`,
      {
        method: 'PATCH',
        headers: requestHeaders(parsedToken.data),
        body: JSON.stringify(parsedUpdate),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new AgentApiError(response.status < 500 ? 'rejected' : 'unavailable');
    const parsed = CandidateSourceSummarySchema.safeParse(await response.json());
    if (!parsed.success) throw new AgentApiError('unavailable');
    return parsed.data;
  } catch (cause) {
    if (cause instanceof AgentApiError) throw cause;
    throw new AgentApiError('unavailable');
  }
}

export async function reprocessCandidateSource(
  token: string,
  sourceId: string,
  fetcher: typeof fetch = fetch,
): Promise<CandidateSourceIngestResult> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new AgentApiError('invalid-token');
  try {
    const response = await fetcher(
      `${AGENT_BASE_URL}/v1/candidate-sources/${encodeURIComponent(sourceId)}/reprocess`,
      {
        method: 'POST',
        headers: requestHeaders(parsedToken.data),
        body: '{}',
      },
    );
    if (!response.ok) throw new AgentApiError(response.status < 500 ? 'rejected' : 'unavailable');
    const parsed = CandidateSourceIngestResultSchema.safeParse(await response.json());
    if (!parsed.success) throw new AgentApiError('unavailable');
    return parsed.data;
  } catch (cause) {
    if (cause instanceof AgentApiError) throw cause;
    throw new AgentApiError('unavailable');
  }
}

export async function getCandidateSourceContent(
  token: string,
  sourceId: string,
  fetcher: typeof fetch = fetch,
): Promise<Blob> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new AgentApiError('invalid-token');
  try {
    const response = await fetcher(
      `${AGENT_BASE_URL}/v1/candidate-sources/${encodeURIComponent(sourceId)}/content`,
      { headers: requestHeaders(parsedToken.data), signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) throw new AgentApiError(response.status < 500 ? 'rejected' : 'unavailable');
    return await response.blob();
  } catch (cause) {
    if (cause instanceof AgentApiError) throw cause;
    throw new AgentApiError('unavailable');
  }
}

export async function deleteCandidateSource(
  token: string,
  sourceId: string,
  fetcher: typeof fetch = fetch,
): Promise<CandidateLibrary> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new AgentApiError('invalid-token');
  try {
    const response = await fetcher(
      `${AGENT_BASE_URL}/v1/candidate-sources/${encodeURIComponent(sourceId)}`,
      {
        method: 'DELETE',
        headers: requestHeaders(parsedToken.data),
        signal: AbortSignal.timeout(10_000),
      },
    );
    return await readCandidateLibraryResponse(response);
  } catch (cause) {
    if (cause instanceof AgentApiError) throw cause;
    throw new AgentApiError('unavailable');
  }
}

export async function resolveCandidateConflict(
  token: string,
  conflictId: string,
  selectedClaimId: string | null,
  fetcher: typeof fetch = fetch,
): Promise<CandidateLibrary> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new AgentApiError('invalid-token');
  try {
    const response = await fetcher(
      `${AGENT_BASE_URL}/v1/candidate-conflicts/${encodeURIComponent(conflictId)}/resolve`,
      {
        method: 'POST',
        headers: requestHeaders(parsedToken.data),
        body: JSON.stringify({ selectedClaimId }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    return await readCandidateLibraryResponse(response);
  } catch (cause) {
    if (cause instanceof AgentApiError) throw cause;
    throw new AgentApiError('unavailable');
  }
}

export async function clearCandidateLibrary(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<CandidateLibrary> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new AgentApiError('invalid-token');
  try {
    const response = await fetcher(`${AGENT_BASE_URL}/v1/candidate-library`, {
      method: 'DELETE',
      headers: requestHeaders(parsedToken.data),
      signal: AbortSignal.timeout(10_000),
    });
    return await readCandidateLibraryResponse(response);
  } catch (cause) {
    if (cause instanceof AgentApiError) throw cause;
    throw new AgentApiError('unavailable');
  }
}

export async function updateApplicationStatus(
  token: string,
  jobIdentity: string,
  status: ApplicationStatus,
  fetcher: typeof fetch = fetch,
): Promise<ApplicationStatus> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new AgentApiError('invalid-token');
  let response: Response;
  try {
    response = await fetcher(
      `${AGENT_BASE_URL}/v1/applications/${encodeURIComponent(jobIdentity)}`,
      {
        method: 'PATCH',
        headers: requestHeaders(parsedToken.data),
        body: JSON.stringify({ status }),
        signal: AbortSignal.timeout(5_000),
      },
    );
  } catch {
    throw new AgentApiError('unavailable');
  }
  if (response.status === 401) throw new AgentApiError('unauthorized');
  if (!response.ok) throw new AgentApiError(response.status < 500 ? 'rejected' : 'unavailable');
  const parsed = ApplicationSummarySchema.safeParse(await response.json());
  if (!parsed.success) throw new AgentApiError('unavailable');
  return parsed.data.status;
}

export async function generateMaterials(
  token: string,
  analysisId: string,
  fetcher: typeof fetch = fetch,
): Promise<AgentMaterials> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new AgentApiError('invalid-token');
  let response: Response;
  try {
    response = await fetcher(
      `${AGENT_BASE_URL}/v1/analyses/${encodeURIComponent(analysisId)}/materials`,
      {
        method: 'POST',
        headers: requestHeaders(parsedToken.data),
        body: '{}',
      },
    );
  } catch {
    throw new AgentApiError('unavailable');
  }
  if (response.status === 401) throw new AgentApiError('unauthorized');
  if (!response.ok) throw new AgentApiError(response.status < 500 ? 'rejected' : 'unavailable');
  const parsed = AgentMaterialsSchema.safeParse(await response.json());
  if (!parsed.success) throw new AgentApiError('unavailable');
  return parsed.data;
}

export async function getMaterials(
  token: string,
  analysisId: string,
  fetcher: typeof fetch = fetch,
): Promise<AgentMaterials> {
  const parsedToken = AgentTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new AgentApiError('invalid-token');
  let response: Response;
  try {
    response = await fetcher(
      `${AGENT_BASE_URL}/v1/analyses/${encodeURIComponent(analysisId)}/materials`,
      { headers: requestHeaders(parsedToken.data) },
    );
  } catch {
    throw new AgentApiError('unavailable');
  }
  if (response.status === 401) throw new AgentApiError('unauthorized');
  if (!response.ok) throw new AgentApiError(response.status < 500 ? 'rejected' : 'unavailable');
  const parsed = AgentMaterialsSchema.safeParse(await response.json());
  if (!parsed.success) throw new AgentApiError('unavailable');
  return parsed.data;
}
