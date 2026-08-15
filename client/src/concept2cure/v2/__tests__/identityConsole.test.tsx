// @vitest-environment jsdom
/**
 * IdentityConsole — proves the SSO/SCIM console is wired to the real admin
 * routers: lists tenants/rules, issues a token (plaintext revealed exactly once
 * from the server response), rotates against the real endpoint, and surfaces a
 * 403 honestly as "platform administrator required" (no fixture fallback).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit }: any) => (
    <button data-testid="form-submit" onClick={() => onSubmit({ organizationId: '101', label: 'Okta prod', cidr: '203.0.113.0/24' })}>{config.submitLabel}</button>
  ),
}));

import { IdentityConsole } from '../surfaces/IdentityConsole';

function raw(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}
const props = () => ({ surface: { id: 'identity-console', label: 'Identity' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'admin' });

const TENANTS = { tenants: [{ id: 3, organizationId: 101, label: 'Okta prod', enabled: true }] };
const RULES = { rules: [{ id: 1, organizationId: 101, cidr: '203.0.113.0/24', label: 'Okta egress', enabled: true }] };

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    if (method === 'GET' && url === '/api/admin/scim-tenants') return raw(TENANTS);
    if (method === 'GET' && url === '/api/admin/scim-ip-allowlist') return raw(RULES);
    if (method === 'POST' && url === '/api/admin/scim-tenants') return raw({ id: 4, organizationId: body.organizationId, label: body.label, enabled: true, token: 'scim_ONE_TIME_SECRET' }, 201);
    if (method === 'POST' && url === '/api/admin/scim-tenants/3/rotate') return raw({ id: 3, organizationId: 101, label: 'Okta prod', enabled: true, token: 'scim_ROTATED_SECRET' });
    return raw({});
  });
});

describe('IdentityConsole — real SCIM/SSO admin wiring', () => {
  it('lists SCIM tenants, allowlist rules, and the live SAML endpoints', async () => {
    render(<IdentityConsole {...props()} />);
    expect(await screen.findByText('Okta prod')).toBeTruthy();
    expect(screen.getByText('203.0.113.0/24')).toBeTruthy();
    expect(screen.getByText('/api/auth/sso/saml/metadata')).toBeTruthy();
  });

  it('issues a token via POST and reveals the plaintext exactly once from the server', async () => {
    render(<IdentityConsole {...props()} />);
    await screen.findByText('Okta prod');
    fireEvent.click(screen.getByRole('button', { name: /Issue token/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/admin/scim-tenants');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ organizationId: 101, label: 'Okta prod' });
    });
    expect(await screen.findByText('scim_ONE_TIME_SECRET')).toBeTruthy();
  });

  it('rotates a token against the real endpoint and reveals the new secret', async () => {
    render(<IdentityConsole {...props()} />);
    await screen.findByText('Okta prod');
    fireEvent.click(screen.getByRole('button', { name: /Rotate/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === '/api/admin/scim-tenants/3/rotate')).toBe(true));
    expect(await screen.findByText('scim_ROTATED_SECRET')).toBeTruthy();
  });

  it('surfaces a 403 honestly as platform-administrator-required (no fixture)', async () => {
    apiRequest.mockImplementation(async () => raw({ error: 'Forbidden' }, 403));
    render(<IdentityConsole {...props()} />);
    expect(await screen.findByText('Platform administrator required')).toBeTruthy();
    expect(screen.queryByText('Okta prod')).toBeNull();
  });
});
