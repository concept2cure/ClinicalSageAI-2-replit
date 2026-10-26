// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  user: { id: '33', organizationId: '1' } as { id: string; organizationId: string } | null,
  token: 'signed-in-access-token' as string | null,
  listeners: new Map<string, Set<() => void>>(),
}));
vi.mock('@/lib/queryClient', async (original) => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: mocks.request,
}));
vi.mock('@/services/portal/authService', () => ({
  authService: {
    getUser: () => mocks.user,
    on: (event: string, callback: () => void) => {
      if (!mocks.listeners.has(event)) mocks.listeners.set(event, new Set());
      mocks.listeners.get(event)!.add(callback);
      return () => mocks.listeners.get(event)!.delete(callback);
    },
  },
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => mocks.token, capturedActorHeaders: (scope: { userId: number; organizationId: number }) => {
  if (!mocks.token || scope.userId !== Number(mocks.user?.id) || scope.organizationId !== Number(mocks.user?.organizationId)) throw new Error('Session changed');
  return { Authorization: `Bearer ${mocks.token}`, 'x-organization-id': String(scope.organizationId) };
} }));

import { queryClient } from '@/lib/queryClient';
import { CatalogPanel } from '../surfaces/InsightsCatalogPanel';
import { AccountOnboardingSettings } from '../AccountOnboardingSettings';
import { REPORT_PERSONAS } from '@shared/constants/domain/report-personas';
import { reportPersonaKey } from '../reportingPersona';
import type { LibraryReportType } from '../surfaces/insightsLibraryShared';

const PATH = '/api/users/me/persona';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const persona = (value: string | null) => ({ persona: value, role: 'member', availablePersonas: REPORT_PERSONAS });
const types: LibraryReportType[] = [
  { typeId: 'qa.report', label: 'Quality report', family: 'readiness', scopes: ['account'], computedScopes: ['account'], segments: [], runnable: true, allowedPersonas: ['qa'] },
  { typeId: 'ra.report', label: 'Regulatory report', family: 'readiness', scopes: ['account'], computedScopes: ['account'], segments: [], runnable: true, allowedPersonas: ['ra_lead'] },
  { typeId: 'shared.report', label: 'Shared report', family: 'readiness', scopes: ['account'], computedScopes: ['account'], segments: [], runnable: true, allowedPersonas: [] },
];
const catalog = () => <CatalogPanel types={types} onRun={vi.fn()} canRun={false} programLabel={null} />;

beforeEach(() => {
  queryClient.clear();
  mocks.request.mockReset();
  mocks.user = { id: '33', organizationId: '1' };
  mocks.token = 'signed-in-access-token';
  mocks.listeners.clear();
  mocks.request.mockImplementation(async () => json(200, persona('qa')));
});
afterEach(() => { cleanup(); queryClient.clear(); });

