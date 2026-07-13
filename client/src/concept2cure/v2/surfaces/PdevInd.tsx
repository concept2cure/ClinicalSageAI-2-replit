import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, connected, liveGet } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Inline fixture types ── */

interface PdevProgram {
  id: string;
  name: string;
  code: string;
  productName: string;
  programType: string;
  primaryAgency: string;
  status: string;
  phase: string;
  targetSubmissionDate: string;
  progressPercent: number;
  metadata: null;
  updatedAt: string;
}

interface PdevWorkstreamRollup {
  workstream: string;
  totalActivities: number;
  completedActivities: number;
  inFlightActivities: number;
  blockedActivities: number;
  notStartedActivities: number;
  blockingActivities: number;
  blockingResolved: number;
  readinessScore: number;
}

interface PdevRequiredDoc {
  code: string;
  title: string;
  ectdModule: string;
  ectdSection: string;
  mandatoryForInd: boolean;
}

interface PdevRegistry {
  key: string;
  workstream: string;
  stage: string;
  title: string;
  description: string;
  requiredDocuments: PdevRequiredDoc[];
  dependsOn: string[];
  blocksIndAssembly: boolean;
}

interface PdevState {
  state: string;
  ownerUserId: number | null;
  evidenceLinkCount: number;
  documentCount: number;
  dueAt: string | null;
  updatedAt: string;
}

interface PdevActivity {
  registry: PdevRegistry;
  state: PdevState;
}

interface PdevSnapshot {
  id: string;
  programId: string;
  workstream: string;
  readinessScore: number;
  computedAt: string;
  triggeredBy: string;
}

interface PdevProgramView {
  program: PdevProgram;
  workstreams: PdevWorkstreamRollup[];
  activities: PdevActivity[];
  latestSnapshots: PdevSnapshot[];
  qSubmissionCount: number;
  fdaCorrespondenceCount: number;
}

interface PdevDraftSection {
  num: string;
  label: string;
  preview: string;
}

interface PdevAiDraftResult {
  grade: string;
  model: string;
  citations: number;
  artifactId: string;
  preview: {
    title: string;
    sections: PdevDraftSection[];
  };
}

/* ── Closed enums (verbatim from enums.ts) ── */

const PDEV_WS: string[] = ['cmc', 'nonclinical', 'clinical', 'regulatory'];
const PDEV_WS_LABELS: Record<string, string> = { cmc: 'CMC', nonclinical: 'Nonclinical', clinical: 'Clinical', regulatory: 'Regulatory' };
const PDEV_STAGE_LABELS: Record<string, string> = { early_pdev: 'Early PDEV', late_pdev: 'Late PDEV', pre_ind_meeting: 'Pre-IND meeting', ind_package: 'IND package', post_ind: 'Post-IND' };
const PDEV_STATE_LABELS: Record<string, string> = {
  not_started: 'Not started', drafting: 'Drafting', ai_draft_generated: 'AI draft ready',
  evidence_linked: 'Evidence linked', human_review_required: 'Review required', in_review: 'In review',
  changes_requested: 'Changes requested', approved: 'Approved', locked: 'Locked',
  submission_ready: 'Submission ready', submitted: 'Submitted', agency_feedback_received: 'Agency feedback',
  revision_required: 'Revision required', superseded: 'Superseded',
};

const PDEV_DONE = ['approved', 'locked', 'submission_ready', 'submitted'];

function pdevTone(s: string): string {
  if (PDEV_DONE.includes(s)) return 'ok';
  if (s === 'revision_required') return 'err';
  if (s === 'ai_draft_generated' || s === 'evidence_linked') return 'ai';
  if (s === 'changes_requested') return 'warn';
  if (s === 'human_review_required' || s === 'in_review' || s === 'agency_feedback_received') return 'warn';
  if (s === 'drafting') return 'flight';
  if (s === 'superseded') return 'idle';
  return 'idle';
}

/* ── Fixture PdevProgramView (types.ts shapes) ── */

