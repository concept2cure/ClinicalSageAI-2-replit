import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData, type DataState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import '../styles/ana-v2.css';

/* ════════════════════════════════════════════════════════════════════════
   AnA Command Center — re-anchored to the real orchestration backend.

   Every rendered DATA slice is now real persisted/computed data, an honest
   empty state, or an honest error state — never a fixture. Endpoints:
     - Portfolio  GET  /api/report-os/portfolio/org            (REAL)
     - Continuity POST /api/orchestration/continuity           (REAL)
     - Recs       POST /api/orchestration/recommendations      (REAL)
     - Gate       POST /api/orchestration/pre-submission-gate  (REAL)
     - Workflows  GET  /api/orchestration/templates            (REAL)
   The role lens below is canonical RBAC config (kept, inlined here).
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
   targetObjectTitle / actionPayload are optional in the real type. */
interface Rec {
  id: string;
  severity: string;
  module?: string;
  targetObjectType: string;
  targetObjectTitle?: string;
  reason: string;
  evidence: string[];
  suggestedAction: string;
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
   stepCount (a number), NOT the step array — so no client-side step-by-step
   execution can be driven from real data (see the removed mock ACTION below). */
interface WorkflowTpl {
  templateId: string;
  name: string;
  description: string;
  stepCount: number;
  estimatedDurationMinutes: number;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, projectId, enabled]);
  return state;
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
  const [toast, setToast] = useState('');
  const fire = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };

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
      {toast && <div className="ac-toast">{I.check} {toast}</div>}

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
          hint="The org-wide rollup (GET /api/report-os/portfolio/org) didn't respond. It requires a signed-in tenant on an entitled plan — sign in and retry, or check your plan."
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
      <div className="ac-port-gap" style={{ margin: '2px 0 6px', padding: '8px 12px', fontSize: 12, lineHeight: 1.5, color: 'var(--text-300)', background: 'var(--bg-050)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        {Ico.info || I.alertTriangle}<span>Org-wide rollup over every program in your organization -- average readiness, worst risk, and attention-ranked members, bound to <code>GET /api/report-os/portfolio/org</code>.</span>
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
                  hint="The cross-session briefing (POST /api/orchestration/continuity) didn't respond. Sign in and retry, or check the service is reachable."
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
                    hint="The recommendation engine (POST /api/orchestration/recommendations) didn't respond. Sign in and retry, or check the service is reachable."
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
                        {/* Dispatch hands the recommendation to AnA in chat. FLAG: a real
                            executor exists (POST /api/ai-actions/execute) but needs
                            targetType + projectId the recommendation payload doesn't
                            carry — left for the actions pass, not half-wired here. */}
                        <button className="ac-rec-run" onClick={() => { fire('Sent to AnA · ' + (r.targetObjectTitle || r.targetObjectType)); ask(r.suggestedAction); }}>{Ico.play || I.arrowRight} Dispatch</button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="ac-sec">{Ico.workflow || Ico.gitBranch || I.dot} AnA workflows <span className="ac-sec-x">-- multi-step, run it for me</span></div>
              {/* Workflow templates are real (GET /api/orchestration/templates). FLAG:
                  the former "Run" opened a fabricated setTimeout step animation that
                  claimed the workflow completed ("Draft created, validated, and
                  routed"); that mock ACTION is removed. The route also returns only
                  stepCount, not the step array, so no honest step-by-step client
                  execution is possible. Running hands off to AnA; wiring the real
                  executor (POST /api/orchestration/execute + GET /executions/:id) is
                  an actions-pass task. */}
              {templates.loading ? (
                <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading workflows…</div>
              ) : templates.error ? (
                <EmptyState
                  tone="error"
                  icon={I.alertTriangle}
                  title="Couldn't load workflows"
                  hint="The workflow registry (GET /api/orchestration/templates) didn't respond. Sign in and retry, or check the service is reachable."
                />
              ) : tpls.length === 0 ? (
                <EmptyState icon={Ico.workflow || I.dot} title="No workflows available yet" />
              ) : (
                <div className="ac-tpls">
                  {tpls.map(t => (
                    <button key={t.templateId} className="ac-tpl" onClick={() => ask('Run the "' + t.name + '" workflow on ' + progLabel + ' and report each step as it completes.')}>
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
                <div className="ac-gate-sub">readiness + CMC contradictions + CRL + RTF + ICH -- one verdict, audited to Part 11</div>
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
                hint="The gate (POST /api/orchestration/pre-submission-gate) didn't respond. Sign in and retry, or check the service is reachable."
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
    </div>
  );
}
