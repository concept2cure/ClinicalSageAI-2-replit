// @vitest-environment jsdom
/**
 * Risk-based monitoring as a reader meets it (UI walk, 2026-10-31):
 *
 * - The page had no padding of its own. Its title sat against the rail and
 *   its project picker ran off the right edge. It takes the one page frame,
 *   `.page-inner`, as its siblings do (D0.md §8.6, 2026-11-09).
 * - With no project chosen, the picker's caption read "Live RBM read-model".
 * - AnA's dock named the tool behind the screen ("Overview — tool
 *   get_rbm_attention"), a developer's word on a monitor's screen.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { seedCompanySession, endCompanySession } from './_company-session-fixture';

const h = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: h.request }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuthUser: () => actual.authService.getUser() };
});
vi.mock('../../components/ana/useAnaChat', () => ({ useAnaChat: () => ({
  messages: [], isStreaming: false, isLoadingThread: false, threadId: null, runStatus: null, pendingSteers: [], send: vi.fn(),
  reset: vi.fn(), pause: vi.fn(), resume: vi.fn(), interject: vi.fn(), stop: vi.fn(), loadThread: vi.fn(),
}) }));

import { Rbm } from '../surfaces/Rbm';
import { RbmAnaDock } from '../surfaces/RbmSurfaces';
import { RBM_NAV } from '../fixtures/rbm-data';
import { clearShellProject } from '../shellProject';
import { getSurface } from '@shared/constants/ui-surface-registry';

const rbmSurface = getSurface('rbm');
if (!rbmSurface) throw new Error('Registered RBM surface is required');
const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  clearShellProject(); seedCompanySession({ organizationId: '7' });
  h.request.mockReset().mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === '/api/mdx-rbm/rbm-programs') return envelope([]);
    throw new Error(`Unexpected RBM request ${method} ${path}`);
  });
});
afterEach(() => { cleanup(); endCompanySession(); clearShellProject(); });

describe('risk-based monitoring, as a reader meets it', () => {
  // The page takes the one page frame, as its sibling work areas do (D0.md §8.6): no frame of its own.
  it('takes the one page frame, as every sibling surface does', async () => {
    const { container } = render(<Rbm surface={rbmSurface} segment="biopharma" onNav={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Risk-based monitoring' });
    expect((container.firstElementChild as HTMLElement).classList.contains('page-inner')).toBe(true);
  });

  it('says nothing about a read model under the picker when no project is chosen', async () => {
    render(<Rbm surface={rbmSurface} segment="biopharma" onNav={vi.fn()} />);
    await waitFor(() => expect(h.request).toHaveBeenCalled());
    await screen.findByRole('heading', { name: 'Risk-based monitoring' });
    expect(screen.queryByText(/read-model/i)).toBeNull();
  });

  it('names the screen in AnA’s dock, not the tool behind it', () => {
    const nav = RBM_NAV[0];
    render(<RbmAnaDock nav={nav} study="" msgs={[]} onAsk={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('On this surface')).toBeTruthy();
    expect(screen.queryByText(nav.tool)).toBeNull();
    expect(screen.queryByText(/— tool/)).toBeNull();
  });
});
