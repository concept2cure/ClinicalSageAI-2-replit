// @vitest-environment jsdom
/**
 * Agency gateway accounts in Admin and access → Settings and in onboarding (D7, founder
 * decision 2026-10-01; evidence docs/evidence/D7/2026-10-01-gateway-account-choice/).
 *
 *  - Every gateway is listed with each environment's choice and whether it can send.
 *  - A read that fails says so; it never shows "Platform account".
 *  - Choosing your own account sends the mode, identifier, certificate and key,
 *    the reason and the password, then reads the setting again.
 *  - A refused change says it was not changed, in the server's words.
 *  - Choosing the platform account sends no identifier and no secret.
 *
 * That Settings and the onboarding wizard both render it is asserted where each is
 * rendered: adminConsoleSettings.test.tsx and onboardingActivatesPlan.test.tsx.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const sessionOwner = vi.hoisted(() => ({ value: { actor: '42:owner', key: 1, sameRevision: () => true } }));
vi.mock('../editor/authoringCurrentRead', async importOriginal => ({
  ...(await importOriginal<typeof import('../editor/authoringCurrentRead')>()), useAuthoringReadSession: () => sessionOwner.value,
}));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { GatewayAccountsSetting, changeBody, type GatewayAccount } from '../surfaces/GatewayAccountsSetting';
import { accountLine } from '../surfaces/GatewayTransmittals';

const FDA_FIELDS = [
  { name: 'clientCertPem', label: 'Your ESG certificate (PEM)', pem: true },
  { name: 'clientKeyPem', label: 'Its private key (PEM)', pem: true },
];

const account = (over: Partial<GatewayAccount>): GatewayAccount => ({
  region: 'fda',
  gateway: 'esg',
  agency: 'FDA',
  label: 'FDA Electronic Submissions Gateway (ESG)',
  identifierLabel: 'AS2 identifier assigned by FDA',
  environment: 'production',
  mode: 'platform',
  clientTransmit: true,
  clientFields: FDA_FIELDS,
  senderIdentifier: null,
  credentialFieldsHeld: [],
  status: 'ready',
  ...over,
});

let stored: GatewayAccount[];
let readFails: boolean;
let writeAnswer: { status: number; body: unknown };
const puts: Array<{ url: string; body: any }> = [];
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  sessionOwner.value = { actor: '42:owner', key: 1, sameRevision: () => true };
  stored = [
    account({}),
    account({ environment: 'staging', status: 'platform_not_configured' }),
    account({ region: 'ema', gateway: 'cesp', agency: 'EMA', label: 'EMA Common European Submission Portal (CESP)', clientTransmit: false, clientFields: [] }),
  ];
  readFails = false;
  writeAnswer = { status: 200, body: { audited: true } };
  puts.length = 0;
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (method === 'GET' && url === '/api/gateway-accounts') {
      if (readFails) throw Object.assign(new Error('boom'), {});
      return res({ organizationId: 42, canManage: true, accounts: stored });
    }
    if (method === 'PUT') {
      puts.push({ url, body });
      if (writeAnswer.status < 400) stored = stored.map((a) => (a.environment === 'production' && a.gateway === 'esg' ? { ...a, mode: 'client', senderIdentifier: 'OUR-AS2', credentialFieldsHeld: ['clientCertPem', 'clientKeyPem'] } : a));
      return res(writeAnswer.body, writeAnswer.status);
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
});
afterEach(() => cleanup());

const cell = (id: string) => screen.getByTestId(`gateway-account-${id}`);

describe('agency gateway accounts setting', () => {
  it('separates configured credentials from agency qualification', async () => {
    render(<GatewayAccountsSetting />);
    const production = await screen.findByTestId('gateway-account-fda-esg-production');
    expect(production.textContent).toContain('Credentials configured');
    expect(production.textContent).toContain('Agency qualification not verified');
    expect(production.textContent).not.toContain('Ready');
  });
  it("lists each gateway's environments with the choice and whether it can send", async () => {
    render(<GatewayAccountsSetting />);
    await waitFor(() => expect(cell('fda-esg-production')).toBeTruthy());
    expect(cell('fda-esg-production').textContent).toContain('Platform account');
    expect(cell('fda-esg-production').textContent).toContain('Credentials configured');
    expect(cell('fda-esg-staging').textContent).toContain('Not yet configured');
    expect(cell('ema-cesp-production')).toBeTruthy();
  });

  it('a read that fails says so and shows no account', async () => {
    readFails = true;
    render(<GatewayAccountsSetting />);
    await waitFor(() => expect(screen.getByText(/could not be read/)).toBeTruthy());
    expect(screen.queryByText(/Platform account/)).toBeNull();
  });

  it('choosing your own account sends identifier, certificate, key, reason and password, then reads again', async () => {
    render(<GatewayAccountsSetting />);
    await waitFor(() => expect(cell('fda-esg-production')).toBeTruthy());
    fireEvent.click(within(cell('fda-esg-production')).getByText('Change…'));
    fireEvent.change(screen.getByLabelText(/Submissions go out under/), { target: { value: 'client' } });
    fireEvent.change(screen.getByLabelText(/AS2 identifier/), { target: { value: 'OUR-AS2' } });
    fireEvent.paste(screen.getByLabelText(/ESG certificate/), { clipboardData: { getData: () => '-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----' } });
    fireEvent.paste(screen.getByLabelText(/private key/), { clipboardData: { getData: () => '-----BEGIN PRIVATE KEY-----\ny\n-----END PRIVATE KEY-----' } });
    expect((screen.getByLabelText(/private key/) as HTMLInputElement).value).toBe('********');
    expect(document.body.innerHTML).not.toContain('BEGIN PRIVATE KEY');
    fireEvent.change(screen.getByLabelText(/Reason for the change/), { target: { value: 'We file under our own FDA ESG account' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'pw-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].url).toBe('/api/gateway-accounts/fda/esg/production');
    expect(puts[0].body).toMatchObject({
      mode: 'client',
      senderIdentifier: 'OUR-AS2',
      credentials: { clientCertPem: '-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----', clientKeyPem: '-----BEGIN PRIVATE KEY-----\ny\n-----END PRIVATE KEY-----' },
      reason: 'We file under our own FDA ESG account',
      reauth: { password: 'pw-123' },
    });
    await waitFor(() => expect(cell('fda-esg-production').textContent).toContain('Your account (OUR-AS2)'));
    expect(screen.getByText(/saved and recorded in the audit trail/)).toBeTruthy();
  });

  it("a refused change says it was not changed, in the server's words", async () => {
    writeAnswer = { status: 400, body: { error: { code: 'NOT_PEM', message: 'clientKeyPem must be PEM text.' } } };
    render(<GatewayAccountsSetting />);
    await waitFor(() => expect(cell('fda-esg-production')).toBeTruthy());
    fireEvent.click(within(cell('fda-esg-production')).getByText('Change…'));
    fireEvent.change(screen.getByLabelText(/Reason for the change/), { target: { value: 'Trying a key that is not PEM' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'pw-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Not changed: check the certificate and private key PEM formatting.')).toBeTruthy());
    expect(cell('fda-esg-production').textContent).toContain('Platform account');
  });

  it('choosing the platform account sends no identifier and no secret', () => {
    const body = changeBody(account({ mode: 'client' }), {
      mode: 'platform',
      senderIdentifier: 'OUR-AS2',
      clientKeyPem: 'should not be sent',
      reason: 'Back to the platform account',
      password: 'pw',
    });
    expect(body).toEqual({ mode: 'platform', reason: 'Back to the platform account', reauth: { password: 'pw', totp: undefined } });
  });
});

describe('the transmittal log says whose account each transmittal went out under', () => {
  it('as recorded on the row, and nothing when it was not recorded', () => {
    expect(accountLine({ metadata: { gatewayAccount: { mode: 'client', senderIdentifier: 'OUR-AS2' } } })).toBe('via your account (OUR-AS2)');
    expect(accountLine({ metadata: { gatewayAccount: { mode: 'platform', senderIdentifier: null } } })).toBe('via the platform account');
    expect(accountLine({ metadata: {} })).toBeNull();
    expect(accountLine({ metadata: null })).toBeNull();
  });
});


describe('gateway secure capture ownership', () => {
  it('masks multiline credentials, preserves exact newlines and clears on cancel', async () => {
    render(<GatewayAccountsSetting />);
    const row = await screen.findByTestId('gateway-account-fda-esg-production');
    fireEvent.click(within(row).getByText('Change…'));
    const key = screen.getByLabelText(/private key/) as HTMLInputElement;
    expect(key.type).toBe('password'); expect(key.readOnly).toBe(true);
    expect(key.getAttribute('data-secret-entry')).toBe('true');
    fireEvent.paste(key, { clipboardData: { getData: () => 'MULTILINE_UI_CANARY\nsecond line' } });
    expect(key.value).toBe('********');
    expect(document.body.innerHTML).not.toContain('MULTILINE_UI_CANARY');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.querySelector('[data-secret-entry]')).toBeNull();
    fireEvent.click(within(row).getByText('Change…'));
    expect((screen.getByLabelText(/private key/) as HTMLInputElement).value).toBe('');
  });
  it('never reflects a submitted secret from an error payload', async () => {
    writeAnswer = { status: 400, body: { error: { code: 'INVALID', message: 'GATEWAY_ERROR_UI_CANARY' } } };
    render(<GatewayAccountsSetting />);
    const row = await screen.findByTestId('gateway-account-fda-esg-production');
    fireEvent.click(within(row).getByText('Change…'));
    fireEvent.change(screen.getByLabelText(/Reason for/), { target: { value: 'Rotate certificate safely' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'password fixture' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(document.body.textContent).not.toContain('GATEWAY_ERROR_UI_CANARY');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('retires secret entry synchronously when the organisation changes', async () => {
    const view = render(<GatewayAccountsSetting />);
    const row = await screen.findByTestId('gateway-account-fda-esg-production');
    fireEvent.click(within(row).getByText('Change…'));
    fireEvent.paste(screen.getByLabelText(/private key/), { clipboardData: { getData: () => 'OLD_ORG_UI_CANARY' } });
    sessionOwner.value = { actor: '43:other', key: 2, sameRevision: () => true };
    view.rerender(<GatewayAccountsSetting />);
    expect(document.querySelector('[data-secret-entry]')).toBeNull();
    expect(document.body.textContent).not.toContain('OLD_ORG_UI_CANARY');
    expect(puts).toHaveLength(0);
    await screen.findByText(/gateway accounts could not be read/);
  });
});


it('drops prior account authority when a reread is refused', async () => {
  render(<GatewayAccountsSetting />);
  const row = await screen.findByTestId('gateway-account-fda-esg-production');
  fireEvent.click(within(row).getByText('Change…'));
  fireEvent.change(screen.getByLabelText(/Reason for/), { target: { value: 'Verify current membership again' } });
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'fixture password' } });
  readFails = true;
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(/gateway accounts could not be read/);
  expect(screen.queryByTestId('gateway-account-fda-esg-production')).toBeNull();
  expect(screen.queryByText('Change…')).toBeNull();
});


it('clears captured PEM state before a later submit', async () => {
  render(<GatewayAccountsSetting />);
  const row = await screen.findByTestId('gateway-account-fda-esg-production');
  fireEvent.click(within(row).getByText('Change…'));
  fireEvent.change(screen.getByLabelText(/Submissions go out under/), { target: { value: 'client' } });
  fireEvent.paste(screen.getByLabelText(/private key/), { clipboardData: { getData: () => 'CLEARED_PEM_UI_CANARY\nsecond line' } });
  fireEvent.click(screen.getByRole('button', { name: 'Clear captured credential' }));
  expect((screen.getByLabelText(/private key/) as HTMLInputElement).value).toBe('');
  fireEvent.change(screen.getByLabelText(/Reason for/), { target: { value: 'Keep the currently held key' } });
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'fixture password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(puts).toHaveLength(1));
  expect(puts[0].body.credentials).toBeUndefined();
  expect(JSON.stringify(puts)).not.toContain('CLEARED_PEM_UI_CANARY');
});
