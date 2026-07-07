import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import '../styles/ana-v2.css';
import {
  AC_PORTFOLIO, AC_CONTINUITY, AC_RECS, AC_TEMPLATES, AC_GATE, AC_ROLES,
  type AcPortfolioItem, type AcContinuity, type AcRecommendation, type AcWorkflowStep,
  type AcWorkflowTemplate, type AcGate, type AcRole,
} from '../fixtures/ana-command-data';

/* ── Helper maps (kit constants) ── */

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

/* ── Typed icon accessor ── */

const Ico = I as Record<string, React.ReactElement>;

/* ── Workflow execution state ── */

interface RunStep extends AcWorkflowStep {
  status: string;
}

interface WorkflowExecution {
  templateId: string;
  name: string;
  steps: RunStep[];
  idx: number;
  progress: number;
  done: boolean;
}

/* ════ AnA Command Center ════ */

export function AnaCommand({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  const c2cApi = (window as any).C2C_API;

  /* Org-wide rollup -- GET /api/report-os/portfolio/org (live ?? fixture). */
  const [portState, setPortState] = useState<{ data: AcPortfolioItem[]; sample: boolean }>({ data: AC_PORTFOLIO, sample: true });
  useEffect(() => {
    const fx = AC_PORTFOLIO;
    const conn = c2cApi && c2cApi.connected();
    if (!conn) { setPortState({ data: fx, sample: true }); return; }
    c2cApi.get('/api/report-os/portfolio/org')
      .then((r: any) => {
        const rows = (r && (r.attentionRanked || (r.data && r.data.attentionRanked))) || [];
        if (!rows.length) { setPortState({ data: fx, sample: true }); return; }
        const mapped: AcPortfolioItem[] = rows.map((m: any) => ({
          projectId: m.projectId,
          code: m.code || m.name || ('Project ' + m.projectId),
          name: m.indication || '--',
          app: '',
          seg: m.seg || '',
          indication: m.indication || '',
          readiness: (m.readinessScore != null ? m.readinessScore : m.confidence) || 0,
          status: m.status === 'ready' ? 'on_track' : m.status === 'partial' ? 'at_risk' : 'behind',
          trajectory: '',
          riskLevel: m.riskLevel,
          blockers: m.criticalBlockerCount || 0,
          targetDate: (m.nextMilestone && (m.nextMilestone.targetDate || m.nextMilestone.forecastDate)) || '--',
          module: '',
        }));
        setPortState({ data: mapped, sample: false });
      })
      .catch(() => setPortState({ data: fx, sample: true }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const PORT = (portState.data && portState.data.length) ? portState.data : AC_PORTFOLIO;
  const [pid, setPid] = useState(PORT[0] ? PORT[0].projectId : 301);
  const [role, setRole] = useState('all');
  const [run, setRun] = useState<WorkflowExecution | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [toast, setToast] = useState('');
  const fire = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const prog = PORT.find(p => p.projectId === pid) || PORT[0];
  const cont: AcContinuity = AC_CONTINUITY[pid] || {} as AcContinuity;
  const live = c2cApi && c2cApi.connected();

  /* Next best actions -- POST /api/orchestration/recommendations (live ?? fixture). */
  const [recsState, setRecsState] = useState<{ data: AcRecommendation[] | null; sample: boolean }>({ data: null, sample: true });
  useEffect(() => {
    const fx = AC_RECS[pid] || [];
    if (!live) { setRecsState({ data: fx, sample: true }); return; }
    setRecsState({ data: fx, sample: true });
    c2cApi.post('/api/orchestration/recommendations', { projectId: pid })
      .then((d: any) => {
        const arr = Array.isArray(d) ? d : ((d && (d.recommendations || d.items)) || []);
        if (arr.length) { setRecsState({ data: arr, sample: false }); } else { setRecsState({ data: fx, sample: true }); }
      })
      .catch(() => setRecsState({ data: fx, sample: true }));
  }, [pid, live]); // eslint-disable-line react-hooks/exhaustive-deps

  const recsAll = recsState.data || (AC_RECS[pid] || []);

  /* Pre-submission gate -- POST /api/orchestration/pre-submission-gate (live ?? fixture). */
  const [gateState, setGateState] = useState<{ data: AcGate | null; sample: boolean }>({ data: null, sample: true });
  useEffect(() => {
    if (!gateOpen) return;
    const fx = AC_GATE[pid] || {} as AcGate;
    if (!live) { setGateState({ data: fx, sample: true }); return; }
    setGateState({ data: fx, sample: true });
    c2cApi.post('/api/orchestration/pre-submission-gate', { projectId: pid, submissionType: fx.submissionType })
      .then((d: any) => setGateState({ data: d, sample: false }))
      .catch(() => setGateState({ data: fx, sample: true }));
  }, [gateOpen, pid, live]); // eslint-disable-line react-hooks/exhaustive-deps

  const gate: AcGate = (gateState.data || AC_GATE[pid] || {}) as AcGate;

  const roleObj: AcRole = AC_ROLES.find(r => r.id === role) || { id: 'all', label: 'All', modules: [] as string[] };
  const recs = useMemo(() =>
    roleObj.modules && roleObj.modules.length ? recsAll.filter(r => roleObj.modules.includes(r.module)) : recsAll,
    [recsAll, role], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* Workflow execution -- animate steps pending→running→completed */
  const startWorkflow = (tpl: AcWorkflowTemplate) => {
    const steps: RunStep[] = tpl.steps.map(s => ({ ...s, status: 'pending' }));
    setRun({ templateId: tpl.templateId, name: tpl.name, steps, idx: 0, progress: 0, done: false });
  };

  useEffect(() => {
    if (!run || run.done) return;
    const t = setTimeout(() => {
      setRun(r => {
        if (!r || r.done) return r;
        const steps = r.steps.map((s, i) =>
          i < r.idx ? { ...s, status: 'completed' } : i === r.idx ? { ...s, status: 'running' } : s,
        );
        const nextIdx = r.idx + 1;
        const done = nextIdx > r.steps.length;
        if (done) { return { ...r, steps: r.steps.map(s => ({ ...s, status: 'completed' })), progress: 100, done: true }; }
        return { ...r, steps, idx: nextIdx, progress: Math.round((nextIdx / (r.steps.length + 1)) * 100) };
      });
    }, 900);
    return () => clearTimeout(t);
  }, [run]);

  const traj = TRAJ_MAP[cont.trajectory] || TRAJ_MAP.stable;
  const vd = VERDICT_MAP[gate.verdict] || VERDICT_MAP.conditional;

  /* Answer-first lead -- AnA's proactive read of THIS program right now */
  const urgent = cont.trajectory === 'declining';
  const topNeed = (cont.needsAttention || [])[0];
  const leadHead = urgent
    ? `${prog.code} is trending ${traj.t} -- ${topNeed ? topNeed.title : 'act now'}`
    : `${prog.code} is ${traj.t}: ${(cont.newlyReady || []).length} newly ready · ${(cont.needsAttention || []).length} need attention`;

  return (
    <div className="ac">
      {toast && <div className="ac-toast">{I.check} {toast}</div>}

      {/* Header -- portfolio scale + role lens */}
      <div className="ac-head">
        <div>
          <div className="ac-eyebrow">AnA Command · orchestration across the portfolio</div>
          <h1 className="ac-title">What AnA is on top of</h1>
        </div>
        <div className="ac-prov"><SampleTag sample={portState.sample} /></div>
      </div>

      {/* Portfolio roll-up: one → many programs */}
      <div className="ac-port">
        {PORT.map(p => {
          const pt = p.trajectory ? (TRAJ_MAP[p.trajectory] || TRAJ_MAP.stable) : null;
          return (
            <button key={p.projectId} className="ac-pcard" data-on={p.projectId === pid || undefined} onClick={() => { setPid(p.projectId); setRun(null); setGateOpen(false); }}>
              <div className="ac-pcard-top"><span className="ac-pcode">{p.code}</span><span className={'ac-seg ' + p.seg}>{p.seg}</span></div>
              <div className="ac-pname">{p.name !== '--' ? p.name + ' · ' : ''}{p.app}</div>
              <div className="ac-pmeta">
                <div className="ac-pready"><div className="ac-pready-bar"><div style={{ width: p.readiness + '%' }} data-s={p.status} /></div><span>{p.readiness}%</span></div>
                {pt && <span className={'ac-ptraj ' + pt.c}>{Ico[pt.ic] || I.minus} {pt.t}</span>}
              </div>
              <div className="ac-pblock">{p.blockers} blocker{p.blockers !== 1 ? 's' : ''} · PDUFA/target {p.targetDate.slice(5)}</div>
            </button>
          );
        })}
      </div>
      <div className="ac-port-gap" style={{ margin: '2px 0 6px', padding: '8px 12px', fontSize: 12, lineHeight: 1.5, color: 'var(--text-300)', background: 'var(--bg-050)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        {Ico.info || I.alertTriangle}<span>Org-wide rollup binds to <code>GET /api/report-os/portfolio/org</code> -- every program group aggregated for your org (avg readiness, worst risk, attention-ranked members). Sample shown until the backend is reachable.</span>
      </div>

      {/* Role lens -- jobs across client types */}
      <div className="ac-roles">
        <span className="ac-roles-l">Lens</span>
        {AC_ROLES.map(r => (
          <button key={r.id} className="ac-role" data-on={role === r.id || undefined} onClick={() => setRole(r.id)}>{r.label}</button>
        ))}
      </div>

      {/* AnA's proactive lead */}
      <div className={'ac-lead ' + (urgent ? 'urgent' : 'calm')}>
        <div className="ac-lead-ic">{I.sparkles}</div>
        <div className="ac-lead-body">
          <div className="ac-lead-head">{leadHead}</div>
          <p className="ac-lead-p">{cont.summary}</p>
          <div className="ac-lead-actions">
            <button className="ac-lead-go" onClick={() => ask('Walk me through ' + prog.code + ' -- the critical path to filing and what to do first.')}>{I.sparkles} Ask AnA to plan the path</button>
            <button className="ac-lead-gate" onClick={() => setGateOpen(true)}>{Ico.shieldCheck || Ico.shield || I.check} Run pre-submission gate</button>
          </div>
        </div>
        <div className={'ac-traj ' + traj.c}>{Ico[traj.ic] || I.minus}<span>{traj.t}</span></div>
      </div>

      <div className="ac-cols">
        {/* Left -- continuity briefing (what changed, newly ready, needs attention) */}
        <div className="ac-col">
          <div className="ac-sec">{Ico.history || I.clock} Since you were last here</div>
          <div className="ac-changes">
            {(cont.changes || []).map((c, i) => (
              <div key={i} className="ac-change">
                <span className={'ac-change-dot ' + (c.type.includes('blocker') ? 'err' : c.type.includes('completed') || c.type.includes('promoted') ? 'ok' : 'ai')} />
                <div><div className="ac-change-d">{c.description}</div><div className="ac-change-m">{c.targetId} · {c.timestamp}</div></div>
              </div>
            ))}
          </div>

          <div className="ac-two">
            <div>
              <div className="ac-sec ok">{Ico.checkCircle || I.check} Newly ready</div>
              {(cont.newlyReady || []).map((r, i) => (<div key={i} className="ac-ready-row">{r.title}</div>))}
            </div>
            <div>
              <div className="ac-sec warn">{I.alertTriangle} Needs attention</div>
              {(cont.needsAttention || []).map((r, i) => (<div key={i} className="ac-attn-row"><div className="ac-attn-t">{r.title}</div><div className="ac-attn-r">{r.reason}</div></div>))}
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
        </div>

        {/* Right -- next best actions + agentic workflows */}
        <div className="ac-col">
          <div className="ac-sec">{I.sparkles} Next best actions <span className="ac-sec-x">-- ranked, grounded, dispatchable</span> <SampleTag sample={recsState.sample} /></div>
          <div className="ac-recs">
            {recs.length === 0 && <div className="ac-empty">No open actions for this lens.</div>}
            {recs.map(r => (
              <div key={r.id} className="ac-rec" data-sev={r.severity}>
                <div className="ac-rec-top">
                  <span className={'ac-chip ' + (SEV_MAP[r.severity] || 'idle')}>{r.severity}</span>
                  <span className="ac-rec-tt">{r.targetObjectTitle}</span>
                  <span className="ac-rec-mod">{r.module}</span>
                  <span className="ac-rec-conf">{Math.round(r.confidence * 100)}%</span>
                </div>
                <div className="ac-rec-reason">{r.reason}</div>
                <div className="ac-rec-ev">{r.evidence.map((e, i) => (<span key={i} className="ac-rec-evi">{I.dot || null} {e}</span>))}</div>
                <div className="ac-rec-act">
                  <span className="ac-rec-sa">{r.suggestedAction}</span>
                  <button className="ac-rec-run" onClick={() => {
                    const ap = r.actionPayload;
                    if (ap && live) {
                      c2cApi.post('/api/ai-actions/execute', ap)
                        .then(() => fire('AnA executed · ' + ap.actionType))
                        .catch(() => fire('Queued (offline) · ' + ap.actionType));
                    } else if (ap) {
                      fire('Ready to execute -- connect backend · ' + ap.actionType);
                    } else {
                      fire('Advisory recommendation -- no automated action');
                    }
                    ask(r.suggestedAction);
                  }}>{Ico.play || I.arrowRight} Dispatch</button>
                </div>
              </div>
            ))}
          </div>

          <div className="ac-sec">{Ico.workflow || Ico.gitBranch || I.dot} AnA workflows <span className="ac-sec-x">-- multi-step, run it for me</span></div>
          {!run && (
            <div className="ac-tpls">
              {AC_TEMPLATES.map(t => (
                <button key={t.templateId} className="ac-tpl" onClick={() => startWorkflow(t)}>
                  <div className="ac-tpl-top"><span className="ac-tpl-n">{t.name}</span><span className="ac-tpl-meta">{t.steps.length} steps · ~{t.estimatedDurationMinutes}m</span></div>
                  <div className="ac-tpl-d">{t.description}</div>
                  <span className="ac-tpl-run">{Ico.play || I.arrowRight} Run</span>
                </button>
              ))}
            </div>
          )}
          {run && (
            <div className="ac-exec">
              <div className="ac-exec-top">
                <span className="ac-exec-n">{run.name}</span>
                <span className="ac-exec-pct">{run.done ? 'Completed' : run.progress + '%'}</span>
                <button className="ac-exec-x" onClick={() => setRun(null)}>{run.done ? 'Close' : 'Cancel'}</button>
              </div>
              <div className="ac-exec-bar"><div style={{ width: run.progress + '%' }} data-done={run.done || undefined} /></div>
              <div className="ac-exec-steps">
                {run.steps.map((s) => (
                  <div key={s.stepId} className="ac-exec-step" data-st={s.status}>
                    <span className="ac-exec-ic">
                      {s.status === 'completed' ? I.check : s.status === 'running' ? (Ico.loader || I.refresh) : (Ico.circle || I.dot)}
                    </span>
                    <div>
                      <div className="ac-exec-sn">{s.name}{s.requiresApproval && <span className="ac-exec-appr">approval</span>}</div>
                      <div className="ac-exec-sd">{s.description}</div>
                    </div>
                  </div>
                ))}
              </div>
              {run.done && (
                <div className="ac-exec-done">
                  {Ico.checkCircle || I.check} AnA completed the workflow. {
                    run.templateId === 'submission_readiness_review'
                      ? 'Readiness scored, blockers and next actions updated above.'
                      : run.templateId === 'draft_validate_route'
                        ? 'Draft created, validated, and routed to its module.'
                        : 'Blockers scanned, classified, and ranked by filing impact.'
                  }
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pre-submission gate -- the unified go/no-go */}
      {gateOpen && (
        <div className="ac-gate-bd" onClick={() => setGateOpen(false)}>
          <div className="ac-gate" onClick={e => e.stopPropagation()}>
            <div className="ac-gate-top">
              <div>
                <div className="ac-gate-crumb">{prog.code} · {gate.submissionType} · pre-submission quality gate <SampleTag sample={gateState.sample} /></div>
                <div className="ac-gate-sub">readiness + CMC contradictions + CRL + RTF + ICH -- one verdict, audited to Part 11</div>
              </div>
              <button className="ac-gate-x" onClick={() => setGateOpen(false)}>{I.close}</button>
            </div>
            <div className={'ac-gate-verdict ' + vd.c}>
              <span className="ac-gate-vt">{vd.t}</span>
              <div className="ac-gate-rat">{(gate.verdictRationale || []).map((r, i) => (<div key={i} className="ac-gate-rr">{I.dot} {r}</div>))}</div>
            </div>
            <div className="ac-gate-grid">
              <div className="ac-gate-cell">
                <div className="ac-gate-ck">Readiness</div>
                <div className="ac-gate-cv">{gate.readiness && gate.readiness.overallScore}<span>/100 · {gate.readiness && gate.readiness.status}</span></div>
                <div className="ac-gate-sub2">{gate.readiness && Object.entries(gate.readiness.scores).map(([k, v]) => (<span key={k} className="ac-gate-ss">{k} {v}</span>))}</div>
              </div>
              <div className="ac-gate-cell">
                <div className="ac-gate-ck">CMC contradictions</div>
                <div className="ac-gate-cv err">{gate.cmc && gate.cmc.contradictionCounts.critical}<span> critical · {gate.cmc && gate.cmc.contradictionCounts.open} open</span></div>
              </div>
              <div className="ac-gate-cell">
                <div className="ac-gate-ck">CRL risk</div>
                <div className={'ac-gate-cv ' + (gate.crl && gate.crl.overallRisk === 'high' ? 'err' : gate.crl && gate.crl.overallRisk === 'moderate' ? 'warn' : 'ok')}>{gate.crl && gate.crl.overallRisk}<span> · {gate.crl && gate.crl.riskScore}</span></div>
              </div>
              <div className="ac-gate-cell">
                <div className="ac-gate-ck">RTF risk</div>
                <div className={'ac-gate-cv ' + (gate.rtf && gate.rtf.overallRisk === 'high' ? 'err' : 'ok')}>{gate.rtf && gate.rtf.overallRisk}<span> · {gate.rtf && gate.rtf.riskScore}</span></div>
              </div>
              <div className="ac-gate-cell">
                <div className="ac-gate-ck">ICH compliance</div>
                <div className={'ac-gate-cv ' + (gate.ich && gate.ich.overallStatus === 'fail' ? 'err' : gate.ich && gate.ich.overallStatus === 'warning' ? 'warn' : 'ok')}>{gate.ich && gate.ich.overallStatus}<span> · {gate.ich && gate.ich.counts.fail} fail</span></div>
              </div>
            </div>
            <div className="ac-gate-foot">
              <button className="ac-gate-ask" onClick={() => { ask('Explain the ' + gate.submissionType + ' pre-submission gate verdict for ' + prog.code + ' and how to move it to GO.'); setGateOpen(false); }}>{I.sparkles} Ask AnA how to clear it</button>
              <span className="ac-gate-audit">{Ico.lock || Ico.shield || I.check} Verdict audited · 21 CFR Part 11</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
