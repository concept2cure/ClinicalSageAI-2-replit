/**
 * ModuleBreakdown — Per-module readiness breakdown with visual indicators.
 */
import React from 'react';
import type { ModuleReadinessItem } from '../../hooks/useOrchestration';

interface ModuleBreakdownProps {
  modules: ModuleReadinessItem[];
  onModuleClick?: (module: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  ready: 'bg-stone-1000',
  on_track: 'bg-stone-600',
  needs_attention: 'bg-stone-1000',
  at_risk: 'bg-stone-1000',
  in_progress: 'bg-stone-500',
  not_started: 'bg-stone-400',
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  ready: 'text-stone-800 dark:text-stone-400',
  on_track: 'text-stone-700 dark:text-stone-400',
  needs_attention: 'text-stone-700 dark:text-stone-400',
  at_risk: 'text-stone-800 dark:text-stone-400',
  in_progress: 'text-stone-700 dark:text-stone-400',
  not_started: 'text-stone-500 dark:text-stone-400',
};

export function ModuleBreakdown({ modules, onModuleClick }: ModuleBreakdownProps) {
  if (modules.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-stone-500">
        No module data available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {modules.map((mod) => {
        const barColor = STATUS_COLORS[mod.status] || STATUS_COLORS.not_started;
        const textColor = STATUS_TEXT_COLORS[mod.status] || STATUS_TEXT_COLORS.not_started;

        return (
          <div
            key={mod.module}
            className={`rounded-lg border border-stone-200 dark:border-stone-700 p-3 bg-white dark:bg-stone-900 ${
              onModuleClick ? 'cursor-pointer hover:shadow-sm transition-shadow' : ''
            }`}
            onClick={() => onModuleClick?.(mod.module)}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  {mod.module}
                </span>
                <span className="text-xs text-stone-500 dark:text-stone-400 ml-2">
                  {mod.label}
                </span>
              </div>
              <span className={`text-sm font-bold ${textColor}`}>{mod.score}%</span>
            </div>

            {/* Progress bar */}
            <div className="h-2 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden mb-2">
              <div
                className={`h-full rounded-full ${barColor} transition-all duration-200`}
                style={{ width: `${mod.score}%` }}
              />
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400">
              <span>
                {mod.documentCount}/{mod.expectedDocumentCount} docs
              </span>
              <span>{mod.validatedCount} validated</span>
              <span>{mod.routedCount} routed</span>
              {mod.blockerCount > 0 && (
                <span className="text-stone-700 dark:text-stone-400 font-medium">
                  {mod.blockerCount} blocker{mod.blockerCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Missing items */}
            {mod.missingItems.length > 0 && (
              <div className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                {mod.missingItems.slice(0, 2).map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-stone-1000">!</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
