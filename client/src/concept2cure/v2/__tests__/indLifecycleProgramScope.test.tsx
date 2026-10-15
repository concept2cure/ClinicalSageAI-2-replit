// @vitest-environment jsdom
/**
 * The IND Lifecycle screen honors the OPEN PROGRAM.
 *
 * ── The defect these pin against ─────────────────────────────────────────────
 * GET /api/ind-checklist is org-scoped and the surface rendered rows[0]
 * unconditionally — so with two INDs in the org, the CMC build tab could be on
 * one program while this screen silently showed the other's readiness, forms
 * and clock. The fix applies the same identity matching the server uses for
 * program ↔ submission linkage (product/title, case-insensitive) and, whenever
 * the shown IND is not trivially "the only one", SAYS which IND is shown and
 * why (the scope note) — a fallback is allowed, a silent one is not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'ra@example.test', displayName: 'R. Author' } }),
}));

import { IndLifecycle } from '../surfaces/IndLifecycle';

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const row = (over: Record<string, unknown>) => ({
  submissionId: 1,
  code: 'AAA-100',
  drugName: 'AAA-100',
  productName: 'AAA-100 IND',
  indication: null,
  sponsorName: 'Org',
  submissionType: 'IND',
  targetReceiptDate: null,
  forms: [],
  sections: [],
  ...over,
});

const TWO_ROWS = [
  row({}),
  row({ submissionId: 2, code: 'BX-701', drugName: 'BX-701', productName: 'BX-701 IND', programId: 'prog-701' }),
];

function wire(rows: unknown[], program: Record<string, unknown> | null = null) {
  apiRequest.mockImplementation(async (_m: string, u: string) => {
    if (u === '/api/ind-checklist') return res({ data: rows });
    if (program && u === '/api/c2c/projects/prog-uuid') return res(program);
    return res({ success: true, data: [] });
  });
}

/* IndLifecycle destructures only onAsk/onNav, but it DECLARES the full
   SurfaceViewProps — so the render site owes the whole contract. */
function surfaceProps() {
  return {
    surface: { id: 'ind-checklist', label: 'IND Checklist' } as never,
    segment: 'biopharma',
    onAsk: () => {},
    onNav: () => {},
  };
}

beforeEach(() => {
  apiRequest.mockReset();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('IndLifecycle — program scoping', () => {
  it('shows the open program’s IND, not rows[0], when a match exists', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = {
      id: 'prog-701',
      title: 'BX-701 IND',
      product: 'BX-701',
    };
    wire(TWO_ROWS);
    render(<IndLifecycle {...surfaceProps()} />);

    expect(await screen.findByRole('heading', { name: /BX-701 — Initial IND/ })).toBeTruthy();
    const note = screen.getByTestId('indl-scope-note');
    expect(note.textContent).toMatch(/open program's IND \(BX-701 IND\)/);
    expect(note.textContent).toMatch(/1 other IND/);
  });

  it('does not expose another IND for drafting or filing when the open program has none', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = {
      id: 'prog-uuid',
      title: 'CX-900 IND',
      product: 'CX-900',
    };
    wire(TWO_ROWS);
    render(<IndLifecycle {...surfaceProps()} />);

    expect(await screen.findByText('No IND checklist yet')).toBeTruthy();
    expect(screen.getByText(/No IND checklist is linked to the open program/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /AAA-100 — Initial IND/ })).toBeNull();
  });

  it('with no program open and several INDs, says which one is shown and how to scope', async () => {
    wire(TWO_ROWS);
    render(<IndLifecycle {...surfaceProps()} />);

    expect(await screen.findByRole('heading', { name: /AAA-100 — Initial IND/ })).toBeTruthy();
    expect(screen.getByTestId('indl-scope-note').textContent).toMatch(/Open a program to scope/);
  });

  /* LX-22 part 2b: a checklist row carries its submission's project
     (`programId`) once the assembler returns it. A same-named IND of ANOTHER
     project is never the open program's; a name match is used only for a row
     with no recorded project, and the note says so. */
  it('shows the IND anchored to the open program, not a same-named IND of another project', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 'prog-uuid', title: 'BX-701 IND', product: 'BX-701' };
    wire([
      row({ submissionId: 1, code: 'BX-701', drugName: 'BX-701', productName: 'BX-701 IND', programId: 'other-uuid' }),
      row({ submissionId: 2, code: 'BX-701', drugName: 'BX-701', productName: 'BX-701 IND (program 2)', programId: 'prog-uuid' }),
    ]);
    render(<IndLifecycle {...surfaceProps()} />);

    expect(await screen.findByRole('heading', { name: /BX-701 — Initial IND/ })).toBeTruthy();
    const note = screen.getByTestId('indl-scope-note').textContent ?? '';
    expect(note).toMatch(/open program's IND \(BX-701 IND \(program 2\)\)/);
    expect(note).not.toMatch(/matched by name/i);
  });

  it('a same-named IND anchored to another project is not the open program’s', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 'prog-uuid', title: 'BX-701 IND', product: 'BX-701' };
    wire([row({ submissionId: 1, code: 'BX-701', drugName: 'BX-701', productName: 'BX-701 IND', programId: 'other-uuid' })]);
    render(<IndLifecycle {...surfaceProps()} />);

    expect(await screen.findByText('No IND checklist yet')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /BX-701 — Initial IND/ })).toBeNull();
  });

  it('does not guess between two unlinked, identically named INDs', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 'prog-uuid', product: 'BX-701' };
    wire([row({ code: 'BX-701' }), row({ code: 'BX-701', submissionId: 2 })]);
    render(<IndLifecycle {...surfaceProps()} />);
    expect(await screen.findByText('No IND checklist yet')).toBeTruthy();
  });

  /* QA 2026-10-08 (j7, finding 6): BX-301, a BLA program, was shown "The
     BX-301 IND is 22% ready" from a legacy IND submission that names no
     program, matched on its name. A program's IND is the one anchored to it —
     never a name match — and the program's own type says why there is none. */
  it('an IND whose submission names no program is never matched to the open program by name', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 'prog-uuid', title: 'BX-701 IND', product: 'BX-701' };
    wire([row({ submissionId: 2, code: 'BX-701', drugName: 'BX-701', productName: 'BX-701 IND' })]);
    render(<IndLifecycle {...surfaceProps()} />);

    expect(await screen.findByText('No IND checklist yet')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /BX-701 — Initial IND/ })).toBeNull();
    expect(document.body.textContent).toMatch(/never matched to a program by name/);
  });

  it('a BLA program is told its own type, and is not shown a same-named legacy IND', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 'prog-uuid', title: 'BX-301', product: 'BX-301' };
    wire(
      [row({ submissionId: 4, code: 'BX-301', drugName: 'BX-301', productName: 'BX-301 (anti-BCMA mAb)', programId: null })],
      { id: 'prog-uuid', name: 'BX-301', code: 'BX-301', program_type: 'BLA' },
    );
    render(<IndLifecycle {...surfaceProps()} />);

    expect(await screen.findByText('No IND checklist yet')).toBeTruthy();
    expect(await screen.findByText(/BX-301 is a BLA program/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /BX-301 — Initial IND/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/22%|ready to file/i);
  });

  it('a single IND with no program open needs no note — nothing to disambiguate', async () => {
    wire([TWO_ROWS[0]]);
    render(<IndLifecycle {...surfaceProps()} />);

    expect(await screen.findByRole('heading', { name: /AAA-100 — Initial IND/ })).toBeTruthy();
    expect(screen.queryByTestId('indl-scope-note')).toBeNull();
  });
});
