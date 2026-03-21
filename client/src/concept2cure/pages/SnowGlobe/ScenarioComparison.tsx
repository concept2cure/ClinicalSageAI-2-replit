/**
 * @fileoverview Snow Globe — Scenario Comparison View
 * @module concept2cure/pages/SnowGlobe/ScenarioComparison
 * @version 1.0.0
 *
 * Side-by-side comparison of baseline vs. alternate scenarios.
 * Shows score deltas, finding differences, and auto-generated
 * recommendation summaries to guide scenario selection.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  CheckCircle2,
  ChevronDown,
  GitCompare,
  Loader2,
  Minus,
  RefreshCw,
  Shield,
  ShieldAlert,
  Star,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';

import {
  useScenarios,
  useProgramScores,
} from '../../hooks/useSnowGlobe';

// =============================================================================
// TYPES
// =============================================================================

interface ScenarioComparisonProps {
  programId: number | null;
  baselineId?: number | null;
  alternateId?: number | null;
  onClose?: () => void;
}

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface ScoreDef {
  key: string;
  label: string;
  lowerIsBetter: boolean;
}

interface ScoreEntry {
  baseline: number;
  alternate: number;
}

interface Finding {
  id: string;
  title: string;
  severity: Severity;
  chamber: string;
}

interface ComparisonData {
  scores: Record<string, ScoreEntry>;
  baselineOnlyFindings: Finding[];
  alternateOnlyFindings: Finding[];
  commonFindings: Array<Finding & { baselineSeverity: Severity; alternateSeverity: Severity }>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SCORE_DEFS: ScoreDef[] = [
  { key: 'pre_technical_rejection', label: 'Pre-Technical Rejection', lowerIsBetter: true },
  { key: 'submission_survival', label: 'Submission Survival', lowerIsBetter: false },
  { key: 'reviewer_friction', label: 'Reviewer Friction', lowerIsBetter: true },
  { key: 'audit_exposure', label: 'Audit Exposure', lowerIsBetter: true },
  { key: 'claim_defensibility', label: 'Claim Defensibility', lowerIsBetter: false },
  { key: 'traceability_integrity', label: 'Traceability Integrity', lowerIsBetter: false },
  { key: 'route_viability', label: 'Route Viability', lowerIsBetter: false },
  { key: 'approval_chain_fragility', label: 'Approval Chain Fragility', lowerIsBetter: true },
];

const SEVERITY_CONFIG: Record<Severity, { bg: string; text: string; border: string; order: number }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', order: 0 },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', order: 1 },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', order: 2 },
  low: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', order: 3 },
};

// =============================================================================
// MOCK DATA GENERATOR
// =============================================================================

function generateMockComparison(): ComparisonData {
  const rand = (min: number, max: number) =>
    Math.round((min + Math.random() * (max - min)) * 10) / 10;

  const scores: Record<string, ScoreEntry> = {};
  for (const def of SCORE_DEFS) {
    const base = rand(20, 85);
    const delta = rand(-15, 15);
    scores[def.key] = {
      baseline: Math.min(100, Math.max(0, base)),
      alternate: Math.min(100, Math.max(0, base + delta)),
    };
  }

  const chambers = ['Agency Screen', 'Reviewer Attack', 'Audit Inspection', 'Route Timing', 'Evidence Sufficiency'];
  const severities: Severity[] = ['critical', 'high', 'medium', 'low'];

  const baselineOnlyFindings: Finding[] = [
    { id: 'b1', title: 'Missing ICH E6(R3) cross-reference in protocol', severity: 'high', chamber: chambers[0] },
    { id: 'b2', title: 'Incomplete SAE reporting timeline documentation', severity: 'critical', chamber: chambers[2] },
    { id: 'b3', title: 'Outdated comparator arm dosing justification', severity: 'medium', chamber: chambers[1] },
  ];

  const alternateOnlyFindings: Finding[] = [
    { id: 'a1', title: 'New endpoint multiplicity concern with dual primary', severity: 'high', chamber: chambers[4] },
    { id: 'a2', title: 'Subgroup analysis pre-specification gap', severity: 'medium', chamber: chambers[1] },
  ];

  const commonFindings: Array<Finding & { baselineSeverity: Severity; alternateSeverity: Severity }> = [
    {
      id: 'c1', title: 'Informed consent language clarity', severity: 'medium',
      chamber: chambers[0], baselineSeverity: 'high', alternateSeverity: 'medium',
    },
    {
      id: 'c2', title: 'Data monitoring committee charter completeness', severity: 'medium',
      chamber: chambers[2], baselineSeverity: 'medium', alternateSeverity: 'low',
    },
    {
      id: 'c3', title: 'Statistical analysis plan alignment with protocol', severity: 'high',
      chamber: chambers[4], baselineSeverity: 'high', alternateSeverity: 'high',
    },
    {
      id: 'c4', title: 'Regulatory pathway documentation gaps', severity: 'medium',
      chamber: chambers[3], baselineSeverity: 'medium', alternateSeverity: 'medium',
    },
  ];

  return { scores, baselineOnlyFindings, alternateOnlyFindings, commonFindings };
}

// =============================================================================
// HELPERS
// =============================================================================

function getScoreColor(value: number, lowerIsBetter: boolean): string {
  const effective = lowerIsBetter ? 100 - value : value;
  if (effective >= 75) return 'text-emerald-400';
  if (effective >= 50) return 'text-blue-400';
  if (effective >= 30) return 'text-yellow-400';
  return 'text-red-400';
}

function getScoreBarColor(value: number, lowerIsBetter: boolean): string {
  const effective = lowerIsBetter ? 100 - value : value;
  if (effective >= 75) return 'bg-emerald-500';
  if (effective >= 50) return 'bg-blue-500';
  if (effective >= 30) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getDeltaInfo(
  delta: number,
  lowerIsBetter: boolean,
): { label: string; color: string; icon: React.ElementType; isImprovement: boolean } {
  const isImprovement = lowerIsBetter ? delta < 0 : delta > 0;
  const isNeutral = Math.abs(delta) < 0.5;

  if (isNeutral) {
    return { label: '0', color: 'text-zinc-400', icon: Minus, isImprovement: false };
  }

  return {
    label: `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`,
    color: isImprovement ? 'text-emerald-400' : 'text-red-400',
    icon: isImprovement ? ArrowUpRight : ArrowDownRight,
    isImprovement,
  };
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function SeverityBadge({ severity }: { severity: Severity }) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border',
        cfg.bg, cfg.text, cfg.border,
      )}
    >
      {severity === 'critical' && <XCircle className="h-3 w-3" />}
      {severity === 'high' && <AlertTriangle className="h-3 w-3" />}
      {severity === 'medium' && <Shield className="h-3 w-3" />}
      {severity === 'low' && <CheckCircle2 className="h-3 w-3" />}
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

function ScenarioSelector({
  label,
  value,
  scenarios,
  onChange,
  accentColor,
}: {
  label: string;
  value: number | null;
  scenarios: any[];
  onChange: (id: number | null) => void;
  accentColor: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <label className={cn('text-xs font-semibold uppercase tracking-wider mb-1.5 block', accentColor)}>
        {label}
      </label>
      <div className="relative">
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          className={cn(
            'w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-800/80',
            'px-3 py-2.5 pr-8 text-sm text-zinc-100',
            'focus-visible:ring-2 focus-visible:ring-blue-500 outline-none/40 focus:border-blue-500/60',
            'transition-colors cursor-pointer',
          )}
        >
          <option value="">Select scenario...</option>
          {scenarios.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name || `Scenario #${s.id}`}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
      </div>
    </div>
  );
}

function ScoreRow({
  def,
  entry,
}: {
  def: ScoreDef;
  entry: ScoreEntry;
}) {
  const delta = Math.round((entry.alternate - entry.baseline) * 10) / 10;
  const info = getDeltaInfo(delta, def.lowerIsBetter);
  const DeltaIcon = info.icon;

  return (
    <div className="grid grid-cols-12 items-center gap-3 px-4 py-3 border-b border-zinc-800/60 last:border-b-0 hover:bg-zinc-800/30 transition-colors duration-150">
      {/* Score Name */}
      <div className="col-span-3 text-sm text-zinc-400 font-medium truncate" title={def.label}>
        {def.label}
      </div>

      {/* Baseline Value + Bar */}
      <div className="col-span-3 flex items-center gap-2">
        <span className={cn('text-sm font-semibold tabular-nums w-10 text-right', getScoreColor(entry.baseline, def.lowerIsBetter))}>
          {entry.baseline.toFixed(1)}
        </span>
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', getScoreBarColor(entry.baseline, def.lowerIsBetter))}
            style={{ width: `${Math.min(100, Math.max(0, entry.baseline))}%` }}
          />
        </div>
      </div>

      {/* Alternate Value + Bar */}
      <div className="col-span-3 flex items-center gap-2">
        <span className={cn('text-sm font-semibold tabular-nums w-10 text-right', getScoreColor(entry.alternate, def.lowerIsBetter))}>
          {entry.alternate.toFixed(1)}
        </span>
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', getScoreBarColor(entry.alternate, def.lowerIsBetter))}
            style={{ width: `${Math.min(100, Math.max(0, entry.alternate))}%` }}
          />
        </div>
      </div>

      {/* Delta */}
      <div className="col-span-3 flex items-center justify-center gap-1.5">
        <DeltaIcon className={cn('h-4 w-4', info.color)} />
        <span className={cn('text-sm font-semibold tabular-nums', info.color)}>
          {info.label}
        </span>
        {info.isImprovement && <Star className="h-3 w-3 text-emerald-500/60" />}
      </div>
    </div>
  );
}

