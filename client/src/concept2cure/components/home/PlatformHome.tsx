/**
 * Platform Home — Premium Operations Command Center
 *
 * Enterprise-grade landing dashboard with:
 * 1. Portfolio metrics overview (total, active, review, completed)
 * 2. Quick-start actions (new submission, AI copilot, authoring)
 * 3. Project cards with type badges, status indicators, relative times
 * 4. Recent activity feed (conversations + documents)
 * 5. Quick access to platform capabilities
 *
 * Design: Full-width professional dashboard, not a narrow single-column.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Plus,
  Sparkles,
  FileText,
  MessageSquare,
  FolderOpen,
  ArrowRight,
  Star,
  PenLine,
  Search,
  ShieldCheck,
  Clock,
  FolderKanban,
  Briefcase,
  FileSearch,
  CheckCircle2,
  CalendarDays,
  Brain,
  BarChart2,
  BookOpen,
  Bot,
  Compass,
  Activity,
  FlaskConical,
  Scale,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Project {
  id: number;
  name: string;
  type: string;
  description?: string;
  starred?: boolean;
  conversationCount?: number;
  lastUpdated?: string;
  createdAt?: string;
  status?: string;
  submissionType?: string;
  archived?: boolean;
}

export interface PlatformHomeProps {
  userName?: string;
  projects: Project[];
  onProjectClick: (projectId: number) => void;
  onNewProject: () => void;
  onNavigate: (mode: string) => void;
  workspaceSummary?: any;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  IND: { bg: 'bg-purple-100', text: 'text-purple-700' },
  NDA: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  '510K': { bg: 'bg-blue-100', text: 'text-blue-700' },
  '510(K)': { bg: 'bg-blue-100', text: 'text-blue-700' },
  BLA: { bg: 'bg-orange-100', text: 'text-orange-700' },
  PMA: { bg: 'bg-red-100', text: 'text-red-700' },
  CER: { bg: 'bg-pink-100', text: 'text-pink-700' },
  MAA: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
};

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  completed: { bg: 'bg-zinc-100', text: 'text-zinc-600', dot: 'bg-zinc-400' },
  review: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  draft: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTypeBadge(type?: string) {
  if (!type) return { bg: 'bg-zinc-100', text: 'text-zinc-600' };
  const upper = type.toUpperCase().trim();
  return TYPE_BADGE[upper] ?? { bg: 'bg-zinc-100', text: 'text-zinc-600' };
}

function getStatusStyle(status?: string) {
  if (!status) return STATUS_STYLE.draft;
  const lower = status.toLowerCase().trim();
  if (lower.includes('review')) return STATUS_STYLE.review;
  if (lower.includes('complete')) return STATUS_STYLE.completed;
  if (lower.includes('active')) return STATUS_STYLE.active;
  return STATUS_STYLE.draft;
}

// ─── Component ──────────────────────────────────────────────────────────────

const PlatformHome: React.FC<PlatformHomeProps> = ({
  userName,
  projects,
  onProjectClick,
  onNewProject,
  onNavigate,
  workspaceSummary,
}) => {
  const activeProjects = useMemo(() => projects.filter(p => !p.archived), [projects]);
  const greeting = getGreeting();
  const firstName = userName?.split(' ')[0];
  const recentArtifacts = workspaceSummary?.recent?.artifacts?.slice(0, 4) ?? [];
  const recentThreads = workspaceSummary?.recent?.threads?.slice(0, 4) ?? [];
  const hasRecent = recentArtifacts.length > 0 || recentThreads.length > 0;

  const sortedProjects = useMemo(
    () =>
      [...activeProjects].sort((a, b) => {
        const dateA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const dateB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return dateB - dateA;
      }),
    [activeProjects],
  );

  const metrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const total = activeProjects.length;
    const active = activeProjects.filter(p => p.status?.toLowerCase() === 'active').length;
    const inReview = activeProjects.filter(p => p.status?.toLowerCase().includes('review')).length;
    const completed = activeProjects.filter(p => p.status?.toLowerCase() === 'completed').length;
    const thisMonth = activeProjects.filter(p => {
      if (!p.createdAt) return false;
      const d = new Date(p.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;
    return [
      { label: 'Total', value: total, icon: FolderKanban, color: 'text-zinc-700' },
      { label: 'Active', value: active, icon: Briefcase, color: 'text-emerald-600' },
      { label: 'In Review', value: inReview, icon: FileSearch, color: 'text-amber-600' },
      { label: 'Completed', value: completed, icon: CheckCircle2, color: 'text-zinc-500' },
      { label: 'This Month', value: thisMonth, icon: CalendarDays, color: 'text-sky-600' },
    ];
  }, [activeProjects]);

  const quickActions = [
    {
      id: 'new-project',
      label: 'New Submission',
      description: 'Create IND, NDA, 510(k), BLA, PMA, or MAA',
      icon: Plus,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
    },
    {
      id: 'assistant',
      label: 'Ask AnA',
      description: 'Regulatory guidance & precedent analysis',
      icon: Sparkles,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      border: 'border-violet-200',
    },
    {
      id: 'author',
      label: 'Draft Document',
      description: 'CTD sections, clinical reports, narratives',
      icon: PenLine,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
    },
    {
      id: 'document-sherpa',
      label: 'AnA Sherpa',
      description: 'AI-guided step-by-step authoring',
      icon: Compass,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
    },
  ];

  const capabilities = [
    {
      id: 'intelligence-hub',
      label: 'Regulatory Intelligence',
      description: 'AI-powered regulatory insights & evidence',
      icon: Brain,
      color: 'text-blue-600',
    },
    {
      id: 'review-readiness',
      label: 'Review & Compliance',
      description: 'Quality checks, readiness assessments',
      icon: ShieldCheck,
      color: 'text-emerald-600',
    },
    {
      id: 'biostatistics',
      label: 'Biostatistics',
      description: 'Power analysis, endpoints, study design',
      icon: FlaskConical,
      color: 'text-teal-600',
    },
    {
      id: 'command-center',
      label: 'Operations Center',
      description: 'Submissions, governance, pipeline',
      icon: BarChart2,
      color: 'text-zinc-600',
    },
    {
      id: 'collaboration-hub',
      label: 'Collaboration',
      description: 'Team workspace, threads, decisions',
      icon: MessageSquare,
      color: 'text-amber-600',
    },
    {
      id: 'knowledge-base',
      label: 'Knowledge Base',
      description: 'Documents, SOPs, guidance library',
      icon: BookOpen,
      color: 'text-violet-600',
    },
    {
      id: 'agent-hub',
      label: 'AI Agents',
      description: 'Autonomous regulatory AI workforce',
      icon: Bot,
      color: 'text-pink-600',
    },
    {
      id: 'review-pulse',
      label: 'Review Pulse',
      description: 'PM signals, risk tracking, readiness',
      icon: Activity,
      color: 'text-red-500',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto zen-scroll bg-zinc-50/30">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ── Welcome Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">{formatDate()}</p>
          </div>
          <button
            onClick={onNewProject}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-5 py-2.5',
              'bg-zinc-900 text-white text-sm font-medium',
              'hover:bg-zinc-800 active:bg-zinc-950',
              'transition-colors shadow-sm',
            )}
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        </div>

        {/* ── Portfolio Metrics ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {metrics.map(m => (
            <div
              key={m.label}
              className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 flex flex-col gap-1"
            >
              <div className="flex items-center gap-2">
                <m.icon className={cn('h-4 w-4', m.color)} />
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  {m.label}
                </span>
              </div>
              <span className={cn('text-2xl font-semibold', m.color)}>{m.value}</span>
            </div>
          ))}
        </div>

        {/* ── Quick Actions ── */}
        <div>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {quickActions.map(action => (
              <button
                key={action.id}
                onClick={() =>
                  action.id === 'new-project' ? onNewProject() : onNavigate(action.id)
                }
                className={cn(
                  'group flex flex-col p-4 rounded-xl bg-white border border-zinc-200',
                  'hover:shadow-md transition-all text-left',
                  `hover:${action.border}`,
                )}
              >
                <div
                  className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center mb-3',
                    action.bg,
                  )}
                >
                  <action.icon className={cn('w-5 h-5', action.color)} />
                </div>
                <div className="text-sm font-semibold text-zinc-900 group-hover:text-blue-900">
                  {action.label}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">{action.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Recent Activity ── */}
        {hasRecent && (
          <div>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Recent Activity
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {recentThreads.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => onNavigate('ai-copilot')}
                  className="w-full group flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-zinc-200 hover:border-violet-200 hover:shadow-md transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-4 h-4 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-zinc-900 truncate block">
                      {t.title}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {t.updatedAt
                        ? formatRelativeTime(t.updatedAt)
                        : 'Conversation'}
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ))}
              {recentArtifacts.map((a: any) => (
                <button
                  key={a.id}
                  onClick={() => onNavigate('author')}
                  className="w-full group flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-zinc-200 hover:border-blue-200 hover:shadow-md transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-zinc-900 truncate block">
                      {a.title || a.type}
                    </span>
                    <span className="text-xs text-zinc-400">{a.status || 'Document'}</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Projects Grid ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-800">Projects</h2>
            {sortedProjects.length > 0 && (
              <span className="text-xs text-zinc-400">
                {sortedProjects.length} project{sortedProjects.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {sortedProjects.length === 0 ? (
            <div
              className={cn(
                'rounded-2xl border border-dashed border-zinc-300 bg-zinc-50',
                'flex flex-col items-center justify-center py-16 text-center',
              )}
            >
              <FolderKanban className="h-10 w-10 text-zinc-300 mb-3" />
              <p className="text-sm font-medium text-zinc-500">No projects yet</p>
              <p className="text-xs text-zinc-400 mt-1">
                Create your first regulatory submission to get started.
              </p>
              <button
                onClick={onNewProject}
                className={cn(
                  'mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2',
                  'bg-zinc-900 text-white text-sm font-medium',
                  'hover:bg-zinc-800 transition-colors',
                )}
              >
                <Plus className="h-4 w-4" />
                New Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sortedProjects.map(project => {
                const typeColor = getTypeBadge(project.type);
                const statusColor = getStatusStyle(project.status);

                return (
                  <button
                    key={project.id}
                    onClick={() => onProjectClick(project.id)}
                    className={cn(
                      'rounded-2xl border border-zinc-200 bg-white p-5 text-left',
                      'hover:shadow-md hover:border-zinc-300',
                      'transition-all duration-200 ease-out',
                      'focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2',
                      'group',
                    )}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {project.type && (
                          <span
                            className={cn(
                              'inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-semibold',
                              typeColor.bg,
                              typeColor.text,
                            )}
                          >
                            {project.type.toUpperCase()}
                          </span>
                        )}
                        {project.starred && (
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        )}
                      </div>
                      <ArrowRight
                        className={cn(
                          'h-4 w-4 text-zinc-300 group-hover:text-zinc-500',
                          'transition-colors',
                        )}
                      />
                    </div>

                    <h3 className="text-sm font-semibold text-zinc-900 leading-snug line-clamp-2 mb-1.5">
                      {project.name}
                    </h3>

                    {project.description && (
                      <p className="text-xs text-zinc-500 line-clamp-1 mb-2">
                        {project.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                      {project.status && (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                            statusColor.bg,
                            statusColor.text,
                          )}
                        >
                          <span
                            className={cn('h-1.5 w-1.5 rounded-full', statusColor.dot)}
                          />
                          {project.status}
                        </span>
                      )}
                      {project.submissionType && (
                        <span className="text-xs text-zinc-400">
                          {project.submissionType}
                        </span>
                      )}
                    </div>

                    {project.lastUpdated && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400">
                        <Clock className="h-3 w-3" />
                        <span>Updated {formatRelativeTime(project.lastUpdated)}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Platform Capabilities ── */}
        <div>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Platform Capabilities
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {capabilities.map(cap => (
              <button
                key={cap.id}
                onClick={() => onNavigate(cap.id)}
                className={cn(
                  'rounded-xl border border-zinc-200 bg-white px-4 py-3.5',
                  'hover:shadow-md hover:border-zinc-300',
                  'transition-all duration-200 ease-out text-left',
                  'group',
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0',
                      'group-hover:bg-zinc-200 transition-colors',
                    )}
                  >
                    <cap.icon className={cn('h-4 w-4', cap.color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-800 leading-tight">
                      {cap.label}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5 leading-tight">
                      {cap.description}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatformHome;
