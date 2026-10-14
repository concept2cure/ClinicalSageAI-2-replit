// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { ApiRequestError } from '@/lib/queryClient';
import { ApiKeyCreate } from '../ApiKeyCreate';

const key = 'csai_PRIVATE_ONE_TIME_UNIT_TEST_KEY';
const response = () => new Response(JSON.stringify({ apiKey: key, keyId: 31, name: 'Document pipeline' }), { status: 201 });
const open = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Key name' }), { target: { value: 'Document pipeline' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Reason for issuing this key' }), { target: { value: 'Read controlled source documents for our integration' } });
};
const selectDocuments = () => fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Document reads' })).getByRole('radio', { name: 'Yes' }));
beforeEach(() => { apiRequest.mockReset(); apiRequest.mockImplementation(async () => response()); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('organization API key creation', () => {
  it('uses explicit least-access scope choices and the authenticated organization', async () => {
    render(<ApiKeyCreate />);
    open();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(6);
    expect(screen.getAllByRole('radio', { name: 'Yes' }).every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
    selectDocuments();
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/api-keys', { name: 'Document pipeline', scopes: ['documents:read'], rateLimit: 60, reason: 'Read controlled source documents for our integration' }));
    expect(await screen.findByRole('textbox', { name: 'New API key value' })).toHaveProperty('value', key);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('requires at least one scope and never creates a broad default key', async () => {
    render(<ApiKeyCreate />); open();
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findAllByText('Choose at least one read permission for this key.')).toHaveLength(2);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('preserves the one-time key until stored and reports manual copy when clipboard refuses', async () => {
    const onCreated = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
    render(<ApiKeyCreate onCreated={onCreated} />); open(); selectDocuments();
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy new API key' }));
    expect(await screen.findByText(/select the visible key and copy it manually/i)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'New API key value' })).toHaveProperty('value', key);
    expect(onCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'I have stored the key' }));
    expect(screen.queryByRole('textbox', { name: 'New API key value' })).toBeNull();
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it('reports refusal, keeps the form open, and never shows a fabricated key', async () => {
    apiRequest.mockRejectedValue(new ApiRequestError('Admin permissions required', 403, { error: 'Admin permissions required' }));
    render(<ApiKeyCreate />); open(); selectDocuments();
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findAllByText('Admin permissions required')).toHaveLength(2);
    expect(screen.getByRole('dialog', { name: 'Create an API key' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'New API key value' })).toBeNull();
  });

  it('clears the raw key when unmounted and never restores it from browser storage', async () => {
    const view = render(<ApiKeyCreate />); open(); selectDocuments();
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    await screen.findByRole('textbox', { name: 'New API key value' });
    view.unmount(); render(<ApiKeyCreate />);
    expect(screen.queryByRole('textbox', { name: 'New API key value' })).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain(key);
    expect(JSON.stringify(sessionStorage)).not.toContain(key);
  });

  it('retains the one-time issued key when its audit record could not be persisted', async () => {
    apiRequest.mockImplementation(async () => new Response(JSON.stringify({ apiKey: key, keyId: 31, name: 'Document pipeline', auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } }), { status: 201 }));
    render(<ApiKeyCreate />); open(); selectDocuments();
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findByRole('textbox', { name: 'New API key value' })).toHaveProperty('value', key);
  });
});
