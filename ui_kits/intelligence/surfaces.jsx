(() => {
/* Intelligence — Icons + 4 surfaces + Shell helpers. */
var { useState } = React;

const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{typeof d === 'string' ? <path d={d}/> : d}</svg>
);
const I = {
  microscope: <Icon d={<><path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2z"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/></>}/>,
  beaker:     <Icon d={<><path d="M4.5 3h15"/><path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3"/><path d="M6 14h12"/></>}/>,
  sigma:      <Icon d={<><polyline points="18 7 18 4 6 4 12 12 6 20 18 20 18 17"/></>}/>,
  barChart3:  <Icon d={<><line x1="3" y1="20" x2="21" y2="20"/><rect x="5" y="12" width="3" height="8"/><rect x="10.5" y="8" width="3" height="12"/><rect x="16" y="4" width="3" height="16"/></>}/>,
  search:     <Icon d={<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>}/>,
  bell:       <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}/>,
  help:       <Icon d={<><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}/>,
  sparkle:    <Icon d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>,
  right:      <Icon d={<><polyline points="9 6 15 12 9 18"/></>}/>,
  plus:       <Icon d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}/>,
  more:       <Icon d={<><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>}/>,
  external:   <Icon d={<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>}/>,
  clock:      <Icon d={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}/>,
  flag:       <Icon d={<><line x1="4" y1="22" x2="4" y2="15"/><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/></>}/>,
  layers:     <Icon d={<><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>}/>,
  trending:   <Icon d={<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>}/>,
  arrowUp:    <Icon d={<><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>}/>,
  arrowRight: <Icon d={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>}/>,
  arrowLeft:  <Icon d={<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>}/>,
  filter:     <Icon d={<><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>}/>,
};

const HERE_LABEL = { protocol: 'Protocol and Study Design', cmc: 'CMC Module', biostat: 'Biostatistics', reporting: 'Reports' };

/* ─── Shell ──────────────────────────────────────────────────── */
function Rail({ activeNav, setActiveNav }) {
  return (
    <nav className="in-rail">
      <div className="in-logo">
        <img src="../../assets/concept2cure-icon.svg" alt=""/>
        <span>Concept2Cure<span style={{ color:'var(--accent-main-100)' }}>.RI</span></span>
      </div>
      <div className="in-section">Intelligence</div>
      <div className="in-nav">
        {window.INT_NAV.map(it => (
          <button key={it.id} className="in-nav-item"
                  aria-current={activeNav===it.id || undefined}
                  onClick={() => setActiveNav(it.id)}>
            <span className="ico">{I[it.icon]}</span>
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      <div className="in-rail-spacer"/>
      <div className="in-section" style={{ marginBottom: 0 }}>Cross-links</div>
      <a className="in-rail-link" href="../home/index.html">{I.arrowLeft} Back to home</a>
      <a className="in-rail-link" href="../biopharma/index.html">{I.layers} Biopharma</a>
      <a className="in-rail-link" href="../mdx/index.html">{I.layers} Medtech / IVD</a>
      <a className="in-rail-link" href="../authoring/index.html">{I.sparkle} Authoring</a>
    </nav>
  );
}

function TopBar({ activeNav }) {
  return (
    <header className="in-topbar">
      <div className="in-crumbs">
        <a href="../home/index.html">Concept2Cure.RI</a>
        <span className="sep">›</span>
        <span>Intelligence</span>
        <span className="sep">›</span>
        <span className="here">{HERE_LABEL[activeNav]}</span>
      </div>
      <div className="in-spacer"/>
      <button className="in-tb-search" title="⌘K">
        <span className="ico">{I.search}</span>
        <span className="lbl">Ask AnA, jump to…</span>
        <span className="kbd">⌘K</span>
      </button>
      <button className="in-tb-btn" title="Filter">{I.filter}</button>
      <button className="in-tb-btn" title="Notifications">{I.bell}</button>
      <button className="in-tb-btn" title="Help">{I.help}</button>
    </header>
  );
}

function AnaStrip({ activeNav, onAsk }) {
  const items = (window.INT_SUGGESTIONS || {})[activeNav] || [];
  return (
    <div className="in-ana-strip">
      <div className="av">A</div>
      <div className="chips">
        {items.map(q => (
          <button key={q} className="chip" onClick={() => onAsk(q)}>
            <span className="ico">{I.sparkle}</span><span>{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Protocol surface ───────────────────────────────────────── */
function ProtocolSurface({ onAsk }) {
  const active = window.PROTOCOLS.filter(p => p.status === 'active').length;
  const blocked = window.PROTOCOLS.filter(p => p.status === 'blocked').length;
  return (
    <>
      <h1 className="in-h1">Protocol and Study Design</h1>
      <p className="in-sub">Active protocols across the portfolio, endpoint library grounded in ICH guidance and agency precedent, amendment workflow tied to authoring.</p>

      <div className="in-kpis">
        <div className="in-kpi"><div className="lbl">Active protocols</div><div className="val">{active}</div><div className="sub">{blocked} blocked · 1 overdue amendment</div></div>
        <div className="in-kpi"><div className="lbl">Templates</div><div className="val">28</div><div className="sub">ICH E6 R3 · adaptive · master protocol</div></div>
        <div className="in-kpi"><div className="lbl">Endpoint library</div><div className="val">{window.ENDPOINTS.length}</div><div className="sub">Indication-mapped to precedent</div></div>
        <div className="in-kpi"><div className="lbl">Amendments in flight</div><div className="val">{window.AMENDMENTS.length}</div><div className="sub">1 IRB pending · 1 IRB approved</div></div>
      </div>

      <div className="in-sec">
        <div className="in-sec-head">
          <h2>Active protocols</h2>
          <span className="meta">{window.PROTOCOLS.length} studies</span>
          <span className="spacer"/>
          <a className="link" href="../authoring/index.html">Open in authoring {I.arrowRight}</a>
        </div>
        <div className="in-table">
          <div className="in-thead" style={{ gridTemplateColumns: '110px 90px 1fr 130px 110px 110px 110px 36px' }}>
            <span>Protocol</span><span>Program</span><span>Indication · phase</span><span>Sites · enrolled</span><span>Lead</span><span>Status</span><span>Updated</span><span/>
          </div>
          {window.PROTOCOLS.map(p => (
            <div key={p.id} className="in-row" style={{ gridTemplateColumns: '110px 90px 1fr 130px 110px 110px 110px 36px' }}>
              <span className="id">{p.id}</span>
              <span className="prog">{p.program}</span>
              <span>
                <div className="name">{p.indication}</div>
                <div className="sub">{p.phase} · {p.amendments} amend</div>
              </span>
              <span className="num">{p.sites} sites<br/><span className="sub">{p.enrolled}</span></span>
              <span className="num">{p.lead}</span>
              <span><span className={`in-status ${p.status}`}><span className="dot"/>{p.status}</span></span>
              <span className="num">{p.updated}</span>
              <button className="in-tb-btn" onClick={(e) => e.stopPropagation()}>{I.more}</button>
            </div>
          ))}
        </div>
      </div>

      <div className="in-split">
        <div className="in-card">
          <h3>Endpoint library</h3>
          {window.ENDPOINTS.map((e, i) => (
            <div key={i} className="in-ep">
              <div>
                <div className="kind">{e.kind}</div>
                <div className="hint">{e.hint}</div>
                <div className="meta">{e.guidance}</div>
              </div>
              <div className="precedent"><span className="lbl">precedent</span>{e.precedent}</div>
            </div>
          ))}
        </div>
        <div className="in-card">
          <h3>Amendments</h3>
          {window.AMENDMENTS.map((a, i) => (
            <div key={i} className="row">
              <div className="k">
                <div>{a.id}</div>
                <div className="sub">{a.what}</div>
              </div>
              <div className="v">
                <div>{a.kind}</div>
                <div style={{ fontSize: 10.5 }}>{a.status} · {a.updated}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnaStrip activeNav="protocol" onAsk={onAsk}/>
    </>
  );
}

/* ─── CMC surface ────────────────────────────────────────────── */
function CmcSurface({ onAsk }) {
  const active = window.CMC_PACKAGES.filter(c => c.status !== 'commercial').length;
  const open = window.CMC_PACKAGES.reduce((a, c) => a + c.open, 0);
  return (
    <>
      <h1 className="in-h1">CMC Module</h1>
      <p className="in-sub">Drug substance and drug product packages, stability programs, batch records and open deviations across the portfolio.</p>

      <div className="in-kpis">
        <div className="in-kpi"><div className="lbl">Active CMC packages</div><div className="val">{active}</div><div className="sub">2 commercial (lifecycle)</div></div>
        <div className="in-kpi"><div className="lbl">Stability programs</div><div className="val">{window.STABILITY.length}</div><div className="sub">Avg {Math.round(window.STABILITY.reduce((a,s)=>a+s.pct,0)/window.STABILITY.length)}% complete</div></div>
        <div className="in-kpi"><div className="lbl">Batches on file</div><div className="val">{window.CMC_PACKAGES.reduce((a,c)=>a+c.batches,0)}</div><div className="sub">73 GMP · 12 PPQ</div></div>
        <div className="in-kpi"><div className="lbl">Open deviations</div><div className="val">{open}</div><div className="sub"><span className="delta-warn">2 critical</span> · 4 minor</div></div>
      </div>

      <div className="in-sec">
        <div className="in-sec-head">
          <h2>CMC packages</h2>
          <span className="meta">Drug substance + drug product</span>
          <span className="spacer"/>
          <a className="link" href="../authoring/index.html">Module 3 in authoring {I.arrowRight}</a>
        </div>
        <div className="in-table">
          <div className="in-thead" style={{ gridTemplateColumns: '90px 120px 130px 130px 120px 90px 90px 1fr 90px' }}>
            <span>Program</span><span>Kind</span><span>DS site</span><span>DP site</span><span>Shelf life</span><span>Batches</span><span>Stability</span><span>Open finding</span><span>Status</span>
          </div>
          {window.CMC_PACKAGES.map((c, i) => (
            <div key={i} className="in-row" style={{ gridTemplateColumns: '90px 120px 130px 130px 120px 90px 90px 1fr 90px' }}>
              <span className="prog">{c.program}</span>
              <span className="name">{c.kind}</span>
              <span className="num">{c.ds_site}</span>
              <span className="num">{c.dp_site}</span>
              <span className="num">{c.shelf}</span>
              <span className="num">{c.batches}</span>
              <span className="num">{c.stability_pct}%</span>
              <span className="sub" style={{ color: c.blocker ? 'var(--text-200)' : '#5a6e44', fontSize: 11.5 }}>
                {c.blocker || 'No open findings'}
              </span>
              <span><span className={`in-status ${c.status}`}><span className="dot"/>{c.status}</span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="in-split">
        <div className="in-card">
          <h3>Stability programs</h3>
          {window.STABILITY.map((s, i) => (
            <div key={i} className="row">
              <div className="k">
                <div>{s.program} · {s.kind}</div>
                <div className="sub">Target {s.timepoint} · completed {s.completed}</div>
              </div>
              <div className="v">{s.pct}%</div>
            </div>
          ))}
        </div>
        <div className="in-card">
          <h3>Specification library</h3>
          <div className="row"><div className="k">Drug substance (mAb · IgG1κ)<div className="sub">ICH Q6B aligned · 23 CQAs</div></div><div className="v">v4.1</div></div>
          <div className="row"><div className="k">Drug substance (ADC)<div className="sub">DAR + free payload spec under negotiation</div></div><div className="v">v2.3</div></div>
          <div className="row"><div className="k">Drug substance (small molecule)<div className="sub">ICH Q6A aligned · ICH Q3D elementals</div></div><div className="v">v5.0</div></div>
          <div className="row"><div className="k">Drug product (5 / 10 mg/mL)<div className="sub">USP &lt;1207&gt; CCI methods</div></div><div className="v">v3.2</div></div>
        </div>
      </div>

      <AnaStrip activeNav="cmc" onAsk={onAsk}/>
    </>
  );
}

/* ─── Biostat surface ────────────────────────────────────────── */
function BiostatSurface({ onAsk }) {
  const drafted = window.SAPS.filter(s => s.status === 'drafted').length;
  const review  = window.SAPS.filter(s => s.status === 'review').length;
  return (
    <>
      <h1 className="in-h1">Biostatistics</h1>
      <p className="in-sub">Statistical analysis plans, sample size studies, TLF packages and pre-planned interim analyses across active studies.</p>

      <div className="in-kpis">
        <div className="in-kpi"><div className="lbl">Active SAPs</div><div className="val">{window.SAPS.length}</div><div className="sub">{review} in review · {drafted} drafted</div></div>
        <div className="in-kpi"><div className="lbl">Power studies open</div><div className="val">3</div><div className="sub">BX204-301 · BX513-201 · BX301-101</div></div>
        <div className="in-kpi"><div className="lbl">TLF builds queued</div><div className="val">{window.TLF_QUEUE.length}</div><div className="sub">Earliest due in 20 days</div></div>
        <div className="in-kpi"><div className="lbl">Interim analyses</div><div className="val">{window.INTERIMS.length}</div><div className="sub">All DSMB pre-planned</div></div>
      </div>

      <div className="in-sec">
        <div className="in-sec-head">
          <h2>Statistical analysis plans</h2>
          <span className="meta">Active SAPs across active studies</span>
          <span className="spacer"/>
          <a className="link" href="../authoring/index.html">Open in authoring {I.arrowRight}</a>
        </div>
        <div className="in-table">
          <div className="in-thead" style={{ gridTemplateColumns: '170px 80px 110px 1fr 140px 110px 100px 110px' }}>
            <span>SAP</span><span>Program</span><span>Study</span><span>Primary endpoint</span><span>Power / size</span><span>Owner</span><span>Status</span><span>Updated</span>
          </div>
          {window.SAPS.map((s, i) => (
            <div key={i} className="in-row" style={{ gridTemplateColumns: '170px 80px 110px 1fr 140px 110px 100px 110px' }}>
              <span className="id">{s.id}</span>
              <span className="prog">{s.program}</span>
              <span className="num">{s.study}</span>
              <span>
                <div className="name">{s.primary}</div>
                <div className="sub">{s.alpha} · {s.power}</div>
              </span>
              <span className="num">{s.size}</span>
              <span className="num">{s.owner}</span>
              <span><span className={`in-status ${s.status}`}><span className="dot"/>{s.status}</span></span>
              <span className="num">{s.updated}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="in-split">
        <div className="in-card">
          <h3>TLF queue</h3>
          {window.TLF_QUEUE.map((t, i) => (
            <div key={i} className="row">
              <div className="k">
                <div>{t.id} · {t.program}</div>
                <div className="sub">{t.what} · due in {t.dueIn}</div>
              </div>
              <div className="v">
                <div>{t.pct}%</div>
                <div style={{ fontSize: 10.5 }}><span className={`in-status ${t.status}`}><span className="dot"/>{t.status}</span></div>
              </div>
            </div>
          ))}
          <div style={{ borderTop: '1px dashed #e8e6dc', paddingTop: 10, marginTop: 6 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Interim analyses</h3>
            {window.INTERIMS.map((it, i) => (
              <div key={i} className="row">
                <div className="k">{it.study} · {it.kind}<div className="sub">{it.dsmb}</div></div>
                <div className="v">{it.date}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="in-card">
          <h3>Sample-size calculator</h3>
          <div className="in-calc">
            <div className="grid">
              <div><label>Alpha (1-sided)</label><input defaultValue={window.SAMPLE_SIZE.alpha}/></div>
              <div><label>Power</label><input defaultValue={window.SAMPLE_SIZE.power}/></div>
              <div><label>Effect (delta)</label><input defaultValue={window.SAMPLE_SIZE.delta}/></div>
              <div><label>Std dev</label><input defaultValue={window.SAMPLE_SIZE.sd}/></div>
            </div>
            <div className="out">
              <span className="lbl">Sample size</span>
              <span className="val">{window.SAMPLE_SIZE.expected}</span>
              <span className="unit">subjects (240/240)</span>
            </div>
          </div>
        </div>
      </div>

      <AnaStrip activeNav="biostat" onAsk={onAsk}/>
    </>
  );
}

/* ─── Reports surface ────────────────────────────────────────── */
function ReportsSurface({ onAsk }) {
  const k = window.REPORT_KPIS;
  return (
    <>
      <h1 className="in-h1">Reports</h1>
      <p className="in-sub">Readiness dashboards, timeline forecasting and precedent-likelihood models. Read-only — drives decisions, not edits.</p>

      <div className="in-kpis">
        <div className="in-kpi"><div className="lbl">Programs tracked</div><div className="val">{k.programs}</div><div className="sub">Across MDX + Biopharma</div></div>
        <div className="in-kpi"><div className="lbl">Avg readiness</div><div className="val">{k.ready_avg}<span className="unit">%</span></div><div className="sub"><span className="delta-up">+4</span> vs last week</div></div>
        <div className="in-kpi"><div className="lbl">Forecast confidence</div><div className="val">{(k.forecast_conf*100).toFixed(0)}<span className="unit">%</span></div><div className="sub">model: ridge + historical reviewer-velocity</div></div>
        <div className="in-kpi"><div className="lbl">Precedent matches</div><div className="val">{k.precedent_hits.toLocaleString()}</div><div className="sub">RIM cross-agency corpus</div></div>
      </div>

      <div className="in-split">
        <div className="in-card">
          <h3>Submission readiness · by program</h3>
          <div className="in-bars" style={{ marginTop: 4 }}>
            {window.REPORT_BARS.map((b, i) => (
              <div key={i} className="in-bar-row">
                <span className="label">{b.label}</span>
                <span className="track"><span className={`fill ${b.tone === 'ok' ? '' : b.tone}`} style={{ width: b.pct + '%' }}/></span>
                <span className="pct">{b.pct}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="in-card">
          <h3>Precedent-likelihood models</h3>
          {window.PRECEDENT_MODELS.map((m, i) => (
            <div key={i} className="row" style={{ gridTemplateColumns: 'minmax(0,1fr) 110px' }}>
              <div className="k">
                <div>{m.name}</div>
                <div className="sub">Applied to {m.programs}</div>
                <div className="sub" style={{ fontSize: 10.5, fontStyle:'italic' }}>{m.basis}</div>
              </div>
              <div className="v" style={{ fontWeight: 600 }}>{m.output}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="in-sec">
        <div className="in-sec-head">
          <h2>Timeline forecast vs target</h2>
          <span className="meta">Next milestones · {window.FORECAST.length} programs</span>
          <span className="spacer"/>
          <a className="link" href="#">Export PDF {I.right}</a>
        </div>
        <div className="in-table">
          <div className="in-thead" style={{ gridTemplateColumns: '170px 1fr 130px 130px 90px 90px' }}>
            <span>Program</span><span>Milestone</span><span>Target</span><span>Forecast</span><span>Δ</span><span>Conf.</span>
          </div>
          {window.FORECAST.map((f, i) => (
            <div key={i} className="in-row" style={{ gridTemplateColumns: '170px 1fr 130px 130px 90px 90px' }}>
              <span className="prog">{f.program}</span>
              <span className="name">{f.milestone}</span>
              <span className="num">{f.target}</span>
              <span className="num">{f.forecast}</span>
              <span className="num" style={{ color: f.delta.startsWith('−') ? '#5a6e44' : '#d97706', fontWeight: 600 }}>{f.delta}</span>
              <span className="num">{(f.conf*100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      <AnaStrip activeNav="reporting" onAsk={onAsk}/>
    </>
  );
}

window.IntSurfaces = { Rail, TopBar, ProtocolSurface, CmcSurface, BiostatSurface, ReportsSurface };

})();
