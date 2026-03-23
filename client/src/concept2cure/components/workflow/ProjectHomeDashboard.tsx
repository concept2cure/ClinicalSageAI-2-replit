/**
 * @fileoverview Project Home Dashboard — workflow-based command center
 *
 * Replaces the abstract/empty project homepage with a task-based workspace
 * that immediately answers:
 *   - Where am I in the dossier?
 *   - What needs drafting next?
 *   - What is blocked?
 *   - What is ready for review or submission?
 *
 * Required sections:
 *   - Project header (product, submission type, region, status)
 *   - Primary actions: Continue Drafting, Open Dossier, Check Readiness
 *   - Next required sections
 *   - Recently edited documents
 *   - Open review items
 *   - Readiness blockers
 */

import React from 'react';
import { cn } from '@/lib/utils';
import {
  PenLine,
  LayoutGrid,
  ShieldCheck,
  Send,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ChevronRight,
  Globe,
  Building2,
  CircleDot,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectHomeProject {
  id: number | string;
  name: string;
  type: string;
  description?: string;
  sponsor?: string;
  product?: string;
  region?: string;
  status?: string;
}

export interface DossierSectionSummary {
  code: string;
  title: string;
  status: 'not-started' | 'drafting' | 'in-review' | 'approved' | 'blocked' | 'locked';
  updatedAt?: string;
  assignee?: string;
}

export interface ReviewItem {
  id: string;
  sectionCode: string;
  sectionTitle: string;
  reviewerName: string;
  status: 'pending' | 'in-progress' | 'changes-requested';
  requestedAt?: string;
}

export interface ReadinessBlocker {
  id: string;
  sectionCode?: string;
  type: 'missing-content' | 'contradiction' | 'missing-evidence' | 'missing-approval' | 'upstream-change';
  description: string;
  severity: 'critical' | 'warning';
}

export interface ProjectHomeDashboardProps {
  project: ProjectHomeProject;
  sections?: DossierSectionSummary[];
  recentDocuments?: DossierSectionSummary[];
  reviewItems?: ReviewItem[];
  blockers?: ReadinessBlocker[];
  onNavigate: (mode: string, sectionCode?: string) => void;
  onContinueDrafting?: () => void;
  onOpenDossier?: () => void;
  onCheckReadiness?: () => void;
}

// ─── Status helpers ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  'not-started': { label: 'Not Started', color: 'text-zinc-400', bg: 'bg-zinc-100', icon: <CircleDot className="w-3 h-3" /> },
  'drafting': { label: 'Drafting', color: 'text-blue-600', bg: 'bg-blue-50', icon: <PenLine className="w-3 h-3" /> },
  'in-review': { label: 'In Review', color: 'text-amber-600', bg: 'bg-amber-50', icon: <Clock className="w-3 h-3" /> },
  'approved': { label: 'Approved', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: <CheckCircle2 className="w-3 h-3" /> },
  'blocked': { label: 'Blocked', color: 'text-red-600', bg: 'bg-red-50', icon: <AlertTriangle className="w-3 h-3" /> },
  'locked': { label: 'Locked', color: 'text-violet-600', bg: 'bg-violet-50', icon: <ShieldCheck className="w-3 h-3" /> },
};

function getStatusBadge(status: string) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['not-started'];
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', cfg.bg, cfg.color)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

const TYPE_LABELS: Record<string, string> = {
  IND: 'Investigational New Drug',
  NDA: 'New Drug Application',
  BLA: 'Biologics License Application',
  '510K': '510(k) Premarket Notification',
  PMA: 'Premarket Approval',
  MAA: 'Marketing Authorisation Application',
  DE_NOVO: 'De Novo Classification',
};

// ─── Default mock data for demonstration ────────────────────────────────────

