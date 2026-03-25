/**
 * Regulatory Precedent Intelligence Dashboard
 *
 * Enterprise page providing unified access to:
 * - CRL/RTF trigger pattern analysis & risk assessment
 * - EMA question taxonomy & clock-stop prediction
 * - Advisory Committee risk modeling & preparation
 * - Cross-jurisdictional intelligence & filing optimization
 * - Confidence calibration & Brier score tracking
 *
 * Placed under RESEARCH > Intelligence in the sidebar navigation.
 * Workflow: Users assess regulatory risk before submission, then drill
 * into specific patterns for mitigation strategies.
 *
 * @module concept2cure/pages/RegulatoryPrecedentIntelligence
 */

import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  AlertTriangle, Shield, Globe, BarChart3, FileSearch,
  Clock, CheckCircle, XCircle,
  Activity, Layers, Target, Zap,
  BookOpen, Scale, Users, ChevronRight,
} from 'lucide-react';
import {
  EnterpriseCard, CardHeader, CardSection, SectionHeader,
  MetricCard, StatusPill, ListItem, EmptyState,
  EnterpriseButton,
} from '@/concept2cure/components/ui/enterprise';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type TabKey = 'crl' | 'rtf' | 'ema' | 'advisory' | 'cross-jurisdictional' | 'calibration' | 'assumptions' | 'decisions' | 'contradictions' | 'overlays' | 'impact';

interface Tab {
  key: TabKey;
  label: string;
}

interface Props {
  onClose?: () => void;
  /** Emit page-level context changes so AnA has full awareness */
  onContextChange?: (context: Record<string, unknown>) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const API_BASE = '/api/regulatory-precedent-intelligence';

const tabs: Tab[] = [
  { key: 'crl', label: 'CRL Patterns' },
  { key: 'rtf', label: 'RTF Prevention' },
  { key: 'ema', label: 'EMA Questions' },
  { key: 'advisory', label: 'Advisory Committee' },
  { key: 'cross-jurisdictional', label: 'Cross-Jurisdictional' },
  { key: 'calibration', label: 'Calibration' },
  { key: 'assumptions', label: 'Assumptions' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'contradictions', label: 'Contradictions' },
  { key: 'overlays', label: 'Overlay Rules' },
  { key: 'impact', label: 'Impact & Staleness' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SUBPANELS
// ═══════════════════════════════════════════════════════════════════════════════

function CRLPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['regulatory-intel', 'crl-stats'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/crl/stats/by-category`);
      if (!res.ok) return { stats: {} };
      return res.json();
    },
  });

  const stats: Record<string, { count: number; avgFrequency: number; avgCycles: number }> = data?.stats ?? {};
  const categories = Object.keys(stats);

  if (isLoading) return <LoadingCards count={4} />;

  if (categories.length === 0) {
    return (
      <EnterpriseCard>
        <EmptyState
          icon={AlertTriangle}
          title="No CRL Trigger Patterns"
          description="Complete Response Letter trigger patterns will appear here once regulatory data is ingested. Patterns are matched to submission type, therapeutic area, and FDA division."
        />
      </EnterpriseCard>
    );
  }

  const totalPatterns = Object.values(stats).reduce((s, c) => s + c.count, 0);
  const avgCycles = categories.length > 0
    ? (Object.values(stats).reduce((s, c) => s + c.avgCycles, 0) / categories.length).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Trigger Categories" value={String(categories.length)} icon={BarChart3} iconClassName="bg-blue-100 text-blue-600" />
        <MetricCard label="Total Patterns" value={String(totalPatterns)} icon={FileSearch} iconClassName="bg-purple-100 text-purple-600" />
        <MetricCard label="Avg Cycles to Resolve" value={avgCycles} icon={Clock} iconClassName="bg-amber-100 text-amber-600" />
        <MetricCard label="Highest Risk" value={formatCategory(categories[0])} icon={AlertTriangle} iconClassName="bg-red-100 text-red-600" />
      </div>

      {/* Category breakdown */}
      <EnterpriseCard noPadding>
        <CardSection border={false}>
          <CardHeader icon={AlertTriangle} iconClassName="bg-red-100 text-red-600" title="CRL Trigger Categories" subtitle="Ordered by frequency rate" />
        </CardSection>
        {categories.map((cat) => (
          <CardSection key={cat}>
            <ListItem
              icon={AlertTriangle}
              iconClassName="bg-amber-100 text-amber-600"
              title={formatCategory(cat)}
              subtitle={`${stats[cat].count} patterns · ${stats[cat].avgCycles.toFixed(1)} avg cycles`}
              meta={
                <StatusPill
                  label={`${((stats[cat].avgFrequency) * 100).toFixed(1)}% freq`}
                  variant={stats[cat].avgFrequency > 0.2 ? 'danger' : stats[cat].avgFrequency > 0.1 ? 'warning' : 'default'}
                />
              }
              chevron
            />
          </CardSection>
        ))}
      </EnterpriseCard>
    </div>
  );
}

function RTFPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['regulatory-intel', 'rtf-stats'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/rtf/stats/by-center`);
      if (!res.ok) return { stats: {} };
      return res.json();
    },
  });

  const stats: Record<string, { count: number; avgFrequency: number; avgRecoveryDays: number }> = data?.stats ?? {};
  const centers = Object.keys(stats);

  if (isLoading) return <LoadingCards count={3} />;

  if (centers.length === 0) {
    return (
      <EnterpriseCard>
        <EmptyState
          icon={XCircle}
          title="No RTF Trigger Patterns"
          description="Refuse to File trigger patterns with recovery playbooks will appear here. Patterns are categorized by FDA center (CDER, CBER, CDRH) and preventability level."
        />
      </EnterpriseCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {centers.map(center => (
          <MetricCard
            key={center}
            label={center}
            value={String(stats[center].count)}
            icon={Shield}
            iconClassName={
              stats[center].avgFrequency > 0.15 ? 'bg-red-100 text-red-600'
              : stats[center].avgFrequency > 0.08 ? 'bg-amber-100 text-amber-600'
              : 'bg-emerald-100 text-emerald-600'
            }
            change={{ value: `${stats[center].avgRecoveryDays}d avg recovery`, positive: stats[center].avgRecoveryDays < 90 }}
          />
        ))}
      </div>
    </div>
  );
}

