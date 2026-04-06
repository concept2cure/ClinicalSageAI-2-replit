/**
 * BlockerList — Displays readiness blockers with severity and actions.
 */
import React from 'react';
import type { ReadinessBlocker } from '../../hooks/useOrchestration';

interface BlockerListProps {
  blockers: ReadinessBlocker[];
  onResolve?: (blocker: ReadinessBlocker) => void;
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string; text: string }> = {
  critical: {
    bg: 'bg-stone-100',
    border: 'border-stone-200',
    icon: 'text-stone-700',
    text: 'text-stone-800',
  },
  major: {
    bg: 'bg-stone-100',
    border: 'border-stone-200',
    icon: 'text-stone-600',
    text: 'text-stone-800',
  },
  minor: {
    bg: 'bg-stone-100',
    border: 'border-stone-200',
    icon: 'text-stone-600',
    text: 'text-stone-800',
  },
};

export function BlockerList({ blockers, onResolve }: BlockerListProps) {
  if (blockers.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-stone-500">
        No blockers found. Project is clear.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {blockers.map((blocker, i) => {
        const style = SEVERITY_STYLES[blocker.severity] || SEVERITY_STYLES.minor;
        return (
          <div
            key={i}
            className={`rounded-lg border p-3 ${style.bg} ${style.border}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase ${style.text} ${style.bg}`}
                  >
                    {blocker.severity}
                  </span>
                  <span className="text-xs text-stone-500">
                    {blocker.category.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className={`text-sm font-medium ${style.text}`}>{blocker.message}</p>
                {blocker.suggestedResolution && (
                  <p className="text-xs text-stone-600 mt-1">
                    Suggested: {blocker.suggestedResolution}
                  </p>
                )}
              </div>
              {onResolve && (
                <button
                  onClick={() => onResolve(blocker)}
                  className="shrink-0 text-xs px-2 py-1 rounded bg-white border border-stone-300 hover:bg-stone-50 transition-colors"
                >
                  Resolve
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
