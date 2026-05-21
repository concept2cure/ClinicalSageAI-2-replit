/**
 * Post-market vigilance surface — DOCUMENT-FIRST.
 *
 * Vigilance is the most document-heavy surface in the entire kit:
 * every signal that crosses a regulatory threshold becomes an MDR (FDA
 * 5-day or 30-day) or a 15-day report (EU MDR Art. 87); every confirmed
 * trend becomes an FSCA + FSN; every root-cause investigation becomes a
 * CAPA record; every device-year produces a PSUR. The previous
 * dashboard view (signals feed, MDR clock cards, CAPA board, sparkline
 * trends, PMS plan) is demoted to a "Situational awareness" accordion.
 *
 * Layout:
 *   • Page header — primary CTA "Open MDR-0091 (5-day clock 23h)"
 *   • Compact 4-card metrics (about regulatory submissions)
 *   • Documents in flight — primary (MDRs · CAPAs · FSCA/FSN · PSURs · PMS plans)
 *   • Signal triage queue — top critical signals NOT yet wrapped in a doc
 *   • Situational awareness accordion — full signal feed, MDR clock,
 *     CAPA board, sparkline trends, PMS plan execution
 */

(() => {

const { I, DocumentsPanel } = window;
const {
  PV_METRICS, PV_SIGNALS, PV_MDRS, PV_CAPA_STAGES, PV_CAPAS, PV_PMS_PLAN, PV_TRENDS,
  PV_DOCUMENTS, PV_DOC_FRAMEWORKS,
} = window;

function PostmarketSurface({ onAskAna, onOpenEditor }) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);

  /* Signal triage queue — critical/review signals that don't yet have
     a corresponding doc in PV_DOCUMENTS. Heuristic: state contains
     "investigate" or no MDR docs linked. */
  const triageQueue = React.useMemo(() => {
    return PV_SIGNALS.filter(s =>
      (s.severity === 'critical' || s.severity === 'review') &&
      s.state !== 'closed-trend'
    ).slice(0, 4);
  }, []);

  /* Find the most urgent MDR doc (5-day clock closest to expiry) for
     the primary CTA. */
  const urgentMdr = PV_DOCUMENTS.find(d => d.blocker && d.framework.startsWith('mdr')) ||
                    PV_DOCUMENTS.find(d => d.framework.startsWith('mdr') && d.status === 'draft');

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workstream</div>
          <h1 className="page-title">Post-market vigilance</h1>
          <div className="page-sub">
            {PV_DOCUMENTS.length} regulatory submissions in flight.
            21 CFR 803 MDR · EU MDR Art. 87 · 21 CFR 820.100 CAPA · PSUR.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() => onAskAna('Triage open vigilance signals across the portfolio and tell me which ones cross a 5-day or 30-day MDR clock today.')}
          >
            {I.sparkles} Triage signals
          </button>
          {urgentMdr && (
            <button
              className="btn primary small"
              onClick={() => onOpenEditor && onOpenEditor(urgentMdr.id)}
              title={urgentMdr.title}
            >
              {I.pencil} Open {urgentMdr.id.split('-').slice(-2).join('-').toUpperCase()}{urgentMdr.dueIn ? ` (${urgentMdr.dueIn})` : ''}
            </button>
          )}
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        <div className="metric-card" data-tone="err">
          <div className="metric-label">MDRs due ≤72h</div>
          <div className="metric-val">{PV_DOCUMENTS.filter(d => d.framework.startsWith('mdr') && d.dueIn && (d.dueIn.includes('h') || (d.dueIn.endsWith('d') && parseInt(d.dueIn) < 3))).length}</div>
          <div className="metric-meta">FDA 5-day · 30-day · EU 15-day clocks</div>
        </div>
        <div className="metric-card" data-tone="warn">
          <div className="metric-label">CAPAs in flight</div>
          <div className="metric-val">{PV_DOCUMENTS.filter(d => d.framework === 'capa' && d.status !== 'locked').length}</div>
          <div className="metric-meta">{PV_DOCUMENTS.filter(d => d.framework === 'capa' && d.status === 'draft').length} investigation · {PV_DOCUMENTS.filter(d => d.framework === 'capa' && d.status === 'review').length} review</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">PSURs + PMS plans</div>
          <div className="metric-val">{PV_DOCUMENTS.filter(d => d.framework === 'psur').length}</div>
          <div className="metric-meta">{PV_DOCUMENTS.filter(d => d.framework === 'psur' && d.status === 'locked').length} signed · annual + 2-year cadence</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Open signals</div>
          <div className="metric-val">{PV_SIGNALS.filter(s => s.state !== 'closed-trend').length}</div>
          <div className="metric-meta">{PV_SIGNALS.filter(s => s.severity === 'critical').length} critical · awaiting MDR roll-up</div>
        </div>
      </div>

      {/* DOCUMENTS — primary zone */}
      <DocumentsPanel
        title="Regulatory submissions in flight"
        subtitle="Tap any row to open in the MDR / CAPA / FSCA editor · sparkle to draft the narrative with AnA"
        docs={PV_DOCUMENTS}
        frameworks={PV_DOC_FRAMEWORKS}
        onOpenEditor={onOpenEditor}
        onAskAna={onAskAna}
      />

      {/* Triage queue — signals that should be wrapped in a doc */}
      <section className="section">
        <div className="section-head">
          <h2>Signal triage queue</h2>
          <span className="section-sub">
            {triageQueue.length} critical or under-review signals not yet wrapped in an MDR or CAPA · oldest first
          </span>
        </div>
        <div className="eng-blockers-feed">
          {triageQueue.map(s => (
            <button
              key={s.id}
              className="eng-blocker-row"
              data-sev={s.severity === 'critical' ? 'err' : 'warn'}
              data-kind={s.kind}
              onClick={() => onAskAna(`Draft an MDR for signal ${s.id} on ${s.device}: ${s.summary}. Determine whether this is a 5-day or 30-day report, identify the reporting jurisdiction, and prep the Form 3500A narrative.`)}
            >
              <span className={`eng-blocker-dot tone-${s.severity === 'critical' ? 'err' : 'warn'}`} />
              <span className="eng-blocker-kind mono tiny">{s.source}</span>
              <span className="mono small eng-blocker-ref">{s.id}</span>
              <span className="eng-blocker-title">{s.device} — {s.summary}</span>
              <span className="eng-blocker-note">×{s.count} · {s.vs}</span>
              <span className="eng-blocker-owner">{s.owner}</span>
              <span className="eng-blocker-age">{s.opened}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Awareness accordion */}
      <section className="section eng-awareness" data-open={awarenessOpen}>
        <button
          className="eng-awareness-head"
          onClick={() => setAwarenessOpen(o => !o)}
          aria-expanded={awarenessOpen}
        >
          <span className="eng-awareness-chev">{awarenessOpen ? I.down : I.right}</span>
          <h2>Situational awareness</h2>
          <span className="section-sub">
            Full signals feed · MDR clock · CAPA board · trend sparklines · PMS plan execution
          </span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            {/* CAPA Kanban */}
            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>CAPA workflow</h2>
                <span className="section-sub">{PV_CAPAS.length} active · 5-stage</span>
              </div>
              <div className="pv-capa-board">
                {PV_CAPA_STAGES.map(stage => {
                  const inStage = PV_CAPAS.filter(c => c.stage === stage.id);
                  return (
                    <div key={stage.id} className="pv-capa-col">
                      <div className="pv-capa-head">
                        <span className="pv-capa-label">{stage.label}</span>
                        <span className="pv-capa-n">{inStage.length}</span>
                      </div>
                      <div className="pv-capa-body">
                        {inStage.map(c => (
                          <button key={c.id} className="pv-capa-card" data-critical={c.critical} onClick={() => onAskAna(`Open CAPA ${c.id}: ${c.title}`)}>
                            <div className="pv-capa-card-head">
                              <span className="mono small">{c.id}</span>
                              {c.critical && <span className="pill-err small">critical</span>}
                            </div>
                            <div className="pv-capa-card-title">{c.title}</div>
                            <div className="pv-capa-card-foot">
                              <span className="ctable-strong">{c.device}</span>
                              <span className="dot-sep">·</span>
                              <span>{c.owner}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Trends + PMS */}
            <div className="eng-grid eng-grid-awareness">
              <section>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <h2 style={{ fontSize: 14 }}>Vigilance trending</h2>
                </div>
                <div className="pv-trends">
                  {PV_TRENDS.map(t => {
                    const total = t.weeks.reduce((s, v) => s + v, 0);
                    const max = Math.max(...t.weeks);
                    const d = t.weeks.map((v, i) => `${i === 0 ? 'M' : 'L'} ${2 + i * 28} ${2 + 36 * (1 - v / max)}`).join(' ');
                    return (
                      <div key={t.device} className="pv-trend">
                        <div className="pv-trend-head">
                          <span className="ctable-strong">{t.device}</span>
                          <span className="pv-trend-total mono small">{total}</span>
                        </div>
                        <svg width="200" height="40" className="pv-trend-spark">
                          <path d={d} fill="none" stroke="var(--accent-100)" strokeWidth="1.5" />
                        </svg>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <h2 style={{ fontSize: 14 }}>PMS plan execution</h2>
                </div>
                <div className="ctable">
                  <div className="ctable-head" style={{ gridTemplateColumns: '90px 1fr 80px 90px' }}>
                    <div>Device</div><div>Sources</div><div>Signals</div><div>State</div>
                  </div>
                  {PV_PMS_PLAN.map(p => (
                    <div key={p.device} className="ctable-row" style={{ gridTemplateColumns: '90px 1fr 80px 90px' }}>
                      <div className="ctable-strong">{p.device}</div>
                      <div style={{ color: 'var(--text-300)', fontSize: 12 }}>{p.source}</div>
                      <div className="mono small">{p.signals}</div>
                      <div><span className={`status-pill ${p.state === 'on-track' ? 'active' : 'review'}`}>{p.state}</span></div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

window.PostmarketSurface = PostmarketSurface;

})();
