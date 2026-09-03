import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData, type DataState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import '../styles/ana-v2.css';
import { C2CToast, useToast } from '../toast';

/* ════════════════════════════════════════════════════════════════════════
   AnA Command Center — re-anchored to the real orchestration backend.

   Every rendered DATA slice is now real persisted/computed data, an honest
   empty state, or an honest error state — never a fixture. Endpoints:
     - Portfolio  GET  /api/report-os/portfolio/org            (REAL)
     - Continuity POST /api/orchestration/continuity           (REAL)
     - Recs       POST /api/orchestration/recommendations      (REAL)
     - Gate       POST /api/orchestration/pre-submission-gate  (REAL)
     - Workflows  GET  /api/orchestration/templates            (REAL)
     - Run wf     POST /api/orchestration/execute              (REAL · audited)
     - Dispatch   POST /api/ai-actions/execute                 (REAL · audited)
   The two ACTIONS (Run a workflow, Dispatch a recommendation) now hit those
   real executors — confirm → run → honest result, never a fabricated step
   animation. The role lens below is canonical RBAC config (kept, inlined).
   ════════════════════════════════════════════════════════════════════════ */

/* ── Canonical display config (kit constants) ── */

const TRAJ_MAP: Record<string, { ic: string; t: string; c: string }> = {
  improving: { ic: 'trendUp', t: 'improving', c: 'ok' },
  declining: { ic: 'trendDown', t: 'declining', c: 'err' },
  stable:    { ic: 'minus', t: 'stable', c: 'idle' },
};

const VERDICT_MAP: Record<string, { t: string; c: string }> = {
  ready:       { t: 'READY', c: 'ok' },
  conditional: { t: 'CONDITIONAL', c: 'warn' },
  hold:        { t: 'HOLD', c: 'err' },
};

const SEV_MAP: Record<string, string> = {
  critical: 'err', high: 'warn', medium: 'ai', low: 'idle', info: 'idle',
};

/* Real member `status` ('ready'|'partial'|'missing') → the readiness-bar CSS
   token the card styling expects. Display translation, not fabrication. */
const STATUS_CSS: Record<string, string> = {
  ready: 'on_track', partial: 'at_risk', missing: 'behind',
};

/* Real member `riskLevel` → an rd-chip tone. */
const RISK_TONE: Record<string, string> = {
  critical: 'err', high: 'warn', medium: 'ai', low: 'ok',
};

/* Canonical RBAC role lens (module filter for the recommendations feed). Real
   reference config — kept, not a data fixture. */
const AC_ROLES: { id: string; label: string; modules: string[] }[] = [
  { id: 'all', label: 'All work', modules: ['clinical', 'cmc', 'safety', 'submission', 'labeling', 'nonclinical'] },
  { id: 'ra', label: 'Reg. affairs', modules: ['submission', 'labeling', 'clinical'] },
  { id: 'cmc', label: 'CMC', modules: ['cmc', 'nonclinical'] },
  { id: 'biostat', label: 'Biostatistics', modules: ['clinical'] },
  { id: 'pv', label: 'Safety / PV', modules: ['safety'] },
  { id: 'exec', label: 'Executive', modules: ['clinical', 'cmc', 'safety', 'submission'] },
];

/* ── Typed icon accessor ── */

const Ico = I as Record<string, React.ReactElement>;

/* ── Display types aligned to the REAL backend columns ── */

/* GET /api/report-os/portfolio/org → OrgPortfolioSummary.attentionRanked[]
   (ProgramMemberInsight). code / indication / nextMilestone are nullable and
   rendered null-safe. The backend does NOT return seg / app / trajectory /
   module, so those are not displayed and never fabricated. */
interface PortfolioProgram {
  projectId: number;
  code?: string | null;
  indication?: string | null;
  readinessScore: number;
  status: string;                // 'ready' | 'partial' | 'missing'
  criticalBlockerCount: number;
  riskLevel: string;             // 'low' | 'medium' | 'high' | 'critical'
  nextMilestone?: { label: string; targetDate?: string | null; forecastDate?: string | null } | null;
}
interface OrgPortfolio {
  attentionRanked: PortfolioProgram[];
}

/* POST /api/orchestration/continuity → ProjectContinuitySnapshot. newlyReady /
   needsAttention `id` are numbers (not strings), per the real type. */
interface ContinuityChange { type: string; description: string; targetType: string; targetId: string | number; timestamp: string; }
interface ContinuityReady { type: string; id: number; title: string; }
interface ContinuityAttention { type: string; id: number; title: string; reason: string; }
interface Continuity {
  projectId: number;
  summary: string;
  trajectory: string;            // 'improving' | 'declining' | 'stable'
  metrics: { readinessScore: number; documentCount: number; validatedCount: number; blockerCount: number; taskCompletionPercent: number };
  changes: ContinuityChange[];
  newlyReady: ContinuityReady[];
  needsAttention: ContinuityAttention[];
}

