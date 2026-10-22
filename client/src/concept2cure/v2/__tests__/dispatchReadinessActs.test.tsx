// @vitest-environment jsdom
/**
 * F18 (docs/design/FILING_SPINE.md §7.2): Submission Readiness is the open
 * project's markets in one list, and its buttons do the job.
 *
 * Before: the screen gated one sequence (the submission of the project's own
 * application type, found in the organisation's unscoped list), and both of
 * its buttons sent a sentence into the chat — "Fix" asked AnA to "resolve" a
 * finding, "Prepare governed transmit" asked AnA to prepare the transmit.
 * Neither opened anything.
 *
 * Pins:
 *   • every market of the project is listed from the scoped list
 *     (GET /api/submissions?programId=), each with its own gate, and the
 *     organisation's unscoped list is never read;
 *   • an error finding's act opens the Submission Center where it is fixed:
 *     the Builder's placement form at a missing section, the placed leaf for a
 *     defect on a leaf, Validation for anything a placement cannot change —
 *     on that market's submission and sequence, never another's;
 *   • a cleared gate opens the sequence's Dispatch tab, named for what it is:
 *     governed transmit once dispatched, Dispatch before that;
 *   • nothing on the screen asks AnA to do the work, and AnA is never told a
 *     market is cleared without the server's verdict;
 *   • end to end, the act lands on the Builder with Section filled in.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DispatchReadiness } from '../surfaces/DispatchReadiness';
import { SubmissionCenter } from '../surfaces/SubmissionCenter';
import { clearNavParams, consumeNavParams } from '../navParams';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';

const PROGRAM_UUID = '6a2b3c4d-0000-4000-8000-000000000018';
const PROGRAM = { id: PROGRAM_UUID, name: 'BX-512', code: 'BX-512', product_name: 'Vorelinib', program_type: 'ind' };
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

const IND = { id: 61, title: 'BX-512 IND', productName: 'Vorelinib', applicationType: 'ind', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', clientType: 'biotech', programId: PROGRAM_UUID };
const MAA = { id: 62, title: 'BX-512 EU MAA', productName: 'Vorelinib', applicationType: 'maa', primaryRegion: 'eu', status: 'planning', lifecycleStage: 'original', clientType: 'biotech', programId: PROGRAM_UUID };
/* Served on the organisation's unscoped list only: if it is ever shown, the
   screen read the wrong list. */
const TRAP = { id: 99, title: 'Another project’s NDA', productName: 'Other', applicationType: 'ind', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: null };

const finding = (severity: string, code: string, sectionCode: string | null, message: string) => ({ severity, code, sectionCode, message, rule: null });

const blocked = (sequenceId: number, findings: unknown[]) => ({
  sequenceId, region: 'fda', sequenceStatus: 'draft', validationErrors: findings.filter((f) => (f as { severity: string }).severity === 'error').length,
  unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 1, shadowReviewMissing: false, leafCount: 3,
  externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
  readiness: { errors: findings.length, warnings: 0, infos: 0, findings },
  gate: { cleared: false, blockers: ['Open validation errors block dispatch.'] },
});
const cleared = (sequenceId: number, sequenceStatus: string) => ({
  ...blocked(sequenceId, []), sequenceStatus, validationErrors: 0, readiness: { errors: 0, warnings: 0, infos: 0, findings: [] },
  gate: { cleared: true, blockers: [] },
});

const IND_FINDINGS = [
  finding('error', 'MISSING_REQUIRED_SECTION', '1.2', 'Required section 1.2 has no leaf in this sequence.'),
  finding('error', 'UNRESOLVED_DOCUMENT', '2.7.3', 'The leaf at 2.7.3 points at a document that no longer exists.'),
  finding('error', 'CROSS_REFERENCE_LOA_MISSING', '1.4.1', 'A cross-referenced application has no letter of authorization on file.'),
  finding('error', 'EMPTY_SEQUENCE', null, 'The sequence has no dispatchable leaf.'),
  finding('warning', 'DOCUMENT_NOT_APPROVED', '2.5', 'The document at 2.5 is not approved.'),
];
const MAA_FINDINGS = [finding('error', 'MISSING_REQUIRED_SECTION', '1.0', 'Required section 1.0 has no leaf in this sequence.')];

