/**
 * Your open work — what is waiting for the signed-in person, in three groups:
 * tasks assigned to them (sections to write, deliverables from a project's
 * Plan), approvals they sign, and reviews. One reading and one rendering for
 * the places that show it: the top bar's "Your work" panel (TaskTray.tsx),
 * Home's "Your open items" (HomeSections.tsx; CLIENT_JOURNEY_2026-10-25.md,
 * pass 5, decision 9) and Tasks' Mine (TaskNeedList.tsx; P-131 item 2). Moved here from TaskTray, unchanged in what it reads and
 * says, so Home does not draw a second copy.
 *
 * Reads (each degrades on its own; a failed read is said, never an empty list):
 *   GET /api/task-management/my-work      open unified tasks assigned to you
 *   GET /api/concept2cure/reviews/my-queue review threads and tasks for you
 *   GET /api/review/board?scope=mine      authoring approvals at your sign-off
 *   GET /api/concept2cure/reviews/pending  AnA artifact reviews you were named for (P-95)
 */
import React from 'react';
import { I } from './icons';
import { liveGetOrNull, useLiveData } from './dataConnect';
import { clModLabel } from './fixtures/collab-data';
import { openNotificationRecord } from './notificationNavigation';
import { NOTICE_UUID } from '@shared/types/notification-navigation';
import { orderByNeed, type NeedFacts } from './surfaces/taskOrderOfNeed';

export interface MyWorkItem {
  taskId: string;
  title: string;
  projectId: number | null;
  /** The project's name (server/services/tasking/my-work.ts), or null when the task has none. */
  projectName?: string | null;
  moduleType: string;
  status: string;
  priority: string;
  dueDate: string | null;
  overdue: boolean;
  dueSoon: boolean;
  blocked: boolean;
  approvalRequired: boolean;
  approvalStatus: string;
  criticalPath: boolean;
  /** A review route member whose step is not open yet: what it waits on (my-work.ts, RR1a). */
  waitingOn?: string | null;
  /** 'reviewer' or 'approver' on a review route: acted on where the route is, not on the task board (RR1b). */
  reviewRole?: 'reviewer' | 'approver' | null;
}
export interface MyWork {
  items: MyWorkItem[];
  total: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  approvalsPending: number;
}
export interface MyQueue {
  threads: Array<{ threadId: string; title: string | null; artifactTitle?: string | null; priority?: string | null }>;
  tasks: Array<{ taskId: string; title: string; dueAt?: string | null; artifactTitle?: string | null; taskType?: string }>;
  totalThreads: number;
  totalTasks: number;
  unreadNotifications: number;
  overdueTasks: number;
}
/** The fields of one GET /api/review/board queue row this tray reads
 *  (ReviewItemView, server/services/review/authoring-review-board.ts). The
 *  authoring store records no due date, so none is shown. */
export interface PendingApproval {
  id: string;
  doc: string;
  prog: string | null;
  role: string;
  atMySignOff: boolean;
  /** The document's project (regulatory program), or null when it has none. */
  programId?: string | null;
}

