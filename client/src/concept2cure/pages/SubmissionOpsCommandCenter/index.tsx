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
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  Gauge,
  GitBranch,
  Layers,
  Lock,
  Mail,
  Package,
  RefreshCw,
  Settings,
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
  usePackages,
  useMarkDigestRead,
} from '../../hooks/useSubmissionOps';
import {
  BLOCKER_TYPES,
  OVERALL_STATES,
  SEVERITY_LEVELS,
  WAITING_STATE_LABELS,
  getPackageFamily,
  getStageLabel,
} from '../../config/submission-ops-domain';

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const STATE_DOT: Record<string, string> = {
  on_track: 'bg-emerald-500',
  at_risk: 'bg-amber-500',
  blocked: 'bg-red-500',
};

const SEVERITY_FG: Record<string, string> = {
  critical: 'text-red-600',
  high: 'text-orange-600',
  medium: 'text-amber-600',
  low: 'text-zinc-500',
};

type DrawerKind =
  | 'readiness'
  | 'bottlenecks'
  | 'hotspots'
  | 'workload'
  | 'timeline'
  | 'policies'
  | 'milestones'
  | 'digests'
  | 'automation'
  | null;

type QuickView =
  | 'reg_lead'
  | 'sub_mgr'
  | 'med_writer'
  | 'cmc_lead'
  | 'cro_pm'
  | 'device_ra'
  | 'cer_clinical'
  | 'qa_compliance'
  | 'executive'
  | 'publishing';

const QUICK_VIEWS: { key: QuickView; label: string }[] = [
  { key: 'reg_lead', label: 'Regulatory Lead' },
  { key: 'sub_mgr', label: 'Submission Manager' },
  { key: 'med_writer', label: 'Medical Writer' },
  { key: 'cmc_lead', label: 'CMC Lead' },
  { key: 'cro_pm', label: 'CRO PM' },
  { key: 'device_ra', label: 'Device RA' },
  { key: 'cer_clinical', label: 'CER / Clinical Eval' },
  { key: 'qa_compliance', label: 'QA / Compliance' },
  { key: 'executive', label: 'Executive' },
  { key: 'publishing', label: 'Publishing / Release' },
];

const DRAWER_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  readiness: { label: 'Readiness Matrix', icon: <Target className="w-4 h-4" /> },
  bottlenecks: { label: 'Approval Bottlenecks', icon: <Lock className="w-4 h-4" /> },
  hotspots: { label: 'Hotspot Density', icon: <Flame className="w-4 h-4" /> },
  workload: { label: 'Ownership & Workload', icon: <Users className="w-4 h-4" /> },
  timeline: { label: 'Timeline / Due Soon', icon: <Calendar className="w-4 h-4" /> },
  policies: { label: 'Policy Settings', icon: <Settings className="w-4 h-4" /> },
  milestones: { label: 'Milestone Gates', icon: <GitBranch className="w-4 h-4" /> },
  digests: { label: 'Digest Center', icon: <Mail className="w-4 h-4" /> },
  automation: { label: 'Automation Log', icon: <Zap className="w-4 h-4" /> },
};

// Grouping logic per package family
export function getDefaultGrouping(familyKey?: string): string {
  if (!familyKey) return 'severity';
  const f = familyKey.toLowerCase();
  if (
    [
      'ind',
      'cta',
      'nda',
      'bla',
      'pre_ind',
      'amendment',
      'meeting_package',
      'scientific_advice',
      'interact',
    ].includes(f)
  )
    return 'ctd_module';
  if (['cmc_variation', 'cmc_supplement'].includes(f)) return 'cmc_subsection';
  if (['fiveten_k', 'de_novo', 'pma', 'pma_supplement'].includes(f)) return 'device_workstream';
  if (['cer', 'cer_update'].includes(f)) return 'cer_chapter';
  if (['ivdr_perf_eval', 'ivdr_td', 'ivdr_pms'].includes(f)) return 'evidence_family';
  if (['response_package', 'deficiency_response'].includes(f)) return 'deficiency_area';
  return 'severity';
}

