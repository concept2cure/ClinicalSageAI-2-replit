/**
 * The portfolio's view of the program plan (S11; THE_PROGRAM §5, §9 step 6): the Projects card's one line and the
 * global schedule in Reporting & analytics, both from one batch read of the engine's schedule summary
 * (GET /api/v1/pyramids/by-project?refs=). Split out of PyramidProject.tsx when it passed 500 lines; PyramidProject
 * re-exports it, so every import is unchanged. The date helpers both files use live here.
 *
 * @module client/src/concept2cure/v2/surfaces/PyramidPortfolio
 */
import React from 'react';
import { useLiveData } from '../dataConnect';
import type { PyReviewClock } from '../fixtures/pyramid-data';
import { resolveFilingCatalogEntry } from '@shared/regulatory/filing-catalog';

/** A filing's catalogue name, or null when it has none. */
export const filingName = (filing: string | null | undefined) => (filing ? resolveFilingCatalogEntry(filing)?.displayName ?? null : null);

const DAY = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' } as const;
/** A YYYY-MM-DD date in words, read as the calendar day it names. */
export function dayWords(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, DAY) : iso;
}

export const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export interface LineMark { key: string; at: string; label: string; kind: 'milestone' | 'submission' | 'clock' | 'decision' }

// ── THE_PROGRAM §5, §9 step 6: the portfolio line on Projects ───────────────

/** One project's plan in a few figures (the engine's scheduleSummary), as GET /api/v1/pyramids/by-project?refs= sends
 *  it, or why there is none. */
export interface PortfolioLineData {
  unavailable?: boolean;
  unreadable?: boolean;
  type?: string | null;
  /** The recorded filing (catalogue id), as the single read gives it. */
  filing?: string | null;
  target?: string | null;
  /** The back-schedule's first day, or null when the project has no target date. */
  start?: string | null;
  /** The agency's clock after the filing, or null where none is held. */
  reviewClock?: PyReviewClock | null;
  /** 'hours-only': the plan's dates are the earliest possible, so "on schedule" is said against minimum dates. */
  durations?: 'typical' | 'hours-only' | 'mixed' | null;
  summary?: {
    total: number; done: number; blocked: number; overdue: number; lateToStart: number;
    next: { phaseId: string; phaseName: string; taskId: string; due: string | null } | null;
    status: 'complete' | 'blocked' | 'at-risk' | 'on-track' | 'unscheduled';
  };
}
interface PortfolioRead { asOf: string; lines: Record<string, PortfolioLineData> }
const isPortfolioRead = (v: unknown): v is PortfolioRead => !!v && typeof v === 'object' && typeof (v as PortfolioRead).lines === 'object';

/** The batch's limit (pyramid.routes.ts). Projects reads 50 cards a page. */
export const PORTFOLIO_BATCH = 100;

