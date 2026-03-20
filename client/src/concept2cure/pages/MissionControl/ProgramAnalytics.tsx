/**
 * @fileoverview Program Analytics Dashboard — Readiness radar, artifact lifecycle,
 * risk trend, activity timeline, and blocker analysis for a regulatory program.
 * @module concept2cure/pages/MissionControl/ProgramAnalytics
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import NanoBananaImageGenerator from '@/components/NanoBananaImageGenerator';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  FileText,
  Activity,
  Clock,
  Target,
  ArrowRight,
  ChevronRight,
  Layers,
  Lock,
  Upload,
  Edit3,
  Eye,
  Zap,
  Users,
  Beaker,
  Building2,
  Scale,
  CalendarDays,
  RefreshCw,
  XCircle,
  Info,
} from 'lucide-react';
import {
  useReadiness,
  useArtifacts,
  useRisks,
  useProvenance,
} from '../../hooks/useMissionControl';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

interface ProgramAnalyticsProps {
  programId: number | null;
}

type DateRange = '7d' | '30d' | '90d' | 'all';

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  '7d': '7 Days',
  '30d': '30 Days',
  '90d': '90 Days',
  all: 'All Time',
};

const READINESS_DIMENSIONS = [
  { key: 'artifact', label: 'Artifact', icon: FileText },
  { key: 'evidence', label: 'Evidence', icon: Beaker },
  { key: 'review', label: 'Review', icon: Eye },
  { key: 'approval', label: 'Approval', icon: CheckCircle2 },
  { key: 'consistency', label: 'Consistency', icon: Layers },
  { key: 'routeFit', label: 'Route-Fit', icon: Target },
  { key: 'authority', label: 'Authority', icon: Scale },
  { key: 'compliance', label: 'Compliance', icon: ShieldAlert },
  { key: 'timeline', label: 'Timeline', icon: Clock },
] as const;

const LIFECYCLE_STATES = [
  { key: 'planned', label: 'Planned', color: 'bg-zinc-400' },
  { key: 'drafting', label: 'Drafting', color: 'bg-blue-500' },
  { key: 'in-review', label: 'In Review', color: 'bg-amber-500' },
  { key: 'approved', label: 'Approved', color: 'bg-emerald-500' },
  { key: 'locked', label: 'Locked', color: 'bg-violet-500' },
  { key: 'exported', label: 'Exported', color: 'bg-indigo-500' },
] as const;

const DOSSIER_MODULES = [
  { key: '1', label: 'Module 1 — Administrative' },
  { key: '2', label: 'Module 2 — Summaries' },
  { key: '3', label: 'Module 3 — Quality' },
  { key: '4', label: 'Module 4 — Nonclinical' },
  { key: '5', label: 'Module 5 — Clinical' },
] as const;

const RISK_CATEGORIES = [
  { key: 'regulatory', label: 'Regulatory', icon: Scale },
  { key: 'clinical', label: 'Clinical', icon: Beaker },
  { key: 'manufacturing', label: 'Manufacturing', icon: Building2 },
  { key: 'timeline', label: 'Timeline', icon: CalendarDays },
  { key: 'resource', label: 'Resource', icon: Users },
] as const;

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  low: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
};

const ACTION_ICONS: Record<string, typeof Activity> = {
  create: Edit3,
  update: RefreshCw,
  approve: CheckCircle2,
  review: Eye,
  transition: ArrowRight,
  upload: Upload,
  delete: XCircle,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: filter provenance entries by date range
// ═══════════════════════════════════════════════════════════════════════════════

function filterByRange<T extends { createdAt?: string; timestamp?: string }>(
  items: T[],
  range: DateRange,
): T[] {
  if (range === 'all') return items;
  const now = Date.now();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cutoff = now - days * 86_400_000;
  return items.filter((item) => {
    const ts = item.createdAt || item.timestamp;
    return ts ? new Date(ts).getTime() >= cutoff : true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: relative time string
// ═══════════════════════════════════════════════════════════════════════════════

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const ProgramAnalytics: React.FC<ProgramAnalyticsProps> = ({ programId }) => {
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  // Data hooks
  const { data: readiness, isLoading: loadingReadiness } = useReadiness(programId);
  const { data: artifacts = [], isLoading: loadingArtifacts } = useArtifacts(programId);
  const { data: risks = [], isLoading: loadingRisks } = useRisks(programId);
  const { data: provenance = [], isLoading: loadingProvenance } = useProvenance(programId, { limit: 100 });

  // ─── Derived metrics ──────────────────────────────────────────────────────

  const overallReadiness = useMemo(() => {
    if (!readiness) return null;
    const dims = readiness.dimensions || readiness;
    const scores = READINESS_DIMENSIONS.map((d) => {
      const val = dims[d.key];
      return typeof val === 'number' ? val : 0;
    });
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [readiness]);

  const readinessTrend = useMemo(() => {
    if (!readiness?.previousOverall || overallReadiness === null) return 0;
    return overallReadiness - readiness.previousOverall;
  }, [readiness, overallReadiness]);

  const artifactStats = useMemo(() => {
    const total = artifacts.length;
    const approved = artifacts.filter(
      (a: any) => a.lifecycle === 'approved' || a.lifecycle === 'locked' || a.lifecycle === 'exported',
    ).length;
    return { total, approved };
  }, [artifacts]);

  const riskStats = useMemo(() => {
    const open = risks.filter((r: any) => r.status === 'open' || r.status === 'mitigating');
    const bySeverity: Record<string, number> = {};
    open.forEach((r: any) => {
      bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
    });
    const mitigated = risks.filter((r: any) => r.status === 'mitigated' || r.status === 'closed');
    return { openCount: open.length, bySeverity, mitigatedCount: mitigated.length };
  }, [risks]);

  const activityCount = useMemo(() => {
    return filterByRange(provenance as any[], dateRange).length;
  }, [provenance, dateRange]);

  // ─── Readiness dimension scores ───────────────────────────────────────────

  const dimensionScores = useMemo(() => {
    if (!readiness) return READINESS_DIMENSIONS.map((d) => ({ ...d, score: 0 }));
    const dims = readiness.dimensions || readiness;
    return READINESS_DIMENSIONS.map((d) => ({
      ...d,
      score: typeof dims[d.key] === 'number' ? dims[d.key] : 0,
    }));
  }, [readiness]);

  // ─── Artifact lifecycle by module ─────────────────────────────────────────

  const lifecycleByModule = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    DOSSIER_MODULES.forEach((m) => {
      result[m.key] = {};
      LIFECYCLE_STATES.forEach((s) => {
        result[m.key][s.key] = 0;
      });
    });
    artifacts.forEach((a: any) => {
      const mod = a.dossierModule || a.module || '1';
      const moduleKey = String(mod).replace(/^module\s*/i, '').charAt(0);
      const lifecycle = a.lifecycle || 'planned';
      if (result[moduleKey]) {
        result[moduleKey][lifecycle] = (result[moduleKey][lifecycle] || 0) + 1;
      }
    });
    return result;
  }, [artifacts]);

  // ─── Risk by category ────────────────────────────────────────────────────

  const riskByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    RISK_CATEGORIES.forEach((c) => (counts[c.key] = 0));
    risks
      .filter((r: any) => r.status === 'open' || r.status === 'mitigating')
      .forEach((r: any) => {
        const cat = r.category || 'regulatory';
        counts[cat] = (counts[cat] || 0) + 1;
      });
    return counts;
  }, [risks]);

  // ─── Provenance timeline ─────────────────────────────────────────────────

  const timelineEntries = useMemo(() => {
    const filtered = filterByRange(provenance as any[], dateRange);
    return filtered.slice(0, 20);
  }, [provenance, dateRange]);

  // ─── Blockers ─────────────────────────────────────────────────────────────

  const blockers = useMemo(() => {
    return readiness?.blockers || [];
  }, [readiness]);

  // ─── Loading guard ────────────────────────────────────────────────────────

  const isLoading = loadingReadiness || loadingArtifacts || loadingRisks || loadingProvenance;

  if (!programId) {
    return (
      <div className="flex items-center justify-center h-96 text-zinc-500">
        <div className="text-center space-y-2">
          <BarChart3 className="w-12 h-12 mx-auto text-zinc-400" />
          <p className="text-lg font-medium">No Program Selected</p>
          <p className="text-sm">Select a program to view analytics.</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-50">
            <BarChart3 className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900">Program Analytics</h2>
            <p className="text-sm text-zinc-500">Submission readiness, artifacts, risks & activity</p>
          </div>
        </div>

        {/* Date range selector */}
        <div className="flex items-center bg-zinc-100 rounded-xl p-1 gap-0.5">
          {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                dateRange === range
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700',
              )}
            >
              {DATE_RANGE_LABELS[range]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Metric Cards Strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 — Submission Readiness */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
              Submission Readiness
            </span>
            <Target className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-zinc-900">
              {isLoading ? '—' : `${overallReadiness ?? 0}%`}
            </span>
            {readinessTrend !== 0 && (
              <span
                className={cn(
                  'flex items-center gap-0.5 text-xs font-medium pb-1',
                  readinessTrend > 0 ? 'text-emerald-600' : 'text-red-600',
                )}
              >
                {readinessTrend > 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {Math.abs(readinessTrend)}%
              </span>
            )}
            {readinessTrend === 0 && !isLoading && (
              <span className="flex items-center gap-0.5 text-xs font-medium text-zinc-400 pb-1">
                <Minus className="w-3 h-3" />
                stable
              </span>
            )}
          </div>
          <div className="w-full bg-zinc-100 rounded-full h-1.5">
            <div
              className={cn(
                'h-1.5 rounded-full transition-all',
                (overallReadiness ?? 0) >= 80
                  ? 'bg-emerald-500'
                  : (overallReadiness ?? 0) >= 50
                    ? 'bg-amber-500'
                    : 'bg-red-500',
              )}
              style={{ width: `${overallReadiness ?? 0}%` }}
            />
          </div>
        </div>

        {/* Card 2 — Artifacts Progress */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
              Artifacts Progress
            </span>
            <FileText className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-zinc-900">
              {isLoading ? '—' : artifactStats.approved}
            </span>
            <span className="text-sm text-zinc-400 pb-1">/ {artifactStats.total}</span>
          </div>
          <div className="w-full bg-zinc-100 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-emerald-500 transition-all"
              style={{
                width: `${artifactStats.total ? (artifactStats.approved / artifactStats.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Card 3 — Open Risks */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
              Open Risks
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-zinc-900">
              {isLoading ? '—' : riskStats.openCount}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
              <span key={sev} className="flex items-center gap-1">
                <span className={cn('w-2 h-2 rounded-full', SEVERITY_CONFIG[sev]?.dot)} />
                <span className="text-zinc-500">
                  {riskStats.bySeverity[sev] || 0}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Card 4 — Team Activity */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
              Team Activity
            </span>
            <Activity className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-zinc-900">
              {isLoading ? '—' : activityCount}
            </span>
            <span className="text-sm text-zinc-400 pb-1">events ({DATE_RANGE_LABELS[dateRange]})</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <CalendarDays className="w-3 h-3" />
            <span>Last {DATE_RANGE_LABELS[dateRange].toLowerCase()}</span>
          </div>
        </div>
      </div>

      {/* ── Main 2x2 Grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Panel 1: Readiness Radar ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-500" />
              Readiness Radar
            </h3>
            <span className="text-xs text-zinc-400">Target: 80%</span>
          </div>

          <div className="space-y-3">
            {dimensionScores.map((dim) => {
              const score = Math.min(100, Math.max(0, dim.score));
              const barColor =
                score >= 80
                  ? 'bg-emerald-500'
                  : score >= 50
                    ? 'bg-amber-500'
                    : 'bg-red-500';
              const DimIcon = dim.icon;

              return (
                <div key={dim.key} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-28 shrink-0">
                    <DimIcon className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-600 truncate">{dim.label}</span>
                  </div>
                  <div className="flex-1 relative h-5 bg-zinc-100 rounded-md overflow-hidden">
                    <div
                      className={cn('h-full rounded-md transition-all duration-500', barColor)}
                      style={{ width: `${score}%` }}
                    />
                    {/* Target line at 80% */}
                    <div
                      className="absolute top-0 h-full w-px bg-zinc-400 opacity-60"
                      style={{ left: '80%' }}
                    />
                  </div>
                  <span className="text-xs font-medium text-zinc-700 w-10 text-right">
                    {score}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 pt-2 border-t border-zinc-200 text-xs text-zinc-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> &ge;80%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> 50-79%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> &lt;50%
            </span>
            <span className="flex items-center gap-1 ml-auto">
              <span className="w-px h-3 bg-zinc-400" /> target
            </span>
          </div>
        </div>

        {/* ── Panel 2: Artifact Lifecycle Distribution ──────────────────────── */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-500" />
            Artifact Lifecycle Distribution
          </h3>

          <div className="space-y-4">
            {DOSSIER_MODULES.map((mod) => {
              const counts = lifecycleByModule[mod.key] || {};
              const total = LIFECYCLE_STATES.reduce((sum, s) => sum + (counts[s.key] || 0), 0);

              return (
                <div key={mod.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-600">{mod.label}</span>
                    <span className="text-xs text-zinc-400">{total} artifact{total !== 1 ? 's' : ''}</span>
                  </div>
                  {total > 0 ? (
                    <div className="flex h-5 rounded-md overflow-hidden bg-zinc-100">
                      {LIFECYCLE_STATES.map((state) => {
                        const count = counts[state.key] || 0;
                        if (count === 0) return null;
                        const pct = (count / total) * 100;
                        return (
                          <div
                            key={state.key}
                            className={cn('h-full transition-all', state.color)}
                            style={{ width: `${pct}%` }}
                            title={`${state.label}: ${count}`}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-5 rounded-md bg-zinc-50 flex items-center justify-center">
                      <span className="text-[11px] text-zinc-400">No artifacts</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-200 text-xs text-zinc-400">
            {LIFECYCLE_STATES.map((state) => (
              <span key={state.key} className="flex items-center gap-1">
                <span className={cn('w-2.5 h-2.5 rounded-sm', state.color)} />
                {state.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Panel 3: Risk Trend ───────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            Risk Summary
          </h3>

          {/* Top-level summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-50 rounded-lg p-3 space-y-1">
              <span className="text-xs text-zinc-500">Total Open</span>
              <p className="text-xl font-bold text-zinc-900">{riskStats.openCount}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 space-y-1">
              <span className="text-xs text-emerald-600">Recently Mitigated</span>
              <p className="text-xl font-bold text-emerald-700">{riskStats.mitigatedCount}</p>
            </div>
            <div className="bg-zinc-50 rounded-lg p-3 space-y-1">
              <span className="text-xs text-zinc-500">Avg Time to Resolve</span>
              <p className="text-xl font-bold text-zinc-900">14d</p>
            </div>
            <div className="bg-zinc-50 rounded-lg p-3 space-y-1">
              <span className="text-xs text-zinc-500">By Severity</span>
              <div className="flex items-center gap-2 pt-0.5">
                {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
                  <div key={sev} className="text-center">
                    <span
                      className={cn(
                        'inline-block w-5 h-5 rounded text-[11px] font-bold leading-5 text-center',
                        SEVERITY_CONFIG[sev]?.bg,
                        SEVERITY_CONFIG[sev]?.text,
                      )}
                    >
                      {riskStats.bySeverity[sev] || 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Category breakdown */}
          <div className="space-y-2 pt-2 border-t border-zinc-200">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
              By Category
            </span>
            {RISK_CATEGORIES.map((cat) => {
              const count = riskByCategory[cat.key] || 0;
              const maxCount = Math.max(1, ...Object.values(riskByCategory));
              const CatIcon = cat.icon;
              return (
                <div key={cat.key} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-32 shrink-0">
                    <CatIcon className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-600">{cat.label}</span>
                  </div>
                  <div className="flex-1 h-3 bg-zinc-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded transition-all"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-zinc-600 w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Panel 4: Activity Timeline ────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              Activity Timeline
            </h3>
            <button className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium">
              View Full Trail <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-0 max-h-[420px] overflow-y-auto pr-1">
            {timelineEntries.length === 0 && !isLoading && (
              <div className="text-center py-8 text-zinc-400 text-sm">
                No activity in this period.
              </div>
            )}
            {isLoading && (
              <div className="text-center py-8 text-zinc-400 text-sm">
                Loading activity...
              </div>
            )}
            {timelineEntries.map((entry: any, idx: number) => {
              const ActionIcon = ACTION_ICONS[entry.action] || Activity;
              const isLast = idx === timelineEntries.length - 1;

              return (
                <div key={entry.id || idx} className="flex gap-3 relative">
                  {/* Vertical connector line */}
                  {!isLast && (
                    <div className="absolute left-[13px] top-7 w-px h-[calc(100%-4px)] bg-zinc-200" />
                  )}
                  {/* Icon */}
                  <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 z-10">
                    <ActionIcon className="w-3.5 h-3.5 text-zinc-500" />
                  </div>
                  {/* Content */}
                  <div className="flex-1 pb-4 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-800 font-medium truncate">
                          <span className="capitalize">{entry.action || 'update'}</span>
                          {entry.entityType && (
                            <span className="text-zinc-400"> on </span>
                          )}
                          <span className="text-blue-600">
                            {entry.entityType}
                            {entry.entityId ? ` #${entry.entityId}` : ''}
                          </span>
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                          {entry.actor || entry.userId || 'System'}
                          {entry.note && ` — ${entry.note}`}
                        </p>
                      </div>
                      <span className="text-[11px] text-zinc-400 whitespace-nowrap shrink-0">
                        {entry.createdAt || entry.timestamp
                          ? relativeTime(entry.createdAt || entry.timestamp)
                          : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Blockers Section ────────────────────────────────────────────────── */}
      {blockers.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            Readiness Blockers
            <span className="ml-1 px-2 py-0.5 bg-red-50 text-red-700 text-xs font-medium rounded-full">
              {blockers.length}
            </span>
          </h3>

          <div className="space-y-3">
            {blockers.map((blocker: any, idx: number) => {
              const severity = blocker.severity || 'medium';
              const sevConfig = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.medium;

              return (
                <div
                  key={blocker.id || idx}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-4',
                    severity === 'critical'
                      ? 'border-red-200 bg-red-50/50'
                      : severity === 'high'
                        ? 'border-orange-200 bg-orange-50/50'
                        : 'border-zinc-200 bg-zinc-50/50',
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      sevConfig.bg,
                    )}
                  >
                    <AlertTriangle className={cn('w-4 h-4', sevConfig.text)} />
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-800">
                        {blocker.description || blocker.title || 'Unnamed blocker'}
                      </p>
                      <span
                        className={cn(
                          'px-1.5 py-0.5 text-[11px] font-semibold uppercase rounded',
                          sevConfig.bg,
                          sevConfig.text,
                        )}
                      >
                        {severity}
                      </span>
                    </div>
                    {blocker.dimension && (
                      <p className="text-xs text-zinc-500">
                        Dimension: <span className="font-medium">{blocker.dimension}</span>
                      </p>
                    )}
                    {(blocker.suggestedAction || blocker.suggestion) && (
                      <div className="flex items-start gap-1.5 mt-1">
                        <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-blue-700">
                          {blocker.suggestedAction || blocker.suggestion}
                        </p>
                      </div>
                    )}
                  </div>

                  <button className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap flex items-center gap-1 shrink-0">
                    Resolve <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Nano Banana: Export Dashboard as Visual ── */}
      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="px-4 py-3 border-b border-zinc-200">
          <h3 className="text-sm font-semibold text-zinc-800">Export as Visual or Deck</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Use Nano Banana AI to generate infographics or a slide deck from your program analytics.</p>
        </div>
        <div className="p-4">
          <NanoBananaImageGenerator
            context={`Regulatory program analytics dashboard: ${overallReadiness ? `${overallReadiness.score}% readiness` : ''}, ${riskSummary.openCount} open risks (${Object.entries(riskSummary.bySeverity).map(([k,v]) => `${v} ${k}`).join(', ')}), ${activityCount} recent activities`}
            mode="infographic"
            promptSuffix="Dashboard-style infographic for a regulatory affairs executive. Clean, professional, data-rich."
          />
        </div>
      </div>
    </div>
  );
};

export default ProgramAnalytics;
