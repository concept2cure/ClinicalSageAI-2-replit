(() => {
/* CMC · Module 3 — surface (AnA-first → data entry → build-state dashboards). */
const { useState, useRef } = React;

const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{typeof d === 'string' ? <path d={d}/> : d}</svg>
);
const I = {
  beaker:  <Icon d={<><path d="M4.5 3h15"/><path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3"/><path d="M6 14h12"/></>}/>,
  arrowRight:<Icon d={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>}/>,
  down:    <Icon d={<><polyline points="6 9 12 15 18 9"/></>}/>,
  right:   <Icon d={<><polyline points="9 6 15 12 9 18"/></>}/>,
  attach:  <Icon d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>,
  sparkles:<Icon d={<><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></>}/>,
  warn:    <Icon d={<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}/>,
  search:  <Icon d={<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>}/>,
  bell:    <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}/>,
};

const ichTone = (s) => s === 'pass' ? 'ok' : s === 'fail' ? 'err' : s === 'warning' ? 'warn' : 'muted';
const secStatus = { review: 'review', drafted: 'drafted', todo: 'todo' };

function Surface({ onAskAna }) {
  const [composer, setComposer] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [openS, setOpenS] = useState(false);
  const fileRef = useRef(null);
  const { CMC_RPI, CMC_SECTIONS, CMC_CQA, CMC_CPP, CMC_ICH, CMC_INSIGHTS, CMC_CHANGES, CMC_SUGGESTIONS } = window;
  const send = (t) => { if (t && t.trim()) onAskAna(t.trim()); setComposer(''); };

  return (
    <div className="bp-surface bp-overview-start">
      <div className="bp-od-greet">
        <div className="bp-kicker" style={{ marginBottom: 8 }}>CMC · Module 3 operating system</div>
        <h1>BX-301 · Module 3</h1>
        <p className="bp-od-state">
          <b>RPI {CMC_RPI.score}</b> ({CMC_RPI.trend} this cycle) · <b>{CMC_RPI.irOverdue} IR overdue</b> · M3 missing {CMC_RPI.m3Missing} sections · stability {CMC_RPI.stabilityCov}. Two ICH gaps and one method-validation lag are blocking sign-off.
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="bp-btn-tert">{I.beaker} Generate control strategy</button>
          <button className="bp-btn-primary">{I.sparkles} Run ICH check with AnA</button>
        </div>
      </div>

      <div className={`bp-od-composer ${dragOver ? 'bp-od-composer-drag' : ''}`}
           onDragEnter={(e)=>{e.preventDefault();setDragOver(true);}} onDragOver={(e)=>{e.preventDefault();setDragOver(true);}}
           onDragLeave={()=>setDragOver(false)}
           onDrop={(e)=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer&&e.dataTransfer.files;if(f&&f.length)onAskAna(`File these to BX-301 Module 3 and re-derive CQAs/CPPs from them: ${Array.from(f).map(x=>x.name).join(', ')}`);}}>
        <textarea rows={1} placeholder="Drop a batch record, spec, method validation or stability pull — ask AnA about Module 3…"
                  value={composer} onChange={(e)=>setComposer(e.target.value)}
                  onKeyDown={(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(composer);}}}/>
        <div className="bp-od-composer-row">
          <input ref={fileRef} type="file" hidden multiple onChange={(e)=>{const f=e.target.files;if(f&&f.length)onAskAna(`File to BX-301 Module 3 and re-derive quality data: ${Array.from(f).map(x=>x.name).join(', ')}`);e.target.value='';}}/>
          <button className="bp-od-chip" onClick={()=>fileRef.current&&fileRef.current.click()}>{I.attach} Drop quality data</button>
          <button className="bp-od-chip">{I.sparkles} Skills</button>
          <button className="bp-od-chip" style={{marginLeft:'auto'}}>AnA 1.0 {I.down}</button>
          <button className="bp-od-send" disabled={!composer.trim()} onClick={()=>send(composer)}>{I.arrowRight}</button>
        </div>
        {dragOver && <div className="bp-od-drop-hint">Drop to file to Module 3 — QbD re-derives CQAs, CPPs, and specs.</div>}
      </div>

      <div className="bp-od-starters">
        {CMC_SUGGESTIONS.map((s,i)=>(<button key={i} className="bp-od-starter" onClick={()=>onAskAna(s)}><span className="bp-od-starter-ico">{I.sparkles}</span><span>{s}</span></button>))}
      </div>

      <section className="bp-od-section">
        <header className="bp-od-section-head"><h2>Today · needs attention here</h2><span className="bp-od-section-meta">{CMC_INSIGHTS.length} insights</span></header>
        <div className="bp-od-queue">
          {CMC_INSIGHTS.map((q,i)=>(
            <button key={i} className={`bp-od-q-item bp-od-q-${q.tone}`} onClick={()=>onAskAna(q.cmd)}>
              <span className="bp-od-q-ico">{I[q.ico]||I.beaker}</span>
              <div className="bp-od-q-body"><div className="bp-od-q-title">{q.title}</div><div className="bp-od-q-sub">{q.sub}</div></div>
              <span className="bp-od-q-action">Resolve <span style={{display:'inline-flex'}}>{I.arrowRight}</span></span>
            </button>
          ))}
        </div>
      </section>

      {/* §3.2 build state — primary working surface */}
      <section className="bp-od-section">
        <header className="bp-od-section-head"><h2>Module 3 build state</h2><span className="bp-od-section-meta">§3.2.S drug substance · §3.2.P drug product</span></header>
        <div className="cmc-sections">
          {CMC_SECTIONS.map(s=>(
            <button key={s.key} className="cmc-sec" onClick={()=>onAskAna(`Open Module 3 §3.2.${s.key.toUpperCase()} (${s.label}) in authoring`)}>
              <div className="cmc-sec-top"><span className="cmc-sec-key">§3.2.{s.key.toUpperCase()}</span><span className={`cmc-scope cmc-scope-${s.scope.toLowerCase()}`}>{s.scope}</span></div>
              <div className="cmc-sec-label">{s.label}</div>
              <div className="cmc-sec-bar"><div className={`cmc-sec-fill cmc-fill-${s.status}`} style={{width:s.conv+'%'}}/></div>
              <div className="cmc-sec-foot"><span className={`cmc-sec-status cmc-st-${s.status}`}>{s.status==='review'?'In review':s.status==='drafted'?'Drafted':'Not started'}</span><span className="cmc-sec-conv">{s.conv}%</span></div>
            </button>
          ))}
        </div>
      </section>

      {/* QbD + ICH + change sim — collapsible reference */}
      <section className="bp-od-section">
        <button className="bp-od-section-head bp-od-toggle" onClick={()=>setOpenS(o=>!o)}>
          <span className="bp-od-chev" data-open={openS||undefined}>{I.right}</span>
          <h2>QbD, ICH compliance and change control</h2>
          <span className="bp-od-section-meta">{openS?'collapse':'expand to scan'}</span>
        </button>
        {openS && (
          <div style={{marginTop:14}}>
            <div className="cmc-ich">
              {CMC_ICH.map(g=>(<span key={g.g} className={`cmc-ich-chip cmc-ich-${ichTone(g.status)}`}>{g.g}</span>))}
            </div>
            <div className="bp-split-1-1" style={{marginTop:14}}>
              <div className="bp-card">
                <div className="bp-card-head"><h3>Critical Quality Attributes</h3><span className="bp-card-meta">{CMC_CQA.length} CQAs</span></div>
                <div className="cmc-table">
                  <div className="cmc-tr cmc-tr-head"><span>Attribute</span><span>Material</span><span>Method</span><span>Accept</span></div>
                  {CMC_CQA.map((c,i)=>(<div key={i} className="cmc-tr"><span className="cmc-cqa">{c.name}</span><span className="cmc-mut">{c.material}</span><span className={c.linked?'':'cmc-gap'}>{c.method||'No method · Q2 gap'}</span><span className="cmc-mono">{c.accept}</span></div>))}
                </div>
              </div>
              <div className="bp-card">
                <div className="bp-card-head"><h3>Critical Process Parameters</h3><span className="bp-card-meta">{CMC_CPP.length} CPPs</span></div>
                <div className="cmc-table">
                  <div className="cmc-tr cmc-tr-head cmc-tr-cpp"><span>Parameter</span><span>Step</span><span>Range</span></div>
                  {CMC_CPP.map((c,i)=>(<div key={i} className="cmc-tr cmc-tr-cpp"><span className="cmc-cqa">{c.name}</span><span className="cmc-mut">{c.step}</span><span className={c.range?'cmc-mono':'cmc-gap'}>{c.range||'No range · DoE needed'}</span></div>))}
                </div>
              </div>
            </div>
            <div className="bp-card" style={{marginTop:14}}>
              <div className="bp-card-head"><h3>Change impact simulator · SUPAC</h3><span className="bp-card-meta">{CMC_CHANGES.length} modeled</span></div>
              <div className="cmc-table">
                <div className="cmc-tr cmc-tr-chg cmc-tr-head"><span>Change</span><span>SUPAC</span><span>Markets</span><span>Filing path</span></div>
                {CMC_CHANGES.map((c,i)=>(<div key={i} className="cmc-tr cmc-tr-chg"><span className="cmc-cqa">{c.type}</span><span className={`cmc-supac cmc-supac-${c.risk}`}>{c.supac}</span><span className="cmc-mut">{c.markets}</span><span>{c.filing}</span></div>))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function App() {
  const askAna = (q) => { console.log('[AnA · cmc]', q); };
  return (
    <div className="sg-railed">
      <window.PlatformRail active="cmc"/>
      <div className="sg-rail-main">
        <div className="sg-shell" data-screen-label="CMC Module 3">
          <header className="sg-topbar">
            <div className="sg-crumbs"><a href="../home/index.html">Concept2Cure.RI</a><span className="sep">›</span><span>BX-301</span><span className="sep">›</span><span className="here">CMC · Module 3</span></div>
            <div className="sg-spacer"/>
            <button className="sg-tb-search"><span className="ico">{I.search}</span><span className="lbl">Ask AnA, jump to…</span><span className="kbd">⌘K</span></button>
            <button className="sg-tb-btn" title="Notifications">{I.bell}</button>
          </header>
          <div className="sg-page"><div className="sg-page-inner"><Surface onAskAna={askAna}/></div></div>
        </div>
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
})();
