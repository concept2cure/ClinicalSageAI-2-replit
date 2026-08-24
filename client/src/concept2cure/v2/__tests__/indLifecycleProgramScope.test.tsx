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
  row({ submissionId: 2, code: 'BX-701', drugName: 'BX-701', productName: 'BX-701 IND' }),
];

function wire(rows: unknown[]) {
  apiRequest.mockImplementation(async (_m: string, u: string) => {
    if (u === '/api/ind-checklist') return res({ data: rows });
    return res({ success: true, data: [] });
  });
}

<<<<<<< HEAD
=======
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

>>>>>>> origin/concept2cure-v2
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
      id: 'prog-uuid',
      title: 'BX-701 IND',
      product: 'BX-701',
    };
    wire(TWO_ROWS);
<<<<<<< HEAD
    render(<IndLifecycle {...({ onAsk: () => {}, onNav: () => {} } as any)} />);
=======
    render(<IndLifecycle {...surfaceProps()} />);
>>>>>>> origin/concept2cure-v2

    expect(await screen.findByRole('heading', { name: /BX-701 -- Initial IND/ })).toBeTruthy();
    const note = screen.getByTestId('indl-scope-note');
    expect(note.textContent).toMatch(/open program's IND \(BX-701 IND\)/);
    expect(note.textContent).toMatch(/1 other IND/);
  });

  it('falls back to the first IND and SAYS the open program has none', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = {
      id: 'prog-uuid',
      title: 'CX-900 IND',
      product: 'CX-900',
    };
    wire(TWO_ROWS);
<<<<<<< HEAD
    render(<IndLifecycle {...({ onAsk: () => {}, onNav: () => {} } as any)} />);
=======
    render(<IndLifecycle {...surfaceProps()} />);
>>>>>>> origin/concept2cure-v2

    expect(await screen.findByRole('heading', { name: /AAA-100 -- Initial IND/ })).toBeTruthy();
    expect(screen.getByTestId('indl-scope-note').textContent).toMatch(
      /open program \(CX-900 IND\) has no IND checklist yet/,
    );
  });

  it('with no program open and several INDs, says which one is shown and how to scope', async () => {
    wire(TWO_ROWS);
<<<<<<< HEAD
    render(<IndLifecycle {...({ onAsk: () => {}, onNav: () => {} } as any)} />);
=======
    render(<IndLifecycle {...surfaceProps()} />);
>>>>>>> origin/concept2cure-v2

    expect(await screen.findByRole('heading', { name: /AAA-100 -- Initial IND/ })).toBeTruthy();
    expect(screen.getByTestId('indl-scope-note').textContent).toMatch(/Open a program to scope/);
  });

  it('a single IND with no program open needs no note — nothing to disambiguate', async () => {
    wire([TWO_ROWS[0]]);
<<<<<<< HEAD
    render(<IndLifecycle {...({ onAsk: () => {}, onNav: () => {} } as any)} />);
=======
    render(<IndLifecycle {...surfaceProps()} />);
>>>>>>> origin/concept2cure-v2

    expect(await screen.findByRole('heading', { name: /AAA-100 -- Initial IND/ })).toBeTruthy();
    expect(screen.queryByTestId('indl-scope-note')).toBeNull();
  });
});
