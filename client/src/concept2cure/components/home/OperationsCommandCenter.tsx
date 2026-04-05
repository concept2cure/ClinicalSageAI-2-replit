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
import {
  PageLayout,
  PageHeader,
  EnterpriseCard,
  EnterpriseButton,
  EmptyState,
  StatRow,
  Heading,
  Caption,
  IconBox,
  StatusPill,
} from '../ui/enterprise';

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
  IND: { bg: 'bg-stone-200', text: 'text-stone-700' },
  NDA: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  '510K': { bg: 'bg-blue-100', text: 'text-stone-700' },
  '510(K)': { bg: 'bg-blue-100', text: 'text-stone-700' },
  BLA: { bg: 'bg-amber-100', text: 'text-amber-700' },
  PMA: { bg: 'bg-red-100', text: 'text-red-700' },
};

const STATUS_VARIANT: Record<string, 'success' | 'default' | 'warning' | 'info'> = {
  active: 'success',
  completed: 'default',
  review: 'warning',
  draft: 'info',
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
  if (!type) return { bg: 'bg-stone-100', text: 'text-stone-600' };
  return TYPE_COLORS[type.toUpperCase().trim()] ?? { bg: 'bg-stone-100', text: 'text-stone-600' };
}

function getStatusVariant(status?: string): 'success' | 'default' | 'warning' | 'info' {
  if (!status) return 'info';
  const lower = status.toLowerCase().trim();
  if (lower.includes('review')) return 'warning';
  if (lower.includes('complete')) return 'default';
  if (lower.includes('active')) return 'success';
  return 'info';
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
  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      }),
    [projects],
  );

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return [
      { label: 'Total', value: projects.length, icon: FolderKanban, iconClassName: 'text-stone-500' },
      { label: 'Active', value: projects.filter((p) => p.status?.toLowerCase() === 'active').length, icon: Briefcase, iconClassName: 'text-emerald-600', valueClassName: 'text-emerald-600' },
      { label: 'In Review', value: projects.filter((p) => p.status?.toLowerCase().includes('review')).length, icon: FileSearch, iconClassName: 'text-amber-600', valueClassName: 'text-amber-600' },
      { label: 'Completed', value: projects.filter((p) => p.status?.toLowerCase() === 'completed').length, icon: CheckCircle2, iconClassName: 'text-stone-400' },
      { label: 'This Month', value: projects.filter((p) => { if (!p.createdAt) return false; const d = new Date(p.createdAt); return d.getMonth() === currentMonth && d.getFullYear() === currentYear; }).length, icon: CalendarDays, iconClassName: 'text-sky-600', valueClassName: 'text-sky-600' },
    ];
  }, [projects]);

  const quickLinks = [
    { label: 'Regulatory Intelligence', description: 'AI-powered regulatory insights', icon: Brain },
    { label: 'Document Templates', description: 'Pre-built submission templates', icon: FileText },
    { label: 'Analytics Dashboard', description: 'Portfolio metrics and trends', icon: BarChart2 },
    { label: 'Knowledge Base', description: 'Guidance documents and SOPs', icon: BookOpen },
  ];

  return (
    <PageLayout size="wide">
      {/* ── Welcome Header ── */}
      <PageHeader
        title={`${getGreeting()}, ${userName || 'there'}`}
        subtitle={formatDate()}
        actions={
          <EnterpriseButton variant="primary" icon={Plus} size="lg" onClick={onCreateProject} className="bg-stone-900 hover:bg-stone-800">
            New Project
          </EnterpriseButton>
        }
      />

      {/* ── Portfolio Overview ── */}
      <StatRow stats={stats} columns={5} />

      {/* ── Projects Grid ── */}
      <div>
        <Heading className="mb-4">Projects</Heading>
        {sortedProjects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create your first project to get started."
            action={
              <EnterpriseButton variant="primary" icon={Plus} onClick={onCreateProject} className="bg-stone-900 hover:bg-stone-800">
                New Project
              </EnterpriseButton>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedProjects.map((project) => {
              const typeColor = getTypeColor(project.type);
              return (
                <EnterpriseCard key={project.id} interactive onClick={() => onSelectProject(project.id)} className="group">
                  <div className="flex items-start justify-between mb-3">
                    {project.type ? (
                      <StatusPill label={project.type.toUpperCase()} className={cn(typeColor.bg, typeColor.text, 'rounded-lg')} />
                    ) : (
                      <span />
                    )}
                    <ArrowRight className="h-4 w-4 text-stone-300 group-hover:text-stone-500 transition-colors duration-150" />
                  </div>

                  <h3 className="text-sm font-semibold text-stone-900 leading-snug line-clamp-2 mb-2">
                    {project.name}
                  </h3>

                  <div className="flex items-center gap-3 flex-wrap">
                    {project.status && (
                      <StatusPill label={project.status} variant={getStatusVariant(project.status)} dot />
                    )}
                    {project.submissionType && (
                      <Caption as="span">{project.submissionType}</Caption>
                    )}
                  </div>

                  {project.updatedAt && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-stone-400">
                      <Clock className="h-3 w-3" />
                      <span>Updated {formatRelativeTime(project.updatedAt)}</span>
                    </div>
                  )}
                </EnterpriseCard>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick Access Bar ── */}
      <div>
        <Heading className="mb-4">Quick Access</Heading>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickLinks.map((link) => (
            <EnterpriseCard key={link.label} interactive className="group">
              <IconBox
                icon={link.icon}
                size="sm"
                className="bg-stone-100 text-stone-600 group-hover:bg-stone-200 transition-colors duration-150 mb-3"
              />
              <p className="text-sm font-semibold text-stone-900">{link.label}</p>
              <Caption className="mt-0.5">{link.description}</Caption>
            </EnterpriseCard>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}

export default OperationsCommandCenter;
