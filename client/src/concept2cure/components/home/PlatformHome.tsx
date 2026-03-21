/**
 * Platform Home — Enterprise Operations Dashboard
 *
 * Primary landing dashboard with:
 * 1. Portfolio metrics overview (total, active, review, completed)
 * 2. Quick-start actions (new submission, AI copilot, authoring)
 * 3. Project cards with type badges, status indicators, relative times
 * 4. Recent activity feed (conversations + documents)
 * 5. Quick access to platform capabilities
 *
 * Uses Zen design system + enterprise primitives for GA-quality consistency.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Plus,
  Sparkles,
  FileText,
  MessageSquare,
  ArrowRight,
  Star,
  PenLine,
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
} from 'lucide-react';
import {
  PageLayout,
  PageHeader,
  StatRow,
  EnterpriseCard,
  EnterpriseButton,
  StatusPill,
  IconBox,
  EmptyState,
  Heading,
  Overline,
  Caption,
  ListItem,
} from '../ui/enterprise';

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
  MAA: { bg: 'bg-blue-100', text: 'text-blue-700' },
};

function getStatusVariant(status?: string): 'success' | 'default' | 'warning' | 'info' {
  if (!status) return 'info';
  const lower = status.toLowerCase().trim();
  if (lower.includes('review')) return 'warning';
  if (lower.includes('complete')) return 'default';
  if (lower.includes('active')) return 'success';
  return 'info';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    { id: 'new-project', label: 'New Submission', description: 'Create IND, NDA, 510(k), BLA, PMA, or MAA', icon: Plus, iconClass: 'bg-blue-100 text-blue-600' },
    { id: 'assistant', label: 'Ask AnA', description: 'Regulatory guidance & precedent analysis', icon: Sparkles, iconClass: 'bg-violet-100 text-violet-600' },
    { id: 'author', label: 'Draft Document', description: 'CTD sections, clinical reports, narratives', icon: PenLine, iconClass: 'bg-emerald-100 text-emerald-600' },
    { id: 'document-sherpa', label: 'AnA Sherpa', description: 'AI-guided step-by-step authoring', icon: Compass, iconClass: 'bg-amber-100 text-amber-600' },
  ];

  const capabilities = [
    { id: 'intelligence-hub', label: 'Regulatory Intelligence', description: 'AI-powered regulatory insights & evidence', icon: Brain, color: 'text-blue-600' },
    { id: 'review-readiness', label: 'Review & Compliance', description: 'Quality checks, readiness assessments', icon: ShieldCheck, color: 'text-emerald-600' },
    { id: 'biostatistics', label: 'Biostatistics', description: 'Power analysis, endpoints, study design', icon: FlaskConical, color: 'text-teal-600' },
    { id: 'command-center', label: 'Operations Center', description: 'Submissions, governance, pipeline', icon: BarChart2, color: 'text-zinc-600' },
    { id: 'collaboration-hub', label: 'Collaboration', description: 'Team workspace, threads, decisions', icon: MessageSquare, color: 'text-amber-600' },
    { id: 'knowledge-base', label: 'Knowledge Base', description: 'Documents, SOPs, guidance library', icon: BookOpen, color: 'text-violet-600' },
    { id: 'agent-hub', label: 'AI Agents', description: 'Autonomous regulatory AI workforce', icon: Bot, color: 'text-pink-600' },
    { id: 'review-pulse', label: 'Review Pulse', description: 'PM signals, risk tracking, readiness', icon: Activity, color: 'text-red-500' },
  ];

  return (
    <PageLayout size="wide" className="flex-1 overflow-y-auto zen-scroll bg-zinc-50/50">
        {/* ── Welcome Header ── */}
        <PageHeader
          title={`${greeting}${firstName ? `, ${firstName}` : ''}`}
          subtitle={formatDate()}
          actions={
            <EnterpriseButton variant="primary" icon={Plus} onClick={onNewProject}>
              New Project
            </EnterpriseButton>
          }
        />

        {/* ── Portfolio Metrics ── */}
        <StatRow stats={metrics.map(m => ({
          label: m.label,
          value: m.value,
          icon: m.icon,
          iconClassName: m.color,
          valueClassName: m.color,
        }))} columns={5} />

        {/* ── Quick Actions ── */}
        <section>
          <Overline className="mb-3">Quick Actions</Overline>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map(action => (
              <EnterpriseCard
                key={action.id}
                interactive
                onClick={() => action.id === 'new-project' ? onNewProject() : onNavigate(action.id)}
                className="group flex flex-col"
              >
                <IconBox icon={action.icon} className={action.iconClass} />
                <p className="mt-3 text-sm font-semibold text-zinc-900">{action.label}</p>
                <Caption className="mt-0.5">{action.description}</Caption>
              </EnterpriseCard>
            ))}
          </div>
        </section>

        {/* ── Recent Activity ── */}
        {hasRecent && (
          <section>
            <Overline className="mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Recent Activity
            </Overline>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {recentThreads.map((t: any) => (
                <ListItem
                  key={t.id}
                  icon={MessageSquare}
                  iconClassName="bg-violet-50 text-violet-500"
                  title={t.title}
                  subtitle={t.updatedAt ? formatRelativeTime(t.updatedAt) : 'Conversation'}
                  onClick={() => onNavigate('ai-copilot')}
                  chevron
                  className="bg-white border border-zinc-200 rounded-xl hover:border-zinc-300 hover:shadow-sm"
                />
              ))}
              {recentArtifacts.map((a: any) => (
                <ListItem
                  key={a.id}
                  icon={FileText}
                  iconClassName="bg-blue-50 text-blue-500"
                  title={a.title || a.type}
                  subtitle={a.status || 'Document'}
                  onClick={() => onNavigate('author')}
                  chevron
                  className="bg-white border border-zinc-200 rounded-xl hover:border-zinc-300 hover:shadow-sm"
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Projects Grid ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <Heading>Projects</Heading>
            {sortedProjects.length > 0 && (
              <Caption as="span" className="tabular-nums">
                {sortedProjects.length} project{sortedProjects.length !== 1 ? 's' : ''}
              </Caption>
            )}
          </div>

          {sortedProjects.length === 0 ? (
            <EnterpriseCard className="border-dashed">
              <EmptyState
                icon={FolderKanban}
                title="No projects yet"
                description="Create your first regulatory submission to get started."
                action={
                  <EnterpriseButton variant="primary" icon={Plus} onClick={onNewProject}>
                    New Project
                  </EnterpriseButton>
                }
              />
            </EnterpriseCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {sortedProjects.map(project => {
                const typeColor = getTypeBadge(project.type);
                return (
                  <EnterpriseCard
                    key={project.id}
                    interactive
                    onClick={() => onProjectClick(project.id)}
                    className="group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {project.type && (
                          <StatusPill
                            label={project.type.toUpperCase()}
                            variant="info"
                            className={cn(typeColor.bg, typeColor.text)}
                          />
                        )}
                        {project.starred && (
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 transition-colors duration-150" />
                    </div>

                    <h3 className="text-sm font-semibold text-zinc-900 leading-snug line-clamp-2 mb-1.5">
                      {project.name}
                    </h3>

                    {project.description && (
                      <p className="text-xs text-zinc-500 line-clamp-1 mb-2">{project.description}</p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {project.status && (
                        <StatusPill
                          label={project.status}
                          variant={getStatusVariant(project.status)}
                          dot
                        />
                      )}
                      {project.submissionType && (
                        <Caption as="span">{project.submissionType}</Caption>
                      )}
                    </div>

                    {project.lastUpdated && (
                      <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center gap-1.5 text-xs text-zinc-400">
                        <Clock className="h-3 w-3" />
                        <span>Updated {formatRelativeTime(project.lastUpdated)}</span>
                      </div>
                    )}
                  </EnterpriseCard>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Platform Capabilities ── */}
        <section>
          <Overline className="mb-3">Platform Capabilities</Overline>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {capabilities.map(cap => (
              <EnterpriseCard
                key={cap.id}
                interactive
                onClick={() => onNavigate(cap.id)}
                className="group"
              >
                <div className="flex items-center gap-3">
                  <IconBox icon={cap.icon} size="sm" className={cn('bg-zinc-100', cap.color, 'group-hover:bg-zinc-50 transition-colors duration-150')} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 leading-tight">{cap.label}</p>
                    <Caption className="mt-0.5 leading-tight">{cap.description}</Caption>
                  </div>
                </div>
              </EnterpriseCard>
            ))}
          </div>
        </section>
    </PageLayout>
  );
};

export default PlatformHome;
