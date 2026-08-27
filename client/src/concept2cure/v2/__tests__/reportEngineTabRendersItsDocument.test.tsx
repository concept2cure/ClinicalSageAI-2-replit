// @vitest-environment jsdom
/**
 * The document header and the document body name the same document.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * ReportEngine.tsx:365 — the generated markdown was chosen by a two-branch
 * ternary written when DOC_REGISTRY held exactly three entries:
 *
 *   docType === 'recommendations' ? genRecommendations(...)
 *     : docType === 'statistical' ? genStatisticalInsights(a)
 *       : genIndReadiness(a);
 *
 * Three more document types were later added behind the clinical-regulatory
 * graph flag — "Evidence chain", "Design risk", "Regulatory precedent" — each
 * with its own `gen` in the registry, and the ternary was not touched. So all
 * three fell into the `else`: the header bar relabelled to the chosen document
 * and the IND Readiness memo rendered underneath it, complete with its FDA/EMA
 * citations. A document titled as one thing over the prose of another is worse
 * than an empty tab, because it reads as a finished deliverable.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * That each tab's registered generator is the one that produced what is on the
 * page — every governed evidence tab renders its OWN document and specifically
 * NOT the IND Readiness text, and the three original tabs are unchanged.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
// The three governed evidence documents are only offered with the graph on.
vi.mock('../clinicalRegulatoryGraphFlag', () => ({
  isClinicalRegulatoryGraphEnabled: () => true,
}));

import { ReportEngine } from '../surfaces/ReportEngine';

const PROTOCOL = [
  'Title: BX-204 pivotal study in type 1 diabetes',
  'Indication: Type 1 diabetes',
  'Phase: 3',
  'Sample size: 412',
  '52 weeks',
  'Primary endpoint: Time in range at week 52',
].join('\n');

/** The one line only the IND Readiness generator emits. */
const IND_ONLY = /IND Readiness Assessment/;

function doc(): string {
  return document.querySelector('.bs-doc-render')?.textContent || '';
}
function header(): string {
  return document.querySelector('.bs-doc-kind')?.textContent || '';
}

function mountAndAnalyze() {
  render(<ReportEngine surface={{ id: 'report-engine', label: 'Reporting' } as never}
    onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
  fireEvent.change(screen.getByLabelText(/Protocol synopsis/), { target: { value: PROTOCOL } });
  fireEvent.click(screen.getByRole('button', { name: /Analyze protocol/ }));
}

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  // Only the CSR-library panel reads; the analysis runs locally (no auth token).
  apiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: null }) });
});

describe('ReportEngine — the tab you chose is the document you get', () => {
  it.each([
    ['Evidence chain', /Evidence chain/, /Sources, calculations|governed evidence report/],
    ['Design risk', /Design risk/, /governed evidence report/],
    ['Regulatory precedent', /Regulatory precedent/, /governed evidence report/],
  ])('%s renders its own document, not the IND Readiness memo', async (tab, head, bodyRe) => {
    mountAndAnalyze();
    await waitFor(() => expect(doc()).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: tab }));

    await waitFor(() => expect(doc()).toMatch(bodyRe));
    expect(header()).toMatch(head);
    // The whole point: the body is NOT the else-branch document.
    expect(doc()).not.toMatch(IND_ONLY);
    expect(doc()).not.toMatch(/Improvement Areas/);
  });

  it('keeps the three original tabs on their own generators', async () => {
    mountAndAnalyze();
    await waitFor(() => expect(doc()).toMatch(/Protocol Design Recommendations/));

    fireEvent.click(screen.getByRole('button', { name: 'Statistical Insights' }));
    await waitFor(() => expect(doc()).toMatch(/Statistical Analysis Insights/));
    expect(doc()).not.toMatch(IND_ONLY);

    fireEvent.click(screen.getByRole('button', { name: 'IND Readiness' }));
    await waitFor(() => expect(doc()).toMatch(IND_ONLY));
    expect(header()).toMatch(/IND Readiness/);
  });
});
