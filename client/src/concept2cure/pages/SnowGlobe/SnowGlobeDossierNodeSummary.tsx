/**
 * @fileoverview Snow Globe Dossier Node Summary — Embeddable Widget
 * @module concept2cure/pages/SnowGlobe/SnowGlobeDossierNodeSummary
 * @version 1.0.0
 *
 * Small panel showing Snow Globe scores for a dossier section/node.
 * Displays compliance gauge, relevant engine scores, active finding counts,
 * quick remediation summary, and a link to dive deeper.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileCheck,
  Loader2,
  Shield,
  Wrench,
} from 'lucide-react';

import {
  useDossierNodeScores,
  useRemediationPlan,
} from '../../hooks/useSnowGlobe';

// =============================================================================
// TYPES
// =============================================================================

interface SnowGlobeDossierNodeSummaryProps {
  nodeId: number | null;
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

interface NodeFinding {
  id: string;
  severity: Severity;
  title: string;
  engine: ChamberKey;
}

interface RemediationAction {
  id: string;
  priority: number;
  title: string;
  effort: 'low' | 'medium' | 'high';
}

interface DossierNodeScoresData {
  complianceScore: number;
  engineScores: EngineScore[];
  findings: NodeFinding[];
  remediationSummary?: RemediationAction[];
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

/** Only show the three most relevant engines for a dossier node. */
const RELEVANT_ENGINES: ChamberKey[] = [
  'agency_screen',
  'reviewer_attack',
  'evidence_sufficiency',
];

const SEVERITY_STYLES: Record<Severity, { badge: string; label: string; order: number }> = {
  critical: { badge: 'bg-red-100 text-red-700', label: 'Critical', order: 0 },
  high: { badge: 'bg-orange-100 text-orange-700', label: 'High', order: 1 },
  medium: { badge: 'bg-yellow-100 text-yellow-700', label: 'Medium', order: 2 },
  low: { badge: 'bg-emerald-100 text-emerald-700', label: 'Low', order: 3 },
};

// =============================================================================
// HELPERS
// =============================================================================

function getGaugeColor(score: number): string {
  if (score >= 75) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function getGaugeTrack(score: number): string {
  if (score >= 75) return 'stroke-emerald-400';
  if (score >= 50) return 'stroke-amber-400';
  return 'stroke-red-400';
}

function getBarColor(value: number): string {
  if (value >= 75) return 'bg-emerald-400';
  if (value >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/** Circular gauge for compliance score (0-100). */
function ComplianceGauge({ score }: { score: number }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(score, 100) / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        {/* Background track */}
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-zinc-100"
        />
        {/* Score arc */}
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className={getGaugeTrack(score)}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn('text-lg font-bold tabular-nums', getGaugeColor(score))}>
          {Math.round(score)}
        </span>
        <span className="text-[11px] font-medium text-zinc-400">/ 100</span>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function SnowGlobeDossierNodeSummary({
  nodeId,
  className,
}: SnowGlobeDossierNodeSummaryProps) {
  const { data: rawData, isLoading } = useDossierNodeScores(nodeId);

  const data = rawData as DossierNodeScoresData | undefined;

  const complianceScore = data?.complianceScore ?? 0;

  // Filter engine scores to the relevant three
  const relevantScores = useMemo(() => {
    if (!data?.engineScores) return [];
    return data.engineScores.filter((s) =>
      RELEVANT_ENGINES.includes(s.engine),
    );
  }, [data]);

  // Count findings by severity
  const findings = useMemo(() => data?.findings ?? [], [data]);

  const severityCounts = useMemo(() => {
    const counts: Partial<Record<Severity, number>> = {};
    for (const f of findings) {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
    }
    return counts;
  }, [findings]);

  const totalFindings = findings.length;

  // Top remediation items
  const remediationItems = useMemo(() => {
    if (!data?.remediationSummary) return [];
    return [...data.remediationSummary]
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 3);
  }, [data]);

  const handleDiveDeeper = () => {
    window.dispatchEvent(
      new CustomEvent('mc-navigate', {
        detail: { mode: 'snowglobe', view: 'chambers', nodeId },
      }),
    );
  };

  // --- No node selected ---
  if (nodeId === null) {
    return (
      <div
        className={cn(
          'rounded-xl border border-zinc-200 bg-white p-4 shadow-sm',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-zinc-400">
          <FileCheck className="h-4 w-4" />
          <span className="text-sm">Dossier Node Scores</span>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Select a dossier section to view compliance scores.
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
          <span className="text-sm text-zinc-400">Loading node scores...</span>
        </div>
        <div className="mt-3 flex items-center justify-center">
          <div className="h-20 w-20 rounded-full bg-zinc-100" />
        </div>
        <div className="mt-3 space-y-2">
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
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <FileCheck className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-semibold text-zinc-800">Node Compliance</span>
      </div>

      {/* Compliance gauge */}
      <div className="mb-3 flex items-center gap-4">
        <ComplianceGauge score={complianceScore} />
        <div className="flex-1 space-y-1">
          <p className="text-xs font-medium text-zinc-700">
            {complianceScore >= 75
              ? 'On track'
              : complianceScore >= 50
                ? 'Needs attention'
                : 'Below threshold'}
          </p>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Composite compliance across relevant Snow Globe engines for this dossier node.
          </p>
        </div>
      </div>

      {/* Relevant engine scores */}
      {relevantScores.length > 0 && (
        <div className="mb-3 space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Engine Scores
          </span>
          {relevantScores.map(({ engine, score }) => (
            <div key={engine} className="flex items-center gap-2">
              <span className="w-28 truncate text-[11px] text-zinc-500">
                {CHAMBER_LABELS[engine]}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={cn('h-full rounded-full transition-all', getBarColor(score))}
                  style={{ width: `${Math.min(score, 100)}%` }}
                />
              </div>
              <span className="w-7 text-right text-[11px] font-medium tabular-nums text-zinc-500">
                {Math.round(score)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Active findings count by severity */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs text-zinc-600">
          <strong className="font-semibold">{totalFindings}</strong> finding{totalFindings !== 1 ? 's' : ''}
        </span>
        {(Object.entries(severityCounts) as [Severity, number][]).map(([sev, count]) => {
          const style = SEVERITY_STYLES[sev];
          return (
            <span
              key={sev}
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase',
                style.badge,
              )}
            >
              {count} {style.label}
            </span>
          );
        })}
        {totalFindings === 0 && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            No active findings
          </span>
        )}
      </div>

      {/* Quick remediation summary */}
      {remediationItems.length > 0 && (
        <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Wrench className="h-3 w-3 text-zinc-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Top Remediation
            </span>
          </div>
          <div className="space-y-1">
            {remediationItems.map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                  {item.priority}
                </span>
                <p className="line-clamp-1 text-[11px] leading-snug text-zinc-600">
                  {item.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dive Deeper link */}
      <button
        onClick={handleDiveDeeper}
        className={cn(
          'inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700',
          'transition-colors hover:bg-blue-100 active:bg-blue-200',
        )}
      >
        Dive Deeper
        <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}
