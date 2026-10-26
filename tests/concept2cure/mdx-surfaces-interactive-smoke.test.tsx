/**
 * @vitest-environment jsdom
 *
 * Interactive runtime smoke for the 6 rich MDX surfaces. The sibling
 * `design-system-surfaces-smoke.test.tsx` mounts each surface and asserts the
 * h1 + no console errors — but it never clicks a button, so a handler that
 * throws on filter/tab/cell interaction (a real regression class) slips
 * through. This suite drives every visible <button> on each surface in turn
 * and asserts the surface stays alive in the DOM after every click.
 *
 * Plus a focused check on the FilesTreePane's five filesystem roots, the
 * specific regression that started the 2026-06-02 reconciliation round.
 *
 * Surfaces render only what their reads return: a silent fixture is
 * indistinguishable from real regulated data, so the fallback was removed and
 * then the sample mode that replaced it (2026-10-14). This suite therefore
 * serves live-shaped payloads through the mocked fetch (LIVE below — test
 * input, never imported by the product), which keeps it measuring what it was
 * written to measure: that every handler survives a click on a populated
 * surface, rather than that a 404 happens to render one.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import { AnalyticsSurface }   from '../../client/src/concept2cure/mdx/surfaces/AnalyticsSurface';
import { PostmarketSurface }  from '../../client/src/concept2cure/mdx/surfaces/PostmarketSurface';
import { EngineeringSurface } from '../../client/src/concept2cure/mdx/surfaces/EngineeringSurface';
import { UdiSurface }         from '../../client/src/concept2cure/mdx/surfaces/UdiSurface';
import { PathwayPanes }       from '../../client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes';

import type { Program } from '../../client/src/concept2cure/mdx/data/programs';

const MOCK_PROGRAM: Program = {
  id: 'p-test',
  title: 'BX-204 CGM',
  code: 'BX-204',
  pathway: 'k510',
  stage: 'Verification',
  stageIdx: 5,
  readiness: 64,
  status: 'active',
  lead: 'Jordan Chen',
  owners: ['JC'],
  nextBlocker: null,
  dueLabel: 'Filing · Q3 2026',
  dueTone: 'ok',
  lastActivity: '3h ago',
  meta: 'Continuous glucose monitor',
};

const askAna = vi.fn();
const openEditor = vi.fn();

beforeEach(() => {
  cleanup();
  askAna.mockClear();
  openEditor.mockClear();
  globalThis.fetch = vi.fn((input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    const hit = Object.keys(LIVE).find((prefix) => url.includes(prefix));
    const body = hit ? LIVE[hit] : null;
    return Promise.resolve({
      ok: body !== null,
      status: body !== null ? 200 : 404,
      text: async () => (body !== null ? JSON.stringify(body) : 'Not Found'),
      json: async () => body ?? { data: null },
    } as Response);
  }) as unknown as typeof fetch;
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

/* Live-shaped read results, keyed by request path. Test input only. */
const LIVE: Record<string, unknown> = {
  '/api/mdx/analytics': {
    data: {
      kpis: [{ label: 'Active programs', metric: '2', meta: 'test' }],
      phases: [{ phase: 'Intake', k510: { org: 10, peer: 12, units: 'd' }, pma: { org: 20, peer: 25, units: 'd' } }],
      blockers: [{ cause: 'Test cause', count: 1, median: 3, owner: 'T', pathway: 'k510', trend: 'flat' }],
      reviewers: [{ code: 'TST', name: 'Test division', n: 2, median: 90, fastest: 80, slowest: 100, firstCycle: 1, orgMedian: 95, pathway: 'k510' }],
      anaUsage: [{ tool: 'test_tool', calls: 3, accepted: 2, drafts: 1, pathway: 'k510' }],
      pace24m: [1, 2, 3],
    },
  },
  '/api/mdx/engineering/p-test': {
    data: {
      summary: { dhfCompletion: 50, openEcrs: 1, openRisks: 2, openIssues: 1, riskLastUpdated: null },
      dhf: [{ id: 'd1', num: '1', label: 'Design plan', ver: '1', owner: 'T', updated: '2026-10-01', status: 'draft', meta: '' }],
      trace: [{ id: 't1', need: 'N1', input: 'I1', output: 'O1', verif: 'V1', valid: 'Va1', risk: 'R1', state: 'open' }],
      risks: [
        { id: 'r1', hazard: 'H1', situation: 'S1', harm: 'Hm1', severity: 'S3', probBefore: 'P3', controlClass: 'design', control: 'C1', verif: 'V1', probAfter: 'P2', residual: 'S3P2', state: 'open', owner: 'T' },
        { id: 'r2', hazard: 'H2', situation: 'S2', harm: 'Hm2', severity: 'S2', probBefore: 'P2', controlClass: 'labeling', control: 'C2', verif: 'V2', probAfter: 'P1', residual: 'S2P1', state: 'open', owner: 'T' },
      ],
      ecrs: [{ id: 'e1', title: 'ECR one', impact: 'low', opened: '2026-10-01', state: 'open', owner: 'T', riskChange: 'none', linked: '' }],
      issues: [{ id: 'i1', title: 'Issue one', severity: 'minor', age: '1d', owner: 'T', state: 'open', linked: '' }],
      documents: [],
    },
  },
  '/api/mdx/udi/summary': {
    data: {
      devices: [{ id: 'dev1', code: 'TST-1', name: 'Test device', class: 'II', fda: { di: '0', gmdn: '0', agency: 'GS1', status: 'draft', submitted: '', acked: '' }, eu: { di: '0', risk: 'IIa', agency: 'GS1', status: 'draft', submitted: '', acked: '' }, mri: 'safe', rx: 'Rx', sterile: false, singleUse: false, labels: 1, translations: 0, open: 0 }],
      labels: [
        { id: 'lbl1', device: 'TST-1', kind: 'IFU', region: 'US', lang: 'en', ver: '1', size: 'A4', status: 'draft', updated: '2026-10-01' },
        { id: 'lbl2', device: 'TST-1', kind: 'Carton', region: 'EU', lang: 'en', ver: '1', size: 'A5', status: 'approved', updated: '2026-10-01' },
      ],
      symbols: [{ iso: '5.1.1', name: 'Manufacturer', glyph: 'M', required: 'yes', present: true }],
      issues: [{ id: 'u1', label: 'lbl1', kind: 'content', severity: 'minor', msg: 'Test issue', since: '2026-10-01' }],
      mri: [{ device: 'TST-1', mode: 'Normal', field: '1.5T', sar: '2', gradient: '40', tested: true, notes: '' }],
    },
  },
  '/api/c2c/documents/doc-1/sections/': {
    id: 'x', document_id: 'doc-1', section_key: 's1', label: 'Test section', content: { paragraphs: [{ text: 'Test body.' }] }, owner_id: 'T', version: 1,
  },
  '/api/c2c/documents/doc-1/outline': {
    document: { id: 'doc-1', title: '510(k)' },
    outline: [{ key: 's1', parent_key: null, label: 'Test section', path_order: 1, status: 'draft', version: 1, owner_id: 'T', accepted_at: null, has_content: true }],
  },
  '/api/c2c/documents': { documents: [{ id: 'doc-1', project_id: 'proj-1', doc_type: '510k', agency: 'FDA', title: '510(k)' }] },
};

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

