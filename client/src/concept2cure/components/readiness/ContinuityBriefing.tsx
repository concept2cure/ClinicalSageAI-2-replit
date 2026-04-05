/**
 * ContinuityBriefing — Cross-session intelligence panel.
 * Shows what changed, what's blocked, what's ready, and what to do next.
 */
import React from 'react';
import type { ContinuitySnapshot } from '../../hooks/useOrchestration';

interface ContinuityBriefingProps {
  snapshot: ContinuitySnapshot;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

const TRAJECTORY_STYLES: Record<string, { label: string; color: string; arrow: string }> = {
  improving: { label: 'Improving', color: 'text-emerald-600 dark:text-emerald-400', arrow: '\u2191' },
  declining: { label: 'Declining', color: 'text-red-600 dark:text-red-400', arrow: '\u2193' },
  stable: { label: 'Stable', color: 'text-stone-600 dark:text-stone-400', arrow: '\u2192' },
};

export function ContinuityBriefing({ snapshot, onRefresh, isRefreshing }: ContinuityBriefingProps) {
  const traj = TRAJECTORY_STYLES[snapshot.trajectory] || TRAJECTORY_STYLES.stable;

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-stone-700 dark:text-stone-300">
            {snapshot.summary}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-stone-500">
              Readiness: <strong>{snapshot.metrics.readinessScore}%</strong>
            </span>
            <span className={`text-xs font-medium ${traj.color}`}>
              {traj.arrow} {traj.label}
            </span>
            <span className="text-xs text-stone-400">
              {new Date(snapshot.snapshotAt).toLocaleString()}
            </span>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="shrink-0 text-xs px-2 py-1 rounded border border-stone-300 dark:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Documents', value: snapshot.metrics.documentCount },
          { label: 'Validated', value: snapshot.metrics.validatedCount },
          { label: 'Blockers', value: snapshot.metrics.blockerCount },
          { label: 'Tasks Done', value: `${snapshot.metrics.taskCompletionPercent}%` },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-lg bg-stone-50 dark:bg-stone-800 p-2 text-center"
          >
            <div className="text-lg font-bold text-stone-900 dark:text-stone-100">{m.value}</div>
            <div className="text-xs text-stone-500 dark:text-stone-400">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Recent changes */}
      {snapshot.changes.length > 0 && (
        <div>
          <h4 className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400 mb-2">
            Recent Changes
          </h4>
          <div className="space-y-1">
            {snapshot.changes.slice(0, 5).map((change, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-stone-600 shrink-0" />
                <span className="text-stone-700 dark:text-stone-300">{change.description}</span>
                <span className="text-xs text-stone-400 ml-auto shrink-0">
                  {new Date(change.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Newly ready */}
      {snapshot.newlyReady.length > 0 && (
        <div>
          <h4 className="text-xs font-medium uppercase text-emerald-600 dark:text-emerald-400 mb-2">
            Newly Ready
          </h4>
          <div className="space-y-1">
            {snapshot.newlyReady.map((item) => (
              <div key={`${item.type}-${item.id}`} className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                {item.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Needs attention */}
      {snapshot.needsAttention.length > 0 && (
        <div>
          <h4 className="text-xs font-medium uppercase text-amber-600 dark:text-amber-400 mb-2">
            Needs Attention
          </h4>
          <div className="space-y-1">
            {snapshot.needsAttention.slice(0, 5).map((item) => (
              <div key={`${item.type}-${item.id}`} className="text-sm">
                <span className="text-stone-700 dark:text-stone-300">{item.title}</span>
                <span className="text-xs text-stone-500 ml-1">— {item.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next actions */}
      {snapshot.nextActions.length > 0 && (
        <div>
          <h4 className="text-xs font-medium uppercase text-stone-600 dark:text-stone-400 mb-2">
            Recommended Next
          </h4>
          <div className="space-y-1">
            {snapshot.nextActions.slice(0, 3).map((action) => (
              <div key={action.id} className="flex items-center gap-2 text-sm">
                <span className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 dark:text-stone-300 font-medium">
                  {action.severity}
                </span>
                <span className="text-stone-700 dark:text-stone-300">{action.suggestedAction}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
