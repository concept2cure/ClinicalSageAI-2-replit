// @vitest-environment jsdom
/**
 * EctdCompile — proves the eCTD assembly surface is wired to the real
 * /api/ectd-compile engine: reads module readiness, compiles across a region,
 * and renders the server's result (errors/warnings + downloadable backbone).
 * With no program open it shows an honest empty state, never a fixture.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { EctdCompile } from '../surfaces/EctdCompile';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const STATUS = {
  projectId: 42, overallReadiness: 60, submissionReady: false, totalSections: 5, totalRequired: 2, totalCompleted: 1, lastUpdated: null,
  modules: [{ moduleCode: 'm3', moduleName: 'Module 3 — Quality', totalSections: 5, requiredSections: 2, completedRequired: 1, completionPct: 50, ready: false }],
};
const COMPILE = {
  id: 'c1', projectId: 42, status: 'completed', modules: [], xmlBackbone: '<ectd:backbone/>',
  validationResults: [{ rule: 'REQUIRED_SECTION_OK', severity: 'info', message: 'Section 3.2.S ok' }],
  submissionReady: true, errors: [], warnings: ['3.2.P.8 stability is short'],
};

const props = () => ({ surface: { id: 'ectd-compile', label: 'eCTD' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ectd-compile/42/status') return ok(STATUS);
    if (method === 'GET' && url === '/api/ectd-compile/42/history') return ok({ compilations: [] });
    if (method === 'POST' && url === '/api/ectd-compile/42/compile') return ok(COMPILE);
    return ok({});
  });
});

describe('EctdCompile — real eCTD assembly', () => {
  it('loads module readiness from the real status endpoint', async () => {
    (window as any).C2C_PROJECT = { id: 42, title: 'ABC-123', code: 'IND-42' };
    render(<EctdCompile {...props()} />);
    expect(await screen.findByText('Module 3 — Quality')).toBeTruthy();
    expect(screen.getByText(/60% · incomplete/)).toBeTruthy();
  });

  it('compiles across the region and renders the server result with a backbone download', async () => {
    (window as any).C2C_PROJECT = { id: 42, title: 'ABC-123' };
    render(<EctdCompile {...props()} />);
    await screen.findByText('Module 3 — Quality');

    fireEvent.click(screen.getByRole('button', { name: /Compile eCTD/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/ectd-compile/42/compile');
      expect(call).toBeTruthy();
      expect(call![2] as any).toMatchObject({ submissionType: 'initial', region: 'FDA' });
    });
    expect(await screen.findByText(/Compilation complete/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Download eCTD 4.0 backbone/ })).toBeTruthy();
  });

  it('shows an honest empty state when no program is open (no fixture)', () => {
    render(<EctdCompile {...props()} />);
    expect(screen.getByText(/Open a program to compile its eCTD/)).toBeTruthy();
    // No compile/status calls fire without a project.
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
