/**
 * Clinical study management — Phase 7.
 *
 * Pivotal trial workspace. Protocol editor with IRB amendments, site list,
 * subject screening funnel, deviation tracking, AE capture, endpoint
 * adjudication queue, SAP version control, BIMO readiness.
 *
 * Ported 1:1 from design-system/ui_kits/mdx/surfaces/Clinical.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import {
  CLIN_KPIS,
  CLIN_FUNNEL,
  CLIN_SITES,
  CLIN_DEVIATIONS,
  CLIN_ADJUDICATION,
  CLIN_DOCUMENTS,
  CLIN_DOC_FRAMEWORKS,
} from '../data/clinical';
import type { Program } from '../data/programs';

interface Props {
  program: Program | null;
  onAskAna: (msg: string) => void;
  onOpenEditor?: (docId: string) => void;
}

export function ClinicalSurface({ program, onAskAna, onOpenEditor }: Props) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);
  const programContext = program ? `${program.code} pivotal trial · ${program.title}` : 'CV-330 pivotal trial';

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workstream · {programContext}</div>
          <h1 className="page-title">Clinical study management</h1>
          <div className="page-sub">
            CL-330-PIV-001 · {CLIN_SITES.length} active sites · 680-subject target.
            Protocol · SAP · DSMB · deviations · adverse-event adjudication · BIMO readiness.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Run a BIMO inspection-readiness check. Surface every gap across protocol, consent, sample handling, and source-data verification.')}>
            {I.clipboardList} BIMO check
          </button>
          <button className="btn primary small" onClick={() => onOpenEditor && onOpenEditor('doc-clin-dsmb')}>
            {I.pencil} Open DSMB charter
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {CLIN_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone ?? ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      {/* Enrollment funnel — the headline number every reader cares about */}
      <section className="section">
        <div className="section-head">
          <h2>Enrollment funnel</h2>
          <span className="section-sub">Screened → consented → enrolled → completed</span>
        </div>
        <div className="clin-funnel">
          {CLIN_FUNNEL.map((s) => {
            const max = CLIN_FUNNEL[0].count;
            const pct = Math.round(s.count / max * 100);
            return (
              <div key={s.stage} className="clin-funnel-row">
                <div className="clin-funnel-label">{s.stage}</div>
                <div className="clin-funnel-bar">
                  <div className="clin-funnel-fill" style={{ width: `${pct}%` }}>
                    <span className="clin-funnel-n mono small">{s.count}</span>
                  </div>
                </div>
                {s.rate && <div className="clin-funnel-rate" style={{ color: 'var(--warning)' }}>{s.rate} withdrawal</div>}
              </div>
            );
          })}
        </div>
      </section>

      <DocumentsPanel
        title="Clinical study artifacts"
        subtitle="Protocol · amendments · SAP · DSMB · BIMO readiness"
        docs={CLIN_DOCUMENTS}
        frameworks={CLIN_DOC_FRAMEWORKS}
        onOpenEditor={onOpenEditor}
        onAskAna={onAskAna}
      />

      {/* Sites + deviations + adjudication */}
      <section className="section eng-awareness" data-open={awarenessOpen}>
        <button className="eng-awareness-head" onClick={() => setAwarenessOpen(o => !o)} aria-expanded={awarenessOpen}>
          <span className="eng-awareness-chev">{awarenessOpen ? I.down : I.right}</span>
          <h2>Sites · deviations · adjudication queue</h2>
          <span className="section-sub">Per-site enrollment · open deviations · pending AE adjudication</span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>Sites · {CLIN_SITES.length} active</h2>
              </div>
              <div className="ctable">
                <div className="ctable-head" style={{ gridTemplateColumns: '80px 1.4fr 60px 1fr 100px 80px 90px' }}>
                  <div>ID</div><div>Site</div><div>Country</div><div>PI</div><div>Activated</div><div>Enrolled</div><div>Last dev.</div>
                </div>
                {CLIN_SITES.map(s => (
                  <button key={s.id} className="ctable-row" style={{ gridTemplateColumns: '80px 1.4fr 60px 1fr 100px 80px 90px' }}
                    onClick={() => onAskAna(`Open site ${s.id} — ${s.name}. Show enrollment trajectory and every open deviation.`)}>
                    <div className="mono small">{s.id}</div>
                    <div className="ctable-strong">{s.name}</div>
                    <div className="mono small">{s.country}</div>
                    <div style={{ color: 'var(--text-300)', fontSize: 12 }}>{s.pi}</div>
                    <div className="mono small">{s.activated}</div>
                    <div className="mono small">{s.enrolled}</div>
                    <div style={{ color: s.lastDeviation === 'none' ? 'var(--success)' : 'var(--text-400)', fontSize: 11 }}>{s.lastDeviation}</div>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>Open deviations</h2>
                <span className="section-sub">{CLIN_DEVIATIONS.filter(d => d.state !== 'closed').length} open · {CLIN_DEVIATIONS.filter(d => d.severity === 'major').length} major</span>
              </div>
              <div className="ctable">
                <div className="ctable-head" style={{ gridTemplateColumns: '90px 90px 80px 80px 1fr 100px' }}>
                  <div>ID</div><div>Subject</div><div>Sev</div><div>Kind</div><div>Summary</div><div>State</div>
                </div>
                {CLIN_DEVIATIONS.map(d => (
                  <div key={d.id} className="ctable-row" style={{ gridTemplateColumns: '90px 90px 80px 80px 1fr 100px' }}>
                    <div className="mono small">{d.id}</div>
                    <div className="mono small" style={{ color: 'var(--text-300)' }}>{d.subject}</div>
                    <div><span className={`qms-sev qms-sev-${d.severity === 'major' ? 'high' : 'low'}`}>{d.severity}</span></div>
                    <div style={{ color: 'var(--text-400)', fontSize: 11 }}>{d.kind}</div>
                    <div style={{ color: 'var(--text-200)', fontSize: 12 }}>{d.summary}</div>
                    <div><span className={`status-pill ${d.state === 'closed' ? 'complete' : d.state === 'cro-review' ? 'review' : 'active'}`}>{d.state}</span></div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>Endpoint adjudication queue</h2>
                <span className="section-sub">{CLIN_ADJUDICATION.filter(a => a.state === 'pending').length} pending · {CLIN_ADJUDICATION.filter(a => a.seriousness === 'sae').length} SAE</span>
              </div>
              <div className="ctable">
                <div className="ctable-head" style={{ gridTemplateColumns: '90px 100px 1.4fr 70px 90px 100px' }}>
                  <div>AE</div><div>Subject</div><div>Event</div><div>Type</div><div>Device-rel.</div><div>State</div>
                </div>
                {CLIN_ADJUDICATION.map(a => (
                  <button key={a.id} className="ctable-row" style={{ gridTemplateColumns: '90px 100px 1.4fr 70px 90px 100px' }}
                    onClick={() => onAskAna(`Open adjudication ${a.id} — ${a.event}. Walk me through the data the panel needs to classify causality.`)}>
                    <div className="mono small">{a.id}</div>
                    <div className="mono small" style={{ color: 'var(--text-300)' }}>{a.subject}</div>
                    <div className="ctable-strong">{a.event}</div>
                    <div><span className={`qms-sev qms-sev-${a.seriousness === 'sae' ? 'high' : 'low'}`}>{a.seriousness}</span></div>
                    <div style={{ color: a.deviceRelated === 'likely' ? 'var(--warning)' : a.deviceRelated === 'no' ? 'var(--success)' : 'var(--text-400)' }}>{a.deviceRelated}</div>
                    <div><span className={`status-pill ${a.state === 'adjudicated' ? 'complete' : 'review'}`}>{a.state}</span></div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>
    </>
  );
}
