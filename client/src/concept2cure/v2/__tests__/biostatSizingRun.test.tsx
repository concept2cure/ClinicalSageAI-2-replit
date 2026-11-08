// @vitest-environment jsdom
/**
 * The stored run behind a design's planned N, and its reproduction (R1, 2026-11-06).
 *
 * GET /api/biostat-bridge/computation-runs/:runId/reproduce was served and nothing called it. The design card now
 * names the run the assessment names, and asks the server to recompute it on request. Each of the four facts is said
 * on its own; a design whose N differs from its run's says both; a failed read is said as one. Nothing here computes.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SizingRunCheck } from '../surfaces/biostatSizingRun';
import type { DesignAssessment } from '../surfaces/biostatBridge';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const REPRODUCE = '/api/biostat-bridge/computation-runs/12/reproduce';
const FOUND = { state: 'found' as const, runId: 12, recordedAt: '2026-11-06T09:30:00.000Z', plannedSampleSize: 444 };

const assessment = (sizingRun: DesignAssessment['sizingRun'], plannedSampleSize: number | null = 444) =>
  ({ readiness: { plannedSampleSize }, sizingRun }) as unknown as DesignAssessment;

beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

describe('the run line', () => {
  it('names the stored run and its figure, and reads nothing until asked', () => {
    render(<SizingRunCheck assessment={assessment(FOUND)} />);
    expect(screen.getByText('Stored run #12, 2026-11-06, computed 444 subjects.')).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('says both figures when the design’s N was changed after the run', () => {
    render(<SizingRunCheck assessment={assessment(FOUND, 500)} />);
    expect(screen.getByText('The design records 500; the run computed 444. The design’s figure was changed after the run.')).toBeTruthy();
  });

  it('says when no stored run computed the planned N, and when the run could not be read', () => {
    const { unmount } = render(<SizingRunCheck assessment={assessment({ state: 'none' })} />);
    expect(screen.getByText('No stored engine run is recorded for the planned N of 444.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check it reproduces' })).toBeNull();
    unmount();
    render(<SizingRunCheck assessment={assessment({ state: 'unreadable' })} />);
    expect(screen.getByText('The stored run behind the planned N could not be read.')).toBeTruthy();
    expect(screen.queryByText(/No stored engine run/)).toBeNull();
  });

  it('shows nothing for a design with no N and no run, or from a server that does not name runs', () => {
    const { container, unmount } = render(<SizingRunCheck assessment={assessment({ state: 'none' }, null)} />);
    expect(container.textContent).toBe('');
    unmount();
    const older = render(<SizingRunCheck assessment={assessment(undefined)} />);
    expect(older.container.textContent).toBe('');
  });
});

describe('the reproduction', () => {
  it('asks the server about this run and says each fact', async () => {
    apiRequest.mockResolvedValue(ok({ data: { found: true, runId: 12, inputsIntact: true, outputsIntact: true, reproduced: true, engineVersionMatches: true } }));
    render(<SizingRunCheck assessment={assessment(FOUND)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check it reproduces' }));
    const facts = await screen.findByRole('list', { name: 'Reproduction of stored run #12' });
    expect(apiRequest).toHaveBeenCalledWith('GET', REPRODUCE);
    expect(facts.textContent).toContain('Stored inputs: intact');
    expect(facts.textContent).toContain('Stored outputs: intact');
    expect(facts.textContent).toContain('Recomputed: the engine gives the stored result again');
    expect(facts.textContent).toContain('Engine version: the same as the run’s');
  });

  it('says which fact failed, in its own words', async () => {
    apiRequest.mockResolvedValue(ok({ data: { found: true, runId: 12, inputsIntact: true, outputsIntact: false, reproduced: false, engineVersionMatches: false } }));
    render(<SizingRunCheck assessment={assessment(FOUND)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check it reproduces' }));
    const facts = await screen.findByRole('list', { name: 'Reproduction of stored run #12' });
    expect(facts.textContent).toContain('Stored inputs: intact');
    expect(facts.textContent).toContain('Stored outputs: changed since the run (their digest no longer matches)');
    expect(facts.textContent).toContain('Recomputed: the engine gives a different result');
    expect(facts.textContent).toContain('Engine version: changed since the run');
  });

  it('says a failed or empty reply as a failure, never as a pass', async () => {
    apiRequest.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'NOT_FOUND', message: 'No such run.' }) } as Response);
    const { unmount } = render(<SizingRunCheck assessment={assessment(FOUND)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check it reproduces' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/^The reproduction could not be read\./);
    unmount();
    apiRequest.mockResolvedValue(ok({ data: {} }));
    render(<SizingRunCheck assessment={assessment(FOUND)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check it reproduces' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/^The reproduction could not be read\./);
    expect(screen.queryByRole('list', { name: /Reproduction of stored run/ })).toBeNull();
  });
});
