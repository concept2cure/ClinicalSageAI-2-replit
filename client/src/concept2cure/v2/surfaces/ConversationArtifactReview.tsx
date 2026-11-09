/**
 * The review step of an AnA artifact in review, inside its card in the
 * conversation's artifact panel (ConversationThread.tsx ArtifactCard).
 *
 * P-95 (review before approval of a regulated document) is applied to each
 * record through that record's own review. For AnA's conversation artifacts
 * that review is the artifact reviewer routes, which no client reached
 * (COORDINATION, the P-95 clarification `c5208a29cd`):
 *
 *   GET  /api/concept2cure/projects/:p/artifacts/:a/reviews/status   the round, its reviewers and decisions
 *   GET  /api/concept2cure/projects/:p/team                          the people who can be named
 *   POST /api/concept2cure/projects/:p/artifacts/:a/reviewers        { reviewerIds, notes? }
 *   POST /api/concept2cure/projects/:p/artifacts/:a/reviews/submit   { decision, comment? }
 *
 * The server owns every rule: who may name a reviewer, that the author is
 * never their own reviewer, who may decide, one decision per round. A refusal
 * is shown in its own words and changes nothing on screen. The person in the
 * conversation is not offered as a reviewer: AnA drafted the artifact for
 * them, and they are the one who will approve it.
 */
import React, { useCallback, useEffect, useId, useState } from 'react';
import { useAuthUser } from '@/services/portal/authService';
import { apiCall, apiErrorText, type ApiResult } from '../apiCall';
import type { FireToast } from '../toast';

type Decision = 'approve' | 'request_changes' | 'reject';

interface ReviewerRow {
  assignmentId: string;
  reviewerId: number;
  reviewerName: string | null;
  status: string;
  decision: { decision: Decision; comment: string | null } | null;
}

interface ReviewStatus {
  hasReviewers: boolean;
  currentRound: number;
  reviewers: ReviewerRow[];
  readyForApproval: boolean;
}

interface TeamMember { userId: number; name: string | null; email: string | null; role: string | null }

type Read<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: T };

const DECISIONS: ReadonlyArray<{ id: Decision; act: string; said: string }> = [
  { id: 'approve', act: 'Approve', said: 'Approved' },
  { id: 'request_changes', act: 'Request changes', said: 'Requested changes' },
  { id: 'reject', act: 'Reject', said: 'Rejected' },
];
const said = (d: Decision) => DECISIONS.find(x => x.id === d)?.said ?? d;

/** What a reviewer row says: the decision with its comment, or where the assignment stands. */
export function reviewerLine(r: ReviewerRow): string {
  if (r.decision) return r.decision.comment ? `${said(r.decision.decision)} — “${r.decision.comment}”` : said(r.decision.decision);
  return r.status === 'withdrawn' ? 'Withdrawn' : 'Waiting for a decision';
}

const fieldStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 'var(--fs-caption)', padding: '6px 8px',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-000)', color: 'var(--text-100)',
};

/**
 * A write's outcome, told once. A lost acknowledgement is not a refusal: the
 * act may have been recorded, so the review is read again either way.
 * Returns whether the round should be read again.
 */
function told(r: ApiResult, fireToast: FireToast, words: { unknown: string; refused: string; nothing: string; done: string }): boolean {
  if (r.networkError) { fireToast(words.unknown, 'error'); return true; }
  if (!r.ok) { fireToast(apiErrorText(r, words.refused) + ' ' + words.nothing, 'error'); return false; }
  fireToast(words.done);
  return true;
}

function useReviewRound(base: string) {
  const [review, setReview] = useState<Read<ReviewStatus>>({ state: 'loading' });
  const read = useCallback(async (isCurrent: () => boolean = () => true) => {
    setReview({ state: 'loading' });
    const r = await apiCall<{ data?: ReviewStatus }>('GET', `${base}/reviews/status`);
    if (!isCurrent()) return;
    setReview(r.ok && r.body?.data
      ? { state: 'ok', data: r.body.data }
      : { state: 'error', message: apiErrorText(r, 'The review could not be read.') });
  }, [base]);
  useEffect(() => {
    let current = true;
    void read(() => current);
    return () => { current = false; };
  }, [read]);
  return { review, read };
}

