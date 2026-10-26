// @vitest-environment jsdom
/**
 * Slice 0 of the placement map (.design/client-journey/INFORMATION_ARCHITECTURE.md,
 * the `device-software` row): an empty lifecycle-item list is not a dead end.
 *
 * A project with no software items rendered "No software lifecycle items yet"
 * with DataGate's fallback action, "Check again" — a refresh, which cannot
 * populate anything. The screen has no create form yet (slice 19), but AnA's
 * `create_software_lifecycle_item` runs in production because `device-software`
 * is in the launch catalog, so the empty state offers that, through the same
 * `onAskAna` the header's "Ask AnA" already uses. With no project open there is
 * no project to add to, so the action is not offered there.
 *
 * The same project's completeness panel sits directly above that button, so it
 * is pinned against the body the server really sends for it. For a project with
 * no lifecycle items `/api/mdx/software-summary/:id` answers docLevel
 * 'undetermined', completion / required / approved null, an empty matrix and a
 * reason (server/routes/mdx-software.ts, pinned by
 * server/routes/__tests__/mdx-software-summary.test.ts). The panel was typed and
 * drawn for the older shape: "Completeness %", " of  required deliverables
 * approved", a green "Approved /" card (null < null is false) captioned
 * "Required deliverables signed off", and the server's reason nowhere.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { SoftwareSurface } from '../SoftwareSurface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROGRAM = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  title: 'SW-1 Monitor',
  code: 'SW-1',
} as unknown as Program;

/* The route's empty-project body, field for field (mdx-software.ts, the
   `recordedLevels.length === 0` branch). `basis` carries the FDA citation; the
   panel does not read it. */
const EMPTY_PROJECT_REASON =
  'No software lifecycle items are recorded for this program, so the FDA Documentation Level (Basic or Enhanced) has not been determined and no completeness is computed.';
const EMPTY_PROJECT_SUMMARY = {
  docLevel: 'undetermined',
  recordedLevels: [],
  reason: EMPTY_PROJECT_REASON,
  completion: null,
  completionScope: null,
  required: null,
  approved: null,
  matrix: [],
  untracked: [],
  cybersecurity: null,
  basis: [],
};

/* The bodies below are the route's own, field for field except `basis`: a
   Basic, non-cyber project with its five tracked record kinds on file
   (srs, arch, system_test, release_note, anomaly_log), read back from
   server/routes/mdx-software.ts through the same in-memory pool
   mdx-software-summary.test.ts uses. For a determined level the route always
   names FDA documents no lifecycle kind records (`untracked`) and says, in
   `completionScope`, that the score is over the tracked records only. The
   fixtures here used to carry `untracked: []`, which the route never sends for
   a determined level — so a 100% over half of FDA's Basic set painted green. */
const BASIC_UNTRACKED = [
  { id: 'documentation_level_evaluation', title: 'Documentation Level evaluation' },
  { id: 'software_description', title: 'Software description' },
  { id: 'risk_management_file', title: 'System and software risk management file' },
  { id: 'development_practices', title: 'Software development, configuration management and maintenance practices' },
  { id: 'testing_summary', title: 'Software testing summary (unit, integration and system levels)' },
];
const BASIC_SCOPE =
  'Approved lifecycle records over the 5 required records this register tracks. ' +
  '5 recommended documents have no lifecycle item kind and are not counted: ' +
  'Documentation Level evaluation; Software description; System and software risk management file; ' +
  'Software development, configuration management and maintenance practices; ' +
  'Software testing summary (unit, integration and system levels).';
const basicMatrix = (approvedKinds: string[]) => [
  { kind: 'srs', documentation: 'srs', title: 'Software requirements specification (SRS)' },
  { kind: 'arch', documentation: 'architecture_design_chart', title: 'System and software architecture design chart' },
  { kind: 'system_test', documentation: 'system_test_protocol_report', title: 'System-level test protocol and report' },
  { kind: 'release_note', documentation: 'version_history', title: 'Software version history' },
  { kind: 'anomaly_log', documentation: 'unresolved_anomalies', title: 'Unresolved software anomalies' },
].map((m) => ({ ...m, required: true, present: true, approved: approvedKinds.includes(m.kind) }));

/* Every tracked record approved: the route's completion is 100. */
const ALL_TRACKED_APPROVED_SUMMARY = {
  docLevel: 'basic',
  recordedLevels: ['basic'],
  reason: null,
  completion: 100,
  completionScope: BASIC_SCOPE,
  required: 5,
  approved: 5,
  matrix: basicMatrix(['srs', 'arch', 'system_test', 'release_note', 'anomaly_log']),
  untracked: BASIC_UNTRACKED,
  cybersecurity: { status: 'not_required', rationale: 'The device is recorded as not a cyber device.', basis: [] },
  basis: [],
};

