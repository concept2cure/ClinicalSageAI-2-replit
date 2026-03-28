import React, { useMemo, useState } from 'react';
import { FolderKanban, FileText, Archive, ScrollText, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TreeArtifact } from './ProjectFileTree';

export type RegistryKind = 'projects' | 'documents' | 'vault' | 'reports';

interface OperatingSystemRegistryPanelProps {
  projectId?: string;
  projectName?: string;
  artifacts: TreeArtifact[];
  activeRegistry: RegistryKind;
  onRegistryChange: (registry: RegistryKind) => void;
}

const REGISTRY_META: Record<RegistryKind, { label: string; icon: React.ComponentType<{ className?: string }>; helper: string }> = {
  projects: {
    label: 'Project Registry',
    icon: FolderKanban,
    helper: 'Canonical program records and workspace-level ownership.',
  },
  documents: {
    label: 'Document Registry',
    icon: FileText,
    helper: 'Document identities, section placement, status, and governance.',
  },
  vault: {
    label: 'Vault Registry',
    icon: Archive,
    helper: 'Evidence assets, immutable IDs, and storage provenance.',
  },
  reports: {
    label: 'Report Registry',
    icon: ScrollText,
    helper: 'Narratives, snapshots, and generated reporting artifacts.',
  },
};

export function OperatingSystemRegistryPanel({
  projectId,
  projectName,
  artifacts,
  activeRegistry,
  onRegistryChange,
}: OperatingSystemRegistryPanelProps) {
  const [query, setQuery] = useState('');

  const registryRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = artifacts.filter(artifact => {
      if (activeRegistry === 'vault') {
        return artifact.folder === 'evidence' || artifact.folder === 'audit';
      }
      if (activeRegistry === 'reports') {
        const title = (artifact.title || '').toLowerCase();
        return title.includes('report') || artifact.folder === 'final';
      }
      return true;
    });

    return base.filter(artifact => {
      if (!q) return true;
      return (
        artifact.title?.toLowerCase().includes(q) ||
        artifact.ctdSection?.toLowerCase().includes(q) ||
        artifact.status?.toLowerCase().includes(q)
      );
    });
  }, [activeRegistry, artifacts, query]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="border-b border-stone-200 bg-stone-50/60 px-2 py-2 space-y-2">
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(REGISTRY_META) as RegistryKind[]).map(kind => {
            const Icon = REGISTRY_META[kind].icon;
            return (
              <button
                key={kind}
                onClick={() => onRegistryChange(kind)}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
                  activeRegistry === kind
                    ? 'bg-white border-stone-300 text-stone-900'
                    : 'bg-transparent border-transparent text-stone-500 hover:text-stone-700 hover:bg-white/70'
                )}
              >
                <Icon className="w-3 h-3" />
                {REGISTRY_META[kind].label.replace(' Registry', '')}
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-white border border-stone-200">
          <Search className="w-3 h-3 text-stone-400" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter registry"
            className="w-full text-xs bg-transparent outline-none placeholder:text-stone-400"
          />
        </label>
      </div>

      <div className="px-2 py-1.5 border-b border-stone-200 text-[11px] text-stone-500 bg-white">
        <div className="font-medium text-stone-700">{REGISTRY_META[activeRegistry].label}</div>
        <div>{REGISTRY_META[activeRegistry].helper}</div>
        <div className="mt-1">{projectName || 'Project'} #{projectId || '—'} · {registryRows.length} records</div>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {registryRows.map(row => (
          <div key={row.id} className="rounded-md border border-stone-200 bg-white px-2 py-1.5">
            <div className="text-xs font-medium text-stone-800 truncate">{row.title}</div>
            <div className="text-[11px] text-stone-500 flex items-center gap-1.5 mt-0.5">
              <span>{row.ctdSection || 'Unplaced'}</span>
              <span>·</span>
              <span>{row.status || 'draft'}</span>
              <span>·</span>
              <span>{row.folder || 'drafts'}</span>
            </div>
          </div>
        ))}
        {registryRows.length === 0 && (
          <div className="text-xs text-stone-400 p-3 text-center">No records match this registry filter.</div>
        )}
      </div>
    </div>
  );
}

export default OperatingSystemRegistryPanel;
