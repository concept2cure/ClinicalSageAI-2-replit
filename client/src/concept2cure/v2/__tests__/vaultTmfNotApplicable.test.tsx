// @vitest-environment jsdom
/**
 * "Not applicable", with a reason, in the trial master file section (founder decision P-124 item 5, 2026-11-10:
 * carried onto the deployed store before admission). A study to which an essential record does not apply could
 * otherwise never read complete.
 *
 * What is pinned:
 *   - a record that is missing offers "Not applicable…" to a role that may write the Vault; the form asks why, and
 *     sends the declaration with that reason and no document;
 *   - a declared record says so on its row with the reason, who declared it and when, is counted as neither filed
 *     nor missing, and the verdict, the figures and the zone line say how many were declared;
 *   - it is withdrawn with a reason ("Withdraw"), and a document can still be filed against it, which ends it;
 *   - a filed record is not offered the declaration, and the server's refusal of one is said in the form;
 *   - a view-only role is offered none of it.
 * The transport is the small in-memory server of _vault-tmf-fixtures.ts, whose verdict is the service's own.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({ apiRequest: vi.fn(), canWrite: true }));
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: H.apiRequest }));
vi.mock('../surfaces/VaultViewOnly', async (original) => ({ ...(await original<typeof import('../surfaces/VaultViewOnly')>()), useVaultCanWrite: () => H.canWrite }));

import { VaultTrialMasterFile } from '../surfaces/VaultTrialMasterFile';
import { PID } from './_vault-surface-fixtures';
import { BASE, DECLARER, ESSENTIAL, STUDY, filing, json, resetTmf, tmf, tmfApi } from './_vault-tmf-fixtures';

const WHY = 'No investigational product is imported for this single-country study.';
const section = () => render(<VaultTrialMasterFile projectId={PID} active />);
const verdict = () => screen.findByTestId('vault-tmf-verdict');
const row = (code: string) => screen.getByTestId(`vault-tmf-record-${code}`);
const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();
const posts = () => H.apiRequest.mock.calls.filter(([m, u]) => m === 'POST' && u === `${BASE}/artifacts`);

beforeEach(() => {
  H.canWrite = true;
  resetTmf();
  H.apiRequest.mockReset();
  H.apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => (await tmfApi(method, url, body)) ?? json({}));
});
afterEach(cleanup);

describe('declaring a record not applicable to the study', () => {
  it('a missing record offers it; the form asks why, and sends the declaration with no document', async () => {
    section();
    await verdict();
    const act = within(row('monitoring_plan')).getByRole('button', { name: 'Declare Monitoring Plan not applicable to this study' });
    expect(act.textContent).toBe('Not applicable…');
    fireEvent.click(act);
    const form = screen.getByTestId('vault-tmf-declare-monitoring_plan');
    const go = within(form).getByRole('button', { name: 'Declare not applicable' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Why Monitoring Plan does not apply to this study/), { target: { value: 'short' } });
    expect(go.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Why Monitoring Plan does not apply to this study/), { target: { value: WHY } });
    fireEvent.click(go);
    await waitFor(() => expect(screen.getByTestId('vault-tmf-note').textContent).toBe(
      'Monitoring Plan is declared not applicable to this study. It is no longer counted as missing. Your reason is recorded on the record and in the audit trail.'));
    expect(posts().map(([, , body]) => body)).toEqual([{ artifactCode: 'monitoring_plan', notApplicable: true, reason: WHY }]);
  });

  it('a declared record says why, who and when, and is counted as neither filed nor missing', async () => {
    tmf.filings[STUDY.studyId] = [filing('protocol', 'vault://33333333-3333-4333-8333-333333333333', 1),
      { ...filing('monitoring_plan', null, 2), notApplicableReason: WHY, filedByName: DECLARER }];
    section();
    const said = await verdict();
    const required = ESSENTIAL.length - 1;
    expect(said.textContent).toBe(`1 of ${required} essential records are filed. ${required - 1} are missing. 1 is declared not applicable to this study.`);
    expect(text(screen.getByTestId('vault-tmf-figures'))).toContain(`Essential records filed 1 of ${required}`);
    expect(text(screen.getByTestId('vault-tmf-figures'))).toContain('Not applicable 1');
    const declared = row('monitoring_plan');
    expect(declared.getAttribute('data-state')).toBe('not_applicable');
    // The reason ends its own sentence, so no second full stop follows the quotation.
    expect(text(declared)).toContain(`Not applicable to this study: “${WHY}” Declared by ${DECLARER} on 2026-11-02.`);
    expect(text(screen.getByTestId('vault-tmf-zone-1'))).toMatch(/of \d+ filed · 1 not applicable$/);
    // Withdraw it, or file a document against it; it is not "removed" as a filing is.
    expect(within(declared).getByRole('button', { name: 'Withdraw the declaration that Monitoring Plan does not apply' }).textContent).toBe('Withdraw');
    expect(within(declared).getByRole('button', { name: 'File a document as Monitoring Plan' })).toBeTruthy();
    expect(within(declared).queryByRole('button', { name: /^Remove the filing/ })).toBeNull();
    expect(within(declared).queryByRole('button', { name: /^Declare/ })).toBeNull();
    // The package shown as a document says it too.
    expect(text(screen.getByTestId('vault-tmf-package-figures'))).toContain('Not applicable 1');
    expect(text(screen.getByTestId('vault-tmf-package-zones'))).toContain('1 not applicable');
  });

  it('is withdrawn with a reason, and the record is missing again', async () => {
    tmf.filings[STUDY.studyId] = [{ ...filing('monitoring_plan', null, 2), notApplicableReason: WHY, filedByName: DECLARER }];
    section();
    await verdict();
    fireEvent.click(within(row('monitoring_plan')).getByRole('button', { name: 'Withdraw the declaration that Monitoring Plan does not apply' }));
    const form = screen.getByTestId('vault-tmf-remove-monitoring_plan');
    fireEvent.change(within(form).getByLabelText(/Reason for withdrawing the declaration that Monitoring Plan does not apply/), { target: { value: 'The plan applies after amendment 2.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Withdraw the declaration' }));
    await waitFor(() => expect(screen.getByTestId('vault-tmf-note').textContent).toBe(
      'The declaration that Monitoring Plan does not apply was withdrawn. It is required again. Your reason is recorded with the withdrawal.'));
    expect(H.apiRequest).toHaveBeenCalledWith('DELETE', `/api/etmf/artifacts/${encodeURIComponent(filing('monitoring_plan', null, 2).id)}`, { reason: 'The plan applies after amendment 2.' });
    await waitFor(() => expect(row('monitoring_plan').getAttribute('data-state')).toBe('missing'));
  });

  it('filing a document against a declared record says it ends the declaration', async () => {
    tmf.filings[STUDY.studyId] = [{ ...filing('monitoring_plan', null, 2), notApplicableReason: WHY, filedByName: DECLARER }];
    section();
    await verdict();
    fireEvent.click(within(row('monitoring_plan')).getByRole('button', { name: 'File a document as Monitoring Plan' }));
    expect(screen.getByTestId('vault-tmf-file-monitoring_plan').textContent)
      .toContain('Filing a document ends the declaration that Monitoring Plan does not apply to this study. The declaration stays in the audit trail.');
  });

  it('a filed record is not offered it, and a refusal from the server is said in the form', async () => {
    section();
    await verdict();
    expect(within(row('protocol')).queryByRole('button', { name: /^Declare/ })).toBeNull();
    // Filed between the read and the declaration: the server refuses, nothing changes, and the form says why.
    fireEvent.click(within(row('monitoring_plan')).getByRole('button', { name: 'Declare Monitoring Plan not applicable to this study' }));
    tmf.filings[STUDY.studyId] = [...tmf.filings[STUDY.studyId], filing('monitoring_plan', 'vault://22222222-2222-4222-8222-222222222222', 3)];
    const form = screen.getByTestId('vault-tmf-declare-monitoring_plan');
    fireEvent.change(within(form).getByLabelText(/Why Monitoring Plan does not apply/), { target: { value: WHY } });
    fireEvent.click(within(form).getByRole('button', { name: 'Declare not applicable' }));
    const alert = await within(form).findByRole('alert');
    expect(alert.textContent).toMatch(/^Nothing was declared\. A document is filed for this record\. Remove that filing, with its reason, before declaring the record not applicable\./);
  });

  it('a view-only role is offered none of it', async () => {
    H.canWrite = false;
    tmf.filings[STUDY.studyId] = [{ ...filing('monitoring_plan', null, 2), notApplicableReason: WHY, filedByName: DECLARER }];
    section();
    await verdict();
    expect(screen.queryAllByRole('button', { name: /^Declare|^Withdraw/ })).toHaveLength(0);
    expect(text(row('monitoring_plan'))).toContain(`Not applicable to this study: “${WHY}” Declared by ${DECLARER}`);
    expect(screen.getByTestId('vault-tmf-view-only').textContent).toMatch(/declare a record not applicable/);
  });
});