/**
 * Click every enabled <button> the surface can *reach*, not just the ones it
 * paints first.
 *
 * The original helper took one `querySelectorAll('button')` snapshot and
 * clicked that list. That measured the whole surface only while every panel
 * rendered flat. Engineering and UDI now hold their rich content — DHF strip,
 * ISO 14971 heatmap, design-controls trace, change requests, device registry,
 * ISO 15223-1 symbols, MRI matrix — inside the "Situational awareness"
 * accordion, collapsed on first paint by design (the surfaces' own module docs
 * say so). A single snapshot therefore saw two controls: the accordion head and
 * one `DataGate` retry. Clicking the head revealed the rest *after* the list
 * had already been taken, so the suite drove none of it — which is the opposite
 * of what its name claims.
 *
 * So: click, re-query, click whatever the last click revealed, until the set
 * closes. Elements are tracked by DOM identity, so a control that survives a
 * re-render is clicked exactly once and an accordion is never toggled shut by
 * this helper; a genuinely remounted control (tab switch) is a new node and is
 * driven again, which is the handler-safety property under test. `maxRounds`
 * bounds a surface that ping-pongs between two panels.
 *
 * After every click the container must still hold rendered content (the surface
 * didn't crash and unmount itself). Returns the number of buttons clicked, so
 * the test fails fast if a surface degenerates to a handful of interactive
 * controls — a refactor that accidentally removed interactivity, or a
 * disclosure control that no longer discloses anything.
 */
function clickEveryButton(container: HTMLElement, maxRounds = 8): { clicked: number } {
  const seen = new Set<Element>();
  let clicked = 0;
  for (let round = 0; round < maxRounds; round++) {
    const fresh = (
      Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
    ).filter((b) => !b.disabled && !seen.has(b));
    if (fresh.length === 0) break;
    for (const b of fresh) {
      seen.add(b);
      fireEvent.click(b);
      clicked++;
    }
  }
  const remainingText = (container.textContent || '').trim();
  if (remainingText.length === 0) {
    throw new Error('Surface unmounted after click sequence (rendered empty)');
  }
  return { clicked };
}

