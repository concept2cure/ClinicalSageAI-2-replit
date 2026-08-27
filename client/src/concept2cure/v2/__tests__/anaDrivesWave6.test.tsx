// @vitest-environment jsdom
/**
 * Wave 6 — the ceremony channel, proven end to end on the surface whose
 * recorded wave-2 limitation it closes: CmcModule's pane forms were
 * child-local and invisible to cmc.open-tab, so a driven switch could unmount
 * a person's half-completed governed form. C2CForm now reports itself
 * (v2/ceremony.ts), and the handler refuses while one is mounted — shown here
 * by really opening the batch-record form and watching the refusal, then
 * cancelling and watching the same directive apply.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 7, firstName: 'Ada' } }),
}));

import { CmcModule } from '../surfaces/CmcModule';
import { __resetCeremonies, ceremonyOpen, registerCeremonyOpen } from '../ceremony';
import {
  __resetSurfaceActionBus,
  applySurfaceAction,
  registeredSurfaceId,
} from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

function directive(actionId: string, params: Record<string, unknown> = {}) {
  const res = resolveSurfaceAction(actionId, params);
  if (!res.ok) throw new Error(`fixture action ${actionId} does not resolve: ${res.error}`);
  return res.directive;
}
function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}
type Outcome = { status: string; detail?: string; reason?: string };
function apply(actionId: string, params: Record<string, unknown> = {}): Outcome {
  let outcome: Outcome = { status: '' };
  act(() => {
    outcome = applySurfaceAction(directive(actionId, params), vi.fn()) as Outcome;
  });
  return outcome;
}

afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  __resetCeremonies();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('the ceremony channel (unit)', () => {
  it('counts registrations, unregisters idempotently, and resets', () => {
    expect(ceremonyOpen()).toBe(false);
    const un1 = registerCeremonyOpen();
    const un2 = registerCeremonyOpen();
    expect(ceremonyOpen()).toBe(true);
    un1();
    un1(); // StrictMode double-cleanup must not double-decrement.
    expect(ceremonyOpen()).toBe(true);
    un2();
    expect(ceremonyOpen()).toBe(false);
  });
});

describe('CmcModule — a driven tab switch refuses over a mounted governed form', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async () => ok({}));
    // cmcProjectUuid() accepts only a well-formed UUID.
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'BX-301',
    };
  });

  const props = () =>
    ({ surface: { id: 'cmc-module', label: 'CMC' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

  it('open the batch form → open-tab refused; cancel it → the same directive applies', async () => {
    render(<CmcModule {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('cmc'));

    expect(apply('cmc.open-tab', { tab: 'batch' }).status).toBe('applied');
    fireEvent.click(await screen.findByRole('button', { name: /Log batch/ }));
    await screen.findByText('Log a batch record');
    expect(ceremonyOpen()).toBe(true);

    const refused = apply('cmc.open-tab', { tab: 'specs' });
    expect(refused.status).toBe('failed');
    expect(refused.reason).toContain('governed form is open');

    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(ceremonyOpen()).toBe(false));

    const applied = apply('cmc.open-tab', { tab: 'specs' });
    expect(applied.status).toBe('applied');
  });
});
