/**
 * ProjectHomeDashboard — Light context strip for the AnA-first project home.
 *
 * Shows: project identity, readiness one-liner, and "Open Tools" action.
 * AnA is the primary interface — this strip sits above the conversation.
 */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { Wrench } from 'lucide-react';

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
  status?: string;
}

const VALID_STATUSES = ['draft', 'review', 'approved', 'locked'] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export const ProjectHomeDashboard: React.FC<ProjectHomeDashboardProps> = ({
  project,
  onNavigate,
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
    <div className="flex-shrink-0 px-6 py-4 border-b border-stone-150 bg-white/60 backdrop-blur-sm" data-testid="project-context-strip">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {/* Project identity + readiness */}
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[15px] font-semibold text-stone-900 truncate">{project.name}</h1>
            {summary.total > 0 && (
              <span className="text-xs text-stone-400">
                {summary.ready} of {summary.total} ready
                {summary.review > 0 && ` · ${summary.review} in review`}
              </span>
            )}
          </div>
        </div>

        {/* Open Tools */}
        <button
          onClick={() => onNavigate('tools')}
          aria-label="Open Tools"
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50 hover:text-stone-800 transition-colors flex-shrink-0 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        >
          <Wrench className="w-3.5 h-3.5" />
          Open Tools
        </button>
      </div>
    </div>
  );
};

export default ProjectHomeDashboard;
