/**
 * Audit log viewer — Phase 5
 *
 * Dedicated surface (not the 24-hour band on Admin). Date/actor/action/
 * resource filters, paginated event list, tamper-proof SHA-256 chain
 * visualization, signed-PDF export.
 */

(() => {

const { I, DocumentsPanel } = window;
const { AUDIT_KPIS, AUDIT_ACTIONS, AUDIT_RESOURCES, AUDIT_EVENTS } = window;
const { ADM_DOCUMENTS, ADM_DOC_FRAMEWORKS } = window;

function AuditSurface({ onAskAna, onOpenEditor }) {
  const [actionFilter, setActionFilter] = React.useState('all');
  const [resourceFilter, setResourceFilter] = React.useState('all');
  const [query, setQuery] = React.useState('');

  const events = AUDIT_EVENTS.filter(e =>
    (actionFilter === 'all' || e.action === actionFilter) &&
    (resourceFilter === 'all' || e.resource === resourceFilter) &&
    (!query || (e.target + e.actorName + e.reason).toLowerCase().includes(query.toLowerCase()))
  );

  /* Audit-export docs are exactly the Admin compliance exports — reuse. */
  const exportDocs = (ADM_DOCUMENTS || []).filter(d => d.framework === 'part-11');

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">System</div>
          <h1 className="page-title">Audit log</h1>
          <div className="page-sub">
            21 CFR Part 11 §11.10(e) — every regulated mutation recorded, SHA-256 chained,
            7-year minimum retention. Export at any range as a signed PDF.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Verify the audit log SHA-256 chain integrity across the full retention window. Surface any breaks.')}>
            {I.shield} Verify chain
          </button>
          <button className="btn primary small" onClick={() => onAskAna('Export the audit log for the selected range as a signed PDF, including SHA-256 chain manifest.')}>
            {I.download} Export range
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {AUDIT_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <section className="section">
        <div className="section-head">
          <h2>Filter</h2>
          <span className="section-sub">{events.length} of {AUDIT_EVENTS.length} events shown</span>
        </div>
        <div className="audit-filters">
          <div className="audit-search">
            <span className="ico">{I.search}</span>
            <input
              placeholder="Search actor, target, reason…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="seg small">
            <button className="seg-btn" data-on={actionFilter === 'all'} onClick={() => setActionFilter('all')}>All actions</button>
            {AUDIT_ACTIONS.slice(0, 4).map(a => (
              <button key={a.id} className="seg-btn" data-on={actionFilter === a.id} onClick={() => setActionFilter(a.id)}>{a.label}</button>
            ))}
          </div>
          <div className="seg small">
            <button className="seg-btn" data-on={resourceFilter === 'all'} onClick={() => setResourceFilter('all')}>All resources</button>
            {AUDIT_RESOURCES.slice(0, 4).map(r => (
              <button key={r.id} className="seg-btn" data-on={resourceFilter === r.id} onClick={() => setResourceFilter(r.id)}>{r.label}</button>
            ))}
          </div>
        </div>
      </section>

      {/* Event list with chain visualization */}
      <section className="section">
        <div className="section-head">
          <h2>Events · chained</h2>
          <span className="section-sub">Each row's hash is computed over (prev_hash || event_payload) · click an entry to verify cryptographically</span>
        </div>
        <div className="audit-chain">
          {events.map((e, i) => (
            <button
              key={e.id}
              className="audit-event"
              data-action={e.action}
              onClick={() => onAskAna(`Verify audit entry ${e.id} — show me the canonical payload, the previous-hash, the computed SHA-256, and confirm the chain link.`)}
            >
              <div className="audit-event-link">
                <span className="audit-chain-dot" />
                {i < events.length - 1 && <span className="audit-chain-line" />}
              </div>
              <div className="audit-event-body">
                <div className="audit-event-head">
                  <span className="mono small audit-event-id">{e.id}</span>
                  <span className="audit-event-when">{e.when}</span>
                  <span className={`audit-action-tag audit-action-${e.action}`}>{e.action}</span>
                  <span className="audit-event-resource">{e.resource}</span>
                  <span className="audit-event-target">{e.target}</span>
                </div>
                <div className="audit-event-meta">
                  <span className="audit-event-actor">{e.actorName === 'system' ? <span style={{ color: 'var(--text-400)' }}>system</span> : e.actorName}</span>
                  <span className="dot-sep">·</span>
                  <span>{e.role}</span>
                  {e.reason && <><span className="dot-sep">·</span><span className="audit-event-reason">"{e.reason}"</span></>}
                </div>
                <div className="audit-event-hash">
                  <span className="audit-hash-lbl">SHA-256</span>
                  <span className="mono tiny audit-hash-val">{e.sha}</span>
                  <span className="audit-hash-lbl">prev</span>
                  <span className="mono tiny audit-hash-prev">{e.prev}</span>
                  {e.chain === 'ok' && <span className="audit-chain-ok">{I.check} chain ok</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Audit exports — these ARE documents */}
      <DocumentsPanel
        title="Audit exports"
        subtitle="Scheduled and on-demand signed PDFs from the audit log"
        docs={exportDocs}
        frameworks={(ADM_DOC_FRAMEWORKS || []).filter(f => f.id === 'part-11')}
        onOpenEditor={onOpenEditor}
        onAskAna={onAskAna}
      />
    </>
  );
}

window.AuditSurface = AuditSurface;

})();
