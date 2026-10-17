// @vitest-environment jsdom
/**
 * GatewayTransmittals — gateways are named, not shown as registry keys.
 *
 * ── The finding (launch sweep, empty org) ────────────────────────────────────
 * The gateway routes answer with registry keys and no display name, and the
 * screen printed them: "esg", "pmda_gateway", "hc_cesg", "swissmedic_egateway"…
 * Since 2026-10-17 the screen is a read-only transmittal log (the gateway
 * roster and the Transmit form left with the package transmit), so what is
 * pinned is the log's Route column: every gateway a transmittal can carry is
 * named the way gatewayLabels.ts names it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { GatewayTransmittals } from '../surfaces/GatewayTransmittals';

/* The region/gateway pairs the dev server's GET /api/mdx/gateways lists for a fresh organization. */
const LIVE = [
  ['fda', 'esg', 'FDA ESG'], ['ema', 'cesp', 'CESP'], ['ema', 'eudamed', 'EUDAMED'], ['pmda', 'pmda_gateway', 'PMDA Gateway'],
  ['ca', 'hc_cesg', 'Health Canada CESG'], ['uk', 'mhra_gateway', 'MHRA Gateway'], ['cn', 'nmpa_gateway', 'NMPA Gateway'],
  ['au', 'tga_ebs', 'TGA eBusiness Services'], ['ch', 'swissmedic_egateway', 'Swissmedic eGateway'], ['br', 'anvisa_gateway', 'ANVISA Gateway'],
  ['in', 'cdsco_sugam', 'CDSCO SUGAM'], ['kr', 'mfds_dbio', 'MFDS dBio'], ['sg', 'hsa_prism', 'HSA PRISM'],
] as const;
const LOG = LIVE.map(([region, gateway], i) => ({
  id: i + 1, region, gateway, submission_type: 'original', transmission_id: `REF-${i + 1}`, status: 'received',
  submitted_at: '2026-07-21T00:00:00Z', ack_received_at: null, submitted_by_name: 'R. Author',
}));

const env = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => ({ data }) } as Response);
const props = () => ({ surface: { id: 'gateway-transmittals', label: 'Dispatch' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) =>
    method === 'GET' && url === '/api/mdx/gateways/transmittals' ? env(LOG) : env(null));
});
afterEach(() => cleanup());

describe('GatewayTransmittals — gateway names', () => {
  it('names every gateway in the log instead of printing its registry key', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('REF-1');
    const routes = Array.from(document.querySelectorAll('table.reg-tbl tbody tr td:nth-child(2)')).map((td) => (td.textContent ?? '').trim());
    expect(routes).toEqual(LIVE.map(([region, , name]) => `${region.toUpperCase()} / ${name} · original`));
    for (const [, key] of LIVE) {
      expect(document.body.textContent, `the registry key "${key}" was shown as the gateway name`).not.toMatch(new RegExp(`/ ${key}\\b`));
    }
  });
});
