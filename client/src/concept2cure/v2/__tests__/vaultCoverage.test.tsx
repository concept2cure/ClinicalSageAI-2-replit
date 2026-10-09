// @vitest-environment jsdom
/**
 * The Vault shows what it holds against what the program's rule pack requires
 * (VR-15, row D2): counts from the server, where the list came from, and why
 * when there is no figure. Never a percentage. Each missing section offers
 * Upload and filing an existing document there through the page's own filing
 * call. Server half: server/services/vault/__tests__/vault-coverage.test.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { PID, DOC_ID, ok, vaultPayload, props, mockVaultApi } from './_vault-surface-fixtures';

const available = (provenance: Record<string, unknown>) => ({
  state: 'available',
  provenance,
  required: 3,
  covered: 1,
  modules: [
    { code: 'm2', name: 'CTD Summaries', covered: [], missing: ['2.5'] },
    { code: 'm3', name: 'Quality (CMC)', covered: ['3.2.P.8'], missing: ['3.2.S'] },
  ],
});
const PACK = { source: 'rule_pack', docType: 'ind', agency: 'FDA', packVersion: '2.1' };

beforeEach(() => { (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' }; });
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('Vault coverage', () => {
  it('shows the counts and the rule pack they come from, and no percentage', async () => {
    mockVaultApi(apiRequest, () => ok(vaultPayload({ coverage: available(PACK) })));
    render(<Vault {...props()} />);
    const block = await screen.findByTestId('vault-coverage');
    await waitFor(() => expect(block.textContent).toContain('Required sections: 1 of 3 have a confirmed document'));
    expect(block.textContent).toContain('IND rule pack for FDA, version 2.1');
    expect(block.textContent).not.toMatch(/%/);
  });

  it('tells AnA the same counts the page shows', async () => {
    mockVaultApi(apiRequest, () => ok(vaultPayload({ coverage: available(PACK) })));
    const seen: { ctx: SurfaceContext | null } = { ctx: null };
    function Probe() {
      seen.ctx = useActiveSurfaceContext('vault');
      return null;
    }
    render(<><Vault {...props()} /><Probe /></>);
    await waitFor(() => expect((seen.ctx?.facts as any)?.vaultCoverage).toMatchObject({ required: 3, covered: 1 }));
  });

  it("says when the list is the ICH baseline and not the program's own", async () => {
    mockVaultApi(apiRequest, () =>
      ok(vaultPayload({ coverage: available({ source: 'fallback', reason: 'The program type is unknown.' }) })),
    );
    render(<Vault {...props()} />);
    const block = await screen.findByTestId('vault-coverage');
    await waitFor(() => expect(block.textContent).toContain("ICH CTD baseline, not this program's own"));
    expect(block.textContent).toContain('The program type is unknown.');
  });

  it('files an existing document at a missing section through the filing call', async () => {
    const filed: unknown[] = [];
    mockVaultApi(apiRequest, () => ok(vaultPayload({ coverage: available(PACK) })), (body) => {
      filed.push(body);
      return ok({ success: true, filing: { folderId: 'module-2', folderLabel: 'Module 2', placementStatus: 'confirmed' } });
    });
    render(<Vault {...props()} />);
    fireEvent.click(await screen.findByText('Show sections'));
    const row = screen.getByTestId('vault-coverage-missing-2.5');
    expect(row.textContent).toContain('Upload');
    fireEvent.change(screen.getByLabelText('Document to file at 2.5'), { target: { value: DOC_ID } });
    fireEvent.click(row.querySelector('button:last-of-type') as HTMLButtonElement);
    await waitFor(() => expect(filed).toHaveLength(1));
    expect(filed[0]).toMatchObject({ documentId: DOC_ID, folderId: 'module-2', ctdSection: '2.5' });
  });

  it('shows why when there is no figure, and never "0 of"', async () => {
    for (const coverage of [
      { state: 'unavailable', reason: 'The rule-pack store could not be read.' },
      { state: 'not_applicable', reason: 'This vault is not CTD-numbered.' },
    ]) {
      mockVaultApi(apiRequest, () => ok(vaultPayload({ coverage })));
      render(<Vault {...props()} />);
      const block = await screen.findByTestId('vault-coverage');
      await waitFor(() => expect(block.textContent).toContain(coverage.reason));
      expect(block.textContent).not.toMatch(/Required sections|\d+ of \d+/);
      cleanup();
    }
  });
});
