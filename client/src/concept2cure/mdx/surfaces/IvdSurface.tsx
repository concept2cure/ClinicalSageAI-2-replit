/**
 * IvdSurface — Phase 6 doc-first.
 *
 * IVD pathway surface. Analytical performance package, clinical
 * performance package, calibrator hierarchy, CLIA waiver application —
 * all are regulatory artifacts that must reach FDA.
 *
 * Diagnostics surfaces are document-heavy by nature. Doc-first.
 * Port basis: design-system/ui_kits/mdx/surfaces/Ivd.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import {
  IVD_ANALYTICAL,
  IVD_CLINICAL,
  IVD_DOC_FRAMEWORKS,
  IVD_DOCUMENTS,
  IVD_KPIS,
  IVD_REFMATS,
} from '../data/ivd';
import { useIvd } from '../hooks/useIvd';
import type { Program } from '../data/programs';
import type {
  KitDocFramework,
  KitDocument,
} from '../components/DocumentsPanel';

export interface IvdSurfaceProps {
  program: Program | null;
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  onOpenEditor?: (docId: string) => void;
}

export function IvdSurface({
  program,
  onAskAna,
  onOpenEditor,
}: IvdSurfaceProps) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);
  const programContext = program
    ? `${program.code} · ${program.title}`
    : 'DX-102 IVD cartridge';

  const live = useIvd(program?.id ?? null);
  const analytical = live.analytical ?? IVD_ANALYTICAL;
  const clinical = live.clinical ?? IVD_CLINICAL;
  const refmats = live.refmats ?? IVD_REFMATS;
  const kpis = live.kpis ?? IVD_KPIS;
  const documents = IVD_DOCUMENTS as unknown as KitDocument[];
  const frameworks = IVD_DOC_FRAMEWORKS as unknown as KitDocFramework[];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Diagnostics · {programContext}</div>
          <h1 className="page-title">IVD pathway</h1>
          <div className="page-sub">
            Analytical performance (CLSI EP guidelines) · clinical performance ·
            ISO 17511 traceability · CLIA categorization. {documents.length}{' '}
            regulatory artifacts in flight.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                'Generate the analytical performance summary — pull from EP05/EP06/EP09/EP17 reports and reconcile against the CLSI targets.',
              )
            }
            type="button"
          >
            {I.barChart3} Analytical summary
          </button>
          <button
            className="btn primary small"
            onClick={() => onOpenEditor?.('doc-ivd-method-comp')}
            type="button"
          >
            {I.pencil} Open method-comparison report
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
        title="IVD regulatory artifacts"
        subtitle="Analytical · clinical · traceability · CLIA. Tap to open in editor · sparkle to draft with AnA"
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
          <h2>Study status</h2>
          <span className="section-sub">
            Analytical (CLSI EP) · clinical (sens/spec/PPV/ROC) ·
            reference-material hierarchy
          </span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>
                  Analytical performance · CLSI EP guidelines
                </h2>
              </div>
              <div className="ctable">
                <div
                  className="ctable-head"
                  style={{
                    gridTemplateColumns:
                      '80px 1fr 90px 100px 60px 1.4fr 1fr 60px',
                  }}
                >
                  <div>ID</div>
                  <div>Study</div>
                  <div>CLSI</div>
                  <div>State</div>
                  <div>n</div>
                  <div>Target</div>
                  <div>Result</div>
                  <div>Pass</div>
                </div>
                {analytical.map((a) => (
                  <button
                    key={a.id}
                    className="ctable-row"
                    style={{
                      gridTemplateColumns:
                        '80px 1fr 90px 100px 60px 1.4fr 1fr 60px',
                    }}
                    onClick={() =>
                      onAskAna(
                        `Open analytical study ${a.id} (${a.study}). Show me the protocol, raw data summary, and any deviations.`,
                      )
                    }
                    type="button"
                  >
                    <div className="mono small">{a.id}</div>
                    <div className="ctable-strong">{a.study}</div>
                    <div
                      className="mono tiny"
                      style={{ color: 'var(--text-300)' }}
                    >
                      {a.clsi}
                    </div>
                    <div>
                      <span
                        className={`status-pill ${
                          a.state === 'complete'
                            ? 'complete'
                            : a.state === 'review'
                            ? 'review'
                            : 'draft'
                        }`}
                      >
                        {a.state}
                      </span>
                    </div>
                    <div className="mono small">{a.n}</div>
                    <div
                      style={{ color: 'var(--text-300)', fontSize: 12 }}
                    >
                      {a.target}
                    </div>
                    <div className="mono small">{a.result}</div>
                    <div>
                      {a.pass === true ? (
                        <span style={{ color: 'var(--success)' }}>{I.check}</span>
                      ) : a.pass === false ? (
                        <span style={{ color: 'var(--error)' }}>{I.x}</span>
                      ) : (
                        <span style={{ color: 'var(--text-400)' }}>…</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>Clinical performance</h2>
              </div>
              <div className="ctable">
                <div
                  className="ctable-head"
                  style={{
                    gridTemplateColumns: '80px 1fr 60px 1fr 1fr 100px 60px',
                  }}
                >
                  <div>ID</div>
                  <div>Study</div>
                  <div>n</div>
                  <div>Target</div>
                  <div>Result</div>
                  <div>State</div>
                  <div>Pass</div>
                </div>
                {clinical.map((c) => (
                  <div
                    key={c.id}
                    className="ctable-row"
                    style={{
                      gridTemplateColumns:
                        '80px 1fr 60px 1fr 1fr 100px 60px',
                    }}
                  >
                    <div className="mono small">{c.id}</div>
                    <div className="ctable-strong">{c.study}</div>
                    <div className="mono small">{c.n}</div>
                    <div
                      style={{ color: 'var(--text-300)', fontSize: 12 }}
                    >
                      {c.target}
                    </div>
                    <div className="mono small">{c.result}</div>
                    <div>
                      <span
                        className={`status-pill ${
                          c.state === 'complete' ? 'complete' : 'review'
                        }`}
                      >
                        {c.state}
                      </span>
                    </div>
                    <div>
                      {c.pass === true ? (
                        <span style={{ color: 'var(--success)' }}>{I.check}</span>
                      ) : (
                        <span style={{ color: 'var(--text-400)' }}>…</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>
                  Reference materials · ISO 17511 traceability
                </h2>
              </div>
              <div className="ctable">
                <div
                  className="ctable-head"
                  style={{
                    gridTemplateColumns: '110px 90px 1fr 1fr 100px 90px',
                  }}
                >
                  <div>ID</div>
                  <div>Analyte</div>
                  <div>Level</div>
                  <div>Source</div>
                  <div>State</div>
                  <div>Expiry</div>
                </div>
                {refmats.map((r) => (
                  <div
                    key={r.id}
                    className="ctable-row"
                    style={{
                      gridTemplateColumns: '110px 90px 1fr 1fr 100px 90px',
                    }}
                  >
                    <div className="mono small">{r.id}</div>
                    <div className="ctable-strong">{r.analyte}</div>
                    <div>{r.level}</div>
                    <div style={{ color: 'var(--text-300)', fontSize: 12 }}>
                      {r.source}
                    </div>
                    <div>
                      <span
                        className={`status-pill ${
                          r.state === 'qualified' ? 'complete' : 'review'
                        }`}
                      >
                        {r.state}
                      </span>
                    </div>
                    <div className="mono small">{r.expiry}</div>
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
