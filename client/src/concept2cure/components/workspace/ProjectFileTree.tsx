/**
 * ProjectFileTree — Codespaces-style collapsible file/document explorer.
 *
 * Groups project artifacts into virtual folders by category, with collapsible
 * sections, document counts, status badges, and active selection state.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronRight,
  FileText,
  FolderOpen,
  Folder,
  CheckCircle,
  Lock,
  Clock,
  AlertTriangle,
  Plus,
  Scissors,
  MapPin,
  Copy,
  ClipboardPaste,
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
  /** Governed placement actions */
  onCutDocument?: (artifact: TreeArtifact) => void;
  onOpenPlacement?: (artifact: TreeArtifact) => void;
  onCopyCtdPath?: (artifact: TreeArtifact) => void;
  /** Active pending move (cut/paste) */
  pendingMove?: { artifact: TreeArtifact; fromSection: string | null } | null;
  onPasteHere?: (folderKey: string) => void;
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
      return <Clock className="w-3 h-3 text-zinc-400 shrink-0" />;
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
  onCutDocument,
  onOpenPlacement,
  onCopyCtdPath,
  pendingMove,
  onPasteHere,
  className,
}) => {
  // Track which folders are expanded (default: expand folders that have items)
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    FOLDER_ORDER.forEach(f => initial.add(f));
    return initial;
  });

  // Context menu state for file nodes
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    artifact: TreeArtifact;
  } | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleFileContextMenu = useCallback(
    (e: React.MouseEvent, artifact: TreeArtifact) => {
      if (!onCutDocument && !onOpenPlacement && !onCopyCtdPath) return;
      e.preventDefault();
      e.stopPropagation();
      const menuW = 200,
        menuH = 180;
      const x = Math.min(e.clientX, window.innerWidth - menuW);
      const y = Math.min(e.clientY, window.innerHeight - menuH);
      setContextMenu({ x, y, artifact });
    },
    [onCutDocument, onOpenPlacement, onCopyCtdPath]
  );

  // Dismiss context menu on Escape
  React.useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [contextMenu]);

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
      <div className="flex items-center justify-between px-3 h-8 border-b border-zinc-200 bg-zinc-50/60 shrink-0">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          Explorer
        </span>
        {onCreateNew && (
          <button
            onClick={onCreateNew}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors"
            title="New document"
            aria-label="New document"
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
                aria-expanded={isExpanded}
                className={cn(
                  'w-full flex items-center gap-1.5 px-2 py-[5px] text-left transition-all duration-150 group focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded',
                  isFolderSelected
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:translate-x-px'
                )}
                data-testid={`folder-${folder.key}`}
              >
                {isExpanded ? (
                  <ChevronRight className="w-3 h-3 shrink-0 text-zinc-400 transition-transform duration-150 rotate-90" />
                ) : (
                  <ChevronRight className="w-3 h-3 shrink-0 text-zinc-400 transition-transform duration-150" />
                )}
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                ) : (
                  <Folder className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                )}
                <span className="text-[12px] font-medium truncate flex-1">{folder.label}</span>
                {count > 0 && (
                  <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">{count}</span>
                )}
              </button>

              {/* Children (files) */}
              {isExpanded && folder.children.length === 0 && (
                <p className="pl-7 pr-2 py-1.5 text-[11px] text-zinc-400 italic">No documents</p>
              )}
              {isExpanded &&
                folder.children.map(a => {
                  const isSelected = a.id === selectedId;
                  return (
                    <button
                      key={a.id}
                      onClick={() => onSelect(a)}
                      onContextMenu={e => handleFileContextMenu(e, a)}
                      className={cn(
                        'w-full flex items-center gap-1.5 pl-7 pr-2 py-[4px] text-left transition-all duration-150 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded',
                        isSelected
                          ? 'bg-blue-100/70 text-blue-800'
                          : 'text-zinc-600 hover:bg-zinc-50 hover:translate-x-px'
                      )}
                      data-testid="tree-file-node"
                      title={a.title}
                    >
                      <FileText
                        className={cn(
                          'w-3.5 h-3.5 shrink-0',
                          isSelected ? 'text-blue-600' : 'text-zinc-400'
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

      {/* Pending cut/paste banner */}
      {pendingMove && (
        <div className="px-3 py-1.5 border-t border-amber-200 bg-amber-50 text-[11px] text-amber-700 flex items-center gap-1.5 shrink-0">
          <Scissors className="w-3 h-3" />
          <span className="truncate flex-1">Cut: {pendingMove.artifact.title}</span>
        </div>
      )}

      {/* File context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 min-w-[180px] animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => {
            e.stopPropagation();
            closeContextMenu();
          }}
          role="menu"
          aria-label="File actions"
        >
          <div className="px-3 py-1.5 border-b border-zinc-200">
            <p className="text-[11px] text-zinc-600 truncate">{contextMenu.artifact.title}</p>
            {contextMenu.artifact.ctdSection && (
              <p className="text-[11px] text-zinc-400 font-mono">
                {contextMenu.artifact.ctdSection}
              </p>
            )}
          </div>
          {onCutDocument && (
            <button
              onClick={() => {
                onCutDocument(contextMenu.artifact);
                closeContextMenu();
              }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-zinc-700 hover:bg-zinc-50 transition-colors flex items-center gap-2 focus-visible:outline-none"
              role="menuitem"
            >
              <Scissors className="w-3 h-3" />
              Cut (move)
            </button>
          )}
          {onOpenPlacement && (
            <button
              onClick={() => {
                onOpenPlacement(contextMenu.artifact);
                closeContextMenu();
              }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-zinc-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2 focus-visible:outline-none"
              role="menuitem"
            >
              <MapPin className="w-3 h-3" />
              Place in dossier…
            </button>
          )}
          {onCopyCtdPath && contextMenu.artifact.ctdSection && (
            <button
              onClick={() => {
                onCopyCtdPath(contextMenu.artifact);
                closeContextMenu();
              }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-zinc-700 hover:bg-zinc-50 transition-colors flex items-center gap-2 focus-visible:outline-none"
              role="menuitem"
            >
              <Copy className="w-3 h-3" />
              Copy CTD path
            </button>
          )}
          {pendingMove && onPasteHere && (
            <button
              onClick={() => {
                onPasteHere(contextMenu.artifact.ctdSection || '');
                closeContextMenu();
              }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-amber-700 hover:bg-amber-50 transition-colors flex items-center gap-2 focus-visible:outline-none"
              role="menuitem"
            >
              <ClipboardPaste className="w-3 h-3" />
              Paste "{pendingMove.artifact.title}" here
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectFileTree;
