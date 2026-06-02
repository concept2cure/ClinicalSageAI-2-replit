/**
 * PDEV kit · Surfaces.jsx — 5 main surfaces:
 *   PdevOverview, PdevWorkstream, PdevAssembly, PdevFdaStream, PdevContradictions
 * Per PDEV_IND_DESIGN_BRIEF.md §2.1, §2.2, §2.4, §2.7, §2.8.
 */
(() => {
const {
  PdevI: I,
  PDEV_WORKSTREAMS, PDEV_WORKSTREAM_LABELS, PDEV_STAGES, PDEV_STAGE_LABELS,
  PDEV_STATE_LABELS, PDEV_COMPLETED_STATES, PDEV_BLOCKED_STATES,
  PDEV_ACTIVITIES, PDEV_IND_ASSEMBLY, PDEV_FDA_INTERACTIONS, PDEV_CONTRADICTIONS,
} = window;

function statePillClass(state) {
  if (PDEV_COMPLETED_STATES.includes(state)) return 'state-done';
  if (PDEV_BLOCKED_STATES.includes(state))   return 'state-blocked';
  if (state === 'ai_draft_generated' || state === 'evidence_linked') return 'state-ai';
  if (state === 'changes_requested') return 'state-warn-strong';
  if (state === 'human_review_required' || state === 'in_review' || state === 'agency_feedback_received') return 'state-warn';
  if (state === 'drafting') return 'state-flight';
  if (state === 'superseded') return 'state-neutral';
  return 'state-idle';
}

/* ────────── Overview (§2.1) ────────── */
function PdevOverview({ program, setActiveNav, onAskAna, onSnapshot }) {
  if (!program) return null;
  const findings = [
    { sev: 'critical', activity: 'nonclinical.glp_tox',          msg: 'GLP tox summary blocked by reviewer changes', owner: 'AM' },
    { sev: 'high',     activity: 'cmc.lot_release_specs',         msg: 'Lot release specs overdue 4d',                 owner: 'PS' },
    { sev: 'high',     activity: 'regulatory.feedback_rollup',    msg: 'FDA commitments unrolled into PDEV',           owner: 'JC' },
    { sev: 'medium',   activity: 'clinical.protocol_p1',          msg: 'Protocol v0.7 awaiting reviewer sign-off',     owner: 'MW' },
    { sev: 'medium',   activity: 'cmc.stability_program',         msg: 'Stability data still maturing for IND',        owner: 'PS' },
  ];
  const recentFda = [
    { kind: 'q_sub_commitment', title: 'Justify 28-day GLP duration', when: '3d ago' },
    { kind: 'q_sub_commitment', title: 'Provide 6-mo stability data', when: '3d ago' },
    { kind: 'q_sub_meeting',    title: 'Pre-IND written response',    when: '3d ago' },
  ];
  const recentAudit = [
    { who: 'JC', what: 'requested changes on nonclinical.glp_tox',     when: '4h ago' },
    { who: 'AM', what: 'submitted GLP tox report v1.2 for review',     when: '1d ago' },
    { who: 'AnA',what: 'drafted tox summary · grade A · 47 sources',   when: '4d ago' },
    { who: 'JC', what: 'rolled in FDA commitment fda-097',             when: '3d ago' },
    { who: 'JC', what: 'snapshot readiness · 58%',                     when: '7d ago' },
  ];

  return (
    <>
      <div className="pdev-page-header">
        <div>
          <div className="pdev-page-eyebrow">Domain · PDEV</div>
          <h1 className="pdev-page-title">{program.code} · {program.productName}</h1>
          <div className="pdev-page-sub">
            {program.indication} · {program.agency} · target IND {program.targetIndDate} · {program.daysToInd} days
          </div>
        </div>
        <div className="pdev-page-actions">
          <button className="pdev-btn ghost" onClick={() => onAskAna('What is blocking IND for this program?')}>{I.sparkles} Ask AnA</button>
          <button className="pdev-btn primary" onClick={onSnapshot}>{I.zap} Snapshot readiness</button>
        </div>
      </div>

      <div className="pdev-readiness-card">
        <div className="pdev-readiness-num">{program.readiness}<span className="unit">%</span></div>
        <div className="pdev-readiness-body">
          <div className="pdev-readiness-label">Overall readiness</div>
          <div className="pdev-readiness-sub">{program.topBlocker}</div>
          <div className="pdev-readiness-meta mono">Last snapshot 7d ago · threshold {PDEV_IND_ASSEMBLY.threshold}%</div>
        </div>
        <div className="pdev-readiness-bar">
          <div className="pdev-readiness-fill" style={{ width: `${program.readiness}%` }} />
        </div>
      </div>

      <section className="pdev-section">
        <div className="pdev-section-head">
          <h2>Workstream rollup</h2>
          <span className="pdev-section-sub">Click any workstream to drill in</span>
        </div>
        <div className="pdev-workstream-strip">
          {PDEV_WORKSTREAMS.map(ws => {
            const acts = PDEV_ACTIVITIES.filter(a => a.workstream === ws);
            const done = acts.filter(a => PDEV_COMPLETED_STATES.includes(a.state)).length;
            const blocked = acts.filter(a => PDEV_BLOCKED_STATES.includes(a.state) || a.state === 'changes_requested').length;
            const readiness = Math.round((done / acts.length) * 100);
            return (
              <button key={ws} className="pdev-workstream-card" onClick={() => setActiveNav(ws)}>
                <div className="pdev-workstream-card-head">
                  <span className="pdev-workstream-name">{PDEV_WORKSTREAM_LABELS[ws]}</span>
                  <span className="pdev-workstream-readiness mono">{readiness}%</span>
                </div>
                <div className="pdev-workstream-mini-row">
                  <span className="pdev-mini-label">complete</span>
                  <div className="pdev-mini-bar"><div className="pdev-mini-fill ok" style={{ width: `${(done/acts.length)*100}%` }} /></div>
                  <span className="pdev-mini-count mono">{done}/{acts.length}</span>
                </div>
                <div className="pdev-workstream-mini-row">
                  <span className="pdev-mini-label">blocked</span>
                  <div className="pdev-mini-bar"><div className="pdev-mini-fill err" style={{ width: `${(blocked/acts.length)*100}%` }} /></div>
                  <span className="pdev-mini-count mono">{blocked}/{acts.length}</span>
                </div>
                <div className="pdev-workstream-card-foot">
                  <span>View workstream</span>
                  <span className="arr">{I.arrowRight}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="pdev-overview-grid">
        <section className="pdev-section">
          <div className="pdev-section-head">
            <h2>Top blockers</h2>
            <span className="pdev-section-sub">{findings.length} findings</span>
          </div>
          <div className="pdev-findings">
            {findings.map((f, i) => (
              <button key={i} className="pdev-finding-row" data-sev={f.sev}
                onClick={() => onAskAna(`Open activity ${f.activity} — ${f.msg}`)}>
                <span className={`pdev-sev-dot tone-${f.sev}`} />
                <span className="pdev-finding-activity mono">{f.activity}</span>
                <span className="pdev-finding-msg">{f.msg}</span>
                <span className="pdev-finding-owner mono">{f.owner}</span>
                <span className="pdev-finding-open">{I.arrowRight}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="pdev-section">
          <div className="pdev-section-head">
            <h2>IND assembly · 5 modules</h2>
            <button className="pdev-section-link" onClick={() => setActiveNav('ind_assembly')}>Open assembly view {I.arrowRight}</button>
          </div>
          <div className="pdev-mini-modules">
            {PDEV_IND_ASSEMBLY.modules.map(m => {
              const tone = m.readiness >= 80 ? 'ok' : m.readiness >= 50 ? 'warn' : 'err';
              return (
                <button key={m.id} className="pdev-mini-module" data-tone={tone} onClick={() => setActiveNav('ind_assembly')}>
                  <div className="pdev-mini-module-id mono">{m.label.replace('Module ','M')}</div>
                  <div className="pdev-mini-module-num">{m.readiness}<span className="unit">%</span></div>
                  <div className="pdev-mini-module-fill" style={{ height: `${m.readiness}%` }} />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="pdev-overview-grid">
        <section className="pdev-section">
          <div className="pdev-section-head">
            <h2>Recent FDA interactions</h2>
            <button className="pdev-section-link" onClick={() => setActiveNav('fda_interactions')}>Open stream {I.arrowRight}</button>
          </div>
          <div className="pdev-fda-recent">
            {recentFda.map((f, i) => (
              <div key={i} className="pdev-fda-row-mini">
                <span className={`pdev-fda-kind pdev-fda-kind-${f.kind}`}>{f.kind.replace('q_sub_','').replace('_',' ')}</span>
                <span className="pdev-fda-title">{f.title}</span>
                <span className="pdev-fda-when mono">{f.when}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="pdev-section">
          <div className="pdev-section-head">
            <h2>Recent activity audit</h2>
          </div>
          <div className="pdev-audit-feed">
            {recentAudit.map((a, i) => (
              <div key={i} className="pdev-audit-row">
                <span className="pdev-audit-who mono">{a.who}</span>
                <span className="pdev-audit-what">{a.what}</span>
                <span className="pdev-audit-when mono">{a.when}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

/* ────────── Workstream drill-down (§2.2) ────────── */
function PdevWorkstream({ ws, program, openActivity, onAskAna }) {
  const [view, setView] = React.useState('grid');
  const [filterState, setFilterState] = React.useState('all');
  const wsActivities = PDEV_ACTIVITIES.filter(a => a.workstream === ws);
  const visible = filterState === 'all' ? wsActivities : wsActivities.filter(a => a.state === filterState);

  /* Per brief §9 Q2: grid for ≤ 12, list otherwise. */
  React.useEffect(() => { setView(wsActivities.length <= 12 ? 'grid' : 'list'); }, [ws]);

  /* Stage rollup */
  const stages = PDEV_STAGES.map(s => {
    const inStage = wsActivities.filter(a => a.stage === s);
    const done = inStage.filter(a => PDEV_COMPLETED_STATES.includes(a.state)).length;
    const blocked = inStage.filter(a => PDEV_BLOCKED_STATES.includes(a.state)).length;
    let state = 'idle';
    if (inStage.length === 0) state = 'idle';
    else if (blocked > 0) state = 'blocked';
    else if (done === inStage.length) state = 'done';
    else if (inStage.some(a => !['not_started'].includes(a.state))) state = 'active';
    return { id: s, label: PDEV_STAGE_LABELS[s], state, count: inStage.length, done };
  });

  return (
    <>
      <div className="pdev-page-header">
        <div>
          <div className="pdev-page-eyebrow">PDEV · {program?.code}</div>
          <h1 className="pdev-page-title">{PDEV_WORKSTREAM_LABELS[ws]} workstream</h1>
          <div className="pdev-page-sub">{wsActivities.length} activities across 5 stages</div>
        </div>
        <div className="pdev-page-actions">
          <div className="pdev-seg">
            <button className="pdev-seg-btn" data-on={view === 'grid'} onClick={() => setView('grid')}>Grid</button>
            <button className="pdev-seg-btn" data-on={view === 'list'} onClick={() => setView('list')}>List</button>
          </div>
          <button className="pdev-btn primary" onClick={() => onAskAna(`Draft the first ${ws} activity for ${program?.code}`)}>{I.sparkles} Draft next</button>
        </div>
      </div>

      <section className="pdev-section">
        <div className="pdev-stage-strip">
          {stages.map((s, i) => (
            <div key={s.id} className="pdev-stage-node" data-state={s.state}>
              <div className="pdev-stage-dot">{s.state === 'done' ? I.check : i + 1}</div>
              <div className="pdev-stage-label">{s.label}</div>
              <div className="pdev-stage-meta mono">{s.done}/{s.count}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="pdev-section">
        <div className="pdev-section-head">
          <h2>Activities</h2>
          <span className="pdev-section-sub">{visible.length} of {wsActivities.length} shown</span>
        </div>

        {view === 'grid' ? (
          <div className="pdev-activity-grid">
            {visible.map(a => (
              <button key={a.key} className="pdev-activity-card" onClick={() => openActivity(a)}>
                <div className="pdev-activity-head">
                  <span className="mono pdev-activity-key">{a.key}</span>
                  <span className={`pdev-state-pill ${statePillClass(a.state)}`}>{PDEV_STATE_LABELS[a.state]}</span>
                </div>
                <div className="pdev-activity-title">{a.title}</div>
                <div className="pdev-activity-meta">
                  <span>{a.docs} doc{a.docs !== 1 ? 's' : ''}</span>
                  <span className="dot-sep">·</span>
                  <span>{a.evidenceN} evidence</span>
                  <span className="dot-sep">·</span>
                  <span>{a.owner || 'Unassigned'}</span>
                </div>
                <div className="pdev-activity-foot">
                  <span className={`pdev-due mono ${a.dueIn !== null && a.dueIn < 0 ? 'overdue' : a.dueIn !== null && a.dueIn < 14 ? 'soon' : ''}`}>{a.due}</span>
                  {a.hasDeps && <span className="pdev-deps-chip">{I.link} deps</span>}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="pdev-activity-list">
            <div className="pdev-activity-list-head">
              <div>Activity</div><div>State</div><div>Stage</div><div>Owner</div><div>Due</div><div>Docs</div>
            </div>
            {visible.map(a => (
              <button key={a.key} className="pdev-activity-list-row" onClick={() => openActivity(a)}>
                <div>
                  <div className="pdev-activity-title">{a.title}</div>
                  <div className="mono pdev-activity-key">{a.key}</div>
                </div>
                <div><span className={`pdev-state-pill ${statePillClass(a.state)}`}>{PDEV_STATE_LABELS[a.state]}</span></div>
                <div>{PDEV_STAGE_LABELS[a.stage]}</div>
                <div className="mono">{a.owner || '—'}</div>
                <div className="mono">{a.due}</div>
                <div className="mono">{a.docs}</div>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* ────────── IND assembly (§2.4) ────────── */
function PdevAssembly({ program, onAskAna, openCompile }) {
  if (!program) return null;
  const overall = PDEV_IND_ASSEMBLY.overallReadiness;
  const threshold = PDEV_IND_ASSEMBLY.threshold;
  const belowThreshold = overall < threshold;

  return (
    <>
      <div className="pdev-page-header">
        <div>
          <div className="pdev-page-eyebrow">PDEV · {program.code}</div>
          <h1 className="pdev-page-title">IND assembly readiness</h1>
          <div className="pdev-page-sub">Readiness view only. eCTD publishing runs through the existing assembly pipeline once mandatory documents are in place.</div>
        </div>
        <div className="pdev-page-actions">
          <button className="pdev-btn ghost" onClick={() => onAskAna('Show me what is missing from each IND module')}>{I.sparkles} Diagnose gaps</button>
        </div>
      </div>

      <section className="pdev-section">
        <div className="pdev-assembly-grid">
          {PDEV_IND_ASSEMBLY.modules.map(m => {
            const tone = m.readiness >= 80 ? 'ok' : m.readiness >= 50 ? 'warn' : 'err';
            return (
              <div key={m.id} className="pdev-assembly-module" data-tone={tone}>
                <div className="pdev-assembly-module-head">
                  <span className="pdev-assembly-module-label">{m.label}</span>
                  <span className="pdev-assembly-module-num mono">{m.readiness}%</span>
                </div>
                <div className="pdev-assembly-module-bar">
                  <div className="pdev-assembly-module-fill" style={{ width: `${m.readiness}%` }} />
                </div>
                <div className="pdev-assembly-module-counts">
                  <div className="pdev-count">
                    <span className="mono">{m.mandatory.present}/{m.mandatory.total}</span>
                    <span className="lbl">mandatory</span>
                  </div>
                  <div className="pdev-count">
                    <span className="mono">{m.total.present}/{m.total.total}</span>
                    <span className="lbl">all docs</span>
                  </div>
                </div>
                <div className="pdev-assembly-module-blockers">
                  {m.blockers.slice(0, 3).map((b, i) => (
                    <div key={i} className="pdev-assembly-blocker">
                      <span className="pdev-sev-dot tone-warn" />
                      <span>{b}</span>
                    </div>
                  ))}
                  {m.blockers.length > 3 && <button className="pdev-assembly-more">+{m.blockers.length - 3} more</button>}
                </div>
                <button className="pdev-assembly-open">Open module {I.arrowRight}</button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="pdev-section pdev-compile-section">
        <div className="pdev-compile-card">
          <div className="pdev-compile-body">
            <div className="pdev-compile-eyebrow">Most consequential action · audit-flagged</div>
            <div className="pdev-compile-title">Compile IND assembly</div>
            <div className="pdev-compile-sub">
              Current readiness {overall}% · threshold {threshold}%. {belowThreshold
                ? `Below threshold — force-compile available with a 30-character reason.`
                : `Threshold met — package compilation will be transmitted to the assembly pipeline.`}
            </div>
          </div>
          <div className="pdev-compile-actions">
            <button className="pdev-btn primary large" disabled={belowThreshold} onClick={openCompile}>
              {I.rocket} Compile IND assembly (readiness {overall}%)
            </button>
            {belowThreshold && <button className="pdev-btn ghost" onClick={openCompile}>Force compile…</button>}
          </div>
        </div>
      </section>
    </>
  );
}

/* ────────── FDA interactions (§2.7) ────────── */
function PdevFdaStream({ program, onAskAna, openConfirm }) {
  const proposals = PDEV_FDA_INTERACTIONS.filter(i => !i.rolled && i.proposedKey);
  return (
    <>
      <div className="pdev-page-header">
        <div>
          <div className="pdev-page-eyebrow">PDEV · {program?.code}</div>
          <h1 className="pdev-page-title">FDA interactions</h1>
          <div className="pdev-page-sub">{PDEV_FDA_INTERACTIONS.length} touchpoints · {proposals.length} commitments awaiting rollup into PDEV</div>
        </div>
        <div className="pdev-page-actions">
          <button className="pdev-btn ghost" onClick={() => onAskAna('Show only commitments that block IND filing')}>{I.filter} Blockers only</button>
          <button className="pdev-btn primary" onClick={() => openConfirm({
            action: 'Apply all proposed commitment rollups',
            target: `${proposals.length} commitments → matched PDEV activities`,
            resource: program?.code,
            minReason: 30,
            confirmWord: 'yes-rollup',
          })}>{I.zap} Apply all rollups</button>
        </div>
      </div>

      <section className="pdev-section">
        <div className="pdev-section-head"><h2>Timeline</h2></div>
        <div className="pdev-fda-stream">
          {PDEV_FDA_INTERACTIONS.map(f => (
            <div key={f.id} className="pdev-fda-row" data-status={f.status}>
              <div className="pdev-fda-row-l">
                <span className={`pdev-fda-kind pdev-fda-kind-${f.kind}`}>{f.kind.replace('q_sub_','').replace('_',' ')}</span>
                <span className="pdev-fda-when mono">{f.when}</span>
              </div>
              <div className="pdev-fda-row-body">
                <div className="pdev-fda-title">{f.title}{f.blocker && <span className="pdev-blocker-chip">blocker</span>}</div>
                <div className="pdev-fda-summary">{f.summary}</div>
              </div>
              <div className="pdev-fda-row-r">
                <span className={`pdev-fda-status pdev-fda-status-${f.status}`}>{f.status.replace('-',' ')}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {proposals.length > 0 && (
        <section className="pdev-section">
          <div className="pdev-section-head"><h2>Roll up FDA feedback into PDEV activities</h2>
            <span className="pdev-section-sub">AnA-proposed activity matches · governed apply</span></div>
          <div className="pdev-fda-rollup">
            {proposals.map(p => (
              <div key={p.id} className="pdev-fda-rollup-row" data-blocker={p.blocker}>
                <div className="pdev-fda-rollup-l">
                  <span className="mono pdev-fda-rollup-id">{p.id}</span>
                  {p.blocker && <span className="pdev-blocker-chip">blocker</span>}
                </div>
                <div className="pdev-fda-rollup-text">{p.title}</div>
                <div className="pdev-fda-rollup-arrow">{I.arrowRight}</div>
                <div className="pdev-fda-rollup-proposed">
                  <span className="mono">{p.proposedKey}</span>
                  <span className="pdev-fda-rollup-conf mono">{Math.round(p.confidence * 100)}%</span>
                </div>
                <button className="pdev-btn primary small" onClick={() => openConfirm({
                  action: 'Apply rollup',
                  target: `${p.id} → ${p.proposedKey}`,
                  resource: program?.code,
                  minReason: 10,
                  confirmWord: 'yes',
                })}>{I.check} Apply</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/* ────────── Contradictions registry (§2.8) ────────── */
function PdevContradictions({ program, onAskAna, openConfirm }) {
  const [selected, setSelected] = React.useState(PDEV_CONTRADICTIONS[0].id);
  const sel = PDEV_CONTRADICTIONS.find(c => c.id === selected);

  return (
    <>
      <div className="pdev-page-header">
        <div>
          <div className="pdev-page-eyebrow">PDEV · {program?.code}</div>
          <h1 className="pdev-page-title">Contradictions registry</h1>
          <div className="pdev-page-sub">{PDEV_CONTRADICTIONS.length} cross-artifact inconsistencies · {PDEV_CONTRADICTIONS.filter(c => c.authorityState === 'blocks_promotion').length} block promotion</div>
        </div>
        <div className="pdev-page-actions">
          <button className="pdev-btn ghost" onClick={() => onAskAna('Show me what blocks IND promotion right now')}>{I.sparkles} Triage</button>
        </div>
      </div>

      <div className="pdev-contradiction-layout">
        <section className="pdev-section pdev-contradiction-table">
          <div className="pdev-section-head"><h2>All contradictions</h2></div>
          {PDEV_CONTRADICTIONS.map(c => (
            <button key={c.id} className="pdev-contradiction-row" data-on={selected === c.id} onClick={() => setSelected(c.id)}>
              <span className={`pdev-sev-dot tone-${c.severity}`} />
              <div className="pdev-contradiction-body">
                <div className="pdev-contradiction-head">
                  <span className="mono pdev-contradiction-id">{c.id}</span>
                  <span className={`pdev-authority-pill pdev-authority-${c.authorityState.replace(/_/g,'-')}`}>{c.authorityState.replace(/_/g,' ')}</span>
                </div>
                <div className="pdev-contradiction-pair">
                  <span className="mono">{c.objectA.split(' · ')[0]}</span>
                  <span className="vs">vs</span>
                  <span className="mono">{c.objectB.split(' · ')[0]}</span>
                </div>
                <div className="pdev-contradiction-meta mono small">{c.type} · {c.reviewState.replace(/_/g,' ')} · {c.when}</div>
              </div>
            </button>
          ))}
        </section>

        {sel && (
          <section className="pdev-section pdev-contradiction-detail">
            <div className="pdev-contradiction-detail-head">
              <span className={`pdev-sev-dot tone-${sel.severity}`} />
              <span className="mono pdev-contradiction-id">{sel.id}</span>
              <span className={`pdev-authority-pill pdev-authority-${sel.authorityState.replace(/_/g,'-')}`}>{sel.authorityState.replace(/_/g,' ')}</span>
            </div>
            <div className="pdev-contradiction-pair-detail">
              <div className="pdev-contradiction-object">
                <div className="lbl">Object A</div>
                <div className="val mono">{sel.objectA}</div>
              </div>
              <div className="pdev-contradiction-vs">vs</div>
              <div className="pdev-contradiction-object">
                <div className="lbl">Object B</div>
                <div className="val mono">{sel.objectB}</div>
              </div>
            </div>
            <div className="pdev-contradiction-desc">{sel.desc}</div>
            <div className="pdev-contradiction-meta">
              <span className="lbl">Type</span><span className="val mono">{sel.type}</span>
              <span className="lbl">Review state</span><span className="val">{sel.reviewState.replace(/_/g,' ')}</span>
              <span className="lbl">Regulatory body</span><span className="val">{sel.regulatoryBody}</span>
            </div>
            <div className="pdev-contradiction-actions">
              <button className="pdev-btn ghost" onClick={() => onAskAna(`Open ${sel.objectA.split(' · ')[0]}`)}>{I.eye} Open object A</button>
              <button className="pdev-btn ghost" onClick={() => onAskAna(`Open ${sel.objectB.split(' · ')[0]}`)}>{I.eye} Open object B</button>
              <button className="pdev-btn primary" onClick={() => openConfirm({
                action: `Transition ${sel.id} review state`,
                target: `${sel.id} · current: ${sel.reviewState.replace(/_/g,' ')}`,
                resource: program?.code,
                minReason: 10,
                confirmWord: 'yes',
              })}>{I.arrowRight} Transition review state</button>
              {sel.authorityState === 'blocks_promotion' && (
                <button className="pdev-btn warn" onClick={() => openConfirm({
                  action: 'Execute consequence',
                  target: `${sel.id} · blocks_promotion → escalation`,
                  resource: program?.code,
                  minReason: 30,
                  confirmWord: 'yes-execute',
                })}>{I.zap} Execute consequence</button>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

Object.assign(window, { PdevOverview, PdevWorkstream, PdevAssembly, PdevFdaStream, PdevContradictions });
})();
