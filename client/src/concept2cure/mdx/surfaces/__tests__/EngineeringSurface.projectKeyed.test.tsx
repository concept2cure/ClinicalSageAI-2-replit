// @vitest-environment jsdom
/**
 * Slice 0 (.design/client-journey/INFORMATION_ARCHITECTURE.md, the
 * `device-engineering` row): a panel whose store has no program column is not
 * shown on a project's engineering screen.
 *
 * GET /api/mdx/engineering/:programId reads four of its panels — the design
 * history file (cerv2_510k_sections), the design-controls trace
 * (c2c_design_controls), change requests (change_requests) and
 * non-conformances (qms_nonconforming_products) — by organisation only, and
 * says so in `meta.scopes` (server/routes/mdx-engineering.ts:523-530). The
 * screen drew their rows under the open project's name with a small
 * "Organization-wide" pill, so a device project showed another project's DHF
 * sections, change requests and non-conformances — and listed the same rows
 * again in "What's blocking your documents".
 *
 * Until those reads are keyed to the project, each of the four panels says why
 * it is not shown, and none of their rows reach the blocker feed. The risk
 * file is read by project and keeps rendering; a panel the server reports as
 * keyed renders again with no client change.
 *
 * Audit of the first pass (same defect, same keys): the "Open change requests"
 * and "DHF completion" cards printed `summary.openEcrs` / `summary.dhfCompletion`,
 * which the route counts over the same organisation-wide rows; the documents
 * panel and its four card values read artifacts by organisation only (the
 * route reports `documents: 'organization'`); "0 hard blockers" was zero by
 * construction once DHF and non-conformances were left out; and an empty risk
 * file read "No unverified risks were found" / "All risks verified".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent, screen } from '@testing-library/react';
import { EngineeringSurface } from '../EngineeringSurface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROGRAM = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  title: 'ENG-1 Sensor',
  code: 'ENG-1',
} as unknown as Program;

/** Rows an organisation-wide read returns: they belong to another project. */
const OTHER_PROJECT = {
  dhf: [{ id: 'd1', num: '7', label: 'Other project biocompatibility', ver: 'v1', owner: 'A', updated: '1d', status: 'blocked', meta: 'ISO 10993' }],
  trace: [
    { id: 't1', need: 'n', input: 'i', output: 'o', verif: 'v', valid: 'va', risk: 'r', state: 'verified' },
    { id: 't2', need: 'n', input: 'i', output: 'o', verif: 'v', valid: 'va', risk: 'r', state: 'open' },
  ],
  ecrs: [{ id: 'ECR-OTHER-9', title: 'Other project housing change', impact: 'low', opened: '2d', state: 'open', owner: 'B', riskChange: 'none', linked: '—' }],
  issues: [{ id: 'NC-OTHER-4', title: 'Other project weld defect', severity: 'high', age: '3d', owner: '—', state: 'open', linked: '—' }],
};

/** This project's risk file, read by project. */
const OWN_RISK = {
  id: 'R-OWN-1', hazard: 'Own project sensor drift', situation: 's', harm: 'Missed hypoglycaemia',
  severity: 'S4', probBefore: 'P3', controlClass: 'design', control: 'c', verif: 'v', probAfter: 'P2',
  residual: 'S4P2', state: 'open', owner: 'C',
};

/** The route's own scope report today. */
const ROUTE_SCOPES = {
  risks: 'program', trace: 'organization', dhf: 'organization',
  ecrs: 'organization', issues: 'organization', documents: 'organization',
};

const NOT_KEYED = /Shown once this screen reads this project's records/;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

function respond(opts: {
  risks?: unknown[];
  scopes?: Record<string, string> | undefined;
  summary?: Record<string, unknown>;
  documents?: unknown[];
}) {
  const data = {
    summary: { dhfCompletion: 0, openEcrs: 1, openRisks: 1, openIssues: 1, riskLastUpdated: null, ...opts.summary },
    ...OTHER_PROJECT,
    risks: opts.risks ?? [OWN_RISK],
    documents: opts.documents ?? [],
  };
  const meta: Record<string, unknown> = { unavailable: [] };
  if (opts.scopes) meta.scopes = opts.scopes;
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data, meta }),
    text: async () => '',
  });
}

function mount() {
  const utils = render(
    <EngineeringSurface program={PROGRAM} onAskAna={() => {}} onOpenEditor={() => {}} />,
  );
  return utils;
}

async function loadedAndExpanded(container: HTMLElement) {
  await waitFor(() => expect(container.textContent ?? '').not.toMatch(/Loading/i));
  const toggle = container.querySelector('[aria-expanded]') as HTMLElement | null;
  expect(toggle, 'the awareness accordion toggle must exist').not.toBeNull();
  fireEvent.click(toggle as HTMLElement);
}

