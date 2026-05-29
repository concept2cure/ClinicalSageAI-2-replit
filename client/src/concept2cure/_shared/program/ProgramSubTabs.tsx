/**
 * ProgramSubTabs — the shared Audit · Correspondence · Approvals strip.
 *
 * One reusable three-tab panel that drops into any new shell carrying a project
 * context. Each tab renders live data from its own hook (no mocks):
 *
 *   Audit          useAuditTrail({ program })  → GET /api/mdx/audit
 *   Correspondence useCorrespondence(projectId)→ GET /api/regulatory-correspondence
 *                                                /correspondence?projectId=
 *   Approvals      useApprovalsPending()       → GET /api/approval-workflows/pending
 *
 * Scoping follows each route's actual contract: audit is org-scoped with the
 * project id threaded as the program anchor; correspondence is per-project;
 * approvals is the current user's queue and takes no project id.
 *
 * Accessibility: WAI-ARIA tabs pattern — role=tablist/tab/tabpanel,
 * aria-selected, roving tabindex with left/right/home/end arrow navigation and
 * managed focus. Status tones never rely on color alone (text + icon). Loading
 * uses role=status, errors role=alert.
 *
 * @module client/src/concept2cure/_shared/program/ProgramSubTabs
 */

import * as React from 'react';
import { CmcIcon } from '../../cmc/icons';
import {
  useAuditTrail,
  useCorrespondence,
  useCorrespondenceDetail,
  useReviewIssue,
  useApprovalsPending,
  useApproveWorkflow,
  useRejectWorkflow,
} from '../../hooks/useProgramTabs';
import type {
  AuditEvent,
  CorrespondenceRow,
  CorrespondenceIssue,
  PendingApproval,
} from '../../services/programTabsService';
import { EsignModal, type EsigSignedManifest } from '../components';
import type { EsigMeaning } from '../../hooks/useEsignature';
import './ProgramSubTabs.css';

export type ProgramTabId = 'audit' | 'correspondence' | 'approvals';

export interface ProgramSubTabsProps {
  /** Canonical project id — drives correspondence + anchors the audit chain. */
  projectId: string | null;
  /** Which tab opens first. */
  initialTab?: ProgramTabId;
}

interface TabDef {
  id: ProgramTabId;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: 'audit',          label: 'Audit',          icon: 'list' },
  { id: 'correspondence', label: 'Correspondence', icon: 'send' },
  { id: 'approvals',      label: 'Approvals',      icon: 'checkCircle' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

type Tone = 'ok' | 'warn' | 'err' | 'dim';
const TONE_ICON: Record<Tone, string> = {
  ok: 'checkCircle',
  warn: 'warning',
  err: 'xCircle',
  dim: 'alertCircle',
};

function StatusChip({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`ptab-chip ptab-chip-${tone}`}>
      <CmcIcon name={TONE_ICON[tone]} size={12} />
      {label}
    </span>
  );
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== '') return String(v);
  }
  return '—';
}

function formatWhen(raw: string): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function correspondenceTone(status: string): Tone {
  const s = status.toLowerCase();
  if (s.includes('respond') || s.includes('closed') || s.includes('resolved')) return 'ok';
  if (s.includes('new') || s.includes('open')) return 'err';
  if (s.includes('progress') || s.includes('draft') || s.includes('review')) return 'warn';
  return 'dim';
}

function urgencyTone(urgency: string): Tone {
  const u = urgency.toLowerCase();
  if (u.includes('high') || u.includes('critical')) return 'err';
  if (u.includes('medium')) return 'warn';
  return 'dim';
}

// ── Tab panels ─────────────────────────────────────────────────────────────────

function Loading({ label }: { label: string }) {
  return <div className="ptab-state" role="status">{label}</div>;
}

function ErrorBlock({ message }: { message: string }) {
  return <div className="ptab-state ptab-state-err" role="alert">{message}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="ptab-state">{children}</div>;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Self-contained accessible modal shell. Mirrors the CmcDialog a11y contract —
 * role=dialog aria-modal, focus trapped, Esc closes (unless busy), focus returns
 * to the trigger on close — but carries its own ptab-* styling so _shared keeps
 * no dependency on the cmc stylesheet.
 */
function PtabModal({
  open,
  title,
  subtitle,
  busy = false,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  busy?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const subId = React.useId();
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (open) returnFocusRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const node = dialogRef.current;
      if (!node) return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusables.length === 0) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, busy, onClose]);

  React.useEffect(() => {
    if (open) return;
    const target = returnFocusRef.current;
    if (target && typeof target.focus === 'function') target.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="ptab-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="ptab-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subId : undefined}
      >
        <div className="ptab-modal-head">
          <div>
            <h2 className="ptab-modal-title" id={titleId}>{title}</h2>
            {subtitle && <p className="ptab-modal-sub" id={subId}>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="ptab-modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <CmcIcon name="x" size={16} />
          </button>
        </div>
        <div className="ptab-modal-body">{children}</div>
        <div className="ptab-modal-foot">{footer}</div>
      </div>
    </div>
  );
}

