/**
 * ActivityFeed — Recent project activity timeline for the dashboard.
 *
 * Shows a chronological feed of document changes, status transitions,
 * comments, and review actions within a project.
 */

import React, { useMemo } from 'react';
import {
  FileText,
  CheckCircle,
  MessageSquare,
  Edit3,
  Eye,
  Upload,
  Lock,
  ArrowRight,
  Clock,
  User,
  Sparkles,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type ActivityType =
  | 'created'
  | 'edited'
  | 'status_change'
  | 'commented'
  | 'review_requested'
  | 'review_completed'
  | 'ai_action'
  | 'exported'
  | 'locked';

interface ActivityItem {
  id: string;
  type: ActivityType;
  documentTitle: string;
  documentId?: string;
  author?: string;
  timestamp: string;
  details?: string;
  /** For status_change: the new status */
  newStatus?: string;
  /** For status_change: the old status */
  oldStatus?: string;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  onOpenDocument?: (docId: string) => void;
  maxItems?: number;
  className?: string;
}

// ── Activity config ─────────────────────────────────────────────────────────

const ACTIVITY_CONFIG: Record<ActivityType, {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  verb: string;
}> = {
  created: {
    icon: FileText,
    color: 'text-stone-1000',
    bgColor: 'bg-stone-100',
    verb: 'created',
  },
  edited: {
    icon: Edit3,
    color: 'text-stone-500',
    bgColor: 'bg-stone-100',
    verb: 'edited',
  },
  status_change: {
    icon: ArrowRight,
    color: 'text-stone-1000',
    bgColor: 'bg-stone-100',
    verb: 'changed status of',
  },
  commented: {
    icon: MessageSquare,
    color: 'text-stone-1000',
    bgColor: 'bg-stone-100',
    verb: 'commented on',
  },
  review_requested: {
    icon: Eye,
    color: 'text-stone-1000',
    bgColor: 'bg-stone-100',
    verb: 'requested review for',
  },
  review_completed: {
    icon: CheckCircle,
    color: 'text-stone-1000',
    bgColor: 'bg-stone-100',
    verb: 'completed review of',
  },
  ai_action: {
    icon: Sparkles,
    color: 'text-stone-1000',
    bgColor: 'bg-stone-100',
    verb: 'used AI on',
  },
  exported: {
    icon: Upload,
    color: 'text-stone-1000',
    bgColor: 'bg-stone-100',
    verb: 'exported',
  },
  locked: {
    icon: Lock,
    color: 'text-stone-700',
    bgColor: 'bg-stone-100',
    verb: 'locked',
  },
};

// ── Time formatting ─────────────────────────────────────────────────────────

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
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function groupByDay(items: ActivityItem[]): Map<string, ActivityItem[]> {
  const groups = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const date = new Date(item.timestamp);
    const key = isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const existing = groups.get(key) || [];
    existing.push(item);
    groups.set(key, existing);
  }
  return groups;
}

function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isYesterday(date: Date): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return date.toDateString() === yesterday.toDateString();
}

// ── Component ────────────────────────────────────────────────────────────────

export function ActivityFeed({
  activities,
  onOpenDocument,
  maxItems = 20,
  className,
}: ActivityFeedProps) {
  const sorted = useMemo(() => {
    return [...activities]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, maxItems);
  }, [activities, maxItems]);

  const grouped = useMemo(() => groupByDay(sorted), [sorted]);

  if (activities.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
        <Clock className="mb-3 h-10 w-10 text-stone-300" />
        <p className="text-sm font-medium text-stone-500">No activity yet</p>
        <p className="text-xs text-stone-400 mt-1">
          Document edits, reviews, and AI actions will appear here
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-5', className)}>
      {Array.from(grouped.entries()).map(([dayLabel, items]) => (
        <div key={dayLabel}>
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-2">
            {dayLabel}
          </p>
          <div className="space-y-1">
            {items.map(item => {
              const config = ACTIVITY_CONFIG[item.type];
              const Icon = config.icon;

              return (
                <div
                  key={item.id}
                  className="group flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-stone-50 transition-colors duration-150"
                >
                  {/* Icon */}
                  <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', config.bgColor)}>
                    <Icon className={cn('h-3.5 w-3.5', config.color)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-stone-600 leading-relaxed">
                      {item.author && (
                        <span className="font-semibold text-stone-900">{item.author}</span>
                      )}{' '}
                      {config.verb}{' '}
                      <button
                        onClick={() => item.documentId && onOpenDocument?.(item.documentId)}
                        className="font-medium text-stone-600 hover:text-stone-700 hover:underline"
                      >
                        {item.documentTitle}
                      </button>
                      {item.type === 'status_change' && item.newStatus && (
                        <span className="text-stone-500">
                          {' '}to <span className="font-medium text-stone-700">{item.newStatus}</span>
                        </span>
                      )}
                    </p>
                    {item.details && (
                      <p className="text-[11px] text-stone-400 mt-0.5 truncate">{item.details}</p>
                    )}
                  </div>

                  {/* Time */}
                  <span className="text-[10px] text-stone-400 shrink-0 mt-0.5">
                    {relativeTime(item.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Generate synthetic activity items from artifact data.
 * This provides reasonable activity data until proper audit log integration.
 */
export function generateActivityFromArtifacts(
  artifacts: Array<{
    id: string;
    title: string;
    status?: string;
    updatedAt?: string;
    createdAt?: string;
    version?: number;
  }>,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  let counter = 0;

  for (const a of artifacts) {
    // Creation event
    if (a.createdAt) {
      items.push({
        id: `act-${counter++}`,
        type: 'created',
        documentTitle: a.title,
        documentId: a.id,
        timestamp: a.createdAt,
      });
    }

    // Last edit event (if different from creation)
    if (a.updatedAt && a.updatedAt !== a.createdAt) {
      items.push({
        id: `act-${counter++}`,
        type: 'edited',
        documentTitle: a.title,
        documentId: a.id,
        timestamp: a.updatedAt,
      });
    }

    // Status-based events
    const status = a.status?.toLowerCase();
    if (status === 'in_review' || status === 'review') {
      items.push({
        id: `act-${counter++}`,
        type: 'review_requested',
        documentTitle: a.title,
        documentId: a.id,
        timestamp: a.updatedAt || a.createdAt || new Date().toISOString(),
        newStatus: 'In Review',
      });
    } else if (status === 'approved') {
      items.push({
        id: `act-${counter++}`,
        type: 'review_completed',
        documentTitle: a.title,
        documentId: a.id,
        timestamp: a.updatedAt || a.createdAt || new Date().toISOString(),
        newStatus: 'Approved',
      });
    } else if (status === 'locked' || status === 'published') {
      items.push({
        id: `act-${counter++}`,
        type: 'locked',
        documentTitle: a.title,
        documentId: a.id,
        timestamp: a.updatedAt || a.createdAt || new Date().toISOString(),
      });
    }
  }

  return items;
}
