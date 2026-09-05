import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { apiCall, apiErrorText } from '../apiCall';
import type { FireToast } from '../toast';

/* ================================================================
   Review threads — the compose side of the Phase-13 collaboration
   backend, which shipped complete and E2E-tested with no client
   consumer at all (assessment P1). This pane is where a reviewer:

     · sees the threads and review tasks assigned to them
       (GET /api/concept2cure/reviews/my-queue),
     · reads a thread's comments
       (GET /review-threads/:threadId/comments),
     · replies or formally requests changes
       (POST …/comments, kind comment | request_changes — server-side
       RBAC decides who may request changes),
     · resolves the thread or a review task (POST …/resolve) — which
       also closes the linked PM work item server-side.

   Every mutation is persisted, notified and provenance-tracked by the
   existing backend; nothing here is session-local.
   ================================================================ */

interface QueueThread {
  threadId: string;
  title: string | null;
  priority?: string | null;
  artifactTitle?: string | null;
  anchorLabel?: string | null;
  createdByName?: string | null;
}
interface QueueTask {
  taskId: string;
  title: string;
  taskType?: string;
  dueAt?: string | null;
  artifactTitle?: string | null;
}
interface MyQueuePayload {
  threads: QueueThread[];
  tasks: QueueTask[];
  totalThreads: number;
  totalTasks: number;
  /** What the SERVER will let this caller do — derived from the same
   *  getThreadPermissions() the enforcement uses, so the button and the guard
   *  cannot drift. Optional: an older server omits it, and we fail closed. */
  permissions?: {
    canComment: boolean;
    canRequestChanges: boolean;
    canResolve: boolean;
  };
}
interface CommentRow {
  commentId: string;
  authorName: string;
  authorRole?: string | null;
  body: string;
  kind: string;
  createdAt: string;
}
interface CommentsPayload {
  threadId: string;
  totalComments: number;
  comments: CommentRow[];
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initials(name: string): string {
  return (name || '?').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
}


/**
 * The approval-board slice of the parent Review surface's screen state, merged
 * into THIS pane's published context — the pane is the surface's ONE 'review'
 * publisher (two publishers on one id fight for the store), and without the
 * merge AnA saw the threads queue but not one fact about the approval board
 * beside it. 'loading'/'error' ship as themselves: a zero count over an
 * outage is a different truth from an empty board.
 */
export interface ReviewBoardContextSlice {
  state: 'loading' | 'error' | 'ready';
  queueCount?: number;
  awaitingDecision?: number;
  selectedDoc?: string | null;
  selectedState?: string | null;
}

export function ReviewThreadsPane({
  onNotice,
  board,
}: {
  onNotice: FireToast;
  board?: ReviewBoardContextSlice | null;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [requestChanges, setRequestChanges] = useState(false);
  const [busy, setBusy] = useState(false);

  const queue = useLiveData<MyQueuePayload>('/api/concept2cure/reviews/my-queue', ['rt-queue', refreshKey]);
  const comments = useLiveData<CommentsPayload>(
    sel ? `/api/concept2cure/review-threads/${encodeURIComponent(sel)}/comments` : null,
    ['rt-comments', sel, refreshKey]
  );

  const threads = queue.data?.threads ?? [];
  const tasks = queue.data?.tasks ?? [];
  /* Governed actions the SERVER says this caller may perform. my-queue holds
     threads assigned to you, and an admin can assign one to an author — who has
     read+comment only. Rendering Resolve to them produced a button that 403s
     every time. Default to false while the payload is in flight so nothing
     governed flashes into view before we know. */
  const perms = queue.data?.permissions;
  const canResolve = perms?.canResolve === true;
  const canRequestChanges = perms?.canRequestChanges === true;
  const canComment = perms?.canComment !== false;
  const selected = threads.find(t => t.threadId === sel) ?? null;
  const refresh = () => setRefreshKey(k => k + 1);

  /* What AnA can see of this screen. Without it she knew the user was on
     "review" and not what was in their queue, so "what needs me?" — the exact
     question this surface exists to answer — had to be re-typed by the user. */
  const anaContext = useMemo(() => {
    // A failed or still-loading my-queue read must NOT publish "0 open threads
    // and 0 review tasks assigned to you" — that is this surface answering the
    // exact question it exists for ("what needs me?") with a confident all-clear
    // from a store that never responded. The `board` slice below was already
    // guarded this way; the primary queue read was the gap.
    if (queue.loading) {
      return { summary: 'Your review queue is still loading; nothing on screen is final yet.' };
    }
    if (queue.error) {
      return {
        summary:
          'Your review queue could not be read, so nothing is listed — this is a failure, not an ' +
          'empty queue. How many threads and tasks await you is unknown, not zero.',
        facts: { queueState: 'error', readFailure: queue.error },
        availableActions: ['Retry the review-queue read'],
      };
    }
    // Every thread here is already open — my-queue filters status='open'
    // server-side, so there is nothing to re-filter and no status field to do
    // it with.
    const boardLine =
      board == null
        ? ''
        : board.state === 'loading'
          ? ' The approval board is still loading.'
          : board.state === 'error'
            ? ' The approval board could not be read — its counts are a failure, not zeros.'
            : ` Approval board: ${board.queueCount} document(s) in the queue, ${board.awaitingDecision} awaiting a decision` +
              (board.selectedDoc ? `, "${board.selectedDoc}" selected (${board.selectedState}).` : '.');
    return {
      summary:
        `Your review queue: ${threads.length} open thread${threads.length === 1 ? '' : 's'} and ` +
        `${tasks.length} review task${tasks.length === 1 ? '' : 's'} assigned to you.` +
        (selected ? ` The thread "${selected.title || 'untitled'}" is open.` : '') +
        boardLine,
      facts: {
        ...(board && board.state === 'ready'
          ? {
              boardQueueCount: board.queueCount,
              boardAwaitingDecision: board.awaitingDecision,
              boardSelectedDoc: board.selectedDoc ?? null,
            }
          : {}),
        openThreads: threads.length,
        reviewTasks: tasks.length,
        changeRequests: tasks.filter(t => t.taskType === 'change_request').length,
        approvalTasks: tasks.filter(t => t.taskType === 'approval_task').length,
        threads: threads.slice(0, 8).map(t => ({
          threadId: t.threadId, title: t.title, priority: t.priority, artifact: t.artifactTitle,
        })),
        tasks: tasks.slice(0, 8).map(t => ({
          taskId: t.taskId, title: t.title, type: t.taskType, dueAt: t.dueAt,
        })),
        selectedThread: selected ? { threadId: selected.threadId, title: selected.title } : null,
        // So AnA offers only what this caller may actually do.
        permissions: { canComment, canRequestChanges, canResolve },
      },
      availableActions: [
        'Open a thread to read its comments',
        ...(canComment ? ['Reply to the open thread'] : []),
        ...(canRequestChanges ? ['Post a formal change request against the open thread'] : []),
        ...(canResolve ? ['Resolve the open thread'] : []),
        'Resolve a review task assigned to you',
        ...(board && board.state === 'ready'
          ? [
              'Select a document in the review queue to see its workflow, passage and comments',
              'Open the queue and jump to the next document still awaiting a decision',
            ]
          : []),
      ],
    };
  }, [threads, tasks, selected, canComment, canRequestChanges, canResolve, board, queue.loading, queue.error]);
  usePublishSurfaceContext('review', anaContext);

  const post = async () => {
    if (!sel || !body.trim() || busy) return;
    setBusy(true);
    const res = await apiCall(
      'POST',
      `/api/concept2cure/review-threads/${encodeURIComponent(sel)}/comments`,
      { body: body.trim(), kind: requestChanges ? 'request_changes' : 'comment' }
    );
    if (res.ok) {
      setBody('');
      setRequestChanges(false);
      refresh();
      onNotice(requestChanges ? 'Changes requested — the author has been notified.' : 'Comment posted.');
    } else {
      onNotice(apiErrorText(res, "Couldn't post the comment."), 'error');
    }
    setBusy(false);
  };

  const resolveThread = async (threadId: string) => {
    const res = await apiCall('POST', `/api/concept2cure/review-threads/${encodeURIComponent(threadId)}/resolve`, {});
    if (res.ok) {
      if (sel === threadId) setSel(null);
      refresh();
      onNotice('Thread resolved — the linked task is closed.');
    } else {
      onNotice(apiErrorText(res, "Couldn't resolve the thread."), 'error');
    }
  };

  const resolveTask = async (taskId: string, title: string) => {
    const res = await apiCall('POST', `/api/concept2cure/review-tasks/${encodeURIComponent(taskId)}/resolve`, {});
    if (res.ok) {
      refresh();
      onNotice(`Resolved: ${title}`);
    } else {
      onNotice(apiErrorText(res, "Couldn't resolve the task."), 'error');
    }
  };

  return (
    <section aria-label="Review threads assigned to you" style={{ marginTop: 20 }}>
      <div className="dr-seclbl" style={{ padding: '0 0 8px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Threads &amp; change requests — assigned to you</span>
        {queue.data && (
          <span style={{ color: 'var(--text-400)', fontWeight: 400 }}>
            {queue.data.totalThreads} thread{queue.data.totalThreads === 1 ? '' : 's'} · {queue.data.totalTasks} task{queue.data.totalTasks === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {queue.loading ? (
        <div className="scaf-note" style={{ padding: '10px 4px' }}>Loading your review queue…</div>
      ) : queue.error ? (
        <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load your review queue" hint={queue.error} />
      ) : !threads.length && !tasks.length ? (
        <EmptyState
          icon={I.messageSquare}
          title="No review threads are waiting on you"
          hint="When a colleague opens a thread or a change request against a document you review, it lands here — reply, request changes, or resolve it in place."
        />
      ) : (
        <div className="split">
          <div className="split-list">
            {threads.map(t => (
              <button key={t.threadId} className="lrow" data-on={sel === t.threadId || undefined} onClick={() => setSel(sel === t.threadId ? null : t.threadId)}>
                <div className="lrow-top">
                  <span className="mono">{t.anchorLabel || 'thread'}</span>
                  {t.priority && <span className={`rd-chip tone-${t.priority === 'high' ? 'err' : t.priority === 'medium' ? 'warn' : 'idle'}`}>{t.priority}</span>}
                </div>
                <div className="lrow-title">{t.title || 'Review thread'}</div>
                <div className="lrow-meta"><span>{t.artifactTitle || ''}{t.createdByName ? ` · opened by ${t.createdByName}` : ''}</span></div>
              </button>
            ))}
            {tasks.map(t => (
              <div key={t.taskId} className="lrow" style={{ cursor: 'default' }}>
                <div className="lrow-top">
                  <span className="mono">{t.taskType === 'change_request' ? 'change request' : 'review task'}</span>
                </div>
                <div className="lrow-title">{t.title}</div>
                <div className="lrow-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{t.artifactTitle || ''}</span>
                  {/* The task route permits either `resolve` permission OR
                      being the assignee, and my-queue only ever returns tasks
                      assigned to the caller — so this one stays visible. */}
                  <button className="btn ghost" style={{ height: 26 }} onClick={() => resolveTask(t.taskId, t.title)}>Resolve</button>
                </div>
              </div>
            ))}
          </div>

          <div className="split-detail">
            {!selected ? (
              <EmptyState icon={I.messageSquare} title="Select a thread" hint="Its comments load here — reply, request changes, or resolve it." />
            ) : (
              <>
                <div className="dt-head">
                  <div>
                    <div className="dt-eyebrow">{selected.artifactTitle || 'Review thread'}</div>
                    <h3 className="dt-title">{selected.title || 'Review thread'}</h3>
                  </div>
                  {/* Primary, not ghost: this is the completing action of the
                      panel and had no visual weight at all, so the eye had no
                      anchor. Hidden outright when the caller lacks `resolve` —
                      the server 403s, and a disabled button someone can never
                      enable is just clutter. */}
                  {canResolve && (
                    <button className="btn primary" onClick={() => resolveThread(selected.threadId)}>{I.check} Resolve thread</button>
                  )}
                </div>

                {comments.loading ? (
                  <div className="scaf-note" style={{ padding: '10px 4px' }}>Loading comments…</div>
                ) : comments.error ? (
                  <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load the comments" hint={comments.error} />
                ) : (
                  <div className="thread">
                    {(comments.data?.comments ?? []).map(c => (
                      <div key={c.commentId} className="cmt" data-changes={c.kind === 'request_changes' || undefined}>
                        <div className="cmt-meta">
                          <span className="cmt-av">{initials(c.authorName)}</span>
                          <b>{c.authorName}</b>
                          {c.authorRole && <span className="cmt-role">{c.authorRole}</span>}
                          <span className="cmt-when">· {when(c.createdAt)}</span>
                          {c.kind === 'request_changes' && <span className="rd-chip tone-warn">changes requested</span>}
                        </div>
                        <div className="cmt-body">{c.body}</div>
                      </div>
                    ))}
                    {!(comments.data?.comments ?? []).length && (
                      <div className="scaf-note" style={{ padding: '8px 4px' }}>No comments yet — start the discussion below.</div>
                    )}
                  </div>
                )}

                <div className="rv-reply" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <input
                    className="rv-reply-in"
                    placeholder={requestChanges ? 'Describe the changes you need…' : 'Reply to this thread…'}
                    aria-label="Comment"
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void post(); } }}
                  />
                  {canRequestChanges && (
                    <button
                      type="button"
                      className={`tb-chip${requestChanges ? ' on' : ''}`}
                      aria-pressed={requestChanges}
                      onClick={() => setRequestChanges(v => !v)}
                      title="Post as a formal change request — creates a task to track the fix"
                    >
                      {I.alertTriangle} Request changes
                    </button>
                  )}
                  <button className="btn primary" disabled={!body.trim() || busy || !canComment} onClick={() => void post()}>
                    {I.send} {busy ? 'Posting…' : requestChanges ? 'Request changes' : 'Comment'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
