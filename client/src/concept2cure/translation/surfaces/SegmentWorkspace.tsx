// Bilingual segment workspace — the per-project translation workbench. For a
// selected translation project it renders a side-by-side view: the source (EN)
// text on the left, the target (e.g. JA) on the right, each segment carrying a
// method badge (human / mt_postedited / machine) and a workflow-status badge.
//
// Per-segment actions are wired to the live workflow mutations:
//   Draft (MT)          → POST /api/translation/projects/:id/segments/draft
//   Post-edit (editable target) → POST /api/translation/segments/:id/post-edit
//   Run back-translation → POST /api/translation/segments/:id/back-translation
//   Approve (governed)   → POST /api/translation/segments/:id/approve
//
// REGULATED GUARDRAIL (mirrored from the server state machine and the shared
// isApprovableMethod predicate): a machine-only segment can NEVER be approved.
// Approve is disabled — with an explanatory tooltip — until the segment has been
// human post-edited (method 'mt_postedited' | 'human') AND has verified
// back-translation evidence. Approving opens a governed confirm dialog that
// captures a reason-for-change / reviewer acknowledgement (e-signature style),
// consistent with how the repo gates approvals — never a bare one-click approve.
//
// Reads come from GET /api/translation/projects/:id via useTranslationProject
// (project status + ordered segments). All states/chips/classes are reused from
// the labeling surface family so this renders inside the same app.css.

import * as React from 'react';
import {
  useTranslationProject,
  useDraftSegment,
  useSubmitPostEdit,
  useRunBackTranslation,
  useApproveSegment,
} from '../hooks/useTranslation';
import { LabelingIcon } from '../../labeling/icons';
import { LabelingDialog } from '../../labeling/surfaces/LabelingDialog';
import {
  Loading,
  ErrorState,
  Empty,
  NoProject,
  StatusChip,
  transStatusTone,
} from '../../labeling/surfaces/state';
import { LANGUAGES } from '@/i18n/languages';
import {
  isApprovableMethod,
  type TranslationProject,
  type TranslationSegment,
  type TranslationMethod,
  type TranslationStatus,
  type SubmitPostEditRequest,
} from '@shared/types/translation';

interface SegmentWorkspaceProps {
  /** Canonical shell project id (string) — gates rendering, parity with peers. */
  projectId: string | null;
  /** The selected translation project (numeric contract id) to work in. */
  translationProjectId: number | null;
  /** Return to the projects list. */
  onBack: () => void;
  onAskAna: (t: string) => void;
}

// ── Display helpers ──────────────────────────────────────────────────────────

const LANG_LABEL: Record<string, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l.label]),
);