/* POST /api/orchestration/recommendations → RecommendationSet. module /
   targetObjectTitle / actionPayload are optional in the real type.
   `actionPayload` is the engine's machine-executable handle: its actionType is
   EITHER a real AIActionType (dispatch → /api/ai-actions/execute) OR a workflow
   template id (dispatch → /api/orchestration/execute). Dispatch routes on which
   (see dispatchRec). When it's absent the recommendation carries no executable
   action, so Dispatch honestly hands the suggestion to AnA instead. */
interface Rec {
  id: string;
  severity: string;
  module?: string;
  targetObjectType: string;
  targetObjectId: string | number;
  targetObjectTitle?: string;
  reason: string;
  evidence: string[];
  suggestedAction: string;
  actionPayload?: { actionType: string; payload?: Record<string, unknown> };
  confidence: number;
}
interface RecommendationSet { recommendations: Rec[] }

/* POST /api/orchestration/pre-submission-gate response. `ich` is null whenever
   no cmcProjectId is supplied — this surface supplies none, so it is always
   null here (rendered honestly as "not evaluated"). */
interface GateReadiness { overallScore: number; status: string; scores: Record<string, number> }
interface GateRisk { overallRisk: string; riskScore: number }
interface GateIch { overallStatus: string; counts: Record<string, number> }
interface Gate {
  submissionType: string;
  verdict: string;
  verdictRationale: string[];
  readiness: GateReadiness;
  cmc: { contradictionCounts: Record<string, number> };
  crl: GateRisk;
  rtf: GateRisk;
  ich: GateIch | null;
}

/* GET /api/orchestration/templates → { templates: [...] }. The route exposes
   stepCount (a number), NOT the step array — so the Run action can't animate a
   live step-by-step bar. Instead it awaits the synchronous executor (POST
   /execute runs every step server-side, then returns the terminal execution)
   and renders the REAL final step statuses. No fabricated animation. */
interface WorkflowTpl {
  templateId: string;
  name: string;
  description: string;
  stepCount: number;
  estimatedDurationMinutes: number;
}

/* POST /api/orchestration/execute → WorkflowExecution. Runs synchronously to a
   terminal state (completed | failed) then returns it; only the fields rendered
   here. steps[].errors and result.* are honest server output. */
interface ExecStep { stepId: string; name: string; status: string; errors?: { code: string; message: string }[] }
interface ExecResult {
  executionId: string;
  templateId: string;
  status: string;
  steps: ExecStep[];
  totalDurationMs?: number;
  result?: {
    summary?: string;
    blockers?: { message: string }[];
    createdObjects?: { type: string; id: string | number; title?: string }[];
    updatedObjects?: { type: string; id: string | number; title?: string }[];
  };
}

/* POST /api/ai-actions/execute → AIActionResponse (synchronous branch). status
   may be 'queued' when the action was routed to the async worker — surfaced
   honestly as "queued", never claimed done. */
interface ActionResp {
  success: boolean;
  status: string;
  createdObjects?: { type: string; id: string | number; title?: string }[];
  updatedObjects?: { type: string; id: string | number; title?: string }[];
  warnings?: string[];
  errors?: { code: string; message: string }[];
}

/* Normalized display shape both executors fold into, so one modal renders
   either an orchestration run or an AI-action dispatch without fabrication. */
interface ObjRef { type: string; id: string | number; title?: string }
interface RunOutcome {
  ok: boolean;
  kind: 'workflow' | 'action';
  title: string;
  status: string;                // terminal status token, verbatim from server
  summary: string;
  queued: boolean;
  steps: { name: string; status: string; error?: string }[];
  created: ObjRef[];
  updated: ObjRef[];
  blockers: string[];
  warnings: string[];
  errors: string[];
}

/* A pending, not-yet-confirmed run. Executing a workflow / AI action mutates
   regulatory objects and is audited, so the modal shows this first and only
   fires the POST on explicit confirm. */
interface PendingRun {
  title: string;
  desc: string;
  kind: 'workflow' | 'action';
  endpoint: string;
  body: Record<string, unknown>;
}

/* Stable empty identities so the hooks/memos below never thrash on a fresh
   []/null returned every render while loading or on error. */
const EMPTY_PROGRAMS: PortfolioProgram[] = [];
const EMPTY_RECS: Rec[] = [];
const EMPTY_TPLS: WorkflowTpl[] = [];

/* Fixture-free POST reader. The orchestration briefing / recommendation / gate
   endpoints are POST (compute-on-demand with a { projectId } body), so the
   GET-only useLiveData / useLiveRows hooks can't drive them. This mirrors their
   honesty contract — real → honest empty → honest error, never a fixture — over
   apiRequest, the same transport the GET hooks use. Loop-safe: the effect is
   keyed on [path, projectId, enabled] primitives and the body is built
   internally, so no fresh object identity re-triggers it. */
