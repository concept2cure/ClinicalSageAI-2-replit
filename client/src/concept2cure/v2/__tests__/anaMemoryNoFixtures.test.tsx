// @vitest-environment jsdom
/**
 * AnaMemory — fixture-free contract (GA real-data standard).
 *
 * The surface used to fall back to inline fixtures (AMEM_ATOMS / AMEM_PROFILE)
 * behind a "Sample data" pill whenever the backend was empty or unreachable.
 * That is retired. These tests pin the honest states the surface may now
 * render — REAL rows from GET /api/mdx/ana/memory (client_memory_entries) plus
 * the REAL relational profile from GET /api/mdx/ana/memory/profile
 * (ana_relational_profiles), an honest EMPTY state, or an honest ERROR state —
 * and prove no retired fixture content survives when the backend has nothing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AnaMemory } from '../surfaces/AnaMemory';

const props = () =>
  ({
    surface: { id: 'ana-memory', label: 'AnA memory' },
    onAsk: vi.fn(),
    onNav: vi.fn(),
    segment: 'biopharma',
  }) as any;

/* REAL org-scoped payloads — deliberately NOT the retired fixtures, so anything
   rendered proves the response was adopted rather than a codebase constant. */

/* GET /api/mdx/ana/memory → canonical envelope { data: [...rows], meta }. */
const REAL_ATOMS = {
  data: [
    {
      id: 9101,
      category: 'regulatory',
      subcategory: 'pathway',
      title: 'ZX-9 pursues a 505(b)(2) NDA pathway',
      content: 'ZX-9 references the listed drug on a 505(b)(2) NDA; bridging data outstanding.',
      source_document_name: 'ZX-9 program charter',
      confidence_score: 0.91,
      importance_level: 'high',
      is_verified_by_user: false,
      status: 'active',
      updated_at: '2026-07-20T10:00:00Z',
    },
    {
      id: 9102,
      category: 'operational',
      subcategory: 'safety',
      title: 'ZX-9 has a transient ALT signal under review',
      content: 'A reversible ALT elevation signal is under evaluation for ZX-9 — no filing blocker.',
      source_document_name: 'PV signal log',
      confidence_score: 0.8,
      importance_level: 'medium',
      is_verified_by_user: true,
      verified_at: '2026-07-19T09:00:00Z',
      status: 'active',
      updated_at: '2026-07-19T09:00:00Z',
    },
    {
      id: 9103,
      category: 'history',
      subcategory: 'superseded',
      title: 'ZX-9 earlier indication note',
      content: 'Superseded after the program charter was reconciled.',
      source_document_name: 'Legacy import',
      confidence_score: 0.4,
      importance_level: 'low',
      is_verified_by_user: false,
      status: 'superseded',
      superseded_by_id: 9101,
      updated_at: '2026-07-10T10:00:00Z',
    },
  ],
  meta: { count: 3 },
};

/* GET /api/mdx/ana/memory/profile → { data: <profile row | null> }. */
const REAL_PROFILE = {
  data: {
    interaction_count: 12,
    last_interaction_at: '2026-07-20T03:00:00Z',
    profile_summary: 'Works answer-first under filing pressure and wants real, code-grounded tools.',
    tone_calibration: { warmth: 'medium', humor: 'rare', formality: 'standard', detail: 'concise' },
    emotional_signals: [{ at: '2026-07-20T03:00:00Z', signal: 'Urgency around the ZX-9 submission timeline' }],
    acknowledged_mistakes: [
      { at: '2026-07-18T12:00:00Z', mistake: 'Summarized from a design doc instead of source', correction: 'Read the codebase first' },
    ],
  },
};

const EMPTY_ATOMS = { data: [], meta: { count: 0 } };
const EMPTY_PROFILE = { data: null };

function okRes(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

/* Fixture strings that must NEVER appear once the fixtures are gone. */
const RETIRED = [
  'BX-301',
  'BX-204',
  'BX-099',
  'Bextrelimab',
  'Jordan leads regulatory',
  'Sample data',
];

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
});

