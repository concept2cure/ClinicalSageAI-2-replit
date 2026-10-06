// @vitest-environment jsdom
/**
 * The readiness cover does not say "Assessed <date>" over an IND nothing has assessed.
 *
 * ── The finding (honest-state audit) ─────────────────────────────────────────
 * The hero deliverable of this surface — "IND Filing Readiness — 21 CFR 312.23",
 * the one with an Export control beside it — carried, in its cover metadata:
 *
 *     Assessed {new Date().toLocaleDateString(...)}
 *
 * rendered UNCONDITIONALLY. `new Date()` is the render timestamp, not a recorded
 * assessment run, so it read "Assessed <today>" whether or not any evaluation
 * had happened. On a freshly-provisioned IND with an empty checklist the verdict
 * pill correctly says NOT ASSESSED and the bar is 0% — yet the cover still
 * claimed the document had been assessed today. `R.assessed` is
 * `totalItems > 0` (fixtures/ind-lifecycle-data.ts): zero items is zero
 * evidence, never a finding of "assessed". The cover string was the one place on
 * the screen that ignored it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { IndLifecycle } from '../surfaces/IndLifecycle';
import { evaluateIndReadiness } from '../../../../../server/services/ind-lifecycle/ind-readiness-service';
import { getAllINDSections } from '../../../../../services/regulatory/ind-ectd-sections';

const publish = vi.hoisted(() => vi.fn());
vi.mock('../surfaceContext', () => ({ usePublishSurfaceContext: publish }));

const props = () => ({ surface: { id: 'ind-lifecycle' }, onAsk: vi.fn(), onNav: vi.fn() } as unknown as Parameters<typeof IndLifecycle>[0]);

/** A checklist row with the given forms/sections; empty = nothing to assess. */
function mockChecklist(forms: unknown[], sections: unknown[], readiness?: ReturnType<typeof evaluateIndReadiness>) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ind-checklist') {
      return {
        ok: true, status: 200,
        json: async () => ({
          data: [{
            projectId: 1, code: 'ZX-9', drugName: 'Zexanib', productName: 'ZX-9 First-in-Human',
            indication: null, sponsorName: 'Acme Bio', submissionType: 'IND',
            targetReceiptDate: null, forms, sections, readiness,
          }],
          meta: { count: 1 },
        }),
      } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

const FORM = { id: 'FDA_1571', title: 'Form FDA 1571', label: 'IND Application', ref: '21 CFR 312.23(a)(1)', done: true };

afterEach(cleanup);
beforeEach(() => { apiRequest.mockReset(); publish.mockReset(); });

describe('IndLifecycle — the readiness cover reflects whether anything was assessed', () => {
  it('an empty IND says NOT ASSESSED and does NOT date-stamp an assessment', async () => {
    mockChecklist([], []);
    render(<IndLifecycle {...props()} />);

    await waitFor(() => expect(screen.getByText(/NOT ASSESSED/i)).toBeTruthy());

    const body = document.body.textContent ?? '';
    // The false claim: "Assessed <today>" over a program with zero items.
    expect(/Assessed\s+\w+\s+\d/i.test(body), 'must not date-stamp an assessment that did not run').toBe(false);
    // …and it says what is true.
    expect(/Not yet assessed/i.test(body)).toBe(true);
  });

  it('a populated IND still shows the assessment date — the stamp stays reachable', async () => {
    // Over-correction guard: a real checklist reaches assessed=true, and the
    // cover must still carry the "Assessed <date>" stamp.
    mockChecklist([FORM], [], evaluateIndReadiness({ filingType: 'initial', sectionStatus: {}, completedForms: ['FDA_1571'] }));
    render(<IndLifecycle {...props()} />);

    await waitFor(() => expect(screen.queryByText(/NOT ASSESSED/i)).toBeNull());
    const body = document.body.textContent ?? '';
    expect(/Assessed\s+\w+\s+\d/i.test(body), 'a genuinely assessed IND keeps its date stamp').toBe(true);
    expect(/Not yet assessed/i.test(body)).toBe(false);
  });
});

describe('IND readiness comes from the server, including Ana context', () => {
  const section = { code: 'm3.2.S.1', title: 'General information', module: 'M3', ref: '', ai: false, status: 'approved' };
  const forms = ['FDA_1571', 'FDA_1572', 'FDA_3674'].map((id) => ({ ...FORM, id }));

  it('does not infer completeness from an old server returning only approved inventory', async () => {
    mockChecklist(forms, [section]);
    render(<IndLifecycle {...props()} />);
    await screen.findByText(/NOT ASSESSED/i);
    expect(screen.queryByText('READY TO FILE')).toBeNull();
    const context = publish.mock.calls.at(-1)?.[1];
    expect(context.facts.readyToFile).toBe(false);
    expect(context.facts.readinessAssessed).toBe(false);
  });

  it('shows missing requirements and gives Ana the identical server verdict', async () => {
    const report = evaluateIndReadiness({ filingType: 'initial', sectionStatus: { 'm3.2.S.1': 'approved' }, completedForms: forms.map((f) => f.id) });
    mockChecklist(forms, [section], report);
    render(<IndLifecycle {...props()} />);
    await screen.findByText('NOT YET FILEABLE');
    expect(screen.queryByText('READY TO FILE')).toBeNull();
    const context = publish.mock.calls.at(-1)?.[1];
    expect(context.facts.readyToFile).toBe(report.ready);
    expect(context.facts.readinessPercent).toBe(report.overallPercentage);
    expect(context.facts.requiredSections.total).toBe(report.requiredSections.total);
    expect(context.facts.requiredSections.incomplete).toEqual(report.requiredSections.incomplete);
  });

  it('retains READY TO FILE when the server has evaluated the complete required set', async () => {
    const report = evaluateIndReadiness({
      filingType: 'initial', completedForms: forms.map((f) => f.id),
      sectionStatus: Object.fromEntries(getAllINDSections().filter((s) => s.required).map((s) => [s.code, 'approved'])),
    });
    expect(report.ready).toBe(true);
    mockChecklist(forms, [section], report);
    render(<IndLifecycle {...props()} />);
    await screen.findByText('READY TO FILE');
    const context = publish.mock.calls.at(-1)?.[1];
    expect(context.facts.readyToFile).toBe(true);
    expect(context.facts.readinessPercent).toBe(100);
    expect(context.facts.requiredSections.incomplete).toEqual([]);
  });
});
