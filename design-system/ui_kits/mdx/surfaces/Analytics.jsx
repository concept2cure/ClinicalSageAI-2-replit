(() => {
/**
 * Analytics surface — portfolio cycle times, reviewer velocity, blocker
 * root-cause, AnA effectiveness. Read-only.
 *
 * Layout (pushing harder):
 *   • Page header + 4-card KPI row
 *   • Pace of clearance — 24-month horizon bar chart
 *   • Phase cycle-time comparison — diverging bars, org vs FDA peer
 *     median per phase (where the time goes vs where it should go)
 *   • Top blockers — root-cause aggregation, trend chip
 *   • Reviewer velocity — distribution dots per product code with org
 *     marker on a number line (novel: lets you see at-a-glance if our
 *     submissions are faster or slower than peer cohort)
 *   • AnA acceptance — tool-call → accepted, with bar
 */

const { I, AskAnaChip, DocumentsPanel } = window;
const { ANL_KPIS, ANL_CYCLE_PHASES, ANL_BLOCKERS, ANL_REVIEWERS, ANL_ANA_USAGE, ANL_PACE_24M } = window;
const { ANL_DOCUMENTS, ANL_DOC_FRAMEWORKS } = window;

function AnalyticsSurface({ onAskAna }) {
  const [pathway, setPathway] = React.useState('all');

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Intelligence</div>
          <h1 className="page-title">Analytics</h1>
          <div className="page-sub">
            Portfolio cycle times · blocker root causes · reviewer velocity vs peer cohort ·
            AnA effectiveness. Read-only.
          </div>
        </div>
        <div className="page-actions">
          <div className="seg small">
            <button className="seg-btn" data-on={pathway === 'all'}  onClick={() => setPathway('all')}>All</button>
            <button className="seg-btn" data-on={pathway === 'k510'} onClick={() => setPathway('k510')}>510(k)</button>
            <button className="seg-btn" data-on={pathway === 'pma'}  onClick={() => setPathway('pma')}>PMA</button>
            <button className="seg-btn" data-on={pathway === 'cer'}  onClick={() => setPathway('cer')}>CER</button>
          </div>
          <button
            className="btn ghost small"
            onClick={() => onAskAna('Export the portfolio analytics summary as a one-page PDF — cycle times, top blockers, reviewer-velocity rank vs peers.')}
          >
            {I.download} Export
          </button>
        </div>
      </div>

      <div className="metrics-row">
        {ANL_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
            {k.delta && (
              <div className={`anl-delta ${k.delta.startsWith('+') ? 'up' : k.delta.startsWith('-') || k.delta.startsWith('−') ? 'down' : ''}`}>
                {k.delta.startsWith('+') ? I.trendingUp : k.delta.startsWith('-') || k.delta.startsWith('−') ? I.trendingDown : I.minus} {k.delta}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Reports this surface produces — analytics exports + dossiers */}
      <DocumentsPanel
        title="Reports and dossiers"
        subtitle={`${ANL_DOCUMENTS.length} analytics artifacts · ${ANL_DOCUMENTS.filter(d => d.status === 'ready' || d.status === 'locked').length} ready · ${ANL_DOCUMENTS.filter(d => d.status === 'draft').length} drafting`}
        docs={ANL_DOCUMENTS}
        frameworks={ANL_DOC_FRAMEWORKS}
        onOpenEditor={(docId) => onAskAna(`Open report ${docId} in viewer`)}
        onAskAna={onAskAna}
      />

      {/* Pace of clearance — 24 months */}
      <section className="section">
        <div className="section-head">
          <h2>Pace of clearance</h2>
          <span className="section-sub">{ANL_PACE_24M.reduce((s, n) => s + n, 0)} cleared in last 24 months</span>
        </div>
        <div className="anl-pace">
          {ANL_PACE_24M.map((n, i) => {
            const monthsAgo = ANL_PACE_24M.length - 1 - i;
            const isThisYear = monthsAgo < 12;
            return (
              <div key={i} className="anl-pace-col" data-thisyear={isThisYear} title={`${monthsAgo} mo ago · ${n} cleared`}>
                <div className="anl-pace-bar" style={{ height: `${n * 22 + (n > 0 ? 8 : 0)}px` }}>
                  {n > 0 && <span className="anl-pace-n">{n}</span>}
                </div>
                <div className="anl-pace-x">{monthsAgo % 6 === 0 ? `${monthsAgo}m` : ''}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Phase cycle time — diverging bars */}
      <section className="section">
        <div className="section-head">
          <h2>Where the time goes — phase cycle time vs peer median</h2>
          <span className="section-sub">Left of axis · faster than peer · Right of axis · slower</span>
        </div>
        <div className="anl-phase">
          {ANL_CYCLE_PHASES.map((row, i) => {
            const k510 = row.k510;
            const pma = row.pma;
            const k510Delta = k510.org - k510.peer;
            const pmaDelta = pma.org - pma.peer;
            const maxAbs = 60;
            const k510Mag = Math.min(Math.abs(k510Delta), maxAbs) / maxAbs * 100;
            const pmaMag = Math.min(Math.abs(pmaDelta), maxAbs) / maxAbs * 100;
            return (
              <div key={i} className="anl-phase-row">
                <div className="anl-phase-label">{row.phase}</div>
                <div className="anl-phase-bars">
                  {k510.org > 0 && (
                    <div className="anl-phase-track" title={`510(k) — org ${k510.org}d · peer ${k510.peer}d`}>
                      <span className="anl-phase-axis" />
                      <div
                        className={`anl-phase-bar ${k510Delta > 0 ? 'slow' : 'fast'}`}
                        style={{
                          width: `${k510Mag / 2}%`,
                          left: k510Delta > 0 ? '50%' : `${50 - k510Mag / 2}%`,
                        }}
                      />
                      <span className="anl-phase-lbl k510">510(k) · {k510.org}d</span>
                      <span className="anl-phase-peer">peer p50 · {k510.peer}d</span>
                    </div>
                  )}
                  {pma.org > 0 && (
                    <div className="anl-phase-track" title={`PMA — org ${pma.org}d · peer ${pma.peer}d`}>
                      <span className="anl-phase-axis" />
                      <div
                        className={`anl-phase-bar ${pmaDelta > 0 ? 'slow' : 'fast'}`}
                        style={{
                          width: `${pmaMag / 2}%`,
                          left: pmaDelta > 0 ? '50%' : `${50 - pmaMag / 2}%`,
                        }}
                      />
                      <span className="anl-phase-lbl pma">PMA · {pma.org}d</span>
                      <span className="anl-phase-peer">peer p50 · {pma.peer}d</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div className="anl-phase-legend">
            <span className="ll"><span className="anl-phase-swatch fast" /> Faster than peer median</span>
            <span className="ll"><span className="anl-phase-swatch slow" /> Slower than peer median</span>
          </div>
        </div>
      </section>

      <div className="anl-grid">
        {/* Top blockers */}
        <section className="section">
          <div className="section-head">
            <h2>Top blockers · root cause</h2>
            <span className="section-sub">Aggregated across portfolio · last 90 days</span>
          </div>
          <div className="anl-blockers">
            {ANL_BLOCKERS.map((b, i) => (
              <button
                key={i}
                className="anl-blocker"
                onClick={() => onAskAna(`Pull every program currently blocked on "${b.cause}". Show me the owner, age, and proposed unblock action for each.`)}
              >
                <div className="anl-blocker-head">
                  <span className="anl-blocker-count mono">{b.count}</span>
                  <span className="anl-blocker-cause">{b.cause}</span>
                  <span className={`anl-blocker-trend trend-${b.trend}`}>
                    {b.trend === 'up' ? I.trendingUp : b.trend === 'down' ? I.trendingDown : I.minus}
                  </span>
                </div>
                <div className="anl-blocker-foot">
                  <span>{b.pathway}</span>
                  <span className="dot-sep">·</span>
                  <span>median age {b.median}d</span>
                  <span className="dot-sep">·</span>
                  <span style={{ color: 'var(--text-400)' }}>{b.owner}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Reviewer velocity — number-line */}
        <section className="section">
          <div className="section-head">
            <h2>Reviewer velocity · by product code</h2>
            <span className="section-sub">FDA decision days · cohort distribution + our submissions</span>
          </div>
          <div className="anl-reviewers">
            {ANL_REVIEWERS.map(r => {
              const range = r.slowest - r.fastest;
              const orgPos = r.orgMedian > 0 ? ((r.orgMedian - r.fastest) / range) * 100 : null;
              const medianPos = ((r.median - r.fastest) / range) * 100;
              return (
                <button
                  key={r.code}
                  className="anl-reviewer"
                  onClick={() => onAskAna(`Compare our ${r.code} (${r.name}) submissions against the FDA cohort. Surface specific decisions that explain why we're at ${r.orgMedian || '—'}d vs cohort median ${r.median}d.`)}
                >
                  <div className="anl-reviewer-head">
                    <span className="mono small">{r.code}</span>
                    <span className="ctable-strong">{r.name}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--text-400)', fontSize: 12 }}>{r.n} decisions</span>
                  </div>
                  <div className="anl-reviewer-line">
                    <span className="anl-line-fast">{r.fastest}d</span>
                    <div className="anl-line-track">
                      <div className="anl-line-bar" />
                      <div className="anl-line-tick anl-line-median" style={{ left: `${medianPos}%` }} title={`cohort median ${r.median}d`}>
                        <span className="anl-line-tick-lbl">cohort p50</span>
                      </div>
                      {orgPos !== null && (
                        <div className="anl-line-tick anl-line-org" style={{ left: `${Math.min(Math.max(orgPos, 0), 100)}%` }} title={`our median ${r.orgMedian}d`}>
                          <span className="anl-line-tick-lbl">ours · {r.orgMedian}d</span>
                        </div>
                      )}
                    </div>
                    <span className="anl-line-slow">{r.slowest}d</span>
                  </div>
                  <div className="anl-reviewer-foot">
                    <span>cohort first-cycle approval rate · {r.firstCycle}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* AnA tool usage */}
      <section className="section">
        <div className="section-head">
          <h2>AnA tool usage · acceptance</h2>
          <span className="section-sub">Last 8 weeks · how often AnA's drafts and traces are accepted</span>
        </div>
        <div className="anl-ana">
          {ANL_ANA_USAGE.map(u => {
            const pct = Math.round(u.accepted / u.calls * 100);
            return (
              <div key={u.tool} className="anl-ana-row">
                <div className="anl-ana-tool">
                  <span className="mono small">{u.tool}</span>
                  <span style={{ color: 'var(--text-400)', fontSize: 12 }}>· {u.pathway}</span>
                </div>
                <div className="anl-ana-bar">
                  <div className="anl-ana-bar-fill" style={{ width: `${pct}%` }} />
                  <span className="anl-ana-bar-lbl mono small">{u.accepted}/{u.calls} accepted · {pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

window.AnalyticsSurface = AnalyticsSurface;

})();
