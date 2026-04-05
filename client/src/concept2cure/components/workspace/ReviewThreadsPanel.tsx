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
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { LoadingState } from '@/components/ui/statesV2';
import { WorkspaceTabBar, type WorkspaceTab } from '@/components/ui/workspace-primitives';
import { getThreadTaskTailoring } from '../../config/industry-tailoring';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  dueAt?: string;
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
  industryMode?: string;
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
export function ReviewThreadsPanel({
  projectId,
  artifactId,
  industryMode,
}: ReviewThreadsPanelProps) {
  const tailoring = getThreadTaskTailoring(industryMode);
  const { toast } = useToast();
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
  const [newThreadPriority, setNewThreadPriority] = useState('');
  const [newThreadAnchorType, setNewThreadAnchorType] = useState('');
  const [newThreadAnchorLabel, setNewThreadAnchorLabel] = useState('');
  const [newThreadDueAt, setNewThreadDueAt] = useState('');
  const [creating, setCreating] = useState(false);

  // New task from thread
  const [showNewTask, setShowNewTask] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState('follow_up');
  const [newTaskDueAt, setNewTaskDueAt] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  // Reply form
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);

  // ── Fetch threads ──────────────────────────────────────────────
  const fetchThreads = useCallback(async () => {
    try {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/review-threads`);
      if (res.ok) {
        const payload = await res.json();
        setThreads(payload.data?.threads || []);
      }
    } catch {
      toast({ title: 'Failed to load review threads', variant: 'destructive' });
    }
  }, [projectId, artifactId, toast]);

  // ── Fetch tasks ────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    try {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/review-tasks`);
      if (res.ok) {
        const payload = await res.json();
        setTasks(payload.data?.tasks || []);
      }
    } catch {
      toast({ title: 'Failed to load review tasks', variant: 'destructive' });
    }
  }, [projectId, artifactId, toast]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchThreads(), fetchTasks()]).finally(() => setLoading(false));
  }, [fetchThreads, fetchTasks]);

  // ── Fetch comments for a thread ────────────────────────────────
  const fetchComments = useCallback(async (threadId: string) => {
    setLoadingComments(threadId);
    try {
      const res = await apiRequest('GET', `/api/concept2cure/review-threads/${threadId}/comments`);
      if (res.ok) {
        const payload = await res.json();
        setThreadComments(prev => ({
          ...prev,
          [threadId]: payload.data?.comments || [],
        }));
      }
    } catch {
      toast({ title: 'Failed to load comments', variant: 'destructive' });
    } finally {
      setLoadingComments(null);
    }
  }, [toast]);

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
      const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/review-threads`, {
        title: newThreadTitle.trim(),
        initialComment: newThreadComment.trim() || undefined,
        priority: newThreadPriority || undefined,
        anchorType: newThreadAnchorType || undefined,
        anchorLabel: newThreadAnchorLabel.trim() || undefined,
        dueAt: newThreadDueAt || undefined,
      });
      if (res.ok) {
        setNewThreadTitle('');
        setNewThreadComment('');
        setNewThreadPriority('');
        setNewThreadAnchorType('');
        setNewThreadAnchorLabel('');
        setNewThreadDueAt('');
        setShowNewThread(false);
        toast({ title: 'Thread created' });
        await fetchThreads();
      } else {
        toast({ title: 'Failed to create thread', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to create thread', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  // ── Create task from thread ────────────────────────────────────
  const handleCreateTask = async (threadId: string) => {
    if (!newTaskTitle.trim()) return;
    setCreatingTask(true);
    try {
      const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/review-tasks`, {
        title: newTaskTitle.trim(),
        taskType: newTaskType,
        threadId,
        dueAt: newTaskDueAt || undefined,
      });
      if (res.ok) {
        setNewTaskTitle('');
        setNewTaskType('follow_up');
        setNewTaskDueAt('');
        setShowNewTask(null);
        toast({ title: 'Task created' });
        await fetchTasks();
      } else {
        toast({ title: 'Failed to create task', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to create task', variant: 'destructive' });
    } finally {
      setCreatingTask(false);
    }
  };

  // ── Request changes (special comment kind) ─────────────────────
  const handleRequestChanges = async (threadId: string, body: string) => {
    if (!body.trim()) return;
    try {
      await apiRequest('POST', `/api/concept2cure/review-threads/${threadId}/comments`, { body: body.trim(), kind: 'request_changes' });
      toast({ title: 'Changes requested' });
      await fetchComments(threadId);
      await fetchThreads();
    } catch {
      toast({ title: 'Failed to request changes', variant: 'destructive' });
    }
  };

  // ── Reply to thread ────────────────────────────────────────────
  const handleReply = async (threadId: string) => {
    if (!replyBody.trim()) return;
    setReplying(true);
    try {
      const res = await apiRequest('POST', `/api/concept2cure/review-threads/${threadId}/comments`, { body: replyBody.trim() });
      if (res.ok) {
        setReplyBody('');
        setReplyTarget(null);
        await fetchComments(threadId);
        await fetchThreads(); // update comment count
      } else {
        toast({ title: 'Failed to post reply', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to post reply', variant: 'destructive' });
    } finally {
      setReplying(false);
    }
  };

  // ── Resolve/reopen thread ─────────────────────────────────────
  const handleResolveThread = async (threadId: string) => {
    try {
      await apiRequest('POST', `/api/concept2cure/review-threads/${threadId}/resolve`);
      toast({ title: 'Thread resolved' });
      await fetchThreads();
    } catch {
      toast({ title: 'Failed to resolve thread', variant: 'destructive' });
    }
  };

  const handleReopenThread = async (threadId: string) => {
    try {
      await apiRequest('POST', `/api/concept2cure/review-threads/${threadId}/reopen`);
      toast({ title: 'Thread reopened' });
      await fetchThreads();
    } catch {
      toast({ title: 'Failed to reopen thread', variant: 'destructive' });
    }
  };

  // ── Resolve/reopen task ────────────────────────────────────────
  const handleResolveTask = async (taskId: string) => {
    try {
      await apiRequest('POST', `/api/concept2cure/review-tasks/${taskId}/resolve`);
      toast({ title: 'Task resolved' });
      await fetchTasks();
    } catch {
      toast({ title: 'Failed to resolve task', variant: 'destructive' });
    }
  };

  const handleReopenTask = async (taskId: string) => {
    try {
      await apiRequest('POST', `/api/concept2cure/review-tasks/${taskId}/reopen`);
      toast({ title: 'Task reopened' });
      await fetchTasks();
    } catch {
      toast({ title: 'Failed to reopen task', variant: 'destructive' });
    }
  };

  if (loading) {
    return <LoadingState message="Loading review data…" size="sm" />;
  }

  const openThreads = threads.filter(t => t.status === 'open');
  const resolvedThreads = threads.filter(t => t.status === 'resolved');
  const openTasks = tasks.filter(t => t.status === 'open' || t.status === 'in_progress');
  const closedTasks = tasks.filter(t => t.status === 'resolved' || t.status === 'closed');

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab bar */}
      <WorkspaceTabBar
        tabs={[
          { id: 'threads', label: 'Threads', icon: <MessageSquare className="w-3 h-3" />, count: openThreads.length },
          { id: 'tasks', label: 'Tasks', icon: <ListTodo className="w-3 h-3" />, count: openTasks.length },
        ] satisfies WorkspaceTab[]}
        activeTab={subTab}
        onTabChange={(tabId) => setSubTab(tabId as 'threads' | 'tasks')}
        testId="review-threads-tab-bar"
      />

      <div className="flex-1 overflow-y-auto">
        {subTab === 'threads' ? (
          <div className="p-2">
            {/* New thread button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNewThread(!showNewThread)}
              className="w-full flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 mb-2"
            >
              <Plus className="w-3 h-3" />
              New Thread
            </Button>

            {/* New thread form */}
            {showNewThread && (
              <div className="mb-3 p-2 bg-stone-50 rounded-lg border border-stone-200 space-y-2">
                <Input
                  type="text"
                  value={newThreadTitle}
                  onChange={e => setNewThreadTitle(e.target.value)}
                  placeholder="Thread title..."
                  className="w-full h-7 px-2 text-xs"
                  maxLength={500}
                />
                <div className="flex gap-1.5">
                  <Select value={newThreadPriority} onValueChange={setNewThreadPriority}>
                    <SelectTrigger className="flex-1 h-7 text-xs">
                      <SelectValue placeholder="Priority..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Priority...</SelectItem>
                      {Object.entries(tailoring.priorityLabels).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={newThreadAnchorType} onValueChange={setNewThreadAnchorType}>
                    <SelectTrigger className="flex-1 h-7 text-xs">
                      <SelectValue placeholder="Anchor..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Anchor...</SelectItem>
                      {tailoring.anchorTypes.map(a => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newThreadAnchorType && newThreadAnchorType !== 'general' && (
                  <Input
                    type="text"
                    value={newThreadAnchorLabel}
                    onChange={e => setNewThreadAnchorLabel(e.target.value)}
                    placeholder="Anchor label (e.g. section name)..."
                    className="w-full h-7 px-2 text-xs"
                  />
                )}
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-stone-400 shrink-0">Due</label>
                  <Input
                    type="date"
                    value={newThreadDueAt}
                    onChange={e => setNewThreadDueAt(e.target.value)}
                    className="flex-1 h-7 px-2 text-xs"
                  />
                </div>
                <textarea
                  value={newThreadComment}
                  onChange={e => setNewThreadComment(e.target.value)}
                  placeholder={tailoring.threadPlaceholder}
                  className="w-full px-2 py-1 text-xs bg-white border border-stone-200 rounded focus-visible:ring-2 focus-visible:ring-stone-400 outline-none resize-none"
                  rows={2}
                  maxLength={10000}
                />
                <div className="flex gap-1.5 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNewThread(false);
                      setNewThreadTitle('');
                      setNewThreadComment('');
                      setNewThreadPriority('');
                      setNewThreadAnchorType('');
                      setNewThreadAnchorLabel('');
                      setNewThreadDueAt('');
                    }}
                    className="h-6 px-2 text-xs text-stone-500"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateThread}
                    disabled={creating || !newThreadTitle.trim()}
                    className="h-6 px-2 text-xs"
                  >
                    {creating ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
                    Create
                  </Button>
                </div>
              </div>
            )}

            {/* Open threads */}
            {openThreads.length === 0 && resolvedThreads.length === 0 && (
              <p className="text-xs text-stone-400 text-center py-4">No review threads yet</p>
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
                showNewTask={showNewTask}
                onShowNewTask={setShowNewTask}
                newTaskTitle={newTaskTitle}
                newTaskType={newTaskType}
                newTaskDueAt={newTaskDueAt}
                onSetNewTaskTitle={setNewTaskTitle}
                onSetNewTaskType={setNewTaskType}
                onSetNewTaskDueAt={setNewTaskDueAt}
                onCreateTask={handleCreateTask}
                creatingTask={creatingTask}
                onRequestChanges={handleRequestChanges}
                taskTypeOptions={tailoring.taskTypes}
                priorityLabels={tailoring.priorityLabels}
              />
            ))}

            {/* Resolved threads section */}
            {resolvedThreads.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-stone-400 font-medium mb-1.5 px-1">
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
                    showNewTask={showNewTask}
                    onShowNewTask={setShowNewTask}
                    newTaskTitle={newTaskTitle}
                    newTaskType={newTaskType}
                    newTaskDueAt={newTaskDueAt}
                    onSetNewTaskTitle={setNewTaskTitle}
                    onSetNewTaskType={setNewTaskType}
                    onSetNewTaskDueAt={setNewTaskDueAt}
                    onCreateTask={handleCreateTask}
                    creatingTask={creatingTask}
                    onRequestChanges={handleRequestChanges}
                    taskTypeOptions={tailoring.taskTypes}
                    priorityLabels={tailoring.priorityLabels}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Tasks sub-tab */
          <div className="p-2">
            {openTasks.length === 0 && closedTasks.length === 0 && (
              <p className="text-xs text-stone-400 text-center py-4">No review tasks yet</p>
            )}

            {openTasks.map(task => (
              <TaskCard
                key={task.taskId}
                task={task}
                onResolve={() => handleResolveTask(task.taskId)}
                taskTypeOptions={tailoring.taskTypes}
              />
            ))}

            {closedTasks.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-stone-400 font-medium mb-1.5 px-1">
                  Resolved ({closedTasks.length})
                </p>
                {closedTasks.map(task => (
                  <TaskCard
                    key={task.taskId}
                    task={task}
                    onReopen={() => handleReopenTask(task.taskId)}
                    taskTypeOptions={tailoring.taskTypes}
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
  showNewTask?: string | null;
  onShowNewTask?: (threadId: string | null) => void;
  newTaskTitle?: string;
  newTaskType?: string;
  newTaskDueAt?: string;
  onSetNewTaskTitle?: (v: string) => void;
  onSetNewTaskType?: (v: string) => void;
  onSetNewTaskDueAt?: (v: string) => void;
  onCreateTask?: (threadId: string) => void;
  creatingTask?: boolean;
  onRequestChanges?: (threadId: string, body: string) => void;
  taskTypeOptions?: { value: string; label: string }[];
  priorityLabels?: Record<string, string>;
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
  showNewTask,
  onShowNewTask,
  newTaskTitle,
  newTaskType,
  newTaskDueAt,
  onSetNewTaskTitle,
  onSetNewTaskType,
  onSetNewTaskDueAt,
  onCreateTask,
  creatingTask,
  onRequestChanges,
  taskTypeOptions,
  priorityLabels,
}: ThreadCardProps) {
  const isOpen = thread.status === 'open';
  const [requestChangesBody, setRequestChangesBody] = useState('');
  const [showRequestChanges, setShowRequestChanges] = useState(false);

  const isDueOverdue = thread.dueAt ? new Date(thread.dueAt) < new Date() : false;
  const isDueSoon =
    thread.dueAt && !isDueOverdue
      ? new Date(thread.dueAt).getTime() - Date.now() < 48 * 60 * 60 * 1000
      : false;

  return (
    <div
      className={cn(
        'mb-2 rounded-lg border transition-colors duration-150',
        isOpen ? 'border-stone-200 bg-white' : 'border-stone-200 bg-stone-50/50'
      )}
    >
      {/* Header */}
      <Button variant="ghost" onClick={onToggle} className="w-full flex items-start gap-1.5 p-2 h-auto text-left rounded-none">
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-stone-400 mt-0.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-stone-400 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-xs font-medium truncate',
              isOpen ? 'text-stone-900' : 'text-stone-500 line-through'
            )}
          >
            {thread.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-stone-400">{thread.createdByName}</span>
            {thread.priority && thread.priority !== 'medium' && (
              <span
                className={cn(
                  'text-[7px] px-1 rounded font-medium',
                  thread.priority === 'high'
                    ? 'bg-stone-100 text-stone-800'
                    : 'bg-stone-100 text-stone-500'
                )}
              >
                {priorityLabels?.[thread.priority] || thread.priority.toUpperCase()}
              </span>
            )}
            {thread.anchorLabel && (
              <span className="text-xs text-stone-900 bg-stone-100 px-1 rounded">
                {thread.anchorLabel}
              </span>
            )}
            {thread.dueAt && isOpen && (
              <span
                className={cn(
                  'text-xs flex items-center gap-0.5',
                  isDueOverdue
                    ? 'text-stone-700 font-medium'
                    : isDueSoon
                      ? 'text-stone-600'
                      : 'text-stone-400'
                )}
              >
                <Clock className="w-2.5 h-2.5" />
                {isDueOverdue ? 'Overdue' : formatTime(thread.dueAt)}
              </span>
            )}
            <span className="text-xs text-stone-400">
              {thread.commentCount} {thread.commentCount === 1 ? 'comment' : 'comments'}
            </span>
          </div>
        </div>
        {isOpen && thread.priority === 'high' && (
          <AlertTriangle className="w-3 h-3 text-stone-900 shrink-0" />
        )}
        {!isOpen && <CheckCircle2 className="w-3 h-3 text-stone-900 shrink-0" />}
      </Button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-2 pb-2 border-t border-stone-200">
          {loadingComments ? (
            <div className="py-3 flex justify-center">
              <Loader2 className="w-3 h-3 animate-spin text-stone-400" />
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
                        ? 'bg-stone-50 border border-stone-200'
                        : c.kind === 'request_changes'
                          ? 'bg-stone-100 border border-stone-100'
                          : 'bg-white border border-stone-200'
                    )}
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      <User className="w-2.5 h-2.5 text-stone-400" />
                      <span className="text-xs font-medium text-stone-700">{c.authorName}</span>
                      {c.kind === 'request_changes' && (
                        <span className="text-[7px] bg-stone-200 text-stone-800 px-1 rounded font-medium">
                          CHANGES REQUESTED
                        </span>
                      )}
                      {c.kind === 'system' && (
                        <span className="text-[7px] bg-stone-200 text-stone-600 px-1 rounded font-medium">
                          SYSTEM
                        </span>
                      )}
                      <span className="text-xs text-stone-400 ml-auto">
                        {formatTime(c.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>

              {/* Reply form */}
              {isOpen && (
                <div className="mt-2">
                  {replyTarget === thread.threadId ? (
                    <div className="flex gap-1">
                      <Input
                        type="text"
                        value={replyBody}
                        onChange={e => onSetReplyBody(e.target.value)}
                        placeholder="Reply..."
                        className="flex-1 px-2 py-1 text-xs bg-white border border-stone-200 rounded focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
                        maxLength={10000}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onReply();
                          }
                        }}
                      />
                      <Button
                        onClick={onReply}
                        disabled={replying || !replyBody.trim()}
                        className="px-1.5 py-1 bg-stone-800 text-white rounded hover:bg-stone-900 disabled:opacity-60"
                      >
                        {replying ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Send className="w-3 h-3" />
                        )}
                      </Button>
                      <Button
                        onClick={() => {
                          onSetReplyTarget(null);
                          onSetReplyBody('');
                        }}
                        className="px-1 py-1 text-stone-400 hover:bg-stone-100 rounded"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => onSetReplyTarget(thread.threadId)}
                      className="flex items-center gap-1 text-xs text-stone-600 hover:text-stone-700"
                    >
                      <CornerDownRight className="w-3 h-3" />
                      Reply
                    </Button>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-1.5 mt-2 pt-1.5 border-t border-stone-200 flex-wrap">
                {isOpen && onResolve && (
                  <Button
                    onClick={onResolve}
                    className="flex items-center gap-1 text-xs text-stone-700 hover:text-stone-800"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Resolve
                  </Button>
                )}
                {!isOpen && onReopen && (
                  <Button
                    onClick={onReopen}
                    className="flex items-center gap-1 text-xs text-stone-600 hover:text-stone-700"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reopen
                  </Button>
                )}
                {isOpen && onShowNewTask && (
                  <Button
                    onClick={() =>
                      onShowNewTask(showNewTask === thread.threadId ? null : thread.threadId)
                    }
                    className="flex items-center gap-1 text-xs text-stone-600 hover:text-stone-700"
                  >
                    <ListTodo className="w-3 h-3" />
                    Create Task
                  </Button>
                )}
                {isOpen && onRequestChanges && (
                  <Button
                    onClick={() => setShowRequestChanges(!showRequestChanges)}
                    className="flex items-center gap-1 text-xs text-stone-600 hover:text-stone-700"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Request Changes
                  </Button>
                )}
              </div>

              {/* Create Task from Thread form */}
              {showNewTask === thread.threadId && onCreateTask && (
                <div className="mt-2 p-1.5 bg-stone-100 rounded border border-stone-100 space-y-1.5">
                  <p className="text-xs font-medium text-stone-700">Create linked task</p>
                  <Input
                    type="text"
                    value={newTaskTitle || ''}
                    onChange={e => onSetNewTaskTitle?.(e.target.value)}
                    placeholder="Task title..."
                    className="w-full px-1.5 py-0.5 text-xs bg-white border border-stone-200 rounded focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
                    maxLength={500}
                  />
                  <div className="flex gap-1">
                    <Select value={newTaskType || 'follow_up'} onValueChange={(v) => onSetNewTaskType?.(v)}>
                      <SelectTrigger className="flex-1 h-6 text-xs border-stone-200">
                        <SelectValue placeholder="Task type" />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          taskTypeOptions || [
                            { value: 'follow_up', label: 'Follow-up' },
                            { value: 'change_request', label: 'Change Request' },
                            { value: 'approval_task', label: 'Approval' },
                          ]
                        ).map(t => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={newTaskDueAt || ''}
                      onChange={e => onSetNewTaskDueAt?.(e.target.value)}
                      className="flex-1 px-1.5 py-0.5 text-xs bg-white border border-stone-200 rounded"
                      title="Task due date"
                    />
                  </div>
                  <div className="flex gap-1 justify-end">
                    <Button
                      onClick={() => onShowNewTask?.(null)}
                      className="px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-100 rounded"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => onCreateTask(thread.threadId)}
                      disabled={creatingTask || !(newTaskTitle || '').trim()}
                      className="px-1.5 py-0.5 text-xs bg-stone-800 text-white rounded hover:bg-stone-900 disabled:opacity-60 flex items-center gap-0.5"
                    >
                      {creatingTask && <Loader2 className="w-2 h-2 animate-spin" />}
                      Create
                    </Button>
                  </div>
                </div>
              )}

              {/* Request Changes form */}
              {showRequestChanges && onRequestChanges && (
                <div className="mt-2 p-1.5 bg-stone-100 rounded border border-stone-100 space-y-1.5">
                  <p className="text-xs font-medium text-stone-700">Request Changes</p>
                  <textarea
                    value={requestChangesBody}
                    onChange={e => setRequestChangesBody(e.target.value)}
                    placeholder="Describe the required changes..."
                    className="w-full px-1.5 py-0.5 text-xs bg-white border border-stone-200 rounded focus-visible:ring-2 outline-none focus:ring-stone-400 resize-none"
                    rows={2}
                    maxLength={10000}
                  />
                  <div className="flex gap-1 justify-end">
                    <Button
                      onClick={() => {
                        setShowRequestChanges(false);
                        setRequestChangesBody('');
                      }}
                      className="px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-100 rounded"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        onRequestChanges(thread.threadId, requestChangesBody);
                        setRequestChangesBody('');
                        setShowRequestChanges(false);
                      }}
                      disabled={!requestChangesBody.trim()}
                      className="px-1.5 py-0.5 text-xs bg-stone-600 text-white rounded hover:bg-stone-700 disabled:opacity-60"
                    >
                      Submit
                    </Button>
                  </div>
                </div>
              )}
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
  taskTypeOptions?: { value: string; label: string }[];
}

function TaskCard({ task, onResolve, onReopen, taskTypeOptions }: TaskCardProps) {
  const isActive = task.status === 'open' || task.status === 'in_progress';
  const isOverdue = isActive && task.dueAt ? new Date(task.dueAt) < new Date() : false;
  const typeLabel =
    taskTypeOptions?.find(t => t.value === task.taskType)?.label ||
    (task.taskType === 'change_request'
      ? 'Change Request'
      : task.taskType === 'follow_up'
        ? 'Follow-up'
        : task.taskType === 'approval_task'
          ? 'Approval'
          : 'Task');

  return (
    <div
      className={cn(
        'mb-2 rounded-lg border p-2',
        isActive
          ? isOverdue
            ? 'border-stone-200 bg-stone-100/30'
            : 'border-stone-200 bg-white'
          : 'border-stone-200 bg-stone-50/50'
      )}
    >
      <div className="flex items-start gap-1.5">
        <ListTodo
          className={cn('w-3 h-3 mt-0.5 shrink-0', isActive ? 'text-stone-900' : 'text-stone-900')}
        />
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-xs font-medium',
              isActive ? 'text-stone-900' : 'text-stone-500 line-through'
            )}
          >
            {task.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs bg-stone-100 text-stone-500 px-1 rounded">{typeLabel}</span>
            {task.assignedToName && (
              <span className="text-xs text-stone-400">→ {task.assignedToName}</span>
            )}
            {task.dueAt && (
              <span
                className={cn(
                  'text-xs flex items-center gap-0.5',
                  isOverdue ? 'text-stone-700 font-medium' : 'text-stone-400'
                )}
              >
                <Clock className="w-2.5 h-2.5" />
                {isOverdue ? 'Overdue' : formatTime(task.dueAt)}
              </span>
            )}
          </div>
          {task.description && <p className="text-xs text-stone-500 mt-1">{task.description}</p>}
        </div>
      </div>
      <div className="flex gap-1.5 mt-1.5 pl-4">
        {isActive && onResolve && (
          <Button
            onClick={onResolve}
            className="flex items-center gap-1 text-xs text-stone-700 hover:text-stone-800"
          >
            <CheckCircle2 className="w-3 h-3" />
            Resolve
          </Button>
        )}
        {!isActive && onReopen && (
          <Button
            onClick={onReopen}
            className="flex items-center gap-1 text-xs text-stone-600 hover:text-stone-700"
          >
            <RotateCcw className="w-3 h-3" />
            Reopen
          </Button>
        )}
      </div>
    </div>
  );
}

export default ReviewThreadsPanel;
