/**
 * PreSubmissionChecklist — Automated submission readiness validation.
 *
 * Categories: Documentation, Formatting, Compliance, Quality, Regulatory
 * Each item can be auto-checked or requires manual confirmation.
 * Generates a readiness report with pass/fail per category.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  ClipboardCheck,
  Check,
  X,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Circle,
  FileText,
  Shield,
  BookOpen,
  Printer,
  BarChart3,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type CheckStatus = 'pass' | 'fail' | 'warning' | 'manual' | 'pending' | 'running';

interface CheckItem {
  id: string;
  label: string;
  description?: string;
  status: CheckStatus;
  autoCheck: boolean;
  manualConfirmed?: boolean;
  details?: string;
  fixAction?: string;
}

interface CheckCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  items: CheckItem[];
}

interface PreSubmissionChecklistProps {
  submissionType?: 'IND' | 'NDA' | 'BLA' | '510k' | 'PMA' | 'MAA' | 'ANDA';
  region?: 'FDA' | 'EMA' | 'HC' | 'PMDA' | 'TGA';
  /** Counts from the submission builder */
  sectionStats?: {
    totalRequired: number;
    complete: number;
    partial: number;
    missing: number;
  };
  /** Auto-check results from server validation */
  validationResults?: Record<string, CheckStatus>;
  /** Callback to run auto-checks */
  onRunValidation?: () => void;
  /** Callback to generate readiness report */
  onGenerateReport?: () => void;
  /** Callback when a manual check is toggled */
  onManualCheck?: (itemId: string, confirmed: boolean) => void;
  /** Callback to auto-fix an issue */
  onFixIssue?: (itemId: string) => void;
  onClose?: () => void;
  isRunning?: boolean;
}

// ── Checklist definitions ────────────────────────────────────────────────────

