// @vitest-environment jsdom
/**
 * Audit trail — a signed act reads as signed, and the drawer names both the
 * record and the signature it links to (#24, 2026-09-28).
 *
 * The ledger (server/routes/audit-trail-ledger.routes.ts) now joins each
 * audit_logs row to the signature row that names it and returns `sig: true`,
 * the declared meaning, a reader's name for the record (`target`) and the
 * record's own reference (`targetRef`) and the signature's (`signatureRef`).
 * The server side is pinned in audit-trail-ledger.routes.test.ts against
 * PGlite; this pins what the surface does with it: the reference is not lost
 * when the target is named for a reader, and it stays searchable.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AuditTrail } from '../surfaces/AdminSurfaces';

const SIGNED = {
  id: 'AUD-1c0ccbc6', when: '2026-09-28 14:10', at: '2026-09-28T14:10:20.989Z',
  actor: 'Rae Okafor', actorRef: 'user:4',
  event: 'Controlled document approved (e-signature)',
  target: 'C2C-SOP-001 v1.0', targetRef: 'qms-document:1',
  kind: 'esign', sig: true, hash: 'a'.repeat(64), prevHash: 'genesis', ip: '10.1.2.3',
  reason: 'Reviewed against the quality manual.', meaning: 'APPROVED',
  source: 'audit_logs', seq: 1, signatureRef: 'electronic_signatures:1',
};
const PLAIN = {
  ...SIGNED, id: 'AUD-2', event: 'Vault document ingested', target: 'vault_document:doc-42', targetRef: null,
  kind: 'vault', sig: false, meaning: null, reason: null, signatureRef: null, seq: 2, prevHash: 'a'.repeat(64), hash: 'b'.repeat(64),
};

function serve() {
  apiRequest.mockImplementation(async (_m: string, url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      String(url).startsWith('/api/audit-trail/ledger')
        ? { success: true, data: [PLAIN, SIGNED], meta: { chain: { store: 'audit_logs', ok: true, rowsChecked: 2, legacyRows: 0, sequencedRows: 2 } } }
        : { success: true, data: [] },
  }));
}

const PROPS = () =>
  ({ surface: { id: 'audit-trail', label: 'Audit trail' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' }) as unknown as React.ComponentProps<typeof AuditTrail>;

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('Audit trail — a signed act', () => {
  it('shows the signed mark on the signed row only, named for a reader', async () => {
    serve();
    render(<AuditTrail {...PROPS()} />);
    const row = (await screen.findAllByText('Controlled document approved (e-signature)'))
      .map((el) => el.closest('button'))
      .find((b) => b?.textContent?.includes('C2C-SOP-001 v1.0')) as HTMLElement;
    expect(within(row).getByRole('img', { name: 'E-signed (21 CFR Part 11)' })).toBeTruthy();
    const plain = screen.getAllByText('Vault document ingested').map((el) => el.closest('button')).find(Boolean) as HTMLElement;
    expect(within(plain).queryByRole('img', { name: 'E-signed (21 CFR Part 11)' })).toBeNull();
  });

  it('the drawer keeps the record’s reference and names the signature record', async () => {
    serve();
    render(<AuditTrail {...PROPS()} />);
    const row = (await screen.findAllByText('Controlled document approved (e-signature)'))
      .map((el) => el.closest('button'))
      .find((b) => b?.textContent?.includes('C2C-SOP-001 v1.0')) as HTMLElement;
    fireEvent.click(row);
    expect(await screen.findByText('qms-document:1')).toBeTruthy();
    expect(screen.getByText('electronic_signatures:1')).toBeTruthy();
    expect(screen.getByText(/This entry was digitally signed per 21 CFR §11\.50/).textContent).toMatch(/APPROVED/);
  });

  it('finds the row by its record reference, though the table shows its name', async () => {
    serve();
    render(<AuditTrail {...PROPS()} />);
    await screen.findAllByText('Controlled document approved (e-signature)');
    fireEvent.change(screen.getByPlaceholderText('Search entries...'), { target: { value: 'qms-document:1' } });
    expect(screen.queryAllByText('Controlled document approved (e-signature)').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Vault document ingested')).toHaveLength(0);
  });
});