const text = (c: HTMLElement) => c.textContent ?? '';

/** The metric card whose label is `label`. */
function card(c: HTMLElement, label: string): HTMLElement {
  const found = Array.from(c.querySelectorAll<HTMLElement>('.metric-card')).find(
    (el) => el.querySelector('.metric-label')?.textContent === label,
  );
  expect(found, `metric card "${label}" must render`).toBeTruthy();
  return found as HTMLElement;
}

/** The sub-head of "What's blocking your documents". */
function blockerSub(c: HTMLElement): string {
  const head = Array.from(c.querySelectorAll('.section-head')).find((h) =>
    /What.s blocking your documents/.test(h.querySelector('h2')?.textContent ?? ''),
  );
  return head?.querySelector('.section-sub')?.textContent ?? '';
}

/** Another project's Module 3/4 artifact, as the organisation-wide documents read returns it. */
const OTHER_DOC = {
  id: 'art-77', framework: 'cfr820', type: 'Artifact', title: 'Other project design plan', ver: 'v2',
  status: 'ready', completion: 100, owner: '—', lastEdit: '1d', sections: 0, sectionsComplete: 0,
};

/** The checkCircle icon's path: the all-clear's success mark. */
const CHECK_CIRCLE_PATH = 'M9 11l3 3 8-8';