function ReviewRound({ review, onRetry }: { review: Read<ReviewStatus>; onRetry: () => void }) {
  if (review.state === 'loading') return <div className="ct-art-note">Reading the review…</div>;
  if (review.state === 'error') {
    return (
      <div className="ct-art-note">
        {review.message}{' '}<button className="ct-art-edit" onClick={onRetry}>Read again</button>
      </div>
    );
  }
  const data = review.data;
  if (!data.hasReviewers) return <div className="ct-art-note">No reviewer is named yet.</div>;
  return (
    <>
      <div className="ct-art-rows">
        {data.reviewers.map(r => (
          <div key={r.assignmentId} className="ct-art-row">
            <span className="ct-art-row-k">{r.reviewerName || `Member ${r.reviewerId}`}</span>
            <span className="ct-art-row-v">{reviewerLine(r)}</span>
          </div>
        ))}
      </div>
      {data.readyForApproval && <div className="ct-art-note">Round {data.currentRound}: every named reviewer approved.</div>}
    </>
  );
}

interface WriteProps { base: string; title: string; fireToast: FireToast; onDone: () => void }

function ReviewDecision({ base, title, fireToast, onDone }: WriteProps) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<Decision | null>(null);
  const commentId = useId();
  const decide = async (decision: Decision) => {
    if (busy) return;
    setBusy(decision);
    try {
      const r = await apiCall('POST', `${base}/reviews/submit`, { decision, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      const reread = told(r, fireToast, {
        unknown: 'Whether your decision was recorded could not be confirmed. The review is read again below.',
        refused: 'Your decision was refused.',
        nothing: 'Your decision was not recorded.',
        done: `Your decision on ${title} is recorded: ${said(decision)}.`,
      });
      if (r.ok) setComment('');
      if (reread) onDone();
    } finally {
      setBusy(null);
    }
  };
  return (
    <div>
      <label htmlFor={commentId} className="ct-art-note">You are a named reviewer. Comment (optional)</label>
      <textarea id={commentId} rows={2} style={fieldStyle} value={comment} maxLength={5000} onChange={e => setComment(e.target.value)} />
      <div className="ct-art-actions">
        {DECISIONS.map(d => (
          <button key={d.id} className="ct-art-edit" disabled={busy !== null} onClick={() => void decide(d.id)}>
            {busy === d.id ? 'Recording…' : d.act}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The organization roles that may decide an artifact review: POST …/reviews/submit refuses every other
 * role (server/routes/c2c/artifacts.ts, "Only reviewer, approver, or admin can submit review decisions").
 * Naming anyone else would open a round they can never decide, so the round could never close.
 */
const DECIDING_ROLES: ReadonlySet<string> = new Set(['reviewer', 'approver', 'admin']);

function ReviewerPicker({ base, title, fireToast, onDone, team, exclude, onCancel }: WriteProps & {
  team: TeamMember[]; exclude: ReadonlySet<number>; onCancel: () => void;
}) {
  const [chosen, setChosen] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const noteId = useId();
  const candidates = team.filter(m => !exclude.has(m.userId) && DECIDING_ROLES.has(String(m.role ?? '').toLowerCase()));
  const assign = async () => {
    if (busy || chosen.length === 0) return;
    setBusy(true);
    try {
      const r = await apiCall<{ data?: { reviewRound?: number } }>('POST', `${base}/reviewers`, {
        reviewerIds: chosen, ...(note.trim() ? { notes: note.trim() } : {}),
      });
      const round = r.body?.data?.reviewRound;
      const reread = told(r, fireToast, {
        unknown: 'Whether the reviewers were named could not be confirmed. The review is read again below.',
        refused: 'Naming the reviewers was refused.',
        nothing: 'No one was assigned.',
        done: `Named ${chosen.length} reviewer${chosen.length === 1 ? '' : 's'} for ${title}` + (round ? `, round ${round}.` : '.'),
      });
      if (reread) onDone();
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: number, on: boolean) => setChosen(c => (on ? [...c, id] : c.filter(x => x !== id)));
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="ct-art-note">Who should review {title}?</legend>
      {candidates.length === 0 && (
        <div className="ct-art-note">No one else in this project&apos;s team holds a reviewer, approver or admin role, so no one can be named.</div>
      )}
      <div className="ct-art-rows">
        {candidates.map(m => (
          <label key={m.userId} className="ct-art-row">
            <input type="checkbox" checked={chosen.includes(m.userId)} onChange={e => toggle(m.userId, e.target.checked)} />
            <span className="ct-art-row-k">{m.name || m.email || `Member ${m.userId}`}</span>
            {m.role && <span className="ct-art-row-v">{m.role}</span>}
          </label>
        ))}
      </div>
      <label htmlFor={noteId} className="ct-art-note">Note for the reviewers (optional)</label>
      <input id={noteId} type="text" style={fieldStyle} value={note} onChange={e => setNote(e.target.value)} />
      <div className="ct-art-actions">
        <button className="ct-art-edit" disabled={busy || chosen.length === 0} onClick={() => void assign()}>
          {busy ? 'Naming…' : 'Assign'}
        </button>
        <button className="ct-art-edit" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  );
}

/** Whether the signed-in person decides in this round, and who may not be named again (them, and anyone named). */
function reviewFacts(data: ReviewStatus | null, myId: number | null) {
  const live = (data?.reviewers ?? []).filter(r => r.status !== 'withdrawn');
  const pending = (r: ReviewerRow) => !r.decision && (r.status === 'pending' || r.status === 'in_progress');
  return {
    mine: myId != null && live.some(r => r.reviewerId === myId && pending(r)),
    exclude: new Set([...live.map(r => r.reviewerId), ...(myId != null ? [myId] : [])]),
  };
}

interface Props {
  projectId: string | number; artifactId: string; title: string; fireToast: FireToast;
  /** False where the person is a reviewer deciding, not the author routing it (ReviewRequests.tsx). */
  canName?: boolean;
}

export function ConversationArtifactReview({ projectId, artifactId, title, fireToast, canName = true }: Props) {
  const me = useAuthUser();
  const myId = me?.id != null ? Number(me.id) : null;
  const project = `/api/concept2cure/projects/${encodeURIComponent(String(projectId))}`;
  const base = `${project}/artifacts/${encodeURIComponent(artifactId)}`;
  const { review, read } = useReviewRound(base);
  const [team, setTeam] = useState<Read<TeamMember[]> | null>(null);

  const openPicker = async () => {
    setTeam({ state: 'loading' });
    const r = await apiCall<{ data?: TeamMember[] }>('GET', `${project}/team`);
    const members = r.ok && Array.isArray(r.body?.data) ? r.body!.data : null;
    setTeam(members ? { state: 'ok', data: members } : { state: 'error', message: apiErrorText(r, 'The project team could not be read.') });
  };

  const data = review.state === 'ok' ? review.data : null;
  const { mine, exclude } = reviewFacts(data, myId);
  const write = { base, title, fireToast };

  return (
    <div className="ct-art-prov" aria-label={'Review of ' + title}>
      <div className="ct-art-prov-l">Review</div>
      <div aria-live="polite"><ReviewRound review={review} onRetry={() => void read()} /></div>
      {mine && <ReviewDecision {...write} onDone={() => void read()} />}
      {canName && data && team === null && (
        <div className="ct-art-actions">
          <button className="ct-art-edit" aria-label={'Name reviewers for ' + title} onClick={() => void openPicker()}>
            Name reviewers
          </button>
        </div>
      )}
      {team && team.state !== 'ok' && (
        <div className="ct-art-note">{team.state === 'loading' ? 'Reading the project team…' : team.message}</div>
      )}
      {team?.state === 'ok' && (
        <ReviewerPicker {...write} team={team.data} exclude={exclude} onCancel={() => setTeam(null)}
          onDone={() => { setTeam(null); void read(); }} />
      )}
    </div>
  );
}
