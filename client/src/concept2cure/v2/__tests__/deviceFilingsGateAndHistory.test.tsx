// @vitest-environment jsdom
/**
 * Submission Center's device filings carry what the retired device-submission
 * screen carried, from the one device-filing store (D2, fold F5 item 1,
 * 2026-10-30; decision P-61 item 1; FUNCTION_PARITY.md "From device-submission";
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/):
 *   - a status filter over the tracked filings, offering only the statuses the
 *     list holds, each with its count;
 *   - each draft filing's gate, from the filing's own readiness (GET
 *     /api/510k/estar/submissions/:id/readiness, the assessment EstarFilingPanel
 *     shows): "Can file now" only from an assessment that said so, every blocker
 *     named, a filing with no project not assessed and saying why, a failed read
 *     an error with a retry, never a verdict; a filing past draft is not asked;
 *   - each filing's history, on its record (GET .../:id/events), in order, an
 *     empty history said to be empty, a failed read said to be one.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { TaskFilingHome } from '@shared/types/task-filing-home';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';
import { clearNavParams } from '../navParams';

const DRAFT_A = 'a1a1a1a1-0000-4000-8000-000000000001';
const DRAFT_B = 'a1a1a1a1-0000-4000-8000-000000000002';
const FILED = 'a1a1a1a1-0000-4000-8000-000000000003';
const row = (id: string, status: string, title: string) => ({
  id, catalogKey: '510k', programType: '510k', variant: 'device', title, status, decision: null,
  fdaTrackingNumber: status === 'draft' ? null : 'K261111', filedAt: status === 'draft' ? null : '2026-09-01T00:00:00Z',
  decisionDueAt: null, projectId: 12,
});
const FILINGS = [row(DRAFT_A, 'draft', 'Pump 510(k)'), row(DRAFT_B, 'draft', 'Pump PMA'), row(FILED, 'under_review', 'Sensor 510(k)')];
const BLOCKED = { assessed: true, filingId: DRAFT_A, programId: 'p', readiness: { canFileNow: false, blockers: ['Content incomplete (40%): missing required sections Biocompatibility.', 'Cannot produce a submittable eSTAR: the field map is not populated/verified.'] } };
const CLEAR = { assessed: true, filingId: DRAFT_B, programId: 'p', readiness: { canFileNow: true, blockers: [] } };
const NO_PROJECT = { assessed: false, reason: 'no_project', filingId: DRAFT_B, message: "Readiness is assessed against a project's own authored content, and this filing is tracked under no project." };

const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response;
let gates: Record<string, () => Response>;
let events: () => Response;
const detail = (id: string): TaskFilingHome => ({
  filing: { ...row(id, 'draft', 'Pump 510(k)'), reviewGoalDays: 90, filedArtifactDocumentId: null, filedArtifactSha256: null, notes: null,
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', filedAt: null, decision: null, fdaTrackingNumber: null },
  home: { source: 'filing', nativeId: id, projectId: 12, programId: 'p', programTitle: 'Pump' },
});

beforeEach(() => {
  apiRequest.mockReset(); clearNavParams();
  window.history.replaceState(null, '', '/concept2cure/submissions');
  gates = { [DRAFT_A]: () => ok(BLOCKED), [DRAFT_B]: () => ok(CLEAR) };
  events = () => ok({ events: [
    { id: 1, eventType: 'imported_package', fromStatus: null, toStatus: 'draft', actorUserId: null, actorName: null, detail: { packageId: 'pkg_1', packageStatus: 'completed' }, occurredAt: '2026-08-01T00:00:00.000Z' },
    { id: 2, eventType: 'imported_milestone', fromStatus: null, toStatus: null, actorUserId: 6, actorName: 'QA Lead', detail: { title: 'Biocompatibility report final', gateStatus: 'passed' }, occurredAt: '2026-08-20T00:00:00.000Z' },
    { id: 3, eventType: 'status_changed', fromStatus: 'draft', toStatus: 'withdrawn', actorUserId: 5, actorName: null, detail: {}, occurredAt: '2026-10-30T00:00:00.000Z' },
  ] });
  apiRequest.mockImplementation(async (method: string, path: string) => {
    const gate = /^\/api\/510k\/estar\/submissions\/([^/]+)\/readiness$/.exec(path);
    if (gate) return (gates[gate[1]] ?? (() => ok({}, 500)))();
    if (/^\/api\/510k\/estar\/submissions\/[^/]+\/events$/.test(path)) return events();
    if (path === '/api/510k/estar/submissions') return ok({ submissions: FILINGS });
    if (path.startsWith('/api/task-management/filings/')) return ok({ success: true, data: detail(path.split('/').at(-1)!) });
    if (method === 'POST' && path === '/api/510k/estar/assemble') return ok({ artifactKind: 'none', blockers: [] });
    return ok([]);
  });
});
afterEach(() => { cleanup(); clearNavParams(); window.history.replaceState(null, '', '/'); });

const mount = () => render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
const filingRow = async (title: string) => (await screen.findByText(title)).closest('tr') as HTMLElement;
const gateCalls = () => apiRequest.mock.calls.filter(([, p]) => /\/readiness$/.test(String(p)));

describe('the status filter', () => {
  it('offers only the statuses the list holds, each with its count, and shows only that status', async () => {
    mount();
    await filingRow('Sensor 510(k)');
    const filter = screen.getByLabelText('Device filing status') as HTMLSelectElement;
    expect([...filter.options].map((o) => o.textContent)).toEqual(['All statuses (3)', 'Draft (2)', 'Under review (1)']);
    fireEvent.change(filter, { target: { value: 'under_review' } });
    expect(screen.queryByText('Pump 510(k)')).toBeNull();
    expect(screen.getByText('Sensor 510(k)')).toBeTruthy();
    fireEvent.change(filter, { target: { value: 'draft' } });
    expect(screen.queryByText('Sensor 510(k)')).toBeNull();
    expect(screen.getByText('Pump 510(k)')).toBeTruthy();
    expect(screen.getByText('Pump PMA')).toBeTruthy();
  });
});

describe("each draft filing's gate, from its own readiness", () => {
  it('names every blocker of a blocked filing, and says "Can file now" only where the assessment did', async () => {
    mount();
    const blocked = within(await filingRow('Pump 510(k)'));
    await waitFor(() => expect(blocked.getByText('Blocked · 2 blockers')).toBeTruthy());
    expect(blocked.getByText(/missing required sections Biocompatibility/)).toBeTruthy();
    expect(blocked.getByText(/field map is not populated/)).toBeTruthy();
    const clear = within(await filingRow('Pump PMA'));
    await waitFor(() => expect(clear.getByText('Can file now')).toBeTruthy());
  });

  it('asks only for drafts: a filing past draft is not assessed for filing', async () => {
    mount();
    const filed = within(await filingRow('Sensor 510(k)'));
    expect(filed.getByText('Filed: readiness is assessed before filing')).toBeTruthy();
    await waitFor(() => expect(gateCalls()).toHaveLength(2));
    expect(gateCalls().map(([, p]) => p)).not.toContain(`/api/510k/estar/submissions/${FILED}/readiness`);
  });

  it('a filing with no project is not assessed, and says why', async () => {
    gates[DRAFT_B] = () => ok(NO_PROJECT);
    mount();
    const r = within(await filingRow('Pump PMA'));
    await waitFor(() => expect(r.getByText(/Not assessed: tracked under no project/)).toBeTruthy());
    expect(r.queryByText('Can file now')).toBeNull();
  });

  it('a failed read is an error with a retry, never a verdict', async () => {
    gates[DRAFT_A] = () => ok({ error: 'down' }, 503);
    mount();
    const r = within(await filingRow('Pump 510(k)'));
    await waitFor(() => expect(r.getByText("Couldn't read this filing's readiness")).toBeTruthy());
    expect(r.queryByText('Can file now')).toBeNull();
    expect(r.queryByText(/Blocked/)).toBeNull();
    gates[DRAFT_A] = () => ok(BLOCKED);
    fireEvent.click(r.getByRole('button', { name: 'Retry readiness for Pump 510(k)' }));
    await waitFor(() => expect(r.getByText('Blocked · 2 blockers')).toBeTruthy());
  });
});

/* Moved from mdx/workbench/__tests__/SubmissionsSurface.noInventedTarget.test.tsx,
   the retired device-submission screen's suite: the same rules, on the screen
   that holds the device filings now. */
