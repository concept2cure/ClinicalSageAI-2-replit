/**
 * ReviewQueuePanel — "My Reviews" queue panel.
 *
 * Shows all open threads and tasks assigned to the current user across all artifacts.
 * Uses GET /api/concept2cure/reviews/my-queue.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  MessageSquare,
  ListTodo,
  Loader2,
  AlertTriangle,
  Clock,
  ChevronRight,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { LoadingState } from '@/components/ui/statesV2';
import { WorkspaceHeader } from '@/components/ui/workspace-primitives';
import { InlineAIButton } from '../ui/InlineAIButton';

interface QueueThread {
  threadId: string;
  title: string;
  status: string;
  priority?: string;
  artifactId: string;
  artifactTitle: string;
  projectId: number;
  anchorLabel?: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

interface QueueTask {
  taskId: string;
  title: string;
  description?: string;
  taskType: string;
  status: string;
  dueAt?: string;
  artifactId: string;
  artifactTitle: string;
  projectId: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

interface ReviewQueuePanelProps {
  onNavigateToArtifact?: (projectId: number, artifactId: string) => void;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function ReviewQueuePanel({ onNavigateToArtifact }: ReviewQueuePanelProps) {
  const { toast } = useToast();
  const [threads, setThreads] = useState<QueueThread[]>([]);
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overdueTasks, setOverdueTasks] = useState(0);
  const [dueSoonTasks, setDueSoonTasks] = useState(0);
  const [changeRequests, setChangeRequests] = useState(0);
  const [approvalsNeeded, setApprovalsNeeded] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest('GET', '/api/concept2cure/reviews/my-queue');
      if (res.ok) {
        const payload = await res.json();
        setThreads(payload.data?.threads || []);
        setTasks(payload.data?.tasks || []);
        setOverdueTasks(payload.data?.overdueTasks ?? 0);
        setDueSoonTasks(payload.data?.dueSoonTasks ?? 0);
        setChangeRequests(payload.data?.changeRequests ?? 0);
        setApprovalsNeeded(payload.data?.approvalsNeeded ?? 0);
        setUnreadNotifications(payload.data?.unreadNotifications ?? 0);
      } else {
        setError('Failed to load queue');
      }
    } catch {
      setError('Failed to load queue');
      toast({ title: 'Failed to load review queue', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const totalItems = threads.length + tasks.length;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <WorkspaceHeader
        title="Review Queue"
        titleIcon={<Inbox className="w-3.5 h-3.5 text-blue-600" />}
        actions={
          <div className="flex items-center gap-1.5">
            {totalItems > 0 && (
              <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                {totalItems}
              </span>
            )}
            {unreadNotifications > 0 && (
              <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">
                {unreadNotifications} new
              </span>
            )}
            <button
              onClick={fetchQueue}
              disabled={loading}
              className="p-1 text-stone-400 hover:text-stone-600 rounded hover:bg-stone-100"
            >
              <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
            </button>
          </div>
        }
        testId="review-queue-header"
      />

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <LoadingState message="Loading queue…" size="sm" />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-stone-400">
            <AlertTriangle className="w-6 h-6 mb-1 text-red-400" />
            <p className="text-[10px] text-red-500">{error}</p>
            <button onClick={fetchQueue} className="text-[10px] text-blue-600 hover:underline mt-1">Retry</button>
          </div>
        ) : totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-stone-400">
            <Inbox className="w-6 h-6 mb-1" />
            <p className="text-[10px]">Queue is empty</p>
          </div>
        ) : (
          <>
            {/* Summary badges */}
            {(overdueTasks > 0 ||
              dueSoonTasks > 0 ||
              changeRequests > 0 ||
              approvalsNeeded > 0) && (
              <div className="flex flex-wrap gap-1 mb-2">
                {overdueTasks > 0 && (
                  <span className="text-[8px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                    <AlertTriangle className="w-2.5 h-2.5" /> {overdueTasks} overdue
                  </span>
                )}
                {dueSoonTasks > 0 && (
                  <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" /> {dueSoonTasks} due soon
                  </span>
                )}
                {changeRequests > 0 && (
                  <span className="text-[8px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">
                    {changeRequests} changes requested
                  </span>
                )}
                {approvalsNeeded > 0 && (
                  <span className="text-[8px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">
                    {approvalsNeeded} awaiting approval
                  </span>
                )}
              </div>
            )}
            {/* Threads */}
            {threads.length > 0 && (
              <div className="mb-3">
                <p className="text-[9px] text-stone-400 font-medium mb-1 px-1 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  Threads ({threads.length})
                </p>
                {threads.map(t => (
                  <button
                    key={t.threadId}
                    onClick={() => onNavigateToArtifact?.(t.projectId, t.artifactId)}
                    className="w-full mb-1.5 p-2 bg-white border border-stone-200 rounded-lg text-left hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                  >
                    <p className="text-[10px] font-medium text-stone-800 truncate">{t.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[8px] text-stone-400 truncate">{t.artifactTitle}</span>
                      {t.priority === 'high' && (
                        <AlertTriangle className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                      )}
                      <span className="text-[8px] text-stone-400 ml-auto shrink-0">
                        {formatTime(t.updatedAt)}
                      </span>
                      <span className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <InlineAIButton
                          actionType="summarize_selection"
                          content={`Thread: ${t.title}. Artifact: ${t.artifactTitle}. Status: ${t.status}. Priority: ${t.priority || 'normal'}. Created by: ${t.createdByName}. Updated: ${t.updatedAt}`}
                          projectId={t.projectId}
                          label="Summarize"
                          size="sm"
                        />
                        <InlineAIButton
                          actionType="create_followup_task"
                          content={`Thread: ${t.title}. Artifact: ${t.artifactTitle}. Status: ${t.status}. Priority: ${t.priority || 'normal'}. Created by: ${t.createdByName}`}
                          projectId={t.projectId}
                          label="Follow-up"
                          size="sm"
                        />
                      </span>
                      <ChevronRight className="w-3 h-3 text-stone-300 shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Tasks */}
            {tasks.length > 0 && (
              <div>
                <p className="text-[9px] text-stone-400 font-medium mb-1 px-1 flex items-center gap-1">
                  <ListTodo className="w-3 h-3" />
                  Tasks ({tasks.length})
                </p>
                {tasks.map(t => (
                  <button
                    key={t.taskId}
                    onClick={() => onNavigateToArtifact?.(t.projectId, t.artifactId)}
                    className="w-full mb-1.5 p-2 bg-white border border-stone-200 rounded-lg text-left hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                  >
                    <p className="text-[10px] font-medium text-stone-800 truncate">{t.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[8px] text-stone-400 truncate">{t.artifactTitle}</span>
                      {t.dueAt && (
                        <span className="text-[8px] text-stone-400 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatTime(t.dueAt)}
                        </span>
                      )}
                      <span className="text-[8px] text-stone-400 ml-auto shrink-0">
                        {formatTime(t.updatedAt)}
                      </span>
                      <span className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <InlineAIButton
                          actionType="summarize_selection"
                          content={`Task: ${t.title}. ${t.description || ''} Type: ${t.taskType}. Status: ${t.status}. Artifact: ${t.artifactTitle}. Created by: ${t.createdByName}${t.dueAt ? `. Due: ${t.dueAt}` : ''}`}
                          projectId={t.projectId}
                          label="Summarize"
                          size="sm"
                        />
                        <InlineAIButton
                          actionType="create_followup_task"
                          content={`Task: ${t.title}. ${t.description || ''} Type: ${t.taskType}. Status: ${t.status}. Artifact: ${t.artifactTitle}. Created by: ${t.createdByName}`}
                          projectId={t.projectId}
                          label="Follow-up"
                          size="sm"
                        />
                      </span>
                      <ChevronRight className="w-3 h-3 text-stone-300 shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ReviewQueuePanel;
