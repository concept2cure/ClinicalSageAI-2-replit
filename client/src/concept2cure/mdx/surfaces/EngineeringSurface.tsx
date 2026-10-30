/**
 * EngineeringSurface — DOC-FIRST.
 *
 * Documents the engineering team produces are the primary zone. Below them
 * sit the project's ISO 14971 risk register and its design-controls trace,
 * the same panels the Risk and Design controls screens mount (fold F1 slice
 * B, 2026-10-29: v2/surfaces/RiskRegister.tsx and DesignControlsTrace.tsx).
 * The project's design history (its document sections), change requests and
 * non-conformances collapse into a "Situational awareness" accordion the user
 * expands on demand (EngineeringDesignHistory.tsx draws the first, P-60).
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
import { ProjectRefused } from '../../v2/projectScopedRead';
import { RiskRegister, useRiskRegister } from '../../v2/surfaces/RiskRegister';
import { DesignControlsTrace, useDesignControlsTrace } from '../../v2/surfaces/DesignControlsTrace';
import { useEngineering, type PanelScope } from '../hooks/useEngineering';
import { gatedOn, readyRows } from '../lib/dataState';
import type { Program } from '../data/programs';
import type { KitDocument } from '../components/DocumentsPanel';
import { useReportPanelsContext, type EngineeringPanelsContextProps } from './engineeringPanelsContext';
import { EngineeringDesignHistory } from './EngineeringDesignHistory';
import { useEngineeringPanelTarget } from './engineeringPanelTarget';

/* `onPanelsContext` (EngineeringPanelsContextProps) hands the risk register's
   and the trace's AnA context to the host, which publishes device-engineering's. */
export interface EngineeringSurfaceProps extends EngineeringPanelsContextProps {
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

/* Slice 0 (INFORMATION_ARCHITECTURE.md, `device-engineering`): a panel read
   by organisation may hold another project's rows, so a panel renders only
   once the route reports it keyed to the project; an unreported scope counts
   as not keyed. Since P-60 (2026-10-29) the route reads every panel for the
   project. This replaces the "Organization-wide" pill, which drew those rows. */
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

export function EngineeringSurface({ program, onAskAna, onOpenEditor, onPanelsContext }: EngineeringSurfaceProps) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);
  const panelTarget = useEngineeringPanelTarget(program ? String(program.id) : null);

  const live = useEngineering(program?.id ?? null);

  /* Fold F1 slice B: the Risk and Design controls screens' panels, for this
     project only. They read once this screen's own route has answered for the
     project, and nothing when it refused it (server/lib/admit-project.ts). */
  const scoped = {
    programId: program ? String(program.id) : null,
    requireProject: true,
    waiting: program != null && !live.answered,
    refusal: live.refusal,
  };
  const risk = useRiskRegister({ ...scoped, surfaceId: 'device-engineering' });
  const designControls = useDesignControlsTrace(scoped);
  /* What AnA may see of both panels goes to the host, which publishes
     device-engineering's context (./engineeringPanelsContext.ts). */
  useReportPanelsContext(onPanelsContext, program, risk.anaContext, designControls.anaContext);

  /* Derived views read through readyRows: they yield [] for every
     non-ready state, and the surrounding DataGate has already told the
     user which state that is. No fixture can leak in here. */
  const dhfKeyed = keyedToProject(live.scopes.dhf);
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
          ref: `§${d.num}`,
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
    { keyed: dhfKeyed, state: live.dhf, sub: 'design history', found: 'draft or blocked document sections', left: 'document sections', hard: true, recorded: 'design history' },
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

  const header = (
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
  );

  /* The route refused the project, so it read nothing: one sentence, no panels. */
  if (live.refusal) {
    return (
      <>
        {header}
        <ProjectRefused refusal={live.refusal} onRetry={live.refresh} testId="eng-project-refused" />
      </>
    );
  }

  return (
    <>
      {header}

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
              <div className="metric-label">Mandatory sections approved</div>
              {dhfKeyed ? (
                <>
                  <div className="metric-val">
                    {s.dhfCompletion}
                    <span className="unit">%</span>
                  </div>
                  <div className="metric-meta">
                    Across this project&apos;s documents · avg doc {avgCompletion === null ? '—' : `${avgCompletion}%`}
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

      {/* Fold F1 slice B: the project's whole risk file and design-controls
          trace, the panels the Risk and Design controls screens mount. They
          replace the residual-only heatmap, the four-row risk list and the
          one-line trace count this screen drew in the accordion. */}
      {program && (
        <section className="section" data-testid="eng-risk-register">
          <div className="section-head">
            <h2 ref={panelTarget.risk} tabIndex={-1}>Risk management · ISO 14971</h2>
            {risk.canWrite && (
              <button className="btn ghost small" onClick={() => risk.setForm(true)} disabled={!risk.mayAdd} type="button">
                {I.plus} New hazard
              </button>
            )}
          </div>
          <RiskRegister register={risk} onAsk={(text) => onAskAna(text)} />
        </section>
      )}

      {program && (
        <section className="section" data-testid="eng-design-controls">
          <div className="section-head">
            <h2 ref={panelTarget.designControls} tabIndex={-1}>Design controls · DHF</h2>
            {designControls.canWrite && (
              <button className="btn ghost small" onClick={() => designControls.setForm(true)} disabled={!designControls.mayAdd} type="button">
                {I.plus} New design input
              </button>
            )}
          </div>
          <DesignControlsTrace dc={designControls} onAsk={(text) => onAskAna(text)} />
        </section>
      )}

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
            Design history · change requests · non-conformances
          </span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            {/* The project's own document sections (P-60). */}
            <EngineeringDesignHistory state={live.dhf} keyed={dhfKeyed} onRetry={live.refresh}
              notKeyedEmptyHint={notKeyedEmptyHint(live.scopes.dhf)}
              notKeyed={<NotKeyedNote panel="dhf" scope={live.scopes.dhf} />} />

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