function buildChecklist(
  submissionType: string,
  sectionStats?: PreSubmissionChecklistProps['sectionStats'],
  validationResults?: Record<string, CheckStatus>,
  manualStates?: Record<string, boolean>,
): CheckCategory[] {
  function autoStatus(id: string, fallback: CheckStatus = 'pending'): CheckStatus {
    return validationResults?.[id] ?? fallback;
  }

  function manualStatus(id: string): CheckStatus {
    if (manualStates?.[id]) return 'pass';
    return 'manual';
  }

  const docComplete = sectionStats
    ? sectionStats.missing === 0 ? 'pass' : sectionStats.missing <= 2 ? 'warning' : 'fail'
    : 'pending';

  return [
    {
      id: 'documentation',
      label: 'Documentation',
      icon: FileText,
      items: [
        {
          id: 'doc-all-sections',
          label: 'All required sections present',
          description: sectionStats
            ? `${sectionStats.complete}/${sectionStats.totalRequired} complete, ${sectionStats.missing} missing`
            : 'Run validation to check',
          status: docComplete as CheckStatus,
          autoCheck: true,
        },
        {
          id: 'doc-all-approved',
          label: 'All documents in approved/final status',
          description: 'Documents must pass QC review before submission',
          status: autoStatus('doc-all-approved'),
          autoCheck: true,
        },
        {
          id: 'doc-cover-letter',
          label: 'Cover letter included',
          description: 'Region-specific cover letter for the submission',
          status: autoStatus('doc-cover-letter'),
          autoCheck: true,
        },
        {
          id: 'doc-forms',
          label: `${submissionType} application forms complete`,
          description: submissionType === 'NDA' || submissionType === 'BLA'
            ? 'Form 356h and supporting forms'
            : submissionType === 'IND'
              ? 'Form 1571 and supporting forms'
              : 'Required application forms',
          status: manualStatus('doc-forms'),
          autoCheck: false,
        },
      ],
    },
    {
      id: 'formatting',
      label: 'Formatting & Structure',
      icon: Printer,
      items: [
        {
          id: 'fmt-ectd-structure',
          label: 'eCTD folder structure valid',
          description: 'Documents organized per ICH M4 structure',
          status: autoStatus('fmt-ectd-structure'),
          autoCheck: true,
        },
        {
          id: 'fmt-page-margins',
          label: 'Page margins and fonts compliant',
          description: 'FDA requires specific margin and font requirements',
          status: manualStatus('fmt-page-margins'),
          autoCheck: false,
        },
        {
          id: 'fmt-bookmarks',
          label: 'PDF bookmarks and hyperlinks functional',
          description: 'All internal cross-references resolve correctly',
          status: autoStatus('fmt-bookmarks'),
          autoCheck: true,
        },
        {
          id: 'fmt-page-limits',
          label: 'Section page limits respected',
          description: 'No section exceeds regulatory page limits',
          status: autoStatus('fmt-page-limits'),
          autoCheck: true,
        },
      ],
    },
    {
      id: 'compliance',
      label: 'Regulatory Compliance',
      icon: Shield,
      items: [
        {
          id: 'comp-language',
          label: 'Regulatory language quality',
          description: 'No informal language, ambiguous terms, or unsupported claims',
          status: autoStatus('comp-language'),
          autoCheck: true,
        },
        {
          id: 'comp-cross-refs',
          label: 'Cross-references valid',
          description: 'All "See Section X.Y" references resolve to existing content',
          status: autoStatus('comp-cross-refs'),
          autoCheck: true,
        },
        {
          id: 'comp-consistency',
          label: 'Terminology consistency',
          description: 'Drug name, doses, and key terms used consistently',
          status: autoStatus('comp-consistency'),
          autoCheck: true,
        },
        {
          id: 'comp-signatures',
          label: 'Digital signatures applied',
          description: '21 CFR Part 11 compliant electronic signatures',
          status: manualStatus('comp-signatures'),
          autoCheck: false,
        },
      ],
    },
    {
      id: 'quality',
      label: 'Quality Assurance',
      icon: BarChart3,
      items: [
        {
          id: 'qa-spell-check',
          label: 'Spell check passed',
          description: 'No spelling errors in submission documents',
          status: autoStatus('qa-spell-check'),
          autoCheck: true,
        },
        {
          id: 'qa-data-tables',
          label: 'Data tables complete',
          description: 'No empty cells or placeholder values in data tables',
          status: autoStatus('qa-data-tables'),
          autoCheck: true,
        },
        {
          id: 'qa-references',
          label: 'Reference list complete and formatted',
          description: 'All citations resolve, consistent formatting',
          status: autoStatus('qa-references'),
          autoCheck: true,
        },
        {
          id: 'qa-peer-review',
          label: 'Peer review completed',
          description: 'All documents reviewed by qualified personnel',
          status: manualStatus('qa-peer-review'),
          autoCheck: false,
        },
      ],
    },
    {
      id: 'regulatory',
      label: 'Regulatory Requirements',
      icon: BookOpen,
      items: [
        {
          id: 'reg-pre-sub-meeting',
          label: 'Pre-submission meeting minutes filed',
          description: 'Record of any Type A/B/C meetings with agency',
          status: manualStatus('reg-pre-sub-meeting'),
          autoCheck: false,
        },
        {
          id: 'reg-fee-paid',
          label: 'Application fee payment confirmed',
          description: submissionType === 'NDA' || submissionType === 'BLA'
            ? 'PDUFA fee payment receipt'
            : submissionType === '510k'
              ? '510(k) user fee'
              : 'Applicable regulatory fee',
          status: manualStatus('reg-fee-paid'),
          autoCheck: false,
        },
        {
          id: 'reg-labeling',
          label: 'Labeling review complete',
          description: 'Draft labeling consistent with clinical data',
          status: manualStatus('reg-labeling'),
          autoCheck: false,
        },
        {
          id: 'reg-env-assessment',
          label: 'Environmental assessment or exclusion',
          description: 'EA filed or categorical exclusion claimed',
          status: manualStatus('reg-env-assessment'),
          autoCheck: false,
        },
      ],
    },
  ];
}

// ── Status helpers ────────────────────────────────────────────────────────

function statusIcon(status: CheckStatus, size = 'h-4 w-4') {
  switch (status) {
    case 'pass':
      return <CheckCircle className={cn(size, 'text-emerald-500')} />;
    case 'fail':
      return <XCircle className={cn(size, 'text-red-500')} />;
    case 'warning':
      return <AlertTriangle className={cn(size, 'text-amber-500')} />;
    case 'manual':
      return <Circle className={cn(size, 'text-slate-300')} />;
    case 'running':
      return <Loader2 className={cn(size, 'text-blue-500 animate-spin')} />;
    default:
      return <Clock className={cn(size, 'text-slate-300')} />;
  }
}

function categoryScore(items: CheckItem[]): { passed: number; total: number; status: CheckStatus } {
  const total = items.length;
  const passed = items.filter(i => i.status === 'pass').length;
  const hasFail = items.some(i => i.status === 'fail');
  const hasWarning = items.some(i => i.status === 'warning');
  const status: CheckStatus = hasFail ? 'fail' : hasWarning ? 'warning' : passed === total ? 'pass' : 'pending';
  return { passed, total, status };
}

