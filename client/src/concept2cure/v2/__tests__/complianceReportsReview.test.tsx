// @vitest-environment jsdom
/**
 * Audit & compliance reports — review round 1 (honest-state, Part 11 UX and
 * security reviews, 2026-10-01). One describe per must-fix item, numbered as
 * the review numbered them.
 *
 *   1. The chain statement says exactly what was checked: the integrity
 *      attestation's checks, or that this report does not check the chain.
 *   2. The seal is explained (and is not an electronic signature), its hash can
 *      be copied, and a saved report can be verified from this screen.
 *   3. An as-of report says which fields are as of the date and which are now.
 *   4. A section or catalog entry that does not parse is said to be unreadable —
 *      never rendered as "no records".
 *   5. The CSV download says it was a second run, and warns when it disagrees.
 *   6. Timestamps read as UTC.
 *   7. No audit-trail row has a blank actor.
 *   8. Who may run reports is the server's statement; 403 and 429 are told apart.
 *   9. Insights renders a failed overview read as a failure, not as "no program".
 *
 * Same seams as complianceReports.test.tsx: `apiCall` and `downloadText` are
 * mocked; Insights mounts with `apiRequest` stubbed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiCall = vi.hoisted(() => vi.fn());
vi.mock('../apiCall', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../apiCall')>()),
  apiCall,
}));

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

const saved = vi.hoisted(() => [] as Array<{ name: string; text: string }>);
vi.mock('../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download')>()),
  downloadText: (name: string, text: string) => {
    saved.push({ name, text });
    return true;
  },
}));

import { ApiRequestError } from '@/lib/queryClient';
import { InsightsCanvas } from '../surfaces/Insights';
import {
  CATALOG, HASH, MANIFEST, READERS, SECTIONED, VERIFICATION,
  clickAndSettle, exportBody, fail, integrityData, mount, ok, runSelected, selectReport,
} from './_compliance-reports-fixtures';

type Result = ReturnType<typeof ok>;
let route: (method: string, url: string, body?: unknown) => Result;
const calls = () => apiCall.mock.calls.map((c) => ({ method: String(c[0]), url: String(c[1]), body: c[2] }));
const catalogOr = (res: Result) => (_m: string, url: string) => (url === '/api/audit/reports' ? ok(CATALOG) : res);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  saved.length = 0;
  route = catalogOr(ok(exportBody(SECTIONED)));
  apiCall.mockReset();
  apiCall.mockImplementation(async (method: string, url: string, body?: unknown) => route(method, url, body));
  apiRequest.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const toneOf = (text: string | RegExp) => screen.getByText(text).closest('[data-tone]')?.getAttribute('data-tone');

async function runReport(name: RegExp, data: unknown, manifest: Record<string, unknown> = MANIFEST) {
  route = catalogOr(ok(exportBody(data, manifest)));
  mount();
  await selectReport(name);
  await runSelected();
}

/* ── 1. The chain statement ─────────────────────────────────────────────── */