describe('what the retired screen pinned, on the device filings', () => {
  it('a readiness read in flight is said to be one, and is no verdict', async () => {
    let release: (r: Response) => void = () => {};
    gates[DRAFT_A] = () => new Promise<Response>((r) => { release = r; }) as unknown as Response;
    mount();
    const r = within(await filingRow('Pump 510(k)'));
    expect(r.getByText('Reading readiness…')).toBeTruthy();
    expect(r.queryByText('Can file now')).toBeNull();
    release(ok(BLOCKED));
    await waitFor(() => expect(r.getByText('Blocked · 2 blockers')).toBeTruthy());
  });

  it('a 200 that is not a gate is an unreadable gate, never a verdict', async () => {
    gates[DRAFT_B] = () => ok({ readiness: { canFileNow: true } });
    mount();
    const r = within(await filingRow('Pump PMA'));
    await waitFor(() => expect(r.getByText("Couldn't read this filing's readiness")).toBeTruthy());
    expect(r.queryByText('Can file now')).toBeNull();
  });

  it('names no receiving authority, transmitter or signature the record does not carry', async () => {
    mount();
    await filingRow('Sensor 510(k)');
    const card = (screen.getByText('Device filings · eSTAR').closest('.pj-card') as HTMLElement).textContent ?? '';
    for (const invented of ['TÜV', 'FDA · ESG', 'notified body', 'Transmit', 'E-signature', 'Cover letter']) {
      expect(card, invented).not.toContain(invented);
    }
  });
});

