/**
 * StepCard Component
 * 
 * 🔴 P0 Priority UI Component
 * 
 * Detailed card view for a single workflow step showing all relevant
 * information, actions, and history. Claude-style design.
 */

import React, { useState } from 'react';
import { Link } from 'wouter';
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Play,
  Send,
  PenTool,
  FileText,
  Users,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  History,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PreconditionBadges } from './PreconditionBadges';

// Types
export interface StepCardProps {
  step: {
    id: string;
    name: string;
    description?: string;
    status: 'PENDING' | 'READY' | 'IN_PROGRESS' | 'AWAITING_APPROVAL' | 'AWAITING_SIGNATURE' | 'COMPLETED' | 'SKIPPED' | 'BLOCKED' | 'FAILED';
    stepType: 'TASK' | 'APPROVAL' | 'REVIEW' | 'SIGNATURE' | 'EXPORT' | 'IMPORT' | 'NOTIFICATION';
    order: number;
    phaseName?: string;
    assigneeRole?: string;
    assigneeUserId?: string;
    assigneeName?: string;
    preconditions?: Array<{
      id: string;
      type: string;
      target: string;
      passed?: boolean;
      errorMessage?: string;
    }>;
    effects?: Array<{
      id: string;
      type: string;
      target: string;
    }>;
    slaHours?: number;
    slaDueAt?: Date | string;
    slaBreached?: boolean;
    startedAt?: Date | string;
    completedAt?: Date | string;
    completedBy?: string;
    actualDurationMinutes?: number;
    isRequired: boolean;
    linkedArtifactIds?: string[];
    completionData?: Record<string, unknown>;
    lastError?: string;
  };
  workflowRunId?: string;
  onStart?: () => void;
  onComplete?: (data: Record<string, unknown>) => void;
  onSubmitForApproval?: () => void;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  onSign?: () => void;
  onViewHistory?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
}

// Step type icons
const StepTypeIcon: React.FC<{ type: StepCardProps['step']['stepType']; size?: number }> = ({ 
  type, 
  size = 18 
}) => {
  const iconProps = { size, strokeWidth: 2 };
  
  switch (type) {
    case 'TASK':
      return <FileText {...iconProps} />;
    case 'APPROVAL':
    case 'REVIEW':
      return <Users {...iconProps} />;
    case 'SIGNATURE':
      return <PenTool {...iconProps} />;
    case 'EXPORT':
      return <Send {...iconProps} />;
    default:
      return <FileText {...iconProps} />;
  }
};

// Status badge component
const StatusBadge: React.FC<{ status: StepCardProps['step']['status'] }> = ({ status }) => {
  const config = {
    PENDING: { bg: 'bg-zinc-100', text: 'text-zinc-600', label: 'Pending' },
    READY: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Ready' },
    IN_PROGRESS: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Progress' },
    AWAITING_APPROVAL: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Awaiting Approval' },
    AWAITING_SIGNATURE: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Awaiting Signature' },
    COMPLETED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
    SKIPPED: { bg: 'bg-zinc-100', text: 'text-zinc-500', label: 'Skipped' },
    BLOCKED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Blocked' },
    FAILED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
  };
  
  const { bg, text, label } = config[status] || config.PENDING;
  
  return (
    <span className={cn(
      "px-2.5 py-1 rounded-full text-xs font-medium",
      bg, text
    )}>
      {label}
    </span>
  );
};

