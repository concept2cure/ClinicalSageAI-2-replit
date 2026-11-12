// @vitest-environment jsdom
/**
 * Protocol workspace, IRB package tab: the IRB submission's own record.
 *
 * `docs/design/IRB_SUBMISSION.md` steps 4 and 5. Until 2026-11-12 the tab could
 * only read. It told a person to "create the IRB submission first" and to
 * "link the submission in the Submission Center first", and nothing in the
 * product could do either: `/api/irb`'s writes had no caller under `client/`.
 *
 * What each case exists to catch:
 *
 *   • NOT RECORDED IS NEVER SENT AS NO. A study fact has three answers. A form
 *     that posts `false` for a fact nobody answered records a sponsor's
 *     statement nobody made, and Form FDA 1572 drops out of what a board is
 *     told it needs.
 *   • "LEAVE AS IT IS" SENDS NOTHING, and taking an answer back sends null.
 *   • A BOARD'S DECISION IS NOT A STATUS A PERSON SETS HERE (D4): approved,
 *     modifications required, deferred and disapproved are not offered.
 *   • NOTHING IS DELIVERED TO A BOARD (D3): no word on the record says it was.
 *   • THE ENGINE'S SUGGESTED REVIEW PATHWAY IS NOT SHOWN (D4), although the
 *     read returns it.
 *   • A FAILED READ IS NOT "NO FINDINGS", and a check that could not run is
 *     listed as such, never folded into a clean result.
 *   • A VIEWER IS OFFERED NO WRITE.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { IrbPackageTab } from '../surfaces/IrbPackage';

const ok = (obj: unknown, status = 200) => ({ ok: true, status, json: async () => obj }) as Response;
const refuse = (status: number, code: string, message: string) =>
  ({ ok: false, status, json: async () => ({ error: { code, message } }) }) as Response;

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOC = { id: '41', title: 'A Phase 2 Study of LMN-201', shortTitle: 'LMN-201-201' };
const REASON = 'Recording the ethics submission for this study.';

const ROW = {
  id: 7, study_id: null, submission_id: null, protocol_number: 'LMN-201-201', title: 'LMN-201 ethics submission',
  review_type: null, risk_level: 'greater_than_minimal', is_single_irb: false, status: 'draft', approval_date: null, expiration_date: null,
  involves_vulnerable_populations: null, consent_waiver_requested: false,
  involves_children: false, is_ind_study: null, uses_phi: true, uses_recruitment_material: null,
};

const STANDING = {
  completeness: {
    findings: [{ severity: 'critical', message: 'No informed-consent document is present and no consent waiver is requested.', basis: '45 CFR 46.116 / 46.117' }],
    riskLevel: 'high',
    checksRun: ['an informed-consent document on file (draft or approved) or a waiver requested (45 CFR 46.116/46.117)', 'a single IRB of record for a multi-site study (45 CFR 46.114)'],
    notAssessed: ['additional safeguards documented where vulnerable populations are involved (45 CFR 46.111(b)): whether vulnerable populations are involved is not recorded'],
  },
  lifecycle: { approval: 'not_approved', continuingReview: 'unknown', expirationDate: null, expirationSource: 'none', daysToExpiration: null, undetermined: false, findings: [] },
  recommendedReview: { reviewType: 'full_board', rationale: 'Greater-than-minimal risk requires review by the convened IRB (45 CFR 46.108-109).' },
};

interface Options {
  rows?: unknown[];
  standing?: unknown;
  standingStatus?: number;
  submissionsStatus?: number;
  write?: (method: string, url: string, body: unknown) => Response | undefined;
}
const calls = () => apiRequest.mock.calls.map((c) => ({ method: c[0] as string, url: c[1] as string, body: c[2] as Record<string, unknown> | undefined }));
const writes = () => calls().filter((c) => c.method !== 'GET');

function route(opts: Options = {}) {
  let rows = opts.rows ?? [];
  const read = (url: string): Response => {
    if (url === '/api/irb/submissions') return ok(rows);
    if (url.endsWith('/package-manifest')) {
      const row = rows[0] as { id: number; submission_id: number | null };
      return ok({ irbSubmissionId: row.id, linkedSubmissionId: row.submission_id, manifest: { rows: [], counts: {}, readyToAssemble: false, unexpectedSlots: [] } });
    }
    if (url.endsWith('/completeness')) {
      return opts.standingStatus ? refuse(opts.standingStatus, 'INTERNAL', 'The lifecycle reader did not answer.') : ok(opts.standing ?? STANDING);
    }
    if (url.startsWith('/api/submissions')) {
      if (opts.submissionsStatus) return refuse(opts.submissionsStatus, 'INTERNAL', 'The submissions list did not answer.');
      return ok({ data: [{ id: 12, title: 'LMN-201 IND', programId: PROGRAM }, { id: 13, title: 'LMN-201 CTA', programId: PROGRAM }] });
    }
    return ok({});
  };
  const write = (method: string, url: string, body: unknown): Response => {
    const refused = opts.write?.(method, url, body);
    if (refused) return refused;
    if (method === 'POST') rows = [{ ...ROW, id: 9, title: (body as { title: string }).title }];
    if (url.endsWith('/link')) rows = [{ ...(rows[0] as object), submission_id: (body as { submissionId: number }).submissionId }];
    return ok({ id: method === 'POST' ? 9 : 7, actionId: 1 }, 201);
  };
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => (method === 'GET' ? read(url) : write(method, url, body)));
}

const onError = vi.fn();
const onToast = vi.fn();

function open(opts: Options = {}, props: { canWrite?: boolean; programId?: string | null } = {}) {
  route(opts);
  render(<IrbPackageTab doc={DOC} canWrite={props.canWrite ?? true} programId={props.programId === undefined ? PROGRAM : props.programId} onError={onError} onToast={onToast} />);
}

const pane = () => screen.getByRole('region', { name: 'IRB package' });
const dialog = () => screen.getByRole('dialog');
const choose = (group: RegExp, option: string) =>
  fireEvent.click(within(within(dialog()).getByRole('radiogroup', { name: group })).getByRole('radio', { name: option }));
const fill = (label: RegExp, value: string) => fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });
const submit = (name: string) => fireEvent.click(within(dialog()).getByRole('button', { name }));

beforeEach(() => { apiRequest.mockReset(); onError.mockReset(); onToast.mockReset(); });
afterEach(() => cleanup());

describe('IRB package tab — recording the IRB submission', () => {
  it('offers to record the submission where none exists, and posts only what the person answered', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Record the IRB submission' }));
    await within(dialog()).findByLabelText(/Risk level/);
    expect((within(dialog()).getByLabelText(/^Title/) as HTMLInputElement).value).toBe('A Phase 2 Study of LMN-201');

    fill(/Risk level/, 'greater_than_minimal');
    fill(/Submission Center submission/, '12');
    choose(/Runs under an IND/, 'Yes');
    choose(/Uses protected health information/, 'No');
    fill(/Reason for change/, REASON);
    submit('Record submission');

    await waitFor(() => expect(writes()).toHaveLength(1));
    const { method, url, body } = writes()[0];
    expect([method, url]).toEqual(['POST', '/api/irb/submissions']);
    expect(body).toEqual({
      protocolNumber: 'LMN-201-201', title: 'A Phase 2 Study of LMN-201', riskLevel: 'greater_than_minimal', submissionId: 12,
      isIndStudy: true, usesPhi: false, isSingleIrb: false, consentWaiverRequested: false, reason: REASON,
    });
    // The defect: a fact nobody answered posted as false.
    for (const unanswered of ['involvesChildren', 'usesRecruitmentMaterial', 'involvesVulnerablePopulations']) expect(body).not.toHaveProperty(unanswered);

    // The record on screen is the server's, read again: nothing was appended locally.
    expect(await within(pane()).findByRole('group', { name: 'IRB submission record' })).toBeTruthy();
    expect(onToast).toHaveBeenCalledWith('IRB submission 9 recorded.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('has no preselected risk level: an untouched form is refused before any request', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Record the IRB submission' }));
    await within(dialog()).findByLabelText(/Risk level/);
    fill(/Reason for change/, REASON);
    submit('Record submission');
    expect(writes()).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('says the server\'s refusal in its words, keeps the form, and records nothing on screen', async () => {
    open({ write: (m) => (m === 'POST' ? refuse(400, 'BAD_INPUT', 'Submission Center submission 12 was not found for this organization. Nothing was changed.') : undefined) });
    fireEvent.click(await screen.findByRole('button', { name: 'Record the IRB submission' }));
    await within(dialog()).findByLabelText(/Risk level/);
    fill(/Risk level/, 'minimal');
    fill(/Reason for change/, REASON);
    submit('Record submission');
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0]).toMatch(/was not found for this organization\. Nothing was changed\./);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(within(pane()).queryByRole('group', { name: 'IRB submission record' })).toBeNull();
    expect(onToast).not.toHaveBeenCalled();
  });

  it('offers a viewer no write, with or without a submission', async () => {
    open({}, { canWrite: false });
    await within(pane()).findByText(/No IRB submission is recorded/);
    expect(screen.queryByRole('button', { name: 'Record the IRB submission' })).toBeNull();
    cleanup();
    open({ rows: [ROW] }, { canWrite: false });
    const card = await within(pane()).findByRole('group', { name: 'IRB submission record' });
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('IRB package tab — the record', () => {
  it('shows each fact as recorded: yes, no, and not recorded', async () => {
    open({ rows: [ROW] });
    const card = await within(pane()).findByRole('group', { name: 'IRB submission record' });
    const row = (label: string) => within(card).getByText(label).closest('.pd-kv')?.textContent ?? '';
    expect(row('Runs under an IND')).toMatch(/not recorded$/);
    expect(row('Involves children')).toMatch(/no$/);
    expect(row('Uses protected health information')).toMatch(/yes$/);
    expect(row('Involves vulnerable populations')).toMatch(/not recorded$/);
    expect(row('Risk level')).toMatch(/greater than minimal risk$/);
    expect(row('Submission Center submission')).toMatch(/not linked$/);
  });

  it('records only the facts the person changed, and takes an answer back as null', async () => {
    open({ rows: [ROW] });
    fireEvent.click(await screen.findByRole('button', { name: 'Record study facts' }));
    // Each fact starts on "leave as it is", naming what is recorded now.
    expect(within(within(dialog()).getByRole('radiogroup', { name: /Involves children/ })).getByRole('radio', { name: 'Leave as it is (no)' }).getAttribute('aria-checked')).toBe('true');
    choose(/Runs under an IND/, 'Yes');
    choose(/Uses protected health information/, 'Not recorded');
    fill(/Reason for change/, REASON);
    submit('Record facts');
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: 'PATCH', url: '/api/irb/submissions/7/context', body: { isIndStudy: true, usesPhi: null, reason: REASON } });
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('Study facts recorded.'));
  });

  it('sends nothing when every fact was left as it is', async () => {
    open({ rows: [ROW] });
    fireEvent.click(await screen.findByRole('button', { name: 'Record study facts' }));
    fill(/Reason for change/, REASON);
    submit('Record facts');
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Nothing was changed: every fact was left as it is.'));
    expect(writes()).toHaveLength(0);
  });

  it('offers the statuses a person sets, never a board\'s decision or the present status', async () => {
    open({ rows: [ROW] });
    fireEvent.click(await screen.findByRole('button', { name: 'Change status' }));
    const options = Array.from((within(dialog()).getByLabelText(/^Status/) as HTMLSelectElement).options).map((o) => o.value).filter(Boolean);
    expect(options).toEqual(['submitted', 'under_review', 'suspended', 'closed', 'expired']);
    fill(/^Status/, 'submitted');
    fill(/Reason for change/, REASON);
    submit('Record status');
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: 'PATCH', url: '/api/irb/submissions/7/status', body: { status: 'submitted', reason: REASON } });
    // D3: the form says where delivery happens, and claims none.
  });

  it('links an unlinked submission to one of the project\'s submissions, and then offers no second link', async () => {
    open({ rows: [ROW] });
    fireEvent.click(await screen.findByRole('button', { name: 'Link to a submission' }));
    const select = await within(dialog()).findByLabelText(/Submission Center submission/) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Select…', 'LMN-201 IND', 'LMN-201 CTA']);
    expect(calls().some((c) => c.url === `/api/submissions?programId=${PROGRAM}`)).toBe(true);
    fill(/Submission Center submission/, '13');
    fill(/Reason for change/, REASON);
    submit('Link submission');
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: 'PATCH', url: '/api/irb/submissions/7/link', body: { submissionId: 13, reason: REASON } });
    await waitFor(() => expect(within(pane()).getByText('Submission Center submission').closest('.pd-kv')?.textContent).toMatch(/submission 13$/));
    expect(screen.queryByRole('button', { name: 'Link to a submission' })).toBeNull();
  });

  it('says so when the project\'s submissions could not be read, and offers none', async () => {
    open({ rows: [ROW], submissionsStatus: 503 });
    fireEvent.click(await screen.findByRole('button', { name: 'Link to a submission' }));
    expect(await within(dialog()).findByText(/could not be read \(The submissions list did not answer\.\)/)).toBeTruthy();
    expect(Array.from((within(dialog()).getByLabelText(/Submission Center submission/) as HTMLSelectElement).options).map((o) => o.value)).toEqual(['']);
  });
});

describe('IRB package tab — what the record supports', () => {
  it('shows the checks\' findings with their basis, and lists a check that could not run as that', async () => {
    open({ rows: [ROW] });
    const checks = await within(pane()).findByRole('group', { name: 'Record checks' });
    expect(checks.textContent).toContain('A critical finding is open.');
    expect(checks.textContent).toContain('No informed-consent document is present and no consent waiver is requested.');
    expect(checks.textContent).toContain('45 CFR 46.116 / 46.117');
    expect(checks.textContent).toContain('2 ran, 1 could not');
    const skipped = within(checks).getByRole('group', { name: 'Checks that could not run' });
    expect(skipped.textContent).toContain('whether vulnerable populations are involved is not recorded');
    expect(checks.textContent).not.toContain('%');
  });

  it('does not read a check that could not run as a clean result', async () => {
    open({ rows: [ROW], standing: { ...STANDING, completeness: { ...STANDING.completeness, findings: [], riskLevel: 'undetermined' } } });
    const checks = await within(pane()).findByRole('group', { name: 'Record checks' });
    expect(checks.textContent).toContain('This is not a clean result.');
    expect(checks.textContent).not.toMatch(/none raised/);
  });

  it('states the approval from the record in words, and where the expiration came from', async () => {
    open({ rows: [{ ...ROW, status: 'approved' }], standing: { ...STANDING, lifecycle: {
      approval: 'expiring_soon', continuingReview: 'required', expirationDate: '2026-12-01', expirationSource: 'computed', daysToExpiration: 19, undetermined: false,
      findings: [{ code: 'IRB-LC-002', severity: 'major', basis: '45 CFR 46.109(e)', message: 'Approval expires in 19 days.', remediation: 'Submit the continuing review now.' }],
    } } });
    const approval = await within(pane()).findByRole('group', { name: 'Approval' });
    expect(approval.textContent).toContain('approved, expiring soon');
    expect(approval.textContent).toContain('2026-12-01 (computed from the approval date)');
    expect(approval.textContent).toContain('19');
    expect(approval.textContent).toContain('Approval expires in 19 days. Submit the continuing review now.');
    expect(approval.textContent).toContain('45 CFR 46.109(e)');
  });

  it('says the read failed, and never draws that as no findings', async () => {
    open({ rows: [ROW], standingStatus: 500 });
    const alert = await within(pane()).findByRole('alert');
    expect(alert.textContent).toMatch(/could not be read: The lifecycle reader did not answer\./);
    expect(alert.textContent).toMatch(/not a record with no findings/);
    expect(within(pane()).queryByRole('group', { name: 'Record checks' })).toBeNull();
    expect(within(pane()).queryByRole('group', { name: 'Approval' })).toBeNull();
  });

  it('claims no delivery (D3) and shows no review pathway (D4), though the read returns one', async () => {
    open({ rows: [{ ...ROW, status: 'submitted' }] });
    await within(pane()).findByRole('group', { name: 'Record checks' });
    const text = pane().textContent ?? '';
    expect(text).toContain('recorded as submitted');
    expect(text).not.toMatch(/transmitted|sent to the IRB|delivered to/i);
    expect(text).not.toMatch(/full board|full_board|convened|expedited|exempt/i);
  });
});
