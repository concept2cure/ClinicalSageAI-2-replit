// @vitest-environment jsdom
/**
 * GatewayTransmittals — gateways are named, not shown as registry keys.
 *
 * ── The finding (launch sweep, empty org) ────────────────────────────────────
 * GET /api/mdx/gateways answers { region, gateway, transport, configured } with
 * no display name, and the table rendered `g.name ?? g.gateway`: the GATEWAY
 * column read "esg", "pmda_gateway", "hc_cesg", "swissmedic_egateway"… The
 * Transmit form offered the same keys, and lowercase region slugs ("fda",
 * "ema"), as its choices.
 *
 * LIVE_GATEWAYS is the dev server's response for a fresh organization. The
 * sibling gatewayTransmittals.test.tsx mocks a `name` field the route never
 * sends, which is why it never saw this.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit }: any) => {
    (globalThis as any).__c2cFormConfig = config;
    return (
      <button
        data-testid="form-submit"
        onClick={() => onSubmit({ region: 'fda', gateway: 'esg', packageId: '77', reason: 'Dispatch sequence 0000 to FDA', meaning: 'release', password: 'pw' })}
      >
        {config.submitLabel}
      </button>
    );
  },
}));

import { GatewayTransmittals } from '../surfaces/GatewayTransmittals';

const LIVE_GATEWAYS = [
  { region: 'fda', gateway: 'esg', transport: 'as2', configured: false, environment: 'production' },
  { region: 'ema', gateway: 'cesp', transport: 'rest', configured: false, environment: 'production' },
  { region: 'ema', gateway: 'eudamed', transport: 'rest', configured: false, environment: 'production' },
  { region: 'pmda', gateway: 'pmda_gateway', transport: 'rest', configured: false, environment: 'production' },
  { region: 'ca', gateway: 'hc_cesg', transport: 'rest', configured: false, environment: 'production' },
  { region: 'uk', gateway: 'mhra_gateway', transport: 'rest', configured: false, environment: 'production' },
  { region: 'cn', gateway: 'nmpa_gateway', transport: 'rest', configured: false, environment: 'production' },
  { region: 'au', gateway: 'tga_ebs', transport: 'rest', configured: false, environment: 'production' },
  { region: 'ch', gateway: 'swissmedic_egateway', transport: 'rest', configured: false, environment: 'production' },
  { region: 'br', gateway: 'anvisa_gateway', transport: 'rest', configured: false, environment: 'production' },
  { region: 'in', gateway: 'cdsco_sugam', transport: 'rest', configured: false, environment: 'production' },
  { region: 'kr', gateway: 'mfds_dbio', transport: 'rest', configured: false, environment: 'production' },
  { region: 'sg', gateway: 'hsa_prism', transport: 'rest', configured: false, environment: 'production' },
];
const RAW_KEYS = LIVE_GATEWAYS.map((g) => g.gateway);

const LOG = [{ id: 5, region: 'ca', gateway: 'hc_cesg', submission_type: 'original', transmission_id: 'CESG-1', status: 'received', submitted_at: '2026-07-21T00:00:00Z', ack_received_at: null, submitted_by_name: 'R. Author' }];

const env = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => ({ data }) } as Response);
const props = () => ({ surface: { id: 'gateway-transmittals', label: 'Dispatch' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

/** Text of every cell in the gateways table's first (Gateway) column. */
function gatewayColumn(): string[] {
  const table = Array.from(document.querySelectorAll('table.reg-tbl')).find((t) =>
    (t.querySelector('thead')?.textContent ?? '').includes('Credentials'),
  );
  return Array.from(table?.querySelectorAll('tbody tr td:first-child') ?? []).map((td) => (td.textContent ?? '').trim());
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/gateways') return env(LIVE_GATEWAYS);
    if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
    if (method === 'POST' && url === '/api/mdx/gateways/fda/esg/transmit') return env({ transmittalId: 9, transmissionId: 'ESG-9', status: 'received' }, 201);
    return env(null);
  });
});
afterEach(() => cleanup());

describe('GatewayTransmittals — gateway names', () => {
  it('names every gateway in the table instead of printing its registry key', async () => {
    render(<GatewayTransmittals {...props()} />);
    await waitFor(() => expect(gatewayColumn()).toHaveLength(LIVE_GATEWAYS.length));
    const column = gatewayColumn();
    for (const key of RAW_KEYS) {
      expect(column, `the registry key "${key}" was shown as the gateway name`).not.toContain(key);
    }
    expect(column).toEqual([
      'FDA ESG', 'CESP', 'EUDAMED', 'PMDA Gateway', 'Health Canada CESG', 'MHRA Gateway', 'NMPA Gateway',
      'TGA eBusiness Services', 'Swissmedic eGateway', 'ANVISA Gateway', 'CDSCO SUGAM', 'MFDS dBio', 'HSA PRISM',
    ]);
    // The transmittal log's route names the gateway the same way.
    expect(document.body.textContent).toContain('CA / Health Canada CESG · original');
    expect(document.body.textContent).not.toMatch(/\/ hc_cesg/);
  });

  it('offers named choices in the Transmit form and still posts to the route keys', async () => {
    render(<GatewayTransmittals {...props()} />);
    await waitFor(() => expect(gatewayColumn()).toHaveLength(LIVE_GATEWAYS.length));
    fireEvent.click(screen.getByRole('button', { name: /^Transmit$/ }));

    const cfg = (globalThis as any).__c2cFormConfig;
    const region = cfg.fields.find((f: any) => f.key === 'region');
    const gateway = cfg.fields.find((f: any) => f.key === 'gateway');
    const labelOf = (o: unknown) => (typeof o === 'string' ? o : (o as { label: string }).label);
    const valueOf = (o: unknown) => (typeof o === 'string' ? o : (o as { value: string }).value);
    expect(region.options.map(labelOf), 'region choices were lowercase slugs').toEqual(['FDA', 'EMA', 'PMDA', 'CA']);
    expect(gateway.options.map(labelOf), 'gateway choices were registry keys').toEqual(['FDA ESG', 'CESP', 'EUDAMED', 'PMDA Gateway', 'Health Canada CESG']);
    // The values are the route's keys — only the words changed.
    expect(region.options.map(valueOf)).toEqual(['fda', 'ema', 'pmda', 'ca']);
    expect(gateway.options.map(valueOf)).toEqual(['esg', 'cesp', 'eudamed', 'pmda_gateway', 'hc_cesg']);

    fireEvent.click(screen.getByTestId('form-submit'));
    expect(await screen.findByText(/Transmitted via FDA \/ FDA ESG · gateway ref ESG-9/)).toBeTruthy();
  });
});
