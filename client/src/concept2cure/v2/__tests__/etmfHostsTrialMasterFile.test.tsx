// @vitest-environment jsdom
/**
 * The `etmf` surface's page (surfaces/Etmf.tsx) is the door to the trial master file, which lives in the Vault.
 *
 * The eTMF was admitted to the Vault app on 2026-11-12 (P-74 item 1, P-75, P-124 item 6). Until then this page hosted
 * the section, because the Vault could not call /api/etmf; its cases pinned that. Now the section is the Vault's
 * (vaultTrialMasterFile.inVault.test.tsx), and what AnA can see of it the Vault tells
 * (vaultTmfAnaContextInVault.test.tsx, where this suite's six AnA cases moved). This page keeps: the way back, the
 * title, opening the Vault on the section once with a project open, and the honest empty state with none.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({ apiRequest: vi.fn(), locked: new Set<string>() }));
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: H.apiRequest }));
vi.mock('../surfaces/VaultViewOnly', async (original) => ({ ...(await original<typeof import('../surfaces/VaultViewOnly')>()), useVaultCanWrite: () => true }));
/* The release's verdicts: a surface in `locked` is outside it, as production reports one (filingPathNoDeadEnds.test.tsx). */
vi.mock('../navEntitlements', async (original) => ({
  ...(await original<typeof import('../navEntitlements')>()),
  useNavEntitlements: () => ({
    verdictFor: (id: string) => (H.locked.has(id) ? { id, label: id, entitled: false, source: 'launch-scope', requiredTier: null } : null),
    resolved: true, masterAdmin: false, platformAdmin: false, tier: null,
  }),
}));

import { Etmf } from '../surfaces/Etmf';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { takeVaultTmfAsk } from '../surfaces/VaultTrialMasterFile';
import { PID } from './_vault-surface-fixtures';
import { json, resetTmf, tmfApi } from './_vault-tmf-fixtures';

let published: SurfaceContext | null = null;
function Probe() {
  published = useActiveSurfaceContext('etmf');
  return null;
}
const openProject = () => { (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-204' }; };
const onAsk = vi.fn();
function page() {
  const onNav = vi.fn();
  render(<><Etmf surface={{ id: 'etmf', label: 'Trial master file' } as never} onAsk={onAsk} onNav={onNav} segment="biotech" /><Probe /></>);
  return onNav;
}

beforeEach(() => {
  H.locked.clear();
  onAsk.mockReset();
  published = null;
  resetTmf();
  H.apiRequest.mockReset();
  H.apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => (await tmfApi(method, url, body)) ?? json({}));
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('the eTMF’s page is the door to the trial master file in the project’s Vault', () => {
  it('with a project open: one title, the way back, and the Vault opened on the trial master file, once', async () => {
    openProject();
    const onNav = page();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Trial master file']);
    expect(screen.getByTestId('etmf-opening').textContent).toMatch(/Opening the trial master file in the project’s Vault/);
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('vault'));
    // The Vault is asked once to open on Required documents with the section in view, then the ask is used up.
    expect(takeVaultTmfAsk()).toBe(true);
    expect(takeVaultTmfAsk()).toBe(false);
    // The page hosts no section and reads nothing: one place for the trial master file (RULE 4).
    expect(screen.queryByTestId('vault-tmf')).toBeNull();
    expect(H.apiRequest).not.toHaveBeenCalled();
    await waitFor(() => expect(published?.summary).toMatch(/section of the Vault’s Required documents view; the Vault is being opened there/));
    fireEvent.click(screen.getByRole('button', { name: /BX-204/ }));
    expect(onNav).toHaveBeenCalledWith('project-home');
  });

  it('with no project open: says a trial master file belongs to a project’s study, offers Projects, and reads nothing', async () => {
    const onNav = page();
    const empty = screen.getByTestId('etmf-no-project');
    expect(empty.textContent).toMatch(/Open a project to see its trial master file/);
    expect(empty.textContent).toMatch(/A trial master file belongs to a study, and a study belongs to a project\./);
    expect(screen.queryByTestId('vault-tmf')).toBeNull();
    fireEvent.click(within(empty).getByRole('button', { name: 'Open Projects' }));
    expect(onNav).toHaveBeenCalledWith('projects');
    expect(onNav).not.toHaveBeenCalledWith('vault');
    expect(takeVaultTmfAsk()).toBe(false);
    // Nothing is read, and nothing can be filed, without a project.
    expect(H.apiRequest).not.toHaveBeenCalled();
    await waitFor(() => expect(published?.summary).toMatch(/no project is open, so nothing is on screen\. This is not an empty trial master file\./));
    expect(published?.facts).toBeUndefined();
  });
});
