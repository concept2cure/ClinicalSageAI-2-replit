/**
 * WorkflowTimeline Component
 * 
 * 🔴 P0 Priority UI Component
 * 
 * Visual timeline showing all workflow steps with status indicators,
 * progress tracking, and phase groupings. Claude-style design.
 */

import React, { useMemo } from 'react';
import { LIFECYCLE } from '../ui/enterprise';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Lock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  status: 'PENDING' | 'READY' | 'IN_PROGRESS' | 'AWAITING_APPROVAL' | 'AWAITING_SIGNATURE' | 'COMPLETED' | 'SKIPPED' | 'BLOCKED' | 'FAILED';
  stepType: 'TASK' | 'APPROVAL' | 'REVIEW' | 'SIGNATURE' | 'EXPORT' | 'IMPORT' | 'NOTIFICATION';
  order: number;
  phaseId?: string;
  phaseName?: string;
  assigneeRole?: string;
  slaHours?: number;
  slaDueAt?: Date | string;
  slaBreached?: boolean;
  completedAt?: Date | string;
  startedAt?: Date | string;
  isRequired: boolean;
  isExpanded?: boolean;
}

export interface WorkflowPhase {
  id: string;
  name: string;
  steps: WorkflowStep[];
  isExpanded: boolean;
}

export interface WorkflowTimelineProps {
  steps: WorkflowStep[];
  currentStepId?: string;
  progressPercent: number;
  assetState: string;
  workflowRunId?: string;
  onStepClick?: (step: WorkflowStep) => void;
  onPhaseToggle?: (phaseId: string) => void;
  className?: string;
  variant?: 'vertical' | 'horizontal';
  showPhases?: boolean;
}

// Status icon mapping
const StatusIcon: React.FC<{ status: WorkflowStep['status']; size?: number }> = ({ 
  status, 
  size = 20 
}) => {
  const iconProps = { size, strokeWidth: 2 };
  
  switch (status) {
    case 'COMPLETED':
      return <CheckCircle2 {...iconProps} className="text-green-500" />;
    case 'IN_PROGRESS':
      return <Circle {...iconProps} className="text-blue-500 fill-blue-100" />;
    case 'AWAITING_APPROVAL':
    case 'AWAITING_SIGNATURE':
      return <Clock {...iconProps} className="text-amber-500" />;
    case 'READY':
      return <Circle {...iconProps} className="text-blue-400" />;
    case 'BLOCKED':
      return <Lock {...iconProps} className="text-red-500" />;
    case 'FAILED':
      return <AlertTriangle {...iconProps} className="text-red-500" />;
    case 'SKIPPED':
      return <CheckCircle2 {...iconProps} className="text-zinc-400" />;
    default:
      return <Circle {...iconProps} className="text-zinc-400" />;
  }
};

