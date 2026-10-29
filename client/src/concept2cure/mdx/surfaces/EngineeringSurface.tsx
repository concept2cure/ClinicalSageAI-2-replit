/**
 * EngineeringSurface — DOC-FIRST.
 *
 * Documents the engineering team produces are the primary zone; the
 * dashboards (DHF strip, ISO 14971 heatmap, risk records) collapse into
 * a "Situational awareness" accordion the user expands on demand.
 *
 * ## Data honesty
 *
 * Every panel renders through `DataGate`, so an empty tenant reads as
 * empty, a failed fetch reads as an error with a retry, and canonical
 * example content appears only when the user has explicitly switched on
 * sample mode. There are deliberately no `live.x ?? FIXTURE` fallbacks
 * in this file — in a device workspace, an example risk file that looks
 * like your own risk file is a patient-safety hazard, not a placeholder.
 *
 * Panels whose source table has no program column are not shown until
 * `live.scopes` reports them keyed to the project (slice 0 of
 * .design/client-journey/INFORMATION_ARCHITECTURE.md, the
 * `device-engineering` row). Labelling them "Organization-wide" still drew
 * another project's records under this project's name. The same holds for
 * the metric cards counted from those rows and for the documents panel,
 * which the route also reports organization-scoped.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel, averageAssessedCompletion } from '../components/DocumentsPanel';
import { DataGate } from '../components/DataGate';
import { EmptyState } from '../../v2/dataConnect';
import { assessmentState, mayReassure } from '../../v2/assessmentState';
import { ENG_RISK_PROB, ENG_RISK_SEVERITY } from '../data/engineering';
import { useEngineering, type PanelScope } from '../hooks/useEngineering';
import { gatedOn, readyRows } from '../lib/dataState';
import type { Program } from '../data/programs';
import type { KitDocument } from '../components/DocumentsPanel';

export interface EngineeringSurfaceProps {
  program: Program | null;
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  /** Open a document in the editor — host wires this to the v2 editor route. */
  onOpenEditor?: (docId: string) => void;
}

interface Blocker {
  kind: 'dhf' | 'risk' | 'ecr' | 'nc';
  severity: 'err' | 'warn' | 'low';
  ref: string;
  title: string;
  note: string;
  owner: string;
  age: string;
}

const SEV_ORDER: Record<Blocker['severity'], number> = { err: 0, warn: 1, low: 2 };

/* Slice 0 (INFORMATION_ARCHITECTURE.md, `device-engineering`): DHF, trace,
   change requests, non-conformances and documents are read by organisation
   only (server/routes/mdx-engineering.ts:523-530), so their rows may be
   another project's. A panel renders only once the route reports it keyed to
   the project; an unreported scope counts as not keyed. This replaces the
   "Organization-wide" pill, which still drew those rows. */
function keyedToProject(scope: PanelScope | undefined): boolean {
  return scope === 'program';
}

const NOT_KEYED_LINE = "Shown once this screen reads this project's records.";

/* Rendered inside the panel's DataGate, so loading, a failed read and an
   empty organisation still read as themselves; this replaces only rows.
   It says the records are held organization-wide only when the route said so. */
function NotKeyedNote({ panel, scope }: { panel: string; scope: PanelScope | undefined }) {
  return (
    <p className="eng-trace-summary" data-testid={`eng-not-keyed-${panel}`}>
      {NOT_KEYED_LINE}
      {scope === 'organization'
        ? ' These records are held for the whole organization, not per project, so they are not shown here.'
        : ''}
    </p>
  );
}

/* Slice 0 audit 2: an empty read lands in the gate's empty branch, not in
   NotKeyedNote, so its hint must not promise records "appear here" while they
   would not be shown. Like the note, it names the organization only when the
   route said so. */
function notKeyedEmptyHint(scope: PanelScope | undefined): string {
  return (scope === 'organization' ? 'Nothing is recorded for the organization. ' : '') +
    "Records are shown here once this screen reads this project's records.";
}

