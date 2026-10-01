// @vitest-environment jsdom
/**
 * Check stored files (plan critique 15, D5): the Vault asks the server to
 * re-prove every stored version and shows its answer, naming every version
 * that could not be proven. A check that did not run says so; it never reads
 * as "all intact". Server half: tests/db/vault-fixity.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { Vault } from '../surfaces/Vault';
import { fixitySummary } from '../surfaces/VaultFixityCheck';
import { PID, ok, vaultPayload, props } from './_vault-surface-fixtures';

const FIX_URL = `/api/c2c/project-vault/${PID}/fixity`;
let onFixity: () => Response;

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload());
    if (url === FIX_URL && method === 'POST') return onFixity();
    return ok({});
  });
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

const run = {
  checkedAt: '2026-10-01T15:30:12.000Z',
  checked: 4,
  counts: { verified: 2, altered: 1, missing: 1, unreadable: 0, unverifiable: 0 },
  findings: [
    { documentId: 'd-2', title: 'Altered record', version: '1.0', verdict: 'altered' },
    { documentId: 'd-3', title: 'Lost record', version: '1.0', verdict: 'missing' },
  ],
  truncated: false,
};

describe('check stored files (critique 15)', () => {
  it('runs the check and names every version that could not be proven', async () => {
    onFixity = () => ok({ success: true, data: run });
    render(<Vault {...props()} />);
    const panel = await screen.findByTestId('vault-fixity');
    fireEvent.click(within(panel).getByRole('button', { name: 'Check stored files' }));
    const status = await within(panel).findByRole('status');
    expect(apiRequest).toHaveBeenCalledWith('POST', FIX_URL, {});
    expect(status.textContent).toContain('Checked 4 stored versions at 2026-10-01 15:30 UTC: 2 match their recorded SHA-256, 2 could not be proven.');
    expect(status.textContent).toContain('Altered record v1.0: its stored file no longer matches the SHA-256 recorded for it.');
    expect(status.textContent).toContain('Lost record v1.0: its stored file could not be found.');
  });

  it('a check that did not run says so, with the reason, and shows no result', async () => {
    onFixity = () => { throw new ApiRequestError('Insufficient permissions', 403, { error: 'Insufficient permissions' }, ''); };
    render(<Vault {...props()} />);
    const panel = await screen.findByTestId('vault-fixity');
    fireEvent.click(within(panel).getByRole('button', { name: 'Check stored files' }));
    expect((await within(panel).findByRole('alert')).textContent).toContain('The check did not run. Insufficient permissions');
    expect(within(panel).queryByRole('status')).toBeNull();
  });

  it('all intact, and a capped run, read as such', () => {
    const intact = { ...run, checked: 3, counts: { verified: 3, altered: 0, missing: 0, unreadable: 0, unverifiable: 0 }, findings: [] };
    expect(fixitySummary(intact as never)).toBe('Checked 3 stored versions at 2026-10-01 15:30 UTC: every one matches its recorded SHA-256.');
    expect(fixitySummary({ ...intact, truncated: true } as never)).toMatch(/more versions than one check covers; run it again for the rest\.$/);
  });
});
