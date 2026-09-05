/* global React, I, CER_GSPR, CER_EQUIV_DEVICES, CER_EQUIV_MATRIX, CER_PMS_KPIS, CER_PMS_COMPLAINTS, CER_PMCF_STUDIES, CER_PMS_TIMELINE, CERSurface, AskAnaChip */

/* ═══════════ CER Workbench ═══════════
   Wraps the existing CERSurface (Overview) with three additional surfaces
   that close gaps notified bodies routinely flag on Article 61 reports:
     · Conformity   — GSPR (Annex I) per-clause checklist
     · Equivalence  — Article 61(5) technical/biological/clinical matrix
     · PMS / PMCF   — Article 83 surveillance plan + Annex XIV Part B PMCF

   Each surface follows the existing CER vocabulary:
   section-hdr / panel / panel-hdr / status-pill / col2 / estar.
   No new CSS is introduced — we reuse the kit's primitives. */

var { useState, useMemo } = React;

const CER_TABS = [
  { id: 'overview',     label: 'Overview',           sub: 'Signals · literature · sections' },
  { id: 'conformity',   label: 'GSPR conformity',    sub: 'Annex I · 23 requirements' },
  { id: 'equivalence',  label: 'Equivalence',        sub: 'Article 61(5) matrix' },
  { id: 'pms',          label: 'PMS / PMCF',         sub: 'Article 83 · Annex XIV Part B' },
];

function CerTabBar({ active, setActive }) {
  return (
    <div className="cer-tabbar">
      {CER_TABS.map(t => (
        <button
          key={t.id}
          className={`cer-tab${active === t.id ? ' active' : ''}`}
          onClick={() => setActive(t.id)}
        >
          <span className="cer-tab-label">{t.label}</span>
          <span className="cer-tab-sub">{t.sub}</span>
        </button>
      ))}
    </div>
  );
}

