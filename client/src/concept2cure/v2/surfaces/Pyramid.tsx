/**
 * Pyramid surface — submission work-breakdown pyramid (kit pyramid.jsx;
 * analytics + global browser in ./PyramidAnalytics, kit pyramid-analytics.jsx).
 *
 * Type selector → dashboard (progress ring · phase strip · risk gauge ·
 * next actions) → work breakdown (phase → task → detail sheet) → analytics
 * (resources · coverage · critical path) → global browser.
 *
 * REAL-DATA STANDARD (regulated GA product — no fixture fallback): all three
 * slices are wired to the deterministic SubmissionPyramidEngine via
 *   GET /api/v1/pyramids/types        → submission types (selector)
 *   GET /api/v1/pyramids/:type        → the picked pyramid's structure
 *   GET /api/v1/global-pyramids       → international agency configs
 * (server/routes/pyramid.routes.ts). Each renders the full four states —
 * loading → honest error → honest empty → real — with no "Sample data" pill and
 * no codebase fixture.
 *
 * The engine's pyramid STRUCTURE carries no progress, so every task arrives at
 * its honest initial status 'todo'. PROGRESS over that structure is per-org and
 * is read and written through its own pair —
 *   GET   /api/v1/pyramids/:type/progress
 *   PATCH /api/v1/pyramids/:type/progress/:taskId
 * — so the status dropdown is a governed write, not the "one client-owned
 * slice" this header used to describe. PY_ROLES/PY_STATUS/PY_RISK and the deterministic
 * helpers (pyProgress/pyNextTasks/pyRiskProfile/pyResources/pyCoverage) are the
 * canonical display config/compute layer — they operate over whatever pyramid
 * object they're handed.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { useLiveData, useLiveRows, EmptyState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  PY_ROLES, PY_STATUS, PY_RISK,
  pyProgress, pyNextTasks, pyRiskProfile,
  type PyType, type PyTask, type PyPyramid, type PyGlobalConfig,
} from '../fixtures/pyramid-data';
import { PyAnalytics, PyGlobal } from './PyramidAnalytics';
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
      {groups.map(([seg, label]) => {
        const rows = types.filter(t => t.segment === seg);
        if (rows.length === 0) return null;
        return (
          <div key={seg} className="py-picker-grp">
            <div className="py-picker-grp-l">{label}</div>
            <div className="py-picker-grid">
              {rows.map(t => (
                <button key={t.id} className="py-type" onClick={() => onPick(t)}>
                  <div className="py-type-h"><span className="py-type-id">{t.id}</span></div>
                  <div className="py-type-l">{t.label.split('—')[1] || t.label}</div>
                  <div className="py-type-m">{t.agency} · {t.ctd} · {t.phases} phases · {t.tasks} tasks · {t.hours}h</div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
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

      <div className="py-sec-h"><h2>Phases</h2><span className="py-sec-sub">click a phase to open its work breakdown</span></div>
      <div className="py-strip">
        {pyr.phases.map(ph => {
          const p = prog.perPhase[ph.id];
          return (
            <button key={ph.id} className="py-phase" data-ord={ph.order} onClick={() => onPhase(ph.id)}>
              <div className="py-phase-n">Phase {ph.order}</div>
              <div className="py-phase-name">{ph.name}</div>
              <div className="py-phase-bar"><span style={{ width: `${p?.pct ?? 0}%` }} /></div>
              <div className="py-phase-m">{p?.completed ?? 0}/{p?.total ?? 0} · {p?.pct ?? 0}%{typeof ph.weeks === 'number' ? ` · ~${ph.weeks}w` : ''}</div>
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
            <div className="py-wbs-phase-h"><span className="n">Phase {ph.order}</span><span className="name">{ph.name}</span><span className="m">{ts.length} tasks{typeof ph.weeks === 'number' ? ` · ~${ph.weeks}w` : ''}</span></div>
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

// ── Small render helpers ───────────────────────────────────────────────────

/**
 * One sentence for a refused status write, whatever refused it.
 *
 * The two failure paths used to word this differently, and the one that had
 * MORE to say said less: with a server message the banner read "The submission
 * is locked for filing.. The task is unchanged." — a doubled full stop, and no
 * statement anywhere that nothing had been saved. The reason a status write is
 * announced at all is that the dropdown snaps back, and a bare server sentence
 * beside a reverted control reads as an explanation of the current value
 * rather than of a write that did not land.
 */
