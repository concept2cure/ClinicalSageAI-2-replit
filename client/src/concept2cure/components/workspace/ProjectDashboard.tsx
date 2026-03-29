/**
 * ProjectDashboard — The primary landing view when a user opens a project.
 *
 * Surfaces document pipeline health, recent activity, quick actions,
 * and CTD section coverage. All data is derived from the `artifacts` prop;
 * no additional API calls are required.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  FileText,
  FilePlus,
  FolderOpen,
  Brain,
  PenLine,
  History,
  PackageCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Lock,
  ChevronRight,
  BarChart3,
  Activity,
  Layers,
  Package,
  BookOpen,
  Shield,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { ActivityFeed, generateActivityFromArtifacts } from './ActivityFeed';
import { ProjectTaskBoard } from './ProjectTaskBoard';

// ── Types ────────────────────────────────────────────────────────────────────

interface Artifact {
  id: string;
  title: string;
  status?: string;
  ctdSection?: string;
  type?: string;
  updatedAt?: string;
  version?: number;
}

interface ProjectDashboardProps {
  projectId: string;
  projectName: string;
  projectType?: string;
  submissionType?: string;
  artifacts: Artifact[];
  onOpenDocument: (docId: string) => void;
  onCreateDocument: () => void;
  onOpenEditor: () => void;
  onOpenDossier: () => void;
  onOpenIntelligence?: () => void;
  onOpenSubmissions?: () => void;
  onOpenTemplates?: () => void;
  onOpenTaskBoard?: () => void;
  onOpenCSRWorkflow?: () => void;
  onOpenINDChecklist?: () => void;
}

// ── Status helpers (canonical lifecycle) ─────────────────────────────────────

import { LIFECYCLE, toLifecycleStage, type ArtifactLifecycleStage } from '../ui/enterprise';

/** Dashboard pipeline statuses — simplified view of canonical lifecycle */
type PipelineStatus = 'draft' | 'review' | 'approved' | 'locked';

function normalizeStatus(raw?: string): PipelineStatus {
  if (!raw) return 'draft';
  const stage = toLifecycleStage(raw);
  if (stage === 'not_started' || stage === 'draft') return 'draft';
  if (stage === 'in_review') return 'review';
  if (stage === 'approved') return 'approved';
  return 'locked'; // published, superseded, archived
}

const STATUS_CONFIG: Record<PipelineStatus, { label: string; color: string; bg: string; dot: string; border: string }> = {
  draft:    { label: LIFECYCLE.draft.label,     color: LIFECYCLE.draft.text,     bg: LIFECYCLE.draft.bg,     dot: LIFECYCLE.draft.dot,     border: LIFECYCLE.draft.border },
  review:   { label: LIFECYCLE.in_review.label,  color: LIFECYCLE.in_review.text,  bg: LIFECYCLE.in_review.bg,  dot: LIFECYCLE.in_review.dot,  border: LIFECYCLE.in_review.border },
  approved: { label: LIFECYCLE.approved.label,   color: LIFECYCLE.approved.text,   bg: LIFECYCLE.approved.bg,   dot: LIFECYCLE.approved.dot,   border: LIFECYCLE.approved.border },
  locked:   { label: LIFECYCLE.published.label,  color: LIFECYCLE.published.text,  bg: LIFECYCLE.published.bg,  dot: LIFECYCLE.published.dot,  border: LIFECYCLE.published.border },
};

// ── CTD Module metadata ──────────────────────────────────────────────────────

const CTD_MODULES: { key: string; label: string; description: string }[] = [
  { key: '1', label: 'Module 1', description: 'Administrative Information' },
  { key: '2', label: 'Module 2', description: 'Common Technical Document Summaries' },
  { key: '3', label: 'Module 3', description: 'Quality' },
  { key: '4', label: 'Module 4', description: 'Nonclinical Study Reports' },
  { key: '5', label: 'Module 5', description: 'Clinical Study Reports' },
];

// ── Relative time ────────────────────────────────────────────────────────────

