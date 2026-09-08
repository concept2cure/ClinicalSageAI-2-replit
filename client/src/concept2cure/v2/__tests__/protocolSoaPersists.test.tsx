// @vitest-environment jsdom
/**
 * The schedule-of-assessments grid writes what it shows.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * ProtocolDev.tsx:211 — every assessment × visit cell was
 *   onClick={() => toggle(a.id, v.id)}  with  toggle = setCells(…)
 * and nothing else. A user built the entire schedule of assessments, watched
 * the grid and the per-visit totals update, and lost all of it on reload with
 * no warning at all. POST /api/protocol-soa/cells and /cells/clear had existed
 * since capability C2C-21 and had no caller.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * That a tick reaches the governed router with the ids and the reason, that
 * clearing a set cell goes to /cells/clear rather than setting it again, that
 * the grid is inert until a governed reason is present, and — the one that
 * matters most — that a REFUSED write is reverted, so the grid never shows a
 * cell the record does not have.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SoaTab } from '../surfaces/ProtocolDev';

const DOC = {
  soa: {
    assessments: [{ id: '31', label: 'ECG', cat: 'safety' }, { id: '32', label: 'PK sample', cat: 'pk' }],
    visits: [{ id: '11', label: 'Screening', day: 'Day -28' }, { id: '12', label: 'Cycle 1 Day 1', day: 'Day 1' }],
    cells: { '31': ['11'] },
    issues: [],
  },
};

const REASON = 'Adding PK sampling at C1D1 per the amended design';

function cell(assessment: string, visit: string) {
  const row = screen.getAllByRole('row').find((r) => r.textContent?.startsWith(assessment))!;
  const cells = Array.from(row.querySelectorAll('td'));
  const idx = visit === 'Screening' ? 0 : 1;
  return cells[idx];
}

function mount() {
  return render(<SoaTab doc={DOC as never} canWrite onError={() => {}} />);
}

afterEach(() => cleanup());
beforeEach(() => { apiRequest.mockReset(); });

describe('SoaTab — every tick is a governed write', () => {
  it('is inert until a governed reason for change is entered', async () => {
    mount();
    const c = cell('PK sample', 'Cycle 1 Day 1');
    expect(c.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(c);
    expect(apiRequest).not.toHaveBeenCalled();
    expect(c.getAttribute('aria-checked')).toBe('false');
  });

  it('sets a cell through POST /api/protocol-soa/cells, carrying the numeric ids and the reason', async () => {
    apiRequest.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 5 }) });
    mount();
    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(cell('PK sample', 'Cycle 1 Day 1'));
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [method, path, body] = apiRequest.mock.calls[0];
    expect(method).toBe('POST');
    expect(path).toBe('/api/protocol-soa/cells');
    expect(body).toEqual({ assessmentId: 32, visitId: 12, required: true, reason: REASON });
    await waitFor(() => expect(cell('PK sample', 'Cycle 1 Day 1').getAttribute('aria-checked')).toBe('true'));
  });

  it('clearing an already-set cell goes to /cells/clear, not back to /cells', async () => {
    apiRequest.mockResolvedValue({ ok: true, status: 201, json: async () => ({ cleared: true }) });
    mount();
    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: REASON } });
    // ECG × Screening is set in the stored matrix.
    expect(cell('ECG', 'Screening').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(cell('ECG', 'Screening'));
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, path, body] = apiRequest.mock.calls[0];
    expect(path).toBe('/api/protocol-soa/cells/clear');
    expect(body).toEqual({ assessmentId: 31, visitId: 11, reason: REASON });
  });

  it('reverts the tick when the server refuses — the grid never shows a cell the record lacks', async () => {
    apiRequest.mockResolvedValue({
      ok: false, status: 403,
      json: async () => ({ error: { code: 'FORBIDDEN', message: 'The protocol is finalized.' } }),
    });
    const errors: string[] = [];
    render(<SoaTab doc={DOC as never} canWrite onError={(m) => errors.push(m)} />);
    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(cell('PK sample', 'Cycle 1 Day 1'));
    await waitFor(() => expect(errors.length).toBe(1));
    expect(errors[0]).toMatch(/not saved.*finalized.*unchanged/i);
    await waitFor(() =>
      expect(cell('PK sample', 'Cycle 1 Day 1').getAttribute('aria-checked')).toBe('false'),
    );
  });

  it('says the grid is read-only when the protocol has no governed id', () => {
    render(<SoaTab doc={DOC as never} canWrite={false} onError={() => {}} />);
    expect(screen.getByText(/no governed document id/)).toBeTruthy();
    expect(screen.queryByLabelText(/Reason for change/)).toBeNull();
  });
});
