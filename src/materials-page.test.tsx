// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import MaterialsPage from '../entrypoints/materials/MaterialsPage';
import { setRuntimeLocale } from './i18n';

const materials = {
  material_id: 'material-1',
  analysis_id: '72155ef0-4fd1-4c9c-b7cd-a5361f3899dc',
  job_identity: 'seek-nz:90000001',
  cv_change_plan: {
    analysis_id: '72155ef0-4fd1-4c9c-b7cd-a5361f3899dc',
    selected_source_refs: ['source.cv.record-1'],
    base_source_id: 'source.cv',
    emphasized_skills: ['TypeScript'],
    changes: ['Emphasise the relevant TypeScript project.'],
  },
  cv_html: '<!doctype html><html><body><main contenteditable="true" spellcheck="true">Targeted CV</main></body></html>',
  cover_letter: {
    text: 'Kia ora hiring team,\n\nI am applying for this role.',
    source_refs: ['source.cv.record-1'],
  },
  generated_at: '2026-09-05T00:02:00Z',
};

beforeEach(async () => {
  fakeBrowser.reset();
  setRuntimeLocale('en-NZ');
  await browser.storage.local.set({
    agentConnectionToken: 'test-token-that-is-at-least-32-characters',
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('loads saved materials into a full-page CV preview', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
    JSON.stringify(materials),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
  vi.stubGlobal('fetch', fetcher);

  render(<MaterialsPage analysisId={materials.analysis_id} />);

  expect(await screen.findByRole('heading', { name: 'Application materials' })).toBeTruthy();
  expect(screen.getByDisplayValue(/I am applying for this role/)).toBeTruthy();
  const preview = screen.getByTitle('Tailored CV');
  expect(preview.getAttribute('srcdoc')).toContain('Targeted CV');
  expect(preview.getAttribute('srcdoc')).not.toContain('contenteditable');
  expect(fetcher).toHaveBeenCalledWith(
    `http://127.0.0.1:8765/v1/analyses/${materials.analysis_id}/materials`,
    expect.objectContaining({ headers: expect.any(Object) }),
  );
});

it('shows a cover-letter-only bundle without requiring a CV', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(
    JSON.stringify({ ...materials, cv_change_plan: null, cv_html: null }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )));

  render(<MaterialsPage analysisId={materials.analysis_id} />);

  expect(await screen.findByDisplayValue(/I am applying for this role/)).toBeTruthy();
  expect(screen.queryByTitle('Tailored CV')).toBeNull();
  expect(screen.getByRole('button', { name: 'Download cover letter' })).toBeTruthy();
});
