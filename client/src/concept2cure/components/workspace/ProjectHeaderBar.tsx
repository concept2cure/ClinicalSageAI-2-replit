/**
 * ProjectHeaderBar — Claude.ai-style persistent project context strip
 *
 * Sits at the top of the main content area when a project is active.
 * Shows: submission type badge, project name, readiness score, config button.
 *
 * Mirrors claude.ai's project indicator in the chat header.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Settings2, ChevronDown } from 'lucide-react';

// ─── Submission type badge config (matches ProjectSwitcher) ─────────────────

const SUBMISSION_BADGE: Record<string, { label: string; color: string; bg: string }> = {
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

const FALLBACK_BADGE = { label: 'Project', color: 'text-zinc-600', bg: 'bg-zinc-100' };

// ─── Readiness color ────────────────────────────────────────────────────────

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
  readinessScore?: number;
  onOpenConfig?: () => void;
  onSwitchProject?: () => void;
  className?: string;
}

export const ProjectHeaderBar: React.FC<ProjectHeaderBarProps> = ({
  projectName,
  submissionType,
  readinessScore,
  onOpenConfig,
  onSwitchProject,
  className,
}) => {
  const badge = SUBMISSION_BADGE[submissionType] ?? FALLBACK_BADGE;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 border-b border-zinc-100 bg-white/80 backdrop-blur-sm flex-shrink-0',
        className
      )}
    >
      {/* Submission type badge */}
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide',
          badge.bg,
          badge.color
        )}
      >
        {badge.label}
      </span>

      {/* Project name — clickable to open config */}
      <button
        onClick={onOpenConfig}
        className="flex items-center gap-1 text-sm font-medium text-zinc-900 hover:text-zinc-600 transition-colors truncate max-w-[300px]"
        title={projectName}
      >
        {projectName}
      </button>

      {/* Project switcher dropdown trigger */}
      <button
        onClick={onSwitchProject}
        className="p-0.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
        aria-label="Switch project"
        title="Switch project"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      <div className="flex-1" />

      {/* Readiness score */}
      {readinessScore !== undefined && readinessScore > 0 && (
        <div
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium',
            readinessBg(readinessScore)
          )}
        >
          <span className="text-zinc-500">Readiness</span>
          <span className={cn('tabular-nums font-semibold', readinessColor(readinessScore))}>
            {readinessScore}%
          </span>
        </div>
      )}

      {/* Config button */}
      <button
        onClick={onOpenConfig}
        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
        aria-label="Project settings"
        title="Project settings"
      >
        <Settings2 className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ProjectHeaderBar;
