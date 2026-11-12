// @vitest-environment jsdom
/**
 * What the monitoring board already held and did not show, and each finding taken to AnA (2026-11-12).
 *
 * - **Indicators by site.** Every site scored from the study's own indicators stores the readings behind its
 *   composite. Site risk showed their counts ("1 red · 1 amber"); the key risk indicators tab said a per-site view
 *   was "not implemented". The board now sends the readings (server/routes/mdx-rbm-board.ts), and both tabs show
 *   them, banded by the engine and never by the screen.
 * - **Ask AnA.** Every tab was handed the conversation's sender and only the report used it.
 * - **The report as a file.** The board carried the report's text; the only way to it was to ask AnA to paste it.
 * - **Words.** Function names, a count of tools, enum values and another vendor's product name were on screen, and
 *   central monitoring's note described a scan that no longer runs for a study scored from its own indicators.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) })),
}));

import { RbmOverview, RbmReport, RbmKris, RbmQtls } from '../surfaces/RbmSurfacesA';
import { RbmSignals, RbmPatients, RbmSites, RbmOversight, RbmPlan } from '../surfaces/RbmSurfacesB';
import { siteReadingsFor, siteIndicatorColumns, type RbmBoard, type RbmBoardSiteIndicator } from '../surfaces/rbmBoard';

const PROGRAM = '11111111-2222-3333-4444-555555555555';
const reading = (name: string, value: number, status: string, over: Partial<RbmBoardSiteIndicator> = {}): RbmBoardSiteIndicator => ({
  name, value, unit: 'days', status, amber: 7, red: 10, dir: 'higher_worse', at: '2026-10-31T00:00:00.000Z', cutoff: '2026-10-31', ...over,
});
const site = (n: string, composite: number | null, tier: string, indicators: RbmBoardSiteIndicator[]): RbmBoard['sites'][number] => ({
  n, name: '', country: null, composite, enr: null, qual: null, ops: null, tier, drivers: [], at: '2026-11-01T00:00:00.000Z',
  source: 'study_indicators', basis: { red: 0, amber: 0, green: 0, unbanded: 0 }, indicators,
});

function board(over: Partial<RbmBoard> = {}): RbmBoard {
  return {
    programId: PROGRAM,
    asOf: '2026-07-01T00:00:00.000Z',
    summary: {
      overallRisk: 'medium', asOf: '2026-07-01T00:00:00.000Z',
      riskItems: { total: 1, critical: 1, open: 1, high: 1 },
      kris: { total: 2, red: 1, amber: 0, notEvaluated: 1 },
      qtls: { total: 2, breached: 1, approaching: 0, notEvaluated: 0 },
      signals: { total: 1, open: 1, high: 1 },
      sites: { total: 3, enhanced: 1 },
      patients: { scored: 1, flagged: 1, review: 0 },
    },
    attention: [{ sev: 'critical', kind: 'QTL', nav: 'qtls', t: 'Dropout rate is breached', d: '24% against a limit of 20%' }],
    report: { programId: PROGRAM, asOf: '2026-07-01T00:00:00.000Z', framework: 'ich_e6r3', overallRisk: 'medium', headline: 'One limit is breached.', attentionCount: 1, approved: false,
      sections: [{ title: 'Quality tolerance limits', status: 'critical', items: ['Dropout rate is breached'] }] },
    reportMarkdown: '# Risk review\n\nOne limit is breached.\n',
    assessment: null,
    items: [],
    kris: [
      { id: 5, name: 'AE reporting lag', metric: 'Days from onset to entry', source: 'edc', unit: 'days', dir: 'higher_worse', amber: 7, red: 10, current: 12, status: 'red', at: '2026-11-01T00:00:00.000Z', spark: [6, 12] },
      { id: 6, name: 'Screen failure rate', metric: 'Screen failures', source: 'ctms', unit: '%', dir: 'higher_worse', amber: null, red: null, current: null, status: 'not_evaluated', at: null, spark: [] },
    ],
    qtls: [
      { id: 9, parameter: 'Dropout rate', rationale: 'Power', unit: null, secondary: 0.15, threshold: 0.2, current: 0.24, status: 'breached', breachActionTaken: null },
      { id: 10, parameter: 'Missing primary endpoint', rationale: 'Estimand', unit: null, secondary: 0.03, threshold: 0.05, current: 0.01, status: 'within', breachActionTaken: null },
    ],
    signals: [{ id: 31, source: 'central_stat', type: 'outlier_indicator', severity: 'critical', title: 'Site 104 stands apart on AE reporting lag', site: '104', detail: 'At site 104, AE reporting lag is 21 days against a study median of 3 days.', detected: null, status: 'new', resolution: null }],
    patients: [{ sid: 'LMN-104-007', site: '104', anomaly: 4.2, top: 'Visit interval', status: 'flagged', at: '2026-11-01T00:00:00.000Z', metrics: [{ k: 'Visit interval', z: 4.2 }] }],
    sites: [
      site('104', 100, 'enhanced', [reading('AE reporting lag', 21, 'red'), reading('Open query aging', 58, 'red', { amber: 14, red: 28 })]),
      site('106', 50, 'standard', [reading('AE reporting lag', 8, 'amber')]),
      site('101', 0, 'reduced', [reading('AE reporting lag', 3, 'green'), reading('Open query aging', 9, 'green', { amber: 14, red: 28 })]),
    ],
    oversight: { 104: { open: 2, high: 2 }, 106: { open: 0, high: 0 }, 101: { open: 0, high: 0 } },
    plan: { id: 3, title: 'Monitoring plan', strategy: 'risk_based', status: 'draft', updated: null, tiers: null, anaDraft: false, approval: null },
    governingPlanId: 3,
    actions: [{ id: 41, planId: 3, type: 'issue', title: 'Confirm control', priority: 'high', owner: 'Unassigned', due: '2026-08-01', status: 'open', overdue: true, origin: 'ract' }],
    freshness: [],
    ...over,
  };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('indicators by site', () => {
  it('lists the indicators read at any site, the ones with a red reading first', () => {
    expect(siteIndicatorColumns(board())).toEqual([{ name: 'AE reporting lag', unit: 'days' }, { name: 'Open query aging', unit: 'days' }]);
    expect(siteIndicatorColumns(board({ sites: [site('1', 0, 'reduced', [reading('B green', 1, 'green'), reading('A amber', 2, 'amber')]), site('2', 100, 'enhanced', [reading('B green', 9, 'red')])] }))
      .map(c => c.name)).toEqual(['B green', 'A amber']);
  });

  it('gives an indicator’s readings across the sites, worst band first, matched by name', () => {
    expect(siteReadingsFor(board(), 'ae reporting lag ').map(r => [r.site, r.value, r.status])).toEqual([['104', 21, 'red'], ['106', 8, 'amber'], ['101', 3, 'green']]);
    expect(siteReadingsFor(board(), 'Screen failure rate')).toEqual([]);
  });

  it('shows every site against every indicator, each cell the reading and its band in words', () => {
    render(<RbmSites board={board()} onReload={vi.fn()} />);
    const table = screen.getByRole('table', { name: /Each site’s latest reading of each indicator/ });
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Site', 'AE reporting lag (days)', 'Open query aging (days)']);
    const rows = within(table).getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell').map(c => c.textContent));
    expect(within(table).getAllByRole('rowheader').map(h => h.textContent)).toEqual(['104', '106', '101']);
    expect(rows).toEqual([['21Red', '58Red'], ['8Amber', 'Not read'], ['3Green', '9Green']]);
  });

  it('colours a cell by the band the engine stored, and never bands a value itself', () => {
    // 3 against a red limit of 10 would be green by arithmetic. The engine stored red, so the cell is red.
    const b = board({ sites: [site('104', 100, 'enhanced', [reading('AE reporting lag', 3, 'red')])] });
    const { container } = render(<RbmSites board={b} onReload={vi.fn()} />);
    const cell = container.querySelector('.rbm-sx-cell')!;
    expect(cell.getAttribute('data-st')).toBe('red');
    expect(cell.textContent).toBe('3Red');
    expect(cell.getAttribute('title')).toBe('Site 104, AE reporting lag: 3 days — Red (limit 10 days), data cut-off 2026-10-31');
  });

  it('says an indicator with no limit has none, in neither red nor green', () => {
    const b = board({ sites: [site('104', null, 'standard', [reading('Enrolment', 4, 'not_evaluated', { amber: null, red: null, unit: null })])] });
    const { container } = render(<RbmSites board={b} onReload={vi.fn()} />);
    expect(container.querySelector('.rbm-sx-cell')!.textContent).toBe('4No limit');
    expect(container.querySelector('.rbm-sx-cell[data-st="green"]')).toBeNull();
  });

  it('draws no such table for sites scored from site intelligence, which holds no indicator readings', () => {
    const b = board({ sites: [{ n: '5', name: 'Mercy Clinical', country: null, composite: 71, enr: 18, qual: 20, ops: 15, tier: 'enhanced', drivers: ['quality'], at: null }] });
    render(<RbmSites board={b} onReload={vi.fn()} />);
    expect(screen.queryByText('Indicators by site')).toBeNull();
  });

  it('opens an indicator’s readings by site on the key risk indicators tab', () => {
    render(<RbmKris board={board()} onReload={vi.fn()} />);
    const open = screen.getByRole('button', { name: /By site — 3/ });
    expect(open.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(open);
    const table = screen.getByRole('table', { name: 'Latest reading of AE reporting lag at each site, with its band' });
    expect(within(table).getAllByRole('rowheader').map(h => h.textContent)).toEqual(['104', '106', '101']);
    expect(within(table).getAllByRole('row').slice(1).map(r => r.textContent)).toEqual(['10421 daysRed2026-10-31', '1068 daysAmber2026-10-31', '1013 daysGreen2026-10-31']);
    // An indicator no site has read offers nothing to open.
    expect(screen.getAllByRole('button', { name: /By site/ })).toHaveLength(1);
  });

  it('shows an indicator’s course at a site across the loads, in a line and in words, and calls one reading one reading', () => {
    const b = board();
    b.sites[0].indicators![0].history = [{ v: 6, cutoff: '2026-08-31' }, { v: 12, cutoff: '2026-09-30' }, { v: 21, cutoff: '2026-10-31' }];
    b.sites[1].indicators![0].history = [{ v: 8, cutoff: '2026-10-31' }];
    const { container } = render(<RbmKris board={b} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /By site — 3/ }));
    const table = screen.getByRole('table', { name: 'Latest reading of AE reporting lag at each site, with its band' });
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Site', 'Reading', 'Band', 'Data cut-off', 'Over the loads']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0].querySelector('svg.rbm-spark')).toBeTruthy();
    expect(rows[0].textContent).toContain('Site 104, 3 readings, oldest first: 2026-08-31: 6, 2026-09-30: 12, 2026-10-31: 21');
    expect(rows[1].textContent).toContain('One reading');
    expect(rows[1].querySelector('svg.rbm-spark')).toBeNull();
    // The Site risk tab points here in place of "trend over time is not available".
    cleanup();
    const sites = render(<RbmSites board={b} onReload={vi.fn()} />);
    expect(sites.container.textContent).not.toMatch(/trend over time is not available/);
    expect(sites.container.textContent).toMatch(/Each indicator’s readings at a site across the loads are on Key risk indicators, under “By site”/);
    expect(container).toBeTruthy();
  });

  it('offers no trend column when no site has more than one reading', () => {
    render(<RbmKris board={board()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /By site — 3/ }));
    expect(screen.queryByRole('columnheader', { name: 'Over the loads' })).toBeNull();
  });

  it('no longer says a per-site view is not implemented, and says what still is not there', () => {
    const { container } = render(<RbmKris board={board()} onReload={vi.fn()} />);
    const note = [...container.querySelectorAll('.rbm-note')].at(-1)!.textContent!;
    expect(note).not.toMatch(/per-site\/country drilldown are not implemented/);
    expect(note).toMatch(/“By site” lists each site’s latest reading against the same limits/);
    expect(note).toMatch(/limits derived statistically from the data, and readings by country, are not available/);
  });
});

describe('each finding goes to AnA from where it is shown', () => {
  const ask = () => screen.getAllByRole('button', { name: 'Ask AnA' });

  it('an attention item: the row still opens its tab, and Ask AnA names the item', () => {
    const onAsk = vi.fn(); const onTab = vi.fn();
    render(<RbmOverview board={board()} onTab={onTab} onAsk={onAsk} />);
    fireEvent.click(screen.getByRole('button', { name: /Dropout rate is breached/ }));
    expect(onTab).toHaveBeenCalledWith('qtls');
    expect(onAsk).not.toHaveBeenCalled();
    fireEvent.click(ask()[0]);
    expect(onTab).toHaveBeenCalledOnce();
    expect(onAsk).toHaveBeenCalledWith('Explain this QTL item on the monitoring board and what I should do about it: Dropout rate is breached (24% against a limit of 20%)');
  });

  it('an indicator, a breached limit, a signal, a subject, a site, a site’s oversight and the plan’s actions', () => {
    type Ask = (t: string) => void;
    const cases: [(onAsk: Ask) => React.ReactElement, RegExp, (() => void)?][] = [
      [(onAsk) => <RbmKris board={board()} onReload={vi.fn()} onAsk={onAsk} />, /key risk indicator "AE reporting lag"/],
      [(onAsk) => <RbmQtls board={board()} onReload={vi.fn()} onAsk={onAsk} />, /quality tolerance limit "Dropout rate" is breached/],
      [(onAsk) => <RbmSignals board={board()} onReload={vi.fn()} onAsk={onAsk} />, /central monitoring signal at site 104 .*Site 104 stands apart on AE reporting lag\. At site 104/,
        () => fireEvent.click(screen.getByRole('button', { name: /Site 104 stands apart/ }))],
      [(onAsk) => <RbmPatients board={board()} onReload={vi.fn()} onAsk={onAsk} />, /subject LMN-104-007 at site 104 is flagged for medical review/],
      [(onAsk) => <RbmSites board={board()} onReload={vi.fn()} onAsk={onAsk} />, /site 104 is on the enhanced monitoring tier .* composite of 100/],
      [(onAsk) => <RbmOversight board={board()} onReload={vi.fn()} onAsk={onAsk} />, /oversight does site 104 need\? It is on the enhanced tier with 2 open signals, 2 of high severity/],
      [(onAsk) => <RbmPlan board={board()} onReload={vi.fn()} onAsk={onAsk} />, /monitoring plan actions: which are overdue or at risk/],
    ];
    for (const [element, expected, before] of cases) {
      const onAsk = vi.fn();
      render(element(onAsk));
      before?.();
      fireEvent.click(ask()[0]);
      expect(onAsk).toHaveBeenCalledOnce();
      expect(onAsk.mock.calls[0][0]).toMatch(expected);
      cleanup();
    }
  });

  it('is offered on a limit only when it is breached or approaching', () => {
    render(<RbmQtls board={board()} onReload={vi.fn()} onAsk={vi.fn()} />);
    expect(ask()).toHaveLength(1);
  });

  it('is not drawn where no conversation is attached', () => {
    render(<><RbmOverview board={board()} onTab={vi.fn()} /><RbmKris board={board()} onReload={vi.fn()} /><RbmSites board={board()} onReload={vi.fn()} /></>);
    expect(screen.queryByRole('button', { name: 'Ask AnA' })).toBeNull();
  });
});

describe('the risk review report as a file', () => {
  it('downloads the report the board carries, named for its date', () => {
    const created: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => { created.push(b); return 'blob:report'; }, revokeObjectURL: vi.fn() }));
    render(<RbmReport board={board()} onAsk={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Download/ }));
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe('text/markdown;charset=utf-8');
    expect(created[0].size).toBe(new Blob([board().reportMarkdown!]).size);
    expect(screen.getByRole('status').textContent).toBe('Saved as risk-review-2026-07-01.md.');
  });

  it('offers no download when the board carries no report text, and keeps Print and Ask AnA', () => {
    render(<RbmReport board={board({ reportMarkdown: null })} onAsk={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Print/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ask AnA to export markdown/ })).toBeTruthy();
  });
});

describe('the screens say what they do in a monitor’s words', () => {
  it('prints no function name, tool name, enum value or another vendor’s product name', () => {
    const { container } = render(<>
      <RbmOverview board={board()} onTab={vi.fn()} onAsk={vi.fn()} />
      <RbmReport board={board()} onAsk={vi.fn()} />
      <RbmKris board={board()} onReload={vi.fn()} />
      <RbmQtls board={board()} onReload={vi.fn()} />
      <RbmSignals board={board()} onReload={vi.fn()} />
      <RbmPatients board={board({ patients: [{ ...board().patients[0], metrics: [] }] })} onReload={vi.fn()} />
      <RbmSites board={board()} onReload={vi.fn()} />
      <RbmOversight board={board()} onReload={vi.fn()} />
      <RbmPlan board={board()} onReload={vi.fn()} />
    </>);
    const text = container.textContent ?? '';
    for (const word of ['buildRiskReview', 'generate_rbm_report', 'kriStatus', 'MIN_COHORT', 'site_visit', 'SPOT', 'server-side', 'the UI']) expect(text).not.toContain(word);
  });

  it('keeps the sentence that every score is the engines’, on the overview', () => {
    render(<RbmOverview board={board()} onTab={vi.fn()} />);
    expect(screen.getByText(/Every score on this board is computed by the monitoring engines from the study’s recorded data/)).toBeTruthy();
  });

  it('describes the central monitoring scan that actually runs for the study’s sites', () => {
    const fromIndicators = render(<RbmSignals board={board()} onReload={vi.fn()} />);
    expect(fromIndicators.container.textContent).toMatch(/compares each site-level indicator across the study’s sites/);
    expect(fromIndicators.container.textContent).not.toMatch(/four risk scores/);
    cleanup();
    const fromSiteIntelligence = render(<RbmSignals board={board({ sites: [{ n: '5', name: 'Mercy', country: null, composite: 71, enr: 18, qual: 20, ops: 15, tier: 'enhanced', drivers: [], at: null }] })} onReload={vi.fn()} />);
    expect(fromSiteIntelligence.container.textContent).toMatch(/on its four risk scores \(composite, enrollment, quality, operational\)/);
  });
});