function FindingCard({
  finding,
  side,
}: {
  finding: Finding;
  side: 'baseline' | 'alternate';
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-colors',
        side === 'baseline'
          ? 'border-zinc-700/60 bg-zinc-800/40'
          : 'border-blue-500/20 bg-blue-500/5',
      )}
    >
      <SeverityBadge severity={finding.severity} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 leading-snug">{finding.title}</p>
        <p className="text-xs text-zinc-500 mt-1">{finding.chamber}</p>
      </div>
    </div>
  );
}

function CommonFindingRow({
  finding,
}: {
  finding: Finding & { baselineSeverity: Severity; alternateSeverity: Severity };
}) {
  const baseOrder = SEVERITY_CONFIG[finding.baselineSeverity].order;
  const altOrder = SEVERITY_CONFIG[finding.alternateSeverity].order;
  const improved = altOrder > baseOrder;
  const regressed = altOrder < baseOrder;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-700/40 bg-zinc-800/30 p-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 leading-snug">{finding.title}</p>
        <p className="text-xs text-zinc-500 mt-1">{finding.chamber}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <SeverityBadge severity={finding.baselineSeverity} />
        <ArrowRight
          className={cn(
            'h-4 w-4',
            improved ? 'text-emerald-400' : regressed ? 'text-red-400' : 'text-zinc-500',
          )}
        />
        <SeverityBadge severity={finding.alternateSeverity} />
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ScenarioComparison({
  programId,
  baselineId: initialBaselineId = null,
  alternateId: initialAlternateId = null,
  onClose,
}: ScenarioComparisonProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [baselineId, setBaselineId] = useState<number | null>(initialBaselineId ?? null);
  const [alternateId, setAlternateId] = useState<number | null>(initialAlternateId ?? null);

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  const { data: scenarios, isLoading: scenariosLoading } = useScenarios(programId);
  const { data: scores, isLoading: scoresLoading } = useProgramScores(programId);

  const scenarioList = useMemo(() => (scenarios as any[]) ?? [], [scenarios]);

  // ---------------------------------------------------------------------------
  // Swap handler
  // ---------------------------------------------------------------------------
  const handleSwap = useCallback(() => {
    setBaselineId((prev) => {
      const oldBaseline = prev;
      setAlternateId(oldBaseline);
      return alternateId;
    });
  }, [alternateId]);

  // ---------------------------------------------------------------------------
  // Comparison data — use mock when real data is unavailable
  // ---------------------------------------------------------------------------
  const comparison = useMemo<ComparisonData | null>(() => {
    if (!baselineId || !alternateId) return null;

    // Phase 1: generate plausible mock data seeded by scenario IDs
    const mock = generateMockComparison();

    // If we have real scores, overlay them onto baseline values
    if (scores && typeof scores === 'object') {
      for (const def of SCORE_DEFS) {
        const realScore = (scores as any)[def.key];
        if (typeof realScore === 'number') {
          mock.scores[def.key].baseline = realScore;
          // Keep alternate as a plausible delta from real baseline
          const delta = mock.scores[def.key].alternate - mock.scores[def.key].baseline;
          mock.scores[def.key].alternate = Math.min(
            100,
            Math.max(0, realScore + delta * 0.5),
          );
        }
      }
    }

    return mock;
  }, [baselineId, alternateId, scores]);

  // ---------------------------------------------------------------------------
  // Recommendation analysis
  // ---------------------------------------------------------------------------
  const recommendation = useMemo(() => {
    if (!comparison) return null;

    let baselineBetter = 0;
    let alternateBetter = 0;
    const improvements: string[] = [];
    const regressions: string[] = [];

    for (const def of SCORE_DEFS) {
      const entry = comparison.scores[def.key];
      if (!entry) continue;

      const delta = entry.alternate - entry.baseline;
      const isImprovement = def.lowerIsBetter ? delta < -2 : delta > 2;
      const isRegression = def.lowerIsBetter ? delta > 2 : delta < -2;

      if (isImprovement) {
        alternateBetter++;
        improvements.push(def.label);
      } else if (isRegression) {
        baselineBetter++;
        regressions.push(def.label);
      }
    }

    // Factor in findings
    const baselineFindingsPenalty = comparison.baselineOnlyFindings.filter(
      (f) => f.severity === 'critical' || f.severity === 'high',
    ).length;
    const alternateFindingsPenalty = comparison.alternateOnlyFindings.filter(
      (f) => f.severity === 'critical' || f.severity === 'high',
    ).length;

    baselineBetter += alternateFindingsPenalty;
    alternateBetter += baselineFindingsPenalty;

    const recommended: 'baseline' | 'alternate' | 'neutral' =
      alternateBetter > baselineBetter + 1
        ? 'alternate'
        : baselineBetter > alternateBetter + 1
          ? 'baseline'
          : 'neutral';

    return { baselineBetter, alternateBetter, improvements, regressions, recommended };
  }, [comparison]);

  // ---------------------------------------------------------------------------
  // Loading / empty states
  // ---------------------------------------------------------------------------
  if (!programId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
        <GitCompare className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Select a program to compare scenarios</p>
      </div>
    );
  }

  if (scenariosLoading || scoresLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
        <Loader2 className="h-8 w-8 animate-spin mb-3 text-blue-400" />
        <p className="text-sm">Loading scenario data...</p>
      </div>
    );
  }

  if (scenarioList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
        <GitCompare className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium text-zinc-400">No scenarios available</p>
        <p className="text-xs mt-1">Create at least two scenarios to compare them</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-5 max-w-5xl mx-auto">
      {/* ===================================================================
          HEADER
          =================================================================== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <GitCompare className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Scenario Comparison</h2>
            <p className="text-xs text-zinc-500">Compare prediction scores across scenarios</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={cn(
              'flex items-center justify-center h-8 w-8 rounded-lg',
              'border border-zinc-700 bg-zinc-800/60 text-zinc-400',
              'hover:bg-zinc-700 hover:text-zinc-200 transition-colors',
            )}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ===================================================================
          SCENARIO SELECTORS
          =================================================================== */}
      <div className="flex items-end gap-3 rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-4">
        <ScenarioSelector
          label="Baseline"
          value={baselineId}
          scenarios={scenarioList}
          onChange={setBaselineId}
          accentColor="text-zinc-400"
        />

        <button
          onClick={handleSwap}
          disabled={!baselineId && !alternateId}
          className={cn(
            'flex items-center justify-center h-10 w-10 rounded-lg flex-shrink-0',
            'border border-zinc-700 bg-zinc-800/80 text-zinc-400',
            'hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-blue-400',
            'disabled:opacity-30 disabled:cursor-not-allowed',
            'transition-all duration-200',
          )}
          title="Swap scenarios"
        >
          <RefreshCw className="h-4 w-4" />
        </button>

        <ScenarioSelector
          label="Alternate"
          value={alternateId}
          scenarios={scenarioList}
          onChange={setAlternateId}
          accentColor="text-blue-400"
        />
      </div>

      {/* Guard: need both selected */}
      {(!baselineId || !alternateId) && (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500 rounded-xl border border-dashed border-zinc-700/60">
          <GitCompare className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm">Select both a baseline and alternate scenario to compare</p>
        </div>
      )}

      {comparison && (
        <>
          {/* =================================================================
              SCORE COMPARISON TABLE
              ================================================================= */}
          <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/60 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 items-center gap-3 px-4 py-2.5 bg-zinc-800/50 border-b border-zinc-700/60">
              <div className="col-span-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Score
              </div>
              <div className="col-span-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Baseline
              </div>
              <div className="col-span-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Alternate
              </div>
              <div className="col-span-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 text-center">
                Delta
              </div>
            </div>

            {/* Score Rows */}
            {SCORE_DEFS.map((def) => {
              const entry = comparison.scores[def.key];
              if (!entry) return null;
              return <ScoreRow key={def.key} def={def} entry={entry} />;
            })}
          </div>

          {/* =================================================================
              FINDING DELTAS
              ================================================================= */}
          <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-700/60 bg-zinc-800/30">
              <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-orange-400" />
                Finding Deltas
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Findings unique to each scenario and severity changes in common findings
              </p>
            </div>

            <div className="p-4 space-y-5">
              {/* Only in Baseline */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                  Only in Baseline
                  <span className="ml-1 text-zinc-600">({comparison.baselineOnlyFindings.length})</span>
                </h4>
                {comparison.baselineOnlyFindings.length === 0 ? (
                  <p className="text-xs text-zinc-600 italic pl-3">No unique findings</p>
                ) : (
                  <div className="space-y-2">
                    {comparison.baselineOnlyFindings.map((f) => (
                      <FindingCard key={f.id} finding={f} side="baseline" />
                    ))}
                  </div>
                )}
              </div>

              {/* Only in Alternate */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-400/70 mb-2 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Only in Alternate
                  <span className="ml-1 text-zinc-600">({comparison.alternateOnlyFindings.length})</span>
                </h4>
                {comparison.alternateOnlyFindings.length === 0 ? (
                  <p className="text-xs text-zinc-600 italic pl-3">No unique findings</p>
                ) : (
                  <div className="space-y-2">
                    {comparison.alternateOnlyFindings.map((f) => (
                      <FindingCard key={f.id} finding={f} side="alternate" />
                    ))}
                  </div>
                )}
              </div>

              {/* Common Findings */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Common Findings
                  <span className="ml-1 text-zinc-600">({comparison.commonFindings.length})</span>
                </h4>
                {comparison.commonFindings.length === 0 ? (
                  <p className="text-xs text-zinc-600 italic pl-3">No common findings</p>
                ) : (
                  <div className="space-y-2">
                    {comparison.commonFindings.map((f) => (
                      <CommonFindingRow key={f.id} finding={f} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* =================================================================
              RECOMMENDATION PANEL
              ================================================================= */}
          {recommendation && (
            <div
              className={cn(
                'rounded-xl border overflow-hidden',
                recommendation.recommended === 'alternate'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : recommendation.recommended === 'baseline'
                    ? 'border-zinc-600/60 bg-zinc-800/40'
                    : 'border-blue-500/20 bg-blue-500/5',
              )}
            >
              {/* Recommendation Header */}
              <div
                className={cn(
                  'px-4 py-3 border-b flex items-center justify-between',
                  recommendation.recommended === 'alternate'
                    ? 'border-emerald-500/20 bg-emerald-500/10'
                    : recommendation.recommended === 'baseline'
                      ? 'border-zinc-700/60 bg-zinc-800/50'
                      : 'border-blue-500/15 bg-blue-500/10',
                )}
              >
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-400" />
                  Comparison Summary
                </h3>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border',
                    recommendation.recommended === 'alternate'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : recommendation.recommended === 'baseline'
                        ? 'bg-zinc-700/50 text-zinc-400 border-zinc-600/50'
                        : 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                  )}
                >
                  {recommendation.recommended === 'alternate' && <TrendingUp className="h-3 w-3" />}
                  {recommendation.recommended === 'baseline' && <TrendingDown className="h-3 w-3" />}
                  {recommendation.recommended === 'neutral' && <Minus className="h-3 w-3" />}
                  Recommended:{' '}
                  {recommendation.recommended === 'alternate'
                    ? 'Alternate'
                    : recommendation.recommended === 'baseline'
                      ? 'Baseline'
                      : 'No clear winner'}
                </span>
              </div>

              {/* Recommendation Body */}
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Overall Score Tally */}
                <div className="rounded-lg border border-zinc-700/40 bg-zinc-800/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                    Score Tally
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="text-center flex-1">
                      <p className="text-2xl font-semibold text-zinc-400 tabular-nums">
                        {recommendation.baselineBetter}
                      </p>
                      <p className="text-xs text-zinc-500">Baseline wins</p>
                    </div>
                    <div className="h-8 w-px bg-zinc-700" />
                    <div className="text-center flex-1">
                      <p className="text-2xl font-semibold text-blue-400 tabular-nums">
                        {recommendation.alternateBetter}
                      </p>
                      <p className="text-xs text-zinc-500">Alternate wins</p>
                    </div>
                  </div>
                </div>

                {/* Key Improvements */}
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400/70 mb-2 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Improvements in Alternate
                  </p>
                  {recommendation.improvements.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">None detected</p>
                  ) : (
                    <ul className="space-y-1">
                      {recommendation.improvements.map((item) => (
                        <li key={item} className="text-xs text-emerald-300 flex items-start gap-1.5">
                          <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Key Regressions */}
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-red-400/70 mb-2 flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" />
                    Regressions in Alternate
                  </p>
                  {recommendation.regressions.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">None detected</p>
                  ) : (
                    <ul className="space-y-1">
                      {recommendation.regressions.map((item) => (
                        <li key={item} className="text-xs text-red-300 flex items-start gap-1.5">
                          <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
