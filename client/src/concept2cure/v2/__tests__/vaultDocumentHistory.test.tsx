// @vitest-environment jsdom
/**
 * VR-01 — a Vault document shows its own history (21 CFR 11.10(e): the audit
 * trail is available for review). The detail pane used to say no history
 * endpoint existed. It now reads GET …/documents/:id/history, from the one
 * chained ledger, and shows the server's verdict on the chain. A failed read is
 * shown as a failure, never as a document with no history.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { PID, DOC_ID, ok, vaultPayload, props } from './_vault-surface-fixtures';

const HISTORY_URL = `/api/c2c/project-vault/${PID}/documents/${DOC_ID}/history`;
const entries = [
  { id: 'AUD-2', event: 'Vault Document Download', actor: 'Dana Reviewer', at: '2026-09-24T10:05:00.000Z', when: '2026-09-24 10:05', hash: 'b'.repeat(64), prevHash: 'a'.repeat(64), seq: 12 },
  { id: 'AUD-1', event: 'Vault Document Ingest', actor: 'Ada Author', at: '2026-09-24T09:00:00.000Z', when: '2026-09-24 09:00', hash: 'a'.repeat(64), prevHash: '', seq: 11 },
];
const verified = { store: 'audit_logs', ok: true, rowsChecked: 40, legacyRows: 0, sequencedRows: 40 };

function mockApi(history: () => Response) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload());
    if (url === HISTORY_URL) return history();
    return ok({});
  });
}
const fail = () => ({ ok: false, status: 500, json: async () => ({ success: false, error: 'HISTORY_UNAVAILABLE' }) }) as Response;

beforeEach(() => { (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' }; });
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('Vault document history', () => {
  it('lists who did what to this document, newest first, with the chain verdict', async () => {
    mockApi(() => ok({ success: true, data: { entries, chain: verified } }));
    render(<Vault {...props()} />);
    const panel = await screen.findByTestId('vault-document-history');
    await screen.findByText(/Vault Document Download/);
    const text = panel.textContent ?? '';
    expect(text.indexOf('Vault Document Download')).toBeLessThan(text.indexOf('Vault Document Ingest'));
    expect(text).toContain('Dana Reviewer');
    expect(text).toContain('bbbbbbbbbbbb');
    expect(text).toMatch(/audit chain verified/i);
  });

  it('a failed read says so, and does not read as a document with no history', async () => {
    mockApi(fail);
    render(<Vault {...props()} />);
    const panel = await screen.findByTestId('vault-document-history');
    await screen.findByText(/history could not be read/i);
    expect(panel.textContent).not.toMatch(/no recorded events/i);
  });

  it('a broken chain is reported, not hidden', async () => {
    mockApi(() => ok({ success: true, data: { entries, chain: { ...verified, ok: false, brokenAt: 'AUD-9' } } }));
    render(<Vault {...props()} />);
    await screen.findByText(/audit chain check failed/i);
  });
});