function langLabel(code: string): string {
  return LANG_LABEL[code] ?? code.toUpperCase();
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function methodLabel(m: TranslationMethod | null): string {
  if (!m) return 'Not started';
  if (m === 'mt_postedited') return 'MT post-edited';
  if (m === 'machine') return 'Machine draft';
  return 'Human';
}

/** Method badge tone. Machine drafts read as 'warn' so they are visibly marked
 *  as unverified — never the calm 'ok' tone reserved for human-touched work. */
function methodTone(m: TranslationMethod | null): 'ok' | 'warn' | 'dim' {
  if (m === 'human' || m === 'mt_postedited') return 'ok';
  if (m === 'machine') return 'warn';
  return 'dim';
}

/** Whether a segment is eligible for approval, per the shared guardrail: an
 *  approvable method (human / mt_postedited) AND verified back-translation. The
 *  server remains the source of truth; this is the matching UI affordance. */
function canApprove(seg: TranslationSegment): boolean {
  return isApprovableMethod(seg.method) && seg.provenance.backTranslation?.verified === true;
}

/** Plain-language explanation of why Approve is unavailable, for the tooltip and
 *  the screen-reader description. Order mirrors the server's rejection codes. */
function approveBlockedReason(seg: TranslationSegment): string | null {
  if (seg.status === 'approved') return 'This segment is already approved.';
  if (!isApprovableMethod(seg.method)) {
    return 'A machine draft cannot be approved. Post-edit the target text first, then run back-translation.';
  }
  if (!seg.provenance.backTranslation) {
    return 'Run back-translation to produce the evidence required before approval.';
  }
  if (!seg.provenance.backTranslation.verified) {
    return 'Back-translation did not verify. Review the discrepancy and post-edit again before approval.';
  }
  return null;
}

// ── Per-language filter ───────────────────────────────────────────────────────

const STATUS_FILTERS: ReadonlyArray<{ value: 'all' | TranslationStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'mt_draft', label: 'Machine draft' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'back_translation', label: 'Back-translation' },
  { value: 'review', label: 'In review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

// ── Submission-readiness summary ──────────────────────────────────────────────

function readinessCounts(segments: TranslationSegment[]) {
  const total = segments.length;
  const approved = segments.filter((s) => s.status === 'approved').length;
  const remaining = total - approved;
  return { total, approved, remaining, ready: total > 0 && remaining === 0 };
}

/** Accessible submission-readiness banner — a labelled meter plus an explicit
 *  text summary, so readiness is never conveyed by the bar fill alone. */
function ReadinessSummary({ segments }: { segments: TranslationSegment[] }) {
  const { total, approved, remaining, ready } = readinessCounts(segments);
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  const summary = ready
    ? 'Submission ready — every segment is approved.'
    : total === 0
      ? 'No segments yet.'
      : `${remaining} of ${total} ${remaining === 1 ? 'segment' : 'segments'} still need approval.`;

  return (
    <div
      className="bp-card"
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 14 }}
    >
      <StatusChip
        tone={ready ? 'ok' : 'review'}
        label={ready ? 'Submission ready' : 'In progress'}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>
        <span className="lb-mut" style={{ fontSize: 12, textTransform: 'none' }}>{summary}</span>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={`Approved segments: ${pct} percent`}
          style={{
            height: 6,
            borderRadius: 999,
            background: 'var(--bg-100)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent-main-100)' }} />
        </div>
      </div>
    </div>
  );
}

// ── Method + provenance presentation ──────────────────────────────────────────

/** Compact provenance line: back-translation evidence state, paired with text
 *  so the verification state never relies on color alone. */
function BackTranslationState({ seg }: { seg: TranslationSegment }) {
  const bt = seg.provenance.backTranslation;
  if (!bt) {
    return <span className="lb-mut" style={{ textTransform: 'none' }}>No back-translation yet</span>;
  }
  const pct = Math.round((bt.similarity ?? 0) * 100);
  return bt.verified ? (
    <StatusChip tone="ok" label={`Back-translation verified · ${pct}% match`} />
  ) : (
    <StatusChip tone="warn" label={`Back-translation unverified · ${pct}% match`} />
  );
}

// ── Post-edit dialog (human correction of the target) ─────────────────────────

function PostEditDialog({
  projectId,
  segment,
  onClose,
}: {
  projectId: number;
  segment: TranslationSegment;
  onClose: () => void;
}) {
  const postEdit = useSubmitPostEdit();
  const [targetText, setTargetText] = React.useState(segment.targetText ?? '');
  const [readyForReview, setReadyForReview] = React.useState(false);
  const errId = React.useId();
  const hintId = React.useId();
  const formId = 'tr-post-edit-form';

  const valid = targetText.trim().length > 0;
  const pending = postEdit.isPending;
  const error = postEdit.error as Error | null;

  // A from-scratch human translation reports 'human'; a corrected machine draft
  // becomes 'mt_postedited' — the only methods the server will let reach approval.
  const method: SubmitPostEditRequest['method'] =
    segment.method === 'machine' || segment.method === 'mt_postedited' ? 'mt_postedited' : 'human';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    await postEdit.mutateAsync({
      projectId,
      body: {
        segmentId: segment.id,
        targetText: targetText.trim(),
        method,
        readyForReview,
      },
    });
    onClose();
  };

  return (
    <LabelingDialog
      open
      busy={pending}
      title={`Post-edit segment ${segment.ordinal + 1}`}
      subtitle="Human correction of the target text. This records you as the post-editor."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? 'Saving…' : 'Save post-edit'}
          </button>
        </>
      }
    >
      <form id={formId} className="lb-form" onSubmit={onSubmit} aria-describedby={error ? errId : undefined}>
        <div className="lb-field">
          <span className="lb-mut" style={{ textTransform: 'none' }}>
            Source ({langLabel(segment.sourceLang)})
          </span>
          <p
            lang={segment.sourceLang}
            style={{
              margin: 0,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-100)',
              color: 'var(--text-100)',
              fontSize: 13,
            }}
          >
            {segment.sourceText}
          </p>
        </div>

        <div className="lb-field">
          <label htmlFor="tr-pe-target">
            Target ({langLabel(segment.targetLang)})<span className="lb-req" aria-hidden="true">*</span>
          </label>
          <textarea
            id="tr-pe-target"
            required
            rows={5}
            lang={segment.targetLang}
            value={targetText}
            onChange={(e) => setTargetText(e.target.value)}
            aria-describedby={hintId}
            style={{
              fontSize: 13,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              resize: 'vertical',
              background: 'var(--bg-000)',
              color: 'var(--text-100)',
            }}
          />
          <span id={hintId} className="lb-mut" style={{ fontSize: 12, textTransform: 'none' }}>
            Saving records this as a human post-edit. Approval still requires verified back-translation.
          </span>
        </div>

        <div className="lb-field lb-field-check">
          <input
            id="tr-pe-review"
            type="checkbox"
            checked={readyForReview}
            onChange={(e) => setReadyForReview(e.target.checked)}
          />
          <label htmlFor="tr-pe-review">Mark ready for review</label>
        </div>

        {error && (
          <div id={errId} className="lb-form-error" role="alert">
            <LabelingIcon name="alertCircle" size={14} />
            Could not save the post-edit. {error.message}
          </div>
        )}
      </form>
    </LabelingDialog>
  );
}