function EMAPanel() {
  const [selectedPhase, setSelectedPhase] = useState('day_120');
  const phases = ['day_80', 'day_120', 'day_150', 'day_180', 'clock_stop_1', 'clock_stop_2'];

  const { data, isLoading } = useQuery({
    queryKey: ['regulatory-intel', 'ema-patterns', selectedPhase],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/ema/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procedurePhase: selectedPhase, limit: 20 }),
      });
      if (!res.ok) return { patterns: [], count: 0 };
      return res.json();
    },
  });

  const patterns = data?.patterns ?? [];

  return (
    <div className="space-y-6">
      {/* Phase selector */}
      <EnterpriseCard>
        <CardHeader icon={BookOpen} iconClassName="bg-purple-100 text-purple-600" title="EMA Procedure Phase" subtitle="Select a phase to view question patterns" />
        <div className="flex gap-2 flex-wrap mt-4">
          {phases.map(phase => (
            <EnterpriseButton
              key={phase}
              variant={selectedPhase === phase ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setSelectedPhase(phase)}
            >
              {phase.replace(/_/g, ' ').toUpperCase()}
            </EnterpriseButton>
          ))}
        </div>
      </EnterpriseCard>

      {/* Patterns list */}
      {isLoading ? (
        <LoadingCards count={3} />
      ) : patterns.length === 0 ? (
        <EnterpriseCard>
          <EmptyState
            icon={BookOpen}
            title="No EMA Patterns"
            description={`No CHMP question patterns found for ${selectedPhase.replace(/_/g, ' ')}. Patterns include typical CHMP language, escalation risk, and clock-stop probability.`}
          />
        </EnterpriseCard>
      ) : (
        <EnterpriseCard noPadding>
          <CardSection border={false}>
            <CardHeader icon={BookOpen} iconClassName="bg-purple-100 text-purple-600" title={`${patterns.length} Question Patterns`} subtitle={`Phase: ${selectedPhase.replace(/_/g, ' ').toUpperCase()}`} />
          </CardSection>
          {patterns.map((pattern: Record<string, unknown>) => (
            <CardSection key={pattern.id as string}>
              <ListItem
                icon={BookOpen}
                iconClassName="bg-blue-100 text-blue-600"
                title={pattern.patternName as string}
                subtitle={`${formatCategory(pattern.questionCategory as string)} · Freq: ${(((pattern.frequencyRate as number) ?? 0) * 100).toFixed(1)}%`}
                meta={
                  <div className="flex items-center gap-2">
                    {(pattern.escalationRisk as number) > 0.3 && <StatusPill label="Major Objection Risk" variant="danger" dot />}
                    {(pattern.clockStopProbability as number) > 0.4 && <StatusPill label="Clock Stop" variant="purple" dot />}
                  </div>
                }
                chevron
              />
            </CardSection>
          ))}
        </EnterpriseCard>
      )}
    </div>
  );
}

function AdvisoryCommitteePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['regulatory-intel', 'ac-types'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/advisory-committee/committee-types`);
      if (!res.ok) return { committeeTypes: [] };
      return res.json();
    },
  });

  const types: { type: string; patternCount: number }[] = data?.committeeTypes ?? [];

  if (isLoading) return <LoadingCards count={3} />;

  if (types.length === 0) {
    return (
      <EnterpriseCard>
        <EmptyState
          icon={Users}
          title="No Advisory Committee Data"
          description="Advisory committee risk patterns will appear here. Covers ODAC, CRDAC, EMDAC, and other FDA advisory committees with voting pattern analysis and preparation guidance."
        />
      </EnterpriseCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {types.map((t) => (
          <EnterpriseCard key={t.type} interactive>
            <CardHeader
              icon={Users}
              iconClassName="bg-purple-100 text-purple-600"
              title={t.type}
              subtitle={`${t.patternCount} risk patterns`}
              actions={<StatusPill label={`${t.patternCount}`} variant="info" />}
            />
          </EnterpriseCard>
        ))}
      </div>
    </div>
  );
}

function CrossJurisdictionalPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['regulatory-intel', 'xjuris-frameworks'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/cross-jurisdictional/frameworks/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true, limit: 20 }),
      });
      if (!res.ok) return { frameworks: [], count: 0 };
      return res.json();
    },
  });

  const frameworks = data?.frameworks ?? [];

  if (isLoading) return <LoadingCards count={4} />;

  if (frameworks.length === 0) {
    return (
      <EnterpriseCard>
        <EmptyState
          icon={Globe}
          title="No Cross-Jurisdictional Frameworks"
          description="ICH harmonization, Project Orbis, Access Consortium, and mutual recognition pathways will appear here. Includes divergence mapping and filing sequence optimization."
        />
      </EnterpriseCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {frameworks.map((fw: Record<string, unknown>) => (
          <EnterpriseCard key={fw.id as string} interactive>
            <CardHeader
              icon={Globe}
              iconClassName="bg-blue-100 text-blue-600"
              title={fw.frameworkName as string}
              actions={<StatusPill label={(fw.frameworkType as string).replace(/_/g, ' ')} variant="info" />}
            />
            <p className="text-sm text-zinc-500 mt-3">{fw.description as string}</p>
            <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
              <span>{(fw.memberAgencies as string[]).length} agencies</span>
              {fw.typicalTimelineDays && <span>{fw.typicalTimelineDays as number}d timeline</span>}
              {fw.parallelReviewSavingsDays && (
                <StatusPill label={`${fw.parallelReviewSavingsDays as number}d saved`} variant="success" />
              )}
            </div>
          </EnterpriseCard>
        ))}
      </div>
    </div>
  );
}

function CalibrationPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['regulatory-intel', 'calibration-report'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/confidence/calibration-report`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  if (isLoading) return <LoadingCards count={4} />;

  if (!data || data.totalPredictions === 0) {
    return (
      <EnterpriseCard>
        <EmptyState
          icon={Target}
          title="No Calibration Data"
          description="Confidence calibration metrics will appear as predictions are tracked and resolved. The system uses Brier scoring and calibration buckets to ensure accurate confidence estimates."
        />
      </EnterpriseCard>
    );
  }

  const brierVariant = data.averageBrierScore < 0.15 ? 'success' : data.averageBrierScore < 0.25 ? 'warning' : 'danger';
  const biasVariant = Math.abs(data.overconfidenceBias) < 0.05 ? 'success' : 'warning';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Predictions" value={String(data.totalPredictions)} icon={BarChart3} iconClassName="bg-blue-100 text-blue-600" />
        <MetricCard label="Resolved" value={String(data.resolvedPredictions)} icon={CheckCircle} iconClassName="bg-emerald-100 text-emerald-600" />
        <MetricCard label="Brier Score" value={data.averageBrierScore.toFixed(4)} icon={Target} iconClassName={brierVariant === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'} />
        <MetricCard label="Overconfidence Bias" value={data.overconfidenceBias.toFixed(4)} icon={Scale} iconClassName={biasVariant === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'} />
      </div>

      <EnterpriseCard>
        <CardHeader icon={Zap} iconClassName="bg-blue-100 text-blue-600" title="Recommendation" />
        <p className="text-sm text-zinc-600 mt-3">{data.recommendation}</p>
      </EnterpriseCard>

      {Object.keys(data.calibrationByBucket).length > 0 && (
        <EnterpriseCard noPadding>
          <CardSection border={false}>
            <CardHeader icon={BarChart3} iconClassName="bg-purple-100 text-purple-600" title="Calibration by Confidence Bucket" />
          </CardSection>
          {Object.entries(data.calibrationByBucket).map(([bucket, vals]: [string, Record<string, number>]) => (
            <CardSection key={bucket}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-zinc-700">{bucket}</span>
                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span>Predicted: {((vals.predicted ?? 0) * 100).toFixed(1)}%</span>
                  <span>Actual: {((vals.actual ?? 0) * 100).toFixed(1)}%</span>
                  <StatusPill label={`${vals.count ?? 0} samples`} variant="default" />
                </div>
              </div>
            </CardSection>
          ))}
        </EnterpriseCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOVERNED INTELLIGENCE PANELS (Sprint 2)
// ═══════════════════════════════════════════════════════════════════════════════

const GOV_API = '/api/governed-intelligence';

function AssumptionsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['governed-intel', 'assumptions'],
    queryFn: async () => {
      const res = await fetch(`${GOV_API}/assumptions/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active', limit: 30 }),
      });
      if (!res.ok) return { assumptions: [], count: 0 };
      return res.json();
    },
  });

  const assumptions = data?.assumptions ?? [];

  if (isLoading) return <LoadingCards count={4} />;

  if (assumptions.length === 0) {
    return (
      <EnterpriseCard>
        <EmptyState
          icon={Layers}
          title="No Assumptions Registered"
          description="Register structured assumptions with source attribution, confidence levels, and regulator compatibility. Assumptions are project-bound and traceable."
        />
      </EnterpriseCard>
    );
  }

  const byDomain: Record<string, number> = {};
  for (const a of assumptions) {
    byDomain[a.domainTrack] = (byDomain[a.domainTrack] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Active Assumptions" value={String(assumptions.length)} icon={Layers} iconClassName="bg-blue-100 text-blue-600" />
        <MetricCard label="Domains" value={String(Object.keys(byDomain).length)} icon={Activity} iconClassName="bg-purple-100 text-purple-600" />
      </div>
      <EnterpriseCard noPadding>
        <CardSection border={false}>
          <CardHeader icon={Layers} iconClassName="bg-blue-100 text-blue-600" title="Assumption Registry" subtitle="Structured, project-bound assumptions" />
        </CardSection>
        {assumptions.slice(0, 15).map((a: Record<string, unknown>) => (
          <CardSection key={a.id as string}>
            <ListItem
              icon={Layers}
              iconClassName="bg-blue-100 text-blue-600"
              title={a.title as string}
              subtitle={`${formatCategory(a.domainTrack as string)} · ${formatCategory(a.category as string)} · Value: ${a.assumedValue as string}`}
              meta={
                <StatusPill
                  label={a.confidenceLevel as string}
                  variant={(a.confidenceLevel as string) === 'definitive' ? 'success' : (a.confidenceLevel as string) === 'high' ? 'info' : 'warning'}
                />
              }
              chevron
            />
          </CardSection>
        ))}
      </EnterpriseCard>
    </div>
  );
}

function DecisionsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['governed-intel', 'decisions'],
    queryFn: async () => {
      const res = await fetch(`${GOV_API}/decisions/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 30 }),
      });
      if (!res.ok) return { decisions: [], count: 0 };
      return res.json();
    },
  });

  const decisions = data?.decisions ?? [];

  if (isLoading) return <LoadingCards count={4} />;

  if (decisions.length === 0) {
    return (
      <EnterpriseCard>
        <EmptyState
          icon={CheckCircle}
          title="No Decision Records"
          description="Decision records track the full lifecycle: proposed → under_review → approved → executed. Each links to assumptions, artifacts, and workflow runs."
        />
      </EnterpriseCard>
    );
  }

  const stateVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger' | 'purple'> = {
    proposed: 'default', under_review: 'info', approved: 'success',
    rejected: 'danger', executed: 'purple', deferred: 'warning',
    escalated: 'danger', superseded: 'default',
  };

  return (
    <div className="space-y-6">
      <EnterpriseCard noPadding>
        <CardSection border={false}>
          <CardHeader icon={CheckCircle} iconClassName="bg-emerald-100 text-emerald-600" title="Decision Records" subtitle="Recommendation → Approval → Execution lifecycle" />
        </CardSection>
        {decisions.slice(0, 15).map((d: Record<string, unknown>) => (
          <CardSection key={d.id as string}>
            <ListItem
              icon={CheckCircle}
              iconClassName="bg-emerald-100 text-emerald-600"
              title={d.title as string}
              subtitle={`${formatCategory(d.domainTrack as string)} · ${formatCategory(d.recommendationType as string)}`}
              meta={
                <StatusPill
                  label={formatCategory(d.actionState as string)}
                  variant={stateVariant[d.actionState as string] ?? 'default'}
                  dot
                />
              }
              chevron
            />
          </CardSection>
        ))}
      </EnterpriseCard>
    </div>
  );
}

function ContradictionsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['governed-intel', 'contradictions'],
    queryFn: async () => {
      const res = await fetch(`${GOV_API}/contradictions/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 30 }),
      });
      if (!res.ok) return { findings: [], count: 0 };
      return res.json();
    },
  });

  const findings = data?.findings ?? [];

  if (isLoading) return <LoadingCards count={4} />;

  if (findings.length === 0) {
    return (
      <EnterpriseCard>
        <EmptyState
          icon={AlertTriangle}
          title="No Contradiction Findings"
          description="Run a project contradiction scan to detect assumption drift, decision/action inconsistencies, and cross-jurisdictional divergences. Each finding includes source classification, severity, and consequence paths."
        />
      </EnterpriseCard>
    );
  }

  const severityVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
    critical: 'danger', high: 'danger', medium: 'warning', low: 'default',
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Findings" value={String(findings.length)} icon={AlertTriangle} iconClassName="bg-red-100 text-red-600" />
        <MetricCard label="Unresolved" value={String(findings.filter((f: Record<string, unknown>) => f.reviewState === 'unresolved').length)} icon={XCircle} iconClassName="bg-amber-100 text-amber-600" />
      </div>
      <EnterpriseCard noPadding>
        <CardSection border={false}>
          <CardHeader icon={AlertTriangle} iconClassName="bg-red-100 text-red-600" title="Contradiction Findings" subtitle="Structured-first detection with source classification" />
        </CardSection>
        {findings.slice(0, 15).map((f: Record<string, unknown>) => (
          <CardSection key={f.id as string}>
            <ListItem
              icon={AlertTriangle}
              iconClassName={f.severity === 'critical' ? 'bg-red-100 text-red-600' : f.severity === 'high' ? 'bg-orange-100 text-orange-600' : 'bg-amber-100 text-amber-600'}
              title={f.title as string}
              subtitle={`${formatCategory(f.contradictionType as string)} · Source: ${formatCategory(f.sourceClassification as string)} · ${formatCategory(f.authorityState as string)}`}
              meta={
                <div className="flex items-center gap-2">
                  <StatusPill label={f.severity as string} variant={severityVariant[f.severity as string] ?? 'default'} dot />
                  <StatusPill label={formatCategory(f.reviewState as string)} variant={f.reviewState === 'unresolved' ? 'warning' : 'success'} />
                </div>
              }
              chevron
            />
          </CardSection>
        ))}
      </EnterpriseCard>
    </div>
  );
}

// ─── Overlay Rules Panel (Pass 15) ───────────────────────────────────────────

function OverlayRulesPanel() {
  const [seeding, setSeeding] = React.useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['governed-intel', 'overlay-rules'],
    queryFn: async () => {
      const res = await fetch(`${GOV_API}/overlays/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 }),
      });
      if (!res.ok) return { rules: [], count: 0 };
      return res.json();
    },
  });

  const rules = data?.rules ?? [];

  const handleSeedRules = async () => {
    setSeeding(true);
    try {
      await fetch('/api/authoring-actions/seed-overlay-rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      });
      refetch();
    } catch { /* ignore */ }
    setSeeding(false);
  };

  if (isLoading) return <LoadingCards count={3} />;

  const bodyIcon: Record<string, string> = { FDA: 'bg-blue-100 text-blue-600', EMA: 'bg-green-100 text-green-600', PMDA: 'bg-purple-100 text-purple-600', MHRA: 'bg-amber-100 text-amber-600' };
  const authorityVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
    advisory_only: 'default', requires_review: 'info', requires_approval: 'warning', blocks_promotion: 'danger', requires_escalation: 'danger',
  };
  const severityVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
    critical: 'danger', high: 'danger', medium: 'warning', low: 'default',
  };

  if (rules.length === 0) {
    return (
      <EnterpriseCard>
        <EmptyState
          icon={Layers}
          title="No Overlay Rules"
          description="Overlay rules adapt contradiction severity, authority, and consequences by regulator body. Seed the default rules to get started."
        />
        <div className="px-6 pb-6 flex justify-center">
          <EnterpriseButton onClick={handleSeedRules} disabled={seeding} size="md">
            {seeding ? 'Seeding...' : 'Seed Default Overlay Rules'}
          </EnterpriseButton>
        </div>
      </EnterpriseCard>
    );
  }

  // Group by regulator body
  const byBody: Record<string, typeof rules> = {};
  for (const r of rules) {
    const body = (r.regulatorBody as string) || 'General';
    if (!byBody[body]) byBody[body] = [];
    byBody[body].push(r);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Rules" value={String(rules.length)} icon={Layers} iconClassName="bg-blue-100 text-blue-600" />
        <MetricCard label="Regulator Bodies" value={String(Object.keys(byBody).length)} icon={Globe} iconClassName="bg-green-100 text-green-600" />
        <MetricCard label="Blocking Rules" value={String(rules.filter((r: Record<string, unknown>) => r.authorityOverride === 'blocks_promotion').length)} icon={Shield} iconClassName="bg-red-100 text-red-600" />
        <MetricCard label="Active" value={String(rules.filter((r: Record<string, unknown>) => r.active !== false).length)} icon={CheckCircle} iconClassName="bg-emerald-100 text-emerald-600" />
      </div>

      {Object.entries(byBody).map(([body, bodyRules]) => (
        <EnterpriseCard key={body} noPadding>
          <CardSection border={false}>
            <CardHeader
              icon={Globe}
              iconClassName={bodyIcon[body] ?? 'bg-zinc-100 text-zinc-600'}
              title={`${body} Overlay Rules`}
              subtitle={`${bodyRules.length} rule${bodyRules.length !== 1 ? 's' : ''} — adapts contradiction handling for ${body} submissions`}
            />
          </CardSection>
          {bodyRules.map((r: Record<string, unknown>) => (
            <CardSection key={r.id as string || r.ruleCode as string}>
              <ListItem
                icon={Shield}
                iconClassName={r.authorityOverride === 'blocks_promotion' ? 'bg-red-100 text-red-600' : r.authorityOverride === 'requires_approval' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}
                title={r.ruleName as string || r.ruleCode as string}
                subtitle={`${formatCategory(r.contradictionType as string)} · Priority: ${r.priority ?? '—'} · ${r.regulatoryReference || 'No ref'}`}
                meta={
                  <div className="flex items-center gap-2">
                    {r.severityOverride && <StatusPill label={`→ ${r.severityOverride as string}`} variant={severityVariant[r.severityOverride as string] ?? 'default'} dot />}
                    {r.authorityOverride && <StatusPill label={formatCategory(r.authorityOverride as string)} variant={authorityVariant[r.authorityOverride as string] ?? 'default'} />}
                  </div>
                }
                chevron
              />
              {r.description && (
                <div className="text-xs text-zinc-500 mt-1 pl-9 leading-relaxed">{r.description as string}</div>
              )}
            </CardSection>
          ))}
        </EnterpriseCard>
      ))}

      <div className="flex justify-end">
        <EnterpriseButton onClick={handleSeedRules} disabled={seeding} size="sm" variant="secondary">
          {seeding ? 'Seeding...' : 'Re-seed Default Rules'}
        </EnterpriseButton>
      </div>
    </div>
  );
}

