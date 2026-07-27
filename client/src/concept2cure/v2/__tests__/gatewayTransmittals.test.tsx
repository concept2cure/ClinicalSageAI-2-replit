// @vitest-environment jsdom
/**
 * GatewayTransmittals — proves the "file to the agency" surface is wired to the
 * real dispatch layer (/api/mdx/gateways): lists gateways + the transmittal
 * log, transmits with the governed reason + §11 re-auth (server-gated), and
 * surfaces the 401 re-auth and 409 active-transmittal-lock rejections honestly.
 * C2CForm is stubbed to drive the wiring.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit }: any) => (
    <button data-testid="form-submit" onClick={() => onSubmit({ region: 'fda', gateway: 'esg', packageId: '77', submissionType: 'original', reason: 'Dispatch sequence 0003 to FDA', password: 'pw', totp: '123456' })}>{config.submitLabel}</button>
  ),
}));

import { GatewayTransmittals } from '../surfaces/GatewayTransmittals';

function env(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ data }) } as Response;
}
const props = () => ({ surface: { id: 'gateway-transmittals', label: 'Dispatch' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const GATEWAYS = [{ region: 'fda', gateway: 'esg', name: 'FDA ESG', configured: true, environment: 'production' }];
const LOG = [{ id: 3, region: 'fda', gateway: 'esg', submission_type: 'original', transmission_id: 'ESG-XYZ', status: 'acknowledged', submitted_at: '2026-07-21T00:00:00Z', ack_received_at: '2026-07-21T01:00:00Z' }];

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
    if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
    if (method === 'POST' && url === '/api/mdx/gateways/fda/esg/transmit') return env({ result: { transactionId: 'ESG-NEW-1' } }, 201);
    if (method === 'GET' && url === '/api/mdx/gateways/transmittals/3/status') return env({ status: 'acknowledged', gatewayState: 'DONE' });
    return env(null);
  });
});

describe('GatewayTransmittals — real dispatch layer', () => {
  it('lists gateways with credential status and the transmittal log', async () => {
    render(<GatewayTransmittals {...props()} />);
    expect(await screen.findByText('FDA ESG')).toBeTruthy();
    expect(screen.getByText('configured')).toBeTruthy();
    expect(screen.getByText('ESG-XYZ')).toBeTruthy();
    expect(screen.getByText('acknowledged')).toBeTruthy();
  });

  it('transmits with the governed reason + §11 re-auth and reports the gateway ref', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /^Transmit$/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/mdx/gateways/fda/esg/transmit');
      expect(call).toBeTruthy();
      const body = call![2] as any;
      expect(body.reason).toBe('Dispatch sequence 0003 to FDA');
      expect(body.reauth).toEqual({ password: 'pw', totp: '123456' });
      expect(body.packageId).toBe(77);
    });
    expect(await screen.findByText(/gateway ref ESG-NEW-1/)).toBeTruthy();
  });

  it('surfaces a 401 re-auth rejection honestly (nothing left the platform)', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/transmit')) return { ok: false, status: 401, json: async () => ({ error: 'ReAuth required' }) } as Response;
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /^Transmit$/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    expect(await screen.findByText(/re-authentication failed.*Nothing left the platform/)).toBeTruthy();
  });

  it('surfaces the 409 active-transmittal lock with the holder id', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/transmit')) return { ok: false, status: 409, json: async () => ({ data: { transmittalId: 3, status: 'transmitting' } }) } as Response;
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /^Transmit$/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    expect(await screen.findByText(/transmittal #3 is already active/)).toBeTruthy();
  });

  it('polls the live gateway status for a transmittal', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /Status/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === '/api/mdx/gateways/transmittals/3/status')).toBe(true));
    expect(await screen.findByText('gatewayState')).toBeTruthy();
    expect(screen.getByText('DONE')).toBeTruthy();
  });
});
