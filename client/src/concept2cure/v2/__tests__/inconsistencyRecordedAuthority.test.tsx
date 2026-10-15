// @vitest-environment jsdom
/**
 * The submission gate on the Inconsistency board is the server's, and so is
 * every finding's authority.
 *
 * ── What it was ──────────────────────────────────────────────────────────────
 * The board returned each finding with the severity and authority the
 * contradiction engine recorded. The screen then threw the authority away and
 * re-derived it in the browser:
 *
 *   - from a five-entry copy of the server's default map, so a finding of any
 *     other type (parameter_mismatch, protocol_sap_inconsistency, …) read
 *     "Advisory" whatever the engine had recorded;
 *   - under an FDA/EMA toggle, from two overlay rules hard-coded in the client.
 *     The EMA one — "EMA treats the same conflict as requiring approval, not a
 *     hard block" — is in no organisation's contradiction_overlay_rules. The
 *     screen said so anyway: "Same dossier, different regulator".
 *
 * and counted the gate from that re-scoring over the page of findings it held
 * (200, most severe first), so a low-severity blocker past the page was not
 * counted and the verdict could read "clear" over a filing
 * checkPromotionBlocked holds.
 *
 * ── What it is ───────────────────────────────────────────────────────────────
 * The board carries `gate`, counted by the server over every finding
 * (contradictionEngineService.projectGate), and each finding's recorded
 * authority and overlay. The screen renders them; a board without a gate is
 * unreadable, not clear; after a recorded decision the board is re-read so the
 * count follows. Every case below fails against the screen as it was.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Inconsistency } from '../surfaces/Inconsistency';

const Surface = Inconsistency as unknown as React.ComponentType<Record<string, unknown>>;

const PROGRAM = {
  projectId: 9, name: 'Bexarone in advanced NSCLC', code: 'BX-204',
  stage: 'active', indication: 'NSCLC', app: null, filing: null,
};
const BOARD_PATH = '/api/governed-intelligence-inconsistency/projects/9/inconsistency';

const ROW = {
  projectId: 9,
  objectA: { type: 'section', id: 'a', label: 'Protocol §9.2' },
  objectB: { type: 'section', id: 'b', label: 'SAP §4.1' },
  sourceClassification: 'deterministic_rule_conflict', truthHierarchyLevel: 2, llmRole: 'none',
  confidenceScore: 0.9, confidenceLevel: 'high', description: 'The two records state different values.',
  deterministicRule: null, consequenceType: 'review_thread', reviewState: 'unresolved',
  detectedBy: null, factId: null, resolvedBy: null, resolvedAt: null,
  regulatorBody: null, overlayRuleId: null,
};

/** Recorded requires_review — a type the client's copy of the default map did not have. */
const PARAMETER = {
  ...ROW, id: 'f-param', contradictionType: 'parameter_mismatch', severity: 'medium',
  title: 'Dropout rate differs between the protocol and the SAP', authorityState: 'requires_review',
};

/** Recorded requires_approval by the organisation's EMA overlay rule at detection. */
const DOSAGE_EMA = {
  ...ROW, id: 'f-dose', contradictionType: 'dosage_conflict', severity: 'high',
  title: 'Starting dose disagrees across the dossier', authorityState: 'requires_approval',
  regulatorBody: 'EMA', overlayRuleId: '5b0c2f1e-8d3a-4c6b-9e7f-1a2b3c4d5e6f',
};

const GATE = {
  total: 0, open: 0, resolved: 0, superseded: 0,
  blocking: 0, needApproval: 0, needEscalation: 0, needReview: 0, advisory: 0, unrecognized: 0,
  blocked: false,
};

function serveBoard(data: () => unknown) {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === BOARD_PATH) return { ok: true, status: 200, json: async () => ({ data: data() }) };
    throw new Error('unrouted ' + method + ' ' + path);
  });
}

const board = (findings: unknown[], gate: Record<string, unknown>) =>
  ({ program: PROGRAM, gate, findings, assumptions: [], decisions: [], checks: [] });

