/**
 * @fileoverview Snow Globe Artifact Summary — Embeddable Widget
 * @module concept2cure/pages/SnowGlobe/SnowGlobeArtifactSummary
 * @version 1.0.0
 *
 * Small panel showing Snow Globe scores for a specific artifact.
 * Displays risk level, per-engine score breakdown, finding count,
 * and expandable finding list.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Shield,
} from 'lucide-react';

import { useArtifactScores } from '../../hooks/useSnowGlobe';

// =============================================================================
// TYPES
// =============================================================================

interface SnowGlobeArtifactSummaryProps {
  artifactId: number | null;
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

interface EngineScore {
  engine: ChamberKey;
  score: number;
}

interface ArtifactFinding {
  id: string;
  severity: Severity;
  title: string;
  engine: ChamberKey;
}

interface ArtifactScoresData {
  engineScores: EngineScore[];
  findings: ArtifactFinding[];
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

const SEVERITY_STYLES: Record<Severity, { badge: string; label: string; order: number }> = {
  critical: { badge: 'bg-red-100 text-red-700', label: 'Critical', order: 0 },
  high: { badge: 'bg-orange-100 text-orange-700', label: 'High', order: 1 },
  medium: { badge: 'bg-yellow-100 text-yellow-700', label: 'Medium', order: 2 },
  low: { badge: 'bg-emerald-100 text-emerald-700', label: 'Low', order: 3 },
};

const RISK_LEVEL_STYLES: Record<Severity, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  low: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

// =============================================================================
// HELPERS
// =============================================================================

function getRiskLevel(scores: EngineScore[]): Severity {
  if (scores.length === 0) return 'low';
  const worstScore = Math.min(...scores.map((s) => s.score));
  if (worstScore < 25) return 'critical';
  if (worstScore < 50) return 'high';
  if (worstScore < 75) return 'medium';
  return 'low';
}

function getBarColor(value: number): string {
  if (value >= 75) return 'bg-emerald-400';
  if (value >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function SnowGlobeArtifactSummary({
  artifactId,
  className,
}: SnowGlobeArtifactSummaryProps) {
  const [findingsExpanded, setFindingsExpanded] = useState(false);
  const { data: rawData, isLoading } = useArtifactScores(artifactId);

  const data = rawData as ArtifactScoresData | undefined;

  const engineScores = useMemo(() => data?.engineScores ?? [], [data]);
  const findings = useMemo(() => {
    if (!data?.findings) return [];
    return [...data.findings].sort(
      (a, b) =>
        (SEVERITY_STYLES[a.severity]?.order ?? 99) -
        (SEVERITY_STYLES[b.severity]?.order ?? 99),
    );
  }, [data]);

  const riskLevel = useMemo(() => getRiskLevel(engineScores), [engineScores]);
  const riskStyles = RISK_LEVEL_STYLES[riskLevel];

  const findingCounts = useMemo(() => {
    const counts: Partial<Record<Severity, number>> = {};
    for (const f of findings) {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
    }
    return counts;
  }, [findings]);

  const handleViewInSnowGlobe = () => {
    window.dispatchEvent(
      new CustomEvent('mc-navigate', { detail: { mode: 'snowglobe', artifactId } }),
    );
  };

  // --- No artifact ---
  if (artifactId === null) {
    return (
      <div
        className={cn(
          'rounded-xl border border-zinc-200 bg-white p-4 shadow-sm',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-zinc-400">
          <Shield className="h-4 w-4" />
          <span className="text-sm">Snow Globe Scores</span>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Select an artifact to view risk assessment.
        </p>
      </div>
    );
  }

  // --- Loading ---
  if (isLoading) {
    return (
      <div
        className={cn(
          'animate-pulse rounded-xl border border-zinc-200 bg-white p-4 shadow-sm',
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-300" />
          <span className="text-sm text-zinc-400">Analyzing artifact...</span>
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-6 w-24 rounded bg-zinc-100" />
          <div className="h-2 w-full rounded bg-zinc-100" />
          <div className="h-2 w-3/4 rounded bg-zinc-100" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-200 bg-white p-4 shadow-sm',
        className,
      )}
    >
      {/* Header with risk badge */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-800">Snow Globe Risk</span>
        </div>
        <span
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            riskStyles.bg,
            riskStyles.text,
            riskStyles.border,
          )}
        >
          {riskLevel}
        </span>
      </div>

      {/* Engine score breakdown */}
      {engineScores.length > 0 ? (
        <div className="mb-3 space-y-1.5">
          {engineScores.map(({ engine, score }) => (
            <div key={engine} className="flex items-center gap-2">
              <span className="w-28 truncate text-[11px] text-zinc-500">
                {CHAMBER_LABELS[engine] ?? engine}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={cn('h-full rounded-full transition-all', getBarColor(score))}
                  style={{ width: `${Math.min(score, 100)}%` }}
                />
              </div>
              <span className="w-7 text-right text-[10px] font-medium tabular-nums text-zinc-500">
                {Math.round(score)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-xs text-zinc-400">No engine scores available for this artifact.</p>
      )}

      {/* Finding count summary */}
      <div className="mb-3 flex items-center gap-3">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs text-zinc-600">
          <strong className="font-semibold">{findings.length}</strong> finding{findings.length !== 1 ? 's' : ''}
        </span>
        {Object.entries(findingCounts).map(([sev, count]) => {
          const style = SEVERITY_STYLES[sev as Severity];
          return (
            <span
              key={sev}
              className={cn(
                'rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                style.badge,
              )}
            >
              {count} {style.label}
            </span>
          );
        })}
      </div>

      {/* Expandable finding list */}
      {findings.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setFindingsExpanded(!findingsExpanded)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            <span>{findingsExpanded ? 'Hide findings' : 'Show findings'}</span>
            {findingsExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {findingsExpanded && (
            <div className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50/50 p-2">
              {findings.map((f) => {
                const style = SEVERITY_STYLES[f.severity];
                return (
                  <div key={f.id} className="flex items-start gap-2 py-1">
                    <span
                      className={cn(
                        'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                        style.badge,
                      )}
                    >
                      {style.label}
                    </span>
                    <p className="line-clamp-2 text-[11px] leading-snug text-zinc-600">
                      {f.title}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* View in Snow Globe link */}
      <button
        onClick={handleViewInSnowGlobe}
        className={cn(
          'inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600',
          'transition-colors hover:bg-zinc-100 active:bg-zinc-200',
        )}
      >
        View in Snow Globe
        <ExternalLink className="h-3 w-3" />
      </button>
    </div>
  );
}
