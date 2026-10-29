// @vitest-environment jsdom
/**
 * GatewayTransmittals — the organisation's transmission log, read-only since
 * 2026-10-17 (the package transmit, assemble, identifiers and rollback left the
 * screen; see gatewayTransmittalsReadOnly.test.tsx). What stays is pinned here:
 * the log and who sent each row, the live status poll, the ACK download, the
 * meaning recorded with a transmit's signature, and the signed technical
 * rejection with its signing-authority gate. C2CForm is stubbed to drive the
 * rejection's wiring.
 *
 * It also pins a correction to what this surface TELLS the user: it used to say
 * a downloaded acknowledgement was "the agency's actual bytes" — true only for
 * an FDA AS2 MDN; for the other gateways the file is composed by this platform
 * from its own transmittal row.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
// The signer named in the rejection confirmation is the authenticated user.
const authUser = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => authUser.current,
}));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit }: any) => {
    (globalThis as any).__c2cFormConfig = config;
    // The agency's notice as the operator pastes it (surrounding blanks included).
    const values = { evidenceDocumentId: ' 5f0c2d7a-0b6f-4d1e-9c39-4f0e9a516f10 ', reason: 'FDA technical rejection notice: Ack3 failed', meaning: 'responsibility', password: 'pw', totp: '' };
    return <button data-testid="form-submit" onClick={() => onSubmit(values)}>{config.submitLabel}</button>;
  },
}));

import { GatewayTransmittals } from '../surfaces/GatewayTransmittals';
import { ApiRequestError } from '@/lib/queryClient';

function env(data: unknown, status = 200, meta?: Record<string, unknown>) {
  return { ok: status < 400, status, json: async () => ({ data, ...(meta ? { meta } : {}) }) } as Response;
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

const LOG = [{ id: 3, region: 'fda', gateway: 'esg', submission_type: 'original', transmission_id: 'ESG-XYZ', status: 'acknowledged', submitted_at: '2026-07-21T00:00:00Z', ack_received_at: '2026-07-21T01:00:00Z', submitted_by: 11, submitted_by_name: 'Dr Ada Lovelace' }];

afterEach(() => cleanup());
beforeEach(() => {
  // jsdom implements neither; without them the download handler throws and the
  // catch reports a failure, so the toast under test never renders.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:stub');
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  authUser.current = null;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
    if (method === 'GET' && url === '/api/mdx/gateways/transmittals/3/status') return env({ status: 'acknowledged', gatewayState: 'DONE' });
    return env(null);
  });
});

describe('GatewayTransmittals — the transmittal log', () => {
  it('offers verified agency MDN ingestion on FDA ESG transmittals', async () => {
    render(<GatewayTransmittals {...props()} />);
    expect(await screen.findByRole('button', { name: 'Record agency MDN' })).toBeTruthy();
  });
  it('lists the transmittal log with its status and who transmitted, from the server-resolved person', async () => {
    render(<GatewayTransmittals {...props()} />);
    expect(await screen.findByText('ESG-XYZ')).toBeTruthy();
    expect(screen.getByText('acknowledged')).toBeTruthy();
    expect(screen.getByText('Dr Ada Lovelace')).toBeTruthy();
  });

  it('shows the sequence number a sequence transmit recorded on its row', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) =>
      method === 'GET' && url === '/api/mdx/gateways/transmittals' ? env([{ ...LOG[0], metadata: { sequence: '0002' } }]) : env(null));
    render(<GatewayTransmittals {...props()} />);
    expect(await screen.findByText('sequence 0002')).toBeTruthy();
  });

  it('polls the live gateway status for a transmittal', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /Status/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === '/api/mdx/gateways/transmittals/3/status')).toBe(true));
    expect(await screen.findByText('gatewayState')).toBeTruthy();
    expect(screen.getByText('DONE')).toBeTruthy();
  });

  it('does not call a platform-composed record the agency’s bytes', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'GET' && url.endsWith('/ack')) return ackResponse('platform-record', 'CONCEPT2CURE TRANSMITTAL RECORD');
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /ACK/ }));
    expect(await screen.findByText(/NOT an agency acknowledgment/i)).toBeTruthy();
    expect(screen.queryByText(/agency’s actual bytes/i)).toBeNull();
  });

  it('does call a genuine agency MDN the agency’s own bytes', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'GET' && url.endsWith('/ack')) return ackResponse('agency', 'Disposition: automatic-action');
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /ACK/ }));
    expect(await screen.findByText(/the agency’s own bytes/i)).toBeTruthy();
  });

  // 2026-10-29 (W5/D7): the exact package a transmittal sent, kept before the wire.
  it('downloads the exact package a transmittal sent, when it was kept', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env([{ ...LOG[0], metadata: { sentPackage: { sha256: 'a'.repeat(64), sizeBytes: 10 } } }]);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals/3/sent-package') {
        return { ok: true, status: 200, headers: { get: (h: string) => (h.toLowerCase() === 'content-disposition' ? `attachment; filename="fda-esg-${'a'.repeat(64)}.zip"` : null) },
          blob: async () => ({ size: 10 }), json: async () => ({}) } as unknown as Response;
      }
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /Package/ }));
    expect(await screen.findByText('Downloaded the exact package this transmittal sent.')).toBeTruthy();
  });

  it('offers no package for a transmittal sent before packages were kept, and says why', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    const button = screen.getByRole('button', { name: /Package/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('Sent before the platform kept the bytes it sends');
  });

  it('shows the server’s refusal when the package cannot be handed back', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env([{ ...LOG[0], metadata: { sentPackage: { sha256: 'a'.repeat(64), sizeBytes: 10 } } }]);
      // As apiRequest does: a non-2xx is thrown with the server's sentence.
      if (url.endsWith('/sent-package')) {
        throw new ApiRequestError('The kept copy of this package is not in storage. Nothing was downloaded.', 409,
          { error: 'The kept copy of this package is not in storage. Nothing was downloaded.', details: { code: 'SENT_PACKAGE_MISSING' } }, 'SENT_PACKAGE_MISSING');
      }
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /Package/ }));
    expect(await screen.findByText('The kept copy of this package is not in storage. Nothing was downloaded.')).toBeTruthy();
  });

  it('the transmittal log shows the meaning recorded on the transmittal with its signature', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) =>
      method === 'GET' && url === '/api/mdx/gateways/transmittals'
        ? env([{ ...LOG[0], metadata: { environment: 'production', signature: { meaning: 'release', signatureId: 501 } } }])
        : env(null));
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('Dr Ada Lovelace');
    expect(screen.getByText(/meaning: release/)).toBeTruthy();
  });
});

/* 2026-10-01 (W5/D7, sweep F19, part 2): the governed act that records an
   agency technical rejection — the one thing that takes a sequence off the filed
   history. */
