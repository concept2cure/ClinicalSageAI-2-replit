/* global React, I, MDX_PROGRAMS, MDX_HEALTH, MDX_STUBS, K510_STAGES, K510_PREDICATES, K510_SE_ROWS, K510_ESTAR, PMA_PHASES, PMA_MODULES, PMA_TRIAL_METRICS, CER_SIGNALS, CER_LITERATURE, CER_EXPORT, EDITOR_PROGRAM */
const { useState, useMemo } = React;

const PATHWAY_LABEL = { k510: '510(k)', pma: 'PMA', cer: 'CER' };

/* Inline "Ask AnA about this" affordance — sparkle icon, hover-revealed, no pulse.
   Uses the row's context to pre-fill a gateway call.

   Rendered as a <span role="button"> because it's placed inside clickable
   <button> rows (program cards, list rows) — nesting <button> in <button> is
   a React/DOM warning and breaks keyboard focus + screen readers. The span
   version stops propagation so clicking the chip does NOT open the parent row,
   and supports Enter/Space for keyboard users. */
function AskAnaChip({ onAsk, label = 'Ask AnA', className = '' }) {
  const fire = (e) => { e.stopPropagation(); onAsk && onAsk(); };
  return (
    <span
      className={`ask-ana-chip ${className}`}
      role="button"
      tabIndex={0}
      onClick={fire}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(e); }
      }}
      title={label}
      aria-label={label}
    >
      <span className="ico">{I.sparkles}</span>
    </span>
  );
}