function useLivePost<T>(path: string, projectId: number | null, enabled = true): DataState<T> {
  const [state, setState] = useState<DataState<T>>({ data: null, loading: false, empty: false });
  useEffect(() => {
    if (!enabled || projectId == null) {
      setState({ data: null, loading: false, empty: false });
      return undefined;
    }
    let cancelled = false;
    setState({ data: null, loading: true, empty: false });
    apiRequest('POST', path, { projectId })
      .then(async (res: Response) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({ data: null, loading: false, empty: false, error: `HTTP ${res.status} ${path}` });
          return;
        }
        const body = (await res.json()) as T;
        setState({ data: body ?? null, loading: false, empty: body == null });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ data: null, loading: false, empty: false, error: e instanceof Error ? e.message : String(e) });
      });
    return () => { cancelled = true; };
  }, [path, projectId, enabled]);
  return state;
}

/* ── Executor result → RunOutcome (verbatim server fields, no fabrication) ── */

function normWorkflow(e: ExecResult, title: string): RunOutcome {
  const r = e.result;
  const failed = e.status === 'failed';
  return {
    ok: e.status === 'completed',
    kind: 'workflow',
    title,
    status: e.status,
    summary: r?.summary || (failed ? 'The workflow stopped before completing.' : `Workflow ${e.status}.`),
    queued: false,
    steps: (e.steps || []).map(s => ({ name: s.name, status: s.status, error: s.errors?.[0]?.message })),
    created: r?.createdObjects || [],
    updated: r?.updatedObjects || [],
    blockers: (r?.blockers || []).map(b => b.message),
    warnings: [],
    errors: failed ? (e.steps || []).flatMap(s => (s.errors || []).map(x => x.message)) : [],
  };
}

function normAction(a: ActionResp, title: string): RunOutcome {
  const queued = a.status === 'queued';
  return {
    ok: !!a.success,
    kind: 'action',
    title,
    status: a.status,
    summary: queued
      ? 'Queued for processing — AnA will run it in the background.'
      : a.success ? 'Action completed.' : (a.errors?.[0]?.message || 'The action did not complete.'),
    queued,
    steps: [],
    created: a.createdObjects || [],
    updated: a.updatedObjects || [],
    blockers: [],
    warnings: a.warnings || [],
    errors: (a.errors || []).map(x => x.message),
  };
}

/* ════ AnA Command Center ════ */

