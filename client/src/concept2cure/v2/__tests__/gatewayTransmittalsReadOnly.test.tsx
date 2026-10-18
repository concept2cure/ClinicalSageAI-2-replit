// @vitest-environment jsdom
/**
 * Gateway transmittals is a read-only log (audit 2026-10-17; FILING_SPINE F12,
 * LX-13). Transmit runs on the sequence the person built — Submission Center,
 * a dispatched sequence's Dispatch tab, POST /api/submissions/sequences/:id/transmit.
 * This screen offered a second way: a package picker over
 * GET /api/submission-ops/packages, an assemble dialog, an identifiers dialog
 * and POST /api/mdx/gateways/:region/:gateway/transmit, on a different store
 * from the sequence. It also offered a rollback, which is not a signature (the
 * route says so) and frees the package transmit's lock.
 *
 * Pinned here: the screen reads only the transmittal log, offers none of those
 * controls, sends the person to the sequences to transmit, and still offers
 * the reads (status, ACK) and the one signed act on a row (technical
 * rejection), gated by the signing authority the log itself reports.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config }: any) => <div data-testid="form">{config.title}</div>,
}));

import { GatewayTransmittals } from '../surfaces/GatewayTransmittals';

const LOG = [
  { id: 3, region: 'fda', gateway: 'esg', transmission_id: 'ESG-SEQ-3', status: 'acknowledged', submitted_at: '2026-10-01T00:00:00Z', ack_received_at: '2026-10-01T01:00:00Z', submitted_by_name: 'Dr Ada Lovelace', package_id: null, metadata: { sequence: '0001' } },
  { id: 7, region: 'fda', gateway: 'esg', transmission_id: 'ESG-PKG-7', status: 'received', submitted_at: '2026-09-01T00:00:00Z', ack_received_at: null, package_id: 77 },
];
function logResponse(canSign: boolean | null | undefined) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: LOG, meta: canSign === undefined ? { count: LOG.length } : { count: LOG.length, signing: { canSign } } }),
  } as Response;
}
const props = () => ({ surface: { id: 'gateway-transmittals', label: 'Gateway transmittals' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  delete (window as any).C2C_NAV_PARAMS;
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return logResponse(true);
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
  });
});

describe('Gateway transmittals — a read-only transmission log', () => {
  it('reads only the transmittal log: no package list, no gateway roster, no separation-of-duties dry run', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-SEQ-3');
    const urls = apiRequest.mock.calls.map((c) => `${c[0]} ${c[1]}`);
    expect(urls).toEqual(['GET /api/mdx/gateways/transmittals']);
  });

  it('offers no transmit, assemble, identifiers or rollback control', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-SEQ-3');
    for (const name of [/^Transmit$/, /Assemble bundle/, /Record identifiers/, /Rollback/]) {
      expect(screen.queryByRole('button', { name }), String(name)).toBeNull();
    }
  });

  it('sends the person to the sequences to transmit, through the Submission Center hand-off', async () => {
    const p = props();
    render(<GatewayTransmittals {...p} />);
    await screen.findByText('ESG-SEQ-3');
    expect(screen.getByText(/Transmit from the sequence/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Open the sequences in Submission Center/ }));
    expect(p.onNav).toHaveBeenCalledWith('submission-center');
    expect((window as any).C2C_NAV_PARAMS?.surfaceId).toBe('submission-center');
    expect((window as any).C2C_NAV_PARAMS?.params).toEqual({ ws: 'sequences' });
  });

  it('keeps the reads on every row: status and ACK', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-SEQ-3');
    expect(screen.getAllByRole('button', { name: /Status/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /ACK/ })).toHaveLength(2);
  });

  it('offers the signed technical rejection by the authority the log reports: false hides it, true and unknown offer it', async () => {
    for (const [canSign, offered] of [[false, 0], [true, 1], [null, 1], [undefined, 1]] as const) {
      apiRequest.mockImplementation(async (method: string, url: string) =>
        method === 'GET' && url === '/api/mdx/gateways/transmittals' ? logResponse(canSign) : ({ ok: true, status: 200, json: async () => ({}) } as Response));
      render(<GatewayTransmittals {...props()} />);
      await screen.findByText('ESG-PKG-7');
      expect(screen.queryAllByRole('button', { name: /Technical rejection/ }), String(canSign)).toHaveLength(offered);
      cleanup();
    }
  });

  it('a failed log read is an error, never "No transmittals yet"', async () => {
    apiRequest.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({ error: 'down' }) } as Response));
    render(<GatewayTransmittals {...props()} />);
    expect(await screen.findByText(/Couldn.t read the transmittal log/)).toBeTruthy();
    expect(screen.queryByText(/No transmittals yet/)).toBeNull();
  });
});
