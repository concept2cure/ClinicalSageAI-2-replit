/**
 * @fileoverview Mission Control Dashboard — Phase 7
 * @module concept2cure/pages/MissionControl
 * @version 1.0.0
 *
 * @description
 * Portfolio-level command center unifying all 4 Enterprise Pillars:
 *  - Pillar 1: Project Hierarchy tree with rollup aggregates
 *  - Pillar 2: Rules Engine execution feed
 *  - Pillar 3: AI Sentinel findings & risk heatmap
 *  - Pillar 4: Module integration summary
 *
 * @compliance
 * - FDA 21 CFR Part 11: All actions audit-logged server-side
 * - Multi-tenant: Org-scoped data only
 *
 * @architecture
 * Uses useEnterprise hooks for all 4 pillar APIs.
 * Layout: 2-column responsive grid with metric strip + panels.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Eye,
  Folder,
  GitBranch,
  Layers,
  ListChecks,
  Package,
  RefreshCw,
  Shield,
  Target,
  TrendingUp,
  Zap,
  XCircle,
} from 'lucide-react';
import {
  usePrograms,
  useProjectTree,
  useProjectRollup,
  useSentinelStatus,
  useSentinelFindings,
  useProjectRules,
  useRuleExecutionLogs,
  useTriggerScan,
  useUpdateFinding,
  type HierarchyNode,
  type SentinelFinding,
  type SentinelSeverity,
  type RuleExecutionLogEntry,
  type ProgramSummary,
} from '../../hooks/useEnterprise';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SEVERITY_CONFIG: Record<
  SentinelSeverity,
  { color: string; bg: string; border: string; label: string }
> = {
  critical: {
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    label: 'Critical',
  },
  high: {
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    label: 'High',
  },
  medium: {
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    label: 'Medium',
  },
  low: {
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    label: 'Low',
  },
  info: {
    color: 'text-zinc-600',
    bg: 'bg-zinc-50',
    border: 'border-zinc-200',
    label: 'Info',
  },
};

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-zinc-400',
  active: 'bg-blue-500',
  on_track: 'bg-emerald-500',
  at_risk: 'bg-amber-500',
  blocked: 'bg-red-500',
  completed: 'bg-emerald-600',
  archived: 'bg-zinc-300',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Metric card with icon, value, and trend indicator */
interface MetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; value: string };
  accentColor?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon: Icon,
  label,
  value,
  subtitle,
  trend,
  accentColor = 'blue',
}) => (
  <div className="bg-white rounded-xl border border-zinc-200 p-4 hover:shadow-sm transition-shadow">
    <div className="flex items-start justify-between mb-2">
      <div
        className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center',
          `bg-${accentColor}-50`
        )}
      >
        <Icon className={cn('w-4.5 h-4.5', `text-${accentColor}-600`)} />
      </div>
      {trend && (
        <span
          className={cn(
            'text-xs font-medium px-1.5 py-0.5 rounded-full',
            trend.direction === 'up' && 'text-emerald-700 bg-emerald-50',
            trend.direction === 'down' && 'text-red-700 bg-red-50',
            trend.direction === 'flat' && 'text-zinc-600 bg-zinc-100'
          )}
        >
          {trend.direction === 'up' && '↑'}
          {trend.direction === 'down' && '↓'}
          {trend.direction === 'flat' && '→'} {trend.value}
        </span>
      )}
    </div>
    <div className="text-2xl font-semibold text-zinc-900 tabular-nums">{value}</div>
    <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
    {subtitle && <div className="text-xs text-zinc-400 mt-0.5">{subtitle}</div>}
  </div>
);

/** Severity badge component */
const SeverityBadge: React.FC<{ severity: SentinelSeverity }> = ({ severity }) => {
  const config = SEVERITY_CONFIG[severity];
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        config.color,
        config.bg,
        config.border
      )}
    >
      {config.label}
    </span>
  );
};

