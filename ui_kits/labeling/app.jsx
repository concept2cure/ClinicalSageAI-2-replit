(() => {
/* Labeling / IFU — surface (AnA-first → data → coverage dashboard) + shared rail. */
const { useState, useRef } = React;
const Icon = ({ d }) => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{typeof d==='string'?<path d={d}/>:d}</svg>);
const I = {
  tag:     <Icon d={<><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>}/>,
  arrowRight:<Icon d={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>}/>,
  down:    <Icon d={<><polyline points="6 9 12 15 18 9"/></>}/>,
  right:   <Icon d={<><polyline points="9 6 15 12 9 18"/></>}/>,
  attach:  <Icon d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>,
  sparkles:<Icon d={<><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></>}/>,
  globe:   <Icon d={<><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>}/>,
  warn:    <Icon d={<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}/>,
  search:  <Icon d={<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>}/>,
  bell:    <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}/>,
};
const tSt = (s)=> s==='approved'?'ok':s==='review'?'review':s==='pending'?'warn':'draft';

function Surface({ onAskAna }) {
  const [composer, setComposer] = useState(''); const [dragOver, setDragOver] = useState(false); const [open, setOpen] = useState(false);
  const fileRef = useRef(null);
  const { LB_DOC_KIND, LB_DOCS, LB_TRANSLATIONS, LB_SYMBOLS, LB_SUGGESTIONS } = window;
  const send = (t)=>{ if(t&&t.trim()) onAskAna(t.trim()); setComposer(''); };
  const ifu = LB_DOCS[0];
  const queue = [
    { ico:'globe', title:'5 IFU translations not approved — blocking EU launch', sub:'JA review · IT pending · ZH review · +2', tone:'err', cmd:'List every BX-D2 IFU translation not yet approved and what each needs' },
    { ico:'warn',  title:'Operator manual at v0.4 · 3 of 14 languages', sub:'No symbols verified yet', tone:'warn', cmd:'What is the fastest path to get the BX-D2 operator manual to review across 14 languages?' },
    { ico:'tag',   title:'MR-conditional symbol on patient label', sub:'ASTM F2503 · confirm against engineering MRI matrix', tone:'info', cmd:'Verify the MR-conditional statement on the patient label against the engineering MRI matrix' },
  ];
  return (
    <div className="bp-surface bp-overview-start">
      <div className="bp-od-greet">
        <div className="bp-kicker" style={{marginBottom:8}}>Labeling · IFU · ISO 15223-1</div>
        <h1>BX-D2 · Labeling</h1>
        <p className="bp-od-state"><b>{LB_DOCS.length} labeling documents</b> · IFU {ifu.langsApproved}/{ifu.langs} languages approved. 5 translations and the operator manual are blocking the EU launch.</p>
        <div style={{marginTop:12,display:'flex',gap:8}}>
          <button className="bp-btn-tert">{I.globe} Translation coverage</button>
          <button className="bp-btn-primary">{I.sparkles} Reconcile IFU with AnA</button>
        </div>
      </div>
      <div className={`bp-od-composer ${dragOver?'bp-od-composer-drag':''}`} onDragEnter={(e)=>{e.preventDefault();setDragOver(true);}} onDragOver={(e)=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={(e)=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer&&e.dataTransfer.files;if(f&&f.length)onAskAna(`File these labeling artifacts to BX-D2 and extract symbols + claims: ${Array.from(f).map(x=>x.name).join(', ')}`);}}>
        <textarea rows={1} placeholder="Drop an IFU, label artwork or translation — ask AnA about labeling…" value={composer} onChange={(e)=>setComposer(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(composer);}}}/>
        <div className="bp-od-composer-row">
          <input ref={fileRef} type="file" hidden multiple onChange={(e)=>{const f=e.target.files;if(f&&f.length)onAskAna(`File labeling artifacts to BX-D2: ${Array.from(f).map(x=>x.name).join(', ')}`);e.target.value='';}}/>
          <button className="bp-od-chip" onClick={()=>fileRef.current&&fileRef.current.click()}>{I.attach} Drop label / IFU</button>
          <button className="bp-od-chip">{I.sparkles} Skills</button>
          <button className="bp-od-chip" style={{marginLeft:'auto'}}>AnA 1.0 {I.down}</button>
          <button className="bp-od-send" disabled={!composer.trim()} onClick={()=>send(composer)}>{I.arrowRight}</button>
        </div>
        {dragOver && <div className="bp-od-drop-hint">Drop to extract symbols + claims and map to the labeling set.</div>}
      </div>
      <div className="bp-od-starters">{LB_SUGGESTIONS.map((s,i)=>(<button key={i} className="bp-od-starter" onClick={()=>onAskAna(s)}><span className="bp-od-starter-ico">{I.sparkles}</span><span>{s}</span></button>))}</div>
      <section className="bp-od-section">
        <header className="bp-od-section-head"><h2>Today · needs attention here</h2><span className="bp-od-section-meta">{queue.length} items</span></header>
        <div className="bp-od-queue">{queue.map((q,i)=>(<button key={i} className={`bp-od-q-item bp-od-q-${q.tone}`} onClick={()=>onAskAna(q.cmd)}><span className="bp-od-q-ico">{I[q.ico]||I.tag}</span><div className="bp-od-q-body"><div className="bp-od-q-title">{q.title}</div><div className="bp-od-q-sub">{q.sub}</div></div><span className="bp-od-q-action">Open <span style={{display:'inline-flex'}}>{I.arrowRight}</span></span></button>))}</div>
      </section>
      <section className="bp-od-section">
        <header className="bp-od-section-head"><h2>Labeling documents</h2><span className="bp-od-section-meta">{LB_DOCS.length} docs · per-language coverage</span></header>
        <div className="lb-docs">
          {LB_DOCS.map(d=>(
            <button key={d.id} className="lb-doc" onClick={()=>onAskAna(`Open the ${LB_DOC_KIND[d.kind]} (${d.title}) and show translation coverage`)}>
              <div className="lb-doc-top"><span className="lb-doc-kind">{LB_DOC_KIND[d.kind]}</span><span className={`lb-doc-st lb-doc-st-${d.status}`}>{d.status}</span></div>
              <div className="lb-doc-title">{d.title}</div>
              <div className="lb-doc-meta">{d.version} · {d.symbols} symbols · updated {d.updated}</div>
              <div className="lb-doc-cov"><div className="lb-doc-bar"><div className="lb-doc-fill" style={{width:Math.round(d.langsApproved/d.langs*100)+'%'}}/></div><span>{d.langsApproved}/{d.langs} langs</span></div>
            </button>
          ))}
        </div>
      </section>
      <section className="bp-od-section">
        <button className="bp-od-section-head bp-od-toggle" onClick={()=>setOpen(o=>!o)}><span className="bp-od-chev" data-open={open||undefined}>{I.right}</span><h2>IFU translations and symbols</h2><span className="bp-od-section-meta">{open?'collapse':'expand to scan'}</span></button>
        {open && (
          <div className="bp-split-1-1" style={{marginTop:14}}>
            <div className="bp-card">
              <div className="bp-card-head"><h3>Translation coverage</h3><span className="bp-card-meta">{LB_TRANSLATIONS.filter(t=>t.status==='approved').length}/{LB_TRANSLATIONS.length} approved</span></div>
              <div className="lb-table">{LB_TRANSLATIONS.map((t,i)=>(<div key={i} className="lb-tr"><span className="lb-lang">{t.language}</span><span className="lb-method">{t.method.replace('_',' ')}</span><span className={`lb-btv ${t.btv?'ok':''}`}>{t.btv?'Back-translated':'—'}</span><span><span className={`lb-st lb-st-${tSt(t.status)}`}>{t.status}</span></span></div>))}</div>
            </div>
            <div className="bp-card">
              <div className="bp-card-head"><h3>ISO 15223-1 symbols</h3><span className="bp-card-meta">{LB_SYMBOLS.length} on this label</span></div>
              <div className="lb-table">{LB_SYMBOLS.map((s,i)=>(<div key={i} className="lb-tr lb-tr-sym"><span className="lb-sym-code">{s.code}</span><span className="lb-sym-name">{s.name}</span><span className="lb-sym-req">{s.required}</span></div>))}</div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
function App() {
  const askAna = (q)=>{ console.log('[AnA · labeling]', q); };
  return (
    <div className="sg-railed">
      <window.PlatformRail active="udi"/>
      <div className="sg-rail-main">
      <div className="sg-shell" data-screen-label="Labeling">
        <header className="sg-topbar">
          <div className="sg-crumbs"><a href="../home/index.html">Concept2Cure.RI</a><span className="sep">›</span><span>BX-D2</span><span className="sep">›</span><span className="here">Labeling · IFU</span></div>
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
