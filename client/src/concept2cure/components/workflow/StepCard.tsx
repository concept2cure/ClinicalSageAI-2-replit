/**
 * StepCard Component
 *
 * P0 Priority UI Component — Enterprise-grade workflow step card.
 * Uses Zen design system primitives for full consistency.
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
import { PreconditionBadges, type Precondition } from './PreconditionBadges';
import {
  EnterpriseCard,
  CardSection,
  IconBox,
  StatusPill,
  EnterpriseButton,
  DataRow,
} from '../ui/enterprise';

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
    preconditions?: Precondition[];
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

// Step type → icon mapping
const STEP_TYPE_ICONS: Record<string, any> = {
  TASK: FileText,
  APPROVAL: Users,
  REVIEW: Users,
  SIGNATURE: PenTool,
  EXPORT: Send,
  IMPORT: FileText,
  NOTIFICATION: FileText,
};

// Status → visual config (consistent StatusPill variant + IconBox color)
const STATUS_CONFIG: Record<string, {
  pillVariant: 'default' | 'info' | 'success' | 'warning' | 'danger' | 'purple' | 'active';
  pillLabel: string;
  iconBoxClass: string;
  borderClass: string;
}> = {
  PENDING: { pillVariant: 'default', pillLabel: 'Pending', iconBoxClass: 'bg-stone-100 text-stone-400', borderClass: 'border-stone-200' },
  READY: { pillVariant: 'info', pillLabel: 'Ready', iconBoxClass: 'bg-blue-50 text-blue-500', borderClass: 'border-blue-200' },
  IN_PROGRESS: { pillVariant: 'active', pillLabel: 'In Progress', iconBoxClass: 'bg-blue-100 text-blue-600', borderClass: 'border-blue-300' },
  AWAITING_APPROVAL: { pillVariant: 'warning', pillLabel: 'Awaiting Approval', iconBoxClass: 'bg-amber-100 text-amber-600', borderClass: 'border-amber-300' },
  AWAITING_SIGNATURE: { pillVariant: 'purple', pillLabel: 'Awaiting Signature', iconBoxClass: 'bg-purple-100 text-purple-600', borderClass: 'border-purple-300' },
  COMPLETED: { pillVariant: 'success', pillLabel: 'Completed', iconBoxClass: 'bg-emerald-100 text-emerald-600', borderClass: 'border-emerald-300' },
  SKIPPED: { pillVariant: 'default', pillLabel: 'Skipped', iconBoxClass: 'bg-stone-100 text-stone-400', borderClass: 'border-stone-200' },
  BLOCKED: { pillVariant: 'danger', pillLabel: 'Blocked', iconBoxClass: 'bg-red-100 text-red-600', borderClass: 'border-red-300' },
  FAILED: { pillVariant: 'danger', pillLabel: 'Failed', iconBoxClass: 'bg-red-100 text-red-600', borderClass: 'border-red-300' },
};

// SLA indicator
const SLAIndicator: React.FC<{
  slaDueAt?: Date | string;
  slaBreached?: boolean;
  status: string;
}> = ({ slaDueAt, slaBreached, status }) => {
  if (!slaDueAt || status === 'COMPLETED' || status === 'SKIPPED') return null;

  const dueDate = new Date(slaDueAt);
  const hoursRemaining = (dueDate.getTime() - Date.now()) / (1000 * 60 * 60);

  if (slaBreached || hoursRemaining < 0) {
    return (
      <div className="flex items-center gap-1.5 text-red-600 text-xs font-medium">
        <AlertTriangle size={14} />
        <span>SLA Breached</span>
      </div>
    );
  }

  if (hoursRemaining < 8) {
    return (
      <div className="flex items-center gap-1.5 text-amber-600 text-xs">
        <Clock size={14} />
        <span>Due in {Math.round(hoursRemaining)}h</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-stone-500 text-xs">
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

  const canStart = step.status === 'READY';
  const canComplete = step.status === 'IN_PROGRESS' && step.stepType === 'TASK';
  const canSubmitForApproval = step.status === 'IN_PROGRESS' &&
    (step.stepType === 'APPROVAL' || step.stepType === 'REVIEW');
  const canApprove = step.status === 'AWAITING_APPROVAL';
  const canSign = step.status === 'AWAITING_SIGNATURE';

  const config = STATUS_CONFIG[step.status] || STATUS_CONFIG.PENDING;
  const StepIcon = STEP_TYPE_ICONS[step.stepType] || FileText;

  return (
    <EnterpriseCard
      noPadding
      className={cn(
        'border',
        config.borderClass,
        step.status === 'IN_PROGRESS' && 'ring-2 ring-blue-100',
        className,
      )}
    >
      {/* Header */}
      <button
        type="button"
        className="w-full text-left px-5 py-4 hover:bg-stone-50 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        aria-controls={expandedId}
        aria-label={`${step.name} details`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <IconBox icon={StepIcon} className={config.iconBoxClass} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-stone-900">{step.name}</h3>
                {step.isRequired && <span className="text-xs text-red-500">*</span>}
              </div>
              {step.description && (
                <p className="text-sm text-stone-500 mt-1 line-clamp-2">{step.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-stone-500">
                {step.phaseName && <span>{step.phaseName}</span>}
                {(step.assigneeName || step.assigneeRole) && (
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {step.assigneeName || step.assigneeRole}
                  </span>
                )}
                <span className="text-stone-300">&middot;</span>
                <span className="uppercase tracking-wider font-medium text-stone-400">Step {step.order}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <StatusPill label={config.pillLabel} variant={config.pillVariant} dot />
            <SLAIndicator slaDueAt={step.slaDueAt} slaBreached={step.slaBreached} status={step.status} />
            {isExpanded ? (
              <ChevronUp size={16} className="text-stone-400" />
            ) : (
              <ChevronDown size={16} className="text-stone-400" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div id={expandedId}>
          {/* Preconditions */}
          {step.preconditions && step.preconditions.length > 0 && (
            <CardSection tint="muted">
              <h4 className="text-sm font-medium text-stone-700 mb-2">Preconditions</h4>
              <PreconditionBadges preconditions={step.preconditions} compact={false} />
            </CardSection>
          )}

          {/* Duration & Timing */}
          {(step.startedAt || step.completedAt) && (
            <CardSection>
              <dl className="grid grid-cols-2 gap-x-4">
                {step.startedAt && (
                  <DataRow label="Started" value={new Date(step.startedAt).toLocaleString()} />
                )}
                {step.completedAt && (
                  <DataRow label="Completed" value={new Date(step.completedAt).toLocaleString()} />
                )}
                {step.actualDurationMinutes != null && (
                  <DataRow
                    label="Duration"
                    value={`${Math.floor(step.actualDurationMinutes / 60)}h ${step.actualDurationMinutes % 60}m`}
                  />
                )}
              </dl>
            </CardSection>
          )}

          {/* Linked Artifacts */}
          {step.linkedArtifactIds && step.linkedArtifactIds.length > 0 && (
            <CardSection>
              <h4 className="text-sm font-medium text-stone-700 mb-2">Linked Documents</h4>
              <div className="flex flex-wrap gap-2">
                {step.linkedArtifactIds.map((artifactId) => (
                  <a
                    key={artifactId}
                    href={`/documents/${artifactId}`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-stone-50 text-stone-700 rounded-lg text-xs font-medium hover:bg-stone-100 transition-colors duration-150"
                  >
                    <FileText size={14} />
                    {artifactId.substring(0, 8)}...
                    <ExternalLink size={12} />
                  </a>
                ))}
              </div>
            </CardSection>
          )}

          {/* Error Message */}
          {step.lastError && (
            <CardSection tint="danger">
              <div className="flex items-start gap-2 text-red-700">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-sm font-medium">Error</span>
                  <p className="text-sm mt-0.5">{step.lastError}</p>
                </div>
              </div>
            </CardSection>
          )}

          {/* Rejection Input */}
          {showRejectInput && (
            <CardSection tint="warning">
              <label htmlFor={`reject-${step.id}`} className="block text-sm font-medium text-stone-700 mb-2">
                Rejection Reason
              </label>
              <textarea
                id={`reject-${step.id}`}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-4 py-2.5 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-stone-300/20 focus:border-stone-400 outline-none transition-colors duration-150"
                rows={3}
                placeholder="Please provide a reason for rejection..."
              />
              <div className="flex justify-end gap-2 mt-3">
                <EnterpriseButton variant="ghost" size="sm" onClick={() => setShowRejectInput(false)}>
                  Cancel
                </EnterpriseButton>
                <EnterpriseButton
                  variant="danger"
                  size="sm"
                  onClick={() => { onReject?.(rejectReason); setShowRejectInput(false); setRejectReason(''); }}
                  disabled={!rejectReason.trim()}
                >
                  Confirm Rejection
                </EnterpriseButton>
              </div>
            </CardSection>
          )}

          {/* Actions */}
          <CardSection tint="muted" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <EnterpriseButton variant="ghost" size="sm" icon={History} onClick={onViewHistory}>
              View History
            </EnterpriseButton>

            <div className="flex flex-wrap items-center gap-2">
              {workflowRunId && (
                <Link href={`/concept2cure/proofs/${workflowRunId}`}>
                  <a className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-stone-200 text-stone-700 hover:bg-stone-50 transition-colors duration-150">
                    <ShieldCheck size={16} />
                    View Proof
                  </a>
                </Link>
              )}
              {canStart && (
                <EnterpriseButton variant="primary" icon={Play} onClick={onStart}>
                  Start Step
                </EnterpriseButton>
              )}
              {canComplete && (
                <EnterpriseButton variant="success" icon={CheckCircle2} onClick={() => onComplete?.({})}>
                  Mark Complete
                </EnterpriseButton>
              )}
              {canSubmitForApproval && (
                <EnterpriseButton variant="warning" icon={Send} onClick={onSubmitForApproval}>
                  Submit for Approval
                </EnterpriseButton>
              )}
              {canApprove && (
                <>
                  <EnterpriseButton variant="secondary" onClick={() => setShowRejectInput(true)}>
                    Reject
                  </EnterpriseButton>
                  <EnterpriseButton variant="success" icon={CheckCircle2} onClick={onApprove}>
                    Approve
                  </EnterpriseButton>
                </>
              )}
              {canSign && (
                <EnterpriseButton variant="purple" icon={PenTool} onClick={onSign}>
                  Sign
                </EnterpriseButton>
              )}
            </div>
          </CardSection>
        </div>
      )}
    </EnterpriseCard>
  );
};

export default StepCard;
