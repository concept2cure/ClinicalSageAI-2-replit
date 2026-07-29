/**
 * @vitest-environment jsdom
 */
/**
 * useTriageQueue — postmarket reporting clocks.
 *
 * The vigilance surface rendered its reporting clocks from fixtures
 * while /api/capa-mdr — complaints, MDR reportability, CAPA actions and
 * a real due-date computation — was fully built and consumed by nothing.
 *
 * MDR reporting windows are statutory (FDA 5-day and 30-day; EU MDR
 * Article 87 15-day), so a fabricated clock is not a placeholder — it is
 * a countdown to a missed legal obligation shown as though it were real.
 *
 * The property these tests protect: the browser reports the server's
 * clock and never computes its own.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTriageQueue, type TriageItem } from '../useTriageQueue';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function item(over: Partial<TriageItem>): TriageItem {
  return {
    kind: 'mdr',
    id: 'x',
    programId: 'p',
    code: 'MDR-001',
    title: 'Event',
    state: 'open',
    riskOrSeverity: 'serious',
    receivedOrOpenedAt: '2026-07-01T00:00:00Z',
    dueAt: '2026-08-01T00:00:00Z',
    daysToDue: 6,
    overdue: false,
    ...over,
  };
}

function respondWith(items: TriageItem[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ items, count: items.length }),
    text: async () => '',
  });
}

describe('useTriageQueue', () => {
  it('requests the open queue for the whole portfolio by default', async () => {
    respondWith([]);
    renderHook(() => useTriageQueue());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/capa-mdr/triage');
  });

  it('narrows to a program when given one', async () => {
    respondWith([]);
    renderHook(() => useTriageQueue({ programId: 'prog-1' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain('program_id=prog-1');
  });

  it('asks for closed items only when explicitly requested', async () => {
    respondWith([]);
    renderHook(() => useTriageQueue({ includeClosed: true }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain('open_only=false');
  });

  it('reports the server overdue flag rather than recomputing it', async () => {
    /* The critical property. A browser with a skewed clock must not be
       able to move a statutory deadline in either direction — so an item
       the server calls overdue is overdue here even though its dueAt is
       in the future, and vice versa. */
    respondWith([
      item({ id: 'a', overdue: true, dueAt: '2099-01-01T00:00:00Z', daysToDue: 99999 }),
      item({ id: 'b', overdue: false, dueAt: '2000-01-01T00:00:00Z', daysToDue: -9999 }),
    ]);
    const { result } = renderHook(() => useTriageQueue());
    await waitFor(() => expect(result.current.items.status).toBe('ready'));

    expect(result.current.overdue.map((i) => i.id)).toEqual(['a']);
  });

  it('buckets due-soon items without double-counting the overdue ones', async () => {
    respondWith([
      item({ id: 'over', overdue: true, daysToDue: -2 }),
      item({ id: 'soon', overdue: false, daysToDue: 3 }),
      item({ id: 'later', overdue: false, daysToDue: 30 }),
    ]);
    const { result } = renderHook(() => useTriageQueue());
    await waitFor(() => expect(result.current.items.status).toBe('ready'));

    expect(result.current.dueSoon.map((i) => i.id)).toEqual(['soon']);
    expect(result.current.overdue.map((i) => i.id)).toEqual(['over']);
  });

  it('honours a caller-supplied due-soon window', async () => {
    respondWith([item({ id: 'd10', overdue: false, daysToDue: 10 })]);
    const { result } = renderHook(() => useTriageQueue({ soonDays: 14 }));
    await waitFor(() => expect(result.current.items.status).toBe('ready'));
    expect(result.current.dueSoon.map((i) => i.id)).toEqual(['d10']);
  });

  it('excludes items with no due date from due-soon', async () => {
    /* Complaints carry no statutory clock; they must not be presented as
       though a deadline were running. */
    respondWith([item({ kind: 'complaint', id: 'c', dueAt: null, daysToDue: null })]);
    const { result } = renderHook(() => useTriageQueue());
    await waitFor(() => expect(result.current.items.status).toBe('ready'));

    expect(result.current.dueSoon).toEqual([]);
    expect(result.current.overdue).toEqual([]);
  });

  it('excludes a negative daysToDue the server did not call overdue', async () => {
    /* e.g. a CAPA past its target date but already closed — past its
       date, yet not an open obligation. */
    respondWith([item({ kind: 'capa', id: 'k', overdue: false, daysToDue: -5 })]);
    const { result } = renderHook(() => useTriageQueue());
    await waitFor(() => expect(result.current.items.status).toBe('ready'));

    expect(result.current.dueSoon).toEqual([]);
  });

  it('surfaces an empty queue as empty, never as an all-clear fixture', async () => {
    respondWith([]);
    const { result } = renderHook(() => useTriageQueue());
    await waitFor(() => expect(result.current.items.status).toBe('empty'));
  });

  it('surfaces a failed fetch as an error, not as zero overdue items', async () => {
    /* The dangerous read: "0 overdue" from a failed request looks
       identical to a genuine all-clear. */
    fetchMock.mockResolvedValue({
      ok: false, status: 500, json: async () => ({}), text: async () => 'boom',
    });
    const { result } = renderHook(() => useTriageQueue());
    await waitFor(() => expect(result.current.items.status).toBe('error'));
    expect(result.current.error).toContain('500');
  });
});
