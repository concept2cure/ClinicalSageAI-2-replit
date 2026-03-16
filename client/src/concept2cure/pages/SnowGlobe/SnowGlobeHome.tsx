/**
 * @fileoverview AnA Snow Globe — Prediction & Intelligence Engine
 * @module concept2cure/pages/SnowGlobe/SnowGlobeHome
 * @version 1.0.0
 *
 * @description
 * "War Room" style dashboard surfacing cross-platform prediction scores,
 * chamber-level findings, remediation priorities, and scenario management
 * for regulatory / clinical programs.
 *
 * Design: zinc/blue/emerald palette, rounded-xl borders, Tailwind utility
 * classes, lucide-react icons.
 *
 * @compliance
 * - FDA 21 CFR Part 11: All mutations audit-logged server-side
 * - Multi-tenant: Org-scoped data only
 */

import React, { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';

const ScenarioComparison = lazy(() => import('./ScenarioComparison'));
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  FileCheck,
  FlaskConical,
  Info,
  Loader2,
  Minus,
  Play,
  Plus,
  RefreshCw,
  ScanLine,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

import {
  useProgramScores,
  useTopFindings,
  useRemediationPlan,
  useScenarios,
  useRunFullStressTest,
  useRunPreAgencyScan,
} from '../../hooks/useSnowGlobe';

// =============================================================================
// TYPES
// =============================================================================

interface SnowGlobeHomeProps {
  programId: number | null;
}

interface ScoreCardDef {
  key: string;
  label: string;
  lowerIsBetter: boolean;
}

type SeverityBand = 'green' | 'amber' | 'red';
type Trend = 'up' | 'down' | 'flat';
type ChamberKey =
  | 'agency_screen'
  | 'reviewer_attack'
  | 'audit_inspection'
  | 'route_timing'
  | 'evidence_sufficiency'
  | 'collaboration_fragility';

type EffortLevel = 'low' | 'medium' | 'high';

interface ScoreEntry {
  key: string;
  value: number;
  trend: Trend;
  explanation: string;
}

interface Finding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  chamber: ChamberKey;
  summary: string;
  blastRadius: number; // 1-5
}

interface RemediationAction {
  id: string;
  priority: number;
  title: string;
  effort: EffortLevel;
  impact: 'critical' | 'high' | 'medium' | 'low';
  why: string;
}

