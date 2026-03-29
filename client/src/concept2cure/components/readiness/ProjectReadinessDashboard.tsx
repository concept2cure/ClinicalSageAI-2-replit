/**
 * ProjectReadinessDashboard — Phase 3 Main Readiness Surface
 *
 * Actionable, object-linked, AI-connected readiness view.
 * Shows:
 * - Overall readiness score ring
 * - Subscore breakdown
 * - Module-level readiness
 * - Blockers
 * - Predictive recommendations
 * - Workflow runner
 * - Continuity briefing
 */
import React, { useState, useCallback } from 'react';
import {
  useReadinessAssessment,
  useRecommendations,
  useContinuity,
} from '../../hooks/useOrchestration';
import type { ReadinessBlocker, Recommendation, ReadinessAssessment } from '../../hooks/useOrchestration';
import { ReadinessScoreRing } from './ReadinessScoreRing';
import { ModuleBreakdown } from './ModuleBreakdown';
import { BlockerList } from './BlockerList';
import { RecommendationList } from './RecommendationList';
import { WorkflowRunner } from './WorkflowRunner';
import { ContinuityBriefing } from './ContinuityBriefing';

interface ProjectReadinessDashboardProps {
  projectId: number;
  projectName?: string;
  module?: string;
}

type TabId = 'overview' | 'modules' | 'blockers' | 'recommendations' | 'workflows' | 'continuity';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'modules', label: 'Modules' },
  { id: 'blockers', label: 'Blockers' },
  { id: 'recommendations', label: 'Guidance' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'continuity', label: 'Continuity' },
];

export function ProjectReadinessDashboard({
  projectId,
  projectName,
  module,
}: ProjectReadinessDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const { data: readiness, isLoading: readinessLoading, error: readinessError } = useReadinessAssessment(projectId, module);
  const { data: recSet, isLoading: recsLoading } = useRecommendations(projectId, { module, limit: 20 });
  const { snapshot: continuity, isLoading: continuityLoading, refresh: refreshContinuity } = useContinuity(projectId);

  const handleResolveBlocker = useCallback((blocker: ReadinessBlocker) => {
    // Phase 4: Wire to AI action dispatch for automated resolution
    console.log('[Readiness] Resolve blocker:', blocker.category, blocker.targetId);
  }, []);

  const handleExecuteRecommendation = useCallback((rec: Recommendation) => {
    // Phase 4: Wire to AI action dispatch for automated execution
    console.log('[Readiness] Execute recommendation:', rec.recommendationType, rec.targetObjectId);
  }, []);

  if (readinessLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-500 dark:text-gray-400">
          Computing readiness...
        </div>
      </div>
    );
  }

  if (readinessError) {
    return (
      <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
        <p className="text-sm text-red-700 dark:text-red-300">
          Failed to load readiness: {readinessError instanceof Error ? readinessError.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {projectName ? `${projectName} — Readiness` : 'Submission Readiness'}
        </h2>
        {readiness && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Last assessed: {new Date(readiness.assessedAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Tab bar */}
      <div className="px-4 border-b border-gray-200 dark:border-gray-700 flex gap-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-stone-600 text-stone-600 dark:text-stone-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
            {tab.id === 'blockers' && readiness && readiness.blockers.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-bold">
                {readiness.blockers.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && readiness && (
          <OverviewTab readiness={readiness} recCount={recSet?.summary.total ?? 0} />
        )}
        {activeTab === 'modules' && readiness && (
          <ModuleBreakdown modules={readiness.moduleBreakdown} />
        )}
        {activeTab === 'blockers' && readiness && (
          <BlockerList blockers={readiness.blockers} onResolve={handleResolveBlocker} />
        )}
        {activeTab === 'recommendations' && (
          <RecommendationList
            recommendations={recSet?.recommendations || readiness?.recommendations || []}
            onExecute={handleExecuteRecommendation}
          />
        )}
        {activeTab === 'workflows' && (
          <WorkflowRunner projectId={projectId} module={module} />
        )}
        {activeTab === 'continuity' && continuity && (
          <ContinuityBriefing
            snapshot={continuity}
            onRefresh={refreshContinuity}
            isRefreshing={continuityLoading}
          />
        )}
        {activeTab === 'continuity' && !continuity && !continuityLoading && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              No continuity data yet. Generate a snapshot to start tracking.
            </p>
            <button
              onClick={refreshContinuity}
              className="px-4 py-2 rounded-md bg-stone-700 text-white text-sm font-medium hover:bg-stone-800"
            >
              Generate Snapshot
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({ readiness, recCount }: { readiness: ReadinessAssessment; recCount: number }) {
  const scores = readiness.scores;

  const SUBSCORE_ITEMS = [
    { label: 'Completeness', value: scores.completeness, desc: 'Document/artifact coverage' },
    { label: 'Quality', value: scores.quality, desc: 'Validation & compliance scores' },
    { label: 'Compliance', value: scores.compliance, desc: 'Critical/major findings' },
    { label: 'Routing', value: scores.routing, desc: 'Module placement' },
    { label: 'Consistency', value: scores.consistency, desc: 'Cross-reference alignment' },
  ];

  return (
    <div className="space-y-6">
      {/* Score ring + status */}
      <div className="flex items-center gap-6">
        <div className="relative">
          <ReadinessScoreRing
            score={readiness.overallScore}
            status={readiness.status}
            label="Overall"
            size={140}
          />
        </div>
        <div className="flex-1">
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 capitalize">
            {readiness.status.replace(/_/g, ' ')}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500">Documents:</span>{' '}
              <span className="font-medium">{readiness.documentInventory.length}</span>
            </div>
            <div>
              <span className="text-gray-500">Modules:</span>{' '}
              <span className="font-medium">{readiness.moduleBreakdown.length}</span>
            </div>
            <div>
              <span className="text-gray-500">Blockers:</span>{' '}
              <span className={`font-medium ${readiness.blockers.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {readiness.blockers.length}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Recommendations:</span>{' '}
              <span className="font-medium">{recCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Subscores */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Score Breakdown
        </h3>
        <div className="space-y-2">
          {SUBSCORE_ITEMS.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 dark:text-gray-400 w-24 shrink-0">
                {item.label}
              </span>
              <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    item.value >= 70
                      ? 'bg-green-500'
                      : item.value >= 40
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${item.value}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-10 text-right">
                {item.value}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick blockers */}
      {readiness.blockers.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
            Top Blockers
          </h3>
          <BlockerList blockers={readiness.blockers.slice(0, 3)} />
        </div>
      )}
    </div>
  );
}

export default ProjectReadinessDashboard;
