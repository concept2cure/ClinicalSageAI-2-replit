/**
 * Approval Requests Panel — Accept/Deny/Delegate authorization chains
 *
 * Displays pending, approved, and rejected approval requests for a program.
 * Managers can approve, reject (with required reason), or delegate approvals.
 *
 * @module concept2cure/components/collaboration/ApprovalRequestsPanel
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Send,
  AlertTriangle,
  Shield,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import {
  useApprovalRequests,
  useDecideApproval,
  useDelegateApproval,
} from '../../hooks/useMissionControl';

// ── Types ────────────────────────────────────────────────────────────────────

interface ApprovalRequestsPanelProps {
  programId: number | null;
}

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected';

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  approved: { label: 'Approved', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  rejected: { label: 'Rejected', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: 'text-red-700', bg: 'bg-red-100' },
  high: { label: 'High', color: 'text-orange-700', bg: 'bg-orange-100' },
  medium: { label: 'Medium', color: 'text-blue-700', bg: 'bg-blue-100' },
  low: { label: 'Low', color: 'text-zinc-600', bg: 'bg-zinc-100' },
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  document_approval: 'Document Approval',
  change_approval: 'Change Approval',
  escalation_approval: 'Escalation',
  deviation_approval: 'Deviation',
};

// ── Component ────────────────────────────────────────────────────────────────

const ApprovalRequestsPanel: React.FC<ApprovalRequestsPanelProps> = ({ programId }) => {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [decisionComment, setDecisionComment] = useState('');
  const [delegateTo, setDelegateTo] = useState('');
  const [delegateReason, setDelegateReason] = useState('');
  const [showDelegateFor, setShowDelegateFor] = useState<number | null>(null);

  const { data: approvals = [], isLoading } = useApprovalRequests(programId);
  const decideApproval = useDecideApproval();
  const delegateApprovalMut = useDelegateApproval();

  const filtered = filter === 'all'
    ? approvals
    : approvals.filter((a: any) => a.status === filter);

  const pendingCount = approvals.filter((a: any) => a.status === 'pending').length;

  const handleDecision = (id: number, decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !decisionComment.trim()) return;
    decideApproval.mutate({
      id,
      decision,
      comment: decisionComment.trim() || undefined,
    });
    setDecisionComment('');
    setExpandedId(null);
  };

  const handleDelegate = (id: number) => {
    if (!delegateTo.trim()) return;
    delegateApprovalMut.mutate({
      id,
      delegateTo: delegateTo.trim(),
      reason: delegateReason.trim() || undefined,
    });
    setDelegateTo('');
    setDelegateReason('');
    setShowDelegateFor(null);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Clock className="w-5 h-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b bg-white px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-blue-500" />
          <h2 className="text-sm font-semibold text-zinc-900">Approval Requests</h2>
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700">
              {pendingCount} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'pending', 'approved', 'rejected'] as FilterStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                'px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors',
                filter === s
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:bg-zinc-100',
              )}
            >
              {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Request List */}
      <div className="flex-1 overflow-y-auto divide-y">
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Shield className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">
              {filter === 'pending' ? 'No pending approvals' : 'No approval requests found'}
            </p>
          </div>
        ) : (
          filtered.map((req: any) => {
            const isExpanded = expandedId === req.id;
            const statusConf = STATUS_CONFIG[req.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
            const StatusIcon = statusConf.icon;
            const priorityConf = PRIORITY_CONFIG[req.priority] || PRIORITY_CONFIG.medium;
            const isDelegating = showDelegateFor === req.id;

            return (
              <div key={req.id} className={cn('bg-white transition-colors', isExpanded && 'bg-zinc-50')}>
                {/* Summary row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : req.id)}
                  className="w-full text-left px-5 py-3.5 hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <StatusIcon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', statusConf.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-zinc-800">{req.title}</span>
                        <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', priorityConf.bg, priorityConf.color)}>
                          {priorityConf.label}
                        </span>
                        <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', statusConf.bg, statusConf.color)}>
                          {statusConf.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {REQUEST_TYPE_LABELS[req.requestType] || req.requestType} &middot; Requested by {req.requestedBy}
                        {req.requestedByRole ? ` (${req.requestedByRole})` : ''}
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Assigned to: <span className="font-medium text-zinc-600">{req.assignedTo}</span>
                        {req.assignedToRole ? ` (${req.assignedToRole})` : ''}
                        {req.delegatedFrom && (
                          <span className="ml-1 text-blue-500">
                            — delegated from {req.delegatedFrom}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-5 pb-4 space-y-3">
                    {/* Description */}
                    <div className="bg-white rounded-lg border p-3">
                      <p className="text-xs text-zinc-700 leading-relaxed">{req.description}</p>
                      {req.dueDate && (
                        <p className="text-[10px] text-zinc-400 mt-2">
                          Due: {new Date(req.dueDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    {/* Decision details (if decided) */}
                    {req.decision && (
                      <div className={cn('rounded-lg border p-3', statusConf.bg, statusConf.border)}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <StatusIcon className={cn('w-3.5 h-3.5', statusConf.color)} />
                          <span className={cn('text-xs font-semibold', statusConf.color)}>
                            {req.decision === 'approved' ? 'Approved' : 'Rejected'} by {req.decisionBy}
                          </span>
                        </div>
                        {req.decisionComment && (
                          <p className="text-xs text-zinc-700 mt-1">{req.decisionComment}</p>
                        )}
                        {req.decisionAt && (
                          <p className="text-[10px] text-zinc-400 mt-1">
                            {new Date(req.decisionAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Action buttons (only for pending) */}
                    {req.status === 'pending' && !isDelegating && (
                      <div className="space-y-2">
                        <textarea
                          value={decisionComment}
                          onChange={e => setDecisionComment(e.target.value)}
                          placeholder="Add a comment (required for rejection)..."
                          rows={2}
                          className="w-full text-xs px-3 py-2 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDecision(req.id, 'approved')}
                            disabled={decideApproval.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleDecision(req.id, 'rejected')}
                            disabled={decideApproval.isPending || !decisionComment.trim()}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                          <button
                            onClick={() => setShowDelegateFor(req.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Delegate
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Delegate form */}
                    {isDelegating && (
                      <div className="space-y-2 bg-blue-50 rounded-lg border border-blue-200 p-3">
                        <p className="text-xs font-medium text-blue-700">Delegate this approval</p>
                        <input
                          type="text"
                          value={delegateTo}
                          onChange={e => setDelegateTo(e.target.value)}
                          placeholder="Delegate to (name or email)..."
                          className="w-full text-xs px-3 py-1.5 border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <input
                          type="text"
                          value={delegateReason}
                          onChange={e => setDelegateReason(e.target.value)}
                          placeholder="Reason for delegation (optional)..."
                          className="w-full text-xs px-3 py-1.5 border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDelegate(req.id)}
                            disabled={!delegateTo.trim() || delegateApprovalMut.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            Delegate
                          </button>
                          <button
                            onClick={() => setShowDelegateFor(null)}
                            className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ApprovalRequestsPanel;
