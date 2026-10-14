// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('@/utils/authToken', () => ({ getJwtOrgId: () => '37', getAuthToken: () => 'test-token', getOrgId: () => '99' }));
import { SessionPolicySetting } from '../SessionPolicySetting';
import { ApiRequestError } from '@/lib/queryClient';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const payload = { success: true, settings: { security: { sessionTimeoutMinutes: 20, maxConcurrentSessions: 3 } } };
const field = (name: string) => screen.getByRole('spinbutton', { name });
const edit = async () => {
  await screen.findByRole('spinbutton', { name: 'Idle sign-out in minutes' });
  fireEvent.change(field('Idle sign-out in minutes'), { target: { value: '35' } });
  fireEvent.change(field('Maximum concurrent sessions'), { target: { value: '2' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Reason for session policy change' }), { target: { value: 'Reduce idle access window for onboarding' } });
};
beforeEach(() => { apiRequest.mockReset(); apiRequest.mockImplementation(async () => json(200, payload)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('governed session security policy', () => {
  it('reads runtime-backed keys and ignores obsolete sessionTimeout and unsupported flags', async () => {
    apiRequest.mockResolvedValue(json(200, { success: true, settings: { security: { sessionTimeout: 30, mfaEnabled: false, ipRestrictions: ['0.0.0.0/0'], passwordPolicy: { minLength: 1 } } } }));
    render(<SessionPolicySetting />);
    expect(await screen.findByRole('spinbutton', { name: 'Idle sign-out in minutes' })).toHaveProperty('value', '15');
    expect(field('Maximum concurrent sessions')).toHaveProperty('value', '5');
    expect(screen.getByText('12 hours')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/organizations/37/settings');
  });

  it('sends only the two enforced keys and an audited reason to the JWT organization', async () => {
    apiRequest.mockImplementation(async (method: string, _url: string, body?: unknown) => method === 'GET' ? json(200, payload) : json(200, { success: true, settings: (body as { settings: unknown }).settings }));
    render(<SessionPolicySetting />);
    await edit();
    fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('PATCH', '/api/organizations/37/settings', {
      settings: { security: { sessionTimeoutMinutes: 35, maxConcurrentSessions: 2 } },
      reason: 'Reduce idle access window for onboarding',
    }));
    expect(await screen.findByText(/session policy saved with your reason/i)).toBeTruthy();
    expect(screen.getByText(/existing sessions keep their idle window/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save session policy' })).toHaveProperty('disabled', true);
  });

  it('requires a reason and valid integers before making a governed change', async () => {
    render(<SessionPolicySetting />);
    await edit();
    fireEvent.change(field('Maximum concurrent sessions'), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
    expect(await screen.findByText(/whole numbers within the stated limits/i)).toBeTruthy();
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
    fireEvent.change(field('Maximum concurrent sessions'), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for session policy change' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });

  it('does not display platform defaults as loaded organization policy after a failed read', async () => {
    apiRequest.mockRejectedValueOnce(new Error('Database unavailable')).mockResolvedValue(json(200, payload));
    render(<SessionPolicySetting />);
    const retry = await screen.findByRole('button', { name: 'Retry session policy' });
    expect(screen.queryByRole('spinbutton')).toBeNull();
    fireEvent.click(retry);
    expect(await screen.findByRole('spinbutton', { name: 'Idle sign-out in minutes' })).toHaveProperty('value', '20');
  });

  it('retains unsaved edits on audit-write refusal and never claims save success', async () => {
    apiRequest.mockImplementation(async (method: string) => {
      if (method === 'GET') return json(200, payload);
      throw new ApiRequestError('The change could not be recorded. Nothing was changed.', 500, { message: 'The change could not be recorded. Nothing was changed.' });
    });
    render(<SessionPolicySetting />);
    await edit();
    fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
    expect(await screen.findByText('The change could not be recorded. Nothing was changed.')).toBeTruthy();
    expect(field('Idle sign-out in minutes')).toHaveProperty('value', '35');
    expect(screen.queryByText(/session policy saved/i)).toBeNull();
  });

  it('keeps changes unconfirmed when the returned policy does not match the requested values', async () => {
    render(<SessionPolicySetting />);
    await edit();
    fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
    expect(await screen.findByText(/could not be confirmed as saved/i)).toBeTruthy();
    expect(field('Idle sign-out in minutes')).toHaveProperty('value', '35');
  });
});
