/**
 * KernelDecisionLog — Compact audit trail of AI routing decisions.
 *
 * Shows recent kernel decision records: which model was selected, routing
 * strategy, latency, cost, and rationale. Expandable rows for full detail.
 *
 * Uses governed Table, Badge, DataStateWrapper components per CLAUDE.md.
 *
 * @module concept2cure/components/intelligence/KernelDecisionLog
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Cpu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataStateWrapper, SkeletonTable } from '@/components/ui/statesV2';
import {
  useKernelDecisions,
  type KernelDecision,
} from '../../hooks/useIntelligence';

// ── Props ───────────────────────────────────────────────────────────────────

export interface KernelDecisionLogProps {
  projectId?: number | string | null;
  /** Max records to fetch (default 20) */
  limit?: number;
  /** Compact mode hides some columns for sidebar use */
  compact?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function outcomeBadgeVariant(outcome: string | null): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (outcome === 'success') return 'default';
  if (outcome === 'failed') return 'destructive';
  if (outcome === 'partial') return 'secondary';
  return 'outline';
}

function truncate(str: string | null, max: number): string {
  if (!str) return '--';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function formatCost(usd: number | null): string {
  if (usd === null || usd === undefined) return '--';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function formatLatency(ms: number | null): string {
  if (ms === null || ms === undefined) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Expanded Row Detail ─────────────────────────────────────────────────────

function DecisionDetail({ decision }: { decision: KernelDecision }) {
  return (
    <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 text-[13px] text-stone-700 space-y-2">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-stone-400">Request ID</span>
          <p className="font-mono text-[12px]">{decision.requestId || '--'}</p>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-stone-400">Thread</span>
          <p className="font-mono text-[12px]">{decision.threadId || '--'}</p>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-stone-400">Orchestrator</span>
          <p>{decision.orchestratorName}</p>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-stone-400">Planner Version</span>
          <p>{decision.plannerVersion}</p>
        </div>
        {decision.intentLens && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-stone-400">Intent Lens</span>
            <p>{decision.intentLens}</p>
          </div>
        )}
        {decision.intentConfidence !== null && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-stone-400">Intent Confidence</span>
            <p>{(decision.intentConfidence * 100).toFixed(1)}%</p>
          </div>
        )}
        {decision.submissionType && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-stone-400">Submission Type</span>
            <p>{decision.submissionType}</p>
          </div>
        )}
        {decision.selectedTaskType && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-stone-400">Task Type</span>
            <p>{decision.selectedTaskType}</p>
          </div>
        )}
      </div>

      {decision.decisionRationale && (
        <div>
          <span className="text-[10px] uppercase tracking-wider text-stone-400">Full Rationale</span>
          <p className="mt-1 text-stone-600 leading-relaxed">{decision.decisionRationale}</p>
        </div>
      )}

      {decision.selectedTools && decision.selectedTools.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-wider text-stone-400">Tools</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {decision.selectedTools.map((tool, i) => (
              <Badge key={i} variant="outline" className="text-[11px]">
                {tool}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {decision.errorMessage && (
        <div>
          <span className="text-[10px] uppercase tracking-wider text-red-400">Error</span>
          <p className="text-red-600 text-[12px] mt-1">{decision.errorMessage}</p>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function KernelDecisionLog({
  projectId,
  limit = 20,
  compact = false,
}: KernelDecisionLogProps) {
  const { data, isLoading, error, refetch } = useKernelDecisions(projectId, limit);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Cpu className="h-4 w-4 text-stone-400" />
        <h3 className="text-[13px] font-medium text-stone-700">AI Routing Decisions</h3>
        {data && (
          <span className="text-[10px] text-stone-400 ml-auto">
            {data.total} total
          </span>
        )}
      </div>

      <DataStateWrapper
        isLoading={isLoading}
        error={error as Error | null}
        data={data?.decisions}
        loadingComponent={<SkeletonTable rows={5} columns={compact ? 4 : 6} />}
        emptyTitle="No decisions recorded"
        emptyDescription="AI routing decisions will appear here as you interact with AnA."
        retry={refetch}
      >
        {(decisions: KernelDecision[]) => (
          <div className="border border-stone-100 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50/50">
                  <TableHead className="w-8" />
                  <TableHead className="text-[10px] uppercase tracking-wider">Time</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Route</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Model</TableHead>
                  {!compact && (
                    <TableHead className="text-[10px] uppercase tracking-wider">Strategy</TableHead>
                  )}
                  <TableHead className="text-[10px] uppercase tracking-wider">Latency</TableHead>
                  {!compact && (
                    <TableHead className="text-[10px] uppercase tracking-wider">Cost</TableHead>
                  )}
                  <TableHead className="text-[10px] uppercase tracking-wider">Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decisions.map((d) => (
                  <React.Fragment key={d.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-stone-50 transition-colors duration-150"
                      onClick={() => toggleExpand(d.id)}
                      role="button"
                      aria-expanded={expandedId === d.id}
                      aria-label={`Decision ${d.id} - ${d.route} via ${d.selectedModel || 'unknown'}`}
                    >
                      <TableCell className="w-8 pr-0">
                        {expandedId === d.id ? (
                          <ChevronDown className="h-3 w-3 text-stone-400" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-stone-400" />
                        )}
                      </TableCell>
                      <TableCell className="text-[12px] text-stone-500 whitespace-nowrap">
                        {formatTimestamp(d.createdAt)}
                      </TableCell>
                      <TableCell className="text-[13px] font-mono">
                        {d.route.replace('/api/ana-ri/', '')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[11px] font-normal">
                          {d.selectedModel || d.selectedProvider || '--'}
                        </Badge>
                      </TableCell>
                      {!compact && (
                        <TableCell className="text-[12px] text-stone-500">
                          {truncate(d.routingStrategy, 24)}
                        </TableCell>
                      )}
                      <TableCell className="text-[12px] text-stone-500 tabular-nums">
                        {formatLatency(d.latencyMs)}
                      </TableCell>
                      {!compact && (
                        <TableCell className="text-[12px] text-stone-500 tabular-nums">
                          {formatCost(d.estimatedCostUsd)}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge
                          variant={outcomeBadgeVariant(d.outcome)}
                          className="text-[10px]"
                        >
                          {d.outcome || 'pending'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {expandedId === d.id && (
                      <TableRow>
                        <TableCell colSpan={compact ? 6 : 8} className="p-0">
                          <DecisionDetail decision={d} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DataStateWrapper>
    </div>
  );
}

export default KernelDecisionLog;
