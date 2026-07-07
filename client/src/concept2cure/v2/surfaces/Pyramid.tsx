/**
 * Pyramid surface — kit pyramid.jsx + pyramid-analytics.jsx.
 *
 * Type selector → dashboard (progress ring · phase strip · risk gauge ·
 * next actions) → work breakdown (phase → task → detail sheet) →
 * analytics (resources · coverage · critical path) → global browser.
 *
 * Engine output is LIVE via /api/v1/pyramids/:type, fixture behind the
 * Sample pill otherwise. Task status is the only client-owned state.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag, useLive } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  PY_TYPES, PY_ROLES, PY_PYRAMID, PY_STATUS, PY_RISK,
  PY_GLOBAL, pyProgress, pyNextTasks, pyRiskProfile, pyResources, pyCoverage,
  type PyType, type PyTask, type PyPyramid, type PyGlobalConfig,
} from '../fixtures/pyramid';
import '../styles/pyramid-v2.css';

// ── Shared atoms ──────────────────────────────────────────────────────────

function PyChip({ vocab, value }: { vocab: 'risk' | 'status'; value: string }) {
  const src = vocab === 'risk' ? PY_RISK : PY_STATUS;
  const m = src[value] || { l: value, tone: 'neutral' };
  const ic: Record<string, keyof typeof I> = { ok: 'check', warn: 'alertTriangle', err: 'shieldAlert', ai: 'info', neutral: 'info' };
  return <span className="py-chip" data-tone={m.tone}>{I[ic[m.tone] ?? 'info']}{m.l}</span>;
}

function PyRing({ value, size = 132, stroke = 11, sub }: { value: number; size?: number; stroke?: number; sub?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - value / 100);
  return (
    <div className="py-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-200)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent-100)" strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 26, fontWeight: 600, fill: 'var(--text-100)' }}>{value}%</text>
        <text x="50%" y="63%" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 9, fill: 'var(--text-400)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{sub}</text>
      </svg>
    </div>
  );
}

const pyModOf = (s: string) => (s.match(/M(\d)/) || [])[1] || '—';

// ── Type selector ─────────────────────────────────────────────────────────

function PyTypeSelector({ types, onPick }: { types: PyType[]; onPick: (t: PyType) => void }) {
  const groups: [string, string][] = [['pharma', 'Pharma & biotech'], ['device', 'Device & IVD'], ['cross-cutting', 'International']];
  return (
    <div className="py-picker">
      <p className="py-picker-lead">Pick a submission type to load its deterministic pyramid — phases, tasks, critical path, risk, resources and document coverage.</p>
      {groups.map(([seg, label]) => (
        <div key={seg} className="py-picker-grp">
          <div className="py-picker-grp-l">{label}</div>
          <div className="py-picker-grid">
            {types.filter(t => t.segment === seg).map(t => (
              <button key={t.id} className="py-type" data-active={t.active || undefined} onClick={() => onPick(t)}>
                <div className="py-type-h"><span className="py-type-id">{t.id}</span>{t.active && <span className="py-type-live">active program</span>}</div>
                <div className="py-type-l">{t.label.split('—')[1] || t.label}</div>
                <div className="py-type-m">{t.agency} · {t.ctd} · {t.phases} phases · {t.tasks} tasks · {t.hours}h</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────

function PyDashboard({ pyr, onPhase, onTask }: { pyr: PyPyramid; onPhase: (id: string) => void; onTask: (id: string) => void }) {
  const prog = pyProgress(pyr);
  const next = pyNextTasks(pyr);
  const risk = pyRiskProfile(pyr);
  const riskPct = Math.min(100, Math.round(risk.total / 12 * 100));
  return (
    <div className="py-dash">
      <div className="py-dash-top">
        <div className="py-card py-prog">
          <PyRing value={prog.pct} sub="complete" />
          <div className="py-prog-stats">
            <div className="py-stat"><b>{prog.completed}/{prog.total}</b><span>tasks done</span></div>
            <div className="py-stat"><b>{prog.criticalPathPct}%</b><span>critical path</span></div>
            <div className="py-stat"><b>{prog.hoursRemaining}h</b><span>remaining</span></div>
          </div>
        </div>
        <div className="py-card py-risk">
          <div className="py-card-h">Risk profile<span className="py-card-sub">getRiskProfile</span></div>
          <div className="py-risk-gauge">
            <div className="py-risk-score" data-hi={riskPct >= 50 ? 2 : riskPct >= 25 ? 1 : 0}>{risk.total}</div>
            <div className="py-risk-bar"><span data-hi={riskPct >= 50 ? 2 : riskPct >= 25 ? 1 : 0} style={{ width: `${riskPct}%` }} /></div>
            <div className="py-risk-m">{risk.high.length} high-risk tasks · {risk.gaps.length} blocked on critical path</div>
          </div>
          <div className="py-risk-list">
            {risk.high.map(t => (
              <button key={t.id} className="py-risk-row" onClick={() => onTask(t.id)}>
                <PyChip vocab="risk" value={t.risk!.severity} />
                <span className="t">{t.name}</span>
                <span className="go">{I.chevRight}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="py-sec-h"><h2>Phases</h2><span className="py-sec-sub">estimateTimeline · click a phase to open its work breakdown</span></div>
      <div className="py-strip">
        {pyr.phases.map(ph => {
          const p = prog.perPhase[ph.id];
          return (
            <button key={ph.id} className="py-phase" data-ord={ph.order} onClick={() => onPhase(ph.id)}>
              <div className="py-phase-n">Phase {ph.order}</div>
              <div className="py-phase-name">{ph.name}</div>
              <div className="py-phase-bar"><span style={{ width: `${p?.pct ?? 0}%` }} /></div>
              <div className="py-phase-m">{p?.completed ?? 0}/{p?.total ?? 0} · {p?.pct ?? 0}% · ~{ph.weeks}w</div>
            </button>
          );
        })}
      </div>

      <div className="py-sec-h"><h2>What's next</h2><span className="py-sec-sub">getNextAvailableTasks · dependencies satisfied, ready to start</span></div>
      <div className="py-next">
        {next.length === 0 ? <div className="py-next-empty">No unblocked tasks ready — advance in-progress work or clear a blocked dependency.</div> :
          next.map(t => (
            <button key={t.id} className="py-next-row" onClick={() => onTask(t.id)}>
              {t.critical && <span className="py-crit" title="Critical path">critical</span>}
              <span className="t">{t.name}</span>
              <span className="m">{PY_ROLES[t.role] || t.role} · {t.hours}h</span>
              <span className="go">{I.chevRight}</span>
            </button>
          ))}
      </div>
    </div>
  );
}

// ── Work breakdown ────────────────────────────────────────────────────────

function PyWorkBreakdown({ pyr, focusPhase, onTask, tasks, onStatus }: {
  pyr: PyPyramid; focusPhase: string | null; onTask: (id: string) => void;
  tasks: PyTask[]; onStatus: (id: string, status: string) => void;
}) {
  const phases = focusPhase ? pyr.phases.filter(p => p.id === focusPhase) : pyr.phases;
  return (
    <div className="py-wbs">
      {phases.map(ph => {
        const ts = tasks.filter(t => t.phase === ph.id);
        return (
          <div key={ph.id} className="py-wbs-phase">
            <div className="py-wbs-phase-h"><span className="n">Phase {ph.order}</span><span className="name">{ph.name}</span><span className="m">{ts.length} tasks · ~{ph.weeks}w</span></div>
            <div className="py-wbs-rows">
              {ts.map(t => (
                <div key={t.id} className="py-row" data-crit={t.critical || undefined}>
                  <button className="py-row-main" onClick={() => onTask(t.id)}>
                    {t.critical && <span className="py-crit">critical</span>}
                    <span className="py-row-t">{t.name}</span>
                    <span className="py-row-role">{PY_ROLES[t.role] || t.role}</span>
                    <span className="py-row-h">{t.hours}h</span>
                    {t.risk && <span className="py-row-risk" data-sev={t.risk.severity} title={`Risk: ${t.risk.severity}`}>{I.alertTriangle}</span>}
                  </button>
                  <select className="py-row-status" data-tone={PY_STATUS[t.status]?.tone} value={t.status}
                    onChange={e => onStatus(t.id, e.target.value)} aria-label={`Status of ${t.name}`}>
                    {Object.entries(PY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Task detail sheet ─────────────────────────────────────────────────────

function PyTaskSheet({ pyr, task, tasks, onClose, onTask, onStatus }: {
  pyr: PyPyramid; task: PyTask | null; tasks: PyTask[];
  onClose: () => void; onTask: (id: string) => void;
  onStatus: (id: string, status: string) => void;
}) {
  if (!task) return null;
  const ph = pyr.phases.find(p => p.id === task.phase);
  const deps = task.deps.map(d => tasks.find(t => t.id === d)).filter(Boolean) as PyTask[];
  const dependents = tasks.filter(t => t.deps.includes(task.id));
  const byMod: Record<string, string[]> = {};
  (task.ctd || []).forEach(c => { const m = pyModOf(c); (byMod[m] = byMod[m] || []).push(c); });
  const g = task.guidance || {};
  return (
    <div className="py-sheet-scrim" onClick={onClose}>
      <aside className="py-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={task.name}>
        <div className="py-sheet-h">
          <div>
            <div className="py-sheet-crumb">Phase {ph?.order} · {ph?.name}</div>
            <h3>{task.name}</h3>
          </div>
          <button className="py-sheet-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>

        <div className="py-sheet-body">
          <div className="py-sheet-status">
            <label>Status</label>
            <select data-tone={PY_STATUS[task.status]?.tone} value={task.status}
              onChange={e => onStatus(task.id, e.target.value)}>
              {Object.entries(PY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
            </select>
            <span className="py-sheet-meta">{PY_ROLES[task.role] || task.role} · {task.hours}h{task.critical && ' · critical path'}</span>
          </div>

          {task.risk && (
            <div className="py-sheet-sec">
              <div className="py-sheet-sec-l">Risk</div>
              <div className="py-sheet-risk" data-sev={task.risk.severity}>
                <PyChip vocab="risk" value={task.risk.severity} />
                <span className="prob">probability {Math.round(task.risk.probability * 100)}%</span>
                <p className="impact">{task.risk.impact}</p>
                <ul>{task.risk.mitigations.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            </div>
          )}

          {Object.keys(byMod).length > 0 && (
            <div className="py-sheet-sec">
              <div className="py-sheet-sec-l">Document bindings</div>
              {Object.keys(byMod).sort().map(m => (
                <div key={m} className="py-sheet-mod">
                  <span className="mod">Module {m}</span>
                  {byMod[m].map(c => <span key={c} className="py-ctd mono">{c}</span>)}
                </div>
              ))}
            </div>
          )}

          {(g.fda || g.ich || g.cfr || g.keyConsiderations) && (
            <div className="py-sheet-sec">
              <div className="py-sheet-sec-l">Regulatory guidance</div>
              <div className="py-sheet-guide">
                {g.fda && <span className="py-guide-ref">{I.fileText}{g.fda}</span>}
                {g.ich && <span className="py-guide-ref">{I.fileText}{g.ich}</span>}
                {g.cfr && <span className="py-guide-ref mono">{g.cfr}</span>}
                {g.keyConsiderations && <ul>{g.keyConsiderations.map((k, i) => <li key={i}>{k}</li>)}</ul>}
              </div>
            </div>
          )}

          {(deps.length > 0 || dependents.length > 0) && (
            <div className="py-sheet-sec">
              <div className="py-sheet-sec-l">Dependencies</div>
              {deps.length > 0 && <div className="py-dep-grp"><span className="k">Depends on</span>{deps.map(d => (
                <button key={d.id} className="py-dep" data-done={d.status === 'done' || undefined} onClick={() => onTask(d.id)}>{d.status === 'done' ? I.check : I.clock}{d.name}</button>))}</div>}
              {dependents.length > 0 && <div className="py-dep-grp"><span className="k">Feeds into</span>{dependents.map(d => (
                <button key={d.id} className="py-dep" onClick={() => onTask(d.id)}>{I.chevRight}{d.name}</button>))}</div>}
            </div>
          )}

          {task.deliverables && task.deliverables.length > 0 && (
            <div className="py-sheet-sec">
              <div className="py-sheet-sec-l">Deliverables</div>
              <div className="py-deliv">{task.deliverables.map((d, i) => (
                <span key={i} className="py-deliv-item" data-done={task.status === 'done' || undefined}>{task.status === 'done' ? I.check : I.fileText}{d}</span>))}</div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ── Analytics ─────────────────────────────────────────────────────────────

function PyAnalytics({ pyr, onTask }: { pyr: PyPyramid; onTask: (id: string) => void }) {
  const res = pyResources(pyr);
  const cov = pyCoverage(pyr);
  const maxRem = Math.max(...res.map(r => r.remaining), 1);
  const crit = pyr.tasks.filter(t => t.critical);
  const mods: Record<string, typeof cov> = {};
  cov.forEach(c => { const m = (c.section.match(/M(\d)/) || [])[1] || '—'; (mods[m] = mods[m] || []).push(c); });

  return (
    <div className="py-ana">
      <div className="py-ana-cols">
        <div className="py-card">
          <div className="py-card-h">Resource allocation<span className="py-card-sub">getResourceAllocation · remaining hours vs 320h capacity</span></div>
          <div className="py-res">
            {res.map(r => (
              <div key={r.role} className="py-res-row" data-over={r.overloaded || undefined}>
                <span className="k">{PY_ROLES[r.role] || r.role}</span>
                <span className="bar"><span style={{ width: `${r.remaining / maxRem * 100}%` }} /></span>
                <span className="v mono">{r.remaining}h</span>
                {r.overloaded ? <span className="py-over">{I.alertTriangle}overloaded</span> : <span className="py-over ok">ok</span>}
              </div>
            ))}
          </div>
          <div className="py-ana-note">Bottleneck check: a role whose remaining task-hours exceed its window capacity is flagged — rebalance assignments or extend the timeline before it becomes the critical path.</div>
        </div>

        <div className="py-card">
          <div className="py-card-h">Document coverage<span className="py-card-sub">getDocumentCoverage · CTD sections × task completion</span></div>
          <div className="py-cov">
            {Object.keys(mods).sort().map(m => (
              <div key={m} className="py-cov-mod">
                <div className="py-cov-mod-l">Module {m}</div>
                <div className="py-cov-rows">
                  {mods[m].map(c => (
                    <div key={c.section} className="py-cov-row">
                      <span className="mono sec">{c.section}</span>
                      <span className="bar"><span data-pc={c.pct === 100 ? 2 : c.pct > 0 ? 1 : 0} style={{ width: `${Math.max(c.pct, 4)}%` }} /></span>
                      <span className="v mono">{c.pct}%</span>
                      <span className="n">{c.tasks.length} task{c.tasks.length > 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="py-card" style={{ marginTop: 14 }}>
        <div className="py-card-h">Critical path<span className="py-card-sub">getCriticalPath · the dependency chain that gates dispatch</span></div>
        <div className="py-cp">
          {crit.map((t, i) => (
            <React.Fragment key={t.id}>
              <button className="py-cp-node" data-st={t.status} onClick={() => onTask(t.id)} title={`${t.name} — ${PY_STATUS[t.status]?.l}`}>
                <span className="dot" />
                <span className="t">{t.name}</span>
                <span className="m">{PY_STATUS[t.status]?.l} · {t.hours}h</span>
              </button>
              {i < crit.length - 1 && <span className="py-cp-arrow">{I.chevRight}</span>}
            </React.Fragment>
          ))}
        </div>
        <div className="py-ana-note">Tasks marked critical form the longest dependency chain to submission. Deprioritizing any of these moves the filing date one-for-one.</div>
      </div>
    </div>
  );
}

// ── Global submissions browser ────────────────────────────────────────────

function PyGlobal({ globals }: { globals: PyGlobalConfig[] }) {
  const [region, setRegion] = useState('all');
  const regions = ['all', 'Americas', 'Europe', 'Asia-Pacific'];
  const shown = globals.filter(g => region === 'all' || g.region === region);
  return (
    <div>
      <div className="rbm-bar">
        <div className="rbm-filters">
          {regions.map(r => (
            <button key={r} className="rbm-filter" data-on={region === r || undefined} onClick={() => setRegion(r)}>{r === 'all' ? 'All regions' : r}</button>
          ))}
        </div>
        <span className="rbm-bar-info">globalPyramids.ts · {globals.length} configurations · normalized to the engine task model</span>
      </div>
      <div className="py-glob-grid">
        {shown.map(g => (
          <div key={g.type} className="py-glob">
            <div className="py-glob-h">
              <span className="py-type-id">{g.type}</span>
              <span className="py-glob-fmt mono">{g.format}</span>
            </div>
            <div className="py-glob-agency">{g.agency}</div>
            <div className="py-glob-m">{g.region} · ~{g.days} days · {g.tasks} tasks</div>
            <div className="py-glob-l">Local requirements</div>
            <ul>{g.local.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="rbm-note">{I.info}Global pyramids are read-only agency configurations (title · level · assignedRole) normalized into the same rendering model as engine pyramids. Sequencing strategy lives in Registrations → reliance pathways.</div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────

export function PyramidShell({ onAsk }: SurfaceViewProps) {
  const [picked, setPicked] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [tasks, setTasks] = useState(PY_PYRAMID.tasks);
  const [focusPhase, setFocusPhase] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);

  const pyrState = useLive<PyPyramid>(`/api/v1/pyramids/${PY_PYRAMID.type}`, PY_PYRAMID);
  const typesState = useLive<PyType[]>('/api/v1/pyramids/types', PY_TYPES);
  const globalsState = useLive<PyGlobalConfig[]>('/api/v1/global-pyramids', PY_GLOBAL);
  const sample = pyrState.sample;
  const types = typesState.data;
  const globals = globalsState.data;

  const pyr: PyPyramid = { ...pyrState.data, tasks };

  const setStatus = (id: string, status: string) => setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t));
  const goPhase = (id: string) => { setFocusPhase(id); setTab('wbs'); };
  const goTask = (id: string) => setOpenTask(id);
  const openObj = openTask ? tasks.find(t => t.id === openTask) ?? null : null;

  if (!picked) {
    return (
      <div className="py" data-screen-label="Submission pyramid">
        <SampleTag sample={sample} />
        <div className="reg-h"><div><div className="ph-eyebrow">Submission · planning</div><h1 className="reg-title">Submission pyramid</h1><p className="reg-sub">Deterministic work breakdown for every submission type.</p></div></div>
        <PyTypeSelector types={types} onPick={() => setPicked(true)} />
      </div>
    );
  }

  const TABS: [string, string][] = [['dashboard', 'Dashboard'], ['wbs', 'Work breakdown'], ['analytics', 'Analytics'], ['global', 'Global submissions']];
  return (
    <div className="py" data-screen-label={`Submission pyramid · ${tab}`}>
      <SampleTag sample={sample} />
      <div className="reg-h">
        <div>
          <div className="ph-eyebrow">Submission · planning</div>
          <h1 className="reg-title">Submission pyramid</h1>
          <p className="reg-sub">{pyr.label} · {pyr.program}. Every phase, task, dependency and score is deterministic engine output; task status is the only thing you own.</p>
        </div>
        <button className="rbm-btn" onClick={() => setPicked(false)}>{I.gitBranch}Change type</button>
      </div>

      <div className="reg-tabs" role="tablist">
        {TABS.map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`reg-tab${tab === id ? ' on' : ''}`}
            onClick={() => { setTab(id); if (id !== 'wbs') setFocusPhase(null); }}>{l}</button>
        ))}
      </div>

      {tab === 'dashboard' && <PyDashboard pyr={pyr} onPhase={goPhase} onTask={goTask} />}
      {tab === 'wbs' && (
        <div>
          {focusPhase && <button className="py-back" onClick={() => setFocusPhase(null)}>{I.chevRight}All phases</button>}
          <PyWorkBreakdown pyr={pyr} focusPhase={focusPhase} tasks={tasks} onTask={goTask} onStatus={setStatus} />
        </div>
      )}
      {tab === 'analytics' && <PyAnalytics pyr={pyr} onTask={goTask} />}
      {tab === 'global' && <PyGlobal globals={globals} />}

      <PyTaskSheet pyr={pyr} task={openObj} tasks={tasks} onClose={() => setOpenTask(null)} onTask={goTask} onStatus={setStatus} />
    </div>
  );
}

export default PyramidShell;
