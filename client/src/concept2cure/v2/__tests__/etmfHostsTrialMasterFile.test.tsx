// @vitest-environment jsdom
/**
 * The `etmf` surface hosts the trial master file section (surfaces/Etmf.tsx),
 * and the Vault's header button opens it.
 *
 * Until the eTMF is admitted to the Vault app the Vault may not call /api/etmf
 * (ci:launch-scope-api), so the section's one host is this page: the way back
 * to the project, the title, the section for the open project, an honest empty
 * state when none is open, the conversation the section asks AnA in, and what
 * AnA can see of it (the scope and the figures among it). The screen this file
 * used to be (a trial id typed by hand) is retired; what its three suites
 * pinned is pinned here and in vaultTrialMasterFile.test.tsx, and what it
 * showed is carried in the section (vaultTmfRestored.test.tsx,
 * vaultTmfUploadAndFile.test.tsx;
 * docs/evidence/D2-ETMF/2026-11-10-vault-section/README.md).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
import { Vault } from '../surfaces/Vault';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { PID, mockVaultApi, ok, props, vaultPayload } from './_vault-surface-fixtures';
import {
  ESSENTIAL, EXTENSION, NOT_RELEASED, PROTOCOL_DOC, STUDY, completenessOf, filing, json, refusal, resetTmf, tmf, tmfApi,
} from './_vault-tmf-fixtures';

let published: SurfaceContext | null = null;
function Probe() {
  published = useActiveSurfaceContext('etmf');
  return null;
}
const facts = () => (published?.facts ?? {}) as Record<string, unknown>;
const openProject = () => { (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-204' }; };
const onAsk = vi.fn();
function page() {
  const onNav = vi.fn();
  render(<><Etmf surface={{ id: 'etmf', label: 'Trial master file' } as never} onAsk={onAsk} onNav={onNav} segment="biotech" /><Probe /></>);
  return onNav;
}
const tmfCalls = () => H.apiRequest.mock.calls.filter(([, u]) => String(u).startsWith('/api/etmf') || String(u).startsWith('/api/study-design'));

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

describe('the page that hosts the trial master file', () => {
  it('with a project open: the way back, one title, and the section for that project’s study', async () => {
    openProject();
    const onNav = page();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Trial master file']);
    // The page is titled once: the section's own heading names what it lists.
    const section = screen.getByTestId('vault-tmf');
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('Records');
    expect((await within(section).findByTestId('vault-tmf-verdict')).getAttribute('data-verdict')).toBe('incomplete');
    expect(section.textContent).toContain('Of BX-204 in plaque psoriasis · Phase 2');
    expect(H.apiRequest.mock.calls.some(([m, u]) => m === 'GET' && u === `/api/study-design?program_id=${PID}`)).toBe(true);
    // Back to the project, by its name.
    fireEvent.click(screen.getByRole('button', { name: /BX-204/ }));
    expect(onNav).toHaveBeenCalledWith('project-home');
    // No trial id is typed: the study is the project's. The scope is the section's own two-option control.
    expect(screen.queryByLabelText('Trial identifier')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(within(section).getByRole('group', { name: 'Records checked' })).toBeTruthy();
  });

  it('the section asks AnA in the page’s conversation', async () => {
    openProject();
    page();
    await screen.findByTestId('vault-tmf-verdict');
    fireEvent.click(screen.getByRole('button', { name: /Ask AnA which gaps an inspector would raise/ }));
    expect(onAsk.mock.calls).toEqual([['Which trial master file gaps would an inspector raise for BX-204 in plaque psoriasis, and how do I close them?']]);
  });

  it('with no project open: says a trial master file belongs to a project’s study, offers Projects, and reads nothing', async () => {
    const onNav = page();
    const empty = screen.getByTestId('etmf-no-project');
    expect(empty.textContent).toMatch(/Open a project to see its trial master file/);
    expect(empty.textContent).toMatch(/A trial master file belongs to a study, and a study belongs to a project\./);
    expect(screen.queryByTestId('vault-tmf')).toBeNull();
    fireEvent.click(within(empty).getByRole('button', { name: 'Open Projects' }));
    expect(onNav).toHaveBeenCalledWith('projects');
    // Nothing is read, and nothing can be filed, without a project.
    expect(H.apiRequest).not.toHaveBeenCalled();
    await waitFor(() => expect(published?.summary).toMatch(/no project is open, so nothing is on screen\. This is not an empty trial master file\./));
    expect(published?.facts).toBeUndefined();
  });
});

describe('what AnA can see of the page is what the section read', () => {
  it('the study, the verdict as the server gave it, and the counts', async () => {
    openProject();
    page();
    await screen.findByTestId('vault-tmf-verdict');
    await waitFor(() => expect(facts().verdict).toBe('incomplete'));
    // The verdict line's sentence, then the figures as the screen shows them, then what is not assessed.
    expect(published?.summary).toBe(
      `Trial master file of BX-204 in plaque psoriasis, essential records. 1 of ${ESSENTIAL.length} essential records are filed. ${ESSENTIAL.length - 1} are missing. ` +
      `0 of 11 zones are complete; 1 of ${ESSENTIAL.length} essential records are filed; ${ESSENTIAL.length - 1} are open, 0 filed with no verified document. ` +
      'Timeliness and quality control are not assessed: no filing lag and no QC state is recorded for trial master file records.',
    );
    expect(screen.getByTestId('vault-tmf-figures').textContent?.replace(/\s+/g, ' '))
      .toBe(`Zones complete 0 of 11 · Essential records filed 1 of ${ESSENTIAL.length} · Open records ${ESSENTIAL.length - 1}, 0 filed with no verified document`);
    expect(facts()).toMatchObject({
      studyId: STUDY.studyId, study: 'BX-204 in plaque psoriasis', scope: 'essential', ready: false, basis: 'verified_documents',
      counts: { zoneCount: 11, totalRequired: ESSENTIAL.length, totalMissing: ESSENTIAL.length - 1 },
      figures: { zonesComplete: 0, zoneCount: 11, filed: 1, required: ESSENTIAL.length, open: ESSENTIAL.length - 1, unverified: 0 },
    });
    // What can be done here, the restored acts among it.
    expect(published?.availableActions?.join(' | ')).toMatch(/Switch between the essential records and all records/);
    expect(published?.availableActions?.join(' | ')).toMatch(/Upload a file from the person’s computer into this project’s Vault and file it/);
    expect(facts().zones).toHaveLength(11);
    // Missing records are named as the screen names them, capped.
    expect(facts().missing).toContainEqual({ zone: 1, code: 'monitoring_plan', name: 'Monitoring Plan' });
    expect(facts().missing).toHaveLength(20);
    // One read each: the page tells AnA from what the section read, and reads nothing itself.
    expect(tmfCalls().map(([, u]) => u).sort()).toEqual(
      [`/api/etmf/trials/${STUDY.studyId}/artifacts`, `/api/etmf/trials/${STUDY.studyId}/completeness?scope=essential`, `/api/study-design?program_id=${PID}`],
    );
  });

  /* The retired screen published `ready: null` as "NOT ready" until 2026-10-15
     (etmfReadinessNotDeterminedIsNotNotReady.test.tsx, deleted with it). */
  it('not determined is published as not determined, with the server’s null, never as missing or not ready', async () => {
    openProject();
    tmf.filings[STUDY.studyId] = ESSENTIAL.map((code, i) => ({
      ...filing(code, i < 2 ? 'https://archive.example.org/tmf/box-14' : `vault://${PROTOCOL_DOC}`, 1), id: `row-${i}`,
    }));
    page();
    await waitFor(() => expect(facts().verdict).toBe('undetermined'));
    expect(facts().ready).toBeNull();
    expect(published?.summary).toMatch(/essential records\. Not determined\. /);
    expect(published?.summary).not.toMatch(/are missing|not ready|Every essential record is filed/i);
  });

  it('the scope on screen is the scope AnA is told, with that scope’s figures and never the other’s', async () => {
    openProject();
    let answer!: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => { answer = resolve; });
    tmf.refuseWith.completeness = (studyId, scope) => (scope === 'all' ? pending : json(completenessOf(studyId, scope)));
    page();
    await waitFor(() => expect(facts().verdict).toBe('incomplete'));
    fireEvent.click(within(screen.getByTestId('vault-tmf-scope')).getByRole('button', { name: 'All records' }));
    // While all records are being read, AnA is told that, with no figure of the essential scope.
    await waitFor(() => expect(published?.summary).toBe('The trial master file of BX-204 in plaque psoriasis (all records) is being read; nothing on screen is final yet.'));
    expect(facts()).toEqual({ studyId: STUDY.studyId, study: 'BX-204 in plaque psoriasis', scope: 'all' });
    await act(async () => { answer(json(completenessOf(STUDY.studyId, 'all'))); });
    await waitFor(() => expect(facts().figures).toEqual({ zonesComplete: 0, zoneCount: 11, filed: 1, required: 41, open: 40, unverified: 0 }));
    expect(facts().scope).toBe('all');
    expect(published?.summary).toMatch(/^Trial master file of BX-204 in plaque psoriasis, all records\. 1 of 41 records are filed\. 40 are missing\. 0 of 11 zones are complete; 1 of 41 records are filed; 40 are open/);
    expect(published?.summary).not.toMatch(/essential/);
  });

  it('a read that checked nothing is published with no verdict and no figures', async () => {
    openProject();
    tmf.refuseWith.completeness = () => json({ ...completenessOf(), ready: true, zones: [], summary: { zoneCount: 0, zonesComplete: 0, totalRequired: 0, totalMissing: 0, totalUnverified: 0 } });
    page();
    await waitFor(() => expect(facts().verdict).toBe('not-assessed'));
    expect(facts().figures).toBeNull();
    expect(published?.summary).not.toMatch(/zones are complete/);
  });

  it('a refused read is published as that refusal, not as an empty or unready trial master file', async () => {
    openProject();
    tmf.refuseWith.completeness = () => { throw refusal(403, NOT_RELEASED); };
    page();
    await screen.findByTestId('vault-tmf-error');
    await waitFor(() => expect(published?.summary).toMatch(/^This part of the product is not in this release, so the trial master file was not read\./));
    expect(published?.summary).toMatch(/not because the trial master file is empty\.$/);
    expect(facts().verdict).toBeUndefined();
    expect(facts().ready).toBeUndefined();
    expect(facts().figures).toBeUndefined();
  });

  it('a project with no study, or with several and none chosen, is published as that', async () => {
    openProject();
    tmf.studies = [];
    page();
    await waitFor(() => expect(published?.summary).toMatch(/^The open project has no study, so it has no trial master file\./));
    cleanup();
    tmf.studies = [STUDY, EXTENSION];
    page();
    await waitFor(() => expect(published?.summary).toMatch(/^The open project has 2 studies and none is chosen on screen yet\./));
    fireEvent.change(await screen.findByTestId('vault-tmf-study'), { target: { value: EXTENSION.studyId } });
    await waitFor(() => expect(facts().studyId).toBe(EXTENSION.studyId));
    expect(completenessOf(EXTENSION.studyId).summary.totalMissing).toBe(ESSENTIAL.length);
    await waitFor(() => expect(published?.summary).toMatch(new RegExp(`^Trial master file of BX-204 long-term extension, essential records\\. 0 of ${ESSENTIAL.length} `)));
  });
});

