(() => {
/**
 * Engineering surface — DOCUMENT-FIRST (the committed design).
 *
 * Documents the engineering team produces are the primary surface; the
 * dashboards (DHF strip, risk heatmap, ECRs, NCs) collapse into a
 * "Situational awareness" zone the user can expand on demand.
 *
 * Why this exists: the product is about authoring regulatory documents.
 * The dashboard view is good for monitoring, but a regulatory affairs
 * lead opening "Engineering" wants to know what to write next, not how
 * many ECRs are in flight. This variant puts the work first.
 *
 * Layout:
 *   • Page header — primary CTA "Open Risk Management File"
 *   • Compact 4-metric row
 *   • Documents in flight (large) — same DocumentsPanel as the hybrid
 *   • What's blocking the documents — consolidated feed pulling from
 *     DHF gaps · risks not yet verified · ECRs in review · open NCs
 *   • Situational awareness (collapsed accordion) — DHF strip, risk
 *     heatmap, traceability table, ECR table, NC list. Same content as
 *     the hybrid view; demoted from primary to on-demand.
 */

const { I, DocumentsPanel } = window;
const {
  ENG_DHF, ENG_TRACE, ENG_RISKS, ENG_RISK_SEVERITY, ENG_RISK_PROB,
  ENG_RISK_ACCEPT, ENG_ECRS, ENG_ISSUES,
  ENG_DOCUMENTS, ENG_DOC_FRAMEWORKS,
} = window;

function EngineeringSurface({ program, onAskAna, onOpenEditor }) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);
  const [cellFilter, setCellFilter] = React.useState(null);

  const programContext = program ? `${program.code} · ${program.title}` : null;

  /* Consolidated blockers — pull everything stopping documents from being
     finished, in one list. */
  const blockers = React.useMemo(() => {
    const list = [];
    /* DHF sections in draft or review. */
    for (const d of ENG_DHF) {
      if (d.status === 'draft' || d.status === 'blocked') {
        list.push({
          kind: 'dhf',
          severity: d.status === 'blocked' ? 'err' : 'warn',
          ref: `DHF §${d.num}`,
          title: d.label,
          note: d.meta,
          owner: d.owner,
          age: d.updated,
        });
      }
    }
    /* Risks not yet verified. */
    for (const r of ENG_RISKS) {
      if (r.state !== 'verified') {
        list.push({
          kind: 'risk',
          severity: r.state === 'open' ? 'warn' : 'low',
          ref: r.id,
          title: r.hazard,
          note: `${r.harm} · residual ${r.residual}`,
          owner: r.owner,
          age: '—',
        });
      }
    }
    /* ECRs in review or open. */
    for (const e of ENG_ECRS) {
      if (e.state === 'open' || e.state === 'review') {
        list.push({
          kind: 'ecr',
          severity: 'low',
          ref: e.id,
          title: e.title,
          note: `${e.impact} · ${e.riskChange}`,
          owner: e.owner,
          age: e.opened,
        });
      }
    }
    /* Open non-conformances. */
    for (const n of ENG_ISSUES) {
      list.push({
        kind: 'nc',
        severity: n.severity === 'high' ? 'err' : n.severity === 'medium' ? 'warn' : 'low',
        ref: n.id,
        title: n.title,
        note: `linked ${n.linked} · ${n.state}`,
        owner: n.owner,
        age: n.age,
      });
    }
    /* Sort by severity: err first, then warn, then low. */
    const sevOrder = { err: 0, warn: 1, low: 2 };
    return list.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
  }, []);

  const cellCounts = React.useMemo(() => {
    const m = {};
    for (const r of ENG_RISKS) m[r.residual] = (m[r.residual] || 0) + 1;
    return m;
  }, []);

  const visibleRisks = cellFilter
    ? ENG_RISKS.filter(r => r.residual === cellFilter)
    : ENG_RISKS;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workstream{programContext ? ` · ${programContext}` : ''}</div>
          <h1 className="page-title">Device engineering</h1>
          <div className="page-sub">
            12 regulatory documents to deliver before {program?.dueLabel?.toLowerCase() ?? 'filing'}.
            21 CFR 820.30 design controls · ISO 14971 risk · IEC 62304 software · FDA Cyber 2023.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() => onOpenEditor && onOpenEditor('doc-srs-bx204')}
          >
            {I.eye} Open SRS
          </button>
          <button
            className="btn primary small"
            onClick={() => onOpenEditor && onOpenEditor('doc-rmr-bx204')}
          >
            {I.pencil} Open Risk Management File
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        <div className="metric-card">
          <div className="metric-label">Documents in flight</div>
          <div className="metric-val">{ENG_DOCUMENTS.length}</div>
          <div className="metric-meta">{ENG_DOCUMENTS.filter(d => d.status === 'ready').length} ready · {ENG_DOCUMENTS.filter(d => d.status === 'review').length} in review · {ENG_DOCUMENTS.filter(d => d.status === 'draft').length} draft</div>
        </div>
        <div className="metric-card" data-tone="err">
          <div className="metric-label">Blocked documents</div>
          <div className="metric-val">{ENG_DOCUMENTS.filter(d => d.blocker).length}</div>
          <div className="metric-meta">{ENG_DOCUMENTS.filter(d => d.blocker).map(d => d.type.split(' ')[0]).join(' · ') || '—'}</div>
        </div>
        <div className="metric-card" data-tone="warn">
          <div className="metric-label">Awaiting signature</div>
          <div className="metric-val">{ENG_DOCUMENTS.filter(d => d.esigState === 'pending').length}</div>
          <div className="metric-meta">Pending Part 11 e-signature</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg completion</div>
          <div className="metric-val">
            {Math.round(ENG_DOCUMENTS.reduce((s, d) => s + d.completion, 0) / ENG_DOCUMENTS.length)}
            <span className="unit">%</span>
          </div>
          <div className="metric-meta">Section-weighted across all artifacts</div>
        </div>
      </div>

      {/* DOCUMENTS — primary zone, takes ~70% of the surface */}
      <DocumentsPanel
        title="Documents in flight"
        subtitle="Tap any row to open in the editor · sparkle to ask AnA to draft the next section"
        docs={ENG_DOCUMENTS}
        frameworks={ENG_DOC_FRAMEWORKS}
        onOpenEditor={onOpenEditor}
        onAskAna={onAskAna}
      />

      {/* Blockers across DHF / risks / ECRs / NCs — consolidated */}
      <section className="section">
        <div className="section-head">
          <h2>What's blocking your documents</h2>
          <span className="section-sub">
            {blockers.filter(b => b.severity === 'err').length} hard blockers ·{' '}
            {blockers.filter(b => b.severity === 'warn').length} review-pending · pulled from DHF · risk · ECR · non-conformance
          </span>
        </div>
        <div className="eng-blockers-feed">
          {blockers.slice(0, 8).map((b, i) => (
            <button
              key={i}
              className="eng-blocker-row"
              data-sev={b.severity}
              data-kind={b.kind}
              onClick={() => onAskAna(`${b.ref} — ${b.title}. Walk me through the next step to clear it and which document this unblocks.`)}
            >
              <span className={`eng-blocker-dot tone-${b.severity}`} />
              <span className="eng-blocker-kind mono tiny">{b.kind}</span>
              <span className="mono small eng-blocker-ref">{b.ref}</span>
              <span className="eng-blocker-title">{b.title}</span>
              <span className="eng-blocker-note">{b.note}</span>
              <span className="eng-blocker-owner">{b.owner}</span>
              <span className="eng-blocker-age">{b.age}</span>
            </button>
          ))}
          {blockers.length > 8 && (
            <button className="eng-blocker-more" onClick={() => setAwarenessOpen(true)}>
              Show {blockers.length - 8} more · open situational awareness {I.arrowRight}
            </button>
          )}
        </div>
      </section>

      {/* Situational awareness — collapsed accordion */}
      <section className="section eng-awareness" data-open={awarenessOpen}>
        <button
          className="eng-awareness-head"
          onClick={() => setAwarenessOpen(o => !o)}
          aria-expanded={awarenessOpen}
        >
          <span className="eng-awareness-chev">{awarenessOpen ? I.down : I.right}</span>
          <h2>Situational awareness</h2>
          <span className="section-sub">
            DHF strip · ISO 14971 heatmap · design-controls trace · ECRs · non-conformances
          </span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            {/* DHF strip */}
            <div className="eng-dhf-strip">
              {ENG_DHF.map(d => (
                <div
                  key={d.id}
                  className="eng-dhf-cell"
                  data-status={d.status}
                  title={d.label}
                >
                  <div className="eng-dhf-num mono">§{d.num}</div>
                  <div className="eng-dhf-label">{d.label}</div>
                  <div className="eng-dhf-meta">
                    <span className="mono">{d.ver}</span>
                    <span className="dot-sep">·</span>
                    <span>{d.updated}</span>
                  </div>
                  <span className={`status-pill ${d.status}`}>{d.status}</span>
                </div>
              ))}
            </div>

            <div className="eng-grid eng-grid-awareness">
              {/* Risk heatmap */}
              <section>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <h2 style={{ fontSize: 14 }}>Residual risk · ISO 14971</h2>
                  <span className="section-sub">
                    {cellFilter ? <>Filtered {cellFilter} · <button className="chip-filter" onClick={() => setCellFilter(null)}>Clear {I.close}</button></> : 'Click a cell to filter'}
                  </span>
                </div>
                <div className="eng-heat">
                  <div className="eng-heat-corner" />
                  {ENG_RISK_PROB.map(p => (
                    <div key={p.id} className="eng-heat-col-lbl">
                      <span className="mono tiny">{p.id}</span>
                      <span>{p.label}</span>
                    </div>
                  ))}
                  {[...ENG_RISK_SEVERITY].reverse().map(s => (
                    <React.Fragment key={s.id}>
                      <div className="eng-heat-row-lbl">
                        <span className="mono tiny">{s.id}</span>
                        <span>{s.label}</span>
                      </div>
                      {ENG_RISK_PROB.map(p => {
                        const key = `${s.id}${p.id}`;
                        const verdict = ENG_RISK_ACCEPT[key];
                        const count = cellCounts[key] || 0;
                        const isFiltered = cellFilter === key;
                        return (
                          <button
                            key={key}
                            className={`eng-heat-cell tone-${verdict}${isFiltered ? ' on' : ''}${count === 0 ? ' empty' : ''}`}
                            onClick={() => count > 0 && setCellFilter(isFiltered ? null : key)}
                          >
                            <span className="eng-heat-n">{count || ''}</span>
                          </button>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </section>

              {/* Risk records (filtered) */}
              <section>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <h2 style={{ fontSize: 14 }}>Risk records</h2>
                  <span className="section-sub">{visibleRisks.length} of {ENG_RISKS.length} shown</span>
                </div>
                <div className="eng-risks">
                  {visibleRisks.slice(0, 4).map(r => (
                    <button
                      key={r.id}
                      className="eng-risk-row"
                      data-state={r.state}
                      onClick={() => onAskAna(`Open risk ${r.id} (${r.hazard}).`)}
                    >
                      <div className="eng-risk-head">
                        <span className="mono eng-risk-id">{r.id}</span>
                        <span className="eng-risk-hazard">{r.hazard}</span>
                        <span className="mono tiny eng-risk-resid">{r.residual}</span>
                      </div>
                      <div className="eng-risk-harm">{r.harm}</div>
                    </button>
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

window.EngineeringSurface = EngineeringSurface;

})();
