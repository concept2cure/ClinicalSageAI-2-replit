import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  Eye,
  EyeOff,
  Check,
  X,
  CheckCircle,
  XCircle,
  User,
  Clock,
  GitPullRequest,
  ArrowRight,
  ChevronUp,
  ChevronDown,
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
  pending: 'text-stone-600 bg-stone-100',
  'in-progress': 'text-amber-700 bg-amber-50',
  completed: 'text-emerald-700 bg-emerald-50',
  'changes-requested': 'text-red-700 bg-red-50',
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
  const [focusedChangeIndex, setFocusedChangeIndex] = useState(0);
  const changeListRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => {
    const additions = changes.filter((c) => c.type === 'addition').length;
    const deletions = changes.filter((c) => c.type === 'deletion').length;
    const modifications = changes.filter((c) => c.type === 'modification').length;
    const pending = changes.filter((c) => !c.accepted && !c.rejected).length;
    const resolved = changes.length - pending;
    return { additions, deletions, modifications, pending, resolved };
  }, [changes]);

  const pendingChanges = useMemo(
    () => changes.filter((c) => !c.accepted && !c.rejected),
    [changes],
  );

  const navigateChange = useCallback(
    (direction: 'prev' | 'next') => {
      if (pendingChanges.length === 0) return;
      setFocusedChangeIndex((prev) => {
        const next =
          direction === 'next'
            ? Math.min(prev + 1, pendingChanges.length - 1)
            : Math.max(prev - 1, 0);
        // Scroll the focused card into view
        const el = changeListRef.current?.querySelector(`[data-change-index="${next}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return next;
      });
    },
    [pendingChanges.length],
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
      label: 'Added',
      accent: 'border-l-emerald-400',
      bg: 'bg-emerald-50/60',
      badge: 'bg-emerald-100 text-emerald-700',
      diffBg: 'bg-emerald-50 text-emerald-800',
    },
    deletion: {
      label: 'Removed',
      accent: 'border-l-red-400',
      bg: 'bg-red-50/60',
      badge: 'bg-red-100 text-red-700',
      diffBg: 'bg-red-50 text-red-800 line-through',
    },
    modification: {
      label: 'Modified',
      accent: 'border-l-amber-400',
      bg: 'bg-amber-50/60',
      badge: 'bg-amber-100 text-amber-700',
      diffBg: '',
    },
  };

  return (
    <div
      className="flex h-full flex-col bg-white"
      data-testid="review-mode-panel"
      role="region"
      aria-label="Review Mode"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
        <h2 className="text-[13px] font-semibold text-stone-800">Review</h2>
        <div className="flex items-center gap-1">
          {/* Prev / Next navigation */}
          {pendingChanges.length > 1 && (
            <>
              <button
                onClick={() => navigateChange('prev')}
                disabled={focusedChangeIndex === 0}
                className="p-1 rounded text-stone-400 hover:text-stone-600 hover:bg-stone-100 disabled:opacity-30 transition-colors duration-200"
                aria-label="Previous change"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] text-stone-400 tabular-nums min-w-[2rem] text-center">
                {focusedChangeIndex + 1}/{pendingChanges.length}
              </span>
              <button
                onClick={() => navigateChange('next')}
                disabled={focusedChangeIndex >= pendingChanges.length - 1}
                className="p-1 rounded text-stone-400 hover:text-stone-600 hover:bg-stone-100 disabled:opacity-30 transition-colors duration-200"
                aria-label="Next change"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors duration-200"
              aria-label="Close review panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Review Mode Toggle */}
      <div className="px-4 py-2.5 border-b border-stone-100">
        <button
          onClick={onToggleReviewMode}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-200',
            isReviewMode
              ? 'bg-stone-800 text-white hover:bg-stone-900'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
          )}
          aria-pressed={isReviewMode}
          data-testid="review-mode-toggle"
        >
          {isReviewMode ? (
            <>
              <Eye className="w-3.5 h-3.5" />
              Review Active
            </>
          ) : (
            <>
              <EyeOff className="w-3.5 h-3.5" />
              Enable Review
            </>
          )}
        </button>
      </div>

      {/* Compact Stats */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-stone-100">
        <span className="text-[10px] text-stone-400 uppercase tracking-wide font-semibold">
          Changes
        </span>
        <div className="flex items-center gap-2 ml-auto">
          {stats.additions > 0 && (
            <span className="text-[10px] font-medium text-emerald-600">+{stats.additions}</span>
          )}
          {stats.deletions > 0 && (
            <span className="text-[10px] font-medium text-red-600">-{stats.deletions}</span>
          )}
          {stats.modifications > 0 && (
            <span className="text-[10px] font-medium text-amber-600">~{stats.modifications}</span>
          )}
          {stats.resolved > 0 && (
            <span className="text-[10px] text-stone-400">{stats.resolved} resolved</span>
          )}
        </div>
      </div>

      {/* Bulk Actions — only when pending changes exist */}
      {pendingChanges.length > 0 && (
        <div className="flex gap-1.5 px-4 py-2 border-b border-stone-100">
          <button
            onClick={onAcceptAll}
            className="flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors duration-200"
            aria-label={`Accept all ${pendingChanges.length} changes`}
          >
            <CheckCircle className="w-3 h-3" />
            Accept All
          </button>
          <button
            onClick={onRejectAll}
            className="flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors duration-200"
            aria-label={`Reject all ${pendingChanges.length} changes`}
          >
            <XCircle className="w-3 h-3" />
            Reject All
          </button>
        </div>
      )}

      {/* Change List */}
      <div
        className="flex-1 overflow-y-auto px-3 py-2"
        ref={changeListRef}
        role="list"
        aria-label="Tracked changes"
      >
        {changes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center" role="status">
            <GitPullRequest className="mb-2 w-8 h-8 text-stone-200" />
            <p className="text-[13px] text-stone-500">No changes tracked</p>
            <p className="mt-1 text-[11px] text-stone-400">
              {isReviewMode
                ? 'Edits will appear here as suggestions.'
                : 'Enable review mode to track changes.'}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {changes.map((change, index) => {
              const config = changeTypeConfig[change.type];
              const isPending = !change.accepted && !change.rejected;
              const pendingIdx = pendingChanges.indexOf(change);
              const isFocused = isPending && pendingIdx === focusedChangeIndex;

              return (
                <div
                  key={change.id}
                  role="listitem"
                  data-change-index={pendingIdx >= 0 ? pendingIdx : undefined}
                  data-testid={`change-${change.id}`}
                  className={cn(
                    'rounded-md border-l-2 p-3 transition-all duration-200',
                    config.accent,
                    isPending ? config.bg : 'bg-stone-50 opacity-50',
                    isFocused && isPending && 'ring-1 ring-stone-300',
                  )}
                >
                  {/* Top row: badge + status + meta */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        config.badge,
                      )}
                    >
                      {config.label}
                    </span>
                    {change.accepted && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
                        <CheckCircle className="w-2.5 h-2.5" />
                        Accepted
                      </span>
                    )}
                    {change.rejected && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600">
                        <XCircle className="w-2.5 h-2.5" />
                        Rejected
                      </span>
                    )}
                  </div>

                  {/* Author & Timestamp */}
                  <div className="flex items-center gap-2 mb-1.5 text-[10px] text-stone-400">
                    <span className="inline-flex items-center gap-0.5">
                      <User className="w-2.5 h-2.5" />
                      {change.author}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {formatTimestamp(change.timestamp)}
                    </span>
                  </div>

                  {/* Text Diff */}
                  <div className="space-y-1 text-[12px] leading-relaxed mb-2">
                    {(change.type === 'deletion' || change.type === 'modification') && (
                      <div className="rounded px-2 py-1 bg-red-50 text-red-800 line-through">
                        {change.originalText}
                      </div>
                    )}
                    {(change.type === 'addition' || change.type === 'modification') && (
                      <div className="flex items-start gap-1">
                        {change.type === 'modification' && (
                          <ArrowRight className="mt-1 w-3 h-3 flex-shrink-0 text-stone-300" />
                        )}
                        <div className="rounded px-2 py-1 bg-emerald-50 text-emerald-800">
                          {change.newText}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Accept / Reject — hover-revealed when not focused, always visible when focused */}
                  {isPending && (
                    <div
                      className={cn(
                        'flex gap-1 transition-opacity duration-200',
                        isFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                      )}
                      style={isFocused ? undefined : { opacity: 1 }}
                    >
                      <button
                        onClick={() => onAcceptChange(change.id)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-700 transition-colors duration-200"
                        aria-label={`Accept change: ${config.label}`}
                      >
                        <Check className="w-2.5 h-2.5" />
                        Accept
                      </button>
                      <button
                        onClick={() => onRejectChange(change.id)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-md bg-stone-200 px-2 py-1 text-[10px] font-medium text-stone-700 hover:bg-stone-300 transition-colors duration-200"
                        aria-label={`Reject change: ${config.label}`}
                      >
                        <X className="w-2.5 h-2.5" />
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
        <div className="border-t border-stone-100 bg-stone-50 px-4 py-3">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-stone-400" />
              <div>
                <div className="text-[12px] font-medium text-stone-700">
                  {reviewAssignment.reviewerName}
                </div>
                <div className="text-[10px] text-stone-400">
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
            <div className="mb-2.5 rounded bg-white p-2 text-[12px] text-stone-600 border border-stone-100">
              {reviewAssignment.comments}
            </div>
          )}

          <div className="mb-2">
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Review comments (optional)..."
              className="w-full resize-none rounded-md border border-stone-200 bg-white px-3 py-2 text-[12px] text-stone-700 placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-stone-400 outline-none transition-colors duration-200"
              rows={2}
              aria-label="Review comments"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleCompleteReview('approved')}
              disabled={isSubmitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors duration-200"
              aria-label="Approve document"
            >
              {isSubmitting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle className="w-3 h-3" />
              )}
              Approve
            </button>
            <button
              onClick={() => handleCompleteReview('changes-requested')}
              disabled={isSubmitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-stone-200 px-3 py-2 text-[11px] font-medium text-stone-700 hover:bg-stone-300 disabled:opacity-50 transition-colors duration-200"
              aria-label="Request changes"
            >
              {isSubmitting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <XCircle className="w-3 h-3" />
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
