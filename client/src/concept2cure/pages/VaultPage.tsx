/**
 * VaultPage — Project-scoped file and evidence browser.
 *
 * Composes ProjectFileTree with upload capability and search.
 * Shown as the "Vault" project tab.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { WorkspaceCanvas, PageTitleHeader } from '@/components/ui/workspace-primitives';
import { DataStateWrapper } from '@/components/ui/statesV2';
import {
  Archive,
  Search,
  Upload,
  FileText,
  FolderOpen,
  Clock,
  CheckCircle,
  AlertTriangle,
  Lock,
} from 'lucide-react';

interface VaultItem {
  id: string;
  title: string;
  type?: string;
  status?: string;
  folder?: string;
  ctdSection?: string;
  version?: number;
  updatedAt?: string;
}

const FOLDER_LABELS: Record<string, string> = {
  drafts: 'Drafts',
  generated: 'Generated Documents',
  dossier: 'Dossier',
  evidence: 'Evidence Packs',
  cmc: 'CMC',
  ind: 'IND',
  ectd: 'eCTD',
  clinical: 'Clinical / CSR Evidence',
  audit: 'Audit / Provenance',
  final: 'Submitted / Final',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  draft: <Clock className="w-3 h-3 text-zinc-400" />,
  review: <AlertTriangle className="w-3 h-3 text-amber-500" />,
  approved: <CheckCircle className="w-3 h-3 text-emerald-500" />,
  locked: <Lock className="w-3 h-3 text-blue-500" />,
};

interface VaultPageProps {
  projectId?: string;
  projectName?: string;
  onOpenDocument?: (docId: string) => void;
}

export const VaultPage: React.FC<VaultPageProps> = ({ projectId, projectName, onOpenDocument }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const { data: artifacts, isLoading, error } = useQuery<VaultItem[]>({
    queryKey: ['project', projectId, 'vault-artifacts'],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts`);
      if (!res.ok) throw new Error('Failed to load vault items');
      const json = await res.json();
      return json.data ?? json.artifacts ?? json ?? [];
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Group by folder
  const grouped = React.useMemo(() => {
    const items = artifacts ?? [];
    const filtered = searchQuery.trim()
      ? items.filter(a => (a.title || '').toLowerCase().includes(searchQuery.toLowerCase()))
      : items;

    const groups = new Map<string, VaultItem[]>();
    for (const item of filtered) {
      const folder = item.folder || 'drafts';
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder)!.push(item);
    }
    return groups;
  }, [artifacts, searchQuery]);

  if (!projectId) {
    return (
      <WorkspaceCanvas maxWidth="4xl" testId="vault-page">
        <div className="flex flex-col items-center justify-center py-20">
          <Archive className="w-10 h-10 text-zinc-300 mb-3" />
          <p className="text-sm text-zinc-500">Select a project to view its vault</p>
        </div>
      </WorkspaceCanvas>
    );
  }

  return (
    <WorkspaceCanvas maxWidth="5xl" testId="vault-page">
      <PageTitleHeader
        title="Vault"
        subtitle={`Files and evidence for ${projectName || 'project'}`}
        icon={<Archive className="w-5 h-5 text-zinc-500" />}
      />

      {/* Toolbar: search + upload */}
      <div className="flex items-center gap-3 mt-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search files and artifacts..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-700 placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-300 outline-none transition-all"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors">
          <Upload className="w-4 h-4" />
          Upload
        </button>
      </div>

      {/* File tree grouped by folder */}
      <DataStateWrapper
        data={artifacts}
        isLoading={isLoading}
        error={error}
        emptyMessage="No files or artifacts in this project yet"
        emptyIcon="document"
      >
        {() => (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([folder, items]) => (
              <div key={folder}>
                <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                  <FolderOpen className="w-4 h-4 text-zinc-400" />
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    {FOLDER_LABELS[folder] || folder}
                  </span>
                  <span className="text-[10px] text-zinc-400 ml-1">{items.length}</span>
                </div>
                <div className="space-y-0.5">
                  {items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => onOpenDocument?.(item.id)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-50 transition-colors text-left"
                    >
                      <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <span className="flex-1 text-sm text-zinc-700 truncate">{item.title}</span>
                      {item.ctdSection && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium flex-shrink-0">
                          {item.ctdSection}
                        </span>
                      )}
                      {item.status && STATUS_ICON[item.status]}
                      {item.version && (
                        <span className="text-[10px] text-zinc-400 tabular-nums flex-shrink-0">v{item.version}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {grouped.size === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-zinc-400">No matching files</p>
              </div>
            )}
          </div>
        )}
      </DataStateWrapper>
    </WorkspaceCanvas>
  );
};

export default VaultPage;
