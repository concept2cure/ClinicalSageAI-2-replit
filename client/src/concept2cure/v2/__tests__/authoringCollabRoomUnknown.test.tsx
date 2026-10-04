// @vitest-environment jsdom
/**
 * U16 (client half) — a heartbeat answered by a task that does not know the
 * room must not wipe the presence roster.
 *
 * Production runs two API tasks behind an ALB with no stickiness. Before the
 * roster moved to Postgres, a heartbeat that landed on the task that had not
 * served the join answered `{success: true, connectedUsers: []}` and this
 * component adopted the empty list, so co-authors' avatars vanished on about
 * half of all heartbeats (docs/evidence/W2/2026-09-24-multi-task/). The server
 * now answers from collab_presence; on its explicit not-durable fallback it
 * says `roomKnown: false` instead, and the roster keeps its last server value.
 *
 * RED on the pre-fix client: the heartbeat's [] replaced the joined roster.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Maya Lin', email: 'maya@acme.co' } }),
}));

import { AuthoringCollab } from '../surfaces/AuthoringCollab';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const JOINED = [{ userId: '7001', displayName: 'Maya Lin' }, { userId: '7002', displayName: 'Jo Park' }];
let heartbeat: unknown;

afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST' && url === '/api/realtime-collab/rooms') {
      return ok({ success: true, data: { room: { connectedUsers: JOINED }, user: {} } });
    }
    if (method === 'GET' && url.startsWith('/api/realtime-collab/locks/')) return ok({ success: true, data: [] });
    if (method === 'PUT' && url === '/api/realtime-collab/rooms/D1/awareness') return ok(heartbeat);
    return ok({ success: true });
  });
});

async function heartbeatAnswered() {
  await waitFor(() =>
    expect(apiRequest.mock.calls.some((c) => c[0] === 'PUT' && String(c[1]).endsWith('/awareness'))).toBe(true),
  );
  // Let the response settle into state.
  await new Promise((r) => setTimeout(r, 20));
}

describe('AuthoringCollab — a heartbeat for a room the answering task does not know', () => {
  it('keeps the roster when the server says the room was unknown', async () => {
    heartbeat = { success: true, connectedUsers: [], roomKnown: false };
    (window as any).C2C_PROJECT = { id: 'proj-1' };
    render(<AuthoringCollab documentId="D1" sectionId="S1" fireToast={vi.fn()} />);
    expect(await screen.findByText('JP')).toBeTruthy();
    await heartbeatAnswered();
    expect(screen.queryByText('JP')).toBeTruthy();
    expect(screen.queryByText('ML')).toBeTruthy();
  });

  it('still adopts a roster the server does know — a colleague who left is removed', async () => {
    heartbeat = { success: true, connectedUsers: [JOINED[0]], roomKnown: true };
    (window as any).C2C_PROJECT = { id: 'proj-1' };
    render(<AuthoringCollab documentId="D1" sectionId="S1" fireToast={vi.fn()} />);
    expect(await screen.findByText('JP')).toBeTruthy();
    await heartbeatAnswered();
    await waitFor(() => expect(screen.queryByText('JP')).toBeNull());
    expect(screen.queryByText('ML')).toBeTruthy();
  });
});