// ─── Impact & Staleness Panel ────────────────────────────────────────────────

function ImpactPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['governed-intel', 'impact-summary', 1],
    queryFn: async () => {
      const res = await fetch(`${GOV_API}/impact-summary/1`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: staleData } = useQuery({
    queryKey: ['governed-intel', 'stale-deps', 1],
    queryFn: async () => {
      const res = await fetch(`${GOV_API}/dependencies/stale/1`);
      if (!res.ok) return { stale: [], count: 0 };
      return res.json();
    },
  });

  if (isLoading) return <LoadingCards count={4} />;

  if (!data || data.totalDependencies === 0) {
    return (
      <EnterpriseCard>
        <EmptyState
          icon={Activity}
          title="No Reactive Dependencies"
          description="When assumptions, decisions, or contradictions are linked to downstream artifacts, staleness and impact tracking will appear here. The system reacts automatically when upstream objects change."
        />
      </EnterpriseCard>
    );
  }

  const staleDeps = staleData?.stale ?? [];

  const impactVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
    stale: 'danger', requires_review: 'warning', requires_reapproval: 'danger',
    impacted: 'warning', blocked_by_contradiction: 'danger', unaffected: 'success',
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Dependencies" value={String(data.totalDependencies)} icon={Layers} iconClassName="bg-blue-100 text-blue-600" />
        <MetricCard
          label="Stale"
          value={String(data.staleDependencies)}
          icon={Clock}
          iconClassName={data.staleDependencies > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}
        />
      </div>

      {/* Impact state breakdown */}
      {Object.keys(data.byImpactState).length > 0 && (
        <EnterpriseCard>
          <CardHeader icon={AlertTriangle} iconClassName="bg-amber-100 text-amber-600" title="Impact States" subtitle="Governed objects requiring attention" />
          <div className="flex flex-wrap gap-2 mt-3">
            {Object.entries(data.byImpactState).map(([state, count]: [string, number]) => (
              <StatusPill key={state} label={`${formatCategory(state)}: ${count}`} variant={impactVariant[state] ?? 'default'} dot />
            ))}
          </div>
        </EnterpriseCard>
      )}

      {/* Stale dependencies list */}
      {staleDeps.length > 0 && (
        <EnterpriseCard noPadding>
          <CardSection border={false}>
            <CardHeader icon={Clock} iconClassName="bg-red-100 text-red-600" title="Stale Dependencies" subtitle="Upstream changes have invalidated these objects" />
          </CardSection>
          {staleDeps.slice(0, 10).map((dep: Record<string, unknown>) => (
            <CardSection key={dep.id as string}>
              <ListItem
                icon={AlertTriangle}
                iconClassName="bg-amber-100 text-amber-600"
                title={`${formatCategory(dep.targetType as string)}: ${dep.targetLabel ?? dep.targetId}`}
                subtitle={`Stale because: ${dep.staleReason ?? 'upstream changed'} · Source: ${formatCategory(dep.sourceType as string)}`}
                meta={
                  <StatusPill label={formatCategory(dep.targetImpactState as string)} variant={impactVariant[dep.targetImpactState as string] ?? 'warning'} dot />
                }
                chevron
              />
            </CardSection>
          ))}
        </EnterpriseCard>
      )}

      {/* Recent propagation events */}
      {data.recentPropagations?.length > 0 && (
        <EnterpriseCard noPadding>
          <CardSection border={false}>
            <CardHeader icon={Activity} iconClassName="bg-purple-100 text-purple-600" title="Recent Propagation Events" subtitle="System reactivity audit trail" />
          </CardSection>
          {data.recentPropagations.slice(0, 8).map((p: Record<string, unknown>, i: number) => (
            <CardSection key={i}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-700">{formatCategory(p.triggerType as string)}</span>
                <StatusPill label={formatCategory(p.actionTaken as string)} variant="info" />
              </div>
            </CardSection>
          ))}
        </EnterpriseCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function LoadingCards({ count }: { count: number }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-28 bg-zinc-100 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}

function formatCategory(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

const TAB_CONTEXT: Record<TabKey, string> = {
  crl: 'CRL (Complete Response Letter) trigger patterns with deficiency analysis, trajectory prediction, and resolution strategies',
  rtf: 'RTF (Refuse to File) trigger patterns with prevention checklists and recovery playbooks by FDA center',
  ema: 'EMA CHMP question patterns by procedure phase (Day 80/120/150/180), clock-stop prediction, and major objection risk',
  advisory: 'FDA Advisory Committee risk modeling (ODAC, CRDAC, EMDAC) with voting patterns, panelist sensitivity, and preparation plans',
  'cross-jurisdictional': 'Cross-jurisdictional intelligence: ICH harmonization, Project Orbis, Access Consortium, divergence mapping, filing sequence optimization',
  calibration: 'Confidence calibration with Brier scoring, recency decay, backtesting accuracy, and overconfidence bias tracking',
  assumptions: 'Assumption Registry: structured, project-bound assumptions with source attribution, confidence, regulator compatibility, and supersession tracking',
  decisions: 'Decision Records: recommendation → approval → execution lifecycle with confidence, evidence basis, and artifact linkage',
  contradictions: 'Contradiction Detection: structured-first cross-artifact comparison with source classification, approval authority, overlay rules, and consequence paths',
  impact: 'Impact & Staleness: reactive dependency tracking showing stale/impacted governed objects, propagation history, and downstream impact scope',
};

export default function RegulatoryPrecedentIntelligence({ onClose, onContextChange }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('crl');

  // Emit context to AnA whenever the active tab changes
  React.useEffect(() => {
    onContextChange?.({
      module: 'regulatory-precedent-intelligence',
      activeTab,
      activeTabLabel: tabs.find(t => t.key === activeTab)?.label ?? activeTab,
      tabDescription: TAB_CONTEXT[activeTab],
      availableModules: 'CRL Patterns, RTF Prevention, EMA Questions, Advisory Committee, Cross-Jurisdictional, Calibration',
    });
  }, [activeTab, onContextChange]);

  const renderPanel = useCallback(() => {
    switch (activeTab) {
      case 'crl': return <CRLPanel />;
      case 'rtf': return <RTFPanel />;
      case 'ema': return <EMAPanel />;
      case 'advisory': return <AdvisoryCommitteePanel />;
      case 'cross-jurisdictional': return <CrossJurisdictionalPanel />;
      case 'calibration': return <CalibrationPanel />;
      case 'assumptions': return <AssumptionsPanel />;
      case 'decisions': return <DecisionsPanel />;
      case 'contradictions': return <ContradictionsPanel />;
      case 'overlays': return <OverlayRulesPanel />;
      case 'impact': return <ImpactPanel />;
      default: return null;
    }
  }, [activeTab]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* ── Page header ── */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-zinc-200 bg-white sticky top-0 z-10">
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={18} className="text-zinc-500" />
          </button>
        )}
        <SectionHeader
          icon={Shield}
          iconClassName="bg-blue-100 text-blue-600"
          title="Regulatory Precedent Intelligence"
          subtitle="Precedent patterns · Assumptions · Decisions · Contradictions · Overlays"
          level={1}
        />
      </div>

      {/* ── Tab navigation ── */}
      <div className="px-6 border-b border-zinc-200 bg-white overflow-x-auto">
        <div className="flex gap-1 min-w-max -mb-px">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-3 text-sm font-medium transition-colors border-b-2',
                activeTab === tab.key
                  ? 'text-blue-600 border-blue-600'
                  : 'text-zinc-500 border-transparent hover:text-zinc-700 hover:border-zinc-300'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-6 bg-zinc-50">
        {renderPanel()}
      </div>
    </div>
  );
}
