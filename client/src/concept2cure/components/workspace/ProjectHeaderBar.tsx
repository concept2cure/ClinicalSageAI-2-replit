/**
 * ProjectHeaderBar — Claude.ai-style persistent project context strip
 *
 * Per .claude/skills/project-design.md §3:
 * Shows submission type badge, project name, product name, readiness score,
 * target agency, and config button. Persistent at top of chat area.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Settings2, ChevronDown, Target } from 'lucide-react';

// ─── Submission type badge config (aligned to spec §3) ──────────────────────

const SUBMISSION_BADGE: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  '510K': { label: '510(k)', color: 'text-blue-700', bg: 'bg-blue-100' },
  IND: { label: 'IND', color: 'text-purple-700', bg: 'bg-purple-100' },
  NDA: { label: 'NDA', color: 'text-indigo-700', bg: 'bg-indigo-100' },
  BLA: { label: 'BLA', color: 'text-violet-700', bg: 'bg-violet-100' },
  PMA: { label: 'PMA', color: 'text-red-700', bg: 'bg-red-100' },
  MAA: { label: 'MAA', color: 'text-teal-700', bg: 'bg-teal-100' },
  DE_NOVO: { label: 'De Novo', color: 'text-cyan-700', bg: 'bg-cyan-100' },
  EUA: { label: 'EUA', color: 'text-orange-700', bg: 'bg-orange-100' },
  IVDR: { label: 'IVDR', color: 'text-green-700', bg: 'bg-green-100' },
};

const FALLBACK_BADGE = {
  label: 'Project',
  color: 'text-zinc-600',
  bg: 'bg-zinc-100',
};

// ─── Readiness score styling ─────────────────────────────────────────────────

function readinessColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-500';
}

function readinessBg(score: number): string {
  if (score >= 80) return 'bg-emerald-50';
  if (score >= 50) return 'bg-amber-50';
  return 'bg-red-50';
}

// ─── Component ──────────────────────────────────────────────────────────────

export interface ProjectHeaderBarProps {
  projectName: string;
  submissionType: string;
  productName?: string;
  targetAgency?: string;
  readinessScore?: number;
  onOpenConfig?: () => void;
  onSwitchProject?: () => void;
  className?: string;
}

export const ProjectHeaderBar: React.FC<ProjectHeaderBarProps> = ({
  projectName,
  submissionType,
  productName,
  targetAgency,
  readinessScore,
  onOpenConfig,
  onSwitchProject,
  className,
}) => {
  const badge = SUBMISSION_BADGE[submissionType] ?? FALLBACK_BADGE;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-5 py-3 border-b border-stone-150 bg-[#f9f8f6]/80 backdrop-blur-sm flex-shrink-0',
        className
      )}
    >
      {/* Colored accent dot + Project name */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-indigo-500"
        />
        <button
          onClick={onSwitchProject}
          className="flex items-center gap-1.5 min-w-0 hover:opacity-70 transition-opacity"
          title={projectName}
        >
          <span className="text-[15px] font-semibold text-stone-900 truncate max-w-[320px]">
            {projectName}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
        </button>
        {/* Subtle submission type label */}
        <span
          className={cn(
            'text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0',
            badge.bg,
            badge.color
          )}
        >
          {badge.label}
        </span>
      </div>

      {/* Config button */}
      <button
        onClick={onOpenConfig}
        className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors flex-shrink-0"
        aria-label="Project settings"
        title="Project settings"
      >
        <Settings2 className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ProjectHeaderBar;
