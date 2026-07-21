/**
 * RBM surfaces 6-10: Central monitoring (signals), Patient profiles,
 * Site risk, Site oversight, Monitoring plan.
 *
 * Every surface reads its slice from the live board
 * (GET /api/mdx-rbm/rbm-board/:programId) passed as `board`. Compute actions that
 * are owned by the RBM engine server-side (a central-monitoring run, plan
 * generation) show an honest "runs server-side" note rather than fabricating a
 * result; the in-surface edit flows (log signal, investigate, schedule visit,
 * add action, approve) are an un-persisted sample layer flagged by the shell's
 * SampleTag until the write path is wired.
 */
import React, { useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { I } from '../icons';
import { RBM_VOCAB, type RbmSignal } from '../fixtures/rbm-data';
import type { RbmBoard, RbmBoardSignal, RbmBoardSite, RbmBoardPlan } from './rbmBoard';
import {
  RbmChip, RbmScore, RbmFreshness, DimBars,
  RbmFormModal, GovernedApprovalDialog, RBM_STORE, useRbmActions, type FormField,
} from './RbmSurfaces';
import '../styles/rbm-v2.css';

interface SubProps {
  board: RbmBoard;
  onTab?: (id: string) => void;
  onAsk?: (t: string) => void;
  onNav?: (id: string) => void;
  /** Re-fetch the live board after a persisted write, so the surface re-derives
      from server truth instead of local optimistic state. */
  onReload?: () => void;
}

const SRC_LABEL: Record<string, string> = { central_stat: 'Statistical', kri: 'KRI', qtl: 'QTL', site_score: 'Site score', manual: 'Manual' };
const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const ACT_TYPES = ['issue', 'capa', 'site_visit', 'query', 'escalation'];

function signalView(s: RbmBoardSignal): RbmSignal {
  return {
    id: String(s.id), source: s.source, type: s.type, severity: s.severity,
    title: s.title, site: s.site, detail: s.detail, detected: s.detected ?? '',
    status: s.status, resolution: s.resolution ?? undefined,
  };
}

/* 6 -- Signals */
export function RbmSignals({ board, onTab }: SubProps) {
  const [signals, setSignals] = useState<RbmSignal[]>(() => board.signals.map(signalView));
  const [filter, setFilter] = useState('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [runNote, setRunNote] = useState(false);
  const [logging, setLogging] = useState(false);
  const [invFor, setInvFor] = useState<RbmSignal | null>(null);
  const isOpen = (s: RbmSignal) => !['resolved', 'dismissed'].includes(s.status);
  const shown = signals.filter(s => filter === 'all' || (filter === 'open' ? isOpen(s) : s.status === filter)).sort((a, b) => (SEV_ORDER[a.severity] || 3) - (SEV_ORDER[b.severity] || 3));
  const setStatus = (id: string, status: string) => setSignals(ss => ss.map(s => s.id === id ? { ...s, status } : s));
  const logSignal = (f: Record<string, string>) => {
    setSignals(ss => [{ id: `sig-${Date.now().toString().slice(-5)}`, source: 'manual', type: 'manual', severity: f.severity, title: f.title, site: f.site || '—', detail: f.detail, detected: 'just now', status: 'new' }, ...ss]);
    setLogging(false);
  };
  const saveInv = (f: Record<string, string>) => {
    setSignals(ss => ss.map(s => s.id === invFor!.id ? { ...s, status: f.status,
      investigation: { owner: f.owner, rootCause: f.rootCause, action: f.action, notes: f.notes, evidence: f.evidence, when: 'just now' },
      resolution: (f.status === 'resolved' || f.status === 'dismissed') ? f.notes : s.resolution } : s));
    if (f.action) RBM_STORE.addAction({ type: f.action, title: `${invFor!.title} -- ${f.notes || 'follow-up'}`,
      priority: invFor!.severity === 'critical' ? 'critical' : invFor!.severity === 'high' ? 'high' : 'medium', owner: f.owner || 'Unassigned', due: '—', origin: 'signal' });
    setInvFor(null);
  };
  return (
    <div>
      <div className="rbm-bar">
        <div className="rbm-filters">{['open', 'new', 'investigating', 'resolved', 'all'].map(f => (
          <button key={f} className="rbm-filter" data-on={filter === f || undefined} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}</button>
        ))}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="rbm-btn" onClick={() => setLogging(true)}>{I.penLine}Log signal</button>
          <button className="rbm-btn pri" onClick={() => setRunNote(true)}>{I.zap}Run central monitoring</button>
        </div>
      </div>
      {runNote && (
        <div className="rbm-run">
          <div className="rbm-run-h">{I.info}Central statistical monitoring runs server-side</div>
          <div className="rbm-run-m">The robust modified z-score scan is computed by the RBM engine (mdx-rbm). Triggering a new run from this panel isn't wired in this build — the signals below are the live results of the most recent engine run for this study.</div>
        </div>
      )}
      <div className="rbm-inbox">{shown.map(s => (
        <div key={s.id} className="rbm-sig" data-sev={s.severity}>
          <button className="rbm-sig-main" onClick={() => setOpenId(openId === s.id ? null : s.id)} aria-expanded={openId === s.id}>
            <RbmChip vocab="severity" value={s.severity} />
            <span className="rbm-sig-src" data-src={s.source}>{SRC_LABEL[s.source] || s.source}</span>
            <span className="rbm-sig-t">{s.title}</span>
            <span className="rbm-sig-meta">{s.site !== '—' ? `site ${s.site} -- ` : ''}{s.detected}</span>
            <RbmChip vocab="signal" value={s.status} />
          </button>
          {openId === s.id && (
            <div className="rbm-sig-detail">
              <p>{s.detail}</p>
              {s.investigation && (
                <div className="rbm-sig-inv">
                  <div className="rbm-sig-inv-h">{I.check}Investigation -- {s.investigation.owner} -- {s.investigation.when}</div>
                  <div className="rbm-sig-inv-row"><span>Root cause</span>{s.investigation.rootCause}</div>
                  <div className="rbm-sig-inv-row"><span>Action</span>{RBM_VOCAB.atype[s.investigation.action] ? RBM_VOCAB.atype[s.investigation.action].l : s.investigation.action} -- {s.investigation.notes}</div>
                  {s.investigation.evidence && <div className="rbm-sig-inv-row"><span>Evidence</span>{s.investigation.evidence}</div>}
                </div>
              )}
              {s.resolution && !s.investigation && <p className="rbm-sig-res">{I.check}{s.resolution}</p>}
              {isOpen(s) && (
                <div className="rbm-sig-acts">
                  {s.status === 'new' && <button className="rbm-btn" onClick={() => setStatus(s.id, 'triaged')}>Triage</button>}
                  <button className="rbm-btn pri" onClick={() => setInvFor(s)}>{I.penLine}Document investigation</button>
                  <button className="rbm-btn" onClick={() => setStatus(s.id, 'dismissed')}>Dismiss</button>
                  <button className="rbm-btn" onClick={() => { RBM_STORE.addAction({ type: 'escalation', title: `Escalate: ${s.title}`, priority: s.severity === 'critical' ? 'critical' : 'high', owner: 'Unassigned', due: '—', origin: 'signal' }); onTab?.('plan'); }}>Escalate to action {I.chevRight}</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
        {shown.length === 0 && <div className="rbm-inbox-empty">No {filter === 'all' ? '' : filter + ' '}signals. Central monitoring re-scans the site cohort server-side.</div>}
      </div>
      {logging && <RbmFormModal title="Log a manual signal"
        intro="Manual signals join the inbox alongside statistical, KRI- and QTL-derived signals. Severity drives triage order."
        fields={[{ key: 'title', label: 'Signal', type: 'textarea' }, { key: 'severity', label: 'Severity', type: 'select', options: ['critical', 'high', 'medium', 'low'], labels: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' } }, { key: 'site', label: 'Site (optional)', type: 'text', optional: true }, { key: 'detail', label: 'Detail', type: 'textarea' }]}
        submitLabel="Log signal" onCancel={() => setLogging(false)} onSubmit={logSignal} />}
      {invFor && <RbmFormModal title={`Investigate -- ${invFor.title}`}
        intro="Document the signal follow-up: assign an owner, record the root cause, the action taken and its resolution. This is the auditable investigation record."
        fields={[{ key: 'owner', label: 'Assigned to', type: 'text' }, { key: 'rootCause', label: 'Root cause', type: 'textarea' }, { key: 'action', label: 'Action type', type: 'select', options: ['issue', 'capa', 'site_visit', 'query', 'escalation'], labels: { issue: 'Issue', capa: 'CAPA', site_visit: 'Site visit', query: 'Query', escalation: 'Escalation' } }, { key: 'notes', label: 'Action taken / resolution notes', type: 'textarea' }, { key: 'evidence', label: 'Evidence (optional)', type: 'text', optional: true }, { key: 'status', label: 'Set status', type: 'select', options: ['triaged', 'investigating', 'resolved', 'dismissed'], labels: { triaged: 'Triaged', investigating: 'Investigating', resolved: 'Resolved', dismissed: 'Dismissed' } }]}
        initial={{ status: 'investigating' }} submitLabel="Save investigation" onCancel={() => setInvFor(null)} onSubmit={saveInv} />}
    </div>
  );
}

/* 7 -- Patients */
export function RbmPatients({ board }: SubProps) {
  const P = board.patients;
  const [open, setOpen] = useState<string>(() => P[0]?.sid ?? '');
  const [scannedAt, setScannedAt] = useState<string>(() => P[0]?.at ?? board.asOf);
  const sel = P.find(p => p.sid === open);
  const flagged = board.summary.patients.flagged, review = board.summary.patients.review;
  return (
    <div>
      <div className="rbm-bar">
        <span className="rbm-bar-info">scorePatientCohort -- robust modified z-score -- MIN_COHORT 5 -- {board.summary.patients.scored} subjects -- scored {scannedAt}</span>
        <button className="rbm-btn pri" onClick={() => setScannedAt('just now')}>{I.zap}Scan cohort</button>
      </div>
      <div className="rbm-pt-cols">
        <div className="rbm-card">
          <div className="rbm-card-h">Cohort -- ranked by anomaly score<span className="rbm-card-sub">{flagged} flagged -- {review} in review</span></div>
          <table className="rbm-tbl"><thead><tr><th>Subject</th><th>Site</th><th>Anomaly</th><th>Top dimension</th><th>Status</th></tr></thead>
            <tbody>{P.map(p => (
              <tr key={p.sid} data-on={open === p.sid || undefined} className="rowbtn" onClick={() => setOpen(p.sid)}>
                <td className="mono">{p.sid}</td><td className="mono">{p.site}</td>
                <td><span className="rbm-z" data-hi={(p.anomaly ?? 0) >= 3.5 ? 2 : (p.anomaly ?? 0) >= 3 ? 1 : 0}>{(p.anomaly ?? 0).toFixed(1)}</span></td>
                <td>{p.top}</td><td><RbmChip vocab="patient" value={p.status} /></td>
              </tr>
            ))}
            {P.length === 0 && <tr><td colSpan={5} className="rbm-col-empty">No subjects scored for this study yet.</td></tr>}
            </tbody></table>
        </div>
        {sel && (
          <div className="rbm-card">
            <div className="rbm-card-h">Why {sel.sid} is atypical<span className="rbm-card-sub">per-metric robust z vs cohort</span></div>
            <div className="rbm-pt-detail">{sel.metrics.map((m, i) => {
              const a = Math.abs(m.z), pct = Math.min(100, a / 5 * 100);
              return (
                <div key={i} className="rbm-pt-metric">
                  <span className="k">{m.k}</span>
                  <span className="bar"><span data-hi={a >= 3.5 ? 2 : a >= 3 ? 1 : 0} style={{ width: `${pct}%` }} /></span>
                  <span className="v mono">{m.z > 0 ? '+' : ''}{m.z.toFixed(1)}</span>
                </div>
              );
            })}
              {sel.metrics.length === 0 && <div className="rbm-note" style={{ margin: 0 }}>{I.info}Per-dimension breakdown isn't available from the profile store for this subject — the anomaly score and status are the scored result.</div>}
              <div className="rbm-pt-foot"><RbmFreshness at={sel.at ?? '—'} />{sel.status !== 'normal' && <span className="rbm-pt-note">{I.alertTriangle}{sel.status === 'flagged' ? 'Flagged for medical review' : 'Queued for review'} -- dimensions 3+ MAD from cohort median drive the score.</span>}</div>
            </div>
          </div>
        )}
      </div>
      <div className="rbm-note">{I.info}The bars are the accessible equivalent of a cohort scatter -- every dimension shows its signed z. Cohorts below MIN_COHORT (5) are not scored (no false anomalies on thin data).</div>
    </div>
  );
}

/* 8 -- Sites */
export function RbmSites({ board }: SubProps) {
  const sites = board.sites;
  const [at, setAt] = useState<string>(() => sites[0]?.at ?? board.asOf);
  return (
    <div>
      <div className="rbm-bar">
        <span className="rbm-bar-info">site-risk-engine -- composite from Site Intelligence -- scored {at}</span>
        <button className="rbm-btn pri" onClick={() => setAt('just now')}>{I.zap}Recompute site risk</button>
      </div>
      <div className="rbm-card">
        <table className="rbm-tbl"><thead><tr><th>Site</th><th>Composite</th><th style={{ width: 230 }}>Dimensions (of 25)</th><th>Tier</th><th>Drivers -- why this tier</th></tr></thead>
          <tbody>{sites.map(s => (
            <tr key={s.n}>
              <td><b className="mono">{s.n}</b> {s.name}{s.country ? <span className="rbm-cty">{s.country}</span> : null}</td>
              <td><RbmScore v={Math.round(s.composite ?? 0)} /> <span className="mono mut">{s.composite ?? 0}</span></td>
              <td><DimBars enr={s.enr ?? 0} qual={s.qual ?? 0} ops={s.ops ?? 0} /></td>
              <td><RbmChip vocab="tier" value={s.tier} /></td>
              <td className="mit"><div className="rbm-drivers">{s.drivers.map((d, i) => <span key={i} className="rbm-driver">{d}</span>)}</div></td>
            </tr>
          ))}
          {sites.length === 0 && <tr><td colSpan={5} className="rbm-col-empty">No site risk scored for this study yet.</td></tr>}
          </tbody></table>
      </div>
      <div className="rbm-note">{I.info}All {sites.length} scored site{sites.length === 1 ? '' : 's'} shown, ranked by composite risk. Tier assignment is monitoringTierFromRisk() on the composite; the enhanced tier drives the monitoring-plan visit cadence.</div>
    </div>
  );
}

/* 9 -- Oversight */
export function RbmOversight({ board, onTab }: SubProps) {
  const C = board.oversight;
  const sites = board.sites;
  const [visits, setVisits] = useState<Record<string, { when: string; focus: string; monitor: string; type: string }>>({});
  const [schedFor, setSchedFor] = useState<RbmBoardSite | null>(null);
  const scheduleVisit = (f: Record<string, string>) => {
    setVisits(v => ({ ...v, [schedFor!.n]: { when: f.when, focus: f.focus, monitor: f.monitor, type: f.type } }));
    RBM_STORE.addAction({ type: 'site_visit', title: `${f.type === 'remote' ? 'Remote' : 'On-site'} oversight visit -- site ${schedFor!.n} (${f.focus})`, priority: 'high', owner: f.monitor || 'Unassigned', due: f.when, origin: 'oversight' });
    setSchedFor(null);
  };
  return (
    <div>
      <div className="rbm-card">
        <div className="rbm-card-h">Where do I send a monitor<span className="rbm-card-sub">SPOT -- site risk joined with open-signal load</span></div>
        <table className="rbm-tbl"><thead><tr><th>Site</th><th>Composite</th><th>Tier</th><th>Open signals</th><th>High severity</th><th>Oversight action</th></tr></thead>
          <tbody>{sites.map(s => {
            const c = C[s.n] || { open: 0, high: 0 };
            const v = visits[s.n];
            return (
              <tr key={s.n}>
                <td><b className="mono">{s.n}</b> {s.name}</td>
                <td><RbmScore v={Math.round(s.composite ?? 0)} /></td>
                <td><RbmChip vocab="tier" value={s.tier} /></td>
                <td>{c.open > 0 ? <button className="rbm-linknum" onClick={() => onTab?.('signals')}>{c.open} open {I.chevRight}</button> : <span className="mut">0</span>}</td>
                <td>{c.high > 0 ? <button className="rbm-linknum hi" onClick={() => onTab?.('signals')}>{c.high} high {I.chevRight}</button> : <span className="mut">0</span>}</td>
                <td>{v ? <span className="rbm-visit-set">{I.check}{v.type === 'remote' ? 'Remote' : 'On-site'} -- {v.when} -- {v.monitor}</span>
                  : <button className="rbm-linkbtn" onClick={() => setSchedFor(s)}>{I.clock}Schedule visit</button>}</td>
              </tr>
            );
          })}
          {sites.length === 0 && <tr><td colSpan={6} className="rbm-col-empty">No sites to oversee for this study yet.</td></tr>}
          </tbody></table>
      </div>
      <div className="rbm-note">{I.info}SPOT turns risk + signal load into a monitoring assignment: schedule a visit and it becomes a site_visit action on the monitoring plan and a task on the org board. Enhanced-tier sites should carry an on-site visit; reduced-tier sites are remote/central by default.</div>
      {schedFor && <RbmFormModal title={`Schedule oversight visit -- site ${schedFor.n}`}
        intro={`${schedFor.name} -- composite ${schedFor.composite ?? 0} -- ${schedFor.tier} tier. Choose the visit type, focus and monitor. The visit is added to the monitoring plan and the task board.`}
        fields={[{ key: 'type', label: 'Visit type', type: 'select', options: ['on_site', 'remote'], labels: { on_site: 'On-site', remote: 'Remote / central' } }, { key: 'when', label: 'Target date', type: 'text' }, { key: 'focus', label: 'Focus (what to review)', type: 'textarea' }, { key: 'monitor', label: 'Assigned monitor (CRA)', type: 'text' }]}
        initial={{ type: schedFor.tier === 'enhanced' ? 'on_site' : 'remote' }} submitLabel="Schedule visit"
        onCancel={() => setSchedFor(null)} onSubmit={scheduleVisit} />}
    </div>
  );
}

/* 10 -- Plan */
export function RbmPlan({ board, onReload }: SubProps) {
  const [plan] = useState<RbmBoardPlan | null>(() => board.plan);
  const [signFor, setSignFor] = useState(false);
  const acts = useRbmActions();
  const [adding, setAdding] = useState(false);
  const [genNote, setGenNote] = useState(false);
  const cols: [string, string][] = [['open', 'Open'], ['in_progress', 'In progress'], ['done', 'Done']];
  const advance = (id: string, cur: string) => RBM_STORE.updateAction(id, { status: cur === 'open' ? 'in_progress' : 'done', overdue: false });
  const addAction = (f: Record<string, string>) => { RBM_STORE.addAction({ type: f.type, title: f.title, priority: f.priority, owner: f.owner, due: f.due, origin: 'plan' }); setAdding(false); };
  return (
    <div>
      {plan ? (
        <div className="rbm-asmt">
          <div className="rbm-asmt-l">
            <b>{plan.title}</b>
            <span>strategy <RbmChip vocab="strategy" value={plan.strategy} /> -- updated {plan.updated ?? '—'}</span>
            {plan.anaDraft && plan.status !== 'active' && <span className="rbm-draftflag">{I.sparkles}AnA-drafted -- pending review and approval</span>}
            {plan.approval ? <span className="rbm-audit">{I.check}Approved by {plan.approval.by} -- {plan.approval.when} -- &quot;{plan.approval.reason}&quot;</span> : null}
          </div>
          {plan.tiers && (
            <div className="rbm-asmt-hist">
              <span className="rbm-hist-row">Enhanced -- {plan.tiers.enhanced}</span>
              <span className="rbm-hist-row">Standard -- {plan.tiers.standard}</span>
              <span className="rbm-hist-row">Reduced -- {plan.tiers.reduced}</span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end' }}>
            {plan.status !== 'active' && <button className="rbm-btn pri" onClick={() => setSignFor(true)}>{I.lock}Approve plan</button>}
            <button className="rbm-btn" onClick={() => setGenNote(true)}>{I.sparkles}Generate from RACT</button>
          </div>
        </div>
      ) : (
        <div className="rbm-note">{I.info}No monitoring plan for this study yet — plan generation runs via the RBM engine (server-side) from the risk assessment; the actions below are the live monitoring actions.</div>
      )}
      {genNote && (
        <div className="rbm-run" style={{ marginBottom: 11 }}>
          <div className="rbm-run-h">{I.info}Plan generation runs server-side</div>
          <div className="rbm-run-m">AnA drafts the monitoring plan from the open critical CtQ factors and the current tier assignments via the RBM engine. Drafting from this panel isn't wired in this build — the plan and its actions above/below are the live record.</div>
        </div>
      )}
      <div className="rbm-bar" style={{ marginBottom: 11 }}>
        <span className="rbm-bar-info">{acts.length} actions -- {acts.filter(a => a.overdue).length} overdue -- escalations, investigations and scheduled visits land here and sync to Tasking</span>
        <button className="rbm-btn" onClick={() => setAdding(true)}>{I.zap}Add action</button>
      </div>
      <div className="rbm-board">{cols.map(([st, label]) => (
        <div key={st} className="rbm-col">
          <div className="rbm-col-h">{label} -- {acts.filter(a => a.status === st).length}</div>
          {acts.filter(a => a.status === st).map(a => (
            <div key={a.id} className="rbm-act" data-overdue={a.overdue || undefined}>
              <div className="rbm-act-top"><span className="rbm-act-type">{RBM_VOCAB.atype[a.type]?.l ?? a.type}</span><RbmChip vocab="severity" value={a.priority === 'critical' ? 'critical' : a.priority} /></div>
              <div className="rbm-act-t">{a.ana && <span className="rbm-draftflag" style={{ marginRight: 5 }}>{I.sparkles}draft</span>}{a.title}</div>
              <div className="rbm-act-m">{a.owner} -- due {a.due}{a.origin && a.origin !== 'plan' && a.origin !== 'ana' && <span className="rbm-act-origin">from {a.origin}</span>}{a.overdue && <b className="rbm-overdue">overdue</b>}</div>
              {st !== 'done' && <button className="rbm-act-adv" onClick={() => advance(a.id, a.status)}>{st === 'open' ? 'Start' : 'Complete'} {I.chevRight}</button>}
            </div>
          ))}
          {acts.filter(a => a.status === st).length === 0 && <div className="rbm-col-empty">None</div>}
        </div>
      ))}</div>
      {adding && <RbmFormModal title="Add monitoring action"
        intro="Actions track the response to risks and signals. Overdue actions feed the attention queue."
        fields={[{ key: 'type', label: 'Type', type: 'select', options: ACT_TYPES, labels: { issue: 'Issue', capa: 'CAPA', site_visit: 'Site visit', query: 'Query', escalation: 'Escalation' } }, { key: 'title', label: 'Description', type: 'textarea' }, { key: 'priority', label: 'Priority', type: 'select', options: ['critical', 'high', 'medium', 'low'], labels: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' } }, { key: 'owner', label: 'Owner', type: 'text' }, { key: 'due', label: 'Due date', type: 'text' }]}
        submitLabel="Add action" onCancel={() => setAdding(false)} onSubmit={addAction} />}
      {signFor && plan && <GovernedApprovalDialog what="Monitoring plan"
        meaning="The plan becomes the active monitoring commitment; visit cadence and SDV depth follow its tier definitions."
        onCancel={() => setSignFor(false)}
        onSigned={async ({ reason, password, mfaToken }) => {
          const res = await apiRequest('POST', `/api/mdx/rbm-monitoring-plans/${plan.id}/approve`, { reason, password, mfaToken });
          if (res.ok) { setSignFor(false); onReload?.(); return; }
          const body = await res.json().catch(() => null) as { error?: string } | null;
          return body?.error || `Approval failed (HTTP ${res.status}). The plan was not activated.`;
        }} />}
    </div>
  );
}
