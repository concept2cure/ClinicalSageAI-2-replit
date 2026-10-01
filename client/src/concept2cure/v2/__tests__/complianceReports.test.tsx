// @vitest-environment jsdom
/**
 * Audit & compliance reports — the client surface over GET /api/audit/reports.
 *
 * What a client (or the regulator asking them) needs from this screen, asserted
 * through the real component with only the transport replaced:
 *
 *   - the catalog lists every report, with its purpose and regulatory basis, to
 *     every member — and only readers get a Run control;
 *   - a run renders the deterministic sections the server sealed, says so when a
 *     section is empty rather than drawing a blank table, lists what the platform
 *     does not record, and states the chain verdict it was generated under;
 *   - a run the server refused to record (503) shows that refusal and no table;
 *   - a failed catalog read is an error, never an empty catalog;
 *   - the CSV download is the server's string, byte for byte — the manifest's
 *     SHA-256 covers that exact string, so any re-serialisation breaks it;
 *   - the full audit trail runs through its own signed export endpoint.
 *
 * `apiCall` is the one transport the surface uses, so it is the one mocked.
 * `downloadText` is replaced so a "download" is a captured value, not a jsdom
 * no-op. The entry points from Insights and the audit trail mount those real
 * components with `apiRequest` stubbed.
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

const saved = vi.hoisted(() => [] as Array<{ name: string; text: string; mime?: string }>);
const browser = vi.hoisted(() => ({ allowsDownload: true }));
vi.mock('../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download')>()),
  downloadText: (name: string, text: string, mime?: string) => {
    if (!browser.allowsDownload) return false;
    saved.push({ name, text, mime });
    return true;
  },
}));

import type { A11yFinding } from '../../../../../scripts/visual-qa/a11y-rules.mjs';
import { auditA11y } from '../../../../../scripts/visual-qa/a11y-rules.mjs';
import { InsightsCanvas } from '../surfaces/Insights';
import { AuditTrail } from '../surfaces/AdminSurfaces';

import {
  CATALOG, HASH, MANIFEST, READERS, SECTIONED, VERIFICATION,
  exportBody, fail, mount, ok, runSelected, selectReport,
} from './_compliance-reports-fixtures';

type Route = (url: string) => ReturnType<typeof ok>;
let route: Route;
const urls = () => apiCall.mock.calls.map((c) => String(c[1]));
const noop = () => {};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  saved.length = 0;
  browser.allowsDownload = true;
  route = (url) => (url === '/api/audit/reports' ? ok(CATALOG) : ok(exportBody(SECTIONED)));
  apiCall.mockReset();
  apiCall.mockImplementation(async (_method: string, url: string) => route(url));
  apiRequest.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/* ── The catalog ───────────────────────────────────────────────────────────── */

describe('the report catalog', () => {
  it('lists every report with its purpose and basis, read from the catalog route', async () => {
    mount();
    expect(await screen.findByText('User access review')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Audit & compliance reports' })).toBeTruthy();
    expect(
      screen.getByText(
        "Deterministic reports drawn from the organisation's own records, sealed and recorded on the audit trail when run.",
      ),
    ).toBeTruthy();
    expect(screen.getByText('Sign-in and session events')).toBeTruthy();
    expect(screen.getByText('Full audit trail')).toBeTruthy();
    expect(screen.getByText('Every sign-in, sign-out and second-factor event in the period.')).toBeTruthy();
    expect(screen.getByText('HIPAA 164.312(b)')).toBeTruthy();
    expect(apiCall).toHaveBeenCalledWith('GET', '/api/audit/reports');
  });

  it('shows the readers notice and no Run control when the member cannot run reports', async () => {
    route = (url) => (url === '/api/audit/reports' ? ok({ ...CATALOG, canRun: false }) : ok(exportBody(SECTIONED)));
    mount();
    expect(await screen.findByText(`Available to ${READERS}.`)).toBeTruthy();
    // Still listed, so a member knows what exists.
    expect(screen.getByText('User access review')).toBeTruthy();
    expect(screen.getByText('Full audit trail')).toBeTruthy();
    await selectReport(/Sign-in and session events/);
    expect(screen.queryByRole('button', { name: /^Run/ })).toBeNull();
  });

  it('renders a failed catalog read as an error with a retry, never as an empty catalog', async () => {
    route = () => fail(500, { success: false, error: { code: 'INTERNAL', message: 'Something failed.' } });
    mount();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn.t load the report catalog/);
    expect(screen.queryByText('User access review')).toBeNull();
    expect(screen.queryByText(/No reports/i)).toBeNull();

    route = (url) => (url === '/api/audit/reports' ? ok(CATALOG) : ok(exportBody(SECTIONED)));
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('User access review')).toBeTruthy();
  });

  it('treats a 200 that is not the catalog shape as a failed read', async () => {
    route = () => ok({ data: [] });
    mount();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn.t load the report catalog/);
  });
});

