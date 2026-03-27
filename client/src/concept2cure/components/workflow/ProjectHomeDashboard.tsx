/**
 * ProjectHomeDashboard — Overview tab for the project shell.
 *
 * Shows: readiness score, document pipeline, recent artifacts,
 * next recommended actions, and quick navigation to project tabs.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { WorkspaceCanvas, PageTitleHeader } from '@/components/ui/workspace-primitives';
import {
  PenLine,
  Archive,
  ShieldCheck,
  Send,
  ChevronRight,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle,
  Lock,
  TrendingUp,
  Gauge,
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
  type?: string;
  updatedAt?: string;
  version?: number;
}

// ─── Status config ────────────────────────────────────────────────────────────

// Status colors unified with ArtifactsPage
const STATUS_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  draft: { label: 'Draft', icon: Clock, color: 'text-zinc-600', bg: 'bg-zinc-100' },
  review: { label: 'In Review', icon: AlertTriangle, color: 'text-amber-700', bg: 'bg-amber-50' },
  approved: { label: 'Approved', icon: CheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-50' },
  locked: { label: 'Submission Ready', icon: Lock, color: 'text-blue-700', bg: 'bg-blue-50' },
};

// ─── Quick nav cards ──────────────────────────────────────────────────────────

const PROJECT_TABS = [
  { id: 'work', label: 'Work', description: 'Author and edit documents', icon: PenLine, color: 'text-zinc-600 bg-zinc-100' },
  { id: 'vault', label: 'Vault', description: 'Files, evidence, source materials', icon: Archive, color: 'text-zinc-600 bg-zinc-100' },
  { id: 'review-tab', label: 'Review', description: 'Quality, compliance, readiness', icon: ShieldCheck, color: 'text-zinc-600 bg-zinc-100' },
  { id: 'submit', label: 'Submit', description: 'Finalize and export package', icon: Send, color: 'text-zinc-600 bg-zinc-100' },
];

const RECENT_LIMIT = 5;
const VALID_STATUSES = ['draft', 'review', 'approved', 'locked'] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export const ProjectHomeDashboard: React.FC<ProjectHomeDashboardProps> = ({
  project,
  onNavigate,
}) => {
  // Fetch project artifacts for pipeline stats
  const { data: artifacts, isLoading, isError } = useQuery<Artifact[]>({
    queryKey: ['project', project.id, 'overview-artifacts'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${project.id}/artifacts`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : [];
    },
    staleTime: 30_000,
  });

  // Compute pipeline stats
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
    const readinessScore = total > 0 ? Math.round((ready / total) * 100) : 0;
    const recent = [...list]
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, RECENT_LIMIT);
    return { counts, total, ready, readinessScore, recent };
  }, [artifacts]);

  const badges = [
    { label: project.type },
    ...(project.region ? [{ label: project.region }] : []),
    ...(project.sponsor ? [{ label: `Sponsor: ${project.sponsor}` }] : []),
  ];

  return (
    <WorkspaceCanvas maxWidth="4xl" testId="project-home-dashboard">
      <PageTitleHeader
        title={project.name}
        description={project.description ?? undefined}
        badges={badges}
      />

      {/* ── Readiness Score + Pipeline ──────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        {/* Readiness ring */}
        <div className="p-5 rounded-xl border border-zinc-200 bg-white flex items-center gap-5">
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#e4e4e7"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke={stats.readinessScore >= 70 ? '#10b981' : stats.readinessScore >= 40 ? '#f59e0b' : '#ef4444'}
                strokeWidth="3"
                strokeDasharray={`${stats.readinessScore}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-zinc-800">{stats.readinessScore}</span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Gauge className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-semibold text-zinc-800">Readiness Score</span>
            </div>
            <p className="text-xs text-zinc-500">
              {stats.ready} of {stats.total} artifacts approved or ready
            </p>
          </div>
        </div>

        {/* Pipeline counts */}
        <div className="p-5 rounded-xl border border-zinc-200 bg-white">
          <div className="flex items-center gap-1.5 mb-3">
            <TrendingUp className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-semibold text-zinc-800">Artifact Pipeline</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(['draft', 'review', 'approved', 'locked'] as const).map(status => {
              const cfg = STATUS_CONFIG[status];
              const Icon = cfg.icon;
              return (
                <div key={status} className="text-center">
                  <div className={cn('inline-flex items-center justify-center w-8 h-8 rounded-lg mb-1', cfg.bg)}>
                    <Icon className={cn('w-4 h-4', cfg.color)} />
                  </div>
                  {isLoading ? (
                    <div className="h-6 w-8 mx-auto bg-zinc-100 rounded animate-pulse" />
                  ) : (
                    <div className="text-lg font-bold text-zinc-800">{stats.counts[status]}</div>
                  )}
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider">{cfg.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Recent Artifacts ────────────────────────────────────────── */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Recent Artifacts</h3>
          <button
            onClick={() => onNavigate('work')}
            aria-label="View all artifacts"
            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded"
          >
            View all <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-9 bg-zinc-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-6 text-sm text-red-500">
            Failed to load artifacts. Please try again.
          </div>
        ) : stats.recent.length === 0 ? (
          <div className="text-center py-6 text-sm text-zinc-400">
            No artifacts yet. Start in Work to create your first document.
          </div>
        ) : (
          <div className="space-y-1">
            {stats.recent.map(artifact => {
              const cfg = STATUS_CONFIG[artifact.status || 'draft'] ?? STATUS_CONFIG.draft;
              const StatusIcon = cfg.icon;
              return (
                <button
                  key={artifact.id}
                  onClick={() => onNavigate('work')}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-50 transition-colors text-left focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                >
                  <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  <span className="flex-1 text-sm text-zinc-700 truncate" title={artifact.title}>{artifact.title}</span>
                  {artifact.ctdSection && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium flex-shrink-0">
                      {artifact.ctdSection}
                    </span>
                  )}
                  <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0', cfg.bg, cfg.color)}>
                    <StatusIcon className="w-3 h-3" />
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick Navigation ────────────────────────────────────────── */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Project Areas</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PROJECT_TABS.map(tab => {
            const Icon = tab.icon;
            const [iconBg] = tab.color.split(' ');
            return (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                aria-label={`Navigate to ${tab.label}`}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50/50 transition-all text-center group focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              >
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', tab.color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-sm font-medium text-zinc-800 block">{tab.label}</span>
                  <span className="text-[11px] text-zinc-400 block mt-0.5">{tab.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </WorkspaceCanvas>
  );
};

export default ProjectHomeDashboard;
