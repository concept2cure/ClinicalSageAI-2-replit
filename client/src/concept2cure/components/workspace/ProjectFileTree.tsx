/**
 * ProjectFileTree — Codespaces-style collapsible file/document explorer.
 *
 * Groups project artifacts into virtual folders by category, with collapsible
 * sections, document counts, status badges, and active selection state.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  FolderOpen,
  Folder,
  CheckCircle,
  Lock,
  Clock,
  AlertTriangle,
  Plus,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TreeArtifact {
  id: string;
  title: string;
  type: string;
  category: string;
  status?: string;
  ctdSection?: string;
  templateId?: string;
  version: number;
  updatedAt: string;
}

interface FolderNode {
  key: string;
  label: string;
  children: TreeArtifact[];
}

interface ProjectFileTreeProps {
  artifacts: TreeArtifact[];
  selectedId?: string;
  onSelect: (artifact: TreeArtifact) => void;
  onSelectFolder: (folderKey: string) => void;
  selectedFolder?: string;
  onCreateNew?: () => void;
  className?: string;
}

// ── Folder definitions ───────────────────────────────────────────────────────

const FOLDER_ORDER = [
  'drafts',
  'generated',
  'dossier',
  'evidence',
  'cmc',
  'ind',
  'ectd',
  'clinical',
  'audit',
  'final',
] as const;

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

function classifyArtifact(a: TreeArtifact): string {
  const t = (a.type || '').toLowerCase();
  const cat = (a.category || '').toLowerCase();
  const status = (a.status || '').toLowerCase();
  const ctd = (a.ctdSection || '').toLowerCase();

  if (status === 'approved' || status === 'locked' || status === 'published') return 'final';
  if (t.includes('audit') || cat.includes('audit') || t.includes('provenance')) return 'audit';
  if (t.includes('clinical') || t.includes('csr') || cat.includes('clinical')) return 'clinical';
  if (ctd.startsWith('3.2') || t.includes('cmc') || cat.includes('cmc')) return 'cmc';
  if (t.includes('ind') || cat.includes('ind')) return 'ind';
  if (t.includes('ectd') || cat.includes('ectd') || cat.includes('dossier')) return 'dossier';
  if (t.includes('evidence') || cat.includes('evidence')) return 'evidence';
  if (t.includes('generated') || cat.includes('generated')) return 'generated';
  // Default: drafts
  return 'drafts';
}

// ── Status icon helper ───────────────────────────────────────────────────────

function StatusIcon({ status }: { status?: string }) {
  switch (status) {
    case 'approved':
      return <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />;
    case 'locked':
      return <Lock className="w-3 h-3 text-red-500 shrink-0" />;
    case 'review':
      return <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />;
    case 'draft':
    default:
      return <Clock className="w-3 h-3 text-zinc-300 shrink-0" />;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export const ProjectFileTree: React.FC<ProjectFileTreeProps> = ({
  artifacts,
  selectedId,
  onSelect,
  onSelectFolder,
  selectedFolder,
  onCreateNew,
  className,
}) => {
  // Track which folders are expanded (default: expand folders that have items)
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    FOLDER_ORDER.forEach(f => initial.add(f));
    return initial;
  });

  const folders = useMemo<FolderNode[]>(() => {
    const grouped: Record<string, TreeArtifact[]> = {};
    FOLDER_ORDER.forEach(f => (grouped[f] = []));

    artifacts.forEach(a => {
      const folder = classifyArtifact(a);
      if (!grouped[folder]) grouped[folder] = [];
      grouped[folder].push(a);
    });

    return FOLDER_ORDER.map(key => ({
      key,
      label: FOLDER_LABELS[key] || key,
      children: grouped[key] || [],
    }));
  }, [artifacts]);

  const toggleFolder = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className={cn('flex flex-col h-full', className)} data-testid="project-file-tree">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-zinc-100 bg-zinc-50/60 shrink-0">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          Explorer
        </span>
        {onCreateNew && (
          <button
            onClick={onCreateNew}
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            title="New document"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1 zen-scroll" data-testid="file-tree-body">
        {folders.map(folder => {
          const isExpanded = expanded.has(folder.key);
          const isFolderSelected = selectedFolder === folder.key && !selectedId;
          const count = folder.children.length;

          return (
            <div key={folder.key}>
              {/* Folder row */}
              <button
                onClick={() => {
                  toggleFolder(folder.key);
                  onSelectFolder(folder.key);
                }}
                className={cn(
                  'w-full flex items-center gap-1.5 px-2 py-[5px] text-left transition-colors group',
                  isFolderSelected ? 'bg-blue-50 text-blue-700' : 'text-zinc-600 hover:bg-zinc-50'
                )}
                data-testid={`folder-${folder.key}`}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 shrink-0 text-zinc-400" />
                ) : (
                  <ChevronRight className="w-3 h-3 shrink-0 text-zinc-400" />
                )}
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                ) : (
                  <Folder className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                )}
                <span className="text-[12px] font-medium truncate flex-1">{folder.label}</span>
                {count > 0 && (
                  <span className="text-[10px] text-zinc-400 tabular-nums shrink-0">{count}</span>
                )}
              </button>

              {/* Children (files) */}
              {isExpanded &&
                folder.children.map(a => {
                  const isSelected = a.id === selectedId;
                  return (
                    <button
                      key={a.id}
                      onClick={() => onSelect(a)}
                      className={cn(
                        'w-full flex items-center gap-1.5 pl-7 pr-2 py-[4px] text-left transition-colors',
                        isSelected
                          ? 'bg-blue-100/70 text-blue-800'
                          : 'text-zinc-600 hover:bg-zinc-50'
                      )}
                      data-testid="tree-file-node"
                      title={a.title}
                    >
                      <FileText
                        className={cn(
                          'w-3.5 h-3.5 shrink-0',
                          isSelected ? 'text-blue-600' : 'text-zinc-300'
                        )}
                      />
                      <span className="text-[12px] truncate flex-1 leading-snug">{a.title}</span>
                      <StatusIcon status={a.status} />
                    </button>
                  );
                })}
            </div>
          );
        })}

        {/* Empty state */}
        {artifacts.length === 0 && (
          <div className="px-4 py-6 text-center">
            <FileText className="w-5 h-5 text-zinc-200 mx-auto mb-2" />
            <p className="text-[11px] text-zinc-400">No documents yet.</p>
            {onCreateNew && (
              <button
                onClick={onCreateNew}
                className="mt-2 text-[11px] text-blue-600 hover:text-blue-700 font-medium"
              >
                Create first document
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectFileTree;
