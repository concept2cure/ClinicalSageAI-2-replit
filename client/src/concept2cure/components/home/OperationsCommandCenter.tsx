import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  FolderKanban,
  Plus,
  Clock,
  CheckCircle2,
  FileSearch,
  CalendarDays,
  Brain,
  FileText,
  BarChart2,
  BookOpen,
  ArrowRight,
  Briefcase,
} from 'lucide-react';

interface OperationsCommandCenterProps {
  projects: Array<{
    id: string;
    name: string;
    type?: string;
    status?: string;
    submissionType?: string;
    updatedAt?: string;
    createdAt?: string;
  }>;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  userName?: string;
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  IND: { bg: 'bg-purple-100', text: 'text-purple-700' },
  NDA: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  '510K': { bg: 'bg-blue-100', text: 'text-blue-700' },
  '510(K)': { bg: 'bg-blue-100', text: 'text-blue-700' },
  BLA: { bg: 'bg-orange-100', text: 'text-orange-700' },
  PMA: { bg: 'bg-red-100', text: 'text-red-700' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  completed: { bg: 'bg-zinc-100', text: 'text-zinc-600', dot: 'bg-zinc-400' },
  review: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  draft: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
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

function getTypeColor(type?: string) {
  if (!type) return { bg: 'bg-zinc-100', text: 'text-zinc-600' };
  const upper = type.toUpperCase().trim();
  return TYPE_COLORS[upper] ?? { bg: 'bg-zinc-100', text: 'text-zinc-600' };
}

function getStatusColor(status?: string) {
  if (!status) return STATUS_COLORS.draft;
  const lower = status.toLowerCase().trim();
  if (lower.includes('review')) return STATUS_COLORS.review;
  if (lower.includes('complete')) return STATUS_COLORS.completed;
  if (lower.includes('active')) return STATUS_COLORS.active;
  return STATUS_COLORS.draft;
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function OperationsCommandCenter({
  projects,
  onSelectProject,
  onCreateProject,
  userName,
}: OperationsCommandCenterProps) {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');

  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      }),
    [projects],
  );

  const metrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const total = projects.length;
    const active = projects.filter(
      (p) => p.status?.toLowerCase() === 'active',
    ).length;
    const inReview = projects.filter((p) =>
      p.status?.toLowerCase().includes('review'),
    ).length;
    const completed = projects.filter(
      (p) => p.status?.toLowerCase() === 'completed',
    ).length;
    const thisMonth = projects.filter((p) => {
      if (!p.createdAt) return false;
      const d = new Date(p.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    return [
      { label: 'Total Projects', value: total, icon: FolderKanban, color: 'text-zinc-700' },
      { label: 'Active', value: active, icon: Briefcase, color: 'text-emerald-600' },
      { label: 'In Review', value: inReview, icon: FileSearch, color: 'text-amber-600' },
      { label: 'Completed', value: completed, icon: CheckCircle2, color: 'text-zinc-500' },
      { label: 'This Month', value: thisMonth, icon: CalendarDays, color: 'text-sky-600' },
    ];
  }, [projects]);

  const quickLinks = [
    {
      label: 'Regulatory Intelligence',
      description: 'AI-powered regulatory insights',
      icon: Brain,
    },
    {
      label: 'Document Templates',
      description: 'Pre-built submission templates',
      icon: FileText,
    },
    {
      label: 'Analytics Dashboard',
      description: 'Portfolio metrics and trends',
      icon: BarChart2,
    },
    {
      label: 'Knowledge Base',
      description: 'Guidance documents and SOPs',
      icon: BookOpen,
    },
  ];

  return (
    <div className="min-h-full w-full max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* ── Welcome Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
            {getGreeting()}, {userName || 'there'}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">{formatDate()}</p>
        </div>
        <button
          onClick={onCreateProject}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-5 py-2.5',
            'bg-zinc-900 text-white text-sm font-medium',
            'hover:bg-zinc-800 active:bg-zinc-950',
            'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none',
            'transition-colors duration-150 shadow-sm',
          )}
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {/* ── Portfolio Overview ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className={cn(
              'rounded-xl border border-zinc-200 bg-white px-5 py-4',
              'flex flex-col gap-1',
            )}
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

      {/* ── Projects Grid ── */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">Projects</h2>
        {sortedProjects.length === 0 ? (
          <div
            className={cn(
              'rounded-xl border border-dashed border-zinc-300 bg-zinc-50',
              'flex flex-col items-center justify-center py-16 text-center',
            )}
          >
            <FolderKanban className="h-10 w-10 text-zinc-300 mb-3" />
            <p className="text-sm font-medium text-zinc-500">No projects yet</p>
            <p className="text-xs text-zinc-400 mt-1">
              Create your first project to get started.
            </p>
            <button
              onClick={onCreateProject}
              className={cn(
                'mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2',
                'bg-zinc-900 text-white text-sm font-medium',
                'hover:bg-zinc-800 transition-colors duration-150',
                'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none',
              )}
            >
              <Plus className="h-4 w-4" />
              New Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedProjects.map((project) => {
              const typeColor = getTypeColor(project.type);
              const statusColor = getStatusColor(project.status);

              return (
                <button
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className={cn(
                    'rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-sm',
                    'hover:shadow-md hover:border-zinc-300',
                    'transition-all duration-150',
                    'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none',
                    'group',
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    {project.type ? (
                      <span
                        className={cn(
                          'inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-semibold',
                          typeColor.bg,
                          typeColor.text,
                        )}
                      >
                        {project.type.toUpperCase()}
                      </span>
                    ) : (
                      <span />
                    )}
                    <ArrowRight
                      className={cn(
                        'h-4 w-4 text-zinc-300 group-hover:text-zinc-500',
                        'transition-colors duration-150',
                      )}
                    />
                  </div>

                  <h3 className="text-sm font-semibold text-zinc-900 leading-snug line-clamp-2 mb-2">
                    {project.name}
                  </h3>

                  <div className="flex items-center gap-3 flex-wrap">
                    {project.status && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                          statusColor.bg,
                          statusColor.text,
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', statusColor.dot)} />
                        {project.status}
                      </span>
                    )}
                    {project.submissionType && (
                      <span className="text-xs text-zinc-400">{project.submissionType}</span>
                    )}
                  </div>

                  {project.updatedAt && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400">
                      <Clock className="h-3 w-3" />
                      <span>Updated {formatRelativeTime(project.updatedAt)}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick Access Bar ── */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickLinks.map((link) => (
            <div
              key={link.label}
              className={cn(
                'rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm',
                'hover:shadow-md hover:border-zinc-300',
                'transition-all duration-150 cursor-pointer',
                'group',
              )}
            >
              <div
                className={cn(
                  'h-9 w-9 rounded-lg bg-zinc-100 flex items-center justify-center mb-3',
                  'group-hover:bg-zinc-200 transition-colors duration-150',
                )}
              >
                <link.icon className="h-4 w-4 text-zinc-600" />
              </div>
              <p className="text-sm font-semibold text-zinc-900">{link.label}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{link.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default OperationsCommandCenter;
