/**
 * UDI and labeling surface — DOCUMENT-FIRST.
 *
 * The whole point of this surface is producing labels (IFU, package,
 * on-device, patient labeling) and the submission files that register
 * them with FDA GUDID and EU EUDAMED. The previous dashboard view
 * (device registry, region×lang matrix, symbol glossary) is demoted to
 * a "Situational awareness" accordion — useful for orientation, but the
 * primary job is authoring + signing the labels.
 *
 * Layout:
 *   • Page header — primary CTA "Open BX-204 IFU"
 *   • Compact 4-card metrics (about documents)
 *   • Documents in flight — primary, large (label artifacts + GUDID +
 *     EUDAMED + UDI Master Record)
 *   • "Blocking label release" — consolidated from UDI_ISSUES
 *   • Situational awareness accordion — device registry, labeling
 *     matrix, ISO 15223-1 symbol glossary, MRI matrix
 */

(() => {

const { I, DocumentsPanel } = window;
const {
  UDI_DEVICES, UDI_LABELS, UDI_SYMBOLS, UDI_ISSUES, UDI_MRI,
  UDI_DOCUMENTS, UDI_DOC_FRAMEWORKS,
} = window;

function UdiSurface({ onAskAna, onOpenEditor }) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);

  /* Consolidated blockers — pulls from UDI_ISSUES + label artifacts marked
     blocker. */
  const blockers = React.useMemo(() => {
    const list = [];
    for (const issue of UDI_ISSUES) {
      list.push({
        kind: issue.kind,
        severity: issue.severity,
        ref: issue.id,
        title: issue.msg,
        note: issue.label,
        owner: '—',
        age: issue.since,
      });
    }
    for (const d of UDI_DOCUMENTS) {
      if (d.blocker) {
        list.push({
          kind: 'doc',
          severity: 'err',
          ref: d.id,
          title: d.title,
          note: d.blockerNote || '—',
          owner: d.owner,
          age: d.lastEdit,
        });
      }
    }
    const sevOrder = { err: 0, warn: 1, low: 2 };
    return list.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
  }, []);

  const labelDocs = UDI_DOCUMENTS.filter(d => d.editor === 'label');
  const submissionDocs = UDI_DOCUMENTS.filter(d => d.editor === 'data-submission');

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workstream</div>
          <h1 className="page-title">UDI and labeling</h1>
          <div className="page-sub">
            {UDI_DOCUMENTS.length} label and submission artifacts to deliver.
            21 CFR 801 · ISO 15223-1 · EU MDR Annex I · ASTM F2503.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() => onOpenEditor && onOpenEditor('doc-master-bx204')}
          >
            {I.eye} Open UDI Master Record
          </button>
          <button
            className="btn primary small"
            onClick={() => onOpenEditor && onOpenEditor('doc-ifu-bx204-en')}
          >
            {I.pencil} Open BX-204 IFU
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        <div className="metric-card">
          <div className="metric-label">Documents in flight</div>
          <div className="metric-val">{UDI_DOCUMENTS.length}</div>
          <div className="metric-meta">{labelDocs.length} labels · {submissionDocs.length} submissions</div>
        </div>
        <div className="metric-card" data-tone={UDI_DOCUMENTS.filter(d => d.blocker).length > 0 ? 'err' : 'ok'}>
          <div className="metric-label">Blocked documents</div>
          <div className="metric-val">{UDI_DOCUMENTS.filter(d => d.blocker).length}</div>
          <div className="metric-meta">{UDI_DOCUMENTS.filter(d => d.blocker).map(d => d.title.split(' — ')[0].split(' ').slice(-1)[0]).slice(0, 3).join(' · ') || '—'}</div>
        </div>
        <div className="metric-card" data-tone="warn">
          <div className="metric-label">Awaiting signature</div>
          <div className="metric-val">{UDI_DOCUMENTS.filter(d => d.esigState === 'pending').length}</div>
          <div className="metric-meta">Pending Part 11 e-signature</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg completion</div>
          <div className="metric-val">
            {Math.round(UDI_DOCUMENTS.reduce((s, d) => s + d.completion, 0) / UDI_DOCUMENTS.length)}
            <span className="unit">%</span>
          </div>
          <div className="metric-meta">Across all label and submission artifacts</div>
        </div>
      </div>

      {/* DOCUMENTS — primary zone */}
      <DocumentsPanel
        title="Documents in flight"
        subtitle="Tap any row to open in the label editor · sparkle to draft a translation or symbol revision with AnA"
        docs={UDI_DOCUMENTS}
        frameworks={UDI_DOC_FRAMEWORKS}
        onOpenEditor={onOpenEditor}
        onAskAna={onAskAna}
      />

      {/* Blockers consolidated */}
      <section className="section">
        <div className="section-head">
          <h2>Blocking label release</h2>
          <span className="section-sub">
            {blockers.filter(b => b.severity === 'err').length} hard blockers ·{' '}
            {blockers.filter(b => b.severity === 'warn').length} review pending · ISO symbols · translations · UDI checksums · risk-class confirmation
          </span>
        </div>
        <div className="eng-blockers-feed">
          {blockers.slice(0, 8).map((b, i) => (
            <button
              key={i}
              className="eng-blocker-row"
              data-sev={b.severity}
              data-kind={b.kind}
              onClick={() => onAskAna(`${b.ref} — ${b.title}. Walk me through the fix and which label this unblocks.`)}
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
          <span className="section-sub">Device registry · region×language matrix · ISO 15223-1 symbols · MRI matrix</span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            {/* Device registry */}
            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>Device registry · UDI-DI</h2>
              </div>
              <div className="ctable">
                <div className="ctable-head" style={{ gridTemplateColumns: '1.4fr 100px 1fr 100px 1fr 100px 80px' }}>
                  <div>Device</div><div>Class</div><div>FDA UDI-DI</div><div>GUDID</div>
                  <div>EU UDI-DI</div><div>EUDAMED</div><div>MRI</div>
                </div>
                {UDI_DEVICES.map(d => (
                  <div key={d.id} className="ctable-row" style={{ gridTemplateColumns: '1.4fr 100px 1fr 100px 1fr 100px 80px' }}>
                    <div>
                      <div className="ctable-strong">{d.code}</div>
                      <div style={{ color: 'var(--text-400)', fontSize: 12 }}>{d.name}</div>
                    </div>
                    <div>{d.class}</div>
                    <div className="mono small-mono">{d.fda.di}</div>
                    <div><span className={`udi-status-pill ${d.fda.status}`}>{d.fda.status}</span></div>
                    <div className="mono small-mono">{d.eu.di}</div>
                    <div><span className={`udi-status-pill ${d.eu.status}`}>{d.eu.status}</span></div>
                    <div><span className={`udi-mri udi-mri-${d.mri}`}>{d.mri}</span></div>
                  </div>
                ))}
              </div>
            </section>

            {/* Symbol glossary (compact) */}
            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>ISO 15223-1 symbols</h2>
                <span className="section-sub">{UDI_SYMBOLS.filter(s => s.present).length} of {UDI_SYMBOLS.length} present on active labels</span>
              </div>
              <div className="udi-symbols">
                {UDI_SYMBOLS.map(s => (
                  <div key={s.iso} className="udi-symbol" data-on={s.present}>
                    <div className="udi-symbol-head">
                      <span className="mono tiny">{s.iso}</span>
                      {s.present
                        ? <span className="udi-symbol-ok">{I.check}</span>
                        : <span className="udi-symbol-warn">{I.alertCircle}</span>}
                    </div>
                    <div className="udi-symbol-name">{s.name}</div>
                    <div className="udi-symbol-req">Required: {s.required}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* MRI matrix (compact) */}
            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>MRI conditional matrix</h2>
              </div>
              <div className="ctable">
                <div className="ctable-head" style={{ gridTemplateColumns: '90px 100px 100px 100px 110px 1fr' }}>
                  <div>Device</div><div>Mode</div><div>Field</div><div>SAR</div><div>Gradient</div><div>Notes</div>
                </div>
                {UDI_MRI.map(m => (
                  <div key={m.device} className="ctable-row" style={{ gridTemplateColumns: '90px 100px 100px 100px 110px 1fr' }}>
                    <div className="ctable-strong">{m.device}</div>
                    <div><span className={`udi-mri udi-mri-${m.mode}`}>{m.mode}</span></div>
                    <div className="mono small-mono">{m.field}</div>
                    <div className="mono small-mono">{m.sar}</div>
                    <div className="mono small-mono">{m.gradient}</div>
                    <div style={{ color: 'var(--text-300)', fontSize: 12 }}>{m.notes}</div>
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

window.UdiSurface = UdiSurface;

})();
