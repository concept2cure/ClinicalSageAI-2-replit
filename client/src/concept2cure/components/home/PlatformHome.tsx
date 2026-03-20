/**
 * Platform Home — Claude.ai-inspired landing experience
 *
 * Simplified to 3 clear paths:
 * 1. Resume recent work (conversations + documents)
 * 2. Start new work (guided by submission type)
 * 3. Browse existing projects
 *
 * Design: One focused screen, no module catalog overwhelm.
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

const START_OPTIONS = [
  {
    id: 'new-project',
    label: 'Start a new submission',
    description: 'Create a 510(k), IND, NDA, BLA, or other regulatory submission from scratch',
    icon: Plus,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    action: 'new-project',
  },
  {
    id: 'copilot',
    label: 'Ask AnA anything',
    description: 'Get regulatory guidance, find precedents, analyze FDA requirements',
    icon: Sparkles,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    action: 'assistant',
  },
  {
    id: 'author',
    label: 'Draft a document',
    description: 'Write CTD sections, clinical reports, or regulatory narratives with AI assistance',
    icon: PenLine,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    action: 'author',
  },
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
  const recentArtifacts = workspaceSummary?.recent?.artifacts?.slice(0, 3) ?? [];
  const recentThreads = workspaceSummary?.recent?.threads?.slice(0, 3) ?? [];
  const hasRecent = recentArtifacts.length > 0 || recentThreads.length > 0;

  return (
    <div className="flex-1 overflow-y-auto zen-scroll bg-zinc-50/30">
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* ── Greeting ─────────────────────────────────────────── */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-semibold text-zinc-900 tracking-tight">
            {greeting}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-base text-zinc-500 mt-2">
            What would you like to work on?
          </p>
        </div>

        {/* ── Pick up where you left off ────────────────────────── */}
        {hasRecent && (
          <div className="mb-10">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Pick up where you left off
            </h2>
            <div className="space-y-2">
              {recentThreads.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => onNavigate('ai-copilot')}
                  className="w-full group flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-zinc-200 hover:border-blue-200 hover:shadow-md transition-all text-left"
                >
                  <MessageSquare className="w-4 h-4 text-violet-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-zinc-900 truncate flex-1">{t.title}</span>
                  <span className="text-xs text-zinc-400 flex-shrink-0">
                    {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ))}
              {recentArtifacts.map((a: any) => (
                <button
                  key={a.id}
                  onClick={() => onNavigate('author')}
                  className="w-full group flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-zinc-200 hover:border-blue-200 hover:shadow-md transition-all text-left"
                >
                  <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-zinc-900 truncate flex-1">{a.title || a.type}</span>
                  <span className="text-xs text-zinc-400 flex-shrink-0">{a.status}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Start something new ────────────────────────────────── */}
        <div className="mb-10">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Start something new
          </h2>
          <div className="space-y-3">
            {START_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => option.action === 'new-project' ? onNewProject() : onNavigate(option.action)}
                className="w-full group flex items-center gap-4 p-5 rounded-xl bg-white border border-zinc-200 hover:border-blue-200 hover:shadow-md transition-all text-left"
              >
                <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', option.bg)}>
                  <option.icon className={cn('w-5 h-5', option.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-medium text-zinc-900 group-hover:text-blue-900">{option.label}</div>
                  <div className="text-sm text-zinc-500 mt-0.5">{option.description}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* ── Your Projects ────────────────────────────────────── */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Your Projects
            </h2>
            <button
              onClick={onNewProject}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>

          {activeProjects.length > 0 ? (
            <div className="space-y-2">
              {activeProjects.map(project => (
                <button
                  key={project.id}
                  onClick={() => onProjectClick(project.id)}
                  className="w-full group flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white border border-zinc-200 hover:border-blue-200 hover:shadow-md transition-all text-left"
                >
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0', TYPE_COLORS[project.type] ?? 'bg-zinc-400')} />
                  <span className="text-xs font-semibold text-zinc-500 w-10 flex-shrink-0">{project.type}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-zinc-900">{project.name}</span>
                    {project.starred && <Star className="w-3 h-3 text-amber-400 fill-amber-400 inline ml-1.5 -mt-0.5" />}
                    {project.description && (
                      <span className="block text-xs text-zinc-500 truncate">{project.description}</span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-400 flex-shrink-0 hidden sm:inline">
                    {project.lastUpdated
                      ? new Date(project.lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                      : ''}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-zinc-300 bg-white px-6 py-10 text-center rounded-xl">
              <FolderOpen className="w-6 h-6 text-zinc-400 mx-auto mb-3" />
              <p className="text-sm text-zinc-600 mb-4">No projects yet — start your first submission</p>
              <button
                onClick={onNewProject}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-zinc-900 rounded-xl hover:bg-zinc-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create first project
              </button>
            </div>
          )}
        </div>

        {/* ── Explore Tools (collapsed, secondary) ───────────── */}
        <div className="mb-8">
          <details className="group">
            <summary className="cursor-pointer text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 hover:text-zinc-600 transition-colors list-none flex items-center gap-1.5">
              <ArrowRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
              Explore all tools
            </summary>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
              {[
                { id: 'intelligence-hub', label: 'Research Evidence', icon: Search, color: 'text-blue-600' },
                { id: 'review-readiness', label: 'Check Compliance', icon: ShieldCheck, color: 'text-emerald-600' },
                { id: 'command-center', label: 'Operations Hub', icon: FolderOpen, color: 'text-zinc-600' },
                { id: 'collaboration-hub', label: 'Team Workspace', icon: MessageSquare, color: 'text-amber-600' },
                { id: 'biostatistics', label: 'Biostatistics', icon: Search, color: 'text-teal-600' },
                { id: 'knowledge-base', label: 'Knowledge Base', icon: FileText, color: 'text-violet-600' },
              ].map(mod => (
                <button
                  key={mod.id}
                  onClick={() => onNavigate(mod.id)}
                  className="flex items-center gap-2.5 p-3.5 rounded-xl bg-white border border-zinc-200 hover:border-blue-200 hover:shadow-md transition-all text-left"
                >
                  <mod.icon className={cn('w-4 h-4 flex-shrink-0', mod.color)} />
                  <span className="text-sm text-zinc-700">{mod.label}</span>
                </button>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

export default PlatformHome;
