(() => {
/* ISO 14971 Risk Management — Icons + surface (matrix + items + controls). */
const { useState, useRef } = React;

const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{typeof d === 'string' ? <path d={d}/> : d}</svg>
);
const I = {
  shield:  <Icon d={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>}/>,
  arrowRight:<Icon d={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>}/>,
  down:    <Icon d={<><polyline points="6 9 12 15 18 9"/></>}/>,
  right:   <Icon d={<><polyline points="9 6 15 12 9 18"/></>}/>,
  attach:  <Icon d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>,
  sparkles:<Icon d={<><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></>}/>,
  check:   <Icon d={<><polyline points="20 6 9 17 4 12"/></>}/>,
  warn:    <Icon d={<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}/>,
  search:  <Icon d={<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>}/>,
  bell:    <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}/>,
  plus:    <Icon d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}/>,
};

const BAND_LABEL = { unacceptable: 'Unacceptable', alarp: 'ALARP', acceptable: 'Acceptable' };

/* 5×5 severity (rows, high→low) × probability (cols, low→high) heatmap.
   Cells show count of risks (post-control) landing in that square. */
function RiskMatrix({ items, mode, onCell }) {
  const sevKey = mode === 'pre' ? 'preS' : 'postS';
  const probKey = mode === 'pre' ? 'preP' : 'postP';
  const sevs = [5,4,3,2,1];
  const probs = [1,2,3,4,5];
  const countAt = (s, p) => items.filter(it => it[sevKey] === s && it[probKey] === p);
  return (
    <div className="rm-matrix">
      <div className="rm-matrix-grid">
        <div className="rm-axis-corner"/>
        {probs.map(p => <div key={'h'+p} className="rm-axis-col">{window.RM_PROBABILITY.find(x=>x.id===p).label}</div>)}
        {sevs.map(s => (
          <React.Fragment key={'r'+s}>
            <div className="rm-axis-row">{window.RM_SEVERITY.find(x=>x.id===s).label}</div>
            {probs.map(p => {
              const band = window.rmBand(s, p);
              const cell = countAt(s, p);
              return (
                <button key={s+'-'+p} className={`rm-cell rm-cell-${band}`} onClick={() => cell.length && onCell(cell)} disabled={!cell.length}>
                  {cell.length > 0 && <span className="rm-cell-count">{cell.length}</span>}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="rm-matrix-axislabels">
        <span className="rm-axis-y">Severity →</span>
        <span className="rm-axis-x">Probability →</span>
      </div>
    </div>
  );
}

function BandPill({ band }) {
  return <span className={`rm-band rm-band-${band}`}>{BAND_LABEL[band]}</span>;
}

function Surface({ onAskAna }) {
  const [composerValue, setComposerValue] = useState('');
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [matrixMode, setMatrixMode] = useState('post');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const items = window.RM_ITEMS;
  const controls = window.RM_CONTROLS;

  const postUnacceptable = items.filter(it => window.rmBand(it.postS, it.postP) === 'unacceptable').length;
  const postAlarp = items.filter(it => window.rmBand(it.postS, it.postP) === 'alarp').length;
  const pendingControls = controls.filter(c => !c.verified).length;
  const openItems = items.filter(it => it.status === 'open').length;

  const send = (t) => { if (t && t.trim()) onAskAna(t.trim()); setComposerValue(''); };
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) onAskAna(`File these risk-analysis documents and extract hazards: ${Array.from(f).map(x=>x.name).join(', ')}`); };

  const queue = [
    { ico: 'warn',   title: 'RK-003 algorithm false-negative — still ALARP', sub: 'Sev 5 × Prob 2 · dual-algorithm control unverified', tone: 'err',  action: 'Open control',  cmd: 'Open RK-003 and show what the dual-algorithm consensus control needs to verify (V&V VT-211)' },
    { ico: 'warn',   title: 'RK-007 data transmission loss — open',          sub: 'Sev 3 × Prob 3 · only 1 control, not verified', tone: 'warn', action: 'Add control',   cmd: 'Propose additional risk controls for RK-007 silent sync failure to bring it below ALARP' },
    { ico: 'shield', title: pendingControls + ' controls pending verification', sub: 'Block the risk file sign-off until verified', tone: 'warn', action: 'Review',        cmd: 'List every risk control still pending verification with its evidence reference and owner' },
    { ico: 'check',  title: 'Risk-benefit conclusion ready to draft',        sub: 'All but 2 risks controlled — feeds the CER', tone: 'info', action: 'Draft',         cmd: 'Draft the ISO 14971 risk-benefit conclusion for the BX-D2 CER from the current risk file' },
  ];

  return (
    <div className="bp-surface bp-overview-start">
      <div className="bp-od-greet">
        <div className="bp-kicker" style={{ marginBottom: 8 }}>Risk Management · ISO 14971:2019</div>
        <h1>Risk management file · BX-D2</h1>
        <p className="bp-od-state">
          {items.length} hazards analyzed. <b>{postUnacceptable} unacceptable</b>, <b>{postAlarp} ALARP</b> after controls.
          {pendingControls > 0 && <> {pendingControls} controls still pending verification — the risk file can't be signed off until they clear.</>}
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="bp-btn-tert">{I.plus} Add hazard</button>
          <button className="bp-btn-primary">{I.sparkles} Draft risk-benefit with AnA</button>
        </div>
      </div>

      <div className={`bp-od-composer ${dragOver ? 'bp-od-composer-drag' : ''}`}
           onDragEnter={(e)=>{e.preventDefault();setDragOver(true);}} onDragOver={(e)=>{e.preventDefault();setDragOver(true);}}
           onDragLeave={()=>setDragOver(false)} onDrop={onDrop}>
        <textarea rows={1} placeholder="Drop a risk analysis, ask AnA about a hazard, or capture a new risk…"
                  value={composerValue} onChange={(e)=>setComposerValue(e.target.value)}
                  onKeyDown={(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(composerValue);}}}/>
        <div className="bp-od-composer-row">
          <input ref={fileRef} type="file" hidden multiple onChange={(e)=>{const f=e.target.files;if(f&&f.length)onAskAna(`File these risk documents: ${Array.from(f).map(x=>x.name).join(', ')}`);e.target.value='';}}/>
          <button className="bp-od-chip" onClick={()=>fileRef.current&&fileRef.current.click()}>{I.attach} Drop analysis</button>
          <button className="bp-od-chip">{I.sparkles} Skills</button>
          <button className="bp-od-chip" style={{marginLeft:'auto'}}>AnA 1.0 {I.down}</button>
          <button className="bp-od-send" disabled={!composerValue.trim()} onClick={()=>send(composerValue)}>{I.arrowRight}</button>
        </div>
        {dragOver && <div className="bp-od-drop-hint">Drop to extract hazards and map them to the risk file.</div>}
      </div>

      <div className="bp-od-starters">
        {window.RM_SUGGESTIONS.map((s,i)=>(
          <button key={i} className="bp-od-starter" onClick={()=>onAskAna(s)}><span className="bp-od-starter-ico">{I.sparkles}</span><span>{s}</span></button>
        ))}
      </div>

      <section className="bp-od-section">
        <header className="bp-od-section-head">
          <h2>Today · needs attention here</h2>
          <span className="bp-od-section-meta">{queue.length} items</span>
        </header>
        <div className="bp-od-queue">
          {queue.map((q,i)=>(
            <button key={i} className={`bp-od-q-item bp-od-q-${q.tone}`} onClick={()=>onAskAna(q.cmd)}>
              <span className="bp-od-q-ico">{I[q.ico]||I.shield}</span>
              <div className="bp-od-q-body"><div className="bp-od-q-title">{q.title}</div><div className="bp-od-q-sub">{q.sub}</div></div>
              <span className="bp-od-q-action">{q.action} <span style={{display:'inline-flex'}}>{I.arrowRight}</span></span>
            </button>
          ))}
        </div>
      </section>

      {/* Risk matrix — the hero artifact, always visible */}
      <section className="bp-od-section">
        <header className="bp-od-section-head">
          <h2>Risk matrix</h2>
          <span className="bp-od-section-meta">severity × probability · {items.length} hazards</span>
          <span style={{ flex: 1 }}/>
          <div className="rm-toggle">
            <button data-active={matrixMode==='pre'||undefined} onClick={()=>setMatrixMode('pre')}>Pre-control</button>
            <button data-active={matrixMode==='post'||undefined} onClick={()=>setMatrixMode('post')}>Post-control</button>
          </div>
        </header>
        <div className="rm-matrix-wrap">
          <RiskMatrix items={items} mode={matrixMode} onCell={(cell)=>onAskAna(`Show these ${cell.length} risk(s): ${cell.map(c=>c.id).join(', ')} and what controls apply`)}/>
          <div className="rm-legend">
            <div className="rm-legend-row"><span className="rm-band rm-band-acceptable">Acceptable</span><span>Score &lt; 8 · no further action</span></div>
            <div className="rm-legend-row"><span className="rm-band rm-band-alarp">ALARP</span><span>Score 8–14 · reduce as far as practicable</span></div>
            <div className="rm-legend-row"><span className="rm-band rm-band-unacceptable">Unacceptable</span><span>Score ≥ 15 · must add controls</span></div>
          </div>
        </div>
      </section>

      {/* Risk items + controls — collapsed reference */}
      <section className="bp-od-section">
        <button className="bp-od-section-head bp-od-toggle" onClick={()=>setDashboardOpen(o=>!o)}>
          <span className="bp-od-chev" data-open={dashboardOpen||undefined}>{I.right}</span>
          <h2>Risk items and controls</h2>
          <span className="bp-od-section-meta">{dashboardOpen?'collapse':'expand to scan'}</span>
        </button>
        {dashboardOpen && (
          <div style={{ marginTop: 14 }}>
            <div className="rm-table">
              <div className="rm-tr rm-tr-head">
                <span>ID</span><span>Hazard → harm</span><span>Pre</span><span>Post</span><span>Band</span><span>Owner</span><span>Controls</span>
              </div>
              {items.map(it => {
                const preBand = window.rmBand(it.preS, it.preP);
                const postBand = window.rmBand(it.postS, it.postP);
                return (
                  <button key={it.id} className="rm-tr" onClick={()=>onAskAna(`Open risk ${it.id} (${it.hazard}) — show controls, residual risk, and verification status`)}>
                    <span className="rm-id">{it.id}</span>
                    <span className="rm-haz"><div className="rm-haz-t">{it.hazard}</div><div className="rm-haz-s">{it.harm}</div></span>
                    <span className="rm-score"><span className={`rm-chip rm-chip-${preBand}`}>{it.preS}×{it.preP}</span></span>
                    <span className="rm-score"><span className={`rm-chip rm-chip-${postBand}`}>{it.postS}×{it.postP}</span></span>
                    <span><BandPill band={postBand}/></span>
                    <span className="rm-owner">{it.owner}</span>
                    <span className="rm-ctrl-count">{it.controls} {it.status==='open' && <span className="rm-open-dot" title="Open"/>}</span>
                  </button>
                );
              })}
            </div>

            <div className="rm-controls">
              <div className="rm-controls-head">Risk controls · ISO 14971 §7 hierarchy</div>
              {controls.map(c => (
                <div key={c.id} className="rm-control-row">
                  <span className={`rm-verify rm-verify-${c.verified?'ok':'pending'}`}>{c.verified ? I.check : I.warn}</span>
                  <div className="rm-control-body">
                    <div className="rm-control-desc">{c.desc}</div>
                    <div className="rm-control-meta">{c.item} · {c.type} · {c.evidence}</div>
                  </div>
                  <span className={`rm-verify-pill rm-verify-pill-${c.verified?'ok':'pending'}`}>{c.verified ? 'Verified' : 'Pending'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

window.RM_I = I;
window.RiskSurface = Surface;

})();
