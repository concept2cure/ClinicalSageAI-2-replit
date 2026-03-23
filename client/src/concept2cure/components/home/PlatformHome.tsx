/**
 * Platform Home — Biotech-first IND/eCTD project command center
 *
 * Replaces the old module-marketplace home with a real workflow landing:
 *   - Current project context + dossier progress
 *   - Primary workflow actions: Continue Drafting, Open Dossier, Check Readiness
 *   - Your projects table
 *   - Recent document activity
 *   - No platform module tile grid
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Plus,
  FileText,
  PenLine,
  LayoutGrid,
  Send,
  Star,
  FolderOpen,
  ArrowRight,
  Clock,
  CheckCircle2,
  ShieldCheck,
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

  // Derive workflow stats from workspace summary
  const docCount = workspaceSummary?.counts?.documents || 0;
  const draftCount = workspaceSummary?.counts?.draft || 0;
  const reviewCount = workspaceSummary?.counts?.review || 0;
  const approvedCount = workspaceSummary?.counts?.approved || 0;

  return (
    <div className="flex-1 overflow-y-auto zen-scroll bg-zinc-50/30">
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* ── Greeting ─────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-zinc-900 tracking-tight">
            {greeting}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-base text-zinc-500 mt-1.5">
            {activeProjects.length} active project{activeProjects.length !== 1 ? 's' : ''}
            {docCount > 0 && ` · ${docCount} documents`}
          </p>
        </div>

        {/* ── Primary Workflow Actions ───────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          <button
            onClick={() => onNavigate('documents')}
            className="group flex items-center gap-3 p-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-500/30 flex items-center justify-center flex-shrink-0">
              <PenLine className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Continue Drafting</div>
              <div className="text-xs text-blue-200">
                {draftCount > 0 ? `${draftCount} section${draftCount !== 1 ? 's' : ''} in progress` : 'Start authoring'}
              </div>
            </div>
            <ArrowRight className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity" />
          </button>

          <button
            onClick={() => onNavigate('dossier')}
            className="group flex items-center gap-3 p-4 rounded-xl bg-white border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center flex-shrink-0">
              <LayoutGrid className="w-5 h-5 text-zinc-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-900">Open Dossier</div>
              <div className="text-xs text-zinc-400">View eCTD structure</div>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
          </button>

          <button
            onClick={() => onNavigate('submissions')}
            className="group flex items-center gap-3 p-4 rounded-xl bg-white border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <Send className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-900">Check Readiness</div>
              <div className="text-xs text-zinc-400">Submission readiness</div>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
          </button>
        </div>

        {/* ── Workflow Status Summary ───────────────────────────── */}
        {docCount > 0 && (
          <div className="bg-white rounded-xl border border-zinc-200 p-5 mb-8">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              Workflow Status
            </h2>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-semibold text-zinc-900">{docCount}</div>
                <div className="text-xs text-zinc-400 mt-0.5">Total Sections</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <PenLine className="w-4 h-4 text-blue-500" />
                  <span className="text-2xl font-semibold text-blue-600">{draftCount}</span>
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">Drafting</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-2xl font-semibold text-amber-600">{reviewCount}</span>
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">In Review</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-2xl font-semibold text-emerald-600">{approvedCount}</span>
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">Approved</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Your Projects ────────────────────────────────────── */}
        <div className="mb-10">
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
                  <tr className="border-b border-zinc-100 bg-zinc-50/60">
                    <th className="px-4 py-2 font-medium text-zinc-500 text-xs uppercase tracking-wider">Type</th>
                    <th className="px-4 py-2 font-medium text-zinc-500 text-xs uppercase tracking-wider">Project</th>
                    <th className="px-4 py-2 font-medium text-zinc-500 text-xs uppercase tracking-wider hidden sm:table-cell">Documents</th>
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
                      <td className="px-4 py-2.5 text-zinc-400 hidden sm:table-cell">{project.conversationCount || '—'}</td>
                      <td className="px-4 py-2.5 text-zinc-400 text-right hidden sm:table-cell">
                        {project.lastUpdated
                          ? new Date(project.lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                          : '—'}
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

        {/* ── Recent Artifacts ─────────────────────────────────── */}
        {(workspaceSummary?.recent?.artifacts?.length ?? 0) > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Recent Documents
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
      </div>
    </div>
  );
};

export default PlatformHome;
