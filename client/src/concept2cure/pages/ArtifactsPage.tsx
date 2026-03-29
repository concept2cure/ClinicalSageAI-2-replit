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
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { Input } from '@/components/ui/input';
import { WorkspaceCanvas, PageTitleHeader } from '@/components/ui/workspace-primitives';
import { DataStateWrapper } from '@/components/ui/statesV2';
import {
  FileStack,
  Search,
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

// Monochrome status — stone background, semantic text color only
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'text-stone-500' },
  review: { label: 'In Review', color: 'text-amber-600' },
  approved: { label: 'Approved', color: 'text-emerald-600' },
  locked: { label: 'Submission Ready', color: 'text-blue-600' },
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
    queryKey: queryKeys.artifacts.global,
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
      list = list.filter(a => (a.status || 'draft') === activeTab);
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
      draft: all.filter(a => (a.status || 'draft') === 'draft').length,
      review: all.filter(a => (a.status || 'draft') === 'review').length,
      approved: all.filter(a => (a.status || 'draft') === 'approved').length,
      locked: all.filter(a => (a.status || 'draft') === 'locked').length,
    };
  }, [artifacts]);

  return (
    <WorkspaceCanvas maxWidth="5xl" testId="artifacts-page">
      <PageTitleHeader
        title="Documents"
        subtitle="Governed outputs across all projects"
        icon={<FileStack className="w-5 h-5 text-stone-500" />}
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 mt-4 mb-3 border-b border-stone-100 pb-2">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md transition-colors',
              activeTab === tab.key
                ? 'bg-stone-200 text-stone-900 font-medium'
                : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
            )}
          >
            {tab.label}
            <span className="ml-1 text-[10px] opacity-60">{tabCounts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <Input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search artifacts by title, project, section, or type..."
          className="w-full pl-10 pr-4 text-sm"
        />
      </div>

      {/* Results */}
      <DataStateWrapper
        data={filtered}
        isLoading={isLoading}
        error={error}
        emptyTitle="No artifacts found"
        emptyDescription={searchQuery ? 'Try a different search term' : 'Create artifacts from the Work tab or Apps'}
      >
        {(items) => (
          <div className="space-y-0.5">
            {items.map((artifact: Artifact) => {
              const statusCfg = STATUS_CONFIG[artifact.status || 'draft'] ?? STATUS_CONFIG.draft;
              // Compact metadata: "ProjectName · 2.5 · v3 · In Review"
              const meta = [
                artifact.projectName,
                artifact.ctdSection,
                artifact.version ? `v${artifact.version}` : null,
              ].filter(Boolean).join(' · ');
              return (
                <button
                  key={artifact.id}
                  onClick={() => artifact.projectId && onOpenArtifact?.(artifact.projectId, artifact.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-stone-50 transition-colors text-left focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
                >
                  <FileText className="w-4 h-4 text-stone-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-stone-800 truncate block">{artifact.title}</span>
                    {meta && (
                      <span className="text-[11px] text-stone-400 truncate block mt-0.5">{meta}</span>
                    )}
                  </div>
                  <span className={cn('text-[11px] font-medium flex-shrink-0', statusCfg.color)}>
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