/** The portfolio lines for a page of projects: one read for the page, not one per card. */
export function usePortfolioLines(programIds: string[]): { lines: Record<string, PortfolioLineData>; error: boolean; loading: boolean; asOf: string | null } {
  const ids = programIds.slice(0, PORTFOLIO_BATCH);
  const key = ids.join(',');
  const read = useLiveData<PortfolioRead>(key ? `/api/v1/pyramids/by-project?refs=${encodeURIComponent(key)}` : null, [key], isPortfolioRead);
  return { lines: read.data?.lines ?? {}, error: Boolean(read.error), loading: read.loading, asOf: read.data?.asOf ?? null };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The line's words. Nothing for a filing with no work breakdown or a project not admitted: the card says its filing. */
export function portfolioWords(line: PortfolioLineData | undefined): { text: string; tone?: 'warn' | 'err' } | null {
  if (!line || line.unavailable || !line.summary) return line?.unreadable ? { text: 'The plan could not be read.' } : null;
  const s = line.summary;
  const next = s.next?.due ? ` · ${s.next.phaseName} by ${dayWords(s.next.due)}` : '';
  switch (s.status) {
    case 'complete': return { text: 'Plan complete' };
    case 'blocked': return { text: `${plural(s.blocked, 'task blocked', 'tasks blocked')}${next}`, tone: 'err' };
    case 'unscheduled': return { text: 'Not scheduled: no target date' };
    case 'at-risk': return {
      text: s.overdue > 0 ? `${plural(s.overdue, 'task', 'tasks')} past due${next}` : `${plural(s.lateToStart, 'task', 'tasks')} should have started${next}`,
      tone: 'warn',
    };
    default: return { text: `${line.durations === 'hours-only' ? 'On schedule against minimum dates' : 'On schedule'}${next}` };
  }
}

/** The card's (or list row's) one quiet line about the plan. Colour only where it is behind, beside the words. */
export function PortfolioLine({ line, className = 'pj-card-plan' }: { line: PortfolioLineData | undefined; className?: string }) {
  const words = portfolioWords(line);
  return words ? <div className={className} data-tone={words.tone} data-testid="portfolio-line">{words.text}</div> : null;
}

/** Said once above the cards when the page's plan lines could not be read: never a page of cards that only looks calm. */
export function PortfolioLinesNote({ error }: { error: boolean }) {
  return error ? <p className="pf-sel-m" role="status" data-testid="portfolio-lines-error">Where each project’s plan stands could not be read.</p> : null;
}

// ── THE_PROGRAM §5, §9 step 6: the global schedule in Reporting & analytics ──

/** A project the global schedule is asked about: its program id and the name the reader knows it by. */
export interface ScheduleProject { programId: string; name: string }

type Drawn = PortfolioLineData & { target: string; start: string; summary: NonNullable<PortfolioLineData['summary']> };

/** Why a project is not drawn on the global schedule, in words; null when it is drawn. */
export function offScheduleReason(line: PortfolioLineData | undefined): string | null {
  if (!line) return 'not read';
  if (line.unavailable) return 'not available to you';
  if (line.unreadable) return 'its plan could not be read';
  if (!line.type) return 'no work breakdown for its filing';
  if (!line.target) return 'no target date';
  return line.start && line.summary ? null : 'its dates could not be laid out';
}

const drawnEnd = (l: Drawn) => l.reviewClock?.ends ?? l.target;

/** One project's line on the shared axis: its work, the filing (filled dot), the agency's clock dashed to its goal,
 *  the next phase to complete, and today. Every date is the read's. */
function GlobalScheduleTrack({ name, line, asOf, pct, width }: {
  name: string; line: Drawn; asOf: string | null; pct: (iso: string) => string; width: (a: string, b: string) => string;
}) {
  const clock = line.reviewClock ?? null;
  const next = line.summary.next?.due ? line.summary.next : null;
  const marks: LineMark[] = [
    ...(next ? [{ key: 'next', at: next.due as string, label: `${next.phaseName} complete`, kind: 'milestone' as const }] : []),
    { key: 'submission', at: line.target, label: 'Submission (target date)', kind: 'submission' },
    ...(clock ? [{ key: 'decision', at: clock.ends, label: `${clock.label} (day ${clock.days})`, kind: 'decision' as const }] : []),
  ];
  return (
    <div className="py-line-track" role="group"
      aria-label={`${name}: work from ${dayWords(line.start)}, submission ${dayWords(line.target)}${clock ? `, ${clock.label.toLowerCase()} by ${dayWords(clock.ends)}` : ''}.`}>
      <span className="py-line-base" style={{ left: pct(line.start), width: width(line.start, line.target) }} />
      {clock && <span className="py-line-clock" style={{ left: pct(line.target), width: width(line.target, clock.ends) }} />}
      {marks.map((m) => (
        <span key={m.key} className="py-line-dot" data-kind={m.kind} style={{ left: pct(m.at) }} role="img" tabIndex={0}
          title={`${m.label} · ${dayWords(m.at)}`} aria-label={`${m.label}, ${dayWords(m.at)}`} />
      ))}
      {asOf && <span className="py-line-today" style={{ left: pct(asOf) }} aria-hidden="true" />}
    </div>
  );
}

function GlobalScheduleRow({ project, line, asOf, pct, width, onOpen }: {
  project: ScheduleProject; line: Drawn; asOf: string | null; pct: (iso: string) => string; width: (a: string, b: string) => string;
  onOpen?: (programId: string) => void;
}) {
  const filing = filingName(line.filing) ?? line.type;
  const agency = line.reviewClock?.authority;
  return (
    <li className="py-gs-row" data-testid="global-schedule-row">
      <div className="py-gs-head">
        {onOpen
          ? <button type="button" className="py-gs-name py-gs-open" onClick={() => onOpen(project.programId)}>{project.name}</button>
          : <span className="py-gs-name">{project.name}</span>}
        <span className="py-gs-sub">{[filing, agency].filter(Boolean).join(' · ')}</span>
        <PortfolioLine line={line} className="py-gs-plan" />
      </div>
      <GlobalScheduleTrack name={project.name} line={line} asOf={asOf} pct={pct} width={width} />
    </li>
  );
}

/**
 * The global schedule (THE_PROGRAM §5: "each region's filing date and review clock side by side"; §9 step 6): one row
 * per project on one shared date axis, sorted by target date, each the Plan step's line. Read once for the chart from
 * the portfolio line's batch read. A project that cannot be drawn is named with why; a failed read is said.
 */
export function GlobalSchedule({ projects, onOpen }: { projects: ScheduleProject[]; onOpen?: (programId: string) => void }) {
  const shown = projects.slice(0, PORTFOLIO_BATCH);
  const { lines, error, loading, asOf } = usePortfolioLines(shown.map((p) => p.programId));
  if (error) return <PortfolioLinesNote error />;
  if (loading) return <p className="pj-desc" role="status">Reading each project’s plan…</p>;
  const drawn = shown.filter((p) => offScheduleReason(lines[p.programId]) === null)
    .map((p) => ({ project: p, line: lines[p.programId] as Drawn }))
    .sort((a, b) => a.line.target.localeCompare(b.line.target) || a.project.name.localeCompare(b.project.name));
  const off = shown.flatMap((p) => { const why = offScheduleReason(lines[p.programId]); return why ? [`${p.name} (${why})`] : []; });
  // Hours laid end to end are a floor, and the chart says which rows they are (as the Plan step does).
  const minimum = drawn.filter(({ line }) => line.durations === 'hours-only').map(({ project }) => project.name);
  const days = drawn.flatMap(({ line }) => [dayMs(line.start), dayMs(drawnEnd(line))]).concat(asOf ? [dayMs(asOf)] : []);
  const lo = Math.min(...days);
  const hi = Math.max(...days);
  const pct = (iso: string) => `${(((dayMs(iso) - lo) / Math.max(1, hi - lo)) * 100).toFixed(2)}%`;
  const width = (a: string, b: string) => `${(((dayMs(b) - dayMs(a)) / Math.max(1, hi - lo)) * 100).toFixed(2)}%`;
  return (
    <figure className="py-gs" data-testid="global-schedule">
      {drawn.length > 0
        ? <ol className="py-gs-rows">{drawn.map(({ project, line }) => <GlobalScheduleRow key={project.programId} project={project} line={line} asOf={asOf} pct={pct} width={width} onOpen={onOpen} />)}</ol>
        : <p className="pj-desc">No project has both a work breakdown and a target date yet, so none can be laid on the schedule.</p>}
      {drawn.length > 0 && (
        <figcaption className="pj-desc pj-fact-none">
          From {dayWords(new Date(lo).toISOString().slice(0, 10))} to {dayWords(new Date(hi).toISOString().slice(0, 10))}{asOf ? `; today is ${dayWords(asOf)}, the thin mark` : ''}.
          {' '}Each line runs from the work’s start to the target submission (the filled dot); the dashed part is the
          agency’s review clock to its decision goal, and the open dot is the next phase to complete. Each plan is
          scheduled back from its target date; the agencies’ published clocks exclude clock stops where they apply.
        </figcaption>
      )}
      {minimum.length > 0 && (
        <p className="pj-desc" role="note" data-testid="global-schedule-minimum">
          Earliest possible dates, not a forecast: {minimum.join('; ')}. Typical task durations are not on record for
          {minimum.length === 1 ? ' this filing type' : ' these filing types'} yet, so each task is given only its working hours.
        </p>
      )}
      {off.length > 0 && <p className="pj-desc" data-testid="global-schedule-off">Not on the schedule: {off.join('; ')}.</p>}
      {projects.length > shown.length && <p className="pj-desc" role="status">The schedule shows the first {shown.length} of {projects.length} projects.</p>}
    </figure>
  );
}
