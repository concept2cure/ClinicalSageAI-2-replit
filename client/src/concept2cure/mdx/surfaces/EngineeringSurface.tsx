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
 * Panels whose source table has no program column are labelled
 * organization-wide from `live.scopes`, so the user is never led to
 * believe org-level rows belong to the selected program.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import { DataGate } from '../components/DataGate';
import { EmptyState } from '../../v2/dataConnect';
import {
  ENG_DHF,
  ENG_ECRS,
  ENG_ISSUES,
  ENG_RISK_ACCEPT,
  ENG_RISK_PROB,
  ENG_RISK_SEVERITY,
  ENG_RISKS,
  ENG_TRACE,
} from '../data/engineering';
import { ENG_DOCUMENTS } from '../data/engineering-docs';
import { useEngineering, type PanelScope } from '../hooks/useEngineering';
import { readyRows } from '../lib/dataState';
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

/** Marker for panels that are organization-wide rather than per-program. */
function ScopeNote({ scope }: { scope: PanelScope | undefined }) {
  if (scope !== 'organization') return null;
  return (
    <span className="scope-note" title="This source has no program column yet">
      Organization-wide
    </span>
  );
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
  const dhf = readyRows(live.dhf);
  const risks = readyRows(live.risks);
  const ecrs = readyRows(live.ecrs);
  const issues = readyRows(live.issues);
  const trace = readyRows(live.trace);

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
  const documents = readyRows(live.documents) as unknown as KitDocument[];
  const readyCount = documents.filter((d) => d.status === 'ready').length;
  const reviewCount = documents.filter((d) => d.status === 'review').length;
  const draftCount = documents.filter((d) => d.status === 'draft').length;
  const blockedDocs = documents.filter((d) => d.blocker);
  const pendingSig = documents.filter((d) => d.esigState === 'pending').length;
  const avgCompletion = documents.length
    ? Math.round(documents.reduce((s, d) => s + d.completion, 0) / documents.length)
    : 0;

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
        state={live.summary}
        label="engineering metrics"
        onRetry={live.refresh}
        emptyHint="Metrics appear once this program has design, risk or change records."
      >
        {(s) => (
          <div className="metrics-row metrics-compact">
            <div className="metric-card">
              <div className="metric-label">Documents in flight</div>
              <div className="metric-val">{documents.length}</div>
              <div className="metric-meta">
                {readyCount} ready · {reviewCount} in review · {draftCount} draft
              </div>
            </div>
            <div className="metric-card" data-tone="err">
              <div className="metric-label">Open risks</div>
              <div className="metric-val">{s.openRisks}</div>
              <div className="metric-meta">
                {s.openRisks === 0 ? 'All risks verified' : 'Not yet verified'}
              </div>
            </div>
            <div className="metric-card" data-tone="warn">
              <div className="metric-label">Open change requests</div>
              <div className="metric-val">{s.openEcrs}</div>
              <div className="metric-meta">
                {blockedDocs.length} blocked · {pendingSig} awaiting signature
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">DHF completion</div>
              <div className="metric-val">
                {s.dhfCompletion}
                <span className="unit">%</span>
              </div>
              <div className="metric-meta">
                Required sections validated · avg doc {avgCompletion}%
              </div>
            </div>
          </div>
        )}
      </DataGate>

      <DataGate
        state={live.documents}
        label="engineering documents"
        onRetry={live.refresh}
        sample={ENG_DOCUMENTS}
        emptyHint="Design and software deliverables appear here once artifacts exist for this organization."
      >
        {(docs) => (
          <DocumentsPanel
            title="Documents in flight"
            subtitle="Tap any row to open in the editor · sparkle to ask AnA to draft the next section"
            docs={docs as unknown as KitDocument[]}
            onOpenEditor={onOpenEditor}
            onAskAna={(text) => onAskAna(text)}
          />
        )}
      </DataGate>

      <section className="section">
        <div className="section-head">
          <h2>What&apos;s blocking your documents</h2>
          <span className="section-sub">
            {blockers.filter((b) => b.severity === 'err').length} hard blockers ·{' '}
            {blockers.filter((b) => b.severity === 'warn').length} review-pending ·
            pulled from DHF · risk · change requests · non-conformance
          </span>
        </div>
        {blockers.length === 0 ? (
          /* The last hand-rolled copy of the empty state `<DataGate>` used to
             draw — it reproduced the gate's `data-gate-inner` / `-copy` /
             `-title` / `-detail` markup by hand, and was the only thing still
             holding that CSS alive after the gate converged onto
             `<EmptyState>`. No `action`: this panel is empty because nothing is
             wrong, and there is nothing for the user to fix. That is the one
             case the contract's part 3 does not apply to. */
          <EmptyState
            icon={I.checkCircle}
            title="Nothing is blocking your documents"
            hint="No draft or blocked DHF sections, unverified risks, open change requests or non-conformances were found."
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
              <ScopeNote scope={live.scopes.dhf} />
            </div>
            <DataGate
              state={live.dhf}
              label="DHF sections"
              onRetry={live.refresh}
              sample={ENG_DHF}
              dense
              emptyHint="Device-category sections appear here once the 510(k) section set is created."
            >
              {(rows) => (
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
                    the risk file, and they are zero when it is empty. */}
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
                        const verdict = (ENG_RISK_ACCEPT as unknown as Record<string, string>)[key];
                        const count = cellCounts[key] ?? 0;
                        const isFiltered = cellFilter === key;
                        return (
                          <button
                            key={key}
                            className={`eng-heat-cell tone-${verdict}${isFiltered ? ' on' : ''}${
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
              </section>

              <section>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <h2 style={{ fontSize: 14 }}>Risk records</h2>
                  <span className="section-sub">
                    {visibleRisks.length} of {risks.length} shown
                  </span>
                </div>
                <DataGate
                  state={live.risks}
                  label="risk records"
                  onRetry={live.refresh}
                  sample={ENG_RISKS}
                  dense
                  emptyHint="Add hazards to this program's ISO 14971 risk file to populate the matrix."
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
                  <ScopeNote scope={live.scopes.trace} />
                </div>
                <DataGate
                  state={live.trace}
                  label="traceability rows"
                  onRetry={live.refresh}
                  sample={ENG_TRACE}
                  dense
                  emptyHint="Design inputs trace to outputs, verification and validation once design controls are recorded."
                >
                  {(rows) => (
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
              <ScopeNote scope={live.scopes.ecrs} />
            </div>
            <DataGate
              state={live.ecrs}
              label="change requests"
              onRetry={live.refresh}
              sample={ENG_ECRS}
              dense
              emptyHint="Engineering change requests appear here as they are raised."
            >
              {(rows) => (
                <div className="eng-trace-summary mono tiny">
                  {rows.length} change requests ·{' '}
                  {rows.filter((e) => e.state === 'open' || e.state === 'review').length} in flight
                </div>
              )}
            </DataGate>

            <div className="section-head">
              <h2 style={{ fontSize: 14 }}>Non-conformances</h2>
              <ScopeNote scope={live.scopes.issues} />
            </div>
            <DataGate
              state={live.issues}
              label="non-conformances"
              onRetry={live.refresh}
              sample={ENG_ISSUES}
              dense
              emptyHint="Non-conforming product records appear here when raised in the quality system."
            >
              {(rows) => (
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
