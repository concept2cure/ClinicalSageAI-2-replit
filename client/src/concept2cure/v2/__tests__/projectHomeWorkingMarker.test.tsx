// @vitest-environment jsdom
/**
 * The conversations AnA is working in (AnA detach DT3, design §5.1, U-6).
 *
 * A turn now goes on when its page closes, so a person can have AnA working
 * in a conversation they are not looking at. The project's conversation list
 * says so — "Working", and "Working · stops by 14:33 UTC if nobody opens it"
 * once nobody is watching ("Waiting for you" for a run held for its person) —
 * read from GET /api/ana-ri/runs?mine=live, and read again as the page comes
 * back on screen. The same
 * list is what a RUN_LIMIT refusal links to: "You have three turns running"
 * names them, and each opens its conversation.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
/* useDocumentList reads the signed-in session (CanvasDocumentList.tsx); with
   no AuthProvider mounted, the real useAuth throws before Project home renders. */
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';
import { RunLimitOffer } from '../surfaces/ConversationThread';
import { workingMarkerLine } from '../anaWorkModel';
import { DETACHED_CLOSE_GRACE_MS } from '@shared/ana/run-detach';
import type { AnaChatMessage } from '../../components/ana/useAnaChat';

const PROGRAM = '099991d1-dac8-43c5-b88a-8baab26194ee';
const STOPS = '2026-10-08T14:31:00.000Z';
/* "stops by" is a bound (DT3 review 2.9): the limit plus the closing grace,
   when the hard stop lands; in UTC, the zone the notice and the record use
   (DT3 review 4.7). */
const STOPS_BY = '14:33 UTC';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const MINE = {
  runs: [
    { runId: 'run_a', status: 'running', threadId: 'th_1', threadTitle: 'Stability reports', unattendedStopsAt: STOPS, watched: false },
    { runId: 'run_b', status: 'paused', threadId: 'th_3', threadTitle: 'Labelling', unattendedStopsAt: null, watched: true },
  ],
  serverNow: '2026-10-08T14:20:00.000Z',
};

