// @vitest-environment jsdom
/**
 * S12 (P-83, P-109): in the editor's Sources rail, a section drafted from a Vault version that a later approved version
 * replaced says so, in the rail's words, with Open in Vault on the approved version. Read from the project's changes
 * (vault-citation-changes.ts, pinned on PGlite); a failed read says so, never "none"; another section's rows are not
 * this section's.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));
const setVaultTarget = vi.hoisted(() => vi.fn());
vi.mock('../../vaultTarget', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../vaultTarget')>()), setVaultTarget }));

import { SectionVaultReplacements } from '../SectionVaultReplacements';

const PID = '6065271c-d4b0-4936-aad1-02855423a738';
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => body }) as Response;
const row = (sectionId: string) => ({ sectionId, sectionCode: '2.5.3', documentTitle: 'Module 2.5', citedVaultId: `v1-${sectionId}`,
  citedVersion: '1.0', vaultTitle: 'Drug substance specification', approvedVaultId: `v3-${sectionId}`, approvedVersion: '3.0' });
const reply = (vaultChanges: unknown[]) => ok({ projectId: PID, changes: [], count: 0, vaultChanges, vaultCount: vaultChanges.length });

beforeEach(() => { apiRequest.mockReset(); setVaultTarget.mockReset(); });
afterEach(cleanup);

describe('the Sources rail names a replaced Vault version (S12)', () => {
  it('says "replaced since cited" with the versions, and opens the approved version in the Vault', async () => {
    apiRequest.mockResolvedValue(reply([row('s1'), row('s2')]));
    const onNav = vi.fn();
    render(<SectionVaultReplacements programId={PID} sectionId="s1" onNav={onNav} />);
    expect(await screen.findByText('Source has been replaced since cited')).toBeTruthy();
    expect(screen.getByText('Drug substance specification')).toBeTruthy();
    expect(screen.getByText('Drafted from v1.0 · v3.0 is approved')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Open in Vault/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Open in Vault/ }));
    expect(setVaultTarget).toHaveBeenCalledWith({ documentId: 'v3-s1', programId: PID });
    expect(onNav).toHaveBeenCalledWith('vault');
    expect(apiRequest.mock.calls[0][1]).toBe(`/api/c2c/projects/${PID}/source-changes`);
  });

  it('draws nothing for a section with no replaced version, and nothing without a project', async () => {
    apiRequest.mockResolvedValue(reply([row('s2')]));
    const { container } = render(<SectionVaultReplacements programId={PID} sectionId="s1" onNav={vi.fn()} />);
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe('');
    cleanup(); apiRequest.mockClear();
    const none = render(<SectionVaultReplacements programId={null} sectionId="s1" onNav={vi.fn()} />);
    expect(none.container.textContent).toBe('');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('says a failed or malformed read could not be checked, never "none"', async () => {
    for (const bad of [ok({ message: 'unavailable' }, 503), ok({ changes: [], count: 0 })]) {
      apiRequest.mockResolvedValue(bad);
      render(<SectionVaultReplacements programId={PID} sectionId="s1" onNav={vi.fn()} />);
      expect(await screen.findByText('Vault citations could not be checked for this section.')).toBeTruthy();
      cleanup();
    }
  });
});
