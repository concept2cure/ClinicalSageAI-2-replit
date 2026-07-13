import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Inline fixture types ── */

interface OrchProgram {
  code: string;
  type: string;
  area: string;
}

interface OrchFinding {
  rule: string;
  type: string;
  sev: string;
  status: string;
  detail: string;
}

interface OrchReadiness {
  overallScore: number;
  blockerCount: number;
  isReady: boolean;
  evaluatedAt: string;
  findings: {
    rules: OrchFinding[];
    validation: OrchFinding[];
    ai: OrchFinding[];
  };
}

interface OrchStep {
  s: string;
  st: string;
}

interface OrchRun {
  id: string;
  title: string;
  status: string;
  started: string;
  by: string;
  pct: number;
  steps: OrchStep[];
  touched: string[];
  outputs: string[];
  blockers: string[];
  recs: string[];
  gate?: string;
}

interface OrchApprover {
  who: string;
  role: string;
  decision: string;
  when?: string;
}

interface OrchCheckpoint {
  id: string;
  label: string;
  gateType: string;
  run: string | null;
  required: string;
  approvers: OrchApprover[];
}

interface OrchData {
  program: OrchProgram;
  readiness: OrchReadiness;
  runs: OrchRun[];
  checkpoints: OrchCheckpoint[];
}

/* ── Inline fixture data (kit window globals) ── */

const ORCH_TONE: Record<string, string> = {
  running: 'ai', awaiting_approval: 'warn', paused: 'warn', pending: 'idle',
  completed: 'ok', failed: 'err', cancelled: 'idle', blocked: 'err', approved: 'ok',
};

const ORCH_SLABEL: Record<string, string> = {
  running: 'Running', awaiting_approval: 'Awaiting approval', paused: 'Paused',
  pending: 'Pending', completed: 'Completed', failed: 'Failed',
  cancelled: 'Cancelled', blocked: 'Blocked', approved: 'Approved',
};

const GATE_LABEL: Record<string, string> = {
  manual: 'Manual', role_based: 'Role-based', quorum: 'Quorum', auto_on_pass: 'Auto on pass',
};

const SEV_TONE: Record<string, string> = {
  blocker: 'err', warning: 'warn', advisory: 'idle',
};

