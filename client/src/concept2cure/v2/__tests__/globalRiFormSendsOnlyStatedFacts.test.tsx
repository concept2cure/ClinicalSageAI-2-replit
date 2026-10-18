// @vitest-environment jsdom
/**
 * The global-RI capability form sends only what the user stated.
 *
 * Until 2026-10-15 every boolean in the form started as false and the whole
 * form was posted, so a question nobody answered arrived at the server as a
 * stated "No" — an expedited-reporting case with seriousness, expectedness and
 * causality untouched came back "not reportable", a verdict about a case nobody
 * assessed. A boolean is now three-valued (Not stated / Yes / No) and an
 * untouched field is not sent.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const signedIn = vi.hoisted(() => ({ id: 7, organizationId: 7, firstName: 'Ada' }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: signedIn }),
  useAuthUser: () => signedIn,
}));
const CATALOG = {
  total: 1,
  anaToolCount: 1,
  groups: [{ id: 'safety', label: 'Safety' }],
  byGroup: { safety: 1 },
  capabilities: [
    {
      id: 'cap-safety',
      label: 'Expedited safety reporting',
      group: 'safety',
      description: '',
      form: [],
      anaTools: ['global_ri_safety_reporting'],
      deterministic: true,
      routes: ['POST /safety-reporting/classify'],
      evidence: [],
      tools: [
        {
          name: 'global_ri_safety_reporting',
          description: '',
          inputSchema: {
            properties: {
              region: { type: 'string', enum: ['FDA', 'EMA'] },
              serious: { type: 'boolean' },
              unexpected: { type: 'boolean' },
            },
            required: ['region'],
          },
        },
      ],
    },
  ],
};
vi.mock('@/hooks/useGlobalRiCatalog', () => ({
  useGlobalRiCatalog: () => ({ data: CATALOG, isLoading: false, isError: false }),
}));

import { GlobalRiBrowser } from '../surfaces/GlobalRiBrowser';
import { __resetSurfaceActionBus, applySurfaceAction, registeredSurfaceId } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

async function openSafetyCapability() {
  render(<GlobalRiBrowser onAsk={vi.fn()} />);
  await waitFor(() => expect(registeredSurfaceId()).toBe('global-ri'));
  const res = resolveSurfaceAction('intelligence.open-capability', { capability: 'Expedited safety reporting' });
  if (!res.ok) throw new Error(res.error);
  act(() => {
    applySurfaceAction(res.directive, vi.fn());
  });
  await screen.findByText('Run capability', { exact: false });
}

function postedBody(): Record<string, unknown> {
  const call = apiRequest.mock.calls.find((c) => c[0] === 'POST');
  if (!call) throw new Error('the capability was not run');
  return call[2] as Record<string, unknown>;
}

describe('global-RI capability form', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async () => ok({ success: true, data: {} }));
  });
  afterEach(() => {
    cleanup();
    __resetSurfaceActionBus();
  });

  it('does not send an untouched yes/no question as "No"', async () => {
    await openSafetyCapability();
    fireEvent.change(document.getElementById('gri-region') as HTMLSelectElement, { target: { value: 'FDA' } });
    fireEvent.click(screen.getByText('Run capability', { exact: false }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());

    const body = postedBody();
    expect(body).toEqual({ region: 'FDA' });
    expect(body).not.toHaveProperty('serious');
    expect(body).not.toHaveProperty('unexpected');
  });

  it('sends a stated "No" as false, and lets an answer be taken back', async () => {
    await openSafetyCapability();
    fireEvent.change(document.getElementById('gri-region') as HTMLSelectElement, { target: { value: 'FDA' } });
    const serious = document.getElementById('gri-serious') as HTMLSelectElement;
    expect(serious.value).toBe('');
    fireEvent.change(serious, { target: { value: 'no' } });
    const unexpected = document.getElementById('gri-unexpected') as HTMLSelectElement;
    fireEvent.change(unexpected, { target: { value: 'yes' } });
    fireEvent.change(unexpected, { target: { value: '' } });
    fireEvent.click(screen.getByText('Run capability', { exact: false }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());

    expect(postedBody()).toEqual({ region: 'FDA', serious: false });
  });
});
