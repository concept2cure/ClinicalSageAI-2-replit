/**
 * The signed-in user's confirmation that they reviewed what they are about to
 * export — the input the export review gate requires
 * (server/services/export/exportReviewGate.ts): `humanReviewApproved: true`
 * with the reviewer's name, role and review time. Production refuses an export
 * without it (403 HUMAN_REVIEW_REQUIRED), and refuses a review that names no
 * reviewer, role or time (400 INCOMPLETE_HUMAN_REVIEW).
 *
 * 2026-10-15: the eCTD package downloads (EctdCompile, the Submission Center's
 * PackageDownload) sent no governance block, so production refused every one,
 * and the CER export sent a typed name, no role, and the clock at the moment of
 * export as the review time. All three now send this: the name and role the
 * session states, and the moment the person ticked the confirmation. Until they
 * tick it, the export says it was not reviewed. The gate takes the review time
 * from the caller and records it as the caller's; the server's own time is on
 * the export's audit row. It is the person's statement, not an e-signature.
 */
import * as React from 'react';
import { useAuthUser, type AuthUser } from '@/services/portal/authService';
import { GovernedTimestamp } from '../_shared/components/GovernedTimestamp';

/** The `governance` block of an export request, as the gate reads it. */
export type ExportReviewGovernance =
  | { humanReviewApproved: true; reviewerName: string; reviewerRole: string; reviewTimestamp: string }
  | { humanReviewApproved: false };

/** Who can confirm a review from this session, or why nobody can. */
export type ExportReviewer = { name: string; role: string } | { refusal: string };

/** The session's own name and role (AccountPanel shows the same), never a typed or default one. */
export function exportReviewerOf(user: AuthUser | null): ExportReviewer {
  if (!user) return { refusal: 'No signed-in user is known here, so no review can be confirmed.' };
  const name = (user.displayName || '').trim() || (user.email || '').trim();
  if (!name) return { refusal: 'Your session records no name, so no review can be confirmed under it.' };
  const role = (user.roles?.[0] ?? '').trim();
  if (!role) return { refusal: 'Your session records no role, so no review can be confirmed under it.' };
  return { name, role };
}

export interface ExportReview {
  reviewer: ExportReviewer;
  /** When the signed-in user confirmed (ISO-8601); null until they do. */
  confirmedAt: string | null;
  confirm: (checked: boolean) => void;
  governance: ExportReviewGovernance;
}

/**
 * One confirmation covers one subject reviewed by one user: a new compile,
 * another sequence or another session starts unconfirmed.
 */
export function useExportReview(subject: string): ExportReview {
  const user = useAuthUser();
  const reviewer = React.useMemo(() => exportReviewerOf(user), [user]);
  const key = `${user?.id ?? ''}|${subject}`;
  const [confirmation, setConfirmation] = React.useState<{ key: string; at: string } | null>(null);
  const confirmedAt = confirmation && confirmation.key === key && 'name' in reviewer ? confirmation.at : null;
  const confirm = React.useCallback(
    (checked: boolean) => setConfirmation(checked ? { key, at: new Date().toISOString() } : null),
    [key],
  );
  const governance = React.useMemo<ExportReviewGovernance>(
    () =>
      confirmedAt && 'name' in reviewer
        ? { humanReviewApproved: true, reviewerName: reviewer.name, reviewerRole: reviewer.role, reviewTimestamp: confirmedAt }
        : { humanReviewApproved: false },
    [confirmedAt, reviewer],
  );
  return { reviewer, confirmedAt, confirm, governance };
}

/** The confirmation itself: a checkbox stating who reviewed what, or why it cannot be given. */
export function ExportReviewConfirmation({ review, subject, disabled }: {
  review: ExportReview;
  /** What was reviewed, as a phrase: "this compiled package's content". */
  subject: string;
  disabled?: boolean;
}) {
  const { reviewer, confirmedAt } = review;
  const style: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, lineHeight: 1.5, color: 'var(--text-200)', margin: '0 0 8px' };
  // No "reviewed" in this copy: it also sits on the Dispatch tab, which never
  // says "reviewed" while Shadow Review is waived (P-34).
  if ('refusal' in reviewer) {
    return <p role="note" style={style}>{reviewer.refusal} The export is sent without a confirmed review, which production refuses.</p>;
  }
  return (
    <label style={style}>
      <input type="checkbox" checked={confirmedAt != null} disabled={disabled} onChange={(e) => review.confirm(e.target.checked)} style={{ marginTop: 2 }} />
      <span>
        I confirm my review of {subject}. Sent with the export as the review of {reviewer.name} ({reviewer.role}),{' '}
        {confirmedAt ? <>confirmed <GovernedTimestamp value={confirmedAt} layout="inline" /></> : 'at the time you tick this'}. Your statement, not an e-signature.
      </span>
    </label>
  );
}