function relativeTime(dateStr?: string): string {
  if (!dateStr) return '--';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '--';
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  return `${diffMo}mo ago`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProjectDashboard({
  projectId,
  projectName,
  projectType,
  submissionType,
  artifacts,
  onOpenDocument,
  onCreateDocument,
  onOpenEditor,
  onOpenDossier,
  onOpenIntelligence,
  onOpenSubmissions,
  onOpenTemplates,
  onOpenTaskBoard,
  onOpenCSRWorkflow,
  onOpenINDChecklist,
}: ProjectDashboardProps) {

  // ── Derived data ───────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const counts: Record<PipelineStatus, number> = { draft: 0, review: 0, approved: 0, locked: 0 };
    artifacts.forEach((a) => {
      counts[normalizeStatus(a.status)]++;
    });

    const total = artifacts.length;
    const ready = counts.approved + counts.locked;
    const completionPct = total > 0 ? Math.round((ready / total) * 100) : 0;

    // Last activity
    let lastActivity: string | undefined;
    artifacts.forEach((a) => {
      if (a.updatedAt && (!lastActivity || a.updatedAt > lastActivity)) {
        lastActivity = a.updatedAt;
      }
    });

    // Recent documents sorted by updatedAt desc
    const recent = [...artifacts]
      .sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 8);

    // CTD module coverage
    const ctdMap: Record<string, Artifact[]> = {};
    artifacts.forEach((a) => {
      if (a.ctdSection) {
        const moduleKey = a.ctdSection.charAt(0);
        if (!ctdMap[moduleKey]) ctdMap[moduleKey] = [];
        ctdMap[moduleKey].push(a);
      }
    });

    // Activity feed from artifacts
    const activityItems = generateActivityFromArtifacts(artifacts as Array<{
      id: string; title: string; status?: string; updatedAt?: string; createdAt?: string; version?: number;
    }>);

    // Compliance risk metrics (computed from artifact data)
    const withCtd = artifacts.filter(a => a.ctdSection).length;
    const ctdCoverage = total > 0 ? Math.round((withCtd / total) * 100) : 0;
    const reviewCycle = counts.review > 0 ? Math.round((counts.review / total) * 100) : 0;
    const approvalRate = total > 0 ? Math.round(((counts.approved + counts.locked) / total) * 100) : 0;
    // Risk score: higher = more risk. Based on % drafts + % missing CTD sections
    const riskScore = total > 0
      ? Math.max(0, Math.min(100, Math.round(
          (counts.draft / total) * 40 +
          ((total - withCtd) / total) * 30 +
          (counts.review > 0 ? 15 : 0) +
          (total < 3 ? 15 : 0)
        )))
      : 0;
    const riskLevel = riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low';

    return { counts, total, ready, completionPct, lastActivity, recent, ctdMap, activityItems, ctdCoverage, reviewCycle, approvalRate, riskScore, riskLevel };
  }, [artifacts]);

  // ── Pipeline metric card ───────────────────────────────────────────────────

  function PipelineCard({ status, count }: { status: PipelineStatus; count: number }) {
    const cfg = STATUS_CONFIG[status];
    return (
      <div className={cn(
        'flex flex-col items-center justify-center rounded-xl border px-4 py-5 transition-shadow hover:shadow-sm',
        cfg.bg, cfg.border,
      )}>
        <span className={cn('text-base font-semibold tabular-nums', cfg.color)}>{count}</span>
        <span className={cn('mt-1 text-xs font-medium', cfg.color)}>{cfg.label}</span>
      </div>
    );
  }

  // ── Quick action card ──────────────────────────────────────────────────────

  function ActionCard({
    icon: Icon,
    title,
    subtitle,
    onClick,
  }: {
    icon: React.ElementType;
    title: string;
    subtitle: string;
    onClick?: () => void;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex flex-col items-start gap-1.5 rounded-xl border border-stone-200 bg-white p-4',
          'text-left transition-all hover:border-stone-300 hover:shadow-sm hover:bg-stone-50/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40',
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
          <Icon className="h-4.5 w-4.5" size={18} />
        </div>
        <span className="text-sm font-semibold text-stone-900">{title}</span>
        <span className="text-xs text-stone-500 leading-snug">{subtitle}</span>
      </button>
    );
  }

  // ── Project-type-specific guidance ─────────────────────────────────────────

  const typeGuidance = useMemo(() => {
    const t = (projectType || submissionType || 'IND').toUpperCase();
    const guides: Record<string, { steps: string[]; focusModules: string[] }> = {
      IND: {
        steps: ['Upload source CSR and preclinical data', 'Draft Module 2 summaries (Clinical Overview, Nonclinical Overview)', 'Complete Module 3 CMC documentation', 'Build Module 5 clinical study reports', 'Run compliance check and submit for review'],
        focusModules: ['2', '3', '5'],
      },
      NDA: {
        steps: ['Compile all Phase I-III clinical data', 'Draft Integrated Summary of Safety (ISS)', 'Draft Integrated Summary of Efficacy (ISE)', 'Complete prescribing information and labeling', 'Assemble full eCTD package for submission'],
        focusModules: ['1', '2', '5'],
      },
      '510K': {
        steps: ['Define predicate device and substantial equivalence', 'Draft device description and indications for use', 'Complete performance testing and biocompatibility data', 'Prepare eSTAR submission format', 'Run FDA readiness check'],
        focusModules: ['1', '2', '3'],
      },
      BLA: {
        steps: ['Compile biologics manufacturing data (Module 3)', 'Draft Clinical Overview and Summary (Module 2)', 'Complete nonclinical pharmacology/toxicology studies', 'Assemble Module 5 clinical study reports', 'Prepare regional administrative documents'],
        focusModules: ['2', '3', '5'],
      },
      PMA: {
        steps: ['Define device classification and intended use', 'Compile clinical study data and analysis', 'Draft manufacturing and design controls documentation', 'Prepare risk analysis and biocompatibility reports', 'Assemble PMA submission package'],
        focusModules: ['1', '3', '5'],
      },
      MAA: {
        steps: ['Prepare IMPD (Investigational Medicinal Product Dossier)', 'Draft Module 2 EU-specific summaries', 'Complete Module 3 quality documentation', 'Compile clinical and nonclinical study reports', 'Run EMA compliance validation'],
        focusModules: ['2', '3', '5'],
      },
    };
    return guides[t] || guides['IND'];
  }, [projectType, submissionType]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const barTotal = stats.total || 1; // avoid div-by-zero

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="mx-auto w-full max-w-6xl space-y-8 px-2 py-6 sm:px-6 lg:px-8">

      {/* ── 1. Hero Header ──────────────────────────────────────────────────── */}
      <section className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-base font-semibold tracking-tight text-stone-900">{projectName}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {projectType && (
                <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-stone-300">
                  {projectType}
                </span>
              )}
              {submissionType && (
                <span className="inline-flex items-center rounded-md bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600 ring-1 ring-inset ring-stone-200">
                  {submissionType}
                </span>
              )}
            </div>
          </div>

          {/* Primary actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCreateDocument}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white',
                'shadow-sm transition-colors hover:bg-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40',
              )}
            >
              <FilePlus size={16} />
              New Document
            </button>
            <button
              type="button"
              onClick={onOpenDossier}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700',
                'shadow-sm transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40',
              )}
            >
              <FolderOpen size={16} />
              Open Dossier
            </button>
            {onOpenIntelligence && (
              <button
                type="button"
                onClick={onOpenIntelligence}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700',
                  'shadow-sm transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40',
                )}
              >
                <Brain size={16} />
                AI Intelligence
              </button>
            )}
          </div>
        </div>

        {/* Stat chips */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
            <FileText size={13} />
            {stats.total} document{stats.total !== 1 ? 's' : ''}
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
            <BarChart3 size={13} />
            {stats.completionPct}% ready
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
            <Activity size={13} />
            Last activity: {relativeTime(stats.lastActivity)}
          </div>
        </div>
      </section>

      {/* ── 2. Document Pipeline ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-stone-500">
          Document Pipeline
        </h2>

        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <PipelineCard status="draft" count={stats.counts.draft} />
          <PipelineCard status="review" count={stats.counts.review} />
          <PipelineCard status="approved" count={stats.counts.approved} />
          <PipelineCard status="locked" count={stats.counts.locked} />
        </div>

        {/* Stacked progress bar */}
        <div className="mt-5">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-stone-100">
            {stats.counts.locked > 0 && (
              <div
                className="bg-emerald-600 transition-all duration-150"
                style={{ width: `${(stats.counts.locked / barTotal) * 100}%` }}
                title={`${stats.counts.locked} Published`}
              />
            )}
            {stats.counts.approved > 0 && (
              <div
                className="bg-green-500 transition-all duration-150"
                style={{ width: `${(stats.counts.approved / barTotal) * 100}%` }}
                title={`${stats.counts.approved} Approved`}
              />
            )}
            {stats.counts.review > 0 && (
              <div
                className="bg-stone-600 transition-all duration-150"
                style={{ width: `${(stats.counts.review / barTotal) * 100}%` }}
                title={`${stats.counts.review} In Review`}
              />
            )}
            {stats.counts.draft > 0 && (
              <div
                className="bg-amber-400 transition-all duration-150"
                style={{ width: `${(stats.counts.draft / barTotal) * 100}%` }}
                title={`${stats.counts.draft} Draft`}
              />
            )}
          </div>
          <p className="mt-2 text-xs text-stone-500">
            {stats.ready} of {stats.total} document{stats.total !== 1 ? 's' : ''} ready for submission
          </p>
        </div>
      </section>

      {/* ── 2B. Compliance & Readiness ──────────────────────────────────────── */}
      {stats.total > 0 && (
        <section className="grid gap-4 sm:grid-cols-4">
          {/* Risk Score */}
          <div className={cn(
            'flex flex-col items-center justify-center rounded-xl border p-5 transition-shadow hover:shadow-sm',
            stats.riskLevel === 'high' ? 'bg-red-50 border-red-200' :
            stats.riskLevel === 'medium' ? 'bg-amber-50 border-amber-200' :
            'bg-emerald-50 border-emerald-200',
          )}>
            <Shield size={18} className={cn(
              stats.riskLevel === 'high' ? 'text-red-500' :
              stats.riskLevel === 'medium' ? 'text-amber-500' :
              'text-emerald-500',
            )} />
            <span className={cn(
              'text-base font-semibold tabular-nums mt-1',
              stats.riskLevel === 'high' ? 'text-red-700' :
              stats.riskLevel === 'medium' ? 'text-amber-700' :
              'text-emerald-700',
            )}>
              {100 - stats.riskScore}
            </span>
            <span className={cn(
              'text-xs font-medium mt-0.5',
              stats.riskLevel === 'high' ? 'text-red-600' :
              stats.riskLevel === 'medium' ? 'text-amber-600' :
              'text-emerald-600',
            )}>
              Readiness Score
            </span>
          </div>

          {/* CTD Coverage */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-stone-200 bg-white p-5 hover:shadow-sm transition-shadow">
            <Layers size={18} className="text-blue-500" />
            <span className="text-base font-semibold tabular-nums text-stone-900 mt-1">{stats.ctdCoverage}%</span>
            <span className="text-xs font-medium text-stone-500 mt-0.5">CTD Coverage</span>
          </div>

          {/* Approval Rate */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-stone-200 bg-white p-5 hover:shadow-sm transition-shadow">
            <TrendingUp size={18} className="text-green-500" />
            <span className="text-base font-semibold tabular-nums text-stone-900 mt-1">{stats.approvalRate}%</span>
            <span className="text-xs font-medium text-stone-500 mt-0.5">Approval Rate</span>
          </div>

          {/* In Review */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-stone-200 bg-white p-5 hover:shadow-sm transition-shadow">
            <AlertTriangle size={18} className={stats.reviewCycle > 30 ? 'text-amber-500' : 'text-blue-500'} />
            <span className="text-base font-semibold tabular-nums text-stone-900 mt-1">{stats.counts.review}</span>
            <span className="text-xs font-medium text-stone-500 mt-0.5">Awaiting Review</span>
          </div>
        </section>
      )}

      {/* ── 3. Recent Activity + Quick Actions ──────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-5">

        {/* Left — Recent Documents (3 cols) */}
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-3">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500">
            Recent Documents
          </h2>

          {stats.recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="mb-3 h-10 w-10 text-stone-300" />
              <p className="text-sm text-stone-500">No documents yet</p>
              <button
                type="button"
                onClick={onCreateDocument}
                className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Create your first document
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {stats.recent.map((artifact) => {
                const pStatus = normalizeStatus(artifact.status);
                const cfg = STATUS_CONFIG[pStatus];
                return (
                  <li key={artifact.id}>
                    <button
                      type="button"
                      onClick={() => onOpenDocument(artifact.id)}
                      className={cn(
                        'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left',
                        'transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40',
                      )}
                    >
                      {/* Status dot */}
                      <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', cfg.dot)} />

                      {/* Title & metadata */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-900 group-hover:text-blue-700">
                          {artifact.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          {artifact.ctdSection && (
                            <span className="inline-flex items-center rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">
                              {artifact.ctdSection}
                            </span>
                          )}
                          {artifact.version != null && (
                            <span className="text-[10px] text-stone-400">v{artifact.version}</span>
                          )}
                        </div>
                      </div>

                      {/* Relative time */}
                      <span className="flex-shrink-0 text-xs text-stone-400">
                        {relativeTime(artifact.updatedAt)}
                      </span>

                      <ChevronRight size={14} className="flex-shrink-0 text-stone-300 group-hover:text-stone-500 transition-colors duration-150" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right — Quick Actions (2 cols) */}
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500">
            Quick Actions
          </h2>

          {/* Primary actions — larger, more prominent */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <ActionCard
              icon={FilePlus}
              title="Create Document"
              subtitle="Start a new regulatory document"
              onClick={onCreateDocument}
            />
            <ActionCard
              icon={FolderOpen}
              title="View Dossier"
              subtitle="Browse the CTD dossier tree"
              onClick={onOpenDossier}
            />
          </div>

          {/* Secondary actions — compact list style */}
          <div className="space-y-0.5">
            {[
              { icon: PenLine, label: 'All Documents', onClick: onOpenEditor },
              { icon: Brain, label: 'AI Intelligence', onClick: onOpenIntelligence },
              { icon: Package, label: 'Submissions', onClick: onOpenSubmissions },
              { icon: BookOpen, label: 'Templates', onClick: onOpenTemplates },
              ...(onOpenCSRWorkflow ? [{ icon: Activity, label: 'CSR Authoring (ICH E3)', onClick: onOpenCSRWorkflow }] : []),
              ...(onOpenINDChecklist ? [{ icon: Shield, label: 'IND Checklist (21 CFR 312.23)', onClick: onOpenINDChecklist }] : []),
            ].filter(a => a.onClick).map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left',
                    'text-sm text-stone-700 transition-colors hover:bg-stone-50 hover:text-stone-900',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40',
                  )}
                >
                  <Icon size={15} className="text-stone-400 flex-shrink-0" />
                  <span>{action.label}</span>
                  <ChevronRight size={13} className="ml-auto text-stone-300" />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 3A. Activity Feed ─────────────────────────────────────────────── */}
      {stats.activityItems.length > 0 && (
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500">
            Recent Activity
          </h2>
          <ActivityFeed
            activities={stats.activityItems}
            onOpenDocument={onOpenDocument}
            maxItems={10}
          />
        </section>
      )}

      {/* ── 3A½. Tasks & Milestones ────────────────────────────────────── */}
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
            Tasks & Milestones
          </h2>
          {onOpenTaskBoard && (
            <button
              type="button"
              onClick={onOpenTaskBoard}
              className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-700 transition-colors"
            >
              View All
              <ChevronRight size={12} />
            </button>
          )}
        </div>
        <ProjectTaskBoard
          projectId={projectId}
          projectType={projectType || submissionType}
          compact
        />
      </section>

      {/* ── 3B. Getting Started — type-specific workflow guidance ──────────── */}
      {stats.total < 5 && (
        <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-blue-600">
            {(projectType || submissionType || 'IND').toUpperCase()} Submission Workflow
          </h2>
          <ol className="space-y-2.5">
            {typeGuidance.steps.map((step, i) => {
              const isCompleted = i < Math.floor(stats.total / 2); // approximate progress
              return (
                <li key={i} className="flex items-start gap-3">
                  <span className={cn(
                    'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
                    isCompleted
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-600'
                  )}>
                    {isCompleted ? <CheckCircle2 size={14} /> : i + 1}
                  </span>
                  <span className={cn('text-sm', isCompleted ? 'text-stone-400 line-through' : 'text-stone-700')}>
                    {step}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* ── 4. Document Health Overview — CTD Coverage ──────────────────────── */}
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-stone-500">
          CTD Section Coverage
        </h2>

        <div className="space-y-4">
          {CTD_MODULES.map((mod) => {
            const docs = stats.ctdMap[mod.key] || [];
            const docCount = docs.length;
            const pct = stats.total > 0 ? Math.min(Math.round((docCount / Math.max(stats.total * 0.3, 1)) * 100), 100) : 0;
            const hasContent = docCount > 0;
            const isFocusModule = typeGuidance.focusModules.includes(mod.key);

            return (
              <div key={mod.key} className="flex items-center gap-4">
                {/* Module label */}
                <div className="w-44 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <p className={cn(
                      'text-sm font-medium',
                      hasContent ? 'text-stone-900' : 'text-stone-400',
                    )}>
                      {mod.label}
                    </p>
                    {isFocusModule && (
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        Key
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    'text-xs',
                    hasContent ? 'text-stone-500' : 'text-stone-300',
                  )}>
                    {mod.description}
                  </p>
                </div>

                {/* Count badge */}
                <div className="w-16 flex-shrink-0 text-right">
                  <span className={cn(
                    'inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                    hasContent
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-stone-50 text-stone-300',
                  )}>
                    {docCount}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="flex-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-150',
                        hasContent ? 'bg-stone-600' : 'bg-stone-100',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty state hint */}
        {stats.total === 0 && (
          <p className="mt-4 text-center text-xs text-stone-400">
            Assign CTD sections to documents to see coverage here.
          </p>
        )}
      </section>
    </div>
    </div>
  );
}

export default ProjectDashboard;
