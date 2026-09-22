// @vitest-environment jsdom
/**
 * Protocol workspace — the IRB package tab.
 *
 * `docs/design/IRB_SUBMISSION.md` step 4, and decisions D3 and D4. The pane
 * renders `GET /api/irb/submissions/:id/package-manifest` and nothing else: it
 * scores nothing, re-derives nothing, and decides nothing about the study.
 *
 * The assertions that matter most here are negative ones, and each names the
 * defect it exists to catch:
 *
 *   • AN UNLINKED IRB SUBMISSION IS NOT AN EMPTY PACKAGE. When
 *     `linkedSubmissionId` is null the engine still returns a full row set —
 *     every row with nothing placed — because there is no Submission Center
 *     submission to place anything in. Rendering those rows would present "no
 *     package exists" as "a package that is missing everything", which is a
 *     different fact and a worse one. The pane must say there is no package and
 *     show no rows;
 *   • A FAILED READ IS NOT AN EMPTY MANIFEST (CLAUDE.md — an error is never
 *     rendered as an empty result);
 *   • THERE IS NO PERCENTAGE. A figure computed over requirements that could
 *     not be decided describes an undecided package as a nearly finished one —
 *     the defect this codebase has already been burned by. This file asserts
 *     the absence of the character itself;
 *   • D3 — the platform never claims a delivery it did not perform. No IRB has
 *     a universal electronic gateway, so the words "transmitted" and "sent to
 *     the IRB" must not appear anywhere on the pane;
 *   • an `undetermined` requirement reads as a gap in what was RECORDED, names
 *     the field that would settle it, and is never drawn as satisfied.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProtocolWorkspace } from '../surfaces/ProtocolDev';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;
const boom = (status: number, message: string) =>
  ({ ok: false, status, json: async () => ({ error: { code: 'INTERNAL', message } }) }) as Response;

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const BASE_DOC = {
  id: '41', title: 'A Phase III Study of BX-204', shortTitle: 'BX-204-301', kind: 'clinical',
  version: '0.7', status: 'draft', sponsor: 'Sponsor', pi: 'PI', updated: '2026-09-20',
  completeness: 68, openSection: 's1',
  sections: [{ id: 's1', num: '1', title: 'Background', status: 'draft', required: true }],
  content: {}, objectives: [], eligibility: { inclusion: [], exclusion: [] },
  soa: { visits: [], assessments: [], cells: {}, issues: [] }, risks: [], milestones: [],
  budget: { params: null, items: [], summary: null }, amendments: [], deviations: [],
  reviews: [], consent: [], completenessFindings: [], studyDesign: null,
};

/** As `GET /api/irb/submissions` returns them — raw columns, snake_case. */
const IRB_ROWS = [
  { id: 7, study_id: null, submission_id: 12, protocol_number: 'BX-204-301', title: 'BX-204 ethics submission', status: 'draft' },
];

/**
 * As `buildPackageManifest()` shapes it. Deliberately carries one of every
 * outcome: a satisfied required row, a required row whose only placement is a
 * placeholder, an undetermined row with its settling field, a conditional, an
 * optional and a not-required row.
 */
