// @vitest-environment jsdom
/**
 * BiopharmaProject.tsx — fixture-free contract (GA real-data standard).
 *
 * The file hosts three surfaces. Two of them used to fall back to inline
 * fixtures behind a "Sample data" pill and are now fixture-free — these tests
 * pin their three honest states:
 *
 *   • CsrWorkflow        — GET /api/csr-workflow/board. Real org-scoped ICH E3
 *                          build state (program + sections). Retired the
 *                          CSR_PROGRAM / CSR_SECTIONS fixture + SampleTag.
 *   • RegulatoryWorkspace — GET /api/regulatory-workspace. Real org-scoped CTD
 *                          section tree + intelligence. Retired the RW_TREE /
 *                          RW_INTEL fixture + SampleTag.
 *
 * The third surface, `BiopharmaProject` (registry id `biopharma`), is a REPORTED
 * BACKEND BUILD GAP: none of its four panels (header / phase strip / CTD modules
 * / BLA workbench) has a route returning its display contract — notably
 * GET /api/biopharma/ctd has no root handler (server/routes/biopharma/ctd.ts
 * exposes only /structure and /build-state/:projectId), so useLiveList always
 * 404s and renders the fixture. Per the GA guardrail it is stopped-and-reported
 * rather than fabricated, so it is intentionally NOT covered here; it keeps its
 * SampleTag + BIO_* fixtures until a shape-matching org-scoped read is built.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

// The CSR board is independent of the Clinical-Regulatory Graph flag; pin it OFF
// so CsrWorkflow issues exactly one fetch (the board) and the CRE columns/panels
// (their own already-fixture-free hooks) stay dark and deterministic.
vi.mock('../clinicalRegulatoryGraphFlag', () => ({
  isClinicalRegulatoryGraphEnabled: () => false,
}));

import { CsrWorkflow, RegulatoryWorkspace } from '../surfaces/BiopharmaProject';

const props = () => ({
  surface: { id: 'csr-workflow', label: 'CSR workflow' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

/* Strings that only ever existed in the retired fixtures (project3-data.ts):
   CSR_PROGRAM.title, the RW_TREE illustrative labels, the RW_INTEL sub-metrics
   the real route deliberately omits, and the provenance pill itself. None may
   survive once the fixtures are gone. (Section labels like "Efficacy evaluation"
   are canonical ICH E3 names the real route also returns, so they are NOT here.) */
const RETIRED = [
  'BX204-201 Clinical Study Report',
  'Drug substance',
  'Drug product',
  'Efficacy & safety',
  '12 sources · 4 unlinked claims',
  '3 · 1 from AnA',
  '71% · 2 blockers',
  'Sample data',
];

/* ── Real, org-scoped payloads. Deliberately NOT the retired fixtures, so any
   rendered value proves the HTTP response was adopted, not a codebase constant.
   Route envelope is { success, data: {...} }. ── */

const CSR_BOARD_REAL = {
  success: true,
  data: {
    program: { title: 'ZX-9 First-in-Human CSR (live)', code: 'ICH E3', readiness: 63 },
    sections: [
      { num: '11', label: 'Efficacy evaluation', status: 'draft', blocker: true },
      { num: '12', label: 'Safety evaluation', status: 'idle' },
      { num: '9', label: 'Investigational plan', status: 'draft' },
    ],
    meta: { hasProgram: true },
    generatedAt: '2026-07-31T00:00:00.000Z',
  },
};

/* No CSR build job yet — the route still returns the real ICH E3 catalog (not
   started) with program:null. The honest header state, never a fixture. */
const CSR_BOARD_NOPROGRAM = {
  success: true,
  data: {
    program: null,
    sections: [
      { num: '1', label: 'Title page', status: 'idle', blocker: true },
      { num: '9', label: 'Investigational plan', status: 'idle' },
    ],
    meta: { hasProgram: false },
    generatedAt: '2026-07-31T00:00:00.000Z',
  },
};

const RW_REAL = {
  success: true,
  data: {
    projectId: 77,
    projectName: 'Project Helios (live)',
    tree: [
      { id: 'm2.5', num: '2.5', label: 'Clinical overview — live row', status: 'draft', active: true },
      { id: 'm5.3.5', num: '5.3.5', label: 'Study reports — live row', status: 'review', active: false },
    ],
    intel: [
      { k: 'Readiness', v: '42% · 1 blocker' },
      { k: 'Open comments', v: '5 open comments' },
      { k: 'Linked evidence', v: '9 documents · 3 sections' },
    ],
  },
};