function statusRefusal(why: string): string {
  return 'The status was not saved — ' + why.replace(/[.\s]+$/, '') + '. The task is unchanged.';
}

const PyLoading = ({ label }: { label: string }) => (
  <div className="scaf-note" style={{ padding: '18px 10px' }}>{label}</div>
);

// ── Shell ─────────────────────────────────────────────────────────────────

export function PyramidShell(_props: SurfaceViewProps) {
  const [type, setType] = useState<string | null>(null);
  const [tab, setTab] = useState('dashboard');
  const [focusPhase, setFocusPhase] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  /* ── Task status is the ORG'S RECORDED progress, not a local override ──────
     This was `statusOverrides` in component state. A user marked a submission
     task "Done" or "Blocked", the completion ring and the phase bars updated,
     and the change was never sent anywhere — it vanished on reload, and on
     merely switching submission type, which cleared the object outright.

     The pyramid STRUCTURE is immutable and shared (a pure engine read); the
     PROGRESS over it is per-org, which is why the advisory models them
     separately. GET/PATCH /api/v1/pyramids/:type/progress is that second half.

     Applied optimistically and REVERTED if the write is refused, so the ring
     never counts a task the record does not have done. */
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [statusErr, setStatusErr] = useState('');

  const typesState = useLiveRows<PyType>('/api/v1/pyramids/types');
  const pyrState = useLiveData<PyPyramid>(type ? `/api/v1/pyramids/${type}` : null);
  const globalsState = useLiveRows<PyGlobalConfig>('/api/v1/global-pyramids');
  const progressState = useLiveData<{ type: string; statuses: Record<string, string> }>(
    type ? `/api/v1/pyramids/${type}/progress` : null,
  );

  // Adopt the org's recorded progress whenever the type changes or the read
  // resolves. Keyed on the payload so an in-flight local edit is not clobbered
  // by the same response arriving twice.
  useEffect(() => {
    setStatusErr('');
    setStatuses(progressState.data?.statuses ?? {});
  }, [type, progressState.data]);

  // Working task list: real pyramid tasks (structure) with the org's recorded
  // statuses applied. Pure derivation — never seeds state during render.
  const tasks = useMemo<PyTask[]>(
    () => (pyrState.data?.tasks ?? []).map(
      t => (statuses[t.id] ? { ...t, status: statuses[t.id] } : t),
    ),
    [pyrState.data, statuses],
  );
  const pyr: PyPyramid | null = pyrState.data ? { ...pyrState.data, tasks } : null;

  const setStatus = async (id: string, status: string) => {
    if (!type) return;
    const before = statuses;
    setStatuses(o => {
      const next = { ...o };
      // 'todo' is the ABSENCE of recorded progress — same reading the server
      // takes — so it clears the entry rather than storing a status that says
      // nothing.
      if (status === 'todo') delete next[id];
      else next[id] = status;
      return next;
    });
    setStatusErr('');
    try {
      const res = await apiRequest(
        'PATCH',
        `/api/v1/pyramids/${encodeURIComponent(type)}/progress/${encodeURIComponent(id)}`,
        { status },
      );
      if (!res.ok) {
        setStatuses(before);
        const j = await res.json().catch(() => null);
        setStatusErr(statusRefusal(serverMessage(j) ?? `the server refused it (HTTP ${res.status})`));
      }
    } catch (e) {
      setStatuses(before);
      setStatusErr(statusRefusal(e instanceof Error ? e.message : String(e)));
    }
  };
  const goPhase = (id: string) => { setFocusPhase(id); setTab('wbs'); };
  const goTask = (id: string) => setOpenTask(id);
  const openObj = openTask ? tasks.find(t => t.id === openTask) ?? null : null;
  const activeType = typesState.rows.find(t => t.id === type);

  /* WHAT ANA SEES HERE — published above the type-picker early return so one
     call covers every branch. */
  const anaContext = useMemo(() => {
    const actions = [
      'Pick a submission type; switch dashboard/work-breakdown/analytics/global tabs; focus a phase; open a task',
      'Changing a task status is a persisted, org-scoped write — AnA proposes it in conversation, never through screen controls.',
    ];
    if (!type) {
      if (typesState.loading) {
        return { summary: 'Submission pyramid: no submission type picked yet — the type list is still loading.' };
      }
      if (typesState.error) {
        return {
          summary:
            'Submission pyramid: no submission type picked yet — the submission types could not be read. A failed read, not an empty catalog.',
        };
      }
      if (typesState.empty) {
        return {
          summary:
            'Submission pyramid: no submission type picked yet — the engine returned no submission types to pick from.',
        };
      }
      return {
        summary: `Submission pyramid: no submission type picked yet — ${typesState.rows.length} type(s) to pick from.`,
        facts: { typeCount: typesState.rows.length },
        availableActions: actions,
      };
    }
    // A refused status write is echoed in the surface's own wording, not swallowed.
    const refusal = statusErr ? ` ${statusErr}` : '';
    if (tab === 'global') {
      if (globalsState.loading) {
        return { summary: `Submission pyramid (${type}), global tab: global submissions are still loading.${refusal}` };
      }
      if (globalsState.error) {
        return {
          summary: `Submission pyramid (${type}), global tab: the global-pyramid configurations could not be read — a failed read, not an empty catalog.${refusal}`,
        };
      }
      if (globalsState.empty) {
        return {
          summary: `Submission pyramid (${type}), global tab: the engine returned no global pyramid configurations.${refusal}`,
        };
      }
      return {
        summary: `Submission pyramid (${type}), global tab: ${globalsState.rows.length} international agency configuration(s).${refusal}`,
        facts: { type, tab, globalCount: globalsState.rows.length },
        availableActions: actions,
      };
    }
    if (pyrState.loading) {
      return { summary: `Submission pyramid: the ${type} pyramid is still loading.${refusal}` };
    }
    if (pyrState.error) {
      return {
        summary: `Submission pyramid: the ${type} pyramid could not be loaded — the engine did not return its work breakdown. A failed read, not an empty pyramid.${refusal}`,
      };
    }
    const merged: PyPyramid | null = pyrState.data ? { ...pyrState.data, tasks } : null;
    if (!merged || pyrState.empty) {
      return {
        summary: `Submission pyramid: the engine has no work-breakdown definition for ${type} yet.${refusal}`,
      };
    }
    const prog = pyProgress(merged);
    // Recorded progress merges from a SECOND read (progressState); when that
    // read is absent or failed, say so rather than asserting nothing is done.
    const progressRead = progressState.data != null;
    return {
      summary:
        `Submission pyramid ${type}, ${tab} tab: ${prog.pct}% complete — ${prog.completed}/${prog.total} tasks done, ` +
        `critical path ${prog.criticalPathPct}%, ${prog.hoursRemaining}h remaining.` +
        (progressRead ? '' : ' Recorded progress may not have been read — completion reflects only what was readable.') +
        refusal,
      facts: {
        type,
        tab,
        progressPct: prog.pct,
        tasksCompleted: prog.completed,
        tasksTotal: prog.total,
        criticalPathPct: prog.criticalPathPct,
        hoursRemaining: prog.hoursRemaining,
        ...(focusPhase ? { focusPhase } : {}),
        ...(openTask ? { openTask } : {}),
        ...(progressRead ? {} : { recordedProgressRead: false }),
      },
      availableActions: actions,
    };
  }, [
    type, tab, statusErr,
    typesState.loading, typesState.error, typesState.empty, typesState.rows,
    globalsState.loading, globalsState.error, globalsState.empty, globalsState.rows,
    pyrState.loading, pyrState.error, pyrState.empty, pyrState.data,
    tasks, progressState.data, focusPhase, openTask,
  ]);
  /* Navigation of the work breakdown. A task's STATUS control persists to the
     server and stays the person's; these four only move the view. */
  useSurfaceActionHandlers('pyramid', {
    'pyramid.select-type': (params) => {
      const raw = String(params.type ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a submission type.' };
      if (typesState.loading) return { ok: false, reason: 'The submission types are still loading.', retry: true };
      if (typesState.error) {
        return { ok: false, reason: 'The submission-type catalog could not be read, so there is nothing to pick from.' };
      }
      const needle = raw.toLowerCase();
      const rows = typesState.rows;
      const exact = rows.filter((t) => t.id.toLowerCase() === needle || t.label.toLowerCase() === needle);
      const hits = exact.length ? exact : rows.filter((t) => t.label.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No submission type named "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} types — name one exactly.` };
      const t = hits[0];
      // The same reset the picker's own click performs.
      setType(t.id);
      setTab('dashboard');
      setFocusPhase(null);
      setOpenTask(null);
      return { ok: true, detail: `Loaded the ${t.label} pyramid` };
    },
    'pyramid.open-tab': (params) => {
      const target = String(params.tab ?? '');
      if (!['dashboard', 'wbs', 'analytics', 'global'].includes(target)) {
        return { ok: false, reason: `No pyramid tab named "${params.tab}".` };
      }
      if (tab === target) return { ok: true, detail: `Already on the ${target} tab` };
      setTab(target);
      if (target !== 'wbs') setFocusPhase(null);
      return { ok: true, detail: `Opened the ${target} tab` };
    },
    'pyramid.focus-phase': (params) => {
      if (!type) return { ok: false, reason: 'No submission type is picked yet, so there is no pyramid to focus.' };
      const raw = String(params.phase ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a phase to focus.' };
      if (pyrState.loading) return { ok: false, reason: 'The pyramid is still loading.', retry: true };
      if (pyrState.error || !pyr) {
        return { ok: false, reason: 'The pyramid could not be read, so its phases are not listed.' };
      }
      const needle = raw.toLowerCase();
      const exact = pyr.phases.filter((p) => p.id.toLowerCase() === needle || p.name.toLowerCase() === needle);
      const hits = exact.length ? exact : pyr.phases.filter((p) => p.name.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No phase named "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} phases — name one exactly.` };
      setFocusPhase(hits[0].id);
      setTab('wbs');
      return { ok: true, detail: `Focused ${hits[0].name} in the work breakdown` };
    },
    'pyramid.open-task': (params) => {
      if (!type) return { ok: false, reason: 'No submission type is picked yet, so there are no tasks.' };
      const raw = String(params.task ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a task to open.' };
      if (pyrState.loading) return { ok: false, reason: 'The pyramid is still loading.', retry: true };
      if (pyrState.error || !pyr) {
        return { ok: false, reason: 'The pyramid could not be read, so its tasks are not listed.' };
      }
      const needle = raw.toLowerCase();
      const exact = pyr.tasks.filter((t) => t.id.toLowerCase() === needle || t.name.toLowerCase() === needle);
      const hits = exact.length ? exact : pyr.tasks.filter((t) => t.name.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No task named "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} tasks — name one exactly.` };
      setOpenTask(hits[0].id);
      return { ok: true, detail: `Opened the ${hits[0].name} task sheet — its status control stays a human act` };
    },
  });
  useEffect(() => {
    if (!typesState.loading && !typesState.error && !pyrState.loading) notifySurfaceActionReady('pyramid');
  }, [typesState.loading, typesState.error, pyrState.loading]);

  usePublishSurfaceContext('pyramid', anaContext);

  // ── Entry: submission type selector (four states) ──
  if (!type) {
    return (
      <div className="py" data-screen-label="Submission pyramid">
        <div className="reg-head">
          <div>
            <div className="ph-eyebrow">Submission · planning</div>
            <h1 className="reg-title">Submission pyramid</h1>
            <p className="reg-sub">Deterministic work breakdown for every submission type.</p>
          </div>
        </div>
        {typesState.loading ? (
          <PyLoading label="Loading submission types…" />
        ) : typesState.error ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load submission types"
            hint="The submission-pyramid engine didn't respond. These are the deterministic pyramid definitions (IND, NDA, BLA, 510(k) and more) served read-only from the engine — sign in and retry, or check that the API is reachable."
          />
        ) : typesState.empty ? (
          <EmptyState
            icon={I.gitBranch}
            title="No submission types available"
            hint="The submission-pyramid engine returned no supported types. Every submission type will appear here to pick from once the engine exposes its pyramid definitions."
          />
        ) : (
          <PyTypeSelector types={typesState.rows} onPick={(t) => { setType(t.id); setTab('dashboard'); setFocusPhase(null); setOpenTask(null); }} />
        )}
      </div>
    );
  }

  const TABS: [string, string][] = [['dashboard', 'Dashboard'], ['wbs', 'Work breakdown'], ['analytics', 'Analytics'], ['global', 'Global submissions']];

  // ── Pyramid-backed tabs (dashboard / wbs / analytics) — four states ──
  const renderPyramidTab = () => {
    if (pyrState.loading) return <PyLoading label={`Loading ${activeType?.id ?? type} pyramid…`} />;
    if (pyrState.error) return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title="Couldn't load this submission pyramid"
        hint="The submission-pyramid engine didn't return this type's work breakdown (phases, tasks, critical path, risk, document coverage). It's a deterministic read — sign in and retry, or check that the API is reachable."
      />
    );
    if (!pyr || pyrState.empty) return (
      <EmptyState
        icon={I.gitBranch}
        title="No pyramid for this submission type"
        hint="The engine has no work-breakdown definition for this submission type yet. Pick another type, or check back once its pyramid is defined."
      />
    );
    if (tab === 'dashboard') return <PyDashboard pyr={pyr} onPhase={goPhase} onTask={goTask} />;
    if (tab === 'wbs') return (
      <div>
        {focusPhase && <button className="py-back" onClick={() => setFocusPhase(null)}>{I.chevRight}All phases</button>}
        <PyWorkBreakdown pyr={pyr} focusPhase={focusPhase} tasks={tasks} onTask={goTask} onStatus={setStatus} />
      </div>
    );
    if (tab === 'analytics') return <PyAnalytics pyr={pyr} onTask={goTask} />;
    return null;
  };

  // ── Global submissions tab — four states ──
  const renderGlobalTab = () => {
    if (globalsState.loading) return <PyLoading label="Loading global submissions…" />;
    if (globalsState.error) return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title="Couldn't load global submissions"
        hint="The global-pyramid configurations didn't load. These are the read-only international agency pathways (Health Canada, PMDA, EU MDR and more) served from the engine — sign in and retry, or check that the API is reachable."
      />
    );
    if (globalsState.empty) return (
      <EmptyState
        icon={I.gitBranch}
        title="No global submissions available"
        hint="The engine returned no global pyramid configurations. International agency pathways will appear here once the engine exposes them."
      />
    );
    return <PyGlobal globals={globalsState.rows} />;
  };

  return (
    <div className="py" data-screen-label={`Submission pyramid · ${tab}`}>
      <div className="reg-head">
        <div>
          <div className="ph-eyebrow">Submission · planning</div>
          <h1 className="reg-title">Submission pyramid</h1>
          <p className="reg-sub">{activeType?.label ?? pyr?.label ?? type} · deterministic work breakdown. Every phase, task, dependency and score is engine output; task status is the only thing you own.</p>
        </div>
        <button className="rbm-btn" onClick={() => { setType(null); setFocusPhase(null); setOpenTask(null); }}>{I.gitBranch}Change type</button>
      </div>

      <div className="reg-tabs" role="tablist">
        {TABS.map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`reg-tab${tab === id ? ' on' : ''}`}
            onClick={() => { setTab(id); if (id !== 'wbs') setFocusPhase(null); }}>{l}</button>
        ))}
      </div>

      {/* A refused status write is announced, not swallowed. Without this the
          revert above would look like the dropdown simply snapping back. */}
      {statusErr && (
        <div className="py-status-err" role="alert">{statusErr}</div>
      )}

      {tab === 'global' ? renderGlobalTab() : renderPyramidTab()}

      {pyr && <PyTaskSheet pyr={pyr} task={openObj} tasks={tasks} onClose={() => setOpenTask(null)} onTask={goTask} onStatus={setStatus} />}
    </div>
  );
}

export default PyramidShell;
