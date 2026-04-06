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
import { useRIMAssessment } from '../../hooks/useIntelligence';
import type { JudgmentScore, JudgmentVerdict, JudgmentModel } from '../../hooks/useIntelligence';
import { Badge } from '@/components/ui/badge';
import { ReadinessScoreRing } from './ReadinessScoreRing';
import { ModuleBreakdown } from './ModuleBreakdown';
import { BlockerList } from './BlockerList';
import { RecommendationList } from './RecommendationList';
import { WorkflowRunner } from './WorkflowRunner';
import { ContinuityBriefing } from './ContinuityBriefing';
import { LoadingState, ErrorState } from '@/components/ui/statesV2';

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
  const { data: rimAssessment, isLoading: rimLoading } = useRIMAssessment(projectId);

  const handleResolveBlocker = useCallback((blocker: ReadinessBlocker) => {
    // Phase 4: Wire to AI action dispatch for automated resolution
    console.log('[Readiness] Resolve blocker:', blocker.category, blocker.targetId);
  }, []);

  const handleExecuteRecommendation = useCallback((rec: Recommendation) => {
    // Phase 4: Wire to AI action dispatch for automated execution
    console.log('[Readiness] Execute recommendation:', rec.recommendationType, rec.targetObjectId);
  }, []);

  if (readinessLoading) {
    return <LoadingState message="Computing readiness" className="h-64" />;
  }

  if (readinessError) {
    return (
      <ErrorState
        message={readinessError instanceof Error ? readinessError.message : 'Failed to load readiness'}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-200">
        <h2 className="text-lg font-semibold text-stone-900">
          {projectName ? `${projectName} — Readiness` : 'Submission Readiness'}
        </h2>
        {readiness && (
          <p className="text-xs text-stone-500 mt-0.5">
            Last assessed: {new Date(readiness.assessedAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Tab bar */}
      <div className="px-4 border-b border-stone-200 flex gap-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-stone-600 text-stone-600
                : 'border-transparent text-stone-500 hover:text-stone-700
            }`}
          >
            {tab.label}
            {tab.id === 'blockers' && readiness && readiness.blockers.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-stone-100 text-stone-800 text-xs font-bold">
                {readiness.blockers.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && readiness && (
          <OverviewTab
            readiness={readiness}
            recCount={recSet?.summary.total ?? 0}
            judgmentScores={rimAssessment?.judgment.scores}
            rimLoading={rimLoading}
          />
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
            <p className="text-sm text-stone-500 mb-3">
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

// ---------------------------------------------------------------------------
// Judgment Analysis helpers
// ---------------------------------------------------------------------------

const JUDGMENT_MODEL_LABELS: Record<JudgmentModel, string> = {
  evidence_sufficiency: 'Evidence Sufficiency',
  defensibility: 'Defensibility',
  reviewer_sensitivity: 'Reviewer Sensitivity',
  claim_risk: 'Claim Risk',
  cross_section_consistency: 'Cross-Section Consistency',
  submission_risk: 'Submission Risk',
};

const VERDICT_STYLES: Record<JudgmentVerdict, { label: string; className: string }> = {
  pass: { label: 'Pass', className: 'bg-stone-100 text-stone-700 },
  acceptable: { label: 'Acceptable', className: 'bg-stone-100 text-stone-600 },
  needs_attention: { label: 'Needs Attention', className: 'bg-stone-100 text-stone-700 },
  at_risk: { label: 'At Risk', className: 'bg-stone-100 text-stone-800 },
  fail: { label: 'Fail', className: 'bg-stone-100 text-stone-800 },
};

function JudgmentScoreCard({ score }: { score: JudgmentScore }) {
  const label = JUDGMENT_MODEL_LABELS[score.model] ?? score.model;
  const verdictStyle = VERDICT_STYLES[score.verdict] ?? VERDICT_STYLES.acceptable;
  const topFinding = score.findings[0];

  return (
    <div className="rounded-lg border border-stone-200 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-stone-700 truncate">
          {label}
        </span>
        <Badge
          variant="secondary"
          className={`text-[10px] px-1.5 py-0 font-medium shrink-0 ${verdictStyle.className}`}
        >
          {verdictStyle.label}
        </Badge>
      </div>

      {/* Score bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-stone-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-200 ${
              score.score >= 70
                ? 'bg-stone-500
                : score.score >= 50
                  ? 'bg-stone-900
                  : 'bg-stone-900
            }`}
            style={{ width: `${score.score}%` }}
          />
        </div>
        <span className="text-[11px] font-medium text-stone-600 w-8 text-right tabular-nums">
          {score.score}
        </span>
      </div>

      {/* Top finding */}
      {topFinding && (
        <p className="text-[11px] text-stone-500 leading-snug line-clamp-2">
          {topFinding.description}
        </p>
      )}
    </div>
  );
}

function JudgmentAnalysisSection({
  scores,
  isLoading,
}: {
  scores?: JudgmentScore[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div>
        <h3 className="text-sm font-medium text-stone-700 mb-3">
          Judgment Analysis
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-stone-200 p-3 space-y-2 animate-pulse"
            >
              <div className="h-3 w-24 bg-stone-200 rounded" />
              <div className="h-1.5 w-full bg-stone-200 rounded-full" />
              <div className="h-2.5 w-32 bg-stone-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!scores || scores.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-medium text-stone-700 mb-3">
        Judgment Analysis
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {scores.map((s) => (
          <JudgmentScoreCard key={s.model} score={s} />
        ))}
      </div>
    </div>
  );
}

function OverviewTab({
  readiness,
  recCount,
  judgmentScores,
  rimLoading,
}: {
  readiness: ReadinessAssessment;
  recCount: number;
  judgmentScores?: JudgmentScore[];
  rimLoading: boolean;
}) {
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
          <div className="text-lg font-semibold text-stone-900 capitalize">
            {readiness.status.replace(/_/g, ' ')}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-stone-500">Documents:</span>{' '}
              <span className="font-medium">{readiness.documentInventory.length}</span>
            </div>
            <div>
              <span className="text-stone-500">Modules:</span>{' '}
              <span className="font-medium">{readiness.moduleBreakdown.length}</span>
            </div>
            <div>
              <span className="text-stone-500">Blockers:</span>{' '}
              <span className={`font-medium ${readiness.blockers.length > 0 ? 'text-stone-700' : 'text-stone-700'}`}>
                {readiness.blockers.length}
              </span>
            </div>
            <div>
              <span className="text-stone-500">Recommendations:</span>{' '}
              <span className="font-medium">{recCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Subscores */}
      <div>
        <h3 className="text-sm font-medium text-stone-700 mb-3">
          Score Breakdown
        </h3>
        <div className="space-y-2">
          {SUBSCORE_ITEMS.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="text-xs text-stone-500 w-24 shrink-0">
                {item.label}
              </span>
              <div className="flex-1 h-2 rounded-full bg-stone-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    item.value >= 70
                      ? 'bg-stone-900'
                      : item.value >= 40
                        ? 'bg-stone-900'
                        : 'bg-stone-900'
                  }`}
                  style={{ width: `${item.value}%` }}
                />
              </div>
              <span className="text-xs font-medium text-stone-700 w-10 text-right">
                {item.value}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Judgment Analysis — RIM scores */}
      <JudgmentAnalysisSection scores={judgmentScores} isLoading={rimLoading} />

      {/* Quick blockers */}
      {readiness.blockers.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-stone-800 mb-2">
            Top Blockers
          </h3>
          <BlockerList blockers={readiness.blockers.slice(0, 3)} />
        </div>
      )}
    </div>
  );
}

export default ProjectReadinessDashboard;
