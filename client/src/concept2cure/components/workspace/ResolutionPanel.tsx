/**
 * Resolution Panel — Sprint 4
 *
 * Workspace-embedded panel that surfaces resolution orchestration state.
 * Shows resolution plans, bundles, and supersessions for the current project.
 *
 * Follows the existing Concept2Cure workspace design principles:
 * - project-centric, document-first
 * - calm, high-signal workspace
 * - governed artifacts
 * - minimal visible complexity
 *
 * @module client/components/workspace/ResolutionPanel
 */

import React, { useState, useMemo } from 'react';
import {
  useResolutionPlans,
  useResolutionBundles,
  useProjectSupersessions,
  useTransitionPlanState,
  useTransitionBundleState,
  useCreateBundleFromPlan,
} from '../../hooks/useResolution';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ResolutionPanelProps {
  projectId: number;
  className?: string;
}

type TabId = 'plans' | 'bundles' | 'supersessions';

// ═══════════════════════════════════════════════════════════════════════════════
// STATE BADGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function StateBadge({ state }: { state: string }) {
  const colorMap: Record<string, string> = {
    unresolved: 'bg-amber-100 text-amber-800',
    proposed_resolution: 'bg-blue-100 text-blue-800',
    in_resolution: 'bg-stone-100 text-stone-800',
    resolved_pending_review: 'bg-stone-200 text-stone-800',
    resolved_approved: 'bg-emerald-100 text-emerald-800',
    superseded: 'bg-stone-100 text-stone-500',
    cancelled: 'bg-stone-100 text-stone-400',
    draft: 'bg-stone-100 text-stone-600',
    proposed: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-stone-100 text-stone-800',
    pending_review: 'bg-stone-200 text-stone-800',
    approved: 'bg-emerald-100 text-emerald-800',
    applied: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
    confirmed: 'bg-emerald-100 text-emerald-800',
    reverted: 'bg-amber-100 text-amber-800',
  };

  const label = state.replace(/_/g, ' ');
  const colorClass = colorMap[state] || 'bg-stone-100 text-stone-600';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIDENCE INDICATOR
// ═══════════════════════════════════════════════════════════════════════════════

