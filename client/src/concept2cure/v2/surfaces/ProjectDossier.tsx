/**
 * The project's dossier on Project home: the readiness card and the module
 * rows, from one read (FILING_SPINE.md F23).
 *
 * GET /api/c2c/projects/:id/dossier (server/services/c2c/dossier-read.ts)
 * answers the home filing's figure, each added market's own line and one row
 * per module, on one definition of complete (approved or locked). The card
 * and the rows both read it, so they can no longer disagree: at head the
 * header pooled every market and the module rows weighted review as 75, so
 * the page could read 0% above modules at 75%, or 100% above modules at 0%.
 *
 * Every figure is the server's. Nothing here computes one; it prints them.
 * A read in flight says so, a failed read says it failed and offers Retry, a
 * store the server could not read says why, and a project with nothing to
 * count says that. None of them is drawn as 0.
 */
import React from 'react';
import { I } from '../icons';
import { EmptyState, hasKeys, useLiveData, type DataState, type ShapeGuard } from '../dataConnect';
import { DOSSIER_READINESS_LABEL, DOSSIER_READINESS_MEANS, dossierReadinessAsOf, dossierReadinessValue } from '../dossierReadiness';
import { Ring } from '../fixtures/project-home-data';
import type { BuiltDocument } from '../editor/CanvasDocumentList';

/** A figure as the server states it (dossier-read DossierFigure). */
export type DossierFigure =
  | { state: 'measured'; pct: number; counted: number; complete: number }
  | { state: 'no_sections'; pct: null }
  | { state: 'unavailable'; pct: null; reason: string };

export interface DossierRow {
  group: 'module' | 'document';
  module: string | null;
  agency: string | null;
  label: string;
  documentId: string;
  counted: number;
  complete: number;
  inReview: number;
  drafted: number;
  figure: DossierFigure;
  lastUpdated: string | null;
  /** Counted governed sections. An older response can omit these details. */
  sections?: Array<{ key: string; label: string; status: string }>;
}

export interface DossierMarket {
  scope: 'home' | 'market';
  agency: string;
  docType: string;
  documentId: string;
  figure: DossierFigure;
  notHeld: Array<{ key: string; label: string }> | null;
}

export interface DossierRead {
  projectId: string;
  measuredAt: string;
  home: DossierFigure;
  markets: DossierMarket[];
  rows: DossierRow[];
}

const isFigure = (v: unknown): v is DossierFigure => {
  const f = v as { state?: unknown; pct?: unknown } | null;
  if (!f || typeof f !== 'object') return false;
  if (f.state === 'measured') return typeof f.pct === 'number';
  return (f.state === 'no_sections' || f.state === 'unavailable') && f.pct === null;
};

/** A 200 without the dossier's shape is a failed read, never an empty dossier. */
const isDossierRead: ShapeGuard<DossierRead> = (v): v is DossierRead => {
  if (!hasKeys<DossierRead>('home', 'markets', 'rows')(v)) return false;
  return isFigure(v.home) && Array.isArray(v.markets) && Array.isArray(v.rows) && v.rows.every((r) => isFigure(r?.figure));
};

export interface DossierState {
  state: DataState<DossierRead>;
  retry: () => void;
}

/** The project's dossier, read once for the card, the rows and AnA. */
export function useProjectDossier(pid: string | null): DossierState {
  const [bump, setBump] = React.useState(0);
  const path = pid ? `/api/c2c/projects/${encodeURIComponent(pid)}/dossier` : null;
  const state = useLiveData<DossierRead>(path, [path, bump], isDossierRead);
  const retry = React.useCallback(() => setBump((b) => b + 1), []);
  return React.useMemo(() => ({ state, retry }), [state, retry]);
}

/** A figure in a word or two: "62%", "not measured", "unavailable", in the
 *  words the Projects card uses for the same figure. */
export function figureValue(f: DossierFigure): string {
  return dossierReadinessValue(f.pct, f.state);
}

/** What a figure counts, in a sentence; never a 0 for no figure. */
function figureLine(f: DossierFigure): string {
  if (f.state === 'measured') return `${f.complete} of ${f.counted} section${f.counted === 1 ? '' : 's'} approved or locked.`;
  if (f.state === 'no_sections') return 'No governed sections to count yet.';
  return f.reason;
}

const marketName = (m: DossierMarket) => `${m.agency.toUpperCase()} · ${m.docType.toUpperCase()}`;