// SLA indicator component
const SLAIndicator: React.FC<{ 
  slaDueAt?: Date | string; 
  slaBreached?: boolean;
  status: string;
}> = ({ slaDueAt, slaBreached, status }) => {
  if (!slaDueAt || status === 'COMPLETED' || status === 'SKIPPED') return null;
  
  const dueDate = new Date(slaDueAt);
  const now = new Date();
  const hoursRemaining = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  if (slaBreached || hoursRemaining < 0) {
    return (
      <div className="flex items-center gap-1.5 text-red-600 text-sm">
        <AlertTriangle size={14} />
        <span className="font-medium">SLA Breached</span>
      </div>
    );
  }
  
  if (hoursRemaining < 8) {
    return (
      <div className="flex items-center gap-1.5 text-amber-600 text-sm">
        <Clock size={14} />
        <span>Due in {Math.round(hoursRemaining)}h</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-1.5 text-zinc-500 text-sm">
      <Clock size={14} />
      <span>Due: {dueDate.toLocaleDateString()}</span>
    </div>
  );
};

// Main StepCard Component
export const StepCard: React.FC<StepCardProps> = ({
  step,
  workflowRunId,
  onStart,
  onComplete,
  onSubmitForApproval,
  onApprove,
  onReject,
  onSign,
  onViewHistory,
  isExpanded = false,
  onToggleExpand,
  className,
}) => {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const expandedId = `step-${step.id}-details`;

  // Determine available actions
  const canStart = step.status === 'READY';
  const canComplete = step.status === 'IN_PROGRESS' && step.stepType === 'TASK';
  const canSubmitForApproval = step.status === 'IN_PROGRESS' && 
    (step.stepType === 'APPROVAL' || step.stepType === 'REVIEW');
  const canApprove = step.status === 'AWAITING_APPROVAL';
  const canSign = step.status === 'AWAITING_SIGNATURE';
  
  // Card border color based on status
  const borderColor = {
    PENDING: 'border-zinc-200',
    READY: 'border-blue-300',
    IN_PROGRESS: 'border-blue-500',
    AWAITING_APPROVAL: 'border-amber-400',
    AWAITING_SIGNATURE: 'border-purple-400',
    COMPLETED: 'border-green-400',
    SKIPPED: 'border-zinc-300',
    BLOCKED: 'border-red-400',
    FAILED: 'border-red-500',
  }[step.status];

  return (
    <div className={cn(
      "bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all",
      borderColor,
      step.status === 'IN_PROGRESS' && "ring-2 ring-blue-100",
      className
    )}>
      {/* Header */}
      <button
        type="button"
        className="w-full text-left p-4 hover:bg-zinc-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        aria-controls={expandedId}
        aria-label={`${step.name} details`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {/* Step type icon */}
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              step.status === 'COMPLETED' && "bg-green-100 text-green-600",
              step.status === 'IN_PROGRESS' && "bg-blue-100 text-blue-600",
              step.status === 'AWAITING_APPROVAL' && "bg-amber-100 text-amber-600",
              step.status === 'BLOCKED' && "bg-red-100 text-red-600",
              step.status === 'PENDING' && "bg-zinc-100 text-zinc-400",
              step.status === 'READY' && "bg-blue-50 text-blue-500"
            )}>
              <StepTypeIcon type={step.stepType} />
            </div>
            
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-zinc-900">
                  {step.name}
                </h3>
                {step.isRequired && (
                  <span className="text-xs text-red-500">*</span>
                )}
              </div>

              {step.description && (
                <p className="text-sm text-zinc-500 mt-1 line-clamp-2">
                  {step.description}
                </p>
              )}

              {/* Meta info */}
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-zinc-500">
                {step.phaseName && <span>{step.phaseName}</span>}
                {(step.assigneeName || step.assigneeRole) && (
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {step.assigneeName || step.assigneeRole}
                  </span>
                )}
                <span className="text-zinc-300">•</span>
                <span className="uppercase tracking-wide">Step {step.order}</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={step.status} />
            <SLAIndicator 
              slaDueAt={step.slaDueAt} 
              slaBreached={step.slaBreached}
              status={step.status}
            />
            {isExpanded ? (
              <ChevronUp size={16} className="text-zinc-400" />
            ) : (
              <ChevronDown size={16} className="text-zinc-400" />
            )}
          </div>
        </div>
      </button>
      
      {/* Expanded Content */}
      {isExpanded && (
        <div id={expandedId} className="border-t border-zinc-200">
          {/* Preconditions */}
          {step.preconditions && step.preconditions.length > 0 && (
            <div className="p-4 bg-zinc-50">
              <h4 className="text-sm font-medium text-zinc-700 mb-2">
                Preconditions
              </h4>
              <PreconditionBadges 
                preconditions={step.preconditions}
                compact={false}
              />
            </div>
          )}
          
          {/* Duration & Timing */}
          {(step.startedAt || step.completedAt) && (
            <div className="p-4 grid grid-cols-2 gap-4 text-sm">
              {step.startedAt && (
                <div>
                  <span className="text-zinc-500">Started:</span>
                  <span className="ml-2 text-zinc-900">
                    {new Date(step.startedAt).toLocaleString()}
                  </span>
                </div>
              )}
              {step.completedAt && (
                <div>
                  <span className="text-zinc-500">Completed:</span>
                  <span className="ml-2 text-zinc-900">
                    {new Date(step.completedAt).toLocaleString()}
                  </span>
                </div>
              )}
              {step.actualDurationMinutes && (
                <div>
                  <span className="text-zinc-500">Duration:</span>
                  <span className="ml-2 text-zinc-900">
                    {Math.round(step.actualDurationMinutes / 60)}h {step.actualDurationMinutes % 60}m
                  </span>
                </div>
              )}
            </div>
          )}
          
          {/* Linked Artifacts */}
          {step.linkedArtifactIds && step.linkedArtifactIds.length > 0 && (
            <div className="p-4 border-t border-zinc-200">
              <h4 className="text-sm font-medium text-zinc-700 mb-2">
                Linked Documents
              </h4>
              <div className="flex flex-wrap gap-2">
                {step.linkedArtifactIds.map((artifactId) => (
                  <a
                    key={artifactId}
                    href={`/documents/${artifactId}`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition-colors"
                  >
                    <FileText size={14} />
                    {artifactId.substring(0, 8)}...
                    <ExternalLink size={12} />
                  </a>
                ))}
              </div>
            </div>
          )}
          
          {/* Error Message */}
          {step.lastError && (
            <div className="p-4 bg-red-50 border-t border-red-100">
              <div className="flex items-start gap-2 text-red-700">
                <AlertTriangle size={16} className="mt-0.5" />
                <div>
                  <span className="font-medium">Error:</span>
                  <p className="text-sm mt-1">{step.lastError}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Rejection Input */}
          {showRejectInput && (
            <div className="p-4 bg-amber-50 border-t border-amber-100">
              <label
                htmlFor={`reject-${step.id}`}
                className="block text-sm font-medium text-zinc-700 mb-2"
              >
                Rejection Reason
              </label>
              <textarea
                id={`reject-${step.id}`}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                rows={3}
                placeholder="Please provide a reason for rejection..."
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => setShowRejectInput(false)}
                  className="px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onReject?.(rejectReason);
                    setShowRejectInput(false);
                    setRejectReason('');
                  }}
                  className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
                  disabled={!rejectReason.trim()}
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          )}
          
          {/* Actions */}
          <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={onViewHistory}
              className="flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
            >
              <History size={16} />
              View History
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {workflowRunId && (
                <Link href={`/concept2cure/proofs/${workflowRunId}`}>
                  <a className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors">
                    <ShieldCheck size={16} />
                    View Proof
                  </a>
                </Link>
              )}
              {canStart && (
                <button
                  onClick={onStart}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
                >
                  <Play size={16} />
                  Start Step
                </button>
              )}
              
              {canComplete && (
                <button
                  onClick={() => onComplete?.({})}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                >
                  <CheckCircle2 size={16} />
                  Mark Complete
                </button>
              )}
              
              {canSubmitForApproval && (
                <button
                  onClick={onSubmitForApproval}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
                >
                  <Send size={16} />
                  Submit for Approval
                </button>
              )}
              
              {canApprove && (
                <>
                  <button
                    onClick={() => setShowRejectInput(true)}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={onApprove}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                  >
                    <CheckCircle2 size={16} />
                    Approve
                  </button>
                </>
              )}
              
              {canSign && (
                <button
                  onClick={onSign}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 transition-colors"
                >
                  <PenTool size={16} />
                  Sign
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StepCard;