const PDEV_VIEW: PdevProgramView = {
  program: { id: 'prg_bx301', name: 'Relapsed multiple myeloma program', code: 'BX-301', productName: 'BX-301 (anti-BCMA)', programType: 'BLA · 351(a)', primaryAgency: 'FDA', status: 'active', phase: 'Pre-IND', targetSubmissionDate: '2027-02-14', progressPercent: 58, metadata: null, updatedAt: '2026-06-30' },
  workstreams: [
    { workstream: 'cmc', totalActivities: 9, completedActivities: 5, inFlightActivities: 2, blockedActivities: 1, notStartedActivities: 1, blockingActivities: 4, blockingResolved: 2, readinessScore: 62 },
    { workstream: 'nonclinical', totalActivities: 8, completedActivities: 6, inFlightActivities: 1, blockedActivities: 0, notStartedActivities: 1, blockingActivities: 5, blockingResolved: 5, readinessScore: 84 },
    { workstream: 'clinical', totalActivities: 7, completedActivities: 2, inFlightActivities: 2, blockedActivities: 1, notStartedActivities: 2, blockingActivities: 3, blockingResolved: 1, readinessScore: 41 },
    { workstream: 'regulatory', totalActivities: 6, completedActivities: 3, inFlightActivities: 1, blockedActivities: 0, notStartedActivities: 2, blockingActivities: 2, blockingResolved: 1, readinessScore: 55 },
  ],
  activities: [
    { registry: { key: 'cmc.formulation_development', workstream: 'cmc', stage: 'late_pdev', title: 'Formulation development', description: 'Finalize the clinical formulation and justify the composition for the Phase 1 material.', requiredDocuments: [{ code: 'CMC-FORM-01', title: 'Formulation development report', ectdModule: 'm3', ectdSection: '3.2.P.2', mandatoryForInd: true }], dependsOn: [], blocksIndAssembly: true },
      state: { state: 'drafting', ownerUserId: 12, evidenceLinkCount: 2, documentCount: 1, dueAt: '2026-08-01', updatedAt: '2026-06-28' } },
    { registry: { key: 'cmc.drug_substance_stability', workstream: 'cmc', stage: 'late_pdev', title: 'Drug substance stability', description: 'Establish the 24-month stability projection for the drug substance under ICH conditions.', requiredDocuments: [{ code: 'CMC-STAB-01', title: 'DS stability report', ectdModule: 'm3', ectdSection: '3.2.S.7', mandatoryForInd: true }], dependsOn: ['cmc.formulation_development'], blocksIndAssembly: true },
      state: { state: 'revision_required', ownerUserId: 12, evidenceLinkCount: 4, documentCount: 2, dueAt: '2026-07-20', updatedAt: '2026-06-30' } },
    { registry: { key: 'nonclinical.glp_tox', workstream: 'nonclinical', stage: 'late_pdev', title: 'GLP toxicology summary', description: 'Compile the pivotal GLP toxicology package into the Module 4 nonclinical overview.', requiredDocuments: [{ code: 'NC-TOX-01', title: 'GLP tox study report', ectdModule: 'm4', ectdSection: '4.2.3', mandatoryForInd: true }], dependsOn: [], blocksIndAssembly: true },
      state: { state: 'approved', ownerUserId: 19, evidenceLinkCount: 6, documentCount: 3, dueAt: null, updatedAt: '2026-06-12' } },
    { registry: { key: 'clinical.protocol_synopsis', workstream: 'clinical', stage: 'pre_ind_meeting', title: 'Phase 1 protocol synopsis', description: 'Draft the first-in-human protocol synopsis with the proposed starting dose rationale.', requiredDocuments: [{ code: 'CL-PROT-01', title: 'Protocol synopsis', ectdModule: 'm5', ectdSection: '5.3.5', mandatoryForInd: true }], dependsOn: ['nonclinical.glp_tox'], blocksIndAssembly: true },
      state: { state: 'not_started', ownerUserId: null, evidenceLinkCount: 0, documentCount: 0, dueAt: '2026-09-01', updatedAt: '2026-06-01' } },
    { registry: { key: 'regulatory.pre_ind_briefing', workstream: 'regulatory', stage: 'pre_ind_meeting', title: 'Pre-IND briefing package', description: 'Assemble the pre-IND meeting briefing book and questions for the Agency.', requiredDocuments: [{ code: 'REG-PREIND-01', title: 'Pre-IND briefing book', ectdModule: 'm1', ectdSection: '1.6', mandatoryForInd: false }], dependsOn: ['cmc.formulation_development', 'clinical.protocol_synopsis'], blocksIndAssembly: false },
      state: { state: 'ai_draft_generated', ownerUserId: 7, evidenceLinkCount: 1, documentCount: 1, dueAt: '2026-08-15', updatedAt: '2026-06-29' } },
  ],
  latestSnapshots: [{ id: 'snap1', programId: 'prg_bx301', workstream: 'overall', readinessScore: 58, computedAt: '2026-06-30', triggeredBy: 'AnA' }],
  qSubmissionCount: 2,
  fdaCorrespondenceCount: 5,
};