function issueReviewTone(status: string): Tone {
  const s = status.toLowerCase();
  if (s === 'confirmed' || s === 'edited') return 'ok';
  if (s === 'rejected') return 'err';
  return 'dim';
}

function AuditPanel({ projectId }: { projectId: string | null }) {
  const audit = useAuditTrail({ program: projectId ?? undefined, filters: { limit: 100 } });
  const events: AuditEvent[] = audit.data?.events ?? [];

  return (
    <div className="ptab-pane">
      <div className="ptab-pane-head">
        <span>21 CFR Part 11 audit chain</span>
        <span className="ptab-muted">Hash-linked, tamper-evident · {events.length} events</span>
      </div>
      {audit.isLoading ? (
        <Loading label="Loading audit chain…" />
      ) : audit.isError ? (
        <ErrorBlock message="Could not load the audit chain. Try again." />
      ) : events.length === 0 ? (
        <Empty>No audit events recorded for this program yet.</Empty>
      ) : (
        <div className="ptab-audit">
          {events.map((e) => (
            <div key={e.id} className="ptab-audit-row">
              <span className="ptab-audit-rail"><span className="ptab-audit-node" /></span>
              <div className="ptab-audit-body">
                <div className="ptab-audit-line">
                  <span className="ptab-audit-action">{e.action || 'event'}</span>
                  {e.role && <span className="ptab-audit-meaning">{e.role}</span>}
                  <span className="ptab-audit-when">{formatWhen(e.when)}</span>
                </div>
                {e.target && <div className="ptab-audit-target">{e.target}</div>}
                <div className="ptab-audit-meta">
                  <b>{e.actorName || e.actor}</b>
                  {e.reason ? ` · ${e.reason}` : ''}
                  {e.resource ? ` · ${e.resource}` : ''}
                </div>
                {e.sha && <div className="ptab-audit-hash">sha256·{e.sha}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A reviewable issue inside an expanded correspondence thread. */
function IssueRow({
  issue,
  correspondenceId,
  onReview,
}: {
  issue: CorrespondenceIssue;
  correspondenceId: string;
  onReview: (e: React.MouseEvent<HTMLButtonElement>, issue: CorrespondenceIssue) => void;
}) {
  const text = pick(issue, ['issue_text', 'summary', 'category']);
  const reviewStatus = pick(issue, ['human_review_status']);
  const resolution = pick(issue, ['resolution_status']).replace(/_/g, ' ');
  const reviewed = reviewStatus !== '—' && reviewStatus.toLowerCase() !== 'pending';

  return (
    <div className="ptab-issue">
      <div className="ptab-issue-body">
        <div className="ptab-issue-text">{text}</div>
        <div className="ptab-issue-meta">
          {reviewStatus !== '—' && (
            <StatusChip tone={issueReviewTone(reviewStatus)} label={`Review: ${reviewStatus}`} />
          )}
          {resolution !== '—' && (
            <StatusChip tone="dim" label={resolution} />
          )}
        </div>
      </div>
      <div className="ptab-issue-actions">
        {reviewed ? (
          <span className="ptab-issue-state">
            <CmcIcon name="checkCircle" size={14} />
            Reviewed
          </span>
        ) : (
          <button
            type="button"
            className="ptab-act"
            aria-label={`Mark issue reviewed — ${text}`}
            onClick={(e) => onReview(e, issue)}
          >
            <span className="ico"><CmcIcon name="checkCircle" size={14} /></span>
            Mark reviewed
          </button>
        )}
      </div>
    </div>
  );
}

/** Expanded issues panel for one correspondence thread. */
function CorrespondenceIssues({
  correspondenceId,
  onReview,
}: {
  correspondenceId: string;
  onReview: (e: React.MouseEvent<HTMLButtonElement>, issue: CorrespondenceIssue) => void;
}) {
  const detail = useCorrespondenceDetail(correspondenceId);
  const issues = detail.data?.issues ?? [];

  return (
    <div className="ptab-issues">
      <div className="ptab-issues-head">Parsed issues</div>
      {detail.isLoading ? (
        <div className="ptab-state" role="status">Loading issues…</div>
      ) : detail.isError ? (
        <div className="ptab-state ptab-state-err" role="alert">
          Could not load the issues for this thread. Try again.
        </div>
      ) : issues.length === 0 ? (
        <div className="ptab-state">No parsed issues for this correspondence.</div>
      ) : (
        issues.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            correspondenceId={correspondenceId}
            onReview={onReview}
          />
        ))
      )}
    </div>
  );
}

interface ReviewTarget {
  issue: CorrespondenceIssue;
  correspondenceId: string;
  label: string;
  trigger: HTMLButtonElement | null;
}

function CorrespondencePanel({ projectId }: { projectId: string | null }) {
  const corr = useCorrespondence(projectId);
  const review = useReviewIssue();
  const rows: CorrespondenceRow[] = corr.data ?? [];
  const open = rows.filter((r) => {
    const s = String(r.status ?? '').toLowerCase();
    return s !== 'closed' && s !== 'responded' && s !== 'resolved';
  }).length;

  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [target, setTarget] = React.useState<ReviewTarget | null>(null);
  const [reason, setReason] = React.useState('');
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);
  const errId = React.useId();

  const onReview = (e: React.MouseEvent<HTMLButtonElement>, issue: CorrespondenceIssue, corrId: string) => {
    const label = pick(issue, ['issue_text', 'summary', 'category']);
    setReason('');
    review.reset();
    setTarget({ issue, correspondenceId: corrId, label, trigger: e.currentTarget });
  };

  const closeModal = () => {
    const trigger = target?.trigger ?? null;
    setTarget(null);
    const restore = trigger && document.body.contains(trigger) ? trigger : restoreFocusRef.current;
    restoreFocusRef.current = null;
    window.setTimeout(() => restore?.focus?.(), 0);
  };

  const onConfirm = async () => {
    if (!target || review.isPending) return;
    // The reason is captured for operator intent; the review route stores only
    // the status (no note column), so it is not persisted server-side.
    await review.mutateAsync({
      issueId: target.issue.id,
      correspondenceId: target.correspondenceId,
      reason: reason.trim() || undefined,
    });
    // The reviewed issue's "Mark reviewed" button disappears; return focus to
    // the thread's expand toggle.
    restoreFocusRef.current =
      document.getElementById(`ptab-corr-toggle-${target.correspondenceId}`);
    closeModal();
  };

  const mutationError = review.error as Error | null;

  return (
    <div className="ptab-pane">
      <div className="ptab-pane-head">
        <span>Health-authority correspondence</span>
        <span className="ptab-muted">{open} open · {rows.length} total</span>
      </div>
      {!projectId ? (
        <Empty>Select a project to load its correspondence.</Empty>
      ) : corr.isLoading ? (
        <Loading label="Loading correspondence…" />
      ) : corr.isError ? (
        <ErrorBlock message="Could not load correspondence. Try again." />
      ) : rows.length === 0 ? (
        <Empty>No agency correspondence logged for this project yet.</Empty>
      ) : (
        <div className="ptab-table" role="table" aria-label="Correspondence threads">
          <div className="ptab-tr ptab-tr-head" role="row">
            <span role="columnheader">Kind</span>
            <span role="columnheader">Subject</span>
            <span role="columnheader">Received</span>
            <span role="columnheader">Due</span>
            <span role="columnheader">Urgency</span>
            <span role="columnheader">Status</span>
          </div>
          {rows.map((c, i) => {
            const status = pick(c, ['status']);
            const urgency = pick(c, ['urgency']);
            const kind = pick(c, ['communication_type', 'direction']).replace(/_/g, ' ');
            const corrId = String(c.id ?? '');
            const isOpen = expanded === corrId && corrId !== '';
            const subject = pick(c, ['subject']);
            const issuesRegionId = corrId ? `ptab-corr-issues-${corrId}` : undefined;
            return (
              <React.Fragment key={corrId || i}>
                <div className="ptab-tr ptab-tr-btn" role="row" data-open={isOpen || undefined}>
                  <span role="cell" className="ptab-kind-cell">
                    <button
                      type="button"
                      id={corrId ? `ptab-corr-toggle-${corrId}` : undefined}
                      className="ptab-tr-disclose"
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? issuesRegionId : undefined}
                      aria-label={`${isOpen ? 'Collapse' : 'Expand'} correspondence — ${subject}`}
                      disabled={corrId === ''}
                      onClick={() => setExpanded(isOpen ? null : corrId)}
                    >
                      <span className="ptab-tr-caret"><CmcIcon name="chevronRight" size={13} /></span>
                      <span className="ptab-kind">{kind}</span>
                    </button>
                  </span>
                  <span role="cell" className="ptab-subj">{subject}</span>
                  <span role="cell" className="ptab-mono">{formatWhen(pick(c, ['received_at', 'created_at']))}</span>
                  <span role="cell" className="ptab-mono">{c.due_date ? formatWhen(String(c.due_date)) : '—'}</span>
                  <span role="cell">{urgency === '—' ? '—' : <StatusChip tone={urgencyTone(urgency)} label={urgency} />}</span>
                  <span role="cell">{status === '—' ? '—' : <StatusChip tone={correspondenceTone(status)} label={status} />}</span>
                </div>
                {isOpen && (
                  <div id={issuesRegionId}>
                    <CorrespondenceIssues
                      correspondenceId={corrId}
                      onReview={(e, issue) => onReview(e, issue, corrId)}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      <PtabModal
        open={!!target}
        busy={review.isPending}
        title="Mark issue reviewed"
        subtitle="Records a human review on this parsed issue. The review status is stored in the correspondence record."
        onClose={closeModal}
        footer={
          <>
            <button
              type="button"
              className="ptab-act"
              onClick={closeModal}
              disabled={review.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ptab-act ptab-act-primary"
              onClick={onConfirm}
              disabled={review.isPending}
              aria-describedby={mutationError ? errId : undefined}
            >
              {review.isPending ? 'Saving…' : 'Mark reviewed'}
            </button>
          </>
        }
      >
        <div className="ptab-review-field">
          <label htmlFor="ptab-review-reason">Reason for review (optional)</label>
          <textarea
            id="ptab-review-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this issue cleared, and any context for the audit trail"
          />
        </div>
        <p className="ptab-review-note">
          The reason is captured for your record. The review endpoint stores the review
          status only, so the note is not persisted server-side.
        </p>
        {mutationError && (
          <div id={errId} className="ptab-review-err" role="alert">
            Could not mark the issue reviewed. {mutationError.message}
          </div>
        )}
      </PtabModal>
    </div>
  );
}

type ApprovalDecision = 'approve' | 'reject';

interface SigningTarget {
  /** The approvalId used at :id/approve|reject. */
  approvalId: number | string;
  /** Document/target title shown in the modal. */
  label: string;
  decision: ApprovalDecision;
  /** The button to return focus to if the user cancels. */
  trigger: HTMLButtonElement | null;
}

function ApprovalsPanel() {
  const appr = useApprovalsPending();
  const approve = useApproveWorkflow();
  const reject = useRejectWorkflow();
  const rows: PendingApproval[] = appr.data ?? [];

  const [signing, setSigning] = React.useState<SigningTarget | null>(null);
  // Where to return focus after a row resolves and leaves the list.
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);
  const headRef = React.useRef<HTMLDivElement>(null);

  const openDecision = (
    e: React.MouseEvent<HTMLButtonElement>,
    approvalId: number | string,
    label: string,
    decision: ApprovalDecision,
  ) => {
    setSigning({ approvalId, label, decision, trigger: e.currentTarget });
  };

  const onSign = React.useCallback(
    async ({ reason, meaning }: { reason: string; meaning: EsigMeaning }): Promise<EsigSignedManifest> => {
      if (!signing) throw new Error('No approval selected.');
      // The signed reason is stored verbatim as the workflow comment. A mutation
      // failure rejects here and the shared modal surfaces it inline (role=alert).
      if (signing.decision === 'approve') {
        await approve.mutateAsync({ approvalId: signing.approvalId, comment: reason });
      } else {
        await reject.mutateAsync({ approvalId: signing.approvalId, comment: reason });
      }
      // After commit the row leaves the pending list; send focus somewhere sensible.
      restoreFocusRef.current = headRef.current;
      return { meaning, reason, signedAt: new Date().toISOString() };
    },
    [signing, approve, reject],
  );

  const closeModal = () => {
    const trigger = signing?.trigger ?? null;
    setSigning(null);
    // If the row still exists (cancelled), return focus to its button; if it
    // resolved, the button is gone, so fall back to the panel heading.
    const target = trigger && document.body.contains(trigger) ? trigger : restoreFocusRef.current;
    restoreFocusRef.current = null;
    window.setTimeout(() => target?.focus?.(), 0);
  };

  return (
    <div className="ptab-pane">
      <div className="ptab-pane-head" ref={headRef} tabIndex={-1}>
        <span>Pending approvals</span>
        <span className="ptab-muted">{rows.length} awaiting your sign-off</span>
      </div>
      {appr.isLoading ? (
        <Loading label="Loading approvals…" />
      ) : appr.isError ? (
        <ErrorBlock message="Could not load pending approvals. Try again." />
      ) : rows.length === 0 ? (
        <Empty>You have no approvals awaiting sign-off.</Empty>
      ) : (
        <div className="ptab-approvals">
          {rows.map((w, i) => {
            const approvalId = (w.approvalId ?? w.id) as number | string | undefined;
            const target = pick(w, ['documentTitle', 'document_title', 'target']);
            const step = pick(w, ['stepName', 'step_name']);
            const requestedBy = pick(w, ['requestedByName', 'requested_by_name']);
            const dueRaw = w.dueDate ?? w.due_date;
            const due = dueRaw ? formatWhen(String(dueRaw)) : null;
            const label = target !== '—' ? target : `Approval ${String(approvalId ?? i)}`;
            return (
              <div key={(approvalId as string) ?? i} className="ptab-appr">
                <div className="ptab-appr-top">
                  <span className="ptab-appr-target">{target}</span>
                  {due
                    ? <StatusChip tone="warn" label={`Due ${due}`} />
                    : <StatusChip tone="dim" label="No due date" />}
                </div>
                <div className="ptab-appr-foot">
                  <span className="ptab-muted ptab-appr-meta">
                    {step !== '—' ? <>Step <b>{step}</b></> : 'Awaiting review'}
                    {requestedBy !== '—' ? ` · requested by ${requestedBy}` : ''}
                  </span>
                  {approvalId != null && (
                    <span className="ptab-appr-actions">
                      <button
                        type="button"
                        className="ptab-act ptab-act-approve"
                        aria-label={`Approve ${label}`}
                        onClick={(e) => openDecision(e, approvalId, label, 'approve')}
                      >
                        <span className="ico"><CmcIcon name="checkCircle" size={14} /></span>
                        Approve
                      </button>
                      <button
                        type="button"
                        className="ptab-act ptab-act-reject"
                        aria-label={`Reject ${label}`}
                        onClick={(e) => openDecision(e, approvalId, label, 'reject')}
                      >
                        <span className="ico"><CmcIcon name="xCircle" size={14} /></span>
                        Reject
                      </button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EsignModal
        open={!!signing}
        action={signing?.decision === 'reject' ? 'Reject approval' : 'Approve step'}
        target={signing?.label ?? ''}
        targetMeta={
          signing?.decision === 'reject'
            ? 'Signs the rejection per 21 CFR Part 11. The reason is required and stored verbatim.'
            : 'Signs the approval per 21 CFR Part 11. The reason is stored verbatim in the audit trail.'
        }
        defaultMeaning={signing?.decision === 'reject' ? 'review' : 'approval'}
        onClose={closeModal}
        onSign={onSign}
      />
    </div>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────

export function ProgramSubTabs({ projectId, initialTab = 'audit' }: ProgramSubTabsProps) {
  const [active, setActive] = React.useState<ProgramTabId>(initialTab);
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const idx = TABS.findIndex((t) => t.id === active);
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    const nextTab = TABS[next];
    setActive(nextTab.id);
    tabRefs.current[nextTab.id]?.focus();
  };

  return (
    <div className="ptab-wrap">
      <div className="ptab-tabs" role="tablist" aria-label="Program records">
        {TABS.map((t) => {
          const selected = active === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              id={`ptab-tab-${t.id}`}
              className="ptab-tab"
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`ptab-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              data-active={selected || undefined}
              onClick={() => setActive(t.id)}
              onKeyDown={onKeyDown}
            >
              <span className="ico"><CmcIcon name={t.icon} size={14} /></span>
              {t.label}
            </button>
          );
        })}
      </div>

      {TABS.map((t) => (
        <div
          key={t.id}
          id={`ptab-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`ptab-tab-${t.id}`}
          hidden={active !== t.id}
        >
          {active === t.id && (
            t.id === 'audit' ? <AuditPanel projectId={projectId} />
            : t.id === 'correspondence' ? <CorrespondencePanel projectId={projectId} />
            : <ApprovalsPanel />
          )}
        </div>
      ))}
    </div>
  );
}

export default ProgramSubTabs;
