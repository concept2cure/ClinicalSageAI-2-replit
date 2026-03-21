/**
 * DocumentStatusTimeline — Visual lifecycle indicator for the editor.
 *
 * Shows the document's progression through the lifecycle stages:
 * Draft → In Review → Approved → Published
 *
 * Compact inline bar for the editor header with popover for details.
 */

import React, { useState } from 'react';
import {
  PenLine,
  Eye,
  CheckCircle,
  Lock,
  ArrowRight,
  Clock,
  User,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type LifecycleStage = 'draft' | 'in_review' | 'approved' | 'published';

interface StageInfo {
  stage: LifecycleStage;
  label: string;
  icon: React.ElementType;
  color: string;
  activeColor: string;
  activeBg: string;
  completedColor: string;
}

interface StatusEvent {
  stage: LifecycleStage;
  timestamp?: string;
  actor?: string;
  note?: string;
}

interface DocumentStatusTimelineProps {
  currentStatus: string;
  documentTitle?: string;
  createdAt?: string;
  updatedAt?: string;
  author?: string;
  /** History of status transitions */
  statusHistory?: StatusEvent[];
  onChangeStatus?: (newStatus: LifecycleStage) => void;
  compact?: boolean;
}

// ── Stage definitions ───────────────────────────────────────────────────────

const STAGES: StageInfo[] = [
  {
    stage: 'draft',
    label: 'Draft',
    icon: PenLine,
    color: 'text-zinc-400',
    activeColor: 'text-amber-600',
    activeBg: 'bg-amber-50 border-amber-200',
    completedColor: 'text-emerald-500',
  },
  {
    stage: 'in_review',
    label: 'In Review',
    icon: Eye,
    color: 'text-zinc-400',
    activeColor: 'text-blue-600',
    activeBg: 'bg-blue-50 border-blue-200',
    completedColor: 'text-emerald-500',
  },
  {
    stage: 'approved',
    label: 'Approved',
    icon: CheckCircle,
    color: 'text-zinc-400',
    activeColor: 'text-green-600',
    activeBg: 'bg-green-50 border-green-200',
    completedColor: 'text-emerald-500',
  },
  {
    stage: 'published',
    label: 'Published',
    icon: Lock,
    color: 'text-zinc-400',
    activeColor: 'text-emerald-700',
    activeBg: 'bg-emerald-50 border-emerald-200',
    completedColor: 'text-emerald-500',
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeStatus(raw: string): LifecycleStage {
  const s = raw.toLowerCase().trim();
  if (s === 'in_review' || s === 'in review' || s === 'review' || s === 'pending_review') return 'in_review';
  if (s === 'approved' || s === 'final') return 'approved';
  if (s === 'locked' || s === 'published') return 'published';
  return 'draft';
}

function stageIndex(stage: LifecycleStage): number {
  return STAGES.findIndex(s => s.stage === stage);
}

function relativeTime(dateStr?: string): string {
  if (!dateStr) return '';
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
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Component ────────────────────────────────────────────────────────────────

export function DocumentStatusTimeline({
  currentStatus,
  documentTitle,
  createdAt,
  updatedAt,
  author,
  statusHistory = [],
  onChangeStatus,
  compact = false,
}: DocumentStatusTimelineProps) {
  const [showDetails, setShowDetails] = useState(false);
  const current = normalizeStatus(currentStatus);
  const currentIdx = stageIndex(current);

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {STAGES.map((stage, idx) => {
          const isActive = idx === currentIdx;
          const isCompleted = idx < currentIdx;
          const Icon = stage.icon;

          return (
            <React.Fragment key={stage.stage}>
              {idx > 0 && (
                <div className={cn(
                  'w-4 h-px',
                  isCompleted ? 'bg-emerald-400' : 'bg-zinc-200',
                )} />
              )}
              <div
                className={cn(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors',
                  isActive && stage.activeBg + ' border',
                  isActive && stage.activeColor,
                  isCompleted && stage.completedColor,
                  !isActive && !isCompleted && stage.color,
                )}
                title={stage.label}
              >
                <Icon className="h-3 w-3" />
                {isActive && <span>{stage.label}</span>}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Inline bar */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-zinc-50 transition-colors duration-150"
      >
        {STAGES.map((stage, idx) => {
          const isActive = idx === currentIdx;
          const isCompleted = idx < currentIdx;
          const Icon = stage.icon;

          return (
            <React.Fragment key={stage.stage}>
              {idx > 0 && (
                <div className={cn(
                  'w-6 h-px',
                  isCompleted ? 'bg-emerald-400' : 'bg-zinc-200',
                )} />
              )}
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors',
                  isActive && stage.activeBg + ' border',
                  isActive && stage.activeColor,
                  isCompleted && stage.completedColor,
                  !isActive && !isCompleted && stage.color,
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className={isActive ? '' : 'hidden sm:inline'}>{stage.label}</span>
              </div>
            </React.Fragment>
          );
        })}
        <ChevronDown className={cn(
          'h-3 w-3 text-zinc-400 transition-transform ml-1',
          showDetails && 'rotate-180',
        )} />
      </button>

      {/* Details popover */}
      {showDetails && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white rounded-lg border border-zinc-200 shadow-lg z-50 py-3">
          {/* Header */}
          <div className="px-4 pb-3 border-b border-zinc-100">
            <p className="text-sm font-semibold text-zinc-900">
              {documentTitle || 'Document'} — Status
            </p>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-400">
              {author && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {author}
                </span>
              )}
              {createdAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Created {relativeTime(createdAt)}
                </span>
              )}
            </div>
          </div>

          {/* Stage timeline */}
          <div className="px-4 py-3 space-y-0">
            {STAGES.map((stage, idx) => {
              const isActive = idx === currentIdx;
              const isCompleted = idx < currentIdx;
              const isFuture = idx > currentIdx;
              const Icon = stage.icon;
              const historyEvent = statusHistory.find(h => normalizeStatus(h.stage) === stage.stage);

              return (
                <div key={stage.stage} className="flex items-start gap-3">
                  {/* Vertical line + dot */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className={cn(
                      'h-6 w-6 rounded-full flex items-center justify-center border-2',
                      isActive && 'border-current ' + stage.activeColor + ' bg-white',
                      isCompleted && 'border-emerald-400 bg-emerald-50',
                      isFuture && 'border-zinc-200 bg-white',
                    )}>
                      <Icon className={cn(
                        'h-3 w-3',
                        isActive && stage.activeColor,
                        isCompleted && 'text-emerald-500',
                        isFuture && 'text-zinc-300',
                      )} />
                    </div>
                    {idx < STAGES.length - 1 && (
                      <div className={cn(
                        'w-px h-6',
                        isCompleted ? 'bg-emerald-300' : 'bg-zinc-200',
                      )} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="pb-4">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        'text-xs font-medium',
                        isActive && stage.activeColor,
                        isCompleted && 'text-zinc-700',
                        isFuture && 'text-zinc-400',
                      )}>
                        {stage.label}
                      </p>
                      {isActive && (
                        <span className={cn(
                          'text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded',
                          stage.activeBg, stage.activeColor,
                        )}>
                          Current
                        </span>
                      )}
                    </div>
                    {historyEvent?.timestamp && (
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {relativeTime(historyEvent.timestamp)}
                        {historyEvent.actor && ` by ${historyEvent.actor}`}
                      </p>
                    )}
                    {historyEvent?.note && (
                      <p className="text-[10px] text-zinc-500 mt-0.5 italic">{historyEvent.note}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick actions */}
          {onChangeStatus && currentIdx < STAGES.length - 1 && (
            <div className="px-4 pt-2 border-t border-zinc-100">
              <button
                onClick={() => {
                  onChangeStatus(STAGES[currentIdx + 1].stage);
                  setShowDetails(false);
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors duration-150"
              >
                <ArrowRight className="h-3 w-3" />
                Advance to {STAGES[currentIdx + 1].label}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