/* Fixture AI draft result (PdevAiDraftResult) */
const PDEV_DRAFT: PdevAiDraftResult = {
  grade: 'B', model: 'AnA · Maximum', citations: 14, artifactId: 'art_pdev_0001',
  preview: { title: 'Formulation Development Report — BX-301 (§3.2.P.2)', sections: [
    { num: '3.2.P.2.1', label: 'Components of the Drug Product', preview: 'The drug product is a lyophilized powder for reconstitution comprising the anti-BCMA antibody, histidine buffer, sucrose, and polysorbate-80, selected to maintain conformational stability across the intended 24-month shelf life...' },
    { num: '3.2.P.2.2', label: 'Drug Product Development', preview: 'Formulation screening evaluated three buffer systems at pH 5.5-6.5; the histidine system at pH 6.0 minimized aggregation by SEC-HPLC (< 1.2% HMWS at t=0) and was carried forward...' },
    { num: '3.2.P.2.3', label: 'Manufacturing Process Development', preview: 'The lyophilization cycle was developed to achieve a residual moisture < 1.0% w/w with a cake structure supporting reconstitution in < 3 minutes...' },
  ] },
};

/* ── Inline API helpers (live ?? fixture) ── */

function pdevFetchView(id: string): Promise<{ data: PdevProgramView; sample: boolean }> {
  return liveGet<PdevProgramView>('/api/pdev/programs/' + encodeURIComponent(id), PDEV_VIEW);
}

function pdevDraft(body: { programId: string; activityKey: string; userPrompt?: string }): Promise<PdevAiDraftResult> {
  const api = (window as any).C2C_API;
  if (api && typeof api.post === 'function') {
    return api
      .post('/api/pdev/programs/' + encodeURIComponent(body.programId) + '/activities/' + encodeURIComponent(body.activityKey) + '/ai-draft', body)
      .then((r: any) => (r && r.data) || PDEV_DRAFT)
      .catch(() => PDEV_DRAFT);
  }
  return Promise.resolve(PDEV_DRAFT);
}

/* ── AI drafting workbench (the governed deliverable) ── */

interface PdevDraftSheetProps {
  activity: PdevActivity;
  program: PdevProgram;
  onClose: () => void;
  onFiled: (key: string, result: PdevAiDraftResult) => void;
}

