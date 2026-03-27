/**
 * ArtifactsPage — Global governed outputs browser.
 *
 * Fetches all artifacts across projects via GET /api/concept2cure/artifacts.
 * Tab filters: All, Drafts, In Review, Approved, Submission Ready.
 * Search + project filter.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { WorkspaceCanvas, PageTitleHeader } from '@/components/ui/workspace-primitives';
import { DataStateWrapper } from '@/components/ui/statesV2';
import {
  FileStack,
  Search,
  Clock,
  AlertTriangle,
  CheckCircle,
  Lock,
  FolderOpen,
  FileText,
} from 'lucide-react';

type ArtifactStatus = 'draft' | 'review' | 'approved' | 'locked';
type TabFilter = 'all' | 'draft' | 'review' | 'approved' | 'locked';

interface Artifact {
  id: string;
  title: string;
  status?: ArtifactStatus;
  version?: number;
  ctdSection?: string;
  projectId?: string;
  projectName?: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  draft: { label: 'Draft', icon: Clock, color: 'text-zinc-600', bg: 'bg-zinc-100' },
  review: { label: 'In Review', icon: AlertTriangle, color: 'text-amber-700', bg: 'bg-amber-50' },
  approved: { label: 'Approved', icon: CheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-50' },
  locked: { label: 'Submission Ready', icon: Lock, color: 'text-blue-700', bg: 'bg-blue-50' },
};

const TABS: { key: TabFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'review', label: 'In Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'locked', label: 'Submission Ready' },
];

interface ArtifactsPageProps {
  onOpenArtifact?: (projectId: string, artifactId: string) => void;
}

export const ArtifactsPage: React.FC<ArtifactsPageProps> = ({ onOpenArtifact }) => {
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: artifacts, isLoading, error } = useQuery<Artifact[]>({
    queryKey: ['global', 'artifacts'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/concept2cure/artifacts');
      if (!res.ok) throw new Error('Failed to load artifacts');
      const json = await res.json();
      return json.data ?? json.artifacts ?? json ?? [];
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    let list = artifacts ?? [];
    if (activeTab !== 'all') {
      list = list.filter(a => a.status === activeTab);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a =>
        (a.title || '').toLowerCase().includes(q) ||
        (a.projectName || '').toLowerCase().includes(q) ||
        (a.ctdSection || '').toLowerCase().includes(q) ||
        (a.type || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [artifacts, activeTab, searchQuery]);

  const tabCounts = useMemo(() => {
    const all = artifacts ?? [];
    return {
      all: all.length,
      draft: all.filter(a => a.status === 'draft').length,
      review: all.filter(a => a.status === 'review').length,
      approved: all.filter(a => a.status === 'approved').length,
      locked: all.filter(a => a.status === 'locked').length,
    };
  }, [artifacts]);

  return (
    <WorkspaceCanvas maxWidth="5xl" testId="artifacts-page">
      <PageTitleHeader
        title="Artifacts"
        subtitle="Governed outputs across all projects"
        icon={<FileStack className="w-5 h-5 text-zinc-500" />}
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 mt-4 mb-3 border-b border-zinc-100 pb-2">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md transition-colors',
              activeTab === tab.key
                ? 'bg-zinc-200 text-zinc-900 font-medium'
                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
            )}
          >
            {tab.label}
            <span className="ml-1 text-[10px] opacity-60">{tabCounts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search artifacts by title, project, section, or type..."
          className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-700 placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-300 outline-none transition-all"
        />
      </div>

      {/* Results */}
      <DataStateWrapper
        data={filtered}
        isLoading={isLoading}
        error={error}
        emptyMessage="No artifacts found"
        emptyIcon="document"
      >
        {(items) => (
          <div className="space-y-1">
            {items.map((artifact: Artifact) => {
              const statusCfg = STATUS_CONFIG[artifact.status || 'draft'] ?? STATUS_CONFIG.draft;
              const StatusIcon = statusCfg.icon;
              return (
                <button
                  key={artifact.id}
                  onClick={() => artifact.projectId && onOpenArtifact?.(artifact.projectId, artifact.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-50 transition-colors text-left group"
                >
                  <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-zinc-800 font-medium truncate block">{artifact.title}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {artifact.projectName && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                          <FolderOpen className="w-3 h-3" />
                          {artifact.projectName}
                        </span>
                      )}
                      {artifact.ctdSection && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">
                          {artifact.ctdSection}
                        </span>
                      )}
                    </div>
                  </div>
                  {artifact.version && (
                    <span className="text-[11px] text-zinc-400 tabular-nums flex-shrink-0">v{artifact.version}</span>
                  )}
                  <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0', statusCfg.bg, statusCfg.color)}>
                    <StatusIcon className="w-3 h-3" />
                    {statusCfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </DataStateWrapper>
    </WorkspaceCanvas>
  );
};

export default ArtifactsPage;
