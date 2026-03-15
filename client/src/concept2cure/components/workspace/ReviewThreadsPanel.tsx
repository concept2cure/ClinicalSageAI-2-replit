/**
 * ReviewThreadsPanel — Review threads, comments, and tasks tab for GovernedDocumentPanel.
 *
 * Renders three sub-tabs: Threads, Tasks, Queue.
 * All data from real backend APIs (Phase 13).
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  Loader2,
  User,
  ListTodo,
  CornerDownRight,
  RotateCcw,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Auth ─────────────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Types ────────────────────────────────────────────────────────────────────
interface ReviewThread {
  threadId: string;
  title: string;
  status: 'open' | 'resolved';
  priority?: string;
  anchorType?: string;
  anchorKey?: string;
  anchorLabel?: string;
  versionId?: number;
  createdById: number;
  createdByName: string;
  createdByRole?: string;
  assigneeId?: number;
  assigneeName?: string;
  commentCount: number;
  resolvedAt?: string;
  resolvedByName?: string;
  createdAt: string;
  updatedAt: string;
}

interface ThreadComment {
  commentId: string;
  authorId: number;
  authorName: string;
  authorRole?: string;
  body: string;
  kind: 'comment' | 'request_changes' | 'system';
  parentCommentId?: number;
  versionId?: number;
  createdAt: string;
  editedAt?: string;
}

interface ReviewTask {
  taskId: string;
  title: string;
  description?: string;
  taskType: string;
  status: string;
  createdById: number;
  createdByName: string;
  assignedToId?: number;
  assignedToName?: string;
  threadId?: number;
  versionId?: number;
  dueAt?: string;
  resolvedAt?: string;
  resolvedByName?: string;
  createdAt: string;
  updatedAt: string;
}

interface ReviewThreadsPanelProps {
  projectId: string;
  artifactId: string; // the route-level artifactId (string like "art_xxx")
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return iso;
  }
}

// ── Main Component ───────────────────────────────────────────────────────────
export function ReviewThreadsPanel({ projectId, artifactId }: ReviewThreadsPanelProps) {
  const [subTab, setSubTab] = useState<'threads' | 'tasks'>('threads');
  const [threads, setThreads] = useState<ReviewThread[]>([]);
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedThread, setExpandedThread] = useState<string | null>(null);
  const [threadComments, setThreadComments] = useState<Record<string, ThreadComment[]>>({});
  const [loadingComments, setLoadingComments] = useState<string | null>(null);

  // New thread form
  const [showNewThread, setShowNewThread] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadComment, setNewThreadComment] = useState('');
  const [creating, setCreating] = useState(false);

  // Reply form
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);

  // ── Fetch threads ──────────────────────────────────────────────
  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/review-threads`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const payload = await res.json();
        setThreads(payload.data?.threads || []);
      }
    } catch {
      // silent
    }
  }, [projectId, artifactId]);

  // ── Fetch tasks ────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/review-tasks`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const payload = await res.json();
        setTasks(payload.data?.tasks || []);
      }
    } catch {
      // silent
    }
  }, [projectId, artifactId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchThreads(), fetchTasks()]).finally(() => setLoading(false));
  }, [fetchThreads, fetchTasks]);

  // ── Fetch comments for a thread ────────────────────────────────
  const fetchComments = useCallback(async (threadId: string) => {
    setLoadingComments(threadId);
    try {
      const res = await fetch(`/api/concept2cure/review-threads/${threadId}/comments`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const payload = await res.json();
        setThreadComments(prev => ({
          ...prev,
          [threadId]: payload.data?.comments || [],
        }));
      }
    } catch {
      // silent
    } finally {
      setLoadingComments(null);
    }
  }, []);

  const toggleThread = (threadId: string) => {
    if (expandedThread === threadId) {
      setExpandedThread(null);
    } else {
      setExpandedThread(threadId);
      if (!threadComments[threadId]) {
        fetchComments(threadId);
      }
    }
  };

  // ── Create thread ──────────────────────────────────────────────
  const handleCreateThread = async () => {
    if (!newThreadTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(
        `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/review-threads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            title: newThreadTitle.trim(),
            initialComment: newThreadComment.trim() || undefined,
          }),
        }
      );
      if (res.ok) {
        setNewThreadTitle('');
        setNewThreadComment('');
        setShowNewThread(false);
        await fetchThreads();
      }
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  };

  // ── Reply to thread ────────────────────────────────────────────
  const handleReply = async (threadId: string) => {
    if (!replyBody.trim()) return;
    setReplying(true);
    try {
      const res = await fetch(`/api/concept2cure/review-threads/${threadId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ body: replyBody.trim() }),
      });
      if (res.ok) {
        setReplyBody('');
        setReplyTarget(null);
        await fetchComments(threadId);
        await fetchThreads(); // update comment count
      }
    } catch {
      // silent
    } finally {
      setReplying(false);
    }
  };

  // ── Resolve/reopen thread ─────────────────────────────────────
  const handleResolveThread = async (threadId: string) => {
    try {
      await fetch(`/api/concept2cure/review-threads/${threadId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      await fetchThreads();
    } catch {
      // silent
    }
  };

  const handleReopenThread = async (threadId: string) => {
    try {
      await fetch(`/api/concept2cure/review-threads/${threadId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      await fetchThreads();
    } catch {
      // silent
    }
  };

  // ── Resolve/reopen task ────────────────────────────────────────
  const handleResolveTask = async (taskId: string) => {
    try {
      await fetch(`/api/concept2cure/review-tasks/${taskId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      await fetchTasks();
    } catch {
      // silent
    }
  };

  const handleReopenTask = async (taskId: string) => {
    try {
      await fetch(`/api/concept2cure/review-tasks/${taskId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      await fetchTasks();
    } catch {
      // silent
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
      </div>
    );
  }

  const openThreads = threads.filter(t => t.status === 'open');
  const resolvedThreads = threads.filter(t => t.status === 'resolved');
  const openTasks = tasks.filter(t => t.status === 'open' || t.status === 'in_progress');
  const closedTasks = tasks.filter(t => t.status === 'resolved' || t.status === 'closed');

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab bar */}
      <div className="flex border-b border-zinc-100 px-2">
        {(['threads', 'tasks'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={cn(
              'flex-1 py-1.5 text-[9px] font-medium capitalize transition-colors flex items-center justify-center gap-1',
              subTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-zinc-400 hover:text-zinc-600'
            )}
          >
            {tab === 'threads' ? (
              <MessageSquare className="w-3 h-3" />
            ) : (
              <ListTodo className="w-3 h-3" />
            )}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span className="text-[8px] text-zinc-400 ml-0.5">
              ({tab === 'threads' ? openThreads.length : openTasks.length})
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {subTab === 'threads' ? (
          <div className="p-2">
            {/* New thread button */}
            <button
              onClick={() => setShowNewThread(!showNewThread)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors mb-2"
            >
              <Plus className="w-3 h-3" />
              New Thread
            </button>

            {/* New thread form */}
            {showNewThread && (
              <div className="mb-3 p-2 bg-zinc-50 rounded-lg border border-zinc-200 space-y-2">
                <input
                  type="text"
                  value={newThreadTitle}
                  onChange={e => setNewThreadTitle(e.target.value)}
                  placeholder="Thread title..."
                  className="w-full px-2 py-1 text-[10px] bg-white border border-zinc-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  maxLength={500}
                />
                <textarea
                  value={newThreadComment}
                  onChange={e => setNewThreadComment(e.target.value)}
                  placeholder="Initial comment (optional)..."
                  className="w-full px-2 py-1 text-[10px] bg-white border border-zinc-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                  rows={2}
                  maxLength={10000}
                />
                <div className="flex gap-1.5 justify-end">
                  <button
                    onClick={() => {
                      setShowNewThread(false);
                      setNewThreadTitle('');
                      setNewThreadComment('');
                    }}
                    className="px-2 py-0.5 text-[9px] text-zinc-500 hover:bg-zinc-200 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateThread}
                    disabled={creating || !newThreadTitle.trim()}
                    className="px-2 py-0.5 text-[9px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {creating ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
                    Create
                  </button>
                </div>
              </div>
            )}

            {/* Open threads */}
            {openThreads.length === 0 && resolvedThreads.length === 0 && (
              <p className="text-[10px] text-zinc-400 text-center py-4">No review threads yet</p>
            )}

            {openThreads.map(thread => (
              <ThreadCard
                key={thread.threadId}
                thread={thread}
                expanded={expandedThread === thread.threadId}
                comments={threadComments[thread.threadId]}
                loadingComments={loadingComments === thread.threadId}
                onToggle={() => toggleThread(thread.threadId)}
                onResolve={() => handleResolveThread(thread.threadId)}
                replyTarget={replyTarget}
                replyBody={replyBody}
                replying={replying}
                onSetReplyTarget={setReplyTarget}
                onSetReplyBody={setReplyBody}
                onReply={() => handleReply(thread.threadId)}
              />
            ))}

            {/* Resolved threads section */}
            {resolvedThreads.length > 0 && (
              <div className="mt-3">
                <p className="text-[9px] text-zinc-400 font-medium mb-1.5 px-1">
                  Resolved ({resolvedThreads.length})
                </p>
                {resolvedThreads.map(thread => (
                  <ThreadCard
                    key={thread.threadId}
                    thread={thread}
                    expanded={expandedThread === thread.threadId}
                    comments={threadComments[thread.threadId]}
                    loadingComments={loadingComments === thread.threadId}
                    onToggle={() => toggleThread(thread.threadId)}
                    onReopen={() => handleReopenThread(thread.threadId)}
                    replyTarget={replyTarget}
                    replyBody={replyBody}
                    replying={replying}
                    onSetReplyTarget={setReplyTarget}
                    onSetReplyBody={setReplyBody}
                    onReply={() => handleReply(thread.threadId)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Tasks sub-tab */
          <div className="p-2">
            {openTasks.length === 0 && closedTasks.length === 0 && (
              <p className="text-[10px] text-zinc-400 text-center py-4">No review tasks yet</p>
            )}

            {openTasks.map(task => (
              <TaskCard
                key={task.taskId}
                task={task}
                onResolve={() => handleResolveTask(task.taskId)}
              />
            ))}

            {closedTasks.length > 0 && (
              <div className="mt-3">
                <p className="text-[9px] text-zinc-400 font-medium mb-1.5 px-1">
                  Resolved ({closedTasks.length})
                </p>
                {closedTasks.map(task => (
                  <TaskCard
                    key={task.taskId}
                    task={task}
                    onReopen={() => handleReopenTask(task.taskId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ThreadCard ───────────────────────────────────────────────────────────────
interface ThreadCardProps {
  thread: ReviewThread;
  expanded: boolean;
  comments?: ThreadComment[];
  loadingComments: boolean;
  onToggle: () => void;
  onResolve?: () => void;
  onReopen?: () => void;
  replyTarget: string | null;
  replyBody: string;
  replying: boolean;
  onSetReplyTarget: (id: string | null) => void;
  onSetReplyBody: (v: string) => void;
  onReply: () => void;
}

function ThreadCard({
  thread,
  expanded,
  comments,
  loadingComments,
  onToggle,
  onResolve,
  onReopen,
  replyTarget,
  replyBody,
  replying,
  onSetReplyTarget,
  onSetReplyBody,
  onReply,
}: ThreadCardProps) {
  const isOpen = thread.status === 'open';

  return (
    <div
      className={cn(
        'mb-2 rounded-lg border transition-colors',
        isOpen ? 'border-zinc-200 bg-white' : 'border-zinc-100 bg-zinc-50/50'
      )}
    >
      {/* Header */}
      <button onClick={onToggle} className="w-full flex items-start gap-1.5 p-2 text-left">
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-zinc-400 mt-0.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-zinc-400 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-[10px] font-medium truncate',
              isOpen ? 'text-zinc-800' : 'text-zinc-500 line-through'
            )}
          >
            {thread.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[8px] text-zinc-400">{thread.createdByName}</span>
            {thread.anchorLabel && (
              <span className="text-[8px] text-violet-500 bg-violet-50 px-1 rounded">
                {thread.anchorLabel}
              </span>
            )}
            <span className="text-[8px] text-zinc-400">
              {thread.commentCount} {thread.commentCount === 1 ? 'comment' : 'comments'}
            </span>
          </div>
        </div>
        {isOpen && thread.priority === 'high' && (
          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
        )}
        {!isOpen && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-2 pb-2 border-t border-zinc-100">
          {loadingComments ? (
            <div className="py-3 flex justify-center">
              <Loader2 className="w-3 h-3 animate-spin text-zinc-300" />
            </div>
          ) : (
            <>
              {/* Comments list */}
              <div className="space-y-2 mt-2">
                {(comments || []).map(c => (
                  <div
                    key={c.commentId}
                    className={cn(
                      'rounded p-1.5',
                      c.kind === 'system'
                        ? 'bg-zinc-50 border border-zinc-100'
                        : c.kind === 'request_changes'
                          ? 'bg-amber-50 border border-amber-100'
                          : 'bg-white border border-zinc-100'
                    )}
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      <User className="w-2.5 h-2.5 text-zinc-400" />
                      <span className="text-[9px] font-medium text-zinc-700">{c.authorName}</span>
                      {c.kind === 'request_changes' && (
                        <span className="text-[7px] bg-amber-200 text-amber-800 px-1 rounded font-medium">
                          CHANGES REQUESTED
                        </span>
                      )}
                      {c.kind === 'system' && (
                        <span className="text-[7px] bg-zinc-200 text-zinc-600 px-1 rounded font-medium">
                          SYSTEM
                        </span>
                      )}
                      <span className="text-[8px] text-zinc-400 ml-auto">
                        {formatTime(c.createdAt)}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-600 whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>

              {/* Reply form */}
              {isOpen && (
                <div className="mt-2">
                  {replyTarget === thread.threadId ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={replyBody}
                        onChange={e => onSetReplyBody(e.target.value)}
                        placeholder="Reply..."
                        className="flex-1 px-2 py-1 text-[10px] bg-white border border-zinc-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                        maxLength={10000}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onReply();
                          }
                        }}
                      />
                      <button
                        onClick={onReply}
                        disabled={replying || !replyBody.trim()}
                        className="px-1.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {replying ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Send className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          onSetReplyTarget(null);
                          onSetReplyBody('');
                        }}
                        className="px-1 py-1 text-zinc-400 hover:bg-zinc-100 rounded"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSetReplyTarget(thread.threadId)}
                      className="flex items-center gap-1 text-[9px] text-blue-600 hover:text-blue-700"
                    >
                      <CornerDownRight className="w-3 h-3" />
                      Reply
                    </button>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-1.5 mt-2 pt-1.5 border-t border-zinc-100">
                {isOpen && onResolve && (
                  <button
                    onClick={onResolve}
                    className="flex items-center gap-1 text-[9px] text-emerald-600 hover:text-emerald-700"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Resolve
                  </button>
                )}
                {!isOpen && onReopen && (
                  <button
                    onClick={onReopen}
                    className="flex items-center gap-1 text-[9px] text-amber-600 hover:text-amber-700"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reopen
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── TaskCard ─────────────────────────────────────────────────────────────────
interface TaskCardProps {
  task: ReviewTask;
  onResolve?: () => void;
  onReopen?: () => void;
}

function TaskCard({ task, onResolve, onReopen }: TaskCardProps) {
  const isActive = task.status === 'open' || task.status === 'in_progress';
  const typeLabel =
    task.taskType === 'change_request'
      ? 'Change Request'
      : task.taskType === 'follow_up'
        ? 'Follow-up'
        : 'Task';

  return (
    <div
      className={cn(
        'mb-2 rounded-lg border p-2',
        isActive ? 'border-zinc-200 bg-white' : 'border-zinc-100 bg-zinc-50/50'
      )}
    >
      <div className="flex items-start gap-1.5">
        <ListTodo
          className={cn('w-3 h-3 mt-0.5 shrink-0', isActive ? 'text-blue-500' : 'text-emerald-500')}
        />
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-[10px] font-medium',
              isActive ? 'text-zinc-800' : 'text-zinc-500 line-through'
            )}
          >
            {task.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[8px] bg-zinc-100 text-zinc-500 px-1 rounded">{typeLabel}</span>
            {task.assignedToName && (
              <span className="text-[8px] text-zinc-400">→ {task.assignedToName}</span>
            )}
            {task.dueAt && (
              <span className="text-[8px] text-zinc-400 flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                {formatTime(task.dueAt)}
              </span>
            )}
          </div>
          {task.description && <p className="text-[9px] text-zinc-500 mt-1">{task.description}</p>}
        </div>
      </div>
      <div className="flex gap-1.5 mt-1.5 pl-4">
        {isActive && onResolve && (
          <button
            onClick={onResolve}
            className="flex items-center gap-1 text-[9px] text-emerald-600 hover:text-emerald-700"
          >
            <CheckCircle2 className="w-3 h-3" />
            Resolve
          </button>
        )}
        {!isActive && onReopen && (
          <button
            onClick={onReopen}
            className="flex items-center gap-1 text-[9px] text-amber-600 hover:text-amber-700"
          >
            <RotateCcw className="w-3 h-3" />
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}

export default ReviewThreadsPanel;
