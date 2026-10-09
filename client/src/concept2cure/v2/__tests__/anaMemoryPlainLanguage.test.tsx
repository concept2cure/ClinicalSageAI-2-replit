// @vitest-environment jsdom
/**
 * AnA memory speaks to the person, not about the schema (launch row D2).
 *
 * On a brand-new workspace the empty state read: "As you work with AnA she
 * records durable facts about your programs (client_memory_entries) and how she
 * should work with you (ana_relational_profiles)." The same two table names
 * headed the populated sections. A customer has no use for a relation name, and
 * the repo rule is that none reaches the screen.
 *
 * The failure copy had the neighbouring defect: every failed read — including
 * the 403 the route answers when the session carries no organization — said
 * "The memory store didn't respond". A refusal is not silence; it is "you do not
 * have access", and saying otherwise sends the reader to check a service that is
 * working.
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

function okRes(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}
function failRes(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as Response;
}

const ATOMS = {
  data: [
    {
      id: 1,
      category: 'regulatory',
      subcategory: 'pathway',
      title: 'Lead program is on a 505(b)(2) pathway',
      content: 'Recorded from the program charter.',
      source_document_name: 'Program charter',
      confidence_score: 0.9,
      importance_level: 'high',
      is_verified_by_user: false,
      status: 'active',
      updated_at: '2026-07-20T10:00:00Z',
    },
  ],
  meta: { count: 1 },
};
const PROFILE = {
  data: {
    interaction_count: 3,
    last_interaction_at: '2026-07-20T03:00:00Z',
    profile_summary: 'Prefers the answer first.',
    tone_calibration: { warmth: 'medium', humor: 'rare', formality: 'standard', detail: 'concise' },
    emotional_signals: [],
    acknowledged_mistakes: [],
  },
};

/** Any snake_case identifier — a relation or column name, never user copy. */
const SNAKE_IDENTIFIER = /\b[a-z]+(?:_[a-z]+)+\b/;

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

function serve(atoms: () => Response, profile: () => Response) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/ana/memory') return atoms();
    if (method === 'GET' && url === '/api/mdx/ana/memory/profile') return profile();
    return okRes({});
  });
}

describe('AnA memory — no table names on screen', () => {
  it('the empty state explains itself without naming a table', async () => {
    serve(
      () => okRes({ data: [], meta: { count: 0 } }),
      () => okRes({ data: null }),
    );
    render(<AnaMemory {...props()} />);

    expect(await screen.findByText(/formed any memories yet/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain('client_memory_entries');
    expect(document.body.textContent).not.toContain('ana_relational_profiles');
    expect(document.body.textContent).not.toMatch(SNAKE_IDENTIFIER);
    // It still says what will appear here.
    expect(document.body.textContent).toMatch(/durable facts about your programs/i);
  });

  it('the populated sections are headed in words, not table names', async () => {
    serve(
      () => okRes(ATOMS),
      () => okRes(PROFILE),
    );
    render(<AnaMemory {...props()} />);

    expect(await screen.findByText('Lead program is on a 505(b)(2) pathway')).toBeTruthy();
    expect(document.body.textContent).not.toContain('client_memory_entries');
    expect(document.body.textContent).not.toContain('ana_relational_profiles');
    expect(document.body.textContent).not.toMatch(SNAKE_IDENTIFIER);
  });
});

describe('AnA memory — a refused read is not a silent one', () => {
  it('a 403 says the account has no access, and never that nothing responded', async () => {
    serve(
      () => failRes(403, { error: 'Organization context required' }),
      () => okRes({ data: null }),
    );
    render(<AnaMemory {...props()} />);

    expect(await screen.findByText(/couldn.t load ana.s memory/i)).toBeTruthy();
    expect(screen.getByText(/don.t have access to this organization.s memory/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/didn.t respond/i);
    // Retrying a refusal changes nothing, so none is offered.
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/formed any memories yet/i);
  });

  it('a 5xx is a failed read with a way to try again, and the retry re-reads', async () => {
    let calls = 0;
    serve(
      () => {
        calls += 1;
        return calls === 1 ? failRes(503, { error: 'Service unavailable' }) : okRes(ATOMS);
      },
      () => okRes(PROFILE),
    );
    render(<AnaMemory {...props()} />);

    expect(await screen.findByText(/couldn.t load ana.s memory/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/don.t have access/i);
    expect(document.body.textContent).not.toMatch(/formed any memories yet/i);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Lead program is on a 505(b)(2) pathway')).toBeTruthy();
    await waitFor(() => expect(calls).toBe(2));
  });
});
