// @vitest-environment jsdom
/** S1: the project's objective of record, read for the project page's
 * `ProjectObjective` block (D3 §4.3). The hook reads the charter route
 * (GET /api/charters/by-project/:ref/objectives) and nothing else, and keeps its
 * four states apart: reading, failed (with a retry), none, stated. A failed or
 * malformed read is never shown as "not stated", and one project's objective is
 * never shown while another's is being read. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { useProjectObjective, type ObjectiveRead } from '../surfaces/projectSettingsRequest';

const PROGRAM = '6191805f-e83d-4327-af00-aa2c6f4d43b0';
const OTHER = '7abb1c22-1111-4222-8333-444455556666';
const url = (pid: string) => `/api/charters/by-project/${pid}/objectives`;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const failed = (status: number) => ({ ok: false, status, json: async () => ({ success: false, error: 'CHARTER_OBJECTIVES_UNAVAILABLE' }) }) as Response;

function record(over: { sources?: unknown[]; current?: unknown; canChange?: boolean } = {}) {
  const content = {
    objective: 'Show BX-204 meets its primary endpoint in the phase 2 study, and file the IND.',
    successCriteria: null,
    sources: over.sources ?? [{ kind: 'protocol', title: 'Protocol BX-204-201', locator: 'Section 2.1' }],
  };
  return {
    success: true,
    data: {
      charterId: 4,
      current: over.current === undefined
        ? { content, version: 2, contentHash: 'a'.repeat(64), status: 'draft', updatedAt: '2026-11-01T09:30:00.000Z', updatedBy: 7, recordedBy: 'Rae Writer', locked: false }
        : over.current,
      history: [
        { version: 2, eventType: 'updated', occurredAt: '2026-11-01T09:30:00.000Z', actorUserId: 7, recordedBy: 'Rae Writer', reason: 'The sponsor widened the filing', content },
        { version: 1, eventType: 'created', occurredAt: '2026-10-30T09:00:00.000Z', actorUserId: 9, recordedBy: 'user 9', reason: 'Stated when the project was created.', content: { ...content, objective: 'File the IND.' } },
      ],
      canChange: over.canChange ?? true,
    },
  };
}

let seen: ObjectiveRead[] = [];
function Probe({ pid }: { pid: string | null }) {
  const read = useProjectObjective(pid);
  seen.push(read);
  return (
    <div>
      {/* JSON leaves out the retry function: the state as data. */}
      <pre data-testid="read">{JSON.stringify(read)}</pre>
      {read.state === 'failed' && <button type="button" onClick={read.retry}>Retry</button>}
    </div>
  );
}
const shown = () => JSON.parse(screen.getByTestId('read').textContent || '{}') as Record<string, unknown>;

beforeEach(() => { apiRequest.mockReset(); seen = []; });
afterEach(cleanup);

describe('useProjectObjective: the objective of record, for the project page', () => {
  it('reads the charter route for this project and gives the stated objective, its version, source and recorder', async () => {
    apiRequest.mockImplementation(async (_m: string, u: string) => (u === url(PROGRAM) ? ok(record()) : failed(404)));
    render(<Probe pid={PROGRAM} />);
    expect(shown()).toEqual({ state: 'reading' });
    await waitFor(() => expect(shown().state).toBe('stated'));
    expect(shown()).toMatchObject({
      state: 'stated',
      text: 'Show BX-204 meets its primary endpoint in the phase 2 study, and file the IND.',
      version: 2,
      source: { kind: 'protocol', label: 'Protocol BX-204-201, Section 2.1' },
      recordedBy: 'Rae Writer',
      recordedAt: '2026-11-01T09:30:00.000Z',
      canChange: true,
    });
    // The previous versions travel with it, for the settings drawer's list.
    expect((shown().versions as Array<{ version: number; reason: string; recordedBy: string }>).map((v) => [v.version, v.reason, v.recordedBy]))
      .toEqual([[2, 'The sponsor widened the filing', 'Rae Writer'], [1, 'Stated when the project was created.', 'user 9']]);
    expect(apiRequest.mock.calls.map(([method, u]) => [method, u])).toEqual([['GET', url(PROGRAM)]]);
  });

  it('says "none" when nothing is recorded, with whether this person may state it', async () => {
    apiRequest.mockResolvedValue(ok({ success: true, data: { charterId: null, current: null, history: [], canChange: false } }));
    render(<Probe pid={PROGRAM} />);
    await waitFor(() => expect(shown()).toEqual({ state: 'none', canChange: false }));
  });

  it('names the source honestly: a statement with no document, or the first of several sources', async () => {
    apiRequest.mockResolvedValueOnce(ok(record({ sources: [] })));
    const { unmount } = render(<Probe pid={PROGRAM} />);
    await waitFor(() => expect(shown().source).toEqual({ kind: 'person', label: 'a statement, with no document cited' }));
    unmount();
    apiRequest.mockResolvedValueOnce(ok(record({ sources: [
      { kind: 'registry', title: 'ClinicalTrials.gov NCT00000000', url: 'https://clinicaltrials.gov/study/NCT00000000' },
      { kind: 'protocol', title: 'Protocol BX-204-201' },
      { kind: 'press_release', title: 'Sponsor release' },
    ] })));
    render(<Probe pid={PROGRAM} />);
    await waitFor(() => expect(shown().source).toEqual({ kind: 'registry', label: 'ClinicalTrials.gov NCT00000000 and 2 more sources' }));
  });

  it('fails, never "none", when the read fails or the answer is not an objectives record, and retries on request', async () => {
    apiRequest.mockResolvedValueOnce(failed(500));
    render(<Probe pid={PROGRAM} />);
    await waitFor(() => expect(shown()).toEqual({ state: 'failed' }));
    apiRequest.mockResolvedValueOnce(ok({ success: true, data: { charterId: 4, current: { content: { objective: 7 } } } }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(shown()).toEqual({ state: 'failed' }));
    apiRequest.mockResolvedValueOnce(ok(record()));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(shown().state).toBe('stated'));
    expect(seen.some((r) => r.state === 'none')).toBe(false);
  });

  it("never shows one project's objective while another's is read", async () => {
    let release: (r: Response) => void = () => undefined;
    apiRequest.mockImplementation(async (_m: string, u: string) => (u === url(PROGRAM)
      ? ok(record())
      : new Promise<Response>((resolve) => { release = resolve; })));
    const { rerender } = render(<Probe pid={PROGRAM} />);
    await waitFor(() => expect(shown().state).toBe('stated'));
    seen = [];
    rerender(<Probe pid={OTHER} />);
    expect(shown()).toEqual({ state: 'reading' });
    expect(seen.every((r) => r.state === 'reading')).toBe(true);
    await act(async () => { release(ok({ success: true, data: { charterId: null, current: null, history: [], canChange: true } })); });
    await waitFor(() => expect(shown()).toEqual({ state: 'none', canChange: true }));
  });

  it('reads nothing with no project', () => {
    render(<Probe pid={null} />);
    expect(shown()).toEqual({ state: 'reading' });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
