import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import { useLiveRows, useLiveData, EmptyState } from '../dataConnect';
import { ppFmtTime, ppFmtDate, ppDaysUntil } from '../fixtures/pathway-panes-data';

/* ═══════════════════════════════════════════════════════════════════════
   BioPathwayPanes — Audit trail · Correspondence · Approvals sub-tabs.

   REAL-DATA STANDARD. Every pane renders REAL persisted org data, an honest
   EMPTY state, or an honest ERROR state — never a fabricated fixture. The three
   slices are anchored to their real backends:

     • Audit         GET /api/audit-trail/ledger        (audit_events, hash-chained)
     • Correspondence GET /api/regulatory-correspondence/correspondence (c2c_correspondence)
     • Approvals     GET /api/approval-workflows/pending (workflow_approvals, mine)

   Display types below are aligned to each backend's ACTUAL columns. Fields the
   fixture invented but the backend does not return — audit role/diff/file/body/
   target_id; correspondence refs/triage/ai; approval stage/signer/role/meaning/
   signed_at and any "Signed" history — are intentionally ABSENT. Nothing is
   fabricated; nullable columns are `| null` and rendered null-safe.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Display types (aligned to real backend columns) ── */

/**
 * GET /api/audit-trail/ledger row (AuditLedgerEntry — server
 * audit-trail-ledger.routes.ts). A presentation projection of the org-scoped,
 * append-only, hash-chained `audit_events` table. `hash` / `prevHash` are the
 * real stored SHA-256 chain (genesis row → prevHash 'genesis'); `sig` is a
 * genuine §11.50 signed status; `event`, `target`, `kind` are documented
 * derivations of real columns. `ip` may be '' and reason/meaning may be null.
 */
interface AuditEvent {
  id: string;
  when: string; // 'YYYY-MM-DD HH24:MI'
  actor: string;
  event: string;
  target: string;
  kind: string; // esign | submission | validation | review | vault | authoring | admin
  sig: boolean;
  hash: string;
  prevHash: string;
  ip: string;
  reason: string | null;
  meaning: string | null;
}

/** Raw GET /api/regulatory-correspondence/correspondence row (c2c_correspondence,
 *  SELECT *). Columns are snake_case and mostly nullable; adapted to the display
 *  shape below. */
interface RawCorrespondence {
  id: string | number;
  communication_type?: string | null;
  direction?: string | null;
  source_channel?: string | null;
  sender?: string | null;
  received_at?: string | null;
  created_at?: string | null;
  due_date?: string | null;
  status?: string | null;
  subject?: string | null;
  summary?: string | null;
}

/** Correspondence display shape — real columns only. */
interface CorrespondenceItem {
  id: string;
  kind: string;
  channel: string;
  from: string;
  received: string;
  due: string | null;
  status: string; // normalized bucket: open | in_review | closed
  subject: string;
  summary: string; // real `summary` column; '' when the parser stored none
}

/** Raw GET /api/approval-workflows/pending row (PendingApproval —
 *  ApprovalOrchestrator.getPendingApprovals). Every row is pending and already
 *  scoped to the current user + org server-side. */
interface RawApproval {
  approvalId: number | string;
  documentId?: number | string | null;
  documentTitle?: string | null;
  stepName?: string | null;
  stepDescription?: string | null;
  requestedByName?: string | null;
  workflowStartedAt?: string | null;
  dueDate?: string | null;
}

/** Approval display shape — real columns only. No stage/signer/role/meaning/
 *  signed_at: the backend does not return them, so they are not shown. */
interface ApprovalItem {
  id: string;
  target: string; // documentTitle
  step: string; // stepName
  stepDescription: string;
  requested: string; // workflowStartedAt
  requested_by: string; // requestedByName ('' when unresolved)
  due: string | null; // dueDate
}

/* ── Canonical config / adapters (derivations of real columns, not fabrication) ── */

