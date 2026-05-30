(() => {
/* Pathway sub-tabs — the reusable 3-tab program component. */
const { useState } = React;

const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{typeof d === 'string' ? <path d={d}/> : d}</svg>
);
const I = {
  scroll: <Icon d={<><path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M21 17V5a2 2 0 0 0-2-2H8"/></>}/>,
  chat:   <Icon d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>,
  check:  <Icon d={<><polyline points="20 6 9 17 4 12"/></>}/>,
  shield: <Icon d={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></>}/>,
  arrowRight:<Icon d={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>}/>,
  search: <Icon d={<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>}/>,
  bell:   <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}/>,
  sparkles:<Icon d={<><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></>}/>,
};

const corrTone = (s) => s === 'closed' ? 'ok' : s === 'open' ? 'err' : 'warn';

function ProgramSubTabs({ onAskAna }) {
  const [tab, setTab] = useState('correspondence');
  const [ask, setAsk] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = React.useRef(null);
  const audit = window.PT_AUDIT, corr = window.PT_CORRESPONDENCE, appr = window.PT_APPROVALS;
  const send = (t) => { if (t && t.trim()) onAskAna(t.trim()); setAsk(''); };

  return (
    <div className="pt-wrap">
      {/* AnA-first: ask or drop a file about this program before the tabs */}
      <div className={`pt-ana ${dragOver ? 'pt-ana-drag' : ''}`}
           onDragEnter={(e)=>{e.preventDefault();setDragOver(true);}} onDragOver={(e)=>{e.preventDefault();setDragOver(true);}}
           onDragLeave={()=>setDragOver(false)}
           onDrop={(e)=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer&&e.dataTransfer.files;if(f&&f.length)onAskAna(`File these against NDA 212345 and route to the right tab (correspondence, evidence, or approval): ${Array.from(f).map(x=>x.name).join(', ')}`);}}>
        <span className="pt-ana-mark">{I.sparkles}</span>
        <input value={ask} onChange={(e)=>setAsk(e.target.value)}
               placeholder="Ask AnA about this program, log correspondence, or drop an agency letter…"
               onKeyDown={(e)=>{if(e.key==='Enter')send(ask);}}/>
        <input ref={fileRef} type="file" hidden multiple onChange={(e)=>{const f=e.target.files;if(f&&f.length)onAskAna(`File these against NDA 212345: ${Array.from(f).map(x=>x.name).join(', ')}`);e.target.value='';}}/>
        <button className="pt-ana-attach" onClick={()=>fileRef.current&&fileRef.current.click()} title="Drop a file">{I.scroll}</button>
        <button className="pt-ana-send" disabled={!ask.trim()} onClick={()=>send(ask)}>{I.arrowRight}</button>
      </div>
      <div className="pt-ana-starters">
        <button onClick={()=>onAskAna('Triage every open HAQ and deficiency on this program by deadline')}>{I.sparkles} Triage open correspondence</button>
        <button onClick={()=>onAskAna('What is blocking the submission gate approval, and who do I need?')}>{I.sparkles} What blocks the submission gate?</button>
        <button onClick={()=>onAskAna('Summarize everything that changed on this program in the last 24 hours from the audit chain')}>{I.sparkles} What changed overnight?</button>
      </div>

      <div className="pt-tabs">
        <button className="pt-tab" data-active={tab==='correspondence'||undefined} onClick={()=>setTab('correspondence')}>
          {I.chat} Correspondence <span className="pt-count">{corr.filter(c=>c.status!=='closed').length}</span>
        </button>
        <button className="pt-tab" data-active={tab==='approvals'||undefined} onClick={()=>setTab('approvals')}>
          {I.check} Approvals <span className="pt-count">{appr.length}</span>
        </button>
        <button className="pt-tab" data-active={tab==='audit'||undefined} onClick={()=>setTab('audit')}>
          {I.scroll} Audit
        </button>
      </div>

      {tab === 'correspondence' && (
        <div className="pt-pane">
          <div className="pt-pane-head">
            <span>Health-authority correspondence</span>
            <button className="pt-ask" onClick={()=>onAskAna('Triage all open agency correspondence and draft responses ranked by deadline')}>{I.sparkles} Triage with AnA</button>
          </div>
          <div className="pt-table">
            <div className="pt-tr pt-tr-head"><span>Kind</span><span>Subject</span><span>Agency</span><span>Received</span><span>Due</span><span>Status</span><span>Owner</span></div>
            {corr.map(c => (
              <button key={c.id} className="pt-tr" onClick={()=>onAskAna(`Open ${c.kind} "${c.subject}" (${c.agency}) — show the thread and draft a response`)}>
                <span><span className={`pt-kind pt-kind-${c.kind==='HAQ'?'haq':c.kind==='Deficiency'?'def':'info'}`}>{c.kind}</span></span>
                <span className="pt-subj">{c.subject}<span className="pt-thread"> · {c.thread} msg</span></span>
                <span className="pt-agency">{c.agency}</span>
                <span className="pt-mono">{c.received}</span>
                <span className={c.due && c.due.includes('day') ? 'pt-due-warn' : 'pt-muted'}>{c.due || '—'}</span>
                <span><span className={`pt-status pt-status-${corrTone(c.status)}`}><span className="pt-dot"/>{c.status}</span></span>
                <span className="pt-av">{c.owner}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'approvals' && (
        <div className="pt-pane">
          <div className="pt-pane-head"><span>Pending approvals</span></div>
          <div className="pt-approvals">
            {appr.map(w => (
              <div key={w.id} className="pt-appr">
                <div className="pt-appr-top">
                  <span className="pt-appr-target">{w.target}</span>
                  <span className={`pt-sla pt-sla-${w.tone}`}>{w.sla}</span>
                </div>
                <div className="pt-appr-chain">
                  {w.current.split(' → ').map((step, i) => (
                    <React.Fragment key={i}>
                      <span className={`pt-step ${i < w.step ? 'done' : i === w.step ? 'current' : ''}`}>
                        {i < w.step ? I.check : (i + 1)} {step}
                      </span>
                      {i < w.total - 1 && <span className="pt-step-arrow">{I.arrowRight}</span>}
                    </React.Fragment>
                  ))}
                </div>
                <div className="pt-appr-foot">
                  <span className="pt-muted">Waiting on <b>{w.waitingOn}</b> · {w.role}</span>
                  <button className="pt-ask sm" onClick={()=>onAskAna(`Open the approval for "${w.target}" — I'll sign as ${w.role}`)}>{I.shield} Sign as {w.role}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="pt-pane">
          <div className="pt-pane-head">
            <span>21 CFR Part 11 audit chain</span>
            <span className="pt-muted">hash-linked · tamper-evident</span>
          </div>
          <div className="pt-audit">
            {audit.map(a => (
              <div key={a.id} className="pt-audit-row">
                <span className="pt-audit-rail"><span className="pt-audit-node"/></span>
                <div className="pt-audit-body">
                  <div className="pt-audit-line">
                    <span className="pt-audit-action">{a.action}</span>
                    {a.meaning && <span className="pt-audit-meaning">{a.meaning}</span>}
                    <span className="pt-audit-when">{a.when}</span>
                  </div>
                  <div className="pt-audit-target">{a.target}</div>
                  <div className="pt-audit-meta"><b>{a.actor}</b> · {a.reason}</div>
                  <div className="pt-audit-hash">sha256·{a.hash}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* Harness */
function App() {
  const askAna = (q) => { console.log('[AnA · pathway]', q); };
  return (
    <div className="sg-railed">
      <window.PlatformRail active="audit"/>
      <div className="sg-rail-main">
      <div className="sg-shell" data-screen-label="Pathway sub-tabs">
      <header className="sg-topbar">
        <div className="sg-logo"><img src="../../assets/concept2cure-icon.svg" alt=""/><span>Concept2Cure<span style={{color:'var(--accent-main-100)'}}>.RI</span></span></div>
        <div className="sg-sep"/>
        <div className="sg-crumbs"><a href="../home/index.html">Concept2Cure.RI</a><span className="sep">›</span><span>NDA 212345 · BX-204</span><span className="sep">›</span><span className="here">Program record</span></div>
        <div className="sg-spacer"/>
        <button className="sg-tb-search"><span className="ico">{I.search}</span><span className="lbl">Ask AnA, jump to…</span><span className="kbd">⌘K</span></button>
        <button className="sg-tb-btn" title="Notifications">{I.bell}</button>
      </header>
      <div className="sg-page"><div className="sg-page-inner" style={{ padding: '24px 0' }}>
        <div style={{ padding: '0 4px 14px' }}>
          <div className="pt-kicker">Program record · sub-tabs</div>
          <h1 className="pt-h1">NDA 212345 · BX-204</h1>
          <p className="pt-sub">The Audit, Correspondence, and Approvals strip drops into every program surface across MDX and biopharma. Same component, scoped to the active program.</p>
        </div>
        <ProgramSubTabs onAskAna={askAna}/>
      </div></div>
    </div>
      </div>
</div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

window.ProgramSubTabs = ProgramSubTabs;

})();
