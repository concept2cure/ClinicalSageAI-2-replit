/**
 * GovernanceStatusBar — Compact escalation visibility bar for the editor.
 *
 * Sits below the InspectorRibbon toolbar. Shows:
 *   - Promotion readiness indicator (green / amber / red)
 *   - Active blocker count
 *   - Last governance decision summary
 *   - Expands on click to show full blocker list + decision history
 *
 * Uses governed components: Badge, Button, Collapsible.
 * Data from usePromotionBlockers + useGovernanceDecisions hooks.
 *
 * @module concept2cure/components/editor/GovernanceStatusBar
 */

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePromotionBlockers,
  useGovernanceDecisions,
  type PromotionBlocker,
  type GovernanceDecision,
} from '../../hooks/useGovernance';

interface GovernanceStatusBarProps {
  projectId: string | number | undefined;
  className?: string;
}

type ReadinessLevel = 'clear' | 'warnings' | 'blocked';

function getReadinessLevel(
  blocked: boolean,
  blockerCount: number
): ReadinessLevel {
  if (blocked) return 'blocked';
  if (blockerCount > 0) return 'warnings';
  return 'clear';
}

const readinessConfig: Record<
  ReadinessLevel,
  {
    icon: React.ElementType;
    label: string;
    badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
    barClass: string;
    iconClass: string;
  }
> = {
  clear: {
    icon: ShieldCheck,
    label: 'Ready to promote',
    badgeVariant: 'default',
    barClass: 'border-stone-100 bg-stone-100/40',
    iconClass: 'text-stone-700',
  },
  warnings: {
    icon: ShieldAlert,
    label: 'Warnings',
    badgeVariant: 'secondary',
    barClass: 'border-stone-100 bg-stone-100/40',
    iconClass: 'text-stone-600',
  },
  blocked: {
    icon: ShieldX,
    label: 'Blocked',
    badgeVariant: 'destructive',
    barClass: 'border-stone-100 bg-stone-100/40',
    iconClass: 'text-stone-700',
  },
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function BlockerItem({ blocker }: { blocker: PromotionBlocker }) {
  const severityClass =
    blocker.severity === 'critical'
      ? 'bg-stone-100 text-stone-800 border-stone-200'
      : blocker.severity === 'major'
        ? 'bg-stone-100 text-stone-700 border-stone-200'
        : 'bg-stone-100 text-stone-600 border-stone-200';

  return (
    <div className="flex items-start gap-2 py-1.5">
      <AlertTriangle
        className={cn(
          'w-3 h-3 mt-0.5 shrink-0',
          blocker.severity === 'critical' ? 'text-stone-1000' : 'text-stone-1000'
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-stone-700 leading-tight">
          {blocker.message}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={cn(
              'inline-flex text-[10px] font-medium px-1.5 py-0 rounded border',
              severityClass
            )}
          >
            {blocker.severity}
          </span>
          <span className="text-[10px] text-stone-400">{blocker.source}</span>
        </div>
      </div>
    </div>
  );
}

function DecisionItem({ decision }: { decision: GovernanceDecision }) {
  const statusIcon =
    decision.status === 'confirmed' ? (
      <CheckCircle className="w-3 h-3 text-stone-1000" />
    ) : decision.status === 'rejected' ? (
      <ShieldX className="w-3 h-3 text-stone-1000" />
    ) : (
      <Clock className="w-3 h-3 text-stone-1000" />
    );

  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="mt-0.5 shrink-0">{statusIcon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-stone-700 leading-tight">
          {decision.summary}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
            {decision.kind}
          </Badge>
          <span className="text-[10px] text-stone-400">
            {decision.authority} &middot; {formatTimeAgo(decision.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function GovernanceStatusBar({
  projectId,
  className,
}: GovernanceStatusBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const {
    data: blockersData,
    isLoading: blockersLoading,
    refetch: refetchBlockers,
  } = usePromotionBlockers(projectId);

  const {
    data: decisionsData,
    isLoading: decisionsLoading,
    refetch: refetchDecisions,
  } = useGovernanceDecisions(projectId);

  // Don't render if no projectId
  if (!projectId) return null;

  const blocked = blockersData?.blocked ?? false;
  const blockerCount = blockersData?.blockerCount ?? 0;
  const blockers = blockersData?.blockers ?? [];
  const decisions = decisionsData?.decisions ?? [];
  const lastDecision = decisions[0] ?? null;
  const isLoading = blockersLoading || decisionsLoading;

  const readiness = getReadinessLevel(blocked, blockerCount);
  const config = readinessConfig[readiness];
  const Icon = config.icon;

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    refetchBlockers();
    refetchDecisions();
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-1.5 border-b transition-colors duration-150 cursor-pointer',
            'hover:bg-stone-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1',
            config.barClass,
            className
          )}
          aria-label={`Governance status: ${config.label}. ${blockerCount} blockers.`}
          data-testid="governance-status-bar"
        >
          <Icon className={cn('w-3.5 h-3.5 shrink-0', config.iconClass)} />

          <span className="text-[12px] font-medium text-stone-700">
            {config.label}
          </span>

          {blockerCount > 0 && (
            <Badge
              variant={config.badgeVariant}
              className="text-[10px] px-1.5 py-0 h-4 font-semibold"
            >
              {blockerCount} blocker{blockerCount !== 1 ? 's' : ''}
            </Badge>
          )}

          {lastDecision && (
            <span className="text-[11px] text-stone-400 truncate max-w-[220px] hidden sm:inline">
              Last: {lastDecision.summary}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            {isLoading && (
              <RefreshCw className="w-3 h-3 text-stone-300 animate-spin" />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="h-5 w-5 p-0 text-stone-400 hover:text-stone-600"
              aria-label="Refresh governance status"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
            <ChevronDown
              className={cn(
                'w-3 h-3 text-stone-400 transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div
          className="border-b border-stone-100 bg-white"
          data-testid="governance-status-details"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-x divide-stone-100">
            {/* Blockers panel */}
            <div className="px-3 py-2">
              <h4 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                Promotion Blockers
              </h4>
              {blockers.length === 0 ? (
                <div className="flex items-center gap-1.5 py-1.5">
                  <CheckCircle className="w-3 h-3 text-stone-1000" />
                  <span className="text-[12px] text-stone-500">
                    No blockers found
                  </span>
                </div>
              ) : (
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {blockers.map((b, i) => (
                    <BlockerItem key={`${b.source}-${i}`} blocker={b} />
                  ))}
                </div>
              )}
            </div>

            {/* Decisions panel */}
            <div className="px-3 py-2">
              <h4 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                Recent Decisions
              </h4>
              {decisions.length === 0 ? (
                <div className="flex items-center gap-1.5 py-1.5">
                  <Clock className="w-3 h-3 text-stone-400" />
                  <span className="text-[12px] text-stone-500">
                    No decisions recorded yet
                  </span>
                </div>
              ) : (
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {decisions.slice(0, 5).map((d) => (
                    <DecisionItem key={d.id} decision={d} />
                  ))}
                  {decisions.length > 5 && (
                    <p className="text-[10px] text-stone-400 pt-1">
                      + {decisions.length - 5} more decisions
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