// ── Governed approve dialog (reason-for-change / e-signature style) ────────────

function ApproveDialog({
  projectId,
  segment,
  onClose,
}: {
  projectId: number;
  segment: TranslationSegment;
  onClose: () => void;
}) {
  const approve = useApproveSegment();
  const [reviewNote, setReviewNote] = React.useState('');
  const [acknowledged, setAcknowledged] = React.useState(false);
  const errId = React.useId();
  const formId = 'tr-approve-form';

  // Reason-for-change + an explicit acknowledgement together stand in for the
  // e-signature affordance the repo uses to gate governed actions.
  const valid = reviewNote.trim().length >= 4 && acknowledged;
  const pending = approve.isPending;
  const error = approve.error as Error | null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    await approve.mutateAsync({
      projectId,
      body: { segmentId: segment.id, reviewNote: reviewNote.trim() },
    });
    onClose();
  };

  return (
    <LabelingDialog
      open
      busy={pending}
      title={`Approve segment ${segment.ordinal + 1}`}
      subtitle="Approval is a governed, audited action. Confirm the reviewer note to sign off."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? 'Approving…' : 'Sign and approve'}
          </button>
        </>
      }
    >
      <form id={formId} className="lb-form" onSubmit={onSubmit} aria-describedby={error ? errId : undefined}>
        <div className="lb-field">
          <span className="lb-mut" style={{ textTransform: 'none' }}>Target ({langLabel(segment.targetLang)})</span>
          <p
            lang={segment.targetLang}
            style={{
              margin: 0,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-100)',
              color: 'var(--text-100)',
              fontSize: 13,
            }}
          >
            {segment.targetText}
          </p>
        </div>

        <div className="lb-field">
          <BackTranslationState seg={segment} />
        </div>

        <div className="lb-field">
          <label htmlFor="tr-approve-note">
            Reason for approval<span className="lb-req" aria-hidden="true">*</span>
          </label>
          <textarea
            id="tr-approve-note"
            required
            minLength={4}
            rows={3}
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Recorded in the audit trail with your identity and the timestamp."
            style={{
              fontSize: 13,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              resize: 'vertical',
              background: 'var(--bg-000)',
              color: 'var(--text-100)',
            }}
          />
        </div>

        <div className="lb-field lb-field-check">
          <input
            id="tr-approve-ack"
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <label htmlFor="tr-approve-ack">
            I have reviewed the target against the source and the back-translation evidence, and I approve this
            segment as the reviewer.
          </label>
        </div>

        {error && (
          <div id={errId} className="lb-form-error" role="alert">
            <LabelingIcon name="alertCircle" size={14} />
            Could not approve the segment. {error.message}
          </div>
        )}
      </form>
    </LabelingDialog>
  );
}

// ── Segment row (one bilingual unit) ──────────────────────────────────────────

