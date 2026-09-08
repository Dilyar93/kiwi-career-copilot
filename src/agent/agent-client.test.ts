import { describe, expect, it, vi } from 'vitest';
import { analyseJob, checkAgentHealth, continueAnalysis } from './agent-client';

const job = {
  schemaVersion: 1 as const,
  source: 'seek-nz' as const,
  externalId: '90000001',
  canonicalUrl: 'https://nz.seek.com/job/90000001',
  applicationUrl: null,
  title: 'Graduate Developer',
  company: 'Example Systems',
  location: 'Wellington',
  employmentType: 'Full time',
  salaryText: null,
  description: 'Build TypeScript applications.',
  postedAt: null,
  postedAtText: null,
  closesAt: null,
  closesAtText: null,
  extractedAt: '2026-09-05T00:00:00Z',
  extractionWarnings: [],
};

const analysis = {
  analysis_id: 'ce3c5e3d-3912-47b1-9307-1c70f090da18',
  status: 'completed',
  recommendation: {
    recommendation: 'APPLY', fit: 'HIGH', readiness: 'MEDIUM',
    hard_blockers: [], strong_matches: [], partial_matches: [], gaps: [], unknowns: [],
    clarification_questions: [], cv_action: 'TAILOR', cover_letter_action: 'GENERATE',
    next_actions: ['Tailor the CV.'], termination_reason: 'completed',
  },
  tool_events: [],
  usage: { model_calls: 1, tool_calls: 0, input_tokens: 10, output_tokens: 20, cost_usd: null },
  created_at: '2026-09-05T00:00:00Z',
  model: 'function:test',
  prompt_version: 'career-analysis-v3',
};

describe('local agent health client', () => {
  it('distinguishes a healthy server, bad token, and unavailable server', async () => {
    const token = 'test-token-that-is-at-least-32-characters';
    const healthy = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        status: 'ok',
        service: 'jobfilter-agent',
        api_version: 1,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const unauthorized = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{}', { status: 401 }),
    );
    const unavailable = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));

    await expect(checkAgentHealth(token, healthy)).resolves.toEqual({ ok: true });
    await expect(checkAgentHealth('short', healthy)).resolves.toEqual({
      ok: false,
      reason: 'invalid-token',
    });
    await expect(checkAgentHealth(token, unauthorized)).resolves.toEqual({
      ok: false,
      reason: 'unauthorized',
    });
    await expect(checkAgentHealth(token, unavailable)).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('submits a validated job with extension authentication', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify(analysis),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    await expect(analyseJob(
      'test-token-that-is-at-least-32-characters', job, 'graduate', fetcher,
    )).resolves.toEqual(analysis);
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/v1/analyses',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ job, jobMode: 'graduate' }),
      }),
    );
  });

  it('maps safe service errors to user-facing failure reasons', async () => {
    const cases = [
      [409, 'LIBRARY_EMPTY', 'library-empty'],
      [429, 'AGENT_STEP_LIMIT', 'step-limit'],
      [504, 'AGENT_TIMEOUT', 'timeout'],
      [502, 'AGENT_MODEL_ERROR', 'model-error'],
      [502, 'AGENT_OUTPUT_INVALID', 'output-invalid'],
      [422, 'VALIDATION_ERROR', 'invalid-job'],
    ] as const;

    for (const [status, serviceCode, expected] of cases) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
        JSON.stringify({ error: { code: serviceCode, message: 'Safe service message' } }),
        { status, headers: { 'Content-Type': 'application/json' } },
      ));
      await expect(analyseJob(
        'test-token-that-is-at-least-32-characters', job, 'graduate', fetcher,
      )).rejects.toMatchObject({ code: expected });
    }
  });

  it('reports real streamed tool activity before returning the result', async () => {
    const progress: string[] = [];
    const toolEvent = {
      sequence: 1,
      tool_name: 'check_application_history',
      arguments: { jobIdentity: 'seek-nz:90000001' },
      result: { found: false },
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response([
      JSON.stringify({ type: 'status', stage: 'planning' }),
      JSON.stringify({ type: 'tool', event: toolEvent }),
      JSON.stringify({ type: 'result', analysis: { ...analysis, tool_events: [toolEvent] } }),
      '',
    ].join('\n'), {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    }));

    await expect(analyseJob(
      'test-token-that-is-at-least-32-characters', job, 'graduate', fetcher,
      (event) => progress.push(event.type === 'tool' ? event.toolName : event.type),
    )).resolves.toMatchObject({ analysis_id: analysis.analysis_id });
    expect(progress).toEqual(['planning', 'check_application_history']);
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/v1/analyses?stream=true',
      expect.anything(),
    );
  });

  it('submits current-job clarification answers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify(analysis),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const answers = [{ question: 'How many hours?', answer: '30 per week' }];
    await expect(continueAnalysis(
      'test-token-that-is-at-least-32-characters', analysis.analysis_id, answers, fetcher,
    )).resolves.toEqual(analysis);
    expect(fetcher).toHaveBeenCalledWith(
      `http://127.0.0.1:8765/v1/analyses/${analysis.analysis_id}/continue`,
      expect.objectContaining({ body: JSON.stringify({ answers }) }),
    );
  });
});
