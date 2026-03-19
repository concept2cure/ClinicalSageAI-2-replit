/**
 * Ana Dashboard — Unified regulatory intelligence command surface
 *
 * Brings together Ana's three core capabilities:
 * 1. Regulatory Intelligence Feed (latest guidance, approvals, alerts)
 * 2. Submission Gap Analysis (readiness scoring across submission types)
 * 3. Change Impact Analysis (assess regulatory changes on submissions)
 *
 * Plus: Ana memory, usage analysis, and platform optimization.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';

interface AnaDashboardProps {
  projectId?: number | null;
}

interface IntelFeedItem {
  id: string;
  title: string;
  type: 'guidance' | 'approval' | 'alert' | 'warning_letter';
  agency: string;
  impact: 'critical' | 'high' | 'medium';
  date: string;
  summary: string;
}

interface GapSummary {
  submissionType: string;
  readinessScore: number;
  totalRequired: number;
  completed: number;
  partial: number;
  missing: number;
}

interface Recommendation {
  id: string;
  text: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
}

const IMPACT_COLORS = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
};

const TYPE_ICONS = {
  guidance: <FileText className="w-3.5 h-3.5" />,
  approval: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  alert: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
  warning_letter: <Shield className="w-3.5 h-3.5 text-red-500" />,
};

export default function AnaDashboard({ projectId }: AnaDashboardProps) {
  const [feed, setFeed] = useState<IntelFeedItem[]>([]);
  const [gapSummary, setGapSummary] = useState<GapSummary | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'intelligence' | 'gaps' | 'impact'>('overview');
  const [submissionType, setSubmissionType] = useState('NDA');

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [feedRes, gapRes, usageRes] = await Promise.allSettled([
        fetch('/api/ana/intelligence-feed?limit=8').then(r => r.json()),
        fetch('/api/ana/gap-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionType, projectId }),
        }).then(r => r.json()),
        fetch('/api/ana/platform/usage').then(r => r.json()),
      ]);

      if (feedRes.status === 'fulfilled' && feedRes.value?.items) {
        setFeed(feedRes.value.items);
      }

      if (gapRes.status === 'fulfilled' && gapRes.value) {
        const g = gapRes.value;
        setGapSummary({
          submissionType,
          readinessScore: g.readinessScore ?? 0,
          totalRequired: g.totalRequired ?? 0,
          completed: g.completed ?? 0,
          partial: g.partial ?? 0,
          missing: g.missing ?? 0,
        });
      }

      if (usageRes.status === 'fulfilled' && usageRes.value?.result?.recommendations) {
        setRecommendations(
          usageRes.value.result.recommendations.map((text: string, i: number) => ({
            id: `rec-${i}`,
            text,
            priority: i === 0 ? 'high' : i < 3 ? 'medium' : 'low',
            category: 'optimization',
          }))
        );
      }
    } catch {
      // Dashboard should degrade gracefully
    } finally {
      setLoading(false);
    }
  }, [submissionType, projectId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const readinessColor = (score: number) =>
    score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-600';

  const readinessBg = (score: number) =>
    score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-50">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900">Ana Dashboard</h1>
              <p className="text-xs text-zinc-500">Regulatory intelligence · Gap analysis · Change impact</p>
            </div>
          </div>
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 bg-zinc-100 rounded-md hover:bg-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {(['overview', 'intelligence', 'gaps', 'impact'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-violet-100 text-violet-700'
                  : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-6 h-6 animate-spin text-violet-400 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">Ana is analyzing your regulatory landscape...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <>
                {/* Quick Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <StatCard
                    label="Readiness Score"
                    value={gapSummary ? `${gapSummary.readinessScore}%` : '—'}
                    icon={<TrendingUp className="w-4 h-4" />}
                    color={gapSummary ? readinessColor(gapSummary.readinessScore) : 'text-zinc-400'}
                  />
                  <StatCard
                    label="Active Alerts"
                    value={String(feed.filter(f => f.impact === 'critical').length)}
                    icon={<AlertTriangle className="w-4 h-4" />}
                    color="text-amber-600"
                  />
                  <StatCard
                    label="Gaps Remaining"
                    value={gapSummary ? String(gapSummary.missing + gapSummary.partial) : '—'}
                    icon={<Activity className="w-4 h-4" />}
                    color="text-red-600"
                  />
                  <StatCard
                    label="Recommendations"
                    value={String(recommendations.length)}
                    icon={<Zap className="w-4 h-4" />}
                    color="text-violet-600"
                  />
                </div>

                {/* Readiness Gauge */}
                {gapSummary && (
                  <div className="bg-white rounded-lg border border-zinc-200 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-zinc-800">{submissionType} Readiness</h3>
                      <select
                        value={submissionType}
                        onChange={e => setSubmissionType(e.target.value)}
                        className="text-xs border border-zinc-200 rounded-md px-2 py-1 text-zinc-600"
                      >
                        {['IND', 'NDA', 'BLA', 'MAA', '510K', 'PMA'].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`text-3xl font-bold ${readinessColor(gapSummary.readinessScore)}`}>
                        {gapSummary.readinessScore}%
                      </div>
                      <div className="flex-1">
                        <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${readinessBg(gapSummary.readinessScore)} rounded-full transition-all duration-700`}
                            style={{ width: `${gapSummary.readinessScore}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1.5 text-xs text-zinc-500">
                          <span>{gapSummary.completed} complete</span>
                          <span>{gapSummary.partial} partial</span>
                          <span>{gapSummary.missing} missing</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent Intelligence */}
                <div className="bg-white rounded-lg border border-zinc-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-zinc-800">Latest Intelligence</h3>
                    <button
                      onClick={() => setActiveTab('intelligence')}
                      className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1"
                    >
                      View all <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {feed.slice(0, 4).map(item => (
                      <FeedCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>

                {/* Ana Recommendations */}
                {recommendations.length > 0 && (
                  <div className="bg-violet-50 rounded-lg border border-violet-200 p-5">
                    <h3 className="text-sm font-semibold text-violet-800 mb-3 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      Ana Recommendations
                    </h3>
                    <div className="space-y-2">
                      {recommendations.map(rec => (
                        <div key={rec.id} className="flex items-start gap-2 text-sm text-violet-700">
                          <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>{rec.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Intelligence Tab */}
            {activeTab === 'intelligence' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-800">Regulatory Intelligence Feed</h3>
                {feed.map(item => (
                  <FeedCard key={item.id} item={item} />
                ))}
                {feed.length === 0 && (
                  <p className="text-sm text-zinc-400 py-8 text-center">No intelligence items available</p>
                )}
              </div>
            )}

            {/* Gaps Tab */}
            {activeTab === 'gaps' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-800">Submission Gap Analysis</h3>
                  <select
                    value={submissionType}
                    onChange={e => setSubmissionType(e.target.value)}
                    className="text-xs border border-zinc-200 rounded-md px-2 py-1 text-zinc-600"
                  >
                    {['IND', 'NDA', 'BLA', 'MAA', '510K', 'PMA'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                {gapSummary && (
                  <div className="grid grid-cols-4 gap-4">
                    <StatCard label="Total Required" value={String(gapSummary.totalRequired)} icon={<FileText className="w-4 h-4" />} color="text-zinc-600" />
                    <StatCard label="Completed" value={String(gapSummary.completed)} icon={<CheckCircle2 className="w-4 h-4" />} color="text-emerald-600" />
                    <StatCard label="Partial" value={String(gapSummary.partial)} icon={<Clock className="w-4 h-4" />} color="text-amber-600" />
                    <StatCard label="Missing" value={String(gapSummary.missing)} icon={<AlertTriangle className="w-4 h-4" />} color="text-red-600" />
                  </div>
                )}
                <p className="text-xs text-zinc-400">
                  Use the Submission Gap Analysis workspace for detailed section-by-section analysis.
                </p>
              </div>
            )}

            {/* Impact Tab */}
            {activeTab === 'impact' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-zinc-800">Regulatory Change Impact</h3>
                <p className="text-sm text-zinc-500">
                  Ana monitors regulatory guidance changes and assesses their impact on your active submissions.
                  Use the Change Impact workspace for detailed analysis.
                </p>
                <button
                  onClick={() => {/* Would navigate to change-impact */}}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
                >
                  <Search className="w-4 h-4" />
                  Run Impact Analysis
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500">{label}</span>
        <span className={color}>{icon}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function FeedCard({ item }: { item: IntelFeedItem }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-zinc-100 hover:border-zinc-200 transition-colors">
      <div className="mt-0.5">{TYPE_ICONS[item.type]}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-zinc-800 truncate">{item.title}</span>
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${IMPACT_COLORS[item.impact]}`}>
            {item.impact}
          </span>
        </div>
        <p className="text-xs text-zinc-500 line-clamp-1">{item.summary}</p>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400">
          <span>{item.agency}</span>
          <span>·</span>
          <span>{item.date}</span>
        </div>
      </div>
    </div>
  );
}
