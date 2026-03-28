/**
 * ProjectHeaderBar — Claude.ai-style persistent project context strip
 *
 * Shows colored accent dot, project name, submission type badge,
 * and config button. Persistent at top of chat area.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Settings2, ChevronDown } from 'lucide-react';

// ─── Submission type → hex accent color ─────────────────────────────────────

export const SUBMISSION_TYPE_HEX: Record<string, string> = {
  '510K': '#3b82f6',    // blue-500
  IND: '#8b5cf6',       // violet-500
  NDA: '#22c55e',       // green-500
  BLA: '#f97316',       // orange-500
  PMA: '#ef4444',       // red-500
  MAA: '#ec4899',       // pink-500
  DE_NOVO: '#f59e0b',   // amber-500
  EUA: '#06b6d4',       // cyan-500
  IVDR: '#10b981',      // emerald-500
};

const DEFAULT_COLOR = '#6366f1'; // indigo-500

/** Returns the hex accent color for a project — user color → type color → default */
export function getProjectAccentColor(projectColor?: string | null, submissionType?: string): string {
  if (projectColor) return projectColor;
  if (submissionType && SUBMISSION_TYPE_HEX[submissionType]) return SUBMISSION_TYPE_HEX[submissionType];
  return DEFAULT_COLOR;
}

// ─── Submission type badge config ───────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────────────

export interface ProjectHeaderBarProps {
  projectName: string;
  submissionType: string;
  projectColor?: string;
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
  projectColor,
  onOpenConfig,
  onSwitchProject,
  className,
}) => {
  const badge = SUBMISSION_BADGE[submissionType] ?? FALLBACK_BADGE;
  const accentColor = getProjectAccentColor(projectColor, submissionType);

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
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: accentColor }}
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
