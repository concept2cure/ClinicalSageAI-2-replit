/**
 * @fileoverview Snow Globe Mission Control Card — Embeddable Summary Widget
 * @module concept2cure/pages/SnowGlobe/SnowGlobeMissionControlCard
 * @version 1.0.0
 *
 * Compact card for embedding in the Mission Control dashboard. Surfaces
 * overall program health, top critical findings, and mini engine score bars.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  Sparkles,
  Shield,
} from 'lucide-react';

import {
  useProgramScores,
  useTopFindings,
} from '../../hooks/useSnowGlobe';

// =============================================================================
// TYPES
// =============================================================================

interface SnowGlobeMissionControlCardProps {
  programId: number | null;
  className?: string;
}

type ChamberKey =
  | 'agency_screen'
  | 'reviewer_attack'
  | 'audit_inspection'
  | 'route_timing'
  | 'evidence_sufficiency'
  | 'collaboration_fragility';

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface ScoreEntry {
  key: string;
  value: number;
}

interface Finding {
  id: string;
  severity: Severity;
  chamber: ChamberKey;
  summary: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CHAMBER_LABELS: Record<ChamberKey, string> = {
  agency_screen: 'Agency Screen',
  reviewer_attack: 'Reviewer Attack',
  audit_inspection: 'Audit & Inspection',
  route_timing: 'Route & Timing',
  evidence_sufficiency: 'Evidence Sufficiency',
  collaboration_fragility: 'Collaboration Fragility',
};

const SEVERITY_STYLES: Record<Severity, { badge: string; label: string }> = {
  critical: { badge: 'bg-red-100 text-red-700', label: 'Critical' },
  high: { badge: 'bg-orange-100 text-orange-700', label: 'High' },
  medium: { badge: 'bg-yellow-100 text-yellow-700', label: 'Medium' },
  low: { badge: 'bg-emerald-100 text-emerald-700', label: 'Low' },
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Maps chamber keys to score keys used by the API. */
const CHAMBER_SCORE_KEYS: Record<ChamberKey, string> = {
  agency_screen: 'submission_survival',
  reviewer_attack: 'reviewer_friction',
  audit_inspection: 'audit_exposure',
  route_timing: 'route_viability',
  evidence_sufficiency: 'claim_defensibility',
  collaboration_fragility: 'approval_chain_fragility',
};

/** Chambers where lower values are better (invert for bar display). */
const LOWER_IS_BETTER = new Set(['reviewer_friction', 'audit_exposure', 'approval_chain_fragility']);

// =============================================================================
// HELPERS
// =============================================================================

