// @vitest-environment jsdom
/**
 * Submission Readiness is read inside Submit, on each market's own sequence
 * (P-33; docs/design/FILING_SPINE.md F10, the slice-24 row).
 *
 * At 7f9720d9 the Submit step's Markets header still carried slice 24's door,
 * "Check what stops sending", to the separate Submission Readiness canvas
 * (`dispatch-readiness`). That canvas drew the same market list as Submit with
 * more under each row: the server's composed gates, each structural finding
 * with an act that opens where it is fixed, and a door to the sequence's
 * Dispatch tab once its gate is clear. Submit drew the verdict and the counts
 * only. One verdict had two homes (P-36), and the fuller one was a door away.
 *
 * Now each Submit market row carries that readiness detail itself
 * (MarketGateDetail, moved into ProjectMarkets.tsx, not copied), and the
 * header door is gone. Pinned here:
 *   - no control on Submit opens the separate readiness canvas;
 *   - each row shows its own sequence's gates and findings, and each act opens
 *     the Submission Center on that row's submission and sequence, never
 *     another market's;
 *   - a cleared gate opens that sequence's Dispatch tab from Submit;
 *   - a verdict that could not be read says so on its row, with a retry, and
 *     is never shown as clear: no gate card, no "Satisfied", no Dispatch door.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }),
    useAuthUser: () => actual.authService.getUser() };
});

import { authService } from '@/services/portal/authService';
import { ProjectHome } from '../surfaces/ProjectHome';
import { clearNavParams, consumeNavParams } from '../navParams';

const PID = '5c4d3e2f-1a0b-4c9d-8e7f-6a5b4c3d2e1f';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const unavailable = () => Object.assign(new Error('Service unavailable'), { status: 503 });

const PROGRAM = { id: PID, name: 'ONC-221', code: 'ONC-221', product_name: 'Vorelinib', program_type: 'IND', status: 'active' };
const IND = {
  id: 61, title: 'ONC-221 IND', productName: 'Vorelinib', applicationType: 'ind', clientType: 'biotech',
  primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: PID,
};
const MAA = {
  id: 62, title: 'ONC-221 EU MAA', productName: 'Vorelinib', applicationType: 'maa', clientType: 'biotech',
  primaryRegion: 'eu', status: 'planning', lifecycleStage: 'original', programId: PID,
};
const IND_ROW = 'IND · FDA (US), ONC-221 IND';
const MAA_ROW = 'MAA · EU (EMA), ONC-221 EU MAA';

const NOT_ASSESSED = 'No agency-grade validator is configured on this installation, so the package has not been checked against it.';
const finding = (code: string, sectionCode: string | null, message: string) => ({ severity: 'error', code, sectionCode, message, rule: null });
const rule = (id: string, title: string) => ({
  id, title, category: 'integrity', regions: ['ich'], severity: 'high', source: 'FDA eCTD Technical Conformance Guide',
  enforcement: 'dispatch-readiness', enforcementStatement: 'Enforced here — this assessment checks it every time it runs.',
});

/** The server's verdict on one sequence: blocked by its structural gate, with
 *  the external gate cleared but not assessed, and the findings given. */
function blocked(sequenceId: number, findings: ReturnType<typeof finding>[]) {
  return {
    sequenceId, region: 'fda', sequenceStatus: 'draft', validationErrors: findings.length,
    unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 1, shadowReviewMissing: false, leafCount: 3,
    externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
    readiness: { errors: findings.length, warnings: 0, infos: 0, findings },
    gate: { cleared: false, blockers: [`${findings.length} open error-severity validation finding(s) on sequence ${sequenceId}.`] },
    gates: [
      { key: 'structural', rule: rule('STRUCTURAL_CLEAN', 'The sequence has no error-severity structural finding'), cleared: false,
        blockers: [`${findings.length} open error-severity validation finding(s) on sequence ${sequenceId}.`] },
      { key: 'external', rule: rule('EXT-VALIDATOR', 'Agency validator report'), cleared: true, blockers: [], notAssessed: NOT_ASSESSED },
    ],
  };
}
/** A cleared verdict on a validated sequence, with its freeze clear. */
function cleared(sequenceId: number) {
  return {
    ...blocked(sequenceId, []), sequenceStatus: 'validated', validationErrors: 0,
    gate: { cleared: true, blockers: [] }, freezeGate: { cleared: true, blockers: [] },
    gates: [{ key: 'structural', rule: rule('STRUCTURAL_CLEAN', 'The sequence has no error-severity structural finding'), cleared: true, blockers: [] }],
  };
}

