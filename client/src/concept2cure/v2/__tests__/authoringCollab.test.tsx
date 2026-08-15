// @vitest-environment jsdom
/**
 * AuthoringCollab — proves the presence + section-locking layer is wired to the
 * real collaboration service (/api/realtime-collab): joins the section room and
 * renders the SERVER's connected-user roster, acquires/releases a section lock
 * against the real endpoints, surfaces a 409 lock conflict with the server's
 * reason, and renders nothing (no fabricated identity) without a project/user.
 *
 * Also pins the identity contract, which is the reason this component changed:
 * the client sends NO userId on any call (the server took a body userId as the
 * actor, so naming somebody else acted as them), and it decides "is this my
 * lock?" from the server's `mine` rather than by comparing id strings.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

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

afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST' && url === '/api/realtime-collab/rooms') {
      return ok({ success: true, data: { room: { connectedUsers: [{ userId: '7001', displayName: 'Maya Lin' }, { userId: '7002', displayName: 'Jo Park' }] }, user: {} } });
    }
    if (method === 'GET' && url.startsWith('/api/realtime-collab/locks/')) return ok({ success: true, data: [] });
    if (method === 'POST' && url === '/api/realtime-collab/locks') return ok({ success: true, data: { documentId: 'D1', sectionId: 'S1', mine: true } });
    if (method === 'DELETE') return ok({ success: true, released: true });
    return ok({ success: true });
  });
});

describe('AuthoringCollab — real presence + locks', () => {
  it('joins the section room and renders the server roster', async () => {
    (window as any).C2C_PROJECT = { id: 'proj-1' };
    const fireToast = vi.fn();
    render(<AuthoringCollab documentId="D1" sectionId="S1" fireToast={fireToast} />);
    await waitFor(() => {
      const join = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/realtime-collab/rooms');
      expect(join).toBeTruthy();
      expect(join![2]).toMatchObject({ documentId: 'D1', projectId: 'proj-1', sectionId: 'S1' });
      // The actor is the authenticated principal, never a body field.
      expect(join![2]).not.toHaveProperty('userId');
      expect(join![2]).not.toHaveProperty('email');
    });
    // Two presence avatars from the server's connectedUsers (ML + JP initials).
    expect(await screen.findByText('ML')).toBeTruthy();
    expect(screen.getByText('JP')).toBeTruthy();
  });

  it('acquires a section lock against the real endpoint', async () => {
    (window as any).C2C_PROJECT = { id: 'proj-1' };
    const fireToast = vi.fn();
    render(<AuthoringCollab documentId="D1" sectionId="S1" fireToast={fireToast} />);
    fireEvent.click(await screen.findByRole('button', { name: /Lock section/ }));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/realtime-collab/locks');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ documentId: 'D1', sectionId: 'S1' });
      expect(call![2]).not.toHaveProperty('userId');
    });
    expect(fireToast).toHaveBeenCalledWith('Section locked for your edit.');
  });

  it('surfaces a 409 lock conflict with the server reason', async () => {
    (window as any).C2C_PROJECT = { id: 'proj-1' };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST' && url === '/api/realtime-collab/rooms') return ok({ success: true, data: { room: { connectedUsers: [] } } });
      if (method === 'GET' && url.startsWith('/api/realtime-collab/locks/')) return ok({ success: true, data: [] });
      if (method === 'POST' && url === '/api/realtime-collab/locks') return ok({ success: false, error: 'Locked by jo@acme.co until 14:02' }, 409);
      return ok({ success: true });
    });
    const fireToast = vi.fn();
    render(<AuthoringCollab documentId="D1" sectionId="S1" fireToast={fireToast} />);
    fireEvent.click(await screen.findByRole('button', { name: /Lock section/ }));
    // BP-W0-6: a refused lock must not announce itself with the success tick.
    await waitFor(() => expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/Locked by jo@acme.co/), 'error'));
  });

  it('sends the awareness heartbeat and adopts the server roster from its response', async () => {
    (window as any).C2C_PROJECT = { id: 'proj-1' };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST' && url === '/api/realtime-collab/rooms') return ok({ success: true, data: { room: { connectedUsers: [{ userId: '7001', displayName: 'Maya Lin' }] } } });
      if (method === 'GET' && url.startsWith('/api/realtime-collab/locks/')) return ok({ success: true, data: [] });
      if (method === 'PUT' && url === '/api/realtime-collab/rooms/D1/awareness') {
        return ok({ success: true, connectedUsers: [{ userId: '7001', displayName: 'Maya Lin' }, { userId: '7003', displayName: 'Ravi Iyer' }] });
      }
      return ok({ success: true });
    });
    render(<AuthoringCollab documentId="D1" sectionId="S1" fireToast={vi.fn()} />);
    await waitFor(() => {
      const beat = apiRequest.mock.calls.find((c) => c[0] === 'PUT' && String(c[1]).endsWith('/awareness'));
      expect(beat).toBeTruthy();
      expect(beat![2]).toMatchObject({ sectionId: 'S1', focusedField: 'S1' });
      expect(beat![2]).not.toHaveProperty('userId');
    });
    // The roster adopted the heartbeat's connectedUsers — Ravi appeared.
    expect(await screen.findByText('RI')).toBeTruthy();
  });

  it("shows another author's lock using the server's label, and offers no unlock", async () => {
    // `mine` is the server's answer. The client used to compute this by
    // comparing its own id string to the lock's, which it cannot do correctly
    // — it does not know how the server identifies it.
    (window as any).C2C_PROJECT = { id: 'proj-1' };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST' && url === '/api/realtime-collab/rooms') return ok({ success: true, data: { room: { connectedUsers: [] } } });
      if (method === 'GET' && url.startsWith('/api/realtime-collab/locks/')) {
        return ok({ success: true, data: [{ documentId: 'D1', sectionId: 'S1', mine: false, lockedByLabel: 'Jo Park', reason: 'Editing' }] });
      }
      return ok({ success: true });
    });
    render(<AuthoringCollab documentId="D1" sectionId="S1" fireToast={vi.fn()} />);
    expect(await screen.findByText(/locked by Jo Park/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Unlock/ })).toBeNull();
  });

  it('offers unlock for a lock the server says is mine', async () => {
    (window as any).C2C_PROJECT = { id: 'proj-1' };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST' && url === '/api/realtime-collab/rooms') return ok({ success: true, data: { room: { connectedUsers: [] } } });
      if (method === 'GET' && url.startsWith('/api/realtime-collab/locks/')) {
        return ok({ success: true, data: [{ documentId: 'D1', sectionId: 'S1', mine: true, lockedByLabel: 'Maya Lin' }] });
      }
      if (method === 'DELETE') return ok({ success: true, released: true });
      return ok({ success: true });
    });
    const fireToast = vi.fn();
    render(<AuthoringCollab documentId="D1" sectionId="S1" fireToast={fireToast} />);
    fireEvent.click(await screen.findByRole('button', { name: /Unlock/ }));
    await waitFor(() => {
      const del = apiRequest.mock.calls.find((c) => c[0] === 'DELETE' && String(c[1]).includes('/locks/'));
      expect(del).toBeTruthy();
      // Releasing carries no identity: the server releases only the caller's own.
      expect(del![2]).not.toHaveProperty('userId');
    });
  });

  it('leaves the room by document id and "me", not by naming a user', async () => {
    // The old path was /rooms/:roomKey/users/:userId, which let a caller evict
    // any user from any room by naming both. The leave now rides a keepalive
    // fetch (a plain XHR is cancelled mid-unload — assessment D29), so the
    // contract is asserted on global fetch, not the apiRequest wrapper.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ok({ success: true, removed: true }) as unknown as Response);
    (window as any).C2C_PROJECT = { id: 'proj-1' };
    const { unmount } = render(<AuthoringCollab documentId="D1" sectionId="S1" fireToast={vi.fn()} />);
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[0] === 'POST' && c[1] === '/api/realtime-collab/rooms')).toBe(true));
    unmount();
    await waitFor(() => {
      const leave = fetchSpy.mock.calls.find(
        (c) => String(c[0]).includes('/users/') && (c[1] as RequestInit | undefined)?.method === 'DELETE'
      );
      expect(leave).toBeTruthy();
      expect(String(leave![0])).toBe('/api/realtime-collab/rooms/D1/users/me?sectionId=S1');
      // Survives navigation/tab close.
      expect((leave![1] as RequestInit).keepalive).toBe(true);
      // No body naming a user — the server removes the authenticated caller.
      expect((leave![1] as RequestInit).body).toBeUndefined();
    });
    fetchSpy.mockRestore();
  });

  it('renders nothing without a project (no join, no fabricated identity)', () => {
    const { container } = render(<AuthoringCollab documentId="D1" sectionId="S1" fireToast={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/realtime-collab/rooms')).toBe(false);
  });
});
