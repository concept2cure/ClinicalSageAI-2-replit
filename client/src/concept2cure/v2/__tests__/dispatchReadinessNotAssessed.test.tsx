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

const PROGRAM_UUID = '5b1c2d3e-0000-4000-8000-000000000009';
const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data: payload }) }) as Response;
const rule = (id: string, title: string) => ({ id, title, category: 'integrity', regions: ['ich'], severity: 'high', source: 's', enforcement: 'dispatch-readiness', enforcementStatement: 'e' });
const NOTE = 'No agency-grade validator is configured on this installation, so no report exists for this package. It is not required here, so it does not block dispatch — but the package has not been checked against it.';

const assessment = (external: Record<string, unknown>) => ({
  sequenceId: 12, region: 'fda', sequenceStatus: 'validated', validationErrors: 0, unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1, shadowReviewMissing: false, leafCount: 6,
  externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
  releaseSignature: { required: false, verdict: 'not-required', cleared: true },
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] },
  gate: { cleared: true, blockers: [] },
  gates: [
    { key: 'structural', cleared: true, blockers: [], rule: rule('STRUCTURAL_GATE_CLEAR', 'No open error-severity finding') },
    { key: 'external', cleared: true, blockers: [], rule: rule('EXTERNAL_VALIDATION_CLEAN', 'The agency-grade validator’s report for this package carries no errors'), ...external },
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
    if (url === '/api/submissions') return ok([{ id: 4, title: 'BX-512 IND', productName: 'Vorelinib', applicationType: 'IND' }]);
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
});