const CORR_LABEL = 'HAQ / IR';

/* Display label + tone for the REAL audit-ledger kind taxonomy (server
   deriveKind). Presentation mapping of a real column — reuses the existing
   tone-* vocabulary; unknown kinds fall through to the raw label, neutral. */
const AUDIT_KIND_LABEL: Record<string, { label: string; tone: string }> = {
  esign: { label: 'E-sign', tone: 'accent' },
  submission: { label: 'Submission', tone: 'success' },
  validation: { label: 'Validation', tone: 'neutral' },
  review: { label: 'Review', tone: 'warn' },
  vault: { label: 'Vault', tone: 'neutral' },
  authoring: { label: 'Authoring', tone: 'neutral' },
  admin: { label: 'Admin', tone: 'neutral' },
};

function auditKindMeta(kind: string): { label: string; tone: string } {
  return AUDIT_KIND_LABEL[kind] || { label: kind, tone: 'neutral' };
}

/** Bucket the real `status` column into the pane's three display states. */
function normCorrStatus(s: string | null | undefined): string {
  const v = (s || '').toLowerCase();
  if (['closed', 'resolved', 'complete', 'completed', 'done'].includes(v)) return 'closed';
  if (['in_review', 'in-review', 'reviewing', 'review', 'pending_review'].includes(v)) return 'in_review';
  return 'open';
}

/** Date-only (YYYY-MM-DD) slice so ppDaysUntil (which appends 'T00:00:00Z')
 *  works on a full ISO timestamp; null passes through. */
function dateOnly(v: string | null | undefined): string | null {
  return v ? String(v).slice(0, 10) : null;
}

function adaptCorr(r: RawCorrespondence): CorrespondenceItem {
  return {
    id: String(r.id),
    kind: r.communication_type || r.direction || 'Correspondence',
    channel: r.source_channel || '—',
    from: r.sender || '—',
    received: r.received_at || r.created_at || '',
    due: dateOnly(r.due_date),
    status: normCorrStatus(r.status),
    subject: r.subject || '(no subject)',
    summary: r.summary || '',
  };
}

function adaptApproval(r: RawApproval): ApprovalItem {
  return {
    id: String(r.approvalId),
    target: r.documentTitle || 'Untitled document',
    step: r.stepName || 'Approval step',
    stepDescription: r.stepDescription || r.stepName || '',
    requested: r.workflowStartedAt || '',
    requested_by: r.requestedByName || '',
    due: dateOnly(r.dueDate),
  };
}

/* ── Honest loading / error / empty guard (mirrors Nonclinical's SummaryBody). ── */

interface PaneGuardProps {
  loading: boolean;
  error: boolean;
  empty: boolean;
  loadingLabel: string;
  errorTitle: string;
  errorHint: string;
  emptyTitle: string;
  emptyHint: string;
  children: React.ReactNode;
}

function PaneGuard({ loading, error, empty, loadingLabel, errorTitle, errorHint, emptyTitle, emptyHint, children }: PaneGuardProps) {
  if (loading) return <div className="scaf-note" style={{ padding: '18px 10px' }}>{loadingLabel}</div>;
  if (error) return <EmptyState tone="error" icon={I.alertTriangle} title={errorTitle} hint={errorHint} />;
  if (empty) return <EmptyState icon={I.fileText} title={emptyTitle} hint={emptyHint} />;
  return <>{children}</>;
}

/* ── PathwayTabBar ── */

interface TabDef {
  id: string;
  label: string;
  sub: string;
  count?: number;
  badge?: boolean;
}

interface TabCounts {
  audit: number;
  correspondence: number;
  corrOpen: number;
  approvals: number;
  apPending: number;
}

interface PathwayTabBarProps {
  tab: string;
  setTab: (id: string) => void;
  corrLabel: string;
  counts: TabCounts;
  workspaceSub?: string;
}

