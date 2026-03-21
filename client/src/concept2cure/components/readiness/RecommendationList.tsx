/**
 * RecommendationList — Displays predictive recommendations with severity and actions.
 */
import React from 'react';
import type { Recommendation } from '../../hooks/useOrchestration';

interface RecommendationListProps {
  recommendations: Recommendation[];
  onExecute?: (rec: Recommendation) => void;
  limit?: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  info: 'bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300',
};

const TYPE_LABELS: Record<string, string> = {
  missing_content: 'Missing',
  weak_content: 'Weak',
  stale_content: 'Stale',
  unvalidated_content: 'Unvalidated',
  unrouted_document: 'Unrouted',
  blocked_workflow: 'Blocked',
  overdue_task: 'Overdue',
  validation_failure: 'Validation',
  inconsistency: 'Inconsistency',
  readiness_gap: 'Gap',
  next_best_action: 'Next Action',
};

export function RecommendationList({
  recommendations,
  onExecute,
  limit,
}: RecommendationListProps) {
  const items = limit ? recommendations.slice(0, limit) : recommendations;

  if (items.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
        No recommendations at this time. Looking good!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((rec) => (
        <div
          key={rec.id}
          className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    SEVERITY_COLORS[rec.severity] || SEVERITY_COLORS.info
                  }`}
                >
                  {rec.severity}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                  {TYPE_LABELS[rec.recommendationType] || rec.recommendationType}
                </span>
                {rec.module && (
                  <span className="text-xs text-gray-400">
                    {rec.module}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {rec.reason}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {rec.suggestedAction}
              </p>
              {rec.evidence.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {rec.evidence.slice(0, 3).map((e, i) => (
                    <span
                      key={i}
                      className="text-xs px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                    >
                      {e}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {onExecute && rec.actionPayload && (
              <button
                onClick={() => onExecute(rec)}
                className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium"
              >
                Run
              </button>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${Math.round(rec.confidence * 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">
              {Math.round(rec.confidence * 100)}% confidence
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
