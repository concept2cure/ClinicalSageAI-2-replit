// @vitest-environment jsdom
/**
 * "Record review" on the Audit & compliance reports surface (P1-25 audit-trail
 * review, P1-43 access review; ADR-0014 §8).
 *
 * Driven through the real surface and the real signing dialog (the shared
 * EsignModal), with the transport replaced:
 *
 *   - only a member who may run reports is offered the action, and nothing is
 *     read until it is opened;
 *   - the status of each kind is the server's sentence, with "No … review
 *     recorded" and no date when there is none, and a failed read is an error;
 *   - a member whose role does not sign is told so, and offered no form;
 *   - an access review's lines are the privileged accounts of the user access
 *     review run on the screen; the draft names that sealed run, and the
 *     signature is sent with meaning `review`, the reason and the password;
 *   - a refusal is shown in the dialog with "Nothing was signed", and no
 *     success is claimed;
 *   - fix round (DP-69): an audit trail review names the integrity attestation
 *     run on the screen and is not signed without one, and a review's period
 *     starts the day after the last signed review of its kind ended.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiCall = vi.hoisted(() => vi.fn());
vi.mock('../apiCall', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../apiCall')>()),
  apiCall,
}));
const auth = vi.hoisted(() => ({ user: { id: 3, displayName: 'Dana Reyes', email: 'dana@example.com', mfaEnabled: false } }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => auth.user,
}));

import { ComplianceReports } from '../surfaces/ComplianceReports';
import { CATALOG, HASH, MANIFEST, exportBody, fail, integrityData, ok, runSelected, selectReport } from './_compliance-reports-fixtures';

const REASON = 'Quarterly access review for Q3';
const ACCESS_DATA = {
  report: { id: 'access-review', title: 'User access review', version: 1 },
  organizationId: 7,
  period: { from: null, to: '2026-10-01', kind: 'as-of' },
  generatedAt: '2026-10-01T09:00:00Z',
  chain: { ok: null, scope: 'not-checked', reason: 'Not checked.' },
  sections: [
    {
      key: 'privileged',
      title: 'Privileged accounts',
      columns: [{ key: 'user_id', label: 'User id' }, { key: 'name', label: 'Name' }, { key: 'org_role', label: 'Role' }],
      rows: [
        { user_id: 11, name: 'Ada Owner', email: 'ada@example.invalid', org_role: 'owner' },
        { user_id: 12, name: 'Bo Admin', email: 'bo@example.invalid', org_role: 'admin' },
      ],
      rowCount: 2,
      truncated: false,
    },
  ],
  notRecorded: [],
};
const NONE = { state: 'none', latest: null };
const CURRENT = {
  state: 'current',
  latest: { id: 4, periodStart: '2026-07-01', periodEnd: '2026-09-30', signedAt: '2026-09-30T10:00:00Z', reviewerName: 'Ada Owner', nextDue: '2026-12-30', signatureId: 9 },
};
const reviews = (over: Record<string, unknown> = {}) => ({ success: true, canSign: true, status: { access: NONE, audit_trail: CURRENT }, reviews: [], ...over });

type Call = { method: string; url: string; body?: unknown };
let calls: Call[];
let reply: (c: Call) => ReturnType<typeof ok>;
const posted = (url: string) => calls.filter((c) => c.method === 'POST' && c.url === url).map((c) => c.body);

function defaultReply(c: Call) {
  if (c.url === '/api/audit/reports') return ok(CATALOG);
  if (c.url.startsWith('/api/audit/reports/access-review')) return ok(exportBody(ACCESS_DATA, { ...MANIFEST, exportId: 'CR-ACCESS-1' }));
  if (c.url === '/api/audit/reviews' && c.method === 'GET') return ok(reviews());
  if (c.url === '/api/audit/reviews' && c.method === 'POST') return ok({ success: true, review: { id: 12, status: 'draft' } });
  if (c.url === '/api/audit/reviews/12/sign') {
    return ok({ review: { id: 12, status: 'signed', contentHash: 'c'.repeat(64) }, signatureId: 31, signedAt: '2026-10-01T12:00:00.000Z', meaning: 'review' });
  }
  return fail(404, {});
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  calls = [];
  reply = defaultReply;
  apiCall.mockReset();
  apiCall.mockImplementation(async (method: string, url: string, body?: unknown) => {
    const c = { method, url, body };
    calls.push(c);
    return reply(c);
  });
  // The dialog pre-checks the password at /api/esignature/verify-password.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) })));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mountSurface() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const props = { surface: { id: 'compliance-reports' }, onAsk: () => {}, onNav: () => {}, segment: 'biotech' } as unknown as React.ComponentProps<typeof ComplianceReports>;
  return render(
    <QueryClientProvider client={client}>
      <ComplianceReports {...props} />
    </QueryClientProvider>,
  );
}
async function openReviews() {
  // Found outside act: inside it, the catalog's own update would wait for the act to end.
  const button = await screen.findByRole('button', { name: 'Record review' });
  await act(async () => {
    fireEvent.click(button);
  });
}
async function runAccessReview() {
  await selectReport(/User access review/);
  await runSelected();
  await screen.findByText('Bo Admin');
}
function fillAccessForm() {
  fireEvent.change(screen.getByLabelText('What the review covered'), { target: { value: 'Privileged accounts of the organisation.' } });
  fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'One administrator reduced to member.' } });
  fireEvent.change(screen.getByLabelText('Decision for Ada Owner, ada@example.invalid'), { target: { value: 'keep' } });
  fireEvent.change(screen.getByLabelText('Decision for Bo Admin, bo@example.invalid'), { target: { value: 'reduce' } });
  fireEvent.change(screen.getByLabelText('Role Bo Admin, bo@example.invalid keeps'), { target: { value: 'member' } });
  fireEvent.change(screen.getByLabelText('Change that carried out the decision for Bo Admin, bo@example.invalid'), { target: { value: 'Ledger entry 811' } });
}
/** The meanings the dialog offers, read before anything is entered. */
async function offeredMeanings(): Promise<string[]> {
  fireEvent.click(screen.getByRole('button', { name: 'Sign review…' }));
  const dialog = await screen.findByRole('dialog');
  return within(dialog).getAllByRole('radio').map((r) => (r.textContent ?? '').replace(/You .*/, '').trim());
}
async function signInDialog(password = 'correct horse') {
  if (!screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Sign review…' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: password } });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
  });
  return dialog;
}

