/* global React, I */
const { useState } = React;

/* ───────── Sidebar ───────── */
function Sidebar({ view, setView, collapsed, setCollapsed }) {
  const chats = [
    "NDA 212345 · Module 2.5 draft",
    "510(k) predicate search — Q1",
    "EMA scientific advice prep",
    "Biostat SAP review — BX-204",
    "Pre-IND meeting package",
    "PMDA consultation outline",
  ];
  const Item = ({ id, icon, label, selected }) => (
    <button className="sb-item" aria-selected={selected || undefined} onClick={() => setView(id)}>
      <span className="ico">{icon}</span><span className="lbl">{label}</span>
    </button>
  );
  return (
    <nav className="sb">
      <div className="sb-top">
        <div className="sb-logo">
          <img src="../../assets/concept2cure-icon.svg" alt=""/>
          <div className="sb-logo-text">Concept2Cure<span>.RI</span></div>
        </div>
        <button className="sb-collapse" onClick={() => setCollapsed(!collapsed)} title="Toggle sidebar">{I.panelLeft}</button>
      </div>
      <button className="sb-new" onClick={() => setView('home')}>
        <span className="ico">{I.plus}</span><span>New chat</span>
      </button>
      <Item id="home"     icon={I.chat}     label="Chats"      selected={view==='home' || view==='chat'}/>
      <Item id="projects" icon={I.folder}   label="Projects"   selected={view==='projects'}/>
      <Item id="artifacts" icon={I.sparkles} label="Artifacts" selected={view==='artifacts'}/>

      <div className="sb-section">Recents</div>
      {chats.map((c, i) => (
        <button key={i} className="sb-item" aria-selected={view==='chat' && i===0 || undefined} onClick={() => setView('chat')}>
          <span className="lbl">{c}</span>
        </button>
      ))}

      <div className="sb-spacer"/>
      <button className="sb-account">
        <div className="avatar">JC</div>
        <div className="who">
          <div className="name">Jordan Chen</div>
          <div className="plan">Enterprise · Reg Affairs</div>
        </div>
      </button>
    </nav>
  );
}

/* ───────── TopBar ───────── */
function TopBar({ view }) {
  const title = { projects: 'Projects', artifacts: 'Artifacts' }[view];
  return (
    <header className="topbar">
      <button className="topbar-model">
        {title ? <span style={{fontWeight:600}}>{title}</span> : <><span className="ai-dot"/>AnA 1.0 RI{I.down}</>}
      </button>
      <div className="topbar-actions">
        <button className="icon-btn" title="Share">{I.share}</button>
        <button className="icon-btn" title="More">{I.dots}</button>
      </div>
    </header>
  );
}

/* ───────── Composer ───────── */
function Composer({ value, onChange, onSend, placeholder = "How can AnA help you today?" }) {
  return (
    <div className="composer">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        rows={1}
      />
      <div className="composer-actions">
        <div className="left">
          <button className="composer-icon" title="Attach">{I.attach}</button>
          <button className="composer-icon" title="Tools">{I.tools}</button>
          <button className="composer-chip">AnA 1.0 RI {I.down}</button>
        </div>
        <button className="composer-send" onClick={onSend} disabled={!value.trim()}>{I.arrowUp}</button>
      </div>
    </div>
  );
}

