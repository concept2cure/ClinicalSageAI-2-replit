// @vitest-environment jsdom
/**
 * AuthoringCollab — proves the presence + section-locking layer is wired to the
 * real collaboration service (/api/realtime-collab): joins the section room and
 * renders the SERVER's connected-user roster, acquires/releases a section lock
 * against the real endpoints, surfaces a 409 lock conflict with the server's
 * reason, and renders nothing (no fabricated identity) without a project/user.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));
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
      return ok({ success: true, data: { room: { connectedUsers: [{ userId: 'maya@acme.co', displayName: 'Maya Lin' }, { userId: 'jo@acme.co', displayName: 'Jo Park' }] }, user: {}, websocket: {} } });
    }
    if (method === 'GET' && url.startsWith('/api/realtime-collab/locks/')) return ok({ success: true, data: [] });
    if (method === 'POST' && url === '/api/realtime-collab/locks') return ok({ success: true, data: { documentId: 'D1', sectionId: 'S1', userId: 'maya@acme.co' } });
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
      expect(join![2]).toMatchObject({ documentId: 'D1', projectId: 'proj-1', sectionId: 'S1', userId: 'maya@acme.co' });
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
      expect(call![2]).toMatchObject({ documentId: 'D1', sectionId: 'S1', userId: 'maya@acme.co' });
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
    await waitFor(() => expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/Locked by jo@acme.co/)));
  });

  it('sends the awareness heartbeat and adopts the server roster from its response', async () => {
    (window as any).C2C_PROJECT = { id: 'proj-1' };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST' && url === '/api/realtime-collab/rooms') return ok({ success: true, data: { room: { connectedUsers: [{ userId: 'maya@acme.co', displayName: 'Maya Lin' }] } } });
      if (method === 'GET' && url.startsWith('/api/realtime-collab/locks/')) return ok({ success: true, data: [] });
      if (method === 'PUT' && url === '/api/realtime-collab/rooms/D1%3AS1/awareness') {
        return ok({ success: true, connectedUsers: [{ userId: 'maya@acme.co', displayName: 'Maya Lin' }, { userId: 'ravi@acme.co', displayName: 'Ravi Iyer' }] });
      }
      return ok({ success: true });
    });
    render(<AuthoringCollab documentId="D1" sectionId="S1" fireToast={vi.fn()} />);
    await waitFor(() => {
      const beat = apiRequest.mock.calls.find((c) => c[0] === 'PUT' && String(c[1]).endsWith('/awareness'));
      expect(beat).toBeTruthy();
      expect(beat![2]).toMatchObject({ userId: 'maya@acme.co', focusedField: 'S1' });
    });
    // The roster adopted the heartbeat's connectedUsers — Ravi appeared.
    expect(await screen.findByText('RI')).toBeTruthy();
  });

  it('renders nothing without a project (no join, no fabricated identity)', () => {
    const { container } = render(<AuthoringCollab documentId="D1" sectionId="S1" fireToast={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/realtime-collab/rooms')).toBe(false);
  });
});
