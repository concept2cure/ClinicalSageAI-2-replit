/**
 * ClinicalStudiesSurface — the portfolio of device clinical studies.
 *
 * `/api/mdx/clinical-studies` (IDE pivotal, feasibility, PMS/PMCF, with
 * nested sites, deviations, AEs and endpoints) had three AnA tool
 * handlers and no screen. This surface gives it one: a read-first list of
 * every study in the tenant, and a drill-in that pulls the server's
 * `/:id/summary` enrollment and safety roll-up.
 *
 * Cross-program surface — a clinical programme commonly runs studies
 * across several submissions, so the list is org-scoped.
 *
 * ## Data honesty
 *
 * Both the list and the per-study roll-up render through `DataGate`. A
 * study list is read to judge trial readiness and a filing's clinical
 * evidence; it must show loading / empty / error honestly and never
 * fabricate a study, an enrollment figure, or a safety count.
 */

import * as React from 'react';
import { I } from '../icons';
import { DataGate } from '../components/DataGate';
import {
  useClinicalStudies,
  useStudySummary,
  deriveStudyKpis,
  type StudyRow,
} from '../hooks/useClinicalStudies';
import { useRbqm } from '../hooks/useRbqm';
import { useStudyDesign } from '../hooks/useStudyDesign';
import { readyRows } from '../lib/dataState';
import type { Program } from '../data/programs';

export interface ClinicalStudiesSurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  /** The project (regulatory_programs UUID) in context, or null for the
   *  portfolio-wide view. When set, the study list and RBQM narrow to it. */
  program: Program | null;
}

/* Map study status to an existing .status-pill modifier (app.css). The
   generic .tone-* classes are parent-scoped and would not colour a pill,
   so we reuse the pill's own vocabulary. */
const STATUS_PILL: Record<string, string> = {
  planning: 'draft',
  enrolling: 'active',
  follow_up: 'active',
  analysis: 'review',
  completed: 'final',
  terminated: 'rejected',
};

/* RBM attention severity → an existing .status-pill modifier. Handles
   both severity vocabularies the feed can emit (critical/high/… and
   err/warn/…); an unknown token falls back to the neutral pill. */
const ATTENTION_PILL: Record<string, string> = {
  critical: 'serious',
  err: 'serious',
  error: 'serious',
  high: 'review',
  warn: 'review',
  warning: 'review',
  medium: 'review',
  moderate: 'review',
  low: 'draft',
  info: 'draft',
};

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  enrolling: 'Enrolling',
  follow_up: 'Follow-up',
  analysis: 'Analysis',
  completed: 'Completed',
  terminated: 'Terminated',
};

const GRID = '1.6fr 90px 90px 110px 120px 70px 70px';

function enrollmentText(s: StudyRow): string {
  const enrolled = s.sampleEnrolled ?? 0;
  if (s.samplePlanned == null || s.samplePlanned === 0) {
    return s.sampleEnrolled == null ? '—' : `${enrolled}`;
  }
  const pct = Math.round((enrolled / s.samplePlanned) * 100);
  return `${enrolled}/${s.samplePlanned} · ${pct}%`;
}