const MANIFEST = {
  rows: [
    {
      slot: 'irb.protocol', label: 'Protocol', requirement: 'required',
      basis: '21 CFR 56.115(a)(1) — the board keeps the protocol and consent documents on file',
      placed: [{ slot: 'irb.protocol', leafId: 501, title: 'BX-204-301 protocol v0.7', resolvable: true }],
      satisfied: true, unresolvable: 0,
    },
    {
      slot: 'irb.consent', label: 'Informed consent document', requirement: 'required',
      basis: '21 CFR 50.25 — the elements of informed consent',
      placed: [{ slot: 'irb.consent', leafId: 502, title: 'Main consent form', resolvable: false }],
      satisfied: false, unresolvable: 1,
    },
    {
      slot: 'irb.form-1572', label: 'Form FDA 1572', requirement: 'undetermined',
      basis: "21 CFR 312.53(c) — Form FDA 1572 and the investigator's qualifications. This submission does not record whether it applies, so the requirement could not be decided.",
      settledBy: 'isIndStudy',
      placed: [], satisfied: false, unresolvable: 0,
    },
    {
      slot: 'irb.safety-monitoring-plan', label: 'Safety monitoring plan', requirement: 'conditional',
      basis: '21 CFR 56.111(a)(6) — data monitoring for subject safety. This submission records greater-than-minimal risk.',
      placed: [{ slot: 'irb.safety-monitoring-plan', leafId: 503, title: 'DSMB charter', resolvable: true }],
      satisfied: true, unresolvable: 0,
    },
    {
      slot: 'irb.investigator-brochure', label: "Investigator's brochure", requirement: 'optional',
      basis: 'Expected where an investigational product has one',
      placed: [], satisfied: false, unresolvable: 0,
    },
    {
      slot: 'irb.assent', label: 'Child assent form', requirement: 'not_required',
      basis: 'This submission records that no children are involved.',
      placed: [], satisfied: false, unresolvable: 0,
    },
  ],
  counts: {
    required: 2, requiredSatisfied: 1, conditional: 1, conditionalSatisfied: 1,
    undetermined: 1, unresolvable: 1, unexpected: 0,
  },
  readyToAssemble: false,
  unexpectedSlots: [],
};

interface RouteOptions {
  submissions?: unknown;
  submissionsStatus?: number;
  linkedSubmissionId?: number | null;
  manifestStatus?: number;
}

function route(opts: RouteOptions = {}) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/protocol-dev')) return ok({ success: true, data: [BASE_DOC] });
    if (method === 'GET' && url === '/api/irb/submissions') {
      if (opts.submissionsStatus) return boom(opts.submissionsStatus, 'The IRB register did not answer.');
      return ok(opts.submissions ?? IRB_ROWS);
    }
    if (method === 'GET' && url.startsWith('/api/irb/submissions/7/package-manifest')) {
      if (opts.manifestStatus) return boom(opts.manifestStatus, 'The manifest could not be built.');
      return ok({
        irbSubmissionId: 7,
        linkedSubmissionId: opts.linkedSubmissionId === undefined ? 12 : opts.linkedSubmissionId,
        manifest: MANIFEST,
      });
    }
    return ok({});
  });
}

