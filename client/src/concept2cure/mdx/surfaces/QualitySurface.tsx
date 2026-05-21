/**
 * QualitySurface — Phase 5 doc-first hybrid (QSR/QMSR + ISO 13485).
 *
 * 21 CFR 820 → QMSR · ISO 13485 · ISO 14971 management. Documents up
 * top (management reviews, SOPs, training records, audits, supplier
 * agreements), then dashboards for findings, training compliance, and
 * supplier qualification.
 *
 * Cross-program workstream surface. Port basis:
 * design-system/ui_kits/mdx/surfaces/Quality.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import {
  QMS_DOC_FRAMEWORKS,
  QMS_DOCUMENTS,
  QMS_FINDINGS,
  QMS_KPIS,
  QMS_SUPPLIERS,
  QMS_TRAINING,
} from '../data/quality';
import { useQuality } from '../hooks/useQuality';
import type {
  KitDocFramework,
  KitDocument,
} from '../components/DocumentsPanel';

export interface QualitySurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  onOpenEditor?: (docId: string) => void;
}

function findingStatePill(state: string): 'complete' | 'active' | 'review' {
  if (state === 'closed') return 'complete';
  if (state === 'capa-open') return 'active';
  return 'review';
}

function supplierStatePill(state: string): 'active' | 'review' | 'idle' {
  if (state === 'approved') return 'active';
  if (state === 'conditional') return 'review';
  return 'idle';
}

function supplierSevClass(risk: string): 'high' | 'medium' | 'low' {
  if (risk === 'high') return 'high';
  if (risk === 'med') return 'medium';
  return 'low';
}

export function QualitySurface({
  onAskAna,
  onOpenEditor,
}: QualitySurfaceProps) {
  const live = useQuality();
  const findings = live.findings ?? QMS_FINDINGS;
  const training = live.training ?? QMS_TRAINING;
  const suppliers = live.suppliers ?? QMS_SUPPLIERS;
  const kpis = live.kpis ?? QMS_KPIS;
  const documents = QMS_DOCUMENTS as unknown as KitDocument[];
  const frameworks = QMS_DOC_FRAMEWORKS as unknown as KitDocFramework[];

  const blockedDocs = documents.filter((d) => d.blocker).length;
  const pendingSig = documents.filter((d) => d.esigState === 'pending').length;
  const openFindings = findings.filter((f) => f.state !== 'closed').length;
  const nbFindings = findings.filter((f) => f.source === 'nb').length;
  const approvedSuppliers = suppliers.filter((s) => s.state === 'approved').length;
  const conditionalSuppliers = suppliers.filter(
    (s) => s.state === 'conditional',
  ).length;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workstream</div>
          <h1 className="page-title">Quality system</h1>
          <div className="page-sub">
            21 CFR 820 → QMSR · ISO 13485 · ISO 14971 management. Doc
            control, training, internal + notified-body audits, supplier
            qualification, non-conforming product.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                'Run a QMS pre-inspection check — surface every open finding, every training gap, every supplier without a current agreement, and rank by inspection-risk.',
              )
            }
            type="button"
          >
            {I.shieldAlert} Pre-inspection check
          </button>
          <button
            className="btn primary small"
            onClick={() => onOpenEditor?.('qms-mr-2026')}
            type="button"
          >
            {I.pencil} Open Q3 management review
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {kpis.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone ?? ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">
              {k.metric}
              {k.unit && <span className="unit">{k.unit}</span>}
            </div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <DocumentsPanel
        title="QMS documents in flight"
        subtitle={`${documents.length} regulatory artifacts · ${blockedDocs} blocked · ${pendingSig} awaiting signature`}
        docs={documents}
        frameworks={frameworks}
        onOpenEditor={onOpenEditor}
        onAskAna={(text) => onAskAna(text)}
      />

      <div className="qms-grid">
        <section className="section">
          <div className="section-head">
            <h2>Open findings</h2>
            <span className="section-sub">
              {openFindings} open · {nbFindings} notified-body
            </span>
          </div>
          <div className="ctable">
            <div
              className="ctable-head"
              style={{
                gridTemplateColumns: '100px 60px 80px 1fr 100px 70px 100px',
              }}
            >
              <div>ID</div>
              <div>Sev</div>
              <div>Source</div>
              <div>Clause</div>
              <div>State</div>
              <div>Age</div>
              <div>Linked</div>
            </div>
            {findings.map((f) => (
              <button
                key={f.id}
                className="ctable-row"
                style={{
                  gridTemplateColumns: '100px 60px 80px 1fr 100px 70px 100px',
                }}
                onClick={() =>
                  onAskAna(
                    `Open finding ${f.id}: ${f.clause}. Walk me through the investigation, CAPA linkage, and verification status.`,
                  )
                }
                type="button"
              >
                <div className="mono small">{f.id}</div>
                <div>
                  <span className={`qms-sev qms-sev-${f.severity}`}>
                    {f.severity}
                  </span>
                </div>
                <div
                  className="mono tiny"
                  style={{ color: 'var(--text-400)' }}
                >
                  {f.source}
                </div>
                <div className="ctable-strong">{f.clause}</div>
                <div>
                  <span className={`status-pill ${findingStatePill(f.state)}`}>
                    {f.state}
                  </span>
                </div>
                <div>{f.age}</div>
                <div
                  className="mono tiny"
                  style={{
                    color:
                      f.linked === '—'
                        ? 'var(--text-400)'
                        : 'var(--text-200)',
                  }}
                >
                  {f.linked}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Training compliance</h2>
            <span className="section-sub">
              Per controlled procedure · 90-day refresh cadence
            </span>
          </div>
          <div className="qms-train">
            {training.map((t) => {
              const pct = t.of > 0 ? Math.round((t.current / t.of) * 100) : 0;
              const tone = pct < 80 ? 'err' : pct < 95 ? 'warn' : 'ok';
              return (
                <div
                  key={t.sop}
                  className="qms-train-row"
                  data-low={pct < 90 || undefined}
                >
                  <span className="qms-train-sop mono small">{t.sop}</span>
                  <div className="qms-train-bar">
                    <div
                      className="qms-train-fill"
                      style={{ width: `${pct}%` }}
                      data-tone={tone}
                    />
                  </div>
                  <span className="qms-train-pct mono small">
                    {t.current}/{t.of}
                  </span>
                  <span className="qms-train-when">{t.lastCycle}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Supplier qualification</h2>
            <span className="section-sub">
              {approvedSuppliers} approved · {conditionalSuppliers} conditional
            </span>
          </div>
          <div className="qms-suppliers">
            {suppliers.map((s) => (
              <button
                key={s.id}
                className="qms-supplier"
                data-state={s.state}
                onClick={() =>
                  onAskAna(
                    `Open supplier ${s.name}. Show me current agreement, last audit findings, and risk classification rationale.`,
                  )
                }
                type="button"
              >
                <div className="qms-sup-head">
                  <span className={`qms-sev qms-sev-${supplierSevClass(s.risk)}`}>
                    {s.risk}
                  </span>
                  <span className="ctable-strong">{s.name}</span>
                </div>
                <div className="qms-sup-meta">
                  <span className={`status-pill ${supplierStatePill(s.state)}`}>
                    {s.state}
                  </span>
                  <span className="dot-sep">·</span>
                  <span>Last qual {s.last}</span>
                  {s.findings > 0 && (
                    <>
                      <span className="dot-sep">·</span>
                      <span className="pill-err small">
                        {s.findings} open finding
                      </span>
                    </>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
