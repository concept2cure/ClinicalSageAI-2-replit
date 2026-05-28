/**
 * Quality system (QMS) — Phase 5 · doc-first hybrid.
 *
 * 21 CFR 820 → QMSR · ISO 13485 · ISO 14971 management. Documents up
 * top (mgmt reviews, SOPs, training records, audits, supplier
 * agreements), then dashboards for findings, training compliance,
 * supplier qualification.
 */

(() => {

const { I, DocumentsPanel } = window;
const { QMS_KPIS, QMS_DOC_FRAMEWORKS, QMS_DOCUMENTS, QMS_FINDINGS, QMS_TRAINING, QMS_SUPPLIERS } = window;

function QualitySurface({ onAskAna, onOpenEditor }) {
  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workstream</div>
          <h1 className="page-title">Quality system</h1>
          <div className="page-sub">
            21 CFR 820 → QMSR · ISO 13485 · ISO 14971 management. Doc control,
            training, internal + notified-body audits, supplier qualification, non-conforming product.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Run a QMS pre-inspection check — surface every open finding, every training gap, every supplier without a current agreement, and rank by inspection-risk.')}>
            {I.shieldAlert} Pre-inspection check
          </button>
          <button className="btn primary small" onClick={() => onOpenEditor && onOpenEditor('qms-mr-2026')}>
            {I.pencil} Open Q3 management review
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {QMS_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <DocumentsPanel
        title="QMS documents in flight"
        subtitle={`${QMS_DOCUMENTS.length} regulatory artifacts · ${QMS_DOCUMENTS.filter(d => d.blocker).length} blocked · ${QMS_DOCUMENTS.filter(d => d.esigState === 'pending').length} awaiting signature`}
        docs={QMS_DOCUMENTS}
        frameworks={QMS_DOC_FRAMEWORKS}
        onOpenEditor={onOpenEditor}
        onAskAna={onAskAna}
      />

      <div className="qms-grid">
        {/* Findings */}
        <section className="section">
          <div className="section-head">
            <h2>Open findings</h2>
            <span className="section-sub">{QMS_FINDINGS.filter(f => f.state !== 'closed').length} open · {QMS_FINDINGS.filter(f => f.source === 'nb').length} notified-body</span>
          </div>
          <div className="ctable">
            <div className="ctable-head" style={{ gridTemplateColumns: '100px 60px 80px 1fr 100px 70px 100px' }}>
              <div>ID</div><div>Sev</div><div>Source</div><div>Clause</div><div>State</div><div>Age</div><div>Linked</div>
            </div>
            {QMS_FINDINGS.map(f => (
              <button key={f.id} className="ctable-row" style={{ gridTemplateColumns: '100px 60px 80px 1fr 100px 70px 100px' }}
                onClick={() => onAskAna(`Open finding ${f.id}: ${f.clause}. Walk me through the investigation, CAPA linkage, and verification status.`)}>
                <div className="mono small">{f.id}</div>
                <div><span className={`qms-sev qms-sev-${f.severity}`}>{f.severity}</span></div>
                <div className="mono tiny" style={{ color: 'var(--text-400)' }}>{f.source}</div>
                <div className="ctable-strong">{f.clause}</div>
                <div><span className={`status-pill ${f.state === 'closed' ? 'complete' : f.state === 'capa-open' ? 'active' : 'review'}`}>{f.state}</span></div>
                <div>{f.age}</div>
                <div className="mono tiny" style={{ color: f.linked === '—' ? 'var(--text-400)' : 'var(--text-200)' }}>{f.linked}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Training compliance */}
        <section className="section">
          <div className="section-head">
            <h2>Training compliance</h2>
            <span className="section-sub">Per controlled procedure · 90-day refresh cadence</span>
          </div>
          <div className="qms-train">
            {QMS_TRAINING.map(t => {
              const pct = Math.round(t.current / t.of * 100);
              return (
                <div key={t.sop} className="qms-train-row" data-low={pct < 90}>
                  <span className="qms-train-sop mono small">{t.sop}</span>
                  <div className="qms-train-bar">
                    <div className="qms-train-fill" style={{ width: `${pct}%` }} data-tone={pct < 80 ? 'err' : pct < 95 ? 'warn' : 'ok'} />
                  </div>
                  <span className="qms-train-pct mono small">{t.current}/{t.of}</span>
                  <span className="qms-train-when">{t.lastCycle}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Supplier qualification */}
        <section className="section">
          <div className="section-head">
            <h2>Supplier qualification</h2>
            <span className="section-sub">{QMS_SUPPLIERS.filter(s => s.state === 'approved').length} approved · {QMS_SUPPLIERS.filter(s => s.state === 'conditional').length} conditional</span>
          </div>
          <div className="qms-suppliers">
            {QMS_SUPPLIERS.map(s => (
              <button key={s.id} className="qms-supplier" data-state={s.state}
                onClick={() => onAskAna(`Open supplier ${s.name}. Show me current agreement, last audit findings, and risk classification rationale.`)}>
                <div className="qms-sup-head">
                  <span className={`qms-sev qms-sev-${s.risk === 'high' ? 'high' : s.risk === 'med' ? 'medium' : 'low'}`}>{s.risk}</span>
                  <span className="ctable-strong">{s.name}</span>
                </div>
                <div className="qms-sup-meta">
                  <span className={`status-pill ${s.state === 'approved' ? 'active' : s.state === 'conditional' ? 'review' : 'idle'}`}>{s.state}</span>
                  <span className="dot-sep">·</span>
                  <span>Last qual {s.last}</span>
                  {s.findings > 0 && <><span className="dot-sep">·</span><span className="pill-err small">{s.findings} open finding</span></>}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

window.QualitySurface = QualitySurface;

})();
