/**
 * Intelligence Dashboard Page — Unified Intelligence Command Center
 *
 * Displays all intelligence signals for the active project:
 *   - Readiness Score (4-dimension gauge)
 *   - Next Best Actions (ranked action list)
 *   - Recommendations (severity-coded cards)
 *   - Cross-Module Insights
 *   - Project Intelligence Profile
 *   - Feedback Loop Summary
 *
 * Uses enterprise UI primitives for design consistency.
 *
 * @module concept2cure/pages/IntelligenceDashboardPage
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  GitBranch,
  Lightbulb,
  ListChecks,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  useIntelligenceDashboard,
  useSubmitFeedback,
  type Recommendation,
  type NextAction,
  type CrossModuleInsight,
  type IntelligenceDashboard,
} from '@/concept2cure/hooks/useIntelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type TabKey = 'overview' | 'actions' | 'recommendations' | 'crossmodule' | 'profile';

interface Tab {
  key: TabKey;
  label: string;
  icon: React.ElementType;
}

interface IntelligenceDashboardPageProps {
  projectId: number | string | null;
  onBack?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const TABS: Tab[] = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'actions', label: 'Next Actions', icon: Zap },
  { key: 'recommendations', label: 'Recommendations', icon: Lightbulb },
  { key: 'crossmodule', label: 'Cross-Module', icon: GitBranch },
  { key: 'profile', label: 'Intelligence Profile', icon: Brain },
];

const SEVERITY_STYLES: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', border: 'border-red-200' },
  high: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' },
  medium: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', border: 'border-blue-200' },
  low: { bg: 'bg-zinc-50', text: 'text-zinc-600', dot: 'bg-zinc-400', border: 'border-zinc-200' },
};

const URGENCY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  immediate: { bg: 'bg-red-100', text: 'text-red-700', label: 'Immediate' },
  this_week: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'This Week' },
  this_sprint: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'This Sprint' },
  backlog: { bg: 'bg-zinc-100', text: 'text-zinc-600', label: 'Backlog' },
};

const TREND_ICONS: Record<string, React.ElementType> = {
  improving: TrendingUp,
  stable: Activity,
  declining: TrendingDown,
};

const TREND_COLORS: Record<string, string> = {
  improving: 'text-emerald-600',
  stable: 'text-zinc-500',
  declining: 'text-red-600',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function IntelligenceDashboardPage({
  projectId,
  onBack,
}: IntelligenceDashboardPageProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const { data: dashboard, isLoading, error, refetch } = useIntelligenceDashboard(projectId);
  const submitFeedback = useSubmitFeedback(projectId);

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Brain className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Select a project to view intelligence dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#FAFAF9]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-200 bg-white">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Intelligence Dashboard</h1>
            <p className="text-xs text-zinc-500">Predictive decision-support for your project</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {dashboard?.generatedAt && (
            <span className="text-xs text-zinc-400">
              Updated {new Date(dashboard.generatedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 pt-3 pb-0 bg-white border-b border-zinc-200">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
                isActive
                  ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-zinc-300 mx-auto mb-3 animate-spin" />
              <p className="text-sm text-zinc-500">Analyzing project intelligence...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-700">Failed to load intelligence data</p>
            <button
              onClick={() => refetch()}
              className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
            >
              Try again
            </button>
          </div>
        )}

        {dashboard && !isLoading && (
          <>
            {activeTab === 'overview' && <OverviewTab dashboard={dashboard} />}
            {activeTab === 'actions' && <ActionsTab dashboard={dashboard} />}
            {activeTab === 'recommendations' && (
              <RecommendationsTab
                dashboard={dashboard}
                onFeedback={(recId, recType, action) => {
                  submitFeedback.mutate({
                    recommendationId: recId,
                    recommendationType: recType,
                    action,
                  });
                }}
              />
            )}
            {activeTab === 'crossmodule' && <CrossModuleTab dashboard={dashboard} />}
            {activeTab === 'profile' && <ProfileTab dashboard={dashboard} />}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════

function OverviewTab({ dashboard }: { dashboard: IntelligenceDashboard }) {
  const readiness = dashboard.readiness;
  const recs = dashboard.recommendations;
  const actions = dashboard.nextActions;
  const crossModule = dashboard.crossModule;
  const feedback = dashboard.feedbackSummary;

  return (
    <div className="space-y-6">
      {/* Top metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Readiness Score */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Readiness</span>
          </div>
          <div className="flex items-end gap-2">
            <span className={cn(
              'text-3xl font-bold',
              (readiness?.overallScore ?? 0) >= 75 ? 'text-emerald-600'
                : (readiness?.overallScore ?? 0) >= 50 ? 'text-amber-600'
                : 'text-red-600',
            )}>
              {readiness?.overallScore ?? '—'}
            </span>
            <span className="text-sm text-zinc-400 pb-1">/ 100</span>
          </div>
          {readiness?.trend && (
            <div className={cn('flex items-center gap-1 mt-2 text-xs', TREND_COLORS[readiness.trend.direction])}>
              {React.createElement(TREND_ICONS[readiness.trend.direction] ?? Activity, { className: 'w-3 h-3' })}
              <span className="capitalize">{readiness.trend.direction}</span>
              {readiness.trend.delta !== 0 && (
                <span>({readiness.trend.delta > 0 ? '+' : ''}{readiness.trend.delta.toFixed(1)})</span>
              )}
            </div>
          )}
        </div>

        {/* Approval Probability */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Approval Prob.</span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-zinc-900">
              {readiness?.predictions?.approvalProbability ?? '—'}%
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            Est. {readiness?.predictions?.estimatedReviewDays ?? '—'} day review
          </p>
        </div>

        {/* Active Recommendations */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Recommendations</span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-zinc-900">{recs?.totalGenerated ?? 0}</span>
          </div>
          {recs && (recs.bySeverity.critical > 0 || recs.bySeverity.high > 0) && (
            <div className="flex items-center gap-2 mt-2">
              {recs.bySeverity.critical > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                  {recs.bySeverity.critical} critical
                </span>
              )}
              {recs.bySeverity.high > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  {recs.bySeverity.high} high
                </span>
              )}
            </div>
          )}
        </div>

        {/* Cross-Module Issues */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="w-4 h-4 text-violet-500" />
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Cross-Module</span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-zinc-900">{crossModule?.totalInsights ?? 0}</span>
            <span className="text-sm text-zinc-400 pb-1">issues</span>
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            {crossModule?.documentsCovered ?? 0} documents analyzed
          </p>
        </div>
      </div>

      {/* Readiness Dimensions */}
      {readiness?.dimensions && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-4">Readiness Dimensions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(Object.entries(readiness.dimensions) as [string, number][]).map(([key, value]) => (
              <div key={key} className="text-center">
                <div className="relative w-16 h-16 mx-auto mb-2">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e4e4e7" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15.5" fill="none"
                      stroke={value >= 75 ? '#059669' : value >= 50 ? '#d97706' : '#dc2626'}
                      strokeWidth="3"
                      strokeDasharray={`${(value / 100) * 97.4} 97.4`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-zinc-900">
                    {value}
                  </span>
                </div>
                <p className="text-xs font-medium text-zinc-600 capitalize">{key}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top 3 Next Actions */}
      {actions && actions.actions.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-900">Top Next Actions</h3>
            <span className="text-xs text-zinc-400">{actions.totalActions} total</span>
          </div>
          <div className="space-y-2">
            {actions.actions.slice(0, 3).map(action => (
              <ActionRow key={action.actionId} action={action} />
            ))}
          </div>
        </div>
      )}

      {/* Feedback Loop Stats */}
      {feedback && feedback.totalFeedback > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-4">Learning Loop</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-zinc-900">{feedback.acceptanceRate}%</p>
              <p className="text-xs text-zinc-500">Acceptance Rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900">{feedback.resolutionRate}%</p>
              <p className="text-xs text-zinc-500">Resolution Rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900">{feedback.totalFeedback}</p>
              <p className="text-xs text-zinc-500">Total Feedback</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900">
                {feedback.averageTimeToAction ? `${Math.round(feedback.averageTimeToAction / 60)}m` : '—'}
              </p>
              <p className="text-xs text-zinc-500">Avg. Time to Act</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: NEXT ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function ActionsTab({ dashboard }: { dashboard: IntelligenceDashboard }) {
  const actions = dashboard.nextActions;

  if (!actions || actions.actions.length === 0) {
    return (
      <EmptyState
        icon={<Zap className="w-10 h-10 text-zinc-300" />}
        title="No actions needed"
        description="Your project looks great — no immediate actions recommended."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Next Best Actions</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Ranked by urgency, impact, and effort — readiness score: {actions.readinessScore}/100
          </p>
        </div>
        {actions.topCategory && (
          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium capitalize">
            Top focus: {actions.topCategory.replace(/_/g, ' ')}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {actions.actions.map(action => (
          <ActionRow key={action.actionId} action={action} expanded />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════════

function RecommendationsTab({
  dashboard,
  onFeedback,
}: {
  dashboard: IntelligenceDashboard;
  onFeedback: (recId: string, recType: string, action: 'accepted' | 'dismissed') => void;
}) {
  const recs = dashboard.recommendations;
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');

  const filtered = useMemo(() => {
    if (!recs) return [];
    if (filter === 'all') return recs.recommendations;
    return recs.recommendations.filter(r => r.severity === filter);
  }, [recs, filter]);

  if (!recs || recs.recommendations.length === 0) {
    return (
      <EmptyState
        icon={<Lightbulb className="w-10 h-10 text-zinc-300" />}
        title="No recommendations"
        description="No recommendations generated for this project yet."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Recommendations</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {recs.totalGenerated} total — {recs.bySource.rules_based} rules, {recs.bySource.ai_inferred} AI-inferred
          </p>
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-lg transition-colors',
                filter === f
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:bg-zinc-100',
              )}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && ` (${recs.bySeverity[f]})`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(rec => (
          <RecommendationCard
            key={rec.recommendationId}
            rec={rec}
            onAccept={() => onFeedback(rec.recommendationId, rec.type, 'accepted')}
            onDismiss={() => onFeedback(rec.recommendationId, rec.type, 'dismissed')}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: CROSS-MODULE
// ═══════════════════════════════════════════════════════════════════════════════

function CrossModuleTab({ dashboard }: { dashboard: IntelligenceDashboard }) {
  const report = dashboard.crossModule;

  if (!report || report.insights.length === 0) {
    return (
      <EmptyState
        icon={<GitBranch className="w-10 h-10 text-zinc-300" />}
        title="No cross-module issues"
        description="No inconsistencies or dependency issues detected across your documents."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Cross-Module Analysis</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {report.totalInsights} issues across {report.documentsCovered} documents
          </p>
        </div>
        <div className="flex items-center gap-2">
          {report.bySeverity.critical > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
              {report.bySeverity.critical} critical
            </span>
          )}
          {report.bySeverity.high > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              {report.bySeverity.high} high
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {report.insights.map(insight => (
          <CrossModuleInsightCard key={insight.insightId} insight={insight} />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: INTELLIGENCE PROFILE
// ═══════════════════════════════════════════════════════════════════════════════

function ProfileTab({ dashboard }: { dashboard: IntelligenceDashboard }) {
  const profile = dashboard.profile;

  if (!profile) {
    return (
      <EmptyState
        icon={<Brain className="w-10 h-10 text-zinc-300" />}
        title="No intelligence profile"
        description="Upload documents and interact with AnA to build your project's intelligence profile."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Project Intelligence Profile</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          {profile.memoryEntryCount} memory entries — {profile.documentStats.totalIngested} documents ingested
        </p>
      </div>

      {/* Strategy & Context */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ProfileField label="Regulatory Strategy" value={profile.regulatoryStrategy} />
        <ProfileField label="Target Indication" value={profile.targetIndication} />
        <ProfileField label="Target Population" value={profile.targetPopulation} />
      </div>

      {/* Risk Factors */}
      {profile.riskFactors.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Risk Factors ({profile.riskFactors.length})
          </h3>
          <div className="space-y-2">
            {profile.riskFactors.map((risk, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-zinc-100 last:border-0">
                <span className={cn(
                  'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                  risk.impact === 'critical' ? 'bg-red-500'
                    : risk.impact === 'high' ? 'bg-amber-500'
                    : 'bg-blue-500',
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-900">{risk.risk}</p>
                  {risk.mitigation && (
                    <p className="text-xs text-zinc-500 mt-0.5">Mitigation: {risk.mitigation}</p>
                  )}
                </div>
                <span className="text-xs text-zinc-400 capitalize flex-shrink-0">{risk.impact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Open Questions */}
      {profile.openQuestions.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-500" />
            Open Questions ({profile.openQuestions.length})
          </h3>
          <div className="space-y-2">
            {profile.openQuestions.map((q, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-zinc-100 last:border-0">
                <span className="text-xs font-mono text-zinc-400 mt-0.5">Q{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm text-zinc-900">{q.question}</p>
                  {q.context && <p className="text-xs text-zinc-500 mt-0.5">{q.context}</p>}
                </div>
                {q.priority && (
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0',
                    q.priority === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-600',
                  )}>
                    {q.priority}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Decisions */}
      {profile.keyDecisions.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Key Decisions ({profile.keyDecisions.length})
          </h3>
          <div className="space-y-2">
            {profile.keyDecisions.map((d, i) => (
              <div key={i} className="py-2 border-b border-zinc-100 last:border-0">
                <p className="text-sm text-zinc-900 font-medium">{d.decision}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{d.rationale}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-zinc-400">{d.date}</span>
                  {d.source && <span className="text-xs text-zinc-400">• {d.source}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Learned Insights */}
      {profile.learnedInsights.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            Learned Insights ({profile.learnedInsights.length})
          </h3>
          <div className="space-y-2">
            {profile.learnedInsights.map((ins, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-zinc-100 last:border-0">
                <div className="flex-1">
                  <p className="text-sm text-zinc-900">{ins.insight}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-zinc-400">{ins.source}</span>
                    <span className="text-xs text-zinc-400">• {Math.round(ins.confidence * 100)}% confidence</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function ActionRow({ action, expanded }: { action: NextAction; expanded?: boolean }) {
  const urgency = URGENCY_STYLES[action.urgency] ?? URGENCY_STYLES.backlog;

  return (
    <div className="flex items-start gap-3 bg-white rounded-xl border border-zinc-200 shadow-sm p-4 hover:border-zinc-300 transition-colors">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 text-blue-600 font-bold text-xs flex-shrink-0">
        #{action.rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 leading-snug">{action.title}</p>
        {expanded && (
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{action.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', urgency.bg, urgency.text)}>
            {urgency.label}
          </span>
          <span className="text-xs text-zinc-400 capitalize">
            {action.impactEstimate} impact
          </span>
          <span className="text-xs text-zinc-400">•</span>
          <span className="text-xs text-zinc-400 capitalize">
            {action.effortEstimate} effort
          </span>
          <span className="text-xs text-zinc-400">•</span>
          <span className="text-xs text-zinc-400 capitalize">
            {action.category.replace(/_/g, ' ')}
          </span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-300 flex-shrink-0 mt-1" />
    </div>
  );
}

function RecommendationCard({
  rec,
  onAccept,
  onDismiss,
}: {
  rec: Recommendation;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const style = SEVERITY_STYLES[rec.severity] ?? SEVERITY_STYLES.medium;

  return (
    <div className={cn('rounded-xl border shadow-sm p-4', style.border, 'bg-white')}>
      <div className="flex items-start gap-3">
        <span className={cn('w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0', style.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', style.bg, style.text)}>
              {rec.severity}
            </span>
            <span className="text-xs text-zinc-400 capitalize">{rec.type.replace(/_/g, ' ')}</span>
            {rec.confidence !== null && (
              <span className="text-xs text-zinc-400">{rec.confidence}% confidence</span>
            )}
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full font-medium',
              rec.sourceType === 'rules_based' ? 'bg-zinc-100 text-zinc-600'
                : rec.sourceType === 'ai_inferred' ? 'bg-violet-100 text-violet-700'
                : 'bg-blue-100 text-blue-700',
            )}>
              {rec.sourceType === 'rules_based' ? 'Rules' : rec.sourceType === 'ai_inferred' ? 'AI' : 'Validation'}
            </span>
          </div>
          <p className="text-sm text-zinc-900">{rec.reason}</p>
          <p className="text-xs text-zinc-500 mt-1">
            <Sparkles className="w-3 h-3 inline mr-1" />
            {rec.suggestedAction}
          </p>
          {rec.evidence.length > 0 && (
            <div className="flex items-center gap-1 mt-2">
              <FileText className="w-3 h-3 text-zinc-400" />
              <span className="text-xs text-zinc-400">
                {rec.evidence.map(e => e.sourceTitle).join(', ')}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onAccept}
            className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 transition-colors"
            title="Accept recommendation"
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 transition-colors"
            title="Dismiss recommendation"
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CrossModuleInsightCard({ insight }: { insight: CrossModuleInsight }) {
  const style = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.medium;

  return (
    <div className={cn('rounded-xl border shadow-sm p-4', style.border, 'bg-white')}>
      <div className="flex items-start gap-3">
        <span className={cn('w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0', style.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', style.bg, style.text)}>
              {insight.severity}
            </span>
            <span className="text-xs text-zinc-400 capitalize">{insight.type.replace(/_/g, ' ')}</span>
          </div>
          <p className="text-sm text-zinc-900">{insight.description}</p>
          <p className="text-xs text-zinc-500 mt-1">
            <ArrowRight className="w-3 h-3 inline mr-1" />
            {insight.suggestedResolution}
          </p>
          <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
            <FileText className="w-3 h-3" />
            <span>{insight.sourceDocumentTitle}</span>
            <ArrowRight className="w-3 h-3" />
            <span>{insight.targetDocumentTitle}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4">
      <p className="text-xs font-medium text-zinc-500 mb-1">{label}</p>
      <p className="text-sm text-zinc-900">{value || '—'}</p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        {icon}
        <h3 className="text-sm font-semibold text-zinc-900 mt-3">{title}</h3>
        <p className="text-xs text-zinc-500 mt-1 max-w-xs">{description}</p>
      </div>
    </div>
  );
}