function PdevDraftSheet({ activity, program, onClose, onFiled }: PdevDraftSheetProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PdevAiDraftResult | null>(null);
  const doc = activity.registry.requiredDocuments[0];

  const generate = () => {
    setLoading(true);
    pdevDraft({ programId: program.id, activityKey: activity.registry.key, userPrompt: prompt.trim() || undefined }).then(r => {
      setResult(r);
      setLoading(false);
    });
  };

  return (
    <div className="pdev-back" onClick={onClose} role="presentation">
      <aside className="pdev-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="pdev-sheet-h">
          <div><div className="pdev-sheet-eye">AI drafting workbench {I.dot} governed</div><div className="pdev-sheet-t">Draft {doc ? doc.title : activity.registry.title}</div></div>
          <button className="pdev-x" onClick={onClose} aria-label="Close">{I.x}</button>
        </div>
        <div className="pdev-aidraft">
          <div className="pdev-aid-left">
            <div className="pdev-fld"><div className="lbl">Context</div><div className="val mono">{activity.registry.key}{doc && doc.ectdSection ? ' · ' + doc.ectdSection : ''}</div></div>
            <div className="pdev-fld"><div className="lbl">Target document</div><div className="val">{doc ? doc.title : 'Activity-level summary'}{doc ? <span className="pdev-modtag"> {doc.ectdModule.toUpperCase()}</span> : null}</div></div>
            <div className="pdev-fld"><div className="lbl">Optional prompt</div><textarea rows={3} placeholder="Anything you want AnA to emphasize, exclude, or follow..." value={prompt} onChange={e => setPrompt(e.target.value)} /></div>
            <button className="pdev-btn primary" onClick={generate} disabled={loading}>{loading ? 'Drafting...' : <>{I.sparkles} Generate draft</>}</button>
            <div className="pdev-note">{I.shield} The draft is graded by the quality gate and every claim is cited before it can be filed &mdash; it enters the governed lifecycle, it is not auto-approved.</div>
          </div>
          <div className="pdev-aid-right">
            {!result && !loading && <div className="pdev-empty">Streaming preview will appear here after Generate.</div>}
            {loading && <div className="pdev-streaming">{I.sparkles} Streaming from {PDEV_DRAFT.model}...</div>}
            {result && <>
              <div className="pdev-grade">
                <span className={'pdev-gpill g-' + String(result.grade).toLowerCase()}>Quality gate: {result.grade}</span>
                <span className="mono small">{result.citations} citations {I.dot} {result.model}</span>
              </div>
              <div className="pdev-draft-t">{result.preview.title}</div>
              {result.preview.sections.map(s => (
                <div key={s.num} className="pdev-draft-sec"><span className="num mono">§{s.num}</span><div><div className="l">{s.label}</div><div className="p">{s.preview}</div></div></div>
              ))}
            </>}
          </div>
        </div>
        <div className="pdev-sheet-f">
          <button className="pdev-btn ghost" onClick={onClose}>Close</button>
          <button className="pdev-btn primary" disabled={!result} onClick={() => result && onFiled(activity.registry.key, result)}>{I.check} File draft → AI draft ready</button>
        </div>
      </aside>
    </div>
  );
}

/* ════ PdevInd -- product development → IND surface (override) ════ */

