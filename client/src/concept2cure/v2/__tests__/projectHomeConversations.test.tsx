// @vitest-environment jsdom
/**
 * Project landing — conversation-first, with real resumable threads.
 *
 * The "Conversations" section used to be an honest empty with nothing behind
 * it: threads were minted with no project key, so nothing could list them
 * back. They now carry the program they were started in, the landing lists
 * them from GET /api/chat/threads?program_id=, and clicking one hands its id
 * to the thread surface — the §10.3 "resume recent chat" CTA. The dossier
 * readiness ring moved out of the main column into the aside.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';

const PID = '0f3c1a2b-1111-4222-8333-444455556666';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
const fail = (status: number) => ({ ok: false, status, json: async () => ({ error: 'x' }) } as Response);
const props = () => ({ surface: { id: 'project-home', label: 'Project' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const THREADS = [
  { id: 'ana-ri_1', title: 'Draft the Module 2.5 clinical overview for BX-301', created_at: '2026-09-05T10:00:00Z', updated_at: '2026-09-06T09:00:00Z', program_id: PID },
  { id: 'ana-ri_2', title: null, created_at: '2026-09-01T10:00:00Z', updated_at: null, program_id: PID },
];

function route(threads: 'ok' | 'empty' | 'error' | 'shapeless') {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok({ title: 'BX-301', readiness: 42 });
    if (url.startsWith('/api/chat/threads?program_id=')) {
      if (threads === 'error') return fail(503);
      if (threads === 'shapeless') return ok({ data: [] });
      return ok({ threads: threads === 'ok' ? THREADS : [] });
    }
    return ok({});
  });
}

beforeEach(() => { apiRequest.mockReset(); (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' }; });
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; delete (window as any).C2C_CONVO; });

describe('ProjectHome — conversations', () => {
  it('lists the program\'s threads from the program-scoped read and resumes one on click', async () => {
    route('ok');
    const p = props();
    render(<ProjectHome {...p} />);
    const row = await screen.findByText(/Draft the Module 2\.5 clinical overview/);
    // The read is scoped to the program UUID, limit-bounded: a screenful of 8,
    // and one more to know whether there are older ones.
    const call = apiRequest.mock.calls.find((c) => String(c[1]).startsWith('/api/chat/threads?'));
    expect(call![1]).toBe(`/api/chat/threads?program_id=${PID}&limit=9`);
    expect(screen.getByText('Untitled conversation')).toBeTruthy();

    fireEvent.click(row.closest('button')!);
    expect((window as any).C2C_CONVO).toEqual({ id: 'ana-ri_1' });
    expect(p.onNav).toHaveBeenCalledWith('conversation-thread');
  });

  /* Amended 2026-10-08 (filing-spine design review, honest-state lens): the
     server lists only the caller's own threads (chat/threads.ts), so "No
     project conversations yet" was untrue for a colleague's project. The empty
     says whose list it is, in one line (the dashed block pushed the five tabs
     below the fold), and a reply with no `threads` is a failed read. */
  it('shows an honest empty when the program has no threads, and a failure as a failure', async () => {
    route('empty');
    render(<ProjectHome {...props()} />);
    const empty = await screen.findByText(/You have no conversations on this project yet\./);
    expect(empty.tagName).toBe('P');
    expect(screen.queryByText(/No project conversations yet/)).toBeNull();
    cleanup();
    route('error');
    render(<ProjectHome {...props()} />);
    expect(await screen.findByText(/Couldn't load conversations/)).toBeTruthy();
    expect(screen.queryByText(/You have no conversations on this project yet/)).toBeNull();
    cleanup();
    route('shapeless');
    render(<ProjectHome {...props()} />);
    expect(await screen.findByText(/Couldn't load conversations/)).toBeTruthy();
    expect(screen.queryByText(/You have no conversations on this project yet/)).toBeNull();
  });

  it('the composer leads the main column and the readiness ring sits in the aside', async () => {
    route('ok');
    const { container } = render(<ProjectHome {...props()} />);
    await waitFor(() => expect(container.querySelector('.pj-map-ring')).toBeTruthy());
    expect(container.querySelector('.pj-side .pj-map-ring'), 'ring in the aside').toBeTruthy();
    expect(container.querySelector('.pj-main .pj-map-ring'), 'ring not in the main column').toBeNull();
    // The conversation composer precedes the workspace grid in document order.
    const convo = container.querySelector('.pj-convo')!;
    const grid = container.querySelector('.pj-grid')!;
    expect(convo.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

/* QA 2026-10-08 (j5): the program had 25 conversations and the page listed the
   newest 8, with no way to the other 17. */
describe('ProjectHome — older conversations are reachable', () => {
  const many = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `ana-ri_${from + i}`,
      title: `Conversation ${from + i}`,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
      program_id: PID,
    }));
  const rows = () => Array.from(document.querySelectorAll('[data-testid="pj-threads"] .pj-file-n')).map((e) => e.textContent);

  function pages(pageOf: (offset: number) => Response) {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === `/api/c2c/projects/${PID}`) return ok({ title: 'BX-301', readiness: 42 });
      if (url.startsWith('/api/chat/threads?program_id=')) {
        const offset = Number(new URLSearchParams(url.split('?')[1]).get('offset') ?? 0);
        return pageOf(offset);
      }
      return ok({});
    });
  }

  it('shows a screenful, then the older ones a screenful at a time, until there are none', async () => {
    // 20 conversations: 1..20, newest first. Each read asks for one past the screenful.
    pages((offset) => ok({ threads: many(offset + 1, Math.min(9, 20 - offset)) }));
    render(<ProjectHome {...props()} />);
    await screen.findByText('Conversation 1');
    expect(rows()).toHaveLength(8);
    expect(rows()).not.toContain('Conversation 9');

    fireEvent.click(screen.getByRole('button', { name: 'Show older conversations' }));
    await screen.findByText('Conversation 16');
    expect(apiRequest.mock.calls.map((c) => c[1])).toContain(`/api/chat/threads?program_id=${PID}&limit=9&offset=8`);
    expect(rows()).toHaveLength(16);

    fireEvent.click(screen.getByRole('button', { name: 'Show older conversations' }));
    await screen.findByText('Conversation 20');
    expect(rows()).toHaveLength(20);
    // The last read came back short: there is nothing older to offer.
    expect(screen.queryByRole('button', { name: 'Show older conversations' })).toBeNull();
    // An older one opens like any other.
    fireEvent.click(screen.getByText('Conversation 19').closest('button')!);
    expect((window as any).C2C_CONVO).toEqual({ id: 'ana-ri_19' });
  });

  it('a screenful exactly offers nothing more', async () => {
    pages(() => ok({ threads: many(1, 8) }));
    render(<ProjectHome {...props()} />);
    await screen.findByText('Conversation 8');
    expect(screen.queryByRole('button', { name: 'Show older conversations' })).toBeNull();
  });

  it('an older read that fails says so, keeps what is shown, and can be tried again', async () => {
    pages((offset) => (offset === 0 ? ok({ threads: many(1, 9) }) : fail(503)));
    render(<ProjectHome {...props()} />);
    await screen.findByText('Conversation 1');
    fireEvent.click(screen.getByRole('button', { name: 'Show older conversations' }));
    expect(await screen.findByText(/Couldn.t load older conversations/)).toBeTruthy();
    expect(rows()).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'Show older conversations' })).toBeTruthy();
  });
});
