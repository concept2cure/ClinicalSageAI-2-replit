/**
 * SaMD workspace — Phase 7.
 *
 * IEC 62304 software lifecycle. Class C documentation depth. SRS → SDS →
 * V&V trace. OTS/SOUP inventory. Cybersecurity package. AI/ML PCCP.
 *
 * Ported 1:1 from design-system/ui_kits/mdx/surfaces/Samd.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import {
  SAMD_KPIS,
  SAMD_REQS,
  SAMD_OTS,
  SAMD_ANOMALIES,
  SAMD_PCCP,
} from '../data/samd';
import { useSamd } from '../hooks/useSamd';
import type { Program } from '../data/programs';

interface Props {
  program: Program | null;
  onAskAna: (msg: string) => void;
  onOpenEditor?: (docId: string) => void;
}

export function SamdSurface({ program, onAskAna, onOpenEditor }: Props) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);
  const programContext = program ? `${program.code} · ${program.title}` : 'BX-204 firmware 4.1';
  const { documents: liveDocuments, docFrameworks } = useSamd(program?.id ?? null);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workstream · {programContext}</div>
          <h1 className="page-title">SaMD lifecycle · IEC 62304</h1>
          <div className="page-sub">
            Class C software. {liveDocuments.length} regulatory artifacts · {SAMD_REQS.length} requirements traced ·{' '}
            {SAMD_OTS.length} OTS/SOUP components · {SAMD_ANOMALIES.filter(a => a.kind === 'must-fix').length} must-fix anomalies open.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Re-run V&V coverage analysis — surface every requirement still without a passing test.')}>
            {I.shieldCheck} Coverage analysis
          </button>
          <button className="btn primary small" onClick={() => onOpenEditor && onOpenEditor('doc-samd-vv')}>
            {I.pencil} Open V&V package
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {SAMD_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone ?? ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <DocumentsPanel
        title="SaMD regulatory artifacts"
        subtitle="SRS · SDS · V&V · cybersecurity · PCCP — IEC 62304 Class C documentation depth"
        docs={liveDocuments}
        frameworks={docFrameworks}
        onOpenEditor={onOpenEditor}
        onAskAna={onAskAna}
      />

      {/* PCCP — surface separately because AI/ML changes the regulatory model */}
      {SAMD_PCCP.enabled && (
        <section className="section samd-pccp">
          <div className="section-head">
            <h2>AI/ML PCCP · Predetermined Change Control Plan</h2>
            <span className="section-sub">Pre-authorized scope for adaptive algorithm updates without re-submission</span>
          </div>
          <div className="samd-pccp-card">
            <div className="samd-pccp-row"><span className="k">Model type</span><span className="v">{SAMD_PCCP.modelType}</span></div>
            <div className="samd-pccp-row"><span className="k">Scope</span><span className="v">{SAMD_PCCP.scope}</span></div>
            <div className="samd-pccp-row"><span className="k">Validation</span><span className="v">{SAMD_PCCP.validation}</span></div>
            <div className="samd-pccp-row"><span className="k">Change framework</span><span className="v">{SAMD_PCCP.changeFramework}</span></div>
            <div className="samd-pccp-row"><span className="k">Last deployment</span><span className="v mono small">{SAMD_PCCP.lastDeployed}</span></div>
            <div className="samd-pccp-row"><span className="k">Next FDA review</span><span className="v mono small">{SAMD_PCCP.nextReview}</span></div>
          </div>
        </section>
      )}

      <section className="section eng-awareness" data-open={awarenessOpen}>
        <button className="eng-awareness-head" onClick={() => setAwarenessOpen(o => !o)} aria-expanded={awarenessOpen}>
          <span className="eng-awareness-chev">{awarenessOpen ? I.down : I.right}</span>
          <h2>V&V trace · OTS inventory · anomalies</h2>
          <span className="section-sub">Requirements → tests · open-source components · unresolved findings</span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>Requirements → tests · IEC 62304 §5.6 trace</h2>
              </div>
              <div className="ctable">
                <div className="ctable-head" style={{ gridTemplateColumns: '100px 1.6fr 80px 1fr 90px 70px' }}>
                  <div>SR</div><div>Requirement</div><div>SDS</div><div>Tests</div><div>Coverage</div><div>Anom.</div>
                </div>
                {SAMD_REQS.map(r => (
                  <button key={r.id} className="ctable-row" style={{ gridTemplateColumns: '100px 1.6fr 80px 1fr 90px 70px' }}
                    onClick={() => onAskAna(`Open requirement ${r.id} — show the SDS link and walk me through every test that traces back to it.`)}>
                    <div className="mono small">{r.id}</div>
                    <div className="ctable-strong">{r.label}</div>
                    <div className="mono small" style={{ color: 'var(--text-300)' }}>{r.linkedSds}</div>
                    <div className="mono tiny" style={{ color: 'var(--text-300)' }}>{r.tests.join(', ') || '—'}</div>
                    <div><span className={`samd-cov samd-cov-${r.coverage}`}>{r.coverage}</span></div>
                    <div>{r.anomalies > 0 ? <span className="pill-err small">{r.anomalies}</span> : <span style={{ color: 'var(--success)' }}>—</span>}</div>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>OTS / SOUP inventory · open-source components</h2>
              </div>
              <div className="ctable">
                <div className="ctable-head" style={{ gridTemplateColumns: '90px 1.4fr 90px 110px 90px 70px 90px' }}>
                  <div>ID</div><div>Component</div><div>Version</div><div>License</div><div>State</div><div>CVEs</div><div>Reviewed</div>
                </div>
                {SAMD_OTS.map(o => (
                  <div key={o.id} className="ctable-row" style={{ gridTemplateColumns: '90px 1.4fr 90px 110px 90px 70px 90px' }}>
                    <div className="mono small">{o.id}</div>
                    <div className="ctable-strong">{o.name}</div>
                    <div className="mono small">{o.version}</div>
                    <div className="mono tiny" style={{ color: 'var(--text-300)' }}>{o.license}</div>
                    <div><span className={`status-pill ${o.state === 'qualified' ? 'complete' : 'review'}`}>{o.state}</span></div>
                    <div>{o.cves > 0 ? <span className="pill-err small">{o.cves}</span> : <span style={{ color: 'var(--success)' }}>—</span>}</div>
                    <div className="mono small">{o.lastReview}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>Anomalies · must-fix + deferred</h2>
              </div>
              <div className="ctable">
                <div className="ctable-head" style={{ gridTemplateColumns: '90px 90px 90px 1fr 80px 80px 80px' }}>
                  <div>ID</div><div>Kind</div><div>SR</div><div>Title</div><div>Found in</div><div>Age</div><div>Severity</div>
                </div>
                {SAMD_ANOMALIES.map(a => (
                  <div key={a.id} className="ctable-row" style={{ gridTemplateColumns: '90px 90px 90px 1fr 80px 80px 80px' }}>
                    <div className="mono small">{a.id}</div>
                    <div><span className={`samd-kind samd-kind-${a.kind}`}>{a.kind}</span></div>
                    <div className="mono small" style={{ color: 'var(--text-300)' }}>{a.sr}</div>
                    <div className="ctable-strong">{a.title}</div>
                    <div className="mono small" style={{ color: 'var(--text-400)' }}>{a.found}</div>
                    <div>{a.age}</div>
                    <div><span className={`qms-sev qms-sev-${a.severity === 'high' ? 'high' : a.severity === 'medium' ? 'medium' : 'low'}`}>{a.severity}</span></div>
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
