// @vitest-environment jsdom
/**
 * The Audit trail surface states the ledger's chain verdict as the server
 * gives it, and no more (reporting review 2026-10-01, SECURITY-8).
 *
 * The server now redacts a break that involves another organisation's row
 * (services/audit/audited-export.ts breakForTenant: no id, only "another
 * organization") and says "not verified", with a reason, over no chained rows.
 * The surface read a break without an id as no break location at all and
 * printed "entry unknown (unknown segment, content does not derive from any
 * predecessor)", and read an own-row `commitsTo` object as "derives from
 * nothing". Each shape is pinned here.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AuditTrail } from '../surfaces/AdminSurfaces';

/** One entry, so the ledger renders (an empty one shows its empty state); an audit_events row, which no chain covers. */
const ENTRY = {
  id: 'EVT-1', when: '2026-10-01 09:00', at: '2026-10-01T09:00:00.000Z', actor: 'Rae Okafor', actorRef: 'user:4',
  event: 'Vault document ingested', target: 'vault_document:doc-42', targetRef: null, kind: 'vault', sig: false,
  hash: 'b'.repeat(64), prevHash: 'genesis', ip: null, reason: null, meaning: null, source: 'audit_events', seq: null, signatureRef: null,
};

function serve(chain: Record<string, unknown>) {
  apiRequest.mockImplementation(async (_m: string, url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      String(url).startsWith('/api/audit-trail/ledger')
        ? { success: true, data: [ENTRY], meta: { chain: { store: 'audit_logs', legacyRows: 0, sequencedRows: 3, ...chain } } }
        : { success: true, data: [] },
  }));
}

const PROPS = () =>
  ({ surface: { id: 'audit-trail', label: 'Audit trail' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' }) as unknown as React.ComponentProps<typeof AuditTrail>;

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('Audit trail — the chain verdict', () => {
  it("a break in another organisation's row is stated without naming it", async () => {
    serve({ ok: false, rowsChecked: 3, brokenAt: { segment: 'legacy', row: 'another organization', commitsTo: 'another organization' } });
    render(<AuditTrail {...PROPS()} />);
    const line = await screen.findByText(/Hash chain breaks at another organisation's entry/);
    expect(line.textContent).toMatch(/legacy segment, commits to an entry of another organization/);
    expect(line.textContent).not.toMatch(/unknown/);
  });

  it('a break in its own row names the entry and the entry it derives from', async () => {
    serve({ ok: false, rowsChecked: 3, brokenAt: { segment: 'sequenced', id: 'AUD-9', expected: 'e', stored: 's', commitsTo: { id: 'AUD-7' } } });
    render(<AuditTrail {...PROPS()} />);
    const line = await screen.findByText(/Hash chain breaks at entry AUD-9/);
    expect(line.textContent).toMatch(/sequenced segment, commits to entry AUD-7/);
  });

  it('nothing to verify is stated with the server\'s reason, never as intact', async () => {
    serve({ ok: null, rowsChecked: 0, sequencedRows: 0, reason: 'No chained rows exist for this organisation, so there is no chain to verify.' });
    render(<AuditTrail {...PROPS()} />);
    const line = await screen.findByText(/The chain is not verified: No chained rows exist for this organisation/);
    expect(line.textContent).not.toMatch(/intact|returned no chain verdict/);
  });
});

/**
 * GA-D5-05 (GA readiness map, 2026-11-10): the screen asked the ledger for its default 200 newest entries and
 * presented that slice as the whole trail, so "E-sign" counted and listed only what fell in it, and a signature
 * older than the newest 200 entries could not be found. The route serves up to 1,000 (`limit`).
 */
describe('Audit trail — the window it reads (GA-D5-05)', () => {
  const row = (i: number, kind: string) => ({ ...ENTRY, id: `EVT-${i}`, kind, event: kind === 'esign' ? `Version approved (e-signature) ${i}` : `Vault document ingested ${i}` });
  const serveRows = (rows: unknown[]) => {
    apiRequest.mockImplementation(async (_m: string, url: string) => ({
      ok: true, status: 200,
      json: async () => {
        if (!String(url).startsWith('/api/audit-trail/ledger')) return { success: true, data: [] };
        const limit = Number(new URL(String(url), 'http://x').searchParams.get('limit') ?? 200);
        return { success: true, data: rows.slice(0, limit), meta: { chain: { store: 'audit_logs', ok: true, rowsChecked: rows.length, legacyRows: 0, sequencedRows: rows.length } } };
      },
    }));
  };

  it('finds an e-signature that is older than the newest 200 entries', async () => {
    // 300 entries, newest first; the only signature is the 250th.
    serveRows(Array.from({ length: 300 }, (_, i) => row(i + 1, i === 249 ? 'esign' : 'vault')));
    render(<AuditTrail {...PROPS()} />);
    expect(await screen.findByText(/300 entries — hash-chained/)).toBeTruthy();
    expect(screen.getByText('Version approved (e-signature) 250')).toBeTruthy();
    expect(screen.queryByTestId('audit-window-note')).toBeNull();
  });

  it('says so when the trail is longer than the window: the count is not stated as the whole trail', async () => {
    serveRows(Array.from({ length: 1400 }, (_, i) => row(i + 1, 'vault')));
    render(<AuditTrail {...PROPS()} />);
    expect(await screen.findByText(/Newest 1,000 entries shown — hash-chained/)).toBeTruthy();
    const note = screen.getByTestId('audit-window-note');
    expect(note.textContent).toMatch(/newest 1,000 entries/);
    expect(note.textContent).toMatch(/filters, their counts and the search read those entries only/);
    expect(document.body.textContent).not.toMatch(/\b1,?000 entries — hash-chained/);
  });
});