// Timeline Step Component
const TimelineStep: React.FC<{
  step: WorkflowStep;
  isActive: boolean;
  isLast: boolean;
  workflowRunId?: string;
  onClick?: () => void;
}> = ({ step, isActive, isLast, workflowRunId, onClick }) => {
  const isClickable = step.status !== 'PENDING' && step.status !== 'BLOCKED';
  const canShowProof = Boolean(workflowRunId) && step.status !== 'PENDING' && step.status !== 'BLOCKED';
  const statusLabel = step.status.replace(/_/g, ' ').toLowerCase();
  
  return (
    <button
      type="button"
      className={cn(
        "flex items-start gap-4 group text-left w-full",
        isClickable
          ? "cursor-pointer hover:bg-zinc-50 rounded-lg -mx-2 px-2 py-2 transition-colors duration-150"
          : "cursor-not-allowed opacity-80"
      )}
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      aria-label={`${step.name} (${statusLabel})`}
      aria-current={isActive ? 'step' : undefined}
      data-testid={`button-workflow-step-${step.id}`}
    >
      {/* Icon and connector line */}
      <div className="flex flex-col items-center">
        <div className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-150",
          isActive && "ring-2 ring-blue-200 ring-offset-2",
          step.status === 'COMPLETED' && "border-green-500 bg-green-50",
          step.status === 'IN_PROGRESS' && "border-blue-500 bg-blue-50",
          step.status === 'AWAITING_APPROVAL' && "border-amber-500 bg-amber-50",
          step.status === 'BLOCKED' && "border-red-500 bg-red-50",
          step.status === 'PENDING' && "border-zinc-200 bg-white",
          step.status === 'READY' && "border-blue-300 bg-blue-50"
        )}>
          <StatusIcon status={step.status} size={18} />
        </div>
        
        {/* Connector line */}
        {!isLast && (
          <div className={cn(
            "w-0.5 h-12 mt-2",
            step.status === 'COMPLETED' ? 'bg-emerald-300' : 'bg-zinc-200'
          )} />
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 pb-8">
        <div className="flex items-center gap-2">
          <h4 className={cn(
            "font-medium",
            step.status === 'COMPLETED' && LIFECYCLE.approved.text,
            step.status === 'IN_PROGRESS' && LIFECYCLE.in_review.text,
            step.status === 'BLOCKED' && "text-red-700",
            step.status === 'PENDING' && LIFECYCLE.not_started.text
          )}>
            {step.name}
          </h4>
          
          {step.isRequired && (
            <span className="text-xs px-1.5 py-0.5 bg-zinc-100 text-zinc-600 rounded">
              Required
            </span>
          )}
          {step.slaBreached && (
            <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded flex items-center gap-1">
              <AlertTriangle size={12} />
              SLA Breached
            </span>
          )}
        </div>
        
        {step.description && (
          <p className="text-sm text-zinc-500 mt-1">
            {step.description}
          </p>
        )}
        
        {/* Metadata row */}
        <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
          {step.stepType && (
            <span className="capitalize">{step.stepType.toLowerCase()}</span>
          )}
          {step.assigneeRole && (
            <span>• {step.assigneeRole}</span>
          )}
          {step.slaDueAt && step.status !== 'COMPLETED' && (
            <span className={cn(
              step.slaBreached && "text-red-500"
            )}>
              • Due: {new Date(step.slaDueAt).toLocaleDateString()}
            </span>
          )}
          {step.completedAt && (
            <span className="text-green-500">
              • Completed: {new Date(step.completedAt).toLocaleDateString()}
            </span>
          )}
          {canShowProof && (
            <a
              href={`/concept2cure/proofs/${workflowRunId}`}
              className="text-xs text-blue-600 hover:text-blue-700"
              onClick={(event) => event.stopPropagation()}
            >
              • View Proof
            </a>
          )}
        </div>
      </div>
    </button>
  );
};

