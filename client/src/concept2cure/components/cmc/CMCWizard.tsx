/**
 * @fileoverview CMC Wizard - The Gear Master
 * @module concept2cure/components/cmc/CMCWizard
 * @version 1.0.0
 *
 * @description
 * THE SHERPA METAPHOR:
 * "The Technical Specialist who ensures your equipment (the drug) won't fail at altitude."
 *
 * THE CHALLENGE:
 * A single impurity or unstable batch can destroy the entire mission.
 * The FDA (the mountain) is unforgiving of bad equipment.
 *
 * HOW LUMEN ACTS AS SHERPA:
 * - Equipment Check: As you enter manufacturing data, the "ICH Guardrails" act like a checklist.
 *   "Warning: Impurity A is at 0.20%. That is too high for this altitude (Qualification Threshold)."
 * - Repair Kit: When a flaw is found, the AI generates the "Justification Narrative,"
 *   helping you explain to the FDA why the equipment is safe despite the warning.
 *
 * THE BENEFIT: You don't get sent back to Base Camp (Refusal to File) because of a bad batch.
 *
 * CMC = Chemistry, Manufacturing, and Controls (Module 3 of eCTD)
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Beaker,
  AlertTriangle,
  CheckCircle,
  Shield,
  Sparkles,
  FileText,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Settings,
  Eye,
  Download,
  RefreshCw,
  ThermometerSun,
  Clock,
  Percent,
  BarChart3,
  Activity,
  AlertOctagon,
  Info,
  Edit3,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ICHGuideline =
  | 'Q1A' // Stability
  | 'Q1B' // Photostability
  | 'Q2' // Analytical Validation
  | 'Q3A' // Impurities (Drug Substances)
  | 'Q3B' // Impurities (Drug Products)
  | 'Q3C' // Residual Solvents
  | 'Q3D' // Elemental Impurities
  | 'Q6A' // Specifications: Chemical
  | 'Q6B'; // Specifications: Biotech

export type GuardrailStatus = 'pass' | 'warning' | 'fail' | 'info' | 'pending';

export interface ICHGuardrail {
  id: string;
  guideline: ICHGuideline;
  parameter: string;
  currentValue: number;
  unit: string;
  thresholdType: 'max' | 'min' | 'range';
  thresholdValue: number;
  thresholdMax?: number;
  status: GuardrailStatus;
  message: string;
  ichReference: string;
  requiresJustification: boolean;
  justificationDrafted: boolean;
}

export interface Impurity {
  id: string;
  name: string;
  type: 'specified' | 'unspecified' | 'total';
  currentLevel: number;
  unit: string;
  reportingThreshold: number;
  identificationThreshold: number;
  qualificationThreshold: number;
  status: GuardrailStatus;
  isIdentified: boolean;
  isQualified: boolean;
  toxStudyRef?: string;
}

export interface StabilityCondition {
  id: string;
  condition: string; // e.g., "25°C/60% RH"
  duration: string; // e.g., "24 months"
  timePoint: string; // e.g., "12M"
  parameters: StabilityParameter[];
}

export interface StabilityParameter {
  id: string;
  name: string;
  specification: string;
  result: string;
  status: GuardrailStatus;
  trend?: 'stable' | 'increasing' | 'decreasing';
}

export interface DrugSubstance {
  id: string;
  name: string;
  inn?: string; // International Nonproprietary Name
  casNumber?: string;
  molecularFormula: string;
  molecularWeight: number;
  specifications: Specification[];
  impurities: Impurity[];
  stability: StabilityCondition[];
  guardrails: ICHGuardrail[];
}

export interface Specification {
  id: string;
  parameter: string;
  method: string;
  acceptance: string;
  result: string;
  status: GuardrailStatus;
}

interface CMCWizardProps {
  substance: DrugSubstance;
  onGenerateJustification?: (guardrail: ICHGuardrail) => void;
  onReviewImpurity?: (impurity: Impurity) => void;
  onExportData?: () => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const GUIDELINE_CONFIG: Record<
  ICHGuideline,
  {
    name: string;
    fullName: string;
    color: string;
  }
> = {
  Q1A: { name: 'Q1A(R2)', fullName: 'Stability Testing', color: 'text-blue-600' },
  Q1B: { name: 'Q1B', fullName: 'Photostability Testing', color: 'text-cyan-600' },
  Q2: { name: 'Q2(R1)', fullName: 'Analytical Validation', color: 'text-purple-600' },
  Q3A: { name: 'Q3A(R2)', fullName: 'Impurities in Drug Substances', color: 'text-orange-600' },
  Q3B: { name: 'Q3B(R2)', fullName: 'Impurities in Drug Products', color: 'text-amber-600' },
  Q3C: { name: 'Q3C(R8)', fullName: 'Residual Solvents', color: 'text-red-600' },
  Q3D: { name: 'Q3D(R1)', fullName: 'Elemental Impurities', color: 'text-rose-600' },
  Q6A: { name: 'Q6A', fullName: 'Specifications: Test Procedures', color: 'text-green-600' },
  Q6B: { name: 'Q6B', fullName: 'Specifications: Biotech Products', color: 'text-emerald-600' },
};

const STATUS_CONFIG: Record<
  GuardrailStatus,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ReactNode;
  }
> = {
  pass: {
    label: 'Pass',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  warning: {
    label: 'Warning',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  fail: {
    label: 'Fail',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    icon: <AlertOctagon className="w-4 h-4" />,
  },
  info: {
    label: 'Info',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    icon: <Info className="w-4 h-4" />,
  },
  pending: {
    label: 'Pending',
    color: 'text-zinc-500',
    bgColor: 'bg-zinc-100',
    icon: <Clock className="w-4 h-4" />,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const GuardrailCard: React.FC<{
  guardrail: ICHGuardrail;
  onGenerateJustification?: () => void;
}> = ({ guardrail, onGenerateJustification }) => {
  const statusConfig = STATUS_CONFIG[guardrail.status];
  const guidelineConfig = GUIDELINE_CONFIG[guardrail.guideline];

  const percentOfThreshold =
    guardrail.thresholdType === 'max'
      ? (guardrail.currentValue / guardrail.thresholdValue) * 100
      : guardrail.thresholdType === 'min'
        ? (guardrail.thresholdValue / guardrail.currentValue) * 100
        : 50;

  return (
    <div
      className={cn(
        'p-4 rounded-lg border-l-4 bg-white shadow-sm',
        guardrail.status === 'pass' && 'border-l-green-500',
        guardrail.status === 'warning' && 'border-l-amber-500',
        guardrail.status === 'fail' && 'border-l-red-500',
        guardrail.status === 'info' && 'border-l-blue-500'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className={cn('text-xs font-semibold', guidelineConfig.color)}>
            ICH {guidelineConfig.name}
          </span>
          <h4 className="font-medium text-zinc-900">{guardrail.parameter}</h4>
        </div>
        <span
          className={cn(
            'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded',
            statusConfig.bgColor,
            statusConfig.color
          )}
        >
          {statusConfig.icon}
          {statusConfig.label}
        </span>
      </div>

      {/* Value Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-zinc-500">Current Value</span>
          <span className={cn('font-mono font-semibold', statusConfig.color)}>
            {guardrail.currentValue} {guardrail.unit}
          </span>
        </div>
        <div className="relative h-3 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'absolute h-full rounded-full transition-all',
              guardrail.status === 'pass' && 'bg-green-500',
              guardrail.status === 'warning' && 'bg-amber-500',
              guardrail.status === 'fail' && 'bg-red-500'
            )}
            style={{ width: `${Math.min(percentOfThreshold, 100)}%` }}
          />
          {/* Threshold Line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-zinc-800"
            style={{ left: '100%', transform: 'translateX(-2px)' }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-zinc-400">0</span>
          <span className="text-zinc-600 font-medium">
            Threshold: {guardrail.thresholdValue} {guardrail.unit}
          </span>
        </div>
      </div>

      {/* Message */}
      <p className="text-xs text-zinc-600 mb-3">{guardrail.message}</p>

      {/* Actions */}
      {guardrail.requiresJustification && (
        <div className="flex items-center justify-between pt-2 border-t border-zinc-200">
          <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Justification Required
          </span>
          {guardrail.justificationDrafted ? (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Drafted
            </span>
          ) : (
            <button
              onClick={onGenerateJustification}
              className="px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              Generate Justification
            </button>
          )}
        </div>
      )}

      {/* ICH Reference */}
      <div className="text-xs text-zinc-400 mt-2">Ref: {guardrail.ichReference}</div>
    </div>
  );
};