export function PathwayTabBar({ tab, setTab, corrLabel, counts, workspaceSub }: PathwayTabBarProps) {
  const tabs: TabDef[] = [
    { id: 'workspace',      label: 'Workspace',   sub: workspaceSub || 'Filing cockpit' },
    { id: 'correspondence', label: corrLabel || 'Correspondence', sub: 'Agency queries', count: counts.correspondence, badge: counts.corrOpen > 0 },
    { id: 'audit',          label: 'Audit trail', sub: '21 CFR Part 11', count: counts.audit },
    { id: 'approvals',      label: 'Approvals',   sub: 'Pending e-sign', count: counts.approvals, badge: counts.apPending > 0 },
  ];
  return (
    <div className="pwt-bar" role="tablist" aria-label="Pathway sub-tabs">
      {tabs.map(t => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} className={`pwt-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
          <span className="pwt-label">{t.label}{typeof t.count === 'number' && <span className={`pwt-count ${t.badge ? 'badge' : ''}`}>{t.count}</span>}</span>
          <span className="pwt-sub">{t.sub}</span>
        </button>
      ))}
    </div>
  );
}

/* ── BioAuditDetail ── */

interface AuditDetailProps {
  e: AuditEvent;
}

export function BioAuditDetail({ e }: AuditDetailProps) {
  const meta = auditKindMeta(e.kind);
  return (
    <div className="audit-det">
      <div className="audit-det-hdr"><span className={`audit-chip tone-${meta.tone}`}>{meta.label}</span><span className="audit-det-id">{e.id}</span></div>
      <div className="audit-det-target">{e.target}</div>
      <dl className="audit-det-grid">
        <dt>Event</dt><dd>{e.event}</dd>
        <dt>When</dt><dd>{ppFmtTime(e.when, { full: true })}</dd>
        <dt>Actor</dt><dd>{e.actor}</dd>
        <dt>IP</dt><dd className="mono">{e.ip || '—'}</dd>
        {e.reason && <><dt>Reason</dt><dd>{e.reason}</dd></>}
        {e.sig && <><dt>Signature</dt><dd className="mono"><span className="aud-sig">Signed</span> · 21 CFR Part 11{e.meaning ? ` · ${e.meaning}` : ''}</dd></>}
      </dl>
      <div className="audit-det-chain">
        <div className="audit-chain-label">{I.link || I.gitBranch} Hash chain</div>
        <div className="audit-chain-row"><span className="audit-chain-k">prev</span><span className="mono audit-chain-v">{e.prevHash}</span></div>
        <div className="audit-chain-row"><span className="audit-chain-k">this</span><span className="mono audit-chain-v">{e.hash}</span></div>
      </div>
    </div>
  );
}

/* ── BioAuditTrailPane ── */

interface AuditKindFilter {
  id: string;
  label: string;
}

interface AuditTrailPaneProps {
  events: AuditEvent[];
}

export function BioAuditTrailPane({ events }: AuditTrailPaneProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(events[0]?.id);
  const [filterKind, setFilterKind] = useState('all');

  // Filter ids match the REAL ledger kind taxonomy (server deriveKind), so each
  // chip actually filters instead of matching nothing.
  const KINDS: AuditKindFilter[] = [
    { id: 'all', label: 'All' }, { id: 'esign', label: 'E-sign' }, { id: 'review', label: 'Review' },
    { id: 'authoring', label: 'Authoring' }, { id: 'submission', label: 'Submission' },
    { id: 'vault', label: 'Vault' }, { id: 'validation', label: 'Validation' }, { id: 'admin', label: 'Admin' },
  ];

  const filtered = useMemo(
    () => (filterKind === 'all' ? events : events.filter(e => e.kind === filterKind)),
    [events, filterKind],
  );

  const selected = events.find(e => e.id === selectedId) || filtered[0];

  const groups = useMemo(() => {
    const out: { day: string; items: AuditEvent[] }[] = [];
    let curDay: string | null = null;
    let curList: { day: string; items: AuditEvent[] } | null = null;
    for (const e of filtered) {
      const key = new Date(e.when).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      if (key !== curDay) { curDay = key; curList = { day: key, items: [] }; out.push(curList); }
      curList!.items.push(e);
    }
    return out;
  }, [filtered]);

  return (
    <div className="audit-pane">
      <div className="audit-bar">
        <div className="audit-bar-l">
          <span className="audit-integrity" title="Each row is hash-chained to its predecessor (SHA-256). Tampering with any prior event invalidates the chain.">
            {I.shieldCheck} Tamper-evident · SHA-256 · {events.length} events
          </span>
        </div>
        <div className="audit-bar-r">
          <div className="audit-filters">
            {KINDS.map(k => <button key={k.id} className={`audit-filter ${filterKind === k.id ? 'active' : ''}`} onClick={() => setFilterKind(k.id)}>{k.label}</button>)}
          </div>
          {/* MOCK ACTION (flagged): no handler — a real signed export exists at
              GET /api/audit/export/signed but is not wired here (DATA-pass scope). */}
          <button className="audit-export" title="Signed audit export is not yet wired to /api/audit/export/signed">{I.download} Signed export</button>
        </div>
      </div>
      <div className="audit-grid">
        <div className="audit-list">
          {groups.map(g => (
            <div key={g.day} className="audit-group">
              <div className="audit-day">{g.day}</div>
              {g.items.map(e => {
                const meta = auditKindMeta(e.kind);
                return (
                  <button key={e.id} className={`audit-row ${selectedId === e.id ? 'sel' : ''}`} onClick={() => setSelectedId(e.id)}>
                    <span className="audit-time">{new Date(e.when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                    <span className={`audit-chip tone-${meta.tone}`}>{meta.label}</span>
                    <span className="audit-actor"><span className="aa-name">{e.actor}</span><span className="aa-target">{e.target}</span></span>
                    {e.sig && <span className="audit-signed" title="Signed · 21 CFR Part 11">{I.lock}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && <div className="audit-empty">No events match this filter.</div>}
        </div>
        <div className="audit-detail">
          {selected ? <BioAuditDetail e={selected}/> : <div className="audit-empty">Select an event.</div>}
        </div>
      </div>
    </div>
  );
}

/* ── BioCorrDetail ── */

interface CorrDetailProps {
  c: CorrespondenceItem;
  onAskAna?: (q: string) => void;
}

function BioCorrDetail({ c, onAskAna }: CorrDetailProps) {
  const days = ppDaysUntil(c.due);
  const overdue = days !== null && days < 0;
  return (
    <div className="corr-det">
      <div className="corr-det-hdr"><span className={`corr-kind k-${c.kind.toLowerCase().replace(/\s|&|·|\//g, '-')}`}>{c.kind}</span><span className={`corr-status s-${c.status}`}>{c.status === 'in_review' ? 'In review' : c.status}</span></div>
      <h3 className="corr-det-subj">{c.subject}</h3>
      <div className="corr-det-meta"><span>{c.from}</span><span>·</span><span>{c.channel}</span><span>·</span><span>Received {ppFmtTime(c.received, { full: true })}</span></div>
      {c.due && <div className={`corr-due-banner ${overdue ? 'err' : days !== null && days <= 3 ? 'warn' : ''}`}>{I.clock} Response due {ppFmtDate(c.due)} {days !== null && <span>({overdue ? `${-days} days late` : `${days} days`})</span>}</div>}
      {c.summary && <div className="corr-det-body">{c.summary}</div>}
      <div className="audit-det-actions">
        <button className="audit-act primary" onClick={() => onAskAna && onAskAna(`Draft response to ${c.kind}: ${c.subject}`)}>{I.sparkles} Draft response with AnA</button>
        {/* MOCK ACTIONS (flagged): Assign / Mark closed have no handler. A real
            review route exists (PATCH /api/regulatory-correspondence/issues/:id/review);
            left un-wired for the actions pass rather than faking a state change. */}
        <button className="audit-act">{I.userPlus || I.plus} Assign</button>
        <button className="audit-act">{I.check} Mark closed</button>
      </div>
    </div>
  );
}

/* ── BioCorrespondencePane ── */

interface CorrespondencePaneProps {
  items: CorrespondenceItem[];
  onAskAna?: (q: string) => void;
}

export function BioCorrespondencePane({ items, onAskAna }: CorrespondencePaneProps) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | undefined>(items[0]?.id);
  const filtered = useMemo(() => statusFilter === 'all' ? items : items.filter(i => i.status === statusFilter), [items, statusFilter]);
  const selected = items.find(i => i.id === selectedId) || filtered[0];
  const counts = { open: items.filter(i => i.status === 'open').length, review: items.filter(i => i.status === 'in_review').length, closed: items.filter(i => i.status === 'closed').length };
  return (
    <div className="corr-pane">
      <div className="corr-bar">
        <div className="corr-bar-l">
          <span className="corr-stat"><span className="cs-num err">{counts.open}</span> open<span className="cs-sep">·</span><span className="cs-num warn">{counts.review}</span> in review<span className="cs-sep">·</span><span className="cs-num">{counts.closed}</span> closed</span>
        </div>
        <div className="corr-bar-r">
          {[{ id: 'all', label: 'All' }, { id: 'open', label: 'Open' }, { id: 'in_review', label: 'In review' }, { id: 'closed', label: 'Closed' }].map(s => (
            <button key={s.id} className={`audit-filter ${statusFilter === s.id ? 'active' : ''}`} onClick={() => setStatusFilter(s.id)}>{s.label}</button>
          ))}
        </div>
      </div>
      <div className="corr-grid">
        <div className="corr-list">
          {filtered.map(c => {
            const days = ppDaysUntil(c.due);
            const overdue = days !== null && days < 0;
            return (
              <button key={c.id} className={`corr-row ${selectedId === c.id ? 'sel' : ''}`} onClick={() => setSelectedId(c.id)}>
                <div className="corr-row-top">
                  <span className={`corr-kind k-${c.kind.toLowerCase().replace(/\s|&|·|\//g, '-')}`}>{c.kind}</span>
                  <span className="corr-spacer"/>
                  <span className={`corr-status s-${c.status}`}>{c.status === 'in_review' ? 'In review' : c.status}</span>
                </div>
                <div className="corr-subj">{c.subject}</div>
                <div className="corr-row-bot">
                  <span>{c.from}</span><span>·</span><span>{ppFmtTime(c.received)}</span>
                  {c.due && <><span>·</span><span className={`corr-due ${overdue ? 'err' : days !== null && days <= 3 ? 'warn' : ''}`}>Due {ppFmtDate(c.due)}{days !== null && (overdue ? ` · ${-days}d late` : ` · ${days}d`)}</span></>}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="audit-empty">No items.</div>}
        </div>
        <div className="corr-detail">{selected && <BioCorrDetail c={selected} onAskAna={onAskAna}/>}</div>
      </div>
    </div>
  );
}

/* ── BioApprovalCard ── */

interface ApprovalCardProps {
  a: ApprovalItem;
}

function BioApprovalCard({ a }: ApprovalCardProps) {
  const [signing, setSigning] = useState(false);
  const [pwd, setPwd] = useState('');
  const [meaning, setMeaning] = useState('');
  const [signed, setSigned] = useState(false);
  const days = a.due ? ppDaysUntil(a.due) : null;
  const overdue = days !== null && days < 0;

  // MOCK ACTION (flagged): "Apply signature" only flips local state — it does NOT
  // call POST /api/approval-workflows/:id/approve or /api/esignature/sign, so no
  // signature and no audit record are created. All user-visible §11 copy below is
  // softened to say so; real wiring is deferred to the actions pass (no half-wire).
  if (signed) return (
    <div className="ap-card signed">
      <div className="ap-card-hdr"><span className="ap-stage-pill" data-stage="review">{a.step}</span><span className="audit-signed">{I.lock} Preview only — not signed</span></div>
      <div className="ap-card-target">{a.target}</div>
      <div className="ap-card-meta">Draft acknowledgement: &ldquo;{meaning}&rdquo; · not submitted to the audit trail</div>
    </div>
  );

  return (
    <div className="ap-card mine">
      <div className="ap-card-hdr">
        <span className="ap-stage-pill" data-stage="review">{a.step}</span><span className="ap-card-due-spacer"/>
        {a.due && <span className={`ap-card-due ${overdue ? 'err' : days !== null && days <= 2 ? 'warn' : ''}`}>Due {ppFmtDate(a.due)}{days !== null && (overdue ? ` · ${-days}d late` : ` · ${days}d`)}</span>}
      </div>
      <div className="ap-card-target">{a.target}</div>
      <div className="ap-card-meta">Requested by {a.requested_by || '—'}{a.requested ? <> · {ppFmtTime(a.requested)}</> : null}{a.stepDescription ? <> · {a.stepDescription}</> : null}</div>
      {!signing && (
        <div className="ap-card-actions">
          <button className="ap-sign-btn" onClick={() => setSigning(true)}>{I.lock} E-sign</button>
          <button className="ap-decline-btn">Decline</button>
        </div>
      )}
      {signing && (
        <div className="ap-sign-form">
          <div className="ap-sign-attest"><span className="ap-sign-attest-label">Meaning of signature</span><input className="ap-sign-input" value={meaning} onChange={e => setMeaning(e.target.value)} placeholder="e.g. Reviewed and approved"/></div>
          <div className="ap-sign-creds">
            <input className="ap-sign-input" type="password" placeholder="Re-enter password" value={pwd} onChange={e => setPwd(e.target.value)}/>
            <button className="ap-sign-confirm" disabled={pwd.length < 6 || meaning.trim().length === 0} onClick={() => setSigned(true)}>{I.lock} Apply signature</button>
            <button className="ap-sign-cancel" onClick={() => { setSigning(false); setPwd(''); }}>Cancel</button>
          </div>
          <div className="ap-sign-foot">21 CFR §11.100(b) · Preview only — this does not apply a signature or write to the audit trail. E-signing goes live once wired to POST /api/esignature/sign.</div>
        </div>
      )}
    </div>
  );
}

/* ── BioApprovalsPane ── */

interface ApprovalsPaneProps {
  approvals: ApprovalItem[];
}

export function BioApprovalsPane({ approvals }: ApprovalsPaneProps) {
  // GET /api/approval-workflows/pending returns ONLY pending steps already scoped
  // to the current user + org, so every row is "pending your signature". No
  // signed-approvals read model is wired, so the former "Signed" section is
  // omitted rather than fabricated (honest backend gap).
  return (
    <div className="ap-pane">
      <div className="ap-section">
        <div className="ap-sec-hdr">
          <div><div className="ap-sec-title">Pending your signature</div><div className="ap-sec-sub">{approvals.length} require your e-sign</div></div>
          <span className="ap-cfr">21 CFR Part 11 · §11.50 · §11.70</span>
        </div>
        {approvals.length === 0 && <div className="audit-empty">No pending approvals.</div>}
        {approvals.map(a => <BioApprovalCard key={a.id} a={a}/>)}
      </div>
    </div>
  );
}

/* ── BioPathwayShell ── */

interface PathwayShellProps {
  pathway: string;
  program?: { code?: string; app?: string } | null;
  workspaceSub?: string;
  onAsk?: (text: string) => void;
  onNav?: (id: string) => void;
  children?: React.ReactNode;
}

export function BioPathwayShell({ workspaceSub, onAsk, children }: PathwayShellProps) {
  const [tab, setTab] = useState('workspace');
  const ask = onAsk || (() => {});

  // REAL, org-scoped, fixture-free reads. All three back the tab badges, so all
  // load on mount (the fixture computed all three eagerly too). Each renders real
  // rows, an honest empty, or an honest error — never a fabricated stand-in.
  const auditState = useLiveRows<AuditEvent>('/api/audit-trail/ledger');
  // c2c_correspondence is org-scoped; projectId is optional and this surface has
  // no canonical numeric project id (program carries only code/app), so the whole
  // org's correspondence is read, unscoped — honest, just not project-filtered.
  const corrState = useLiveRows<RawCorrespondence>('/api/regulatory-correspondence/correspondence');
  // Pending approvals return a { approvals } envelope that useLiveRows can't
  // unwrap into rows, so read the object with useLiveData and pick .approvals.
  const apprState = useLiveData<{ approvals?: RawApproval[] }>('/api/approval-workflows/pending');

  const corrItems = corrState.rows.map(adaptCorr);
  const apprItems = (apprState.data?.approvals ?? []).map(adaptApproval);
  const apprEmpty = !apprState.loading && !apprState.error && apprItems.length === 0;

  const counts: TabCounts = {
    audit: auditState.rows.length,
    correspondence: corrItems.length,
    corrOpen: corrItems.filter(c => c.status === 'open').length,
    approvals: apprItems.length,
    apPending: apprItems.length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <PathwayTabBar tab={tab} setTab={setTab} corrLabel={CORR_LABEL} counts={counts} workspaceSub={workspaceSub}/>
      <div style={{ flex: 1, minHeight: 0, overflowY: tab === 'workspace' ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'workspace' && <div style={{ minHeight: 0 }}>{children}</div>}
        {tab === 'correspondence' && (
          <PaneGuard
            loading={corrState.loading} error={!!corrState.error} empty={corrState.empty}
            loadingLabel="Loading correspondence…"
            errorTitle="Couldn't load correspondence"
            errorHint="The regulatory correspondence store didn't respond. These are the organization's agency HAQ / IR threads — sign in and retry, or check the service is reachable."
            emptyTitle="No correspondence yet"
            emptyHint="Agency queries (HAQ / IR), meeting minutes, and safety reports appear here as they're received and parsed into the governed correspondence store."
          >
            <BioCorrespondencePane items={corrItems} onAskAna={ask}/>
          </PaneGuard>
        )}
        {tab === 'audit' && (
          <PaneGuard
            loading={auditState.loading} error={!!auditState.error} empty={auditState.empty}
            loadingLabel="Loading audit trail…"
            errorTitle="Couldn't load the audit trail"
            errorHint="The append-only, hash-chained 21 CFR Part 11 ledger didn't respond. Sign in and retry, or check the audit service is reachable — the trail is never shown as an empty 'no events' state when it can't be read."
            emptyTitle="No audit entries yet"
            emptyHint="Governed actions — authoring, review, submission, vault locks and e-signatures — are written to the immutable hash-chained ledger as they happen."
          >
            <BioAuditTrailPane events={auditState.rows}/>
          </PaneGuard>
        )}
        {tab === 'approvals' && (
          <PaneGuard
            loading={apprState.loading} error={!!apprState.error} empty={apprEmpty}
            loadingLabel="Loading approvals…"
            errorTitle="Couldn't load pending approvals"
            errorHint="The approval-workflow service didn't respond. These are the e-signature steps assigned to you — sign in and retry, or check the service is reachable."
            emptyTitle="No approvals pending your signature"
            emptyHint="When a governed document routes an approval step to you, it appears here for 21 CFR Part 11 e-signature."
          >
            <BioApprovalsPane approvals={apprItems}/>
          </PaneGuard>
        )}
      </div>
    </div>
  );
}
