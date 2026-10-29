// @vitest-environment jsdom
/**
 * Engineering's design history is the project's own document sections, and
 * the screen says what that is and is not (founder decision P-60, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/engineering-per-product/).
 *
 * The route now reads c2c_document_sections under the project's documents and
 * reports `dhf: 'program'`, so the panel is drawn again (keyedToProject). What
 * it draws is not an inspected DHF index and not the organization's 510(k)
 * kit, so it is not labelled as either: the card counts the project's mandatory
 * sections approved, each section names its document, and the panel states its
 * own limit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent, screen, within } from '@testing-library/react';
import { EngineeringSurface } from '../EngineeringSurface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROGRAM = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', title: 'ENG-1 Sensor', code: 'ENG-1' } as unknown as Program;

const SCOPES = { risks: 'program', trace: 'program', dhf: 'program', ecrs: 'program', issues: 'program', documents: 'program' };

const K510 = { documentId: 'doc_k510', document: 'Sensor 510(k)' };
const CER = { documentId: 'doc_cer', document: 'Sensor CER' };
const section = (num: string, status: string, doc: { documentId: string; document: string }, mandatory = true) => ({
  id: `s-${num}`, num, label: `Section ${num}`, ver: 'v2', owner: '—', updated: '1d', status,
  meta: `${doc.document}${mandatory ? ' · mandatory' : ''}`, ...doc,
});

const DHF = [
  section('1', 'ready', K510),
  section('3', 'blocked', K510),
  section('A.1', 'draft', CER, false),
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

function respond(dhf: unknown[], summary: Record<string, unknown> = {}) {
  const data = {
    summary: { dhfCompletion: 50, openEcrs: 0, openRisks: 0, openIssues: 0, riskLastUpdated: null, ...summary },
    dhf, trace: [], risks: [], ecrs: [], issues: [], documents: [],
  };
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data, meta: { scopes: SCOPES, unavailable: [] } }), text: async () => '' });
}

async function mountExpanded() {
  const utils = render(<EngineeringSurface program={PROGRAM} onAskAna={() => {}} onOpenEditor={() => {}} />);
  await waitFor(() => expect(utils.container.textContent ?? '').not.toMatch(/Loading/i));
  fireEvent.click(utils.container.querySelector('[aria-expanded]') as HTMLElement);
  return utils;
}

function card(c: HTMLElement, label: string): HTMLElement | undefined {
  return Array.from(c.querySelectorAll<HTMLElement>('.metric-card')).find(
    (el) => el.querySelector('.metric-label')?.textContent === label,
  );
}

describe("EngineeringSurface — the project's design history", () => {
  it("lists the project's document sections, grouped under the document each belongs to", async () => {
    respond(DHF);
    await mountExpanded();
    const panel = screen.getByTestId('eng-design-history');
    const groups = within(panel).getAllByTestId('eng-design-history-document');
    expect(groups.map((g) => g.querySelector('.eng-trace-summary')?.textContent)).toEqual([
      'Sensor 510(k) · 2 sections',
      'Sensor CER · 1 section',
    ]);
    expect(groups[0].textContent ?? '').toMatch(/§1.*Section 1/);
    expect(groups[0].querySelector('[data-status="blocked"]')?.textContent ?? '').toMatch(/§3/);
  });

  it('says what the panel is and is not: not an inspected design history file index', async () => {
    respond(DHF);
    await mountExpanded();
    const note = screen.getByTestId('eng-design-history-note').textContent ?? '';
    expect(note).toMatch(/sections of this project's own documents/);
    expect(note).toMatch(/not an inspected design history file index/);
    expect(document.body.textContent ?? '').not.toMatch(/510\(k\) section set/);
  });

  it("counts the project's mandatory sections approved, and does not call it DHF completion", async () => {
    respond(DHF, { dhfCompletion: 50 });
    const { container } = await mountExpanded();
    expect(card(container, 'DHF completion')).toBeUndefined();
    const c = card(container, 'Mandatory sections approved');
    expect(c?.querySelector('.metric-val')?.textContent).toBe('50%');
    expect(c?.textContent ?? '').toMatch(/this project's documents/);
  });

  it('a blocked section reaches the blocker feed by its section and document, not as a DHF entry', async () => {
    respond(DHF);
    const { container } = await mountExpanded();
    const feed = container.querySelector('.eng-blockers-feed')?.textContent ?? '';
    expect(feed).toMatch(/§3/);
    expect(feed).toMatch(/Sensor 510\(k\)/);
    expect(feed).not.toMatch(/DHF §/);
  });

  it('an empty design history says where sections come from', async () => {
    respond([]);
    await mountExpanded();
    expect(document.body.textContent ?? '').toMatch(/This project's document sections appear here once its documents have sections\./);
  });
});