/* Slice 0: a metric counted from rows not keyed to the project is not printed. */
function NotKeyedMetric() {
  return (
    <>
      <div className="metric-val">—</div>
      <div className="metric-meta">{NOT_KEYED_LINE}</div>
    </>
  );
}

/** "a, b or c" / "a, b and c" for the blocker feed's copy. */
function listOf(items: string[], conj: 'or' | 'and'): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`;
}

export function EngineeringSurface({
  program,
  onAskAna,
  onOpenEditor,
}: EngineeringSurfaceProps) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);
  const [cellFilter, setCellFilter] = React.useState<string | null>(null);

  const live = useEngineering(program?.id ?? null);

  /* Derived views read through readyRows: they yield [] for every
     non-ready state, and the surrounding DataGate has already told the
     user which state that is. No fixture can leak in here. */
  const dhfKeyed = keyedToProject(live.scopes.dhf);
  const traceKeyed = keyedToProject(live.scopes.trace);
  const ecrsKeyed = keyedToProject(live.scopes.ecrs);
  const issuesKeyed = keyedToProject(live.scopes.issues);
  const docsKeyed = keyedToProject(live.scopes.documents);
  /* Slice 0: a store not keyed to the project contributes no rows here, so
     its records cannot reach the blocker feed either. */
  const dhf = dhfKeyed ? readyRows(live.dhf) : [];
  const risks = readyRows(live.risks);
  const ecrs = ecrsKeyed ? readyRows(live.ecrs) : [];
  const issues = issuesKeyed ? readyRows(live.issues) : [];

  const programContext = program ? `${program.code} · ${program.title}` : null;

  /* Consolidated blocker feed — everything stopping documents from
     landing, in one list, sorted by severity. */
  const blockers = React.useMemo<Blocker[]>(() => {
    const list: Blocker[] = [];
    for (const d of dhf) {
      if (d.status === 'draft' || d.status === 'blocked') {
        list.push({
          kind: 'dhf',
          severity: d.status === 'blocked' ? 'err' : 'warn',
          ref: `DHF §${d.num}`,
          title: d.label,
          note: d.meta,
          owner: d.owner,
          age: d.updated,
        });
      }
    }
    for (const r of risks) {
      if (r.state !== 'verified') {
        list.push({
          kind: 'risk',
          severity: r.state === 'open' ? 'warn' : 'low',
          ref: r.id,
          title: r.hazard,
          note: `${r.harm} · residual ${r.residual ?? '—'}`,
          owner: r.owner,
          age: '—',
        });
      }
    }
    for (const e of ecrs) {
      if (e.state === 'open' || e.state === 'review') {
        list.push({
          kind: 'ecr',
          severity: 'low',
          ref: e.id,
          title: e.title,
          note: `${e.impact} · ${e.riskChange}`,
          owner: e.owner,
          age: e.opened,
        });
      }
    }
    for (const n of issues) {
      list.push({
        kind: 'nc',
        severity: n.severity === 'high' ? 'err' : n.severity === 'medium' ? 'warn' : 'low',
        ref: n.id,
        title: n.title,
        note: `linked ${n.linked} · ${n.state}`,
        owner: n.owner,
        age: n.age,
      });
    }
    return list.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  }, [dhf, risks, ecrs, issues]);

  const cellCounts = React.useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const r of risks) if (r.residual) m[r.residual] = (m[r.residual] ?? 0) + 1;
    return m;
  }, [risks]);

  const visibleRisks = cellFilter
    ? risks.filter((r) => r.residual === cellFilter)
    : risks;

  /* Document metrics are computed from whatever the documents panel
     actually resolved to — never from a fixture — so the cards and the
     table can never disagree. */
  /* Every source the blocker feed reads. Its all-clear is only true if all
     of them actually answered — and, since slice 0, it names only the sources
     read for this project; the rest are said to be left out, not "found". */
  /* `hard`: the only sources that can raise a hard blocker (a blocked DHF
     section, an undispositioned non-conformance). `recorded`: what "nothing
     recorded yet" names. */
  const blockerSources = [
    { keyed: dhfKeyed, state: live.dhf, sub: 'DHF', found: 'draft or blocked DHF sections', left: 'DHF sections', hard: true, recorded: 'design history file' },
    { keyed: true, state: live.risks, sub: 'risk', found: 'unverified risks', left: 'risks', hard: false, recorded: 'risk file' },
    { keyed: ecrsKeyed, state: live.ecrs, sub: 'change requests', found: 'open change requests', left: 'change requests', hard: false, recorded: 'change requests' },
    { keyed: issuesKeyed, state: live.issues, sub: 'non-conformance', found: 'non-conformances', left: 'non-conformances', hard: true, recorded: 'non-conformances' },
  ];
  const readSources = blockerSources.filter((b) => b.keyed);
  const leftOut = blockerSources.filter((b) => !b.keyed);
  /* Slice 0 audit: with DHF or non-conformances left out, "0 hard blockers" is
     zero by construction, so the count is not printed. */
  const hardLeftOut = leftOut.filter((b) => b.hard);
  /* Slice 0 audit: every source read for this project holds no rows (a source
     left out contributes []), so nothing has been assessed. That is not the
     same claim as "assessed and nothing is blocking". */
  const nothingRecorded = dhf.length + risks.length + ecrs.length + issues.length === 0;
  const leftOutSentence =
    leftOut.length === 0
      ? ''
      : ` ${listOf(leftOut.map((b) => b.left), 'and').replace(/^./, (c) => c.toUpperCase())} are left out until this screen reads this project's records.`;
  const blockersState = gatedOn(
    live.risks,
    ...readSources.filter((b) => b.state !== live.risks).map((b) => b.state),
  );
  /* Slice 0 audit 2: `blockers` is [] for a loading or failed read as well as
     an empty one, so its counts are printed only once every source read for
     this project has resolved. */
  const blockersRead = blockersState.status === 'ready' || blockersState.status === 'empty';
  /* The four-state discriminator (v2/assessmentState.ts) is what may select
     "Nothing is blocking": the check ran only when every source read for this
     project resolved AND held records. An empty `blockers` alone is not it. */
  const blockerVerdict = assessmentState({
    loading: blockersState.status === 'loading',
    unreadable: blockersState.status === 'error',
    scopeExists: !nothingRecorded,
    findingCount: blockers.length,
    assessmentRan: blockersRead,
  });

  /* Slice 0 audit: the documents read is organization-scoped too (the route
     reports `documents: 'organization'`), so its rows feed no card until keyed. */
  const documents = (docsKeyed ? readyRows(live.documents) : []) as unknown as KitDocument[];
  const readyCount = documents.filter((d) => d.status === 'ready').length;
  const reviewCount = documents.filter((d) => d.status === 'review').length;
  const draftCount = documents.filter((d) => d.status === 'draft').length;
  const avgCompletion = averageAssessedCompletion(documents);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            Workstream{programContext ? ` · ${programContext}` : ''}
          </div>
          <h1 className="page-title">Device engineering</h1>
          <div className="page-sub">
            21 CFR 820.30 design controls · ISO 14971 risk · IEC 62304 software ·
            FDA premarket cybersecurity.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() => onAskAna('Summarise the current state of the design history file.')}
            type="button"
          >
            {I.sparkles} Ask AnA
          </button>
        </div>
      </div>

      <DataGate
        /* Four of these cards count `documents`, not `summary` — "Documents in
           flight", the ready/review/draft split, blocked/awaiting-signature and
           average completion. Gated on `summary` alone, a failed documents read
           printed all four as zeroes under a ready heading. */
        state={gatedOn(live.summary, live.documents)}
        label="engineering metrics"
        onRetry={live.refresh}
        emptyHint="Metrics appear once this project has design, risk or change records."
      >
        {(s) => (
          <div className="metrics-row metrics-compact">
            {/* Slice 0 audit: "Documents in flight", "Open change requests" and
                "DHF completion" are counted from organisation-wide rows, so each
                prints only once its source is keyed to the project. */}
            <div className="metric-card">
              <div className="metric-label">Documents in flight</div>
              {docsKeyed ? (
                <>
                  <div className="metric-val">{documents.length}</div>
                  <div className="metric-meta">
                    {readyCount} ready · {reviewCount} in review · {draftCount} draft
                  </div>
                </>
              ) : (
                <NotKeyedMetric />
              )}
            </div>
            <div className="metric-card" data-tone="err">
              <div className="metric-label">Open risks</div>
              <div className="metric-val">{s.openRisks}</div>
              <div className="metric-meta">
                {/* Slice 0 audit: an empty risk file is not "all verified". */}
                {/* `risks` is [] for a failed or pending read too; this card is
                    gated on summary and documents, not on the risk file. */}
                {live.risks.status === 'error'
                  ? 'Risk file could not be read'
                  : live.risks.status === 'loading'
                    ? 'Reading the risk file'
                    : risks.length === 0
                      ? 'No risks recorded yet'
                      : s.openRisks === 0 ? 'All risks verified' : 'Not yet verified'}
              </div>
            </div>
            <div className="metric-card" data-tone={ecrsKeyed ? 'warn' : undefined}>
              <div className="metric-label">Open change requests</div>
              {/* The meta line used to count documents (blocked, awaiting
                  signature), which are not change requests. */}
              {ecrsKeyed ? (
                <>
                  <div className="metric-val">{s.openEcrs}</div>
                  <div className="metric-meta">Open or in review</div>
                </>
              ) : (
                <NotKeyedMetric />
              )}
            </div>
            <div className="metric-card">
              <div className="metric-label">DHF completion</div>
              {dhfKeyed ? (
                <>
                  <div className="metric-val">
                    {s.dhfCompletion}
                    <span className="unit">%</span>
                  </div>
                  <div className="metric-meta">
                    Required sections validated · avg doc {avgCompletion === null ? '—' : `${avgCompletion}%`}
                  </div>
                </>
              ) : (
                <NotKeyedMetric />
              )}
            </div>
          </div>
        )}
      </DataGate>

      <DataGate
        state={live.documents}
        label="engineering documents"
        onRetry={live.refresh}
        emptyHint={docsKeyed
          ? 'Design and software deliverables appear here once artifacts exist for this organization.'
          : notKeyedEmptyHint(live.scopes.documents)}
      >
        {(docs) =>
          /* Slice 0 audit: the artifacts in this list are read by organisation
             only, so the list is not shown until the route keys it. */
          !docsKeyed ? (
            <section className="section">
              <div className="section-head">
                <h2>Documents in flight</h2>
              </div>
              <NotKeyedNote panel="documents" scope={live.scopes.documents} />
            </section>
          ) : (
            <DocumentsPanel
              title="Documents in flight"
              subtitle="Tap any row to open in the editor · sparkle to ask AnA to draft the next section"
              docs={docs as unknown as KitDocument[]}
              onOpenEditor={onOpenEditor}
              onAskAna={(text) => onAskAna(text)}
            />
          )
        }
      </DataGate>

      <section className="section">
        <div className="section-head">
          <h2>What&apos;s blocking your documents</h2>
          <span className="section-sub">
            {!blockersRead ? (
              `Not counted until the ${listOf(readSources.map((b) => b.recorded), 'and')} ${readSources.length === 1 ? 'is' : 'are'} read`
            ) : (
              <>
                {hardLeftOut.length === 0
                  ? `${blockers.filter((b) => b.severity === 'err').length} hard blockers`
                  : `Hard blockers not counted: ${listOf(hardLeftOut.map((b) => b.left), 'and')} are left out`}{' · '}
                {blockers.filter((b) => b.severity === 'warn').length} review-pending ·
                pulled from {readSources.map((b) => b.sub).join(' · ')}
              </>
            )}
          </span>
        </div>
        {/* `blockers` is built from dhf, risks, ecrs and issues through
            readyRows, which yields [] for a FAILED read exactly as it does for
            an empty one. Ungated, four failed reads printed "Nothing is
            blocking your documents · No draft or blocked DHF sections,
            unverified risks, open change requests or non-conformances were
            found" — the one positive regulatory claim on this surface, and the
            sentence the user acts on, asserted over records nobody read. */}
        {!blockersRead ? (
          <DataGate state={blockersState} label="blocker sources" onRetry={live.refresh}>
            {() => null}
          </DataGate>
        ) : blockers.length === 0 && nothingRecorded ? (
          /* Slice 0 audit: nothing recorded is nothing assessed, so no check
             mark and no "were found". */
          <EmptyState
            icon={I.fileText}
            title={readSources.length === 1 ? 'No risk records for this project yet' : 'No records for this project yet'}
            hint={
              `Nothing has been recorded in this project's ${listOf(readSources.map((b) => b.recorded), 'or')}, so there is nothing to check yet.` +
              leftOutSentence
            }
            testId="eng-no-blockers"
          />
        ) : blockerVerdict === 'assessed-clear' ? (
          /* The last hand-rolled copy of the empty state `<DataGate>` used to
             draw — it reproduced the gate's `data-gate-inner` / `-copy` /
             `-title` / `-detail` markup by hand, and was the only thing still
             holding that CSS alive after the gate converged onto
             `<EmptyState>`. No `action`: this panel is empty because nothing is
             wrong, and there is nothing for the user to fix. That is the one
             case the contract's part 3 does not apply to. */
          /* Slice 0: with a source left out for not being keyed to the project,
             "nothing is blocking" would be a claim over records never read
             for it, so the copy names what was read and what was left out. */
          <EmptyState
            icon={I.checkCircle}
            title={leftOut.length === 0 && mayReassure(blockerVerdict) ? 'Nothing is blocking your documents' : 'No blockers in the records read for this project'}
            hint={`No ${listOf(readSources.map((b) => b.found), 'or')} were found.` + leftOutSentence}
            testId="eng-no-blockers"
          />
        ) : (
          <div className="eng-blockers-feed">
            {blockers.slice(0, 8).map((b, i) => (
              <button
                key={`${b.ref}-${i}`}
                className="eng-blocker-row"
                data-sev={b.severity}
                data-kind={b.kind}
                onClick={() =>
                  onAskAna(
                    `${b.ref} — ${b.title}. Walk me through the next step to clear it and which document this unblocks.`,
                  )
                }
                type="button"
              >
                <span className={`eng-blocker-dot tone-${b.severity}`} />
                <span className="eng-blocker-kind mono tiny">{b.kind}</span>
                <span className="mono small eng-blocker-ref">{b.ref}</span>
                <span className="eng-blocker-title">{b.title}</span>
                <span className="eng-blocker-note">{b.note}</span>
                <span className="eng-blocker-owner">{b.owner}</span>
                <span className="eng-blocker-age">{b.age}</span>
              </button>
            ))}
            {blockers.length > 8 && (
              <button
                className="eng-blocker-more"
                onClick={() => setAwarenessOpen(true)}
                type="button"
              >
                Show {blockers.length - 8} more · open situational awareness {I.arrowRight}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="section eng-awareness" data-open={awarenessOpen}>
        <button
          className="eng-awareness-head"
          onClick={() => setAwarenessOpen((o) => !o)}
          aria-expanded={awarenessOpen}
          type="button"
        >
          <span className="eng-awareness-chev">{awarenessOpen ? I.down : I.right}</span>
          <h2>Situational awareness</h2>
          <span className="section-sub">
            DHF strip · ISO 14971 heatmap · design-controls trace · change requests ·
            non-conformances
          </span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            <div className="section-head" style={{ marginTop: 0 }}>
              <h2 style={{ fontSize: 14 }}>Design history file</h2>
            </div>
            {/* Slice 0: rows not shown until keyed to the project (see
                keyedToProject); the gate still shows loading, failure, empty. */}
            <DataGate
              state={live.dhf}
              label="DHF sections"
              onRetry={live.refresh}
              dense
              emptyHint={dhfKeyed
                ? 'Device-category sections appear here once the 510(k) section set is created.'
                : notKeyedEmptyHint(live.scopes.dhf)}
            >
              {(rows) => !dhfKeyed ? (
                <NotKeyedNote panel="dhf" scope={live.scopes.dhf} />
              ) : (
                <div className="eng-dhf-strip">
                  {rows.map((d) => (
                    <div key={d.id} className="eng-dhf-cell" data-status={d.status} title={d.label}>
                      <div className="eng-dhf-num mono">§{d.num}</div>
                      <div className="eng-dhf-label">{d.label}</div>
                      <div className="eng-dhf-meta">
                        <span className="mono">{d.ver}</span>
                        <span className="dot-sep" aria-hidden="true">·</span>
                        <span>{d.updated}</span>
                      </div>
                      <span className={`status-pill ${d.status}`}>{d.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </DataGate>

            <div className="eng-grid eng-grid-awareness">
              <section>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <h2 style={{ fontSize: 14 }}>Residual risk · ISO 14971</h2>
                  <span className="section-sub">
                    {cellFilter ? (
                      <>
                        Filtered {cellFilter} ·{' '}
                        <button
                          className="chip-filter"
                          onClick={() => setCellFilter(null)}
                          type="button"
                        >
                          Clear {I.close}
                        </button>
                      </>
                    ) : (
                      'Click a cell to filter'
                    )}
                  </span>
                </div>
                {/* The matrix axes are policy constants, not tenant data —
                    they render regardless. Only the cell counts come from
                    the risk file, and they are zero when it is empty.
                    When the risk read FAILED they were also zero, and an
                    all-zero residual matrix is not a blank: it asserts that no
                    hazard sits in any severity/probability band, the
                    unacceptable ones included. That claim needs the read to
                    have happened. */}
                {live.risks.status === 'error' ? (
                  <DataGate state={live.risks} label="the risk file" onRetry={live.refresh}>
                    {() => null}
                  </DataGate>
                ) : (
                <div className="eng-heat">
                  <div className="eng-heat-corner" />
                  {ENG_RISK_PROB.map((p) => (
                    <div key={p.id} className="eng-heat-col-lbl">
                      <span className="mono tiny">{p.id}</span>
                      <span>{p.label}</span>
                    </div>
                  ))}
                  {[...ENG_RISK_SEVERITY].reverse().map((s) => (
                    <React.Fragment key={s.id}>
                      <div className="eng-heat-row-lbl">
                        <span className="mono tiny">{s.id}</span>
                        <span>{s.label}</span>
                      </div>
                      {ENG_RISK_PROB.map((p) => {
                        const key = `${s.id}${p.id}`;
                        const count = cellCounts[key] ?? 0;
                        const isFiltered = cellFilter === key;
                        return (
                          <button
                            key={key}
                            className={`eng-heat-cell${isFiltered ? ' on' : ''}${
                              count === 0 ? ' empty' : ''
                            }`}
                            onClick={() => count > 0 && setCellFilter(isFiltered ? null : key)}
                            type="button"
                          >
                            <span className="eng-heat-n">{count || ''}</span>
                          </button>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
                )}
              </section>

              <section>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <h2 style={{ fontSize: 14 }}>Risk records</h2>
                  <span className="section-sub">
                    {/* `risks` is [] for a failed read as well as an empty one,
                        so "0 of 0 shown" read as a count of the file rather
                        than as the absence of one — directly above the gate
                        that says it could not be loaded. */}
                    {live.risks.status === 'error'
                      ? 'not loaded'
                      : `${visibleRisks.length} of ${risks.length} shown`}
                  </span>
                </div>
                <DataGate
                  state={live.risks}
                  label="risk records"
                  onRetry={live.refresh}
                  dense
                  emptyHint="Add hazards to this project's ISO 14971 risk file to populate the matrix."
              regulation="Serves the ISO 14971 risk management file"
                >
                  {() => (
                    <div className="eng-risks">
                      {visibleRisks.slice(0, 4).map((r) => (
                        <button
                          key={r.id}
                          className="eng-risk-row"
                          data-state={r.state}
                          onClick={() => onAskAna(`Open risk ${r.id} (${r.hazard}).`)}
                          type="button"
                        >
                          <div className="eng-risk-head">
                            <span className="mono eng-risk-id">{r.id}</span>
                            <span className="eng-risk-hazard">{r.hazard}</span>
                            <span className="mono tiny eng-risk-resid">{r.residual ?? '—'}</span>
                          </div>
                          <div className="eng-risk-harm">{r.harm}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </DataGate>

                <div className="section-head">
                  <h2 style={{ fontSize: 14 }}>Design-controls trace</h2>
                </div>
                {/* Slice 0: rows not shown until keyed to the project. */}
                <DataGate
                  state={live.trace}
                  label="traceability rows"
                  onRetry={live.refresh}
                  dense
                  emptyHint={traceKeyed
                    ? 'Design inputs trace to outputs, verification and validation once design controls are recorded.'
                    : notKeyedEmptyHint(live.scopes.trace)}
                >
                  {(rows) => !traceKeyed ? (
                    <NotKeyedNote panel="trace" scope={live.scopes.trace} />
                  ) : (
                    <div className="eng-trace-summary mono tiny">
                      {rows.length} traceability rows tracked ·{' '}
                      {rows.filter((t) => t.state === 'verified').length} verified
                    </div>
                  )}
                </DataGate>
              </section>
            </div>

            <div className="section-head">
              <h2 style={{ fontSize: 14 }}>Change requests</h2>
            </div>
            {/* Slice 0: rows not shown until keyed to the project. */}
            <DataGate
              state={live.ecrs}
              label="change requests"
              onRetry={live.refresh}
              dense
              emptyHint={ecrsKeyed
                ? 'Engineering change requests appear here as they are raised.'
                : notKeyedEmptyHint(live.scopes.ecrs)}
            >
              {(rows) => !ecrsKeyed ? (
                <NotKeyedNote panel="ecrs" scope={live.scopes.ecrs} />
              ) : (
                <div className="eng-trace-summary mono tiny">
                  {rows.length} change requests ·{' '}
                  {rows.filter((e) => e.state === 'open' || e.state === 'review').length} in flight
                </div>
              )}
            </DataGate>

            <div className="section-head">
              <h2 style={{ fontSize: 14 }}>Non-conformances</h2>
            </div>
            {/* Slice 0: rows not shown until keyed to the project. */}
            <DataGate
              state={live.issues}
              label="non-conformances"
              onRetry={live.refresh}
              dense
              emptyHint={issuesKeyed
                ? 'Non-conforming product records appear here when raised in the quality system.'
                : notKeyedEmptyHint(live.scopes.issues)}
            >
              {(rows) => !issuesKeyed ? (
                <NotKeyedNote panel="issues" scope={live.scopes.issues} />
              ) : (
                <div className="eng-trace-summary mono tiny">
                  {rows.length} non-conformances ·{' '}
                  {rows.filter((n) => n.severity === 'high').length} undispositioned
                </div>
              )}
            </DataGate>
          </div>
        )}
      </section>
    </>
  );
}
