// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { InvitationInbox } from '../InvitationInbox';
import { ApiRequestError } from '@/lib/queryClient';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const invitation = { id: 7, organizationId: 22, organizationName: 'Bright Bio', role: 'reviewer', status: 'pending', createdAt: '2026-10-14T01:00:00Z' };
beforeEach(() => { apiRequest.mockReset(); apiRequest.mockResolvedValue(json(200, [invitation])); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('personal organization invitation inbox', () => {
  it('accepts only the selected invitation and keeps the current workspace active', async () => {
    const accepted = vi.fn();
    apiRequest.mockImplementation(async (method: string) => method === 'GET' ? json(200, [invitation]) : json(200, { success: true, data: { organizationId: 22, status: 'accepted' } }));
    render(<InvitationInbox onAccepted={accepted} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation from Bright Bio' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/tenant-users/invitations/7/accept'));
    expect(await screen.findByText(/your current workspace remains active/i)).toBeTruthy();
    expect(accepted).toHaveBeenCalledExactlyOnceWith(22);
    expect(screen.queryByRole('button', { name: /accept invitation/i })).toBeNull();
    expect(apiRequest.mock.calls.every(([, path]) => !path.includes('select-organization'))).toBe(true);
  });

  it('declines explicitly without creating membership', async () => {
    apiRequest.mockImplementation(async (method: string) => method === 'GET' ? json(200, [invitation]) : json(200, { success: true }));
    const accepted = vi.fn();
    render(<InvitationInbox onAccepted={accepted} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Decline invitation from Bright Bio' }));
    expect(await screen.findByText(/no membership was added/i)).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/tenant-users/invitations/7/decline');
    expect(accepted).not.toHaveBeenCalled();
  });

  it('keeps an invitation pending after quota refusal and shows the server reason', async () => {
    apiRequest.mockImplementation(async (method: string) => {
      if (method === 'GET') return json(200, [invitation]);
      throw new ApiRequestError('Quota exceeded', 403, { message: 'The inviting organization has no available seats. Contact its administrator.' });
    });
    render(<InvitationInbox />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation from Bright Bio' }));
    expect(await screen.findByText('The inviting organization has no available seats. Contact its administrator.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept invitation from Bright Bio' })).toBeTruthy();
    expect(screen.queryByText(/invitation.*accepted/i)).toBeNull();
  });

  it('reports a failed read with retry, preserving the distinction from an empty inbox', async () => {
    apiRequest.mockRejectedValueOnce(new Error('relation "organization_invitations" does not exist')).mockResolvedValue(json(200, []));
    render(<InvitationInbox />);
    const retry = await screen.findByRole('button', { name: 'Retry invitations' });
    expect(screen.queryByText('No pending organization invitations.')).toBeNull();
    expect(screen.queryByText(/organization_invitations/)).toBeNull();
    fireEvent.click(retry);
    expect(await screen.findByText('No pending organization invitations.')).toBeTruthy();
  });

  it('does not permit acceptance until the organization is identified by name', async () => {
    apiRequest.mockResolvedValue(json(200, [{ ...invitation, organizationName: undefined }]));
    render(<InvitationInbox />);
    expect(await screen.findByRole('button', { name: 'Accept invitation' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Organization name unavailable')).toBeTruthy();
  });

  it('does not treat malformed or success:false responses as accepted', async () => {
    apiRequest.mockImplementation(async (method: string) => method === 'GET' ? json(200, [invitation]) : json(200, { success: false, message: 'This invitation is no longer pending.' }));
    render(<InvitationInbox />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation from Bright Bio' }));
    expect(await screen.findByText('This invitation is no longer pending.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept invitation from Bright Bio' })).toBeTruthy();
  });
});