// ── Main component ──────────────────────────────────────────────────────────

export function PreSubmissionChecklist({
  submissionType = 'NDA',
  region = 'FDA',
  sectionStats,
  validationResults,
  onRunValidation,
  onGenerateReport,
  onManualCheck,
  onFixIssue,
  onClose,
  isRunning,
}: PreSubmissionChecklistProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['documentation', 'formatting', 'compliance', 'quality', 'regulatory']),
  );
  const [manualStates, setManualStates] = useState<Record<string, boolean>>({});

  const categories = useMemo(
    () => buildChecklist(submissionType, sectionStats, validationResults, manualStates),
    [submissionType, sectionStats, validationResults, manualStates],
  );

  const toggleCategory = useCallback((id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleManualToggle = useCallback((itemId: string) => {
    setManualStates(prev => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      onManualCheck?.(itemId, next[itemId]);
      return next;
    });
  }, [onManualCheck]);

  // Overall score
  const overallScore = useMemo(() => {
    const allItems = categories.flatMap(c => c.items);
    const passed = allItems.filter(i => i.status === 'pass').length;
    return { passed, total: allItems.length, pct: Math.round((passed / allItems.length) * 100) };
  }, [categories]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-5 w-5 text-blue-500" />
          <div>
            <h2 className="text-base font-semibold text-slate-800">Pre-Submission Checklist</h2>
            <p className="text-xs text-slate-500">{submissionType} · {region}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRunValidation}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {isRunning ? 'Running...' : 'Run Checks'}
          </button>
          <button
            onClick={onGenerateReport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors duration-150"
          >
            <Download className="h-3.5 w-3.5" />
            Report
          </button>
          {onClose && (
            <button onClick={onClose} aria-label="Close checklist" title="Close" className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-stone-400 outline-none">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Overall score */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-600">Overall Readiness</span>
          <span className={cn(
            'text-sm font-semibold',
            overallScore.pct >= 80 ? 'text-emerald-600' : overallScore.pct >= 50 ? 'text-amber-600' : 'text-red-600',
          )}>
            {overallScore.passed}/{overallScore.total} checks passed ({overallScore.pct}%)
          </span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-150',
              overallScore.pct >= 80 ? 'bg-emerald-500' : overallScore.pct >= 50 ? 'bg-amber-500' : 'bg-red-500',
            )}
            style={{ width: `${overallScore.pct}%` }}
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {categories.map(cat => {
          const score = categoryScore(cat.items);
          const isExpanded = expandedCategories.has(cat.id);

          return (
            <div key={cat.id} className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors duration-150"
              >
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-slate-400" />
                  : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <cat.icon className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700 flex-1 text-left">{cat.label}</span>
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded',
                  score.status === 'pass' ? 'text-emerald-700 bg-emerald-100'
                    : score.status === 'fail' ? 'text-red-700 bg-red-100'
                      : score.status === 'warning' ? 'text-amber-700 bg-amber-100'
                        : 'text-slate-500 bg-slate-100',
                )}>
                  {score.passed}/{score.total}
                </span>
                {statusIcon(score.status)}
              </button>

              {isExpanded && (
                <div className="divide-y divide-slate-100">
                  {cat.items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors duration-150"
                    >
                      {item.autoCheck ? (
                        statusIcon(item.status)
                      ) : (
                        <button
                          onClick={() => handleManualToggle(item.id)}
                          className="shrink-0 mt-0.5"
                        >
                          {item.status === 'pass' ? (
                            <div className="h-4 w-4 rounded border-2 border-emerald-500 bg-emerald-500 flex items-center justify-center">
                              <Check className="h-2.5 w-2.5 text-white" />
                            </div>
                          ) : (
                            <div className="h-4 w-4 rounded border-2 border-slate-300 hover:border-blue-400 transition-colors duration-150" />
                          )}
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700">{item.label}</p>
                        {item.description && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{item.description}</p>
                        )}
                        {item.details && (
                          <p className="text-[11px] text-red-500 mt-0.5">{item.details}</p>
                        )}
                      </div>
                      {item.status === 'fail' && item.fixAction && onFixIssue && (
                        <button
                          onClick={() => onFixIssue(item.id)}
                          className="text-[10px] font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
                        >
                          Fix
                        </button>
                      )}
                      {!item.autoCheck && (
                        <span className="text-[10px] text-slate-300 italic whitespace-nowrap">manual</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
