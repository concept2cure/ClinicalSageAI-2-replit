/**
 * IvdrSurface — Phase 6 doc-first.
 *
 * EU IVDR (Regulation 2017/746) — distinct from EU MDR. Performance
 * Evaluation Report (PER) replaces CER. Annex VIII risk classification.
 * Notified body engagement for Class B+. EUDAMED IVD module.
 *
 * Port basis: design-system/ui_kits/mdx/surfaces/Ivdr.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import {
  IVDR_CLASSES,
  IVDR_DOC_FRAMEWORKS,
  IVDR_DOCUMENTS,
  IVDR_KPIS,
  IVDR_NB_TIMELINE,
  IVDR_RULES,
} from '../data/ivdr';
import { useIvdr } from '../hooks/useIvdr';
import { SampleDataBanner } from '../components/SampleDataBanner';
import type { Program } from '../data/programs';
import type {
  KitDocFramework,
  KitDocument,
} from '../components/DocumentsPanel';

export interface IvdrSurfaceProps {
  program: Program | null;
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  onOpenEditor?: (docId: string) => void;
}

function timelineStatePill(state: string): 'complete' | 'active' | 'review' | 'idle' {
  if (state === 'complete') return 'complete';
  if (state === 'in-progress') return 'active';
  if (state === 'scheduled') return 'review';
  return 'idle';
}

export function IvdrSurface({
  program,
  onAskAna,
  onOpenEditor,
}: IvdrSurfaceProps) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);
  const programContext = program
    ? `${program.code} · ${program.title}`
    : 'IV-415 companion diagnostic';

  const live = useIvdr(program?.id ?? null);
  const rules = live.rules ?? IVDR_RULES;
  const classes = live.classes ?? IVDR_CLASSES;
  const timeline = live.nbTimeline ?? IVDR_NB_TIMELINE;
  const kpis = live.kpis ?? IVDR_KPIS;
  const documents = IVDR_DOCUMENTS as unknown as KitDocument[];
  const frameworks = IVDR_DOC_FRAMEWORKS as unknown as KitDocFramework[];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Diagnostics · {programContext}</div>
          <h1 className="page-title">EU IVDR</h1>
          <div className="page-sub">
            EU Regulation 2017/746 — distinct from EU MDR. {documents.length}{' '}
            regulatory artifacts: Performance Evaluation Report · Annex VIII
            classification · notified-body engagement · EUDAMED IVD module.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                'Surface the gap between our PER and the EU IVDR Annex II/III technical-doc requirements. Tell me what to draft next.',
              )
            }
            type="button"
          >
            {I.scale} PER gap analysis
          </button>
          <button
            className="btn primary small"
            onClick={() => onOpenEditor?.('doc-ivdr-per')}
            type="button"
          >
            {I.pencil} Open Performance Evaluation Report
          </button>
        </div>
      </div>

      <SampleDataBanner show={live.rules === null} loading={live.loading} label="classification rules" />

      <div className="metrics-row metrics-compact">
        {kpis.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone ?? ''}>
            <div className="metric-label">{k.label}</div>
            <div
              className="metric-val"
              style={{
                fontSize:
                  typeof k.metric === 'string' && k.metric.length > 6 ? 18 : 22,
              }}
            >
              {k.metric}
              {k.unit && <span className="unit">{k.unit}</span>}
            </div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <DocumentsPanel
        title="IVDR regulatory artifacts"
        subtitle="PER · Annex VIII · notified body · EUDAMED IVD · CDx alignment"
        docs={documents}
        frameworks={frameworks}
        onOpenEditor={onOpenEditor}
        onAskAna={(text) => onAskAna(text)}
      />

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
          <h2>Classification + notified body</h2>
          <span className="section-sub">
            Annex VIII rule trace · BSI engagement timeline
          </span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>
                  Annex VIII rule classification trace
                </h2>
                <span className="section-sub">
                  Rule 3 (cancer screening / companion diagnostic) → Class C
                </span>
              </div>
              <div className="ctable">
                <div
                  className="ctable-head"
                  style={{ gridTemplateColumns: '90px 1fr 80px 100px' }}
                >
                  <div>Rule</div>
                  <div>Applies to</div>
                  <div>Verdict</div>
                  <div>Would be</div>
                </div>
                {rules.map((r) => (
                  <div
                    key={r.rule}
                    className="ctable-row"
                    style={{
                      gridTemplateColumns: '90px 1fr 80px 100px',
                      background: r.selected ? 'var(--accent-000)' : undefined,
                    }}
                  >
                    <div className="ctable-strong">{r.rule}</div>
                    <div style={{ color: 'var(--text-300)', fontSize: 12 }}>
                      {r.appliesTo}
                    </div>
                    <div>
                      {r.verdict === 'yes' ? (
                        <span
                          style={{ color: 'var(--success)', fontWeight: 600 }}
                        >
                          yes
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-400)' }}>no</span>
                      )}
                    </div>
                    <div className="mono small">Class {r.classWouldBe}</div>
                  </div>
                ))}
              </div>
              <div className="ivdr-classes">
                {classes.map((c) => (
                  <div
                    key={c.id}
                    className="ivdr-class"
                    data-selected={c.id === 'C' || undefined}
                  >
                    <div className="ivdr-class-id">Class {c.id}</div>
                    <div className="ivdr-class-desc">{c.desc}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>Notified body — BSI engagement</h2>
              </div>
              <div className="ivdr-timeline">
                {timeline.map((m, i) => (
                  <div key={i} className="ivdr-ms" data-state={m.state}>
                    <span className="ivdr-ms-dot" />
                    <div className="ivdr-ms-body">
                      <div className="ivdr-ms-label">{m.ms}</div>
                      <div className="ivdr-ms-date mono small">{m.date}</div>
                    </div>
                    <span
                      className={`status-pill ${timelineStatePill(m.state)}`}
                    >
                      {m.state}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>
    </>
  );
}