describe('EngineeringSurface — panels that read across projects are not shown (slice 0)', () => {
  it("shows none of another project's DHF, trace, change-request or non-conformance rows", async () => {
    respond({ scopes: ROUTE_SCOPES });
    const { container } = mount();
    await loadedAndExpanded(container);

    expect(text(container)).not.toMatch(/Other project biocompatibility/);
    expect(text(container)).not.toMatch(/traceability rows tracked/);
    expect(text(container)).not.toMatch(/ECR-OTHER-9|Other project housing change/);
    expect(text(container)).not.toMatch(/NC-OTHER-4|Other project weld defect/);
  });

  it('says why each of the four panels is not shown', async () => {
    respond({ scopes: ROUTE_SCOPES });
    const { container } = mount();
    await loadedAndExpanded(container);

    for (const id of ['dhf', 'trace', 'ecrs', 'issues']) {
      const note = container.querySelector(`[data-testid="eng-not-keyed-${id}"]`);
      expect(note, `panel ${id} must say why it is not shown`).not.toBeNull();
      expect(note?.textContent ?? '').toMatch(NOT_KEYED);
    }
  });

  it('keeps this project’s risk file in the blocker feed and the risk panel', async () => {
    // Over-correction guard: the risk file is read by project.
    respond({ scopes: ROUTE_SCOPES });
    const { container } = mount();
    await loadedAndExpanded(container);

    expect(container.querySelector('.eng-blockers-feed')?.textContent ?? '').toMatch(/R-OWN-1/);
    expect(container.querySelector('.eng-risks')?.textContent ?? '').toMatch(/Own project sensor drift/);
    // The review-pending count is of what was read; the hard-blocker count is
    // not printed while the only sources that can raise one are left out.
    expect(blockerSub(container)).toMatch(/1 review-pending/);
    expect(blockerSub(container)).not.toMatch(/\d+ hard blockers/);
    expect(blockerSub(container)).toMatch(/hard blockers not counted: DHF sections and non-conformances are left out/i);
  });

  it('does not claim change requests or non-conformances were checked when they were not read for the project', async () => {
    respond({ scopes: ROUTE_SCOPES, risks: [] });
    const { container } = mount();
    await waitFor(() => expect(text(container)).not.toMatch(/Loading/i));

    const allClear = screen.getByTestId('eng-no-blockers');
    expect(allClear.textContent ?? '').not.toMatch(/Nothing is blocking your documents/);
    expect(allClear.textContent ?? '').not.toMatch(/open change requests or non-conformances were found/);
    // An empty risk file is nothing assessed, not "no unverified risks found".
    expect(allClear.textContent ?? '').not.toMatch(/No unverified risks were found/);
    expect(blockerSub(container)).not.toMatch(/0 hard blockers/);
    expect(blockerSub(container)).toMatch(/hard blockers not counted/i);
  });

  it('says an empty risk file has nothing to check, not that every risk is verified', async () => {
    respond({ scopes: ROUTE_SCOPES, risks: [], summary: { openRisks: 0 } });
    const { container } = mount();
    await waitFor(() => expect(text(container)).not.toMatch(/Loading/i));

    const allClear = screen.getByTestId('eng-no-blockers');
    expect(allClear.textContent ?? '').toMatch(/No risk records for this project yet/);
    expect(allClear.textContent ?? '').toMatch(
      /Nothing has been recorded in this project's risk file, so there is nothing to check yet\./,
    );
    expect(allClear.innerHTML).not.toContain(CHECK_CIRCLE_PATH);
    expect(card(container, 'Open risks').textContent ?? '').toMatch(/No risks recorded/);
    expect(card(container, 'Open risks').textContent ?? '').not.toMatch(/All risks verified/);
  });

  it('keeps the all-clear when the risk file has records and all are verified', async () => {
    // Over-correction guard: a read risk file with every risk verified is good news.
    respond({ scopes: ROUTE_SCOPES, risks: [{ ...OWN_RISK, state: 'verified' }], summary: { openRisks: 0 } });
    const { container } = mount();
    await waitFor(() => expect(text(container)).not.toMatch(/Loading/i));

    const allClear = screen.getByTestId('eng-no-blockers');
    expect(allClear.textContent ?? '').toMatch(/No unverified risks were found/);
    expect(allClear.innerHTML).toContain(CHECK_CIRCLE_PATH);
    expect(card(container, 'Open risks').textContent ?? '').toMatch(/All risks verified/);
  });

  it('treats an unreported scope as not keyed (fail closed)', async () => {
    respond({ scopes: undefined });
    const { container } = mount();
    await loadedAndExpanded(container);

    expect(text(container)).not.toMatch(/Other project biocompatibility/);
    expect(text(container)).not.toMatch(/ECR-OTHER-9/);
  });

  it('renders the panels again once the route reports them keyed to the project', async () => {
    // The panels come back with no client change when slice 19 keys the stores.
    respond({
      scopes: { ...ROUTE_SCOPES, trace: 'program', dhf: 'program', ecrs: 'program', issues: 'program' },
    });
    const { container } = mount();
    await loadedAndExpanded(container);

    expect(text(container)).toMatch(/Other project biocompatibility/);
    expect(text(container)).toMatch(/2 traceability rows tracked/);
    expect(text(container)).toMatch(/1 change requests/);
    expect(text(container)).toMatch(/1 non-conformances/);
    expect(container.querySelector('.eng-blockers-feed')?.textContent ?? '').toMatch(/ECR-OTHER-9/);
    expect(container.querySelector('[data-testid^="eng-not-keyed-"]')).toBeNull();
    // With every source read, the hard-blocker count is a count again.
    expect(blockerSub(container)).toMatch(/2 hard blockers/);
  });

  it("does not print the organisation's change-request count or DHF completion as this project's", async () => {
    respond({ scopes: ROUTE_SCOPES, summary: { openEcrs: 5, dhfCompletion: 64 } });
    const { container } = mount();
    await waitFor(() => expect(text(container)).not.toMatch(/Loading/i));

    const ecr = card(container, 'Open change requests');
    const dhfCard = card(container, 'DHF completion');
    expect(ecr.querySelector('.metric-val')?.textContent).not.toMatch(/5/);
    expect(dhfCard.querySelector('.metric-val')?.textContent).not.toMatch(/64/);
    expect(ecr.textContent ?? '').toMatch(NOT_KEYED);
    expect(dhfCard.textContent ?? '').toMatch(NOT_KEYED);
    // The change-request card no longer carries document counts in its meta line.
    expect(ecr.textContent ?? '').not.toMatch(/blocked|awaiting signature/);
  });

  it('prints them once the route reports change requests and the DHF keyed to the project', async () => {
    respond({
      scopes: { ...ROUTE_SCOPES, ecrs: 'program', dhf: 'program' },
      summary: { openEcrs: 5, dhfCompletion: 64 },
    });
    const { container } = mount();
    await waitFor(() => expect(text(container)).not.toMatch(/Loading/i));

    expect(card(container, 'Open change requests').querySelector('.metric-val')?.textContent).toBe('5');
    expect(card(container, 'DHF completion').querySelector('.metric-val')?.textContent).toBe('64%');
  });

  it("does not list or count the organisation's documents as this project's", async () => {
    respond({ scopes: ROUTE_SCOPES, documents: [OTHER_DOC] });
    const { container } = mount();
    await waitFor(() => expect(text(container)).not.toMatch(/Loading/i));

    expect(text(container)).not.toMatch(/Other project design plan/);
    const docs = card(container, 'Documents in flight');
    expect(docs.querySelector('.metric-val')?.textContent).not.toBe('1');
    expect(docs.textContent ?? '').not.toMatch(/1 ready/);
    expect(docs.textContent ?? '').toMatch(NOT_KEYED);
    expect(card(container, 'DHF completion').textContent ?? '').not.toMatch(/avg doc 100%/);
    const note = screen.getByTestId('eng-not-keyed-documents');
    expect(note.textContent ?? '').toMatch(NOT_KEYED);
  });

  it('lists and counts the documents once the route reports them keyed to the project', async () => {
    respond({ scopes: { ...ROUTE_SCOPES, documents: 'program' }, documents: [OTHER_DOC] });
    const { container } = mount();
    await waitFor(() => expect(text(container)).not.toMatch(/Loading/i));

    expect(text(container)).toMatch(/Other project design plan/);
    expect(card(container, 'Documents in flight').querySelector('.metric-val')?.textContent).toBe('1');
    expect(screen.queryByTestId('eng-not-keyed-documents')).toBeNull();
  });

  it('says in plain words why a panel is not shown', async () => {
    respond({ scopes: ROUTE_SCOPES });
    const { container } = mount();
    await loadedAndExpanded(container);

    const note = screen.getByTestId('eng-not-keyed-dhf').textContent ?? '';
    expect(note).toMatch(
      /Shown once this screen reads this project's records\. These records are held for the whole organization, not per project, so they are not shown here\./,
    );
    expect(note).not.toMatch(/\bstore\b|\bkeyed\b/);
  });

  it('does not say the records are organization-wide when the route did not report it', async () => {
    respond({ scopes: undefined });
    const { container } = mount();
    await loadedAndExpanded(container);

    const note = screen.getByTestId('eng-not-keyed-dhf').textContent ?? '';
    expect(note).toMatch(NOT_KEYED);
    expect(note).not.toMatch(/held for the whole organization/);
  });

  /* Audit 2 of slice 0: an organisation with no rows never reaches the
     NotKeyedNote (it renders in the gate's ready branch), so the gate's empty
     hint is what the person reads — and it promised records would "appear
     here", which they would not until the read is keyed. */
  function respondEmptyOrganization(scopes: Record<string, string> | undefined) {
    const data = {
      summary: { dhfCompletion: 0, openEcrs: 0, openRisks: 1, openIssues: 0, riskLastUpdated: null },
      dhf: [], trace: [], ecrs: [], issues: [], documents: [],
      risks: [OWN_RISK],
    };
    const meta: Record<string, unknown> = { unavailable: [] };
    if (scopes) meta.scopes = scopes;
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data, meta }), text: async () => '' });
  }
  const emptyGates = (c: HTMLElement) =>
    Array.from(c.querySelectorAll<HTMLElement>('[data-testid="data-gate-empty"]'));

  it('does not promise that records appear here while the read is not keyed to the project', async () => {
    respondEmptyOrganization(ROUTE_SCOPES);
    const { container } = mount();
    await loadedAndExpanded(container);

    const gates = emptyGates(container);
    // documents, DHF, trace, change requests, non-conformances
    expect(gates.length).toBe(5);
    for (const g of gates) {
      const t = g.textContent ?? '';
      expect(t).not.toMatch(/appear here|once artifacts exist|once design controls are recorded/);
      expect(t).toMatch(/Nothing is recorded for the organization\./);
      expect(t).toMatch(/Records are shown here once this screen reads this project's records\./);
    }
  });

  it('does not say an unreported read is organization-wide in its empty hint', async () => {
    respondEmptyOrganization(undefined);
    const { container } = mount();
    await loadedAndExpanded(container);

    const gates = emptyGates(container);
    expect(gates.length).toBe(5);
    for (const g of gates) {
      expect(g.textContent ?? '').not.toMatch(/appear here|for the organization/);
      expect(g.textContent ?? '').toMatch(/Records are shown here once this screen reads this project's records\./);
    }
  });

  it('keeps the original empty hints once the route reports the panels keyed to the project', async () => {
    // Over-correction guard: once keyed, records do appear here.
    respondEmptyOrganization({ ...ROUTE_SCOPES, trace: 'program', dhf: 'program', ecrs: 'program', issues: 'program', documents: 'program' });
    const { container } = mount();
    await loadedAndExpanded(container);

    expect(text(container)).toMatch(/Device-category sections appear here once the 510\(k\) section set is created\./);
    expect(text(container)).toMatch(/Engineering change requests appear here as they are raised\./);
    expect(text(container)).not.toMatch(/Nothing is recorded for the organization/);
  });

  it('shows a failed read as a failure, not as a panel waiting to be keyed', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => '',
    });
    const { container } = mount();
    await waitFor(() => expect(text(container)).not.toMatch(/Loading/i));
    fireEvent.click(container.querySelector('[aria-expanded]') as HTMLElement);

    expect(container.querySelector('[data-testid^="eng-not-keyed-"]')).toBeNull();
    expect(text(container)).toMatch(/Could not load DHF sections/);
    expect(text(container)).toMatch(/Could not load change requests/);
  });
});
