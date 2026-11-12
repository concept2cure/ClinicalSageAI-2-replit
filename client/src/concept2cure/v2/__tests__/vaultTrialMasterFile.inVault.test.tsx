// @vitest-environment jsdom
/**
 * The trial master file section inside the Vault's Required documents view (eTMF admission, 2026-11-12: P-74 item 1,
 * P-75, P-124 item 6).
 *
 * Held until admission as docs/evidence/D2-ETMF/2026-11-10-vault-section/; now on trunk with the hook-in in
 * surfaces/Vault.tsx, and the eTMF's own page is the door to it (etmfHostsTrialMasterFile.test.tsx). What AnA is told
 * of it is pinned in vaultTmfAnaContextInVault.test.tsx.
 *
 * What is pinned:
 *   - it is a section of Required documents, never a view of its own, and it reads nothing until that view is opened;
 *   - the header's "Trial master file" shows Required documents and brings the section into view, and opens no other
 *     screen;
 *   - where the organisation cannot use the trial master file (outside the release, or below the professional band of
 *     its plan), neither the button nor the section is offered, and nothing of it is read;
 *   - opened by the eTMF's page, the Vault opens on Required documents with the section in view, once;
 *   - the section asks AnA in the Vault's own conversation;
 *   - a file the section's filing form adds to the Vault is read back into the Vault's own lists.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({ apiRequest: vi.fn(), locked: new Set<string>(), planLocked: new Set<string>() }));
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: H.apiRequest }));
vi.mock('../surfaces/VaultViewOnly', async (original) => ({ ...(await original<typeof import('../surfaces/VaultViewOnly')>()), useVaultCanWrite: () => true }));
/* The verdicts as production reports them (filingPathNoDeadEnds.test.tsx): a surface in `locked` is outside the release,
   one in `planLocked` is above the organisation's plan (the eTMF is in the professional band, P-75). */
vi.mock('../navEntitlements', async (original) => ({
  ...(await original<typeof import('../navEntitlements')>()),
  useNavEntitlements: () => ({
    verdictFor: (id: string) => (H.locked.has(id) ? { id, label: id, entitled: false, source: 'launch-scope', requiredTier: null }
      : H.planLocked.has(id) ? { id, label: id, entitled: false, source: 'entitlement', requiredTier: 'professional' } : null),
    resolved: true, masterAdmin: false, platformAdmin: false, tier: null,
  }),
}));

import { Vault } from '../surfaces/Vault';
import { VAULT_TMF_SECTION_ID, openVaultTrialMasterFile } from '../surfaces/VaultTrialMasterFile';
import { PID, mockVaultApi, ok, props, vaultPayload } from './_vault-surface-fixtures';
import { completenessOf, json, resetTmf, stubVaultIngest, tmf, tmfApi } from './_vault-tmf-fixtures';

const scrolled: string[] = [];
const tab = (name: string) => screen.getByRole('tab', { name });
const tmfCalls = () => H.apiRequest.mock.calls.filter(([, u]) => String(u).startsWith('/api/etmf') || String(u).startsWith('/api/study-design'));
const vaultReads = () => H.apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && u === `/api/c2c/project-vault/${PID}`).length;

async function openVault(): Promise<ReturnType<typeof props>> {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-204' };
  mockVaultApi(H.apiRequest, () => ok(vaultPayload({ documentCounts: { authored: 0, artifacts: 0, uploads: 1 } })));
  const vaultApi = H.apiRequest.getMockImplementation()!;
  H.apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => (await tmfApi(method, url, body)) ?? vaultApi(method, url, body));
  const p = props();
  render(<Vault {...p} />);
  await screen.findByRole('tablist', { name: 'Vault views' });
  return p;
}

