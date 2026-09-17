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

function route(threads: 'ok' | 'empty' | 'error') {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok({ title: 'BX-301', progress_percent: 42 });
    if (url.startsWith('/api/chat/threads?program_id=')) {
      if (threads === 'error') return fail(503);
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
    // The read is scoped to the program UUID, limit-bounded.
    const call = apiRequest.mock.calls.find((c) => String(c[1]).startsWith('/api/chat/threads?'));
    expect(call![1]).toBe(`/api/chat/threads?program_id=${PID}&limit=8`);
    expect(screen.getByText('Untitled conversation')).toBeTruthy();

    fireEvent.click(row.closest('button')!);
    expect((window as any).C2C_CONVO).toEqual({ id: 'ana-ri_1' });
    expect(p.onNav).toHaveBeenCalledWith('conversation-thread');
  });

  it('shows an honest empty when the program has no threads, and a failure as a failure', async () => {
    route('empty');
    render(<ProjectHome {...props()} />);
    expect(await screen.findByText(/No project conversations yet/)).toBeTruthy();
    cleanup();
    route('error');
    render(<ProjectHome {...props()} />);
    expect(await screen.findByText(/Couldn't load conversations/)).toBeTruthy();
    expect(screen.queryByText(/No project conversations yet/)).toBeNull();
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