export function AnaCommand({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;

  /* Org-wide rollup — GET /api/report-os/portfolio/org (REAL). useLiveData
     unwraps the { data } envelope, so `data` is the OrgPortfolioSummary. */
  const portfolio = useLiveData<OrgPortfolio>('/api/report-os/portfolio/org');
  const programs: PortfolioProgram[] = portfolio.data?.attentionRanked ?? EMPTY_PROGRAMS;

  const [pid, setPid] = useState<number | null>(null);
  const [role, setRole] = useState('all');
  const [gateOpen, setGateOpen] = useState(false);
  const [toast, fire] = useToast();

  /* Action runner — a run is staged (pending confirm), in flight, done, or
     errored. Executing mutates + audits, so nothing fires until confirm. */
  const [pending, setPending] = useState<PendingRun | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [runErr, setRunErr] = useState('');
  const runOpen = pending != null || running || outcome != null || runErr !== '';
  const closeRun = () => { setPending(null); setRunning(false); setOutcome(null); setRunErr(''); };

  /* Select the first (most-attention) program once the real rollup resolves,
     and re-point if the current selection leaves the set. Loop-safe: `programs`
     is a stable reference after load and the body no-ops once pid is valid. */
  useEffect(() => {
    if (!programs.length) return;
    if (pid == null || !programs.some(p => p.projectId === pid)) {
      setPid(programs[0].projectId);
    }
  }, [programs, pid]);

  const prog = programs.find(p => p.projectId === pid) || null;
  const progLabel = prog ? (prog.code || prog.indication || ('Program ' + prog.projectId)) : '';

  /* Continuity briefing — POST /api/orchestration/continuity (REAL). */
  const continuity = useLivePost<Continuity>('/api/orchestration/continuity', pid);
  const cont = continuity.data;

  /* Next best actions — POST /api/orchestration/recommendations (REAL). */
  const recsRes = useLivePost<RecommendationSet>('/api/orchestration/recommendations', pid);
  const allRecs: Rec[] = recsRes.data?.recommendations ?? EMPTY_RECS;

  /* Pre-submission gate — POST /api/orchestration/pre-submission-gate (REAL);
     only run when the reviewer opens the gate. */
  const gateRes = useLivePost<Gate>('/api/orchestration/pre-submission-gate', pid, gateOpen);
  const gate = gateRes.data;
  const vd = gate ? (VERDICT_MAP[gate.verdict] || VERDICT_MAP.conditional) : VERDICT_MAP.conditional;

  /* Workflow templates — GET /api/orchestration/templates (REAL). Payload is
     { templates: [...] }, so read via useLiveData and pull `.templates`. */
  const templates = useLiveData<{ templates: WorkflowTpl[] }>('/api/orchestration/templates');
  const tpls: WorkflowTpl[] = templates.data?.templates ?? EMPTY_TPLS;

  /* Which actionTypes are workflow templates vs AI actions — Dispatch routes a
     recommendation to the right executor based on this membership. */
  const tplIds = useMemo(() => new Set(tpls.map(t => t.templateId)), [tpls]);

  /* Fire a confirmed run against its real executor. Sync workflows return a
     terminal WorkflowExecution; AI actions return an AIActionResponse (possibly
     queued). Both fold into RunOutcome; any failure surfaces honestly. */
  async function executeRun(p: PendingRun) {
    setPending(null);
    setRunErr('');
    setOutcome(null);
    setRunning(true);
    try {
      const res = await apiRequest('POST', p.endpoint, p.body);
      const body = await res.json().catch(() => null);
      // AI-action async-queue branch (202): honest "queued", never "done".
      if (res.status === 202 && body?.queued) {
        setOutcome({
          ok: true, kind: 'action', title: p.title, status: 'queued',
          summary: typeof body.message === 'string' ? body.message : 'Queued for background processing.',
          queued: true, steps: [], created: [], updated: [], blockers: [], warnings: [], errors: [],
        });
        return;
      }
      if (!res.ok) {
        // A per-step error names the step that failed, so it beats the
        // envelope's own message; `body?.error` leading meant the enum beat both.
        const msg = body?.errors?.[0]?.message || serverMessage(body) || 'The command could not be run.';
        setRunErr(String(msg));
        return;
      }
      setOutcome(p.kind === 'workflow'
        ? normWorkflow(body as ExecResult, p.title)
        : normAction(body as ActionResp, p.title));
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  /* Stage a workflow-template Run — confirm first (it mutates + audits). */
  function askRunWorkflow(t: WorkflowTpl) {
    if (pid == null) return;
    setPending({
      title: t.name,
      desc: `Runs "${t.name}" (${t.stepCount} step${t.stepCount === 1 ? '' : 's'}, ~${t.estimatedDurationMinutes}m) against ${progLabel}. Executes real steps that may create or update objects; the run is recorded to the audit trail.`,
      kind: 'workflow',
      endpoint: '/api/orchestration/execute',
      body: { templateId: t.templateId, projectId: pid },
    });
  }

  /* Dispatch a recommendation to its real executor. Routes on actionType: a
     workflow template → /orchestration/execute; a real AI action →
     /ai-actions/execute. No actionPayload → honest hand-off to AnA chat. */
  function dispatchRec(r: Rec) {
    if (pid == null) return;
    const label = r.targetObjectTitle || r.targetObjectType;
    const ap = r.actionPayload;
    if (ap && tplIds.has(ap.actionType)) {
      setPending({
        title: r.suggestedAction,
        desc: `Runs the "${ap.actionType}" workflow against ${progLabel} to carry out: ${r.suggestedAction}. May create or update objects; recorded to the audit trail.`,
        kind: 'workflow',
        endpoint: '/api/orchestration/execute',
        body: { templateId: ap.actionType, projectId: pid },
      });
    } else if (ap) {
      const targetType = (ap.payload?.targetType as string) || r.targetObjectType;
      const targetId = (ap.payload?.targetId as string | number | undefined) ?? r.targetObjectId;
      setPending({
        title: r.suggestedAction,
        desc: `Executes "${ap.actionType}" on ${label}. May create or update objects; recorded to the audit trail.`,
        kind: 'action',
        endpoint: '/api/ai-actions/execute',
        body: { actionType: ap.actionType, targetType, targetId, projectId: pid, module: r.module, payload: ap.payload ?? {}, sourceSurface: 'recommendation' },
      });
    } else {
      // No machine-executable action attached — hand the suggestion to AnA.
      fire('Sent to AnA · ' + label);
      ask(r.suggestedAction);
    }
  }

  const roleObj = AC_ROLES.find(r => r.id === role) || AC_ROLES[0];
  const recs = useMemo(
    () => (roleObj.modules && roleObj.modules.length
      ? allRecs.filter(r => r.module != null && roleObj.modules.includes(r.module))
      : allRecs),
    [allRecs, role], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* Answer-first lead — AnA's proactive read of THIS program right now. */
  const traj = TRAJ_MAP[cont?.trajectory || 'stable'] || TRAJ_MAP.stable;
  const urgent = cont?.trajectory === 'declining';
  const topNeed = cont?.needsAttention?.[0];
  const leadHead = cont
    ? (urgent
        ? `${progLabel} is trending ${traj.t} -- ${topNeed ? topNeed.title : 'act now'}`
        : `${progLabel} is ${traj.t}: ${(cont.newlyReady || []).length} newly ready · ${(cont.needsAttention || []).length} need attention`)
    : progLabel;

  return (
    <div className="ac">
      <C2CToast msg={toast} position="top" />

      {/* Header -- portfolio scale + role lens */}
      <div className="ac-head">
        <div>
          <div className="ac-eyebrow">AnA Command · orchestration across the portfolio</div>
          <h1 className="ac-title">What AnA is on top of</h1>
        </div>
      </div>

      {/* Portfolio roll-up: one → many programs */}
      {portfolio.loading ? (
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading portfolio…</div>
      ) : portfolio.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the portfolio rollup"
          hint="The org-wide rollup didn't respond. It requires a signed-in tenant on an entitled plan — sign in and retry, or check your plan."
        />
      ) : programs.length === 0 ? (
        <EmptyState
          icon={Ico.folder || I.fileText}
          title="No programs in this organization yet"
          hint="Programs appear here attention-ranked by readiness and open critical blockers as your org creates them."
        />
      ) : (
        <div className="ac-port">
          {programs.map(p => {
            const ms = p.nextMilestone;
            const msDate = ms ? (ms.targetDate || ms.forecastDate || null) : null;
            return (
              <button key={p.projectId} className="ac-pcard" data-on={p.projectId === pid || undefined} onClick={() => { setPid(p.projectId); setGateOpen(false); }}>
                <div className="ac-pcard-top">
                  <span className="ac-pcode">{p.code || ('Project ' + p.projectId)}</span>
                  {p.riskLevel && <span className={'rd-chip tone-' + (RISK_TONE[p.riskLevel] || 'idle')}>{p.riskLevel} risk</span>}
                </div>
                <div className="ac-pname">{p.indication || '—'}</div>
                <div className="ac-pmeta">
                  <div className="ac-pready"><div className="ac-pready-bar"><div style={{ width: (p.readinessScore ?? 0) + '%' }} data-s={STATUS_CSS[p.status] || 'behind'} /></div><span>{p.readinessScore ?? 0}%</span></div>
                </div>
                <div className="ac-pblock">{p.criticalBlockerCount} blocker{p.criticalBlockerCount !== 1 ? 's' : ''}{msDate ? ' · ' + (ms && ms.label ? ms.label + ' ' : '') + String(msDate).slice(0, 10) : ''}</div>
              </button>
            );
          })}
        </div>
      )}
      <div className="ac-port-gap">
        {Ico.info || I.alertTriangle}<span>Org-wide rollup over every program in your organization — average readiness, worst risk, and attention-ranked members.</span>
      </div>

      {/* Role lens -- jobs across client types */}
      <div className="ac-roles">
        <span className="ac-roles-l">Lens</span>
        {AC_ROLES.map(r => (
          <button key={r.id} className="ac-role" data-on={role === r.id || undefined} onClick={() => setRole(r.id)}>{r.label}</button>
        ))}
      </div>

      {prog && (
        <>
          {/* AnA's proactive lead */}
          <div className={'ac-lead ' + (urgent ? 'urgent' : 'calm')}>
            <div className="ac-lead-ic">{I.sparkles}</div>
            <div className="ac-lead-body">
              <div className="ac-lead-head">{leadHead}</div>
              <p className="ac-lead-p">
                {continuity.loading ? 'Loading the continuity briefing…'
                  : continuity.error ? 'Continuity briefing unavailable right now.'
                  : cont ? cont.summary
                  : 'No continuity briefing yet for this program.'}
              </p>
              <div className="ac-lead-actions">
                <button className="ac-lead-go" onClick={() => ask('Walk me through ' + progLabel + ' -- the critical path to filing and what to do first.')}>{I.sparkles} Ask AnA to plan the path</button>
                <button className="ac-lead-gate" onClick={() => setGateOpen(true)}>{Ico.shieldCheck || Ico.shield || I.check} Run pre-submission gate</button>
              </div>
            </div>
            {cont && <div className={'ac-traj ' + traj.c}>{Ico[traj.ic] || I.minus}<span>{traj.t}</span></div>}
          </div>

          <div className="ac-cols">
            {/* Left -- continuity briefing (what changed, newly ready, needs attention) */}
            <div className="ac-col">
              {continuity.loading ? (
                <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading continuity briefing…</div>
              ) : continuity.error ? (
                <EmptyState
                  tone="error"
                  icon={I.alertTriangle}
                  title="Couldn't load the continuity briefing"
                  hint="The cross-session briefing didn't respond. Sign in and retry, or check the service is reachable."
                />
              ) : !cont ? (
                <EmptyState
                  icon={Ico.history || I.clock}
                  title="No continuity briefing yet"
                  hint="AnA assembles what changed, what's newly ready, and what needs attention once this program has recent activity to summarize."
                />
              ) : (
                <>
                  <div className="ac-sec">{Ico.history || I.clock} Since you were last here</div>
                  <div className="ac-changes">
                    {(cont.changes || []).map((c, i) => (
                      <div key={i} className="ac-change">
                        <span className={'ac-change-dot ' + (c.type.includes('blocker') ? 'err' : c.type.includes('completed') || c.type.includes('promoted') ? 'ok' : 'ai')} />
                        <div><div className="ac-change-d">{c.description}</div><div className="ac-change-m">{c.targetId} · {c.timestamp}</div></div>
                      </div>
                    ))}
                    {(cont.changes || []).length === 0 && <div className="ac-empty">No changes recorded yet.</div>}
                  </div>

                  <div className="ac-two">
                    <div>
                      <div className="ac-sec ok">{Ico.checkCircle || I.check} Newly ready</div>
                      {(cont.newlyReady || []).map((r, i) => (<div key={i} className="ac-ready-row">{r.title}</div>))}
                      {(cont.newlyReady || []).length === 0 && <div className="ac-empty">Nothing newly ready.</div>}
                    </div>
                    <div>
                      <div className="ac-sec warn">{I.alertTriangle} Needs attention</div>
                      {(cont.needsAttention || []).map((r, i) => (<div key={i} className="ac-attn-row"><div className="ac-attn-t">{r.title}</div><div className="ac-attn-r">{r.reason}</div></div>))}
                      {(cont.needsAttention || []).length === 0 && <div className="ac-empty">Nothing needs attention.</div>}
                    </div>
                  </div>

                  {/* Metrics strip */}
                  <div className="ac-metrics">
                    {([
                      ['Readiness', cont.metrics && cont.metrics.readinessScore + '%'],
                      ['Documents', cont.metrics && cont.metrics.documentCount],
                      ['Validated', cont.metrics && cont.metrics.validatedCount],
                      ['Blockers', cont.metrics && cont.metrics.blockerCount],
                      ['Tasks done', cont.metrics && cont.metrics.taskCompletionPercent + '%'],
                    ] as [string, string | number | undefined][]).map(([k, v], i) => (
                      <div key={i} className="ac-metric"><span className="ac-metric-v">{v}</span><span className="ac-metric-k">{k}</span></div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Right -- next best actions + agentic workflows */}
            <div className="ac-col">
              <div className="ac-sec">{I.sparkles} Next best actions <span className="ac-sec-x">-- ranked, grounded, dispatchable</span></div>
              <div className="ac-recs">
                {recsRes.loading ? (
                  <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading recommendations…</div>
                ) : recsRes.error ? (
                  <EmptyState
                    tone="error"
                    icon={I.alertTriangle}
                    title="Couldn't load recommendations"
                    hint="The recommendation engine didn't respond. Sign in and retry, or check the service is reachable."
                  />
                ) : allRecs.length === 0 ? (
                  <EmptyState
                    icon={I.sparkles}
                    title="No recommendations yet"
                    hint="AnA surfaces next-best actions here as the program accrues documents, validations, tasks, and blockers."
                  />
                ) : recs.length === 0 ? (
                  <div className="ac-empty">No open actions for this lens.</div>
                ) : (
                  recs.map(r => (
                    <div key={r.id} className="ac-rec" data-sev={r.severity}>
                      <div className="ac-rec-top">
                        <span className={'ac-chip ' + (SEV_MAP[r.severity] || 'idle')}>{r.severity}</span>
                        <span className="ac-rec-tt">{r.targetObjectTitle || r.targetObjectType}</span>
                        <span className="ac-rec-mod">{r.module}</span>
                        <span className="ac-rec-conf">{Math.round((r.confidence || 0) * 100)}%</span>
                      </div>
                      <div className="ac-rec-reason">{r.reason}</div>
                      <div className="ac-rec-ev">{(r.evidence || []).map((e, i) => (<span key={i} className="ac-rec-evi">{I.dot || null} {e}</span>))}</div>
                      <div className="ac-rec-act">
                        <span className="ac-rec-sa">{r.suggestedAction}</span>
                        {/* Dispatch routes to the recommendation's real executor:
                            a workflow template → /orchestration/execute, a real AI
                            action → /ai-actions/execute (both audited, confirm-gated).
                            When the engine attached no actionPayload the button reads
                            "Ask AnA" and honestly hands the suggestion to chat. */}
                        <button className="ac-rec-run" onClick={() => dispatchRec(r)}>{Ico.play || I.arrowRight} {r.actionPayload ? 'Dispatch' : 'Ask AnA'}</button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="ac-sec">{Ico.workflow || Ico.gitBranch || I.dot} AnA workflows <span className="ac-sec-x">-- multi-step, run it for me</span></div>
              {/* Workflow templates are real (GET /api/orchestration/templates).
                  "Run" now confirms, then POSTs the synchronous executor
                  (/api/orchestration/execute) and renders the TERMINAL execution —
                  real step statuses, summary, blockers, created/updated objects.
                  The old fabricated setTimeout step animation stays removed; the
                  executor returns terminal state (no step stream), so the in-flight
                  UI is an honest spinner, not a faked progress bar. */}
              {templates.loading ? (
                <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading workflows…</div>
              ) : templates.error ? (
                <EmptyState
                  tone="error"
                  icon={I.alertTriangle}
                  title="Couldn't load workflows"
                  hint="The workflow registry didn't respond. Sign in and retry, or check the service is reachable."
                />
              ) : tpls.length === 0 ? (
                <EmptyState icon={Ico.workflow || I.dot} title="No workflows available yet" />
              ) : (
                <div className="ac-tpls">
                  {tpls.map(t => (
                    <button key={t.templateId} className="ac-tpl" onClick={() => askRunWorkflow(t)}>
                      <div className="ac-tpl-top"><span className="ac-tpl-n">{t.name}</span><span className="ac-tpl-meta">{t.stepCount} step{t.stepCount === 1 ? '' : 's'} · ~{t.estimatedDurationMinutes}m</span></div>
                      <div className="ac-tpl-d">{t.description}</div>
                      <span className="ac-tpl-run">{Ico.play || I.arrowRight} Run</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Pre-submission gate -- the unified go/no-go */}
      {gateOpen && prog && (
        <div className="ac-gate-bd" onClick={() => setGateOpen(false)}>
          <div className="ac-gate" onClick={e => e.stopPropagation()}>
            <div className="ac-gate-top">
              <div>
                <div className="ac-gate-crumb">{progLabel}{gate ? ' · ' + gate.submissionType : ''} · pre-submission quality gate</div>
                <div className="ac-gate-sub">readiness + CMC contradictions + CRL + RTF + ICH — one verdict, audited to Part 11</div>
              </div>
              <button className="ac-gate-x" onClick={() => setGateOpen(false)}>{I.close}</button>
            </div>
            {gateRes.loading ? (
              <div className="scaf-note" style={{ padding: '28px 16px' }}>Running the pre-submission gate…</div>
            ) : gateRes.error ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn't run the pre-submission gate"
                hint="The pre-submission gate didn't respond. Sign in and retry, or check the service is reachable."
              />
            ) : !gate ? (
              <EmptyState icon={Ico.shieldCheck || Ico.shield || I.check} title="No gate verdict yet" />
            ) : (
              <>
                <div className={'ac-gate-verdict ' + vd.c}>
                  <span className="ac-gate-vt">{vd.t}</span>
                  <div className="ac-gate-rat">{(gate.verdictRationale || []).map((r, i) => (<div key={i} className="ac-gate-rr">{I.dot} {r}</div>))}</div>
                </div>
                <div className="ac-gate-grid">
                  <div className="ac-gate-cell">
                    <div className="ac-gate-ck">Readiness</div>
                    <div className="ac-gate-cv">{gate.readiness?.overallScore ?? '--'}<span>/100 · {gate.readiness?.status ?? '--'}</span></div>
                    <div className="ac-gate-sub2">{gate.readiness?.scores && Object.entries(gate.readiness.scores).map(([k, v]) => (<span key={k} className="ac-gate-ss">{k} {v}</span>))}</div>
                  </div>
                  <div className="ac-gate-cell">
                    <div className="ac-gate-ck">CMC contradictions</div>
                    <div className="ac-gate-cv err">{gate.cmc?.contradictionCounts?.critical ?? 0}<span> critical · {gate.cmc?.contradictionCounts?.open ?? 0} open</span></div>
                  </div>
                  <div className="ac-gate-cell">
                    <div className="ac-gate-ck">CRL risk</div>
                    <div className={'ac-gate-cv ' + (gate.crl?.overallRisk === 'high' ? 'err' : gate.crl?.overallRisk === 'moderate' ? 'warn' : 'ok')}>{gate.crl?.overallRisk ?? '--'}<span> · {gate.crl?.riskScore ?? '--'}</span></div>
                  </div>
                  <div className="ac-gate-cell">
                    <div className="ac-gate-ck">RTF risk</div>
                    <div className={'ac-gate-cv ' + (gate.rtf?.overallRisk === 'high' ? 'err' : 'ok')}>{gate.rtf?.overallRisk ?? '--'}<span> · {gate.rtf?.riskScore ?? '--'}</span></div>
                  </div>
                  <div className="ac-gate-cell">
                    <div className="ac-gate-ck">ICH compliance</div>
                    <div className={'ac-gate-cv ' + (gate.ich?.overallStatus === 'fail' ? 'err' : gate.ich?.overallStatus === 'warning' ? 'warn' : 'ok')}>{gate.ich ? gate.ich.overallStatus : 'not evaluated'}<span>{gate.ich ? ' · ' + (gate.ich.counts?.fail ?? 0) + ' fail' : ' · no CMC project linked'}</span></div>
                  </div>
                </div>
                <div className="ac-gate-foot">
                  <button className="ac-gate-ask" onClick={() => { ask('Explain the ' + gate.submissionType + ' pre-submission gate verdict for ' + progLabel + ' and how to move it to GO.'); setGateOpen(false); }}>{I.sparkles} Ask AnA how to clear it</button>
                  <span className="ac-gate-audit">{Ico.lock || Ico.shield || I.check} Verdict audited · 21 CFR Part 11</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Action runner — confirm → run → honest result, for both a workflow Run
          and a recommendation Dispatch. Renders only real executor output. */}
      {runOpen && (
        <div className="ac-gate-bd" onClick={closeRun}>
          <div className="ac-gate" onClick={e => e.stopPropagation()}>
            <div className="ac-gate-top">
              <div>
                <div className="ac-gate-crumb">{outcome ? outcome.title : pending ? pending.title : 'Running…'}</div>
                <div className="ac-gate-sub">
                  {running ? 'Executing against the real orchestration backend — every step runs server-side.'
                    : outcome ? (outcome.kind === 'workflow' ? 'Workflow execution · recorded to the audit trail' : 'AI action dispatch · recorded to the audit trail')
                    : 'Review before running — this executes real steps and is audited'}
                </div>
              </div>
              <button className="ac-gate-x" onClick={closeRun}>{I.close}</button>
            </div>

            {runErr ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="The run didn't complete"
                hint={runErr}
              />
            ) : running ? (
              <div className="scaf-note" style={{ padding: '28px 16px' }}>Running… executing every step server-side, then showing the real result.</div>
            ) : pending ? (
              <>
                <p className="ac-lead-p" style={{ padding: '6px 2px 16px' }}>{pending.desc}</p>
                <div className="ac-gate-foot">
                  <button className="ac-gate-ask" onClick={() => executeRun(pending)}>{Ico.play || I.arrowRight} Run now</button>
                  <button className="ac-role" onClick={closeRun}>Cancel</button>
                </div>
              </>
            ) : outcome ? (
              <>
                <div className={'ac-gate-verdict ' + (outcome.ok ? 'ok' : outcome.queued ? 'warn' : 'err')}>
                  <span className="ac-gate-vt">{outcome.queued ? 'QUEUED' : (outcome.status || (outcome.ok ? 'DONE' : 'FAILED')).toUpperCase()}</span>
                  <div className="ac-gate-rat"><div className="ac-gate-rr">{outcome.summary}</div></div>
                </div>

                {outcome.steps.length > 0 && (
                  <div className="ac-changes" style={{ marginTop: 10 }}>
                    {outcome.steps.map((s, i) => (
                      <div key={i} className="ac-change">
                        <span className={'ac-change-dot ' + (s.status === 'failed' ? 'err' : s.status === 'completed' ? 'ok' : s.status === 'skipped' ? 'idle' : 'ai')} />
                        <div><div className="ac-change-d">{s.name}</div><div className="ac-change-m">{s.status}{s.error ? ' · ' + s.error : ''}</div></div>
                      </div>
                    ))}
                  </div>
                )}

                {outcome.blockers.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="ac-sec warn">{I.alertTriangle} Blockers</div>
                    {outcome.blockers.map((b, i) => (<div key={i} className="ac-attn-row"><div className="ac-attn-t">{b}</div></div>))}
                  </div>
                )}

                {(outcome.created.length > 0 || outcome.updated.length > 0) && (
                  <div className="ac-two" style={{ marginTop: 10 }}>
                    <div>
                      <div className="ac-sec ok">{Ico.checkCircle || I.check} Created</div>
                      {outcome.created.map((o, i) => (<div key={i} className="ac-ready-row">{o.title || (o.type + ' #' + o.id)}</div>))}
                      {outcome.created.length === 0 && <div className="ac-empty">Nothing created.</div>}
                    </div>
                    <div>
                      <div className="ac-sec">{Ico.edit || Ico.pencil || I.dot} Updated</div>
                      {outcome.updated.map((o, i) => (<div key={i} className="ac-ready-row">{o.title || (o.type + ' #' + o.id)}</div>))}
                      {outcome.updated.length === 0 && <div className="ac-empty">Nothing updated.</div>}
                    </div>
                  </div>
                )}

                {outcome.warnings.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="ac-sec warn">{I.alertTriangle} Warnings</div>
                    {outcome.warnings.map((w, i) => (<div key={i} className="ac-empty">{w}</div>))}
                  </div>
                )}
                {outcome.errors.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="ac-sec err">{I.alertTriangle} Errors</div>
                    {outcome.errors.map((e, i) => (<div key={i} className="ac-empty">{e}</div>))}
                  </div>
                )}

                <div className="ac-gate-foot">
                  <button className="ac-gate-ask" onClick={() => { ask('Explain the "' + outcome.title + '" result on ' + progLabel + ' and what to do next.'); closeRun(); }}>{I.sparkles} Ask AnA about this</button>
                  <span className="ac-gate-audit">{Ico.lock || Ico.shield || I.check} Recorded to the audit trail · 21 CFR Part 11</span>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
