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
import { readyRows } from '../lib/dataState';

export interface ClinicalStudiesSurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
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

export function ClinicalStudiesSurface({ onAskAna }: ClinicalStudiesSurfaceProps) {
  const [selectedId, setSelectedId] = React.useState<number | null>(null);

  const live = useClinicalStudies();
  const rows = readyRows(live.studies);
  const kpis = deriveStudyKpis(rows);

  const selected = rows.find((s) => s.id === selectedId) ?? null;
  const detail = useStudySummary(selected ? selected.id : null);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workstream</div>
          <h1 className="page-title">Clinical studies</h1>
          <div className="page-sub">
            21 CFR 812 IDE · ISO 14155 · FDA BIMO · EU MDR Annex XIV / XV.
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
    </>
  );
}
