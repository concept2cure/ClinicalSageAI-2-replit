(() => {
/**
 * <DocumentsPanel> — the canonical "documents this surface owns" affordance.
 *
 * Same shape as K510Surface's eSTAR sections panel — row per document with
 * status pill, version, sections progress, owner, e-sig state, and an
 * "open in editor" handoff. Reusable across Engineering, UDI, Postmarket,
 * Analytics, and Admin (each pass their own document list).
 *
 * Props:
 *   - title:    panel heading (e.g. "Documents in flight")
 *   - subtitle: optional second-line caption
 *   - docs:     array of Document objects (see data/engineering-docs.js for shape)
 *   - frameworks: optional array of {id,label} groups; renders a filter row
 *   - onOpenEditor: (docId) => void  — host route into the doc editor
 *   - onAskAna:     (text) => void   — AnA handoff
 *   - density: 'comfortable' | 'compact'   — compact reduces row padding
 *
 * Globals set: window.DocumentsPanel
 */

const { I } = window;

function DocumentsPanel({
  title = 'Documents in flight',
  subtitle,
  docs,
  frameworks,
  onOpenEditor,
  onAskAna,
  density = 'comfortable',
}) {
  const [framework, setFramework] = React.useState('all');
  const filtered = framework === 'all' ? docs : docs.filter(d => d.framework === framework);

  /* Counts per framework for the segmented filter row. */
  const counts = React.useMemo(() => {
    const m = { all: docs.length };
    for (const d of docs) m[d.framework] = (m[d.framework] || 0) + 1;
    return m;
  }, [docs]);

  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {subtitle && <span className="section-sub">{subtitle}</span>}
        {frameworks && frameworks.length > 1 && (
          <div className="seg small" style={{ marginLeft: 'auto' }}>
            <button className="seg-btn" data-on={framework === 'all'} onClick={() => setFramework('all')}>
              All <span className="count">{counts.all}</span>
            </button>
            {frameworks.map(f => (
              <button
                key={f.id}
                className="seg-btn"
                data-on={framework === f.id}
                onClick={() => setFramework(f.id)}
                title={f.desc}
              >
                {f.label} <span className="count">{counts[f.id] || 0}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`docs-panel${density === 'compact' ? ' docs-panel-compact' : ''}`}>
        {filtered.map(d => (
          <button
            key={d.id}
            className="docs-row"
            data-status={d.status}
            data-blocker={d.blocker || undefined}
            onClick={() => onOpenEditor && onOpenEditor(d.id)}
          >
            <div className="docs-rail" />
            <div className="docs-body">
              <div className="docs-head">
                {d.framework && (
                  <span className={`docs-framework docs-fw-${d.framework}`}>
                    {(frameworks || []).find(f => f.id === d.framework)?.label || d.framework}
                  </span>
                )}
                {d.dhfRef && <span className="mono tiny docs-dhf">DHF §{d.dhfRef}</span>}
                <span className={`status-pill ${d.status}`}>{d.status}</span>
                {d.blocker && <span className="pill-err small">blocker</span>}
                {d.esigRequired && (
                  <span className={`docs-esig docs-esig-${d.esigState}`} title={
                    d.esigState === 'signed' ? `Signed ${d.signedBy}` :
                    d.esigState === 'pending' ? 'E-signature required' :
                    'E-signature not yet applicable'
                  }>
                    {I.shieldCheck}
                    <span>{d.esigState === 'signed' ? 'signed' : d.esigState === 'pending' ? 'sign pending' : 'esig n/a'}</span>
                  </span>
                )}
              </div>
              <div className="docs-title">{d.title}</div>
              <div className="docs-meta">
                <span className="mono small docs-ver">{d.ver}</span>
                <span className="dot-sep">·</span>
                <span>
                  {d.sectionsComplete}/{d.sections} sections
                </span>
                <span className="docs-progress">
                  <span className="docs-progress-fill" style={{ width: `${d.completion}%` }} />
                </span>
                <span className="mono small docs-pct">{d.completion}%</span>
                <span className="dot-sep">·</span>
                <span className="docs-owner">{d.owner}</span>
                {d.reviewers && d.reviewers.length > 0 && (
                  <>
                    <span style={{ color: 'var(--text-400)' }}>→</span>
                    <span className="docs-reviewers">
                      {d.reviewers.map(r => <span key={r} className="docs-reviewer">{r}</span>)}
                    </span>
                  </>
                )}
                <span className="docs-last">{d.lastEdit}</span>
              </div>
              {d.blocker && d.blockerNote && (
                <div className="docs-blocker-note">
                  <span className="ico">{I.alertCircle}</span>
                  <span>{d.blockerNote}</span>
                </div>
              )}
              {(d.openComments || d.deviations || d.openRisks || d.anomalies) && (
                <div className="docs-flags">
                  {d.openComments && <span className="docs-flag">{d.openComments} open comments</span>}
                  {d.deviations && <span className="docs-flag">{d.deviations} deviations</span>}
                  {d.openRisks && <span className="docs-flag">{d.openRisks} open risks</span>}
                  {d.anomalies && <span className="docs-flag">{d.anomalies} unresolved anomalies</span>}
                </div>
              )}
            </div>
            <div className="docs-actions">
              {onAskAna && (
                <span
                  className="docs-action-chip"
                  role="button"
                  tabIndex={0}
                  onClick={e => { e.stopPropagation(); onAskAna(`Draft the next missing section of ${d.title}.`); }}
                  title="Ask AnA to draft"
                >
                  {I.sparkles}
                </span>
              )}
              <span className="docs-open">{I.arrowRight}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

window.DocumentsPanel = DocumentsPanel;

})();
