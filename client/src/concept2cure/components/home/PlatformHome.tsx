/**
 * Platform Home — Claude.ai-inspired landing dashboard
 *
 * The first thing users see. Greeting, quick actions, project list,
 * module catalog, and recent activity — all in one clean scroll.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Plus,
  Sparkles,
  FileText,
  Users,
  FlaskConical,
  Bot,
  Compass,
  Activity,
  Scale,
  Snowflake,
  Upload,
  Rocket,
  PenLine,
  Search,
  ShieldCheck,
  BarChart3,
  GraduationCap,
  Building2,
  Star,
  MessageSquare,
  FolderOpen,
  ArrowRight,
  FileStack,
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

const QUICK_ACTIONS = [
  { id: 'new-project', label: 'New Project', subtitle: 'Start a submission', icon: Plus, color: 'text-blue-600', bg: 'bg-blue-50', action: 'new-project' },
  { id: 'copilot', label: 'AI Copilot', subtitle: 'Chat with AnA', icon: Sparkles, color: 'text-violet-600', bg: 'bg-violet-50', action: 'assistant' },
  { id: 'sherpa', label: 'Document Sherpa', subtitle: 'AI-guided authoring', icon: Compass, color: 'text-emerald-600', bg: 'bg-emerald-50', action: 'document-sherpa' },
  { id: 'collab', label: 'Collaboration', subtitle: 'Team workspace', icon: Users, color: 'text-amber-600', bg: 'bg-amber-50', action: 'collaboration-hub' },
  { id: 'biostat', label: 'Biostatistics', subtitle: 'Statistical analysis', icon: FlaskConical, color: 'text-teal-600', bg: 'bg-teal-50', action: 'biostatistics' },
  { id: 'agents', label: 'Agent Swarm', subtitle: 'AI agent fleet', icon: Bot, color: 'text-rose-600', bg: 'bg-rose-50', action: 'agent-hub' },
];

const MODULE_CATALOG = [
  { id: 'regulatory-workspace', label: 'Regulatory Workspace', subtitle: 'Full submission environment', icon: FileText, color: 'text-blue-600' },
  { id: 'ectd-coauthor', label: 'eCTD Co-Author', subtitle: 'Document authoring', icon: PenLine, color: 'text-violet-600' },
  { id: 'document-sherpa', label: 'Document Sherpa', subtitle: 'AI-guided documents', icon: Compass, color: 'text-emerald-600' },
  { id: 'review-pulse', label: 'Review Pulse', subtitle: 'PM orchestration', icon: Activity, color: 'text-pink-600' },
  { id: 'intelligence-hub', label: 'Intelligence Hub', subtitle: 'Evidence & insights', icon: Search, color: 'text-blue-600' },
  { id: 'review-readiness', label: 'Review Readiness', subtitle: 'Submission QC', icon: ShieldCheck, color: 'text-emerald-600' },
  { id: 'command-center', label: 'Command Center', subtitle: 'Operations hub', icon: Building2, color: 'text-zinc-700' },
  { id: 'legal-center', label: 'Legal Center', subtitle: 'IP & contracts', icon: Scale, color: 'text-indigo-600' },
  { id: 'biostatistics', label: 'Biostatistics', subtitle: 'Statistical platform', icon: FlaskConical, color: 'text-teal-600' },
  { id: 'training-center', label: 'Training Center', subtitle: 'Courses & certs', icon: GraduationCap, color: 'text-amber-600' },
  { id: 'agent-hub', label: 'Agent Hub', subtitle: 'AI agent fleet', icon: Bot, color: 'text-rose-600' },
  { id: 'snowglobe', label: 'SnowGlobe', subtitle: 'Cross-platform intel', icon: Snowflake, color: 'text-sky-600' },
  { id: 'collaboration-hub', label: 'Collaboration Hub', subtitle: 'Team threads', icon: Users, color: 'text-amber-600' },
  { id: 'knowledge-base', label: 'Knowledge Base', subtitle: 'Skills & uploads', icon: Upload, color: 'text-violet-600' },
  { id: 'project-knowledge', label: 'Project Knowledge', subtitle: 'Project context', icon: FileStack, color: 'text-blue-600' },
  { id: 'client-onboarding', label: 'Client Onboarding', subtitle: 'Setup wizard', icon: Rocket, color: 'text-emerald-600' },
];

const TYPE_COLORS: Record<string, string> = {
  '510K': 'bg-blue-500',
  IND: 'bg-violet-500',
  NDA: 'bg-emerald-500',
  BLA: 'bg-teal-500',
  PMA: 'bg-orange-500',
  CER: 'bg-pink-500',
  MAA: 'bg-indigo-500',
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
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

  return (
    <div className="flex-1 overflow-y-auto zen-scroll bg-zinc-50/30">
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* ── Greeting ─────────────────────────────────────────── */}
        <div className="mb-10">
          <h1 className="text-3xl font-semibold text-zinc-900 tracking-tight">
            {greeting}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-base text-zinc-500 mt-1.5">
            {activeProjects.length} active project{activeProjects.length !== 1 ? 's' : ''}
            {workspaceSummary?.counts?.documents ? ` \u00b7 ${workspaceSummary.counts.documents} documents` : ''}
          </p>
        </div>

        {/* ── Quick Actions ────────────────────────────────────── */}
        <div className="mb-12">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {QUICK_ACTIONS.map(action => (
              <button
                key={action.id}
                onClick={() => action.action === 'new-project' ? onNewProject() : onNavigate(action.action)}
                className="group flex items-center gap-3 p-4 rounded-xl bg-white border border-zinc-200 hover:border-zinc-200 hover:shadow-sm transition-all text-left"
              >
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', action.bg)}>
                  <action.icon className={cn('w-5 h-5', action.color)} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-900">{action.label}</div>
                  <div className="text-xs text-zinc-400">{action.subtitle}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Your Projects ────────────────────────────────────── */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Your Projects
            </h2>
            <button
              onClick={onNewProject}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Project
            </button>
          </div>

          {activeProjects.length > 0 ? (
            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/60">
                    <th className="px-4 py-2 font-medium text-zinc-500 text-xs uppercase tracking-wider">Type</th>
                    <th className="px-4 py-2 font-medium text-zinc-500 text-xs uppercase tracking-wider">Project</th>
                    <th className="px-4 py-2 font-medium text-zinc-500 text-xs uppercase tracking-wider hidden sm:table-cell">Chats</th>
                    <th className="px-4 py-2 font-medium text-zinc-500 text-xs uppercase tracking-wider hidden sm:table-cell text-right">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {activeProjects.map(project => (
                    <tr
                      key={project.id}
                      onClick={() => onProjectClick(project.id)}
                      className="cursor-pointer hover:bg-zinc-50 transition-colors"
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
                          <span className={cn('w-1.5 h-1.5 rounded-full', TYPE_COLORS[project.type] ?? 'bg-zinc-400')} />
                          {project.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-zinc-900">{project.name}</span>
                        {project.starred && <Star className="w-3 h-3 text-amber-400 fill-amber-400 inline ml-1.5 -mt-0.5" />}
                        {project.description && (
                          <span className="block text-xs text-zinc-400 truncate max-w-md">{project.description}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400 hidden sm:table-cell">{project.conversationCount}</td>
                      <td className="px-4 py-2.5 text-zinc-400 text-right hidden sm:table-cell">
                        {project.lastUpdated
                          ? new Date(project.lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                          : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-dashed border-zinc-300 bg-white px-6 py-8 text-center rounded-xl">
              <FolderOpen className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
              <p className="text-sm text-zinc-600 mb-3">No projects yet</p>
              <button
                onClick={onNewProject}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create first project
              </button>
            </div>
          )}
        </div>

        {/* ── Platform Modules ─────────────────────────────────── */}
        <div className="mb-12">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Platform Modules
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {MODULE_CATALOG.map(mod => (
              <button
                key={mod.id}
                onClick={() => onNavigate(mod.id)}
                className="group flex items-center gap-2.5 p-3 rounded-xl bg-white border border-zinc-200 hover:border-zinc-200 hover:shadow-sm transition-all text-left"
              >
                <mod.icon className={cn('w-4 h-4 flex-shrink-0', mod.color)} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-zinc-800 truncate">{mod.label}</div>
                  <div className="text-[11px] text-zinc-400 truncate">{mod.subtitle}</div>
                </div>
                <ArrowRight className="w-3 h-3 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* ── Recent Artifacts ─────────────────────────────────── */}
        {(workspaceSummary?.recent?.artifacts?.length ?? 0) > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Recent Artifacts
            </h2>
            <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden bg-white">
              {workspaceSummary!.recent.artifacts!.slice(0, 4).map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 transition-colors">
                  <FileText className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-zinc-900 truncate flex-1">{a.title || a.type}</span>
                  <span className="text-xs text-zinc-400 flex-shrink-0">
                    {a.type} · {a.status} · {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recent Conversations ─────────────────────────────── */}
        {(workspaceSummary?.recent?.threads?.length ?? 0) > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Recent Conversations
            </h2>
            <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden bg-white">
              {workspaceSummary!.recent.threads!.slice(0, 5).map((t: any) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 transition-colors">
                  <MessageSquare className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  <span className="text-sm text-zinc-700 truncate flex-1">{t.title}</span>
                  <span className="text-xs text-zinc-400 flex-shrink-0">
                    {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlatformHome;
