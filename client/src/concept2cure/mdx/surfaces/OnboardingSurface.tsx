/**
 * OnboardingSurface — Phase 8 migration importer.
 *
 * 7-step wizard for new paying clients. Connect → ingest → AnA extract
 * → section map → validate → seed memory → go live. Cross-program.
 *
 * Port basis: design-system/ui_kits/mdx/surfaces/Onboarding.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import {
  ONB_ARTIFACTS,
  ONB_KPIS,
  ONB_STEPS,
  ONB_VALIDATIONS,
} from '../data/onboarding';
import { useOnboarding } from '../hooks/useOnboarding';

export interface OnboardingSurfaceProps {
  /** Tenant identifier for the live endpoint. Null while the host
   *  hasn't resolved the active tenant context yet. */
  tenantId?: string | null;
  onAskAna: (text: string, opts?: { tool?: string }) => void;
}

function artifactStatePill(state: string): 'complete' | 'review' | 'draft' {
  if (state === 'mapped') return 'complete';
  if (state === 'review') return 'review';
  return 'draft';
}

export function OnboardingSurface({
  tenantId = null,
  onAskAna,
}: OnboardingSurfaceProps) {
  const live = useOnboarding(tenantId);
  const steps = live.steps ?? ONB_STEPS;
  const artifacts = live.artifacts ?? ONB_ARTIFACTS;
  const validations = live.validations ?? ONB_VALIDATIONS;
  const kpis = live.kpis ?? ONB_KPIS;
  const currentStep = live.currentStep ?? 'map';

  const stepIdx = Math.max(
    0,
    steps.findIndex((s) => s.id === currentStep),
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">System · client onboarding</div>
          <h1 className="page-title">Migration importer</h1>
          <div className="page-sub">
            Bring legacy 510(k), PMA, IDE archives + style guides + RTA
            letters into Concept2Cure. AnA-driven extraction,
            canonical-section mapping, current-standard validation, memory
            seeding.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                'Pause the migration and surface every artifact still in review or unmappable. I want to do a manual pass.',
              )
            }
            type="button"
          >
            {I.eye} Review queue
          </button>
          <button
            className="btn primary small"
            onClick={() =>
              onAskAna(
                'Resume AnA section mapping — work through the remaining unmappable artifacts and propose canonical-section matches.',
              )
            }
            type="button"
          >
            {I.sparkles} Resume mapping
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {kpis.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone ?? ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Migration pipeline</h2>
          <span className="section-sub">
            Step {stepIdx + 1} of {steps.length} · {steps[stepIdx]?.label}
          </span>
        </div>
        <div className="onb-pipeline">
          {steps.map((s, i) => {
            const state =
              i < stepIdx ? 'complete' : i === stepIdx ? 'active' : 'idle';
            return (
              <div key={s.id} className="onb-step" data-state={state}>
                <div className="onb-step-num mono">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="onb-step-label">{s.label}</div>
                <div className="onb-step-desc">{s.desc}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Artifacts ingested · canonical mapping</h2>
          <span className="section-sub">
            {artifacts.length} shown · AnA confidence + manual-override
            available per row
          </span>
        </div>
        <div className="ctable">
          <div
            className="ctable-head"
            style={{ gridTemplateColumns: '90px 1.6fr 1fr 90px 100px 60px' }}
          >
            <div>ID</div>
            <div>Legacy filename</div>
            <div>Mapped to / section</div>
            <div>Confidence</div>
            <div>State</div>
            <div>Issues</div>
          </div>
          {artifacts.map((a) => (
            <button
              key={a.id}
              className="ctable-row"
              style={{ gridTemplateColumns: '90px 1.6fr 1fr 90px 100px 60px' }}
              onClick={() =>
                onAskAna(
                  `Open import ${a.id} (${a.legacy}) — show me the extraction trace and let me approve, edit, or remap.`,
                )
              }
              type="button"
            >
              <div className="mono small">{a.id}</div>
              <div className="ctable-strong">{a.legacy}</div>
              <div style={{ color: 'var(--text-300)', fontSize: 12 }}>
                {a.section}
              </div>
              <div>
                <span className="onb-conf">
                  <span className="onb-conf-bar">
                    <span
                      className="onb-conf-fill"
                      style={{ width: `${a.confidence * 100}%` }}
                    />
                  </span>
                  <span className="mono small">
                    {Math.round(a.confidence * 100)}%
                  </span>
                </span>
              </div>
              <div>
                <span className={`status-pill ${artifactStatePill(a.state)}`}>
                  {a.state}
                </span>
              </div>
              <div>
                {a.issues > 0 ? (
                  <span className="pill-err small">{a.issues}</span>
                ) : (
                  <span style={{ color: 'var(--success)' }}>—</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Validation results</h2>
          <span className="section-sub">
            Current-standard checks against ISO 14971:2019, ISO 10993-1:2018,
            FDA 2023 cyber guidance, EU MDR/IVDR Annexes
          </span>
        </div>
        <div className="onb-validations">
          {validations.map((v) => (
            <div key={v.id} className="onb-val" data-sev={v.severity}>
              <span className={`onb-val-dot tone-${v.severity}`} />
              <div className="onb-val-body">
                <div className="onb-val-rule">{v.rule}</div>
                <div className="onb-val-note">{v.note}</div>
              </div>
              <span className="mono tiny onb-val-ref">{v.artifact}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