export function ClinicalStudiesSurface({ onAskAna, program }: ClinicalStudiesSurfaceProps) {
  const [selectedId, setSelectedId] = React.useState<number | null>(null);

  /* Everything on this surface hangs off the project — the
     regulatory_programs UUID the shell carries as context. With a project
     selected the list narrows to it; without one it is the portfolio. */
  const projectId = program?.id ?? null;
  const live = useClinicalStudies(projectId);
  const rows = readyRows(live.studies);
  const kpis = deriveStudyKpis(rows);

  const selected = rows.find((s) => s.id === selectedId) ?? null;
  const detail = useStudySummary(selected ? selected.id : null);

  /* RBQM is project-scoped. Prefer the surface's project; fall back to
     the selected study's own program_id so a study opened from the
     portfolio still shows its project's monitoring. */
  const rbqmProgramId = projectId ?? selected?.programId ?? null;
  const rbqm = useRbqm(rbqmProgramId);

  /* Protocol & study design is project-scoped on the same key, so a study
     opened from the portfolio also shows its project's design records. */
  const design = useStudyDesign(rbqmProgramId);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workstream</div>
          <h1 className="page-title">Clinical studies</h1>
          <div className="page-sub">
            21 CFR 812 IDE · ISO 14155 · FDA BIMO · EU MDR Annex XIV / XV.
            {program ? ` · ${program.code}` : ' · Portfolio'}
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                'Summarise our clinical study portfolio — enrollment gaps, open major deviations, and any serious adverse events.',
              )
            }
            type="button"
          >
            {I.sparkles} Ask AnA
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        <div className="metric-card">
          <div className="metric-label">Studies</div>
          <div className="metric-val">{kpis.total}</div>
          <div className="metric-meta">{kpis.enrolling} enrolling or in follow-up</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Enrollment</div>
          <div className="metric-val">
            {kpis.enrollmentPercent}
            <span className="unit">%</span>
          </div>
          <div className="metric-meta">
            {kpis.enrolled} of {kpis.planned} planned
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">IRB approved</div>
          <div className="metric-val">{kpis.irbApproved}</div>
          <div className="metric-meta">of {kpis.total} studies</div>
        </div>
        <div className="metric-card" data-tone={kpis.bimoReady === kpis.total && kpis.total > 0 ? 'ok' : undefined}>
          <div className="metric-label">BIMO ready</div>
          <div className="metric-val">{kpis.bimoReady}</div>
          <div className="metric-meta">Inspection-ready study files</div>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Study portfolio</h2>
          <span className="section-sub">
            Select a study to load its enrollment and safety roll-up · sparkle to ask AnA
          </span>
        </div>
        <DataGate
          state={live.studies}
          label="clinical studies"
          onRetry={live.refresh}
          emptyHint="Studies appear here once an IDE, feasibility, or post-market clinical follow-up study is created."
        >
          {(studies) => (
            <div className="ctable">
              <div className="ctable-head" style={{ gridTemplateColumns: GRID }}>
                <div>Study</div>
                <div>Phase</div>
                <div>Type</div>
                <div>Status</div>
                <div>Enrollment</div>
                <div>IRB</div>
                <div>BIMO</div>
              </div>
              {studies.map((s) => {
                const pill = STATUS_PILL[s.status] ?? 'draft';
                return (
                  <button
                    key={s.id}
                    className="ctable-row"
                    style={{ gridTemplateColumns: GRID, textAlign: 'left', cursor: 'pointer' }}
                    data-selected={s.id === selectedId || undefined}
                    onClick={() => setSelectedId((cur) => (cur === s.id ? null : s.id))}
                    type="button"
                  >
                    <div>
                      <div className="ctable-strong">{s.studyId}</div>
                      <div style={{ color: 'var(--text-400)', fontSize: 12 }}>{s.title}</div>
                    </div>
                    <div>{s.phase ?? '—'}</div>
                    <div>{s.studyType ?? '—'}</div>
                    <div>
                      <span className={`status-pill ${pill}`}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </div>
                    <div className="mono small-mono">{enrollmentText(s)}</div>
                    <div>{s.irbApproved ? I.check : '—'}</div>
                    <div>{s.bimoReady ? I.check : '—'}</div>
                  </button>
                );
              })}
            </div>
          )}
        </DataGate>
      </section>

      {selected && (
        <section className="section">
          <div className="section-head">
            <h2>{selected.studyId} — roll-up</h2>
            <span className="section-sub">
              {selected.title}
              {selected.nctId ? ` · ${selected.nctId}` : ''}
              {selected.ideNumber ? ` · IDE ${selected.ideNumber}` : ''}
            </span>
          </div>
          <DataGate
            state={detail.summary}
            label="study roll-up"
            onRetry={detail.refresh}
            emptyHint="This study has no recorded sites, deviations, adverse events, or endpoints yet."
          >
            {(sum) => (
              <div className="metrics-row metrics-compact">
                <div className="metric-card">
                  <div className="metric-label">Enrollment</div>
                  <div className="metric-val">
                    {sum.enrollment.percent}
                    <span className="unit">%</span>
                  </div>
                  <div className="metric-meta">
                    {sum.enrollment.enrolled} of {sum.enrollment.planned} · {sum.enrollment.sites.activated}/
                    {sum.enrollment.sites.total} sites active
                  </div>
                </div>
                <div className="metric-card" data-tone={sum.deviations.open > 0 ? 'warn' : undefined}>
                  <div className="metric-label">Open deviations</div>
                  <div className="metric-val">{sum.deviations.open}</div>
                  <div className="metric-meta">
                    {sum.deviations.major} major · {sum.deviations.total} total
                  </div>
                </div>
                <div
                  className="metric-card"
                  data-tone={sum.safety.serious > 0 ? 'err' : sum.safety.total > 0 ? 'warn' : undefined}
                >
                  <div className="metric-label">Serious AEs</div>
                  <div className="metric-val">{sum.safety.serious}</div>
                  <div className="metric-meta">
                    {sum.safety.uade} UADE · {sum.safety.device_related} device-related · {sum.safety.total} total
                  </div>
                </div>
                <div className="metric-card" data-tone={sum.endpoints.primary_met > 0 ? 'ok' : undefined}>
                  <div className="metric-label">Endpoints met</div>
                  <div className="metric-val">
                    {sum.endpoints.met}
                    <span className="unit">/{sum.endpoints.total}</span>
                  </div>
                  <div className="metric-meta">{sum.endpoints.primary_met} primary met</div>
                </div>
              </div>
            )}
          </DataGate>
          <div className="page-actions" style={{ marginTop: 12 }}>
            <button
              className="btn ghost small"
              onClick={() =>
                onAskAna(
                  `Give me a BIMO-readiness assessment for study ${selected.studyId} (${selected.title}): enrollment, deviations, and safety.`,
                )
              }
              type="button"
            >
              {I.sparkles} Assess BIMO readiness
            </button>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Protocol and study design</h2>
          <span className="section-sub">
            ICH M11 protocol · SAP · schedule of activities · CRF · project-scoped
            {program ? ` to ${program.code}` : selected ? ' to the selected study' : ''}
          </span>
        </div>
        <DataGate
          state={design.designs}
          label="study designs"
          onRetry={design.refresh}
          emptyHint="No protocol or study design is linked to this project yet. Designs authored in the biostatistics workbench appear here once linked."
        >
          {(designs) => (
            <div className="ctable">
              <div className="ctable-head" style={{ gridTemplateColumns: '1.6fr 90px 1fr 110px 110px' }}>
                <div>Design</div>
                <div>Phase</div>
                <div>Indication</div>
                <div>Status</div>
                <div>Updated</div>
              </div>
              {designs.map((d) => (
                <button
                  key={d.studyId}
                  className="ctable-row"
                  style={{ gridTemplateColumns: '1.6fr 90px 1fr 110px 110px', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() =>
                    onAskAna(
                      `Summarise the protocol and study design "${d.title}" (${d.studyId}) — objectives, population, endpoints, and any defensibility gaps.`,
                    )
                  }
                  type="button"
                >
                  <div className="ctable-strong">{d.title || d.studyId}</div>
                  <div>{d.phase || '—'}</div>
                  <div style={{ color: 'var(--text-400)', fontSize: 12 }}>{d.indication || '—'}</div>
                  <div>
                    <span className="status-pill draft" style={{ textTransform: 'capitalize' }}>
                      {d.status}
                    </span>
                  </div>
                  <div className="mono small-mono">
                    {d.updatedAt ? d.updatedAt.slice(0, 10) : '—'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </DataGate>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Risk-based monitoring</h2>
          <span className="section-sub">
            ICH E6(R3) RBQM · ISO 14155 · project-scoped
            {program ? ` to ${program.code}` : selected ? ' to the selected study' : ''} · read-only
            from the monitoring engine
          </span>
        </div>
        <DataGate
          state={rbqm.summary}
          label="monitoring roll-up"
          onRetry={rbqm.refresh}
          emptyHint="This project has no risk assessment, KRIs, or signals recorded yet."
        >
          {(sum) => (
            <div className="metrics-row metrics-compact">
              <div className="metric-card">
                <div className="metric-label">Overall risk</div>
                <div className="metric-val" style={{ fontSize: 18, textTransform: 'capitalize' }}>
                  {sum.overallRisk ?? '—'}
                </div>
                <div className="metric-meta">{sum.riskItems.total} critical-to-quality risks</div>
              </div>
              <div className="metric-card" data-tone={sum.riskItems.critical > 0 ? 'err' : sum.riskItems.open > 0 ? 'warn' : undefined}>
                <div className="metric-label">Open risk items</div>
                <div className="metric-val">{sum.riskItems.open}</div>
                <div className="metric-meta">
                  {sum.riskItems.critical} critical · {sum.riskItems.high} high
                </div>
              </div>
              <div className="metric-card" data-tone={sum.kris.red > 0 ? 'err' : sum.kris.amber > 0 ? 'warn' : undefined}>
                <div className="metric-label">KRIs</div>
                <div className="metric-val">
                  {sum.kris.red}
                  <span className="unit"> red</span>
                </div>
                <div className="metric-meta">
                  {sum.kris.amber} amber · {sum.kris.total} tracked
                </div>
              </div>
              <div className="metric-card" data-tone={sum.qtls.breached > 0 ? 'err' : sum.qtls.approaching > 0 ? 'warn' : undefined}>
                <div className="metric-label">QTL breaches</div>
                <div className="metric-val">{sum.qtls.breached}</div>
                <div className="metric-meta">
                  {sum.qtls.approaching} approaching · {sum.qtls.total} limits
                </div>
              </div>
              <div className="metric-card" data-tone={sum.signals.open > 0 ? 'warn' : undefined}>
                <div className="metric-label">Open signals</div>
                <div className="metric-val">{sum.signals.open}</div>
                <div className="metric-meta">
                  {sum.signals.high} high · {sum.signals.total} total
                </div>
              </div>
              <div className="metric-card" data-tone={sum.sites.enhanced > 0 ? 'warn' : undefined}>
                <div className="metric-label">Sites on enhanced</div>
                <div className="metric-val">{sum.sites.enhanced}</div>
                <div className="metric-meta">of {sum.sites.total} monitored sites</div>
              </div>
            </div>
          )}
        </DataGate>

        <div className="section-head" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 14 }}>Needs attention</h2>
        </div>
        <DataGate
          state={rbqm.attention}
          label="attention items"
          onRetry={rbqm.refresh}
          emptyHint="No open KRI, QTL, or central-monitoring signals need attention on this project."
        >
          {(items) => (
            <div className="ctable">
              <div className="ctable-head" style={{ gridTemplateColumns: '90px 110px 1fr' }}>
                <div>Severity</div>
                <div>Kind</div>
                <div>Item</div>
              </div>
              {items.slice(0, 12).map((a, i) => {
                const pill = ATTENTION_PILL[String(a.severity).toLowerCase()] ?? 'draft';
                return (
                  <button
                    key={`${a.kind}-${i}`}
                    className="ctable-row"
                    style={{ gridTemplateColumns: '90px 110px 1fr', textAlign: 'left', cursor: 'pointer' }}
                    onClick={() =>
                      onAskAna(
                        `${a.label}${a.detail ? ` — ${a.detail}` : ''}. Walk me through the monitoring response and what it means for this project.`,
                      )
                    }
                    type="button"
                  >
                    <div>
                      <span className={`status-pill ${pill}`} style={{ textTransform: 'capitalize' }}>
                        {a.severity}
                      </span>
                    </div>
                    <div className="mono tiny">{a.kind}</div>
                    <div>
                      <div className="ctable-strong">{a.label}</div>
                      {a.detail && (
                        <div style={{ color: 'var(--text-400)', fontSize: 12 }}>{a.detail}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DataGate>

        {rbqmProgramId && (
          <div className="page-actions" style={{ marginTop: 12 }}>
            <button
              className="btn ghost small"
              onClick={() =>
                onAskAna(
                  'Summarise the risk-based monitoring posture for this project — red KRIs, breached QTLs, and open signals — and the recommended monitoring actions.',
                )
              }
              type="button"
            >
              {I.sparkles} Review monitoring posture
            </button>
          </div>
        )}
      </section>
    </>
  );
}