/** Keep an older or malformed detail distinct from an empty section list. */
const hasSectionDetails = (sections: unknown): sections is NonNullable<DossierRow['sections']> =>
  Array.isArray(sections) && sections.every((s) => s && typeof s.key === 'string' && typeof s.label === 'string' && typeof s.status === 'string');

const SECTION_STATUS_LABELS = new Map([
  ['approved', 'Approved'], ['locked', 'Locked'], ['review', 'In review'], ['drafted', 'Drafted'], ['empty', 'Empty'],
]);
const sectionStatus = (status: string) => SECTION_STATUS_LABELS.get(status) ?? (status || 'Status not recorded');

/** The aside card: the home filing's figure, and each added market's line. */
export function DossierReadinessCard({ read }: { read: DossierState }) {
  const { state, retry } = read;
  const d = state.data;
  let body: React.ReactNode;
  if (state.error) {
    body = (
      <div role="alert">
        <p className="pj-card-note">Dossier readiness could not be read.</p>
        <button type="button" className="btn ghost pj-mkt-btn" onClick={retry}>Retry</button>
      </div>
    );
  } else if (!d) {
    body = <p role="status" aria-busy="true" className="pj-card-note">Reading…</p>;
  } else {
    const added = d.markets.filter((m) => m.scope === 'market');
    const homeCounts = d.rows.filter((r) => r.agency === null).reduce(
      (total, r) => ({ inReview: total.inReview + r.inReview, drafted: total.drafted + r.drafted }),
      { inReview: 0, drafted: 0 },
    );
    body = (
      <>
        {d.home.state === 'measured' && (
          <div className="pj-map" title={DOSSIER_READINESS_MEANS}>
            <div className="pj-map-ring"><Ring value={d.home.pct} size={104} stroke={9} /><div className="pj-map-ring-l">Dossier<br />readiness</div></div>
          </div>
        )}
        <p className="pj-card-note" data-testid="pj-dossier-home">{figureLine(d.home)}</p>
        {d.home.state === 'measured' && (
          <p className="pj-card-note">{homeCounts.inReview} in review · {homeCounts.drafted} drafted</p>
        )}
        {added.length > 0 && (
          <ul className="pj-dossier-mkts" aria-label="Each added market">
            {added.map((m) => (
              <li key={m.documentId} data-testid="pj-dossier-market">
                <b>{marketName(m)}</b>: {figureValue(m.figure)} · {figureLine(m.figure)}
                {m.notHeld && m.notHeld.length > 0 && (
                  <> {m.notHeld.length} required section{m.notHeld.length === 1 ? ' is' : 's are'} not in this project&apos;s dossier.</>
                )}
                {m.notHeld === null && <> Whether its required sections are all held could not be read.</>}
              </li>
            ))}
          </ul>
        )}
        <p className="pj-card-note">{DOSSIER_READINESS_MEANS}</p>
        {d.home.state === 'measured' && dossierReadinessAsOf(d.measuredAt) && <p className="pj-card-note">{dossierReadinessAsOf(d.measuredAt)}</p>}
      </>
    );
  }
  return (
    <section className="pj-card" aria-labelledby="pj-dossier-h">
      <div className="pj-card-h">
        <h3 id="pj-dossier-h">{DOSSIER_READINESS_LABEL}</h3>
        <span className="sec-sub" data-testid="pj-dossier-value">{state.error ? 'could not be read' : d ? figureValue(d.home) : 'reading'}</span>
      </div>
      {body}
    </section>
  );
}

/** One row: the module (or document), its bar, its figure and what it counts.
 *  A row whose module holds one of this project's documents opens the newest
 *  one (FILING_SPINE.md §6 row 4); otherwise it has nothing to click. */