/** Progress bar */
const ProgressBar: React.FC<{
  value: number;
  max?: number;
  className?: string;
  color?: string;
}> = ({ value, max = 100, className, color = 'bg-blue-500' }) => {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  return (
    <div className={cn('w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// HIERARCHY TREE NODE (recursive)
// ═══════════════════════════════════════════════════════════════════════════════

interface TreeNodeProps {
  node: HierarchyNode;
  depth?: number;
  selectedId?: number | null;
  onSelect: (id: number) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth = 0, selectedId, onSelect }) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          onSelect(node.id);
          if (hasChildren) setExpanded(prev => !prev);
        }}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors',
          selectedId === node.id
            ? 'bg-blue-50 text-blue-900 border border-blue-200'
            : 'hover:bg-zinc-50 text-zinc-900'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
          )
        ) : (
          <div className="w-3.5 h-3.5 flex-shrink-0" />
        )}

        <div
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            STATUS_COLORS[node.status] ?? 'bg-zinc-400'
          )}
        />

        <span className="flex-1 truncate font-medium">{node.name}</span>

        {node.progress != null && node.progress > 0 && (
          <span className="text-xs text-zinc-500 tabular-nums">{node.progress}%</span>
        )}
      </button>

      {hasChildren && expanded && (
        <div>
          {node.children!.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SENTINEL FINDINGS PANEL
// ═══════════════════════════════════════════════════════════════════════════════

interface FindingsPanelProps {
  findings: SentinelFinding[];
  isLoading: boolean;
  onAcknowledge: (id: number) => void;
}

const FindingsPanel: React.FC<FindingsPanelProps> = ({ findings, isLoading, onAcknowledge }) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading findings...
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="text-center py-8">
        <Shield className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
        <p className="text-sm text-zinc-500">No open findings</p>
        <p className="text-xs text-zinc-400">All clear — Sentinel is monitoring</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {findings.map(finding => (
        <div
          key={finding.id}
          className={cn(
            'rounded-lg border p-3',
            SEVERITY_CONFIG[finding.severity].bg,
            SEVERITY_CONFIG[finding.severity].border
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <SeverityBadge severity={finding.severity} />
                <span className="text-xs text-zinc-500 capitalize">
                  {finding.analyzerType.replace(/_/g, ' ')}
                </span>
              </div>
              <h4 className="text-sm font-semibold text-zinc-900 truncate">{finding.title}</h4>
              <p className="text-xs text-zinc-600 mt-0.5 line-clamp-2">{finding.summary}</p>
            </div>
            {finding.status === 'open' && (
              <button
                onClick={() => onAcknowledge(finding.id)}
                className="flex-shrink-0 p-1.5 rounded-md hover:bg-white/60 transition-colors duration-150"
                title="Acknowledge"
              >
                <Eye className="w-4 h-4 text-zinc-500" />
              </button>
            )}
          </div>
          {finding.recommendations && finding.recommendations.length > 0 && (
            <div className="mt-2 pt-2 border-t border-black/5">
              <p className="text-xs text-zinc-500">
                <strong>Recommended:</strong> {finding.recommendations[0].action}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// RULES EXECUTION FEED
// ═══════════════════════════════════════════════════════════════════════════════

interface RulesActivityFeedProps {
  logs: RuleExecutionLogEntry[];
  isLoading: boolean;
  totalRules: number;
  activeRules: number;
}

const RulesActivityFeed: React.FC<RulesActivityFeedProps> = ({
  logs,
  isLoading,
  totalRules,
  activeRules,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading rules activity...
      </div>
    );
  }

  return (
    <div>
      {/* Summary strip */}
      <div className="flex items-center gap-4 mb-3 text-xs">
        <div className="flex items-center gap-1 text-zinc-600">
          <ListChecks className="w-3.5 h-3.5" />
          <span>
            <strong>{activeRules}</strong> active / {totalRules} total
          </span>
        </div>
        <div className="flex items-center gap-1 text-zinc-600">
          <Zap className="w-3.5 h-3.5" />
          <span>
            <strong>{logs.filter(l => l.success).length}</strong> succeeded
          </span>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-6">
          <ListChecks className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No recent rule executions</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {logs.slice(0, 8).map(log => (
            <div
              key={log.id}
              className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2"
            >
              {log.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-sm text-zinc-900 truncate block">
                  {log.triggerEvent.replace(/_/g, ' ')}
                </span>
              </div>
              <span className="text-xs text-zinc-400 flex-shrink-0 tabular-nums">
                {log.durationMs != null ? `${log.durationMs}ms` : '—'}
              </span>
              <span className="text-xs text-zinc-400 flex-shrink-0">
                {formatTimeAgo(log.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function countSeverities(findings: SentinelFinding[]): Record<SentinelSeverity, number> {
  const counts: Record<SentinelSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity]++;
  }
  return counts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export interface MissionControlProps {
  /** Org-level override (for admin views) */
  organizationId?: number;
  /** Active project from ZenApp context */
  projectId?: string;
}

export const MissionControl: React.FC<MissionControlProps> = ({ projectId }) => {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    projectId ? parseInt(projectId, 10) || null : null
  );

  // ── Pillar 1: Hierarchy ─────────────────────────────────────────────────
  const { data: programs, isLoading: programsLoading } = usePrograms();
  const { data: tree } = useProjectTree(
    programs && programs.length > 0 ? programs[0].id : undefined
  );

  // ── Pillar 2: Rules Engine ──────────────────────────────────────────────
  const { data: rulesData, isLoading: rulesLoading } = useProjectRules({ limit: 100 });
  const { data: logsData, isLoading: logsLoading } = useRuleExecutionLogs({ limit: 10 });

  // ── Pillar 3: AI Sentinel ───────────────────────────────────────────────
  const { data: sentinelStatus } = useSentinelStatus();
  const { data: findingsData, isLoading: findingsLoading } = useSentinelFindings({
    status: 'open',
    limit: 20,
  });
  const triggerScan = useTriggerScan();
  const updateFinding = useUpdateFinding();

  // ── Pillar 4: Rollup (for selected project) ────────────────────────────
  const { data: rollup } = useProjectRollup(selectedProjectId ?? undefined);

  // ── Computed Metrics ────────────────────────────────────────────────────
  const findings = findingsData?.findings ?? [];
  const severityCounts = useMemo(() => countSeverities(findings), [findings]);
  const rules = rulesData?.rules ?? [];
  const logs = logsData?.logs ?? [];
  const totalRules = rules.length;
  const activeRules = rules.filter(r => r.isActive).length;

  const portfolioMetrics = useMemo(() => {
    if (!programs) return { totalPrograms: 0, avgProgress: 0 };
    const totalPrograms = programs.length;
    const avgProgress =
      programs.length > 0
        ? Math.round(programs.reduce((s, p) => s + (p.progress ?? 0), 0) / programs.length)
        : 0;
    return { totalPrograms, avgProgress };
  }, [programs]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleAcknowledge = useCallback(
    (findingId: number) => {
      updateFinding.mutate({ findingId, status: 'acknowledged' });
    },
    [updateFinding]
  );

  const handleScan = useCallback(() => {
    triggerScan.mutate(undefined);
  }, [triggerScan]);

  // ── Render ──────────────────────────────────────────────────────────────
  const hasData = portfolioMetrics.totalPrograms > 0 || findings.length > 0 || totalRules > 0;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#FAFAF9]">
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ── Hero Welcome Section (Claude.AI-style) ──────────────────── */}
        <div className="mb-8">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mx-auto mb-4 /50">
              <Target className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-zinc-900 mb-2">
              Mission Control
            </h1>
            <p className="text-base text-zinc-500 leading-relaxed">
              Your portfolio command center for regulatory intelligence.
              Monitor program health, track AI-powered risk findings, and manage
              automation rules — all in one place.
            </p>
          </div>

          {/* How It Works — 3-column explainer */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-zinc-200 p-5 text-center hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                <Eye className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-1">AI Sentinel Monitoring</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Continuously scans your regulatory submissions for compliance gaps,
                inconsistencies, and risk signals using AI-powered analysis.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 p-5 text-center hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center mx-auto mb-3">
                <Zap className="w-5 h-5 text-violet-600" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-1">Automation Rules Engine</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Configure rules that automatically trigger actions — quality checks,
                cross-reference validation, and submission readiness assessments.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 p-5 text-center hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <Layers className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-1">Portfolio Oversight</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Track all your regulatory programs from a single dashboard.
                See progress, budget health, and rollup summaries across projects.
              </p>
            </div>
          </div>
        </div>

        {/* ── Action Bar ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-zinc-900">
            Portfolio Dashboard
          </h2>
          <button
            onClick={handleScan}
            disabled={triggerScan.isPending}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
              triggerScan.isPending
                ? 'border-zinc-200 text-zinc-400 cursor-wait'
                : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-400'
            )}
          >
            <Bot className={cn('w-4 h-4', triggerScan.isPending && 'animate-spin')} />
            {triggerScan.isPending ? 'Scanning...' : 'Run Sentinel Scan'}
          </button>
        </div>

        {/* Metric Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard
            icon={Layers}
            label="Programs"
            value={portfolioMetrics.totalPrograms}
            subtitle={`${portfolioMetrics.avgProgress}% avg progress`}
            accentColor="blue"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Open Findings"
            value={findings.length}
            subtitle={
              severityCounts.critical > 0
                ? `${severityCounts.critical} critical`
                : 'No critical issues'
            }
            accentColor={severityCounts.critical > 0 ? 'red' : 'emerald'}
          />
          <MetricCard
            icon={Zap}
            label="Active Rules"
            value={activeRules}
            subtitle={`${totalRules} total configured`}
            accentColor="violet"
          />
          <MetricCard
            icon={DollarSign}
            label="Budget Health"
            value={
              rollup
                ? `${Math.round(((rollup.spentBudget ?? 0) / Math.max(rollup.totalBudget, 1)) * 100)}%`
                : '—'
            }
            subtitle={
              rollup ? `$${(rollup.totalBudget / 1000).toFixed(0)}K allocated` : 'Select a project'
            }
            accentColor="amber"
          />
        </div>

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ── LEFT COLUMN: Hierarchy + Modules ─────────────────────────── */}
          <div className="lg:col-span-1 space-y-4">
            {/* Project Hierarchy */}
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
                  <GitBranch className="w-4 h-4 text-blue-600" />
                  Project Hierarchy
                </h2>
                <span className="text-xs text-zinc-400">{programs?.length ?? 0} programs</span>
              </div>
              <div className="p-2 max-h-[400px] overflow-y-auto">
                {programsLoading ? (
                  <div className="flex items-center justify-center py-8 text-zinc-400">
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    Loading hierarchy...
                  </div>
                ) : tree ? (
                  <TreeNode
                    node={tree}
                    selectedId={selectedProjectId}
                    onSelect={setSelectedProjectId}
                  />
                ) : programs && programs.length > 0 ? (
                  programs.map(prog => (
                    <button
                      key={prog.id}
                      onClick={() => setSelectedProjectId(prog.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors',
                        selectedProjectId === prog.id
                          ? 'bg-blue-50 text-blue-900 border border-blue-200'
                          : 'hover:bg-zinc-50 text-zinc-900'
                      )}
                    >
                      <Folder className="w-4 h-4 text-zinc-400" />
                      <span className="flex-1 truncate font-medium">{prog.name}</span>
                      <span className="text-xs text-zinc-400 tabular-nums">
                        {prog.progress ?? 0}%
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-6">
                    <Folder className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500">No programs yet</p>
                    <p className="text-xs text-zinc-400">Create a project to get started</p>
                  </div>
                )}
              </div>
            </div>

            {/* Rollup Details (when a project is selected) */}
            {selectedProjectId && rollup && (
              <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-200">
                  <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-violet-600" />
                    Rollup Summary
                  </h2>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs text-zinc-600 mb-1">
                      <span>Tasks</span>
                      <span className="tabular-nums">
                        {rollup.completedTasks}/{rollup.totalTasks}
                      </span>
                    </div>
                    <ProgressBar
                      value={rollup.completedTasks}
                      max={Math.max(rollup.totalTasks, 1)}
                      color="bg-blue-500"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-zinc-600 mb-1">
                      <span>Overall Progress</span>
                      <span className="tabular-nums">{rollup.overallProgress}%</span>
                    </div>
                    <ProgressBar value={rollup.overallProgress} color="bg-emerald-500" />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-xs text-zinc-500">
                      <Package className="w-3.5 h-3.5 inline mr-1" />
                      {rollup.moduleCount} modules linked
                    </div>
                    <div
                      className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        rollup.riskLevel === 'high' || rollup.riskLevel === 'critical'
                          ? 'bg-red-50 text-red-700'
                          : rollup.riskLevel === 'medium'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                      )}
                    >
                      {rollup.riskLevel} risk
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN: Sentinel + Rules ───────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            {/* Sentinel Risk Panel */}
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-red-600" />
                  RI Sentinel — Active Findings
                </h2>
                <div className="flex items-center gap-3">
                  {/* Severity breakdown mini badges */}
                  {(['critical', 'high', 'medium', 'low'] as SentinelSeverity[]).map(sev => {
                    const count = severityCounts[sev];
                    if (count === 0) return null;
                    return (
                      <span
                        key={sev}
                        className={cn(
                          'text-xs font-medium px-1.5 py-0.5 rounded-full',
                          SEVERITY_CONFIG[sev].bg,
                          SEVERITY_CONFIG[sev].color
                        )}
                      >
                        {count} {SEVERITY_CONFIG[sev].label}
                      </span>
                    );
                  })}
                  {sentinelStatus && (
                    <span className="flex items-center gap-1 text-xs text-zinc-400">
                      <Activity
                        className={cn(
                          'w-3.5 h-3.5',
                          sentinelStatus.isRunning ? 'text-emerald-500' : 'text-zinc-400'
                        )}
                      />
                      {sentinelStatus.isRunning ? 'Active' : 'Idle'}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-4 max-h-[350px] overflow-y-auto">
                <FindingsPanel
                  findings={findings}
                  isLoading={findingsLoading}
                  onAcknowledge={handleAcknowledge}
                />
              </div>
            </div>

            {/* Rules Engine Activity */}
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-violet-600" />
                  Rules Engine — Recent Activity
                </h2>
                <span className="text-xs text-zinc-400">Last {logs.length} executions</span>
              </div>
              <div className="p-4">
                <RulesActivityFeed
                  logs={logs}
                  isLoading={rulesLoading || logsLoading}
                  totalRules={totalRules}
                  activeRules={activeRules}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Getting Started Tips (when portfolio is empty) ───────── */}
        {!hasData && (
          <div className="mt-8 bg-white rounded-xl border border-zinc-200 p-8 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <Target className="w-7 h-7 text-violet-600" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 mb-2">
                Ready to get started?
              </h3>
              <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
                Create your first regulatory program to unlock AI-powered monitoring,
                automated compliance checks, and portfolio-wide risk intelligence.
              </p>
              <div className="flex flex-col gap-3 text-left max-w-sm mx-auto">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-zinc-50">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-semibold text-blue-600">1</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Create a program</p>
                    <p className="text-xs text-zinc-500">Define your submission type, indication, and regulatory pathway.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-zinc-50">
                  <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-semibold text-violet-600">2</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Run a Sentinel scan</p>
                    <p className="text-xs text-zinc-500">AI analyzes your artifacts for compliance gaps and risks automatically.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-zinc-50">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-semibold text-emerald-600">3</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Configure automation rules</p>
                    <p className="text-xs text-zinc-500">Set up triggers for quality checks, reviews, and readiness assessments.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MissionControl;