/* ───────── Empty state ───────── */
function EmptyState({ onSend }) {
  const [draft, setDraft] = useState('');
  const send = (text) => { if (text || draft) onSend(text || draft); };
  const suggestions = [
    { ico: I.file,  label: "Draft CTD Section 2.5" },
    { ico: I.search, label: "Find 510(k) predicates" },
    { ico: I.flask, label: "Review biostat SAP" },
    { ico: I.clip,  label: "Submission readiness" },
    { ico: I.globe, label: "Cross-agency precedent" },
  ];
  return (
    <div className="empty">
      <div className="empty-inner">
        <div className="greet"><span className="star">✻</span> Good morning, Jordan</div>
        <Composer value={draft} onChange={setDraft} onSend={() => send()} />
        <div className="suggest">
          {suggestions.map((s, i) => (
            <button key={i} className="suggest-pill" onClick={() => send(s.label)}>
              <span className="ico">{s.ico}</span>{s.label}
            </button>
          ))}
        </div>
        <div className="agency-strip">
          <div className="al">FDA</div><div className="al">EMA</div><div className="al">PMDA</div>
          <div className="al">Health Canada</div><div className="al">MHRA</div><div className="al">ICH</div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Chat view ───────── */
function ChatView({ messages, onSend }) {
  const [draft, setDraft] = useState('');
  const send = () => { if (draft.trim()) { onSend(draft); setDraft(''); } };
  return (
    <div className="chat">
      <div className="chat-scroll">
        <div className="chat-thread">
          {messages.map((m, i) => m.role === 'user' ? (
            <div key={i} className="msg msg-user"><div className="bubble">{m.text}</div></div>
          ) : (
            <div key={i} className="msg msg-ai">
              <div className="avatar-ai">A</div>
              <div className="ai-body">
                <div className="ai-name">AnA · Reg Intelligence</div>
                <div className="ai-prose" dangerouslySetInnerHTML={{ __html: m.html }}/>
                <div className="ai-actions">
                  <button title="Copy">{I.copy}</button>
                  <button title="Retry">{I.redo}</button>
                  <button title="Good">{I.thumbUp}</button>
                  <button title="Bad">{I.thumbDown}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="chat-footer">
        <Composer value={draft} onChange={setDraft} onSend={send} placeholder="Reply to AnA…"/>
      </div>
    </div>
  );
}

/* ───────── Projects view ───────── */
function ProjectsView() {
  const projects = [
    { t: "NDA 212345", d: "Full submission package for oncology biologic. 6 modules, 14 contributors.", meta: "42 chats · updated 4h ago" },
    { t: "510(k) — BX-204", d: "Class II device clearance. Predicate analysis + SE argument.", meta: "18 chats · updated 2d ago" },
    { t: "EMA scientific advice", d: "Pre-submission advice request for MAA Q3 filing.", meta: "7 chats · updated 1w ago" },
    { t: "Pediatric plan", d: "PIP + iPSP harmonization across FDA/EMA.", meta: "3 chats · updated 2w ago" },
    { t: "Post-market safety", d: "PBRER / PSUR authoring for 3 approved products.", meta: "21 chats · updated 3d ago" },
    { t: "CMC readiness", d: "Module 3 review, stability commitments, CBE-30 tracker.", meta: "9 chats · updated 5d ago" },
  ];
  return (
    <div className="projects">
      <div className="projects-head">
        <div>
          <h1>Projects</h1>
          <div className="sub">Persistent workspaces with shared context and files.</div>
        </div>
        <button className="composer-chip" style={{padding:"6px 12px"}}>{I.plus} New project</button>
      </div>
      <div className="projects-grid">
        {projects.map((p, i) => (
          <button key={i} className="project-card">
            <div className="pc-ico">{I.folder}</div>
            <div className="pc-ttl">{p.t}</div>
            <div className="pc-desc">{p.d}</div>
            <div className="pc-meta"><span>{p.meta}</span></div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────── App ───────── */
function App() {
  const [view, setView] = useState('home');
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState([]);

  const ANA_SAMPLE = `
    <p>For <strong>NDA 212345</strong>, Section 2.5 should open with the indication statement and proposed dosing, then cross-reference Module 2.7 for the bridging biostudy. Two items to flag before you draft:</p>
    <ul>
      <li>The FDA 2023 draft guidance on <em>oncology bridging studies</em> asks for population-PK justification<a href="#" class="cite">FDA 2023</a> — you should cite this in §2.5.4.</li>
      <li>EMA precedent <code>EMEA/H/C/005612</code> establishes the same bridging approach<a href="#" class="cite">EMA</a>; including it strengthens the argument.</li>
    </ul>
    <p>Here's a skeleton you can drop into the document editor:</p>
    <div class="codeblock"><span class="tok-c">// Section 2.5 — Clinical Overview</span><br/>
<span class="tok-k">2.5.1</span>  Product development rationale<br/>
<span class="tok-k">2.5.2</span>  Overview of biopharmaceutics<br/>
<span class="tok-k">2.5.3</span>  Overview of clinical pharmacology<br/>
<span class="tok-k">2.5.4</span>  Overview of efficacy      <span class="tok-c">// cite FDA 2023 bridging guidance</span><br/>
<span class="tok-k">2.5.5</span>  Overview of safety<br/>
<span class="tok-k">2.5.6</span>  Benefit-risk conclusions   <span class="tok-c">// anchor on RIM precedent score 0.87</span></div>
    <p>Want me to expand §2.5.4 first, or generate the full draft and flag gaps?</p>`;

  const send = (text) => {
    const next = [...messages, { role: 'user', text }];
    setMessages(next);
    setView('chat');
    setTimeout(() => {
      setMessages([...next, { role: 'ai', html: ANA_SAMPLE }]);
    }, 600);
  };

  return (
    <div className="shell" data-collapsed={collapsed}>
      <Sidebar view={view} setView={setView} collapsed={collapsed} setCollapsed={setCollapsed}/>
      <main className="main">
        <TopBar view={view}/>
        {view === 'home' && <EmptyState onSend={send}/>}
        {view === 'chat' && <ChatView messages={messages} onSend={send}/>}
        {view === 'projects' && <ProjectsView/>}
        {view === 'artifacts' && <ProjectsView/>}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
