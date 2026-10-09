// @vitest-environment jsdom
/**
 * An action AnA sends to a screen the person is not on arrives while that
 * screen's read is in flight. The screen holds it (`retry: true`) and must
 * answer it once the read settles: applied on a good read, refused with the
 * screen's own reason on a failed one.
 *
 * Seen in the browser (docs/evidence/W1/2026-09-28-ana-drive/held-actions.txt):
 * the Inconsistency overlay, switched from another screen, never switched,
 * and AnA was told "not confirmed". Two screens held and never answered;
 * sixteen answered only a good read. surfaceReadySignal.test.ts pins the
 * contract on every screen's source; these mount one of each kind.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Biostatistics } from '../surfaces/Biostatistics';
import { CroPortfolio } from '../surfaces/CroPortfolio';
import { Inconsistency } from '../surfaces/Inconsistency';
import { __resetSurfaceActionBus, applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const serverError = () => ({ ok: false, status: 500, json: async () => ({ success: false }) }) as Response;

/** A read that answers when the test says so, so the action arrives while it is in flight. */
function readInFlight() {
  let answer!: (r: Response) => void;
  const promise = new Promise<Response>((resolve) => (answer = resolve));
  return { promise, answer };
}

/** The path under test, with or without a query string (not a longer path under it). */
const isPath = (url: unknown, path: string) => String(url) === path || String(url).startsWith(`${path}?`);

/** Serve `read` for the one path under test, and an honest empty for every other read. */
function serve(path: string, read: Promise<Response>) {
  apiRequest.mockImplementation(async (_method: string, url: string) => (isPath(url, path) ? read : ok(null)));
}

/** Send an action from another screen, as a drive does: the bus stashes it and heads there. */
function sendFromElsewhere(actionId: string, params: Record<string, string>) {
  const res = resolveSurfaceAction(actionId, params);
  if (!res.ok) throw new Error(`${actionId} does not resolve`);
  const outcome = vi.fn();
  expect(applySurfaceAction(res.directive, vi.fn(), outcome)).toEqual({ status: 'stashed' });
  return outcome;
}

const props = (id: string) => ({ surface: { id }, onAsk: vi.fn(), onNav: vi.fn() }) as any;

/** The screen has asked for its data, and the action has been tried and held. */
async function heldWhileLoading(path: string, outcome: ReturnType<typeof vi.fn>) {
  await waitFor(() => expect(apiRequest.mock.calls.some(([, url]) => isPath(url, path))).toBe(true));
  expect(outcome, 'answered before the read settled').not.toHaveBeenCalled();
}

beforeEach(() => {
  __resetSurfaceActionBus();
  apiRequest.mockReset();
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('a screen that held and never answered', () => {
  it('Inconsistency: an overlay switch lands when the board arrives', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: '1', code: 'C2C-101' };
    const board = readInFlight();
    const BOARD = '/api/governed-intelligence-inconsistency/projects/1/inconsistency';
    serve(BOARD, board.promise);
    const outcome = sendFromElsewhere('inconsistency.set-regulator', { regulator: 'EMA' });
    render(<Inconsistency {...props('inconsistency')} />);
    await heldWhileLoading(BOARD, outcome);

    board.answer(ok({ program: { projectId: 1, code: 'C2C-101' }, findings: [], assumptions: [], decisions: [], checks: [] }));
    await waitFor(() => expect(outcome).toHaveBeenCalledWith(expect.objectContaining({ status: 'applied' })));
    expect(document.querySelector('.gi-reg-b.on')?.textContent).toBe('EMA');
  });

  it('Biostatistics: a design named while the list loads is loaded when it arrives', async () => {
    const designs = readInFlight();
    serve('/api/biostat-bridge/designs', designs.promise);
    const outcome = sendFromElsewhere('biostatistics.load-design', { design: 'Phase 2 dose finding' });
    render(<Biostatistics {...props('biostatistics')} />);
    await heldWhileLoading('/api/biostat-bridge/designs', outcome);

    const readiness = { percent: 80, checks: [], plannedSampleSize: 120, power: 0.8, alpha: 0.05, primaryEndpoint: 'ORR' };
    designs.answer(ok([{ studyId: 'S-7', programId: null, title: 'Phase 2 dose finding', phase: '2', indication: 'NSCLC', status: 'draft', updatedAt: null, readiness }]));
    await waitFor(() =>
      expect(outcome).toHaveBeenCalledWith(expect.objectContaining({ status: 'applied', detail: expect.stringContaining('Phase 2 dose finding') })),
    );
  });
});

describe('a screen that answered only a good read', () => {
  it('CRO portfolio: a sponsor named while the roster loads is refused with the reason when the read fails', async () => {
    const roster = readInFlight();
    serve('/api/cro-portfolio', roster.promise);
    const outcome = sendFromElsewhere('cro-portfolio.select-sponsor', { sponsor: 'Aldena Bio' });
    render(<CroPortfolio {...props('cro-portfolio')} />);
    await heldWhileLoading('/api/cro-portfolio', outcome);

    roster.answer(serverError());
    await waitFor(() =>
      expect(outcome).toHaveBeenCalledWith({
        status: 'failed',
        reason: 'The sponsor roster did not load, so there are no sponsors to select from.',
      }),
    );
  });
});
