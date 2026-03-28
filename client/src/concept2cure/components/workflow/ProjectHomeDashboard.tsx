/**
 * ProjectHomeDashboard — Claude.ai-style project context header.
 *
 * Shows project name, description, and an "Open Tools" action.
 * Sits above the AnA chat when inside a project.
 */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { Wrench, Settings2 } from 'lucide-react';

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
  onOpenConfig?: () => void;
}

interface Artifact {
  id: string;
  status?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ProjectHomeDashboard: React.FC<ProjectHomeDashboardProps> = ({
  project,
  onNavigate,
  onOpenConfig,
}) => {
  const { data: artifacts } = useQuery<Artifact[]>({
    queryKey: queryKeys.projects.overviewArtifacts(project.id),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${project.id}/artifacts`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : [];
    },
    staleTime: 30_000,
  });

  const summary = useMemo(() => {
    const list = artifacts ?? [];
    let ready = 0;
    let review = 0;
    for (const a of list) {
      const s = a.status as string;
      if (s === 'approved' || s === 'locked') ready++;
      if (s === 'review') review++;
    }
    return { total: list.length, ready, review };
  }, [artifacts]);

  return (
    <div className="flex-shrink-0 border-b border-stone-100 bg-white/60 backdrop-blur-sm" data-testid="project-context-strip">
      <div className="max-w-3xl mx-auto px-6 py-5">
        {/* Project name row */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-stone-900 leading-tight">{project.name}</h1>
            {project.description && (
              <p className="text-[13px] text-stone-500 mt-1 leading-relaxed line-clamp-2">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
            <button
              onClick={() => onNavigate('tools')}
              aria-label="Open Tools"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50 hover:text-stone-800 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            >
              <Wrench className="w-3.5 h-3.5" />
              Tools
            </button>
            {onOpenConfig && (
              <button
                onClick={onOpenConfig}
                aria-label="Project settings"
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Subtle activity bar */}
        {summary.total > 0 && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-stone-100">
            <span className="text-xs text-stone-400">
              {summary.ready} of {summary.total} artifacts ready
              {summary.review > 0 && ` · ${summary.review} in review`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectHomeDashboard;
