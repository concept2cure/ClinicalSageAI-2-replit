// @vitest-environment jsdom
/**
 * While a session adoption is pending (authService.adoptSession, across its
 * GET /session) no authoring read is current. The read session that fences
 * them is one session for the whole window, and exactly one new session
 * follows when the adoption settles. It used to be minted again on every
 * render of the window, and DocumentWorkbench's session-keyed section read
 * then set state on every render: "Maximum update depth exceeded" on one click
 * (docs/evidence/D2-ONE-ANA/2026-10-29/read-session-adoption-loop/).
 *
 * The real authService throughout: a stable account (setToken), the real
 * revision guard and a real adoptSession whose GET /session the test answers.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }) };
});
import { authService, type AuthUser } from '@/services/portal/authService';
import { useAuthoringReadSession } from '../authoringCurrentRead';
import { DocumentWorkbench } from '../DocumentWorkbench';

const emptyRects = () => [] as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect);
}

const AUTHOR: AuthUser = { id: '1', organizationId: '7', organizationName: 'Synthetic sponsor',
  firstName: 'Test', lastName: 'Author', displayName: 'Author', email: 'author@example.test',
  roles: ['member'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
const ADOPTED: AuthUser = { ...AUTHOR, organizationId: '8', organizationName: 'Second synthetic sponsor' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The adoption's GET /session, held until the test answers it. Nothing else reaches the network. */
function holdAdoptionProbe() {
  let answer!: (response: Response) => void;
  const probe = new Promise<Response>(resolve => { answer = resolve; });
  vi.stubGlobal('fetch', vi.fn((url: unknown) => String(url).endsWith('/api/v1/auth/session') ? probe : Promise.resolve(json(503, {}))));
  return {
    adopt: (account: AuthUser) => answer(json(200, { authenticated: true, user: account, session: { idleMinutes: 30, lifetimeHours: 12 } })),
    refuse: () => answer(json(401, { error: { code: 'TOKEN_INVALID', message: 'Not a session.' } })),
  };
}

afterEach(() => {
  cleanup();
  authService.endSession(null);
  localStorage.clear(); sessionStorage.clear();
  vi.unstubAllGlobals();
  delete window.C2C_PROJECT;
});

describe('the authoring read session across a pending session adoption', () => {
  it('keeps one fenced session for the whole window, then mints exactly one for the adopted account', async () => {
    authService.setToken('synthetic-before', AUTHOR, 'synthetic-refresh-before');
    const view = renderHook(() => useAuthoringReadSession(authService.getUser()));
    const before = view.result.current;
    expect(before.sameRevision()).toBe(true);

    const probe = holdAdoptionProbe();
    let adopting!: Promise<AuthUser | null>;
    act(() => { adopting = authService.adoptSession('synthetic-adopted'); });
    const keys = new Set<number>();
    for (let render = 0; render < 25; render += 1) {
      view.rerender();
      keys.add(view.result.current.key);
      expect(view.result.current.sameRevision()).toBe(false);
    }
    const held = view.result.current;
    expect([...keys]).toEqual([before.key + 1]);
    expect(before.sameRevision()).toBe(false);
    expect(held.actor).toBe('7:1');

    await act(async () => { probe.adopt(ADOPTED); expect(await adopting).toMatchObject({ organizationId: '8' }); });
    const after = view.result.current;
    expect(after.key).toBe(held.key + 1);
    expect(after.actor).toBe('8:1');
    expect(after.sameRevision()).toBe(true);
    expect(held.sameRevision()).toBe(false);
    for (let render = 0; render < 5; render += 1) view.rerender();
    expect(view.result.current).toBe(after);
  });

  it('a refused adoption leaves the account; the window session never becomes current, and one session follows', async () => {
    authService.setToken('synthetic-before', AUTHOR, 'synthetic-refresh-before');
    const view = renderHook(() => useAuthoringReadSession(authService.getUser()));
    const before = view.result.current;
    const probe = holdAdoptionProbe();
    let adopting!: Promise<AuthUser | null>;
    act(() => { adopting = authService.adoptSession('synthetic-forged'); });
    view.rerender(); view.rerender();
    const held = view.result.current;
    expect(held.key).toBe(before.key + 1);

    await act(async () => { probe.refuse(); expect(await adopting).toBeNull(); });
    expect(authService.getUser()).toBe(AUTHOR);
    // A read begun in the window is never shown, even though the account stayed.
    expect(held.sameRevision()).toBe(false);
    view.rerender();
    const after = view.result.current;
    expect(after.key).toBe(held.key + 1);
    expect(after.actor).toBe('7:1');
    expect(after.sameRevision()).toBe(true);
    view.rerender(); view.rerender();
    expect(view.result.current).toBe(after);
  });

  it('an ordinary bearer refresh keeps the session; a new sign-in of the same account replaces it', async () => {
    authService.setToken('synthetic-before', AUTHOR, 'synthetic-refresh-before');
    const view = renderHook(() => useAuthoringReadSession(authService.getUser()));
    const before = view.result.current;
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { accessToken: 'synthetic-refreshed', refreshToken: 'synthetic-refresh-after', expiresIn: 3600 })));
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(view.result.current).toBe(before);
    expect(before.sameRevision()).toBe(true);

    act(() => { authService.endSession(null); authService.setToken('synthetic-again', AUTHOR, 'synthetic-refresh-again'); });
    expect(view.result.current.key).toBe(before.key + 1);
    expect(view.result.current.actor).toBe('7:1');
    expect(before.sameRevision()).toBe(false);
    expect(view.result.current.sameRevision()).toBe(true);
  });
});