describe('saved reporting role personalises the existing report catalog', () => {
  it('defaults the role filter from the self-only API without granting report execution', async () => {
    render(catalog());
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Reporting role' }) as HTMLSelectElement).value).toBe('qa'));
    expect(screen.getByText('Quality report')).toBeTruthy();
    expect(screen.getByText('Shared report')).toBeTruthy();
    expect(screen.queryByText('Regulatory report')).toBeNull();
    expect(mocks.request).toHaveBeenCalledWith('GET', PATH);
    for (const button of screen.getAllByRole('button', { name: 'Run' })) expect(button).toHaveProperty('disabled', true);
  });

  it('preserves a person’s explicit All filter when a slow profile read finishes', async () => {
    let finish!: (response: Response) => void;
    mocks.request.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    render(catalog());
    fireEvent.change(screen.getByRole('combobox', { name: 'Reporting role' }), { target: { value: 'ra_lead' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Reporting role' }), { target: { value: '' } });
    await act(async () => { finish(json(200, persona('qa'))); });
    expect((screen.getByRole('combobox', { name: 'Reporting role' }) as HTMLSelectElement).value).toBe('');
    expect(screen.getByText('Regulatory report')).toBeTruthy();
    expect(screen.getByText('Quality report')).toBeTruthy();
  });

  it('applies an Account save to an open catalog using the same identity-scoped query cache', async () => {
    mocks.request.mockImplementation(async (method: string, path: string) => {
      if (path === '/api/tenant-users/invitations/mine') return json(200, []);
      if (path === '/api/organizations?membershipOnly=true') return json(200, { success: true, organizations: [{ id: '1', name: null }] });
      if (method === 'PUT') return json(200, { success: true, persona: 'ra_lead', role: 'member' });
      return json(200, persona('qa'));
    });
    render(<>{catalog()}<AccountOnboardingSettings userId="33" organizationId="1" /></>);
    await waitFor(() => expect((screen.getAllByRole('combobox', { name: 'Reporting role' })[0] as HTMLSelectElement).value).toBe('qa'));
    await waitFor(() => expect(screen.getAllByRole('combobox', { name: 'Reporting role' })).toHaveLength(2));
    fireEvent.change(screen.getAllByRole('combobox', { name: 'Reporting role' })[1], { target: { value: 'ra_lead' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reporting role' }));
    await screen.findByText('Reporting role saved. Your access role is unchanged.');
    await waitFor(() => expect((screen.getAllByRole('combobox', { name: 'Reporting role' })[0] as HTMLSelectElement).value).toBe('ra_lead'));
    expect(screen.queryByText('Quality report')).toBeNull();
    expect(screen.getByText('Regulatory report')).toBeTruthy();
    expect(queryClient.getQueryData(reportPersonaKey('33', '1'))).toMatchObject({ persona: 'ra_lead', role: 'member' });
  });

  it('resets the old account’s override and loads the new session’s own role', async () => {
    render(catalog());
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Reporting role' }) as HTMLSelectElement).value).toBe('qa'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Reporting role' }), { target: { value: '' } });
    mocks.user = { id: '34', organizationId: '2' };
    mocks.request.mockImplementation(async () => json(200, persona('ra_lead')));
    act(() => mocks.listeners.get('user_updated')?.forEach(callback => callback()));
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Reporting role' }) as HTMLSelectElement).value).toBe('ra_lead'));
    expect(queryClient.getQueryData(reportPersonaKey('33', '1'))).toMatchObject({ persona: 'qa' });
    expect(queryClient.getQueryData(reportPersonaKey('34', '2'))).toMatchObject({ persona: 'ra_lead' });
  });

  it('reports an unreadable persona honestly and retries without blocking the governed catalog', async () => {
    let fail = true;
    mocks.request.mockImplementation(async () => json(200, fail ? { persona: 'super_admin', role: 'member', availablePersonas: ['super_admin'] } : persona('qa')));
    render(catalog());
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('saved reporting role could not be read'));
    expect(screen.getByText('Regulatory report')).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Reporting role' }) as HTMLSelectElement).value).toBe('qa'));
  });

  it('keeps All when a canonical saved persona is absent from this catalog’s report types', async () => {
    mocks.request.mockImplementation(async () => json(200, persona('finance')));
    render(catalog());
    await waitFor(() => expect(queryClient.getQueryData(reportPersonaKey('33', '1'))).toMatchObject({ persona: 'finance' }));
    expect((screen.getByRole('combobox', { name: 'Reporting role' }) as HTMLSelectElement).value).toBe('');
    expect(screen.getByText('Regulatory report')).toBeTruthy();
    expect(screen.getByText('Quality report')).toBeTruthy();
  });

  it('does not fetch an account persona without an authenticated session', () => {
    mocks.token = null;
    mocks.user = null;
    render(catalog());
    expect(mocks.request).not.toHaveBeenCalled();
    expect((screen.getByRole('combobox', { name: 'Reporting role' }) as HTMLSelectElement).value).toBe('');
  });
});