function serve(over: { ind?: unknown; maa?: unknown; maaVerdictFails?: boolean; indStatus?: string } = {}) {
  apiRequest.mockImplementation(async (_m: string, raw: unknown) => {
    const url = String(raw ?? '');
    if (url === `/api/c2c/projects/${PROGRAM_UUID}`) return json(PROGRAM);
    if (url === `/api/submissions?programId=${PROGRAM_UUID}`) return json([IND, MAA]);
    if (url === '/api/submissions') return json([TRAP]);
    if (url === '/api/submissions/61/sequences') return json([{ id: 905, sequenceNumber: '0000', status: over.indStatus ?? 'draft' }]);
    if (url === '/api/submissions/62/sequences') return json([{ id: 906, sequenceNumber: '0000', status: 'draft' }]);
    if (url === '/api/submissions/sequences/905/dispatch-readiness') return json(over.ind ?? blocked(905, IND_FINDINGS));
    if (url === '/api/submissions/sequences/906/dispatch-readiness') {
      return over.maaVerdictFails ? json({ error: 'unavailable' }, 503) : json(over.maa ?? blocked(906, MAA_FINDINGS));
    }
    return json([]);
  });
}

const text = () => document.body.textContent ?? '';
const marketRow = (id: number) => document.querySelector(`[data-market="${id}"]`) as HTMLElement;
const renderScreen = (onAsk = vi.fn(), onNav = vi.fn()) => {
  render(<DispatchReadiness surface={{ id: 'dispatch-readiness', label: 'Submission Readiness' } as never} onAsk={onAsk} onNav={onNav} segment="regulatory" />);
  return { onAsk, onNav };
};

