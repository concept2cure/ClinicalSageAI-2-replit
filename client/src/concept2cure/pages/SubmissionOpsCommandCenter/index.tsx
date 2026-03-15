/**
 * Phase 15 — Submission Operations Command Center
 *
 * Split-pane workspace: compact header → primary blockers/readiness list → right inspector.
 * Drill-down modules open in Sheet drawers on demand.
 * Package-mode-aware, role-based quick-view presets, industry-native labels.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  Gauge,
  GitBranch,
  Layers,
  ListChecks,
  Lock,
  Mail,
  Package,
  Play,
  RefreshCw,
  Settings,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  useCommandCenter,
  useReadiness,
  useBlockers,
  useApprovalBottlenecks,
  useHotspots,
  useWorkload,
  useDueSoon,
  useAutomationRuns,
  useDigests,
  usePolicies,
  useMilestones,
  useTriggerAutomation,
  useResolveBlocker,
  useCreatePolicy,
  useDeletePolicy,
  usePackages,
  useMarkDigestRead,
} from '../../hooks/useSubmissionOps';
import {
  PACKAGE_FAMILIES,
  BLOCKER_TYPES,
  ARTIFACT_STAGES,
  STAGE_GROUPS,
  OVERALL_STATES,
  SEVERITY_LEVELS,
  DIGEST_TYPES,
  WAITING_STATE_LABELS,
  OWNERSHIP_TYPES,
  getPackageFamily,
  getBlockerTypes,
  getStageLabel,
  getStageGroup,
  type PackageFamilyDef,
} from '../../config/submission-ops-domain';

// ═══════════════════════════════════════════════════════════
// STATE COLORS
// ═══════════════════════════════════════════════════════════

const STATE_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  on_track: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  at_risk: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  blocked: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
};

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
};

const HEAT_STYLES: Record<string, string> = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-400 text-white',
  medium: 'bg-amber-300 text-amber-900',
  none: 'bg-slate-100 text-slate-400',
};

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

interface Props {
  projectId: number;
  projectName?: string;
  onNavigateToArtifact?: (artifactId: number) => void;
}

export function SubmissionOpsCommandCenter({
  projectId,
  projectName,
  onNavigateToArtifact,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedPackageId, setSelectedPackageId] = useState<string | undefined>();

  // Core data queries
  const { data: ccData, isLoading: ccLoading } = useCommandCenter(projectId);
  const { data: packages } = usePackages(projectId);

  const selectedPkg = useMemo(
    () => (packages ?? []).find((p: any) => p.packageId === selectedPackageId),
    [packages, selectedPackageId]
  );

  // Auto-select first package
  React.useEffect(() => {
    if (!selectedPackageId && packages?.length) {
      setSelectedPackageId(packages[0].packageId);
    }
  }, [packages, selectedPackageId]);

  const pkgFamily = selectedPkg ? getPackageFamily(selectedPkg.packageFamily) : undefined;
  const isDevice = pkgFamily?.industry === 'medtech';

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ─── Program Header ─── */}
      <ProgramHeader
        projectName={projectName}
        ccData={ccData}
        selectedPkg={selectedPkg}
        packages={packages ?? []}
        selectedPackageId={selectedPackageId}
        onSelectPackage={setSelectedPackageId}
        projectId={projectId}
      />

      {/* ─── Tab Bar ─── */}
      <div className="flex items-center gap-0.5 px-4 bg-white border-b border-slate-200 overflow-x-auto flex-shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap border-b-2',
              activeTab === tab.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Panel Content ─── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && (
          <OverviewPanel projectId={projectId} ccData={ccData} isLoading={ccLoading} />
        )}
        {activeTab === 'readiness' && (
          <ReadinessPanel packageId={selectedPackageId} isDevice={isDevice} />
        )}
        {activeTab === 'blockers' && (
          <BlockersPanel
            projectId={projectId}
            packageId={selectedPackageId}
            onNavigate={onNavigateToArtifact}
          />
        )}
        {activeTab === 'bottlenecks' && <BottlenecksPanel projectId={projectId} />}
        {activeTab === 'hotspots' && <HotspotsPanel packageId={selectedPackageId} />}
        {activeTab === 'workload' && <WorkloadPanel projectId={projectId} />}
        {activeTab === 'timeline' && <TimelinePanel projectId={projectId} />}
        {activeTab === 'automation' && (
          <AutomationPanel projectId={projectId} selectedPkg={selectedPkg} />
        )}
        {activeTab === 'digests' && <DigestsPanel projectId={projectId} />}
        {activeTab === 'policies' && <PoliciesPanel />}
        {activeTab === 'milestones' && <MilestoneGatePanel packageId={selectedPackageId} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 1. PROGRAM HEADER
// ═══════════════════════════════════════════════════════════

function ProgramHeader({
  projectName,
  ccData,
  selectedPkg,
  packages,
  selectedPackageId,
  onSelectPackage,
  projectId,
}: {
  projectName?: string;
  ccData: any;
  selectedPkg: any;
  packages: any[];
  selectedPackageId?: string;
  onSelectPackage: (id: string) => void;
  projectId: number;
}) {
  const pkgFamily = selectedPkg ? getPackageFamily(selectedPkg.packageFamily) : undefined;
  const overall = ccData;
  const pkgSummary = overall?.packages?.find((p: any) => p.packageId === selectedPackageId);
  const readiness = pkgSummary?.readiness;

  const state = readiness?.overallState ?? 'on_track';
  const stateStyle = STATE_STYLES[state] ?? STATE_STYLES.on_track;

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Left: project + package selector */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <Shield className="w-4.5 h-4.5 text-blue-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-900 truncate">
              {projectName || 'Submission Ops'}
            </span>
          </div>
          <span className="text-slate-300">|</span>
          <select
            value={selectedPackageId ?? ''}
            onChange={e => onSelectPackage(e.target.value)}
            className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 max-w-[200px] truncate"
          >
            {packages.map((p: any) => (
              <option key={p.packageId} value={p.packageId}>
                {p.title}
              </option>
            ))}
          </select>
          {pkgFamily && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium whitespace-nowrap">
              {pkgFamily.label}
            </span>
          )}
        </div>

        {/* Right: metrics strip */}
        <div className="flex items-center gap-4">
          {readiness && (
            <>
              <MetricPill label="Readiness" value={`${readiness.readinessPercent}%`} />
              <MetricPill label="Open Threads" value={readiness.openThreads} />
              <MetricPill label="Open Tasks" value={readiness.openTasks} />
              <MetricPill
                label="Overdue"
                value={readiness.overdueItems}
                alert={readiness.overdueItems > 0}
              />
              <MetricPill
                label="Missing Approvals"
                value={readiness.missingApprovals}
                alert={readiness.missingApprovals > 0}
              />
            </>
          )}
          {overall && (
            <MetricPill
              label="Blockers"
              value={overall.totalOpenBlockers}
              alert={overall.totalOpenBlockers > 0}
            />
          )}
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
              stateStyle.bg,
              stateStyle.text,
              stateStyle.border
            )}
          >
            <div className={cn('w-1.5 h-1.5 rounded-full', stateStyle.dot)} />
            {state === 'on_track' ? 'On Track' : state === 'at_risk' ? 'At Risk' : 'Blocked'}
          </div>
          {readiness?.trend && (
            <span
              className={cn(
                'text-xs flex items-center gap-0.5',
                readiness.trend === 'improving'
                  ? 'text-emerald-600'
                  : readiness.trend === 'degrading'
                    ? 'text-red-600'
                    : 'text-slate-400'
              )}
            >
              {readiness.trend === 'improving' ? (
                <TrendingUp className="w-3 h-3" />
              ) : readiness.trend === 'degrading' ? (
                <TrendingDown className="w-3 h-3" />
              ) : null}
              {readiness.trend}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  alert,
}: {
  label: string;
  value: number | string;
  alert?: boolean;
}) {
  return (
    <div className="text-center">
      <div
        className={cn(
          'text-sm font-semibold tabular-nums',
          alert ? 'text-red-600' : 'text-slate-900'
        )}
      >
        {value}
      </div>
      <div className="text-[10px] text-slate-400 leading-tight">{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 2. OVERVIEW PANEL
// ═══════════════════════════════════════════════════════════

function OverviewPanel({
  projectId,
  ccData,
  isLoading,
}: {
  projectId: number;
  ccData: any;
  isLoading: boolean;
}) {
  if (isLoading) return <LoadingState />;
  if (!ccData) return <EmptyState message="No command center data" />;

  const pkgs = ccData.packages ?? [];
  return (
    <div className="p-4 space-y-4">
      {/* Package summary table */}
      <SectionTitle icon={<Package className="w-4 h-4" />} title="Package Summary" />
      <div className="border border-slate-200 rounded bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-medium text-slate-500">Package</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Family</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Readiness</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">State</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Threads</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Tasks</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Overdue</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Blockers</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Trend</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Last Sweep</th>
            </tr>
          </thead>
          <tbody>
            {pkgs.map((pkg: any) => {
              const r = pkg.readiness;
              const st = r?.overallState ?? 'on_track';
              const ss = STATE_STYLES[st] ?? STATE_STYLES.on_track;
              return (
                <tr key={pkg.packageId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{pkg.title}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {getPackageFamily(pkg.packageFamily)?.label ?? pkg.packageFamily}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r ? (
                      <ReadinessBar percent={r.readinessPercent} />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StateBadge state={st} />
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600">{r?.openThreads ?? '—'}</td>
                  <td className="px-3 py-2 text-center text-slate-600">{r?.openTasks ?? '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={cn(
                        r?.overdueItems > 0 ? 'text-red-600 font-medium' : 'text-slate-400'
                      )}
                    >
                      {r?.overdueItems ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={cn(
                        pkg.openBlockers > 0 ? 'text-red-600 font-medium' : 'text-slate-400'
                      )}
                    >
                      {pkg.openBlockers}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r?.trend && (
                      <span
                        className={cn(
                          'text-[10px] font-medium',
                          r.trend === 'improving'
                            ? 'text-emerald-600'
                            : r.trend === 'degrading'
                              ? 'text-red-600'
                              : 'text-slate-400'
                        )}
                      >
                        {r.trend}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    {pkg.lastAutomationRun
                      ? new Date(pkg.lastAutomationRun.startedAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Project-level counters */}
      <div className="flex items-center gap-6 px-2 text-xs text-slate-500">
        <span>
          Total Open Blockers:{' '}
          <strong className="text-slate-700">{ccData.totalOpenBlockers}</strong>
        </span>
        <span>
          Total Overdue:{' '}
          <strong className={cn(ccData.totalOverdue > 0 ? 'text-red-600' : 'text-slate-700')}>
            {ccData.totalOverdue}
          </strong>
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 3. READINESS MATRIX
// ═══════════════════════════════════════════════════════════

function ReadinessPanel({ packageId, isDevice }: { packageId?: string; isDevice: boolean }) {
  const { data: readiness, isLoading } = useReadiness(packageId);

  if (isLoading) return <LoadingState />;
  if (!readiness) return <EmptyState message="Select a package to view readiness" />;

  const sections = readiness.sections ?? [];
  return (
    <div className="p-4 space-y-4">
      <SectionTitle icon={<Target className="w-4 h-4" />} title="Readiness Matrix" />

      {/* Package-level summary */}
      <div className="flex items-center gap-6 p-3 bg-white border border-slate-200 rounded">
        <div className="flex items-center gap-2">
          <ReadinessBar percent={readiness.overallReadinessPercent} wide />
          <span className="text-sm font-semibold text-slate-700">
            {readiness.overallReadinessPercent}%
          </span>
        </div>
        <StateBadge state={readiness.overallState} />
        <span className="text-xs text-slate-500">
          {readiness.totalBlockers} blockers · {readiness.totalOverdue} overdue
        </span>
      </div>

      {/* Section matrix */}
      <div className="border border-slate-200 rounded bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-medium text-slate-500">
                Section / Workstream
              </th>
              <th className="text-center px-3 py-2 font-medium text-slate-500 w-32">Readiness</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">State</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Artifacts</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Threads</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Tasks</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Overdue</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">
                Missing Approvals
              </th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Critical</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Blocker Severity</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec: any) => {
              const ss = STATE_STYLES[sec.overallState] ?? STATE_STYLES.on_track;
              return (
                <tr key={sec.sectionDbId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{sec.sectionLabel}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 justify-center">
                      <ReadinessBar percent={sec.readinessPercent} />
                      <span className="text-slate-600 tabular-nums">{sec.readinessPercent}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StateBadge state={sec.overallState} />
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600">
                    {sec.readyArtifacts}/{sec.totalArtifacts}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600">{sec.openThreads}</td>
                  <td className="px-3 py-2 text-center text-slate-600">{sec.openTasks}</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={cn(
                        sec.overdueItems > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'
                      )}
                    >
                      {sec.overdueItems}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={cn(
                        sec.missingApprovals > 0 ? 'text-amber-600 font-semibold' : 'text-slate-400'
                      )}
                    >
                      {sec.missingApprovals}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={cn(
                        sec.openCriticalFindings > 0
                          ? 'text-red-600 font-semibold'
                          : 'text-slate-400'
                      )}
                    >
                      {sec.openCriticalFindings}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {sec.maxBlockerSeverity ? (
                      <SeverityBadge severity={sec.maxBlockerSeverity} />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sections.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-400">
            No sections configured for this package
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 4. BLOCKERS CONSOLE
// ═══════════════════════════════════════════════════════════

function BlockersPanel({
  projectId,
  packageId,
  onNavigate,
}: {
  projectId: number;
  packageId?: string;
  onNavigate?: (id: number) => void;
}) {
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const filters: Record<string, string | number> = { projectId };
  if (packageId) filters.packageId = packageId;
  if (severityFilter) filters.severity = severityFilter;
  if (typeFilter) filters.blockerType = typeFilter;

  const { data: blockers, isLoading } = useBlockers(filters);
  const resolveBlocker = useResolveBlocker();

  if (isLoading) return <LoadingState />;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle icon={<XCircle className="w-4 h-4" />} title="Blockers Console" />
        <div className="flex items-center gap-2">
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
          >
            <option value="">All Severities</option>
            {SEVERITY_LEVELS.map(s => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
          >
            <option value="">All Types</option>
            {BLOCKER_TYPES.map(b => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border border-slate-200 rounded bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-medium text-slate-500">Severity</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Blocker</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Type</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Function</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Owner</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Age</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Due</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Next Action</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(blockers ?? []).map((b: any) => {
              const age = Math.round(
                (Date.now() - new Date(b.createdAt).getTime()) / (1000 * 60 * 60)
              );
              const blockerTypeDef = BLOCKER_TYPES.find(t => t.key === b.blockerType);
              return (
                <tr key={b.blockerId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <SeverityBadge severity={b.severity} />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800 max-w-[200px] truncate">
                    {b.title}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {blockerTypeDef?.label ?? b.blockerType}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{b.ownerFunction || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{b.ownershipType || '—'}</td>
                  <td className="px-3 py-2 text-slate-500 tabular-nums">{age}h</td>
                  <td className="px-3 py-2 text-slate-500">
                    {b.dueAt ? new Date(b.dueAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-500 max-w-[150px] truncate">
                    {b.nextAction || '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center gap-1 justify-center">
                      {b.artifactId && onNavigate && (
                        <button
                          onClick={() => onNavigate(b.artifactId)}
                          className="p-1 hover:bg-slate-100 rounded"
                          title="Go to artifact"
                        >
                          <ExternalLink className="w-3 h-3 text-blue-600" />
                        </button>
                      )}
                      <button
                        onClick={() =>
                          resolveBlocker.mutate({ blockerId: b.blockerId, status: 'resolved' })
                        }
                        className="p-1 hover:bg-emerald-50 rounded"
                        title="Resolve"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(!blockers || blockers.length === 0) && (
          <div className="p-6 text-center text-xs text-slate-400">No open blockers</div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 5. APPROVAL BOTTLENECKS
// ═══════════════════════════════════════════════════════════

function BottlenecksPanel({ projectId }: { projectId: number }) {
  const { data: bottlenecks, isLoading } = useApprovalBottlenecks(projectId);

  if (isLoading) return <LoadingState />;

  return (
    <div className="p-4 space-y-3">
      <SectionTitle icon={<Lock className="w-4 h-4" />} title="Approval Bottlenecks" />

      <div className="border border-slate-200 rounded bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-medium text-slate-500">Artifact</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Status</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Reviewer</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Round</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Waiting (h)</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Due</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Approved Ver.</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Publish Blocked</th>
            </tr>
          </thead>
          <tbody>
            {(bottlenecks ?? []).map((bn: any, i: number) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-800 max-w-[200px] truncate">
                  {bn.artifactTitle}
                </td>
                <td className="px-3 py-2 text-slate-600">{bn.artifactStatus}</td>
                <td className="px-3 py-2 text-center text-slate-600">#{bn.reviewerId}</td>
                <td className="px-3 py-2 text-center text-slate-600">{bn.reviewRound}</td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={cn(
                      'tabular-nums',
                      bn.waitingHours > 72
                        ? 'text-red-600 font-semibold'
                        : bn.waitingHours > 48
                          ? 'text-amber-600'
                          : 'text-slate-600'
                    )}
                  >
                    {bn.waitingHours}h
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-slate-500">
                  {bn.dueDate ? new Date(bn.dueDate).toLocaleDateString() : '—'}
                </td>
                <td className="px-3 py-2 text-center">
                  {bn.hasApprovedVersion ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-slate-300 mx-auto" />
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {bn.publishBlocked ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mx-auto" />
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!bottlenecks || bottlenecks.length === 0) && (
          <div className="p-6 text-center text-xs text-slate-400">
            No pending approval bottlenecks
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 6. HOTSPOT HEATMAP
// ═══════════════════════════════════════════════════════════

function HotspotsPanel({ packageId }: { packageId?: string }) {
  const { data: hotspots, isLoading } = useHotspots(packageId);

  if (isLoading) return <LoadingState />;
  if (!packageId) return <EmptyState message="Select a package to view hotspots" />;

  return (
    <div className="p-4 space-y-3">
      <SectionTitle icon={<Flame className="w-4 h-4" />} title="Hotspot / Blocker Density" />

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {(hotspots ?? []).map((h: any) => {
          const style = HEAT_STYLES[h.heatLevel] ?? HEAT_STYLES.none;
          return (
            <div
              key={h.sectionId}
              className={cn('rounded-md p-3 text-center transition-all', style)}
            >
              <div className="text-xs font-semibold truncate" title={h.sectionLabel}>
                {h.sectionLabel}
              </div>
              <div className="text-lg font-bold tabular-nums mt-1">{h.totalBlockers}</div>
              <div className="text-[10px] opacity-75">
                {h.criticalBlockers > 0 ? `${h.criticalBlockers} critical` : 'blockers'}
              </div>
            </div>
          );
        })}
      </div>

      {(!hotspots || hotspots.length === 0) && <EmptyState message="No hotspot data" />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 7. OWNERSHIP & WORKLOAD
// ═══════════════════════════════════════════════════════════

function WorkloadPanel({ projectId }: { projectId: number }) {
  const { data: workload, isLoading } = useWorkload(projectId);

  if (isLoading) return <LoadingState />;

  return (
    <div className="p-4 space-y-3">
      <SectionTitle icon={<Users className="w-4 h-4" />} title="Ownership & Functional Load" />

      <div className="border border-slate-200 rounded bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-medium text-slate-500">Person</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Open Tasks</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Overdue</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Pending Reviews</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Load</th>
            </tr>
          </thead>
          <tbody>
            {(workload ?? [])
              .sort(
                (a: any, b: any) => b.overdueTasks + b.openTasks - (a.overdueTasks + a.openTasks)
              )
              .map((w: any) => {
                const total = w.openTasks + w.pendingReviews;
                const risk = w.overdueTasks > 0 ? 'high' : total > 10 ? 'medium' : 'low';
                return (
                  <tr key={w.userId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {w.name || `User #${w.userId}`}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600">{w.openTasks}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={cn(
                          w.overdueTasks > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'
                        )}
                      >
                        {w.overdueTasks}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600">{w.pendingReviews}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              risk === 'high'
                                ? 'bg-red-500'
                                : risk === 'medium'
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400'
                            )}
                            style={{ width: `${Math.min(total * 5, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 tabular-nums w-6 text-right">
                          {total}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {(!workload || workload.length === 0) && (
          <div className="p-6 text-center text-xs text-slate-400">No workload data</div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 8. TIMELINE / DUE SOON
// ═══════════════════════════════════════════════════════════

function TimelinePanel({ projectId }: { projectId: number }) {
  const { data: dueSoon, isLoading } = useDueSoon(projectId);

  if (isLoading) return <LoadingState />;
  if (!dueSoon) return <EmptyState message="No upcoming items" />;

  const buckets = ['overdue', '24h', '48h', '7d'] as const;
  const bucketLabels: Record<string, string> = {
    overdue: 'Overdue',
    '24h': 'Next 24h',
    '48h': 'Next 48h',
    '7d': 'Next 7d',
  };
  const bucketColors: Record<string, string> = {
    overdue: 'border-red-300 bg-red-50',
    '24h': 'border-amber-300 bg-amber-50',
    '48h': 'border-blue-200 bg-blue-50',
    '7d': 'border-slate-200 bg-slate-50',
  };

  const allItems = [
    ...(dueSoon.threads ?? []).map((t: any) => ({ ...t, itemType: 'thread' })),
    ...(dueSoon.tasks ?? []).map((t: any) => ({ ...t, itemType: 'task' })),
    ...(dueSoon.reviews ?? []).map((r: any) => ({ ...r, itemType: 'review', bucket: r.bucket })),
  ];

  return (
    <div className="p-4 space-y-4">
      <SectionTitle icon={<Calendar className="w-4 h-4" />} title="Due Soon / Timeline Rail" />

      {buckets.map(bucket => {
        const items = allItems.filter((i: any) => i.bucket === bucket);
        if (items.length === 0) return null;
        return (
          <div key={bucket} className={cn('border rounded p-3', bucketColors[bucket])}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-slate-700">{bucketLabels[bucket]}</span>
              <span className="text-[10px] text-slate-400">{items.length} items</span>
            </div>
            <div className="space-y-1">
              {items.slice(0, 20).map((item: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs bg-white rounded px-2 py-1.5 border border-slate-100"
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0',
                      item.itemType === 'thread'
                        ? 'bg-purple-400'
                        : item.itemType === 'task'
                          ? 'bg-blue-400'
                          : 'bg-amber-400'
                    )}
                  />
                  <span className="text-[10px] text-slate-400 w-12 flex-shrink-0">
                    {item.itemType}
                  </span>
                  <span className="text-slate-700 truncate flex-1">
                    {item.title || item.assignmentId || 'Untitled'}
                  </span>
                  <span className="text-[10px] text-slate-400 flex-shrink-0">
                    {item.dueAt || item.dueDate
                      ? new Date(item.dueAt || item.dueDate).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {allItems.length === 0 && <EmptyState message="No upcoming due items" />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 9. AUTOMATION ACTIVITY FEED
// ═══════════════════════════════════════════════════════════

function AutomationPanel({ projectId, selectedPkg }: { projectId: number; selectedPkg?: any }) {
  const { data: runs, isLoading } = useAutomationRuns(projectId);
  const triggerAutomation = useTriggerAutomation();

  if (isLoading) return <LoadingState />;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle icon={<Zap className="w-4 h-4" />} title="Automation Activity Feed" />
        {selectedPkg && (
          <button
            onClick={() => triggerAutomation.mutate({ projectId, packageDbId: selectedPkg.id })}
            disabled={triggerAutomation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <Play className="w-3 h-3" />
            {triggerAutomation.isPending ? 'Running…' : 'Run Sweep'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {(runs ?? []).map((run: any) => (
          <div key={run.runId} className="bg-white border border-slate-200 rounded p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    run.status === 'completed'
                      ? 'bg-emerald-400'
                      : run.status === 'running'
                        ? 'bg-blue-400 animate-pulse'
                        : 'bg-red-400'
                  )}
                />
                <span className="text-xs font-medium text-slate-700">{run.runType}</span>
                <span className="text-[10px] text-slate-400">{run.runId}</span>
              </div>
              <span className="text-[10px] text-slate-400">
                {new Date(run.startedAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
              <span>
                Actions: <strong className="text-slate-700">{run.actionsCreated ?? 0}</strong>
              </span>
              <span>
                Blockers: <strong className="text-slate-700">{run.blockersFound ?? 0}</strong>
              </span>
              <span>
                Escalations:{' '}
                <strong className="text-slate-700">{run.escalationsTriggered ?? 0}</strong>
              </span>
              <span>
                Readiness:{' '}
                {run.readinessUpdated ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 inline" />
                ) : (
                  '—'
                )}
              </span>
            </div>
            {run.summary?.actions?.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {run.summary.actions.slice(0, 5).map((a: string, i: number) => (
                  <div
                    key={i}
                    className="text-[10px] text-slate-500 pl-3 border-l-2 border-slate-100"
                  >
                    {a}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {(!runs || runs.length === 0) && <EmptyState message="No automation runs yet" />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 10. DIGESTS / EXCEPTION VIEW
// ═══════════════════════════════════════════════════════════

function DigestsPanel({ projectId }: { projectId: number }) {
  const [digestType, setDigestType] = useState<string>('');
  const { data: digests, isLoading } = useDigests(projectId, digestType);
  const markRead = useMarkDigestRead();

  if (isLoading) return <LoadingState />;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle icon={<Mail className="w-4 h-4" />} title="Digest / Exception View" />
        <select
          value={digestType}
          onChange={e => setDigestType(e.target.value)}
          className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
        >
          <option value="">All Types</option>
          {DIGEST_TYPES.map(d => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {(digests ?? []).map((d: any) => (
          <div
            key={d.digestId}
            className={cn(
              'bg-white border rounded p-3',
              d.status === 'unread' ? 'border-blue-200' : 'border-slate-200'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {d.status === 'unread' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                <span className="text-xs font-medium text-slate-700">
                  {DIGEST_TYPES.find(dt => dt.key === d.digestType)?.label ?? d.digestType}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">
                  {new Date(d.generatedAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {d.status === 'unread' && (
                  <button
                    onClick={() => markRead.mutate(d.digestId)}
                    className="text-[10px] text-blue-600 hover:underline"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
            {d.summary && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                {d.summary.waitingOnMe != null && (
                  <DigestMetric label="Waiting on me" value={d.summary.waitingOnMe} />
                )}
                {d.summary.waitingOnFunction != null && (
                  <DigestMetric label="Waiting on function" value={d.summary.waitingOnFunction} />
                )}
                {d.summary.newChanges != null && (
                  <DigestMetric label="New changes" value={d.summary.newChanges} />
                )}
                {d.summary.openCritical != null && (
                  <DigestMetric label="Open critical" value={d.summary.openCritical} alert />
                )}
                {d.summary.overdueItems != null && (
                  <DigestMetric label="Overdue" value={d.summary.overdueItems} alert />
                )}
                {d.summary.blockingReadiness != null && (
                  <DigestMetric
                    label="Blocking readiness"
                    value={d.summary.blockingReadiness}
                    alert
                  />
                )}
                {d.summary.degradingSections != null && (
                  <DigestMetric label="Degrading" value={d.summary.degradingSections} alert />
                )}
              </div>
            )}
          </div>
        ))}
        {(!digests || digests.length === 0) && <EmptyState message="No digests" />}
      </div>
    </div>
  );
}

function DigestMetric({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="bg-slate-50 rounded px-2 py-1">
      <div
        className={cn(
          'text-sm font-semibold tabular-nums',
          alert && value > 0 ? 'text-red-600' : 'text-slate-700'
        )}
      >
        {value}
      </div>
      <div className="text-slate-400">{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 11. POLICY SETTINGS
// ═══════════════════════════════════════════════════════════

function PoliciesPanel() {
  const { data: policies, isLoading } = usePolicies();
  const deletePolicy = useDeletePolicy();
  const [showCreate, setShowCreate] = useState(false);

  if (isLoading) return <LoadingState />;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle icon={<Settings className="w-4 h-4" />} title="Policy Settings" />
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Plus className="w-3 h-3" />
          Add Policy
        </button>
      </div>

      {showCreate && <PolicyCreateForm onDone={() => setShowCreate(false)} />}

      <div className="border border-slate-200 rounded bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-medium text-slate-500">Priority</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Description</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Package Family</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Section</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Doc Family</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Function</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Ownership</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Review Due</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Overdue</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Escalation</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Block Critical</th>
              <th className="text-center px-3 py-2 font-medium text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(policies ?? []).map((p: any) => (
              <tr key={p.policyId} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-600 font-medium">{p.priority}</td>
                <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate">
                  {p.ruleDescription || '—'}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {getPackageFamily(p.packageFamily)?.label ?? p.packageFamily ?? '—'}
                </td>
                <td className="px-3 py-2 text-slate-500">{p.sectionKey || '—'}</td>
                <td className="px-3 py-2 text-slate-500">{p.documentFamily || '—'}</td>
                <td className="px-3 py-2 text-slate-500">{p.ownerFunction || '—'}</td>
                <td className="px-3 py-2 text-slate-500">{p.ownershipType || '—'}</td>
                <td className="px-3 py-2 text-center text-slate-600 tabular-nums">
                  {p.reviewDueHours ?? '—'}h
                </td>
                <td className="px-3 py-2 text-center text-slate-600 tabular-nums">
                  {p.overdueThresholdHours ?? '—'}h
                </td>
                <td className="px-3 py-2 text-center text-slate-600 tabular-nums">
                  {p.escalationThresholdHours ?? '—'}h
                </td>
                <td className="px-3 py-2 text-center">
                  {p.blockOnOpenCritical ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-slate-300 mx-auto" />
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => deletePolicy.mutate(p.policyId)}
                    className="text-[10px] text-red-500 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!policies || policies.length === 0) && (
          <div className="p-6 text-center text-xs text-slate-400">No policies configured</div>
        )}
      </div>
    </div>
  );
}

function PolicyCreateForm({ onDone }: { onDone: () => void }) {
  const createPolicy = useCreatePolicy();
  const [form, setForm] = useState<any>({
    packageFamily: '',
    sectionKey: '',
    documentFamily: '',
    ownerFunction: '',
    ownershipType: '',
    reviewDueHours: 72,
    dueSoonThresholdHours: 48,
    overdueThresholdHours: 96,
    escalationThresholdHours: 120,
    blockOnOpenCritical: true,
    blockPublishOnOpenCritical: true,
    requireSectionReadyForGate: true,
    ruleDescription: '',
    priority: 0,
  });

  const handleSubmit = () => {
    createPolicy.mutate(form, { onSuccess: onDone });
  };

  return (
    <div className="bg-white border border-blue-200 rounded p-4 space-y-3">
      <div className="text-xs font-medium text-slate-700">New Policy</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <FormField label="Package Family">
          <select
            value={form.packageFamily}
            onChange={e => setForm({ ...form, packageFamily: e.target.value })}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1"
          >
            <option value="">Any</option>
            {PACKAGE_FAMILIES.map(f => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Section Key">
          <input
            value={form.sectionKey}
            onChange={e => setForm({ ...form, sectionKey: e.target.value })}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1"
            placeholder="e.g. module3_cmc"
          />
        </FormField>
        <FormField label="Document Family">
          <input
            value={form.documentFamily}
            onChange={e => setForm({ ...form, documentFamily: e.target.value })}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1"
            placeholder="e.g. protocol"
          />
        </FormField>
        <FormField label="Function">
          <input
            value={form.ownerFunction}
            onChange={e => setForm({ ...form, ownerFunction: e.target.value })}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1"
            placeholder="e.g. CMC"
          />
        </FormField>
        <FormField label="Ownership">
          <select
            value={form.ownershipType}
            onChange={e => setForm({ ...form, ownershipType: e.target.value })}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1"
          >
            <option value="">Any</option>
            {OWNERSHIP_TYPES.map(o => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Review Due (h)">
          <input
            type="number"
            value={form.reviewDueHours}
            onChange={e => setForm({ ...form, reviewDueHours: Number(e.target.value) })}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1"
          />
        </FormField>
        <FormField label="Overdue (h)">
          <input
            type="number"
            value={form.overdueThresholdHours}
            onChange={e => setForm({ ...form, overdueThresholdHours: Number(e.target.value) })}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1"
          />
        </FormField>
        <FormField label="Escalation (h)">
          <input
            type="number"
            value={form.escalationThresholdHours}
            onChange={e => setForm({ ...form, escalationThresholdHours: Number(e.target.value) })}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1"
          />
        </FormField>
        <FormField label="Priority">
          <input
            type="number"
            value={form.priority}
            onChange={e => setForm({ ...form, priority: Number(e.target.value) })}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1"
          />
        </FormField>
        <FormField label="Description">
          <input
            value={form.ruleDescription}
            onChange={e => setForm({ ...form, ruleDescription: e.target.value })}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1"
            placeholder="Human-readable rule"
          />
        </FormField>
        <FormField label="Block on Critical">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={form.blockOnOpenCritical}
              onChange={e => setForm({ ...form, blockOnOpenCritical: e.target.checked })}
            />
            Yes
          </label>
        </FormField>
        <FormField label="Block Publish on Critical">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={form.blockPublishOnOpenCritical}
              onChange={e => setForm({ ...form, blockPublishOnOpenCritical: e.target.checked })}
            />
            Yes
          </label>
        </FormField>
      </div>

      {/* Human-readable preview */}
      {form.ruleDescription && (
        <div className="text-xs text-slate-500 bg-slate-50 rounded p-2 border border-slate-100">
          <span className="font-medium text-slate-600">Rule Preview: </span>
          {form.ruleDescription}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={createPolicy.isPending}
          className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {createPolicy.isPending ? 'Creating…' : 'Create Policy'}
        </button>
        <button
          onClick={onDone}
          className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-slate-500 mb-0.5 block">{label}</label>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 12. MILESTONE GATE PANEL
// ═══════════════════════════════════════════════════════════

function MilestoneGatePanel({ packageId }: { packageId?: string }) {
  const { data: milestones, isLoading } = useMilestones(packageId);

  if (isLoading) return <LoadingState />;
  if (!packageId) return <EmptyState message="Select a package to view milestone gates" />;

  return (
    <div className="p-4 space-y-3">
      <SectionTitle icon={<GitBranch className="w-4 h-4" />} title="Milestone Gates" />

      <div className="space-y-3">
        {(milestones ?? []).map((ms: any) => {
          const isBlocked = ms.gateStatus === 'blocked';
          return (
            <div
              key={ms.milestoneId}
              className={cn(
                'bg-white border rounded p-4',
                isBlocked ? 'border-red-200' : 'border-slate-200'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full',
                      isBlocked ? 'bg-red-500' : 'bg-emerald-500'
                    )}
                  />
                  <span className="text-sm font-medium text-slate-800">{ms.title}</span>
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-medium',
                      isBlocked
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    )}
                  >
                    {isBlocked ? 'BLOCKED' : 'OPEN'}
                  </span>
                </div>
                {ms.targetDate && (
                  <span className="text-xs text-slate-400">
                    Target: {new Date(ms.targetDate).toLocaleDateString()}
                  </span>
                )}
              </div>

              {ms.description && <p className="text-xs text-slate-500 mt-1">{ms.description}</p>}

              {/* Block reasons */}
              {isBlocked && ms.blockReasons?.length > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="text-[10px] font-medium text-red-600 uppercase tracking-wider">
                    Block Reasons
                  </div>
                  {ms.blockReasons.map((reason: string, i: number) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 rounded px-2 py-1"
                    >
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      {reason}
                    </div>
                  ))}
                </div>
              )}

              {/* Required sections */}
              {ms.sections?.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">
                    Required Sections
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {ms.sections.map((sec: any) => (
                      <span
                        key={sec.sectionDbId}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded"
                      >
                        {sec.sectionLabel}
                        {sec.required && <span className="text-red-400 ml-0.5">*</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {(!milestones || milestones.length === 0) && (
          <EmptyState message="No milestones configured for this package" />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED UI ATOMS
// ═══════════════════════════════════════════════════════════

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-blue-600">{icon}</span>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const ss = STATE_STYLES[state] ?? STATE_STYLES.on_track;
  const label = state === 'on_track' ? 'On Track' : state === 'at_risk' ? 'At Risk' : 'Blocked';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border',
        ss.bg,
        ss.text,
        ss.border
      )}
    >
      <span className={cn('w-1 h-1 rounded-full', ss.dot)} />
      {label}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const ss = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low;
  return (
    <span
      className={cn(
        'text-[10px] font-semibold px-1.5 py-0.5 rounded border',
        ss.bg,
        ss.text,
        ss.border
      )}
    >
      {severity}
    </span>
  );
}

function ReadinessBar({ percent, wide }: { percent: number; wide?: boolean }) {
  const color = percent >= 80 ? 'bg-emerald-500' : percent >= 50 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className={cn('h-1.5 bg-slate-100 rounded-full overflow-hidden', wide ? 'w-24' : 'w-16')}>
      <div
        className={cn('h-full rounded-full transition-all', color)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center p-12">
      <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-xs text-slate-400">
      <Layers className="w-6 h-6 mb-2 text-slate-300" />
      {message}
    </div>
  );
}