function getBarColor(value: number): string {
  if (value >= 75) return 'bg-emerald-400';
  if (value >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

function getHealthColor(score: number): string {
  if (score >= 75) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function getHealthLabel(score: number): string {
  if (score >= 75) return 'Healthy';
  if (score >= 50) return 'At Risk';
  return 'Critical';
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function SnowGlobeMissionControlCard({
  programId,
  className,
}: SnowGlobeMissionControlCardProps) {
  const { data: scores, isLoading: scoresLoading } = useProgramScores(programId);
  const { data: topFindings, isLoading: findingsLoading } = useTopFindings(programId);

  const isLoading = scoresLoading || findingsLoading;

  // Build score map
  const scoreMap = useMemo(() => {
    if (!scores) return new Map<string, number>();
    return new Map((scores as ScoreEntry[]).map((s) => [s.key, s.value]));
  }, [scores]);

  // Composite health score: average of all 6 engine scores (normalized so higher = better)
  const compositeScore = useMemo(() => {
    if (scoreMap.size === 0) return null;
    let total = 0;
    let count = 0;
    for (const [, scoreKey] of Object.entries(CHAMBER_SCORE_KEYS)) {
      const raw = scoreMap.get(scoreKey);
      if (raw !== undefined) {
        const normalized = LOWER_IS_BETTER.has(scoreKey) ? 100 - raw : raw;
        total += normalized;
        count++;
      }
    }
    return count > 0 ? Math.round(total / count) : null;
  }, [scoreMap]);

  // Top 3 findings by severity
  const top3Findings = useMemo(() => {
    if (!topFindings) return [];
    return [...(topFindings as Finding[])]
      .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99))
      .slice(0, 3);
  }, [topFindings]);

  // Engine scores for mini bars
  const engineScores = useMemo(() => {
    return (Object.entries(CHAMBER_SCORE_KEYS) as [ChamberKey, string][]).map(
      ([chamber, scoreKey]) => {
        const raw = scoreMap.get(scoreKey);
        const display = raw !== undefined
          ? LOWER_IS_BETTER.has(scoreKey) ? 100 - raw : raw
          : null;
        return { chamber, label: CHAMBER_LABELS[chamber], value: display };
      },
    );
  }, [scoreMap]);

  const handleOpenSnowGlobe = () => {
    window.dispatchEvent(
      new CustomEvent('mc-navigate', { detail: { mode: 'snowglobe' } }),
    );
  };

  // --- No program ---
  if (programId === null) {
    return (
      <div
        className={cn(
          'rounded-xl border border-zinc-200 bg-white p-5 shadow-sm',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-zinc-400">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm">AnA Predictions</span>
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          Select a program to view prediction scores.
        </p>
      </div>
    );
  }

  // --- Loading ---
  if (isLoading) {
    return (
      <div
        className={cn(
          'animate-pulse rounded-xl border border-zinc-200 bg-white p-5 shadow-sm',
          className,
        )}
      >
        <div className="mb-4 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
          <span className="text-sm text-zinc-400">Loading AnA Predictions...</span>
        </div>
        <div className="space-y-2">
          <div className="h-8 w-20 rounded bg-zinc-100" />
          <div className="h-2 w-full rounded bg-zinc-100" />
          <div className="h-2 w-3/4 rounded bg-zinc-100" />
          <div className="h-2 w-1/2 rounded bg-zinc-100" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-200 bg-white p-5 shadow-sm',
        className,
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-blue-600 p-1.5">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-zinc-900">AnA Predictions</span>
        </div>
        {compositeScore !== null && (
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold',
              compositeScore >= 75
                ? 'bg-emerald-50 text-emerald-700'
                : compositeScore >= 50
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-red-50 text-red-700',
            )}
          >
            {getHealthLabel(compositeScore)}
          </span>
        )}
      </div>

      {/* Composite health score */}
      {compositeScore !== null && (
        <div className="mb-4 flex items-end gap-2">
          <span className={cn('text-4xl font-semibold tabular-nums', getHealthColor(compositeScore))}>
            {compositeScore}
          </span>
          <span className={cn('mb-1 text-sm font-medium', getHealthColor(compositeScore))}>
            / 100
          </span>
        </div>
      )}

      {/* Mini score bars per engine */}
      <div className="mb-4 space-y-1.5">
        {engineScores.map(({ chamber, label, value }) => (
          <div key={chamber} className="flex items-center gap-2">
            <span className="w-28 truncate text-xs text-zinc-500">{label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
              {value !== null && (
                <div
                  className={cn('h-full rounded-full transition-all duration-150', getBarColor(value))}
                  style={{ width: `${Math.min(value, 100)}%` }}
                />
              )}
            </div>
            <span className="w-7 text-right text-xs font-medium tabular-nums text-zinc-500">
              {value !== null ? value : '--'}
            </span>
          </div>
        ))}
      </div>

      {/* Top 3 critical findings */}
      {top3Findings.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Top Findings
            </span>
          </div>
          <div className="space-y-1.5">
            {top3Findings.map((f) => {
              const sev = SEVERITY_STYLES[f.severity];
              return (
                <div key={f.id} className="flex items-start gap-2">
                  <span
                    className={cn(
                      'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold uppercase',
                      sev.badge,
                    )}
                  >
                    {sev.label}
                  </span>
                  <p className="line-clamp-1 text-xs text-zinc-600">{f.summary}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {top3Findings.length === 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2">
          <Shield className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs text-emerald-700">No critical findings detected</span>
        </div>
      )}

      {/* Open Snow Globe button */}
      <button
        onClick={handleOpenSnowGlobe}
        className={cn(
          'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700',
          'transition-colors hover:bg-blue-100 active:bg-blue-200',
        )}
      >
        Open AnA Predictions
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
