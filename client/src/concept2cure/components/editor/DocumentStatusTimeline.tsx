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
import { LIFECYCLE, toLifecycleStage } from '../ui/enterprise';

// ── Types ──────────────────────────────────────────────────────────────────────

/** The 4 visible timeline stages (subset of canonical lifecycle) */
type TimelineStage = 'draft' | 'in_review' | 'approved' | 'published';

interface StageInfo {
  stage: TimelineStage;
  label: string;
  icon: React.ElementType;
  color: string;
  activeColor: string;
  activeBg: string;
  completedColor: string;
}

interface StatusEvent {
  stage: TimelineStage;
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
  onChangeStatus?: (newStatus: TimelineStage) => void;
  compact?: boolean;
}

// ── Stage definitions ───────────────────────────────────────────────────────

// Colors derived from canonical LIFECYCLE — single source of truth
const STAGES: StageInfo[] = [
  {
    stage: 'draft',
    label: LIFECYCLE.draft.label,
    icon: PenLine,
    color: 'text-stone-400',
    activeColor: LIFECYCLE.draft.text,
    activeBg: `${LIFECYCLE.draft.bg} ${LIFECYCLE.draft.border}`,
    completedColor: LIFECYCLE.approved.text,
  },
  {
    stage: 'in_review',
    label: LIFECYCLE.in_review.label,
    icon: Eye,
    color: 'text-stone-400',
    activeColor: LIFECYCLE.in_review.text,
    activeBg: `${LIFECYCLE.in_review.bg} ${LIFECYCLE.in_review.border}`,
    completedColor: LIFECYCLE.approved.text,
  },
  {
    stage: 'approved',
    label: LIFECYCLE.approved.label,
    icon: CheckCircle,
    color: 'text-stone-400',
    activeColor: LIFECYCLE.approved.text,
    activeBg: `${LIFECYCLE.approved.bg} ${LIFECYCLE.approved.border}`,
    completedColor: LIFECYCLE.approved.text,
  },
  {
    stage: 'published',
    label: LIFECYCLE.published.label,
    icon: Lock,
    color: 'text-stone-400',
    activeColor: LIFECYCLE.published.text,
    activeBg: `${LIFECYCLE.published.bg} ${LIFECYCLE.published.border}`,
    completedColor: LIFECYCLE.approved.text,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Map any status string to a timeline-visible stage via canonical lifecycle */
function normalizeStatus(raw: string): TimelineStage {
  const canonical = toLifecycleStage(raw);
  // Map canonical stages to the 4 visible timeline stages
  if (canonical === 'not_started' || canonical === 'draft') return 'draft';
  if (canonical === 'in_review') return 'in_review';
  if (canonical === 'approved') return 'approved';
  // published, superseded, archived all show as "published" in the timeline
  return 'published';
}

function stageIndex(stage: TimelineStage): number {
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
                  isCompleted ? 'bg-stone-400' : 'bg-stone-200',
                )} />
              )}
              <div
                className={cn(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors duration-150',
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
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-stone-50 transition-colors duration-150"
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
                  isCompleted ? 'bg-stone-400' : 'bg-stone-200',
                )} />
              )}
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors duration-150',
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
          'h-3 w-3 text-stone-400 transition-transform ml-1',
          showDetails && 'rotate-180',
        )} />
      </button>

      {/* Details popover */}
      {showDetails && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white rounded-lg border border-stone-200 shadow-sm z-50 py-3">
          {/* Header */}
          <div className="px-4 pb-3 border-b border-stone-100">
            <p className="text-sm font-semibold text-stone-900">
              {documentTitle || 'Document'} — Status
            </p>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-stone-400">
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
                      isCompleted && 'border-stone-400 bg-stone-100',
                      isFuture && 'border-stone-200 bg-white',
                    )}>
                      <Icon className={cn(
                        'h-3 w-3',
                        isActive && stage.activeColor,
                        isCompleted && 'text-stone-1000',
                        isFuture && 'text-stone-300',
                      )} />
                    </div>
                    {idx < STAGES.length - 1 && (
                      <div className={cn(
                        'w-px h-6',
                        isCompleted ? 'bg-stone-300' : 'bg-stone-200',
                      )} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="pb-4">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        'text-xs font-medium',
                        isActive && stage.activeColor,
                        isCompleted && 'text-stone-700',
                        isFuture && 'text-stone-400',
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
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        {relativeTime(historyEvent.timestamp)}
                        {historyEvent.actor && ` by ${historyEvent.actor}`}
                      </p>
                    )}
                    {historyEvent?.note && (
                      <p className="text-[10px] text-stone-500 mt-0.5 italic">{historyEvent.note}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick actions */}
          {onChangeStatus && currentIdx < STAGES.length - 1 && (
            <div className="px-4 pt-2 border-t border-stone-100">
              <button
                onClick={() => {
                  onChangeStatus(STAGES[currentIdx + 1].stage);
                  setShowDetails(false);
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-stone-800 rounded-md hover:bg-stone-900 transition-colors duration-150"
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