/** Only a canonical saved-run resource creates a report navigation target. */
export function dueLabel(iso: string | null): string {
  if (!iso) return '';
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return '';
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days}d`;
}

/** What the order of need reads of one assigned item. Overdue is my-work.ts's, the one rule; a review
 *  route member that waits on an earlier step is outside the triage, so it is passed with no due date. */
export function myWorkNeed(t: MyWorkItem): NeedFacts {
  return { key: t.taskId, priority: t.priority, dueIso: t.waitingOn ? null : t.dueDate, overdue: t.overdue };
}

/** The three reads. `full` false reads only my-work (the bell's badge while its panel is closed). */
export function useOpenWorkReads(full: boolean, refreshKey: number) {
  const myWork = useLiveData<MyWork>('/api/task-management/my-work', ['my-work', full, refreshKey]);
  const queue = useLiveData<MyQueue>(full ? '/api/concept2cure/reviews/my-queue' : null, ['my-queue', full, refreshKey]);
  const approvals = useLiveData<{ queue: PendingApproval[] }>(
    full ? '/api/review/board?scope=mine&limit=25' : null, ['approvals', full, refreshKey]
  );
  return {
    myWork, queue, approvals,
    assigned: myWork.data?.items ?? [],
    approvalRows: (approvals.data?.queue ?? []).filter((a) => a.atMySignOff),
  };
}

type Go = (surface: string) => void;

/** The fields of one board Vault row this list reads to find a route's version
 *  (VaultReviewItem, surfaces/ReviewVaultQueue.tsx). */
interface RoutedVersion {
  vaultId: string;
  programId: string | null;
  round?: { members?: Array<{ taskId?: string }> } | null;
}

/**
 * Open the version a Vault review route member's task is about, in one click
 * (GA-UI-04). The task carries no version, so the board's Vault queue, which
 * lists each live route with its members' task ids, names it. The version opens
 * in the Vault of its project through the one record-opening path a notice
 * uses. A route the board does not list opens the Review board; a board that
 * cannot be read is reported and nothing is opened.
 */
async function openRouteVersion(taskId: string, go: Go): Promise<void> {
  const board = await liveGetOrNull<{ vaultReviews?: RoutedVersion[] | null }>('/api/review/board?scope=all&limit=100');
  if (board.error || !board.data || !Array.isArray(board.data.vaultReviews)) {
    throw new Error('This review could not be opened because the review list did not load. Try again, or open Review.');
  }
  const hit = board.data.vaultReviews.find((v) => v.round?.members?.some((m) => m.taskId === taskId));
  if (!hit || !hit.programId || !NOTICE_UUID.test(hit.programId) || !NOTICE_UUID.test(hit.vaultId)) {
    go('review');
    return;
  }
  openNotificationRecord({ surface: 'vault', label: 'Open the version', params: { documentId: hit.vaultId }, programId: hit.programId }, go);
}

/** Open a document at your sign-off in the editor, in its project, through the
 *  Review board's own opener (loaded on the click, so the tray stays small). */
async function openApprovalDocument(a: PendingApproval, go: Go): Promise<void> {
  const { openReviewDocument } = await import('./surfaces/Review');
  openReviewDocument({ id: a.id, programId: a.programId ?? null, prog: a.prog }, go);
}

const OPEN_FAILED = 'This item could not be opened. Try again, or open Review.';
const failMessage = (e: unknown) => (e instanceof Error && e.message ? e.message : OPEN_FAILED);

/** One row: a dot whose tone repeats the words beside it, a title, a line of detail.
 *  The dot shows only where something is late or blocked (`err`, `warn`). An `ok`
 *  row keeps the dot's place, hidden (`data-quiet`), so the titles stay aligned;
 *  its words already say when it is due (D1 §D1.G step 3). */
function WorkRow({ tone, title, sub, onOpen }: { tone: 'err' | 'warn' | 'ok'; title: string; sub: string; onOpen: () => void }) {
  const quiet = tone === 'ok';
  return (
    <button className="tt-item" onClick={onOpen}>
      <span className={quiet ? 'tt-dot' : `tt-dot tt-dot-${tone}`} data-quiet={quiet ? '' : undefined} aria-hidden />
      <span className="tt-item-body">
        <span className="tt-item-title">{title}</span>
        <span className="tt-item-sub">{sub}</span>
      </span>
      <span className="tt-go">{I.arrowRight}</span>
    </button>
  );
}

function AssignedGroup({ workLoading, workError, assigned, go, openTask }: {
  workLoading: boolean; workError?: string; assigned: MyWorkItem[]; go: Go; openTask: (taskId: string) => void;
}) {
  // The order of need (taskOrderOfNeed.ts; P-131 item 3), the same rule as the Tasks page.
  const ordered = orderByNeed(assigned, myWorkNeed, Date.now());
  const tone = (t: MyWorkItem) => (t.overdue ? 'err' : t.dueSoon || t.blocked ? 'warn' : 'ok');
  /* A review route member is signed on its version, which the Review board
     opens (RR1b); the task board refuses every write to it. One that waits on
     an earlier step says what it waits on, not "blocked". */
  const [openError, setOpenError] = React.useState('');
  const open = (t: MyWorkItem) => {
    setOpenError('');
    if (!t.reviewRole) return openTask(t.taskId);
    /* A Vault route opens its version (GA-UI-04). A QMS or Authoring route's
       task names no record the client can read yet, so it opens Review. */
    if (t.moduleType !== 'Vault') return go('review');
    openRouteVersion(t.taskId, go).catch((e) => setOpenError(failMessage(e)));
  };
  const state = (t: MyWorkItem) =>
    t.waitingOn ? ` · waiting on ${t.waitingOn === 'review' ? 'the review' : t.waitingOn}` : t.blocked ? ' · blocked' : '';
  return (
    <div className="tt-group">
      <div className="tt-group-head">Assigned to you</div>
      {openError && <div className="tt-empty" role="alert">{openError}</div>}
      {workLoading ? (
        <div className="tt-empty">Loading…</div>
      ) : workError ? (
        <div className="tt-empty" role="alert">Couldn't load your tasks — retry from the board.</div>
      ) : !ordered.length ? (
        <div className="tt-empty">Nothing assigned to you right now. Tasks land here as soon as someone assigns you one.</div>
      ) : ordered.slice(0, 8).map(t => (
        <WorkRow key={t.taskId} tone={tone(t)} title={t.title} onOpen={() => open(t)}
          sub={`${t.projectName ? `${t.projectName} · ` : ''}${clModLabel(t.moduleType)}${state(t)}${t.dueDate && !t.waitingOn ? ` · ${dueLabel(t.dueDate)}` : ''}`} />
      ))}
      {ordered.length > 8 && (
        <button className="tt-more" onClick={() => go('tasks')}>+{ordered.length - 8} more on the board</button>
      )}
    </div>
  );
}

function ApprovalsGroup({ assigned, approvalRows, approvalsError, go, openTask }: {
  assigned: MyWorkItem[]; approvalRows: PendingApproval[]; approvalsError?: string; go: Go; openTask: (taskId: string) => void;
}) {
  // "Not yet approved", not "== pending": approval_status is nullable with no
  // default and nothing writes 'pending', so the old predicate meant this
  // group could never list a task.
  const approvalsFromBoard = assigned.filter(t => t.approvalRequired && t.approvalStatus !== 'approved');
  const [openError, setOpenError] = React.useState('');
  if (!approvalsFromBoard.length && !approvalRows.length && !approvalsError) return null;
  return (
    <div className="tt-group">
      <div className="tt-group-head">Approvals — you sign</div>
      {approvalsError && (
        <div className="tt-empty" role="alert">
          Couldn't load your approvals, so this list may be incomplete — open Review to check.
        </div>
      )}
      {openError && <div className="tt-empty" role="alert">{openError}</div>}
      {approvalsFromBoard.map(t => (
        <WorkRow key={t.taskId} tone="err" title={t.title} onOpen={() => openTask(t.taskId)}
          sub={`Task approval pending${t.dueDate ? ` · ${dueLabel(t.dueDate)}` : ''}`} />
      ))}
      {approvalRows.slice(0, 5).map((a) => (
        <WorkRow key={a.id} tone="err" title={a.doc || 'Document approval'}
          onOpen={() => { setOpenError(''); openApprovalDocument(a, go).catch((e) => setOpenError(failMessage(e))); }}
          sub={`${a.role ? `${a.role} · ` : ''}${a.prog ? `${a.prog} · ` : ''}awaiting your sign-off`} />
      ))}
      {/* Without this, someone with 7 pending approvals saw 5 and had no
          signal the other 2 existed — for signature-required items. */}
      {approvalRows.length > 5 && (
        <button className="tt-more" onClick={() => go('review')}>
          +{approvalRows.length - 5} more awaiting your sign-off
        </button>
      )}
    </div>
  );
}

function ReviewGroup({ queue, queueError, go }: { queue: MyQueue | null; queueError?: string; go: Go }) {
  const reviewTasks = queue?.tasks ?? [];
  const reviewThreads = queue?.threads ?? [];
  if (!reviewTasks.length && !reviewThreads.length && !queueError) return null;
  return (
    <div className="tt-group">
      <div className="tt-group-head">Review — threads &amp; change requests</div>
      {queueError && (
        <div className="tt-empty" role="alert">
          Couldn't load your review queue, so this list may be incomplete — open Review to check.
        </div>
      )}
      {reviewTasks.slice(0, 5).map(t => (
        <WorkRow key={t.taskId} tone="warn" title={t.title} onOpen={() => go('review')}
          sub={`${t.artifactTitle || 'Review task'}${t.dueAt ? ` · ${dueLabel(t.dueAt)}` : ''}`} />
      ))}
      {reviewThreads.slice(0, 5).map(t => (
        <WorkRow key={t.threadId} tone="warn" title={t.title || 'Review thread'} onOpen={() => go('review')}
          sub={t.artifactTitle || 'Open discussion assigned to you'} />
      ))}
      {(reviewTasks.length > 5 || reviewThreads.length > 5) && (
        <button className="tt-more" onClick={() => go('review')}>
          +{Math.max(reviewTasks.length - 5, 0) + Math.max(reviewThreads.length - 5, 0)} more in review
        </button>
      )}
    </div>
  );
}

interface PendingArtifactReview { assignmentId: string; artifactTitle: string | null; reviewRound: number; dueDate: string | null }

/** The AnA artifact reviews you were named for (P-95), decided on the Review screen (surfaces/ReviewRequests.tsx).
 *  `/reviews/my-queue` carries threads and tasks, not these, so a named reviewer saw nothing waiting for them. */
function NamedReviewGroup({ go }: { go: Go }) {
  const pending = useLiveData<{ assignments: PendingArtifactReview[] }>('/api/concept2cure/reviews/pending', ['open-work-named-reviews']);
  const rows = pending.data?.assignments ?? [];
  if (pending.loading || (!rows.length && !pending.error)) return null;
  return (
    <div className="tt-group">
      <div className="tt-group-head">Reviews you were named for</div>
      {pending.error && (
        <div className="tt-empty" role="alert">Couldn&apos;t load the reviews you were named for, so this list may be incomplete — open Review to check.</div>
      )}
      {rows.slice(0, 5).map(r => (
        <WorkRow key={r.assignmentId} tone="warn" title={r.artifactTitle || 'AnA artifact'} onOpen={() => go('review')}
          sub={`Round ${r.reviewRound} · your decision${r.dueDate ? ` · ${dueLabel(r.dueDate)}` : ''}`} />
      ))}
      {rows.length > 5 && <button className="tt-more" onClick={() => go('review')}>+{rows.length - 5} more to review</button>}
    </div>
  );
}

export function OpenWorkGroups({ workLoading, workError, assigned, queue, queueError, approvalRows, approvalsError, go, openTask, assignedListed = true }: {
  /** False where the page lists the assigned tasks itself (Tasks, whose grouped list is that list): the
   *  approvals and reviews are listed here, the tasks are not listed twice. */
  assignedListed?: boolean;
  workLoading: boolean;
  workError?: string;
  assigned: MyWorkItem[];
  queue: MyQueue | null;
  /** Fetch failures are passed in, not swallowed: an empty approvals list and a
   *  failed approvals fetch must not look the same on a surface whose job is
   *  telling someone what needs their signature. */
  queueError?: string;
  approvalRows: PendingApproval[];
  approvalsError?: string;
  go: Go;
  openTask: (taskId: string) => void;
}) {
  return (
    <>
      {assignedListed && <AssignedGroup workLoading={workLoading} workError={workError} assigned={assigned} go={go} openTask={openTask} />}
      <ApprovalsGroup assigned={assigned} approvalRows={approvalRows} approvalsError={approvalsError} go={go} openTask={openTask} />
      <NamedReviewGroup go={go} />
      <ReviewGroup queue={queue} queueError={queueError} go={go} />
    </>
  );
}
