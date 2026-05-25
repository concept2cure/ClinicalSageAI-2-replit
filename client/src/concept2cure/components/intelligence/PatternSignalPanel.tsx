/**
 * PatternSignalPanel — Displays RIM pattern matches and signal trends.
 *
 * Two sections:
 *   1. Active Pattern Alerts — matched patterns with category, severity, hit count
 *   2. Signal Trend — compact summary of total signals, trend direction, risk breakdown
 *
 * Uses governed components (Card, Badge) and the calm stone palette.
 */

import React from 'react';
import { Activity, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataStateWrapper } from '@/components/ui/statesV2';
import {
  useRIMSignals,
  useRIMAssessment,
  type RIMSignalSummary,
  type RIMAssessment,
  type RIMPatternMatch,
  type TrendConfidence,
} from '../../hooks/useIntelligence';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface PatternSignalPanelProps {
  projectId: number | string;
}

// ── Severity colors (stone palette, muted) ─────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-stone-100 text-stone-600 border-stone-200',
};

const CATEGORY_STYLES: Record<string, string> = {
  deficiency: 'bg-red-50 text-red-600',
  reviewer_trigger: 'bg-orange-50 text-orange-600',
  rejection: 'bg-red-50 text-red-700',
  strong_language: 'bg-emerald-50 text-emerald-600',
  weak_language: 'bg-amber-50 text-amber-600',
  data_gap: 'bg-violet-50 text-violet-600',
  consistency_issue: 'bg-blue-50 text-blue-600',
  formatting: 'bg-stone-100 text-stone-500',
  risk_signal: 'bg-orange-50 text-orange-600',
};

function categoryLabel(cat: string): string {
  return cat.replace(/_/g, ' ');
}

// ── Trend icon ──────────────────────────────────────────────────────────────────

function TrendIcon({ direction }: { direction: 'improving' | 'stable' | 'declining' }) {
  if (direction === 'improving')
    return <TrendingUp className="w-3.5 h-3.5 text-emerald-600" aria-label="Improving" />;
  if (direction === 'declining')
    return <TrendingDown className="w-3.5 h-3.5 text-red-500" aria-label="Declining" />;
  return <Minus className="w-3.5 h-3.5 text-stone-400" aria-label="Stable" />;
}

function trendArrow(direction: 'improving' | 'stable' | 'declining'): string {
  if (direction === 'improving') return '\u2191';
  if (direction === 'declining') return '\u2193';
  return '\u2192';
}

function confidenceLabel(c: TrendConfidence): string {
  const labels: Record<TrendConfidence, string> = {
    high: 'High confidence',
    moderate: 'Moderate confidence',
    low: 'Low confidence',
    insufficient: 'Insufficient data',
  };
  return labels[c] ?? c;
}

// ── Risk level breakdown ────────────────────────────────────────────────────────

