import React, { useState } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import { apiCall, apiErrorText } from '../apiCall';

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


export function ReviewThreadsPane({ onNotice }: { onNotice: (m: string) => void }) {
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
  const selected = threads.find(t => t.threadId === sel) ?? null;
  const refresh = () => setRefreshKey(k => k + 1);

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
      onNotice(apiErrorText(res, 'Could not post the comment.'));
    }
    setBusy(false);
  };

  const resolveThread = async (threadId: string) => {
    const res = await apiCall('POST', `/api/concept2cure/review-threads/${encodeURIComponent(threadId)}/resolve`, {});
    if (res.ok) {
      if (sel === threadId) setSel(null);
      refresh();
      onNotice('Thread resolved — the linked work item is closed.');
    } else {
      onNotice(apiErrorText(res, 'Could not resolve the thread.'));
    }
  };

  const resolveTask = async (taskId: string, title: string) => {
    const res = await apiCall('POST', `/api/concept2cure/review-tasks/${encodeURIComponent(taskId)}/resolve`, {});
    if (res.ok) {
      refresh();
      onNotice(`Resolved: ${title}`);
    } else {
      onNotice(apiErrorText(res, 'Could not resolve the task.'));
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
                  <button className="btn ghost" onClick={() => resolveThread(selected.threadId)}>{I.check} Resolve thread</button>
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
                  <button
                    type="button"
                    className={`tb-chip${requestChanges ? ' on' : ''}`}
                    aria-pressed={requestChanges}
                    onClick={() => setRequestChanges(v => !v)}
                    title="Post as a formal change request — creates a tracked work item"
                  >
                    {I.alertTriangle} Request changes
                  </button>
                  <button className="btn ghost" disabled={!body.trim() || busy} onClick={() => void post()}>
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
