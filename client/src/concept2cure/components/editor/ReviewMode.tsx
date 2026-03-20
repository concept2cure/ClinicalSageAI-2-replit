import React, { useState, useMemo } from 'react';
import {
  Eye,
  EyeOff,
  Check,
  X,
  CheckCircle,
  XCircle,
  User,
  Clock,
  MessageSquare,
  GitPullRequest,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrackedChange {
  id: string;
  type: 'addition' | 'deletion' | 'modification';
  originalText: string;
  newText: string;
  author: string;
  timestamp: string;
  accepted?: boolean;
  rejected?: boolean;
}

interface ReviewAssignment {
  reviewerId: string;
  reviewerName: string;
  assignedAt: string;
  status: 'pending' | 'in-progress' | 'completed' | 'changes-requested';
  comments?: string;
}

interface ReviewModePanelProps {
  isReviewMode: boolean;
  onToggleReviewMode: () => void;
  changes: TrackedChange[];
  reviewAssignment?: ReviewAssignment;
  onAcceptChange: (changeId: string) => void;
  onRejectChange: (changeId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onCompleteReview?: (status: 'approved' | 'changes-requested', comments?: string) => void;
  onClose?: () => void;
}

const statusLabels: Record<ReviewAssignment['status'], string> = {
  pending: 'Pending',
  'in-progress': 'In Progress',
  completed: 'Completed',
  'changes-requested': 'Changes Requested',
};

const statusColors: Record<ReviewAssignment['status'], string> = {
  pending: 'text-slate-500 bg-slate-100',
  'in-progress': 'text-blue-600 bg-blue-100',
  completed: 'text-green-600 bg-green-100',
  'changes-requested': 'text-amber-600 bg-amber-100',
};

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

export function ReviewModePanel({
  isReviewMode,
  onToggleReviewMode,
  changes,
  reviewAssignment,
  onAcceptChange,
  onRejectChange,
  onAcceptAll,
  onRejectAll,
  onCompleteReview,
  onClose,
}: ReviewModePanelProps) {
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stats = useMemo(() => {
    const additions = changes.filter((c) => c.type === 'addition').length;
    const deletions = changes.filter((c) => c.type === 'deletion').length;
    const modifications = changes.filter((c) => c.type === 'modification').length;
    const pending = changes.filter((c) => !c.accepted && !c.rejected).length;
    return { additions, deletions, modifications, pending };
  }, [changes]);

  const pendingChanges = useMemo(
    () => changes.filter((c) => !c.accepted && !c.rejected),
    [changes],
  );

  const handleCompleteReview = async (status: 'approved' | 'changes-requested') => {
    if (!onCompleteReview) return;
    setIsSubmitting(true);
    try {
      await onCompleteReview(status, reviewComment || undefined);
    } finally {
      setIsSubmitting(false);
      setReviewComment('');
    }
  };

  const changeTypeConfig = {
    addition: {
      label: 'Addition',
      borderColor: 'border-l-green-500',
      bgColor: 'bg-green-50',
      badgeColor: 'bg-green-100 text-green-700',
      icon: <Check className="h-3.5 w-3.5" />,
    },
    deletion: {
      label: 'Deletion',
      borderColor: 'border-l-red-500',
      bgColor: 'bg-red-50',
      badgeColor: 'bg-red-100 text-red-700',
      icon: <X className="h-3.5 w-3.5" />,
    },
    modification: {
      label: 'Modification',
      borderColor: 'border-l-amber-500',
      bgColor: 'bg-amber-50',
      badgeColor: 'bg-amber-100 text-amber-700',
      icon: <GitPullRequest className="h-3.5 w-3.5" />,
    },
  };

  return (
    <div className="flex h-full flex-col border-l bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Review Mode</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Review Mode Toggle */}
      <div className="border-b px-4 py-3">
        <button
          onClick={onToggleReviewMode}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
            isReviewMode
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
          )}
        >
          {isReviewMode ? (
            <>
              <Eye className="h-4 w-4" />
              Review Mode Active
            </>
          ) : (
            <>
              <EyeOff className="h-4 w-4" />
              Enable Review Mode
            </>
          )}
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-1 border-b px-4 py-2.5">
        <div className="text-center">
          <div className="text-xs font-semibold text-green-600">{stats.additions}</div>
          <div className="text-[10px] text-slate-500">Added</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-semibold text-red-600">{stats.deletions}</div>
          <div className="text-[10px] text-slate-500">Deleted</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-semibold text-amber-600">{stats.modifications}</div>
          <div className="text-[10px] text-slate-500">Modified</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-semibold text-blue-600">{stats.pending}</div>
          <div className="text-[10px] text-slate-500">Pending</div>
        </div>
      </div>

      {/* Bulk Actions */}
      {pendingChanges.length > 0 && (
        <div className="flex gap-2 border-b px-4 py-2.5">
          <button
            onClick={onAcceptAll}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Accept All ({pendingChanges.length})
          </button>
          <button
            onClick={onRejectAll}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            <XCircle className="h-3.5 w-3.5" />
            Reject All ({pendingChanges.length})
          </button>
        </div>
      )}

      {/* Change List */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {changes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <GitPullRequest className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No changes tracked</p>
            <p className="mt-1 text-xs text-slate-400">
              {isReviewMode
                ? 'Edits made in review mode will appear here as suggestions.'
                : 'Enable review mode to start tracking changes.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {changes.map((change) => {
              const config = changeTypeConfig[change.type];
              const isPending = !change.accepted && !change.rejected;

              return (
                <div
                  key={change.id}
                  className={cn(
                    'rounded-md border border-l-4 p-3 transition-opacity',
                    config.borderColor,
                    isPending ? config.bgColor : 'bg-slate-50 opacity-60',
                  )}
                >
                  {/* Card Header */}
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                        config.badgeColor,
                      )}
                    >
                      {config.icon}
                      {config.label}
                    </span>
                    {change.accepted && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600">
                        <CheckCircle className="h-3 w-3" />
                        Accepted
                      </span>
                    )}
                    {change.rejected && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600">
                        <XCircle className="h-3 w-3" />
                        Rejected
                      </span>
                    )}
                  </div>

                  {/* Author & Timestamp */}
                  <div className="mb-2 flex items-center gap-3 text-[10px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {change.author}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimestamp(change.timestamp)}
                    </span>
                  </div>

                  {/* Text Diff */}
                  <div className="mb-2 space-y-1 text-xs">
                    {change.type === 'deletion' || change.type === 'modification' ? (
                      <div className="rounded bg-red-100/60 px-2 py-1 text-red-800 line-through">
                        {change.originalText}
                      </div>
                    ) : null}
                    {change.type === 'addition' || change.type === 'modification' ? (
                      <div className="flex items-start gap-1">
                        {change.type === 'modification' && (
                          <ArrowRight className="mt-1 h-3 w-3 flex-shrink-0 text-slate-400" />
                        )}
                        <div className="rounded bg-green-100/60 px-2 py-1 text-green-800">
                          {change.newText}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Accept / Reject Buttons */}
                  {isPending && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => onAcceptChange(change.id)}
                        className="flex flex-1 items-center justify-center gap-1 rounded bg-green-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-green-700"
                      >
                        <Check className="h-3 w-3" />
                        Accept
                      </button>
                      <button
                        onClick={() => onRejectChange(change.id)}
                        className="flex flex-1 items-center justify-center gap-1 rounded bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-700"
                      >
                        <X className="h-3 w-3" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Review Completion Section */}
      {reviewAssignment && onCompleteReview && (
        <div className="border-t bg-slate-50 px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-500" />
              <div>
                <div className="text-xs font-medium text-slate-700">
                  {reviewAssignment.reviewerName}
                </div>
                <div className="text-[10px] text-slate-500">
                  Assigned {formatTimestamp(reviewAssignment.assignedAt)}
                </div>
              </div>
            </div>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                statusColors[reviewAssignment.status],
              )}
            >
              {statusLabels[reviewAssignment.status]}
            </span>
          </div>

          {reviewAssignment.comments && (
            <div className="mb-3 flex items-start gap-1.5 rounded bg-white p-2 text-xs text-slate-600">
              <MessageSquare className="mt-0.5 h-3 w-3 flex-shrink-0 text-slate-400" />
              {reviewAssignment.comments}
            </div>
          )}

          <div className="mb-2">
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Add review comments (optional)..."
              className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleCompleteReview('approved')}
              disabled={isSubmitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5" />
              )}
              Approve
            </button>
            <button
              onClick={() => handleCompleteReview('changes-requested')}
              disabled={isSubmitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-amber-500 px-3 py-2 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              Request Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReviewModePanel;
