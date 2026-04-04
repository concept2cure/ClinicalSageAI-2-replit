/**
 * GovernedDecisionReviewPanel — Project-level governed decision review queue.
 *
 * Shows decisions requiring action: pending review, escalated, deferred, rejected.
 * Allows operators to act on decisions (approve, reject, escalate, defer).
 * Uses the canonical fabric hooks from useFabricState.ts.
 *
 * Endpoints consumed:
 *   GET  /api/concept2cure/projects/:projectId/governance/review-queue
 *   GET  /api/concept2cure/projects/:projectId/governance/decisions/:id/history
 *   POST /api/concept2cure/projects/:projectId/governance/decisions/:id/transition
 *
 * @module concept2cure/components/workspace/GovernedDecisionReviewPanel
 */

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  PauseCircle,
  RefreshCw,
  Inbox,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useGovernedReviewQueue,
  useGovernedDecisionHistory,
  useGovernedDecisionTransition,
} from '../../hooks/useFabricState';

// ── Types ───────────────────────────────────────────────────────────────────

interface GovernedDecisionReviewPanelProps {
  projectId: string | undefined;
  className?: string;
  onClose?: () => void;
  /** Governance model callbacks for coordinated state updates */
  onInspectDecision?: (decisionId: string, state: string) => void;
  onActionStarted?: (decisionId: string, action: string) => void;
  onActionCompleted?: (result: { success: boolean; decisionId: string; action: string; previousState: string; newState: string; error?: string }) => void;
}

type QueueTab = 'pending' | 'escalated' | 'deferred' | 'rejected';

const TAB_CONFIG: Record<QueueTab, { label: string; icon: React.ElementType; tone: string }> = {
  pending: { label: 'Pending', icon: Clock, tone: 'text-blue-600 bg-blue-50' },
  escalated: { label: 'Escalated', icon: AlertTriangle, tone: 'text-amber-600 bg-amber-50' },
  deferred: { label: 'Deferred', icon: PauseCircle, tone: 'text-stone-500 bg-stone-50' },
  rejected: { label: 'Rejected', icon: XCircle, tone: 'text-red-600 bg-red-50' },
};

// ── Decision Row ────────────────────────────────────────────────────────────

