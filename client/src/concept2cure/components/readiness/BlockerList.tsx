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
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    icon: 'text-red-600',
    text: 'text-red-800 dark:text-red-300',
  },
  major: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    icon: 'text-amber-600',
    text: 'text-amber-800 dark:text-amber-300',
  },
  minor: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    icon: 'text-blue-600',
    text: 'text-blue-800 dark:text-blue-300',
  },
};

export function BlockerList({ blockers, onResolve }: BlockerListProps) {
  if (blockers.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-stone-500 dark:text-stone-400">
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
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    {blocker.category.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className={`text-sm font-medium ${style.text}`}>{blocker.message}</p>
                {blocker.suggestedResolution && (
                  <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
                    Suggested: {blocker.suggestedResolution}
                  </p>
                )}
              </div>
              {onResolve && (
                <button
                  onClick={() => onResolve(blocker)}
                  className="shrink-0 text-xs px-2 py-1 rounded bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
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
