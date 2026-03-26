import React from 'react';
import {
  Home,
  Search,
  Archive,
  ShieldCheck,
  ScrollText,
  Send,
  Layers,
  FolderKanban,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GlobalOperatingShellProps {
  layoutMode: string;
  activeProjectName?: string;
  activeArtifactLabel?: string;
  onNavigateGlobal?: (target: 'projects' | 'documents' | 'vault' | 'review' | 'reports' | 'submissions') => void;
  children: React.ReactNode;
}

const GLOBAL_NODES = [
  { id: 'projects', label: 'Home', icon: Home },
  { id: 'documents', label: 'Search', icon: Search },
  { id: 'vault', label: 'Vault', icon: Archive },
  { id: 'review', label: 'Review', icon: ShieldCheck },
  { id: 'reports', label: 'Reports', icon: ScrollText },
  { id: 'submissions', label: 'Submission', icon: Send },
] as const;

function mapLayoutToGlobalNode(layoutMode: string): (typeof GLOBAL_NODES)[number]['id'] {
  const map: Record<string, (typeof GLOBAL_NODES)[number]['id']> = {
    projects: 'projects',
    'project-home': 'projects',
    documents: 'documents',
    'regulatory-workspace': 'documents',
    'section-workspace': 'documents',
    review: 'review',
    'review-readiness': 'review',
    reports: 'reports',
    'report-engine': 'reports',
    vault: 'vault',
    'vault-workspace': 'vault',
    submissions: 'submissions',
  };
  return map[layoutMode] ?? 'documents';
}

export function GlobalOperatingShell({
  layoutMode,
  activeProjectName,
  activeArtifactLabel,
  onNavigateGlobal,
  children,
}: GlobalOperatingShellProps) {
  const activeGlobalNode = mapLayoutToGlobalNode(layoutMode);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <div className="h-10 border-b border-zinc-200 bg-white px-3 flex items-center gap-2 shrink-0">
        <Layers className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-xs font-semibold text-zinc-700">Concept2Cure OS</span>
        {activeProjectName && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
            <FolderKanban className="w-3 h-3 inline mr-1" />
            {activeProjectName}
          </span>
        )}
        {activeArtifactLabel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 max-w-[220px] truncate">
            <FileText className="w-3 h-3 inline mr-1" />
            {activeArtifactLabel}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {GLOBAL_NODES.map(node => {
            const Icon = node.icon;
            const isActive = node.id === activeGlobalNode;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onNavigateGlobal?.(node.id)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]',
                  isActive
                    ? 'border-zinc-300 bg-zinc-100 text-zinc-800'
                    : 'border-zinc-200 bg-white text-zinc-500 hover:text-zinc-700'
                )}
              >
                <Icon className="w-3 h-3" />
                {node.label}
              </button>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}

export default GlobalOperatingShell;
