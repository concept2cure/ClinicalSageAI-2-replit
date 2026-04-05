/**
 * Conversation Health Pill
 *
 * Minimal indicator of conversation health. Stone-palette badge with
 * Tooltip-based detail panel. Uses governed Button component for actions.
 */

import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type HealthState = 'healthy' | 'heavy' | 'degrading' | 'at_risk';

interface HealthReport {
  healthScore: number;
  healthState: HealthState;
  signals: {
    messageCount: number;
    estimatedTokens: number;
    averageLatencyMs: number | null;
    topicCount: number;
    unresolvedQuestions: number;
    repetitionRate: number;
  };
  warnings: string[];
  suggestedActions: string[];
}

interface ConversationHealthPillProps {
  conversationId: number;
  organizationId?: number;
  onAction?: (action: 'summarize' | 'split' | 'promote') => void;
}

const STATE_CONFIG: Record<HealthState, { badgeClass: string; dotClass: string; label: string }> = {
  healthy: { badgeClass: 'border-stone-200 bg-stone-50 text-stone-600', dotClass: 'bg-emerald-500', label: 'Healthy' },
  heavy: { badgeClass: 'border-amber-200 bg-amber-50 text-amber-700', dotClass: 'bg-amber-500', label: 'Heavy' },
  degrading: { badgeClass: 'border-amber-200 bg-amber-50 text-amber-700', dotClass: 'bg-amber-500', label: 'Degrading' },
  at_risk: { badgeClass: 'border-red-200 bg-red-50 text-red-700', dotClass: 'bg-red-500', label: 'At Risk' },
};

export function ConversationHealthPill({
  conversationId,
  organizationId = 1,
  onAction,
}: ConversationHealthPillProps) {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    apiRequest('GET', `/api/concept2cure/conversations/${conversationId}/health`)
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data) {
          setReport(json.data);
        }
      })
      .catch(() => {
        /* Health check is non-critical — suppress */
      })
      .finally(() => setLoading(false));
  }, [conversationId, organizationId]);

  if (loading || !report) return null;

  const config = STATE_CONFIG[report.healthState];

  return (
    <div className="relative inline-block">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowTooltip(!showTooltip)}
        className={cn(
          'h-6 px-2.5 rounded-full text-[11px] font-semibold gap-1.5',
          config.badgeClass
        )}
        aria-label={`Conversation Health: ${config.label} (${report.healthScore}/100)`}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full inline-block', config.dotClass)} />
        {config.label}
      </Button>

      {showTooltip && (
        <div
          className="absolute top-full right-0 mt-2 w-72 bg-white border border-stone-100 rounded-lg shadow-sm p-4 z-50 text-[13px] text-stone-600"
          role="tooltip"
        >
          <div className="flex justify-between mb-3">
            <span className="font-semibold text-stone-900">Context Health</span>
            <span className="font-semibold text-stone-700">
              {report.healthScore}/100
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <div className="text-[11px] text-stone-400">Messages</div>
              <div className="font-semibold text-stone-700">{report.signals.messageCount}</div>
            </div>
            <div>
              <div className="text-[11px] text-stone-400">Tokens (est.)</div>
              <div className="font-semibold text-stone-700">{Math.round(report.signals.estimatedTokens / 1000)}k</div>
            </div>
            <div>
              <div className="text-[11px] text-stone-400">Topics</div>
              <div className="font-semibold text-stone-700">{report.signals.topicCount}</div>
            </div>
            <div>
              <div className="text-[11px] text-stone-400">Open Questions</div>
              <div className="font-semibold text-stone-700">{report.signals.unresolvedQuestions}</div>
            </div>
          </div>

          {report.warnings.length > 0 && (
            <div className="mb-3">
              <div className="font-semibold text-amber-700 mb-1 text-[12px]">Warnings</div>
              {report.warnings.map((w, i) => (
                <div key={i} className="text-[12px] text-stone-500 mb-0.5 pl-2">
                  {w}
                </div>
              ))}
            </div>
          )}

          {report.suggestedActions.length > 0 && onAction && (
            <div>
              <div className="font-semibold text-stone-700 mb-1.5 text-[12px]">Suggested Actions</div>
              <div className="flex flex-wrap gap-1.5">
                {report.suggestedActions.some(a => a.toLowerCase().includes('summar')) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAction('summarize')}
                    className="h-7 text-[11px] text-stone-600"
                  >
                    Summarize
                  </Button>
                )}
                {report.suggestedActions.some(a => a.toLowerCase().includes('split')) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAction('split')}
                    className="h-7 text-[11px] text-stone-600"
                  >
                    Split Topics
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAction('promote')}
                  className="h-7 text-[11px] text-stone-600"
                >
                  Promote to Document
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ConversationHealthPill;
