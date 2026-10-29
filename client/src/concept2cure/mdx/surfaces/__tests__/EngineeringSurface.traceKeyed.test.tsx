// @vitest-environment jsdom
/**
 * Engineering's trace panel comes back for the open project once the route
 * reports it keyed to that project, and the panels still read by organization
 * stay hidden (D2, fold F1 slice A, plan item 3, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/).
 *
 * GET /api/mdx/engineering/:programId now reads c2c_design_controls by project
 * and reports `scopes.trace: 'program'` (server/routes/mdx-engineering.ts,
 * pinned by mdx-engineering-trace-by-project.test.ts). The screen gates each
 * panel on its own scope (10bbeeeea), so this is the route's new scope report,
 * exactly: the trace and the risk file keyed, the DHF, change requests,
 * non-conformances and documents still the organization's.
 *
 * Fold F1 slice B (2026-10-29): the trace panel is now the design-controls
 * trace the Design controls screen mounts too (v2/surfaces/DesignControlsTrace.tsx).
 * It reads the project's inputs itself (GET /api/design-controls?program_id=)
 * and draws them only from an answer that says it is this project's. The two
 * trace cases below pin that read; the route's `scopes.trace` no longer draws
 * anything.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { EngineeringSurface } from '../EngineeringSurface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROGRAM = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', title: 'ENG-1 Sensor', code: 'ENG-1' } as unknown as Program;

/** The route's scope report since plan item 3. */
const ROUTE_SCOPES = {
  risks: 'program', trace: 'program', dhf: 'organization',
  ecrs: 'organization', issues: 'organization', documents: 'organization',
};

const DATA = {
  summary: { dhfCompletion: 0, openEcrs: 1, openRisks: 0, openIssues: 1, riskLastUpdated: null },
  dhf: [{ id: 'd1', num: '7', label: 'Other project biocompatibility', ver: 'v1', owner: 'A', updated: '1d', status: 'blocked', meta: 'ISO 10993' }],
  /* The project's own design inputs, as the keyed read returns them. */
  trace: [
    { id: 'DI-OWN-1', need: 'This project battery life', input: 'performance', output: 'DO-1', verif: 'VER-1', valid: 'VAL-1', risk: '—', state: 'verified' },
    { id: 'DI-OWN-2', need: 'This project alarm latency', input: 'safety', output: '—', verif: '—', valid: '—', risk: '—', state: 'open' },
  ],
  risks: [],
  ecrs: [{ id: 'ECR-OTHER-9', title: 'Other project housing change', impact: 'low', opened: '2d', state: 'open', owner: 'B', riskChange: 'none', linked: '—' }],
  issues: [{ id: 'NC-OTHER-4', title: 'Other project weld defect', severity: 'high', age: '3d', owner: '—', state: 'open', linked: '—' }],
  documents: [],
};

/* The design-controls trace's own read, and the project's inputs as it returns them. */
const DC_PATH = `/api/design-controls?program_id=${PROGRAM.id}`;
const INPUTS = [
  { id: 'DI-OWN-1', cat: 'performance', req: 'This project battery life', riskRef: null, outputs: [{ id: 'DO-1', desc: 'Output' }], ver: 'pass', verRef: 'VER-1', val: 'pass', valRef: 'VAL-1' },
  { id: 'DI-OWN-2', cat: 'safety', req: 'This project alarm latency', riskRef: null, outputs: [], ver: null, verRef: null, val: null, valRef: null },
];
const KEYED_INPUTS = { data: INPUTS, meta: { count: 2, scope: 'program', programId: PROGRAM.id } };
let dcAnswer: unknown;

let fetchMock: ReturnType<typeof vi.fn>;
let engineeringAnswer: unknown;
beforeEach(() => {
  dcAnswer = KEYED_INPUTS;
  engineeringAnswer = { data: DATA, meta: { scopes: ROUTE_SCOPES, unavailable: [] } };
  fetchMock = vi.fn(async (url: string) => ({
    ok: true, status: 200, json: async () => (String(url) === DC_PATH ? dcAnswer : engineeringAnswer), text: async () => '',
  }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

async function mounted() {
  const utils = render(<EngineeringSurface program={PROGRAM} onAskAna={() => {}} onOpenEditor={() => {}} />);
  await waitFor(() => expect(utils.container.textContent ?? '').not.toMatch(/Loading/i));
  const toggle = utils.container.querySelector('[aria-expanded]') as HTMLElement | null;
  expect(toggle, 'the awareness accordion toggle must exist').not.toBeNull();
  fireEvent.click(toggle as HTMLElement);
  return utils.container;
}

describe("EngineeringSurface — the trace is the project's", () => {
  it('draws the trace panel from the keyed read', async () => {
    const c = await mounted();
    await waitFor(() => expect(c.querySelectorAll('[data-testid="eng-design-controls"] .dc-mrow')).toHaveLength(2));
    expect(c.textContent).toMatch(/This project battery life/);
    expect(c.querySelector('[data-testid="eng-not-keyed-trace"]')).toBeNull();
  });

  it('still hides the panels the route reads by organization', async () => {
    const c = await mounted();
    for (const id of ['dhf', 'ecrs', 'issues']) {
      expect(c.querySelector(`[data-testid="eng-not-keyed-${id}"]`), `panel ${id} stays hidden`).not.toBeNull();
    }
    expect(c.textContent).not.toMatch(/Other project biocompatibility|ECR-OTHER-9|NC-OTHER-4/);
  });

  it('hides the trace again if its read stops reporting it keyed (fail closed)', async () => {
    dcAnswer = { data: INPUTS, meta: { count: 2, scope: 'organization' } };
    const c = await mounted();
    await waitFor(() => expect(c.textContent).toMatch(/Couldn't load this project's design inputs/));
    expect(c.textContent).not.toMatch(/This project battery life|traceability rows tracked/);
    expect(c.querySelectorAll('.dc-mrow')).toHaveLength(0);
  });
});