const ImpurityTable: React.FC<{
  impurities: Impurity[];
  onReview?: (impurity: Impurity) => void;
}> = ({ impurities, onReview }) => (
  <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
    <div className="p-3 bg-zinc-50 border-b border-zinc-200">
      <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
        <Beaker className="w-4 h-4 text-orange-600" />
        Impurity Profile (ICH Q3A/Q3B)
      </h3>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-zinc-50 border-b border-zinc-200">
            <th className="px-3 py-2 text-left font-medium text-zinc-600">Impurity</th>
            <th className="px-3 py-2 text-right font-medium text-zinc-600">Level</th>
            <th className="px-3 py-2 text-right font-medium text-zinc-600">Report</th>
            <th className="px-3 py-2 text-right font-medium text-zinc-600">ID</th>
            <th className="px-3 py-2 text-right font-medium text-zinc-600">Qualify</th>
            <th className="px-3 py-2 text-center font-medium text-zinc-600">Status</th>
            <th className="px-3 py-2 text-center font-medium text-zinc-600">Actions</th>
          </tr>
        </thead>
        <tbody>
          {impurities.map(imp => {
            const statusConfig = STATUS_CONFIG[imp.status];
            return (
              <tr key={imp.id} className="border-b border-zinc-200 hover:bg-zinc-50">
                <td className="px-3 py-2">
                  <div>
                    <span className="font-medium text-zinc-900">{imp.name}</span>
                    <span
                      className={cn(
                        'ml-2 px-1.5 py-0.5 text-xs rounded',
                        imp.type === 'specified' && 'bg-blue-100 text-blue-700',
                        imp.type === 'unspecified' && 'bg-zinc-100 text-zinc-600',
                        imp.type === 'total' && 'bg-purple-100 text-purple-700'
                      )}
                    >
                      {imp.type}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-zinc-900">
                  {imp.currentLevel}%
                </td>
                <td className="px-3 py-2 text-right font-mono text-zinc-500">
                  {imp.reportingThreshold}%
                </td>
                <td className="px-3 py-2 text-right font-mono text-zinc-500">
                  {imp.identificationThreshold}%
                </td>
                <td className="px-3 py-2 text-right font-mono text-zinc-500">
                  {imp.qualificationThreshold}%
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-center">
                    <span
                      className={cn(
                        'flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded',
                        statusConfig.bgColor,
                        statusConfig.color
                      )}
                    >
                      {statusConfig.icon}
                      {statusConfig.label}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-center gap-1">
                    {!imp.isIdentified && imp.currentLevel >= imp.identificationThreshold && (
                      <button
                        onClick={() => onReview?.(imp)}
                        className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                      >
                        Identify
                      </button>
                    )}
                    {!imp.isQualified && imp.currentLevel >= imp.qualificationThreshold && (
                      <button
                        onClick={() => onReview?.(imp)}
                        className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        Qualify
                      </button>
                    )}
                    {imp.isIdentified && imp.isQualified && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

const StabilityChart: React.FC<{
  conditions: StabilityCondition[];
}> = ({ conditions }) => (
  <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
    <div className="p-3 bg-zinc-50 border-b border-zinc-200">
      <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
        <ThermometerSun className="w-4 h-4 text-blue-600" />
        Stability Summary (ICH Q1A)
      </h3>
    </div>
    <div className="p-4 space-y-4">
      {conditions.map(cond => (
        <div key={cond.id} className="border-b border-zinc-200 pb-4 last:border-0 last:pb-0">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-zinc-700">{cond.condition}</span>
            <span className="text-xs text-zinc-500">
              {cond.timePoint} / {cond.duration}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {cond.parameters.map(param => {
              const statusConfig = STATUS_CONFIG[param.status];
              return (
                <div
                  key={param.id}
                  className="flex items-center justify-between p-2 bg-zinc-50 rounded"
                >
                  <div>
                    <span className="text-xs text-zinc-600">{param.name}</span>
                    {param.trend && (
                      <span className="ml-1">
                        {param.trend === 'stable' && (
                          <Activity className="w-3 h-3 text-green-500 inline" />
                        )}
                        {param.trend === 'increasing' && (
                          <TrendingUp className="w-3 h-3 text-amber-500 inline" />
                        )}
                        {param.trend === 'decreasing' && (
                          <TrendingDown className="w-3 h-3 text-red-500 inline" />
                        )}
                      </span>
                    )}
                  </div>
                  <span className={cn('text-xs font-mono font-medium', statusConfig.color)}>
                    {param.result}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const CMCWizard: React.FC<CMCWizardProps> = ({
  substance,
  onGenerateJustification,
  onReviewImpurity,
  onExportData,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<'guardrails' | 'impurities' | 'stability' | 'specs'>(
    'guardrails'
  );

  // Metrics
  const metrics = useMemo(() => {
    const passCount = substance.guardrails.filter(g => g.status === 'pass').length;
    const warningCount = substance.guardrails.filter(g => g.status === 'warning').length;
    const failCount = substance.guardrails.filter(g => g.status === 'fail').length;
    const needsJustification = substance.guardrails.filter(
      g => g.requiresJustification && !g.justificationDrafted
    ).length;
    const impurityIssues = substance.impurities.filter(
      i => i.status === 'warning' || i.status === 'fail'
    ).length;

    return { passCount, warningCount, failCount, needsJustification, impurityIssues };
  }, [substance]);

  const tabs = [
    { id: 'guardrails', label: 'ICH Guardrails', count: metrics.warningCount + metrics.failCount },
    { id: 'impurities', label: 'Impurities', count: metrics.impurityIssues },
    { id: 'stability', label: 'Stability', count: 0 },
    { id: 'specs', label: 'Specifications', count: 0 },
  ];

  return (
    <div className={cn('flex flex-col h-full bg-zinc-50', className)}>
      {/* Header */}
      <div className="flex-shrink-0 bg-emerald-600 text-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur">
              <Settings className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">CMC Wizard</h1>
              <p className="text-green-100 text-sm">ICH Quality Guardrails • The Gear Master</p>
            </div>
          </div>

          <button
            onClick={onExportData}
            className="px-4 py-2 text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export Module 3
          </button>
        </div>

        {/* Substance Info */}
        <div className="p-4 bg-white/10 rounded-xl backdrop-blur mb-4">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-xs text-green-200">DRUG SUBSTANCE</span>
              <h2 className="text-lg font-semibold">{substance.name}</h2>
              {substance.inn && <p className="text-sm text-green-100">INN: {substance.inn}</p>}
            </div>
            <div className="text-sm">
              <span className="text-green-200">Formula:</span>
              <span className="ml-2 font-mono">{substance.molecularFormula}</span>
            </div>
            <div className="text-sm">
              <span className="text-green-200">MW:</span>
              <span className="ml-2 font-mono">{substance.molecularWeight} g/mol</span>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-5 gap-3">
          <div className="p-3 bg-white/10 rounded-lg">
            <p className="text-xs text-green-200">Guardrails Pass</p>
            <p className="text-2xl font-semibold text-green-300">{metrics.passCount}</p>
          </div>
          <div
            className={cn(
              'p-3 rounded-lg',
              metrics.warningCount > 0 ? 'bg-amber-500/30' : 'bg-white/10'
            )}
          >
            <p className="text-xs text-amber-200">Warnings</p>
            <p className="text-2xl font-semibold text-amber-300">{metrics.warningCount}</p>
          </div>
          <div
            className={cn(
              'p-3 rounded-lg',
              metrics.failCount > 0 ? 'bg-red-500/30' : 'bg-white/10'
            )}
          >
            <p className="text-xs text-red-200">Failures</p>
            <p className="text-2xl font-semibold text-red-300">{metrics.failCount}</p>
          </div>
          <div
            className={cn(
              'p-3 rounded-lg',
              metrics.needsJustification > 0 ? 'bg-purple-500/30' : 'bg-white/10'
            )}
          >
            <p className="text-xs text-purple-200">Need Justification</p>
            <p className="text-2xl font-semibold text-purple-300">{metrics.needsJustification}</p>
          </div>
          <div
            className={cn(
              'p-3 rounded-lg',
              metrics.impurityIssues > 0 ? 'bg-orange-500/30' : 'bg-white/10'
            )}
          >
            <p className="text-xs text-orange-200">Impurity Issues</p>
            <p className="text-2xl font-semibold text-orange-300">{metrics.impurityIssues}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 bg-white border-b border-zinc-200">
        <div className="flex gap-1 p-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2',
                activeTab === tab.id
                  ? 'bg-green-100 text-green-700'
                  : 'text-zinc-600 hover:bg-zinc-100'
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 rounded">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'guardrails' && (
          <div className="grid grid-cols-2 gap-4">
            {substance.guardrails.map(guardrail => (
              <GuardrailCard
                key={guardrail.id}
                guardrail={guardrail}
                onGenerateJustification={() => onGenerateJustification?.(guardrail)}
              />
            ))}
          </div>
        )}

        {activeTab === 'impurities' && (
          <ImpurityTable impurities={substance.impurities} onReview={onReviewImpurity} />
        )}

        {activeTab === 'stability' && <StabilityChart conditions={substance.stability} />}

        {activeTab === 'specs' && (
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
            <div className="p-3 bg-zinc-50 border-b border-zinc-200">
              <h3 className="text-sm font-semibold text-zinc-900">Specifications (ICH Q6A/Q6B)</h3>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Parameter</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Method</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Acceptance</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Result</th>
                  <th className="px-3 py-2 text-center font-medium text-zinc-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {substance.specifications.map(spec => {
                  const statusConfig = STATUS_CONFIG[spec.status];
                  return (
                    <tr key={spec.id} className="border-b border-zinc-200">
                      <td className="px-3 py-2 font-medium text-zinc-900">{spec.parameter}</td>
                      <td className="px-3 py-2 text-zinc-600">{spec.method}</td>
                      <td className="px-3 py-2 font-mono text-zinc-600">{spec.acceptance}</td>
                      <td className="px-3 py-2 font-mono font-medium text-zinc-900">
                        {spec.result}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-center">
                          <span
                            className={cn(
                              'flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded',
                              statusConfig.bgColor,
                              statusConfig.color
                            )}
                          >
                            {statusConfig.icon}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CMCWizard;

// ─── Standalone (self-contained demo entry point for ZenApp) ──────────────────

const DEMO_CMC_SUBSTANCE: DrugSubstance = {
  id: 'lemizumab-001',
  name: 'Lemizumab',
  inn: 'lemizumab',
  casNumber: '2025001-78-9',
  molecularFormula: 'C6482H9964N1716O2020S44',
  molecularWeight: 146300,
  specifications: [
    {
      id: 's1',
      parameter: 'Appearance',
      method: 'Visual',
      acceptance: 'Clear, colorless',
      result: 'Clear, colorless',
      status: 'pass',
    },
    {
      id: 's2',
      parameter: 'pH',
      method: 'USP <791>',
      acceptance: '5.8–6.2',
      result: '6.0',
      status: 'pass',
    },
    {
      id: 's3',
      parameter: 'Protein Concentration',
      method: 'A280',
      acceptance: '20 ± 2 mg/mL',
      result: '19.8 mg/mL',
      status: 'pass',
    },
    {
      id: 's4',
      parameter: 'Purity (SE-HPLC)',
      method: 'SE-HPLC',
      acceptance: '≥95%',
      result: '96.2%',
      status: 'pass',
    },
  ],
  impurities: [
    {
      id: 'i1',
      name: 'High Molecular Weight Species',
      type: 'specified',
      currentLevel: 1.8,
      unit: '%',
      reportingThreshold: 0.1,
      identificationThreshold: 0.2,
      qualificationThreshold: 0.5,
      status: 'fail',
      isIdentified: true,
      isQualified: false,
    },
    {
      id: 'i2',
      name: 'Acidic Variants',
      type: 'specified',
      currentLevel: 12,
      unit: '%',
      reportingThreshold: 0.1,
      identificationThreshold: 0.2,
      qualificationThreshold: 5,
      status: 'warning',
      isIdentified: true,
      isQualified: false,
    },
    {
      id: 'i3',
      name: 'Residual HCP',
      type: 'specified',
      currentLevel: 18,
      unit: 'ng/mg',
      reportingThreshold: 0.1,
      identificationThreshold: 0.2,
      qualificationThreshold: 100,
      status: 'pass',
      isIdentified: true,
      isQualified: true,
    },
  ],
  stability: [
    {
      id: 'st1',
      condition: '25°C / 60% RH',
      duration: '24 months',
      timePoint: '12M',
      parameters: [
        {
          id: 'sp1',
          name: 'Purity (SE-HPLC)',
          specification: '≥95%',
          result: '95.8%',
          status: 'pass',
          trend: 'decreasing',
        },
        {
          id: 'sp2',
          name: 'Potency',
          specification: '80–120%',
          result: '102%',
          status: 'pass',
          trend: 'stable',
        },
      ],
    },
    {
      id: 'st2',
      condition: '40°C / 75% RH',
      duration: '6 months (accelerated)',
      timePoint: '3M',
      parameters: [
        {
          id: 'sp3',
          name: 'Purity (SE-HPLC)',
          specification: '≥95%',
          result: '93.1%',
          status: 'warning',
          trend: 'decreasing',
        },
        {
          id: 'sp4',
          name: 'Aggregates',
          specification: '<2%',
          result: '2.8%',
          status: 'fail',
          trend: 'increasing',
        },
      ],
    },
  ],
  guardrails: [
    {
      id: 'g1',
      guideline: 'Q3A',
      parameter: 'HMWS',
      currentValue: 1.8,
      unit: '%',
      thresholdType: 'max',
      thresholdValue: 0.5,
      status: 'fail',
      message: 'HMWS exceeds qualification threshold. ICH Q3A justification narrative required.',
      ichReference: 'ICH Q3A(R2) §3.2',
      requiresJustification: true,
      justificationDrafted: false,
    },
    {
      id: 'g2',
      guideline: 'Q1A',
      parameter: 'Purity (40°C/6M)',
      currentValue: 93.1,
      unit: '%',
      thresholdType: 'min',
      thresholdValue: 95,
      status: 'warning',
      message: 'Purity at accelerated conditions approaching specification limit. Monitor closely.',
      ichReference: 'ICH Q1A(R2)',
      requiresJustification: false,
      justificationDrafted: false,
    },
    {
      id: 'g3',
      guideline: 'Q6B',
      parameter: 'Potency',
      currentValue: 102,
      unit: '%',
      thresholdType: 'range',
      thresholdValue: 80,
      thresholdMax: 120,
      status: 'pass',
      message: 'Potency within specification.',
      ichReference: 'ICH Q6B §3.3',
      requiresJustification: false,
      justificationDrafted: false,
    },
  ],
};

export const CMCWizardStandalone: React.FC = () => <CMCWizard substance={DEMO_CMC_SUBSTANCE} />;
