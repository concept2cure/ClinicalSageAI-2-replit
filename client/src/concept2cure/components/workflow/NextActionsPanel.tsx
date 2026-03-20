/**
 * NextActionsPanel Component
 * 
 * 🔴 P0 Priority UI Component
 * 
 * Dashboard panel showing the user's next available actions across
 * all active workflows. Prioritized by SLA urgency.
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

// Priority badge colors
const priorityConfig = {
  CRITICAL: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: '🔴 Critical' },
  HIGH: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', label: '🟠 High' },
  MEDIUM: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', label: '🟡 Medium' },
  LOW: { bg: 'bg-zinc-100', text: 'text-zinc-600', border: 'border-zinc-300', label: '⚪ Low' },
};

// Calculate priority from SLA
const calculatePriority = (action: ActionableStep): ActionableStep['priority'] => {
  if (action.slaBreached) return 'CRITICAL';
  
  const hoursRemaining = action.hoursRemaining ?? 
    (action.slaDueAt ? (new Date(action.slaDueAt).getTime() - Date.now()) / (1000 * 60 * 60) : 999);
  
  if (hoursRemaining < 0) return 'CRITICAL';
  if (hoursRemaining < 8) return 'HIGH';
  if (hoursRemaining < 24) return 'MEDIUM';
  return 'LOW';
};

// Action type icon
const ActionTypeIcon: React.FC<{ type: ActionableStep['stepType']; size?: number }> = ({ 
  type, 
  size = 18 
}) => {
  switch (type) {
    case 'APPROVAL':
    case 'REVIEW':
      return <CheckCircle2 size={size} />;
    case 'SIGNATURE':
      return <PenTool size={size} />;
    case 'EXPORT':
      return <Send size={size} />;
    default:
      return <Play size={size} />;
  }
};

// Single action item component
const ActionItem: React.FC<{
  action: ActionableStep;
  onClick?: () => void;
  onStart?: () => void;
  onComplete?: () => void;
}> = ({ action, onClick, onStart, onComplete }) => {
  const priority = action.priority || calculatePriority(action);
  const config = priorityConfig[priority];
  const ariaLabel = `${action.name} in ${action.workflowName}, priority ${priority.toLowerCase()}`;
  
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
  
  // Determine primary action button
  const getPrimaryAction = () => {
    switch (action.status) {
      case 'READY':
        return {
          label: 'Start',
          icon: Play,
          onClick: onStart,
          className: 'bg-blue-500 hover:bg-blue-600 text-white',
        };
      case 'IN_PROGRESS':
        return {
          label: action.stepType === 'APPROVAL' ? 'Review' : 'Complete',
          icon: CheckCircle2,
          onClick: onComplete,
          className: 'bg-green-500 hover:bg-green-600 text-white',
        };
      case 'AWAITING_APPROVAL':
        return {
          label: 'Review',
          icon: CheckCircle2,
          onClick: onClick,
          className: 'bg-amber-500 hover:bg-amber-600 text-white',
        };
      case 'AWAITING_SIGNATURE':
        return {
          label: 'Sign',
          icon: PenTool,
          onClick: onClick,
          className: 'bg-purple-500 hover:bg-purple-600 text-white',
        };
      default:
        return null;
    }
  };
  
  const primaryAction = getPrimaryAction();
  
  return (
    <div
      className={cn(
        "group relative p-4 rounded-2xl border bg-white transition-all hover:shadow-md cursor-pointer",
        config.border,
        priority === 'CRITICAL' && "animate-pulse-subtle"
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
      aria-label={ariaLabel}
    >
      <div className="flex items-start gap-3">
        {/* Action type icon */}
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center",
          action.status === 'AWAITING_APPROVAL' && "bg-amber-100 text-amber-600",
          action.status === 'AWAITING_SIGNATURE' && "bg-purple-100 text-purple-600",
          action.status === 'READY' && "bg-blue-100 text-blue-600",
          action.status === 'IN_PROGRESS' && "bg-green-100 text-green-600"
        )}>
          <ActionTypeIcon type={action.stepType} />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-zinc-900 truncate">
            {action.name}
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="truncate">{action.workflowName}</span>
            <span className={cn(
              "px-2 py-0.5 rounded-full font-medium",
              config.bg, config.text
            )}>
              {config.label}
            </span>
          </div>
          
          {/* Time remaining */}
          {timeDisplay && (
            <div className={cn(
              "flex items-center gap-1 mt-1 text-xs",
              priority === 'CRITICAL' && "text-red-600",
              priority === 'HIGH' && "text-amber-600",
              priority === 'MEDIUM' && "text-blue-600",
              priority === 'LOW' && "text-zinc-500"
            )}>
              {priority === 'CRITICAL' ? (
                <AlertTriangle size={12} />
              ) : (
                <Clock size={12} />
              )}
              <span>{timeDisplay} remaining</span>
            </div>
          )}
        </div>
        
        {/* Primary action button */}
        {primaryAction && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              primaryAction.onClick?.();
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              primaryAction.className
            )}
          >
            <primaryAction.icon size={14} />
            {primaryAction.label}
          </button>
        )}

        {action.workflowRunId && (
          <a
            href={`/concept2cure/proofs/${action.workflowRunId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={(event) => event.stopPropagation()}
            aria-label={`View proof for ${action.name}`}
          >
            <ShieldCheck size={14} />
            Proof
          </a>
        )}
        
        <ChevronRight 
          size={16} 
          className="text-zinc-400 group-hover:text-zinc-500 transition-colors" 
        />
      </div>
    </div>
  );
};

// Empty state component
const EmptyState: React.FC = () => (
  <div className="text-center py-12 px-6">
    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
      <Sparkles size={32} className="text-green-500" />
    </div>
    <h3 className="text-lg font-medium text-zinc-900 mb-1">
      All caught up!
    </h3>
    <p className="text-sm text-zinc-500">
      No pending actions at the moment. Great job staying on top of your workflows.
    </p>
  </div>
);

// Main component
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
  // Sort actions by priority (SLA urgency)
  const sortedActions = useMemo(() => {
    return [...actions]
      .map(action => ({
        ...action,
        priority: action.priority || calculatePriority(action),
      }))
      .sort((a, b) => {
        const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .slice(0, maxItems);
  }, [actions, maxItems]);
  
  // Stats
  const criticalCount = sortedActions.filter(a => a.priority === 'CRITICAL').length;
  const totalCount = actions.length;
  
  if (sortedActions.length === 0 && showEmpty) {
    return (
      <div className={cn(
        "bg-white rounded-2xl border border-zinc-200",
        className
      )}>
        <EmptyState />
      </div>
    );
  }
  
  if (sortedActions.length === 0) {
    return null;
  }
  
  return (
    <div className={cn(
      "bg-white rounded-2xl border border-zinc-200 overflow-hidden",
      className
    )}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Your Next Actions
              </h2>
              <p className="text-sm text-zinc-500">
                {totalCount} pending {totalCount === 1 ? 'action' : 'actions'}
              </p>
            </div>
          </div>
          
          {criticalCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-sm font-medium">
              <AlertTriangle size={14} />
              {criticalCount} critical
            </div>
          )}
        </div>
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
      
      {/* Footer - View All */}
      {totalCount > maxItems && (
        <div className="px-6 py-3 bg-zinc-50 border-t border-zinc-200">
          <button className="w-full flex items-center justify-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
            <Target size={16} />
            View all {totalCount} actions
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

// Quick stats bar component for use in headers
export const ActionStatsBar: React.FC<{
  actions: ActionableStep[];
  className?: string;
}> = ({ actions, className }) => {
  const stats = useMemo(() => {
    let critical = 0, high = 0, medium = 0, low = 0;
    
    actions.forEach(action => {
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
    <div className={cn("flex items-center gap-3 text-sm", className)}>
      <span className="text-zinc-500">Actions:</span>
      {stats.critical > 0 && (
        <span className="flex items-center gap-1 text-red-600 font-medium">
          🔴 {stats.critical}
        </span>
      )}
      {stats.high > 0 && (
        <span className="flex items-center gap-1 text-amber-600">
          🟠 {stats.high}
        </span>
      )}
      {stats.medium > 0 && (
        <span className="flex items-center gap-1 text-blue-600">
          🟡 {stats.medium}
        </span>
      )}
      {stats.low > 0 && (
        <span className="flex items-center gap-1 text-zinc-500">
          ⚪ {stats.low}
        </span>
      )}
    </div>
  );
};

export default NextActionsPanel;
