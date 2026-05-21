/**
 * EngineeringSurface — DOC-FIRST (the committed Phase 4 design).
 *
 * Documents the engineering team produces are the primary surface; the
 * dashboards (DHF strip, ISO 14971 heatmap, risk records) collapse
 * into a "Situational awareness" accordion the user can expand on
 * demand.
 *
 * Per PHASE_4_INSTALL.md §1.1: this is one of the three doc-first
 * Phase 4 surfaces (Engineering · UDI · Postmarket). The page-header
 * primary CTA opens the Risk Management File; metric cards count
 * documents; DocumentsPanel is the primary zone.
 *
 * Port basis: design-system/ui_kits/mdx/surfaces/Engineering.jsx.
 * Fixture fallback via useEngineering(programId) per §1.3 of the install
 * guide — the surface renders the same shape whether data comes from
 * the kit fixture or the live `/api/mdx/engineering/:programId` endpoint.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
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
import { ENG_DOC_FRAMEWORKS, ENG_DOCUMENTS } from '../data/engineering-docs';
import { useEngineering } from '../hooks/useEngineering';
import type { Program } from '../data/programs';
import type { KitDocument, KitDocFramework } from '../components/DocumentsPanel';

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

export function EngineeringSurface({
  program,
  onAskAna,
  onOpenEditor,
}: EngineeringSurfaceProps) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);
  const [cellFilter, setCellFilter] = React.useState<string | null>(null);

  const live = useEngineering(program?.id ?? null);
  const dhf = live.dhf ?? ENG_DHF;
  const trace = live.trace ?? ENG_TRACE;
  const risks = live.risks ?? ENG_RISKS;
  const ecrs = live.ecrs ?? ENG_ECRS;
  const issues = live.issues ?? ENG_ISSUES;

  /* Engineering documents come from the data module's static export —
     the kit's `data/engineering-docs.ts` carries the doc list. A live
     documents endpoint isn't planned for Phase 4; documents persist
     through the existing artifact / vault tables already in use by the
     Phase 2 surfaces. */
  const documents = ENG_DOCUMENTS as unknown as KitDocument[];
  const frameworks = ENG_DOC_FRAMEWORKS as unknown as KitDocFramework[];

  const programContext = program ? `${program.code} · ${program.title}` : null;

  /* Consolidated blocker feed — everything stopping documents from
     landing, in one list, sorted by severity. Pulls from DHF gaps,
     unverified risks, ECRs in flight, and open non-conformances. */
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
          note: `${r.harm} · residual ${r.residual}`,
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
    for (const r of risks) m[r.residual] = (m[r.residual] ?? 0) + 1;
    return m;
  }, [risks]);

  const visibleRisks = cellFilter
    ? risks.filter((r) => r.residual === cellFilter)
    : risks;

  const readyCount = documents.filter((d) => d.status === 'ready').length;
  const reviewCount = documents.filter((d) => d.status === 'review').length;
  const draftCount = documents.filter((d) => d.status === 'draft').length;
  const blockedDocs = documents.filter((d) => d.blocker);
  const pendingSig = documents.filter((d) => d.esigState === 'pending').length;
  const avgCompletion = documents.length
    ? Math.round(
        documents.reduce((s, d) => s + d.completion, 0) / documents.length,
      )
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
            {documents.length} regulatory documents to deliver before{' '}
            {program?.dueLabel?.toLowerCase() ?? 'filing'}. 21 CFR 820.30 design
            controls · ISO 14971 risk · IEC 62304 software · FDA Cyber 2023.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() => onOpenEditor?.('doc-srs-bx204')}
            type="button"
          >
            {I.eye} Open SRS
          </button>
          <button
            className="btn primary small"
            onClick={() => onOpenEditor?.('doc-rmr-bx204')}
            type="button"
          >
            {I.pencil} Open Risk Management File
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        <div className="metric-card">
          <div className="metric-label">Documents in flight</div>
          <div className="metric-val">{documents.length}</div>
          <div className="metric-meta">
            {readyCount} ready · {reviewCount} in review · {draftCount} draft
          </div>
        </div>
        <div className="metric-card" data-tone="err">
          <div className="metric-label">Blocked documents</div>
          <div className="metric-val">{blockedDocs.length}</div>
          <div className="metric-meta">
            {blockedDocs.length === 0
              ? '—'
              : blockedDocs
                  .map((d) => (d.type ?? '').split(' ')[0] || d.title.split(' ')[0])
                  .join(' · ')}
          </div>
        </div>
        <div className="metric-card" data-tone="warn">
          <div className="metric-label">Awaiting signature</div>
          <div className="metric-val">{pendingSig}</div>
          <div className="metric-meta">Pending Part 11 e-signature</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg completion</div>
          <div className="metric-val">
            {avgCompletion}
            <span className="unit">%</span>
          </div>
          <div className="metric-meta">Section-weighted across all artifacts</div>
        </div>
      </div>

      <DocumentsPanel
        title="Documents in flight"
        subtitle="Tap any row to open in the editor · sparkle to ask AnA to draft the next section"
        docs={documents}
        frameworks={frameworks}
        onOpenEditor={onOpenEditor}
        onAskAna={(text) => onAskAna(text)}
      />

      <section className="section">
        <div className="section-head">
          <h2>What&apos;s blocking your documents</h2>
          <span className="section-sub">
            {blockers.filter((b) => b.severity === 'err').length} hard blockers ·{' '}
            {blockers.filter((b) => b.severity === 'warn').length} review-pending ·
            pulled from DHF · risk · ECR · non-conformance
          </span>
        </div>
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
              Show {blockers.length - 8} more · open situational awareness{' '}
              {I.arrowRight}
            </button>
          )}
        </div>
      </section>

      <section className="section eng-awareness" data-open={awarenessOpen}>
        <button
          className="eng-awareness-head"
          onClick={() => setAwarenessOpen((o) => !o)}
          aria-expanded={awarenessOpen}
          type="button"
        >
          <span className="eng-awareness-chev">
            {awarenessOpen ? I.down : I.right}
          </span>
          <h2>Situational awareness</h2>
          <span className="section-sub">
            DHF strip · ISO 14971 heatmap · design-controls trace · ECRs ·
            non-conformances
          </span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            <div className="eng-dhf-strip">
              {dhf.map((d) => (
                <div
                  key={d.id}
                  className="eng-dhf-cell"
                  data-status={d.status}
                  title={d.label}
                >
                  <div className="eng-dhf-num mono">§{d.num}</div>
                  <div className="eng-dhf-label">{d.label}</div>
                  <div className="eng-dhf-meta">
                    <span className="mono">{d.ver}</span>
                    <span className="dot-sep">·</span>
                    <span>{d.updated}</span>
                  </div>
                  <span className={`status-pill ${d.status}`}>{d.status}</span>
                </div>
              ))}
            </div>

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
                        const verdict = (
                          ENG_RISK_ACCEPT as unknown as Record<string, string>
                        )[key];
                        const count = cellCounts[key] ?? 0;
                        const isFiltered = cellFilter === key;
                        return (
                          <button
                            key={key}
                            className={`eng-heat-cell tone-${verdict}${
                              isFiltered ? ' on' : ''
                            }${count === 0 ? ' empty' : ''}`}
                            onClick={() =>
                              count > 0 && setCellFilter(isFiltered ? null : key)
                            }
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
                <div className="eng-risks">
                  {visibleRisks.slice(0, 4).map((r) => (
                    <button
                      key={r.id}
                      className="eng-risk-row"
                      data-state={r.state}
                      onClick={() =>
                        onAskAna(`Open risk ${r.id} (${r.hazard}).`)
                      }
                      type="button"
                    >
                      <div className="eng-risk-head">
                        <span className="mono eng-risk-id">{r.id}</span>
                        <span className="eng-risk-hazard">{r.hazard}</span>
                        <span className="mono tiny eng-risk-resid">{r.residual}</span>
                      </div>
                      <div className="eng-risk-harm">{r.harm}</div>
                    </button>
                  ))}
                </div>
                {/* Trace summary, available but collapsed until needed —
                    the full traceability table is its own surface. */}
                {trace.length > 0 && (
                  <div className="eng-trace-summary mono tiny">
                    {trace.length} traceability rows tracked
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
