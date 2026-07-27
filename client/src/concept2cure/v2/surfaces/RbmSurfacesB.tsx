/**
 * RBM surfaces 6-10: Central monitoring (signals), Patient profiles,
 * Site risk, Site oversight, Monitoring plan.
 *
 * Every surface reads its slice from the live board
 * (GET /api/mdx-rbm/rbm-board/:programId) passed as `board`, and every action
 * performs the real write or compute call against /api/mdx/rbm-* before the
 * board is re-fetched:
 *
 *   Run central monitoring  → POST /rbm-central-monitoring/run
 *   Log / triage / dismiss / investigate a signal → POST|PATCH /rbm-signals
 *   Scan the patient cohort → POST /rbm-patient-profiles/score
 *   Recompute site risk     → POST /rbm-site-risk/recompute
 *   Schedule an oversight visit, add or advance an action
 *                           → POST|PATCH /rbm-monitoring-actions
 *   Generate the plan from the RACT → POST /rbm-monitoring-plans/generate
 *
 * Monitoring actions hang off a monitoring plan, so the controls that raise one
 * are disabled — with the reason shown — until the study has a plan.
 */
import React, { useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { I } from '../icons';
import { RBM_VOCAB, type RbmSignal } from '../fixtures/rbm-data';
import type { RbmBoard, RbmBoardSignal, RbmBoardSite, RbmBoardAction } from './rbmBoard';
import {
  RbmChip, RbmScore, RbmFreshness, DimBars,
  RbmFormModal, GovernedApprovalDialog, type FormField,
} from './RbmSurfaces';
import {
  useRbmMutation, useRbmOwners, ownerId, dueDate,
  rbmWrite, rbmWriteWithMeta, RbmWriteError, RbmWriteNote,
} from './rbmWrites';
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
const ACT_TYPE_LABEL: Record<string, string> = { issue: 'Issue', capa: 'CAPA', site_visit: 'Site visit', query: 'Query', escalation: 'Escalation' };
/* rbm_monitoring_actions.priority is low | medium | high. The UI used to offer
   "critical", which the API rejects — a critical-severity signal maps to the
   highest priority the store actually holds. */
const ACT_PRIORITIES = ['high', 'medium', 'low'];
const ACT_PRIORITY_LABEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** Map a signal severity onto the action priority enum the API accepts. */
function priorityForSeverity(severity: string): 'high' | 'medium' | 'low' {
  if (severity === 'critical' || severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
}

function signalView(s: RbmBoardSignal): RbmSignal {
  return {
    id: String(s.id), source: s.source, type: s.type, severity: s.severity,
    title: s.title, site: s.site, detail: s.detail, detected: s.detected ?? '',
    status: s.status, resolution: s.resolution ?? undefined,
  };
}

/** The banner shown wherever an action can be raised but no plan exists yet. */
function NoPlanNote({ onTab }: { onTab?: (id: string) => void }) {
  return (
    <div className="rbm-note">{I.info}Monitoring actions attach to a monitoring plan, and this study does not have one yet.{' '}
      <button className="rbm-linkbtn" onClick={() => onTab?.('plan')}>Generate the plan from the risk assessment</button>{' '}
      to raise actions from here.
    </div>
  );
}

/* 6 -- Signals */
export function RbmSignals({ board, onTab, onReload }: SubProps) {
  const signals = board.signals.map(signalView);
  const [filter, setFilter] = useState('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [invFor, setInvFor] = useState<RbmSignal | null>(null);
  const mut = useRbmMutation(onReload);
  const owners = useRbmOwners();
  const planId = board.plan?.id ?? null;

  const isOpen = (s: RbmSignal) => !['resolved', 'dismissed'].includes(s.status);
  const shown = signals
    .filter(s => filter === 'all' || (filter === 'open' ? isOpen(s) : s.status === filter))
    .sort((a, b) => (SEV_ORDER[a.severity] || 3) - (SEV_ORDER[b.severity] || 3));

  /** Re-run central statistical monitoring server-side and report what it
   *  actually found — the engine's own cohort size and flagged count. */
  const runCentralMonitoring = () => mut.run(async () => {
    const { meta } = await rbmWriteWithMeta<{ findings: unknown[]; signals: unknown[] }>(
      'POST', '/rbm-central-monitoring/run', { programId: board.programId },
    );
    const cohort = Number(meta.cohortSize ?? 0);
    const flagged = Number(meta.flagged ?? 0);
    return `Scanned ${cohort} site${cohort === 1 ? '' : 's'} — ${flagged} outlier signal${flagged === 1 ? '' : 's'} raised. Previously untriaged statistical signals were replaced; triaged ones were kept.`;
  });

  const setStatus = (id: string, status: string) =>
    mut.run(async () => { await rbmWrite('PATCH', `/rbm-signals/${id}`, { status }); });

  const logSignal = async (f: Record<string, string>) => {
    const done = await mut.run(async () => {
      await rbmWrite('POST', '/rbm-signals', {
        programId: board.programId,
        siteId: f.site || null,
        source: 'manual',
        signalType: 'manual',
        severity: f.severity,
        title: f.title,
        detail: f.detail || null,
      });
    });
    if (done) setLogging(false);
  };

  /**
   * Record the investigation. The disposition and the follow-up action it
   * commits to go through ONE transactional endpoint: as two calls, the signal
   * could commit as resolved and the action then fail, leaving a closed signal
   * without the follow-up it promised while the dialog reported the change as
   * unsaved. A monitoring decision and its action land together or not at all.
   */
  const saveInv = async (f: Record<string, string>) => {
    const sig = invFor!;
    const done = await mut.run(async () => {
      const notes = [f.rootCause ? `Root cause: ${f.rootCause}` : '', f.notes, f.evidence ? `Evidence: ${f.evidence}` : '']
        .filter(Boolean).join('\n');
      const raisesAction = f.action && f.action !== 'none' && planId != null;
      await rbmWrite('POST', `/rbm-signals/${sig.id}/investigate`, {
        status: f.status,
        resolutionNotes: notes || null,
        action: raisesAction ? {
          planId,
          actionType: f.action,
          description: `${sig.title} — ${f.notes || 'follow-up'}`,
          priority: priorityForSeverity(sig.severity),
          owner: ownerId(f.owner),
          dueDate: dueDate(f.due),
        } : null,
      });
    });
    if (done) setInvFor(null);
  };

  const escalate = (s: RbmSignal) => mut.run(async () => {
    await rbmWrite('POST', '/rbm-monitoring-actions', {
      planId,
      signalId: Number(s.id),
      actionType: 'escalation',
      description: `Escalate: ${s.title}`,
      priority: priorityForSeverity(s.severity),
    });
  });

  const invFields: FormField[] = [
    { key: 'owner', label: 'Assign the follow-up action to', type: 'select', options: owners.options, labels: owners.labels, optional: true },
    { key: 'rootCause', label: 'Root cause', type: 'textarea' },
    { key: 'action', label: 'Follow-up action', type: 'select', options: ['none', ...ACT_TYPES], labels: { none: 'No action', ...ACT_TYPE_LABEL } },
    { key: 'due', label: 'Action due date', type: 'date', optional: true },
    { key: 'notes', label: 'Action taken / resolution notes', type: 'textarea' },
    { key: 'evidence', label: 'Evidence (optional)', type: 'text', optional: true },
    { key: 'status', label: 'Set status', type: 'select', options: ['triaged', 'investigating', 'resolved', 'dismissed'], labels: { triaged: 'Triaged', investigating: 'Investigating', resolved: 'Resolved', dismissed: 'Dismissed' } },
  ];

  return (
    <div>
      <RbmWriteError error={mut.error} onDismiss={mut.clearError} />
      <RbmWriteNote note={mut.note} />
      <div className="rbm-bar">
        <div className="rbm-filters">{['open', 'new', 'investigating', 'resolved', 'all'].map(f => (
          <button key={f} className="rbm-filter" data-on={filter === f || undefined} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}</button>
        ))}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="rbm-btn" disabled={mut.busy} onClick={() => setLogging(true)}>{I.penLine}Log signal</button>
          <button className="rbm-btn pri" disabled={mut.busy} onClick={runCentralMonitoring}>{I.zap}{mut.busy ? 'Running…' : 'Run central monitoring'}</button>
        </div>
      </div>
      {planId == null && <NoPlanNote onTab={onTab} />}
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
              {s.resolution && <p className="rbm-sig-res">{I.check}{s.resolution}</p>}
              {isOpen(s) && (
                <div className="rbm-sig-acts">
                  {s.status === 'new' && <button className="rbm-btn" disabled={mut.busy} onClick={() => setStatus(s.id, 'triaged')}>Triage</button>}
                  <button className="rbm-btn pri" disabled={mut.busy} onClick={() => setInvFor(s)}>{I.penLine}Document investigation</button>
                  <button className="rbm-btn" disabled={mut.busy} onClick={() => setStatus(s.id, 'dismissed')}>Dismiss</button>
                  <button className="rbm-btn" disabled={mut.busy || planId == null}
                    title={planId == null ? 'This study has no monitoring plan for the action to attach to' : undefined}
                    onClick={() => escalate(s)}>Escalate to action {I.chevRight}</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
        {shown.length === 0 && <div className="rbm-inbox-empty">No {filter === 'all' ? '' : filter + ' '}signals. Central monitoring re-scans the site cohort server-side.</div>}
      </div>
      <div className="rbm-note">{I.info}Central statistical monitoring compares each site against the study cohort on its four risk dimensions (robust modified z-score, MIN_COHORT 5). It scans the site-risk snapshot — not the underlying clinical data — so it does not cover lab, adverse-event, visit-timing or data-entry patterns.</div>
      {logging && <RbmFormModal title="Log a manual signal"
        intro="Manual signals join the inbox alongside statistical, KRI- and QTL-derived signals. Severity drives triage order."
        fields={[{ key: 'title', label: 'Signal', type: 'textarea' }, { key: 'severity', label: 'Severity', type: 'select', options: ['critical', 'high', 'medium', 'low'], labels: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' } }, { key: 'site', label: 'Site (optional)', type: 'text', optional: true }, { key: 'detail', label: 'Detail', type: 'textarea' }]}
        busy={mut.busy} error={mut.error}
        submitLabel="Log signal" onCancel={() => { setLogging(false); mut.clearError(); }} onSubmit={logSignal} />}
      {invFor && <RbmFormModal title={`Investigate -- ${invFor.title}`}
        intro={`Document the signal follow-up. The status and notes are written to the signal; choosing a follow-up action creates a monitoring action linked to it.${planId == null ? ' This study has no monitoring plan, so no action can be created yet — the investigation notes will still be saved.' : ''}`}
        fields={invFields}
        initial={{ status: 'investigating', action: 'none' }}
        busy={mut.busy} error={mut.error}
        submitLabel="Save investigation" onCancel={() => { setInvFor(null); mut.clearError(); }} onSubmit={saveInv} />}
    </div>
  );
}

/* 7 -- Patients */
export function RbmPatients({ board, onReload }: SubProps) {
  const P = board.patients;
  const [open, setOpen] = useState<string>(() => P[0]?.sid ?? '');
  const mut = useRbmMutation(onReload);
  const sel = P.find(p => p.sid === open);
  const flagged = board.summary.patients.flagged, review = board.summary.patients.review;
  const scannedAt = P[0]?.at ?? null;

  /** Re-score the cohort server-side and report the engine's own counts. */
  const scanCohort = () => mut.run(async () => {
    const { meta } = await rbmWriteWithMeta<unknown[]>('POST', '/rbm-patient-profiles/score', { programId: board.programId });
    const size = Number(meta.cohortSize ?? 0);
    return `Scored ${size} subject${size === 1 ? '' : 's'} — ${Number(meta.flagged ?? 0)} flagged, ${Number(meta.review ?? 0)} for review.`;
  });

  return (
    <div>
      <RbmWriteError error={mut.error} onDismiss={mut.clearError} />
      <RbmWriteNote note={mut.note} />
      <div className="rbm-bar">
        <span className="rbm-bar-info">scorePatientCohort -- robust modified z-score -- MIN_COHORT 5 -- {board.summary.patients.scored} subjects -- {scannedAt ? `scored ${scannedAt}` : 'never scored'}</span>
        <button className="rbm-btn pri" disabled={mut.busy} onClick={scanCohort}>{I.zap}{mut.busy ? 'Scanning…' : 'Scan cohort'}</button>
      </div>
      <div className="rbm-pt-cols">
        <div className="rbm-card">
          <div className="rbm-card-h">Cohort -- ranked by anomaly score<span className="rbm-card-sub">{flagged} flagged -- {review} in review</span></div>
          <table className="rbm-tbl"><thead><tr><th>Subject</th><th>Site</th><th>Anomaly</th><th>Top dimension</th><th>Status</th></tr></thead>
            <tbody>{P.map(p => (
              <tr key={p.sid} data-on={open === p.sid || undefined} className="rowbtn" onClick={() => setOpen(p.sid)}>
                <td className="mono">{p.sid}</td><td className="mono">{p.site}</td>
                <td>{p.anomaly != null
                  ? <span className="rbm-z" data-hi={p.anomaly >= 3.5 ? 2 : p.anomaly >= 3 ? 1 : 0}>{p.anomaly.toFixed(1)}</span>
                  : <span className="mut">Not scored</span>}</td>
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
              {sel.metrics.length === 0 && <div className="rbm-note" style={{ margin: 0 }}>{I.info}No dimension was comparable for this subject: either the cohort was below MIN_COHORT (5) on every metric it carries, or the subject was last scored before the breakdown was recorded. <b>Scan cohort</b> recomputes it. An absent dimension means <b>not comparable</b> — not typical.</div>}
              <div className="rbm-pt-foot"><RbmFreshness at={sel.at ?? '—'} />{sel.status !== 'normal' && <span className="rbm-pt-note">{I.alertTriangle}{sel.status === 'flagged' ? 'Flagged for medical review' : 'Queued for review'} -- dimensions 3+ MAD from cohort median drive the score.</span>}</div>
            </div>
          </div>
        )}
      </div>
      <div className="rbm-note">{I.info}The bars are the accessible equivalent of a cohort scatter -- every dimension shows its signed z. Cohorts below MIN_COHORT (5) are not scored (no false anomalies on thin data). Scoring runs over the metrics already loaded into the profile store; it is not a full patient timeline of visits, dosing, adverse events and concomitant medication.</div>
    </div>
  );
}

/* 8 -- Sites */
export function RbmSites({ board, onReload }: SubProps) {
  const sites = board.sites;
  const mut = useRbmMutation(onReload);
  const at = sites[0]?.at ?? null;

  const recompute = () => mut.run(async () => {
    const { meta } = await rbmWriteWithMeta<unknown[]>('POST', '/rbm-site-risk/recompute', { programId: board.programId });
    const n = Number(meta.count ?? 0);
    return `Rescored ${n} site${n === 1 ? '' : 's'} from Site Intelligence.`;
  });

  return (
    <div>
      <RbmWriteError error={mut.error} onDismiss={mut.clearError} />
      <RbmWriteNote note={mut.note} />
      <div className="rbm-bar">
        <span className="rbm-bar-info">site-risk-engine -- composite from Site Intelligence -- {at ? `scored ${at}` : 'never scored'}</span>
        <button className="rbm-btn pri" disabled={mut.busy} onClick={recompute}>{I.zap}{mut.busy ? 'Recomputing…' : 'Recompute site risk'}</button>
      </div>
      <div className="rbm-card">
        <table className="rbm-tbl"><thead><tr><th>Site</th><th>Composite</th><th style={{ width: 230 }}>Dimensions (of 25)</th><th>Tier</th><th>Drivers -- why this tier</th></tr></thead>
          <tbody>{sites.map(s => (
            <tr key={s.n}>
              <td><b className="mono">{s.n}</b> {s.name}</td>
              <td>{s.composite != null
                ? <><RbmScore v={Math.round(s.composite)} /> <span className="mono mut">{s.composite}</span></>
                : <span className="mut">Not scored</span>}</td>
              <td><DimBars enr={s.enr ?? 0} qual={s.qual ?? 0} ops={s.ops ?? 0} /></td>
              <td><RbmChip vocab="tier" value={s.tier} /></td>
              <td className="mit"><div className="rbm-drivers">{s.drivers.map((d, i) => <span key={i} className="rbm-driver">{d}</span>)}</div></td>
            </tr>
          ))}
          {sites.length === 0 && <tr><td colSpan={5} className="rbm-col-empty">No site risk scored for this study yet.</td></tr>}
          </tbody></table>
      </div>
      <div className="rbm-note">{I.info}All {sites.length} scored site{sites.length === 1 ? '' : 's'} shown, ranked by composite risk. Tier assignment is monitoringTierFromRisk() on the composite; the enhanced tier drives the monitoring-plan visit cadence. Recomputing replaces the current snapshot — per-run history is not retained, so trend over time is not available.</div>
    </div>
  );
}

/* 9 -- Oversight */
export function RbmOversight({ board, onTab, onReload }: SubProps) {
  const C = board.oversight;
  const sites = board.sites;
  const [schedFor, setSchedFor] = useState<RbmBoardSite | null>(null);
  const mut = useRbmMutation(onReload);
  const owners = useRbmOwners();
  const planId = board.plan?.id ?? null;

  /* An oversight visit already scheduled for a site is a real site_visit action
     on the plan, not a page-local flag — so it survives a reload and shows up
     on the plan board. Scoped to the plan on screen: an action carried over
     from a superseded plan version is not this plan's commitment. */
  const visitFor = (siteNumber: string | null) => board.actions.find(
    a => a.planId === planId && a.type === 'site_visit' && a.status !== 'done'
      && !!siteNumber && a.title.includes(`site ${siteNumber}`),
  ) ?? null;

  const scheduleVisit = async (f: Record<string, string>) => {
    const site = schedFor!;
    const done = await mut.run(async () => {
      await rbmWrite('POST', '/rbm-monitoring-actions', {
        planId,
        actionType: 'site_visit',
        description: `${f.type === 'remote' ? 'Remote' : 'On-site'} oversight visit -- site ${site.n} (${f.focus})`,
        priority: site.tier === 'enhanced' ? 'high' : 'medium',
        owner: ownerId(f.monitor),
        dueDate: dueDate(f.when),
      });
    });
    if (done) setSchedFor(null);
  };

  return (
    <div>
      <RbmWriteError error={mut.error} onDismiss={mut.clearError} />
      {planId == null && <NoPlanNote onTab={onTab} />}
      <div className="rbm-card">
        <div className="rbm-card-h">Where do I send a monitor<span className="rbm-card-sub">SPOT -- site risk joined with open-signal load</span></div>
        <table className="rbm-tbl"><thead><tr><th>Site</th><th>Composite</th><th>Tier</th><th>Open signals</th><th>High severity</th><th>Oversight action</th></tr></thead>
          <tbody>{sites.map(s => {
            const c = C[s.n ?? ''] || { open: 0, high: 0 };
            const v = visitFor(s.n);
            return (
              <tr key={s.n}>
                <td><b className="mono">{s.n}</b> {s.name}</td>
                <td>{s.composite != null ? <RbmScore v={Math.round(s.composite)} /> : <span className="mut">—</span>}</td>
                <td><RbmChip vocab="tier" value={s.tier} /></td>
                <td>{c.open > 0 ? <button className="rbm-linknum" onClick={() => onTab?.('signals')}>{c.open} open {I.chevRight}</button> : <span className="mut">0</span>}</td>
                <td>{c.high > 0 ? <button className="rbm-linknum hi" onClick={() => onTab?.('signals')}>{c.high} high {I.chevRight}</button> : <span className="mut">0</span>}</td>
                <td>{v ? <span className="rbm-visit-set">{I.check}Scheduled -- due {v.due} -- {v.owner}</span>
                  : <button className="rbm-linkbtn" disabled={mut.busy || planId == null}
                      title={planId == null ? 'This study has no monitoring plan for the visit to attach to' : undefined}
                      onClick={() => setSchedFor(s)}>{I.clock}Schedule visit</button>}</td>
              </tr>
            );
          })}
          {sites.length === 0 && <tr><td colSpan={6} className="rbm-col-empty">No sites to oversee for this study yet.</td></tr>}
          </tbody></table>
      </div>
      <div className="rbm-note">{I.info}SPOT turns risk + signal load into a monitoring assignment: scheduling a visit creates a site_visit action on the monitoring plan. Enhanced-tier sites should carry an on-site visit; reduced-tier sites are remote/central by default. The visit is a tracked action — the monitoring report, findings, follow-up letter and targeted SDV/SDR scope are not modelled yet.</div>
      {schedFor && <RbmFormModal title={`Schedule oversight visit -- site ${schedFor.n}`}
        intro={`${schedFor.name} -- composite ${schedFor.composite ?? '—'} -- ${schedFor.tier} tier. The visit is created as a site_visit action on the monitoring plan.`}
        fields={[
          { key: 'type', label: 'Visit type', type: 'select', options: ['on_site', 'remote'], labels: { on_site: 'On-site', remote: 'Remote / central' } },
          { key: 'when', label: 'Target date', type: 'date' },
          { key: 'focus', label: 'Focus (what to review)', type: 'textarea' },
          { key: 'monitor', label: 'Assigned monitor (CRA)', type: 'select', options: owners.options, labels: owners.labels, optional: true },
        ]}
        initial={{ type: schedFor.tier === 'enhanced' ? 'on_site' : 'remote' }}
        busy={mut.busy} error={mut.error}
        submitLabel="Schedule visit"
        onCancel={() => { setSchedFor(null); mut.clearError(); }} onSubmit={scheduleVisit} />}
    </div>
  );
}

/* 10 -- Plan */
export function RbmPlan({ board, onReload }: SubProps) {
  const plan = board.plan;
  // board.actions spans every plan version in the program. This surface shows
  // one plan, so it must show — and mutate — only that plan's actions;
  // otherwise Start/Complete would PATCH an action belonging to a superseded
  // plan while appearing to act on the one on screen.
  const acts: RbmBoardAction[] = plan ? board.actions.filter(a => a.planId === plan.id) : [];
  const [signFor, setSignFor] = useState(false);
  const [adding, setAdding] = useState(false);
  const [amending, setAmending] = useState(false);
  const mut = useRbmMutation(onReload);
  const owners = useRbmOwners();
  const cols: [string, string][] = [['open', 'Open'], ['in_progress', 'In progress'], ['done', 'Done']];
  const history = plan?.history ?? [];
  // An approved plan is read-only: the signature attests to this strategy and
  // this set of actions. Revising it opens a new version.
  const locked = plan?.status === 'active';

  /** Open a versioned amendment. The signed version stays exactly as signed;
   *  the new draft carries the unfinished actions forward. */
  const amend = async (f: Record<string, string>) => {
    const done = await mut.run(async () => {
      const { meta } = await rbmWriteWithMeta<{ id: number }>(
        'POST', `/rbm-monitoring-plans/${plan!.id}/amend`, { reason: f.reason },
      );
      const n = Number(meta.actionsCopied ?? 0);
      return `Amendment opened as a new draft version — v${meta.supersedes} stays on file with its signature. `
        + `${n} unfinished action${n === 1 ? '' : 's'} copied forward, each reopened under the new version.`;
    });
    if (done) setAmending(false);
  };

  const advance = (id: number, cur: string) => mut.run(async () => {
    await rbmWrite('PATCH', `/rbm-monitoring-actions/${id}`, { status: cur === 'open' ? 'in_progress' : 'done' });
  });

  const addAction = async (f: Record<string, string>) => {
    const done = await mut.run(async () => {
      await rbmWrite('POST', '/rbm-monitoring-actions', {
        planId: plan!.id,
        actionType: f.type,
        description: f.title,
        priority: f.priority,
        owner: ownerId(f.owner),
        dueDate: dueDate(f.due),
      });
    });
    if (done) setAdding(false);
  };

  /** Derive the plan from the governing RACT, server-side. */
  const generatePlan = () => mut.run(async () => {
    const { meta } = await rbmWriteWithMeta<{ id: number }>('POST', '/rbm-monitoring-plans/generate', { programId: board.programId });
    const crit = Number(meta.criticalFactors ?? 0);
    const enh = Number(meta.enhancedSites ?? 0);
    return `Draft plan created from the risk assessment — ${crit} action${crit === 1 ? '' : 's'} from open critical CtQ factors and ${enh} enhanced-tier site visit${enh === 1 ? '' : 's'}. Approve it to make it the active monitoring commitment.`;
  });

  return (
    <div>
      <RbmWriteError error={mut.error} onDismiss={mut.clearError} />
      <RbmWriteNote note={mut.note} />
      {plan ? (
        <div className="rbm-asmt">
          <div className="rbm-asmt-l">
            <b>{plan.title}</b>
            <span>Version {plan.version} -- strategy <RbmChip vocab="strategy" value={plan.strategy} /> -- {plan.status === 'active' ? 'active' : 'draft -- approval pending'} -- updated {plan.updated ?? '—'}</span>
            {plan.approval ? <span className="rbm-audit">{I.check}Approved by {plan.approval.by} -- {plan.approval.when} -- &quot;{plan.approval.reason}&quot;</span> : null}
          </div>
          {history.length > 1 && (
            <div className="rbm-asmt-hist">
              {history.map(h => (
                <span key={h.id} className="rbm-hist-row" data-cur={h.id === plan.id || undefined}>
                  v{h.v} — {h.status}
                  {h.when ? ` — approved ${h.when}${h.by ? ` by ${h.by}` : ''}` : ''}
                  {h.reason ? ` — "${h.reason}"` : h.amendmentReason ? ` — opened: "${h.amendmentReason}"` : ''}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end' }}>
            {plan.status !== 'active' && <button className="rbm-btn pri" disabled={mut.busy} onClick={() => setSignFor(true)}>{I.lock}Approve plan</button>}
            {/* An active plan is frozen, but monitoring plans genuinely change
                mid-study — that is the premise of adaptive monitoring. Amending
                opens a new draft version, so the signed one stays as signed. */}
            {locked && <button className="rbm-btn" disabled={mut.busy} onClick={() => setAmending(true)}>{I.penLine}Amend — new version</button>}
          </div>
        </div>
      ) : (
        <div className="rbm-asmt">
          <div className="rbm-asmt-l">
            <b>No monitoring plan for this study yet</b>
            <span>A plan is derived from the governing risk assessment: its strategy follows the overall risk band, and its opening actions come from the open critical CtQ factors and the enhanced-tier sites.</span>
          </div>
          <button className="rbm-btn pri" disabled={mut.busy} onClick={generatePlan}>{I.sparkles}{mut.busy ? 'Generating…' : 'Generate from RACT'}</button>
        </div>
      )}
      <div className="rbm-bar" style={{ marginBottom: 11 }}>
        <span className="rbm-bar-info">{acts.length} actions -- {acts.filter(a => a.overdue).length} overdue -- escalations, investigations and scheduled visits land here</span>
        <button className="rbm-btn" disabled={mut.busy || !plan} title={!plan ? 'Generate a monitoring plan first' : undefined} onClick={() => setAdding(true)}>{I.zap}Add action</button>
      </div>
      <div className="rbm-board">{cols.map(([st, label]) => (
        <div key={st} className="rbm-col">
          <div className="rbm-col-h">{label} -- {acts.filter(a => a.status === st).length}</div>
          {acts.filter(a => a.status === st).map(a => (
            <div key={a.id} className="rbm-act" data-overdue={a.overdue || undefined}>
              <div className="rbm-act-top"><span className="rbm-act-type">{RBM_VOCAB.atype[a.type]?.l ?? a.type}</span><RbmChip vocab="severity" value={a.priority} /></div>
              <div className="rbm-act-t">{a.title}</div>
              <div className="rbm-act-m">{a.owner} -- due {a.due}{a.origin && a.origin !== 'plan' && <span className="rbm-act-origin">from {a.origin}</span>}{a.overdue && <b className="rbm-overdue">overdue</b>}</div>
              {st !== 'done' && <button className="rbm-act-adv" disabled={mut.busy} onClick={() => advance(a.id, a.status)}>{st === 'open' ? 'Start' : 'Complete'} {I.chevRight}</button>}
            </div>
          ))}
          {acts.filter(a => a.status === st).length === 0 && <div className="rbm-col-empty">None</div>}
        </div>
      ))}</div>
      {locked && (
        <div className="rbm-note">{I.lock}This plan is <b>approved</b>, so its title and strategy are fixed under the signature above — the server refuses an edit to them. Executing the plan is not editing it: actions can still be started, completed and added, because responding to a signal is what an active plan is for. To change what the plan <b>commits to</b>, use <b>Amend</b> — that opens the next version as a draft carrying the unfinished actions forward, leaving v{plan?.version} and its signature intact. The amendment directs nothing until it is approved in its own right.</div>
      )}
      <div className="rbm-note">{I.info}The plan record carries the strategy, its governing assessment and its actions. The full monitoring plan content — monitoring methods per critical process, review frequency, targeted SDV/SDR rules and escalation thresholds — is not modelled yet, and completed actions do not yet carry evidence or an effectiveness check.</div>
      {adding && plan && <RbmFormModal title="Add monitoring action"
        intro="Actions track the response to risks and signals. Overdue actions feed the attention queue."
        fields={[
          { key: 'type', label: 'Type', type: 'select', options: ACT_TYPES, labels: ACT_TYPE_LABEL },
          { key: 'title', label: 'Description', type: 'textarea' },
          { key: 'priority', label: 'Priority', type: 'select', options: ACT_PRIORITIES, labels: ACT_PRIORITY_LABEL },
          { key: 'owner', label: 'Owner', type: 'select', options: owners.options, labels: owners.labels, optional: true },
          { key: 'due', label: 'Due date', type: 'date', optional: true },
        ]}
        busy={mut.busy} error={mut.error}
        submitLabel="Add action" onCancel={() => { setAdding(false); mut.clearError(); }} onSubmit={addAction} />}
      {amending && plan && <RbmFormModal title={`Amend monitoring plan v${plan.version}`}
        intro={`This opens v${plan.version + 1} as a draft carrying this plan's unfinished actions, each reopened under the new version. v${plan.version} and its signature stay on file as the record of what was being done. Actions already completed stay with the version they were completed under.`}
        fields={[{ key: 'reason', label: 'Why is the monitoring plan being amended?', type: 'textarea' }]}
        busy={mut.busy} error={mut.error}
        submitLabel="Open amendment" onCancel={() => { setAmending(false); mut.clearError(); }} onSubmit={amend} />}
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
