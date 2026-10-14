// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ apiRequest: vi.fn(), publish: vi.fn() }));
vi.mock('@/lib/queryClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: h.apiRequest,
}));
vi.mock('../surfaceContext', () => ({ usePublishSurfaceContext: h.publish }));
import { AdminAccess } from '../surfaces/AdminAccess';

const SECRET = 'c2c_test_secret_shown_once';
const data = {
  organizationId: 7, kpis: [],
  members: [{ id: 'u-1', userId: 1, self: true, initials: 'AA', name: 'Administrator', email: 'admin@example.test', role: 'Admin', groups: [], sso: '', mfa: true, lastSeen: '', state: 'active' }],
  roles: [], grants: [], apiKeys: [], audit: [], settings: [], sso: null,
};
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

beforeEach(() => {
  h.apiRequest.mockReset(); h.publish.mockClear();
  localStorage.clear(); sessionStorage.clear();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  h.apiRequest.mockImplementation(async (method: string) => method === 'GET'
    ? response({ data, meta: { unavailable: [] } })
    : response({ apiKey: SECRET, keyId: 5, name: 'Vault reader' }, 201));
});
afterEach(cleanup);

async function open() {
  render(<AdminAccess surface={{ id: 'admin-console' } as any} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
  await screen.findAllByText('Administrator');
  fireEvent.click(screen.getByRole('button', { name: 'API keys' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));
  return screen.findByRole('dialog', { name: 'Create API key' });
}
function fill(dialog: HTMLElement) {
  const d = within(dialog);
  fireEvent.change(d.getByRole('textbox', { name: 'Key name' }), { target: { value: 'Vault reader' } });
  fireEvent.click(d.getByLabelText('documents:read'));
  fireEvent.click(d.getByLabelText('regulatory:read'));
  fireEvent.change(d.getByRole('spinbutton', { name: 'Requests per minute' }), { target: { value: '120' } });
  fireEvent.change(d.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Connect our read-only document reporting service.' } });
}

describe('active admin API-key creation', () => {
  it('requires scopes and a reason before sending a request', async () => {
    const dialog = await open();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Key name' }), { target: { value: 'Vault reader' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create API key' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(h.apiRequest.mock.calls.filter(c => c[0] === 'POST')).toHaveLength(0);
  });

  it('creates with selected scopes and optional expiry, then shows the secret once without storage or AnA publication', async () => {
    const dialog = await open();
    fill(dialog);
    fireEvent.change(within(dialog).getByLabelText('Expires at (optional)'), { target: { value: '2099-01-01T12:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create API key' }));
    const secret = await screen.findByLabelText('API key secret');
    expect((secret as HTMLInputElement).value).toBe(SECRET);
    expect(h.apiRequest).toHaveBeenCalledWith('POST', '/api/api-keys', {
      name: 'Vault reader', scopes: ['regulatory:read', 'documents:read'],
      rateLimit: 120, expiresAt: new Date('2099-01-01T12:00').toISOString(),
      reason: 'Connect our read-only document reporting service.',
    });
    expect(JSON.stringify(h.publish.mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(localStorage)).not.toContain(SECRET);
    expect(JSON.stringify(sessionStorage)).not.toContain(SECRET);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('API key secret')).toBeNull();
    expect(document.body.textContent).not.toContain(SECRET);
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));
    expect(screen.queryByLabelText('API key secret')).toBeNull();
  });

  it('keeps entered values when the server refuses creation', async () => {
    const dialog = await open();
    fill(dialog);
    h.apiRequest.mockImplementation(async (method: string) => method === 'POST'
      ? response({ error: { message: 'Administrator access required' } }, 403)
      : response({ data, meta: {} }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create API key' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Administrator access required');
    expect((within(dialog).getByRole('textbox', { name: 'Key name' }) as HTMLInputElement).value).toBe('Vault reader');
    expect(screen.queryByLabelText('API key secret')).toBeNull();
  });

  it('copies the secret only on request and reports clipboard failure truthfully', async () => {
    const dialog = await open(); fill(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create API key' }));
    await screen.findByLabelText('API key secret');
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy API key' }));
    await screen.findByText('API key copied. Store it in your service’s secret manager.');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SECRET);
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('Browser denied clipboard'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy API key' }));
    await screen.findByText('The clipboard could not be written. Select the key and copy it manually before closing.');
  });

  it('blocks duplicate submission and drawer dismissal while minting is pending', async () => {
    const dialog = await open(); fill(dialog);
    let resolve!: (r: Response) => void;
    h.apiRequest.mockImplementation(async (method: string) => method === 'POST'
      ? new Promise<Response>(done => { resolve = done; })
      : response({ data, meta: {} }));
    const form = dialog.querySelector('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Create API key' })).toBeTruthy();
    expect(h.apiRequest.mock.calls.filter(c => c[0] === 'POST')).toHaveLength(1);
    resolve(response({ apiKey: SECRET }, 201));
    await screen.findByLabelText('API key secret');
  });

  it('describes an accepted response without a secret before allowing a retry', async () => {
    const dialog = await open(); fill(dialog);
    h.apiRequest.mockImplementation(async (method: string) => method === 'POST'
      ? response({ keyId: 5 }, 201) : response({ data, meta: {} }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create API key' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Check the key list before retrying');
    expect(screen.queryByLabelText('API key secret')).toBeNull();
  });
});
