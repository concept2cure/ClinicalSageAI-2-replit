/**
 * @fileoverview Submission Readiness — dossier-level readiness view
 *
 * Shows at dossier level:
 *   - Ready sections
 *   - Blocked sections
 *   - Sections requiring re-review
 *   - Sections impacted by changed assumptions
 *   - Missing approvals
 *   - Export/package readiness
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Lock,
  ShieldCheck,
  PenLine,
  CircleDot,
  ArrowLeft,
  Download,
  Send,
  RefreshCcw,
  AlertCircle,
  ChevronRight,
  Package,
  FileCheck,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SectionStatus = 'not-started' | 'drafting' | 'in-review' | 'approved' | 'blocked' | 'locked';

export interface ReadinessSection {
  code: string;
  title: string;
  status: SectionStatus;
  issues?: number;
  needsReReview?: boolean;
  impactedByUpstream?: boolean;
  missingApproval?: boolean;
  lastReviewedAt?: string;
}

export interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warning' | 'pending';
  description?: string;
}

export interface SubmissionReadinessProps {
  projectName?: string;
  projectType?: string;
  sections?: ReadinessSection[];
  checks?: ReadinessCheck[];
  onSectionClick: (sectionCode: string) => void;
  onBack?: () => void;
  onExport?: () => void;
}

// ─── Status config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SectionStatus, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  'not-started': { label: 'Not Started', color: 'text-zinc-400', bg: 'bg-zinc-100', icon: CircleDot },
  'drafting': { label: 'Drafting', color: 'text-blue-600', bg: 'bg-blue-50', icon: PenLine },
  'in-review': { label: 'In Review', color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock },
  'approved': { label: 'Approved', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
  'blocked': { label: 'Blocked', color: 'text-red-600', bg: 'bg-red-50', icon: AlertTriangle },
  'locked': { label: 'Locked', color: 'text-violet-600', bg: 'bg-violet-50', icon: Lock },
};

// ─── Default data ───────────────────────────────────────────────────────────

const DEFAULT_SECTIONS: ReadinessSection[] = [
  { code: '1.1', title: 'Forms', status: 'approved' },
  { code: '1.2', title: 'Cover Letter', status: 'approved' },
  { code: '1.3.1', title: 'Form FDA 1571', status: 'approved' },
  { code: '1.3.2', title: 'Form FDA 1572', status: 'drafting' },
  { code: '2.2', title: 'Introduction', status: 'drafting' },
  { code: '2.5', title: 'Clinical Overview', status: 'drafting', issues: 2 },
  { code: '2.7.3', title: 'Clinical Efficacy', status: 'drafting', issues: 1 },
  { code: '2.7.4', title: 'Clinical Safety', status: 'not-started' },
  { code: '3.2.S', title: 'Drug Substance', status: 'in-review', missingApproval: true },
  { code: '3.2.P', title: 'Drug Product', status: 'in-review', missingApproval: true },
  { code: '5.3', title: 'Clinical Study Reports', status: 'blocked', issues: 2, impactedByUpstream: true },
];

const DEFAULT_CHECKS: ReadinessCheck[] = [
  { id: 'c1', label: 'All required sections present', status: 'fail', description: 'Section 2.7.4 (Clinical Safety) not started' },
  { id: 'c2', label: 'No unresolved critical issues', status: 'fail', description: '5 critical issues remain across 3 sections' },
  { id: 'c3', label: 'All sections reviewed', status: 'fail', description: '6 sections not yet reviewed' },
  { id: 'c4', label: 'All approvals obtained', status: 'fail', description: '2 sections awaiting QA sign-off' },
  { id: 'c5', label: 'No contradictions between sections', status: 'warning', description: '1 potential contradiction detected in Section 2.5 vs 2.7.4' },
  { id: 'c6', label: 'Regulatory body requirements met', status: 'warning', description: 'FDA-specific requirements partially met' },
  { id: 'c7', label: 'eCTD packaging valid', status: 'pending', description: 'Packaging validation not yet run' },
  { id: 'c8', label: 'Document formatting compliant', status: 'pass', description: 'All documents meet eCTD formatting requirements' },
];

// ─── Component ──────────────────────────────────────────────────────────────

export const SubmissionReadiness: React.FC<SubmissionReadinessProps> = ({
  projectName,
  projectType,
  sections = DEFAULT_SECTIONS,
  checks = DEFAULT_CHECKS,
  onSectionClick,
  onBack,
  onExport,
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'ready' | 'blocked' | 're-review' | 'missing-approval'>('all');

  // Categorize sections
  const readySections = sections.filter(s => s.status === 'approved' || s.status === 'locked');
  const blockedSections = sections.filter(s => s.status === 'blocked' || (s.issues && s.issues > 0));
  const reReviewSections = sections.filter(s => s.needsReReview || s.impactedByUpstream);
  const missingApprovalSections = sections.filter(s => s.missingApproval);

  const filteredSections = (() => {
    switch (activeCategory) {
      case 'ready': return readySections;
      case 'blocked': return blockedSections;
      case 're-review': return reReviewSections;
      case 'missing-approval': return missingApprovalSections;
      default: return sections;
    }
  })();

  // Overall readiness score
  const passedChecks = checks.filter(c => c.status === 'pass').length;
  const totalChecks = checks.length;
  const readinessScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
  const isSubmissionReady = checks.every(c => c.status === 'pass');

  const CHECK_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
    pass: { icon: CheckCircle2, color: 'text-emerald-500' },
    fail: { icon: AlertCircle, color: 'text-red-500' },
    warning: { icon: AlertTriangle, color: 'text-amber-500' },
    pending: { icon: Clock, color: 'text-zinc-400' },
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-50/30">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 transition-colors mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to project
            </button>
          )}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">Submission Readiness</h1>
              {projectName && (
                <p className="text-sm text-zinc-500 mt-0.5">
                  {projectName} {projectType ? `· ${projectType}` : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onExport}
                disabled={!isSubmissionReady}
                className={cn(
                  'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  isSubmissionReady
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                )}
              >
                <Package className="w-4 h-4" />
                Export eCTD Package
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto zen-scroll">
        <div className="max-w-5xl mx-auto px-6 py-6">

          {/* ── Readiness Score ────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-zinc-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Readiness Score</h2>
                <p className="text-sm text-zinc-500 mt-0.5">{passedChecks} of {totalChecks} checks passing</p>
              </div>
              <div className={cn(
                'text-3xl font-bold',
                readinessScore >= 80 ? 'text-emerald-600' :
                readinessScore >= 50 ? 'text-amber-600' :
                'text-red-600'
              )}>
                {readinessScore}%
              </div>
            </div>
            <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  readinessScore >= 80 ? 'bg-emerald-500' :
                  readinessScore >= 50 ? 'bg-amber-500' :
                  'bg-red-500'
                )}
                style={{ width: `${readinessScore}%` }}
              />
            </div>
          </div>

          {/* ── Readiness Checks ──────────────────────────────────── */}
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Readiness Checks
            </h2>
            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
              <div className="divide-y divide-zinc-100">
                {checks.map(check => {
                  const cfg = CHECK_ICONS[check.status];
                  const Icon = cfg.icon;
                  return (
                    <div key={check.id} className="flex items-start gap-3 px-4 py-3">
                      <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', cfg.color)} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-zinc-800 block">{check.label}</span>
                        {check.description && (
                          <span className="text-xs text-zinc-400 block mt-0.5">{check.description}</span>
                        )}
                      </div>
                      <span className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 uppercase',
                        check.status === 'pass' ? 'bg-emerald-50 text-emerald-600' :
                        check.status === 'fail' ? 'bg-red-50 text-red-600' :
                        check.status === 'warning' ? 'bg-amber-50 text-amber-600' :
                        'bg-zinc-100 text-zinc-400'
                      )}>
                        {check.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Section filter tabs ───────────────────────────────── */}
          <div className="flex items-center gap-2 mb-4 overflow-x-auto">
            {[
              { key: 'all' as const, label: 'All Sections', count: sections.length },
              { key: 'ready' as const, label: 'Ready', count: readySections.length },
              { key: 'blocked' as const, label: 'Blocked', count: blockedSections.length },
              { key: 're-review' as const, label: 'Needs Re-review', count: reReviewSections.length },
              { key: 'missing-approval' as const, label: 'Missing Approval', count: missingApprovalSections.length },
            ].map(cat => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                  activeCategory === cat.key
                    ? 'bg-zinc-900 text-white'
                    : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
                )}
              >
                {cat.label}
                <span className={cn('text-[10px]', activeCategory === cat.key ? 'text-zinc-400' : 'text-zinc-400')}>
                  {cat.count}
                </span>
              </button>
            ))}
          </div>

          {/* ── Section list ──────────────────────────────────────── */}
          <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
            {filteredSections.length > 0 ? (
              <div className="divide-y divide-zinc-100">
                {filteredSections.map(section => {
                  const cfg = STATUS_CONFIG[section.status];
                  const StatusIcon = cfg.icon;
                  return (
                    <button
                      key={section.code}
                      onClick={() => onSectionClick(section.code)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors text-left"
                    >
                      <span className="text-xs font-mono text-zinc-400 w-12 flex-shrink-0">{section.code}</span>
                      <span className="flex-1 text-sm text-zinc-800 truncate">{section.title}</span>

                      {/* Flags */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {section.issues && section.issues > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
                            {section.issues} issue{section.issues > 1 ? 's' : ''}
                          </span>
                        )}
                        {section.needsReReview && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium flex items-center gap-0.5">
                            <RefreshCcw className="w-2.5 h-2.5" /> re-review
                          </span>
                        )}
                        {section.impactedByUpstream && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">
                            upstream change
                          </span>
                        )}
                        {section.missingApproval && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium flex items-center gap-0.5">
                            <FileCheck className="w-2.5 h-2.5" /> approval needed
                          </span>
                        )}
                      </div>

                      {/* Status */}
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0', cfg.bg, cfg.color)}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {cfg.label}
                      </span>

                      <ChevronRight className="w-3 h-3 text-zinc-300 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-zinc-400">
                No sections in this category
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default SubmissionReadiness;
