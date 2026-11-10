// @vitest-environment jsdom
/**
 * P-122 (2026-11-10): everything CMC holds is visible on the CMC page.
 *
 * ── What was hidden ───────────────────────────────────────────────────────────
 * D5-1 (`94f24dba0`) split the nine destinations into two halves and rendered
 * only the open half's tabs. CMC opened on Overview with four tabs; the five
 * Study records tabs — which hold all eighteen registers — appeared only after
 * a "Study records" toggle, so a first-time viewer saw no register at all. The
 * same commit removed each tab's printed "What to do now" sentence and its
 * "Next step" door; the sentence survived only as an AnA fact.
 *
 * ── What must be true ─────────────────────────────────────────────────────────
 *   • all nine tabs are in one tab row, whichever tab is open, and no toggle
 *     stands between a person and a register;
 *   • each tab prints its own "what to do now" as one quiet line, with its
 *     action: the next destination in the order the work is done;
 *   • the last destination offers no next step it does not have.
 *
 * Drives the real surface, as the shell mounts it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A' } }),
}));

import type { SurfaceViewProps } from '../surfaceViews';
import { CmcModule } from '../surfaces/CmcModule';

const ALL_NINE = [
  'Overview', 'Substance & product', 'Specifications', 'Stability', 'Batch records',
  'Change control', 'Quality by design', 'Module 3 build', 'Approvals & audit',
];

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

function renderCmc() {
  return render(
    <CmcModule
      surface={{ id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface']}
      onAsk={vi.fn()}
      onNav={vi.fn()}
      segment="biotech"
    />,
  );
}

const tabRow = () => screen.getByRole('tablist', { name: 'CMC / Module 3' });
const tabNames = () => within(tabRow()).getAllByRole('tab').map((t) => t.textContent?.trim());
const nowLine = () => screen.getByTestId('cm-now');

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => res({ success: true, data: [] }));
});
afterEach(() => cleanup());

describe('CMC shows every destination at once', () => {
  it('opens with all nine tabs in one row, and no toggle in front of the registers', async () => {
    renderCmc();
    await waitFor(() => expect(tabNames()).toEqual(ALL_NINE));
    expect(screen.queryByRole('button', { name: 'Study records' })).toBeNull();
    expect(screen.queryAllByRole('tablist')).toHaveLength(1);
  });

  it('keeps all nine in the row whichever tab is open', async () => {
    renderCmc();
    fireEvent.click(within(tabRow()).getByRole('tab', { name: 'Stability' }));
    await waitFor(() => expect(within(tabRow()).getByRole('tab', { name: 'Stability' }).getAttribute('aria-selected')).toBe('true'));
    expect(tabNames()).toEqual(ALL_NINE);
  });
});

describe('each tab says what to do now, with its action', () => {
  it('prints the open tab’s sentence as one quiet line, and its next step', async () => {
    renderCmc();
    await waitFor(() => expect(nowLine().textContent).toMatch(/Start here\./));
    expect(nowLine().tagName).toBe('P');
    const next = within(nowLine()).getByRole('button', { name: /Next step: Substance & product/ });
    fireEvent.click(next);
    await waitFor(() => expect(nowLine().textContent).toMatch(/Record the substance and the product/));
    expect(within(tabRow()).getByRole('tab', { name: 'Substance & product' }).getAttribute('aria-selected')).toBe('true');
  });

  it('walks the work in order, and the last destination has no next step', async () => {
    renderCmc();
    const order: string[] = [];
    for (let i = 0; i < ALL_NINE.length - 1; i += 1) {
      const next = within(nowLine()).getByRole('button', { name: /^Next step: / });
      order.push((next.getAttribute('aria-label') ?? '').replace(/^Next step: /, ''));
      fireEvent.click(next);
    }
    expect(order).toEqual(ALL_NINE.slice(1));
    await waitFor(() => expect(nowLine().textContent).toMatch(/Read what was done and by whom/));
    expect(within(nowLine()).queryByRole('button')).toBeNull();
  });
});