const props = () => ({
  surface: { id: 'project-home', label: 'Project' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

beforeEach(() => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM, title: 'BX-256' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url.startsWith('/api/chat/threads?')) {
      return ok({ threads: [
        { id: 'th_1', title: 'Stability reports', created_at: '2026-10-08T14:00:00Z', updated_at: '2026-10-08T14:00:00Z' },
        { id: 'th_2', title: 'Clinical overview', created_at: '2026-10-07T10:00:00Z', updated_at: '2026-10-07T10:00:00Z' },
      ] });
    }
    if (url === '/api/ana-ri/runs?mine=live') return ok(MINE);
    return ok({});
  });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('workingMarkerLine', () => {
  it('"Working" while someone watches; when it has stopped by, once nobody does', () => {
    expect(DETACHED_CLOSE_GRACE_MS).toBe(120_000);
    expect(workingMarkerLine({ status: 'running', unattendedStopsAt: STOPS, watched: true })).toBe('Working');
    expect(workingMarkerLine({ status: 'running', unattendedStopsAt: STOPS, watched: false })).toBe(
      `Working · stops by ${STOPS_BY} if nobody opens it`,
    );
    expect(workingMarkerLine({ status: 'running', unattendedStopsAt: null, watched: false })).toBe('Working');
  });

  it('the same instant, in UTC, whatever zone this device is in (DT3 review 4.7)', () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(workingMarkerLine({ status: 'running', unattendedStopsAt: STOPS, watched: false })).toBe(
        `Working · stops by ${STOPS_BY} if nobody opens it`,
      );
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  it('a run waiting on its person is "Waiting for you", never "Working" (DT3 review 2.3)', () => {
    expect(workingMarkerLine({ status: 'paused', unattendedStopsAt: null, watched: true })).toBe('Waiting for you');
    expect(workingMarkerLine({ status: 'awaiting_approval', unattendedStopsAt: STOPS, watched: false })).toBe(
      `Waiting for you · stops by ${STOPS_BY} if nobody opens it`,
    );
  });
});

describe("the project's conversations", () => {
  it('mark the conversation AnA is working in, from ?mine=live, and leave the others as they are', async () => {
    render(<ProjectHome {...props()} />);
    const working = await screen.findByText(`Working · stops by ${STOPS_BY} if nobody opens it`, { exact: false });
    expect(working.closest('button')?.textContent).toContain('Stability reports');
    const other = screen.getByText('Clinical overview').closest('button')!;
    expect(other.textContent).toContain('Resume');
    expect(other.textContent).not.toContain('Working');
    expect(apiRequest.mock.calls.some(c => c[1] === '/api/ana-ri/runs?mine=live')).toBe(true);
  });

  /* DT3 review (2.3): the marker was read once, at mount, so a conversation
     read "Working · stops by …" minutes after its turn had ended, for any
     project page left open. It is read again as the page comes back on
     screen (and on a timer while it is visible). */
  it('the marker is read again when the page comes back on screen: a turn that ended is no longer "Working"', async () => {
    render(<ProjectHome {...props()} />);
    await screen.findByText(`Working · stops by ${STOPS_BY} if nobody opens it`, { exact: false });
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.startsWith('/api/chat/threads?')) {
        return ok({ threads: [{ id: 'th_1', title: 'Stability reports', created_at: '2026-10-08T14:00:00Z', updated_at: '2026-10-08T14:00:00Z' }] });
      }
      if (url === '/api/ana-ri/runs?mine=live') return ok({ runs: [], serverNow: '2026-10-08T14:40:00.000Z' });
      return ok({});
    });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    const row = screen.getByText('Stability reports').closest('button')!;
    expect(row.textContent).toContain('Resume');
    expect(row.textContent).not.toContain('Working');
  });

  it('a list that could not be read says so, quietly, and marks nothing (DT3 review 2.3)', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.startsWith('/api/chat/threads?')) {
        return ok({ threads: [{ id: 'th_1', title: 'Stability reports', created_at: '2026-10-08T14:00:00Z', updated_at: '2026-10-08T14:00:00Z' }] });
      }
      if (url === '/api/ana-ri/runs?mine=live') return { ok: false, status: 500, json: async () => ({}) } as Response;
      return ok({});
    });
    render(<ProjectHome {...props()} />);
    expect(await screen.findByText("Couldn't check which conversations AnA is working in.")).toBeTruthy();
    expect(screen.getByText('Stability reports').closest('button')!.textContent).not.toContain('Working');
  });
});

describe('the RUN_LIMIT refusal links to the Working conversations', () => {
  const refused: AnaChatMessage[] = [
    { id: 'u1', role: 'user', text: 'one more question' },
    { id: 'a1', role: 'assistant', text: 'You have three turns running. Stop one, or wait for one to finish.', refusalCode: 'RUN_LIMIT' },
  ];

  // Read through the same hook as the conversation list (one reader of ?mine=live).
  it('each one opens its conversation', async () => {
    const onOpen = vi.fn();
    render(<RunLimitOffer messages={refused} index={1} onOpen={onOpen} />);
    const link = await screen.findByRole('button', { name: /Stability reports/ });
    expect(link.textContent).toContain('stops by');
    // A run held for its person waits on them; it is not "Working" (DT3 review 2.3).
    expect(screen.getByRole('button', { name: /Labelling · Waiting for you/ })).toBeTruthy();
    await act(async () => { fireEvent.click(link); });
    expect(onOpen).toHaveBeenCalledWith('th_1');
    expect(apiRequest.mock.calls.filter(c => c[1] === '/api/ana-ri/runs?mine=live')).toHaveLength(1);
  });

  it('under any other turn there is nothing, and nothing is read', () => {
    const { container } = render(<RunLimitOffer messages={refused} index={0} onOpen={vi.fn()} />);
    expect(container.textContent).toBe('');
    expect(apiRequest.mock.calls.some(c => c[1] === '/api/ana-ri/runs?mine=live')).toBe(false);
  });

  it('a list that could not be read shows no links, and says nothing false', async () => {
    apiRequest.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response);
    const { container } = render(<RunLimitOffer messages={refused} index={1} onOpen={vi.fn()} />);
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(container.textContent).toBe('');
  });
});