const PID = '30000000-0000-4000-8000-000000000001';
const DOC = '10000000-0000-4000-8000-000000000001';
const row = { id: DOC, title: 'Synthetic draft', module: null, product_code: null,
  status: 'DRAFT', c2c_document_id: null, updated_at: null, section_count: 2 };
const sectionRows = (prefix: string, idSpace: string) => ['A', 'B'].map((name, index) => ({
  id: `${idSpace}0000000-0000-4000-8000-00000000000${index + 1}`, doc_id: DOC, code: `3.2.S.${index + 1}`, title: `Section ${name}`,
  content: `<p>${prefix} section ${name}.</p>`, order_index: index, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: null,
}));
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

describe('the workbench during a pending session adoption', () => {
  it('holds its sections on one click, reads once, and reads again only as the adopted account', async () => {
    authService.setToken('synthetic-before', AUTHOR, 'synthetic-refresh-before');
    window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
    let adopted = false;
    let sectionReads = 0;
    apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
      const path = url.split('?')[0];
      if (path === `/api/authoring/docs/${DOC}`) return ok({ document: row });
      if (path === `/api/authoring/docs/${DOC}/sections`) {
        sectionReads += 1;
        return ok({ sections: adopted ? sectionRows('Adopted', '4') : sectionRows('Saved', '2') });
      }
      return ok({ success: true, sections: [], revisions: [], comments: [], sources: [], citations: [] });
    });
    render(<DocumentWorkbench docs={[row]} docsState="ready" status="all" reloadDocs={vi.fn()}
      pinnedDocId={DOC} programId={PID} onNav={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Saved section A.'));

    const probe = holdAdoptionProbe();
    let adopting!: Promise<AuthUser | null>;
    act(() => { adopting = authService.adoptSession('synthetic-adopted'); });
    const readsBefore = sectionReads;
    const sectionB = Array.from(document.querySelectorAll('button.ed-tree-row')).find(button => button.textContent?.includes('3.2.S.2'));
    expect(sectionB).toBeTruthy();
    fireEvent.click(sectionB!);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    const windowReads = sectionReads - readsBefore;
    expect(windowReads).toBeLessThanOrEqual(1);
    // Held, not shown as current: the previous account's sections are withdrawn.
    expect(Array.from(document.querySelectorAll('button.ed-tree-row'), button => button.textContent)).toEqual([expect.stringContaining('Synthetic draft')]);
    expect(document.querySelector('.tiptap')).toBeNull();
    expect(document.body.textContent).not.toContain('Saved section');
    expect(screen.getByText('Loading sections…')).toBeTruthy();

    adopted = true;
    await act(async () => { probe.adopt(ADOPTED); expect(await adopting).toMatchObject({ organizationId: '8' }); });
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Adopted section A.'));
    expect(sectionReads - readsBefore).toBe(windowReads + 1);
    expect(document.body.textContent).not.toContain('Saved section');
    // Only presence (realtime-collab rooms and awareness) is sent, as on mount; no governed write.
    expect(apiRequest.mock.calls.filter(([method, url]) => method !== 'GET' && !String(url).startsWith('/api/realtime-collab/'))).toEqual([]);
  });
});
