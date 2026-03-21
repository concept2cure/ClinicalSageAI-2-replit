/**
 * @fileoverview AnA Snow Globe — Chamber Detail View
 * @module concept2cure/pages/SnowGlobe/SnowGlobeChambers
 * @version 1.0.0
 *
 * Tabbed deep-dive into each of the 6 prediction engines (chambers).
 * Shows per-engine scores, findings, remediation actions, and regulatory
 * intelligence insights.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileCheck,
  FlaskConical,
  History,
  Info,
  Lightbulb,
  Loader2,
  Minus,
  Play,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

import {
  useProgramScores,
  useTopFindings,
  useRemediationPlan,
  useRunFullStressTest,
  useRunPreAgencyScan,
  useRunReviewerAttack,
  useRunAuditExposure,
} from '../../hooks/useSnowGlobe';

// =============================================================================
// TYPES
// =============================================================================

interface SnowGlobeChambersProps {
  programId: number | null;
  initialChamber?: string;
}

type ChamberKey =
  | 'agency_screen'
  | 'reviewer_attack'
  | 'audit_inspection'
  | 'route_timing'
  | 'evidence_sufficiency'
  | 'collaboration_fragility';

type Severity = 'critical' | 'high' | 'medium' | 'low';
type Trend = 'up' | 'down' | 'flat';
type EffortLevel = 'low' | 'medium' | 'high';

interface ChamberDef {
  key: ChamberKey;
  label: string;
  icon: React.ElementType;
  accent: string;
  bg: string;
  border: string;
  description: string;
  scoreKey: string;
  lowerIsBetter: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CHAMBERS: ChamberDef[] = [
  {
    key: 'agency_screen',
    label: 'Agency Screen',
    icon: FileCheck,
    accent: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    description:
      'Pre-technical screening simulation — validates eCTD packaging, metadata compliance, and gateway acceptance criteria before submission.',
    scoreKey: 'pre_technical_rejection',
    lowerIsBetter: true,
  },
  {
    key: 'reviewer_attack',
    label: 'Reviewer Attack',
    icon: AlertTriangle,
    accent: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    description:
      'Adversarial reviewer simulation — identifies claim overreach, evidence gaps, and likely Information Request triggers from medical/statistical reviewers.',
    scoreKey: 'reviewer_friction',
    lowerIsBetter: true,
  },
  {
    key: 'audit_inspection',
    label: 'Audit & Inspection',
    icon: Shield,
    accent: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-blue-200',
    description:
      'GCP/GMP audit readiness assessment — evaluates traceability, document integrity, and inspection trail completeness for regulatory audits.',
    scoreKey: 'audit_exposure',
    lowerIsBetter: true,
  },
  {
    key: 'route_timing',
    label: 'Route & Timing',
    icon: Clock,
    accent: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    description:
      'Regulatory pathway viability analysis — models submission timing, pathway alternatives, and approval probability curves across agencies.',
    scoreKey: 'route_viability',
    lowerIsBetter: false,
  },
  {
    key: 'evidence_sufficiency',
    label: 'Evidence Sufficiency',
    icon: FlaskConical,
    accent: 'text-teal-600',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    description:
      'Clinical evidence completeness scoring — assesses endpoint coverage, statistical power, and supporting study adequacy for each claim.',
    scoreKey: 'claim_defensibility',
    lowerIsBetter: false,
  },
  {
    key: 'collaboration_fragility',
    label: 'Collaboration Fragility',
    icon: Users,
    accent: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    description:
      'Team collaboration risk analysis — identifies review bottlenecks, approval chain gaps, and coordination failures across functional areas.',
    scoreKey: 'approval_chain_fragility',
    lowerIsBetter: true,
  },
];

const SEVERITY_STYLES: Record<Severity, { dot: string; badge: string; label: string }> = {
  critical: { dot: 'bg-red-500', badge: 'bg-red-100 text-red-700 border-red-200', label: 'Critical' },
  high: { dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-200', label: 'High' },
  medium: { dot: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Medium' },
  low: { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Low' },
};

const EFFORT_STYLES: Record<EffortLevel, { badge: string; label: string }> = {
  low: { badge: 'bg-emerald-100 text-emerald-700', label: 'Low Effort' },
  medium: { badge: 'bg-yellow-100 text-yellow-700', label: 'Medium Effort' },
  high: { badge: 'bg-red-100 text-red-700', label: 'High Effort' },
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const HISTORICAL_PRECEDENTS: Record<ChamberKey, Array<{ title: string; outcome: string; year: number }>> = {
  agency_screen: [
    { title: 'Similar eCTD metadata gap in oncology NDA', outcome: 'Resolved with 2-week amendment cycle', year: 2024 },
    { title: 'Bookmark non-compliance in CNS BLA', outcome: 'Pre-technical rejection, 6-week delay', year: 2023 },
    { title: 'Naming inconsistency across rare disease NDA modules', outcome: 'Information Request issued day 30', year: 2024 },
  ],
  reviewer_attack: [
    { title: 'Efficacy claim overreach in cardiovascular NDA', outcome: 'Complete Response Letter issued', year: 2023 },
    { title: 'Missing subgroup analysis in dermatology BLA', outcome: 'Advisory Committee referral, 4-month delay', year: 2024 },
    { title: 'Safety signal underreporting in pain management NDA', outcome: 'REMS requirement added to label', year: 2023 },
  ],
  audit_inspection: [
    { title: 'GCP inspection finding at CRO site', outcome: 'Official Action Indicated, 3-month remediation', year: 2024 },
    { title: 'Traceability gap in device PMA audit', outcome: 'Warning letter, required CAPA plan', year: 2023 },
    { title: 'Document integrity issue in biologics inspection', outcome: 'Voluntary Action Indicated, resolved in 6 weeks', year: 2024 },
  ],
  route_timing: [
    { title: 'Accelerated pathway reclassification for rare disease', outcome: 'Breakthrough designation granted, 2-month faster review', year: 2024 },
    { title: 'Priority review voucher used for tropical disease NDA', outcome: 'Approval in 6 months vs. 12 standard', year: 2023 },
    { title: 'Rolling submission strategy for pandemic therapy', outcome: 'EUA granted 8 weeks after final module', year: 2023 },
  ],
  evidence_sufficiency: [
    { title: 'Single-arm trial sufficiency challenge in oncology', outcome: 'Accepted with real-world evidence supplement', year: 2024 },
    { title: 'Surrogate endpoint adequacy for cardiovascular claim', outcome: 'Required post-marketing confirmatory trial', year: 2023 },
    { title: 'Adaptive trial design evidence gap', outcome: 'Pre-specified analysis accepted after SAP amendment', year: 2024 },
  ],
  collaboration_fragility: [
    { title: 'Cross-functional review bottleneck in large pharma NDA', outcome: 'Missed PDUFA date by 3 months', year: 2023 },
    { title: 'Approval chain failure in multi-site CRO coordination', outcome: 'Protocol amendment cycle extended 8 weeks', year: 2024 },
    { title: 'Communication gap between CMC and clinical teams', outcome: 'Module 3/Module 5 inconsistency caught in pre-submission', year: 2024 },
  ],
};

const RECOMMENDED_ACTIONS: Record<ChamberKey, string[]> = {
  agency_screen: [
    'Run eCTD gateway validation tool against current package',
    'Conduct cross-module naming harmonization audit',
    'Verify all PDF bookmark structures meet FDA spec v4.0',
    'Schedule pre-submission gateway test with publishing vendor',
  ],
  reviewer_attack: [
    'Align all efficacy claims with pivotal trial endpoints',
    'Reconcile Module 2.7 safety narrative with CSR appendix tables',
    'Commission exposure-response analysis for clinical pharmacology section',
    'Review proposed labeling against enrolled population demographics',
  ],
  audit_inspection: [
    'Complete traceability matrix linking all protocol deviations to CAPA',
    'Audit electronic signatures for 21 CFR Part 11 compliance',
    'Verify all source documents are available for inspection',
    'Conduct mock GCP inspection with external auditor',
  ],
  route_timing: [
    'Evaluate breakthrough therapy designation eligibility',
    'Model rolling submission timeline vs. complete submission',
    'Schedule Type B pre-submission meeting with FDA division',
    'Assess parallel filing strategy for EMA/FDA',
  ],
  evidence_sufficiency: [
    'Validate statistical power calculations for all primary endpoints',
    'Compile real-world evidence supplement for single-arm studies',
    'Ensure all pre-specified subgroup analyses are reported',
    'Review literature search strategy for completeness of evidence base',
  ],
  collaboration_fragility: [
    'Map critical-path review assignments with backup reviewers',
    'Implement weekly cross-functional sync for submission readiness',
    'Set up automated escalation for stale review items (>48 hours)',
    'Conduct tabletop exercise for submission day workflow',
  ],
};

// =============================================================================
// HELPERS
// =============================================================================

function getSeverityBand(value: number, lowerIsBetter: boolean): 'green' | 'amber' | 'red' {
  const effective = lowerIsBetter ? 100 - value : value;
  if (effective > 75) return 'green';
  if (effective >= 50) return 'amber';
  return 'red';
}

function getBandColor(band: 'green' | 'amber' | 'red') {
  switch (band) {
    case 'green': return { text: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-300', bar: 'bg-emerald-500' };
    case 'amber': return { text: 'text-amber-600', bg: 'bg-amber-50', ring: 'ring-amber-300', bar: 'bg-amber-500' };
    case 'red': return { text: 'text-red-600', bg: 'bg-red-50', ring: 'ring-red-300', bar: 'bg-red-500' };
  }
}

function blastRadiusDots(radius: number) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Blast radius: ${radius}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn('h-1.5 w-1.5 rounded-full', i < radius ? 'bg-red-400' : 'bg-zinc-200')}
        />
      ))}
    </span>
  );
}

function mockSparkline(): number[] {
  const points: number[] = [];
  let val = 40 + Math.random() * 30;
  for (let i = 0; i < 12; i++) {
    val = Math.max(5, Math.min(95, val + (Math.random() - 0.45) * 15));
    points.push(Math.round(val));
  }
  return points;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function SparklineChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 32;
  const w = 120;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-[120px] h-[32px]">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function FindingRow({ finding, isExpanded, onToggle }: {
  finding: any;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const sev = SEVERITY_STYLES[finding.severity as Severity] || SEVERITY_STYLES.medium;

  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 transition-colors duration-150"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
        )}

        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', sev.badge)}>
          {sev.label}
        </span>

        <span className="flex-1 text-sm font-medium text-zinc-900 truncate">
          {finding.title}
        </span>

        <span className="text-xs text-zinc-500 shrink-0">
          {finding.confidence}% conf
        </span>

        {blastRadiusDots(finding.blastRadius?.artifactsImpacted > 10 ? 5 : finding.blastRadius?.artifactsImpacted > 6 ? 4 : finding.blastRadius?.artifactsImpacted > 3 ? 3 : finding.blastRadius?.artifactsImpacted > 1 ? 2 : 1)}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-zinc-200 bg-zinc-50/50 space-y-3">
          <p className="text-sm text-zinc-700 leading-relaxed">{finding.summary}</p>

          <div className="flex flex-wrap gap-4 text-xs">
            <div>
              <span className="text-zinc-500">Regulatory Basis:</span>{' '}
              <span className="text-zinc-700 font-medium">{finding.regulatoryBasis}</span>
            </div>
            <div>
              <span className="text-zinc-500">Artifacts Impacted:</span>{' '}
              <span className="text-zinc-700 font-medium">{finding.blastRadius?.artifactsImpacted || 0}</span>
            </div>
          </div>

          {finding.blastRadius?.sectionsImpacted?.length > 0 && (
            <div>
              <span className="text-xs text-zinc-500">Sections Impacted:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {finding.blastRadius.sectionsImpacted.map((s: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-xs rounded-full border border-zinc-200">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <Wrench className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-medium text-blue-700">Suggested Remediation</span>
              <p className="text-sm text-blue-800 mt-0.5">{finding.suggestedRemediation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function SnowGlobeChambers({ programId, initialChamber }: SnowGlobeChambersProps) {
  const [activeChamber, setActiveChamber] = useState<ChamberKey>(
    (initialChamber as ChamberKey) || 'agency_screen'
  );
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set());
  const [showInsights, setShowInsights] = useState(true);

  const { data: scores, isLoading: scoresLoading } = useProgramScores(programId);
  const { data: allFindings, isLoading: findingsLoading } = useTopFindings(programId);
  const { data: remediation, isLoading: remediationLoading } = useRemediationPlan(programId);

  const stressTest = useRunFullStressTest();
  const agencyScan = useRunPreAgencyScan();
  const reviewerScan = useRunReviewerAttack();
  const auditScan = useRunAuditExposure();

  const isRunning = stressTest.isPending || agencyScan.isPending || reviewerScan.isPending || auditScan.isPending;

  const chamber = CHAMBERS.find((c) => c.key === activeChamber)!;

  const sparklineData = useMemo(() => {
    const map: Record<string, number[]> = {};
    CHAMBERS.forEach((c) => { map[c.key] = mockSparkline(); });
    return map;
  }, []);

  const chamberScore = useMemo(() => {
    if (!scores || !Array.isArray(scores)) return null;
    return scores.find((s: any) => s.key === chamber.scoreKey) || null;
  }, [scores, chamber.scoreKey]);

  const chamberFindings = useMemo(() => {
    if (!allFindings || !Array.isArray(allFindings)) return [];
    return allFindings
      .filter((f: any) => f.chamber === activeChamber || f.engine === activeChamber)
      .sort((a: any, b: any) => (SEVERITY_ORDER[a.severity] || 3) - (SEVERITY_ORDER[b.severity] || 3));
  }, [allFindings, activeChamber]);

  const chamberRemediation = useMemo(() => {
    if (!remediation || !Array.isArray(remediation)) return [];
    return remediation.filter((r: any) => r.chamber === activeChamber || r.engine === activeChamber);
  }, [remediation, activeChamber]);

  const toggleFinding = useCallback((id: number) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRunScan = useCallback(() => {
    if (!programId) return;
    switch (activeChamber) {
      case 'agency_screen':
        agencyScan.mutate({ programId });
        break;
      case 'reviewer_attack':
        reviewerScan.mutate({ programId });
        break;
      case 'audit_inspection':
        auditScan.mutate({ programId });
        break;
      default:
        stressTest.mutate({ programId, engines: [activeChamber] });
        break;
    }
  }, [programId, activeChamber, agencyScan, reviewerScan, auditScan, stressTest]);

  if (!programId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FAFAF9]">
        <div className="text-center space-y-3">
          <Shield className="h-12 w-12 text-zinc-400 mx-auto" />
          <p className="text-zinc-500 text-sm">Select a program to view chamber details</p>
        </div>
      </div>
    );
  }

  const isLoading = scoresLoading || findingsLoading || remediationLoading;
  const scoreValue = chamberScore?.value ?? null;
  const scoreBand = scoreValue !== null ? getSeverityBand(scoreValue, chamber.lowerIsBetter) : 'amber';
  const bandColor = getBandColor(scoreBand);
  const trend: Trend = chamberScore?.trend || 'flat';

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    chamberFindings.forEach((f: any) => {
      if (counts[f.severity as Severity] !== undefined) counts[f.severity as Severity]++;
    });
    return counts;
  }, [chamberFindings]);

  return (
    <div className="flex-1 flex flex-col bg-[#FAFAF9] overflow-hidden">
      {/* Tab Navigation */}
      <div className="bg-white border-b border-zinc-200 px-6 pt-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-0">
          {CHAMBERS.map((c) => {
            const Icon = c.icon;
            const active = c.key === activeChamber;
            return (
              <button
                key={c.key}
                onClick={() => {
                  setActiveChamber(c.key);
                  setExpandedFindings(new Set());
                }}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border border-b-0 transition-colors whitespace-nowrap',
                  active
                    ? `${c.bg} ${c.accent} ${c.border} border-b-2`
                    : 'text-zinc-500 border-transparent hover:text-zinc-700 hover:bg-zinc-50'
                )}
              >
                <Icon className="h-4 w-4" />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

          {/* Chamber Header */}
          <div className={cn('rounded-xl border p-6', chamber.bg, chamber.border)}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className={cn('p-3 rounded-xl bg-white/80 border', chamber.border)}>
                  {React.createElement(chamber.icon, { className: cn('h-8 w-8', chamber.accent) })}
                </div>
                <div>
                  <h2 className={cn('text-xl font-semibold', chamber.accent)}>{chamber.label}</h2>
                  <p className="text-sm text-zinc-600 mt-1 max-w-2xl">{chamber.description}</p>
                </div>
              </div>

              <button
                onClick={handleRunScan}
                disabled={isRunning}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all duration-150',
                  isRunning ? 'bg-zinc-400 cursor-not-allowed' : 'bg-zinc-800 hover:bg-zinc-700 shadow-sm'
                )}
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run {chamber.label} Scan
              </button>
            </div>
          </div>

          {/* Score Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className={cn('rounded-xl border bg-white p-6 flex items-center gap-6', `ring-1 ${bandColor.ring}`)}>
              {isLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-zinc-400 mx-auto" />
              ) : scoreValue !== null ? (
                <>
                  <div className={cn('text-5xl font-semibold tabular-nums', bandColor.text)}>
                    {scoreValue}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-zinc-700">
                      {chamber.scoreKey.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {trend === 'up' && <TrendingUp className={cn('h-4 w-4', chamber.lowerIsBetter ? 'text-red-500' : 'text-emerald-500')} />}
                      {trend === 'down' && <TrendingDown className={cn('h-4 w-4', chamber.lowerIsBetter ? 'text-emerald-500' : 'text-red-500')} />}
                      {trend === 'flat' && <Minus className="h-4 w-4 text-zinc-400" />}
                      <span className="text-xs text-zinc-500">
                        {trend === 'flat' ? 'No change' : `Trending ${trend}`} vs. last run
                      </span>
                    </div>
                    <div className="mt-2">
                      <SparklineChart
                        data={sparklineData[activeChamber]}
                        color={scoreBand === 'green' ? '#10b981' : scoreBand === 'amber' ? '#f59e0b' : '#ef4444'}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center w-full py-4">
                  <p className="text-sm text-zinc-500">No score data yet</p>
                  <p className="text-xs text-zinc-400 mt-1">Run a scan to generate scores</p>
                </div>
              )}
            </div>

            {/* Severity breakdown */}
            <div className="rounded-xl border bg-white p-6">
              <div className="text-sm font-medium text-zinc-700 mb-3">Findings by Severity</div>
              <div className="space-y-2">
                {(['critical', 'high', 'medium', 'low'] as Severity[]).map((sev) => {
                  const count = severityCounts[sev];
                  const style = SEVERITY_STYLES[sev];
                  const maxCount = Math.max(...Object.values(severityCounts), 1);
                  return (
                    <div key={sev} className="flex items-center gap-3">
                      <span className={cn('w-16 text-xs font-medium', style.badge.split(' ')[1])}>
                        {style.label}
                      </span>
                      <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-150', style.dot)}
                          style={{ width: `${(count / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-zinc-600 w-6 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-zinc-200 text-xs text-zinc-500">
                {chamberFindings.length} total findings in this chamber
              </div>
            </div>

            {/* Quick stats */}
            <div className="rounded-xl border bg-white p-6 space-y-4">
              <div className="text-sm font-medium text-zinc-700 mb-1">Chamber Stats</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 bg-zinc-50 rounded-lg text-center">
                  <div className="text-lg font-semibold text-zinc-900">{chamberFindings.length}</div>
                  <div className="text-xs text-zinc-500">Findings</div>
                </div>
                <div className="p-2.5 bg-zinc-50 rounded-lg text-center">
                  <div className="text-lg font-semibold text-zinc-900">{chamberRemediation.length}</div>
                  <div className="text-xs text-zinc-500">Actions</div>
                </div>
                <div className="p-2.5 bg-zinc-50 rounded-lg text-center">
                  <div className="text-lg font-semibold text-zinc-900">{severityCounts.critical + severityCounts.high}</div>
                  <div className="text-xs text-zinc-500">Critical/High</div>
                </div>
                <div className="p-2.5 bg-zinc-50 rounded-lg text-center">
                  <div className="text-lg font-semibold text-zinc-900">
                    {chamberFindings.length > 0
                      ? Math.round(chamberFindings.reduce((s: number, f: any) => s + (f.confidence || 0), 0) / chamberFindings.length)
                      : '\u2014'}
                  </div>
                  <div className="text-xs text-zinc-500">Avg Confidence</div>
                </div>
              </div>
            </div>
          </div>

          {/* Findings Table */}
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-zinc-600" />
                <h3 className="font-semibold text-zinc-900">Findings</h3>
                <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">
                  {chamberFindings.length}
                </span>
              </div>
            </div>

            <div className="p-4 space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                </div>
              ) : chamberFindings.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="h-10 w-10 text-emerald-300 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">No findings in this chamber</p>
                  <p className="text-xs text-zinc-400 mt-1">Run a scan to check for issues</p>
                </div>
              ) : (
                chamberFindings.map((f: any, idx: number) => (
                  <FindingRow
                    key={f.id || idx}
                    finding={f}
                    isExpanded={expandedFindings.has(f.id || idx)}
                    onToggle={() => toggleFinding(f.id || idx)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Remediation Actions */}
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center gap-2">
              <Target className="h-5 w-5 text-zinc-600" />
              <h3 className="font-semibold text-zinc-900">Remediation Actions</h3>
              <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">
                {chamberRemediation.length}
              </span>
            </div>

            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                </div>
              ) : chamberRemediation.length === 0 ? (
                <div className="text-center py-8">
                  <Sparkles className="h-10 w-10 text-zinc-200 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">No remediation actions yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {chamberRemediation.map((r: any, idx: number) => {
                    const effort = EFFORT_STYLES[(r.effort as EffortLevel) || 'medium'];
                    const impactStyle = SEVERITY_STYLES[(r.impact as Severity) || 'medium'];
                    return (
                      <div key={r.id || idx} className="flex items-start gap-4 p-4 border border-zinc-200 rounded-lg hover:border-zinc-300 transition-colors duration-150">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-zinc-100 text-zinc-600 text-sm font-semibold shrink-0">
                          {r.priority || idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-zinc-900">{r.title}</div>
                          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{r.why || r.description}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', effort.badge)}>
                              {effort.label}
                            </span>
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', impactStyle.badge)}>
                              {impactStyle.label} Impact
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Regulatory Intelligence */}
          <div className="rounded-xl border bg-white overflow-hidden">
            <button
              onClick={() => setShowInsights(!showInsights)}
              className="w-full px-6 py-4 border-b border-zinc-200 flex items-center justify-between hover:bg-zinc-50 transition-colors duration-150"
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                <h3 className="font-semibold text-zinc-900">Regulatory Intelligence</h3>
              </div>
              {showInsights ? (
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              )}
            </button>

            {showInsights && (
              <div className="p-6 space-y-6">
                {/* Historical Precedents */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <History className="h-4 w-4 text-zinc-500" />
                    <span className="text-sm font-medium text-zinc-700">Historical Precedents</span>
                  </div>
                  <div className="space-y-2">
                    {HISTORICAL_PRECEDENTS[activeChamber].map((p, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                        <BookOpen className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-zinc-700">{p.title}</div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            <span className="font-medium">Outcome:</span> {p.outcome}
                          </div>
                        </div>
                        <span className="text-xs text-zinc-400 shrink-0">{p.year}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended Pre-Submission Actions */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-4 w-4 text-zinc-500" />
                    <span className="text-sm font-medium text-zinc-700">Recommended Pre-Submission Actions</span>
                  </div>
                  <div className="space-y-1.5">
                    {RECOMMENDED_ACTIONS[activeChamber].map((action, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-2.5 hover:bg-zinc-50 rounded-lg transition-colors duration-150">
                        <div className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-100 text-blue-600 text-xs font-semibold shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <span className="text-sm text-zinc-700">{action}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Similar Program Outcomes */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">Similar Program Analysis</span>
                  </div>
                  <p className="text-xs text-blue-600 leading-relaxed">
                    Based on analysis of 18 similar submissions in this therapeutic area, programs with
                    comparable {chamber.label.toLowerCase()} profiles achieved a 68% first-cycle approval
                    rate. Programs that addressed all critical findings before submission improved outcomes
                    by an average of 22 percentage points.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
