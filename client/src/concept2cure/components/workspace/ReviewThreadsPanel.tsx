/**
 * ReviewThreadsPanel — Review threads inspector for a governed artifact.
 *
 * Lists all review threads opened against an artifact (across versions),
 * with comment counts, status, priority and anchor context. Reads from the
 * existing backend endpoint:
 *   GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/review-threads
 */

import React from 'react';
import { MessageSquare, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';

interface ReviewThread {
  threadId: string;
  title: string;
  status: string;
  priority?: string | null;
  anchorType?: string | null;
  anchorLabel?: string | null;
  versionId?: number | null;
  createdByName?: string | null;
  createdByRole?: string | null;
  assigneeName?: string | null;
  commentCount: number;
  resolvedAt?: string | null;
  resolvedByName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface ReviewThreadsPanelProps {
  projectId: string | number;
  artifactId: string | number;
  industryMode?: string;
}

const STATUS_COLOR: Record<string, string> = {
  open: 'bg-blue-100 text-stone-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-stone-100 text-stone-600',
};

const PRIORITY_COLOR: Record<string, string> = {
  high: 'text-red-500',
  medium: 'text-amber-500',
  low: 'text-stone-400',
};

export function ReviewThreadsPanel({ projectId, artifactId }: ReviewThreadsPanelProps) {
  const [threads, setThreads] = React.useState<ReviewThread[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest(
          'GET',
          `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/review-threads`
        );
        const data = await res.json();
        if (!cancelled) {
          setThreads(data.data?.threads || data.threads || []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, artifactId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-stone-400">
        No review threads opened yet. Threads are created when reviewers comment on this artifact.
      </div>
    );
  }

  return (
    <div className="p-2.5">
      <div className="text-xs text-stone-400 uppercase tracking-wide mb-2">
        Review Threads ({threads.length})
      </div>

      <div className="space-y-2">
        {threads.map(t => (
          <div
            key={t.threadId}
            className="rounded border border-stone-200 p-2 hover:bg-stone-50"
          >
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="w-3 h-3 text-stone-400 shrink-0" />
              <span className="text-xs font-medium text-stone-700 truncate flex-1">{t.title}</span>
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0',
                  STATUS_COLOR[t.status] || 'bg-stone-100 text-stone-600'
                )}
              >
                {t.status}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1 text-[10px] text-stone-400">
              {t.anchorLabel && <span className="truncate">{t.anchorLabel}</span>}
              {t.priority && (
                <span className={cn('font-medium', PRIORITY_COLOR[t.priority] || 'text-stone-400')}>
                  {t.priority}
                </span>
              )}
              <span className="flex items-center gap-0.5">
                {t.resolvedAt && <CheckCircle className="w-2.5 h-2.5 text-green-500" />}
                {t.commentCount} comment{t.commentCount !== 1 ? 's' : ''}
              </span>
              {t.createdByName && <span className="truncate">by {t.createdByName}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ReviewThreadsPanel;