describe('Record review — who is offered it, and what it reads', () => {
  it('a member who cannot run reports is not offered it', async () => {
    reply = (c) => (c.url === '/api/audit/reports' ? ok({ ...CATALOG, canRun: false }) : defaultReply(c));
    mountSurface();
    await screen.findByText('User access review');
    expect(screen.queryByRole('button', { name: 'Record review' })).toBeNull();
  });

  it('reads nothing until opened, then states each kind as the server did, with no date for none', async () => {
    mountSurface();
    await screen.findByRole('button', { name: 'Record review' });
    expect(calls.some((c) => c.url === '/api/audit/reviews')).toBe(false);
    await openReviews();
    const list = await screen.findByRole('list', { name: 'Latest signed reviews' });
    expect(list.textContent).toContain('No access review recorded.');
    expect(list.textContent).toContain('Audit trail review: signed 2026-09-30 by Ada Owner, for 2026-07-01 to 2026-09-30. Next due by 2026-12-30.');
  });

  it('says when the latest review is overdue', async () => {
    reply = (c) => (c.url === '/api/audit/reviews' && c.method === 'GET' ? ok(reviews({ status: { access: { ...CURRENT, state: 'overdue' }, audit_trail: NONE } })) : defaultReply(c));
    mountSurface();
    await openReviews();
    expect((await screen.findByRole('list', { name: 'Latest signed reviews' })).textContent).toContain('User access review: overdue.');
  });

  it('a failed read is an error with a retry, never "no review recorded"', async () => {
    reply = (c) => (c.url === '/api/audit/reviews' ? fail(500, { success: false, error: { code: 'INTERNAL', message: 'The request failed.' } }) : defaultReply(c));
    mountSurface();
    await openReviews();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn.t load the review records/);
    expect(screen.queryByText(/No access review recorded/)).toBeNull();
  });

  it('a member whose role does not sign is told so, and offered no form', async () => {
    reply = (c) => (c.url === '/api/audit/reviews' && c.method === 'GET' ? ok(reviews({ canSign: false })) : defaultReply(c));
    mountSurface();
    await openReviews();
    expect(await screen.findByText(/your role does not carry signing authority/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign review…' })).toBeNull();
  });
});

describe('Record review — an access review, signed', () => {
  it('names the run, takes a decision per privileged account, and signs with meaning review', async () => {
    mountSurface();
    await runAccessReview();
    await openReviews();
    fillAccessForm();
    expect(await offeredMeanings()).toEqual(['Review']);
    const dialog = await signInDialog();
    await waitFor(() => expect(posted('/api/audit/reviews/12/sign')).toHaveLength(1));
    expect(posted('/api/audit/reviews')).toEqual([
      {
        kind: 'access',
        periodStart: '2026-07-03',
        periodEnd: '2026-10-01',
        scope: { description: 'Privileged accounts of the organisation.', reportExportId: 'CR-ACCESS-1', reportDataHash: HASH },
        outcome: 'One administrator reduced to member.',
        decisions: [
          { userId: 11, role: 'owner', decision: 'keep' },
          { userId: 12, role: 'admin', decision: 'reduce', reducedTo: 'member', changeReference: 'Ledger entry 811' },
        ],
      },
    ]);
    expect(posted('/api/audit/reviews/12/sign')).toEqual([{ reason: REASON, meaning: 'review', password: 'correct horse' }]);
    await act(async () => {
      fireEvent.click(await within(dialog).findByRole('button', { name: 'Done' }));
    });
    expect((await screen.findByRole('status')).textContent).toBe(
      'Signed. Review record 12 is recorded with content hash cccccccccccc…, and the reports name it from now on.',
    );
  });

  it('will not open the dialog until every account has a decision', async () => {
    mountSurface();
    await runAccessReview();
    await openReviews();
    fireEvent.change(screen.getByLabelText('What the review covered'), { target: { value: 'Privileged accounts.' } });
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'Reviewed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign review…' }));
    expect(screen.getByText('Choose keep, reduce or remove for every account.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('a refused signature is shown in the dialog with nothing signed, and no success is claimed', async () => {
    reply = (c) =>
      c.url === '/api/audit/reviews/12/sign'
        ? fail(401, { error: { code: 'PASSWORD_VERIFICATION_FAILED', message: 'The password was not verified. Nothing was signed.' } })
        : defaultReply(c);
    mountSurface();
    await runAccessReview();
    await openReviews();
    fillAccessForm();
    const dialog = await signInDialog();
    expect((await within(dialog).findByRole('alert')).textContent).toContain('The password was not verified. Nothing was signed.');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Record review — an audit trail review (fix round, DP-69)', () => {
  const ATI_RUN = { ...MANIFEST, exportId: 'CR-ATI-1' };
  const withAttestation = (c: Call) =>
    c.url.startsWith('/api/audit/reports/audit-trail-integrity')
      ? ok(exportBody(integrityData({ ok: true, scope: 'tenant-chain', reason: 'Intact.' }, [{ check: 'Chain', verdict: 'intact', rows_checked: 4, detail: '' }]), ATI_RUN))
      : defaultReply(c);
  function fillTrailForm() {
    fireEvent.click(screen.getByRole('radio', { name: 'Audit trail review' }));
    fireEvent.change(screen.getByLabelText('What the review covered'), { target: { value: 'The audit trail for the period.' } });
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'No unexplained change.' } });
  }

  it('is not signed until the integrity attestation has been run on this screen', async () => {
    mountSurface();
    await openReviews();
    fillTrailForm();
    fireEvent.click(screen.getByRole('button', { name: 'Sign review…' }));
    expect(screen.getByText('Run the audit trail integrity attestation on this screen first. The review names that run.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('names the attestation run, and starts the day after the last signed audit trail review ended', async () => {
    reply = withAttestation;
    mountSurface();
    await selectReport(/Audit trail integrity attestation/);
    await runSelected();
    await openReviews();
    fillTrailForm();
    // The last signed audit trail review (CURRENT) covered up to 2026-09-30.
    expect((screen.getByLabelText('Reviewed from') as HTMLInputElement).value).toBe('2026-10-01');
    await signInDialog();
    await waitFor(() => expect(posted('/api/audit/reviews/12/sign')).toHaveLength(1));
    expect(posted('/api/audit/reviews')).toEqual([
      {
        kind: 'audit_trail',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-01',
        scope: { description: 'The audit trail for the period.', reportExportId: 'CR-ATI-1', reportDataHash: HASH },
        outcome: 'No unexplained change.',
        decisions: [],
      },
    ]);
  });
});
