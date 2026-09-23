// @vitest-environment jsdom
/**
 * DispatchReadiness — every finding and every gate is a NAMED RULE.
 *
 * WO-09 Click 5: "Every finding renders as a named rule from
 * validation-rule-corpus.ts with region, severity, and its enforcement
 * statement — enforced here, guaranteed by packager construction, or requires
 * the agency validator. No percentage score. No bare pass/fail."
 *
 * Before this, a finding row showed severity, section and prose; the three gate
 * cards were recomputed in the browser and drawn as a tick or a cross; the
 * Shadow Review card read "dispatch permitted" while the server blocked on the
 * same state; and the release-signature gate the server composes had no card.
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
const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data: payload }) } as Response);

const rule = (id: string, title: string, enforcementStatement: string, regions = ['fda', 'eu'], severity = 'medium') =>
  ({ id, title, category: 'content', regions, severity, source: 'FDA eCTD Technical Conformance Guide', enforcement: 'dispatch-readiness', enforcementStatement });

const ENFORCED = 'Enforced here — this assessment checks it every time it runs.';
const AGENCY = 'Requires the agency validator — its report decides this; the product records the verdict, it does not reproduce the check.';

const ASSESSMENT = {
  sequenceId: 12, region: 'fda', sequenceStatus: 'draft', validationErrors: 0, unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 0, shadowReviewMissing: true, leafCount: 2,
  externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
  releaseSignature: { required: true, verdict: 'unsigned', cleared: false },
  readiness: {
    errors: 0, warnings: 2, infos: 0,
    findings: [
      { severity: 'warning', code: 'MISSING_REQUIRED_SECTION', sectionCode: '1.20', message: 'Required section 1.20 has no leaf in this sequence.',
        rule: rule('MISSING_REQUIRED_SECTION', 'Region-required Module 1 sections are present', ENFORCED, ['fda', 'eu', 'jp']) },
      { severity: 'warning', code: 'SOMETHING_NEW', sectionCode: null, message: 'A code no rule names.', rule: null },
    ],
  },
  gate: { cleared: false, blockers: ['No completed Shadow Review has run for this sequence.', 'The release signature is unsigned.'] },
  gates: [
    { key: 'structural', cleared: true, blockers: [], rule: rule('STRUCTURAL_GATE_CLEAR', 'No open error-severity finding, and no unacknowledged Shadow Review critical', ENFORCED, ['ich'], 'high') },
    { key: 'external', cleared: true, blockers: [], rule: { ...rule('EXTERNAL_VALIDATION_CLEAN', 'The agency-grade validator’s report for this package carries no errors', AGENCY, ['ich'], 'high'), enforcement: 'external' } },
    { key: 'shadowPresence', cleared: false, blockers: ['No completed Shadow Review has run for this sequence.'], rule: rule('SHADOW_REVIEW_COMPLETED', 'At least one Shadow Review has completed for this sequence', ENFORCED, ['ich'], 'high') },
    { key: 'releaseSignature', cleared: false, blockers: ['The release signature is unsigned.'], rule: rule('RELEASE_SIGNATURE_VALID', 'A valid release signature binds this sequence’s package (21 CFR 11.70)', ENFORCED, ['ich'], 'high') },
  ],
};

function serve(assessment: unknown) {
  apiRequest.mockImplementation(async (_m: string, rawUrl: unknown) => {
    const url = String(rawUrl ?? '');
    if (url === `/api/c2c/projects/${PROGRAM_UUID}`) {
      return { ok: true, status: 200, json: async () => ({ id: PROGRAM_UUID, name: 'BX-512 IND', code: 'BX-512', product_name: 'Vorelinib', program_type: 'ind' }) } as Response;
    }
    if (url === '/api/submissions') return ok([{ id: 4, title: 'BX-512 IND', productName: 'Vorelinib', applicationType: 'IND' }]);
    if (url === '/api/submissions/4/sequences') return ok([{ id: 12, sequenceNumber: '0000' }]);
    if (url.endsWith('/dispatch-readiness')) return ok(assessment);
    return ok([]);
  });
}
const props = () => ({ surface: { id: 'dispatch-readiness', label: 'Dispatch' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'regulatory' });

beforeEach(() => { apiRequest.mockReset(); (window as any).C2C_PROJECT = { id: PROGRAM_UUID }; serve(ASSESSMENT); });
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('DispatchReadiness — each finding is a named corpus rule', () => {
  it('shows the rule’s title and id, its regions, its corpus severity and where it is enforced', async () => {
    render(<DispatchReadiness {...props()} />);
    const row = (await screen.findByText('Region-required Module 1 sections are present')).closest('[data-finding]')!;
    expect(row.textContent).toContain('MISSING_REQUIRED_SECTION');
    expect(row.textContent).toMatch(/FDA · EU · JP/);
    expect(row.textContent).toMatch(/medium/);
    expect(row.textContent).toContain(ENFORCED);
    expect(row.textContent).toContain('Required section 1.20 has no leaf in this sequence.');
  });

  it('a finding whose code no rule names says so, instead of passing for a rule', async () => {
    render(<DispatchReadiness {...props()} />);
    const row = (await screen.findByText('A code no rule names.')).closest('[data-finding]')!;
    expect(row.textContent).toMatch(/not in the rule corpus/i);
    expect(row.textContent).toContain('SOMETHING_NEW');
  });
});

describe('DispatchReadiness — each gate is the rule it enforces, in words', () => {
  it('renders every gate the server composed, the release signature included, with its own blockers', async () => {
    render(<DispatchReadiness {...props()} />);
    await screen.findByText('At least one Shadow Review has completed for this sequence');
    const gates = Array.from(document.querySelectorAll('[data-gate]'));
    expect(gates.map((g) => g.getAttribute('data-gate'))).toEqual(['structural', 'external', 'shadowPresence', 'releaseSignature']);
    const release = gates[3].textContent ?? '';
    expect(release).toContain('A valid release signature binds this sequence’s package (21 CFR 11.70)');
    expect(release).toContain('The release signature is unsigned.');
    expect(gates[1].textContent).toContain(AGENCY);
  });

  it('no gate is a bare pass or fail: each states its outcome in words, beside its rule', async () => {
    render(<DispatchReadiness {...props()} />);
    await screen.findByText('At least one Shadow Review has completed for this sequence');
    for (const g of Array.from(document.querySelectorAll('[data-gate]'))) {
      expect(g.textContent).toMatch(/Satisfied|Blocks dispatch/);
    }
  });

  it('never says dispatch is permitted while the server blocks it, and shows no percentage', async () => {
    render(<DispatchReadiness {...props()} />);
    await screen.findByText('At least one Shadow Review has completed for this sequence');
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/dispatch permitted/i);
    expect(body).not.toMatch(/\d+\s?%/);
  });
});