describe("each filing's history, on its record", () => {
  const open = async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Open tracked filing Pump 510(k)' }));
    return screen.findByTestId('tracked-filing-history');
  };

  it('lists the events in order, with who and what, and an unknown person as —', async () => {
    const history = within(await open());
    await waitFor(() => expect(history.getAllByRole('listitem')).toHaveLength(3));
    const items = history.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(items[0]).toMatch(/Migrated from submission package pkg_1 \(package recorded completed\)/);
    expect(items[0]).toMatch(/—/);
    expect(items[1]).toMatch(/Package milestone: Biocompatibility report final \(passed\)/);
    expect(items[1]).toMatch(/QA Lead/);
    expect(items[2]).toMatch(/Status changed from Draft to Withdrawn/);
    expect(items[2]).toMatch(/User #5/);
  });

  it('an empty history is said to be empty, and a failed read to have failed', async () => {
    events = () => ok({ events: [] });
    let history = within(await open());
    expect(await history.findByText(/No events are recorded for this filing/)).toBeTruthy();
    cleanup();
    events = () => ok({ error: 'x' }, 500);
    history = within(await open());
    expect(await history.findByText("Couldn't read this filing's history.")).toBeTruthy();
    expect(history.getByRole('button', { name: 'Retry history' })).toBeTruthy();
    cleanup();
    // A 200 that is not a list of events is a failed read, not an empty history.
    events = () => ok({ events: { not: 'a list' } });
    history = within(await open());
    expect(await history.findByText("Couldn't read this filing's history.")).toBeTruthy();
    expect(history.queryByText(/No events are recorded/)).toBeNull();
  });
});
