// @vitest-environment jsdom
/**
 * GatewayTransmittals — proves the "file to the agency" surface is wired to the
 * real dispatch layer (/api/mdx/gateways): lists gateways + the transmittal
 * log, transmits with the governed reason + §11 re-auth (server-gated), and
 * surfaces the 401 re-auth and 409 active-transmittal-lock rejections honestly.
 * C2CForm is stubbed to drive the wiring.
 *
 * It also pins two corrections to what this surface TELLS the user. It used to
 * say a downloaded acknowledgement was "the agency's actual bytes" — true only
 * for an FDA AS2 MDN; for the other twelve gateways the file is composed by this
 * platform from its own transmittal row, so a sponsor could archive a
 * self-authored document as agency proof of receipt. And it said a rollback
 * happened "at the gateway", which the code explicitly cannot do: it records a
 * status change in this platform's audit trail and makes no network call.
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
    <button data-testid="form-submit" onClick={() => onSubmit({ region: 'fda', gateway: 'esg', packageId: '77', submissionType: 'original', reason: 'Dispatch sequence 0003 to FDA', password: 'pw', totp: '123456' })}>{config.submitLabel}</button>
  ),
}));

import { GatewayTransmittals } from '../surfaces/GatewayTransmittals';

function env(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ data }) } as Response;
}
function ackResponse(provenance: 'agency' | 'platform-record', body: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === 'x-ack-provenance' ? provenance : null) },
    blob: async () => ({ size: body.length }),
    json: async () => ({}),
  } as unknown as Response;
}

const props = () => ({ surface: { id: 'gateway-transmittals', label: 'Dispatch' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const GATEWAYS = [{ region: 'fda', gateway: 'esg', name: 'FDA ESG', configured: true, environment: 'production' }];
const LOG = [{ id: 3, region: 'fda', gateway: 'esg', submission_type: 'original', transmission_id: 'ESG-XYZ', status: 'acknowledged', submitted_at: '2026-07-21T00:00:00Z', ack_received_at: '2026-07-21T01:00:00Z' }];

afterEach(() => cleanup());
beforeEach(() => {
  // jsdom implements neither; without them the download handler throws and the
  // catch reports a failure, so the toast under test never renders.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:stub');
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
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

  it('renders the structural gate’s findings on a 422 (errors first) so the refusal is actionable, and clears them on the next attempt', async () => {
    // The 422 body carries the findings recorded on the stored bundle at
    // assembly. The toast alone showed only the summary line, so the operator
    // never saw WHICH rule refused — here, the one naming the identifiers still
    // to be recorded.
    const refuse = async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/transmit')) {
        return {
          ok: false, status: 422,
          json: async () => ({
            error: 'Bundle failed eCTD structural validation (1 error); re-assemble after fixing.',
            details: { findings: [
              { severity: 'info', ruleId: 'SUMMARY', message: '2 leaf(s), 0 empty' },
              { severity: 'error', ruleId: 'REGULATORY-IDENTIFIER-MISSING', message: 'The regional Module 1 backbone must carry the agency application number and applicant identity (missing package metadata: regulatory.applicationNumber). Record the real identifiers before transmitting.' },
            ] },
          }),
        } as Response;
      }
      return env(null);
    };
    apiRequest.mockImplementation(refuse);
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /^Transmit$/ }));
    fireEvent.click(screen.getByTestId('form-submit'));

    expect(await screen.findByText(/structural gate rejected the bundle/)).toBeTruthy();
    const card = await screen.findByRole('region', { name: 'Structural gate refusal' });
    expect(card.textContent).toMatch(/re-assemble the package, then transmit again/);
    expect(screen.getByText(/regulatory\.applicationNumber/)).toBeTruthy();
    // Errors are listed before informational findings.
    const chips = Array.from(card.querySelectorAll('.rd-chip')).map((c) => c.textContent);
    expect(chips).toEqual(['REGULATORY-IDENTIFIER-MISSING', 'SUMMARY']);

    // The next attempt succeeds: the refusal card is gone, not left as stale state.
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST' && url.endsWith('/transmit')) return env({ result: { transactionId: 'ESG-NEW-2' } }, 201);
      return refuse(method, url);
    });
    fireEvent.click(screen.getByTestId('form-submit'));
    expect(await screen.findByText(/gateway ref ESG-NEW-2/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Structural gate refusal' })).toBeNull();
  });

  it('polls the live gateway status for a transmittal', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /Status/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === '/api/mdx/gateways/transmittals/3/status')).toBe(true));
    expect(await screen.findByText('gatewayState')).toBeTruthy();
    expect(screen.getByText('DONE')).toBeTruthy();
  });

  it('does not call a platform-composed record the agency\u2019s bytes', async () => {
    // The twelve non-FDA gateways return a document this platform wrote. The
    // toast must say so, and the download must not be named like a receipt.
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'GET' && url.endsWith('/ack')) return ackResponse('platform-record', 'CONCEPT2CURE TRANSMITTAL RECORD');
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /ACK/ }));
    const toast = await screen.findByText(/NOT an agency acknowledgment/i);
    expect(toast).toBeTruthy();
    expect(screen.queryByText(/agency\u2019s actual bytes/i)).toBeNull();
  });

  it('does call a genuine agency MDN the agency\u2019s own bytes', async () => {
    // The one real agency artefact the platform holds must still read as one,
    // or the correction would make every download equally untrustworthy.
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'GET' && url.endsWith('/ack')) return ackResponse('agency', 'Disposition: automatic-action');
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /ACK/ }));
    expect(await screen.findByText(/the agency\u2019s own bytes/i)).toBeTruthy();
  });

  it('does not claim a rollback retracted the submission at the agency', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/rollback')) return env({ status: 'rolled_back', agencyRetractionRequired: true });
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /Rollback/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    const toast = await screen.findByText(/agency still holds the transmitted bytes/i);
    expect(toast).toBeTruthy();
    expect(screen.queryByText(/rolled back at the gateway/i)).toBeNull();
  });
});