const ORCH: OrchData = {
  program: { code: 'BX-204 · NDA 212345', type: 'NDA', area: 'Oncology' },
  readiness: {
    overallScore: 71, blockerCount: 2, isReady: false, evaluatedAt: 'today 09:14',
    findings: {
      rules: [
        { rule: '§2.5 Clinical Overview present & signed', type: 'required_item', sev: 'blocker', status: 'fail', detail: '§2.5 not frozen -- in revision' },
        { rule: 'Form FDA 356h attached & signed', type: 'required_item', sev: 'blocker', status: 'fail', detail: '1.1 Forms unsigned' },
        { rule: 'eCTD backbone valid (ICH spec)', type: 'validation_check', sev: 'warning', status: 'warn', detail: '2 leaf hrefs unresolved (Module 5)' },
        { rule: 'Module 1 administrative complete', type: 'completeness_check', sev: 'advisory', status: 'pass', detail: 'Cover letter, 1571, 3674 present' },
      ],
      validation: [
        { rule: 'SDTM / ADaM conformance (Pinnacle21)', type: 'validation_check', sev: 'warning', status: 'warn', detail: '7 reject-class checks open in ADaM' },
        { rule: 'Hyperlink & bookmark integrity', type: 'cross_reference', sev: 'advisory', status: 'pass', detail: '1,204 links resolved' },
      ],
      ai: [
        { rule: 'Cross-document ORR consistency', type: 'cross_reference', sev: 'blocker', status: 'fail', detail: '§2.5.4 (42%) vs §2.7.3 (39%) disagree' },
        { rule: 'Claim-evidence traceability §2.5.4', type: 'quality_gate', sev: 'warning', status: 'warn', detail: 'ORR claim leads CSR-201 lock -- soften or re-cite' },
      ],
    },
  },
  runs: [
    {
      id: 'wf-3142', title: 'Regenerate §2.5.4 efficacy after CSR-201 lock', status: 'running', started: '09:02', by: 'AnA · Maximum', pct: 62,
      steps: [{ s: 'Load locked CSR-201 dataset', st: 'done' }, { s: 'Diff prior §2.5.4 against dataset', st: 'done' }, { s: 'Draft tracked revision', st: 'running' }, { s: 'Re-link citations', st: 'pending' }, { s: 'Preflight Pass-5', st: 'pending' }],
      touched: ['§2.5.4 Overview of efficacy', 'CSR-201 (locked)', 'ISS pooled table'], outputs: ['Tracked revision (draft)', '3 re-linked citations'], blockers: [], recs: ['Hold promotion until §2.7.3 ORR reconciled'],
    },
    {
      id: 'wf-3139', title: 'Cross-reference ISS / ISE against §2.7.4', status: 'awaiting_approval', started: '08:40', by: 'AnA · Maximum', pct: 100, gate: 'cp-77',
      steps: [{ s: 'Pool ISS / ISE inputs', st: 'done' }, { s: 'Map deltas to §2.7.4', st: 'done' }, { s: 'Flag high-impact deltas', st: 'done' }, { s: 'Await reviewer sign-off', st: 'awaiting' }],
      touched: ['§2.7.4 Summary of clinical safety', 'ISS', 'ISE'], outputs: ['Delta report -- 12 items'], blockers: [], recs: ['Reviewer: confirm 3 high-impact deltas before merge'],
    },
    {
      id: 'wf-3128', title: 'eCTD validation sweep -- Module 3 CMC', status: 'failed', started: '07:55', by: 'System', pct: 48,
      steps: [{ s: 'Assemble M3 backbone', st: 'done' }, { s: 'Validate leaf hrefs', st: 'failed' }, { s: 'STF / study-tagging check', st: 'cancelled' }],
      touched: ['Module 3 CMC', '3.2.P.8.3 Stability'], outputs: [], blockers: ['2 unresolved leaf hrefs in 3.2.P.8.3'], recs: ['Re-link the 3.2.P.8.3 stability appendix, then retry'],
    },
    {
      id: 'wf-3110', title: 'Assemble §2.5 Clinical Overview', status: 'completed', started: 'Yesterday 16:20', by: 'AnA · Maximum', pct: 100,
      steps: [{ s: 'Gather section evidence', st: 'done' }, { s: 'Author draft from context', st: 'done' }, { s: 'Preflight Pass-5', st: 'done' }, { s: 'Promote to review', st: 'done' }],
      touched: ['§2.5 Clinical overview'], outputs: ['§2.5 draft v0.9', 'Preflight report (Pass 5 clean)'], blockers: [], recs: [],
    },
    {
      id: 'wf-3097', title: 'Pre-dispatch readiness evaluation', status: 'paused', started: 'Yesterday 11:05', by: 'You', pct: 35,
      steps: [{ s: 'Run readiness rules', st: 'done' }, { s: 'Collect validation findings', st: 'paused' }, { s: 'AI consistency sweep', st: 'pending' }],
      touched: ['Submission package (NDA 212345)'], outputs: ['Partial readiness -- 71%'], blockers: [], recs: ['Resume after §2.5 freeze and ORR reconciliation'],
    },
  ],
  checkpoints: [
    { id: 'cp-77', label: 'Reviewer sign-off -- §2.7.4 safety deltas', gateType: 'role_based', run: 'wf-3139', required: 'Clinical reviewer', approvers: [{ who: 'A. Muller', role: 'Clinical', decision: 'pending' }] },
    { id: 'cp-71', label: 'Freeze §2.5 Clinical Overview', gateType: 'quorum', run: null, required: '2 of 3 approvers', approvers: [{ who: 'S. Marchetti', role: 'Reg lead', decision: 'approved', when: '08:10' }, { who: 'A. Muller', role: 'Clinical', decision: 'pending' }, { who: 'M. Webb', role: 'Medical writer', decision: 'pending' }] },
    { id: 'cp-64', label: 'Dispatch to FDA ESG gateway', gateType: 'manual', run: null, required: 'Reg Affairs head', approvers: [{ who: 'J. Chen', role: 'Reg Affairs', decision: 'pending' }] },
    { id: 'cp-58', label: 'Auto-pass on eCTD validation', gateType: 'auto_on_pass', run: 'wf-3128', required: '0 validation errors', approvers: [] },
  ],
};