describe('the Vault’s header button', () => {
  const openVault = async () => {
    openProject();
    mockVaultApi(H.apiRequest, () => ok(vaultPayload()));
    const vaultApi = H.apiRequest.getMockImplementation()!;
    H.apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => (await tmfApi(method, url, body)) ?? vaultApi(method, url, body));
    const p = props();
    render(<Vault {...p} />);
    await screen.findByRole('tablist', { name: 'Vault views' });
    return p;
  };

  it('is named "Trial master file" and opens the page that hosts it', async () => {
    const p = await openVault();
    // The founder did not recognise "Inspection readiness" as the trial master file (2026-11-10).
    expect(screen.queryByRole('button', { name: /Inspection readiness/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Trial master file/ }));
    expect(p.onNav).toHaveBeenCalledWith('etmf');
  });

  it('is not offered where that page is locked, and the Vault itself reads nothing of the trial master file', async () => {
    H.locked.add('etmf');
    await openVault();
    expect(screen.queryByRole('button', { name: /Trial master file/ })).toBeNull();
    // Until the eTMF is admitted to the Vault app, no Vault view may call /api/etmf (ci:launch-scope-api).
    for (const view of ['Required documents', 'Seals & fixity', 'Library']) fireEvent.click(screen.getByRole('tab', { name: view }));
    expect(screen.queryByTestId('vault-tmf')).toBeNull();
    expect(tmfCalls()).toHaveLength(0);
  });
});
