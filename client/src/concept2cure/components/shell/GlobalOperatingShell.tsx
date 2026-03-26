import React from 'react';
import { Layers, FolderKanban, FileText, Archive, ScrollText, Search, ShieldCheck, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GlobalOperatingShellProps {
  layoutMode: string;
  activeProjectName?: string;
  currentGlobalNodeLabel?: string;
  activeArtifactLabel?: string;
  onAction?: (action: 'home' | 'search' | 'vault' | 'review' | 'reports' | 'submission') => void;
  children: React.ReactNode;
}

const LAYERS = [
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'vault', label: 'Vault', icon: Archive },
  { id: 'reports', label: 'Reports', icon: ScrollText },
] as const;

export function GlobalOperatingShell({
  layoutMode,
  activeProjectName,
  currentGlobalNodeLabel,
  activeArtifactLabel,
  onAction,
  children,
}: GlobalOperatingShellProps) {
  const showHeader = [
    'regulatory-workspace',
    'documents',
    'report-engine',
    'submissions',
    'review',
    'dossier-map',
  ].includes(layoutMode);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {showHeader && (
        <div className="h-9 border-b border-zinc-200 bg-white px-3 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-700">Concept2Cure OS</span>
          {activeProjectName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">{activeProjectName}</span>
          )}
          {activeArtifactLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
              {activeArtifactLabel}
            </span>
          )}
          {currentGlobalNodeLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
              {currentGlobalNodeLabel}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {onAction && (
              <>
                <button
                  type="button"
                  onClick={() => onAction('home')}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-100"
                >
                  <FolderKanban className="w-3 h-3" />
                  Home
                </button>
                <button
                  type="button"
                  onClick={() => onAction('search')}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-100"
                >
                  <Search className="w-3 h-3" />
                  Search
                </button>
                <button
                  type="button"
                  onClick={() => onAction('vault')}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-100"
                >
                  <Archive className="w-3 h-3" />
                  Vault
                </button>
                <button
                  type="button"
                  onClick={() => onAction('review')}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-100"
                >
                  <ShieldCheck className="w-3 h-3" />
                  Review
                </button>
                <button
                  type="button"
                  onClick={() => onAction('reports')}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-100"
                >
                  <ScrollText className="w-3 h-3" />
                  Reports
                </button>
                <button
                  type="button"
                  onClick={() => onAction('submission')}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-100"
                >
                  <Send className="w-3 h-3" />
                  Submission
                </button>
              </>
            )}
            {LAYERS.map(layer => {
              const Icon = layer.icon;
              const isActive =
                (layoutMode === 'documents' || layoutMode === 'regulatory-workspace') && layer.id === 'documents' ||
                (layoutMode === 'report-engine' && layer.id === 'reports') ||
                (layoutMode === 'projects' && layer.id === 'projects');
              return (
                <span
                  key={layer.id}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]',
                    isActive
                      ? 'border-zinc-300 bg-zinc-100 text-zinc-700'
                      : 'border-zinc-200 bg-white text-zinc-400'
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {layer.label}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

export default GlobalOperatingShell;
