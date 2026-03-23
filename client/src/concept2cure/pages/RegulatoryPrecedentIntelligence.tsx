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

type TabKey = 'crl' | 'rtf' | 'ema' | 'advisory' | 'cross-jurisdictional' | 'calibration';

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
          subtitle="CRL/RTF patterns · EMA taxonomy · Advisory Committee risk · Cross-jurisdictional filing"
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
