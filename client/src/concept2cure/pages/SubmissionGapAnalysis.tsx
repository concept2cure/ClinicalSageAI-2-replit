/**
 * @fileoverview Submission Gap Analysis Engine
 * @module concept2cure/pages/SubmissionGapAnalysis
 *
 * @description
 * Users select their submission type and uploaded documents, then run a gap
 * analysis to see which eCTD sections are complete, partial, or missing.
 * Provides readiness score, priority-sorted gap table, AI recommendations,
 * and timeline projection.
 *
 * Design: Claude-style — warm white, clean zinc typography, generous whitespace.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  Clock,
  ArrowRight,
  Sparkles,
  BarChart3,
  Target,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type SubmissionType = '510K' | 'IND' | 'NDA' | 'BLA' | 'MAA' | 'PMA';
type GapStatus = 'complete' | 'partial' | 'missing';
type Priority = 'critical' | 'high' | 'medium' | 'low';

interface GapEntry {
  ectdModule: string;
  sectionName: string;
  status: GapStatus;
  priority: Priority;
  estimatedEffortDays: number;
  description: string;
}

interface GapAnalysisResult {
  readinessScore: number;
  totalRequired: number;
  completed: number;
  partial: number;
  missing: number;
  gaps: GapEntry[];
  recommendations: string[];
  estimatedWeeksToCompletion: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMISSION DOCUMENT MAP
// ═══════════════════════════════════════════════════════════════════════════════

const DOCUMENTS_BY_TYPE: Record<SubmissionType, string[]> = {
  '510K': [
    'Cover Letter',
    'Indications for Use Statement',
    'Substantial Equivalence Comparison',
    'Device Description',
    'Performance Testing — Bench',
    'Performance Testing — Clinical',
    'Biocompatibility',
    'Sterilization Validation',
    'Software Documentation (IEC 62304)',
    'Electromagnetic Compatibility',
    'Electrical Safety Testing',
    'Labeling',
    'Predicate Device Comparison Table',
    'Risk Analysis (ISO 14971)',
    'Standards Compliance Matrix',
  ],
  IND: [
    'Form FDA 1571',
    'Form FDA 1572',
    'Cover Letter',
    'Investigators Brochure',
    'Clinical Protocol',
    'Informed Consent Form',
    'Chemistry, Manufacturing, and Controls (CMC)',
    'Pharmacology / Toxicology — Nonclinical Studies',
    'Previous Human Experience',
    'Environmental Assessment',
    'Sponsor Commitment',
    'Institutional Review Board (IRB) Documentation',
    'Drug Substance Specifications',
    'Drug Product Specifications',
    'Stability Data',
  ],
  NDA: [
    'Module 1 — Administrative / Regional',
    'Module 2.2 — Introduction',
    'Module 2.3 — Quality Overall Summary',
    'Module 2.4 — Nonclinical Overview',
    'Module 2.5 — Clinical Overview',
    'Module 2.6 — Nonclinical Summaries',
    'Module 2.7 — Clinical Summary',
    'Module 3 — Quality / CMC',
    'Module 4 — Nonclinical Study Reports',
    'Module 5 — Clinical Study Reports',
    'Bioequivalence Studies',
    'Labeling',
    'Risk Evaluation and Mitigation Strategy (REMS)',
    'Patent Information (Form 3542a)',
    'Financial Disclosure',
  ],
  BLA: [
    'Module 1 — Administrative / Regional',
    'Module 2.2 — Introduction',
    'Module 2.3 — Quality Overall Summary',
    'Module 2.4 — Nonclinical Overview',
    'Module 2.5 — Clinical Overview',
    'Module 2.6 — Nonclinical Summaries',
    'Module 2.7 — Clinical Summary',
    'Module 3 — Quality / CMC (Biologics)',
    'Module 4 — Nonclinical Study Reports',
    'Module 5 — Clinical Study Reports',
    'Manufacturing Process Validation',
    'Adventitious Agents Safety',
    'Lot Release Data',
    'Labeling',
    'Environmental Assessment',
  ],
  MAA: [
    'Module 1 — EU Administrative',
    'Module 2.2 — Introduction',
    'Module 2.3 — Quality Overall Summary',
    'Module 2.4 — Nonclinical Overview',
    'Module 2.5 — Clinical Overview',
    'Module 2.6 — Nonclinical Summaries',
    'Module 2.7 — Clinical Summary',
    'Module 3 — Quality / CMC',
    'Module 4 — Nonclinical Study Reports',
    'Module 5 — Clinical Study Reports',
    'Risk Management Plan (EU RMP)',
    'Paediatric Investigation Plan (PIP)',
    'Pharmacovigilance System Master File',
    'Environmental Risk Assessment',
    'Labeling (SmPC, PIL, Label)',
  ],
  PMA: [
    'Cover Letter',
    'Table of Contents',
    'Summary of Safety and Effectiveness Data (SSED)',
    'Device Description',
    'Nonclinical Laboratory Studies',
    'Clinical Investigations',
    'Manufacturing Information',
    'Sterilization Validation',
    'Software Validation (IEC 62304)',
    'Biocompatibility',
    'Shelf Life / Packaging Validation',
    'Labeling',
    'Risk Analysis (ISO 14971)',
    'Bibliography',
    'Financial Disclosure',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PRIORITY SORT ORDER
// ═══════════════════════════════════════════════════════════════════════════════

const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: Circular Progress
// ═══════════════════════════════════════════════════════════════════════════════

function CircularProgress({ value, size = 160 }: { value: number; size?: number }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  const color =
    value >= 80 ? '#059669' : value >= 50 ? '#d97706' : '#dc2626';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e4e4e7"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-zinc-900">{value}%</span>
        <span className="text-xs text-zinc-500 mt-0.5">Readiness</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: Status Pill
// ═══════════════════════════════════════════════════════════════════════════════

function StatusPill({ status }: { status: GapStatus }) {
  const config: Record<GapStatus, { label: string; bg: string; text: string; Icon: typeof CheckCircle2 }> = {
    complete: { label: 'Complete', bg: 'bg-emerald-50', text: 'text-emerald-700', Icon: CheckCircle2 },
    partial: { label: 'Partial', bg: 'bg-amber-50', text: 'text-amber-700', Icon: AlertCircle },
    missing: { label: 'Missing', bg: 'bg-red-50', text: 'text-red-700', Icon: XCircle },
  };
  const { label, bg, text, Icon } = config[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${bg} ${text}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: Priority Badge
// ═══════════════════════════════════════════════════════════════════════════════

function PriorityBadge({ priority }: { priority: Priority }) {
  const config: Record<Priority, { bg: string; text: string }> = {
    critical: { bg: 'bg-red-100', text: 'text-red-800' },
    high: { bg: 'bg-orange-100', text: 'text-orange-800' },
    medium: { bg: 'bg-amber-100', text: 'text-amber-800' },
    low: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
  };
  const { bg, text } = config[priority];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${bg} ${text}`}>
      {priority}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: Skeleton Loader
// ═══════════════════════════════════════════════════════════════════════════════

function SkeletonLoader() {
  return (
    <div className="animate-pulse space-y-8 mt-10">
      {/* Score + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-1 flex justify-center">
          <div className="w-40 h-40 rounded-full bg-zinc-100" />
        </div>
        <div className="lg:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-zinc-100 rounded-xl" />
          ))}
        </div>
      </div>
      {/* Table */}
      <div className="space-y-3">
        <div className="h-10 bg-zinc-100 rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 bg-zinc-50 rounded-lg" />
        ))}
      </div>
      {/* Recommendations */}
      <div className="h-40 bg-violet-50/50 rounded-xl" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function SubmissionGapAnalysis({ projectId, submissionType: initialSubmissionType }: { projectId?: string; submissionType?: string }) {
  // ─── State ────────────────────────────────────────────────────────────────
  const [submissionType, setSubmissionType] = useState<SubmissionType | ''>(initialSubmissionType as SubmissionType || '');
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<GapAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultsVisible, setResultsVisible] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Reset documents when submission type changes
  useEffect(() => {
    setSelectedDocs(new Set());
    setResult(null);
    setResultsVisible(false);
    setError(null);
  }, [submissionType]);

  // Fade in results
  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => setResultsVisible(true), 50);
      return () => clearTimeout(timer);
    }
    setResultsVisible(false);
  }, [result]);

  const availableDocs = submissionType ? DOCUMENTS_BY_TYPE[submissionType] : [];

  const toggleDoc = useCallback((doc: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(doc)) {
        next.delete(doc);
      } else {
        next.add(doc);
      }
      return next;
    });
  }, []);

  const selectAllDocs = useCallback(() => {
    setSelectedDocs(new Set(availableDocs));
  }, [availableDocs]);

  const clearAllDocs = useCallback(() => {
    setSelectedDocs(new Set());
  }, []);

  // ─── Run Analysis ─────────────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    if (!submissionType) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/ana/gap-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionType,
          uploadedDocuments: Array.from(selectedDocs),
        }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed (${response.status})`);
      }

      const data: GapAnalysisResult = await response.json();
      // Sort gaps by priority (avoid mutating response directly)
      const sortedGaps = [...data.gaps].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
      setResult({ ...data, gaps: sortedGaps });

      // Scroll to results after a short delay
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [submissionType, selectedDocs]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAF9' }}>
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <Target className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
              Submission Gap Analysis
            </h1>
          </div>
          <p className="text-zinc-500 text-sm ml-12">
            Evaluate your eCTD submission readiness. Select your submission type, mark uploaded documents, and identify gaps.
          </p>
        </header>

        {/* ═══ Step 1: Configuration ═══ */}
        <section className="bg-white border border-zinc-200 rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-sm font-medium text-zinc-900 mb-5 flex items-center gap-2">
            <FileText className="w-4 h-4 text-zinc-400" />
            Configuration
          </h2>

          {/* Submission Type Selector */}
          <div className="mb-6">
            <label htmlFor="submission-type" className="block text-xs font-medium text-zinc-500 mb-1.5">
              Submission Type
            </label>
            <select
              id="submission-type"
              value={submissionType}
              onChange={(e) => setSubmissionType(e.target.value as SubmissionType | '')}
              className="w-full max-w-xs px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
            >
              <option value="">Select submission type...</option>
              <option value="510K">510(k)</option>
              <option value="IND">IND — Investigational New Drug</option>
              <option value="NDA">NDA — New Drug Application</option>
              <option value="BLA">BLA — Biologics License Application</option>
              <option value="MAA">MAA — Marketing Authorization Application</option>
              <option value="PMA">PMA — Premarket Approval</option>
            </select>
          </div>

          {/* Document Checklist */}
          {submissionType && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-zinc-500">
                  Documents Already Uploaded
                  <span className="ml-2 text-zinc-400">({selectedDocs.size} / {availableDocs.length})</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllDocs}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  >
                    Select all
                  </button>
                  <span className="text-zinc-400">|</span>
                  <button
                    onClick={clearAllDocs}
                    className="text-xs text-zinc-400 hover:text-zinc-600 font-medium transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {availableDocs.map((doc) => {
                  const isChecked = selectedDocs.has(doc);
                  return (
                    <label
                      key={doc}
                      className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-all text-sm ${
                        isChecked
                          ? 'border-blue-200 bg-blue-50/50 text-zinc-900'
                          : 'border-zinc-200 bg-white hover:border-zinc-200 text-zinc-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleDoc(doc)}
                        className="mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500/20"
                      />
                      <span className="leading-snug">{doc}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Run Button */}
          <button
            onClick={runAnalysis}
            disabled={!submissionType || loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <BarChart3 className="w-4 h-4" />
                Run Gap Analysis
              </>
            )}
          </button>

          {error && (
            <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </section>

        {/* ═══ Loading Skeleton ═══ */}
        {loading && <SkeletonLoader />}

        {/* ═══ Step 2: Results Dashboard ═══ */}
        {result && (
          <div
            ref={resultsRef}
            className={`transition-all duration-500 ease-out ${
              resultsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            {/* Readiness Score + Summary Stats */}
            <section className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
              {/* Circular Score */}
              <div className="lg:col-span-1 bg-white border border-zinc-200 rounded-xl shadow-sm p-6 flex flex-col items-center justify-center">
                <CircularProgress value={result.readinessScore} />
              </div>

              {/* 4 Summary Cards */}
              <div className="lg:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard
                  label="Total Required"
                  value={result.totalRequired}
                  icon={<FileText className="w-4 h-4" />}
                  color="zinc"
                />
                <SummaryCard
                  label="Completed"
                  value={result.completed}
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  color="emerald"
                />
                <SummaryCard
                  label="Partial"
                  value={result.partial}
                  icon={<AlertCircle className="w-4 h-4" />}
                  color="amber"
                />
                <SummaryCard
                  label="Missing"
                  value={result.missing}
                  icon={<XCircle className="w-4 h-4" />}
                  color="red"
                />
              </div>
            </section>

            {/* Gap Table */}
            <section className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden mb-8">
              <div className="px-6 py-4 border-b border-zinc-200">
                <h3 className="text-sm font-medium text-zinc-900 flex items-center gap-2">
                  <Target className="w-4 h-4 text-zinc-400" />
                  Gap Analysis Details
                  <span className="text-zinc-400 font-normal">
                    — {result.gaps.length} sections evaluated
                  </span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50/80">
                      <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                        eCTD Module
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                        Section Name
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                        Status
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                        Priority
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                        Est. Effort
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {result.gaps.map((gap, idx) => (
                      <tr
                        key={`${gap.ectdModule}-${idx}`}
                        className="hover:bg-zinc-50/50 transition-colors"
                      >
                        <td className="px-6 py-3.5 font-mono text-xs text-zinc-600 whitespace-nowrap">
                          {gap.ectdModule}
                        </td>
                        <td className="px-4 py-3.5 text-zinc-900 font-medium">
                          {gap.sectionName}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusPill status={gap.status} />
                        </td>
                        <td className="px-4 py-3.5">
                          <PriorityBadge priority={gap.priority} />
                        </td>
                        <td className="px-4 py-3.5 text-right text-zinc-600 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-zinc-400" />
                            {gap.estimatedEffortDays}d
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-zinc-500 max-w-xs">
                          {gap.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* AI Recommendations */}
            {result.recommendations.length > 0 && (
              <section className="bg-violet-50/60 border border-violet-100 rounded-xl shadow-sm p-6 mb-8">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-sm font-medium text-violet-900">AnA Recommendations</h3>
                </div>
                <ul className="space-y-2.5">
                  {result.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-violet-800">
                      <ArrowRight className="w-4 h-4 mt-0.5 shrink-0 text-violet-400" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Timeline Projection */}
            <section className="bg-white border border-zinc-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-zinc-400" />
                <h3 className="text-sm font-medium text-zinc-900">Timeline Projection</h3>
              </div>
              <TimelineBar weeks={result.estimatedWeeksToCompletion} readiness={result.readinessScore} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: Summary Card
// ═══════════════════════════════════════════════════════════════════════════════

function SummaryCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'zinc' | 'emerald' | 'amber' | 'red';
}) {
  const styles: Record<string, { bg: string; iconColor: string; valueColor: string }> = {
    zinc: { bg: 'bg-white', iconColor: 'text-zinc-400', valueColor: 'text-zinc-900' },
    emerald: { bg: 'bg-white', iconColor: 'text-emerald-500', valueColor: 'text-emerald-700' },
    amber: { bg: 'bg-white', iconColor: 'text-amber-500', valueColor: 'text-amber-700' },
    red: { bg: 'bg-white', iconColor: 'text-red-500', valueColor: 'text-red-700' },
  };
  const s = styles[color];

  return (
    <div className={`${s.bg} border border-zinc-200 rounded-xl shadow-sm p-5 flex flex-col`}>
      <div className={`${s.iconColor} mb-2`}>{icon}</div>
      <span className={`text-3xl font-bold ${s.valueColor} tracking-tight`}>{value}</span>
      <span className="text-xs text-zinc-500 mt-1">{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: Timeline Bar
// ═══════════════════════════════════════════════════════════════════════════════

function TimelineBar({ weeks, readiness }: { weeks: number; readiness: number }) {
  const maxWeeks = Math.max(weeks, 4);
  const completedFraction = readiness / 100;

  // Generate week markers
  const markers: number[] = [];
  const step = maxWeeks <= 8 ? 1 : maxWeeks <= 20 ? 2 : 4;
  for (let i = 0; i <= maxWeeks; i += step) {
    markers.push(i);
  }
  if (markers[markers.length - 1] !== maxWeeks) {
    markers.push(maxWeeks);
  }

  const barColor =
    readiness >= 80 ? 'bg-emerald-500' : readiness >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div>
      {/* Bar */}
      <div className="relative h-6 bg-zinc-100 rounded-full overflow-hidden mb-3">
        <div
          className={`absolute left-0 top-0 h-full ${barColor} rounded-full transition-all duration-1000 ease-out`}
          style={{ width: `${completedFraction * 100}%` }}
        />
        {/* Current position label */}
        <div
          className="absolute top-0 h-full flex items-center"
          style={{ left: `${completedFraction * 100}%` }}
        >
          <div className="ml-2 text-xs font-medium text-zinc-700 whitespace-nowrap">
            {readiness >= 100 ? 'Ready' : `~${weeks} weeks remaining`}
          </div>
        </div>
      </div>

      {/* Week markers */}
      <div className="relative h-4">
        {markers.map((w) => (
          <span
            key={w}
            className="absolute text-xs text-zinc-400 -translate-x-1/2"
            style={{ left: `${(w / maxWeeks) * 100}%` }}
          >
            {w === 0 ? 'Now' : `Wk ${w}`}
          </span>
        ))}
      </div>

      {/* Summary text */}
      <p className="text-xs text-zinc-500 mt-3">
        Based on current progress ({readiness}% complete), the estimated time to full submission readiness is approximately{' '}
        <span className="font-medium text-zinc-700">{weeks} week{weeks !== 1 ? 's' : ''}</span>.
      </p>
    </div>
  );
}
