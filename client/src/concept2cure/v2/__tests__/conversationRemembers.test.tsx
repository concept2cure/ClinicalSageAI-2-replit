// @vitest-environment jsdom
/**
 * What AnA remembers is reached from the conversation (D2, fold ana-memory into
 * the conversation, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-ana-memory/).
 *
 * The conversation's header opens the panel beside it, and the project the
 * panel reads the project-scoped notes for is the project this conversation's
 * turns are sent under: the one `useAnaChat` is given, which the stream admits
 * and loadRelationalOverlay reads the same row for.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => ({
  ...await original<typeof import('@/services/portal/authService')>(),
  useAuth: () => ({ user: { id: '1', organizationId: '1', displayName: 'Test Author', email: 'author@test.co' } }),
}));

const chatOptions = vi.hoisted(() => [] as Array<{ projectId?: unknown }>);
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: (options: { projectId?: unknown }) => {
    chatOptions.push(options);
    return {
      messages: [],
      isStreaming: false,
      isLoadingThread: false,
      loadThread: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      threadId: null,
    };
  },
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};
const PROGRAM = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
let projectBefore: typeof window.C2C_PROJECT;

beforeEach(() => {
  projectBefore = window.C2C_PROJECT;
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'new' };
  chatOptions.length = 0;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/ana/memory/profile') {
      return ok({ data: { interaction_count: 2, last_interaction_at: null, profile_summary: 'Answer first.', tone_calibration: {}, emotional_signals: [], acknowledged_mistakes: [] }, meta: { scope: 'user' } });
    }
    if (method === 'GET' && url.startsWith('/api/mdx/ana/memory/profile?project_id=')) {
      return ok({ data: null, meta: { scope: 'project', projectId: 11, projectRef: PROGRAM } });
    }
    return ok({ success: true, data: [] });
  });
});
afterEach(() => {
  cleanup();
  window.C2C_PROJECT = projectBefore;
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

const profileReads = () => apiRequest.mock.calls.map(([, url]) => String(url)).filter((u) => u.startsWith('/api/mdx/ana/memory/profile'));

describe('the conversation reaches What AnA remembers', () => {
  it('opens the panel from the header, for the project this conversation’s turns are sent under', async () => {
    window.C2C_PROJECT = { id: PROGRAM, product: 'ZX-9' } as typeof window.C2C_PROJECT;
    render(<ConversationThread {...PROPS} />);
    // Nothing is read until the person asks to see it.
    expect(profileReads()).toEqual([]);
    expect(screen.queryByRole('dialog', { name: 'What AnA remembers' })).toBeNull();

    const toggle = screen.getByRole('button', { name: 'What AnA remembers' });
    expect(toggle.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(toggle);

    const dialog = await screen.findByRole('dialog', { name: 'What AnA remembers' });
    expect(await within(dialog).findByText('Answer first.')).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: /for this project: zx-9/i })).toBeTruthy();
    await waitFor(() => expect(profileReads().sort()).toEqual([
      '/api/mdx/ana/memory/profile',
      `/api/mdx/ana/memory/profile?project_id=${PROGRAM}`,
    ]));
    // The same project the conversation's turns carry.
    expect(chatOptions.at(-1)?.projectId).toBe(PROGRAM);
  });

  it('closes on Escape and hands focus back to the header control', async () => {
    window.C2C_PROJECT = { id: PROGRAM, product: 'ZX-9' } as typeof window.C2C_PROJECT;
    render(<ConversationThread {...PROPS} />);
    const toggle = screen.getByRole('button', { name: 'What AnA remembers' });
    toggle.focus();
    fireEvent.click(toggle);
    const dialog = await screen.findByRole('dialog', { name: 'What AnA remembers' });
    await within(dialog).findByText('Answer first.');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'What AnA remembers' })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'What AnA remembers' }));
  });

  it('with no project open, reads only the person’s own notes', async () => {
    window.C2C_PROJECT = undefined as unknown as typeof window.C2C_PROJECT;
    try { sessionStorage.clear(); } catch { /* jsdom */ }
    render(<ConversationThread {...PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: 'What AnA remembers' }));
    const dialog = await screen.findByRole('dialog', { name: 'What AnA remembers' });
    expect(await within(dialog).findByText('Answer first.')).toBeTruthy();
    expect(within(dialog).getByText(/no project is open/i)).toBeTruthy();
    expect(profileReads()).toEqual(['/api/mdx/ana/memory/profile']);
  });
});
