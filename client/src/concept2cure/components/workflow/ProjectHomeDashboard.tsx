/**
 * ProjectHomeDashboard — Overview tab for the project shell.
 *
 * Design principle: show less, mean more. ArtifactsPage-level calm.
 * One readiness line, one recent list, one set of actions.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { WorkspaceCanvas, PageTitleHeader } from '@/components/ui/workspace-primitives';
import {
  PenLine,
  Archive,
  ShieldCheck,
  Send,
  ChevronRight,
  FileText,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectHomeDashboardProps {
  project: {
    id: number;
    name: string;
    type: string;
    description?: string | null;
    sponsor?: string | null;
    product?: string | null;
    region?: string | null;
  };
  onNavigate: (mode: string, sectionCode?: string) => void;
}

interface Artifact {
  id: string;
  title: string;
  status?: string;
  ctdSection?: string;
  updatedAt?: string;
}

const VALID_STATUSES = ['draft', 'review', 'approved', 'locked'] as const;
const RECENT_LIMIT = 5;

// ─── Component ────────────────────────────────────────────────────────────────

export const ProjectHomeDashboard: React.FC<ProjectHomeDashboardProps> = ({
  project,
  onNavigate,
}) => {
  const { data: artifacts, isLoading, isError } = useQuery<Artifact[]>({
    queryKey: queryKeys.projects.overviewArtifacts(project.id),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${project.id}/artifacts`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : [];
    },
    staleTime: 30_000,
  });

  const stats = useMemo(() => {
    const list = artifacts ?? [];
    const counts = { draft: 0, review: 0, approved: 0, locked: 0 };
    for (const a of list) {
      const s = a.status as string;
      if (s && (VALID_STATUSES as readonly string[]).includes(s)) {
        counts[s as keyof typeof counts]++;
      }
    }
    const total = list.length;
    const ready = counts.approved + counts.locked;
    const recent = [...list]
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, RECENT_LIMIT);
    return { counts, total, ready, recent };
  }, [artifacts]);

  const badges = [
    { label: project.type },
    ...(project.region ? [{ label: project.region }] : []),
  ];

  return (
    <WorkspaceCanvas maxWidth="3xl" testId="project-home-dashboard">
      <PageTitleHeader
        title={project.name}
        description={project.description ?? undefined}
        badges={badges}
      />

      {/* ── Readiness summary — one calm line ──────────────────────── */}
      <div className="mt-8 pb-6 border-b border-zinc-100">
        {isLoading ? (
          <div className="h-5 w-48 bg-zinc-100 rounded animate-pulse" />
        ) : (
          <p className="text-sm text-zinc-600">
            <span className="font-semibold text-zinc-900">{stats.ready}</span>
            {' '}of{' '}
            <span className="font-semibold text-zinc-900">{stats.total}</span>
            {' '}artifacts ready
            {stats.counts.review > 0 && (
              <span className="text-amber-600 ml-2">
                · {stats.counts.review} in review
              </span>
            )}
            {stats.counts.draft > 0 && (
              <span className="text-zinc-400 ml-2">
                · {stats.counts.draft} drafts
              </span>
            )}
          </p>
        )}
      </div>

      {/* ── Recent artifacts ───────────────────────────────────────── */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-zinc-800">Recent</h3>
          {stats.recent.length > 0 && (
            <button
              onClick={() => onNavigate('work')}
              aria-label="View all artifacts"
              className="text-xs text-zinc-500 hover:text-zinc-700 flex items-center gap-0.5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-zinc-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-red-500 py-4">Failed to load artifacts.</p>
        ) : stats.recent.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-zinc-400">No artifacts yet</p>
            <button
              onClick={() => onNavigate('work')}
              className="mt-3 text-sm text-blue-600 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded"
            >
              Start in Work
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {stats.recent.map(artifact => (
              <button
                key={artifact.id}
                onClick={() => onNavigate('work')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-50 transition-colors text-left focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              >
                <FileText className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                <span className="flex-1 text-sm text-zinc-700 truncate" title={artifact.title}>
                  {artifact.title}
                </span>
                {artifact.ctdSection && (
                  <span className="text-[11px] text-zinc-400 flex-shrink-0">
                    {artifact.ctdSection}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick actions — text links, not cards ──────────────────── */}
      <div className="mt-8 pt-6 border-t border-zinc-100">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {[
            { id: 'work', label: 'Open Work', icon: PenLine },
            { id: 'vault', label: 'Open Vault', icon: Archive },
            { id: 'review-tab', label: 'Open Review', icon: ShieldCheck },
            { id: 'submit', label: 'Open Submit', icon: Send },
          ].map(action => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => onNavigate(action.id)}
                aria-label={action.label}
                className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-800 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded"
              >
                <Icon className="w-4 h-4" />
                {action.label}
              </button>
            );
          })}
        </div>
      </div>
    </WorkspaceCanvas>
  );
};

export default ProjectHomeDashboard;
