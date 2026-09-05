/* global React, I, TASKS_COLUMNS, TASKS, TASKS_METRICS, VAULT_FOLDERS, VAULT_FILTERS, VAULT_FILES, VAULT_VERSIONS, VALIDATION_SUMMARY, VALIDATION_PROGRAMS, VALIDATION_RULES, SUBMISSION_PIPELINE, SUBMISSIONS, TEMPLATES */
/* Workbench surfaces — cross-program tools that land when a user clicks
   Tasks, Vault, Validation, Submissions, or Templates in the rail.
   Each is a finished hi-fi surface, not a stub. All share the MDX shell
   (rail + topbar + AnA rail) — these are *content* for <main>. */

var { useState: useWState } = React;

/* ─────────────────────────────────────────────────────────────
   Tasks & Reviews
   Kanban + list toggle. Cards carry program, section, due chip,
   e-sig badge, and comment count. Blocker rail at the top.
   ───────────────────────────────────────────────────────────── */
function TasksSurface() {
  const [view, setView] = useWState('board');
  const [owner, setOwner] = useWState('all');
  const byCol = (id) => TASKS.filter(t => t.col === id && (owner === 'all' || t.assignee === owner));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Tasks and reviews</h1>
          <div className="page-sub">Everything assigned across the portfolio — blockers, peer reviews, e-signatures.</div>
        </div>
        <div className="page-actions">
          <div className="seg small">
            <button className="seg-btn" data-on={view === 'board'} onClick={() => setView('board')}>Board</button>
            <button className="seg-btn" data-on={view === 'list'}  onClick={() => setView('list')}>List</button>
          </div>
          <div className="seg small">
            <button className="seg-btn" data-on={owner === 'all'} onClick={() => setOwner('all')}>All</button>
            <button className="seg-btn" data-on={owner === 'JC'}  onClick={() => setOwner('JC')}>Mine</button>
          </div>
          <button className="btn primary small">{I.plus} New task</button>
        </div>
      </div>

      <div className="metrics-row">
        {TASKS_METRICS.map((m, i) => (
          <div key={i} className="metric-card" data-tone={m.tone || ''}>
            <div className="metric-label">{m.label}</div>
            <div className="metric-val">{m.metric}{m.unit && <span className="unit">{m.unit}</span>}</div>
            <div className="metric-meta">{m.meta}</div>
          </div>
        ))}
      </div>

      {view === 'board' ? (
        <div className="kanban">
          {TASKS_COLUMNS.map(col => (
            <div key={col.id} className="kanban-col" data-tone={col.tone}>
              <div className="kanban-head">
                <span className="kanban-dot" data-tone={col.tone}/>
                <span className="kanban-label">{col.label}</span>
                <span className="kanban-n">{byCol(col.id).length}</span>
              </div>
              <div className="kanban-body">
                {byCol(col.id).map(t => (
                  <button key={t.id} className="task-card" data-tone={t.tone}>
                    <div className="task-head">
                      <span className="task-prog">{t.prog}<span className="task-sect">· {t.sect}</span></span>
                      {t.esig && <span className="task-esig" title="E-signature required">{I.shieldCheck}</span>}
                    </div>
                    <div className="task-title">{t.title}</div>
                    <div className="task-foot">
                      <span className={`task-label ${t.tone}`}>{t.label}</span>
                      <span className="task-spacer"/>
                      {t.comments > 0 && <span className="task-meta">{I.messageSquare} {t.comments}</span>}
                      <span className="task-meta">{I.clock} {t.due}</span>
                      <span className="task-assignee" title={t.assignee}>{t.assignee}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="ctable">
          <div className="ctable-head" style={{ gridTemplateColumns: '96px 1fr 120px 100px 90px 80px 60px' }}>
            <div>Task</div><div>Summary</div><div>Program · §</div><div>Label</div><div>Due</div><div>Assignee</div><div>Cmt</div>
          </div>
          {TASKS.filter(t => owner === 'all' || t.assignee === owner).map(t => (
            <div key={t.id} className="ctable-row" style={{ gridTemplateColumns: '96px 1fr 120px 100px 90px 80px 60px' }} data-tone={t.tone}>
              <div className="mono">{t.id}</div>
              <div className="ctable-strong">{t.title}</div>
              <div>{t.prog} · {t.sect}</div>
              <div><span className={`task-label ${t.tone}`}>{t.label}</span></div>
              <div>{t.due}</div>
              <div><span className="task-assignee small">{t.assignee}</span></div>
              <div className="mono" style={{ color: 'var(--text-400)' }}>{t.comments || '—'}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Document Vault
   Folder tree · filters · file table · selected-file drawer.
   21 CFR Part 11 audit trail feel — hash, version history,
   e-sig badge, linked artifacts.
   ───────────────────────────────────────────────────────────── */
function VaultSurface({ onAskAna }) {
  const [folder, setFolder] = useWState('root');
  const [filter, setFilter] = useWState('all');
  const [query,  setQuery]  = useWState('');
  const [selected, setSelected] = useWState('f1');

  const files = VAULT_FILES.filter(f =>
    (folder === 'root' || folder === 'shared' || folder === 'corresp' || f.prog.toLowerCase().replace('-','') === folder) &&
    (filter === 'all' || f.kind === filter) &&
    (!query || f.name.toLowerCase().includes(query.toLowerCase()))
  );
  const sel = VAULT_FILES.find(f => f.id === selected) || files[0];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Document vault</h1>
          <div className="page-sub">Every program artifact, every version, every signature. 21 CFR Part 11 audit trail.</div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small">{I.download} Export manifest</button>
          <button className="btn primary small">{I.plus} Upload</button>
        </div>
      </div>

      <div className="vault-layout">
        <aside className="vault-tree">
          <div className="vault-tree-lbl">Folders</div>
          {VAULT_FOLDERS.map(f => (
            <button key={f.id} className="vault-tree-row" data-active={folder === f.id}
              onClick={() => setFolder(f.id)}>
              <span className="ico">{I.folder}</span>
              <span className="lbl">{f.label}</span>
              <span className="n">{f.count}</span>
            </button>
          ))}
          <div className="vault-tree-lbl" style={{ marginTop: 14 }}>Types</div>
          {VAULT_FILTERS.map(f => (
            <button key={f.id} className="vault-tree-row small" data-active={filter === f.id}
              onClick={() => setFilter(f.id)}>
              <span className="lbl">{f.label}</span>
            </button>
          ))}
        </aside>

        <section className="vault-main">
          <div className="vault-searchrow">
            <div className="vault-search">
              <span className="ico">{I.search}</span>
              <input placeholder="Search files, hashes, authors…" value={query}
                onChange={e => setQuery(e.target.value)}/>
            </div>
            <span className="vault-meta">{files.length} files · {files.reduce((s,f)=>s+parseFloat(f.size),0).toFixed(1)} MB</span>
          </div>

          <div className="ctable">
            <div className="ctable-head" style={{ gridTemplateColumns: '1fr 80px 80px 100px 100px 120px' }}>
              <div>Name</div><div>Type</div><div>Size</div><div>Version</div><div>Status</div><div>Updated</div>
            </div>
            {files.map(f => (
              <button key={f.id} className="ctable-row" style={{ gridTemplateColumns: '1fr 80px 80px 100px 100px 120px' }}
                data-on={selected === f.id} onClick={() => setSelected(f.id)}>
                <div className="vault-name">
                  <span className={`vault-type ${f.type}`}>{f.type}</span>
                  <span className="ctable-strong">{f.name}</span>
                  {f.blocker && <span className="pill-err small">blocker</span>}
                  {f.esig && <span className="vault-esig" title="E-signed">{I.shieldCheck}</span>}
                </div>
                <div>{f.kind}</div>
                <div className="mono">{f.size}</div>
                <div className="mono">{f.ver}</div>
                <div><span className={`status-pill ${f.status}`}>{f.status}</span></div>
                <div>{f.updated}</div>
              </button>
            ))}
          </div>
        </section>

        <aside className="vault-drawer">
          {sel && (
            <>
              <div className="drawer-head">
                <div className="drawer-eyebrow">{sel.prog} · {sel.kind}</div>
                <div className="drawer-title">{sel.name}</div>
              </div>
              <div className="drawer-meta">
                <div><div className="k">Version</div><div className="v mono">{sel.ver}</div></div>
                <div><div className="k">Size</div><div className="v mono">{sel.size}</div></div>
                <div><div className="k">Status</div><div className="v"><span className={`status-pill ${sel.status}`}>{sel.status}</span></div></div>
                <div><div className="k">Linked</div><div className="v">{sel.linked} artifacts</div></div>
                <div><div className="k">Author</div><div className="v">{sel.author}</div></div>
                <div><div className="k">SHA-256</div><div className="v mono tiny">{sel.hash}</div></div>
              </div>

              <div className="drawer-actions">
                <button className="btn primary small">{I.download} Download</button>
                <button className="btn ghost small">{I.eye} Preview</button>
                <button className="btn ghost small" onClick={() => onAskAna(`Summarize ${sel.name}`)}>{I.sparkles} Ask Claude</button>
              </div>

              <div className="drawer-section-lbl">Version history</div>
              {VAULT_VERSIONS.map((v, i) => (
                <div key={i} className="version-row" data-status={v.status}>
                  <span className="mono version-v">{v.v}</span>
                  <div className="version-body">
                    <div className="version-meta">{v.when} · {v.author}</div>
                    <div className="version-note">{v.note}</div>
                  </div>
                </div>
              ))}

              <div className="drawer-section-lbl">Audit trail</div>
              <div className="audit-row"><span className="mono">AUD-9101</span><span>Signed by {sel.author} · {sel.updated}</span></div>
              <div className="audit-row"><span className="mono">AUD-9098</span><span>Checksum verified · system</span></div>
              <div className="audit-row"><span className="mono">AUD-9094</span><span>Uploaded · {sel.author}</span></div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Validation Center
   Portfolio view of every blocker and warning across programs.
   Summary metrics · program × rules matrix · detailed rule list.
   ───────────────────────────────────────────────────────────── */
function ValidationSurface({ onAskAna }) {
  const [sev, setSev] = useWState('all');
  const [prog, setProg] = useWState('all');
  const rules = VALIDATION_RULES.filter(r =>
    (sev === 'all' || r.severity === sev) &&
    (prog === 'all' || r.prog === prog)
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Validation center</h1>
          <div className="page-sub">eSTAR required-field rules and claim-evidence checks, every program, one dashboard.</div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small">{I.download} Export report</button>
          <button className="btn primary small" onClick={() => onAskAna('Summarize the 3 blockers across my portfolio')}>
            {I.sparkles} Ask Claude to triage
          </button>
        </div>
      </div>

      <div className="metrics-row">
        {VALIDATION_SUMMARY.map((m, i) => (
          <div key={i} className="metric-card" data-tone={m.tone || ''}>
            <div className="metric-label">{m.label}</div>
            <div className="metric-val">{m.metric}{m.unit && <span className="unit">{m.unit}</span>}</div>
            <div className="metric-meta">{m.meta}</div>
          </div>
        ))}
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Readiness by program</h2>
          <span className="section-sub">Column order · errors · warnings · pass</span>
        </div>
        <div className="val-matrix">
          {VALIDATION_PROGRAMS.map(p => (
            <button key={p.id} className="val-prog-card" data-on={prog === p.code} data-status={p.status}
              onClick={() => setProg(prog === p.code ? 'all' : p.code)}>
              <div className="val-prog-head">
                <span className="val-prog-code mono">{p.code}</span>
                <span className={`status-pill ${p.status}`}>{p.status}</span>
              </div>
              <div className="val-prog-title">{p.title}</div>
              <div className="val-prog-path">{p.pathway}</div>
              <div className="val-prog-bars">
                <div className="val-bar">
                  <div className="val-bar-fill" style={{ width: `${p.readiness}%` }}/>
                </div>
                <span className="val-bar-pct mono">{p.readiness}%</span>
              </div>
              <div className="val-prog-counts">
                <span className="val-count err">{p.errs} err</span>
                <span className="val-count warn">{p.warns} warn</span>
                <span className="val-count ok">{p.ok} ok</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Rules</h2>
          <div className="seg small">
            <button className="seg-btn" data-on={sev === 'all'} onClick={() => setSev('all')}>All</button>
            <button className="seg-btn" data-on={sev === 'err'}  onClick={() => setSev('err')}>Blockers</button>
            <button className="seg-btn" data-on={sev === 'warn'} onClick={() => setSev('warn')}>Warnings</button>
          </div>
          {prog !== 'all' && (
            <button className="chip-filter" onClick={() => setProg('all')}>
              {prog} {I.close}
            </button>
          )}
        </div>
        <div className="ctable">
          <div className="ctable-head" style={{ gridTemplateColumns: '88px 110px 110px 140px 1fr 100px' }}>
            <div>Sev</div><div>Rule</div><div>Program</div><div>Category</div><div>Message</div><div>Since</div>
          </div>
          {rules.map(r => (
            <div key={r.id + r.prog} className="ctable-row" style={{ gridTemplateColumns: '88px 110px 110px 140px 1fr 100px' }}>
              <div>
                <span className={`sev-pill ${r.severity}`}>
                  {r.severity === 'err' ? 'Blocker' : r.severity === 'warn' ? 'Warning' : 'Pass'}
                </span>
              </div>
              <div className="mono">{r.id}</div>
              <div>{r.prog} <span style={{color:'var(--text-400)'}}>· {r.sect}</span></div>
              <div>{r.category}</div>
              <div>{r.msg}</div>
              <div>{r.since}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Submission Center
   Pipeline strip · active submissions · detail drawer with
   gate status, cover letter, e-sig, ESG receipt.
   ───────────────────────────────────────────────────────────── */
function SubmissionsSurface({ onAskAna }) {
  const [selected, setSelected] = useWState('s1');
  const sel = SUBMISSIONS.find(s => s.id === selected);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Submission center</h1>
          <div className="page-sub">Package and transmit — FDA ESG, notified bodies, EU MDR. Status tracking in-flight.</div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small">{I.filter} Filter</button>
          <button className="btn primary small">{I.rocket} New submission</button>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Pipeline</h2>
          <span className="section-sub">7 stages from package to decision</span>
        </div>
        <div className="sub-pipeline">
          {SUBMISSION_PIPELINE.map((st, i) => {
            const count = SUBMISSIONS.filter(s => s.stage === st.id).length;
            return (
              <div key={st.id} className="sub-stage">
                <div className="sub-stage-num">{String(i + 1).padStart(2, '0')}</div>
                <div className="sub-stage-label">{st.label}</div>
                <div className="sub-stage-desc">{st.desc}</div>
                <div className="sub-stage-n">{count}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Active submissions</h2>
          <span className="section-sub">{SUBMISSIONS.length} total · {SUBMISSIONS.filter(s=>s.status==='active').length} active · {SUBMISSIONS.filter(s=>s.status==='blocked').length} blocked</span>
        </div>
        <div className="sub-layout">
          <div className="sub-list">
            {SUBMISSIONS.map(s => (
              <button key={s.id} className="sub-row" data-on={selected === s.id}
                onClick={() => setSelected(s.id)} data-status={s.status}>
                <div className="sub-row-head">
                  <span className="sub-row-code mono">{s.prog}</span>
                  <span className={`status-pill ${s.status}`}>{s.status}</span>
                </div>
                <div className="sub-row-title">{s.title}</div>
                <div className="sub-row-meta">
                  <span>{s.target}</span>
                  <span className="dot-sep">·</span>
                  <span>{s.files} files · {s.bytes}</span>
                </div>
                <div className="sub-row-foot">
                  <span className="sub-row-gate">
                    <span className="gate-chip err">{s.gate.errs}</span>
                    <span className="gate-chip warn">{s.gate.warns}</span>
                    <span className="gate-chip ok">{s.gate.ok}</span>
                  </span>
                  <span className="sub-row-due">
                    {s.transmitAt ? `Sent ${s.transmitAt}` : `Target · ${s.targetAt}`}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="sub-detail">
            {sel && (
              <>
                <div className="sub-detail-head">
                  <div>
                    <div className="sub-detail-eyebrow">{sel.prog} · {sel.pathway}</div>
                    <h3 className="sub-detail-title">{sel.title}</h3>
                    <div className="sub-detail-target">Target · {sel.target}</div>
                  </div>
                  <div className="sub-detail-actions">
                    {sel.status === 'blocked' ? (
                      <button className="btn ghost small" onClick={() => onAskAna(`What's blocking ${sel.prog}?`)}>
                        {I.sparkles} Ask Claude
                      </button>
                    ) : null}
                    <button className="btn primary small" disabled={sel.gate.errs > 0 || !sel.esig}>
                      {I.rocket} {sel.status === 'complete' ? 'View receipt' : 'Transmit'}
                    </button>
                  </div>
                </div>

                <div className="sub-gate">
                  <div className="sub-gate-lbl">Submission gate</div>
                  <div className="sub-gate-row">
                    <div className="sub-gate-item" data-ok={sel.gate.errs === 0}>
                      <span className="sub-gate-ico">{sel.gate.errs === 0 ? I.check : I.alertCircle}</span>
                      <div>
                        <div className="sub-gate-k">Validation</div>
                        <div className="sub-gate-v">{sel.gate.errs} err · {sel.gate.warns} warn · {sel.gate.ok} pass</div>
                      </div>
                    </div>
                    <div className="sub-gate-item" data-ok={sel.cover === 'signed'}>
                      <span className="sub-gate-ico">{sel.cover === 'signed' ? I.check : I.alertCircle}</span>
                      <div>
                        <div className="sub-gate-k">Cover letter</div>
                        <div className="sub-gate-v">{sel.cover}</div>
                      </div>
                    </div>
                    <div className="sub-gate-item" data-ok={sel.esig}>
                      <span className="sub-gate-ico">{sel.esig ? I.check : I.alertCircle}</span>
                      <div>
                        <div className="sub-gate-k">E-signature</div>
                        <div className="sub-gate-v">{sel.esig ? 'Signed' : 'Pending'}</div>
                      </div>
                    </div>
                    <div className="sub-gate-item" data-ok={true}>
                      <span className="sub-gate-ico">{I.check}</span>
                      <div>
                        <div className="sub-gate-k">Package</div>
                        <div className="sub-gate-v">{sel.files} files · {sel.bytes}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="drawer-section-lbl">Activity</div>
                {sel.log.map((l, i) => (
                  <div key={i} className="activity-row">
                    <span className="activity-when">{l.when}</span>
                    <span className="activity-who">{l.who}</span>
                    <span className="activity-what">{l.what}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Templates — lightweight index of org-approved boilerplate.
   ───────────────────────────────────────────────────────────── */
function TemplatesSurface() {
  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Templates</h1>
          <div className="page-sub">Reusable section skeletons and boilerplate. Org-approved, version-controlled.</div>
        </div>
        <div className="page-actions">
          <button className="btn primary small">{I.plus} New template</button>
        </div>
      </div>
      <div className="tpl-grid">
        {TEMPLATES.map(t => (
          <button key={t.id} className="tpl-card">
            <div className="tpl-head">
              <span className="tpl-ico">{I.template}</span>
              <span className="tpl-uses">{t.uses} uses</span>
            </div>
            <div className="tpl-name">{t.name}</div>
            <div className="tpl-meta">{t.owner} · updated {t.updated}</div>
            <div className="tpl-tags">
              {t.tags.map(tag => <span key={tag} className="tpl-tag">{tag}</span>)}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

Object.assign(window, { TasksSurface, VaultSurface, ValidationSurface, SubmissionsSurface, TemplatesSurface });