const DEFAULT_SECTIONS: DossierSectionSummary[] = [
  { code: '2.5', title: 'Clinical Overview', status: 'drafting', updatedAt: '2026-03-22' },
  { code: '2.7.1', title: 'Summary of Biopharmaceutic Studies', status: 'not-started' },
  { code: '2.7.2', title: 'Summary of Clinical Pharmacology', status: 'not-started' },
  { code: '2.7.3', title: 'Summary of Clinical Efficacy', status: 'drafting', updatedAt: '2026-03-21' },
  { code: '2.7.4', title: 'Summary of Clinical Safety', status: 'not-started' },
  { code: '3.2.P', title: 'Drug Product', status: 'in-review', updatedAt: '2026-03-20' },
  { code: '1.2', title: 'Cover Letter', status: 'approved', updatedAt: '2026-03-19' },
  { code: '1.3.1', title: 'Form FDA 1571', status: 'approved', updatedAt: '2026-03-18' },
];

const DEFAULT_BLOCKERS: ReadinessBlocker[] = [
  { id: 'b1', sectionCode: '2.5', type: 'missing-evidence', description: 'Clinical Overview missing primary endpoint results citation', severity: 'critical' },
  { id: 'b2', sectionCode: '2.7.4', type: 'missing-content', description: 'Safety summary section not started — required for submission', severity: 'critical' },
  { id: 'b3', sectionCode: '3.2.P', type: 'missing-approval', description: 'Drug Product section awaiting QA sign-off', severity: 'warning' },
];

// ─── Component ──────────────────────────────────────────────────────────────

