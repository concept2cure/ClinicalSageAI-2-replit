/**
 * CDx co-development surface — Phase 6 · doc-first with novel paired timeline.
 *
 * Companion diagnostic = the test that decides which patients get the
 * paired drug. The drug's NDA/BLA and the device's PMA/510(k) move in
 * lockstep through FDA AND EMA, with shared milestones and required
 * label alignment.
 *
 * The novel piece: the paired timeline. Two parallel tracks (drug · device)
 * with linked milestones — when one moves the other must move too.
 */

(() => {

const { I, DocumentsPanel } = window;
const { CDX_KPIS, CDX_TIMELINE, CDX_CONCORDANCE, CDX_XREF, CDX_DOCUMENTS, CDX_DOC_FRAMEWORKS } = window;

function CdxSurface({ program, onAskAna, onOpenEditor }) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);
  const programContext = program ? `${program.code} ${program.title.split(' ').slice(0,1).join(' ')} \u2194 KEYTRUDA-9` : 'IV-415 \u2194 KEYTRUDA-9';

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Diagnostics · {programContext}</div>
          <h1 className="page-title">Companion diagnostic co-development</h1>
          <div className="page-sub">
            Paired drug-device development. {CDX_DOCUMENTS.length} regulatory artifacts.
            FDA + EMA paired filings · concordance with original clinical-trial assay · drug-label alignment.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Verify drug label and IVD IFU are aligned across every flagged section. Surface mismatches and propose IFU edits.')}>
            {I.scale} Verify alignment
          </button>
          <button className="btn primary small" onClick={() => onOpenEditor && onOpenEditor('doc-cdx-label-align')}>
            {I.pencil} Open label alignment
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {CDX_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val" style={{ fontSize: typeof k.metric === 'string' && k.metric.length > 8 ? 16 : 22 }}>{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      {/* Paired drug-device timeline — the centerpiece */}
      <section className="section">
        <div className="section-head">
          <h2>Paired drug-device timeline</h2>
          <span className="section-sub">KEYTRUDA-9 NDA + IV-415 PMA · synchronized milestones · FDA + EMA</span>
        </div>
        <div className="cdx-timeline">
          <div className="cdx-timeline-tracks">
            <div className="cdx-track-label">Drug (NDA)</div>
            <div className="cdx-track-label">Joint</div>
            <div className="cdx-track-label">Device (PMA)</div>
          </div>
          {CDX_TIMELINE.map((m, i) => {
            const onDrug = m.drugDate !== '—';
            const onDevice = m.deviceDate !== '—';
            const joint = onDrug && onDevice && m.drugDate === m.deviceDate;
            return (
              <button
                key={i}
                className="cdx-ms"
                data-state={m.state}
                data-joint={joint}
                onClick={() => onAskAna(`Open paired milestone "${m.ms}" — show me the gate criteria, who owns each side, and the consequence if either side slips.`)}
              >
                <div className="cdx-ms-grid">
                  <div className="cdx-track-cell cdx-cell-drug">
                    {onDrug && (
                      <>
                        <span className="cdx-ms-dot cdx-dot-drug" />
                        <span className="cdx-ms-date mono small">{m.drugDate}</span>
                      </>
                    )}
                  </div>
                  <div className="cdx-track-cell cdx-cell-joint">
                    {joint && <span className="cdx-ms-line" />}
                  </div>
                  <div className="cdx-track-cell cdx-cell-device">
                    {onDevice && (
                      <>
                        <span className="cdx-ms-dot cdx-dot-device" />
                        <span className="cdx-ms-date mono small">{m.deviceDate}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="cdx-ms-label">
                  <span className={`status-pill ${m.state === 'complete' ? 'complete' : m.state === 'in-progress' ? 'active' : m.state === 'scheduled' ? 'review' : 'idle'}`}>{m.state}</span>
                  <span className="cdx-ms-title">{m.ms}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <DocumentsPanel
        title="CDx regulatory artifacts"
        subtitle="Joint plan · concordance · cross-reference · drug-label alignment · paired CHMP filing"
        docs={CDX_DOCUMENTS}
        frameworks={CDX_DOC_FRAMEWORKS}
        onOpenEditor={onOpenEditor}
        onAskAna={onAskAna}
      />

      {/* Awareness — concordance + xref tables */}
      <section className="section eng-awareness" data-open={awarenessOpen}>
        <button className="eng-awareness-head" onClick={() => setAwarenessOpen(o => !o)} aria-expanded={awarenessOpen}>
          <span className="eng-awareness-chev">{awarenessOpen ? I.down : I.right}</span>
          <h2>Concordance + cross-reference</h2>
          <span className="section-sub">CDx vs CTA biomarker-positive concordance · NDA ↔ PMA document cross-reference matrix</span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>Concordance · CDx vs original clinical-trial assay</h2>
              </div>
              <div className="ctable">
                <div className="ctable-head" style={{ gridTemplateColumns: '1.4fr 70px 70px 70px 70px 70px' }}>
                  <div>Population</div><div>CDx+</div><div>CTA+</div><div>PPA %</div><div>NPA %</div><div>OPA %</div>
                </div>
                {CDX_CONCORDANCE.map((c, i) => (
                  <div key={i} className="ctable-row" style={{ gridTemplateColumns: '1.4fr 70px 70px 70px 70px 70px' }}>
                    <div className="ctable-strong">{c.population}</div>
                    <div className="mono small">{c.cdxPos}</div>
                    <div className="mono small">{c.ctaPos}</div>
                    <div className="mono small" style={{ color: c.ppa >= 95 ? 'var(--success)' : 'var(--warning)' }}>{c.ppa}</div>
                    <div className="mono small" style={{ color: c.npa >= 95 ? 'var(--success)' : 'var(--warning)' }}>{c.npa}</div>
                    <div className="mono small" style={{ color: c.opa >= 95 ? 'var(--success)' : 'var(--warning)' }}>{c.opa}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>NDA ↔ PMA cross-reference matrix</h2>
              </div>
              <div className="ctable">
                <div className="ctable-head" style={{ gridTemplateColumns: '1.4fr 1.4fr 100px 80px 80px' }}>
                  <div>Drug document</div><div>Device document</div><div>Alignment</div><div>Sync</div><div>Issues</div>
                </div>
                {CDX_XREF.map((x, i) => (
                  <button key={i} className="ctable-row" style={{ gridTemplateColumns: '1.4fr 1.4fr 100px 80px 80px' }}
                    onClick={() => onAskAna(`Reconcile ${x.drug} with ${x.device}. Surface every claim that differs and propose resolution.`)}>
                    <div className="ctable-strong">{x.drug}</div>
                    <div>{x.device}</div>
                    <div><span className={`status-pill ${x.alignment === 'aligned' ? 'complete' : x.alignment === 'review' ? 'review' : 'draft'}`}>{x.alignment}</span></div>
                    <div className="mono small" style={{ color: 'var(--text-400)' }}>{x.lastSync}</div>
                    <div>{x.issues > 0 ? <span className="pill-err small">{x.issues}</span> : <span style={{ color: 'var(--success)' }}>—</span>}</div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>
    </>
  );
}

window.CdxSurface = CdxSurface;

})();
