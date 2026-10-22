// @vitest-environment jsdom
/**
 * Dispatch readiness — a gate that did not run is "not assessed", not
 * "Satisfied" (populated-org sweep, 2026-09-28).
 *
 * With no agency-grade validator configured and ECTD_REQUIRE_EVALIDATOR off,
 * the external gate adds no blocker. The screen read "The agency-grade
 * validator's report for this package carries no errors — Satisfied." over a
 * package no validator had seen. The server now says why the gate cleared
 * (`notAssessed`); the card says that.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DispatchReadiness } from '../surfaces/DispatchReadiness';
import { useActiveSurfaceContext, toModuleContext } from '../surfaceContext';

function AnaContextProbe() {
  const context = useActiveSurfaceContext('dispatch-readiness');
  return <pre data-testid="ana-wire-context">{JSON.stringify(toModuleContext(context))}</pre>;
}

const PROGRAM_UUID = '5b1c2d3e-0000-4000-8000-000000000009';
const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data: payload }) }) as Response;
const rule = (id: string, title: string) => ({ id, title, category: 'integrity', regions: ['ich'], severity: 'high', source: 's', enforcement: 'dispatch-readiness', enforcementStatement: 'e' });
const NOTE = 'No agency-grade validator is configured on this installation, so no report exists for this package. It is not required here, so it does not block dispatch — but the package has not been checked against it.';

const assessment = (external: Record<string, unknown>, validation: Record<string, unknown> = {}) => ({
  sequenceId: 12, region: 'fda', sequenceStatus: 'validated', validationErrors: 0, unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1, shadowReviewMissing: false, leafCount: 6,
  externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [], ...validation },
  releaseSignature: { required: false, verdict: 'not-required', cleared: true },
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] },
  gate: { cleared: true, blockers: [] },
  gates: [
    { key: 'structural', cleared: true, blockers: [], rule: rule('STRUCTURAL_GATE_CLEAR', 'No open error-severity finding') },
    { key: 'external', cleared: true, blockers: [], rule: rule('EXTERNAL_VALIDATION_CLEAN', 'External validation result and dispatch policy are assessed'), ...external },
    { key: 'shadowPresence', cleared: true, blockers: [], rule: rule('SHADOW_REVIEW_COMPLETED', 'At least one Shadow Review has completed') },
    { key: 'releaseSignature', cleared: true, blockers: [], rule: rule('RELEASE_SIGNATURE_VALID', 'A valid release signature') },
  ],
});

function serve(a: unknown) {
  apiRequest.mockImplementation(async (_m: string, rawUrl: unknown) => {
    const url = String(rawUrl ?? '');
    if (url === `/api/c2c/projects/${PROGRAM_UUID}`) {
      return { ok: true, status: 200, json: async () => ({ id: PROGRAM_UUID, name: 'BX-512 IND', code: 'BX-512', product_name: 'Vorelinib', program_type: 'ind' }) } as Response;
    }
    // F18: the screen reads the project's scoped list (each market), never the organisation's.
    if (url === `/api/submissions?programId=${PROGRAM_UUID}`) {
      return ok([{ id: 4, title: 'BX-512 IND', productName: 'Vorelinib', applicationType: 'ind', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: PROGRAM_UUID }]);
    }
    if (url === '/api/submissions/4/sequences') return ok([{ id: 12, sequenceNumber: '0000' }]);
    if (url.endsWith('/dispatch-readiness')) return ok(a);
    return ok([]);
  });
}
const props = () => ({ surface: { id: 'dispatch-readiness', label: 'Dispatch' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'regulatory' });

beforeEach(() => { apiRequest.mockReset(); (window as unknown as { C2C_PROJECT: unknown }).C2C_PROJECT = { id: PROGRAM_UUID }; });
afterEach(() => { cleanup(); delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT; });

describe('the external validator gate', () => {
  it('says "Not assessed" and why when no validator ran, never "Satisfied"', async () => {
    serve(assessment({ notAssessed: NOTE }));
    render(<DispatchReadiness {...props()} />);
    await screen.findByText('At least one Shadow Review has completed');
    const card = document.querySelector('[data-gate="external"]')!;
    expect(card.textContent).toContain('Not assessed.');
    expect(card.textContent).toContain('has not been checked against it');
    expect(card.textContent).not.toContain('Satisfied');
    expect(card.className).toContain('warn');
  });

  it('does not call the validator clean in the cleared verdict when it never ran', async () => {
    serve(assessment({ notAssessed: NOTE }));
    render(<DispatchReadiness {...props()} />);
    await screen.findByText('At least one Shadow Review has completed');
    expect(document.body.textContent).not.toMatch(/external validator clean/);
  });

  it('still says "Satisfied" when the validator ran and its report was clean', async () => {
    const a = assessment({});
    (a.externalValidation as Record<string, unknown>).ran = true;
    (a.externalValidation as Record<string, unknown>).configured = true;
    serve(a);
    render(<DispatchReadiness {...props()} />);
    await screen.findByText('At least one Shadow Review has completed');
    expect(document.querySelector('[data-gate="external"]')!.textContent).toContain('Satisfied.');
  });

  it.each([
    ['failed', 'External validation failed.', 'The external validator found 1 error. Dispatch policy is advisory.'],
    ['invalid', 'External validation report invalid.', 'The supplied report names a different engine. Dispatch policy is advisory.'],
  ])('shows advisory %s validation without converting clearance into a pass', async (assessmentStatus, label, assessmentNote) => {
    serve(assessment({ assessmentStatus, assessmentNote }, { configured: true, ran: true, errorCount: assessmentStatus === 'failed' ? 1 : 0, assessmentStatus, assessmentNote, qualifyingRun: assessmentStatus === 'failed' }));
    render(<DispatchReadiness {...props()} />);
    await screen.findByText('At least one Shadow Review has completed');
    const card = document.querySelector('[data-gate="external"]')!;
    expect(card.textContent).toContain(label);
    expect(card.textContent).toContain(assessmentNote);
    expect(card.textContent).not.toMatch(/Satisfied|Not assessed/);
    expect(card.className).toContain('warn');
    expect(document.body.textContent).toContain('Cleared to dispatch');
    expect(document.body.textContent).not.toContain('external validator clean');
  });

  it('publishes an invalid zero placeholder with its status and engine provenance to AnA', async () => {
    const assessmentNote = 'The external report is invalid; its numeric placeholder does not establish a clean assessment.';
    serve(assessment({ assessmentStatus: 'invalid', assessmentNote }, { configured: true, ran: true, errorCount: 0, errorCountKnown: false, qualifyingRun: false, assessmentStatus: 'invalid', assessmentNote, validatorKind: 'external_engine', selectedValidatorName: 'LORENZ', reportedValidatorName: 'other-engine' }));
    render(<><DispatchReadiness {...props()} /><AnaContextProbe /></>);
    await screen.findByText('At least one Shadow Review has completed');
    const wire = JSON.parse(screen.getByTestId('ana-wire-context').textContent!);
    // F18: one entry per market; this project has one.
    expect(wire.facts.markets[0]).toMatchObject({ externalValidationCleared: true, externalValidationStatus: 'invalid', externalQualifyingRun: false, externalErrorCountKnown: false, externalSelectedValidator: 'LORENZ', externalReportedValidator: 'other-engine', externalValidationNote: assessmentNote });
    expect(document.body.textContent).not.toContain('external validator clean');
  });

  it('shows a raw executed subset as not externally assessed', async () => {
    const assessmentNote = 'Only the internal FDA criteria subset ran; no external assessment is established.';
    serve(assessment({ assessmentStatus: 'not_assessed', assessmentNote, notAssessed: assessmentNote }, { configured: false, ran: true, qualifyingRun: false, assessmentStatus: 'not_assessed', assessmentNote }));
    render(<DispatchReadiness {...props()} />);
    await screen.findByText('At least one Shadow Review has completed');
    expect(document.querySelector('[data-gate="external"]')!.textContent).toContain('Not assessed.');
    expect(document.body.textContent).not.toContain('external validator clean');
  });

  it('does not call a legacy advisory report clean when its observed error count is positive', async () => {
    serve(assessment({}, { configured: true, ran: true, errorCount: 1 }));
    render(<DispatchReadiness {...props()} />);
    await screen.findByText('At least one Shadow Review has completed');
    expect(document.querySelector('[data-gate="external"]')!.textContent).toContain('External validation failed.');
    expect(document.body.textContent).not.toContain('external validator clean');
    expect(document.body.textContent).toContain('Cleared to dispatch');
  });
});

describe('a Shadow Review waived by signature (P-34)', () => {
  const WAIVED =
    'Shadow Review waived under signature 41 by Dana Reyes because the AI provider was unavailable (run #7); this dossier was not adversarially reviewed.';
  const waived = () => {
    const a = assessment({});
    Object.assign(a, { shadowReviewRunCount: 0, shadowReviewMissing: true });
    a.gates[2] = { ...a.gates[2], notAssessed: WAIVED } as (typeof a.gates)[number];
    return a;
  };

  it('the presence card says "Not assessed" with the server’s sentence, never "Satisfied"', async () => {
    serve(waived());
    render(<DispatchReadiness {...props()} />);
    await screen.findByText('At least one Shadow Review has completed');
    const card = document.querySelector('[data-gate="shadowPresence"]')!;
    expect(card.textContent).toContain('Not assessed.');
    expect(card.textContent).toContain('not adversarially reviewed');
    expect(card.textContent).not.toContain('Satisfied');
  });

  it('the cleared verdict does not call it proven clear or count zero criticals found', async () => {
    serve(waived());
    render(<DispatchReadiness {...props()} />);
    await screen.findByText('At least one Shadow Review has completed');
    // F18: the market row states the verdict, with how many gates cleared unassessed.
    const verdict = document.querySelector('[data-testid="pj-market-verdict"]')!.textContent ?? '';
    expect(verdict).toContain('Cleared to dispatch · 1 gate not assessed');
    expect(document.body.textContent).not.toContain('Every hard gate is proven clear');
    expect(document.querySelector('[data-gate="shadowPresence"]')!.textContent).toContain('not adversarially reviewed');
    expect(document.body.textContent).not.toContain('0 unacknowledged Shadow Review criticals');
  });

  it('AnA is told which gate cleared without assessing, in the server’s words', async () => {
    serve(waived());
    render(<><DispatchReadiness {...props()} /><AnaContextProbe /></>);
    await screen.findByText('At least one Shadow Review has completed');
    const wire = JSON.parse(screen.getByTestId('ana-wire-context').textContent!);
    expect(wire.facts.markets[0].notAssessed).toEqual([{ gate: 'shadowPresence', note: WAIVED }]);
    expect(wire.facts.markets[0].shadowReviewMissing).toBe(true);
  });
});