function ModuleRow({ r, match, onOpen }: {
  r: DossierRow; match: { doc: BuiltDocument; count: number; n: number } | null; onOpen: (doc: BuiltDocument) => void;
}) {
  const pct = r.figure.state === 'measured' ? r.figure.pct : null;
  const counts = `${r.complete} of ${r.counted} approved or locked${r.inReview ? ` · ${r.inReview} in review` : ''}`;
  const risk = pct != null && pct < 50 ? true : undefined;
  const updated = r.lastUpdated ? new Date(r.lastUpdated) : null;
  const hasUpdated = updated && !Number.isNaN(updated.getTime());
  const body = (
    <>
      <span className="pj-lmod-t">{r.label} · {counts}</span>
      <span className="pj-lmod-track"><span className="pj-lmod-fill" data-risk={risk} style={{ width: `${pct ?? 0}%` }} /></span>
      <span className="pj-lmod-pct">{figureValue(r.figure)}</span>
    </>
  );
  const which = match && match.count > 1 ? `, the newest of ${match.count} Module ${match.n} documents` : '';
  return (
    <div className="pj-lmodrow">
      {match ? (
        <>
          <button type="button" className="pj-lmod" data-risk={risk} data-testid="pj-lmod" onClick={() => onOpen(match.doc)}
            aria-label={`${r.label}: ${counts}, ${figureValue(r.figure)}. Open ${match.doc.title}${which}`}>
            {body}
          </button>
          <span className="pj-lmod-doc" data-testid="pj-lmod-doc">Opens {match.doc.title}{which}</span>
        </>
      ) : <div className="pj-lmod" data-none data-risk={risk} data-testid="pj-lmod">{body}</div>}
      <span className="pj-lmod-doc">{hasUpdated ? <>Updated <time dateTime={r.lastUpdated!}>{updated.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></> : 'Update time not recorded.'}</span>
      {hasSectionDetails(r.sections) ? (
        <details className="pj-lmod-sections">
          <summary>Section status</summary>
          <p className="pj-card-note">Counted governed sections. Empty headings that hold other sections are not counted.</p>
          <ul aria-label={`${r.label} section status`}>
            {r.sections.map((s) => <li key={s.key}><span>{s.key} · {s.label}</span><span>{sectionStatus(s.status)}</span></li>)}
          </ul>
        </details>
      ) : <p className="pj-card-note">Section details unavailable.</p>}
    </div>
  );
}

/** The Author tab's module rows, from the same read as the card. */
export function ModuleCompletion({ read, docForModule, onOpen, onAsk }: {
  read: DossierState;
  /** The newest of this project's documents in a CTD module, and how many it holds. */
  docForModule: (module: string | null) => { doc: BuiltDocument; count: number; n: number } | null;
  onOpen: (doc: BuiltDocument) => void;
  onAsk?: (question: string) => void;
}) {
  const { state, retry } = read;
  const d = state.data;
  let body: React.ReactNode;
  if (state.error) {
    body = <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load module completion"
      hint="The dossier read didn't answer, so no module is shown as complete or not. Retry, or check the service is reachable." retry={retry} />;
  } else if (!d) {
    body = <div role="status" aria-busy="true" className="scaf-note" style={{ padding: '16px 10px' }}>Loading module completion…</div>;
  } else if (d.home.state === 'unavailable' && d.rows.length === 0) {
    body = <EmptyState tone="error" icon={I.alertTriangle} title="Module completion unavailable" hint={d.home.reason} />;
  } else if (d.rows.length === 0) {
    body = <EmptyState icon={I.fileText} title="No document sections yet" hint="Once this project has governed document sections, per-module completion appears here." />;
  } else {
    body = (
      <div className="pj-mods">
        {d.rows.map((r) => (
          <ModuleRow key={`${r.documentId}:${r.module ?? r.label}`} r={r}
            match={r.group === 'module' && !r.agency ? docForModule(r.module) : null} onOpen={onOpen} />
        ))}
      </div>
    );
  }
  return (
    <section className="pj-sec">
      <div className="pj-sec-h"><h2>Module completion</h2><span className="sec-sub">sections approved or locked, by module</span></div>
      {onAsk && <button type="button" className="btn ghost" onClick={() => onAsk('What is the critical path to filing?')}>Ask AnA: critical path to filing</button>}
      {body}
    </section>
  );
}

/** What AnA is told of the dossier: the server's figures, or why there are none. */
export function dossierFacts(read: DossierState): Record<string, unknown> {
  const { state } = read;
  if (state.error) return { dossier: null, dossierUnavailable: 'the dossier read failed' };
  const d = state.data;
  if (!d) return { dossier: null, dossierUnavailable: 'the dossier is still being read' };
  return {
    dossier: {
      measuredAt: d.measuredAt,
      home: d.home,
      markets: d.markets.map((m) => ({ market: marketName(m), scope: m.scope, figure: m.figure, notHeld: m.notHeld?.length ?? null })),
      rows: d.rows.map((r) => ({ label: r.label, module: r.module, agency: r.agency, counted: r.counted, complete: r.complete, inReview: r.inReview, drafted: r.drafted, figure: r.figure, lastUpdated: r.lastUpdated, sections: hasSectionDetails(r.sections) ? r.sections : null })),
    },
    dossierUnavailable: null,
  };
}

/** The home figure in the summary sentence AnA is given. */
export function dossierSummaryValue(read: DossierState): string {
  if (read.state.error) return 'could not be read';
  return read.state.data ? figureValue(read.state.data.home) : 'still being read';
}