function ConfidenceIndicator({ confidence }: { confidence: string }) {
  const indicators: Record<string, { dots: number; color: string }> = {
    strong: { dots: 4, color: 'bg-emerald-500' },
    moderate: { dots: 3, color: 'bg-stone-600' },
    provisional: { dots: 2, color: 'bg-amber-500' },
    uncertain: { dots: 1, color: 'bg-red-500' },
  };

  const { dots, color } = indicators[confidence] || { dots: 0, color: 'bg-stone-300' };

  return (
    <div className="flex items-center gap-0.5" title={`Confidence: ${confidence}`}>
      {[1, 2, 3, 4].map(i => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i <= dots ? color : 'bg-stone-200'}`}
        />
      ))}
      <span className="text-xs text-stone-500 ml-1">{confidence}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION PLAN CARD
// ═══════════════════════════════════════════════════════════════════════════════

function ResolutionPlanCard({ plan, onCreateBundle }: {
  plan: any;
  onCreateBundle: (planId: string) => void;
}) {
  const transitionState = useTransitionPlanState();
  const affectedCount = plan.affectedObjects?.length ?? 0;

  return (
    <div className="border border-stone-200 rounded-lg p-4 space-y-3 bg-white">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StateBadge state={plan.state} />
            <span className="text-xs text-stone-400">
              {plan.triggerType?.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-sm font-medium text-stone-900 truncate">
            {plan.triggerDescription}
          </p>
        </div>
        <ConfidenceIndicator confidence={plan.confidence} />
      </div>

      <div className="flex items-center gap-4 text-xs text-stone-500">
        <span>{affectedCount} affected object{affectedCount !== 1 ? 's' : ''}</span>
        <span>Path: {plan.recommendedPath?.replace(/_/g, ' ')}</span>
        {plan.requiresReview && <span className="text-amber-600">Review required</span>}
        {plan.requiresReapproval && <span className="text-red-600">Reapproval required</span>}
      </div>

      {plan.rationale && (
        <p className="text-xs text-stone-600 line-clamp-2">{plan.rationale}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {plan.state === 'unresolved' && (
          <>
            <button
              className="text-xs px-3 py-1 bg-blue-50 text-stone-700 rounded hover:bg-blue-100 transition-colors"
              onClick={() => transitionState.mutate({ planId: plan.id, targetState: 'proposed_resolution' })}
            >
              Propose Resolution
            </button>
            {!plan.bundleId && (
              <button
                className="text-xs px-3 py-1 bg-stone-100 text-stone-700 rounded hover:bg-stone-100 transition-colors"
                onClick={() => onCreateBundle(plan.id)}
              >
                Create Bundle
              </button>
            )}
          </>
        )}
        {plan.state === 'proposed_resolution' && (
          <button
            className="text-xs px-3 py-1 bg-stone-100 text-stone-700 rounded hover:bg-stone-100 transition-colors"
            onClick={() => transitionState.mutate({ planId: plan.id, targetState: 'in_resolution' })}
          >
            Begin Resolution
          </button>
        )}
        {plan.state === 'in_resolution' && (
          <button
            className="text-xs px-3 py-1 bg-stone-100 text-stone-700 rounded hover:bg-stone-200 transition-colors"
            onClick={() => transitionState.mutate({ planId: plan.id, targetState: 'resolved_pending_review' })}
          >
            Submit for Review
          </button>
        )}
        {plan.state === 'resolved_pending_review' && (
          <button
            className="text-xs px-3 py-1 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 transition-colors"
            onClick={() => transitionState.mutate({ planId: plan.id, targetState: 'resolved_approved' })}
          >
            Approve
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION BUNDLE CARD
// ═══════════════════════════════════════════════════════════════════════════════

function ResolutionBundleCard({ bundle }: { bundle: any }) {
  const transitionState = useTransitionBundleState();

  return (
    <div className="border border-stone-200 rounded-lg p-4 space-y-3 bg-white">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StateBadge state={bundle.state} />
          </div>
          <p className="text-sm font-medium text-stone-900 truncate">{bundle.title}</p>
        </div>
        <ConfidenceIndicator confidence={bundle.confidence} />
      </div>

      {bundle.description && (
        <p className="text-xs text-stone-600 line-clamp-2">{bundle.description}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-stone-500">
        {bundle.requiresReview && <span className="text-amber-600">Review required</span>}
        {bundle.requiresReapproval && <span className="text-red-600">Reapproval required</span>}
      </div>

      <div className="flex gap-2 pt-1">
        {bundle.state === 'draft' && (
          <button
            className="text-xs px-3 py-1 bg-blue-50 text-stone-700 rounded hover:bg-blue-100 transition-colors"
            onClick={() => transitionState.mutate({ bundleId: bundle.id, targetState: 'proposed' })}
          >
            Propose
          </button>
        )}
        {bundle.state === 'proposed' && (
          <button
            className="text-xs px-3 py-1 bg-stone-100 text-stone-700 rounded hover:bg-stone-100 transition-colors"
            onClick={() => transitionState.mutate({ bundleId: bundle.id, targetState: 'in_progress' })}
          >
            Begin
          </button>
        )}
        {bundle.state === 'in_progress' && (
          <button
            className="text-xs px-3 py-1 bg-stone-100 text-stone-700 rounded hover:bg-stone-200 transition-colors"
            onClick={() => transitionState.mutate({ bundleId: bundle.id, targetState: 'pending_review' })}
          >
            Submit for Review
          </button>
        )}
        {bundle.state === 'pending_review' && (
          <button
            className="text-xs px-3 py-1 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 transition-colors"
            onClick={() => transitionState.mutate({ bundleId: bundle.id, targetState: 'approved' })}
          >
            Approve
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPERSESSION CARD
// ═══════════════════════════════════════════════════════════════════════════════

function SupersessionCard({ record }: { record: any }) {
  return (
    <div className="border border-stone-200 rounded-lg p-4 space-y-2 bg-white">
      <div className="flex items-center gap-2">
        <StateBadge state={record.state} />
        <span className="text-xs text-stone-400">{record.supersededObjectType}</span>
      </div>
      <div className="text-sm text-stone-900">
        <span className="text-stone-500 line-through">
          {record.supersededObjectTitle || record.supersededObjectId}
        </span>
        <span className="mx-2 text-stone-400">&rarr;</span>
        <span className="font-medium">
          {record.successorObjectTitle || record.successorObjectId}
        </span>
      </div>
      <p className="text-xs text-stone-600">{record.rationale}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PANEL
// ═══════════════════════════════════════════════════════════════════════════════

export default function ResolutionPanel({ projectId, className = '' }: ResolutionPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('plans');

  const plansQuery = useResolutionPlans(projectId);
  const bundlesQuery = useResolutionBundles(projectId);
  const supersessionsQuery = useProjectSupersessions(projectId);
  const createBundleFromPlan = useCreateBundleFromPlan();

  const plans = plansQuery.data?.plans ?? [];
  const bundles = bundlesQuery.data?.bundles ?? [];
  const supersessions = supersessionsQuery.data?.supersessions ?? [];

  const activePlanCount = plans.filter((p: any) =>
    !['resolved_approved', 'superseded', 'cancelled'].includes(p.state)
  ).length;
  const activeBundleCount = bundles.filter((b: any) =>
    !['applied', 'cancelled', 'rejected'].includes(b.state)
  ).length;

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'plans', label: 'Plans', count: activePlanCount },
    { id: 'bundles', label: 'Bundles', count: activeBundleCount },
    { id: 'supersessions', label: 'Lineage', count: supersessions.length },
  ];

  const handleCreateBundle = (planId: string) => {
    createBundleFromPlan.mutate({ planId });
  };

  return (
    <div className={`flex flex-col h-full bg-stone-50 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-200 bg-white">
        <h3 className="text-sm font-semibold text-stone-900">Resolution</h3>
        <p className="text-xs text-stone-500 mt-0.5">
          Orchestrated resolution of conflicts, contradictions, and impact chains
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-200 bg-white px-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-stone-600 text-blue-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? 'bg-blue-100 text-stone-700' : 'bg-stone-100 text-stone-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeTab === 'plans' && (
          <>
            {plans.length === 0 && (
              <div className="text-center py-8 text-xs text-stone-400">
                No resolution plans for this project
              </div>
            )}
            {plans.map((plan: any) => (
              <ResolutionPlanCard
                key={plan.id}
                plan={plan}
                onCreateBundle={handleCreateBundle}
              />
            ))}
          </>
        )}

        {activeTab === 'bundles' && (
          <>
            {bundles.length === 0 && (
              <div className="text-center py-8 text-xs text-stone-400">
                No resolution bundles for this project
              </div>
            )}
            {bundles.map((bundle: any) => (
              <ResolutionBundleCard key={bundle.id} bundle={bundle} />
            ))}
          </>
        )}

        {activeTab === 'supersessions' && (
          <>
            {supersessions.length === 0 && (
              <div className="text-center py-8 text-xs text-stone-400">
                No supersession records for this project
              </div>
            )}
            {supersessions.map((record: any) => (
              <SupersessionCard key={record.id} record={record} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
