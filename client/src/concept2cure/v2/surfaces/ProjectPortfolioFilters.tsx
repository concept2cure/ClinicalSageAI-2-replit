import React, { useCallback, useState } from 'react';
import { PATHWAY_LABEL, REGULATORY_PATHWAYS } from '@shared/constants/mdx';
import { DOSSIER_READINESS_LABEL, DOSSIER_READINESS_MEANS, dossierReadinessValue, type DossierFigureState } from '../dossierReadiness';
import { enumWords } from './projectWords';

interface PortfolioCounts {
  total: number;
  byWorkstream: Record<string, number>;
  byPathway: Record<string, number>;
  filingWithin60Days: number;
  /** The server's mean of the measured dossier readiness over every selected project (P-122 §3.2);
   *  server/services/c2c/project-portfolio.ts `readPortfolioReadiness`. Absent on an older response. */
  averageReadiness?: unknown;
  readinessMeasured?: unknown;
  readinessState?: unknown;
}

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
function countMap(value: unknown): value is Record<string, number> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(isCount);
}
/** Absent metadata is an older page-only response, never a whole-portfolio zero. */
export function portfolioCounts(meta: Record<string, unknown> | undefined): PortfolioCounts | null {
  const counts = meta?.counts as Partial<PortfolioCounts> | undefined;
  if (!counts || !isCount(counts.total) || !isCount(counts.filingWithin60Days)
    || !countMap(counts.byWorkstream) || !countMap(counts.byPathway)) return null;
  return counts as PortfolioCounts;
}

/** Extend the existing Client URL with bound server filters, in stable order. */
export function portfolioFilterUrl(clientWorkspaceId: string, workstream: string, pathway: string): string {
  const params = new URLSearchParams();
  for (const [name, value] of [['clientWorkspaceId', clientWorkspaceId], ['ws', workstream], ['pathway', pathway]]) {
    if (value !== 'all') params.set(name, value);
  }
  const query = params.toString();
  return `/api/c2c/projects${query ? `?${query}` : ''}`;
}

export function portfolioIsUnfilteredEmpty(empty: boolean, workstream: string, pathway: string): boolean {
  return empty && [workstream, pathway].every(value => value === 'all');
}

export function portfolioStatusChoices(statuses: string[], selected: string) {
  const choices = ['all', ...new Set([...statuses.filter(Boolean), ...[selected].filter(value => value !== 'all')])];
  return { choices, visible: choices.length > 2 || selected !== 'all' };
}

const sum = (values: Record<string, number>) => Object.values(values).reduce((total, value) => total + value, 0);
/** An option's text, with its count only when the server sent one: no count is not a 0. */
const optionLabel = (label: string, value: number | undefined) => value === undefined ? label : `${label} (${value})`;

/**
 * Each portfolio workstream code as a client type, in sentence case. "MDX" is
 * an internal code; the rail names that client type "Medical Device & IVD"
 * (registryModel.ts), written here in sentence case. The project page's About
 * card reads the same map (D3-2), so a project's client type is named once.
 */
export const WS_LABEL: Readonly<Record<string, string>> = {
  MDX: 'Medical device & IVD',
  Biotech: 'Biotech',
  Pharma: 'Pharma',
  CRO: 'CRO',
};

/** The client types the filter offers, in the server's filter values (shared/navigation/surface-actions.ts). */
const CLIENT_TYPES = ['MDX', 'Biotech', 'Pharma'] as const;

/** Workstream counts ignore ws/pathway; pathway counts honor ws and ignore
 * pathway. Both honor Client. A selected value stays clearable after a failed
 * read: its option is kept, and "All" is always offered.
 *
 * Two toolbar selects (D2 §1.4 item 4), where there were two rows of
 * segmented buttons: the same state, the same server URL
 * (`portfolioFilterUrl`) and the same `projects.filter` action. */