const props = () => ({ surface: { id: 'protocol-dev', label: 'Protocol', navTier: 'project' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

async function openTab(opts: RouteOptions = {}) {
  route(opts);
  render(<Providers><ProtocolWorkspace {...props()} /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: /IRB package/ }));
}

/** This tab's own pane. The protocol's left-hand outline renders the DOCUMENT's
 *  completeness percentage on every tab, so every assertion here is scoped. */
const pane = () => screen.getByRole('region', { name: 'IRB package' });
const rows = () => Array.from(pane().querySelectorAll('[data-slot]'));

beforeEach(() => { apiRequest.mockReset(); });
afterEach(() => cleanup());

describe('protocol-dev — IRB package tab', () => {
  it('says there is NO PACKAGE when the IRB submission was never linked, and shows no rows', async () => {
    await openTab({ linkedSubmissionId: null });
    const p = await within(pane()).findByText(/never been linked/i);
    expect(p).toBeTruthy();
    // The defect: an unlinked submission rendered as a package missing everything.
    expect(rows()).toHaveLength(0);
    expect(pane().textContent ?? '').not.toContain('Form FDA 1572');
    expect(within(pane()).getByText(/not a package with nothing in it/i)).toBeTruthy();
  });

  it('says the read FAILED rather than drawing an empty manifest', async () => {
    await openTab({ manifestStatus: 503 });
    const alert = await within(pane()).findByRole('alert');
    expect(alert.textContent ?? '').toMatch(/could not be read/i);
    expect(alert.textContent ?? '').toMatch(/manifest could not be built/i);
    // An error is never rendered as an empty result (CLAUDE.md).
    expect(rows()).toHaveLength(0);
    expect(pane().textContent ?? '').not.toMatch(/never been linked/i);
    expect(pane().textContent ?? '').not.toMatch(/no IRB submission is recorded/i);
  });

  it('says the read FAILED when the IRB register itself does not answer', async () => {
    await openTab({ submissionsStatus: 503 });
    const alert = await within(pane()).findByRole('alert');
    expect(alert.textContent ?? '').toMatch(/could not be read/i);
    expect(rows()).toHaveLength(0);
  });

  it('says so plainly when no IRB submission exists for this protocol', async () => {
    await openTab({ submissions: [] });
    expect(await within(pane()).findByText(/no IRB submission is recorded/i)).toBeTruthy();
    expect(rows()).toHaveLength(0);
  });

  it('renders NO percentage anywhere — the headline is counts', async () => {
    await openTab();
    await within(pane()).findByText(/Required artifacts placed/);
    const text = pane().textContent ?? '';
    expect(text).not.toContain('%');
    expect(text).not.toMatch(/\d+\s*%/);
  });

  it('shows an undetermined requirement’s settling field and never draws it as satisfied', async () => {
    await openTab();
    const r = await within(pane()).findByRole('group', { name: /Form FDA 1572/ });
    expect(r.getAttribute('data-requirement')).toBe('undetermined');
    expect(r.getAttribute('data-satisfied')).toBe('false');
    expect(within(r).getByText(/isIndStudy/)).toBeTruthy();
    expect(r.textContent ?? '').toMatch(/record it to decide this requirement/i);
    // Not a defect in the package — a gap in what was recorded.
    expect(r.textContent ?? '').toMatch(/recorded/i);
    expect(r.textContent ?? '').not.toMatch(/satisfied|complete|\bmet\b/i);
  });

  it('orders undetermined requirements first, because they are the actionable ones', async () => {
    await openTab();
    await within(pane()).findByText(/Required artifacts placed/);
    const order = Array.from(pane().querySelectorAll('[data-requirement-group]'))
      .map((el) => el.getAttribute('data-requirement-group'));
    expect(order[0]).toBe('undetermined');
    expect(order).toEqual(['undetermined', 'required', 'conditional', 'optional', 'not_required']);
  });

  it('shows an unresolvable placement and labels it a placeholder', async () => {
    await openTab();
    const r = await within(pane()).findByRole('group', { name: /Informed consent document/ });
    expect(within(r).getByText(/Main consent form/)).toBeTruthy();
    expect(within(r).getByText(/placeholder/i)).toBeTruthy();
    expect(within(r).getByText(/names no document/i)).toBeTruthy();
    expect(r.getAttribute('data-satisfied')).toBe('false');
  });

  it('explains IN WORDS why the package is not ready, naming the undecided requirements', async () => {
    await openTab();
    const why = await within(pane()).findByRole('group', { name: /not ready to assemble/i });
    expect(why.textContent ?? '').toMatch(/could not be decided/i);
    expect(why.textContent ?? '').toContain('Form FDA 1572');
    expect(why.textContent ?? '').toContain('Informed consent document');
  });

  it('never claims a delivery the platform did not perform (D3)', async () => {
    await openTab();
    await within(pane()).findByText(/Required artifacts placed/);
    const text = pane().textContent ?? '';
    expect(text).not.toMatch(/transmitted/i);
    expect(text).not.toMatch(/sent to the IRB/i);
  });

  it('states no verdict and names no review category (D4)', async () => {
    await openTab();
    await within(pane()).findByText(/Required artifacts placed/);
    const text = pane().textContent ?? '';
    expect(text).not.toMatch(/approvable|will be approved|exempt|expedited|full board/i);
  });
});