/* ═══════════ Conformity · GSPR Annex I ═══════════ */
function CerConformity({ onAskAna }) {
  const [filter, setFilter] = useState('all'); // all | gap | partial | conform | na
  const counts = useMemo(() => {
    const c = { all: CER_GSPR.length, conform: 0, partial: 0, gap: 0, na: 0 };
    CER_GSPR.forEach(r => { c[r.status]++; });
    return c;
  }, []);
  const rows = filter === 'all' ? CER_GSPR : CER_GSPR.filter(r => r.status === filter);

  // Group by chapter
  const grouped = rows.reduce((acc, r) => {
    (acc[r.ch] = acc[r.ch] || []).push(r);
    return acc;
  }, {});
  const CHAPTERS = {
    'I':   'Chapter I · General requirements',
    'II':  'Chapter II · Design and manufacture',
    'III': 'Chapter III · Information supplied',
  };

  const conformPct = Math.round((counts.conform / counts.all) * 100);

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">GSPR conformity · Annex I</div>
          <div className="section-sub">EU MDR Annex I · 23 requirements · {conformPct}% conform · {counts.gap} gap{counts.gap === 1 ? '' : 's'} blocking submission</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button className="section-more">Export declaration {I.download}</button>
        </div>
      </div>

      {/* KPI strip — reuses the metric-card visual vocabulary already in the kit */}
      <div className="cer-metrics">
        <div className="metric-card" data-tone="ok">
          <div className="metric-label">Conform</div>
          <div className="metric-val">{counts.conform}</div>
          <div className="metric-meta">Evidence linked · narrative complete</div>
        </div>
        <div className="metric-card" data-tone="warn">
          <div className="metric-label">Partial</div>
          <div className="metric-val">{counts.partial}</div>
          <div className="metric-meta">Gap flagged in narrative</div>
        </div>
        <div className="metric-card" data-tone="err">
          <div className="metric-label">Gap</div>
          <div className="metric-val">{counts.gap}</div>
          <div className="metric-meta">Blocking · resolve before NB review</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Not applicable</div>
          <div className="metric-val">{counts.na}</div>
          <div className="metric-meta">Justification on file</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-hdr">
          <div>
            <div className="t">Requirement-by-requirement status</div>
            <div className="s">{rows.length} of {counts.all} shown · filter by status</div>
          </div>
          <div className="actions" style={{display:'flex',gap:6}}>
            {[
              { id:'all',     label:'All' },
              { id:'gap',     label:'Gap' },
              { id:'partial', label:'Partial' },
              { id:'conform', label:'Conform' },
              { id:'na',      label:'N/A' },
            ].map(f => (
              <button
                key={f.id}
                className={`tb-btn${filter === f.id ? ' active' : ''}`}
                onClick={() => setFilter(f.id)}
                style={{fontSize:11,padding:'4px 10px',height:'auto',width:'auto'}}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-body">
          {Object.keys(grouped).map(ch => (
            <div key={ch} className="gspr-group">
              <div className="gspr-chapter">{CHAPTERS[ch]}</div>
              <table className="tbl gspr-tbl">
                <thead>
                  <tr>
                    <th style={{width:'5%'}}>§</th>
                    <th style={{width:'32%'}}>Requirement</th>
                    <th style={{width:'12%'}}>Status</th>
                    <th style={{width:'28%'}}>Evidence</th>
                    <th>Gap / note</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[ch].map(r => (
                    <tr key={r.id}>
                      <td><span className="k-num">{r.id}</span></td>
                      <td><div className="k-name" style={{fontWeight:400,fontSize:12}}>{r.title}</div></td>
                      <td><span className={`status-pill ${r.status}`}>{r.status}</span></td>
                      <td style={{fontSize:11,color:'var(--text-300)'}}>{r.evidence}</td>
                      <td style={{fontSize:11,color:r.status === 'gap' ? 'var(--text-100)' : 'var(--text-300)',lineHeight:1.5}}>
                        {r.note || <span style={{color:'var(--text-400)'}}>—</span>}
                        {r.status === 'gap' && onAskAna && (
                          <AskAnaChip onAsk={() => onAskAna(`Help me close the GSPR §${r.id} gap: ${r.title}`)} label={`Ask AnA about §${r.id}`}/>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ═══════════ Equivalence · Article 61(5) ═══════════ */
function CerEquivalence({ onAskAna }) {
  const [eqDevice, setEqDevice] = useState('eqA');
  const eqDef = CER_EQUIV_DEVICES.find(d => d.id === eqDevice);

  // Verdict counts for the selected equivalent
  const verdicts = CER_EQUIV_MATRIX.map(r => r.verdicts[eqDevice]);
  const counts = {
    equivalent: verdicts.filter(v => v === 'equivalent').length,
    similar:    verdicts.filter(v => v === 'similar').length,
    different:  verdicts.filter(v => v === 'different').length,
  };

  // Group matrix by dimension
  const dims = CER_EQUIV_MATRIX.reduce((acc, r) => {
    (acc[r.dim] = acc[r.dim] || []).push(r);
    return acc;
  }, {});

  const verdictTone = { equivalent: 'good', similar: 'warn', different: 'bad' };

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Equivalence assessment · Article 61(5)</div>
          <div className="section-sub">MDCG 2020-5 conformity on technical, biological and clinical dimensions</div>
        </div>
        <button className="section-more">Generate justification {I.sparkles}</button>
      </div>

      {/* Subject vs equivalent device cards */}
      <div className="equiv-devices">
        <div className="equiv-card subject">
          <div className="equiv-card-tag">Subject device</div>
          <div className="equiv-card-name">{CER_EQUIV_DEVICES[0].label}</div>
          <div className="equiv-card-meta">{CER_EQUIV_DEVICES[0].vendor} · {CER_EQUIV_DEVICES[0].year}</div>
        </div>
        <div className="equiv-divider">vs</div>
        <div className="equiv-pickers">
          {CER_EQUIV_DEVICES.filter(d => d.id !== 'subj').map(d => (
            <button
              key={d.id}
              className={`equiv-card pick${eqDevice === d.id ? ' active' : ''}`}
              onClick={() => setEqDevice(d.id)}
            >
              <div className="equiv-card-tag">Claimed equivalent</div>
              <div className="equiv-card-name">{d.label}</div>
              <div className="equiv-card-meta">{d.vendor} · {d.cleared}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Verdict summary */}
      <div className="cer-metrics">
        <div className="metric-card" data-tone={counts.different > 0 ? 'err' : counts.similar > 2 ? 'warn' : 'ok'}>
          <div className="metric-label">Verdict</div>
          <div className="metric-val" style={{fontFamily:'var(--font-serif)',fontSize:20,lineHeight:1.2}}>
            {counts.different > 0 ? 'Cannot rely' : counts.similar > 2 ? 'Conditional' : 'Equivalent'}
          </div>
          <div className="metric-meta">
            {counts.different > 0
              ? 'Different on ≥1 criterion — cannot claim equivalence'
              : counts.similar > 2
                ? `${counts.similar} criteria similar — gap narrative required`
                : 'All criteria equivalent or within band'}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Equivalent</div>
          <div className="metric-val">{counts.equivalent}<span className="unit">/ {CER_EQUIV_MATRIX.length}</span></div>
          <div className="metric-meta">No further evidence needed</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Similar</div>
          <div className="metric-val">{counts.similar}<span className="unit">/ {CER_EQUIV_MATRIX.length}</span></div>
          <div className="metric-meta">Address each gap in CER narrative</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Different</div>
          <div className="metric-val">{counts.different}<span className="unit">/ {CER_EQUIV_MATRIX.length}</span></div>
          <div className="metric-meta">Equivalence not demonstrable</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-hdr">
          <div>
            <div className="t">Conformity matrix · IV-415 vs {eqDef.label}</div>
            <div className="s">Per MDCG 2020-5 §A.6 · all three dimensions must be conform</div>
          </div>
        </div>
        <div className="panel-body">
          {Object.keys(dims).map(dim => (
            <div key={dim} className="equiv-group">
              <div className="equiv-dim-hdr">{dim}</div>
              <table className="tbl equiv-tbl">
                <thead>
                  <tr>
                    <th style={{width:'30%'}}>Criterion</th>
                    <th style={{width:'14%'}}>Verdict</th>
                    <th>Justification</th>
                  </tr>
                </thead>
                <tbody>
                  {dims[dim].map((r, i) => (
                    <tr key={`${dim}-${i}`}>
                      <td><div className="k-name" style={{fontWeight:400,fontSize:12}}>{r.crit}</div></td>
                      <td><span className={`status-pill ${verdictTone[r.verdicts[eqDevice]]}`}>{r.verdicts[eqDevice]}</span></td>
                      <td style={{fontSize:11,color:'var(--text-300)',lineHeight:1.5}}>
                        {r.notes[eqDevice]}
                        {r.verdicts[eqDevice] !== 'equivalent' && onAskAna && (
                          <AskAnaChip onAsk={() => onAskAna(`Draft a gap-bridging narrative for "${r.crit}" between IV-415 and ${eqDef.label}`)} label="Ask AnA"/>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ═══════════ PMS / PMCF · Article 83 + Annex XIV Part B ═══════════ */
function CerPmsPmcf({ onAskAna }) {
  const totalEnrolled = CER_PMCF_STUDIES.reduce((s, x) => s + x.n, 0);
  const totalTarget   = CER_PMCF_STUDIES.reduce((s, x) => s + x.target, 0);
  const enrollPct     = Math.round((totalEnrolled / totalTarget) * 100);

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Post-market surveillance · IV-415</div>
          <div className="section-sub">Article 83 PMS plan v2.1 · Annex XIV Part B PMCF · next PSUR Q1 2026</div>
        </div>
        <button className="section-more">PSUR draft {I.sparkles}</button>
      </div>

      {/* KPI strip */}
      <div className="cer-metrics">
        {CER_PMS_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone === 'good' ? 'ok' : k.tone === 'warn' ? 'warn' : k.tone === 'bad' ? 'err' : undefined}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.value}<span className="unit">{k.delta}</span></div>
            <div className="metric-meta">{k.foot}</div>
          </div>
        ))}
      </div>

      <div className="col2">
        <div>
          {/* Complaint queue */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Complaint queue · last 35 days</div>
                <div className="s">5 of 47 shown · sorted by recency · open complaints first</div>
              </div>
              <div className="actions">
                <button className="tb-btn" title="Filter">{I.filter}</button>
                <button className="tb-btn" title="New complaint">{I.plus}</button>
              </div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Code</th><th>Category</th><th>Severity</th><th>Status</th><th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {CER_PMS_COMPLAINTS.map(c => (
                  <tr key={c.code}>
                    <td>
                      <span className="k-num">{c.code}</span>
                      <div className="k-holder">{c.received} · {c.source}</div>
                    </td>
                    <td><div className="k-name" style={{fontWeight:400,fontSize:12}}>{c.category}</div></td>
                    <td><span className={`status-pill ${c.severity}`}>{c.severity}</span></td>
                    <td><span className={`status-pill ${c.status}`}>{c.status}</span></td>
                    <td style={{fontSize:11,color:'var(--text-300)'}}>{c.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* PMCF studies */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">PMCF studies</div>
                <div className="s">{CER_PMCF_STUDIES.length} active · {totalEnrolled.toLocaleString()} of {totalTarget.toLocaleString()} enrolled · {enrollPct}%</div>
              </div>
            </div>
            <div className="panel-body">
              {CER_PMCF_STUDIES.map(st => {
                const pct = Math.round((st.n / st.target) * 100);
                return (
                  <div key={st.id} className="pmcf-row">
                    <div className="pmcf-row-hdr">
                      <div>
                        <span className="k-num">{st.id}</span>
                        <span className="pmcf-kind">{st.kind}</span>
                      </div>
                      <span className={`status-pill ${st.status === 'enrolling' ? 'in-progress' : 'review'}`}>{st.status}</span>
                    </div>
                    <div className="pmcf-primary">{st.primary}</div>
                    <div className="pmcf-meta">{st.site} · through {st.through}</div>
                    <div className="pmcf-bar">
                      <div className="pmcf-bar-fill" style={{ width: `${pct}%` }}/>
                      <span className="pmcf-bar-label">{st.n.toLocaleString()} / {st.target.toLocaleString()} ({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          {/* Reporting calendar */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Reporting calendar</div>
                <div className="s">PMS deliverables required by NB and competent authorities</div>
              </div>
            </div>
            <div className="estar">
              {CER_PMS_TIMELINE.map((t, i) => (
                <div key={i} className="estar-row">
                  <div className="estar-num">{String(i + 1).padStart(2, '0')}</div>
                  <div className="estar-label">
                    <div>{t.label}</div>
                    <div style={{fontSize:11,color:'var(--text-400)',marginTop:2}}>{t.when}</div>
                  </div>
                  <span className={`status-pill ${t.status}`}>{t.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AnA suggested actions */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">AnA · suggested actions</div>
                <div className="s">Drawn from open complaints, trend signals and overdue items</div>
              </div>
            </div>
            <div className="panel-body pad" style={{display:'flex',flexDirection:'column',gap:10}}>
              <div style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:12,color:'var(--text-200)',lineHeight:1.5}}>
                <span style={{color:'var(--accent-100)',flexShrink:0}}>{I.sparkles}</span>
                <span>Open <b>trend investigation</b> for lead dislodgement — 3 complaints in 30d crosses Article 88 threshold</span>
              </div>
              <div style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:12,color:'var(--text-200)',lineHeight:1.5}}>
                <span style={{color:'var(--accent-100)',flexShrink:0}}>{I.sparkles}</span>
                <span>Draft <b>PSUR Q1 2026</b> from PMCF interim and 47 complaints — due Mar 31</span>
              </div>
              <div style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:12,color:'var(--text-200)',lineHeight:1.5}}>
                <span style={{color:'var(--accent-100)',flexShrink:0}}>{I.sparkles}</span>
                <span>Pull <b>PMCF-2024-A</b> 24-month data into CER §6 safety narrative</span>
              </div>
              <button
                onClick={() => onAskAna && onAskAna('Draft PSUR Q1 2026 from PMS data and PMCF interim report')}
                style={{marginTop:6,padding:'8px 14px',background:'var(--accent-100)',color:'var(--text-000)',borderRadius:'var(--radius-md)',fontSize:12,fontWeight:500,alignSelf:'flex-start',border:'none',cursor:'pointer'}}
              >
                Draft PSUR with AnA
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════ Wrapper ═══════════ */
function CerWorkbench({ onAskAna, onOpenEditor, initialTab = 'overview' }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="cer-workbench">
      <CerTabBar active={tab} setActive={setTab}/>
      <div style={{display:'flex',justifyContent:'flex-end',padding:'10px 16px 0 16px',gap:8}}>
        <button className="section-more" onClick={onOpenEditor}>Open CER editor (§6) →</button>
      </div>
      <div className="cer-tab-body">
        {tab === 'overview'    && <CERSurface onAskAna={onAskAna}/>}
        {tab === 'conformity'  && <CerConformity onAskAna={onAskAna}/>}
        {tab === 'equivalence' && <CerEquivalence onAskAna={onAskAna}/>}
        {tab === 'pms'         && <CerPmsPmcf onAskAna={onAskAna}/>}
      </div>
    </div>
  );
}

Object.assign(window, { CerWorkbench });