// Quick-view preset filters (consumed by future grouping/sorting)
export function getQuickViewFilters(qv: QuickView) {
  switch (qv) {
    case 'reg_lead':
      return {
        sortBy: 'severity',
        filterSeverity: ['critical', 'high'],
        filterStatus: ['blocked', 'at_risk'],
      };
    case 'sub_mgr':
      return { sortBy: 'overdue', filterStatus: ['blocked', 'at_risk'] };
    case 'med_writer':
      return { sortBy: 'age', filterOwnership: 'authored' };
    case 'cmc_lead':
      return { sortBy: 'severity', filterSection: 'module3_cmc' };
    case 'cro_pm':
      return { sortBy: 'handoff', filterOwnership: 'cro' };
    case 'device_ra':
      return { sortBy: 'severity', filterIndustry: 'medtech' };
    case 'cer_clinical':
      return { sortBy: 'severity', filterSection: 'cer' };
    case 'qa_compliance':
      return { sortBy: 'severity', filterBlockerType: 'compliance_finding' };
    case 'executive':
      return { sortBy: 'readiness', filterStatus: ['blocked'] };
    case 'publishing':
      return { sortBy: 'severity', filterBlockerType: 'publish_blocked' };
    default:
      return {};
  }
}

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
  // ── State ──
  const [selectedPackageId, setSelectedPackageId] = useState<string>();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedItemKind, setSelectedItemKind] = useState<
    'blocker' | 'bottleneck' | 'area' | null
  >(null);
  const [activeDrawer, setActiveDrawer] = useState<DrawerKind>(null);
  const [quickView, setQuickView] = useState<QuickView | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const [pkgDropdownOpen, setPkgDropdownOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [docFamilyFilter, setDocFamilyFilter] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // ── Data ──
  const { isLoading: ccLoading } = useCommandCenter(projectId);
  const { data: packages } = usePackages(projectId);
  const { data: blockers } = useBlockers(
    selectedPackageId ? { packageId: selectedPackageId } : undefined
  );
  const { data: readiness } = useReadiness(selectedPackageId);
  const { data: bottlenecks } = useApprovalBottlenecks(projectId);
  const { data: dueSoon } = useDueSoon(projectId);
  const { data: automationRuns } = useAutomationRuns(projectId);

  // ── Derived ──
  const selectedPkg = useMemo(
    () => (packages ?? []).find((p: any) => p.packageId === selectedPackageId),
    [packages, selectedPackageId]
  );
  const pkgFamily = selectedPkg ? getPackageFamily(selectedPkg.packageFamily) : undefined;
  const isDevice = pkgFamily?.industry === 'medtech';

  // Auto-select first package
  React.useEffect(() => {
    if (!selectedPackageId && packages?.length) {
      setSelectedPackageId(packages[0].packageId);
    }
  }, [packages, selectedPackageId]);

  // Filtered & grouped blocker list
  const processedItems = useMemo(() => {
    let items = [...(blockers ?? [])];
    // Severity filter
    if (severityFilter.length > 0) {
      items = items.filter((b: any) => severityFilter.includes(b.severity));
    }
    // Doc family filter
    if (docFamilyFilter) {
      items = items.filter((b: any) => b.documentFamily === docFamilyFilter);
    }
    // Sort
    items.sort((a: any, b: any) => {
      const sev = ['critical', 'high', 'medium', 'low'];
      return sev.indexOf(a.severity) - sev.indexOf(b.severity);
    });
    // Group
    const groups: Record<string, any[]> = {};
    for (const item of items) {
      const key = item.sectionLabel || item.blockerType || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [blockers, severityFilter, docFamilyFilter]);

  const totalBlockers = blockers?.length ?? 0;
  const criticalCount = (blockers ?? []).filter((b: any) => b.severity === 'critical').length;
  const overdueCount = (blockers ?? []).filter((b: any) => b.isOverdue).length;
  const readinessPercent = readiness?.overallReadiness ?? 0;
  const overallState = readiness?.overallState ?? 'on_track';

  const selectItem = useCallback((item: any, kind: 'blocker' | 'bottleneck' | 'area') => {
    setSelectedItem(item);
    setSelectedItemKind(kind);
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  if (ccLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div data-testid="submission-ops-root" className="flex-1 flex flex-col min-h-0 bg-white">
      {/* ── HEADER ── */}
      <div
        data-testid="submission-ops-header"
        className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white shrink-0"
      >
        {/* Package selector */}
        <div className="relative">
          <button
            data-testid="package-selector"
            onClick={() => setPkgDropdownOpen(!pkgDropdownOpen)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700 hover:text-zinc-900"
          >
            <Package className="w-3.5 h-3.5 text-blue-500" />
            <span className="truncate max-w-[180px]">
              {selectedPkg?.label || projectName || 'Select Package'}
            </span>
            <ChevronDown className="w-3 h-3 text-zinc-400" />
          </button>
          {pkgDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-zinc-200 rounded shadow-lg min-w-[200px] py-1">
              {(packages ?? []).map((pkg: any) => (
                <button
                  key={pkg.packageId}
                  onClick={() => {
                    setSelectedPackageId(pkg.packageId);
                    setPkgDropdownOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-50',
                    pkg.packageId === selectedPackageId
                      ? 'text-blue-700 bg-blue-50 font-medium'
                      : 'text-zinc-700'
                  )}
                >
                  {pkg.label}
                  <span className="ml-2 text-[10px] text-zinc-400">{pkg.packageFamily}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="text-zinc-200">·</span>

        {/* State pill */}
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded',
            overallState === 'on_track' && 'bg-emerald-50 text-emerald-700',
            overallState === 'at_risk' && 'bg-amber-50 text-amber-700',
            overallState === 'blocked' && 'bg-red-50 text-red-700'
          )}
        >
          <span
            className={cn('w-1.5 h-1.5 rounded-full', STATE_DOT[overallState] || 'bg-zinc-400')}
          />
          {OVERALL_STATES.find(s => s.key === overallState)?.label ?? overallState}
        </span>

        {/* Summary counters */}
        <div
          data-testid="summary-strip"
          className="flex items-center gap-3 text-[10px] text-zinc-500 ml-1"
        >
          <span title="Readiness" data-testid="kpi-readiness">
            <Target className="w-3 h-3 inline -mt-px mr-0.5 text-zinc-400" />
            {readinessPercent}%
          </span>
          <span title="Blockers" data-testid="kpi-blockers">
            <XCircle className="w-3 h-3 inline -mt-px mr-0.5 text-zinc-400" />
            {totalBlockers}
          </span>
          <span title="Critical" data-testid="kpi-critical">
            <AlertCircle className="w-3 h-3 inline -mt-px mr-0.5 text-red-400" />
            {criticalCount}
          </span>
          <span title="Overdue" data-testid="kpi-overdue">
            <Clock className="w-3 h-3 inline -mt-px mr-0.5 text-amber-400" />
            {overdueCount}
          </span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Quick-view preset */}
        <div className="relative">
          <button
            data-testid="quick-view-selector"
            onClick={() => setQuickViewOpen(!quickViewOpen)}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded px-2 py-0.5"
          >
            <Gauge className="w-3 h-3" />
            {quickView ? QUICK_VIEWS.find(q => q.key === quickView)?.label : 'All Items'}
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          {quickViewOpen && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-zinc-200 rounded shadow-lg min-w-[180px] py-1">
              <button
                onClick={() => {
                  setQuickView(null);
                  setQuickViewOpen(false);
                }}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-50',
                  !quickView && 'text-blue-700 bg-blue-50 font-medium'
                )}
              >
                All Items
              </button>
              {QUICK_VIEWS.map(qv => (
                <button
                  key={qv.key}
                  onClick={() => {
                    setQuickView(qv.key);
                    setQuickViewOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-50',
                    quickView === qv.key ? 'text-blue-700 bg-blue-50 font-medium' : 'text-zinc-700'
                  )}
                >
                  {qv.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter chip */}
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className={cn(
            'flex items-center gap-1 text-[10px] border rounded px-2 py-0.5',
            severityFilter.length > 0 || docFamilyFilter
              ? 'border-blue-300 text-blue-700 bg-blue-50'
              : 'border-zinc-200 text-zinc-500 hover:text-zinc-700'
          )}
        >
          <Filter className="w-3 h-3" />
          Filter
          {(severityFilter.length > 0 || docFamilyFilter) && (
            <span className="ml-0.5 bg-blue-600 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center">
              {severityFilter.length + (docFamilyFilter ? 1 : 0)}
            </span>
          )}
        </button>

        {/* Drawer toolbar buttons */}
        <div
          data-testid="drawer-toolbar"
          className="flex items-center gap-0.5 ml-1 border-l border-zinc-100 pl-2"
        >
          {(
            [
              'readiness',
              'bottlenecks',
              'hotspots',
              'workload',
              'timeline',
              'automation',
              'digests',
              'policies',
              'milestones',
            ] as DrawerKind[]
          ).map(dk => {
            const d = DRAWER_LABELS[dk!];
            if (!d) return null;
            return (
              <button
                key={dk}
                data-testid={`drawer-btn-${dk}`}
                onClick={() => setActiveDrawer(activeDrawer === dk ? null : dk)}
                title={d.label}
                className={cn(
                  'p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600',
                  activeDrawer === dk && 'bg-blue-50 text-blue-600'
                )}
              >
                {React.cloneElement(d.icon as React.ReactElement, { className: 'w-3.5 h-3.5' })}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── FILTER BAR (conditional) ── */}
      {filterOpen && (
        <div className="flex items-center gap-3 px-3 h-8 border-b border-zinc-100 bg-zinc-50/50 shrink-0">
          <span className="text-[10px] font-medium text-zinc-500">Severity:</span>
          {SEVERITY_LEVELS.map(s => (
            <button
              key={s.key}
              onClick={() =>
                setSeverityFilter(prev =>
                  prev.includes(s.key) ? prev.filter(x => x !== s.key) : [...prev, s.key]
                )
              }
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border',
                severityFilter.includes(s.key)
                  ? 'border-blue-300 bg-blue-50 text-blue-700 font-medium'
                  : 'border-zinc-200 text-zinc-500 hover:border-zinc-300'
              )}
            >
              {s.label}
            </button>
          ))}
          <span className="text-zinc-200">|</span>
          <span className="text-[10px] font-medium text-zinc-500">Doc Family:</span>
          <select
            value={docFamilyFilter ?? ''}
            onChange={e => setDocFamilyFilter(e.target.value || null)}
            className="text-[10px] border border-zinc-200 rounded px-1.5 py-0.5 text-zinc-600 bg-white"
          >
            <option value="">All</option>
            {(BLOCKER_TYPES ?? []).slice(0, 15).map(bt => (
              <option key={bt.key} value={bt.key}>
                {bt.label}
              </option>
            ))}
          </select>
          {(severityFilter.length > 0 || docFamilyFilter) && (
            <button
              onClick={() => {
                setSeverityFilter([]);
                setDocFamilyFilter(null);
              }}
              className="text-[10px] text-blue-600 hover:text-blue-800 ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── SPLIT PANE BODY ── */}
      <div data-testid="split-pane" className="flex-1 flex min-h-0">
        {/* LEFT: Primary List */}
        <ScrollArea data-testid="blocker-list" className="flex-1 min-w-0">
          <div className="p-0">
            {Object.keys(processedItems).length === 0 ? (
              <EmptyState message="No blockers or items found for this package." />
            ) : (
              Object.entries(processedItems).map(([groupKey, items]) => (
                <div key={groupKey}>
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(groupKey)}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-zinc-50/80 border-b border-zinc-100 hover:bg-zinc-100/60 sticky top-0 z-10"
                  >
                    {collapsedGroups.has(groupKey) ? (
                      <ChevronRight className="w-3 h-3 text-zinc-400" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-zinc-400" />
                    )}
                    <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">
                      {groupKey}
                    </span>
                    <span className="text-[10px] text-zinc-400 ml-1">
                      {(items as any[]).length}
                    </span>
                    {(items as any[]).some((i: any) => i.severity === 'critical') && (
                      <AlertCircle className="w-3 h-3 text-red-500 ml-auto" />
                    )}
                  </button>
                  {/* Items */}
                  {!collapsedGroups.has(groupKey) &&
                    (items as any[]).map((item: any) => (
                      <BlockerRow
                        key={item.blockerId || item.id}
                        item={item}
                        isSelected={
                          selectedItem?.blockerId === item.blockerId || selectedItem?.id === item.id
                        }
                        isDevice={isDevice}
                        onClick={() => selectItem(item, 'blocker')}
                      />
                    ))}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* RIGHT: Inspector */}
        <div
          data-testid="inspector-panel"
          className="w-[280px] 2xl:w-[320px] border-l border-zinc-100 shrink-0 bg-white flex flex-col min-h-0"
        >
          <ScrollArea className="flex-1">
            {selectedItem && selectedItemKind === 'blocker' ? (
              <BlockerInspector
                item={selectedItem}
                isDevice={isDevice}
                onNavigateToArtifact={onNavigateToArtifact}
                onOpenDrawer={setActiveDrawer}
              />
            ) : selectedItem && selectedItemKind === 'bottleneck' ? (
              <BottleneckInspector item={selectedItem} />
            ) : selectedItem && selectedItemKind === 'area' ? (
              <AreaInspector item={selectedItem} />
            ) : (
              <DefaultInspector
                dueSoon={dueSoon}
                automationRuns={automationRuns}
                bottlenecks={bottlenecks}
              />
            )}
          </ScrollArea>
        </div>
      </div>

      {/* ── DRAWER (Sheet) ── */}
      <Sheet
        open={!!activeDrawer}
        onOpenChange={open => {
          if (!open) setActiveDrawer(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-[560px] 2xl:w-[640px] p-0 overflow-hidden flex flex-col"
        >
          {activeDrawer && (
            <>
              <div
                data-testid="drawer-header"
                className="flex items-center gap-2 px-4 h-10 border-b border-zinc-100 shrink-0"
              >
                {DRAWER_LABELS[activeDrawer]?.icon}
                <span data-testid="drawer-title" className="text-sm font-semibold text-zinc-800">
                  {DRAWER_LABELS[activeDrawer]?.label}
                </span>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4">
                  <DrawerContent
                    kind={activeDrawer}
                    projectId={projectId}
                    packageId={selectedPackageId}
                    isDevice={isDevice}
                    onNavigateToArtifact={onNavigateToArtifact}
                  />
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BLOCKER ROW
// ═══════════════════════════════════════════════════════════

function BlockerRow({
  item,
  isSelected,
  isDevice: _isDevice,
  onClick,
}: {
  item: any;
  isSelected: boolean;
  isDevice: boolean;
  onClick: () => void;
}) {
  const waitingLabel = item.waitingState ? WAITING_STATE_LABELS[item.waitingState] : null;
  const waitingColor = item.waitingState?.includes('cro')
    ? 'bg-blue-50 text-blue-700 border-blue-200'
    : item.waitingState?.includes('sponsor')
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : item.waitingState?.includes('blocked')
        ? 'bg-red-50 text-red-600 border-red-200'
        : 'bg-zinc-50 text-zinc-600 border-zinc-200';

  return (
    <button
      data-testid="blocker-row"
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-2 px-3 py-2 border-b border-zinc-50 text-left transition-colors',
        isSelected
          ? 'bg-blue-50/60 border-l-2 border-l-blue-500'
          : 'hover:bg-zinc-50/60 border-l-2 border-l-transparent'
      )}
    >
      {/* Severity indicator */}
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
          STATE_DOT[item.status] || 'bg-zinc-300'
        )}
      />

      <div className="flex-1 min-w-0">
        {/* Title + severity */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-zinc-800 truncate">
            {item.artifactTitle || item.title || 'Untitled'}
          </span>
          <span
            className={cn(
              'text-[9px] font-medium shrink-0',
              SEVERITY_FG[item.severity] || 'text-zinc-400'
            )}
          >
            {item.severity}
          </span>
        </div>

        {/* Secondary: doc family + blocker type */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {item.documentFamily && (
            <span className="text-[9px] text-zinc-400">{item.documentFamily}</span>
          )}
          <span className={cn('text-[9px]', SEVERITY_FG[item.severity] || 'text-zinc-400')}>
            {item.blockerType?.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Chips row */}
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {/* Approval class badge */}
          {item.approvalClass && (
            <span
              className={cn(
                'text-[8px] px-1 py-px rounded border font-medium',
                item.isOverdue
                  ? 'border-red-200 bg-red-50 text-red-600'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-500'
              )}
            >
              {item.approvalClass?.replace(/_/g, ' ')}
            </span>
          )}
          {/* Handoff state */}
          {waitingLabel && (
            <span className={cn('text-[8px] px-1 py-px rounded border font-medium', waitingColor)}>
              {waitingLabel}
            </span>
          )}
          {/* Overdue age */}
          {item.isOverdue && item.overdueHours && (
            <span className="text-[8px] text-red-500 font-medium">
              {Math.round(item.overdueHours / 24)}d overdue
            </span>
          )}
          {/* Owner */}
          {item.ownerName && (
            <span className="text-[8px] text-zinc-400 ml-auto truncate max-w-[80px]">
              {item.ownerName}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// INSPECTOR: Blocker Detail
// ═══════════════════════════════════════════════════════════

function BlockerInspector({
  item,
  isDevice,
  onNavigateToArtifact,
  onOpenDrawer,
}: {
  item: any;
  isDevice: boolean;
  onNavigateToArtifact?: (id: number) => void;
  onOpenDrawer: (drawer: DrawerKind) => void;
}) {
  return (
    <div className="p-3 space-y-3">
      {/* Title */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-800">{item.artifactTitle || item.title}</h3>
        {item.documentFamily && (
          <p className="text-[10px] text-zinc-400 mt-0.5">{item.documentFamily}</p>
        )}
      </div>

      {/* Stage */}
      {item.stage && (
        <InspectorField label="Stage">
          <span className="text-[10px] text-zinc-700">{getStageLabel(item.stage, isDevice)}</span>
        </InspectorField>
      )}

      {/* Blocker type + severity */}
      <InspectorField label="Blocker">
        <span className={cn('text-[10px] font-medium', SEVERITY_FG[item.severity])}>
          {item.blockerType?.replace(/_/g, ' ')}
        </span>
        <span
          className={cn(
            'text-[9px] ml-1.5 px-1 py-px rounded font-semibold',
            item.severity === 'critical'
              ? 'bg-red-100 text-red-700'
              : item.severity === 'high'
                ? 'bg-orange-100 text-orange-700'
                : item.severity === 'medium'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-zinc-100 text-zinc-600'
          )}
        >
          {item.severity}
        </span>
      </InspectorField>

      {/* Policy breach */}
      {item.policyBreachDescription && (
        <InspectorField label="Policy Breach">
          <p className="text-[10px] text-zinc-600">{item.policyBreachDescription}</p>
        </InspectorField>
      )}

      {/* Owner + role */}
      {item.ownerName && (
        <InspectorField label="Owner">
          <span className="text-[10px] text-zinc-700">{item.ownerName}</span>
          {item.ownerRole && (
            <span className="text-[10px] text-zinc-400 ml-1">({item.ownerRole})</span>
          )}
          {item.ownershipType && (
            <span
              className={cn(
                'text-[8px] ml-1.5 px-1 py-px rounded border font-medium',
                item.ownershipType === 'cro'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-500'
              )}
            >
              {item.ownershipType}
            </span>
          )}
        </InspectorField>
      )}

      {/* Due date */}
      {item.dueDate && (
        <InspectorField label="Due">
          <span
            className={cn(
              'text-[10px]',
              item.isOverdue ? 'text-red-600 font-medium' : 'text-zinc-600'
            )}
          >
            {new Date(item.dueDate).toLocaleDateString()}
            {item.isOverdue &&
              item.overdueHours &&
              ` (${Math.round(item.overdueHours / 24)}d overdue)`}
          </span>
        </InspectorField>
      )}

      {/* Linked counts */}
      <InspectorField label="Linked">
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          {item.threadCount != null && <span>{item.threadCount} threads</span>}
          {item.taskCount != null && <span>{item.taskCount} tasks</span>}
          {item.approvalCount != null && <span>{item.approvalCount} approvals</span>}
        </div>
      </InspectorField>

      {/* Next action */}
      {item.nextAction && (
        <InspectorField label="Next Action">
          <p className="text-[10px] text-zinc-700 font-medium">{item.nextAction}</p>
        </InspectorField>
      )}

      {/* Jump links */}
      <div className="flex flex-col gap-1 pt-2 border-t border-zinc-100">
        {item.artifactId && onNavigateToArtifact && (
          <button
            onClick={() => onNavigateToArtifact(item.artifactId)}
            className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800"
          >
            <ExternalLink className="w-3 h-3" /> Open Artifact
          </button>
        )}
        <button
          onClick={() => onOpenDrawer('readiness')}
          className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800"
        >
          <Target className="w-3 h-3" /> View Readiness
        </button>
        <button
          onClick={() => onOpenDrawer('bottlenecks')}
          className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800"
        >
          <Lock className="w-3 h-3" /> View Bottlenecks
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// INSPECTOR: Bottleneck Detail
// ═══════════════════════════════════════════════════════════

function BottleneckInspector({ item }: { item: any }) {
  return (
    <div className="p-3 space-y-3">
      <h3 className="text-xs font-semibold text-zinc-800">Approval Bottleneck</h3>
      <InspectorField label="Approval Class">
        <span className="text-[10px] text-zinc-700">{item.approvalClass?.replace(/_/g, ' ')}</span>
      </InspectorField>
      {item.approverRole && (
        <InspectorField label="Approver Role">
          <span className="text-[10px] text-zinc-700">{item.approverRole}</span>
        </InspectorField>
      )}
      {item.waitingDuration && (
        <InspectorField label="Waiting">
          <span className="text-[10px] text-amber-600">{item.waitingDuration}</span>
        </InspectorField>
      )}
      {item.openFindings != null && (
        <InspectorField label="Open Findings">
          <span className="text-[10px] text-zinc-700">{item.openFindings} preventing signoff</span>
        </InspectorField>
      )}
      <InspectorField label="Publish Ready">
        <span
          className={cn('text-[10px]', item.publishBlocked ? 'text-red-600' : 'text-emerald-600')}
        >
          {item.publishBlocked ? 'Blocked' : 'Ready'}
        </span>
      </InspectorField>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// INSPECTOR: Area / Package Section
// ═══════════════════════════════════════════════════════════

function AreaInspector({ item }: { item: any }) {
  return (
    <div className="p-3 space-y-3">
      <h3 className="text-xs font-semibold text-zinc-800">{item.sectionLabel || 'Package Area'}</h3>
      {item.readinessPercent != null && (
        <InspectorField label="Readiness">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  item.readinessPercent >= 80
                    ? 'bg-emerald-500'
                    : item.readinessPercent >= 50
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                )}
                style={{ width: `${item.readinessPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-600 font-medium">{item.readinessPercent}%</span>
          </div>
        </InspectorField>
      )}
      {item.criticalItems != null && (
        <InspectorField label="Critical Items">
          <span className="text-[10px] text-red-600">{item.criticalItems}</span>
        </InspectorField>
      )}
      {item.overdueItems != null && (
        <InspectorField label="Overdue">
          <span className="text-[10px] text-amber-600">{item.overdueItems}</span>
        </InspectorField>
      )}
      {item.trend && (
        <InspectorField label="Trend">
          <span
            className={cn(
              'text-[10px] flex items-center gap-0.5',
              item.trend === 'improving'
                ? 'text-emerald-600'
                : item.trend === 'declining'
                  ? 'text-red-600'
                  : 'text-zinc-500'
            )}
          >
            {item.trend === 'improving' ? (
              <TrendingUp className="w-3 h-3" />
            ) : item.trend === 'declining' ? (
              <TrendingDown className="w-3 h-3" />
            ) : null}
            {item.trend}
          </span>
        </InspectorField>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// INSPECTOR: Default (nothing selected)
// ═══════════════════════════════════════════════════════════

function DefaultInspector({
  dueSoon,
  automationRuns,
  bottlenecks,
}: {
  dueSoon: any;
  automationRuns: any;
  bottlenecks: any;
}) {
  const upcomingApprovals = (bottlenecks ?? []).slice(0, 5);
  const recentActions = (automationRuns ?? []).slice(0, 5);
  const dueSoonItems = dueSoon?.items?.slice(0, 5) ?? [];

  return (
    <div className="p-3 space-y-4">
      {/* Approvals due soon */}
      <div>
        <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
          Approvals Due Soon
        </h4>
        {upcomingApprovals.length === 0 ? (
          <p className="text-[10px] text-zinc-400">No pending approvals</p>
        ) : (
          upcomingApprovals.map((a: any, i: number) => (
            <div
              key={i}
              className="flex items-center gap-1.5 py-1 border-b border-zinc-50 last:border-0"
            >
              <Lock className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-[10px] text-zinc-700 truncate flex-1">
                {a.artifactTitle || a.title || 'Approval'}
              </span>
              <span className="text-[9px] text-zinc-400 shrink-0">
                {a.approvalClass?.replace(/_/g, ' ')}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Due soon timeline */}
      <div>
        <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
          Due Soon
        </h4>
        {dueSoonItems.length === 0 ? (
          <p className="text-[10px] text-zinc-400">Nothing due in next 48h</p>
        ) : (
          dueSoonItems.map((d: any, i: number) => (
            <div
              key={i}
              className="flex items-center gap-1.5 py-1 border-b border-zinc-50 last:border-0"
            >
              <Clock className="w-3 h-3 text-zinc-400 shrink-0" />
              <span className="text-[10px] text-zinc-700 truncate flex-1">
                {d.title || d.artifactTitle || 'Item'}
              </span>
              <span className="text-[9px] text-zinc-400 shrink-0">
                {d.dueDate ? new Date(d.dueDate).toLocaleDateString() : ''}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Recent automation */}
      <div>
        <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
          Recent Automation
        </h4>
        {recentActions.length === 0 ? (
          <p className="text-[10px] text-zinc-400">No recent automation</p>
        ) : (
          recentActions.map((r: any, i: number) => (
            <div
              key={i}
              className="flex items-center gap-1.5 py-1 border-b border-zinc-50 last:border-0"
            >
              <Zap className="w-3 h-3 text-zinc-400 shrink-0" />
              <span className="text-[10px] text-zinc-600 truncate flex-1">
                {r.status === 'completed' ? 'Sweep completed' : r.status}
              </span>
              <span className="text-[9px] text-zinc-400 shrink-0">
                {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// INSPECTOR FIELD
// ═══════════════════════════════════════════════════════════

function InspectorField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">
        {label}
      </span>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DRAWER CONTENT ROUTER
// ═══════════════════════════════════════════════════════════

function DrawerContent({
  kind,
  projectId,
  packageId,
  isDevice,
  onNavigateToArtifact: _onNavigateToArtifact,
}: {
  kind: DrawerKind;
  projectId: number;
  packageId?: string;
  isDevice: boolean;
  onNavigateToArtifact?: (id: number) => void;
}) {
  switch (kind) {
    case 'readiness':
      return <ReadinessDrawer packageId={packageId} isDevice={isDevice} />;
    case 'bottlenecks':
      return <BottlenecksDrawer projectId={projectId} />;
    case 'hotspots':
      return <HotspotsDrawer packageId={packageId} />;
    case 'workload':
      return <WorkloadDrawer projectId={projectId} />;
    case 'timeline':
      return <TimelineDrawer projectId={projectId} />;
    case 'policies':
      return <PoliciesDrawer />;
    case 'milestones':
      return <MilestonesDrawer packageId={packageId} />;
    case 'digests':
      return <DigestsDrawer projectId={projectId} />;
    case 'automation':
      return <AutomationDrawer projectId={projectId} />;
    default:
      return null;
  }
}

// ── Readiness Drawer ──

function ReadinessDrawer({
  packageId,
  isDevice: _isDevice,
}: {
  packageId?: string;
  isDevice: boolean;
}) {
  const { data: readiness, isLoading } = useReadiness(packageId);
  if (isLoading) return <DrawerLoading />;
  if (!readiness) return <DrawerEmpty message="No readiness data" />;
  const sections = readiness.sections ?? [];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-zinc-800">
          Overall: {readiness.overallReadiness ?? 0}%
        </span>
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded font-medium',
            readiness.overallState === 'on_track' && 'bg-emerald-50 text-emerald-700',
            readiness.overallState === 'at_risk' && 'bg-amber-50 text-amber-700',
            readiness.overallState === 'blocked' && 'bg-red-50 text-red-700'
          )}
        >
          {readiness.overallState}
        </span>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-zinc-200">
            <th className="text-left py-1.5 font-semibold text-zinc-500">Section</th>
            <th className="text-right py-1.5 font-semibold text-zinc-500 w-16">Ready</th>
            <th className="text-right py-1.5 font-semibold text-zinc-500 w-16">State</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s: any, i: number) => (
            <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50/50">
              <td className="py-1.5 text-zinc-700">{s.label || s.sectionKey}</td>
              <td className="py-1.5 text-right">
                <span
                  className={cn(
                    'font-medium',
                    s.readiness >= 80
                      ? 'text-emerald-600'
                      : s.readiness >= 50
                        ? 'text-amber-600'
                        : 'text-red-600'
                  )}
                >
                  {s.readiness ?? 0}%
                </span>
              </td>
              <td className="py-1.5 text-right">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full inline-block',
                    STATE_DOT[s.state] || 'bg-zinc-300'
                  )}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Bottlenecks Drawer ──

function BottlenecksDrawer({ projectId }: { projectId: number }) {
  const { data: bottlenecks, isLoading } = useApprovalBottlenecks(projectId);
  if (isLoading) return <DrawerLoading />;
  if (!bottlenecks?.length) return <DrawerEmpty message="No approval bottlenecks" />;
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-zinc-200">
          <th className="text-left py-1.5 font-semibold text-zinc-500">Artifact</th>
          <th className="text-left py-1.5 font-semibold text-zinc-500">Class</th>
          <th className="text-left py-1.5 font-semibold text-zinc-500">Approver</th>
          <th className="text-right py-1.5 font-semibold text-zinc-500">Wait</th>
        </tr>
      </thead>
      <tbody>
        {bottlenecks.map((b: any, i: number) => (
          <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50/50">
            <td className="py-1.5 text-zinc-700 truncate max-w-[160px]">
              {b.artifactTitle || b.title || '—'}
            </td>
            <td className="py-1.5 text-zinc-500">{b.approvalClass?.replace(/_/g, ' ')}</td>
            <td className="py-1.5 text-zinc-500">{b.approverName || b.approverRole || '—'}</td>
            <td className="py-1.5 text-right text-amber-600">
              {b.waitingHours ? `${Math.round(b.waitingHours / 24)}d` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Hotspots Drawer ──

function HotspotsDrawer({ packageId }: { packageId?: string }) {
  const { data: hotspots, isLoading } = useHotspots(packageId);
  if (isLoading) return <DrawerLoading />;
  if (!hotspots?.length) return <DrawerEmpty message="No hotspots detected" />;
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-zinc-200">
          <th className="text-left py-1.5 font-semibold text-zinc-500">Artifact</th>
          <th className="text-right py-1.5 font-semibold text-zinc-500">Threads</th>
          <th className="text-right py-1.5 font-semibold text-zinc-500">Changes</th>
          <th className="text-right py-1.5 font-semibold text-zinc-500">Heat</th>
        </tr>
      </thead>
      <tbody>
        {hotspots.map((h: any, i: number) => (
          <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50/50">
            <td className="py-1.5 text-zinc-700 truncate max-w-[200px]">
              {h.artifactTitle || h.title || '—'}
            </td>
            <td className="py-1.5 text-right text-zinc-500">{h.threadCount ?? 0}</td>
            <td className="py-1.5 text-right text-zinc-500">{h.changeCount ?? 0}</td>
            <td className="py-1.5 text-right">
              <span
                className={cn(
                  'text-[10px] font-medium',
                  h.heat === 'critical'
                    ? 'text-red-600'
                    : h.heat === 'high'
                      ? 'text-orange-600'
                      : 'text-amber-600'
                )}
              >
                {h.heat}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Workload Drawer ──

function WorkloadDrawer({ projectId }: { projectId: number }) {
  const { data: workload, isLoading } = useWorkload(projectId);
  if (isLoading) return <DrawerLoading />;
  if (!workload?.length) return <DrawerEmpty message="No workload data" />;
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-zinc-200">
          <th className="text-left py-1.5 font-semibold text-zinc-500">Owner</th>
          <th className="text-left py-1.5 font-semibold text-zinc-500">Role</th>
          <th className="text-right py-1.5 font-semibold text-zinc-500">Open</th>
          <th className="text-right py-1.5 font-semibold text-zinc-500">Overdue</th>
        </tr>
      </thead>
      <tbody>
        {workload.map((w: any, i: number) => (
          <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50/50">
            <td className="py-1.5 text-zinc-700">{w.ownerName || '—'}</td>
            <td className="py-1.5 text-zinc-500">{w.role || '—'}</td>
            <td className="py-1.5 text-right text-zinc-600">{w.openItems ?? 0}</td>
            <td className="py-1.5 text-right">
              <span
                className={cn(w.overdueItems > 0 ? 'text-red-600 font-medium' : 'text-zinc-400')}
              >
                {w.overdueItems ?? 0}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Timeline Drawer ──

function TimelineDrawer({ projectId }: { projectId: number }) {
  const { data: dueSoon, isLoading } = useDueSoon(projectId);
  if (isLoading) return <DrawerLoading />;
  const items = dueSoon?.items ?? [];
  if (!items.length) return <DrawerEmpty message="Nothing due soon" />;
  return (
    <div className="space-y-1">
      {items.map((d: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-1.5 border-b border-zinc-50">
          <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-zinc-700 truncate">{d.title || d.artifactTitle}</p>
            <p className="text-[9px] text-zinc-400">{d.type || d.itemType}</p>
          </div>
          <span
            className={cn(
              'text-[10px] shrink-0',
              d.isOverdue ? 'text-red-600 font-medium' : 'text-zinc-500'
            )}
          >
            {d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Policies Drawer ──

function PoliciesDrawer() {
  const { data: policies, isLoading } = usePolicies();
  if (isLoading) return <DrawerLoading />;
  if (!policies?.length) return <DrawerEmpty message="No policies configured" />;
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-zinc-200">
          <th className="text-left py-1.5 font-semibold text-zinc-500">Policy</th>
          <th className="text-left py-1.5 font-semibold text-zinc-500">Scope</th>
          <th className="text-right py-1.5 font-semibold text-zinc-500">Review</th>
          <th className="text-right py-1.5 font-semibold text-zinc-500">Overdue</th>
        </tr>
      </thead>
      <tbody>
        {policies.map((p: any, i: number) => (
          <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50/50">
            <td className="py-1.5 text-zinc-700">{p.name || p.policyId}</td>
            <td className="py-1.5 text-zinc-500 truncate max-w-[120px]">
              {p.packageFamily || p.documentFamily || 'All'}
            </td>
            <td className="py-1.5 text-right text-zinc-600">
              {p.reviewWindowHours ? `${p.reviewWindowHours}h` : '—'}
            </td>
            <td className="py-1.5 text-right text-zinc-600">
              {p.overdueThresholdHours ? `${p.overdueThresholdHours}h` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Milestones Drawer ──

function MilestonesDrawer({ packageId }: { packageId?: string }) {
  const { data: milestones, isLoading } = useMilestones(packageId);
  if (isLoading) return <DrawerLoading />;
  if (!milestones?.length) return <DrawerEmpty message="No milestones" />;
  return (
    <div className="space-y-2">
      {milestones.map((m: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-2 border-b border-zinc-100">
          <span
            className={cn(
              'w-2 h-2 rounded-full shrink-0',
              m.status === 'completed'
                ? 'bg-emerald-500'
                : m.status === 'blocked'
                  ? 'bg-red-500'
                  : 'bg-zinc-300'
            )}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-zinc-700">{m.label || m.name}</p>
            <p className="text-[9px] text-zinc-400">
              {m.targetDate ? `Target: ${new Date(m.targetDate).toLocaleDateString()}` : ''}
              {m.gateType && ` · ${m.gateType}`}
            </p>
          </div>
          <span
            className={cn(
              'text-[10px]',
              m.status === 'completed'
                ? 'text-emerald-600'
                : m.status === 'blocked'
                  ? 'text-red-600'
                  : 'text-zinc-500'
            )}
          >
            {m.status || 'pending'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Digests Drawer ──

function DigestsDrawer({ projectId }: { projectId: number }) {
  const { data: digests, isLoading } = useDigests(projectId);
  const markRead = useMarkDigestRead();
  if (isLoading) return <DrawerLoading />;
  if (!digests?.length) return <DrawerEmpty message="No digests" />;
  return (
    <div className="space-y-1">
      {digests.map((d: any, i: number) => (
        <div
          key={i}
          className={cn(
            'flex items-start gap-2 py-2 border-b border-zinc-50',
            !d.readAt && 'bg-blue-50/30'
          )}
        >
          <Mail
            className={cn(
              'w-3.5 h-3.5 mt-0.5 shrink-0',
              d.readAt ? 'text-zinc-300' : 'text-blue-500'
            )}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-zinc-700">{d.subject || d.digestType}</p>
            <p className="text-[9px] text-zinc-400">
              {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : ''}
            </p>
          </div>
          {!d.readAt && (
            <button
              onClick={() => markRead.mutate(d.digestId)}
              className="text-[9px] text-blue-600 hover:text-blue-800 shrink-0"
            >
              Mark read
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Automation Drawer ──

function AutomationDrawer({ projectId }: { projectId: number }) {
  const { data: runs, isLoading } = useAutomationRuns(projectId);
  if (isLoading) return <DrawerLoading />;
  if (!runs?.length) return <DrawerEmpty message="No automation runs" />;
  return (
    <div className="space-y-1">
      {runs.map((r: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-2 border-b border-zinc-50">
          <Zap
            className={cn(
              'w-3.5 h-3.5 shrink-0',
              r.status === 'completed'
                ? 'text-emerald-500'
                : r.status === 'failed'
                  ? 'text-red-500'
                  : 'text-zinc-400'
            )}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-zinc-700">
              Sweep {r.status === 'completed' ? 'completed' : r.status}
            </p>
            <p className="text-[9px] text-zinc-400">
              {r.actionsCreated ?? 0} actions ·{' '}
              {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
            </p>
          </div>
          <span
            className={cn(
              'text-[10px]',
              r.status === 'completed'
                ? 'text-emerald-600'
                : r.status === 'failed'
                  ? 'text-red-600'
                  : 'text-zinc-500'
            )}
          >
            {r.durationMs ? `${Math.round(r.durationMs / 1000)}s` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════════════

function DrawerLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="w-4 h-4 animate-spin text-zinc-400" />
    </div>
  );
}

function DrawerEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-[11px] text-zinc-400">
      <Layers className="w-5 h-5 mb-2 text-zinc-300" />
      {message}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-xs text-zinc-400">
      <Layers className="w-6 h-6 mb-2 text-zinc-300" />
      {message}
    </div>
  );
}
