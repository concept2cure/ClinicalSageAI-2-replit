(() => {
/* Global Tasking + Project Messaging — surface (AnA-first). */
const { useState, useRef } = React;

const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{typeof d === 'string' ? <path d={d}/> : d}</svg>
);
const I = {
  check:   <Icon d={<><polyline points="20 6 9 17 4 12"/></>}/>,
  chat:    <Icon d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>,
  arrowRight:<Icon d={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>}/>,
  arrowUp: <Icon d={<><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>}/>,
  down:    <Icon d={<><polyline points="6 9 12 15 18 9"/></>}/>,
  attach:  <Icon d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>,
  sparkles:<Icon d={<><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></>}/>,
  search:  <Icon d={<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>}/>,
  bell:    <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}/>,
  at:      <Icon d={<><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></>}/>,
};

function Surface({ onAskAna }) {
  const [view, setView] = useState('tasks'); // tasks | messages
  const [composer, setComposer] = useState('');
  const [activeThread, setActiveThread] = useState('th-1');
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);

  const tasks = window.TK_TASKS, cols = window.TK_COLUMNS, threads = window.TK_THREADS, messages = window.TK_MESSAGES;
  const mine = tasks.filter(t => t.mine && t.col !== 'done');
  const send = (t) => { if (t && t.trim()) onAskAna(t.trim()); setComposer(''); };

  return (
    <div className="bp-surface bp-overview-start">
      <div className="bp-od-greet">
        <div className="bp-kicker" style={{ marginBottom: 8 }}>Tasking and collaboration</div>
        <h1>Your work across every program</h1>
        <p className="bp-od-state">
          You own <b>{mine.length} open tasks</b> — 1 due today, 1 blocking others. <b>{threads.reduce((a,t)=>a+t.unread,0)} unread</b> across {threads.length} project threads.
        </p>
        <div style={{ marginTop: 12 }} className="tk-viewtoggle">
          <button data-active={view==='tasks'||undefined} onClick={()=>setView('tasks')}>{I.check} Tasks</button>
          <button data-active={view==='messages'||undefined} onClick={()=>setView('messages')}>{I.chat} Messages</button>
        </div>
      </div>

      {/* AnA-first composer + drop */}
      <div className="bp-od-composer">
        <textarea rows={1} placeholder="Ask AnA to triage, reassign, or summarize — or capture a task or message…"
                  value={composer} onChange={(e)=>setComposer(e.target.value)}
                  onKeyDown={(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(composer);}}}/>
        <div className="bp-od-composer-row">
          <input ref={fileRef} type="file" hidden multiple onChange={(e)=>{const f=e.target.files;if(f&&f.length)onAskAna(`Attach to the active thread: ${Array.from(f).map(x=>x.name).join(', ')}`);e.target.value='';}}/>
          <button className="bp-od-chip" onClick={()=>fileRef.current&&fileRef.current.click()}>{I.attach} Attach</button>
          <button className="bp-od-chip">{I.at} Mention</button>
          <button className="bp-od-chip" style={{marginLeft:'auto'}}>AnA 1.0 {I.down}</button>
          <button className="bp-od-send" disabled={!composer.trim()} onClick={()=>send(composer)}>{I.arrowRight}</button>
        </div>
      </div>
      <div className="bp-od-starters">
        {window.TK_SUGGESTIONS.map((s,i)=>(
          <button key={i} className="bp-od-starter" onClick={()=>onAskAna(s)}><span className="bp-od-starter-ico">{I.sparkles}</span><span>{s}</span></button>
        ))}
      </div>

      {view === 'tasks' ? (
        <section className="bp-od-section">
          <header className="bp-od-section-head"><h2>Board</h2><span className="bp-od-section-meta">{tasks.length} tasks · all programs</span></header>
          <div className="tk-board">
            {cols.map(c => {
              const items = tasks.filter(t => t.col === c.id);
              return (
                <div key={c.id} className="tk-col">
                  <div className="tk-col-head">{c.label} <span className="tk-col-count">{items.length}</span></div>
                  <div className="tk-col-body">
                    {items.map(t => (
                      <button key={t.id} className="tk-card" onClick={()=>onAskAna(`Open task ${t.id} (${t.title}) on ${t.program}`)}>
                        <div className="tk-card-top"><span className="tk-card-kind">{t.kind}</span>{t.mine && <span className="tk-card-mine">Mine</span>}</div>
                        <div className="tk-card-title">{t.title}</div>
                        <div className="tk-card-foot">
                          <span className="tk-card-prog">{t.program}</span>
                          <span className={`tk-card-due tk-due-${t.tone}`}>{t.due}</span>
                          <span className="tk-card-av">{t.assignee}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="bp-od-section">
          <header className="bp-od-section-head"><h2>Project messages</h2><span className="bp-od-section-meta">{threads.length} threads</span></header>
          <div className="tk-msg">
            <div className="tk-threads">
              {threads.map(t => (
                <button key={t.id} className="tk-thread" data-active={activeThread===t.id||undefined} onClick={()=>setActiveThread(t.id)}>
                  <div className="tk-thread-top">
                    <span className="tk-thread-prog">{t.program}</span>
                    {t.unread > 0 && <span className="tk-unread">{t.unread}</span>}
                  </div>
                  <div className="tk-thread-topic">{t.topic}</div>
                  <div className="tk-thread-last">{t.last}</div>
                  <div className="tk-thread-meta">{t.members.join(' · ')} · {t.when}</div>
                </button>
              ))}
            </div>
            <div className="tk-conv">
              <div className="tk-conv-head">
                <div><b>Day-150 LoQ projection</b><div className="tk-conv-sub">BX-204 · Jordan Chen, Sofia Marchetti, Brooke Kim, AnA</div></div>
              </div>
              <div className="tk-conv-scroll">
                {messages.map((m, i) => (
                  <div key={i} className={`tk-bubble ${m.me ? 'me' : ''} ${m.ana ? 'ana' : ''}`}>
                    <span className={`tk-bubble-av ${m.ana ? 'ana' : ''}`}>{m.init}</span>
                    <div className="tk-bubble-body">
                      <div className="tk-bubble-who">{m.who}<span className="tk-bubble-when">{m.when}</span></div>
                      <div className="tk-bubble-text">{m.text}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="tk-conv-composer">
                <input value={msg} onChange={(e)=>setMsg(e.target.value)} placeholder="Message the team — @AnA to bring in AnA, or attach a file…"
                       onKeyDown={(e)=>{if(e.key==='Enter'&&msg.trim()){ if(msg.includes('@AnA')) onAskAna(msg.replace('@AnA','').trim()); setMsg(''); }}}/>
                <button className="tk-conv-attach" title="Attach">{I.attach}</button>
                <button className="tk-conv-send" disabled={!msg.trim()} onClick={()=>{ if(msg.includes('@AnA')) onAskAna(msg.replace('@AnA','').trim()); setMsg(''); }}>{I.arrowUp}</button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function App() {
  const askAna = (q) => { console.log('[AnA · tasking]', q); };
  return (
    <div className="sg-railed">
      <window.PlatformRail active="tasking"/>
      <div className="sg-rail-main">
      <div className="sg-shell" data-screen-label="Tasking">
      <header className="sg-topbar">
        <div className="sg-logo"><img src="../../assets/concept2cure-icon.svg" alt=""/><span>Concept2Cure<span style={{color:'var(--accent-main-100)'}}>.RI</span></span></div>
        <div className="sg-sep"/>
        <div className="sg-crumbs"><a href="../home/index.html">Concept2Cure.RI</a><span className="sep">›</span><span className="here">Tasking and collaboration</span></div>
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
window.TK_I = I;
})();
