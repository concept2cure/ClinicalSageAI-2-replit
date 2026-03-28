/**
 * NextActionsPanel Component
 *
 * P0 Priority UI Component — Dashboard panel showing user's next actions
 * across all active workflows. Prioritized by SLA urgency.
 *
 * Uses enterprise UI primitives for design consistency.
 */

import React, { useMemo } from 'react';
import {
  Play,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  PenTool,
  ChevronRight,
  Sparkles,
  Zap,
  Target,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  EnterpriseCard,
  CardSection,
  IconBox,
  StatusPill,
  EnterpriseButton,
  SectionHeader,
  EmptyState as EmptyStatePrimitive,
} from '../ui/enterprise';

// Types
export interface ActionableStep {
  id: string;
  name: string;
  description?: string;
  stepType: 'TASK' | 'APPROVAL' | 'REVIEW' | 'SIGNATURE' | 'EXPORT';
  status: 'READY' | 'IN_PROGRESS' | 'AWAITING_APPROVAL' | 'AWAITING_SIGNATURE';
  workflowName: string;
  workflowId: string;
  workflowRunId?: string;
  slaDueAt?: Date | string;
  slaBreached?: boolean;
  hoursRemaining?: number;
  assigneeRole?: string;
  order: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface NextActionsPanelProps {
  actions: ActionableStep[];
  userId?: string;
  onActionClick?: (action: ActionableStep) => void;
  onStartAction?: (action: ActionableStep) => void;
  onCompleteAction?: (action: ActionableStep) => void;
  className?: string;
  maxItems?: number;
  showEmpty?: boolean;
}

// Priority → visual config
const PRIORITY_CONFIG: Record<string, {
  pillVariant: 'danger' | 'warning' | 'info' | 'default';
  label: string;
  timeColor: string;
}> = {
  CRITICAL: { pillVariant: 'danger', label: 'Critical', timeColor: 'text-red-600' },
  HIGH: { pillVariant: 'warning', label: 'High', timeColor: 'text-amber-600' },
  MEDIUM: { pillVariant: 'info', label: 'Medium', timeColor: 'text-stone-600' },
  LOW: { pillVariant: 'default', label: 'Low', timeColor: 'text-stone-500' },
};

// Status → IconBox color
const STATUS_ICON_CLASS: Record<string, string> = {
  READY: 'bg-blue-100 text-stone-600',
  IN_PROGRESS: 'bg-emerald-100 text-emerald-600',
  AWAITING_APPROVAL: 'bg-amber-100 text-amber-600',
  AWAITING_SIGNATURE: 'bg-purple-100 text-purple-600',
};

// Step type → icon
const STEP_TYPE_ICONS: Record<string, React.ElementType> = {
  APPROVAL: CheckCircle2,
  REVIEW: CheckCircle2,
  SIGNATURE: PenTool,
  EXPORT: Send,
  TASK: Play,
};

// Calculate priority from SLA
function calculatePriority(action: ActionableStep): ActionableStep['priority'] {
  if (action.slaBreached) return 'CRITICAL';
  const hoursRemaining = action.hoursRemaining ??
    (action.slaDueAt ? (new Date(action.slaDueAt).getTime() - Date.now()) / (1000 * 60 * 60) : 999);
  if (hoursRemaining < 0) return 'CRITICAL';
  if (hoursRemaining < 8) return 'HIGH';
  if (hoursRemaining < 24) return 'MEDIUM';
  return 'LOW';
}

// Primary action config per status
function getPrimaryAction(action: ActionableStep) {
  switch (action.status) {
    case 'READY':
      return { label: 'Start', icon: Play, variant: 'primary' as const };
    case 'IN_PROGRESS':
      return { label: action.stepType === 'APPROVAL' ? 'Review' : 'Complete', icon: CheckCircle2, variant: 'success' as const };
    case 'AWAITING_APPROVAL':
      return { label: 'Review', icon: CheckCircle2, variant: 'warning' as const };
    case 'AWAITING_SIGNATURE':
      return { label: 'Sign', icon: PenTool, variant: 'purple' as const };
    default:
      return null;
  }
}

// ─── ActionItem ──────────────────────────────────────────────────────────────

const ActionItem: React.FC<{
  action: ActionableStep;
  onClick?: () => void;
  onStart?: () => void;
  onComplete?: () => void;
}> = ({ action, onClick, onStart, onComplete }) => {
  const priority = action.priority || calculatePriority(action);
  const config = PRIORITY_CONFIG[priority];
  const StepIcon = STEP_TYPE_ICONS[action.stepType] || Play;
  const primaryAction = getPrimaryAction(action);

  const timeDisplay = useMemo(() => {
    if (action.slaBreached) return 'Overdue';
    if (!action.slaDueAt) return null;
    const hours = action.hoursRemaining ??
      (new Date(action.slaDueAt).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hours < 0) return 'Overdue';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${Math.round(hours)}h`;
    return `${Math.round(hours / 24)}d`;
  }, [action.slaDueAt, action.hoursRemaining, action.slaBreached]);

  return (
    <div
      className={cn(
        'group relative p-4 rounded-xl border bg-white transition-all duration-150 hover:shadow-md cursor-pointer',
        'focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none',
        priority === 'CRITICAL' ? 'border-red-200' : 'border-stone-200',
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
      aria-label={`${action.name} in ${action.workflowName}, priority ${priority.toLowerCase()}`}
    >
      <div className="flex items-start gap-3">
        <IconBox
          icon={StepIcon}
          size="sm"
          className={STATUS_ICON_CLASS[action.status] || 'bg-stone-100 text-stone-500'}
        />

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-stone-900 truncate">{action.name}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs text-stone-500 truncate">{action.workflowName}</span>
            <StatusPill label={config.label} variant={config.pillVariant} />
          </div>
          {timeDisplay && (
            <div className={cn('flex items-center gap-1 mt-1.5 text-xs', config.timeColor)}>
              {priority === 'CRITICAL' ? <AlertTriangle size={12} /> : <Clock size={12} />}
              <span>{timeDisplay} remaining</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {primaryAction && (
            <EnterpriseButton
              variant={primaryAction.variant}
              size="sm"
              icon={primaryAction.icon}
              onClick={(e) => { e.stopPropagation(); (action.status === 'READY' ? onStart : onComplete)?.(); }}
            >
              {primaryAction.label}
            </EnterpriseButton>
          )}

          {action.workflowRunId && (
            <a
              href={`/concept2cure/proofs/${action.workflowRunId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-stone-200 text-stone-700 hover:bg-stone-50 transition-colors duration-150"
              onClick={(event) => event.stopPropagation()}
              aria-label={`View proof for ${action.name}`}
            >
              <ShieldCheck size={14} />
              Proof
            </a>
          )}

          <ChevronRight size={16} className="text-stone-400 group-hover:text-stone-600 transition-colors duration-150" />
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const NextActionsPanel: React.FC<NextActionsPanelProps> = ({
  actions,
  userId: _userId,
  onActionClick,
  onStartAction,
  onCompleteAction,
  className,
  maxItems = 5,
  showEmpty = true,
}) => {
  const sortedActions = useMemo(() => {
    return [...actions]
      .map((action) => ({
        ...action,
        priority: action.priority || calculatePriority(action),
      }))
      .sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return order[a.priority] - order[b.priority];
      })
      .slice(0, maxItems);
  }, [actions, maxItems]);

  const criticalCount = sortedActions.filter((a) => a.priority === 'CRITICAL').length;
  const totalCount = actions.length;

  if (sortedActions.length === 0 && showEmpty) {
    return (
      <EnterpriseCard noPadding className={className}>
        <EmptyStatePrimitive
          icon={Sparkles}
          title="All caught up!"
          description="No pending actions at the moment. Great job staying on top of your workflows."
        />
      </EnterpriseCard>
    );
  }

  if (sortedActions.length === 0) return null;

  return (
    <EnterpriseCard noPadding className={className}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-stone-100">
        <SectionHeader
          icon={Zap}
          iconClassName="bg-gradient-to-br from-blue-500 to-purple-500 text-white"
          title="Your Next Actions"
          subtitle={`${totalCount} pending ${totalCount === 1 ? 'action' : 'actions'}`}
          actions={
            criticalCount > 0 ? (
              <StatusPill label={`${criticalCount} critical`} variant="danger" dot />
            ) : undefined
          }
        />
      </div>

      {/* Action List */}
      <div className="p-4 space-y-3">
        {sortedActions.map((action) => (
          <ActionItem
            key={action.id}
            action={action}
            onClick={() => onActionClick?.(action)}
            onStart={() => onStartAction?.(action)}
            onComplete={() => onCompleteAction?.(action)}
          />
        ))}
      </div>

      {/* Footer */}
      {totalCount > maxItems && (
        <div className="px-5 py-3 bg-stone-50 border-t border-stone-100">
          <button className="w-full flex items-center justify-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-700 transition-colors duration-150">
            <Target size={16} />
            View all {totalCount} actions
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </EnterpriseCard>
  );
};

// Quick stats bar
export const ActionStatsBar: React.FC<{
  actions: ActionableStep[];
  className?: string;
}> = ({ actions, className }) => {
  const stats = useMemo(() => {
    let critical = 0, high = 0, medium = 0, low = 0;
    actions.forEach((action) => {
      const priority = action.priority || calculatePriority(action);
      switch (priority) {
        case 'CRITICAL': critical++; break;
        case 'HIGH': high++; break;
        case 'MEDIUM': medium++; break;
        case 'LOW': low++; break;
      }
    });
    return { critical, high, medium, low, total: actions.length };
  }, [actions]);

  if (stats.total === 0) return null;

  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <span className="text-stone-500">Actions:</span>
      {stats.critical > 0 && <StatusPill label={String(stats.critical)} variant="danger" dot />}
      {stats.high > 0 && <StatusPill label={String(stats.high)} variant="warning" dot />}
      {stats.medium > 0 && <StatusPill label={String(stats.medium)} variant="info" dot />}
      {stats.low > 0 && <StatusPill label={String(stats.low)} variant="default" />}
    </div>
  );
};

export default NextActionsPanel;
