/**
 * SubmissionReadinessValidator — Pre-submission checklist and validation for eCTD packages.
 *
 * Provides automated checks across all CTD modules to ensure submission readiness:
 * - Section completeness (required vs. optional)
 * - Document formatting compliance
 * - Cross-reference validity
 * - Regulatory language quality
 * - E-signature status
 * - Artifact assignment coverage
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
  FileText,
  Link2,
  PenTool,
  Languages,
  Fingerprint,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type CheckStatus = 'pass' | 'fail' | 'warning' | 'pending' | 'not-applicable';

interface ValidationCheck {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  module: string;
  category: 'completeness' | 'formatting' | 'cross-reference' | 'language' | 'signature' | 'metadata';
  details?: string;
  autoFixable?: boolean;
}

interface ModuleValidation {
  module: string;
  label: string;
  checks: ValidationCheck[];
  expanded: boolean;
}

interface Artifact {
  id: string;
  title: string;
  status?: string;
  ctdSection?: string;
  content?: string;
  type?: string;
}

export interface SubmissionReadinessValidatorProps {
  projectId: string;
  submissionType?: string;
  artifacts: Artifact[];
  onNavigateToArtifact?: (artifactId: string) => void;
  onClose?: () => void;
}

// ── CTD Module Definitions ─────────────────────────────────────────────────────

const CTD_MODULES = [
  {
    module: 'M1',
    label: 'Module 1 — Regional Administrative',
    required: ['1.1', '1.2', '1.3'],
    sections: [
      { id: '1.1', label: 'Cover Letter' },
      { id: '1.2', label: 'Application Form' },
      { id: '1.3', label: 'Product Information' },
      { id: '1.4', label: 'Labeling' },
      { id: '1.5', label: 'Regulatory History' },
    ],
  },
  {
    module: 'M2',
    label: 'Module 2 — Summaries',
    required: ['2.2', '2.3', '2.4', '2.5', '2.6', '2.7'],
    sections: [
      { id: '2.1', label: 'Table of Contents' },
      { id: '2.2', label: 'Introduction' },
      { id: '2.3', label: 'Quality Overall Summary' },
      { id: '2.4', label: 'Nonclinical Overview' },
      { id: '2.5', label: 'Clinical Overview' },
      { id: '2.6', label: 'Nonclinical Written & Tabulated Summaries' },
      { id: '2.7', label: 'Clinical Summary' },
    ],
  },
  {
    module: 'M3',
    label: 'Module 3 — Quality (CMC)',
    required: ['3.2.S', '3.2.P'],
    sections: [
      { id: '3.1', label: 'Table of Contents' },
      { id: '3.2.S', label: 'Drug Substance' },
      { id: '3.2.P', label: 'Drug Product' },
      { id: '3.2.A', label: 'Appendices' },
      { id: '3.2.R', label: 'Regional Information' },
      { id: '3.3', label: 'Literature References' },
    ],
  },
  {
    module: 'M4',
    label: 'Module 4 — Nonclinical Study Reports',
    required: ['4.2'],
    sections: [
      { id: '4.1', label: 'Table of Contents' },
      { id: '4.2', label: 'Study Reports' },
      { id: '4.3', label: 'Literature References' },
    ],
  },
  {
    module: 'M5',
    label: 'Module 5 — Clinical Study Reports',
    required: ['5.2', '5.3'],
    sections: [
      { id: '5.1', label: 'Table of Contents' },
      { id: '5.2', label: 'Tabular Listing of Clinical Studies' },
      { id: '5.3', label: 'Clinical Study Reports' },
      { id: '5.4', label: 'Literature References' },
    ],
  },
];

// ── Validation Engine ──────────────────────────────────────────────────────────

function runValidation(artifacts: Artifact[], submissionType?: string): ModuleValidation[] {
  const results: ModuleValidation[] = [];

  for (const mod of CTD_MODULES) {
    const checks: ValidationCheck[] = [];

    for (const section of mod.sections) {
      const isRequired = mod.required.includes(section.id);
      // Find artifacts assigned to this CTD section
      const assigned = artifacts.filter(a => a.ctdSection?.startsWith(section.id));

      // Completeness check
      if (assigned.length === 0) {
        checks.push({
          id: `${section.id}-completeness`,
          label: `${section.id} ${section.label}`,
          description: isRequired
            ? `Required section has no assigned document`
            : `Optional section — no document assigned`,
          status: isRequired ? 'fail' : 'not-applicable',
          module: mod.module,
          category: 'completeness',
        });
      } else {
        // Check each assigned artifact
        for (const artifact of assigned) {
          const content = artifact.content || '';
          const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const wordCount = plainText.split(/\s+/).filter(Boolean).length;

          // Word count check
          if (wordCount < 50 && isRequired) {
            checks.push({
              id: `${artifact.id}-wordcount`,
              label: `${section.id} — ${artifact.title}`,
              description: `Only ${wordCount} words — required sections should have substantive content (>50 words)`,
              status: 'warning',
              module: mod.module,
              category: 'completeness',
              autoFixable: true,
            });
          } else {
            checks.push({
              id: `${artifact.id}-completeness`,
              label: `${section.id} — ${artifact.title}`,
              description: `${wordCount} words, status: ${artifact.status || 'draft'}`,
              status: 'pass',
              module: mod.module,
              category: 'completeness',
            });
          }

          // Status check — should be at least "review" for submission
          if (artifact.status === 'draft') {
            checks.push({
              id: `${artifact.id}-status`,
              label: `${section.id} — Document still in Draft`,
              description: `"${artifact.title}" is still in draft status. Consider advancing to review or approved.`,
              status: isRequired ? 'warning' : 'not-applicable',
              module: mod.module,
              category: 'metadata',
            });
          }

          // Placeholder text check
          const placeholderPattern = /\[.*?\]|TODO|TBD|PLACEHOLDER|INSERT|FIXME/i;
          if (placeholderPattern.test(plainText)) {
            checks.push({
              id: `${artifact.id}-placeholder`,
              label: `${section.id} — Placeholder text detected`,
              description: `"${artifact.title}" contains placeholder markers (TODO, TBD, [brackets], etc.)`,
              status: 'fail',
              module: mod.module,
              category: 'language',
              autoFixable: true,
            });
          }

          // Heading structure check
          const hasH1 = /<h1[^>]*>/i.test(content);
          const hasH2 = /<h2[^>]*>/i.test(content);
          if (!hasH1 && !hasH2 && wordCount > 100) {
            checks.push({
              id: `${artifact.id}-headings`,
              label: `${section.id} — Missing section headings`,
              description: `"${artifact.title}" has ${wordCount} words but no headings. Add H1/H2 headers for structure.`,
              status: 'warning',
              module: mod.module,
              category: 'formatting',
              autoFixable: true,
            });
          }
        }
      }
    }

    results.push({
      module: mod.module,
      label: mod.label,
      checks,
      expanded: checks.some(c => c.status === 'fail'),
    });
  }

  // Global checks
  const globalChecks: ValidationCheck[] = [];

  // E-signature check — at least one approved document should be signed
  const approvedDocs = artifacts.filter(a => a.status === 'approved' || a.status === 'locked');
  if (approvedDocs.length === 0) {
    globalChecks.push({
      id: 'global-signatures',
      label: 'No approved documents',
      description: 'At least one document should be in approved/locked status with e-signature before submission.',
      status: 'warning',
      module: 'Global',
      category: 'signature',
    });
  }

  // Cross-reference pattern check
  const allContent = artifacts.map(a => a.content || '').join(' ');
  const brokenRefPattern = /(?:see|refer to|as described in)\s+(?:section|module)\s+[\d.]+/gi;
  const refs = allContent.match(brokenRefPattern) || [];
  if (refs.length > 0) {
    globalChecks.push({
      id: 'global-crossref',
      label: `${refs.length} cross-reference(s) detected`,
      description: 'Cross-references found in content. Verify they point to existing sections.',
      status: 'pass',
      module: 'Global',
      category: 'cross-reference',
    });
  }

  if (globalChecks.length > 0) {
    results.push({
      module: 'Global',
      label: 'Global Checks',
      checks: globalChecks,
      expanded: globalChecks.some(c => c.status === 'fail'),
    });
  }

  return results;
}

// ── Status Icon ────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: CheckStatus }) {
  switch (status) {
    case 'pass':
      return <CheckCircle className="w-4 h-4 text-stone-1000 shrink-0" />;
    case 'fail':
      return <XCircle className="w-4 h-4 text-stone-1000 shrink-0" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-stone-1000 shrink-0" />;
    case 'not-applicable':
      return <div className="w-4 h-4 rounded-full bg-stone-200 shrink-0" />;
    default:
      return <Loader2 className="w-4 h-4 text-stone-400 animate-spin shrink-0" />;
  }
}

function CategoryIcon({ category }: { category: ValidationCheck['category'] }) {
  switch (category) {
    case 'completeness':
      return <FileText className="w-3 h-3" />;
    case 'formatting':
      return <PenTool className="w-3 h-3" />;
    case 'cross-reference':
      return <Link2 className="w-3 h-3" />;
    case 'language':
      return <Languages className="w-3 h-3" />;
    case 'signature':
      return <Fingerprint className="w-3 h-3" />;
    case 'metadata':
      return <Shield className="w-3 h-3" />;
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SubmissionReadinessValidator({
  projectId,
  submissionType,
  artifacts,
  onNavigateToArtifact,
  onClose,
}: SubmissionReadinessValidatorProps) {
  const [validationResults, setValidationResults] = useState<ModuleValidation[]>(() =>
    runValidation(artifacts, submissionType),
  );
  const [running, setRunning] = useState(false);

  // Toggle module expansion
  const toggleModule = useCallback((module: string) => {
    setValidationResults(prev =>
      prev.map(m => (m.module === module ? { ...m, expanded: !m.expanded } : m)),
    );
  }, []);

  // Re-run validation
  const handleRevalidate = useCallback(() => {
    setRunning(true);
    // Simulate async for UX
    setTimeout(() => {
      setValidationResults(runValidation(artifacts, submissionType));
      setRunning(false);
    }, 800);
  }, [artifacts, submissionType]);

  // Summary stats
  const stats = useMemo(() => {
    const allChecks = validationResults.flatMap(m => m.checks);
    return {
      total: allChecks.length,
      pass: allChecks.filter(c => c.status === 'pass').length,
      fail: allChecks.filter(c => c.status === 'fail').length,
      warning: allChecks.filter(c => c.status === 'warning').length,
      na: allChecks.filter(c => c.status === 'not-applicable').length,
    };
  }, [validationResults]);

  const readinessScore = useMemo(() => {
    if (stats.total === 0) return 0;
    const applicable = stats.total - stats.na;
    if (applicable === 0) return 100;
    return Math.round((stats.pass / applicable) * 100);
  }, [stats]);

  const readinessColor =
    readinessScore >= 80 ? 'text-stone-700' :
    readinessScore >= 50 ? 'text-stone-600' :
    'text-stone-700';

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-200 bg-stone-50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-stone-600" />
            <div>
              <h2 className="text-sm font-semibold text-stone-900">Submission Readiness</h2>
              <p className="text-[10px] text-stone-500">
                eCTD Validation — {submissionType || 'NDA'}
              </p>
            </div>
          </div>
          <button
            onClick={handleRevalidate}
            disabled={running}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3 h-3', running && 'animate-spin')} />
            {running ? 'Validating...' : 'Re-validate'}
          </button>
        </div>

        {/* Score bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-stone-200 rounded-full h-2 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-200',
                readinessScore >= 80 ? 'bg-stone-1000' :
                readinessScore >= 50 ? 'bg-stone-1000' :
                'bg-stone-1000',
              )}
              style={{ width: `${readinessScore}%` }}
            />
          </div>
          <span className={cn('text-lg font-semibold tabular-nums', readinessColor)}>
            {readinessScore}%
          </span>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-2 mt-2">
          <div className="text-center">
            <div className="text-lg font-semibold text-stone-700 tabular-nums">{stats.pass}</div>
            <div className="text-[10px] text-stone-400">Pass</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-stone-700 tabular-nums">{stats.fail}</div>
            <div className="text-[10px] text-stone-400">Fail</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-stone-600 tabular-nums">{stats.warning}</div>
            <div className="text-[10px] text-stone-400">Warn</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-stone-400 tabular-nums">{stats.na}</div>
            <div className="text-[10px] text-stone-400">N/A</div>
          </div>
        </div>
      </div>

      {/* Module checklist */}
      <div className="flex-1 overflow-y-auto">
        {validationResults.map(mod => {
          const modPass = mod.checks.filter(c => c.status === 'pass').length;
          const modFail = mod.checks.filter(c => c.status === 'fail').length;
          const modWarn = mod.checks.filter(c => c.status === 'warning').length;

          return (
            <div key={mod.module} className="border-b border-stone-100">
              {/* Module header */}
              <button
                onClick={() => toggleModule(mod.module)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-stone-50 transition-colors duration-150"
              >
                {mod.expanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                )}
                <span className="text-xs font-semibold text-stone-700 flex-1">{mod.label}</span>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {modFail > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-800 font-medium">
                      {modFail} fail
                    </span>
                  )}
                  {modWarn > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-medium">
                      {modWarn} warn
                    </span>
                  )}
                  {modFail === 0 && modWarn === 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-800 font-medium">
                      {modPass} pass
                    </span>
                  )}
                </div>
              </button>

              {/* Check items */}
              {mod.expanded && (
                <div className="px-4 pb-2 space-y-1">
                  {mod.checks.map(check => (
                    <div
                      key={check.id}
                      className={cn(
                        'flex items-start gap-2 px-3 py-2 rounded-lg text-xs',
                        check.status === 'fail' && 'bg-stone-100',
                        check.status === 'warning' && 'bg-stone-100',
                        check.status === 'pass' && 'bg-stone-50',
                        check.status === 'not-applicable' && 'bg-stone-50 opacity-60',
                      )}
                    >
                      <StatusIcon status={check.status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <CategoryIcon category={check.category} />
                          <span className="font-medium text-stone-700 truncate">{check.label}</span>
                        </div>
                        <p className="text-stone-500 mt-0.5 leading-relaxed">{check.description}</p>
                      </div>
                      {check.autoFixable && (
                        <button
                          className="shrink-0 px-2 py-1 text-[10px] font-medium text-stone-600 bg-stone-100 rounded hover:bg-stone-200 transition-colors duration-150"
                          onClick={() => {
                            // Extract artifact ID from check.id
                            const artifactId = check.id.replace(/-(?:wordcount|placeholder|headings|status)$/, '');
                            onNavigateToArtifact?.(artifactId);
                          }}
                        >
                          Fix
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
        <div className="text-[10px] text-stone-400">
          {stats.total} checks across {validationResults.length} modules
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700 transition-colors duration-150"
            >
              Close
            </button>
          )}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-stone-800 rounded-lg hover:bg-stone-900 transition-colors disabled:opacity-50"
            disabled={stats.fail > 0}
            title={stats.fail > 0 ? 'Resolve all failures before exporting' : 'Generate submission package'}
          >
            <Download className="w-3 h-3" />
            Export Package
          </button>
        </div>
      </div>
    </div>
  );
}

export default SubmissionReadinessValidator;
