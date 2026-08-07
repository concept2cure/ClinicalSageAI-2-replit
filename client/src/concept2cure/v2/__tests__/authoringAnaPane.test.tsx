// @vitest-environment jsdom
/**
 * "Draft with AnA" now has somewhere to land.
 *
 * The editor is registered `ownsConversation: true` (was `hideAna: true`)
 * because it cannot give the rail's column back — `.ed` is
 * `220px minmax(420px,1fr)` and gains a third 300px track whenever a rail mode
 * is open, a 940px floor that the shell's 380px rail pushes past 1376px. But it
 * kept calling the shell's `onAsk`, so "Draft with AnA", DocCanvas's drafting
 * and "Ask what changed" all pushed a question into a rail this screen never
 * renders — and `ask()` persisted `anaOpen`, so the question surfaced later on
 * some other surface entirely.
 *
 * These press the buttons and assert the answer arrives HERE.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;

const DOCS = {
  success: true,
  documents: [{
    id: 'D1', title: 'Nonclinical Overview', module: 'M3', product_code: 'ABC',
    status: 'draft', updated_at: '2026-07-20T10:00:00Z', section_count: 1,
  }],
};
const SECTIONS = {
  success: true,
  sections: [{
    id: 'S1', doc_id: 'D1', code: '3.2.S.1', title: 'General Information',
    content: 'The drug substance is a monoclonal antibody.', order_index: 0,
    comment_count: 0, revision_count: 2, citation_count: 1, updated_at: '2026-07-20T10:00:00Z',
  }],
};

const props = () => ({
  surface: { id: 'document-authoring', label: 'Authoring' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

/** Every AnA turn the page actually sent, with the conversation that sent it. */
function streamTurns(): Array<{ message?: string; screen?: string }> {
  const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls
    .filter((c) => String(c[0]).includes('/api/ana-ri/stream'))
    .map((c) => {
      try {
        const p = JSON.parse((c[1] as { body?: string })?.body ?? '{}') as {
          message?: string;
          context?: { screen?: string };
        };
        return { message: p.message, screen: p.context?.screen };
      } catch {
        return {};
      }
    });
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    if (method === 'GET' && url.startsWith('/api/authoring/sections/S1/history')) return ok({ success: true, revisions: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments')) return ok({ success: true, comments: [] });
    return ok({ success: true });
  });
  // The pane streams over `fetch`; refusing the request keeps this offline. The
  // user's turn is appended before the request goes out, which is the visible
  // fact under test.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({}) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DocumentAuthoring — the editor answers its own asks', () => {
  it('"Draft with AnA" opens the pane and shows the request in it', async () => {
    const p = props();
    render(<DocumentAuthoring {...p} />);
    await screen.findAllByText('General Information');

    // No pane before the ask — this is not a rail that was already open.
    expect(screen.queryByLabelText(/AnA — document authoring/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Draft with AnA/ }));

    const pane = await screen.findByLabelText(/AnA — document authoring/);
    await waitFor(() => expect(pane.textContent).toMatch(/Draft 3\.2\.S\.1 General Information/));
    // Sent by THIS surface's conversation, not the shell's.
    await waitFor(() =>
      expect(streamTurns().some((t) => t.screen === 'document-authoring' && /Draft 3\.2\.S\.1/.test(t.message ?? ''))).toBe(true),
    );
    expect(p.onAsk).not.toHaveBeenCalled();
  });

  it('the pane composer sends into the same conversation', async () => {
    const p = props();
    render(<DocumentAuthoring {...p} />);
    await screen.findAllByText('General Information');

    fireEvent.click(screen.getByRole('button', { name: /^AnA/ }));
    const box = await screen.findByPlaceholderText(/Ask about 3\.2\.S\.1/);
    fireEvent.change(box, { target: { value: 'Is this claim supported by the linked evidence?' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));

    const pane = await screen.findByLabelText(/AnA — document authoring/);
    await waitFor(() => expect(pane.textContent).toMatch(/Is this claim supported/));
    expect(p.onAsk).not.toHaveBeenCalled();
  });

  it('shows an honest empty pane rather than pretending a conversation exists', async () => {
    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('General Information');
    fireEvent.click(screen.getByRole('button', { name: /^AnA/ }));

    const pane = await screen.findByLabelText(/AnA — document authoring/);
    expect(pane.textContent).toMatch(/Ask AnA about this section/);
    // Nothing is sent just by opening the pane.
    expect(streamTurns()).toHaveLength(0);
  });
});
