/**
 * WorkspaceReadinessStrip
 *
 * A compact stats bar rendered under the ZenApp greeting.
 * Shows: projects · docs · threads · pending reviews · compliance score.
 * Data is pulled from /api/workspace/summary — no faking.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import {
  FolderOpen,
  FileText,
  MessageSquare,
  AlertTriangle,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import type { WorkspaceSummaryCounts } from '../../hooks/useWorkspaceSummary';

interface Props {
  counts: WorkspaceSummaryCounts | undefined;
  isLoading?: boolean;
  orgName?: string;
  className?: string;
}

interface StatPillProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color?: string;
  pulse?: boolean;
}

const ICON_COLOR_MAP: Record<string, string> = {
  zinc: 'text-zinc-500',
  blue: 'text-blue-500',
  violet: 'text-violet-500',
  amber: 'text-amber-500',
  emerald: 'text-emerald-500',
  red: 'text-red-500',
};

const StatPill: React.FC<StatPillProps> = ({ icon: Icon, label, value, color = 'zinc', pulse }) => (
  <div
    className={cn(
      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border',
      'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 transition-colors',
      pulse && 'animate-pulse'
    )}
    title={label}
  >
    <Icon className={cn('w-3.5 h-3.5', ICON_COLOR_MAP[color] || 'text-zinc-500')} />
    <span className="text-zinc-900 font-semibold tabular-nums">{value}</span>
    <span className="text-zinc-400 hidden sm:inline">{label}</span>
  </div>
);

export const WorkspaceReadinessStrip: React.FC<Props> = ({
  counts,
  isLoading,
  orgName,
  className,
}) => {
  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 py-2 px-1', className)}>
        <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />
        <span className="text-xs text-zinc-400">Loading workspace…</span>
      </div>
    );
  }

  if (!counts) return null;

  const { projects, documents, threads, pendingReviews, complianceScore } = counts;

  return (
    <div className={cn('flex flex-wrap items-center gap-2 py-2', className)}>
      {/* Org context label */}
      {orgName && (
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mr-1 hidden sm:inline">
          {orgName}
        </span>
      )}

      <StatPill icon={FolderOpen} label="projects" value={projects} color="blue" />
      <StatPill icon={FileText} label="docs" value={documents} color="violet" />
      <StatPill icon={MessageSquare} label="threads" value={threads} color="zinc" />

      {pendingReviews > 0 && (
        <StatPill icon={AlertTriangle} label="pending" value={pendingReviews} color="amber" pulse />
      )}

      {complianceScore > 0 && (
        <div
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border',
            complianceScore >= 95
              ? 'bg-green-50 border-green-200 text-green-700'
              : complianceScore >= 80
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-red-50 border-red-200 text-red-700'
          )}
          title="Compliance readiness score"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="font-semibold tabular-nums">{complianceScore}%</span>
          <span className="hidden sm:inline">&nbsp;ready</span>
        </div>
      )}

      {/* Empty state coaching */}
      {projects === 0 && documents === 0 && (
        <span className="text-xs text-zinc-400 italic ml-1">
          No projects yet — create one to get started
        </span>
      )}
    </div>
  );
};

export default WorkspaceReadinessStrip;
