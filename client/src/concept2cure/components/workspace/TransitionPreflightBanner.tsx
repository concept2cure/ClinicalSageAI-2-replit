/**
 * TransitionPreflightBanner — Inline governance gating banner.
 *
 * Shown when a workspace workflow transition is blocked or needs review.
 * Displays gating reasons, next actions, and a primary CTA.
 * Uses the shared governance context — no own data fetching.
 *
 * @module concept2cure/components/workspace/TransitionPreflightBanner
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldX, ShieldAlert, AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TransitionPreflightResult } from './WorkspaceGovernanceContext';

interface TransitionPreflightBannerProps {
  preflight: TransitionPreflightResult;
  onOpenQueue?: () => void;
  onInspectDecision?: (decisionId: string) => void;
  onRefresh?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function TransitionPreflightBanner({
  preflight,
  onOpenQueue,
  onInspectDecision,
  onRefresh,
  onDismiss,
  className,
}: TransitionPreflightBannerProps) {
  if (preflight.allowed) return null;

  const isBlocked = preflight.status === 'blocked';
  const Icon = isBlocked ? ShieldX : ShieldAlert;
  const tone = isBlocked ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60';
  const iconColor = isBlocked ? 'text-red-500' : 'text-amber-500';
  const title = isBlocked
    ? `${preflight.target === 'publish_package' ? 'Publish' : 'Verify'} blocked`
    : `${preflight.target === 'publish_package' ? 'Publish' : 'Verify'} needs review`;

  const handleCta = () => {
    if (!preflight.cta) return;
    switch (preflight.cta.action) {
      case 'open_queue': onOpenQueue?.(); break;
      case 'inspect_decision':
        if (preflight.blockingDecisionIds[0]) onInspectDecision?.(preflight.blockingDecisionIds[0]);
        break;
      case 'refresh': onRefresh?.(); break;
      case 'proceed': onDismiss?.(); break;
    }
  };

  return (
    <div
      className={cn('border rounded-lg px-3 py-2.5', tone, className)}
      role="alert"
      data-testid="transition-preflight-banner"
    >
      <div className="flex items-start gap-2">
        <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', iconColor)} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-stone-800">{title}</p>

          {/* Reasons */}
          {preflight.reasons.length > 0 && (
            <ul className="mt-1 space-y-0.5" data-testid="preflight-reasons">
              {preflight.reasons.map((r, i) => (
                <li key={i} className="text-[11px] text-stone-600 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-stone-400" />
                  {r}
                </li>
              ))}
            </ul>
          )}

          {/* Next actions */}
          {preflight.nextActions.length > 0 && (
            <div className="mt-1.5 space-y-0.5" data-testid="preflight-next-actions">
              {preflight.nextActions.slice(0, 2).map((a, i) => (
                <div key={i} className="text-[10px] text-stone-500 flex items-center gap-1">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    a.priority === 'high' ? 'bg-red-400' : a.priority === 'medium' ? 'bg-amber-400' : 'bg-stone-300',
                  )} />
                  {a.label}
                </div>
              ))}
            </div>
          )}

          {/* CTA + dismiss */}
          <div className="mt-2 flex items-center gap-2">
            {preflight.cta && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCta}
                className="text-[10px] h-6 px-2 gap-1"
                data-testid="preflight-cta"
              >
                {preflight.cta.action === 'refresh' && <RefreshCw className="w-3 h-3" />}
                {preflight.cta.label}
                {preflight.cta.action !== 'refresh' && <ChevronRight className="w-3 h-3" />}
              </Button>
            )}
            {onDismiss && preflight.status === 'review_required' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="text-[10px] h-6 px-2 text-stone-400"
                data-testid="preflight-dismiss"
              >
                Proceed anyway
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