/* ═══════════ Overview ═══════════ */
function OverviewSurface({ onOpenProgram, onAskAna }) {
  const GRID_THRESHOLD = 12;
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('mdx.viewMode') : null;
  const defaultView = stored || (MDX_PROGRAMS.length > GRID_THRESHOLD ? 'list' : 'grid');
  const [view, setView] = useState(defaultView);
  const [pathFilter, setPathFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const setViewPersist = (v) => {
    setView(v);
    if (typeof localStorage !== 'undefined') localStorage.setItem('mdx.viewMode', v);
  };

  const programs = useMemo(() => MDX_PROGRAMS.filter(p =>
    (pathFilter === 'all' || p.pathway === pathFilter) &&
    (statusFilter === 'all' || p.status === statusFilter)
  ), [pathFilter, statusFilter]);

  const counts = {
    all: MDX_PROGRAMS.length,
    k510: MDX_PROGRAMS.filter(p => p.pathway === 'k510').length,
    pma: MDX_PROGRAMS.filter(p => p.pathway === 'pma').length,
    cer: MDX_PROGRAMS.filter(p => p.pathway === 'cer').length,
    active: MDX_PROGRAMS.filter(p => p.status === 'active').length,
    blocked: MDX_PROGRAMS.filter(p => p.status === 'blocked').length,
    idle: MDX_PROGRAMS.filter(p => p.status === 'idle').length,
    complete: MDX_PROGRAMS.filter(p => p.status === 'complete').length,
  };

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Device portfolio health</div>
          <div className="section-sub">{MDX_PROGRAMS.length} active programs across 510(k), PMA and CER pathways</div>
        </div>
        <button className="section-more">Readiness report {I.right}</button>
      </div>
      <div className="health">
        {MDX_HEALTH.map((d, i) => (
          <div key={i} className="health-card">
            <div className="health-label">{d.label}</div>
            <div className="health-metric">
              {d.metric}{d.unit && <span className="unit">{d.unit}</span>}
            </div>
            {d.bar && (
              <div className="readiness"><div className={`readiness-fill ${d.bar.tone || ''}`} style={{ width: `${d.bar.pct}%` }}/></div>
            )}
            <div className={`health-meta ${d.tone || ''}`}>{d.meta}</div>
          </div>
        ))}
      </div>

      <div className="section-hdr">
        <div>
          <div className="section-title">Programs</div>
          <div className="section-sub">{programs.length} of {MDX_PROGRAMS.length} shown</div>
        </div>
        <button className="section-more">New program {I.right}</button>
      </div>

      <div className="view-toolbar">
        <div className="chipset">
          <span style={{fontSize:10,color:'var(--text-400)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginRight:2}}>Pathway</span>
          <button className="chip" data-on={pathFilter === 'all'}  onClick={() => setPathFilter('all')}>All <span className="count">{counts.all}</span></button>
          <button className="chip" data-on={pathFilter === 'k510'} onClick={() => setPathFilter('k510')}>510(k) <span className="count">{counts.k510}</span></button>
          <button className="chip" data-on={pathFilter === 'pma'}  onClick={() => setPathFilter('pma')}>PMA <span className="count">{counts.pma}</span></button>
          <button className="chip" data-on={pathFilter === 'cer'}  onClick={() => setPathFilter('cer')}>CER <span className="count">{counts.cer}</span></button>
        </div>
        <div className="chipset" style={{marginLeft:8}}>
          <span style={{fontSize:10,color:'var(--text-400)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginRight:2}}>Status</span>
          <button className="chip" data-on={statusFilter === 'all'}      onClick={() => setStatusFilter('all')}>All</button>
          <button className="chip" data-on={statusFilter === 'active'}   onClick={() => setStatusFilter('active')}><span className="status-dot active"/> Active <span className="count">{counts.active}</span></button>
          <button className="chip" data-on={statusFilter === 'blocked'}  onClick={() => setStatusFilter('blocked')}><span className="status-dot blocked"/> Blocked <span className="count">{counts.blocked}</span></button>
          <button className="chip" data-on={statusFilter === 'idle'}     onClick={() => setStatusFilter('idle')}><span className="status-dot idle"/> Idle <span className="count">{counts.idle}</span></button>
        </div>
        <div className="view-spacer"/>
        <div className="view-toggle" role="group" aria-label="View mode">
          <button aria-pressed={view === 'grid'} onClick={() => setViewPersist('grid')} title="Grid view">{I.grid} Grid</button>
          <button aria-pressed={view === 'list'} onClick={() => setViewPersist('list')} title="List view">{I.menu || I.list} List</button>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="programs">
          {programs.map(p => (
            <button key={p.id} className="pg-card" onClick={() => onOpenProgram(p)}>
              <div className="pg-head">
                <div>
                  <div className="pg-title">{p.title}</div>
                  <div className="pg-code">{p.code} · Lead: {p.lead}</div>
                </div>
                <span className={`status-chip ${p.status}`}><span className={`status-dot ${p.status}`}/> {p.status}</span>
                {onAskAna && <AskAnaChip onAsk={() => onAskAna(`Summarize status and risks for ${p.title}`)} label={`Ask AnA about ${p.code}`}/>}
              </div>
              <div className="pg-stage">
                <div className="pg-stage-label">
                  <span>{p.stage}</span>
                  <span className="r">{p.readiness}% ready</span>
                </div>
                <div className="pg-bar">
                  <div className={`pg-bar-fill ${p.status === 'blocked' ? 'warn' : p.status === 'complete' ? '' : ''}`}
                       style={{ width: `${p.readiness}%`, background: p.status === 'blocked' ? 'var(--warning)' : p.status === 'complete' ? 'var(--success)' : 'var(--accent-100)' }}/>
                </div>
              </div>
              {p.nextBlocker ? (
                <div className="pg-blocker">
                  <span className="ico">{I.alertCircle}</span>
                  <span className="txt">{p.nextBlocker}</span>
                </div>
              ) : (
                <div className="pg-blocker" style={{background:'var(--bg-050)',borderLeftColor:'var(--success)'}}>
                  <span className="ico" style={{color:'var(--success)'}}>{I.check}</span>
                  <span className="txt">No open blockers</span>
                </div>
              )}
              <div className="pg-foot">
                <span>{p.meta}</span>
                <div className="pg-owners">
                  {p.owners.map((o, i) => <span key={i} className="pg-owner">{o}</span>)}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="pg-list">
          <div className="pg-list-hdr">
            <div>Program</div>
            <div>Pathway</div>
            <div>Stage / Readiness</div>
            <div>Next blocker</div>
            <div>Lead</div>
            <div style={{textAlign:'right'}}>Due / Activity</div>
          </div>
          {programs.map(p => (
            <button key={p.id} className="pg-list-row" onClick={() => onOpenProgram(p)}>
              <div>
                <div className="pg-list-title">{p.title}</div>
                <div className="pg-list-sub">{p.code}</div>
              </div>
              <div>
                <span className={`path-chip ${p.pathway}`}><span className={`status-dot ${p.status}`}/> {PATHWAY_LABEL[p.pathway]}</span>
              </div>
              <div className="pg-list-stage">
                <span className="s">{p.stage}</span>
                <span className="r">
                  <span className="pct">{p.readiness}%</span>
                  <span className="pg-bar"><span className="pg-bar-fill" style={{ width: `${p.readiness}%`, background: p.status === 'blocked' ? 'var(--warning)' : p.status === 'complete' ? 'var(--success)' : 'var(--accent-100)', display:'block', height:'100%' }}/></span>
                </span>
              </div>
              <div className={`pg-list-blocker ${p.nextBlocker ? '' : 'none'}`}>
                <span className="ico">{p.nextBlocker ? I.alertCircle : I.check}</span>
                <span className="txt">{p.nextBlocker || 'No open blockers'}</span>
              </div>
              <div className="pg-list-owner">{p.lead.split(' ').map(s => s[0]).join('')}</div>
              <div className="pg-list-due">
                <span>{p.dueLabel}</span>
                <span className="act">{p.lastActivity}</span>
                {onAskAna && <AskAnaChip onAsk={() => onAskAna(`Summarize status and risks for ${p.title}`)} label={`Ask AnA about ${p.code}`}/>}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ═══════════ 510(k) ═══════════ */
function K510Surface({ program, onAskAna, onOpenEditor }) {
  const activeStageIdx = program ? program.stageIdx : 4;
  const programStatus  = program ? program.status : 'active';
  const [selected, setSelected] = useState(new Set(['K221847']));
  const toggle = (k) => {
    const n = new Set(selected);
    if (n.has(k)) n.delete(k); else n.add(k);
    if (n.size === 0) n.add(k); // never fully empty
    setSelected(n);
  };
  const selectedList = K510_PREDICATES.filter(p => selected.has(p.k));
  const multi = selectedList.length > 1;
  const subjectName = program ? program.title : 'BX-204 CGM';

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">510(k) pathway · {program ? program.title : 'BX-204 Continuous Glucose Monitor'}</div>
          <div className="section-sub">Stage {activeStageIdx + 1} of 7 — {K510_STAGES[activeStageIdx]?.label} · {program ? program.dueLabel : 'FDA filing · 41 days'}</div>
        </div>
        <button className="section-more" onClick={() => onOpenEditor && onOpenEditor(11)}>
          Open §11 in editor {I.arrowRight}
        </button>
        <button className="section-more" style={{ marginLeft: 8 }}>Export eSTAR {I.download}</button>
      </div>

      <div className="stage-strip">
        {K510_STAGES.map((s, i) => {
          const stateClass = i < activeStageIdx
            ? 'complete'
            : i === activeStageIdx
              ? (programStatus === 'blocked' ? 'blocked' : 'active')
              : 'idle';
          return (
            <div key={s.id} className={`stage-node ${stateClass}`}>
              <div className="stage-dot">
                {i < activeStageIdx ? I.check : i + 1}
              </div>
              <div className="stage-label">{s.label}</div>
              <div className="stage-meta">{s.meta}</div>
            </div>
          );
        })}
      </div>

      <div className="col2">
        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Predicate search · K-numbers</div>
                <div className="s">{selected.size} of 6 selected · ranked by similarity · check 2+ for side-by-side</div>
              </div>
              <div className="actions">
                <button className="tb-btn" title="Filter">{I.filter}</button>
                <button className="tb-btn" title="Refine query">{I.sparkles}</button>
              </div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="cb"></th>
                  <th>K-number</th><th>Device</th><th>Cleared</th><th>Match</th><th>Diffs</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {K510_PREDICATES.map(p => {
                  const isSel = selected.has(p.k);
                  return (
                    <tr key={p.k} className={isSel ? 'multi-selected' : ''} onClick={() => toggle(p.k)}>
                      <td className="cb" onClick={(e) => { e.stopPropagation(); toggle(p.k); }}>
                        <span className="cbox" data-on={isSel}>{I.check}</span>
                      </td>
                      <td><span className="k-num">{p.k}</span></td>
                      <td>
                        <div className="k-name">{p.name}</div>
                        <div className="k-holder">{p.holder}</div>
                      </td>
                      <td className="k-date">{p.cleared}</td>
                      <td>
                        <div className="match-cell">
                          <div className="match-bar">
                            <div className={`match-bar-fill ${p.match >= 80 ? '' : p.match >= 60 ? 'warn' : 'err'}`} style={{ width: `${p.match}%` }}/>
                          </div>
                          <span className="match-pct">{p.match}%</span>
                        </div>
                      </td>
                      <td style={{color:'var(--text-300)', fontVariantNumeric:'tabular-nums'}}>{p.diffs}</td>
                      <td><span className={`status-pill ${p.status}`}>{p.status}</span>
                        {onAskAna && <AskAnaChip onAsk={() => onAskAna(`Compare predicate ${p.k} (${p.name}) against subject device`)} label={`Ask AnA about ${p.k}`}/>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Substantial equivalence matrix</div>
                <div className="s">{subjectName} vs. {multi ? `${selectedList.length} predicates` : selectedList[0]?.name}</div>
              </div>
              <div className="actions">
                <button className="tb-btn" title="Export">{I.download}</button>
              </div>
            </div>
            {multi ? (
              <>
                <div className="se-matrix-multi header" style={{gridTemplateColumns: `160px 1fr ${selectedList.map(()=>'1fr').join(' ')}`}}>
                  <div>Attribute</div>
                  <div className="col-subject">{subjectName}</div>
                  {selectedList.map(p => <div key={p.k} className="col-predicate">{p.k}</div>)}
                </div>
                {K510_SE_ROWS.map((r, i) => (
                  <div key={i} className="se-matrix-multi" style={{gridTemplateColumns: `160px 1fr ${selectedList.map(()=>'1fr').join(' ')}`}}>
                    <div className="se-attr">{r.attr}</div>
                    <div className="se-val">{r.subject}</div>
                    {selectedList.map(p => (
                      <div key={p.k} className="se-val" style={{color:'var(--text-300)'}}>{r.predicate}</div>
                    ))}
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="se-row header">
                  <div>Attribute</div>
                  <div>{subjectName} (Subject)</div>
                  <div style={{textAlign:'center'}}>Verdict</div>
                  <div>{selectedList[0]?.k} (Predicate)</div>
                </div>
                {K510_SE_ROWS.map((r, i) => (
                  <React.Fragment key={i}>
                    <div className="se-row">
                      <div className="se-attr">{r.attr}</div>
                      <div className="se-val">{r.subject}</div>
                      <div className={`se-verdict ${r.verdict}`}>
                        {r.verdict === 'same' && I.check}
                        {r.verdict === 'equivalent' && I.eq}
                        {r.verdict === 'different' && I.minus}
                      </div>
                      <div className="se-val">{r.predicate}</div>
                      {r.note && <div className="se-note">{r.note}</div>}
                    </div>
                  </React.Fragment>
                ))}
              </>
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">eSTAR sections</div>
                <div className="s">20 sections · 1 blocker</div>
              </div>
              <div className="actions">
                <button className="tb-btn" title="Validate">{I.play}</button>
              </div>
            </div>
            <div className="estar">
              {K510_ESTAR.map(s => (
                <button
                  key={s.id}
                  className={`estar-row ${s.blocker ? 'blocker' : ''}`}
                  onClick={() => onOpenEditor && onOpenEditor(s.id)}
                  title={`Open ${s.label} in editor`}
                >
                  <div className="estar-num">§{String(s.id).padStart(2, '0')}</div>
                  <div className="estar-label">{s.label}</div>
                  <span className={`status-pill ${s.status}`}>{s.status}</span>
                  <span className="estar-open">{I.arrowRight}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════ PMA ═══════════ */
function PMASurface({ onAskAna }) {
  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">PMA pathway · CV-330 Implantable Monitor</div>
          <div className="section-sub">Phase 5 of 10 — Pivotal trial enrollment · PMA filing Q3 2026</div>
        </div>
        <button className="section-more">Phase report {I.right}</button>
      </div>

      <div className="phases">
        {PMA_PHASES.map((p, i) => (
          <div key={p.id} className={`phase ${p.status || 'idle'}`}>
            <div className="phase-label">{i + 1}. {p.label}</div>
            <div className="phase-bar">
              <div className="phase-bar-fill" style={{ width: `${p.pct}%` }}/>
            </div>
            <div className="phase-pct" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>{p.pct}%</span>
              <span className={`status-dot ${p.status || 'idle'}`}/>
            </div>
          </div>
        ))}
      </div>

      <div className="health">
        {PMA_TRIAL_METRICS.map((d, i) => (
          <div key={i} className="health-card">
            <div className="health-label">{d.label}</div>
            <div className="health-metric">
              {d.metric}{d.unit && <span className="unit">{d.unit}</span>}
            </div>
            {d.bar && <div className="readiness"><div className={`readiness-fill ${d.bar.tone || ''}`} style={{ width: `${d.bar.pct}%` }}/></div>}
            <div className={`health-meta ${d.tone || ''}`}>{d.meta}</div>
          </div>
        ))}
      </div>

      <div className="section-hdr">
        <div>
          <div className="section-title">PMA modules</div>
          <div className="section-sub">Section-by-section assembly · 135 documents total</div>
        </div>
      </div>
      <div className="pma-modules">
        {PMA_MODULES.map(m => (
          <button key={m.id} className="pma-mod">
            <div className="pma-mod-hdr">
              <div className="pma-mod-label">{m.label}</div>
              <span className={`status-pill ${m.status}`}>{m.status}</span>
            </div>
            <div className="pma-mod-desc">{m.desc}</div>
            <div className="pma-mod-foot">
              <span>{m.docs} documents</span>
              <span>{I.chevronRight}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

/* ═══════════ CER ═══════════ */
function CERSurface({ onAskAna }) {
  const maxHits = Math.max(...CER_LITERATURE.map(l => l.hits));
  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Clinical Evaluation Report · IV-415 Companion Diagnostic</div>
          <div className="section-sub">EU MDR Article 61 · Notified body review Q1 2026</div>
        </div>
        <button className="section-more">Generate draft {I.sparkles}</button>
      </div>

      <div className="col2">
        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Safety signals</div>
                <div className="s">7 signals · 4 included · 1 excluded · 2 under review</div>
              </div>
              <div className="actions">
                <button className="tb-btn" title="Filter">{I.filter}</button>
                <button className="tb-btn" title="Run signal scan">{I.zap}</button>
              </div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>ID</th><th>Source</th><th>Event</th><th>N</th><th>Severity</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {CER_SIGNALS.map(s => (
                  <tr key={s.id}>
                    <td><span className="k-num">{s.id}</span></td>
                    <td style={{color:'var(--text-400)',fontSize:11}}>{s.source}</td>
                    <td>
                      <div className="k-name" style={{fontWeight:400,fontSize:12}}>{s.event}</div>
                      <div className="k-holder">{s.assess}</div>
                    </td>
                    <td style={{fontVariantNumeric:'tabular-nums',color:'var(--text-200)'}}>{s.count}</td>
                    <td><span className={`status-pill ${s.severity}`}>{s.severity}</span></td>
                    <td><span className={`status-pill ${s.status}`}>{s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Literature corpus</div>
                <div className="s">2,326 hits · PubMed · Embase · Cochrane · 6-year window</div>
              </div>
              <div className="actions">
                <button className="tb-btn" title="Refine search">{I.search}</button>
              </div>
            </div>
            <div style={{padding:'12px 0'}}>
              {CER_LITERATURE.map(l => (
                <div key={l.year} className="litbar">
                  <span className="yr">{l.year}</span>
                  <div className="bar"><div className="bar-fill" style={{ width: `${(l.hits/maxHits)*100}%` }}/></div>
                  <span className="ct">{l.hits.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">CER sections</div>
                <div className="s">Article 61 template · 6 sections</div>
              </div>
              <div className="actions">
                <button className="tb-btn" title="Export">{I.download}</button>
              </div>
            </div>
            <div className="estar">
              {CER_EXPORT.map((s, i) => (
                <div key={s.id} className="estar-row">
                  <div className="estar-num">{String(i + 1).padStart(2, '0')}</div>
                  <div className="estar-label">{s.label}</div>
                  <span className={`status-pill ${s.status}`}>{s.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Generation plan</div>
                <div className="s">AnA will draft from included signals + literature</div>
              </div>
            </div>
            <div className="panel-body pad" style={{display:'flex',flexDirection:'column',gap:10}}>
              <div style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:12,color:'var(--text-200)',lineHeight:1.5}}>
                <span style={{color:'var(--accent-100)',flexShrink:0}}>{I.sparkles}</span>
                <span>Generate <b>Clinical data summary</b> from 4 included signals and 412 literature hits (2025)</span>
              </div>
              <div style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:12,color:'var(--text-200)',lineHeight:1.5}}>
                <span style={{color:'var(--accent-100)',flexShrink:0}}>{I.sparkles}</span>
                <span>Draft <b>Safety and risk-benefit</b> with adjudicated lead-dislodgement cases</span>
              </div>
              <div style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:12,color:'var(--text-200)',lineHeight:1.5}}>
                <span style={{color:'var(--accent-100)',flexShrink:0}}>{I.sparkles}</span>
                <span>Complete <b>PMS plan</b> using FAERS signal trajectory</span>
              </div>
              <button style={{marginTop:6,padding:'8px 14px',background:'var(--accent-100)',color:'var(--text-000)',borderRadius:'var(--radius-md)',fontSize:12,fontWeight:500,alignSelf:'flex-start'}}>
                Draft with AnA
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════ Precedent Intelligence (stub, coherent) ═══════════ */
function PrecedentSurface({ onAskAna }) {
  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Precedent intelligence</div>
          <div className="section-sub">Cross-pathway predicate and precedent search across FDA, EMA and PMDA</div>
        </div>
      </div>
      <div className="col2">
        <div className="panel">
          <div className="panel-hdr"><div><div className="t">Saved queries</div></div></div>
          <div className="estar">
            {[
              { q: 'CGM sensor 14-day wear', hits: 47 },
              { q: 'IVD cartridge 14 analytes', hits: 23 },
              { q: 'Implantable cardiac monitor', hits: 182 },
              { q: 'SaMD Class II — clinical decision support', hits: 419 },
            ].map((p, i) => (
              <div key={i} className="estar-row">
                <div className="estar-num">{String(i + 1).padStart(2, '0')}</div>
                <div className="estar-label">{p.q}</div>
                <span style={{fontSize:11,color:'var(--text-300)',fontVariantNumeric:'tabular-nums'}}>{p.hits} hits</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-hdr"><div><div className="t">Cross-agency precedent patterns</div></div></div>
          <div className="panel-body pad" style={{fontSize:12,color:'var(--text-200)',lineHeight:1.6}}>
            <p style={{margin:'0 0 12px'}}>Trends AnA has surfaced across your portfolio:</p>
            <ul style={{margin:0,paddingLeft:18,display:'flex',flexDirection:'column',gap:8}}>
              <li>CGM 14-day wear clearances: <b>12 of 14</b> cleared via 510(k) since 2022. Common additional test: <b>ISO 10993-11</b>.</li>
              <li>FDA feedback pattern: 78% of first-round AI-responses on CGMs cite <b>accuracy sub-analyses by age band</b>.</li>
              <li>EU MDR Article 61 literature thresholds: notified bodies flag &lt;250 hits as "insufficient clinical evidence".</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════ In-design empty state (rail stubs) ═══════════ */
function InDesignSurface({ stub }) {
  if (!stub) return null;
  return (
    <div className="indesign">
      <div className="indesign-icon">{I[stub.icon] || I.alertCircle}</div>
      <div className="indesign-phase">In design · {stub.phase}</div>
      <h2>{stub.title}</h2>
      <div className="indesign-desc">{stub.desc}</div>
    </div>
  );
}

Object.assign(window, { AskAnaChip, OverviewSurface, K510Surface, PMASurface, CERSurface, PrecedentSurface, InDesignSurface });
