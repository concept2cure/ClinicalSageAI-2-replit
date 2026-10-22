// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));
import { AdminApiKeyUsage } from '../surfaces/AdminApiKeyUsage';
import { AdminAccess } from '../surfaces/AdminAccess';
afterEach(cleanup);
describe('admin API-key usage', () => {
  it('shows the server request count, status and honest no-use state', async () => {
    apiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 9, name: 'Reporting', keyPrefix: 'csai_public', requestCount: 0, lastUsedAt: null, createdAt: '2026-10-14T00:00:00.000Z', status: 'active' }) });
    render(<AdminApiKeyUsage keyId={9} name="Reporting" onClose={vi.fn()} />);
    await screen.findByText('Never used');
    expect(screen.getByText('0')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/api-keys/9/usage');
  });
  it('treats a refused usage read as an error, never zero requests', async () => {
    apiRequest.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Administrator required' }) });
    render(<AdminApiKeyUsage keyId={9} name="Reporting" onClose={vi.fn()} />);
    await screen.findByText('Key usage could not be read');
    expect(screen.queryByText('Total requests')).toBeNull();
    expect(screen.queryByText('Never used')).toBeNull();
  });
  it('opens usage for the numeric key id from the active admin table', async () => {
    apiRequest.mockImplementation(async (_method: string, path: string) => ({ ok: true, status: 200, json: async () => path === '/api/mdx/admin' ? { data: {
      members: [{ id: 'u-1', name: 'Administrator', groups: [], role: 'Admin', sso: '', mfa: true, state: 'active' }],
      kpis: [], roles: [], grants: [], audit: [], settings: [], sso: null,
      apiKeys: [{ id: 'key-9', keyId: 9, prefix: 'csai_public', name: 'Reporting', scopes: ['documents:read'], owner: 'Administrator', created: '2026-10-14', lastUsed: '', rotateIn: '' }],
    }, meta: {} } : { id: 9, name: 'Reporting', keyPrefix: 'csai_public', requestCount: 23, lastUsedAt: null, createdAt: '2026-10-14T00:00:00.000Z', status: 'active' } }));
    render(<AdminAccess surface={{ id: 'admin-console' } as any} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
    fireEvent.click(await screen.findByRole('button', { name: 'API keys' }));
    fireEvent.click(screen.getByRole('button', { name: 'Usage for Reporting' }));
    await screen.findByRole('dialog', { name: 'Usage for Reporting' });
    await screen.findByText('23');
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/api-keys/9/usage');
  });
});
