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
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

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
    expect(screen.getByRole('button', { name: /Download eCTD backbone/ })).toBeTruthy();
  });

  it('shows an honest empty state when no program is open (no fixture)', () => {
    render(<EctdCompile {...props()} />);
    expect(screen.getByText(/Open a program to compile its eCTD/)).toBeTruthy();
    // No compile/status calls fire without a project.
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('a program UUID ident is sent to the server (which resolves it) — the numeric-only dead-end is gone', async () => {
    // window.C2C_PROJECT.id is a regulatory_programs UUID in the real shell.
    const uuid = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
    const STATUS_PROGRAM = {
      projectId: null, projectIdent: uuid, programId: uuid, overallReadiness: 0,
      contentComplete: false, submissionReady: false, totalSections: 0, totalRequired: 22, totalCompleted: 0, lastUpdated: null,
      submissionBlockers: ['Required sections are not all complete.', 'This program has no linked section-tracking store'],
      modules: [{ moduleCode: 'm1', moduleName: 'Administrative Information', totalSections: 0, requiredSections: 7, completedRequired: 0, completionPct: 0, ready: false }],
    };
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === `/api/ectd-compile/${uuid}/status`) return ok(STATUS_PROGRAM);
      if (method === 'GET' && url === `/api/ectd-compile/${uuid}/history`) return ok({ compilations: [] });
      return ok({});
    });
    (window as any).C2C_PROJECT = { id: uuid, title: 'BX-204 CGM', code: 'BX-204' };
    render(<EctdCompile {...props()} />);

    // The server's readiness (not a client dead-end) renders.
    expect(await screen.findByText('Administrative Information')).toBeTruthy();
    expect(screen.queryByText(/no numeric project id/)).toBeNull();
    // The status/history reads addressed the UUID ident verbatim.
    expect(apiRequest.mock.calls.some((c) => c[1] === `/api/ectd-compile/${uuid}/status`)).toBe(true);
    expect(apiRequest.mock.calls.some((c) => c[1] === `/api/ectd-compile/${uuid}/history`)).toBe(true);
  });
});

describe('EctdCompile — what the surface may claim', () => {
  /** Route the three reads with a caller-supplied compile payload. */
  function mockWith(compile: Record<string, unknown>, status: Record<string, unknown> = STATUS) {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/ectd-compile/42/status') return ok(status);
      if (method === 'GET' && url === '/api/ectd-compile/42/history') return ok({ compilations: [] });
      if (method === 'POST' && url === '/api/ectd-compile/42/compile') return ok(compile);
      return ok({});
    });
  }

  beforeEach(() => { (window as any).C2C_PROJECT = { id: 42 }; });

  it('names what is still missing instead of a bare negative', async () => {
    mockWith({
      ...COMPILE,
      submissionReady: false,
      contentValidationPassed: true,
      leafFilesRendered: 0,
      submissionBlockers: [
        "No leaf files have been rendered for this compile: it is not linked to a canonical submission (submissions → eCTD sequence) with placed documents, so this backbone describes authored section content only and cannot be transmitted to an agency gateway. Leaf rendering runs from the submission spine — create the program's submission and place approved documents into its eCTD sequence.",
      ],
    });
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByText(/Compile eCTD/));

    expect(await screen.findByText('Not yet submittable:')).toBeTruthy();
    expect(screen.getByText(/No leaf files have been rendered for this compile/)).toBeTruthy();
  });

  it('warns that the downloadable backbone is not a sequence', async () => {
    // The download button is right there; the user has to know what they got.
    mockWith({ ...COMPILE, submissionReady: false, submissionBlockers: ['x'] });
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByText(/Compile eCTD/));

    await screen.findByText(/Download eCTD backbone XML/);
    expect(screen.getByText(/not a sequence to transmit/)).toBeTruthy();
  });

  it('reports the readiness number as content completeness, not readiness to submit', async () => {
    // The chip read "100% · submission-ready" over a package with no leaf files.
    mockWith(COMPILE, { ...STATUS, overallReadiness: 100, contentComplete: true, submissionReady: false });
    render(<EctdCompile {...props()} />);
    expect(await screen.findByText(/100% · content complete/)).toBeTruthy();
    expect(screen.queryByText(/submission-ready/)).toBeNull();
  });

  it('claims nothing extra in the compile toast', async () => {
    mockWith({ ...COMPILE, submissionReady: false, submissionBlockers: ['x'] });
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByText(/Compile eCTD/));
    await waitFor(() => expect(screen.getByText(/eCTD backbone compiled/)).toBeTruthy());
    expect(screen.queryByText(/— submission-ready/)).toBeNull();
  });
});