beforeEach(() => {
  H.locked.clear();
  H.planLocked.clear();
  sessionStorage.clear();
  resetTmf();
  H.apiRequest.mockReset();
  scrolled.length = 0;
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = function scrollIntoView(this: Element) { scrolled.push(this.id); };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('in the Vault: a section of Required documents, and the header button that shows it', () => {
  it('is a section of the Required documents view, not a view of its own, and reads nothing until that view opens', async () => {
    await openVault();
    const views = within(screen.getByRole('tablist', { name: 'Vault views' })).getAllByRole('tab').map((t) => t.textContent);
    expect(views).toEqual(['Library', 'Data catalog', 'Uploads · 1', 'Required documents', 'Governed artifacts', 'Seals & fixity']);
    const tmf = screen.getByTestId('vault-tmf');
    const panel = tmf.closest('[role="tabpanel"]') as HTMLElement;
    expect(panel.getAttribute('data-view')).toBe('required');
    // In that view only, after the coverage it sits beside, under its own name.
    expect(document.querySelectorAll('[data-testid="vault-tmf"]')).toHaveLength(1);
    expect(panel.querySelector('[data-testid="vault-coverage"]')!.compareDocumentPosition(tmf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(tmf).getByRole('heading', { level: 2, hidden: true }).textContent).toBe('Trial master file');
    expect(tmfCalls()).toHaveLength(0);

    fireEvent.click(tab('Required documents'));
    expect((await within(tmf).findByTestId('vault-tmf-verdict')).getAttribute('data-verdict')).toBe('incomplete');
    expect(tmfCalls().filter(([, u]) => u === `/api/study-design?program_id=${PID}`)).toHaveLength(1);
  });

  it('"Trial master file" shows Required documents and brings the section into view; it opens no other screen', async () => {
    const p = await openVault();
    expect(tab('Library').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Trial master file/ }));
    expect(tab('Required documents').getAttribute('aria-selected')).toBe('true');
    const tmf = screen.getByTestId('vault-tmf');
    expect(tmf.id).toBe(VAULT_TMF_SECTION_ID);
    await waitFor(() => expect(scrolled).toEqual([VAULT_TMF_SECTION_ID]));
    expect(document.activeElement).toBe(tmf);
    await within(tmf).findByTestId('vault-tmf-verdict');
    expect(p.onNav).not.toHaveBeenCalled();
  });

});

describe('in the Vault: where the trial master file is offered, and how it is brought into view', () => {
  it.each([
    ['outside the release', H.locked],
    ['below the professional band of the organisation’s plan', H.planLocked],
  ])('where the trial master file cannot be used (%s), neither the button nor the section is offered, and nothing of it is read', async (_why, lock) => {
    lock.add('etmf');
    await openVault();
    expect(screen.queryByRole('button', { name: /Trial master file/ })).toBeNull();
    expect(screen.queryByTestId('vault-tmf')).toBeNull();
    fireEvent.click(tab('Required documents'));
    await screen.findByTestId('vault-coverage');
    expect(screen.queryByTestId('vault-tmf')).toBeNull();
    expect(tmfCalls()).toHaveLength(0);
  });

  it('opened by the eTMF’s page, the Vault opens on Required documents with the section in view, once', async () => {
    const onNav = vi.fn();
    openVaultTrialMasterFile(onNav);
    expect(onNav).toHaveBeenCalledWith('vault');
    const p = await openVault();
    expect(tab('Required documents').getAttribute('aria-selected')).toBe('true');
    const tmf = screen.getByTestId('vault-tmf');
    await waitFor(() => expect(scrolled).toEqual([VAULT_TMF_SECTION_ID]));
    expect(document.activeElement).toBe(tmf);
    await within(tmf).findByTestId('vault-tmf-verdict');
    expect(p.onNav).not.toHaveBeenCalled();
    // The ask is used once: the Vault opened again opens on its library.
    cleanup();
    scrolled.length = 0;
    await openVault();
    expect(tab('Library').getAttribute('aria-selected')).toBe('true');
    expect(scrolled).toEqual([]);
  });

  /* Found in the running app (docs/evidence/D2-ETMF/2026-11-12-admission/). Opened by the eTMF's page, the section was
     scrolled to while it held only its heading, so the page was too short to bring it up and it stayed at the foot of
     the screen; the header button did the same the first time it was used. Each request now waits for the section's
     read to settle, so its records are on the page. */
  it.each([
    ['the header button, used before the section was ever opened', false],
    ['the Vault opened by the eTMF’s page', true],
  ])('asked by %s, the section is brought into view once its read has settled, not before', async (_door, byPage) => {
    let answer!: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => { answer = resolve; });
    tmf.refuseWith.completeness = () => pending;
    if (byPage) openVaultTrialMasterFile(vi.fn());
    await openVault();
    if (!byPage) fireEvent.click(screen.getByRole('button', { name: /Trial master file/ }));
    expect(tab('Required documents').getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(tmfCalls().some(([, u]) => String(u).includes('/completeness'))).toBe(true));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(scrolled).toEqual([]);
    await act(async () => { answer(json(completenessOf())); });
    await within(screen.getByTestId('vault-tmf')).findByTestId('vault-tmf-verdict');
    await waitFor(() => expect(scrolled).toEqual([VAULT_TMF_SECTION_ID]));
    expect(document.activeElement).toBe(screen.getByTestId('vault-tmf'));
  });

});

describe('in the Vault: the section works in the Vault’s own conversation and lists', () => {
  it('the section asks AnA in the Vault’s own conversation', async () => {
    const p = await openVault();
    fireEvent.click(tab('Required documents'));
    const tmf = screen.getByTestId('vault-tmf');
    await within(tmf).findByTestId('vault-tmf-verdict');
    fireEvent.click(within(tmf).getByTestId('vault-tmf-ask'));
    expect(p.onAsk).toHaveBeenCalledWith('Which trial master file gaps would an inspector raise for BX-204 in plaque psoriasis, and how do I close them?');
  });

  it('a file the section’s filing form adds to the Vault is read back into the Vault’s own lists', async () => {
    stubVaultIngest();
    await openVault();
    fireEvent.click(tab('Required documents'));
    const tmf = screen.getByTestId('vault-tmf');
    await within(tmf).findByTestId('vault-tmf-verdict');
    const open = await within(tmf).findByRole('button', { name: 'File a document as Monitoring Plan' });
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(open);
    const form = within(tmf).getByTestId('vault-tmf-file-monitoring_plan');
    fireEvent.change(within(form).getByTestId('vault-tmf-upload-monitoring_plan'), { target: { files: [new File(['%PDF'], 'monitoring-plan-v2.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(within(form).getByLabelText(/^Reason for filing it\./), { target: { value: 'Signed monitoring plan, version 2' } });
    const before = vaultReads();
    fireEvent.click(within(form).getByRole('button', { name: 'Add to the Vault and file as Monitoring Plan' }));
    expect((await within(tmf).findByTestId('vault-tmf-note')).textContent).toMatch(/^“monitoring-plan-v2\.pdf” was added to this project’s Vault/);
    await waitFor(() => expect(vaultReads()).toBeGreaterThan(before));
  });
});
