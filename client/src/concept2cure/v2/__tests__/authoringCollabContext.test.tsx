// @vitest-environment jsdom
/** Existing editor collaboration must not carry intent or replies to another context. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AuthUser } from '@/services/portal/authService';

const boundary = vi.hoisted(() => ({ apiRequest: vi.fn(), user: null as AuthUser | null,
  revision: 0, listeners: new Set<() => void>() }));
vi.mock('@/lib/queryClient', async original => ({
  ...await original<typeof import('@/lib/queryClient')>(), apiRequest: boundary.apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: boundary.user }),
  authService: {
    getUser: () => boundary.user,
    captureSessionReadGuard: () => {
      const revision = boundary.revision;
      return { sameRevision: () => revision === boundary.revision };
    },
    on: (_event: string, handler: () => void) => {
      boundary.listeners.add(handler);
      return () => { boundary.listeners.delete(handler); };
    },
  },
}));
import { AuthoringCollab } from '../surfaces/AuthoringCollab';
import { publishShellProject } from '../shellProject';

const D1 = '11111111-1111-4111-8111-111111111111', D2 = '22222222-2222-4222-8222-222222222222';
const S1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', S2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const S3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REASON = 'Jo asked me to finish the first section.';
const account = (): AuthUser => ({ id: '7001', organizationId: '1', email: 'maya@example.test',
  displayName: 'Maya Lin', firstName: 'Maya', lastName: 'Lin', roles: ['AUTHOR'], permissions: ['authoring.read'],
  organizationName: 'Fictional test organization', mfaEnabled: false, mfaMethods: [], mustChangePassword: false });
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const joined = (name = 'Jo Park') => ok({ success: true, data: { room: { connectedUsers: [{ userId: '7002', displayName: name }] } } });
const locks = (documentId = D1) => ok({ success: true, data: documentId === D1 ? [
  { documentId, sectionId: S1, mine: false, lockedByLabel: 'Jo Park' },
  { documentId, sectionId: S2, mine: false, lockedByLabel: 'Ravi Iyer' },
] : [{ documentId, sectionId: S3, mine: true }] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}
let join: (documentId: string) => Promise<Response>;
let read: (documentId: string) => Promise<Response>;
let beat: (documentId: string, body: Record<string, unknown>) => Promise<Response>;
let write: (method: string, body: Record<string, unknown>) => Promise<Response>;
const count = (method: string, suffix: string) => boundary.apiRequest.mock.calls
  .filter(([verb, url]) => verb === method && String(url).endsWith(suffix)).length;

beforeEach(() => {
  boundary.user = account(); boundary.revision = 0; boundary.apiRequest.mockReset();
  window.C2C_PROJECT = { id: '1' };
  vi.stubGlobal('fetch', vi.fn(async () => ok({ success: true })));
  join = async () => joined(); read = async id => locks(id);
  beat = async () => ok({ roomKnown: false, connectedUsers: [] });
  write = async () => ok({ success: true, released: true });
  boundary.apiRequest.mockImplementation(async (method: string, path: string, body?: Record<string, unknown>) => {
    if (method === 'POST' && path.endsWith('/rooms')) return join(String(body?.documentId));
    if (method === 'GET' && path.includes('/locks/')) return read(decodeURIComponent(path.split('/').at(-1)!));
    if (method === 'PUT' && path.endsWith('/awareness')) return beat(path.split('/').at(-2)!, body ?? {});
    return write(method, body ?? {});
  });
});
afterEach(() => {
  cleanup(); boundary.listeners.clear(); vi.unstubAllGlobals(); delete window.C2C_PROJECT;
});

async function arm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Take over the section lock' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Reason for taking over the lock' }), { target: { value: REASON } });
}
const renderEditor = (toast = vi.fn()) => ({ toast,
  ...render(<AuthoringCollab documentId={D1} sectionId={S1} fireToast={toast} />) });

describe('the existing authoring collaboration context', () => {
  it('keeps a fresh, explicitly confirmed takeover in its original section', async () => {
    const { toast } = renderEditor(); await arm();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm lock takeover' }));
    await waitFor(() => expect(boundary.apiRequest).toHaveBeenCalledWith('POST', '/api/realtime-collab/locks', {
      documentId: D1, sectionId: S1, lockType: 'section-edit', takeover: true, reason: REASON,
    }));
    expect(toast).toHaveBeenCalledWith('Lock taken over — the previous holder has been notified.');
  });

  it('requires a fresh first step and blank reason when another section is selected', async () => {
    const ui = renderEditor(); await arm();
    ui.rerender(<AuthoringCollab documentId={D1} sectionId={S2} fireToast={ui.toast} />);
    expect(screen.queryByRole('button', { name: 'Confirm lock takeover' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Take over the section lock' }));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'Confirm lock takeover' }) as HTMLButtonElement).disabled).toBe(true);
    expect(count('POST', '/locks')).toBe(0);
  });

  it('clears previous document peers and locks while the next room is still joining', async () => {
    const ui = renderEditor(); await arm(); expect(screen.getByText('JP')).toBeTruthy();
    const pending = deferred<Response>(); join = async () => pending.promise;
    ui.rerender(<AuthoringCollab documentId={D2} sectionId={S3} fireToast={ui.toast} />);
    expect(screen.queryByText('JP')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(/locked by Jo/)).toBeNull();
  });

  it.each(['project', 'actor', 'permissions'])('retires takeover intent after a %s change', async kind => {
    const ui = renderEditor(); await arm();
    await act(async () => {
      if (kind === 'project') publishShellProject({ id: '2' });
      else {
        boundary.user = { ...boundary.user!, ...(kind === 'actor' ? { id: '7003', organizationId: '2' } : { permissions: [] }) };
        boundary.listeners.forEach(notify => notify());
      }
    });
    ui.rerender(<AuthoringCollab documentId={D1} sectionId={S1} fireToast={ui.toast} />);
    expect(screen.queryByRole('button', { name: 'Confirm lock takeover' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('does not revive an armed takeover across a batched project A to B to A visit', async () => {
    renderEditor(); await arm();
    await act(async () => { publishShellProject({ id: '2' }); publishShellProject({ id: '1' }); });
    expect(screen.queryByRole('button', { name: 'Confirm lock takeover' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps a same-account refresh and its part-written reason in the same session', async () => {
    const ui = renderEditor(); await arm(); const joins = count('POST', '/rooms');
    await act(async () => {
      boundary.user = { ...boundary.user!, roles: [...boundary.user!.roles], permissions: [...boundary.user!.permissions] };
      boundary.listeners.forEach(notify => notify());
    });
    ui.rerender(<AuthoringCollab documentId={D1} sectionId={S1} fireToast={ui.toast} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(REASON);
    expect(count('POST', '/rooms')).toBe(joins);
  });

});

describe('pending authoring collaboration work keeps its original owner', () => {
  it('ignores a previous document lock read that resolves after the current lock read', async () => {
    const old = deferred<Response>(); read = async id => id === D1 ? old.promise : locks(id);
    const ui = renderEditor(); await waitFor(() => expect(count('GET', D1)).toBe(1));
    ui.rerender(<AuthoringCollab documentId={D2} sectionId={S3} fireToast={ui.toast} />);
    await screen.findByRole('button', { name: 'Unlock' });
    await act(async () => { old.resolve(ok({ success: true, data: [] })); });
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeTruthy();
  });

  it.each(['acquire', 'release', 'takeover'])('suppresses a retired %s result and its follow-up read', async kind => {
    const pending = deferred<Response>(); write = async () => pending.promise;
    if (kind === 'acquire') read = async () => ok({ data: [] });
    if (kind === 'release') read = async () => ok({ data: [{ sectionId: S1, mine: true }] });
    const ui = renderEditor();
    if (kind === 'takeover') { await arm(); fireEvent.click(screen.getByRole('button', { name: 'Confirm lock takeover' })); }
    else fireEvent.click(await screen.findByRole('button', { name: kind === 'release' ? 'Unlock' : 'Lock section' }));
    await waitFor(() => expect(count(kind === 'release' ? 'DELETE' : 'POST', kind === 'release' ? D1 : '/locks')).toBe(1));
    const reads = count('GET', D1);
    ui.rerender(<AuthoringCollab documentId={D2} sectionId={S3} fireToast={ui.toast} />);
    await act(async () => { pending.resolve(ok({ success: true, released: true })); });
    expect(ui.toast).not.toHaveBeenCalled();
    expect(count('GET', D1)).toBe(reads);
  });

  it('keeps a newer same-context lock read when the older initial read resolves last', async () => {
    const old = deferred<Response>(); let reads = 0;
    read = async () => ++reads === 1 ? old.promise : ok({ data: [{ sectionId: S1, mine: true }] });
    renderEditor(); await waitFor(() => expect(count('GET', D1)).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Lock section' }));
    await screen.findByRole('button', { name: 'Unlock' });
    await act(async () => { old.resolve(ok({ data: [] })); });
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeTruthy();
  });

  it('does not apply a late action after auth retires before the next render', async () => {
    const pending = deferred<Response>(); write = async () => pending.promise;
    const ui = renderEditor(); await arm();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm lock takeover' }));
    await waitFor(() => expect(count('POST', '/locks')).toBe(1));
    const reads = count('GET', D1); boundary.revision += 1;
    await act(async () => { pending.resolve(ok({ success: true })); });
    expect(ui.toast).not.toHaveBeenCalled(); expect(count('GET', D1)).toBe(reads);
  });

  it('does not let a previous section heartbeat replace the current room roster', async () => {
    const old = deferred<Response>();
    join = async () => joined('Ravi Iyer');
    beat = async (_id, body) => body.sectionId === S1 ? old.promise : ok({ roomKnown: false, connectedUsers: [] });
    const ui = renderEditor(); await waitFor(() => expect(count('PUT', '/awareness')).toBe(1));
    ui.rerender(<AuthoringCollab documentId={D1} sectionId={S2} fireToast={ui.toast} />);
    await screen.findByText('RI');
    await act(async () => { old.resolve(ok({ connectedUsers: [{ userId: '99', displayName: 'Old Peer' }] })); });
    expect(screen.getByText('RI')).toBeTruthy(); expect(screen.queryByText('OP')).toBeNull();
  });
});