describe('1. the chain statement says what was checked', () => {
  const CHECKS_3 = { total: 3, intact: 3, broken: 0, notVerified: 0 };

  it('a report that does not check the chain says so, and offers the integrity attestation', async () => {
    await runReport(/Sign-in and session events/, SECTIONED);
    const line = await screen.findByText('This report does not verify the audit chain.');
    expect(line.closest('[data-tone]')?.getAttribute('data-tone')).toBe('neutral');
    expect(screen.queryByText(/passed at generation|verified at generation/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose the integrity attestation' }));
    const card = screen.getByRole('button', { name: /Audit trail integrity attestation/ });
    expect(card.getAttribute('aria-pressed')).toBe('true');
  });

  it('every check intact: "All 3 integrity checks passed at generation"', async () => {
    await runReport(/integrity attestation/, integrityData({ ok: true, scope: 'integrity-checks', rowsChecked: 12, checks: CHECKS_3 }, []));
    expect(await screen.findByText('All 3 integrity checks passed at generation')).toBeTruthy();
    expect(toneOf('All 3 integrity checks passed at generation')).toBe('ok');
  });

  it('a break is an error, not a warning, and carries its reason', async () => {
    const reason = '1 of 3 checks found a break; the integrity checks section shows where.';
    await runReport(
      /integrity attestation/,
      integrityData({ ok: false, scope: 'integrity-checks', rowsChecked: 12, reason, checks: { total: 3, intact: 2, broken: 1, notVerified: 0 } }, []),
    );
    expect(await screen.findByText('A break was found at generation')).toBeTruthy();
    expect(toneOf('A break was found at generation')).toBe('error');
    expect(screen.getByText(reason)).toBeTruthy();
  });

  it('checks that could not verify are counted, with the reason', async () => {
    await runReport(
      /integrity attestation/,
      integrityData(
        { ok: null, scope: 'integrity-checks', reason: 'The seal key is not configured.', checks: { total: 3, intact: 2, broken: 0, notVerified: 1 } },
        [],
      ),
    );
    expect(await screen.findByText('1 of 3 checks could not verify')).toBeTruthy();
    expect(toneOf('1 of 3 checks could not verify')).toBe('muted');
    expect(screen.getByText('The seal key is not configured.')).toBeTruthy();
  });

  it('ok:true over zero rows is never shown as verified', async () => {
    await runReport(/integrity attestation/, integrityData({ ok: true, scope: 'integrity-checks', rowsChecked: 0, checks: CHECKS_3 }, []));
    await screen.findByText('Integrity checks');
    expect(screen.queryByText(/passed at generation|^Audit chain verified/)).toBeNull();
    expect(screen.getByText('No chained rows were checked, so nothing was verified at generation')).toBeTruthy();
  });

  it('styles each verdict cell by its verdict, with the word always present', async () => {
    const verdicts = [
      { check: 'audit_logs hash chain', verdict: 'broken', rows_checked: 12, detail: 'Row 4 does not link.' },
      { check: 'audit_events linkage', verdict: 'not verified', rows_checked: null, detail: 'No hashed rows.' },
      { check: 'audit_logs HMAC seals', verdict: 'intact', rows_checked: 9, detail: 'All 9 sealed rows verify.' },
    ];
    await runReport(/integrity attestation/, integrityData({ ok: false, scope: 'integrity-checks', checks: { total: 3, intact: 1, broken: 1, notVerified: 1 } }, verdicts));
    const table = await screen.findByRole('table', { name: 'Integrity checks' });
    expect(within(table).getByText('broken').closest('[data-tone]')?.getAttribute('data-tone')).toBe('error');
    expect(within(table).getByText('not verified').closest('[data-tone]')?.getAttribute('data-tone')).toBe('muted');
    expect(within(table).getByText('intact')).toBeTruthy();
    // Store names are not copy.
    expect(within(table).getByText('Audit ledger hash chain')).toBeTruthy();
    expect(within(table).queryByText(/audit_logs|audit_events/)).toBeNull();
  });

  it('the full audit trail states each store on its own line, never one merged verdict', async () => {
    const trailManifest = {
      manifestVersion: 2, exportId: 'AUDIT-EXPORT-9', exportedAt: '2026-10-01T09:00:00.000Z', exportedBy: 'Ada', exportedByRole: 'admin',
      rowCount: 1, truncated: false, dataHash: HASH, signingKeyId: 'k1',
      chainIntegrity: { status: 'intact', totalEntries: 5, hashedEntries: 5, brokenLinks: 0, verifiedAt: 'x' },
      auditLogsChain: { status: 'broken', rowsChecked: 40, brokenAt: '{"row":3}', verifiedAt: 'x', reason: 'Row 3 of the audit_logs chain does not link.' },
    };
    const rows = [{ source: 'audit_logs', id: 1, timestamp: '2026-09-30T10:00:00Z', event_type: 'user_login', user_name: 'Ada' }];
    await runReport(/Full audit trail/, rows, trailManifest);
    expect(await screen.findByText('Event chain: intact, 5 rows checked')).toBeTruthy();
    expect(screen.getByText('Audit ledger: break found, 40 rows checked')).toBeTruthy();
    expect(toneOf('Audit ledger: break found, 40 rows checked')).toBe('error');
    expect(screen.getByText('Row 3 of the audit ledger chain does not link.')).toBeTruthy();
    expect(screen.queryByText(/Audit chain (verified|not verified|break found) at generation/)).toBeNull();
  });
});

/* ── 2. The seal, its hash, and verifying a saved report ────────────────── */

describe('2. the seal is explained and can be checked', () => {
  it('says what the seal is, who ran the report, and that it is not an electronic signature', async () => {
    await runReport(/Sign-in and session events/, SECTIONED);
    const block = (await screen.findByRole('heading', { name: 'What the seal means' })).parentElement!;
    const text = block.textContent ?? '';
    expect(text).toContain('HMAC-SHA256');
    expect(text).toContain('platform-held key (k1)');
    expect(text).toContain('export CR-EXPORT-1');
    expect(text).toContain('Ada Lovelace (admin)');
    expect(text).toContain('2026-10-01 09:00:00 UTC');
    expect(text).toContain('not an electronic signature');
  });

  it('copies the full SHA-256, and shows it when the browser refuses', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await runReport(/Sign-in and session events/, SECTIONED);
    await clickAndSettle(await screen.findByRole('button', { name: 'Copy SHA-256' }));
    expect(writeText).toHaveBeenCalledWith(HASH);
    expect(screen.getByText('Copied the SHA-256.')).toBeTruthy();

    writeText.mockRejectedValueOnce(new Error('denied'));
    await clickAndSettle(screen.getByRole('button', { name: 'Copy SHA-256' }));
    expect(screen.getByRole('alert').textContent).toContain(HASH);
  });

  function choose(files: File[]) {
    fireEvent.change(screen.getByLabelText('Saved report files'), { target: { files } });
  }
  const verifyCalls = () => calls().filter((c) => c.url === '/api/audit/export/verify');

  it('verifies a saved JSON bundle with exactly its data, manifest and signature', async () => {
    const bundle = { data: JSON.stringify(SECTIONED, null, 2), manifest: MANIFEST, signature: 'f'.repeat(64), verification: VERIFICATION };
    route = (method, url) =>
      url === '/api/audit/export/verify'
        ? ok({ success: true, verification: { valid: true, errors: [], signingKeyId: 'k1', verifiedAt: '2026-10-01T12:00:00Z' } })
        : catalogOr(ok(exportBody(SECTIONED)))(method, url);
    mount();
    await screen.findByText('User access review');
    choose([new File([JSON.stringify(bundle)], 'report.json', { type: 'application/json' })]);
    await clickAndSettle(await screen.findByRole('button', { name: 'Verify saved report' }));
    await waitFor(() => expect(verifyCalls()).toHaveLength(1));
    expect(verifyCalls()[0]).toEqual({
      method: 'POST',
      url: '/api/audit/export/verify',
      body: { data: bundle.data, manifest: MANIFEST, signature: bundle.signature },
    });
    expect(await screen.findByText('The saved report verifies: its data matches its seal, made with key k1.')).toBeTruthy();
  });

  it('verifies a CSV with its manifest file, sending the CSV text exactly as read', async () => {
    const csv = '# Events\r\n"occurred_at","action"\r\n"2026-09-30T10:00:00Z","\'=cmd"\r\n\r\n';
    const seal = { manifest: { ...MANIFEST, format: 'csv' }, signature: 'e'.repeat(64), verification: VERIFICATION };
    route = (method, url) =>
      url === '/api/audit/export/verify'
        ? ok({ success: true, verification: { valid: false, errors: ['Data hash mismatch — export data has been modified'], signingKeyId: 'k1' } })
        : catalogOr(ok(exportBody(SECTIONED)))(method, url);
    mount();
    await screen.findByText('User access review');
    choose([
      new File([csv], 'r.csv', { type: 'text/csv' }),
      new File([JSON.stringify(seal)], 'r.manifest.json', { type: 'application/json' }),
    ]);
    await clickAndSettle(await screen.findByRole('button', { name: 'Verify saved report' }));
    await waitFor(() => expect(verifyCalls()).toHaveLength(1));
    expect(verifyCalls()[0].body).toEqual({ data: csv, manifest: seal.manifest, signature: seal.signature });
    expect(await screen.findByText('The saved report does not verify.')).toBeTruthy();
    expect(screen.getByText('Data hash mismatch — export data has been modified')).toBeTruthy();
    expect(screen.getByText(/key k1/)).toBeTruthy();
  });

  it('refuses files that are not a saved report without calling the server', async () => {
    mount();
    await screen.findByText('User access review');
    choose([new File(['a,b\r\n'], 'r.csv', { type: 'text/csv' })]);
    await clickAndSettle(await screen.findByRole('button', { name: 'Verify saved report' }));
    expect(await screen.findByText('Choose a saved JSON report, or a CSV together with its manifest file.')).toBeTruthy();
    expect(verifyCalls()).toEqual([]);
  });
});

/* ── 3. As-of reports ──────────────────────────────────────────────────── */

describe('3. an as-of report says which fields are as of the date', () => {
  it('describes the as-of rule, and notes current status for a past date only', async () => {
    mount();
    await selectReport(/User access review/);
    expect(
      screen.getByText('Membership is taken as of one date; other fields are shown as they are when the report is run, as each section notes.'),
    ).toBeTruthy();
    await runSelected();
    await screen.findByRole('heading', { name: 'User access review' });
    expect(screen.queryByText('Status and roles are shown as they are now, not as of this date.')).toBeNull();

    fireEvent.change(screen.getByLabelText('As of'), { target: { value: '2026-09-01' } });
    await runSelected();
    expect(await screen.findByText('Status and roles are shown as they are now, not as of this date.')).toBeTruthy();
  });
});

/* ── 4. Parse strictness ───────────────────────────────────────────────── */

describe('4. what does not parse is unreadable, never empty', () => {
  it('a section without a rows array could not be read', async () => {
    const [events, summary] = SECTIONED.sections;
    const rowless: Record<string, unknown> = { ...summary };
    delete rowless.rows;
    await runReport(/Sign-in and session events/, { ...SECTIONED, sections: [events, rowless] });
    expect(await screen.findByText('This section could not be read.')).toBeTruthy();
    expect(screen.queryByText('No records in this period.')).toBeNull();
  });

  it('a section whose row count disagrees with its rows could not be read', async () => {
    const [events, summary] = SECTIONED.sections;
    await runReport(/Sign-in and session events/, { ...SECTIONED, sections: [{ ...events, rowCount: 5 }, summary] });
    expect(await screen.findByText('This section could not be read.')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Events' })).toBeNull();
  });

  it('one malformed catalog entry fails the whole read', async () => {
    const bad = { ...CATALOG, reports: [...CATALOG.reports, { id: 'x', title: 'Broken entry', period: 'weekly', basis: 'none' }] };
    route = () => ok(bad);
    mount();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn.t load the report catalog/);
    expect(screen.queryByText('User access review')).toBeNull();
  });
});

/* ── 5. The CSV download is a second run ───────────────────────────────── */

describe('5. Download CSV says it ran the report again', () => {
  it('names the new export and its time, and warns when its row counts differ', async () => {
    const csvManifest = {
      ...MANIFEST, exportId: 'CR-EXPORT-CSV', generatedAt: '2026-10-01T09:05:00Z', format: 'csv',
      sections: [{ key: 'events', rowCount: 2, truncated: false }, { key: 'summary', rowCount: 0, truncated: false }],
    };
    route = (method, url) =>
      url.includes('format=csv') ? ok(exportBody('# Events\r\n', csvManifest)) : catalogOr(ok(exportBody(SECTIONED)))(method, url);
    mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    expect(
      screen.getByText('Each run is recorded on the audit trail. Download CSV runs the report again and is recorded as its own run.'),
    ).toBeTruthy();
    await clickAndSettle(await screen.findByRole('button', { name: 'Download CSV' }));
    const note = await screen.findByText(/ran the report again/);
    expect(note.textContent).toContain('CR-EXPORT-CSV');
    expect(note.textContent).toContain('2026-10-01 09:05:00 UTC');
    expect(screen.getByText(/Events: 2 in the CSV, 1 on screen/)).toBeTruthy();
  });
});

/* ── 6. Timestamps ─────────────────────────────────────────────────────── */

describe('6. timestamps read as UTC', () => {
  it('formats ISO instants as YYYY-MM-DD HH:MM:SS UTC and marks their column', async () => {
    const events = {
      ...SECTIONED.sections[0],
      rows: [
        { occurred_at: '2026-09-30T10:00:00Z', action: 'user_login', outcome: 'success' },
        { occurred_at: '2026-09-30T11:30:05.123Z', action: '2026-09-30', outcome: 'success' },
      ],
      rowCount: 2,
    };
    await runReport(/Sign-in and session events/, { ...SECTIONED, sections: [events] });
    const table = await screen.findByRole('table', { name: 'Events' });
    expect(within(table).getByText('When (UTC)')).toBeTruthy();
    expect(within(table).getByText('2026-09-30 10:00:00 UTC')).toBeTruthy();
    expect(within(table).getByText('2026-09-30 11:30:05 UTC')).toBeTruthy();
    // A date that is not an instant is left as it is.
    expect(within(table).getByText('2026-09-30')).toBeTruthy();
    expect(within(table).queryByText(/T\d\d:\d\d/)).toBeNull();
  });
});

/* ── 7. Actors on the full audit trail ─────────────────────────────────── */

describe('7. no audit-trail row has a blank actor', () => {
  const trailManifest = { manifestVersion: 2, exportId: 'AUDIT-EXPORT-9', rowCount: 2, truncated: false, dataHash: HASH, signingKeyId: 'k1' };

  it('adds a User id column when a row has no user name', async () => {
    const rows = [
      { timestamp: '2026-09-30T10:00:00Z', event_type: 'user_login', user_name: null, user_id: 42 },
      { timestamp: '2026-09-30T11:00:00Z', event_type: 'vault.lock', user_name: 'Lin', user_id: 7 },
    ];
    await runReport(/Full audit trail/, rows, trailManifest);
    const table = await screen.findByRole('table', { name: 'Recorded events' });
    expect(within(table).getByText('User id')).toBeTruthy();
    expect(within(table).getByText('42')).toBeTruthy();
  });

  it('leaves the column out when every row names its user', async () => {
    const rows = [
      { timestamp: '2026-09-30T10:00:00Z', event_type: 'user_login', user_name: 'Ada', user_id: 42 },
      { timestamp: '2026-09-30T11:00:00Z', event_type: 'vault.lock', user_name: 'Lin', user_id: 7 },
    ];
    await runReport(/Full audit trail/, rows, trailManifest);
    const table = await screen.findByRole('table', { name: 'Recorded events' });
    expect(within(table).queryByText('User id')).toBeNull();
  });
});

/* ── 8. Readers, 403 and 429 ───────────────────────────────────────────── */

describe('8. who may run reports is the server’s statement', () => {
  it('takes the readers notice from the catalog', async () => {
    route = () => ok({ ...CATALOG, canRun: false, readers: 'owners and auditors' });
    mount();
    expect(await screen.findByText('Available to owners and auditors.')).toBeTruthy();
  });

  it('a restricted-read 403 shows the readers notice; any other 403 shows its own message', async () => {
    route = catalogOr(fail(403, { error: 'AUDIT_READ_RESTRICTED', message: 'Restricted.' }));
    mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    expect((await screen.findByRole('alert')).textContent).toBe(`Available to ${READERS}.`);

    route = catalogOr(fail(403, { success: false, error: { code: 'ORG_SUSPENDED', message: 'This organisation is suspended.' } }));
    await runSelected();
    expect((await screen.findByRole('alert')).textContent).toBe('This organisation is suspended.');
  });

  it('a 429 for a run in progress says a report is already running', async () => {
    route = catalogOr(fail(429, { success: false, error: { code: 'REPORT_IN_PROGRESS', message: 'Another report is being produced.' } }));
    mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    expect(
      await screen.findByText('A report is already running for your organisation. Try again when it finishes.'),
    ).toBeTruthy();
  });
});

/* ── 9. Insights: a failed overview is a failure ───────────────────────── */

describe('9. Insights renders a 503 overview as an error', () => {
  it('shows the error state, not "No program readiness yet", and keeps the reports reachable', async () => {
    apiRequest.mockImplementation(async () => {
      throw new ApiRequestError('The portfolio could not be read.', 503, {
        success: false, error: { code: 'PORTFOLIO_UNAVAILABLE', message: 'The portfolio could not be read.' },
      });
    });
    const onNav = vi.fn();
    render(<InsightsCanvas onNav={onNav} segment="pharma" surface={{ id: 'insights', label: 'Reporting & analytics' } as never} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't load the reporting canvas/);
    expect(screen.queryByText('No program readiness yet')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Audit & compliance reports' }));
    });
    expect(onNav).toHaveBeenCalledWith('compliance-reports');
  });
});