/* ── Helpers ── */

type CtrlTuple = [string, string, () => void, boolean];

/* ════ Orchestration -- workflow runs & readiness ════ */

export function Orchestration({ onAsk, onNav }: SurfaceViewProps) {
  const [view, setView] = useState('runs');
  const [runs, setRuns] = useState<OrchRun[]>(ORCH.runs);
  const [cps, setCps] = useState<OrchCheckpoint[]>(ORCH.checkpoints);
  const [selId, setSel] = useState(ORCH.runs[0].id);
  const sel = runs.find((r) => r.id === selId) || runs[0];
  const r = ORCH.readiness;

  const setRunStatus = (id: string, st: string) =>
    setRuns((rs) => rs.map((x) => (x.id === id ? { ...x, status: st } : x)));

  const decide = (cpId: string, who: string, decision: string) =>
    setCps((cs) => cs.map((c) =>
      c.id !== cpId ? c : { ...c, approvers: c.approvers.map((a) => (a.who === who ? { ...a, decision, when: 'just now' } : a)) },
    ));

  const pendingGates = cps.filter((c) => {
    const dec = c.approvers.map((a) => a.decision);
    return dec.indexOf('pending') > -1 || dec.indexOf('blocked') > -1;
  });

  const ctrlsFor = (x: OrchRun): CtrlTuple[] => {
    if (x.status === 'running') return [['Pause', 'pause', () => setRunStatus(x.id, 'paused'), false], ['Cancel', 'close', () => setRunStatus(x.id, 'cancelled'), false]];
    if (x.status === 'paused') return [['Resume', 'play', () => setRunStatus(x.id, 'running'), true], ['Cancel', 'close', () => setRunStatus(x.id, 'cancelled'), false]];
    if (x.status === 'failed') return [['Retry', 'rotateCw', () => setRunStatus(x.id, 'running'), true]];
    if (x.status === 'awaiting_approval') return [['Open gate', 'shieldCheck', () => setView('approvals'), true]];
    if (x.status === 'completed') return [['Replay', 'rotateCw', () => setRunStatus(x.id, 'running'), false]];
    if (x.status === 'cancelled') return [['Retry', 'rotateCw', () => setRunStatus(x.id, 'running'), true]];
    return [];
  };

  const stepIc = (st: string): React.ReactElement | null =>
    st === 'done' ? I.check : st === 'failed' ? I.close : st === 'awaiting' ? I.clock : st === 'paused' ? I.pause : null;

  const findGroup = (label: string, sub: string, list: OrchFinding[]) => (
    <div style={{ marginBottom: 18 }}>
      <div className="orch-sec-l">{label} <span style={{ color: 'var(--text-500)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{I.dot} {sub}</span></div>
      {list.map((f, i) => (
        <div key={i} className="orch-find">
          <span className={'orch-find-dot ' + (SEV_TONE[f.sev] || 'idle')} />
          <div className="orch-find-b">
            <div className="orch-find-r">{f.rule}</div>
            <div className="orch-find-d">{f.detail}</div>
          </div>
          <div className="orch-find-meta">
            <span className="rd-chip tone-idle">{f.type.replace(/_/g, ' ')}</span>
            <span className={'rd-chip tone-' + (ORCH_TONE[f.status === 'fail' ? 'failed' : f.status === 'warn' ? 'paused' : 'completed'] || 'idle')}>
              {f.status === 'fail' ? 'Fail' : f.status === 'warn' ? 'Warn' : 'Pass'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="page-inner orch">
      <SampleTag sample={true} />
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Orchestration {I.dot} {ORCH.program.code}</div>
          <h1 className="ph-title">Workflow runs &amp; readiness</h1>
          <div className="ph-sub">The persisted execution engine -- <code>workflowRuns</code> (versioned, pausable, replayable), human-in-the-loop <code>approvalCheckpoints</code>, and deterministic <code>readinessEvaluations</code>. Every step, object touched and output is recorded for Part-11 traceability.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => onAsk && onAsk('Run a pre-dispatch readiness evaluation for ' + ORCH.program.code)}>{I.sparkles} Ask AnA</button>
          <button className="btn primary">{I.workflow} New run</button>
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="metric-l">Active runs</div>
          <div className="metric-n">{runs.filter((x) => ['running', 'paused', 'awaiting_approval'].indexOf(x.status) > -1).length}</div>
          <div className="dmod-chip" style={{ marginTop: 6, background: 'transparent', padding: 0, color: 'var(--text-400)' }}>of {runs.length} total</div>
        </div>
        <div className="metric" data-tone="warn">
          <div className="metric-l">Awaiting approval</div>
          <div className="metric-n">{pendingGates.length}</div>
          <div className="dmod-chip" style={{ marginTop: 6, background: 'transparent', padding: 0, color: 'var(--text-400)' }}>HITL gates</div>
        </div>
        <div className="metric" data-tone={r.isReady ? '' : 'err'}>
          <div className="metric-l">Readiness score</div>
          <div className="metric-n">{r.overallScore}%</div>
          <div className="dmod-chip" style={{ marginTop: 6, background: 'transparent', padding: 0, color: 'var(--text-400)' }}>{r.blockerCount} blockers</div>
        </div>
        <div className="metric" data-tone={r.isReady ? 'ok' : 'err'}>
          <div className="metric-l">Dispatch</div>
          <div className="metric-n">{r.isReady ? 'Ready' : 'Blocked'}</div>
          <div className="dmod-chip" style={{ marginTop: 6, background: 'transparent', padding: 0, color: 'var(--text-400)' }}>readinessEvaluations</div>
        </div>
      </div>

      <div className="seg orch-views" style={{ marginBottom: 16 }}>
        {([['runs', 'Runs'], ['approvals', 'Approvals'], ['readiness', 'Readiness']] as [string, string][]).map(([k, l]) => (
          <button key={k} className={'seg-b' + (view === k ? ' on' : '')} onClick={() => setView(k)}>
            {l}
            {k === 'approvals' && pendingGates.length ? <span className="seg-badge">{pendingGates.length}</span> : null}
          </button>
        ))}
      </div>

      {view === 'runs' && (
        <div className="orch-split">
          <div className="orch-runs">
            {runs.map((x) => (
              <button key={x.id} className="orch-run" data-on={x.id === selId || undefined} onClick={() => setSel(x.id)}>
                <div className="orch-run-top">
                  <span className={'rd-chip tone-' + (ORCH_TONE[x.status] || 'idle')}>{ORCH_SLABEL[x.status]}</span>
                  <span style={{ flex: 1 }} />
                  <span className="orch-run-m">{x.id}</span>
                </div>
                <div className="orch-run-t">{x.title}</div>
                <div className="orch-run-m">{x.by} {I.dot} {x.started}</div>
                <div className="orch-bar"><span style={{ width: x.pct + '%' }} /></div>
              </button>
            ))}
          </div>
          <div className="orch-detail">
            <div className="orch-detail-h">
              <div>
                <div className="orch-detail-t">{sel.title}</div>
                <div className="orch-detail-m">{sel.id} {I.dot} {ORCH_SLABEL[sel.status]} {I.dot} started {sel.started} {I.dot} by {sel.by}</div>
              </div>
              <div className="orch-ctrls">
                {ctrlsFor(sel).map(([lbl, ic, fn, pri], i) => (
                  <button key={i} className={'orch-ctrl' + (pri ? ' pri' : '')} onClick={fn}>{I[ic]}{lbl}</button>
                ))}
              </div>
            </div>
            <div className="orch-sec-l">Steps</div>
            <div className="orch-steps">
              {sel.steps.map((s, i) => (
                <div key={i} className="orch-step" data-st={s.st}>
                  <span className="orch-step-dot">{stepIc(s.st)}</span>
                  <span className="orch-step-l">{s.s}</span>
                  <span style={{ flex: 1 }} />
                  <span className="orch-run-m">{s.st}</span>
                </div>
              ))}
            </div>
            <div className="orch-sec-l">Objects touched</div>
            <div className="orch-chips">
              {sel.touched.map((t, i) => (
                <span key={i} className="orch-chip" onClick={() => onNav && onNav('document-authoring')} style={{ cursor: 'pointer' }}>{t}</span>
              ))}
            </div>
            <div className="orch-sec-l">Outputs created</div>
            <div className="orch-chips">
              {sel.outputs.length
                ? sel.outputs.map((t, i) => <span key={i} className="orch-chip">{I.fileCheck} {t}</span>)
                : <span className="orch-run-m">None yet</span>}
            </div>
            {sel.blockers.length > 0 && (
              <>
                <div className="orch-sec-l">Blockers</div>
                {sel.blockers.map((b, i) => (
                  <div key={i} className="orch-note" style={{ color: 'var(--error)' }}>{I.alertTriangle}<span>{b}</span></div>
                ))}
              </>
            )}
            {sel.recs.length > 0 && (
              <>
                <div className="orch-sec-l">Recommendations</div>
                {sel.recs.map((b, i) => (
                  <div key={i} className="orch-note">{I.sparkles}<span>{b}</span></div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {view === 'approvals' && (
        <div>
          {cps.map((c) => {
            const approved = c.approvers.filter((a) => a.decision === 'approved').length;
            const need = c.gateType === 'quorum' ? Math.ceil(c.approvers.length * 2 / 3) : c.approvers.length;
            return (
              <div key={c.id} className="orch-cp">
                <div className="orch-cp-top">
                  <span className="rd-chip tone-ai">{I.shieldCheck} {GATE_LABEL[c.gateType]}</span>
                  <span className="orch-cp-t">{c.label}</span>
                  <span className="orch-cp-req">
                    {c.required}{c.gateType === 'quorum' ? ' · ' + approved + '/' + need + ' met' : ''}{c.run ? ' · ' + c.run : ''}
                  </span>
                </div>
                {c.gateType === 'auto_on_pass' ? (
                  <div className="orch-note">{I.zap}<span>Gate fires automatically when its run reports zero validation errors. Current run <b>{c.run}</b> failed validation -- gate is held.</span></div>
                ) : c.approvers.map((a, i) => (
                  <div key={i} className="orch-appr">
                    <span className="orch-appr-av">{a.who.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
                    <div className="orch-appr-b">
                      <div className="orch-appr-n">{a.who}</div>
                      <div className="orch-appr-r">{a.role}{a.when ? ' · ' + a.when : ''}</div>
                    </div>
                    {a.decision === 'approved' ? (
                      <span className="orch-mini ok">{I.check} Approved</span>
                    ) : a.decision === 'rejected' ? (
                      <span className="orch-mini no">{I.close} Rejected</span>
                    ) : (
                      <div className="orch-appr-acts">
                        <button className="orch-mini ok" onClick={() => decide(c.id, a.who, 'approved')}>Approve</button>
                        <button className="orch-mini no" onClick={() => decide(c.id, a.who, 'rejected')}>Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {view === 'readiness' && (
        <div>
          <div className="orch-score">
            <div>
              <div className="orch-score-n" style={{ color: r.isReady ? 'var(--success)' : 'var(--error)' }}>{r.overallScore}%</div>
              <div className="orch-run-m">evaluated {r.evaluatedAt}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span className={'rd-chip tone-' + (r.isReady ? 'ok' : 'err')}>{r.isReady ? 'Ready to dispatch' : 'Not ready'}</span>
                <span className="rd-chip tone-err">{r.blockerCount} blockers</span>
              </div>
              <div className="ph-sub" style={{ margin: 0 }}>Deterministic gate: clears only when blocker-class findings = 0 across rules-based, validation and AI-inferred evidence classes.</div>
            </div>
            <button className="btn ghost" onClick={() => onAsk && onAsk('Re-run the readiness evaluation and explain the open blockers')}>{I.rotateCw} Re-evaluate</button>
          </div>
          {findGroup('Rules-based findings', 'readinessRules · required_item / quality_gate', r.findings.rules)}
          {findGroup('Validation findings', 'eCTD · CDISC · hyperlink integrity', r.findings.validation)}
          {findGroup('AI-inferred findings', 'cross-reference · claim-evidence', r.findings.ai)}
        </div>
      )}
    </div>
  );
}
