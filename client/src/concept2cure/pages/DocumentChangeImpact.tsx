/**
 * @fileoverview Document Change Impact Analysis
 * @module concept2cure/pages/DocumentChangeImpact
 *
 * @description
 * Shows how regulatory guidance changes impact the user's active submission
 * documents. Analyzes eCTD sections, estimates rework, and provides
 * AI-powered recommendations via AnA.
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  FileWarning,
  AlertTriangle,
  Clock,
  ArrowRight,
  Sparkles,
  Shield,
  GitCompare,
  CalendarDays,
  ChevronDown,
  Loader2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface AffectedSection {
  ectdSection: string;
  module: string;
  currentStatus: string;
  impactLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  requiredAction: string;
  reworkDays: number;
}

interface ImpactAnalysis {
  riskLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  totalAffectedSections: number;
  estimatedReworkDays: number;
  affectedSections: AffectedSection[];
  recommendations: string[];
  originalTimeline: { label: string; date: string };
  revisedTimeline: { label: string; date: string };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const GUIDANCE_DOCUMENTS = [
  {
    id: 'fda-2026-001',
    title: 'FDA: Diversity Action Plans for Clinical Studies (Final)',
    date: '2026-02-15',
    agency: 'FDA',
  },
  {
    id: 'fda-2026-002',
    title: 'FDA: Clinical Pharmacology Considerations for ADCs',
    date: '2026-01-28',
    agency: 'FDA',
  },
  {
    id: 'ema-2026-001',
    title: 'EMA: Guideline on Quality of Biological Active Substances (Rev 2)',
    date: '2026-02-03',
    agency: 'EMA',
  },
  {
    id: 'fda-2025-018',
    title: 'FDA: Digital Health Technologies for Remote Data Acquisition',
    date: '2025-12-10',
    agency: 'FDA',
  },
  {
    id: 'ema-2025-012',
    title: 'EMA: Revised Annex I — Manufacturing of Sterile Medicinal Products',
    date: '2025-11-22',
    agency: 'EMA',
  },
  {
    id: 'fda-2025-015',
    title: 'FDA: Adaptive Design Clinical Trials for Drugs and Biologics',
    date: '2025-10-30',
    agency: 'FDA',
  },
  {
    id: 'ich-2026-001',
    title: 'ICH E6(R3): Good Clinical Practice — Annex 2 (Step 4)',
    date: '2026-03-01',
    agency: 'ICH',
  },
  {
    id: 'fda-2026-003',
    title: 'FDA: Nonclinical Assessment of Abuse Potential for NMEs',
    date: '2026-01-14',
    agency: 'FDA',
  },
];

const SUBMISSION_TYPES = [
  'IND (Investigational New Drug)',
  'NDA (New Drug Application)',
  'BLA (Biologics License Application)',
  'sNDA (Supplemental NDA)',
  'ANDA (Abbreviated NDA)',
  'MAA (Marketing Authorization Application)',
];

const RISK_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; dot: string }
> = {
  Critical: {
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    dot: 'bg-red-500',
  },
  High: {
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    dot: 'bg-orange-500',
  },
  Medium: {
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  Low: {
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON LOADER
// ═══════════════════════════════════════════════════════════════════════════════

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-zinc-100', className)} />
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
      </div>
      <SkeletonBlock className="h-64" />
      <SkeletonBlock className="h-40" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function DocumentChangeImpact({ projectId, submissionType }: { projectId?: string; submissionType?: string }) {
  const [selectedGuidance, setSelectedGuidance] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<ImpactAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeImpact = useCallback(async () => {
    if (!selectedGuidance || !selectedSubmission) return;

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await fetch('/api/ana/change-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guidanceId: selectedGuidance,
          submissionType: selectedSubmission,
        }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed (${response.status})`);
      }

      const data: ImpactAnalysis = await response.json();
      setAnalysis(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to analyze impact'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedGuidance, selectedSubmission]);

  const selectedGuidanceDoc = GUIDANCE_DOCUMENTS.find(
    (g) => g.id === selectedGuidance
  );

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 border border-blue-100">
              <GitCompare className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
                Document Change Impact
              </h1>
              <p className="text-sm text-zinc-500">
                Understand how guidance updates affect your submission
              </p>
            </div>
          </div>
        </div>

        {/* Guidance Selector */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Guidance Dropdown */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Regulatory Guidance Change
              </label>
              <div className="relative">
                <select
                  value={selectedGuidance}
                  onChange={(e) => setSelectedGuidance(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-zinc-200 bg-white px-3 py-2.5 pr-10 text-sm text-zinc-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
                >
                  <option value="">Select a guidance document...</option>
                  {GUIDANCE_DOCUMENTS.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      [{doc.agency}] {doc.title} — {doc.date}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-zinc-400" />
              </div>
            </div>

            {/* Submission Type Dropdown */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Submission Type
              </label>
              <div className="relative">
                <select
                  value={selectedSubmission}
                  onChange={(e) => setSelectedSubmission(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-zinc-200 bg-white px-3 py-2.5 pr-10 text-sm text-zinc-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
                >
                  <option value="">Select submission type...</option>
                  {SUBMISSION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-zinc-400" />
              </div>
            </div>
          </div>

          {/* Selected guidance detail */}
          {selectedGuidanceDoc && (
            <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>
                Published {selectedGuidanceDoc.date} by{' '}
                {selectedGuidanceDoc.agency}
              </span>
            </div>
          )}

          {/* Analyze Button */}
          <div className="mt-5">
            <button
              onClick={analyzeImpact}
              disabled={!selectedGuidance || !selectedSubmission || loading}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all',
                !selectedGuidance || !selectedSubmission || loading
                  ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm'
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileWarning className="h-4 w-4" />
              )}
              {loading ? 'Analyzing...' : 'Analyze Impact'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 mb-6">
            <div className="flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && <LoadingSkeleton />}

        {/* Results */}
        {analysis && !loading && (
          <div className="space-y-6">
            {/* Impact Summary Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Risk Level */}
              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-3">
                  <Shield className="h-3.5 w-3.5" />
                  Risk Level
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold',
                      RISK_CONFIG[analysis.riskLevel]?.bg,
                      RISK_CONFIG[analysis.riskLevel]?.color,
                      'border',
                      RISK_CONFIG[analysis.riskLevel]?.border
                    )}
                  >
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        RISK_CONFIG[analysis.riskLevel]?.dot
                      )}
                    />
                    {analysis.riskLevel}
                  </span>
                </div>
              </div>

              {/* Affected Sections */}
              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-3">
                  <FileWarning className="h-3.5 w-3.5" />
                  Affected Sections
                </div>
                <p className="text-2xl font-semibold text-zinc-900">
                  {analysis.totalAffectedSections}
                </p>
              </div>

              {/* Est. Rework */}
              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-3">
                  <Clock className="h-3.5 w-3.5" />
                  Estimated Rework
                </div>
                <p className="text-2xl font-semibold text-zinc-900">
                  {analysis.estimatedReworkDays}{' '}
                  <span className="text-sm font-normal text-zinc-500">
                    days
                  </span>
                </p>
              </div>
            </div>

            {/* Affected Sections Table */}
            <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-100">
                <h2 className="text-sm font-semibold text-zinc-800">
                  Affected Sections
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/50">
                      <th className="px-5 py-3 text-left font-medium text-zinc-500">
                        eCTD Section
                      </th>
                      <th className="px-5 py-3 text-left font-medium text-zinc-500">
                        Module
                      </th>
                      <th className="px-5 py-3 text-left font-medium text-zinc-500">
                        Current Status
                      </th>
                      <th className="px-5 py-3 text-left font-medium text-zinc-500">
                        Impact
                      </th>
                      <th className="px-5 py-3 text-left font-medium text-zinc-500">
                        Required Action
                      </th>
                      <th className="px-5 py-3 text-right font-medium text-zinc-500">
                        Rework
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {analysis.affectedSections.map((section, idx) => {
                      const risk = RISK_CONFIG[section.impactLevel];
                      return (
                        <tr
                          key={idx}
                          className="hover:bg-zinc-50/50 transition-colors"
                        >
                          <td className="px-5 py-3 font-medium text-zinc-800">
                            {section.ectdSection}
                          </td>
                          <td className="px-5 py-3 text-zinc-600">
                            {section.module}
                          </td>
                          <td className="px-5 py-3 text-zinc-600">
                            {section.currentStatus}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                                risk?.bg,
                                risk?.color
                              )}
                            >
                              {section.impactLevel}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-zinc-600 max-w-xs">
                            {section.requiredAction}
                          </td>
                          <td className="px-5 py-3 text-right text-zinc-700 font-medium">
                            {section.reworkDays}d
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AnA Recommendations */}
            <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-4 w-4 text-violet-600" />
                <h2 className="text-sm font-semibold text-violet-900">
                  AnA Recommendations
                </h2>
              </div>
              <ul className="space-y-3">
                {analysis.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                    <span className="text-sm text-violet-800 leading-relaxed">
                      {rec}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Timeline Comparison */}
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="flex items-center gap-2 mb-5">
                <CalendarDays className="h-4 w-4 text-zinc-500" />
                <h2 className="text-sm font-semibold text-zinc-800">
                  Timeline Impact
                </h2>
              </div>
              <div className="space-y-4">
                {/* Original Timeline */}
                <div className="flex items-center gap-4">
                  <span className="w-28 text-xs font-medium text-zinc-500 shrink-0">
                    Original
                  </span>
                  <div className="relative flex-1 h-8 rounded-full bg-blue-50 border border-blue-100 overflow-hidden">
                    <div className="absolute inset-y-0 left-0 w-full rounded-full bg-blue-100" />
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      <span className="text-xs font-medium text-blue-700">
                        {analysis.originalTimeline.date}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Revised Timeline */}
                <div className="flex items-center gap-4">
                  <span className="w-28 text-xs font-medium text-zinc-500 shrink-0">
                    Revised
                  </span>
                  <div className="relative flex-1 h-8 rounded-full bg-amber-50 border border-amber-100 overflow-hidden">
                    <div className="absolute inset-y-0 left-0 w-full rounded-full bg-amber-100" />
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      <span className="text-xs font-medium text-amber-700">
                        {analysis.revisedTimeline.date}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Delta indicator */}
                <div className="flex items-center gap-4">
                  <span className="w-28" />
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      +{analysis.estimatedReworkDays} days from guidance change
                      impact
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