function SegmentRow({
  project,
  segment,
  onPostEdit,
  onApprove,
}: {
  project: TranslationProject;
  segment: TranslationSegment;
  onPostEdit: (seg: TranslationSegment) => void;
  onApprove: (seg: TranslationSegment) => void;
}) {
  const draft = useDraftSegment();
  const backTranslate = useRunBackTranslation();

  const blockedReason = approveBlockedReason(segment);
  const approvable = canApprove(segment) && segment.status !== 'approved';
  const isMachineDraft = segment.method === 'machine' || segment.status === 'mt_draft';
  const hasTarget = (segment.targetText ?? '').trim().length > 0;

  const tipId = React.useId();

  const runDraft = () =>
    draft.mutate({ projectId: project.id, body: { projectId: project.id, segmentIds: [segment.id] } });
  const runBackTranslation = () =>
    backTranslate.mutate({ projectId: project.id, body: { segmentId: segment.id } });

  return (
    <tr>
      <td style={{ verticalAlign: 'top', width: 40 }} className="lb-mut">{segment.ordinal + 1}</td>

      {/* Source (read-only canonical text) */}
      <td style={{ verticalAlign: 'top', width: '32%' }}>
        <p lang={segment.sourceLang} style={{ margin: 0, fontSize: 13, color: 'var(--text-100)' }}>
          {segment.sourceText}
        </p>
      </td>

      {/* Target + method badge */}
      <td style={{ verticalAlign: 'top', width: '32%' }}>
        {hasTarget ? (
          <p lang={segment.targetLang} style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-100)' }}>
            {segment.targetText}
          </p>
        ) : (
          <p className="lb-mut" style={{ margin: '0 0 6px', textTransform: 'none' }}>
            Not yet drafted
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <StatusChip tone={methodTone(segment.method)} label={methodLabel(segment.method)} />
          {isMachineDraft && (
            <span className="lb-mut" style={{ textTransform: 'none', fontSize: 11 }}>
              Unverified draft
            </span>
          )}
        </div>
      </td>

      {/* Status + back-translation evidence */}
      <td style={{ verticalAlign: 'top' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <StatusChip tone={transStatusTone(segment.status)} label={statusLabel(segment.status)} />
          <BackTranslationState seg={segment} />
        </div>
      </td>

      {/* Actions */}
      <td style={{ verticalAlign: 'top' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button
            className="bp-btn-tert"
            type="button"
            onClick={runDraft}
            disabled={draft.isPending || segment.status === 'approved'}
            aria-label={`Generate machine draft for segment ${segment.ordinal + 1}`}
          >
            {draft.isPending ? 'Drafting…' : 'Draft (MT)'}
          </button>

          <button
            className="bp-btn-tert"
            type="button"
            onClick={() => onPostEdit(segment)}
            disabled={segment.status === 'approved'}
            aria-label={`Post-edit segment ${segment.ordinal + 1}`}
          >
            <LabelingIcon name="pen" size={14} /> Post-edit
          </button>

          <button
            className="bp-btn-tert"
            type="button"
            onClick={runBackTranslation}
            disabled={backTranslate.isPending || !hasTarget || segment.status === 'approved'}
            aria-label={`Run back-translation for segment ${segment.ordinal + 1}`}
          >
            {backTranslate.isPending ? 'Checking…' : 'Back-translate'}
          </button>

          {/* Approve — disabled for machine-only / unverified segments, with an
              explanatory tooltip; opens the governed confirm when eligible. */}
          <span
            style={{ display: 'inline-flex' }}
            title={blockedReason ?? undefined}
          >
            <button
              className="bp-btn-primary"
              type="button"
              onClick={() => onApprove(segment)}
              disabled={!approvable}
              aria-disabled={!approvable}
              aria-describedby={blockedReason ? tipId : undefined}
              aria-label={`Approve segment ${segment.ordinal + 1}`}
            >
              <LabelingIcon name="checkCircle" size={14} /> Approve
            </button>
          </span>
          {blockedReason && (
            <span id={tipId} className="lb-sr-only">{blockedReason}</span>
          )}
        </div>

        {(draft.error || backTranslate.error) && (
          <div className="lb-form-error" role="alert" style={{ marginTop: 6 }}>
            <LabelingIcon name="alertCircle" size={14} />
            {((draft.error || backTranslate.error) as Error).message}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Surface ──────────────────────────────────────────────────────────────────

export function TranslationSegmentWorkspace({
  projectId,
  translationProjectId,
  onBack,
  onAskAna,
}: SegmentWorkspaceProps) {
  const projectQuery = useTranslationProject(translationProjectId);
  const draftAll = useDraftSegment();

  const project = projectQuery.data ?? null;
  const segments = React.useMemo(() => project?.segments ?? [], [project]);

  const [statusFilter, setStatusFilter] = React.useState<'all' | TranslationStatus>('all');
  const [postEditing, setPostEditing] = React.useState<TranslationSegment | null>(null);
  const [approving, setApproving] = React.useState<TranslationSegment | null>(null);

  const filterId = React.useId();

  const visibleSegments = React.useMemo(
    () => (statusFilter === 'all' ? segments : segments.filter((s) => s.status === statusFilter)),
    [segments, statusFilter],
  );

  const hasPending = segments.some((s) => s.status === 'pending');

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">
            <button
              className="bp-btn-tert"
              type="button"
              onClick={onBack}
              style={{ padding: '2px 8px' }}
            >
              Projects
            </button>
          </div>
          <h1 className="bp-title">
            {project ? project.name : 'Segment workspace'}
          </h1>
          <div className="bp-meta">
            {project
              ? `${langLabel(project.sourceLang)} → ${langLabel(project.targetLang)} · machine draft is an unverified accelerator; approval requires human post-edit and verified back-translation`
              : 'Side-by-side source and target with per-segment workflow'}
          </div>
        </div>
        <div className="bp-page-actions">
          <button
            className="bp-btn-tert"
            type="button"
            disabled={!project || !hasPending || draftAll.isPending}
            onClick={() =>
              project && draftAll.mutate({ projectId: project.id, body: { projectId: project.id } })
            }
          >
            {draftAll.isPending ? 'Drafting…' : 'Draft all pending (MT)'}
          </button>
          <button
            className="bp-btn-primary"
            type="button"
            onClick={() =>
              onAskAna('Summarise which segments in this project still need post-edit, back-translation, or approval')
            }
          >
            Ask AnA
          </button>
        </div>
      </div>

      {!projectId ? (
        <div className="bp-card"><NoProject /></div>
      ) : translationProjectId == null ? (
        <div className="bp-card">
          <Empty>Select a translation project to open its segment workspace.</Empty>
        </div>
      ) : projectQuery.isLoading ? (
        <div className="bp-card"><Loading label="Loading segments…" /></div>
      ) : projectQuery.isError ? (
        <div className="bp-card"><ErrorState message="Could not load this project's segments." /></div>
      ) : !project ? (
        <div className="bp-card"><ErrorState message="This translation project could not be found." /></div>
      ) : (
        <>
          <ReadinessSummary segments={segments} />

          {draftAll.error && (
            <div className="bp-card">
              <div className="lb-form-error" role="alert">
                <LabelingIcon name="alertCircle" size={14} />
                Could not draft pending segments. {(draftAll.error as Error).message}
              </div>
            </div>
          )}

          <div className="bp-card">
            <div className="bp-card-head">
              <span>Segments</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label htmlFor={filterId} className="lb-mut" style={{ textTransform: 'none' }}>
                  Filter
                </label>
                <select
                  id={filterId}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | TranslationStatus)}
                >
                  {STATUS_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <span className="bp-meta">{visibleSegments.length} of {segments.length}</span>
              </div>
            </div>

            {segments.length === 0 ? (
              <Empty>This project has no segments yet.</Empty>
            ) : visibleSegments.length === 0 ? (
              <Empty>No segments match this filter.</Empty>
            ) : (
              <table className="bp-table">
                <thead>
                  <tr>
                    <th><span className="lb-sr-only">Order</span>#</th>
                    <th>Source ({project ? langLabel(project.sourceLang) : 'EN'})</th>
                    <th>Target ({project ? langLabel(project.targetLang) : ''}) · method</th>
                    <th>Status · evidence</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSegments.map((seg) => (
                    <SegmentRow
                      key={seg.id}
                      project={project}
                      segment={seg}
                      onPostEdit={setPostEditing}
                      onApprove={setApproving}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {postEditing && project && (
        <PostEditDialog
          projectId={project.id}
          segment={postEditing}
          onClose={() => setPostEditing(null)}
        />
      )}
      {approving && project && (
        <ApproveDialog
          projectId={project.id}
          segment={approving}
          onClose={() => setApproving(null)}
        />
      )}
    </div>
  );
}
