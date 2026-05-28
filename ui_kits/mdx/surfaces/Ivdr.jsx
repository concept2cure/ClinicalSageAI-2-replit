/**
 * EU IVDR surface — Phase 6 · doc-first.
 *
 * Distinct from EU MDR. Performance Evaluation Report (PER) replaces CER.
 * Annex VIII risk classification. Notified body engagement for Class B+.
 * EUDAMED IVD module (separate from EUDAMED device module).
 */

(() => {

const { I, DocumentsPanel } = window;
const { IVDR_CLASSES, IVDR_KPIS, IVDR_RULES, IVDR_NB_TIMELINE, IVDR_DOCUMENTS, IVDR_DOC_FRAMEWORKS } = window;

function IvdrSurface({ program, onAskAna, onOpenEditor }) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);
  const programContext = program ? `${program.code} · ${program.title}` : 'IV-415 companion diagnostic';

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Diagnostics · {programContext}</div>
          <h1 className="page-title">EU IVDR</h1>
          <div className="page-sub">
            EU Regulation 2017/746 — distinct from EU MDR. {IVDR_DOCUMENTS.length} regulatory artifacts:
            Performance Evaluation Report · Annex VIII classification · notified-body engagement · EUDAMED IVD module.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Surface the gap between our PER and the EU IVDR Annex II/III technical-doc requirements. Tell me what to draft next.')}>
            {I.scale} PER gap analysis
          </button>
          <button className="btn primary small" onClick={() => onOpenEditor && onOpenEditor('doc-ivdr-per')}>
            {I.pencil} Open Performance Evaluation Report
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {IVDR_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val" style={{ fontSize: typeof k.metric === 'string' && k.metric.length > 6 ? 18 : 22 }}>{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <DocumentsPanel
        title="IVDR regulatory artifacts"
        subtitle="PER · Annex VIII · notified body · EUDAMED IVD · CDx alignment"
        docs={IVDR_DOCUMENTS}
        frameworks={IVDR_DOC_FRAMEWORKS}
        onOpenEditor={onOpenEditor}
        onAskAna={onAskAna}
      />

      {/* Awareness — classification trace + NB timeline */}
      <section className="section eng-awareness" data-open={awarenessOpen}>
        <button className="eng-awareness-head" onClick={() => setAwarenessOpen(o => !o)} aria-expanded={awarenessOpen}>
          <span className="eng-awareness-chev">{awarenessOpen ? I.down : I.right}</span>
          <h2>Classification + notified body</h2>
          <span className="section-sub">Annex VIII rule trace · BSI engagement timeline</span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>Annex VIII rule classification trace</h2>
                <span className="section-sub">Rule 3 (cancer screening / companion diagnostic) → Class C</span>
              </div>
              <div className="ctable">
                <div className="ctable-head" style={{ gridTemplateColumns: '90px 1fr 80px 100px' }}>
                  <div>Rule</div><div>Applies to</div><div>Verdict</div><div>Would be</div>
                </div>
                {IVDR_RULES.map(r => (
                  <div key={r.rule} className="ctable-row" style={{ gridTemplateColumns: '90px 1fr 80px 100px', background: r.selected ? 'var(--accent-000)' : undefined }}>
                    <div className="ctable-strong">{r.rule}</div>
                    <div style={{ color: 'var(--text-300)', fontSize: 12 }}>{r.appliesTo}</div>
                    <div>{r.verdict === 'yes' ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>yes</span> : <span style={{ color: 'var(--text-400)' }}>no</span>}</div>
                    <div className="mono small">Class {r.classWouldBe}</div>
                  </div>
                ))}
              </div>
              <div className="ivdr-classes">
                {IVDR_CLASSES.map(c => (
                  <div key={c.id} className="ivdr-class" data-selected={c.id === 'C'}>
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
                {IVDR_NB_TIMELINE.map((m, i) => (
                  <div key={i} className="ivdr-ms" data-state={m.state}>
                    <span className="ivdr-ms-dot" />
                    <div className="ivdr-ms-body">
                      <div className="ivdr-ms-label">{m.ms}</div>
                      <div className="ivdr-ms-date mono small">{m.date}</div>
                    </div>
                    <span className={`status-pill ${m.state === 'complete' ? 'complete' : m.state === 'in-progress' ? 'active' : m.state === 'scheduled' ? 'review' : 'idle'}`}>{m.state}</span>
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

window.IvdrSurface = IvdrSurface;

})();