// Phase Grouping Component
const PhaseGroup: React.FC<{
  phase: WorkflowPhase;
  currentStepId?: string;
  workflowRunId?: string;
  onToggle: () => void;
  onStepClick?: (step: WorkflowStep) => void;
}> = ({ phase, currentStepId, workflowRunId, onToggle, onStepClick }) => {
  const completedCount = phase.steps.filter(s => s.status === 'COMPLETED').length;
  const totalCount = phase.steps.length;
  const phaseProgress = Math.round((completedCount / totalCount) * 100);
  
  return (
    <div className="mb-6">
      {/* Phase Header */}
      <button
        onClick={onToggle}
        className="flex items-center gap-3 w-full p-3 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition-colors duration-150"
        aria-expanded={phase.isExpanded}
        aria-controls={`phase-${phase.id}`}
        data-testid={`button-phase-toggle-${phase.id}`}
      >
        {phase.isExpanded ? (
          <ChevronDown size={18} className="text-zinc-500" />
        ) : (
          <ChevronRight size={18} className="text-zinc-500" />
        )}
        
        <div className="flex-1 text-left">
          <h3 className="font-semibold text-zinc-900">
            {phase.name}
          </h3>
          <p className="text-xs text-zinc-500">
            {completedCount} of {totalCount} steps complete
          </p>
        </div>
        
        {/* Phase Progress */}
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${phaseProgress}%` }}
            />
          </div>
          <span className="text-xs font-medium text-zinc-600 w-8">
            {phaseProgress}%
          </span>
        </div>
      </button>
      {/* Phase Steps */}
      {phase.isExpanded && (
        <div
          id={`phase-${phase.id}`}
          className="mt-4 pl-4 border-l-2 border-zinc-200 ml-4"
        >
          {phase.steps.map((step, idx) => (
            <TimelineStep
              key={step.id}
              step={step}
              isActive={step.id === currentStepId}
              isLast={idx === phase.steps.length - 1}
              workflowRunId={workflowRunId}
              onClick={() => onStepClick?.(step)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Main Component
export const WorkflowTimeline: React.FC<WorkflowTimelineProps> = ({
  steps,
  currentStepId,
  progressPercent,
  assetState,
  workflowRunId,
  onStepClick,
  onPhaseToggle,
  className,
  variant = 'vertical',
  showPhases = true,
}) => {
  // Group steps by phase
  const phases = useMemo(() => {
    if (!showPhases) return [];
    
    const phaseMap = new Map<string, WorkflowPhase>();
    
    steps.forEach(step => {
      const phaseId = step.phaseId || 'default';
      const phaseName = step.phaseName || 'Steps';
      
      if (!phaseMap.has(phaseId)) {
        phaseMap.set(phaseId, {
          id: phaseId,
          name: phaseName,
          steps: [],
          isExpanded: true, // Expand phases with current step
        });
      }
      
      phaseMap.get(phaseId)!.steps.push(step);
    });
    
    // Set expansion based on current step
    if (currentStepId) {
      phaseMap.forEach((phase) => {
        phase.isExpanded = phase.steps.some(s => s.id === currentStepId);
      });
    }
    
    return Array.from(phaseMap.values());
  }, [steps, showPhases, currentStepId]);

  // Asset state badge color
  const assetStateBadgeClass = useMemo(() => {
    switch (assetState) {
      case 'DRAFT': return 'bg-zinc-100 text-zinc-700';
      case 'REVIEW': return 'bg-amber-100 text-amber-700';
      case 'APPROVED': return 'bg-green-100 text-green-700';
      case 'SUBMITTED': return 'bg-blue-100 text-blue-700';
      case 'ACCEPTED': return 'bg-emerald-100 text-emerald-700';
      case 'DEFICIENCY': return 'bg-red-100 text-red-700';
      default: return 'bg-zinc-100 text-zinc-700';
    }
  }, [assetState]);

  if (variant === 'horizontal') {
    return (
      <div className={cn("w-full", className)}>
        {/* Horizontal Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-zinc-700">
              Progress
            </span>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-xs px-2 py-1 rounded-full font-medium",
                assetStateBadgeClass
              )}>
                {assetState}
              </span>
              <span className="text-sm font-medium text-zinc-900">
                {progressPercent}%
              </span>
            </div>
          </div>
          <div className="w-full h-2 bg-zinc-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-700"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        
        {/* Horizontal Step Indicators */}
        <div className="flex items-center justify-between overflow-x-auto pb-4">
          {steps.map((step, idx) => (
            <React.Fragment key={step.id}>
              <div 
                className={cn(
                  "flex flex-col items-center gap-2 min-w-[100px]",
                  step.status !== 'PENDING' && "cursor-pointer"
                )}
                onClick={() => step.status !== 'PENDING' && onStepClick?.(step)}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-150",
                  step.id === currentStepId && "ring-2 ring-blue-200",
                  step.status === 'COMPLETED' && "border-green-500 bg-green-50",
                  step.status === 'IN_PROGRESS' && "border-blue-500 bg-blue-50",
                  step.status === 'PENDING' && "border-zinc-200"
                )}>
                  <StatusIcon status={step.status} size={14} />
                </div>
                <span className={cn(
                  "text-xs text-center max-w-[80px] truncate",
                  step.status === 'COMPLETED' && "text-green-600",
                  step.status === 'IN_PROGRESS' && "text-blue-600",
                  step.status === 'PENDING' && "text-zinc-400"
                )}>
                  {step.name}
                </span>
              </div>
              
              {idx < steps.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 bg-zinc-200">
                  <div 
                    className={cn(
                      "h-full transition-all duration-500",
                      step.status === 'COMPLETED' ? 'bg-green-500' : 'bg-transparent'
                    )}
                    style={{ width: step.status === 'COMPLETED' ? '100%' : '0%' }}
                  />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  // Vertical Timeline (default)
  return (
    <div className={cn("w-full", className)}>
      {/* Header with Progress */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-zinc-200">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            Workflow Progress
          </h2>
          <p className="text-sm text-zinc-500">
            {steps.filter(s => s.status === 'COMPLETED').length} of {steps.length} steps complete
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <span className={cn(
            "text-xs px-3 py-1.5 rounded-full font-medium uppercase tracking-wide",
            assetStateBadgeClass
          )}>
            {assetState}
          </span>
          <div
            className="text-2xl font-semibold text-zinc-900"
            aria-label={`Workflow progress ${progressPercent}%`}
          >
            {progressPercent}%
          </div>
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="mb-6">
        <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
      
      {/* Phase Groups or Flat List */}
      {showPhases && phases.length > 0 ? (
        <div className="space-y-2">
          {phases.map(phase => (
            <PhaseGroup
              key={phase.id}
              phase={phase}
              currentStepId={currentStepId}
              workflowRunId={workflowRunId}
              onToggle={() => onPhaseToggle?.(phase.id)}
              onStepClick={onStepClick}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {steps.map((step, idx) => (
            <TimelineStep
              key={step.id}
              step={step}
              isActive={step.id === currentStepId}
              isLast={idx === steps.length - 1}
              workflowRunId={workflowRunId}
              onClick={() => onStepClick?.(step)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkflowTimeline;