describe('GatewayTransmittals — an agency technical rejection (sweep F19)', () => {
  const PACKAGE_ROW = { ...LOG[0], id: 7, transmission_id: 'ESG-0001', status: 'received', package_id: 77 };
  const routes = (post: (url: string) => Response) => async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env([PACKAGE_ROW]);
    if (method === 'POST') return post(url);
    return env(null);
  };
  const refusal = (status: number, error: string, details: Record<string, unknown> = {}) => () => {
    throw new ApiRequestError(error, status, { error, details });
  };

  it('records it from the transmittal row: posts the notice, reason, meaning and re-auth, and says the sequence is off file', async () => {
    authUser.current = { id: '11', email: 'ada@sponsor.example', firstName: 'Ada', lastName: 'Lovelace', displayName: 'Dr Ada Lovelace' };
    apiRequest.mockImplementation(routes(() => env({
      packageDbId: 77, sequence: '0001', transmittalId: 7,
      transmittalStatus: { previous: 'received', current: 'validation_failed' },
      staleBundleCleared: { sequence: '0002', sha256: 'f'.repeat(64) },
    })));
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-0001');
    fireEvent.click(screen.getByRole('button', { name: /Technical rejection/ }));
    const cfg = (globalThis as any).__c2cFormConfig;
    expect(cfg.title).toMatch(/technical rejection of transmittal #7/);
    expect(cfg.sub).toMatch(/not a rollback/);
    expect(cfg.fields.map((f: any) => f.key)).toEqual(['evidenceDocumentId', 'reason', 'meaning', 'password', 'totp']);
    fireEvent.click(screen.getByTestId('form-submit'));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST');
      expect(call?.[1]).toBe('/api/mdx/gateways/transmittals/7/technical-rejection');
      expect(call?.[2]).toEqual({
        evidenceDocumentId: '5f0c2d7a-0b6f-4d1e-9c39-4f0e9a516f10', reason: 'FDA technical rejection notice: Ack3 failed',
        meaning: 'responsibility', reauth: { password: 'pw' },
      });
    });
    const toast = await screen.findByText(/off the filed history/);
    expect(toast.textContent).toMatch(/next assembly reuses sequence 0001/);
    expect(toast.textContent).toMatch(/sequence 0002 .*cleared/);
    expect(toast.textContent).toMatch(/Signed by Dr Ada Lovelace — meaning: responsibility/);
    expect(screen.queryByTestId('form-submit')).toBeNull();
  });

  it('a refusal closes the drawer and shows the server’s own sentence', async () => {
    apiRequest.mockImplementation(routes(refusal(409,
      'Only the latest sequence on file can be recorded as rejected. Sequence 0002 (transmittal 9) is on file after 0001.',
      { code: 'NOT_LATEST_FILED_SEQUENCE' })));
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-0001');
    fireEvent.click(screen.getByRole('button', { name: /Technical rejection/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    expect(await screen.findByText(/Not recorded — Only the latest sequence on file can be recorded as rejected/)).toBeTruthy();
    expect(screen.queryByTestId('form-submit')).toBeNull();
  });

  it('a refusal for want of signing authority is said in the server’s words, with no status code', async () => {
    const sentence = 'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)). Nothing was signed.';
    apiRequest.mockImplementation(routes(refusal(403, sentence, { code: 'ESIGNATURE_NO_AUTHORITY' })));
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-0001');
    fireEvent.click(screen.getByRole('button', { name: /Technical rejection/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    expect(await screen.findByText(`Not recorded — ${sentence}`)).toBeTruthy();
    expect(screen.queryByText(/HTTP 403/)).toBeNull();
  });

  it('a request that never completed does not claim that nothing changed', async () => {
    apiRequest.mockImplementation(routes(() => { throw new TypeError('Failed to fetch'); }));
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-0001');
    fireEvent.click(screen.getByRole('button', { name: /Technical rejection/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    const toast = await screen.findByText(/Not recorded — the request did not complete/);
    expect(toast.textContent).not.toMatch(/nothing changed/);
  });

  it('is offered only on a package transmittal with no rejection recorded, and a recorded one is shown on its row', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') {
        return env([LOG[0], { ...PACKAGE_ROW, status: 'validation_failed', metadata: { technicalRejection: { sequence: '0001' } } }]);
      }
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-0001');
    expect(screen.queryAllByRole('button', { name: /Technical rejection/ })).toHaveLength(0);
    expect(screen.getByText(/technical rejection recorded · sequence 0001 off file/)).toBeTruthy();
  });

  it('a person whose role does not sign is not offered it, and is told why', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) =>
      method === 'GET' && url === '/api/mdx/gateways/transmittals' ? env([PACKAGE_ROW], 200, { signing: { canSign: false } }) : env(null));
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-0001');
    expect(screen.queryByRole('button', { name: /Technical rejection/ })).toBeNull();
    expect(screen.getByText(/Recording a technical rejection is an electronic signature, and your role does not sign/)).toBeTruthy();
  });
});
