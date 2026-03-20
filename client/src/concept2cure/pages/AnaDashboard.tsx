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
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { RunButton, ExportButton } from '../components/ui/ActionButton';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = ['overview', 'intelligence', 'gaps', 'impact'] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  intelligence: 'Intelligence',
  gaps: 'Gap Analysis',
  impact: 'Change Impact',
};

const SUBMISSION_TYPES = ['IND', 'NDA', 'BLA', 'MAA', '510K', 'PMA'] as const;

const IMPACT_COLORS: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  guidance: <FileText className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />,
  approval: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />,
  alert: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />,
  warning_letter: <Shield className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />,
};

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.18, ease: 'easeOut' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AnaDashboard({ projectId }: AnaDashboardProps) {
  const [feed, setFeed] = useState<IntelFeedItem[]>([]);
  const [gapSummary, setGapSummary] = useState<GapSummary | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [submissionType, setSubmissionType] = useState('NDA');
  const [exporting, setExporting] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [feedRes, gapRes, usageRes] = await Promise.allSettled([
        fetch('/api/ana/intelligence-feed?limit=8').then(r => {
          if (!r.ok) throw new Error(`Feed: ${r.status}`);
          return r.json();
        }),
        fetch('/api/ana/gap-analysis', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...((() => { const t = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token'); return t ? { Authorization: `Bearer ${t}` } : {}; })()),
            'x-organization-id': localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1',
          },
          credentials: 'include',
          body: JSON.stringify({ submissionType, projectId }),
        }).then(r => {
          if (!r.ok) throw new Error(`Gaps: ${r.status}`);
          return r.json();
        }),
        fetch('/api/ana/platform/usage').then(r => {
          if (!r.ok) throw new Error(`Usage: ${r.status}`);
          return r.json();
        }),
      ]);

      if (feedRes.status === 'fulfilled' && feedRes.value?.items) {
        setFeed(feedRes.value.items);
      } else {
        setFeed([]);
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
            priority: i === 0 ? 'high' as const : i < 3 ? 'medium' as const : 'low' as const,
            category: 'optimization',
          }))
        );
      }

      // If all three failed, show error
      if (feedRes.status === 'rejected' && gapRes.status === 'rejected' && usageRes.status === 'rejected') {
        setError('Unable to load dashboard data. Please check your connection and try again.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [submissionType, projectId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = { feed, gapSummary, recommendations, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ana-dashboard-${submissionType}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const readinessColor = (score: number) =>
    score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-600';

  const readinessBg = (score: number) =>
    score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-50">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-violet-600" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900">Ana Dashboard</h1>
              <p className="text-xs text-zinc-500">Regulatory intelligence · Gap analysis · Change impact</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ExportButton
              label="Export"
              produces="Dashboard snapshot (JSON)"
              isLoading={exporting}
              onClick={handleExport}
              size="sm"
            />
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              aria-label="Refresh dashboard data"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 bg-zinc-100 rounded-md hover:bg-zinc-200 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-300 focus:ring-offset-1"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4" role="tablist" aria-label="Dashboard sections">
          {TABS.map(tab => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`tabpanel-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-violet-300 focus:ring-offset-1 ${
                activeTab === tab
                  ? 'bg-violet-100 text-violet-700'
                  : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto p-6"
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-busy={loading}
      >
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-6 h-6 animate-spin text-violet-400 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-zinc-500" role="status">Ana is analyzing your regulatory landscape...</p>
            </div>
          </div>
        ) : error ? (
          <motion.div {...fade} className="bg-red-50 border border-red-200 rounded-lg p-5 text-center">
            <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-red-700 mb-3">{error}</p>
            <button
              onClick={fetchDashboardData}
              className="text-xs font-medium text-red-600 hover:text-red-700 underline focus:outline-none focus:ring-2 focus:ring-red-300 rounded"
            >
              Try again
            </button>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} {...fade} className="space-y-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <>
                  {/* Quick Stats */}
                  <div className="grid grid-cols-4 gap-4">
                    {[
                      {
                        label: 'Readiness Score',
                        value: gapSummary ? `${gapSummary.readinessScore}%` : '—',
                        icon: <TrendingUp className="w-4 h-4" aria-hidden="true" />,
                        color: gapSummary ? readinessColor(gapSummary.readinessScore) : 'text-zinc-400',
                      },
                      {
                        label: 'Critical Alerts',
                        value: String(feed.filter(f => f.impact === 'critical').length),
                        icon: <AlertTriangle className="w-4 h-4" aria-hidden="true" />,
                        color: 'text-amber-600',
                      },
                      {
                        label: 'Gaps Remaining',
                        value: gapSummary ? String(gapSummary.missing + gapSummary.partial) : '—',
                        icon: <Activity className="w-4 h-4" aria-hidden="true" />,
                        color: 'text-red-600',
                      },
                      {
                        label: 'Recommendations',
                        value: String(recommendations.length),
                        icon: <Zap className="w-4 h-4" aria-hidden="true" />,
                        color: 'text-violet-600',
                      },
                    ].map((stat, i) => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.2 }}
                      >
                        <StatCard {...stat} />
                      </motion.div>
                    ))}
                  </div>

                  {/* Readiness Gauge */}
                  {gapSummary && (
                    <Card>
                      <div className="flex items-center justify-between mb-3">
                        <SectionLabel>{submissionType} Readiness</SectionLabel>
                        <select
                          value={submissionType}
                          onChange={e => setSubmissionType(e.target.value)}
                          aria-label="Submission type"
                          className="text-xs border border-zinc-200 rounded-md px-2 py-1 text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-200"
                        >
                          {SUBMISSION_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className={`text-3xl font-bold tabular-nums ${readinessColor(gapSummary.readinessScore)}`}>
                          {gapSummary.readinessScore}%
                        </div>
                        <div className="flex-1">
                          <div className="h-3 bg-zinc-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={gapSummary.readinessScore} aria-valuemin={0} aria-valuemax={100}>
                            <motion.div
                              className={`h-full ${readinessBg(gapSummary.readinessScore)} rounded-full`}
                              initial={{ width: 0 }}
                              animate={{ width: `${gapSummary.readinessScore}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                            />
                          </div>
                          <div className="flex justify-between mt-1.5 text-xs text-zinc-500">
                            <span>{gapSummary.completed} complete</span>
                            <span>{gapSummary.partial} partial</span>
                            <span>{gapSummary.missing} missing</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* Recent Intelligence */}
                  <Card>
                    <div className="flex items-center justify-between mb-3">
                      <SectionLabel>Latest Intelligence</SectionLabel>
                      <button
                        onClick={() => setActiveTab('intelligence')}
                        className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-300 rounded"
                      >
                        View all <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </div>
                    {feed.length > 0 ? (
                      <div className="space-y-2">
                        {feed.slice(0, 4).map((item, i) => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04, duration: 0.15 }}
                          >
                            <FeedCard item={item} />
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={Inbox}
                        title="No intelligence items yet"
                        description="Ana will surface regulatory updates here as they become available."
                      />
                    )}
                  </Card>

                  {/* Ana Recommendations */}
                  {recommendations.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.2 }}
                      className="bg-violet-50 rounded-lg border border-violet-200 p-5"
                    >
                      <h3 className="text-sm font-semibold text-violet-800 mb-3 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" aria-hidden="true" />
                        Ana Recommendations
                      </h3>
                      <div className="space-y-2">
                        {recommendations.map((rec, i) => (
                          <motion.div
                            key={rec.id}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.25 + i * 0.04 }}
                            className="flex items-start gap-2 text-sm text-violet-700"
                          >
                            <Pill text={rec.priority} className={
                              rec.priority === 'high'
                                ? 'bg-red-100 text-red-700'
                                : rec.priority === 'medium'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-zinc-100 text-zinc-600'
                            } />
                            <span>{rec.text}</span>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </>
              )}

              {/* Intelligence Tab */}
              {activeTab === 'intelligence' && (
                <>
                  <SectionLabel>Regulatory Intelligence Feed</SectionLabel>
                  {feed.length > 0 ? (
                    <div className="space-y-2">
                      {feed.map((item, i) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03, duration: 0.15 }}
                        >
                          <FeedCard item={item} />
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Inbox}
                      title="No intelligence items"
                      description="Regulatory feed will populate as Ana monitors FDA, EMA, and other agencies."
                    />
                  )}
                </>
              )}

              {/* Gaps Tab */}
              {activeTab === 'gaps' && (
                <>
                  <div className="flex items-center justify-between">
                    <SectionLabel>Submission Gap Analysis</SectionLabel>
                    <select
                      value={submissionType}
                      onChange={e => setSubmissionType(e.target.value)}
                      aria-label="Submission type for gap analysis"
                      className="text-xs border border-zinc-200 rounded-md px-2 py-1 text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    >
                      {SUBMISSION_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  {gapSummary ? (
                    <>
                      <div className="grid grid-cols-4 gap-4">
                        {[
                          { label: 'Total Required', value: String(gapSummary.totalRequired), icon: <FileText className="w-4 h-4" aria-hidden="true" />, color: 'text-zinc-600' },
                          { label: 'Completed', value: String(gapSummary.completed), icon: <CheckCircle2 className="w-4 h-4" aria-hidden="true" />, color: 'text-emerald-600' },
                          { label: 'Partial', value: String(gapSummary.partial), icon: <Clock className="w-4 h-4" aria-hidden="true" />, color: 'text-amber-600' },
                          { label: 'Missing', value: String(gapSummary.missing), icon: <AlertTriangle className="w-4 h-4" aria-hidden="true" />, color: 'text-red-600' },
                        ].map((stat, i) => (
                          <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05, duration: 0.2 }}
                          >
                            <StatCard {...stat} />
                          </motion.div>
                        ))}
                      </div>

                      {/* Stacked bar breakdown */}
                      <Card>
                        <SectionLabel>Section Status Breakdown</SectionLabel>
                        <div className="mt-3 h-6 flex rounded-full overflow-hidden bg-zinc-100" role="img" aria-label={`${gapSummary.completed} complete, ${gapSummary.partial} partial, ${gapSummary.missing} missing out of ${gapSummary.totalRequired} total`}>
                          {gapSummary.completed > 0 && (
                            <motion.div
                              className="bg-emerald-500 h-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${(gapSummary.completed / gapSummary.totalRequired) * 100}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut' }}
                            />
                          )}
                          {gapSummary.partial > 0 && (
                            <motion.div
                              className="bg-amber-400 h-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${(gapSummary.partial / gapSummary.totalRequired) * 100}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                            />
                          )}
                          {gapSummary.missing > 0 && (
                            <motion.div
                              className="bg-red-400 h-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${(gapSummary.missing / gapSummary.totalRequired) * 100}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                            />
                          )}
                        </div>
                        <div className="flex gap-4 mt-3 text-xs text-zinc-500">
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Complete</span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Partial</span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" />Missing</span>
                        </div>
                      </Card>
                    </>
                  ) : (
                    <EmptyState
                      icon={Search}
                      title="No gap analysis data"
                      description="Select a submission type above to run gap analysis."
                    />
                  )}
                </>
              )}

              {/* Impact Tab */}
              {activeTab === 'impact' && (
                <>
                  <SectionLabel>Regulatory Change Impact</SectionLabel>
                  <Card>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                        <Search className="w-5 h-5 text-blue-500" aria-hidden="true" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-zinc-800 mb-1">Assess Regulatory Changes</h3>
                        <p className="text-sm text-zinc-500 mb-4">
                          Ana monitors regulatory guidance changes across FDA, EMA, PMDA, and TGA — and assesses
                          their impact on your active submissions in real time.
                        </p>
                        <div className="flex gap-2">
                          <RunButton
                            label="Run Impact Analysis"
                            produces="Impact assessment report"
                            onClick={() => {/* Navigate to change-impact workspace */}}
                            size="sm"
                          />
                          <ExportButton
                            label="Export History"
                            produces="Change impact history (JSON)"
                            onClick={handleExport}
                            isLoading={exporting}
                            size="sm"
                          />
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* Recent changes preview */}
                  {feed.filter(f => f.type === 'guidance').length > 0 && (
                    <Card>
                      <SectionLabel>Recent Guidance Changes</SectionLabel>
                      <div className="space-y-2 mt-2">
                        {feed.filter(f => f.type === 'guidance').slice(0, 3).map(item => (
                          <FeedCard key={item.id} item={item} />
                        ))}
                      </div>
                    </Card>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

// ─── Shared Sub-components ────────────────────────────────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-zinc-100 rounded-lg p-5 ${className || ''}`}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{children}</p>;
}

function Pill({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full shrink-0 ${className || ''}`}>
      {text}
    </span>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-100 py-12 text-center">
      <Icon className="w-8 h-8 text-zinc-300 mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="text-xs text-zinc-400 mt-1">{description}</p>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500">{label}</span>
        <span className={color}>{icon}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function FeedCard({ item }: { item: IntelFeedItem }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50/50 transition-all duration-150 cursor-default">
      <div className="mt-0.5">{TYPE_ICONS[item.type] || TYPE_ICONS.guidance}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-zinc-800 truncate">{item.title}</span>
          <Pill
            text={item.impact}
            className={IMPACT_COLORS[item.impact] || IMPACT_COLORS.medium}
          />
        </div>
        <p className="text-xs text-zinc-500 line-clamp-1">{item.summary}</p>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400">
          <span>{item.agency}</span>
          <span aria-hidden="true">·</span>
          <span>{item.date}</span>
        </div>
      </div>
    </div>
  );
}