const IND_FINDINGS = [
  finding('MISSING_REQUIRED_SECTION', '1.2', 'Required section 1.2 has no leaf in this sequence.'),
  finding('UNRESOLVED_DOCUMENT', '2.7.3', 'The leaf at 2.7.3 points at a document that no longer exists.'),
];
const MAA_FINDINGS = [finding('MISSING_REQUIRED_SECTION', '1.0', 'Required section 1.0 has no leaf in this sequence.')];

type Opts = { ind?: unknown; maa?: unknown; maaVerdictFails?: boolean; indStatus?: string };
function serve(opts: Opts = {}) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, raw: unknown) => {
    const url = String(raw ?? '');
    if (url === `/api/c2c/projects/${PID}`) return ok(PROGRAM);
    if (url === `/api/submissions?programId=${PID}`) return ok({ data: [IND, MAA], meta: { notOffered: 0 } });
    if (url === `/api/submissions/${IND.id}/sequences`) {
      return ok({ data: [{ id: 905, sequenceNumber: '0000', status: opts.indStatus ?? 'draft', type: 'original', region: 'fda' }] });
    }
    if (url === `/api/submissions/${MAA.id}/sequences`) return ok({ data: [{ id: 906, sequenceNumber: '0000', status: 'draft', type: 'original', region: 'eu' }] });
    if (url === '/api/submissions/sequences/905/dispatch-readiness') return ok(opts.ind ?? blocked(905, IND_FINDINGS));
    if (url === '/api/submissions/sequences/906/dispatch-readiness') {
      if (opts.maaVerdictFails) throw unavailable();
      return ok(opts.maa ?? blocked(906, MAA_FINDINGS));
    }
    return ok({});
  });
}

const onNav = vi.fn();
async function openSubmit() {
  render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={onNav} segment="biotech" />);
  await waitFor(() => {
    const tab = Array.from(document.querySelectorAll('.pj-lc-stage')).find((b) => b.textContent?.includes('Submit'));
    expect(tab).toBeTruthy();
    fireEvent.click(tab as Element);
  });
}
/** A market row, once its verdict has been read (or has failed). */
async function settledRow(id: number): Promise<HTMLElement> {
  await waitFor(() => {
    const row = document.querySelector(`[data-market="${id}"]`);
    expect(row, `the market row of submission ${id}`).toBeTruthy();
    expect(row?.querySelector('[data-testid="pj-market-verdict"]')?.textContent).not.toContain('Checking');
  });
  return document.querySelector(`[data-market="${id}"]`) as HTMLElement;
}