/* ── Running a report ──────────────────────────────────────────────────────── */

describe('running a report', () => {
  it('renders sections, the empty-section sentence, what is not recorded and the chain statement', async () => {
    mount();
    await selectReport(/Sign-in and session events/);
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-07-03');
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('2026-10-01');
    await runSelected();

    // A report that does not walk the chain says so; it never claims a verdict.
    expect(await screen.findByText('This report does not verify the audit chain.')).toBeTruthy();
    expect(screen.queryByText(/verified at generation/)).toBeNull();
    expect(urls()).toContain('/api/audit/reports/authentication-events?from=2026-07-03&to=2026-10-01&format=json');

    const events = screen.getByRole('table', { name: 'Events' });
    expect(within(events).getByText('user_login')).toBeTruthy();
    expect(within(events).getByText('When (UTC)')).toBeTruthy();
    expect(screen.getByText('Times are UTC.')).toBeTruthy();
    // The empty section says so; it is never a blank table.
    expect(screen.queryByRole('table', { name: 'Summary' })).toBeNull();
    expect(screen.getByText('No records in this period.')).toBeTruthy();

    expect(screen.getByRole('heading', { name: 'Not recorded by the platform' })).toBeTruthy();
    expect(screen.getByText('Idle-timeout session ends are not recorded.')).toBeTruthy();

    // Manifest strip.
    const hash = screen.getByTitle(HASH);
    expect(hash.textContent).toBe('ab12cd34ef56…');
    expect(screen.getByText('CR-EXPORT-1')).toBeTruthy();
    expect(screen.getByText('k1')).toBeTruthy();
    expect(
      screen.getByText('Each run is recorded on the audit trail. Download CSV runs the report again and is recorded as its own run.'),
    ).toBeTruthy();
  });

  it('uses only the as-of date for an as-of report', async () => {
    mount();
    await selectReport(/User access review/);
    expect(screen.queryByLabelText('From')).toBeNull();
    expect((screen.getByLabelText('As of') as HTMLInputElement).value).toBe('2026-10-01');
    await runSelected();
    await waitFor(() => expect(urls()).toContain('/api/audit/reports/access-review?to=2026-10-01&format=json'));
  });

  it('refuses a period whose start is after its end without calling the server', async () => {
    mount();
    await selectReport(/Sign-in and session events/);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-02' } });
    await runSelected();
    expect((await screen.findByRole('alert')).textContent).toMatch(/start date is after the end date/i);
    expect(urls().filter((u) => u !== '/api/audit/reports')).toEqual([]);
  });

  it('shows the not-recorded refusal for a 503 and no table', async () => {
    route = (url) =>
      url === '/api/audit/reports' ? ok(CATALOG) : fail(503, { success: false, error: { code: 'REPORT_NOT_RECORDED' } });
    const { container } = mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    expect(
      await screen.findByText(
        'The report was not produced because it could not be recorded on the audit trail. Nothing was exported.',
      ),
    ).toBeTruthy();
    expect(container.querySelector('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
  });

  it('uses the server sentence for a 503 when it sends one', async () => {
    const message = 'The audit export key is not configured for this deployment. Nothing was exported.';
    route = (url) =>
      url === '/api/audit/reports'
        ? ok(CATALOG)
        : fail(503, { success: false, error: { code: 'REPORT_SIGNING_UNAVAILABLE', message } });
    mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it('maps a 403 to the readers notice and a 400 to the server message', async () => {
    route = (url) => (url === '/api/audit/reports' ? ok(CATALOG) : fail(403, { error: 'AUDIT_READ_RESTRICTED', message: 'x' }));
    mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    expect((await screen.findByRole('alert')).textContent).toMatch(`Available to ${READERS}.`);

    route = () => fail(400, { success: false, error: { code: 'BAD_PERIOD', message: 'The period may not exceed 366 days.' } });
    await runSelected();
    expect(await screen.findByText('The period may not exceed 366 days.')).toBeTruthy();
  });

  it('shows at most 200 rows on screen and says the download has the rest', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ occurred_at: `t${i}`, action: 'user_login', outcome: 'success' }));
    const big = { ...SECTIONED, sections: [{ ...SECTIONED.sections[0], rows, rowCount: 250 }] };
    route = (url) => (url === '/api/audit/reports' ? ok(CATALOG) : ok(exportBody(big)));
    mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    const table = await screen.findByRole('table', { name: 'Events' });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(200);
    expect(screen.getByText('Showing 200 of 250 — the download contains all rows.')).toBeTruthy();
  });
});