interface Scenario {
  id: string;
  name: string;
  isBaseline: boolean;
  lastRunAt: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SCORE_CARDS: ScoreCardDef[] = [
  { key: 'pre_technical_rejection', label: 'Pre-Technical Rejection', lowerIsBetter: true },
  { key: 'submission_survival', label: 'Submission Survival', lowerIsBetter: false },
  { key: 'reviewer_friction', label: 'Reviewer Friction', lowerIsBetter: true },
  { key: 'audit_exposure', label: 'Audit Exposure', lowerIsBetter: true },
  { key: 'claim_defensibility', label: 'Claim Defensibility', lowerIsBetter: false },
  { key: 'traceability_integrity', label: 'Traceability Integrity', lowerIsBetter: false },
  { key: 'route_viability', label: 'Route Viability', lowerIsBetter: false },
  { key: 'approval_chain_fragility', label: 'Approval Chain Fragility', lowerIsBetter: true },
];

const CHAMBER_CONFIG: Record<
  ChamberKey,
  { label: string; icon: React.ElementType; accent: string; bg: string; border: string }
> = {
  agency_screen: {
    label: 'Agency Screen',
    icon: FileCheck,
    accent: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  reviewer_attack: {
    label: 'Reviewer Attack',
    icon: AlertTriangle,
    accent: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
  audit_inspection: {
    label: 'Audit & Inspection',
    icon: Shield,
    accent: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
  },
  route_timing: {
    label: 'Route & Timing',
    icon: Clock,
    accent: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
  },
  evidence_sufficiency: {
    label: 'Evidence Sufficiency',
    icon: FlaskConical,
    accent: 'text-teal-600',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
  },
  collaboration_fragility: {
    label: 'Collaboration Fragility',
    icon: Users,
    accent: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
};

const SEVERITY_STYLES: Record<
  'critical' | 'high' | 'medium' | 'low',
  { dot: string; badge: string; label: string }
> = {
  critical: {
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700 border-red-200',
    label: 'Critical',
  },
  high: {
    dot: 'bg-orange-500',
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
    label: 'High',
  },
  medium: {
    dot: 'bg-yellow-500',
    badge: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    label: 'Medium',
  },
  low: {
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    label: 'Low',
  },
};

const EFFORT_STYLES: Record<EffortLevel, { badge: string; label: string }> = {
  low: { badge: 'bg-emerald-100 text-emerald-700', label: 'Low' },
  medium: { badge: 'bg-yellow-100 text-yellow-700', label: 'Medium' },
  high: { badge: 'bg-red-100 text-red-700', label: 'High' },
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getSeverityBand(value: number, lowerIsBetter: boolean): SeverityBand {
  const effective = lowerIsBetter ? 100 - value : value;
  if (effective > 75) return 'green';
  if (effective >= 50) return 'amber';
  return 'red';
}

function getBandStyles(band: SeverityBand): { text: string; bg: string; ring: string } {
  switch (band) {
    case 'green':
      return { text: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200' };
    case 'amber':
      return { text: 'text-amber-600', bg: 'bg-amber-50', ring: 'ring-amber-200' };
    case 'red':
      return { text: 'text-red-600', bg: 'bg-red-50', ring: 'ring-red-200' };
  }
}

function getTrendIcon(trend: Trend, lowerIsBetter: boolean) {
  if (trend === 'flat') return <Minus className="h-4 w-4 text-zinc-400" />;
  const isPositive = lowerIsBetter ? trend === 'down' : trend === 'up';
  if (trend === 'up') {
    return (
      <TrendingUp
        className={cn('h-4 w-4', isPositive ? 'text-emerald-500' : 'text-red-500')}
      />
    );
  }
  return (
    <TrendingDown
      className={cn('h-4 w-4', isPositive ? 'text-emerald-500' : 'text-red-500')}
    />
  );
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  } catch {
    return iso;
  }
}

function blastRadiusDots(radius: number): React.ReactNode {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Blast radius: ${radius}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            i < radius ? 'bg-red-400' : 'bg-zinc-200',
          )}
        />
      ))}
    </span>
  );
}

// =============================================================================
// SKELETON COMPONENTS
// =============================================================================

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 p-5',
        className,
      )}
    >
      <div className="mb-3 h-3 w-24 rounded bg-zinc-200" />
      <div className="mb-2 h-8 w-16 rounded bg-zinc-200" />
      <div className="h-2 w-32 rounded bg-zinc-100" />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex animate-pulse items-center gap-3 border-b border-zinc-100 px-4 py-3">
      <div className="h-5 w-16 rounded bg-zinc-200" />
      <div className="h-4 flex-1 rounded bg-zinc-100" />
      <div className="h-4 w-12 rounded bg-zinc-100" />
    </div>
  );
}

function SectionSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-zinc-400">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/** Individual score card in the 8-card strip. */
function ScoreCard({
  def,
  entry,
}: {
  def: ScoreCardDef;
  entry: ScoreEntry | undefined;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!entry) return <SkeletonCard />;

  const band = getSeverityBand(entry.value, def.lowerIsBetter);
  const styles = getBandStyles(band);

  return (
    <div
      className={cn(
        'relative rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md',
        'ring-1',
        styles.ring,
      )}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Tooltip */}
      {showTooltip && entry.explanation && (
        <div className="absolute -top-2 left-1/2 z-30 -translate-x-1/2 -translate-y-full">
          <div className="max-w-56 rounded-lg border border-zinc-200 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 shadow-lg">
            {entry.explanation}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500 leading-tight">{def.label}</span>
        <Info className="h-3.5 w-3.5 text-zinc-300" />
      </div>

      {/* Score value */}
      <div className="flex items-end gap-2">
        <span className={cn('text-3xl font-bold tabular-nums', styles.text)}>
          {Math.round(entry.value)}
        </span>
        <span className={cn('mb-1 text-sm font-medium', styles.text)}>%</span>
        <div className="mb-1.5 ml-auto">
          {getTrendIcon(entry.trend, def.lowerIsBetter)}
        </div>
      </div>

      {/* Severity band indicator bar */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            band === 'green' && 'bg-emerald-400',
            band === 'amber' && 'bg-amber-400',
            band === 'red' && 'bg-red-400',
          )}
          style={{ width: `${Math.min(entry.value, 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Chamber summary card in the 2x3 grid. */
function ChamberCard({
  chamberKey,
  score,
  topFinding,
  onDeepDive,
}: {
  chamberKey: ChamberKey;
  score: number | undefined;
  topFinding: string | undefined;
  onDeepDive: () => void;
}) {
  const config = CHAMBER_CONFIG[chamberKey];
  const Icon = config.icon;

  const band: SeverityBand =
    score === undefined ? 'amber' : score > 75 ? 'green' : score >= 50 ? 'amber' : 'red';
  const bandStyle = getBandStyles(band);

  return (
    <div
      className={cn(
        'group flex flex-col rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md',
        config.border,
      )}
    >
      {/* Chamber header */}
      <div className="mb-3 flex items-center gap-3">
        <div className={cn('rounded-lg p-2', config.bg)}>
          <Icon className={cn('h-5 w-5', config.accent)} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-zinc-800">{config.label}</h3>
          {score !== undefined && (
            <span className={cn('text-xs font-medium', bandStyle.text)}>
              Score: {Math.round(score)}%
            </span>
          )}
        </div>
      </div>

      {/* Top finding preview */}
      <p className="mb-4 flex-1 text-xs leading-relaxed text-zinc-500">
        {topFinding ?? 'No findings yet. Run a scan to populate.'}
      </p>

      {/* Deep dive button */}
      <button
        onClick={onDeepDive}
        className={cn(
          'inline-flex items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-xs font-medium',
          'border transition-colors',
          config.border,
          config.accent,
          'hover:bg-zinc-50',
        )}
      >
        Deep Dive
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Single finding row in the Top Findings Panel. */
function FindingRow({ finding }: { finding: Finding }) {
  const sev = SEVERITY_STYLES[finding.severity];
  const chamber = CHAMBER_CONFIG[finding.chamber];

  return (
    <div className="flex items-start gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0 hover:bg-zinc-50/50">
      {/* Severity badge */}
      <span
        className={cn(
          'mt-0.5 inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
          sev.badge,
        )}
      >
        {sev.label}
      </span>

      {/* Chamber tag */}
      <span
        className={cn(
          'mt-0.5 inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-medium',
          chamber.bg,
          chamber.accent,
        )}
      >
        {chamber.label}
      </span>

      {/* Summary */}
      <p className="flex-1 text-sm leading-snug text-zinc-700">{finding.summary}</p>

      {/* Blast radius */}
      <div className="mt-0.5 shrink-0">{blastRadiusDots(finding.blastRadius)}</div>
    </div>
  );
}

/** Single remediation row. */
function RemediationRow({ action }: { action: RemediationAction }) {
  const effortStyle = EFFORT_STYLES[action.effort];
  const impactStyle = SEVERITY_STYLES[action.impact];

  return (
    <div className="flex items-start gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0">
      {/* Priority number */}
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
        {action.priority}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-800">{action.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{action.why}</p>
      </div>

      {/* Effort + impact badges */}
      <div className="flex shrink-0 flex-col gap-1">
        <span
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
            effortStyle.badge,
          )}
        >
          {effortStyle.label} effort
        </span>
        <span
          className={cn(
            'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold',
            impactStyle.badge,
          )}
        >
          {impactStyle.label} impact
        </span>
      </div>
    </div>
  );
}

/** Scenario pill in the horizontal strip. */
function ScenarioPill({
  scenario,
  isSelected,
  onSelect,
}: {
  scenario: Scenario;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-left transition-all',
        isSelected
          ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200'
          : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-zinc-800">{scenario.name}</span>
          {scenario.isBaseline && (
            <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-600">
              Baseline
            </span>
          )}
        </div>
        <span className="text-[11px] text-zinc-400">{formatTimestamp(scenario.lastRunAt)}</span>
      </div>
    </button>
  );
}

// =============================================================================
// PROGRAM SELECTOR (shown when no programId)
// =============================================================================

function ProgramSelector({
  onSelect,
}: {
  onSelect: (id: number) => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4">
      <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
        <Sparkles className="h-12 w-12 text-blue-500" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-zinc-800">
          Select a Program to Begin
        </h2>
        <p className="mt-2 max-w-md text-sm text-zinc-500">
          Choose a regulatory program to load the Snow Globe prediction engine.
          All chambers, scores, and scenarios will be scoped to the selected program.
        </p>
      </div>
      <button
        onClick={() => onSelect(1)}
        className={cn(
          'inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white',
          'shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800',
        )}
      >
        <Target className="h-4 w-4" />
        Open Program Selector
      </button>
    </div>
  );
}

// =============================================================================
// FULL-PAGE SKELETON
// =============================================================================

function FullPageSkeleton() {
  return (
    <div className="space-y-8 p-6">
      {/* Header skeleton */}
      <div className="flex animate-pulse items-center justify-between">
        <div>
          <div className="h-6 w-48 rounded bg-zinc-200" />
          <div className="mt-2 h-4 w-64 rounded bg-zinc-100" />
        </div>
        <div className="flex gap-3">
          <div className="h-9 w-32 rounded-lg bg-zinc-200" />
          <div className="h-9 w-32 rounded-lg bg-zinc-200" />
        </div>
      </div>

      {/* Score cards skeleton */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Chambers skeleton */}
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} className="h-40" />
        ))}
      </div>

      {/* Bottom panels skeleton */}
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function SnowGlobeHome({ programId }: SnowGlobeHomeProps) {
  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [findingSortAsc, setFindingSortAsc] = useState(false);

  // ---------------------------------------------------------------------------
  // Data hooks
  // ---------------------------------------------------------------------------
  const {
    data: scores,
    isLoading: scoresLoading,
  } = useProgramScores(programId);

  const {
    data: topFindings,
    isLoading: findingsLoading,
  } = useTopFindings(programId);

  const {
    data: remediationPlan,
    isLoading: remediationLoading,
  } = useRemediationPlan(programId);

  const {
    data: scenarios,
    isLoading: scenariosLoading,
  } = useScenarios(programId);

  const {
    mutate: runStressTest,
    isPending: stressTestRunning,
  } = useRunFullStressTest();

  const {
    mutate: runPreAgencyScan,
    isPending: preAgencyScanRunning,
  } = useRunPreAgencyScan();

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  /** Map score entries by key for O(1) lookup. */
  const scoreMap = useMemo(() => {
    if (!scores) return new Map<string, ScoreEntry>();
    return new Map((scores as ScoreEntry[]).map((s) => [s.key, s]));
  }, [scores]);

  /** Chamber scores extracted from scoreMap for the 6-chamber grid. */
  const chamberScores = useMemo(() => {
    const mapping: Record<ChamberKey, string> = {
      agency_screen: 'submission_survival',
      reviewer_attack: 'reviewer_friction',
      audit_inspection: 'audit_exposure',
      route_timing: 'route_viability',
      evidence_sufficiency: 'claim_defensibility',
      collaboration_fragility: 'approval_chain_fragility',
    };
    const result: Partial<Record<ChamberKey, number>> = {};
    for (const [chamber, scoreKey] of Object.entries(mapping)) {
      const entry = scoreMap.get(scoreKey);
      if (entry) result[chamber as ChamberKey] = entry.value;
    }
    return result;
  }, [scoreMap]);

  /** First finding per chamber for the preview text. */
  const chamberTopFinding = useMemo(() => {
    if (!topFindings) return {} as Record<ChamberKey, string>;
    const result: Partial<Record<ChamberKey, string>> = {};
    for (const f of topFindings as Finding[]) {
      if (!result[f.chamber]) {
        result[f.chamber] = f.summary;
      }
    }
    return result;
  }, [topFindings]);

  /** Sorted findings list for the left panel. */
  const sortedFindings = useMemo(() => {
    if (!topFindings) return [];
    const list = [...(topFindings as Finding[])].slice(0, 10);
    list.sort((a, b) => {
      const diff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
      return findingSortAsc ? -diff : diff;
    });
    return list;
  }, [topFindings, findingSortAsc]);

  /** Remediation actions sorted by priority. */
  const sortedRemediation = useMemo(() => {
    if (!remediationPlan) return [];
    return [...(remediationPlan as RemediationAction[])].sort(
      (a, b) => a.priority - b.priority,
    );
  }, [remediationPlan]);

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------
  const handleStressTest = useCallback(() => {
    if (programId) runStressTest({ programId });
  }, [programId, runStressTest]);

  const handlePreAgencyScan = useCallback(() => {
    if (programId) runPreAgencyScan({ programId });
  }, [programId, runPreAgencyScan]);

  const handleNewScenario = useCallback(() => {
    // Placeholder: would open a scenario creation dialog
  }, []);

  const handleChamberDeepDive = useCallback((chamber: ChamberKey) => {
    window.dispatchEvent(new CustomEvent('mc-navigate', { detail: { mode: 'snowglobe-chambers', chamber } }));
  }, []);

  const handleCreateMemo = useCallback(() => {
    window.dispatchEvent(new CustomEvent('mc-navigate', { detail: { mode: 'snowglobe-chambers' } }));
  }, []);

  const [showComparison, setShowComparison] = useState(false);

  const handleCompareScenarios = useCallback(() => {
    setShowComparison(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Guard: no program selected
  // ---------------------------------------------------------------------------
  if (programId === null) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <ProgramSelector onSelect={() => {}} />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Guard: full-page loading
  // ---------------------------------------------------------------------------
  if (scoresLoading && findingsLoading && remediationLoading) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <FullPageSkeleton />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-[1440px] space-y-8 px-6 py-6">
        {/* ===================================================================
            HEADER
        =================================================================== */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 shadow-md">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">
                AnA Snow Globe
              </h1>
              <p className="text-sm text-zinc-500">
                Prediction &amp; Intelligence Engine
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleStressTest}
              disabled={stressTestRunning}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700',
                'shadow-sm transition-colors hover:bg-zinc-50 active:bg-zinc-100',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {stressTestRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 text-amber-500" />
              )}
              Run Full Stress Test
            </button>

            <button
              onClick={handlePreAgencyScan}
              disabled={preAgencyScanRunning}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700',
                'shadow-sm transition-colors hover:bg-zinc-50 active:bg-zinc-100',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {preAgencyScanRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanLine className="h-4 w-4 text-blue-500" />
              )}
              Pre-Agency Scan
            </button>

            <button
              onClick={handleNewScenario}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white',
                'shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800',
              )}
            >
              <Plus className="h-4 w-4" />
              New Scenario
            </button>
          </div>
        </header>

        {/* ===================================================================
            SCORE CARDS STRIP — 8 cards, 2 rows of 4
        =================================================================== */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Program Scores
            </h2>
          </div>

          {scoresLoading ? (
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {SCORE_CARDS.map((def) => (
                <ScoreCard
                  key={def.key}
                  def={def}
                  entry={scoreMap.get(def.key)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ===================================================================
            CHAMBER SUMMARY GRID — 2x3
        =================================================================== */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Chamber Summary
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {(Object.keys(CHAMBER_CONFIG) as ChamberKey[]).map((key) => (
              <ChamberCard
                key={key}
                chamberKey={key}
                score={chamberScores[key]}
                topFinding={chamberTopFinding[key]}
                onDeepDive={() => handleChamberDeepDive(key)}
              />
            ))}
          </div>
        </section>

        {/* ===================================================================
            BOTTOM SECTION — Two columns
        =================================================================== */}
        <section className="grid grid-cols-2 gap-6">
          {/* ---------------------------------------------------------------
              LEFT: Top Findings Panel
          --------------------------------------------------------------- */}
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-zinc-800">
                  Top Findings
                </h3>
                {topFindings && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    {(topFindings as Finding[]).length}
                  </span>
                )}
              </div>

              <button
                onClick={() => setFindingSortAsc(!findingSortAsc)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
              >
                Severity
                {findingSortAsc ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
              </button>
            </div>

            {/* Findings list */}
            <div className="max-h-[420px] overflow-y-auto">
              {findingsLoading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : sortedFindings.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-zinc-400">
                  No findings. Run a stress test or scan to generate predictions.
                </div>
              ) : (
                sortedFindings.map((f) => <FindingRow key={f.id} finding={f} />)
              )}
            </div>
          </div>

          {/* ---------------------------------------------------------------
              RIGHT: Remediation Priority Panel
          --------------------------------------------------------------- */}
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-zinc-800">
                  Remediation Priorities
                </h3>
              </div>
            </div>

            {/* Remediation list */}
            <div className="max-h-[370px] overflow-y-auto">
              {remediationLoading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : sortedRemediation.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-zinc-400">
                  No remediation actions. Findings will generate priorities automatically.
                </div>
              ) : (
                sortedRemediation.map((a) => (
                  <RemediationRow key={a.id} action={a} />
                ))
              )}
            </div>

            {/* Create memo button */}
            <div className="border-t border-zinc-100 px-4 py-3">
              <button
                onClick={handleCreateMemo}
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-medium text-zinc-700',
                  'transition-colors hover:bg-zinc-100 active:bg-zinc-200',
                )}
              >
                <Sparkles className="h-4 w-4 text-blue-500" />
                Create Findings Memo
              </button>
            </div>
          </div>
        </section>

        {/* ===================================================================
            SCENARIO QUICK-ACCESS STRIP
        =================================================================== */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-zinc-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Scenarios
              </h2>
            </div>

            {selectedScenarioId && (
              <button
                onClick={handleCompareScenarios}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600',
                  'transition-colors hover:bg-zinc-50',
                )}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Compare
              </button>
            )}
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2">
            {scenariosLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 w-48 shrink-0 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50"
                />
              ))
            ) : !scenarios || (scenarios as Scenario[]).length === 0 ? (
              <div className="flex w-full items-center justify-center rounded-xl border border-dashed border-zinc-200 py-6 text-sm text-zinc-400">
                No scenarios yet. Create one to begin predictive analysis.
              </div>
            ) : (
              (scenarios as Scenario[]).map((s) => (
                <ScenarioPill
                  key={s.id}
                  scenario={s}
                  isSelected={selectedScenarioId === s.id}
                  onSelect={() =>
                    setSelectedScenarioId(
                      selectedScenarioId === s.id ? null : s.id,
                    )
                  }
                />
              ))
            )}
          </div>
        </section>
      </div>

      {/* Scenario Comparison Modal Overlay */}
      {showComparison && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-zinc-200">
            <Suspense fallback={<div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-zinc-300" /></div>}>
              <ScenarioComparison
                programId={programId}
                baselineId={null}
                alternateId={selectedScenarioId}
                onClose={() => setShowComparison(false)}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
