// @vitest-environment jsdom
/**
 * IdentityConsole — a refused or failed read is never a statement about the
 * organisation's identity posture (launch sweep findings 18, 110, 114, 20).
 *
 * The real `apiRequest` THROWS ApiRequestError on a non-2xx other than 401, so
 * these mocks throw exactly that. The older identityConsole.test.tsx resolved a
 * 403 Response instead, which is why its "platform administrator required"
 * case passed while the live console said "didn't respond": the console's
 * reader caught the throw and reported status 0.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit }: { config: { submitLabel: string }; onSubmit: (v: Record<string, string>) => void }) => (
    <button data-testid="form-submit" onClick={() => onSubmit({ organizationId: '1', label: 'x', cidr: '203.0.113.0/24' })}>{config.submitLabel}</button>
  ),
}));

import { IdentityConsole } from '../surfaces/IdentityConsole';

const raw = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;
const props = () => ({ surface: { id: 'identity-console', label: 'Identity' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'admin' });
const REFUSAL = 'Master Administration access is restricted to platform administrators.';
const refuse = () => { throw new ApiRequestError(REFUSAL, 403, { error: REFUSAL }); };
/** Only the SCIM routes sit behind the platform-admin guard; anything else the
 *  shell asks for answers as it would for this account. */
const isScim = (url: unknown) => typeof url === 'string' && url.startsWith('/api/admin/scim-');
const TENANTS = { tenants: [{ id: 3, organizationId: 1, label: 'Okta prod', enabled: true }] };
const NOT_ENFORCED = /allowlist is not enforced/i;

afterEach(() => cleanup());
beforeEach(() => apiRequest.mockReset());

describe('a 403 is a refusal, not "didn\'t respond" and not "no rules"', () => {
  it('renders the platform-administrator state when the directory read is refused', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => (isScim(url) ? refuse() : raw({})));
    render(<IdentityConsole {...props()} />);
    expect(await screen.findByText('Platform administrator required')).toBeTruthy();
    expect(screen.queryByText(/didn.t respond/i)).toBeNull();
    expect(screen.queryByText(NOT_ENFORCED)).toBeNull();
    // Write controls are not offered to an account every write refuses.
    expect(screen.queryByRole('button', { name: /Issue token/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add rule/ })).toBeNull();
  });

  it('never says the allowlist is not enforced when only the allowlist read is refused', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/admin/scim-tenants' ? raw(TENANTS) : isScim(url) ? refuse() : raw({}));
    render(<IdentityConsole {...props()} />);
    await screen.findByText('Okta prod');
    expect(await screen.findByText('You don’t have access to the allowlist')).toBeTruthy();
    expect(screen.queryByText(NOT_ENFORCED)).toBeNull();
    expect(screen.queryByRole('button', { name: /Add rule/ })).toBeNull();
  });

  it('never says the allowlist is not enforced when the allowlist read fails', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/admin/scim-tenants') return raw(TENANTS);
      if (isScim(url)) throw new ApiRequestError('Internal error', 500);
      return raw({});
    });
    render(<IdentityConsole {...props()} />);
    expect(await screen.findByText('Couldn’t load the allowlist')).toBeTruthy();
    expect(screen.queryByText(NOT_ENFORCED)).toBeNull();
  });

  it('still says so when the allowlist was read and is genuinely empty', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/admin/scim-tenants' ? raw(TENANTS) : url === '/api/admin/scim-ip-allowlist' ? raw({ rules: [] }) : raw({}));
    render(<IdentityConsole {...props()} />);
    expect(await screen.findByText(NOT_ENFORCED)).toBeTruthy();
  });
});

describe('a refused write says why, never "HTTP 0"', () => {
  it('names the refusal when rotating is refused', async () => {
    apiRequest.mockImplementation(async (m: string, url: string) => {
      if (m === 'GET' && url === '/api/admin/scim-tenants') return raw(TENANTS);
      if (m === 'GET' && url === '/api/admin/scim-ip-allowlist') return raw({ rules: [] });
      return isScim(url) ? refuse() : raw({});
    });
    render(<IdentityConsole {...props()} />);
    await screen.findByText('Okta prod');
    fireEvent.click(screen.getByRole('button', { name: /Rotate/ }));
    await waitFor(() => expect(screen.getByText(/not a platform administrator/i)).toBeTruthy());
    expect(screen.queryByText(/HTTP 0/)).toBeNull();
  });
});