/* A level is recorded but cyber-device status is not: the route returns real
   counts over the matrix it tracks, a reason, and completion null. */
const CYBER_UNRECORDED_REASON =
  'Whether the device is a cyber device (FD&C Act §524B) is not recorded on the program, so the cybersecurity documentation is not known to be required or not, and no completeness is computed.';
const CYBER_UNRECORDED_SUMMARY = {
  ...ALL_TRACKED_APPROVED_SUMMARY,
  reason: CYBER_UNRECORDED_REASON,
  completion: null,
  cybersecurity: { status: 'undetermined', rationale: 'Whether the device is a cyber device (FD&C Act §524B) is not recorded.', basis: [] },
};

/* Determined and computed: two of the five tracked records approved. */
const SCORED_SUMMARY = {
  ...ALL_TRACKED_APPROVED_SUMMARY,
  completion: 40,
  approved: 2,
  matrix: basicMatrix(['srs', 'arch']),
};

let summaryBody: unknown = EMPTY_PROJECT_SUMMARY;
let itemsBody: unknown[] = [];

beforeEach(() => {
  summaryBody = EMPTY_PROJECT_SUMMARY;
  itemsBody = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () =>
      url.startsWith('/api/mdx/software-summary/')
        ? { data: summaryBody }
        : { data: itemsBody, meta: { count: itemsBody.length } },
  })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('SoftwareSurface — the empty lifecycle list offers a way to add an item', () => {
  it('offers "Ask AnA to add a lifecycle item" and sends AnA the request', async () => {
    const onAskAna = vi.fn();
    render(<SoftwareSurface program={PROGRAM} onAskAna={onAskAna} />);
    await waitFor(() => expect(screen.getByText('No software lifecycle items yet')).toBeTruthy());
    const ask = screen.getByRole('button', { name: 'Ask AnA to add a lifecycle item' });
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
    fireEvent.click(ask);
    expect(onAskAna).toHaveBeenCalledTimes(1);
    expect(onAskAna.mock.calls[0][0]).toMatch(/software lifecycle item/i);
    expect(onAskAna.mock.calls[0][0]).toMatch(/this project/);
  });

  it('does not offer it with no project open, where there is no project to add to', async () => {
    render(<SoftwareSurface program={null} onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('No software lifecycle items yet')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Ask AnA to add a lifecycle item' })).toBeNull();
  });
});

const metricCard = (container: HTMLElement, label: string) =>
  Array.from(container.querySelectorAll<HTMLElement>('.metric-card')).find(
    (c) => c.querySelector('.metric-label')?.textContent === label,
  );

describe('SoftwareSurface — nothing assessed is not assessed and clear', () => {
  it('a project with no lifecycle items: no score, no green card, and the server says why', async () => {
    const { container } = render(<SoftwareSurface program={PROGRAM} onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('No software lifecycle items yet')).toBeTruthy());
    await waitFor(() => expect(metricCard(container, 'Completeness')).toBeTruthy());

    // Nothing recorded is not "signed off".
    expect(
      Array.from(container.querySelectorAll('.metric-card[data-tone="ok"]')).map((c) => c.textContent),
    ).toEqual([]);
    // The reason the route gives is what the reader is owed.
    expect(screen.getByText(EMPTY_PROJECT_REASON)).toBeTruthy();
    expect(metricCard(container, 'Completeness')!.getAttribute('data-tone')).toBeNull();
    expect(metricCard(container, 'Completeness')!.querySelector('.metric-val')!.textContent).toBe('Not determined');
    // No number-shaped sentence with the numbers missing.
    const text = container.textContent ?? '';
    expect(text).not.toContain(' of  required');
    expect(text).not.toMatch(/Completeness%/);
    expect(text).not.toMatch(/Approved\//);
    expect(text).not.toContain('The undetermined documentation set');
    for (const val of Array.from(container.querySelectorAll('.metric-val'))) {
      expect(val.textContent?.trim()).not.toMatch(/^(%|\/)/);
    }
    // The empty required-deliverables table says why it is empty.
    expect(screen.getByText(/listed once this project's documentation level is determined/)).toBeTruthy();
    // The Ask AnA action under it is unaffected.
    expect(screen.getByRole('button', { name: 'Ask AnA to add a lifecycle item' })).toBeTruthy();
  });

  it('a level recorded but cyber-device status not: counts are shown, the score is not, and nothing is green', async () => {
    summaryBody = CYBER_UNRECORDED_SUMMARY;
    itemsBody = [{ id: 1, item_kind: 'srs', title: 'SRS v1', identifier: null, doc_level: 'basic', safety_class: 'B', status: 'approved', updated_at: null }];
    const { container } = render(<SoftwareSurface program={PROGRAM} onAskAna={() => {}} />);
    await waitFor(() => expect(metricCard(container, 'Completeness')).toBeTruthy());

    // 5 of 5 tracked records approved — but the required set is not known, so not "ok".
    expect(
      Array.from(container.querySelectorAll('.metric-card[data-tone="ok"]')).map((c) => c.textContent),
    ).toEqual([]);
    expect(screen.getByText(CYBER_UNRECORDED_REASON)).toBeTruthy();
    expect(metricCard(container, 'Completeness')!.querySelector('.metric-val')!.textContent).toBe('Not determined');
    expect(metricCard(container, 'Approved')!.querySelector('.metric-val')!.textContent).toBe('5/5');
  });

  it('a computed score is still shown as the server computed it', async () => {
    summaryBody = SCORED_SUMMARY;
    itemsBody = [{ id: 1, item_kind: 'srs', title: 'SRS v1', identifier: null, doc_level: 'basic', safety_class: 'B', status: 'approved', updated_at: null }];
    const { container } = render(<SoftwareSurface program={PROGRAM} onAskAna={() => {}} />);
    await waitFor(() => expect(metricCard(container, 'Completeness')).toBeTruthy());

    expect(metricCard(container, 'Completeness')!.querySelector('.metric-val')!.textContent).toBe('40%');
    expect(metricCard(container, 'Completeness')!.getAttribute('data-tone')).toBe('warn');
    expect(metricCard(container, 'Approved')!.querySelector('.metric-val')!.textContent).toBe('2/5');
    expect(metricCard(container, 'Approved')!.getAttribute('data-tone')).toBe('warn');
    // The tracked-deliverables table is drawn (and the item list beside it).
    expect(screen.getAllByText('Software requirements (SRS)').length).toBeGreaterThanOrEqual(2);
  });
});

/* The route scores a determined level over the record kinds this register
   tracks, and says so in `completionScope` and `untracked`. Both were dropped
   on the way to the screen, which drew the route's 100 as "5 of 5 required
   deliverables approved" and "Required deliverables signed off" in green while
   five of FDA's ten Basic documents were neither tracked nor counted. */
describe('SoftwareSurface — a score over the tracked records is not the whole required set', () => {
  it('shows the scope the route gives, and paints no card green while FDA documents go uncounted', async () => {
    summaryBody = ALL_TRACKED_APPROVED_SUMMARY;
    const { container } = render(<SoftwareSurface program={PROGRAM} onAskAna={() => {}} />);
    await waitFor(() => expect(metricCard(container, 'Completeness')).toBeTruthy());

    expect(metricCard(container, 'Completeness')!.querySelector('.metric-val')!.textContent).toBe('100%');
    expect(
      Array.from(container.querySelectorAll('.metric-card[data-tone="ok"]')).map((c) => c.textContent),
    ).toEqual([]);
    // What the 100 is over, and what it leaves out, in the route's own words.
    expect(screen.getByText(BASIC_SCOPE)).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).not.toContain('required deliverables approved');
    expect(text).not.toContain('Required deliverables signed off');
    expect(screen.queryByRole('heading', { name: 'Required deliverables' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Tracked deliverables' })).toBeTruthy();
  });

  it('a body that does not say what went uncounted is not an all-clear either', async () => {
    const { untracked: _dropped, ...noUntracked } = ALL_TRACKED_APPROVED_SUMMARY;
    summaryBody = noUntracked;
    const { container } = render(<SoftwareSurface program={PROGRAM} onAskAna={() => {}} />);
    await waitFor(() => expect(metricCard(container, 'Completeness')).toBeTruthy());
    expect(
      Array.from(container.querySelectorAll('.metric-card[data-tone="ok"]')).map((c) => c.textContent),
    ).toEqual([]);
  });

  it('a score with nothing left uncounted may still read as complete', async () => {
    summaryBody = {
      ...ALL_TRACKED_APPROVED_SUMMARY,
      untracked: [],
      completionScope: 'Approved lifecycle records over the 5 required records.',
    };
    const { container } = render(<SoftwareSurface program={PROGRAM} onAskAna={() => {}} />);
    await waitFor(() => expect(metricCard(container, 'Completeness')).toBeTruthy());
    expect(metricCard(container, 'Completeness')!.getAttribute('data-tone')).toBe('ok');
    expect(metricCard(container, 'Approved')!.getAttribute('data-tone')).toBe('ok');
    expect(screen.getByText('Approved lifecycle records over the 5 required records.')).toBeTruthy();
  });
});