const RW_EMPTY = { success: true, data: { projectId: null, projectName: null, tree: [], intel: [] } };

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}
function httpErr(status: number) {
  return { ok: false, status, json: async () => ({ success: false, error: 'nope' }) } as Response;
}

function expectNoRetired() {
  expect(document.querySelector('.c2c-sample-tag')).toBeNull();
  for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
}

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
});

describe('CsrWorkflow — real board renders (no fixture)', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/csr-workflow/board') return ok(CSR_BOARD_REAL);
      return ok({});
    });
  });

  it('renders the REAL program header and its real sections', async () => {
    render(<CsrWorkflow {...props()} />);

    // Program header came from the response (fixture title was BX204-201).
    await screen.findByText(/ZX-9 First-in-Human CSR \(live\)/);
    expect(document.body.textContent).toContain('63% ready');

    // All three real sections rendered as board rows, blocker flag adopted.
    expect(document.querySelectorAll('.ct-row').length).toBe(3);
    expect(document.querySelector('.ct-row[data-blocker]')).toBeTruthy();

    expectNoRetired();
  });
});

describe('CsrWorkflow — honest no-active-job state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/csr-workflow/board') return ok(CSR_BOARD_NOPROGRAM);
      return ok({});
    });
  });

  it('shows the honest "no active build job" header + note, still real sections', async () => {
    render(<CsrWorkflow {...props()} />);

    // program:null → honest header, not a fabricated program title.
    await screen.findByText(/no active CSR build job yet/i);
    expect(await screen.findByText(/No active CSR build job for this organization yet/i)).toBeTruthy();
    // The real (not-started) ICH E3 sections still render — they are real data.
    expect(document.querySelectorAll('.ct-row').length).toBe(2);

    expectNoRetired();
  });
});

describe('CsrWorkflow — honest error state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/csr-workflow/board') return httpErr(401);
      return ok({});
    });
  });

  it('shows an error EmptyState — never a fixture — when the read fails', async () => {
    render(<CsrWorkflow {...props()} />);

    expect(await screen.findByText("Couldn't load the CSR workflow board")).toBeTruthy();
    // No section rows and no fabricated content.
    expect(document.querySelector('.ct-row')).toBeNull();
    expectNoRetired();
  });
});

describe('RegulatoryWorkspace — real tree + intel render (no fixture)', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/regulatory-workspace') return ok(RW_REAL);
      return ok({});
    });
  });

  it('renders the REAL section tree and the REAL intelligence rows', async () => {
    render(<RegulatoryWorkspace {...props()} />);

    // Tree row adopted from the response (fixture labels were Drug substance/etc).
    // Scope to the tree label — the active section's label also renders in the
    // doc masthead, which is itself proof the real row drives the canvas.
    expect(await screen.findByText('Clinical overview — live row', { selector: '.ed-lbl' })).toBeTruthy();
    expect(screen.getByText('Study reports — live row', { selector: '.ed-lbl' })).toBeTruthy();
    expect(document.querySelectorAll('.ed-tree-row').length).toBe(2);
    // Intelligence value derived from real rows (fixture value was 71% · 2 blockers).
    expect(document.body.textContent).toContain('42% · 1 blocker');
    // Best-effort real project name surfaced in the tree header.
    expect(document.body.textContent).toContain('Project Helios (live)');

    expectNoRetired();
  });
});

describe('RegulatoryWorkspace — honest empty state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/regulatory-workspace') return ok(RW_EMPTY);
      return ok({});
    });
  });

  it('shows an EmptyState — never a fixture tree — when the org has no tracked sections', async () => {
    render(<RegulatoryWorkspace {...props()} />);

    expect(await screen.findByText('No tracked CTD sections yet')).toBeTruthy();
    // No tree rows rendered.
    expect(document.querySelector('.ed-tree-row')).toBeNull();
    expectNoRetired();
  });
});

describe('RegulatoryWorkspace — honest error state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/regulatory-workspace') return httpErr(403);
      return ok({});
    });
  });

  it('shows an error EmptyState — never a fixture — when the read fails', async () => {
    render(<RegulatoryWorkspace {...props()} />);

    expect(await screen.findByText("Couldn't load the regulatory workspace")).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.ed-tree-row')).toBeNull());
    expectNoRetired();
  });
});