export const ProjectHomeDashboard: React.FC<ProjectHomeDashboardProps> = ({
  project,
  sections = DEFAULT_SECTIONS,
  recentDocuments,
  reviewItems = [],
  blockers = DEFAULT_BLOCKERS,
  onNavigate,
  onContinueDrafting,
  onOpenDossier,
  onCheckReadiness,
}) => {
  const nextRequired = sections.filter(s => s.status === 'not-started' || s.status === 'drafting').slice(0, 4);
  const recent = recentDocuments || sections.filter(s => s.updatedAt).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 4);
  const openReviews = reviewItems.length > 0 ? reviewItems : sections.filter(s => s.status === 'in-review').map(s => ({
    id: s.code,
    sectionCode: s.code,
    sectionTitle: s.title,
    reviewerName: s.assignee || 'Pending',
    status: 'pending' as const,
    requestedAt: s.updatedAt,
  }));

  const stats = {
    total: sections.length,
    approved: sections.filter(s => s.status === 'approved' || s.status === 'locked').length,
    drafting: sections.filter(s => s.status === 'drafting').length,
    inReview: sections.filter(s => s.status === 'in-review').length,
    blocked: sections.filter(s => s.status === 'blocked').length,
    notStarted: sections.filter(s => s.status === 'not-started').length,
  };
  const completionPct = stats.total > 0 ? Math.round(((stats.approved) / stats.total) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto zen-scroll bg-zinc-50/30">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── Project Header ─────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold">
                  {project.type}
                </span>
                {project.region && (
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                    <Globe className="w-3 h-3" />
                    {project.region}
                  </span>
                )}
                {project.status && (
                  <span className="text-xs text-zinc-400">{project.status}</span>
                )}
              </div>
              <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
                {project.name}
              </h1>
              {project.description && (
                <p className="text-sm text-zinc-500 mt-1">{project.description}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
                {project.sponsor && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    {project.sponsor}
                  </span>
                )}
                <span>{TYPE_LABELS[project.type] || project.type}</span>
              </div>
            </div>
          </div>

          {/* Completion progress */}
          <div className="mt-5 bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-zinc-700">Dossier Progress</span>
              <span className="text-sm font-semibold text-zinc-900">{completionPct}%</span>
            </div>
            <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
              <span>{stats.approved} approved</span>
              <span>{stats.drafting} drafting</span>
              <span>{stats.inReview} in review</span>
              {stats.blocked > 0 && <span className="text-red-600">{stats.blocked} blocked</span>}
              <span>{stats.notStarted} not started</span>
            </div>
          </div>
        </div>

        {/* ── Primary Actions ────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <button
            onClick={() => onContinueDrafting ? onContinueDrafting() : onNavigate('documents')}
            className="group flex items-center gap-3 p-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-500/30 flex items-center justify-center flex-shrink-0">
              <PenLine className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Continue Drafting</div>
              <div className="text-xs text-blue-200">{stats.drafting} section{stats.drafting !== 1 ? 's' : ''} in progress</div>
            </div>
            <ArrowRight className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity" />
          </button>

          <button
            onClick={() => onOpenDossier ? onOpenDossier() : onNavigate('dossier')}
            className="group flex items-center gap-3 p-4 rounded-xl bg-white border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center flex-shrink-0">
              <LayoutGrid className="w-5 h-5 text-zinc-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-900">Open Dossier</div>
              <div className="text-xs text-zinc-400">View full eCTD map</div>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
          </button>

          <button
            onClick={() => onCheckReadiness ? onCheckReadiness() : onNavigate('submissions')}
            className="group flex items-center gap-3 p-4 rounded-xl bg-white border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <Send className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-900">Check Readiness</div>
              <div className="text-xs text-zinc-400">{blockers.length} blocker{blockers.length !== 1 ? 's' : ''} remaining</div>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
          </button>
        </div>

        {/* ── Two-column layout: Next Required + Blockers ─────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

          {/* Next Required Sections */}
          <div>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Next Required Sections
            </h2>
            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
              {nextRequired.length > 0 ? (
                <div className="divide-y divide-zinc-100">
                  {nextRequired.map(section => (
                    <button
                      key={section.code}
                      onClick={() => onNavigate('section-workspace', section.code)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors text-left"
                    >
                      <span className="text-xs font-mono text-zinc-400 w-10 flex-shrink-0">{section.code}</span>
                      <span className="text-sm text-zinc-800 flex-1 truncate">{section.title}</span>
                      {getStatusBadge(section.status)}
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-300" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-zinc-400">All sections complete</div>
              )}
            </div>
          </div>

          {/* Readiness Blockers */}
          <div>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Readiness Blockers
            </h2>
            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
              {blockers.length > 0 ? (
                <div className="divide-y divide-zinc-100">
                  {blockers.map(blocker => (
                    <div key={blocker.id} className="flex items-start gap-3 px-4 py-3">
                      <AlertTriangle className={cn(
                        'w-4 h-4 flex-shrink-0 mt-0.5',
                        blocker.severity === 'critical' ? 'text-red-500' : 'text-amber-500'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-800">{blocker.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {blocker.sectionCode && (
                            <span className="text-[10px] font-mono text-zinc-400">{blocker.sectionCode}</span>
                          )}
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                            blocker.severity === 'critical' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                          )}>
                            {blocker.severity}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                  <p className="text-sm text-zinc-500">No blockers</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Two-column: Recent Documents + Open Reviews ─────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

          {/* Recently Edited Documents */}
          <div>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Recently Edited
            </h2>
            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
              {recent.length > 0 ? (
                <div className="divide-y divide-zinc-100">
                  {recent.map(doc => (
                    <button
                      key={doc.code}
                      onClick={() => onNavigate('section-workspace', doc.code)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors text-left"
                    >
                      <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-zinc-800 truncate block">{doc.title}</span>
                        <span className="text-[10px] text-zinc-400">{doc.code} {doc.updatedAt ? `· ${doc.updatedAt}` : ''}</span>
                      </div>
                      {getStatusBadge(doc.status)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-zinc-400">No recent documents</div>
              )}
            </div>
          </div>

          {/* Open Review Items */}
          <div>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Open Reviews
            </h2>
            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
              {openReviews.length > 0 ? (
                <div className="divide-y divide-zinc-100">
                  {openReviews.map(review => (
                    <button
                      key={review.id}
                      onClick={() => onNavigate('review', review.sectionCode)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors text-left"
                    >
                      <ShieldCheck className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-zinc-800 truncate block">{review.sectionTitle}</span>
                        <span className="text-[10px] text-zinc-400">{review.sectionCode} · {review.reviewerName}</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">
                        {review.status === 'changes-requested' ? 'Changes Req.' : 'Pending'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-zinc-400">No pending reviews</div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ProjectHomeDashboard;
