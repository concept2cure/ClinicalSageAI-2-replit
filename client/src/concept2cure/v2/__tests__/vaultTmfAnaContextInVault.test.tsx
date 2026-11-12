// @vitest-environment jsdom
/**
 * What AnA can see of the trial master file in the Vault (eTMF admission, 2026-11-12).
 *
 * The section lives in the Vault's Required documents view, and the Vault tells AnA what it read, as the eTMF's page
 * did while it hosted the section: the study, the verdict as the server gave it, the counts and figures of the scope
 * on screen, and a refusal or an unread state as that. These six cases moved here from
 * etmfHostsTrialMasterFile.test.tsx with the section; their expectations are unchanged. They read the Vault's published
 * context: `facts.trialMasterFile` and its summary while Required documents is open, and the section's acts appended to
 * the Vault's.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: H.apiRequest }));
vi.mock('../surfaces/VaultViewOnly', async (original) => ({ ...(await original<typeof import('../surfaces/VaultViewOnly')>()), useVaultCanWrite: () => true }));

import { Vault } from '../surfaces/Vault';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { PID, mockVaultApi, ok, props, vaultPayload } from './_vault-surface-fixtures';
import {
  ESSENTIAL, EXTENSION, NOT_RELEASED, PROTOCOL_DOC, STUDY, completenessOf, filing, json, refusal, resetTmf, tmf, tmfApi,
} from './_vault-tmf-fixtures';

let published: SurfaceContext | null = null;
function Probe() {
  published = useActiveSurfaceContext('vault');
  return null;
}
const told = () => ((published?.facts ?? {}) as { trialMasterFile?: Record<string, unknown> | null }).trialMasterFile ?? null;
const tmfSummary = () => told()?.summary as string | undefined;
const facts = () => Object.fromEntries(Object.entries(told() ?? {}).filter(([key]) => key !== 'summary'));
const publishedActions = () => published?.availableActions ?? [];
const tmfCalls = () => H.apiRequest.mock.calls.filter(([, u]) => String(u).startsWith('/api/etmf') || String(u).startsWith('/api/study-design'));

async function openRequired() {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-204' };
  mockVaultApi(H.apiRequest, () => ok(vaultPayload()));
  const vaultApi = H.apiRequest.getMockImplementation()!;
  H.apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => (await tmfApi(method, url, body)) ?? vaultApi(method, url, body));
  render(<><Vault {...props()} /><Probe /></>);
  await screen.findByRole('tablist', { name: 'Vault views' });
  fireEvent.click(screen.getByRole('tab', { name: 'Required documents' }));
}

beforeEach(() => {
  published = null;
  resetTmf();
  H.apiRequest.mockReset();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

it('with Required documents closed, the Vault tells AnA nothing of the trial master file', async () => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-204' };
  mockVaultApi(H.apiRequest, () => ok(vaultPayload()));
  render(<><Vault {...props()} /><Probe /></>);
  await screen.findByRole('tablist', { name: 'Vault views' });
  await waitFor(() => expect(published?.summary).toMatch(/^Document vault/));
  expect(told()).toBeNull();
  expect(tmfCalls()).toHaveLength(0);
});

describe('what AnA can see of the Vault’s trial master file is what the section read', () => {
  it('the study, the verdict as the server gave it, and the counts', async () => {
    await openRequired();
    await screen.findByTestId('vault-tmf-verdict');
    await waitFor(() => expect(facts().verdict).toBe('incomplete'));
    // The verdict line's sentence, then the figures as the screen shows them, then what is not assessed.
    expect(tmfSummary()).toBe(
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
    expect(publishedActions().join(' | ')).toMatch(/Switch between the essential records and all records/);
    expect(publishedActions().join(' | ')).toMatch(/Upload a file from the person’s computer into this project’s Vault and file it/);
    expect(facts().zones).toHaveLength(11);
    // Missing records are named as the screen names them, capped.
    expect(facts().missing).toContainEqual({ zone: 1, code: 'monitoring_plan', name: 'Monitoring Plan' });
    expect(facts().missing).toHaveLength(20);
    // One read each: the Vault tells AnA from what the section read, and reads nothing of it itself.
    expect(tmfCalls().map(([, u]) => u).sort()).toEqual(
      [`/api/etmf/trials/${STUDY.studyId}/artifacts`, `/api/etmf/trials/${STUDY.studyId}/completeness?scope=essential`, `/api/study-design?program_id=${PID}`],
    );
  });

  /* The retired screen published `ready: null` as "NOT ready" until 2026-10-15
     (etmfReadinessNotDeterminedIsNotNotReady.test.tsx, deleted with it). */
  it('not determined is published as not determined, with the server’s null, never as missing or not ready', async () => {
    tmf.filings[STUDY.studyId] = ESSENTIAL.map((code, i) => ({
      ...filing(code, i < 2 ? 'https://archive.example.org/tmf/box-14' : `vault://${PROTOCOL_DOC}`, 1), id: `row-${i}`,
    }));
    await openRequired();
    await waitFor(() => expect(facts().verdict).toBe('undetermined'));
    expect(facts().ready).toBeNull();
    expect(tmfSummary()).toMatch(/essential records\. Not determined\. /);
    expect(tmfSummary()).not.toMatch(/are missing|not ready|Every essential record is filed/i);
  });

  it('the scope on screen is the scope AnA is told, with that scope’s figures and never the other’s', async () => {
    let answer!: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => { answer = resolve; });
    tmf.refuseWith.completeness = (studyId, scope) => (scope === 'all' ? pending : json(completenessOf(studyId, scope)));
    await openRequired();
    await waitFor(() => expect(facts().verdict).toBe('incomplete'));
    fireEvent.click(within(screen.getByTestId('vault-tmf-scope')).getByRole('button', { name: 'All records' }));
    // While all records are being read, AnA is told that, with no figure of the essential scope.
    await waitFor(() => expect(tmfSummary()).toBe('The trial master file of BX-204 in plaque psoriasis (all records) is being read; nothing on screen is final yet.'));
    expect(facts()).toEqual({ studyId: STUDY.studyId, study: 'BX-204 in plaque psoriasis', scope: 'all' });
    await act(async () => { answer(json(completenessOf(STUDY.studyId, 'all'))); });
    await waitFor(() => expect(facts().figures).toEqual({ zonesComplete: 0, zoneCount: 11, filed: 1, required: 41, open: 40, unverified: 0, notApplicable: 0 }));
    expect(facts().scope).toBe('all');
    expect(tmfSummary()).toMatch(/^Trial master file of BX-204 in plaque psoriasis, all records\. 1 of 41 records are filed\. 40 are missing\. 0 of 11 zones are complete; 1 of 41 records are filed; 40 are open/);
    expect(tmfSummary()).not.toMatch(/essential/);
  });

  it('a read that checked nothing is published with no verdict and no figures', async () => {
    tmf.refuseWith.completeness = () => json({ ...completenessOf(), ready: true, zones: [], summary: { zoneCount: 0, zonesComplete: 0, totalRequired: 0, totalMissing: 0, totalUnverified: 0 } });
    await openRequired();
    await waitFor(() => expect(facts().verdict).toBe('not-assessed'));
    expect(facts().figures).toBeNull();
    expect(tmfSummary()).not.toMatch(/zones are complete/);
  });

  it('a refused read is published as that refusal, not as an empty or unready trial master file', async () => {
    tmf.refuseWith.completeness = () => { throw refusal(403, NOT_RELEASED); };
    await openRequired();
    await screen.findByTestId('vault-tmf-error');
    await waitFor(() => expect(tmfSummary()).toMatch(/^This part of the product is not in this release, so the trial master file was not read\./));
    expect(tmfSummary()).toMatch(/not because the trial master file is empty\.$/);
    expect(facts().verdict).toBeUndefined();
    expect(facts().ready).toBeUndefined();
    expect(facts().figures).toBeUndefined();
  });

  it('a project with no study, or with several and none chosen, is published as that', async () => {
    tmf.studies = [];
    await openRequired();
    await waitFor(() => expect(tmfSummary()).toMatch(/^The open project has no study, so it has no trial master file\./));
    cleanup();
    tmf.studies = [STUDY, EXTENSION];
    await openRequired();
    await waitFor(() => expect(tmfSummary()).toMatch(/^The open project has 2 studies and none is chosen on screen yet\./));
    fireEvent.change(await screen.findByTestId('vault-tmf-study'), { target: { value: EXTENSION.studyId } });
    await waitFor(() => expect(facts().studyId).toBe(EXTENSION.studyId));
    expect(completenessOf(EXTENSION.studyId).summary.totalMissing).toBe(ESSENTIAL.length);
    await waitFor(() => expect(tmfSummary()).toMatch(new RegExp(`^Trial master file of BX-204 long-term extension, essential records\\. 0 of ${ESSENTIAL.length} `)));
  });
});

