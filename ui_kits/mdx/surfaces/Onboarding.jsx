/**
 * Onboarding / migration importer — Phase 8.
 *
 * 7-step wizard for new paying clients. Connect → ingest → AnA extract →
 * section map → validate → seed memory → go live.
 */

(() => {

const { I } = window;
const { ONB_STEPS, ONB_KPIS, ONB_ARTIFACTS, ONB_VALIDATIONS } = window;

function OnboardingSurface({ onAskAna }) {
  const currentStep = 'map'; // 4 of 7
  const stepIdx = ONB_STEPS.findIndex(s => s.id === currentStep);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">System · client onboarding</div>
          <h1 className="page-title">Migration importer</h1>
          <div className="page-sub">
            Bring legacy 510(k), PMA, IDE archives + style guides + RTA letters into Concept2Cure.
            AnA-driven extraction, canonical-section mapping, current-standard validation, memory seeding.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Pause the migration and surface every artifact still in review or unmappable. I want to do a manual pass.')}>
            {I.eye} Review queue
          </button>
          <button className="btn primary small" onClick={() => onAskAna('Resume AnA section mapping — work through the remaining unmappable artifacts and propose canonical-section matches.')}>
            {I.sparkles} Resume mapping
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {ONB_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      {/* 7-step pipeline */}
      <section className="section">
        <div className="section-head">
          <h2>Migration pipeline</h2>
          <span className="section-sub">Step {stepIdx + 1} of {ONB_STEPS.length} · {ONB_STEPS[stepIdx].label}</span>
        </div>
        <div className="onb-pipeline">
          {ONB_STEPS.map((s, i) => {
            const state = i < stepIdx ? 'complete' : i === stepIdx ? 'active' : 'idle';
            return (
              <div key={s.id} className="onb-step" data-state={state}>
                <div className="onb-step-num mono">{String(i + 1).padStart(2, '0')}</div>
                <div className="onb-step-label">{s.label}</div>
                <div className="onb-step-desc">{s.desc}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Artifacts ingested + mapped */}
      <section className="section">
        <div className="section-head">
          <h2>Artifacts ingested · canonical mapping</h2>
          <span className="section-sub">{ONB_ARTIFACTS.length} shown · AnA confidence + manual-override available per row</span>
        </div>
        <div className="ctable">
          <div className="ctable-head" style={{ gridTemplateColumns: '90px 1.6fr 1fr 90px 100px 60px' }}>
            <div>ID</div><div>Legacy filename</div><div>Mapped to / section</div><div>Confidence</div><div>State</div><div>Issues</div>
          </div>
          {ONB_ARTIFACTS.map(a => (
            <button key={a.id} className="ctable-row" style={{ gridTemplateColumns: '90px 1.6fr 1fr 90px 100px 60px' }}
              onClick={() => onAskAna(`Open import ${a.id} (${a.legacy}) — show me the extraction trace and let me approve, edit, or remap.`)}>
              <div className="mono small">{a.id}</div>
              <div className="ctable-strong">{a.legacy}</div>
              <div style={{ color: 'var(--text-300)', fontSize: 12 }}>{a.section}</div>
              <div>
                <span className="onb-conf">
                  <span className="onb-conf-bar"><span className="onb-conf-fill" style={{ width: `${a.confidence * 100}%` }} /></span>
                  <span className="mono small">{Math.round(a.confidence * 100)}%</span>
                </span>
              </div>
              <div><span className={`status-pill ${a.state === 'mapped' ? 'complete' : a.state === 'review' ? 'review' : 'draft'}`}>{a.state}</span></div>
              <div>{a.issues > 0 ? <span className="pill-err small">{a.issues}</span> : <span style={{ color: 'var(--success)' }}>—</span>}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Validation summary */}
      <section className="section">
        <div className="section-head">
          <h2>Validation results</h2>
          <span className="section-sub">Current-standard checks against ISO 14971:2019, ISO 10993-1:2018, FDA 2023 cyber guidance, EU MDR/IVDR Annexes</span>
        </div>
        <div className="onb-validations">
          {ONB_VALIDATIONS.map(v => (
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

window.OnboardingSurface = OnboardingSurface;

})();
