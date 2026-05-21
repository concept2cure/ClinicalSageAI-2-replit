/**
 * LDT compliance surface — Phase 6 · doc-first.
 *
 * FDA 2024 LDT rule brings LDTs under FDA oversight in 4 phases through
 * May 2028. Track which LDTs are in which phase, what phase-specific
 * deliverables remain, and which qualify for enforcement discretion
 * (pre-2024 grandfathered LDTs).
 */

(() => {

const { I, DocumentsPanel } = window;
const { LDT_PHASES, LDT_KPIS, LDT_INVENTORY, LDT_MILESTONES, LDT_DOCUMENTS, LDT_DOC_FRAMEWORKS } = window;

function LdtSurface({ onAskAna, onOpenEditor }) {
  const [phaseFilter, setPhaseFilter] = React.useState('all');

  const visibleLdts = phaseFilter === 'all'
    ? LDT_INVENTORY
    : LDT_INVENTORY.filter(l => l.phase === phaseFilter);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Diagnostics</div>
          <h1 className="page-title">LDT compliance — FDA 2024 rule</h1>
          <div className="page-sub">
            {LDT_INVENTORY.length} laboratory-developed tests in portfolio · 4-phase compliance through May 2028.
            Phase deliverables, enforcement discretion eligibility, grandfathering documentation.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Run an enforcement-discretion eligibility decision for each LDT and surface the ones that qualify for grandfathering.')}>
            {I.scale} Eligibility decision
          </button>
          <button className="btn primary small" onClick={() => onOpenEditor && onOpenEditor('doc-ldt-cv401-dn')}>
            {I.pencil} Open CV-IH401 De Novo
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {LDT_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val" style={{ fontSize: typeof k.metric === 'string' && k.metric.length > 7 ? 18 : 22 }}>{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      {/* Phase tracker */}
      <section className="section">
        <div className="section-head">
          <h2>FDA 2024 LDT rule — phase tracker</h2>
          <span className="section-sub">May 2024 final rule · phased compliance through May 2028</span>
        </div>
        <div className="ldt-phases">
          {LDT_PHASES.map(p => {
            const count = LDT_INVENTORY.filter(l => l.phase === p.id).length;
            return (
              <button
                key={p.id}
                className="ldt-phase"
                data-on={phaseFilter === p.id}
                data-current={p.id === 'P2'}
                onClick={() => setPhaseFilter(phaseFilter === p.id ? 'all' : p.id)}
              >
                <div className="ldt-phase-head">
                  <span className="ldt-phase-id mono">{p.id}</span>
                  <span className="ldt-phase-n mono">{count} LDTs</span>
                </div>
                <div className="ldt-phase-label">{p.label}</div>
                <div className="ldt-phase-dates mono small">{p.start} → {p.end}</div>
                <div className="ldt-phase-deliv">{p.deliverables}</div>
              </button>
            );
          })}
          <button
            className="ldt-phase ldt-phase-edx"
            data-on={phaseFilter === 'EDX'}
            onClick={() => setPhaseFilter(phaseFilter === 'EDX' ? 'all' : 'EDX')}
          >
            <div className="ldt-phase-head">
              <span className="ldt-phase-id mono">EDX</span>
              <span className="ldt-phase-n mono">{LDT_INVENTORY.filter(l => l.grandfathered).length} LDTs</span>
            </div>
            <div className="ldt-phase-label">Enforcement discretion</div>
            <div className="ldt-phase-dates mono small">Pre-2024 · grandfathered</div>
            <div className="ldt-phase-deliv">Pre-existing, low-risk, no high-risk modifications</div>
          </button>
        </div>
      </section>

      <DocumentsPanel
        title="LDT compliance artifacts"
        subtitle="Phase 1–4 deliverables + enforcement-discretion memos"
        docs={LDT_DOCUMENTS}
        frameworks={LDT_DOC_FRAMEWORKS}
        onOpenEditor={onOpenEditor}
        onAskAna={onAskAna}
      />

      {/* LDT inventory + milestones */}
      <section className="section">
        <div className="section-head">
          <h2>LDT inventory{phaseFilter !== 'all' ? ` · filtered to ${phaseFilter}` : ''}</h2>
          <span className="section-sub">{visibleLdts.length} of {LDT_INVENTORY.length} shown · per-LDT compliance plan</span>
          {phaseFilter !== 'all' && (
            <button className="chip-filter" onClick={() => setPhaseFilter('all')}>Clear {I.close}</button>
          )}
        </div>
        <div className="ctable">
          <div className="ctable-head" style={{ gridTemplateColumns: '100px 1.4fr 1fr 80px 70px 1fr 70px' }}>
            <div>ID</div><div>Test</div><div>Lab</div><div>Risk</div><div>Phase</div><div>Plan</div><div>MDRs</div>
          </div>
          {visibleLdts.map(l => (
            <button key={l.id} className="ctable-row" style={{ gridTemplateColumns: '100px 1.4fr 1fr 80px 70px 1fr 70px' }}
              onClick={() => onAskAna(`Open LDT ${l.id} (${l.name}). Show me the phase-specific deliverables remaining and any open MDRs.`)}>
              <div className="mono small">{l.id}</div>
              <div className="ctable-strong">{l.name}</div>
              <div style={{ color: 'var(--text-300)' }}>{l.lab}</div>
              <div><span className={`qms-sev qms-sev-${l.risk === 'high' ? 'high' : l.risk === 'med' ? 'medium' : 'low'}`}>{l.risk}</span></div>
              <div><span className={`status-pill ${l.phase === 'EDX' ? 'idle' : l.phase === 'P4' ? 'review' : 'active'}`}>{l.phase}</span></div>
              <div style={{ color: 'var(--text-300)', fontSize: 12 }}>{l.plan}</div>
              <div>{l.mdrCount > 0 ? <span className="pill-err small">{l.mdrCount}</span> : <span style={{ color: 'var(--success)' }}>—</span>}</div>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

window.LdtSurface = LdtSurface;

})();
