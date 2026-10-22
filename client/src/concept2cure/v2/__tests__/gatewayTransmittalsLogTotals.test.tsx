// @vitest-environment jsdom
/**
 * Gateway transmittals — the log's count and AnA's facts come from the
 * server's totals, not from the page it returned (package-spine sweep,
 * honest-state lens HS-8: docs/evidence/W5/2026-09-30-package-spine-sweep/LENSES.md).
 *
 * GET /api/mdx/gateways/transmittals returns the most recent page only (100 by
 * default). A count taken from the page reported 100 for an organisation with
 * 250 and hid every older unacknowledged transmittal from AnA's facts. The
 * route answers meta {count, total, hasMore, byStatus, awaitingAcknowledgement}
 * over every row the filters match (transmittal-log-totals.pglite.test.ts).
 *
 * The screen is the read-only log since 2026-10-17 (8b75e6b5b); the other
 * honest-state cases (HS-1–HS-7) were about its transmit and assemble controls,
 * which left it then, and are not carried here.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
type Published = { summary?: string; facts?: Record<string, unknown> };
const published = vi.hoisted(() => ({ current: null as null | Published }));
vi.mock('../surfaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../surfaceContext')>()),
  // What the surface hands AnA, captured as published (id, context).
  usePublishSurfaceContext: (...args: [string, Published]) => { published.current = args[1]; },
}));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config }: any) => <div data-testid="form">{config.title}</div>,
}));

import { GatewayTransmittals } from '../surfaces/GatewayTransmittals';

const ROW = { id: 3, region: 'fda', gateway: 'esg', submission_type: 'original', transmission_id: 'ESG-XYZ', status: 'completed', submitted_at: '2026-07-21T00:00:00Z', ack_received_at: '2026-07-21T01:00:00Z', submitted_by_name: 'Dr Ada Lovelace' };
const PAGE = Array.from({ length: 100 }, (_, i) => ({ ...ROW, id: 1000 - i, transmission_id: `ESG-${1000 - i}` }));
const props = () => ({ surface: { id: 'gateway-transmittals', label: 'Gateway transmittals' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

function serveLog(meta?: Record<string, unknown>) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/gateways/transmittals') {
      return { ok: true, status: 200, json: async () => (meta === undefined ? { data: PAGE } : { data: PAGE, meta }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
  });
}

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  published.current = null;
});

describe('HS-8 — the log’s count and AnA’s facts come from the server’s totals', () => {
  it('a truncated page: "100 of 250", a note that older ones are not listed, and AnA gets the totals', async () => {
    serveLog({ count: 100, total: 250, hasMore: true, byStatus: { completed: 220, in_transit: 30 }, awaitingAcknowledgement: 30 });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-1000');
    expect(screen.getByText('100 of 250')).toBeTruthy();
    expect(screen.getByText(/older transmittals are not listed here/i)).toBeTruthy();
    await waitFor(() => expect(published.current?.facts?.transmittalCount).toBe(250));
    expect(published.current?.facts).toMatchObject({
      transmittalCount: 250, transmittalsListed: 100, logTruncated: true,
      awaitingAcknowledgement: 30, byStatus: { completed: 220, in_transit: 30 },
    });
    expect(published.current?.summary).toMatch(/250 transmittal\(s\) logged/);
  });

  it('a page with more to come but no total says older ones are not listed, without inventing a total', async () => {
    serveLog({ count: 100, hasMore: true });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-1000');
    expect(screen.getByText('Showing the 100 most recently submitted transmittals. Older transmittals are not listed here.')).toBeTruthy();
    expect(screen.queryByText(/100 of/)).toBeNull();
    await waitFor(() => expect(published.current?.facts?.logTruncated).toBe(true));
    expect(published.current?.facts?.transmittalCount).toBeNull();
  });

  it('without the server’s totals the facts are unknown, never computed from the page', async () => {
    serveLog();
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-1000');
    await waitFor(() => expect(published.current?.facts?.logState).toBe('ready'));
    expect(published.current?.facts).toMatchObject({
      transmittalCount: null, transmittalsListed: 100, logTruncated: null, awaitingAcknowledgement: null, byStatus: null,
    });
    expect(published.current?.summary).not.toMatch(/100 transmittal\(s\) logged/);
    expect(screen.queryByText(/not listed here/)).toBeNull();
  });
});