beforeEach(() => {
  apiRequest.mockReset();
  clearNavParams();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM_UUID };
});
afterEach(() => {
  cleanup();
  clearNavParams();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('F18: readiness is the project’s markets in one list', () => {
  it('lists every market from the scoped list, each with its own gate, and never reads the unscoped list', async () => {
    serve();
    renderScreen();
    await waitFor(() => expect(within(marketRow(62)).getByText('Required section 1.0 has no leaf in this sequence.')).toBeTruthy());
    expect(within(marketRow(61)).getByText('Required section 1.2 has no leaf in this sequence.')).toBeTruthy();
    expect(text()).not.toContain('Another project’s NDA');
    expect(apiRequest.mock.calls.some(([, u]) => String(u) === '/api/submissions')).toBe(false);
  });
});

describe('F18: each finding’s act opens where it is fixed', () => {
  const click = async (market: number, name: RegExp) => {
    const row = marketRow(market);
    fireEvent.click(within(row).getByRole('button', { name }));
    return consumeNavParams('submission-center');
  };

  it('a missing section opens the Builder’s placement form at that section, on that market’s sequence', async () => {
    serve();
    const { onNav } = renderScreen();
    await waitFor(() => expect(marketRow(61)).toBeTruthy());
    await screen.findByRole('button', { name: 'Place a leaf at 1.2 for IND · FDA (US)' });
    expect(await click(61, /^Place a leaf at 1\.2 /)).toEqual({ submissionId: '61', sequenceId: '905', ws: 'builder', builderAct: 'place', sectionCode: '1.2' });
    expect(onNav).toHaveBeenCalledWith('submission-center');
  });

  it('a defect on a placed leaf marks that leaf; a placement could not fix it', async () => {
    serve();
    renderScreen();
    await screen.findByRole('button', { name: /^Open the leaf at 2\.7\.3 / });
    expect(await click(61, /^Open the leaf at 2\.7\.3 /)).toEqual({ submissionId: '61', sequenceId: '905', ws: 'builder', builderAct: 'leaf', sectionCode: '2.7.3' });
  });

  it('a missing letter of authorization opens Validation, never a placement that would not clear it', async () => {
    serve();
    renderScreen();
    await screen.findByRole('button', { name: /^Place a leaf at 1\.2 / });
    const loa = within(marketRow(61)).getByText(/no letter of authorization/).closest('[data-finding]') as HTMLElement;
    fireEvent.click(within(loa).getByRole('button', { name: /^Open in Validation / }));
    expect(consumeNavParams('submission-center')).toEqual({ submissionId: '61', sequenceId: '905', ws: 'validation' });
  });

  it('an empty sequence opens the placement form with no section named', async () => {
    serve();
    renderScreen();
    await screen.findByRole('button', { name: /^Place a leaf for IND/ });
    expect(await click(61, /^Place a leaf for IND/)).toEqual({ submissionId: '61', sequenceId: '905', ws: 'builder', builderAct: 'place' });
  });

  it('a warning has no act', async () => {
    serve();
    renderScreen();
    const warning = (await screen.findByText('The document at 2.5 is not approved.')).closest('[data-finding]') as HTMLElement;
    expect(within(warning).queryByRole('button')).toBeNull();
  });

  it('the second market’s finding opens that market’s submission and sequence, never the first’s', async () => {
    serve();
    renderScreen();
    await screen.findByRole('button', { name: /^Place a leaf at 1\.0 / });
    expect(await click(62, /^Place a leaf at 1\.0 /)).toEqual({ submissionId: '62', sequenceId: '906', ws: 'builder', builderAct: 'place', sectionCode: '1.0' });
  });

  it('nothing on the screen asks AnA to do the work', async () => {
    serve();
    const { onAsk } = renderScreen();
    await screen.findByRole('button', { name: /^Place a leaf at 1\.2 / });
    for (const b of screen.getAllByRole('button')) fireEvent.click(b);
    expect(onAsk).not.toHaveBeenCalled();
  });
});

describe('F18: a cleared gate opens the sequence’s Dispatch tab, named for what it is', () => {
  it('before dispatch: "Open Dispatch for sequence 0000", and transmit is not promised', async () => {
    serve({ ind: cleared(905, 'validated') });
    renderScreen();
    const b = await screen.findByRole('button', { name: 'Open Dispatch for sequence 0000 of IND · FDA (US)' });
    expect(within(marketRow(61)).getByText(/Transmit opens once sequence 0000 is dispatched/)).toBeTruthy();
    expect(within(marketRow(61)).queryByRole('button', { name: /governed transmit/ })).toBeNull();
    fireEvent.click(b);
    expect(consumeNavParams('submission-center')).toEqual({ submissionId: '61', sequenceId: '905', ws: 'dispatch' });
  });

  it('once dispatched: "Open governed transmit"', async () => {
    serve({ ind: cleared(905, 'dispatched'), indStatus: 'dispatched' });
    renderScreen();
    expect(await screen.findByRole('button', { name: 'Open governed transmit for IND · FDA (US)' })).toBeTruthy();
  });

  it('a blocked gate offers neither', async () => {
    serve();
    renderScreen();
    await screen.findByRole('button', { name: /^Place a leaf at 1\.2 / });
    expect(screen.queryByRole('button', { name: /Open Dispatch|governed transmit/ })).toBeNull();
  });
});

describe('F18: what AnA is told', () => {
  it('a market whose verdict could not be read is unanswered, never cleared', async () => {
    serve({ ind: cleared(905, 'validated'), maaVerdictFails: true });
    const seen: { ctx: SurfaceContext | null } = { ctx: null };
    function Probe() {
      seen.ctx = useActiveSurfaceContext('dispatch-readiness');
      return null;
    }
    render(<><DispatchReadiness surface={{ id: 'dispatch-readiness', label: 'Submission Readiness' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="regulatory" /><Probe /></>);
    await waitFor(() => expect((seen.ctx?.facts?.markets as unknown[] | undefined)?.length).toBe(2));
    await waitFor(() => expect((seen.ctx?.facts?.markets as Array<Record<string, unknown>>)[1].readState).toBe('verdict-failed'));
    const [ind, maa] = seen.ctx!.facts!.markets as Array<Record<string, unknown>>;
    expect(ind).toMatchObject({ submissionId: 61, answered: true, cleared: true, sequenceNumber: '0000' });
    expect(maa).toMatchObject({ submissionId: 62, answered: false });
    expect(maa).not.toHaveProperty('cleared');
    expect(seen.ctx!.summary).toContain('MAA · EU (EMA)');
    expect(seen.ctx!.summary).toContain('No verdict · the readiness read failed');
  });
});

describe('F18 end to end: the act lands on the Builder at the section', () => {
  it('"Place a leaf at 1.2" opens the Submission Center on sequence 0000 with Section filled in', async () => {
    serve();
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /^Place a leaf at 1\.2 / }));
    cleanup();
    apiRequest.mockImplementation(async (_m: string, raw: unknown) => {
      const url = String(raw ?? '').split('?')[0];
      if (url === '/api/submissions') return json([IND, MAA]);
      if (url === '/api/submissions/61/sequences') return json([{ id: 905, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'fda', validationStatus: null }]);
      if (url === '/api/submissions/sequences/905/leaves') return json([]);
      if (url === '/api/coauthor/documents') return json({ documents: [{ id: 7, title: 'Form FDA 1571', moduleNumber: null, status: 'approved' }], total: 1 });
      return json([]);
    });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect((document.getElementById('sc-leaf-section') as HTMLInputElement | null)?.value).toBe('1.2'));
    expect(screen.getByRole('tab', { name: 'Builder' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement?.getAttribute('data-testid')).toBe('sc-builder-arrival');
  });
});