function RiskBreakdown({ byRiskLevel }: { byRiskLevel: Partial<Record<string, number>> }) {
  const levels = ['critical', 'high', 'medium', 'low'] as const;
  const total = Object.values(byRiskLevel).reduce((s: number, n) => s + (n ?? 0), 0);
  if (total === 0) return null;

  return (
    <div className="flex items-center gap-3" role="list" aria-label="Risk level breakdown">
      {levels.map(level => {
        const count = byRiskLevel[level] ?? 0;
        if (count === 0) return null;
        return (
          <div key={level} className="flex items-center gap-1" role="listitem">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                level === 'critical'
                  ? 'bg-red-500'
                  : level === 'high'
                    ? 'bg-orange-400'
                    : level === 'medium'
                      ? 'bg-amber-400'
                      : 'bg-stone-300'
              }`}
            />
            <span className="text-[11px] text-stone-500 capitalize">{level}</span>
            <span className="text-[11px] font-semibold text-stone-700">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Pattern alert row ───────────────────────────────────────────────────────────

interface PatternAlertRowProps {
  match: RIMPatternMatch;
}

function PatternAlertRow({ match }: PatternAlertRowProps) {
  const { pattern, matchLocation } = match;
  const severityStyle = SEVERITY_STYLES[pattern.severity] ?? SEVERITY_STYLES.low;
  const catStyle = CATEGORY_STYLES[pattern.category] ?? 'bg-stone-100 text-stone-500';

  return (
    <div
      className={`flex flex-col gap-1 p-2.5 rounded-lg border ${severityStyle}`}
      role="article"
      aria-label={`Pattern: ${pattern.name}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <AlertTriangle className="w-3 h-3 shrink-0 opacity-70" />
          <span className="text-[13px] font-medium truncate">{pattern.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 h-4 border-0 ${catStyle}`}
          >
            {categoryLabel(pattern.category)}
          </Badge>
          <span className="text-[10px] text-stone-400 tabular-nums">
            {pattern.hitCount}x
          </span>
        </div>
      </div>
      <p className="text-[12px] text-stone-500 leading-relaxed line-clamp-2">
        {pattern.description}
      </p>
      <div className="flex items-center justify-between text-[10px] text-stone-400">
        {matchLocation && <span className="truncate">{matchLocation}</span>}
        {pattern.lastMatchedAt && (
          <time dateTime={pattern.lastMatchedAt}>
            {new Date(pattern.lastMatchedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </time>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────────

export function PatternSignalPanel({ projectId }: PatternSignalPanelProps) {
  const signalsQuery = useRIMSignals(projectId);
  const assessmentQuery = useRIMAssessment(projectId);

  return (
    <div className="space-y-3" data-testid="pattern-signal-panel">
      {/* ── Section A: Active Pattern Alerts ──────────────────────────── */}
      <Card className="border-stone-200 shadow-none">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="flex items-center gap-1.5 text-[13px] font-semibold text-stone-700">
            <AlertTriangle className="w-3.5 h-3.5 text-stone-500" />
            Active Pattern Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <DataStateWrapper<RIMAssessment>
            isLoading={assessmentQuery.isLoading}
            error={assessmentQuery.error ?? null}
            data={assessmentQuery.data ?? null}
            loadingMessage="Scanning patterns..."
            emptyTitle="No patterns detected"
            emptyDescription="Run a RIM assessment to scan for regulatory patterns."
            isEmpty={(d) => !d.patternMatches || d.patternMatches.length === 0}
            retry={() => { assessmentQuery.refetch(); }}
            testId="pattern-alerts"
          >
            {(assessment) => (
              <div className="space-y-2" role="list" aria-label="Pattern alerts">
                {assessment.patternMatches.map((match, i) => (
                  <PatternAlertRow key={match.patternId ?? i} match={match} />
                ))}
              </div>
            )}
          </DataStateWrapper>
        </CardContent>
      </Card>

      {/* ── Section B: Signal Trend ───────────────────────────────────── */}
      <Card className="border-stone-200 shadow-none">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="flex items-center gap-1.5 text-[13px] font-semibold text-stone-700">
            <Activity className="w-3.5 h-3.5 text-stone-500" />
            Signal Trend
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <DataStateWrapper<RIMSignalSummary>
            isLoading={signalsQuery.isLoading}
            error={signalsQuery.error ?? null}
            data={signalsQuery.data ?? null}
            loadingMessage="Loading signals..."
            emptyTitle="No signals yet"
            emptyDescription="Signals accumulate as you work with documents and run assessments."
            isEmpty={(d) => d.totalSignals === 0}
            retry={() => { signalsQuery.refetch(); }}
            testId="signal-trend"
          >
            {(signals) => (
              <div className="space-y-3">
                {/* Summary row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-semibold text-stone-800 tabular-nums">
                      {signals.totalSignals}
                    </span>
                    <span className="text-[12px] text-stone-400">total signals</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-stone-50 rounded-md">
                    <TrendIcon direction={signals.overallTrend} />
                    <span className="text-[13px] font-medium text-stone-600">
                      {trendArrow(signals.overallTrend)} {signals.overallTrend}
                    </span>
                  </div>
                </div>

                {/* Confidence + average score */}
                <div className="flex items-center gap-4 text-[12px] text-stone-500">
                  <span>{confidenceLabel(signals.trendConfidence)}</span>
                  <span className="text-stone-300">|</span>
                  <span>Avg score: <strong className="text-stone-700">{signals.averageScore}</strong></span>
                  <span className="text-stone-300">|</span>
                  <span>Sample: {signals.trendSampleSize}</span>
                </div>

                {/* Risk breakdown */}
                <RiskBreakdown byRiskLevel={signals.byRiskLevel} />

                {/* Top patterns */}
                {signals.topPatternIds.length > 0 && (
                  <div className="pt-1">
                    <span className="text-[11px] text-stone-400 uppercase tracking-wider font-medium">
                      Top patterns
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {signals.topPatternIds.map(pid => (
                        <Badge
                          key={pid}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 h-4 bg-stone-50 text-stone-500 border-stone-200"
                        >
                          {pid}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DataStateWrapper>
        </CardContent>
      </Card>
    </div>
  );
}
