/**
 * LdtSurface — Phase 6 doc-first with FDA 2024 phase tracker.
 *
 * FDA 2024 LDT rule brings laboratory-developed tests under FDA
 * oversight in 4 phases through May 2028. Track which LDTs are in
 * which phase, what phase-specific deliverables remain, and which
 * qualify for enforcement discretion (pre-2024 grandfathered LDTs).
 *
 * Cross-program. Port basis:
 * design-system/ui_kits/mdx/surfaces/Ldt.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import {
  LDT_DOC_FRAMEWORKS,
  LDT_DOCUMENTS,
  LDT_INVENTORY,
  LDT_KPIS,
  LDT_PHASES,
} from '../data/ldt';
import { useLdt } from '../hooks/useLdt';
import { SampleDataBanner } from '../components/SampleDataBanner';
import type {
  KitDocFramework,
  KitDocument,
} from '../components/DocumentsPanel';

export interface LdtSurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  onOpenEditor?: (docId: string) => void;
}

function phasePill(phase: string): 'idle' | 'review' | 'active' {
  if (phase === 'EDX') return 'idle';
  if (phase === 'P4') return 'review';
  return 'active';
}

function riskSev(risk: string): 'high' | 'medium' | 'low' {
  if (risk === 'high') return 'high';
  if (risk === 'med') return 'medium';
  return 'low';
}

export function LdtSurface({ onAskAna, onOpenEditor }: LdtSurfaceProps) {
  const [phaseFilter, setPhaseFilter] = React.useState<string>('all');

  const live = useLdt();
  const phases = live.phases ?? LDT_PHASES;
  const inventory = live.inventory ?? LDT_INVENTORY;
  const kpis = live.kpis ?? LDT_KPIS;
  const documents = LDT_DOCUMENTS as unknown as KitDocument[];
  const frameworks = LDT_DOC_FRAMEWORKS as unknown as KitDocFramework[];

  const visible =
    phaseFilter === 'all'
      ? inventory
      : phaseFilter === 'EDX'
      ? inventory.filter((l) => l.grandfathered)
      : inventory.filter((l) => l.phase === phaseFilter);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Diagnostics</div>
          <h1 className="page-title">LDT compliance — FDA 2024 rule</h1>
          <div className="page-sub">
            {inventory.length} laboratory-developed tests in portfolio ·
            4-phase compliance through May 2028. Phase deliverables,
            enforcement discretion eligibility, grandfathering documentation.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                'Run an enforcement-discretion eligibility decision for each LDT and surface the ones that qualify for grandfathering.',
              )
            }
            type="button"
          >
            {I.scale} Eligibility decision
          </button>
          <button
            className="btn primary small"
            onClick={() => onOpenEditor?.('doc-ldt-cv401-dn')}
            type="button"
          >
            {I.pencil} Open CV-IH401 De Novo
          </button>
        </div>
      </div>

      <SampleDataBanner show={live.phases === null} loading={live.loading} label="compliance phases" />

      <div className="metrics-row metrics-compact">
        {kpis.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone ?? ''}>
            <div className="metric-label">{k.label}</div>
            <div
              className="metric-val"
              style={{
                fontSize:
                  typeof k.metric === 'string' && k.metric.length > 7 ? 18 : 22,
              }}
            >
              {k.metric}
            </div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <section className="section">
        <div className="section-head">
          <h2>FDA 2024 LDT rule — phase tracker</h2>
          <span className="section-sub">
            May 2024 final rule · phased compliance through May 2028
          </span>
        </div>
        <div className="ldt-phases">
          {phases.map((p) => {
            const count = inventory.filter((l) => l.phase === p.id).length;
            return (
              <button
                key={p.id}
                className="ldt-phase"
                data-on={phaseFilter === p.id || undefined}
                data-current={p.id === 'P2' || undefined}
                onClick={() => setPhaseFilter(phaseFilter === p.id ? 'all' : p.id)}
                type="button"
              >
                <div className="ldt-phase-head">
                  <span className="ldt-phase-id mono">{p.id}</span>
                  <span className="ldt-phase-n mono">{count} LDTs</span>
                </div>
                <div className="ldt-phase-label">{p.label}</div>
                <div className="ldt-phase-dates mono small">
                  {p.start} → {p.end}
                </div>
                <div className="ldt-phase-deliv">{p.deliverables}</div>
              </button>
            );
          })}
          <button
            className="ldt-phase ldt-phase-edx"
            data-on={phaseFilter === 'EDX' || undefined}
            onClick={() => setPhaseFilter(phaseFilter === 'EDX' ? 'all' : 'EDX')}
            type="button"
          >
            <div className="ldt-phase-head">
              <span className="ldt-phase-id mono">EDX</span>
              <span className="ldt-phase-n mono">
                {inventory.filter((l) => l.grandfathered).length} LDTs
              </span>
            </div>
            <div className="ldt-phase-label">Enforcement discretion</div>
            <div className="ldt-phase-dates mono small">
              Pre-2024 · grandfathered
            </div>
            <div className="ldt-phase-deliv">
              Pre-existing, low-risk, no high-risk modifications
            </div>
          </button>
        </div>
      </section>

      <DocumentsPanel
        title="LDT compliance artifacts"
        subtitle="Phase 1–4 deliverables + enforcement-discretion memos"
        docs={documents}
        frameworks={frameworks}
        onOpenEditor={onOpenEditor}
        onAskAna={(text) => onAskAna(text)}
      />

      <section className="section">
        <div className="section-head">
          <h2>
            LDT inventory
            {phaseFilter !== 'all' ? ` · filtered to ${phaseFilter}` : ''}
          </h2>
          <span className="section-sub">
            {visible.length} of {inventory.length} shown · per-LDT compliance
            plan
          </span>
          {phaseFilter !== 'all' && (
            <button
              className="chip-filter"
              onClick={() => setPhaseFilter('all')}
              type="button"
            >
              Clear {I.close}
            </button>
          )}
        </div>
        <div className="ctable">
          <div
            className="ctable-head"
            style={{
              gridTemplateColumns: '100px 1.4fr 1fr 80px 70px 1fr 70px',
            }}
          >
            <div>ID</div>
            <div>Test</div>
            <div>Lab</div>
            <div>Risk</div>
            <div>Phase</div>
            <div>Plan</div>
            <div>MDRs</div>
          </div>
          {visible.map((l) => (
            <button
              key={l.id}
              className="ctable-row"
              style={{
                gridTemplateColumns: '100px 1.4fr 1fr 80px 70px 1fr 70px',
              }}
              onClick={() =>
                onAskAna(
                  `Open LDT ${l.id} (${l.name}). Show me the phase-specific deliverables remaining and any open MDRs.`,
                )
              }
              type="button"
            >
              <div className="mono small">{l.id}</div>
              <div className="ctable-strong">{l.name}</div>
              <div style={{ color: 'var(--text-300)' }}>{l.lab}</div>
              <div>
                <span className={`qms-sev qms-sev-${riskSev(l.risk)}`}>
                  {l.risk}
                </span>
              </div>
              <div>
                <span className={`status-pill ${phasePill(l.phase)}`}>
                  {l.phase}
                </span>
              </div>
              <div style={{ color: 'var(--text-300)', fontSize: 12 }}>
                {l.plan}
              </div>
              <div>
                {l.mdrCount > 0 ? (
                  <span className="pill-err small">{l.mdrCount}</span>
                ) : (
                  <span style={{ color: 'var(--success)' }}>—</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