describe('MDX rich-surface interactive smoke', () => {
  it('Analytics: every button click is handler-safe', async () => {
    const { container, findAllByText } = wrap(<AnalyticsSurface onAskAna={askAna} />);
    await findAllByText(/Test cause/);
    /* Since e1f3fd425 the pathway filters other than "All" are disabled (no
       current source aggregates by pathway) and the DocumentsPanel is gone, so
       a count floor no longer describes this surface. Name what it ships
       instead: the one live filter, the saved-reports retry (the fixture
       serves no report source, so the honest unavailable state renders), and
       one Ask-AnA control per blocker and per reviewer row. */
    const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    const label = (b: HTMLButtonElement) => (b.textContent || '').replace(/\s+/g, ' ').trim();
    expect(buttons.filter((b) => b.disabled).map(label)).toEqual(['510(k)', 'PMA', 'CER']);
    const enabled = buttons.filter((b) => !b.disabled).map(label);
    expect(enabled).toHaveLength(4);
    expect(enabled.slice(0, 2)).toEqual(['All', 'Retry saved reports']);
    expect(enabled[2]).toMatch(/^1Test cause/);
    expect(enabled[3]).toMatch(/^TSTTest division/);
    const { clicked } = clickEveryButton(container);
    expect(clicked).toBe(4);
    expect(askAna.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringContaining('blocked on "Test cause"'),
      expect.stringContaining('Compare our TST (Test division) submissions'),
    ]);
  });

  it('Postmarket: every button click is handler-safe', () => {
    /* The host mounts this leaf only with a project (MdxSurfaceHost's
       mdx-project-required guard), and its triage request names it. */
    const { container } = wrap(<PostmarketSurface program={MOCK_PROGRAM} onAskAna={askAna} />);
    /* Slice 0 (IA map, `device-postmarket` row): the floor of 5 was met by the
       six framework filters a DocumentsPanel drew over a list nothing reads.
       That panel is now a one-line note, so a count floor no longer describes
       this surface. Name what it offers: Ask-AnA triage and the Situational
       awareness toggle. */
    const label = (b: HTMLButtonElement) => (b.textContent || '').replace(/\s+/g, ' ').trim();
    const enabled = (Array.from(container.querySelectorAll('button')) as HTMLButtonElement[])
      .filter((b) => !b.disabled)
      .map(label);
    expect(enabled).toEqual(
      expect.arrayContaining([expect.stringMatching(/Triage queue/), expect.stringMatching(/^Situational awareness/)]),
    );
    const { clicked } = clickEveryButton(container);
    expect(clicked).toBeGreaterThanOrEqual(2);
    /* Slice 0: AnA's triage tool (triage_capa_mdr_queue) reads one program's
       complaints, MDR events and CAPAs and requires its id; nothing triages
       signals or the portfolio. */
    expect(askAna).toHaveBeenCalledWith(
      expect.stringContaining('Triage the open complaints, MDR events and CAPAs for BX-204 CGM (project p-test)'),
    );
    expect(askAna.mock.calls.map((c) => String(c[0])).join('\n')).not.toMatch(/across the portfolio|vigilance signals/);
    expect(container.querySelector('.eng-awareness-head')?.getAttribute('aria-expanded')).toBe('true');
  });

  // No MemorySurface case: the kit's AnA Memory surface was retired — v2 `ana-memory` reads the same /api/mdx/ana/memory endpoint and is write-capable, so two of them was one duplicate too many.

  it('Engineering: every risk-matrix cell click is handler-safe', async () => {
    const { container, findAllByText } = wrap(
      <EngineeringSurface program={MOCK_PROGRAM} onAskAna={askAna} />,
    );
    /* Slice 0: the DHF, ECR and non-conformance panels read organisation-wide and are not shown on a
       project (EngineeringSurface.projectKeyed.test.tsx). The risk file is the project's, and is what
       this case is named for: wait on its hazards. */
    await findAllByText(/^H[12]$/);
    const { clicked } = clickEveryButton(container);
    expect(clicked).toBeGreaterThan(5);
  });

  it('UDI: every label-preview / format-picker click is handler-safe', async () => {
    const { container, findAllByText } = wrap(<UdiSurface onAskAna={askAna} />);
    await findAllByText(/TST-1/);
    /* The controls this case is named for are per-document: the row-open button
       and the Ask-AnA chip inside "documents in flight". The panel frame draws
       its framework chips whether or not a single row reached it, so the button
       count alone cannot tell "the gate rendered" from "the gate's rows reached
       the panel" — which is exactly the defect that was here. Pin the rows. */
    expect(container.querySelectorAll('.docs-row').length).toBeGreaterThan(0);
    const { clicked } = clickEveryButton(container);
    expect(clicked).toBeGreaterThan(5);
  });

  // No AdminSurface case: the kit's admin surface was never imported by its own app and is deleted; admin is product-level (v2 `admin-console`).
});

describe('MDX Files tab — root structure', () => {
  it('renders all five filesystem roots on PathwayPanes(k510)', async () => {
    const { container, getByRole, findByText } = wrap(
      <PathwayPanes
        pathway="k510"
        workspace={<div data-testid="ws">workspace</div>}
        onAskAna={askAna}
        onOpenEditor={openEditor}
        programId="proj-1"
      />,
    );
    // Click into the Files tab; the tree mounts once the program's dossier is read.
    fireEvent.click(getByRole('tab', { name: /Files/i }));
    await findByText(/Test section/);
    // Each of the five roots must appear (path strings or label text).
    for (const root of ['Dossier', 'Correspondence', 'Approvals', 'Audit', 'Sources']) {
      expect(container.textContent || '').toContain(root);
    }
  });
});