export function PdevInd({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  const isLive = connected();
  const [view, setView] = useState<PdevProgramView>(PDEV_VIEW);
  const [acts, setActs] = useState<PdevActivity[]>(PDEV_VIEW.activities);
  const [sheet, setSheet] = useState<PdevActivity | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let cancelled = false;
    pdevFetchView('prg_bx301').then(r => {
      if (cancelled) return;
      if (r && r.data) { setView(r.data); setActs(r.data.activities || []); }
    });
    return () => { cancelled = true; };
  }, []);

  const prog = view.program;
  const overall = Math.round(prog.progressPercent || 0);
  const THRESH = 85;
  const rollup = view.workstreams || [];
  const wsBy = useMemo(() => {
    const m: Record<string, PdevWorkstreamRollup> = {};
    rollup.forEach(r => { m[r.workstream] = r; });
    return m;
  }, [rollup]);
  const blocked = acts.filter(a => a.state && (a.state.state === 'revision_required' || a.state.state === 'changes_requested'));
  const draftable = acts.filter(a => a.state && (a.state.state === 'not_started' || a.state.state === 'drafting'));
  const weakWs = [...rollup].sort((a, b) => a.readinessScore - b.readinessScore)[0];
  const pdufaDays = prog.targetSubmissionDate ? Math.round((new Date(prog.targetSubmissionDate).getTime() - Date.now()) / 86400000) : null;

  const fileDraft = (key: string, result: PdevAiDraftResult) => {
    setActs(prev => prev.map(a => a.registry.key === key ? { ...a, state: { ...(a.state || {} as PdevState), state: 'ai_draft_generated', documentCount: ((a.state && a.state.documentCount) || 0) + 1 } } : a));
    setSheet(null);
    setToast('Draft filed — ' + PDEV_STATE_LABELS.ai_draft_generated + (result && result.grade ? ' · grade ' + result.grade : ''));
    setTimeout(() => setToast(''), 3200);
  };

  const advance = (key: string) => setActs(prev => prev.map(a => {
    if (a.registry.key !== key) return a;
    const order = ['ai_draft_generated', 'evidence_linked', 'human_review_required', 'in_review', 'approved'];
    const cur = a.state ? a.state.state : 'not_started';
    const i = order.indexOf(cur);
    const nxt = i >= 0 && i < order.length - 1 ? order[i + 1] : cur;
    return { ...a, state: { ...(a.state || {} as PdevState), state: nxt } };
  }));

  return (
    <div className="pdev" style={{ maxWidth: 1180 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Domain {I.dot} PDEV {I.dot} /api/pdev {isLive ? ' · live' : ''}</div>
          <h1 className="sp-title">{prog.code} {I.dot} {prog.productName} <SampleTag sample={!isLive} /></h1>
          <p className="sp-state">{prog.primaryAgency} {I.dot} {prog.programType}{prog.phase ? ' · ' + prog.phase : ''}{prog.targetSubmissionDate ? ' · target IND ' + prog.targetSubmissionDate : ''}</p>
        </div>
        <button className="sp-primary" onClick={() => ask && ask('Snapshot IND readiness for ' + prog.code + ' now')}>{I.zap || I.sparkles} Snapshot readiness</button>
      </div>

      {weakWs && (
        <AnswerLead
          tone={blocked.length ? 'urgent' : 'calm'}
          eyebrow={'What is standing between ' + prog.code + ' and IND'}
          headline={blocked.length
            ? <>You're <b>{overall}% ready</b> for IND &mdash; the block is <b>{blocked[0].registry.title}</b> ({PDEV_STATE_LABELS[blocked[0].state.state]}) in {PDEV_WS_LABELS[blocked[0].registry.workstream]}.</>
            : <><b>{prog.code}</b> is <b>{overall}% ready</b> for IND. The weakest workstream is <b>{PDEV_WS_LABELS[weakWs.workstream]}</b> at {Math.round(weakWs.readinessScore)}%.</>}
          body={<>The IND filing threshold is {THRESH}%. {draftable.length > 0 && <>{draftable.length} activit{draftable.length === 1 ? 'y is' : 'ies are'} ready for AnA to draft into the dossier &mdash; each becomes a graded, cited artifact you review before it promotes.</>} {pdufaDays != null && pdufaDays > 0 && <>Target IND is {pdufaDays} days out.</>}</>}
          reassure="I'll draft the next activity, attach the evidence, and walk each one through the governed lifecycle — you approve, I assemble."
          action={draftable.length
            ? { label: 'Draft ' + draftable[0].registry.title, onClick: () => setSheet(draftable[0]) }
            : { label: 'Review the blocker', onClick: () => blocked.length && ask && ask('How do I resolve ' + blocked[0].registry.title + '?') }}
          secondary="Or work the workstreams and activities below."
        />
      )}

      {/* Overall readiness */}
      <div className="pdev-ready">
        <div className="pdev-ready-num">{overall}<span className="u">%</span></div>
        <div className="pdev-ready-body">
          <div className="pdev-ready-lbl">Overall IND readiness</div>
          {weakWs && <div className="pdev-ready-sub">Weakest: {PDEV_WS_LABELS[weakWs.workstream]} {I.dot} {Math.round(weakWs.readinessScore)}%</div>}
          <div className="pdev-ready-meta mono">Threshold {THRESH}%{view.latestSnapshots && view.latestSnapshots.length ? ' · last snapshot ' + view.latestSnapshots[0].computedAt : ''} {I.dot} {view.qSubmissionCount} Q-subs {I.dot} {view.fdaCorrespondenceCount} FDA items</div>
          <div className="pdev-ready-bar"><div className="fill" style={{ width: Math.min(100, overall) + '%' }} /><div className="thr" style={{ left: THRESH + '%' }} /></div>
        </div>
      </div>

      {/* Workstream rollup */}
      <div className="pj-seclbl">Workstream rollup <span className="s">{I.dot} click to drill into activities</span></div>
      <div className="pdev-ws-strip">
        {PDEV_WS.map(ws => {
          const r = wsBy[ws] || { totalActivities: 0, completedActivities: 0, blockedActivities: 0, readinessScore: 0 } as PdevWorkstreamRollup;
          const t = r.totalActivities || 0;
          return (
            <button key={ws} className="pdev-ws-card" onClick={() => ask && ask('What is the ' + PDEV_WS_LABELS[ws] + ' status for ' + prog.code + '?')}>
              <div className="h"><span className="nm">{PDEV_WS_LABELS[ws]}</span><span className="rd mono">{Math.round(r.readinessScore)}%</span></div>
              <div className="mini"><span className="ml">complete</span><div className="mb"><div className="mf ok" style={{ width: t ? (r.completedActivities / t * 100) + '%' : '0%' }} /></div><span className="mc mono">{r.completedActivities}/{t}</span></div>
              <div className="mini"><span className="ml">blocked</span><div className="mb"><div className="mf err" style={{ width: t ? (r.blockedActivities / t * 100) + '%' : '0%' }} /></div><span className="mc mono">{r.blockedActivities}/{t}</span></div>
            </button>
          );
        })}
      </div>

      {/* Activities — the lifecycle */}
      <div className="pj-seclbl">Activities <span className="s">{I.dot} activity → AI draft → evidence → confirm</span></div>
      <div className="pdev-acts">
        {acts.map(a => {
          const st = a.state ? a.state.state : 'not_started';
          const doc = a.registry.requiredDocuments[0];
          const canDraft = st === 'not_started' || st === 'drafting';
          const canAdvance = ['ai_draft_generated', 'evidence_linked', 'human_review_required', 'in_review'].includes(st);
          return (
            <div key={a.registry.key} className="pdev-act">
              <div className="pdev-act-main">
                <div className="pdev-act-t">{a.registry.title}<span className={'rd-chip tone-' + pdevTone(st)}>{PDEV_STATE_LABELS[st]}</span></div>
                <div className="pdev-act-s">{a.registry.description}</div>
                <div className="pdev-act-meta mono">{PDEV_WS_LABELS[a.registry.workstream]} {I.dot} {PDEV_STAGE_LABELS[a.registry.stage]}{doc ? ' · ' + doc.code + ' → ' + doc.ectdModule.toUpperCase() + ' ' + (doc.ectdSection || '') : ''}{a.registry.blocksIndAssembly ? ' · blocks IND' : ''}{a.state ? ' · ' + (a.state.evidenceLinkCount || 0) + ' evidence · ' + (a.state.documentCount || 0) + ' docs' : ''}</div>
              </div>
              <div className="pdev-act-actions">
                {canDraft && <button className="pdev-btn primary sm" onClick={() => setSheet(a)}>{I.sparkles} Draft</button>}
                {canAdvance && <button className="pdev-btn sm" onClick={() => advance(a.registry.key)}>{I.arrowRight || I.check} Advance</button>}
                {st === 'revision_required' && <button className="pdev-btn warn sm" onClick={() => ask && ask('How do I resolve ' + a.registry.title + '?')}>{I.alertTriangle || I.warn} Resolve</button>}
                <button className="pdev-go" title="Provenance" onClick={() => ask && ask('Show the provenance and audit for ' + a.registry.key)}>{I.gitBranch || I.search}</button>
              </div>
            </div>
          );
        })}
      </div>

      {sheet && <PdevDraftSheet activity={sheet} program={prog} onClose={() => setSheet(null)} onFiled={fileDraft} />}
      {toast && <div className="pdev-toast">{I.check} {toast}</div>}
    </div>
  );
}