/* ── Downloads ─────────────────────────────────────────────────────────────── */

describe('downloads', () => {
  it('saves the CSV run’s export.data byte for byte, with its manifest beside it', async () => {
    // Formula-neutralised cells, CRLF, quotes, non-ASCII and a trailing blank
    // line: every one of these is changed by a careless re-serialisation.
    const csv =
      '# Events\r\n"occurred_at","action","reason"\r\n"2026-09-30T10:00:00Z","user_login","\'=HYPERLINK(""x"")"\r\n' +
      '"2026-09-30T11:00:00Z","user_logout","Zoë — signed out  "\r\n\r\n# Summary\r\n"action","count"\r\n\r\n';
    const csvManifest = { ...MANIFEST, exportId: 'CR-EXPORT-CSV', format: 'csv' };
    route = (url) => {
      if (url === '/api/audit/reports') return ok(CATALOG);
      return url.includes('format=csv') ? ok(exportBody(csv, csvManifest)) : ok(exportBody(SECTIONED));
    };
    mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    const csvButton = await screen.findByRole('button', { name: 'Download CSV' });
    await act(async () => {
      fireEvent.click(csvButton);
    });

    await waitFor(() => expect(saved).toHaveLength(2));
    expect(urls()).toContain('/api/audit/reports/authentication-events?from=2026-07-03&to=2026-10-01&format=csv');
    const [file, manifest] = saved;
    expect(file.name).toBe('authentication-events-2026-07-03-2026-10-01.csv');
    expect(file.text).toBe(csv);
    expect(new TextEncoder().encode(file.text)).toEqual(new TextEncoder().encode(csv));
    expect(manifest.name).toBe('authentication-events-2026-07-03-2026-10-01.manifest.json');
    expect(JSON.parse(manifest.text)).toEqual({
      manifest: csvManifest,
      signature: 'f'.repeat(64),
      verification: VERIFICATION,
    });
  });

  it('saves the JSON bundle as data, manifest, signature and verification', async () => {
    mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    fireEvent.click(await screen.findByRole('button', { name: 'Download JSON' }));
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('authentication-events-2026-07-03-2026-10-01.json');
    const bundle = JSON.parse(saved[0].text);
    expect(Object.keys(bundle).sort()).toEqual(['data', 'manifest', 'signature', 'verification']);
    expect(bundle.data).toBe(JSON.stringify(SECTIONED, null, 2));
  });

  it('reports a refused download as a failure, not a success', async () => {
    browser.allowsDownload = false;
    mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    fireEvent.click(await screen.findByRole('button', { name: 'Download JSON' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/browser refused the download/i);
  });
});

/* ── The full audit trail ──────────────────────────────────────────────────── */

describe('the full audit trail entry', () => {
  it('runs through its own signed-export endpoint and renders the rows in one table', async () => {
    const rows = [
      { source: 'audit_logs', id: 1, timestamp: '2026-09-30T10:00:00Z', event_type: 'user_login', user_name: 'Ada', reason: null },
      { source: 'audit_events', id: 2, timestamp: '2026-09-30T11:00:00Z', event_type: 'vault.lock', user_name: 'Lin', reason: 'Final' },
    ];
    const trailManifest = {
      manifestVersion: 2,
      exportId: 'AUDIT-EXPORT-9',
      exportedAt: '2026-10-01T09:00:00.000Z',
      rowCount: 2,
      truncated: false,
      dataHash: HASH,
      signingKeyId: 'k1',
      chainIntegrity: { status: 'intact', totalEntries: 1, brokenLinks: 0, verifiedAt: 'x' },
      auditLogsChain: { status: 'intact', rowsChecked: 1, verifiedAt: 'x' },
    };
    route = (url) => (url === '/api/audit/reports' ? ok(CATALOG) : ok(exportBody(rows, trailManifest)));
    mount();
    await selectReport(/Full audit trail/);
    await runSelected();

    const table = await screen.findByRole('table', { name: 'Recorded events' });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(within(table).getByText('vault.lock')).toBeTruthy();
    // A store name is not copy.
    expect(within(table).queryByText('audit_logs')).toBeNull();

    const run = urls().find((u) => u !== '/api/audit/reports')!;
    expect(run.startsWith('/api/audit/export/signed?')).toBe(true);
    const q = new URLSearchParams(run.split('?')[1]);
    expect(q.get('format')).toBe('json');
    expect(q.get('start_date')).toBe('2026-07-03T00:00:00.000Z');
    expect(q.get('end_date')).toBe('2026-10-01T23:59:59.999Z');
    expect(urls().some((u) => u.startsWith('/api/audit/reports/audit-trail'))).toBe(false);
    expect(screen.getByText('AUDIT-EXPORT-9')).toBeTruthy();
  });
});

/* ── Accessible names on the populated screen ─────────────────────────────── */

describe('accessibility of the populated screen', () => {
  // The every-surface a11y ratchet only ever sees this surface's failed-read
  // state (its fixture answers `{ data: [] }`), so the catalog, the period form
  // and a rendered result are audited here with the same shared rules.
  it('names every control and field in the catalog, the period form and a result', async () => {
    const { container } = mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    await screen.findByText('This report does not verify the audit chain.');
    const findings = auditA11y(container, document);
    expect(
      findings,
      findings.map((f: A11yFinding) => `${f.rule}: ${f.detail}\n  ${f.html}`).join('\n'),
    ).toEqual([]);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

/* ── Entry points ──────────────────────────────────────────────────────────── */

function respond(body: unknown) {
  apiRequest.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
}

describe('entry points', () => {
  it('Insights with no lead program still reaches the reports', async () => {
    respond({ success: true, data: { tier: 'standard', leadProgram: null } });
    const onNav = vi.fn();
    render(<InsightsCanvas onNav={onNav} segment="pharma" surface={{ id: 'insights', label: 'Reporting & analytics' } as never} />);
    await screen.findByText('No program readiness yet');
    fireEvent.click(screen.getByRole('button', { name: 'Audit & compliance reports' }));
    expect(onNav).toHaveBeenCalledWith('compliance-reports');
  });

  it('Insights with a lead program links to the reports from its left pane header', async () => {
    respond({
      data: {
        organizationId: 1,
        tier: 'standard',
        segments: ['biotech'],
        leadProgram: {
          projectId: 1, code: 'BX204', label: 'BX204', filing: 'NDA', indication: null, readiness: 73,
          scope: 'project', scopeId: '1', agency: null, pdufa: '2027-03-14', criticalBlockerCount: 0,
        },
        portfolio: { programs: null },
      },
    });
    const onNav = vi.fn();
    render(<InsightsCanvas onNav={onNav} segment="biotech" surface={{ id: 'insights', label: 'Reporting & analytics' } as never} />);
    await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
    const head = document.querySelector('.rc-ana-head') as HTMLElement;
    fireEvent.click(within(head).getByRole('button', { name: 'Audit & compliance reports' }));
    expect(onNav).toHaveBeenCalledWith('compliance-reports');
  });

  it('the audit trail links to the compliance reports beside its signed export', async () => {
    respond({ success: true, data: [], meta: {} });
    const onNav = vi.fn();
    render(
      <AuditTrail
        {...({ surface: { id: 'audit-trail' }, onAsk: noop, onNav, segment: 'biotech' } as unknown as React.ComponentProps<
          typeof AuditTrail
        >)}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Compliance reports' }));
    expect(onNav).toHaveBeenCalledWith('compliance-reports');
  });
});