describe('AnaMemory — real memory renders (no fixture)', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/ana/memory') return okRes(REAL_ATOMS);
      if (method === 'GET' && url === '/api/mdx/ana/memory/profile') return okRes(REAL_PROFILE);
      return okRes({});
    });
  });

  it('renders the REAL atoms and relational profile — never a fixture', async () => {
    render(<AnaMemory {...props()} />);

    // Atom title + content came from the response, not a fixture.
    expect(await screen.findByText('ZX-9 pursues a 505(b)(2) NDA pathway')).toBeTruthy();
    expect(screen.getByText('ZX-9 references the listed drug on a 505(b)(2) NDA; bridging data outstanding.')).toBeTruthy();
    // The relational profile (second store) rehydrated into the left panel.
    expect(screen.getByText('Works answer-first under filing pressure and wants real, code-grounded tools.')).toBeTruthy();
    // The acknowledged mistake from the real profile rendered.
    expect(screen.getByText('Summarized from a design doc instead of source')).toBeTruthy();
    // The superseded atom rendered in the provenance strip, from real status.
    expect(document.body.textContent).toContain('ZX-9 earlier indication note');
    expect(document.body.textContent).toContain('replaced by #9101');

    // No provenance pill, and no retired fixture content anywhere.
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });

  it('derives its headline counts from the real rows (not hardcoded)', async () => {
    render(<AnaMemory {...props()} />);
    await screen.findByText('ZX-9 pursues a 505(b)(2) NDA pathway');

    // interaction_count from the real profile.
    expect(document.body.textContent).toContain('across 12 conversations');
    // 2 active atoms (9103 is superseded), 1 of them unverified.
    expect(document.body.textContent).toContain('holding 2 active memories');
    expect(document.body.textContent).toContain('1 still waiting for your confirmation');
    // The "All" filter chip counts the active atoms.
    expect(screen.getByText('All 2')).toBeTruthy();
  });

  it('persists a verification through the REAL route and reports honestly', async () => {
    render(<AnaMemory {...props()} />);
    await screen.findByText('ZX-9 pursues a 505(b)(2) NDA pathway');

    const verifyBtn = document.querySelector('.amem-verify') as HTMLButtonElement;
    expect(verifyBtn).toBeTruthy();
    fireEvent.click(verifyBtn);

    // Hits the real per-atom verify endpoint (not a ghost global).
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/ana/memory/9101/verify', {}),
    );
    // Honest success toast only after the server accepted it.
    expect(await screen.findByText(/AnA will weight this memory more/i)).toBeTruthy();
  });
});

describe('AnaMemory — honest empty state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/ana/memory') return okRes(EMPTY_ATOMS);
      if (method === 'GET' && url === '/api/mdx/ana/memory/profile') return okRes(EMPTY_PROFILE);
      return okRes({});
    });
  });

  it('shows an EmptyState — never a fixture — when the org has no memory', async () => {
    render(<AnaMemory {...props()} />);

    expect(await screen.findByText(/formed any memories yet/i)).toBeTruthy();
    // No atoms, no provenance pill, no retired fixtures.
    expect(document.querySelector('.amem-atom')).toBeNull();
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });
});

describe('AnaMemory — honest error state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/ana/memory') {
        return { ok: false, status: 403, json: async () => ({ error: 'ORG_REQUIRED' }) } as Response;
      }
      if (method === 'GET' && url === '/api/mdx/ana/memory/profile') return okRes(EMPTY_PROFILE);
      return okRes({});
    });
  });

  it('shows an error EmptyState — never a fixture — when the read fails', async () => {
    render(<AnaMemory {...props()} />);

    expect(await screen.findByText(/couldn.t load ana.s memory/i)).toBeTruthy();
    expect(document.querySelector('.amem-atom')).toBeNull();
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });
});