function DecisionRow({
  decisionId,
  state,
  projectId,
}: {
  decisionId: string;
  state: string;
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [escalateTarget, setEscalateTarget] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: historyData, isLoading: historyLoading } = useGovernedDecisionHistory(
    projectId,
    expanded ? decisionId : undefined
  );

  const transitionMutation = useGovernedDecisionTransition(projectId);

  const handleAction = async (action: string) => {
    if ((action === 'reject' || action === 'defer') && !actionReason.trim()) {
      toast({ title: `${action === 'reject' ? 'Rejection' : 'Deferral'} requires a reason`, variant: 'destructive' });
      return;
    }
    if (action === 'escalate' && !escalateTarget.trim()) {
      toast({ title: 'Escalation requires a target', variant: 'destructive' });
      return;
    }

    try {
      const result = await transitionMutation.mutateAsync({
        decisionId,
        action,
        reason: actionReason || undefined,
        escalatedTo: action === 'escalate' ? escalateTarget : undefined,
      });

      if (result?.data?.success) {
        toast({ title: `Decision ${action}d successfully` });
        setActionReason('');
        setEscalateTarget('');
        queryClient.invalidateQueries({ queryKey: ['concept2cure', 'governance', 'review-queue', projectId] });
        queryClient.invalidateQueries({ queryKey: ['concept2cure', 'governance', 'decision-history', projectId, decisionId] });
      } else {
        toast({ title: result?.data?.error || 'Action failed', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to perform action', variant: 'destructive' });
    }
  };

  const history = historyData?.data?.history ?? [];
  const shortId = decisionId.slice(0, 8);

  return (
    <div className="border border-stone-200 rounded-lg mb-1.5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-stone-50/50 transition-colors"
        aria-expanded={expanded}
        data-testid={`decision-row-${shortId}`}
      >
        <StateIcon state={state} />
        <span className="text-[11px] font-mono text-stone-600">{shortId}…</span>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
          {state.replace('_', ' ')}
        </Badge>
        <span className="ml-auto">
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-stone-400" />
          ) : (
            <ChevronRight className="w-3 h-3 text-stone-400" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-stone-100 px-3 py-2 bg-white">
          {/* History timeline */}
          <div className="mb-2">
            <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <History className="w-3 h-3" /> Timeline
            </p>
            {historyLoading ? (
              <p className="text-[10px] text-stone-400">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-[10px] text-stone-400">No transitions recorded</p>
            ) : (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {history.map((h: { decisionId: string; state: string; performedBy: string; reason?: string; timestamp: string }, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-stone-300 mt-1 shrink-0" />
                    <div>
                      <span className="font-medium text-stone-600">{h.state?.replace('_', ' ')}</span>
                      {h.performedBy && <span className="text-stone-400"> by {h.performedBy}</span>}
                      {h.reason && <span className="text-stone-400 italic"> — {h.reason}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action controls */}
          <div className="border-t border-stone-100 pt-2">
            <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Actions</p>

            {/* Reason input (for reject/defer) */}
            <input
              type="text"
              placeholder="Reason (required for reject/defer)"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="w-full text-[11px] px-2 py-1 border border-stone-200 rounded mb-1.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
              data-testid="decision-action-reason"
            />

            {state === 'escalated' && (
              <input
                type="text"
                placeholder="Escalate to (user/role)"
                value={escalateTarget}
                onChange={(e) => setEscalateTarget(e.target.value)}
                className="w-full text-[11px] px-2 py-1 border border-stone-200 rounded mb-1.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
            )}

            <div className="flex flex-wrap gap-1">
              {state === 'under_review' && (
                <>
                  <ActionButton action="approve" label="Approve" icon={CheckCircle} tone="emerald" onClick={() => handleAction('approve')} disabled={transitionMutation.isPending} />
                  <ActionButton action="reject" label="Reject" icon={XCircle} tone="red" onClick={() => handleAction('reject')} disabled={transitionMutation.isPending} />
                  <ActionButton action="escalate" label="Escalate" icon={ArrowUpRight} tone="amber" onClick={() => handleAction('escalate')} disabled={transitionMutation.isPending} />
                  <ActionButton action="defer" label="Defer" icon={PauseCircle} tone="stone" onClick={() => handleAction('defer')} disabled={transitionMutation.isPending} />
                </>
              )}
              {state === 'escalated' && (
                <>
                  <ActionButton action="approve" label="Approve" icon={CheckCircle} tone="emerald" onClick={() => handleAction('approve')} disabled={transitionMutation.isPending} />
                  <ActionButton action="reject" label="Reject" icon={XCircle} tone="red" onClick={() => handleAction('reject')} disabled={transitionMutation.isPending} />
                  <ActionButton action="review" label="Back to Review" icon={RefreshCw} tone="blue" onClick={() => handleAction('review')} disabled={transitionMutation.isPending} />
                </>
              )}
              {state === 'deferred' && (
                <ActionButton action="review" label="Resume Review" icon={RefreshCw} tone="blue" onClick={() => handleAction('review')} disabled={transitionMutation.isPending} />
              )}
              {state === 'rejected' && (
                <ActionButton action="review" label="Reopen" icon={RefreshCw} tone="blue" onClick={() => handleAction('review')} disabled={transitionMutation.isPending} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function StateIcon({ state }: { state: string }) {
  switch (state) {
    case 'under_review': return <Clock className="w-3 h-3 text-blue-500" />;
    case 'escalated': return <AlertTriangle className="w-3 h-3 text-amber-500" />;
    case 'deferred': return <PauseCircle className="w-3 h-3 text-stone-400" />;
    case 'rejected': return <XCircle className="w-3 h-3 text-red-500" />;
    case 'approved': return <CheckCircle className="w-3 h-3 text-emerald-500" />;
    default: return <ShieldCheck className="w-3 h-3 text-stone-400" />;
  }
}

function ActionButton({
  action,
  label,
  icon: Icon,
  tone,
  onClick,
  disabled,
}: {
  action: string;
  label: string;
  icon: React.ElementType;
  tone: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={cn('text-[10px] h-6 px-2 gap-1', `hover:bg-${tone}-50 hover:border-${tone}-200`)}
      data-testid={`decision-action-${action}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </Button>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────────

export function GovernedDecisionReviewPanel({
  projectId,
  className,
  onClose,
  onInspectDecision,
  onActionStarted,
  onActionCompleted,
}: GovernedDecisionReviewPanelProps) {
  const [activeTab, setActiveTab] = useState<QueueTab>('pending');

  const { data: queueData, isLoading, refetch } = useGovernedReviewQueue(projectId);
  const queue = queueData?.data?.queue;
  const unresolved = queueData?.data?.unresolved;

  const tabItems: Record<QueueTab, string[]> = {
    pending: queue?.pending ?? [],
    escalated: queue?.escalated ?? [],
    deferred: queue?.deferred ?? [],
    rejected: queue?.rejected ?? [],
  };

  const totalCount = Object.values(tabItems).reduce((sum, arr) => sum + arr.length, 0);
  const activeItems = tabItems[activeTab];

  if (!projectId) return null;

  return (
    <div
      className={cn('flex flex-col bg-white border-l border-stone-200', className)}
      data-testid="governed-decision-review-panel"
      role="region"
      aria-label="Governed decision review queue"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100">
        <ShieldAlert className="w-3.5 h-3.5 text-blue-600" />
        <span className="text-[12px] font-semibold text-stone-700">Decision Review</span>
        {totalCount > 0 && (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-1">
            {totalCount}
          </Badge>
        )}
        {unresolved?.hasUnresolved && (
          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
            {unresolved.unresolvedCount} unresolved
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="h-5 w-5 p-0"
            aria-label="Refresh queue"
          >
            <RefreshCw className={cn('w-3 h-3 text-stone-400', isLoading && 'animate-spin')} />
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-5 w-5 p-0">
              <XCircle className="w-3 h-3 text-stone-400" />
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-100" role="tablist">
        {(Object.entries(TAB_CONFIG) as [QueueTab, typeof TAB_CONFIG[QueueTab]][]).map(([tab, config]) => {
          const count = tabItems[tab].length;
          const Icon = config.icon;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium transition-colors border-b-2',
                activeTab === tab
                  ? 'border-stone-800 text-stone-800'
                  : 'border-transparent text-stone-400 hover:text-stone-600'
              )}
              data-testid={`queue-tab-${tab}`}
            >
              <Icon className="w-3 h-3" />
              {config.label}
              {count > 0 && (
                <span className={cn('text-[8px] px-1 py-0 rounded-full', config.tone)}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-4 h-4 text-stone-300 animate-spin" />
          </div>
        ) : activeItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-stone-400">
            <Inbox className="w-5 h-5 mb-1" />
            <p className="text-[10px]">No {TAB_CONFIG[activeTab].label.toLowerCase()} decisions</p>
          </div>
        ) : (
          activeItems.map((decisionId) => (
            <DecisionRow
              key={decisionId}
              decisionId={decisionId}
              state={activeTab === 'pending' ? 'under_review' : activeTab}
              projectId={projectId}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default GovernedDecisionReviewPanel;
