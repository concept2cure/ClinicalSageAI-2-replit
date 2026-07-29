(() => {
/* Projects detail — Phase 10
   ───────────────────────────────────────────────────────────
   Single project view. The shared chassis a user lands on
   when they click any program from MDX, Biopharma or the home
   rail. Mirrors how Claude project pages are organized:
     - header (identity, status, ownership, readiness)
     - workstreams (pathway-grouped progress cards)
     - the AnA conversation thread for this project
     - recent drafts (links into authoring)
     - aside: people, evidence pinned to project, audit feed
*/
const { useState } = React;

const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{typeof d === 'string' ? <path d={d}/> : d}</svg>
);
const I = {
  arrowLeft: <Icon d={<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>}/>,
  arrowRight:<Icon d={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>}/>,
  arrowUp:   <Icon d={<><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>}/>,
  star:      <Icon d="M12 2 15.09 8.26 22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z"/>,
  share:     <Icon d={<><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></>}/>,
  more:      <Icon d={<><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>}/>,
  file:      <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>}/>,
  beaker:    <Icon d={<><path d="M4.5 3h15"/><path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3"/><path d="M6 14h12"/></>}/>,
  shield:    <Icon d={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></>}/>,
  scroll:    <Icon d={<><path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M21 17V5a2 2 0 0 0-2-2H8"/></>}/>,
  sparkle:   <Icon d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>,
  attach:    <Icon d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>,
  command:   <Icon d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>,
  pin:       <Icon d={<><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/></>}/>,
  fileText:  <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></>}/>,
  check:     <Icon d={<><polyline points="20 6 9 17 4 12"/></>}/>,
  edit:      <Icon d={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>}/>,
  send:      <Icon d={<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>}/>,
  lock:      <Icon d={<><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>}/>,
  flag:      <Icon d={<><line x1="4" y1="22" x2="4" y2="15"/><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/></>}/>,
};

/* ─── Project fixture ───────────────────────────────────────── */
const PROJECT = {
  code: 'NDA 212345',
  title: 'BX-204',
  indication: 'RTK-X+ advanced or metastatic solid tumors',
  sponsor: 'Concept2Cure Bio',
  status: 'In agency review',
  statusKind: 'review',
  readiness: 87,
  pdufa: '2026-10-09',
  lead: 'Jordan Chen',
  team: 8,
  agency: 'FDA',
  pathway: 'NDA',
  filed: '2025-12-22',
};

const STREAMS = [
  { id: 'cmc',      label: 'CMC · Module 3',        desc: 'Drug substance + product', pct: 84, status: 'review',   sections: '12 / 14' },
  { id: 'nonclin',  label: 'Nonclinical · Module 4', desc: 'Pharm, PK, tox',           pct: 100, status: 'approved', sections: '18 / 18' },
  { id: 'clin',     label: 'Clinical · Module 5',   desc: 'CSRs, ISE, ISS',           pct: 92, status: 'review',   sections: '21 / 23' },
  { id: 'mod2',     label: 'Summaries · Module 2',  desc: 'QOS, nonclin, clinical',   pct: 78, status: 'drafted',  sections: '4 / 6' },
  { id: 'mod1',     label: 'Admin · Module 1',      desc: 'Forms, labeling',           pct: 95, status: 'review',   sections: '11 / 12' },
  { id: 'preds',    label: 'Pediatric · PSP',       desc: 'Required with submission',  pct: 100, status: 'approved', sections: '6 / 6' },
  { id: 'risk',     label: 'Risk · REMS',           desc: 'Communication plan',        pct: 62, status: 'drafted',  sections: '4 / 7' },
  { id: 'orph',     label: 'Orphan + breakthrough', desc: 'Designations',              pct: 100, status: 'approved', sections: 'both granted' },
];

const THREAD = [
  { role: 'user', who: 'Jordan Chen', when: '2 hours ago', text: 'AnA, surface the Day-150 LoQ projection for NDA 212345 against last week\'s pivotal CSR amendment. I want to know which §2.5 paragraphs are most likely to draw a reviewer query.' },
  { role: 'ana', when: '2 hours ago',
    text: 'Day-150 projection is 12 deficiencies (high-confidence), down from 18 last cycle. The §2.5 paragraphs most likely to draw a query are the bridging argument in §2.5.4 and the subgroup discussion in §2.5.5. Both are at confidence 0.84 — below your team\'s 0.90 threshold.',
    chips: [
      { kind: 'tool', label: 'RIM precedent · 0.91 match' },
      { kind: 'tool', label: 'CSR-201 amendment v3.2' },
      { kind: 'tool', label: 'Cross-checked: 2 prior FDA AdComs' },
    ],
  },
  { role: 'user', who: 'Sofia Marchetti', when: '38 min ago', text: 'Open §2.5.4 in the authoring workbench and queue a strengthen pass against the FDA 2023 bridging guidance.' },
  { role: 'ana', when: '36 min ago',
    text: 'Opened §2.5.4 (clinical bridging · NDA 212345) in conversation mode and pinned the FDA 2023 bridging guidance to the evidence rail. Strengthen pass queued — the precedent search returned RIM 0.91 against EMEA/H/C/005612.',
    chips: [
      { kind: 'art', label: '§2.5.4 · Clinical bridging' },
      { kind: 'tool', label: 'Authoring · pack IND × FDA' },
    ],
  },
];

const DRAFTS = [
  { ico: 'fileText', title: '§2.5 Clinical overview', sub: 'NDA 212345 · v0.4 · 11 citations', status: 'review',   who: 'JC', when: '12 min ago' },
  { ico: 'fileText', title: '§2.5.4 Clinical bridging', sub: 'Strengthen pass · streaming', status: 'drafted',  who: 'AnA', when: '36 min ago' },
  { ico: 'fileText', title: '§3.2.S Drug substance — stability addendum', sub: 'CMC · supplier comparability', status: 'drafted', who: 'AR', when: '2h ago' },
  { ico: 'fileText', title: 'Cover letter v3', sub: 'Mod 1.2 · final reviewer pass', status: 'review',   who: 'JC', when: '4h ago' },
  { ico: 'fileText', title: 'CHMP D80 LoQ response — Q1–Q4', sub: 'EMA companion submission', status: 'drafted',  who: 'SM', when: 'yesterday' },
  { ico: 'fileText', title: '§4.2.3 Toxicology summary', sub: 'Approved · signed JC + RA', status: 'approved', who: 'AR', when: '3d ago' },
  { ico: 'fileText', title: 'PSP — Pediatric Study Plan', sub: 'Approved · locked', status: 'locked',   who: 'BK', when: '6d ago' },
];

const TEAM = [
  { id: 'JC', name: 'Jordan Chen',     role: 'Reg Affairs lead', state: 'Online' },
  { id: 'AR', name: 'Alex Reyes',      role: 'CMC / quality',    state: 'Online' },
  { id: 'BK', name: 'Brooke Kim',      role: 'Biostatistics',    state: 'Idle' },
  { id: 'MS', name: 'Marina Stein',    role: 'Medical writer',   state: 'Offline' },
  { id: 'TP', name: 'Theo Park',       role: 'Clinical safety',  state: 'Online' },
  { id: 'SM', name: 'Sofia Marchetti', role: 'EU regulatory',    state: 'Online' },
];

const EVIDENCE = [
  { kind: 'CSR',       title: 'BX204-201 Phase II CSR (pivotal)', meta: 'ORR 38.6% · 2025-09 · 184 subjects' },
  { kind: 'Guidance',  title: 'FDA 2023 oncology bridging guidance', meta: 'Section IV.C · pinned · RIM 0.91' },
  { kind: 'Precedent', title: 'EMEA/H/C/005612 Assessment Report', meta: 'Section 4.3 · cross-agency precedent' },
];

const AUDIT = [
  { ico: 'edit',  body: <><b>Sofia Marchetti</b> opened §2.5.4 in authoring · strengthen pass queued</>, when: '36m' },
  { ico: 'send',  body: <><b>AnA</b> drafted §2.5.4 bridging argument · 0.84 → 0.91 confidence</>, when: '32m' },
  { ico: 'check', body: <><b>Alex Reyes</b> approved §3.2.S stability addendum · e-signed</>, when: '2h' },
  { ico: 'flag',  body: <><b>Jordan Chen</b> flagged §2.5.5 subgroup discussion for reviewer attention</>, when: '4h' },
  { ico: 'lock',  body: <><b>Brooke Kim</b> locked PSP — pediatric study plan to v1.0</>, when: '6d' },
];

/* ─── Components ────────────────────────────────────────────── */
function Header() {
  return (
    <div className="pj-head">
      <div className="pj-head-row1">
        <span className="code">{PROJECT.code}</span>
        <h1>{PROJECT.title}</h1>
        <span className={`pill ${PROJECT.statusKind}`}><span className="dot"/>{PROJECT.status}</span>
      </div>
      <div className="sub">{PROJECT.indication} · {PROJECT.sponsor} · filed {PROJECT.filed} · PDUFA {PROJECT.pdufa}</div>
      <div className="pj-head-meta">
        <div className="col"><div className="lbl">Readiness</div>
          <div className="pct">{PROJECT.readiness}%</div>
          <div className="bar"><div className="fill" style={{ width: PROJECT.readiness + '%' }}/></div>
        </div>
        <div className="col"><div className="lbl">Pathway</div><div className="val">{PROJECT.pathway} · {PROJECT.agency}</div></div>
        <div className="col"><div className="lbl">Reg lead</div><div className="val">{PROJECT.lead}</div></div>
        <div className="col"><div className="lbl">Team</div><div className="val">{PROJECT.team} contributors</div></div>
        <div className="col"><div className="lbl">Next milestone</div><div className="val warn">PDUFA · 142 days</div></div>
      </div>
    </div>
  );
}

function Streams() {
  const iconFor = (id) => id === 'cmc' || id === 'nonclin' ? I.beaker : id === 'clin' ? I.fileText : id === 'mod1' || id === 'mod2' ? I.scroll : id === 'risk' ? I.shield : id === 'orph' ? I.star : I.file;
  return (
    <div className="pj-stream">
      {STREAMS.map(s => (
        <button key={s.id} className="pj-stream-card">
          <div className="head">
            <span className="ico">{iconFor(s.id)}</span>
            <span className="lbl">{s.label}</span>
            <span className="pct">{s.pct}%</span>
          </div>
          <div className="meta">{s.desc} · {s.sections}</div>
          <div className="bar"><div className="fill" style={{ width: s.pct + '%' }}/></div>
        </button>
      ))}
    </div>
  );
}

function Thread() {
  return (
    <>
      <div className="pj-thread">
        {THREAD.map((t, i) => (
          <div key={i} className={`pj-turn ${t.role}`}>
            <div className="av">{t.role === 'user' ? (t.who || 'U').split(' ').map(n => n[0]).slice(0,2).join('') : 'A'}</div>
            <div className="body">
              <div className="who"><b>{t.role === 'user' ? t.who : 'AnA'}</b><span>{t.when}</span></div>
              <p className="text">{t.text}</p>
              {t.chips && (
                <div className="chips">
                  {t.chips.map((c, j) => (
                    <span key={j} className="chip">
                      {c.kind === 'art' ? I.file : I.check}{c.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="pj-composer">
        <textarea rows={1} placeholder="Continue the project conversation, or open a section…"/>
        <div className="row">
          <div className="left">
            <button title="Attach">{I.attach}</button>
            <button title="Slash commands">{I.command}</button>
            <button title="Pin">{I.pin}</button>
            <button>AnA 1.0</button>
          </div>
          <button className="send" title="Send">{I.arrowUp}</button>
        </div>
      </div>
    </>
  );
}

function Drafts() {
  return (
    <div className="pj-drafts">
      {DRAFTS.map((d, i) => (
        <div key={i} className="pj-draft-row">
          <span className="ico">{I[d.ico]}</span>
          <span>
            <div className="title">{d.title}</div>
            <div className="sub">{d.sub}</div>
          </span>
          <span><span className={`pj-status ${d.status}`}>{d.status === 'approved' ? 'Approved' : d.status === 'review' ? 'In review' : d.status === 'locked' ? 'Locked' : 'Drafted'}</span></span>
          <span className="when">{d.who} · {d.when}</span>
          <button className="more" onClick={(e) => e.stopPropagation()}>{I.more}</button>
        </div>
      ))}
    </div>
  );
}

function Aside() {
  return (
    <>
      <div className="pj-aside-sec">
        <h3>Team <span className="meta">{TEAM.length}</span><a className="link" href="#">Manage</a></h3>
        <div className="pj-people">
          {TEAM.map(m => (
            <div key={m.id} className="pj-person">
              <span className="av">{m.id}</span>
              <div>
                <div className="name">{m.name}</div>
                <div className="role">{m.role}</div>
              </div>
              <span className="status">{m.state}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pj-aside-sec">
        <h3>Pinned evidence <a className="link" href="#" style={{ marginLeft:'auto' }}>Vault →</a></h3>
        {EVIDENCE.map((e, i) => (
          <div key={i} className="pj-evidence">
            <div className="kind">{e.kind}</div>
            <div className="title">{e.title}</div>
            <div className="meta">{e.meta}</div>
          </div>
        ))}
      </div>

      <div className="pj-aside-sec">
        <h3>Activity<a className="link" href="#" style={{ marginLeft:'auto' }}>Open log →</a></h3>
        {AUDIT.map((a, i) => (
          <div key={i} className="pj-audit-row">
            <span className="ico">{I[a.ico]}</span>
            <span className="body">{a.body}</span>
            <span className="when">{a.when}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function App() {
  return (
    <div className="pj-shell" data-screen-label="Project · BX-204">
      <header className="pj-topbar">
        <div className="pj-logo">
          <img src="../../assets/concept2cure-icon.svg" alt=""/>
          <span>Concept2Cure<span style={{ color:'var(--accent-main-100)' }}>.RI</span></span>
        </div>
        <div className="pj-sep"/>
        <div className="pj-crumbs">
          <a href="../home/index.html">Projects</a>
          <span className="sep">›</span>
          <a href="../biopharma/index.html">Biotech and Pharma</a>
          <span className="sep">›</span>
          <span className="here">{PROJECT.code} · {PROJECT.title}</span>
        </div>
        <div className="pj-spacer"/>
        <button className="pj-tb-btn" title="Star">{I.star}</button>
        <button className="pj-tb-btn" title="Share">{I.share} Share</button>
        <a className="pj-tb-btn" href="../authoring/index.html" title="Open authoring">{I.fileText} Open in authoring</a>
        <button className="pj-tb-btn primary">{I.sparkle} Ask AnA</button>
      </header>

      <div className="pj-body">
        <div className="pj-main">
          <div className="pj-main-inner">
            <Header/>

            <div className="pj-sec">
              <div className="pj-sec-head"><h2>Workstreams</h2><span className="meta">8 modules · click to open</span></div>
              <Streams/>
            </div>

            <div className="pj-sec">
              <div className="pj-sec-head">
                <h2>Conversation with AnA</h2>
                <span className="meta">Project-grounded · last 5 turns</span>
                <span className="spacer"/>
                <a className="link" href="#">View all turns {I.arrowRight}</a>
              </div>
              <Thread/>
            </div>

            <div className="pj-sec">
              <div className="pj-sec-head">
                <h2>Recent drafts</h2>
                <span className="meta">7 of 42</span>
                <span className="spacer"/>
                <a className="link" href="../authoring/index.html">Open authoring {I.arrowRight}</a>
              </div>
              <Drafts/>
            </div>
          </div>
        </div>

        <aside className="pj-aside" data-screen-label="Project · aside">
          <Aside/>
        </aside>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

})();
