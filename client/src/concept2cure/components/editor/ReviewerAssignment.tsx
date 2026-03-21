/**
 * ReviewerAssignment — Assign reviewers to a document and track review status.
 *
 * Shows current reviewer assignments, allows adding/removing reviewers,
 * and displays review progress. Integrates with the document status workflow.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Users,
  Plus,
  X,
  Check,
  Clock,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  XCircle,
  User,
  Send,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type ReviewStatus = 'pending' | 'in_progress' | 'approved' | 'changes_requested' | 'rejected';

interface Reviewer {
  id: string;
  name: string;
  email: string;
  role?: string;
  avatarUrl?: string;
  status: ReviewStatus;
  assignedAt: string;
  completedAt?: string;
  comment?: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role?: string;
}

interface ReviewerAssignmentProps {
  documentId: string;
  documentTitle?: string;
  currentStatus?: string;
  reviewers: Reviewer[];
  teamMembers?: TeamMember[];
  onAddReviewer?: (memberId: string) => void;
  onRemoveReviewer?: (reviewerId: string) => void;
  onSendReminder?: (reviewerId: string) => void;
  onSubmitForReview?: () => void;
  onClose?: () => void;
  isSubmitting?: boolean;
}

// ── Status config ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ReviewStatus, {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'text-zinc-500',
    bg: 'bg-zinc-100',
  },
  in_progress: {
    label: 'Reviewing',
    icon: MessageSquare,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  changes_requested: {
    label: 'Changes Requested',
    icon: AlertCircle,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Component ────────────────────────────────────────────────────────────────

export function ReviewerAssignment({
  documentId,
  documentTitle,
  currentStatus,
  reviewers,
  teamMembers = [],
  onAddReviewer,
  onRemoveReviewer,
  onSendReminder,
  onSubmitForReview,
  onClose,
  isSubmitting,
}: ReviewerAssignmentProps) {
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter out already-assigned members
  const availableMembers = useMemo(() => {
    const assignedIds = new Set(reviewers.map(r => r.id));
    const filtered = teamMembers.filter(m => !assignedIds.has(m.id));
    if (!searchQuery) return filtered;
    const q = searchQuery.toLowerCase();
    return filtered.filter(
      m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [teamMembers, reviewers, searchQuery]);

  // Review progress
  const progress = useMemo(() => {
    if (reviewers.length === 0) return { completed: 0, total: 0, allApproved: false };
    const completed = reviewers.filter(r => r.status === 'approved' || r.status === 'rejected' || r.status === 'changes_requested').length;
    const allApproved = reviewers.every(r => r.status === 'approved');
    return { completed, total: reviewers.length, allApproved };
  }, [reviewers]);

  const isDraft = !currentStatus || currentStatus === 'draft';

  return (
    <div className="flex flex-col bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Review Team</h3>
          {reviewers.length > 0 && (
            <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
              {progress.completed}/{progress.total}
            </span>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Review progress bar */}
      {reviewers.length > 0 && (
        <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-zinc-500">Review Progress</span>
            <span className={cn(
              'text-[10px] font-semibold',
              progress.allApproved ? 'text-emerald-600' : 'text-zinc-500',
            )}>
              {progress.allApproved ? 'All Approved' : `${progress.completed} of ${progress.total} complete`}
            </span>
          </div>
          <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                progress.allApproved ? 'bg-emerald-500' : 'bg-indigo-500',
              )}
              style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Reviewer list */}
      <div className="px-3 py-2 space-y-1.5 max-h-60 overflow-y-auto">
        {reviewers.length === 0 ? (
          <div className="py-6 text-center">
            <Users className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-xs font-medium text-zinc-500">No reviewers assigned</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">Add team members to start the review process</p>
          </div>
        ) : (
          reviewers.map(reviewer => {
            const config = STATUS_CONFIG[reviewer.status];
            const StatusIcon = config.icon;

            return (
              <div
                key={reviewer.id}
                className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-zinc-50 transition-colors group"
              >
                {/* Avatar */}
                <div className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0',
                  avatarColor(reviewer.name),
                )}>
                  {getInitials(reviewer.name)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-zinc-800 truncate">{reviewer.name}</p>
                    {reviewer.role && (
                      <span className="text-[9px] text-zinc-400">{reviewer.role}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <StatusIcon className={cn('h-3 w-3', config.color)} />
                    <span className={cn('text-[10px] font-medium', config.color)}>
                      {config.label}
                    </span>
                    <span className="text-[10px] text-zinc-300">·</span>
                    <span className="text-[10px] text-zinc-400">
                      {relativeTime(reviewer.completedAt || reviewer.assignedAt)}
                    </span>
                  </div>
                  {reviewer.comment && (
                    <p className="text-[10px] text-zinc-500 mt-0.5 truncate italic">
                      "{reviewer.comment}"
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {reviewer.status === 'pending' && onSendReminder && (
                    <button
                      onClick={() => onSendReminder(reviewer.id)}
                      className="p-1 text-zinc-400 hover:text-indigo-600 rounded"
                      title="Send reminder"
                    >
                      <Send className="h-3 w-3" />
                    </button>
                  )}
                  {onRemoveReviewer && (
                    <button
                      onClick={() => onRemoveReviewer(reviewer.id)}
                      className="p-1 text-zinc-400 hover:text-red-500 rounded"
                      title="Remove reviewer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add reviewer */}
      <div className="px-3 py-2 border-t border-zinc-100">
        <div className="relative">
          <button
            onClick={() => setShowAddDropdown(!showAddDropdown)}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add Reviewer
            <ChevronDown className={cn('h-3 w-3 ml-auto transition-transform', showAddDropdown && 'rotate-180')} />
          </button>

          {showAddDropdown && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-zinc-200 rounded-lg shadow-lg z-10 overflow-hidden">
              <div className="p-2 border-b border-zinc-100">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search team members..."
                  className="w-full px-2 py-1.5 text-xs rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  autoFocus
                />
              </div>
              <div className="max-h-36 overflow-y-auto py-1">
                {availableMembers.length === 0 ? (
                  <p className="text-xs text-zinc-400 text-center py-3">
                    {teamMembers.length === 0 ? 'No team members configured' : 'All members assigned'}
                  </p>
                ) : (
                  availableMembers.map(m => (
                    <button
                      key={m.id}
                      onClick={() => {
                        onAddReviewer?.(m.id);
                        setShowAddDropdown(false);
                        setSearchQuery('');
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-50 transition-colors"
                    >
                      <div className={cn(
                        'h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0',
                        avatarColor(m.name),
                      )}>
                        {getInitials(m.name)}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs font-medium text-zinc-700 truncate">{m.name}</p>
                        <p className="text-[10px] text-zinc-400 truncate">{m.email}</p>
                      </div>
                      {m.role && (
                        <span className="text-[9px] text-zinc-400 shrink-0">{m.role}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Submit for review */}
      {isDraft && reviewers.length > 0 && onSubmitForReview && (
        <div className="px-3 py-2 border-t border-zinc-100 bg-zinc-50">
          <button
            onClick={onSubmitForReview}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Submit for Review
          </button>
        </div>
      )}
    </div>
  );
}