beforeEach(() => {
  authService.setToken('fixture-market-reader', { id: '7', organizationId: '1' }, 'fixture-market-refresh', 3600);
  onNav.mockReset();
  clearNavParams();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'ONC-221' };
});
afterEach(() => {
  cleanup();
  clearNavParams();
  authService.endSession(null);
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('Submit holds the readiness verdict; it does not send the person to a second screen for it', () => {
  it('no control on Submit opens the separate Submission Readiness canvas', async () => {
    serve();
    await openSubmit();
    await settledRow(61);
    await settledRow(62);
    const markets = screen.getByTestId('pj-markets');
    expect(within(markets).queryByRole('button', { name: 'Check what stops sending' })).toBeNull();
    for (const b of within(markets).getAllByRole('button')) fireEvent.click(b);
    expect(onNav.mock.calls.map((c) => c[0])).not.toContain('dispatch-readiness');
  });

  it('each row shows its own sequence’s gates and findings, and an act opens that row’s sequence, never the other market’s', async () => {
    serve();
    await openSubmit();
    const ind = await settledRow(61);
    const maa = await settledRow(62);
    await waitFor(() => expect(within(ind).getByText('Required section 1.2 has no leaf in this sequence.')).toBeTruthy());
    expect(within(ind).getByText('The leaf at 2.7.3 points at a document that no longer exists.')).toBeTruthy();
    expect(within(ind).queryByText('Required section 1.0 has no leaf in this sequence.')).toBeNull();
    expect(within(maa).getByText('Required section 1.0 has no leaf in this sequence.')).toBeTruthy();
    expect(within(maa).queryByText('Required section 1.2 has no leaf in this sequence.')).toBeNull();

    // The composed gates, each in the server's words: the blocking one with its own blocker, the
    // cleared-but-unchecked one as not assessed, never "Satisfied".
    const structural = ind.querySelector('[data-gate="structural"]') as HTMLElement;
    expect(structural?.textContent).toContain('Blocks dispatch:');
    expect(structural?.textContent).toContain('2 open error-severity validation finding(s) on sequence 905.');
    const external = ind.querySelector('[data-gate="external"]') as HTMLElement;
    expect(external?.textContent).toContain('Not assessed.');
    expect(external?.textContent).toContain(NOT_ASSESSED);
    expect(external?.textContent).not.toContain('Satisfied');

    fireEvent.click(within(ind).getByRole('button', { name: `Place a leaf at 1.2 for ${IND_ROW}` }));
    expect(onNav).toHaveBeenLastCalledWith('submission-center');
    expect(consumeNavParams('submission-center')).toEqual({ submissionId: '61', sequenceId: '905', ws: 'builder', builderAct: 'place', sectionCode: '1.2' });
    fireEvent.click(within(ind).getByRole('button', { name: `Open the leaf at 2.7.3 for ${IND_ROW}` }));
    expect(consumeNavParams('submission-center')).toEqual({ submissionId: '61', sequenceId: '905', ws: 'builder', builderAct: 'leaf', sectionCode: '2.7.3' });
    fireEvent.click(within(maa).getByRole('button', { name: `Place a leaf at 1.0 for ${MAA_ROW}` }));
    expect(consumeNavParams('submission-center')).toEqual({ submissionId: '62', sequenceId: '906', ws: 'builder', builderAct: 'place', sectionCode: '1.0' });
  });

  it('a cleared gate opens that sequence’s Dispatch tab from Submit', async () => {
    serve({ ind: cleared(905), indStatus: 'validated' });
    await openSubmit();
    const ind = await settledRow(61);
    await waitFor(() => expect(within(ind).getByTestId('pj-market-verdict').textContent).toContain('Cleared to dispatch'));
    const door = await within(ind).findByRole('button', { name: `Open Dispatch for sequence 0000 of ${IND_ROW}` });
    fireEvent.click(door);
    expect(consumeNavParams('submission-center')).toEqual({ submissionId: '61', sequenceId: '905', ws: 'dispatch' });
    // The MAA is blocked: no Dispatch door on its row.
    expect(within(await settledRow(62)).queryByRole('button', { name: /Open Dispatch|governed transmit/ })).toBeNull();
  });
});

describe('Submit fails closed: a verdict that could not be read is never shown as clear', () => {
  it('a failed readiness read says so on its row, with a retry, and draws no gate, no "Satisfied" and no Dispatch door', async () => {
    serve({ ind: cleared(905), indStatus: 'validated', maaVerdictFails: true });
    await openSubmit();
    const maa = await settledRow(62);
    const verdict = within(maa).getByTestId('pj-market-verdict');
    expect(verdict.textContent).toContain('No verdict · the readiness read failed');
    expect(maa.textContent).not.toMatch(/Cleared|Satisfied|Clear except/);
    expect(maa.querySelector('[data-gate]')).toBeNull();
    expect(within(maa).queryByRole('button', { name: /Open Dispatch|governed transmit/ })).toBeNull();
    expect(within(maa).getByRole('button', { name: 'Retry the verdict for MAA · EU (EMA)' })).toBeTruthy();
    // The header line agrees: the MAA has no verdict, which is not the same as cleared.
    const line = screen.getByTestId('pj-status-line');
    const maaItem = Array.from(line.querySelectorAll('.pj-status-item')).find((n) => n.textContent?.includes('MAA · EU (EMA)'));
    expect(maaItem?.textContent).toContain('No verdict');
    expect(maaItem?.textContent).not.toContain('Cleared');
  });
});