export function ProjectPortfolioFilters({ workstream, pathway, counts, hasDeviceRows, onWorkstream, onPathway }: {
  workstream: string; pathway: string; counts: PortfolioCounts | null; hasDeviceRows: boolean;
  onWorkstream: (value: string) => void; onPathway: (value: string) => void;
}) {
  const pathways = REGULATORY_PATHWAYS.filter(key => (counts?.byPathway[key] ?? 0) > 0 || key === pathway);
  /* Drug and biologic applications are pathways too since 2026-10-31 (IND,
     NDA, BLA…: every one was "Other"), so the select shows whenever there is a
     choice to make, in any workstream. */
  const pathwaysVisible = pathway !== 'all' || pathways.length > 1
    || (counts === null && (workstream === 'MDX' || hasDeviceRows));
  return <>
    <select className="c2c-input pj-filter" aria-label="Client type" value={workstream}
      onChange={event => onWorkstream(event.target.value)}>
      <option value="all">{optionLabel('All client types', counts ? sum(counts.byWorkstream) : undefined)}</option>
      {CLIENT_TYPES.map(key => <option key={key} value={key}>
        {optionLabel(WS_LABEL[key], counts ? counts.byWorkstream[key] ?? 0 : undefined)}
      </option>)}
      {workstream !== 'all' && !(CLIENT_TYPES as readonly string[]).includes(workstream)
        && <option value={workstream}>{WS_LABEL[workstream] ?? workstream}</option>}
    </select>
    {pathwaysVisible && <select className="c2c-input pj-filter" aria-label="Pathway" value={pathway}
      onChange={event => onPathway(event.target.value)}>
      <option value="all">{optionLabel('All pathways', counts ? sum(counts.byPathway) : undefined)}</option>
      {pathways.map(key => <option key={key} value={key}>{optionLabel(PATHWAY_LABEL[key], counts?.byPathway[key])}</option>)}
    </select>}
  </>;
}

/* Moved here from Projects.tsx unchanged (2026-11-05), beside the other portfolio controls, to keep Projects.tsx under
   the 100 kB file ceiling. */
/** True when the list route said there is more than the page it returned. */
export function readIsPaged(meta: Record<string, unknown> | undefined): boolean {
  return meta !== undefined && meta.hasMore === true;
}

export function PortfolioPagedNote({ paged, settled, count, scopedCounts }: { paged: boolean; settled: boolean; count: number; scopedCounts: boolean }) {
  if (!paged || !settled) return null;
  return (
    <div role="status" className="scaf-note">
      Showing the first {count} projects. The status filter and search cover these only.{scopedCounts ? ' The figures above cover all projects matching the selected filters.' : ''}
    </div>
  );
}

/* ════ What Projects shows by default (P-122 §3.2, 2026-11-10) ════
   D2-1 (78842ee08) put the portfolio figures under the List view's table and took
   readiness, stage, lead and status off the cards, with Grid the default and the
   choice forgotten: a person opening Projects saw none of it. These bring them
   back in both views, in the quiet card's words: no tiles, plain numbers. */

/** A stated text value, or null for none: blank, or the server's '—'. */
export function stated(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v && v !== '—' ? v : null;
}

const VIEW_KEY = 'c2c-v2-projects-view';
export type PortfolioView = 'grid' | 'list';
/** Grid or list, as the person last chose it in this browser; grid until then. A
 *  per-viewer convenience: a store that cannot be read or written remembers nothing. */