const card = (id: string) => document.getElementById('gi-f-' + id)!;
const boardReads = () => apiRequest.mock.calls.filter(([m, p]) => m === 'GET' && p === BOARD_PATH).length;

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 9 };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('each finding shows the authority the engine recorded', () => {
  it('a parameter mismatch recorded "requires review" reads "Requires review", not "Advisory"', async () => {
    serveBoard(() => board([PARAMETER], { ...GATE, total: 1, open: 1, needReview: 1 }));
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(card('f-param')).toBeTruthy());

    const top = card('f-param').querySelector('.gi-auth')!;
    expect(top.textContent).toBe('Requires review');
  });

  it('a dosage conflict scored by the EMA overlay at detection keeps that score, and says whose rule it was', async () => {
    serveBoard(() => board([DOSAGE_EMA], { ...GATE, total: 1, open: 1, needApproval: 1 }));
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(card('f-dose')).toBeTruthy());

    expect(card('f-dose').querySelector('.gi-auth')!.textContent).toBe('Requires approval');
    expect(within(card('f-dose')).getByText('EMA overlay')).toBeTruthy();
    // The screen used to apply its own FDA rule to every dosage conflict.
    expect(card('f-dose').textContent).not.toMatch(/Blocks promotion|FDA overlay/);
    expect(document.body.textContent).toMatch(/Submission gate — clear, with open items/);
  });

  it('an authority it has no label for is shown as stored, not relabelled "Advisory"', async () => {
    const odd = { ...PARAMETER, id: 'f-odd', authorityState: 'requires_signoff' };
    serveBoard(() => board([odd], { ...GATE, total: 1, open: 1, unrecognized: 1 }));
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(card('f-odd')).toBeTruthy());

    expect(card('f-odd').querySelector('.gi-auth')!.textContent).toBe('requires_signoff');
    expect(document.body.textContent).toMatch(/1 unrecognised/);
  });
});

describe('there is no regulator toggle to re-score with', () => {
  it('offers no FDA/EMA switch and makes no claim about how another regulator would score', async () => {
    serveBoard(() => board([DOSAGE_EMA, PARAMETER], { ...GATE, total: 2, open: 2, needApproval: 1, needReview: 1 }));
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(card('f-dose')).toBeTruthy());

    expect(screen.queryByRole('group', { name: /Regulator overlay/i })).toBeNull();
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/Same dossier, different regulator/);
    expect(body).not.toMatch(/under (FDA|EMA)/);
  });
});

describe('the gate is counted over every finding, not the page this screen holds', () => {
  it('reads BLOCKED when the blocker is past the page, and says the list is a page', async () => {
    // The page holds one review-level finding; the record holds three, one of
    // them a low-severity blocker that sorted past the page.
    serveBoard(() => board([PARAMETER], { ...GATE, total: 3, open: 3, blocking: 1, needReview: 1, advisory: 1, blocked: true }));
    const asked: string[] = [];
    render(<Surface onAsk={(t: string) => asked.push(t)} onNav={() => {}} />);
    await waitFor(() => expect(card('f-param')).toBeTruthy());

    const body = document.body.textContent ?? '';
    expect(body).toMatch(/Submission gate — BLOCKED/);
    expect(body).toMatch(/1 issue blocks it/);
    expect(body).toMatch(/Showing the 1 most severe of 3 recorded findings/);
    expect(body).toMatch(/not among the 1 listed below/);

    fireEvent.click(screen.getByRole('button', { name: 'Show me how to clear it' }));
    expect(asked[0]).toMatch(/blocked by 1 contradiction\(s\) with a blocks-promotion authority/);
  });

  it('a board that carries no gate is unreadable, not a verdict', async () => {
    serveBoard(() => ({ program: PROGRAM, findings: [], assumptions: [], decisions: [], checks: [] }));
    render(<Surface onAsk={() => {}} onNav={() => {}} />);

    await screen.findByText(/Couldn't load the inconsistency board/);
    expect(document.body.textContent).not.toMatch(/Submission gate —/);
  });
});

describe('after a recorded decision the gate is counted again', () => {
  it('re-reads the board, and the verdict is the server’s new count', async () => {
    const blocking = { ...DOSAGE_EMA, id: 'f-block', authorityState: 'blocks_promotion', regulatorBody: null, overlayRuleId: null };
    let current: Record<string, unknown> = blocking;
    serveBoard(() => {
      const open = current.reviewState !== 'approved_resolution';
      return board([current], { ...GATE, total: 1, open: open ? 1 : 0, resolved: open ? 0 : 1, blocking: open ? 1 : 0, blocked: open });
    });
    const reads = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (m: string, p: string, b?: unknown) => {
      if (m !== 'POST') return reads(m, p, b);
      current = { ...blocking, reviewState: 'approved_resolution', resolvedBy: '7', resolvedAt: '2026-10-15T09:00:00.000Z' };
      return {
        ok: true, status: 200,
        json: async () => ({
          finding: current,
          previousReviewState: 'unresolved',
          governance: { command: 'resolve', actionId: 'act_1', auditId: 'aud-1', sha256Chain: 'c0ffee' },
        }),
      };
    });

    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Submission gate — BLOCKED/));
    const before = boardReads();

    fireEvent.click(within(card('f-block')).getByRole('button', { name: /^.?\s*Resolve/ }));
    fireEvent.change(await screen.findByLabelText(/Reason for resolution/), { target: { value: 'IB corrected to match the protocol' } });
    fireEvent.click(screen.getByRole('button', { name: /Record resolution/ }));

    await waitFor(() => expect(boardReads()).toBeGreaterThan(before));
    await waitFor(() => expect(document.body.textContent).toMatch(/Submission gate — CLEAR/));
    // The audit-trail line this screen saw committed survives the re-read.
    expect(card('f-block').textContent).toMatch(/recorded on the audit trail/);
  });
});
