/**
 * ProjectHomeDashboard — Project context header with business intelligence.
 *
 * Shows:
 * - Project identity (name, type badge, description)
 * - Readiness progress bar with percentage
 * - Next recommended action
 * - Quick access to Tools and Settings
 *
 * Sits above AnA conversation on project-home.
 * Must feel like an Anthropic product — calm, informative, actionable.
 */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { Wrench, Settings2, ArrowRight } from 'lucide-react';

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
  ctdSection?: string;
  title?: string;
  updatedAt?: string;
}

const PHARMA_TYPES = ['IND', 'NDA', 'BLA', 'MAA'];
const DEVICE_TYPES = ['510K', 'PMA', 'DE_NOVO', 'CER', 'IVDR'];

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

  const upperType = (project.type || '').toUpperCase();
  const isPharma = PHARMA_TYPES.includes(upperType);
  const isDevice = DEVICE_TYPES.includes(upperType);
  const hasRegistry = isPharma || isDevice;

  const summary = useMemo(() => {
    const list = artifacts ?? [];
    let ready = 0;
    let review = 0;
    let draft = 0;
    for (const a of list) {
      const s = (a.status || '').toLowerCase();
      if (s === 'approved' || s === 'locked') ready++;
      else if (s === 'review' || s === 'in_review') review++;
      else if (s === 'draft' || s === 'drafting') draft++;
    }
    const total = list.length;
    const pct = total > 0 ? Math.round((ready / total) * 100) : 0;

    // Find next action
    let nextAction = '';
    let nextActionTarget = '';
    if (total === 0) {
      nextAction = isPharma ? 'Draft your first CTD section' : isDevice ? 'Set up your device description' : 'Create your first document';
      nextActionTarget = 'tools';
    } else if (review > 0) {
      nextAction = `${review} section${review > 1 ? 's' : ''} awaiting review`;
      nextActionTarget = 'review-tab';
    } else if (ready === total && total > 0) {
      nextAction = 'All sections ready — prepare submission package';
      nextActionTarget = 'submit';
    } else {
      nextAction = `${total - ready} section${total - ready > 1 ? 's' : ''} still need work`;
      nextActionTarget = 'tools';
    }

    return { total, ready, review, draft, pct, nextAction, nextActionTarget };
  }, [artifacts, isPharma, isDevice]);

  const typeLabel = isPharma ? `${upperType} Submission` : isDevice ? `${upperType} Submission` : project.type;

  return (
    <div className="flex-shrink-0 border-b border-stone-100 bg-white/80 backdrop-blur-sm" data-testid="project-context-strip">
      <div className="max-w-3xl mx-auto px-6 py-5">
        {/* Row 1: Project identity */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold text-stone-900 leading-tight truncate">{project.name}</h1>
              {typeLabel && (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-500 font-semibold uppercase tracking-tight flex-shrink-0">
                  {typeLabel}
                </span>
              )}
            </div>
            {project.description && (
              <p className="text-[13px] text-stone-500 mt-1 leading-relaxed line-clamp-1">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
            <button
              onClick={() => onNavigate('tools')}
              aria-label="Open Tools"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50 hover:text-stone-800 transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
            >
              <Wrench className="w-3.5 h-3.5" />
              Tools
            </button>
            {onOpenConfig && (
              <button
                onClick={onOpenConfig}
                aria-label="Project settings"
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Readiness progress + next action */}
        <div className="mt-4 pt-3 border-t border-stone-100">
          {summary.total > 0 ? (
            <div className="space-y-2.5">
              {/* Progress bar */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-stone-700 rounded-full transition-all duration-500"
                    style={{ width: `${summary.pct}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-stone-600 tabular-nums w-8 text-right">{summary.pct}%</span>
              </div>
              {/* Status line */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400">
                  {summary.ready} ready · {summary.draft} drafts · {summary.review} in review
                </span>
                {/* Next action */}
                <button
                  onClick={() => onNavigate(summary.nextActionTarget)}
                  className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 transition-colors"
                >
                  {summary.nextAction}
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-stone-500 leading-relaxed">
              {isPharma
                ? `Ready to begin your ${upperType} submission. Ask AnA to draft your first CTD section, or use Tools to start from a template.`
                : isDevice
                  ? `Ready to begin your ${upperType} submission. Ask AnA to help structure your device documentation.`
                  : 'Start a conversation with AnA below, or use Tools to create your first document.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectHomeDashboard;