export function useRememberedView(): [PortfolioView, (view: PortfolioView) => void] {
  const [view, setView] = useState<PortfolioView>(() => {
    try { return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const choose = useCallback((next: PortfolioView) => {
    setView(next);
    try { window.localStorage.setItem(VIEW_KEY, next); } catch { /* not remembered */ }
  }, []);
  return [view, choose];
}

const formatted = (n: number) => n.toLocaleString('en-US');

/**
 * The portfolio figures, above the projects in grid and list: the active projects
 * and the filings due within 60 days, as the server counted them (GET
 * /api/c2c/projects `meta.counts`: every project the person can open under the
 * selected client, client type and pathway, before paging). The browser computes
 * none of them (Rule 2): a read that carries no counts says so, and is never
 * recounted from its rows. No average readiness: the server sends no portfolio
 * figure for it, and a mean over the loaded page was the browser's. Each
 * project's own readiness, which the server measures, is on its card and its row.
 * Nothing is said while the read is in flight or failed: the page says that.
 */
/**
 * The portfolio's average readiness as the server sent it. Never computed here (Rule 2): a response
 * that carries no state has no average at all (null), and a 'measured' state without a usable figure
 * is read as not read.
 */
export type AverageReadinessFigure =
  | { state: 'measured'; pct: number; measured: number }
  | { state: 'none' | 'not_measured' | 'unavailable' };
export function averageReadinessFigure(counts: PortfolioCounts | null): AverageReadinessFigure | null {
  const state = counts?.readinessState;
  if (!counts || (state !== 'measured' && state !== 'none' && state !== 'not_measured' && state !== 'unavailable')) return null;
  if (state !== 'measured') return { state };
  const { averageReadiness: pct, readinessMeasured: measured } = counts;
  if (typeof pct !== 'number' || !Number.isFinite(pct) || !isCount(measured) || measured === 0) return { state: 'unavailable' };
  return { state: 'measured', pct: Math.round(pct), measured };
}

/** The same figure as a sentence, for the screen context AnA reads; null when the server sent none. */
export function averageReadinessSentence(counts: PortfolioCounts | null): string | null {
  const f = averageReadinessFigure(counts);
  if (!f) return null;
  if (f.state === 'measured') return `The server measured an average dossier readiness of ${f.pct}% over the ${f.measured} project(s) with a measured figure.`;
  if (f.state === 'none') return 'No project has a measured dossier readiness yet, so there is no average.';
  if (f.state === 'not_measured') return 'The average dossier readiness is not measured for this many projects.';
  return 'The average dossier readiness could not be read.';
}

function AverageReadiness({ counts }: { counts: PortfolioCounts }) {
  const f = averageReadinessFigure(counts);
  if (!f) return null;
  let said: React.ReactNode = 'average readiness could not be read';
  let title = DOSSIER_READINESS_MEANS;
  if (f.state === 'none') said = 'no readiness measured yet';
  else if (f.state === 'not_measured') {
    said = 'average readiness not measured for this many projects';
    title = 'Narrow the list by client, workstream or pathway to measure it.';
  } else if (f.state === 'measured') {
    said = <><strong>{f.pct}%</strong> average readiness{f.measured < counts.total ? ` over ${formatted(f.measured)} measured` : ''}</>;
    title = `${DOSSIER_READINESS_MEANS} The average is over the projects with a measured figure.`;
  }
  return <>{' · '}<span className="pj-summary-i" title={title}>{said}</span></>;
}

export function PortfolioFigures({ settled, counts }: { settled: boolean; counts: PortfolioCounts | null }) {
  if (!settled) return null;
  if (!counts) return <p className="pj-summary" role="status">The portfolio figures could not be read.</p>;
  const soon = counts.filingWithin60Days;
  return (
    <p className="pj-summary">
      <span className="pj-summary-i"><strong>{formatted(counts.total)}</strong> {counts.total === 1 ? 'active project' : 'active projects'}</span>
      <AverageReadiness counts={counts} />
      {' · '}
      <span className="pj-summary-i" data-tone={soon > 0 ? 'warn' : undefined}>
        <strong>{formatted(soon)}</strong> {soon === 1 ? 'filing' : 'filings'} due within 60 days
      </span>
    </p>
  );
}

/** What a card says of a project's state, from its own row. */
export interface CardFactsRow {
  readiness: number | null;
  readinessState?: DossierFigureState;
  readinessReason?: string;
  stage: string;
  lead: string;
  status: string;
}

/**
 * A card's facts: its dossier readiness as the server measured it (named as
 * Project home names it, with the server's reason as the tooltip), its stage, its
 * lead and its status, in words. Nothing the record does not hold is filled in:
 * no lead reads "No lead named". A blocked status is the card's own warning line
 * (Projects.tsx), so it is not said twice here.
 */
export function CardFacts({ p }: { p: CardFactsRow }) {
  const stage = stated(p.stage);
  const lead = stated(p.lead);
  const facts: React.ReactNode[] = [
    <span key="r" title={p.readinessReason ?? DOSSIER_READINESS_MEANS}>
      {DOSSIER_READINESS_LABEL} {dossierReadinessValue(p.readiness, p.readinessState)}
    </span>,
    stage && <span key="s">{stage}</span>,
    <span key="l">{lead ? `Lead ${lead}` : 'No lead named'}</span>,
    p.status !== 'blocked' && <span key="t">{enumWords(p.status) ?? 'Status not recorded'}</span>,
  ].filter(Boolean);
  return <div className="pj-card-facts">{facts.flatMap((f, i) => (i ? [' · ', f] : [f]))}</div>;
}

/** What the search covers, in its placeholder: the loaded page, which is the
 *  whole portfolio unless the read was paged ("the first n"). No count while the
 *  read is in flight or failed. */
export function searchPlaceholder(loaded: number, paged: boolean, settled: boolean): string {
  if (!settled || loaded === 0) return 'Search projects';
  if (paged) return `Search the first ${loaded} projects`;
  return loaded === 1 ? 'Search 1 project' : `Search ${loaded} projects`;
}
