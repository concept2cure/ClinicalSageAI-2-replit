/**
 * ProjectWorkspaceShell — Clean 3-pane project workspace.
 *
 * Layout: far-left nav rail (ZenSidebar) → [this shell]
 *   left: File/Dossier/Template tree (220px) with mode toggle
 *   center: DocumentListPane (folder) or EditorPanel (document)
 *   right: Inspector panel (provenance/compare/audit) — only when doc open
 *
 * Left-rail modes:
 *   Files     — ProjectFileTree (Codespaces-style category explorer)
 *   Dossier   — DossierTree (ICH CTD Module 1-5 submission structure)
 *   Templates — TemplateTree (IND pyramid template launcher)
 */

import React, { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';

import { ProjectFileTree, type TreeArtifact } from './ProjectFileTree';
import { DocumentListPane } from './DocumentListPane';
import { DossierTree } from './DossierTree';
import { TemplateTree } from './TemplateTree';
import {
  PlacementDialog,
  type PlacementConfirmation,
  type PlacementOperation,
} from './PlacementDialog';
import {
  ChevronLeft,
  Loader2,
  FileText,
  Plus,
  FolderOpen,
  Brain,
  Files,
  BookOpen,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Lazy-load the existing EditorPanel (it handles save, load, AI, inspector drawers)
const EditorPanel = lazy(() => import('../editor/EditorPanel').then(m => ({ default: m.default })));

// ── Auth helper ──────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Left-rail mode type ──────────────────────────────────────────────────────
type LeftRailMode = 'files' | 'dossier' | 'templates';

// ── Folder label map ─────────────────────────────────────────────────────────
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

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectWorkspaceShellProps {
  projectId?: string;
  projectName?: string;
  projectType?: string;
  submissionType?: string;
  onBackToProjects: () => void;
  onSelectProject: () => void;
  /** Switch to RI Copilot intelligence view */
  onSwitchToIntelligence?: () => void;
  /** Pending content from IND/eCTD handoff */
  initialContent?: string;
  initialTitle?: string;
  initialCtdSection?: string;
  onInitialContentConsumed?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export const ProjectWorkspaceShell: React.FC<ProjectWorkspaceShellProps> = ({
  projectId,
  projectName,
  projectType,
  submissionType,
  onBackToProjects,
  onSelectProject,
  onSwitchToIntelligence,
  initialContent,
  initialTitle,
  initialCtdSection,
  onInitialContentConsumed,
}) => {
  // ── Local state ──────────────────────────────────────────────────────────
  const [artifacts, setArtifacts] = useState<TreeArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>('drafts');
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
  const [mode, setMode] = useState<'browse' | 'edit'>('browse');
  const [leftRailMode, setLeftRailMode] = useState<LeftRailMode>('files');
  const [selectedCtdSection, setSelectedCtdSection] = useState<string | undefined>();

  // New document creation
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);

  // Placement dialog state
  const [placementDialog, setPlacementDialog] = useState<{
    open: boolean;
    artifact: TreeArtifact | null;
    operation: PlacementOperation;
    targetSection?: string;
  }>({ open: false, artifact: null, operation: 'place' });
  const [placementLoading, setPlacementLoading] = useState(false);

  // If initialContent is provided, go straight to edit mode
  useEffect(() => {
    if (initialContent && initialTitle) {
      setMode('edit');
    }
  }, [initialContent, initialTitle]);

  // ── Load artifacts ───────────────────────────────────────────────────────
  const loadArtifacts = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts`, {
        headers: getAuthHeaders(),
      });
      const payload = await res.json();
      if (res.ok && payload.success !== false) {
        const list = payload.data ?? payload;
        setArtifacts(Array.isArray(list) ? list : []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  // ── Classify artifacts into folders ──────────────────────────────────────
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
    return 'drafts';
  }

  // folderDocs: used in Files mode
  const folderDocs = useMemo(() => {
    return artifacts.filter(a => classifyArtifact(a) === selectedFolder);
  }, [artifacts, selectedFolder]);

  // sectionDocs: used in Dossier mode — filter by ctdSection
  const sectionDocs = useMemo(() => {
    if (!selectedCtdSection) return [];
    return artifacts.filter(a => {
      const s = a.ctdSection || '';
      return s === selectedCtdSection || s.startsWith(selectedCtdSection + '.');
    });
  }, [artifacts, selectedCtdSection]);

  // ── Create new document ──────────────────────────────────────────────────
  const handleCreateNew = useCallback(async () => {
    if (!projectId || !newDocTitle.trim()) return;
    setCreatingNew(true);
    try {
      const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          title: newDocTitle.trim(),
          content: '<p>Begin editing your document here...</p>',
          type: 'regulatory_document',
          category: 'document',
        }),
      });
      if (res.ok) {
        const payload = await res.json();
        const created = payload.data ?? payload;
        setNewDocTitle('');
        setShowNewDoc(false);
        await loadArtifacts();
        setSelectedDocId(created.id);
        setMode('edit');
      }
    } catch {
      // silent
    } finally {
      setCreatingNew(false);
    }
  }, [projectId, newDocTitle, loadArtifacts]);

  // ── Create from template ─────────────────────────────────────────────────
  const handleCreateFromTemplate = useCallback(
    async (templateKey: string, ctdSection: string, label: string) => {
      if (!projectId) return;
      setCreatingNew(true);
      try {
        const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            title: label,
            content: `<h1>${label}</h1><p>Generated from template <code>${templateKey}</code> for CTD section ${ctdSection}.</p>`,
            type: 'regulatory_document',
            category: 'document',
            ctdSection,
            templateId: templateKey,
          }),
        });
        if (res.ok) {
          const payload = await res.json();
          const created = payload.data ?? payload;
          await loadArtifacts();
          setSelectedDocId(created.id);
          setMode('edit');
          setLeftRailMode('dossier');
        }
      } catch {
        // silent
      } finally {
        setCreatingNew(false);
      }
    },
    [projectId, loadArtifacts]
  );

  // ── Placement confirmation handler ───────────────────────────────────────
  const handlePlacementConfirm = useCallback(
    async (params: PlacementConfirmation) => {
      if (!projectId) return;
      setPlacementLoading(true);
      try {
        const res = await fetch(
          `/api/concept2cure/projects/${projectId}/artifacts/${params.artifactId}/placement`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
              operation: params.operation,
              fromSection: params.fromSection,
              toSection: params.toSection,
              reason: params.reason,
            }),
          }
        );
        if (res.ok) {
          await loadArtifacts();
          setPlacementDialog({ open: false, artifact: null, operation: 'place' });
        }
      } catch {
        // silent
      } finally {
        setPlacementLoading(false);
      }
    },
    [projectId, loadArtifacts]
  );

  // ── Open placement dialog from dossier tree ──────────────────────────────
  const handlePlaceArtifact = useCallback(
    (ctdSection: string) => {
      // If a document is selected, open placement for that doc
      const art = artifacts.find(a => a.id === selectedDocId);
      if (art) {
        const hasExistingSection = !!art.ctdSection;
        setPlacementDialog({
          open: true,
          artifact: art,
          operation: hasExistingSection ? 'relocate' : 'place',
          targetSection: ctdSection,
        });
      }
    },
    [artifacts, selectedDocId]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectDoc = useCallback((doc: TreeArtifact) => {
    setSelectedDocId(doc.id);
    setMode('edit');
  }, []);

  const handleSelectFolder = useCallback((folderKey: string) => {
    setSelectedFolder(folderKey);
    setSelectedDocId(undefined);
    setMode('browse');
  }, []);

  const handleSelectSection = useCallback((ctdSection: string, _label: string) => {
    setSelectedCtdSection(ctdSection);
    setSelectedDocId(undefined);
    setMode('browse');
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedDocId(undefined);
    setMode('browse');
  }, []);

  // Which docs to show in the center pane when browsing
  const browseLabel =
    leftRailMode === 'dossier'
      ? selectedCtdSection
        ? `Section ${selectedCtdSection}`
        : 'Select a section'
      : FOLDER_LABELS[selectedFolder] || selectedFolder;
  const browseDocs = leftRailMode === 'dossier' ? sectionDocs : folderDocs;

  // ── No project guard ────────────────────────────────────────────────────
  if (!projectId) {
    return (
      <div
        className="flex-1 flex items-center justify-center bg-zinc-50/30 p-8"
        data-testid="no-project-selected"
      >
        <div className="max-w-sm text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-50 flex items-center justify-center">
            <FolderOpen className="w-7 h-7 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-2">Select a Project</h2>
          <p className="text-sm text-zinc-500 mb-5">
            Choose a project from the sidebar to access its documents, version history, and audit
            trail.
          </p>
          <button
            onClick={onSelectProject}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <FolderOpen className="w-4 h-4" />
            Select Project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="project-workspace-shell">
      {/* ── Compact breadcrumb bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white shrink-0">
        <button
          onClick={onBackToProjects}
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Projects</span>
        </button>
        <span className="text-zinc-200 text-xs">·</span>
        {projectType && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-semibold">
            {projectType}
          </span>
        )}
        <span className="text-[12px] font-semibold text-zinc-800 truncate">
          {projectName || 'Untitled Project'}
        </span>
        {mode === 'edit' && selectedDocId && (
          <>
            <span className="text-zinc-200 text-xs">·</span>
            <button
              onClick={handleBackToList}
              className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
            >
              Back to files
            </button>
          </>
        )}
        {/* View toggle — push to right */}
        {onSwitchToIntelligence && (
          <div className="ml-auto flex items-center rounded-md border border-zinc-200 overflow-hidden">
            <button
              onClick={onSwitchToIntelligence}
              className="px-2 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-50 transition-colors flex items-center gap-1"
            >
              <Brain className="w-3 h-3" />
              Intelligence
            </button>
            <button className="px-2 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-700 transition-colors">
              Documents
            </button>
          </div>
        )}
      </div>

      {/* ── 3-pane body ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Tree panel with mode toggle */}
        <div className="w-[220px] border-r border-zinc-100 shrink-0 flex flex-col bg-white">
          {/* Mode toggle tabs */}
          <div className="flex border-b border-zinc-100 shrink-0 bg-zinc-50/40">
            {[
              { key: 'files' as LeftRailMode, icon: Files, label: 'Files' },
              { key: 'dossier' as LeftRailMode, icon: BookOpen, label: 'Dossier' },
              { key: 'templates' as LeftRailMode, icon: Layers, label: 'Templates' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setLeftRailMode(tab.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold transition-colors',
                  leftRailMode === tab.key
                    ? 'text-blue-700 bg-white border-b-2 border-blue-600'
                    : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'
                )}
                data-testid={`rail-mode-${tab.key}`}
                title={tab.label}
              >
                <tab.icon className="w-3 h-3" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tree content based on mode */}
          {loading && artifacts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-300" />
            </div>
          ) : leftRailMode === 'files' ? (
            <ProjectFileTree
              artifacts={artifacts}
              selectedId={selectedDocId}
              onSelect={handleSelectDoc}
              onSelectFolder={handleSelectFolder}
              selectedFolder={selectedFolder}
              onCreateNew={() => setShowNewDoc(true)}
            />
          ) : leftRailMode === 'dossier' ? (
            <DossierTree
              artifacts={artifacts}
              selectedSection={selectedCtdSection}
              onSelectSection={handleSelectSection}
              onPlaceArtifact={selectedDocId ? handlePlaceArtifact : undefined}
            />
          ) : (
            <TemplateTree onCreateFromTemplate={handleCreateFromTemplate} />
          )}
        </div>

        {/* Center + Right: Content area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* New document input strip */}
          {showNewDoc && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-100 bg-zinc-50/40 shrink-0">
              <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <input
                type="text"
                value={newDocTitle}
                onChange={e => setNewDocTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateNew();
                  if (e.key === 'Escape') {
                    setShowNewDoc(false);
                    setNewDocTitle('');
                  }
                }}
                placeholder="New document title..."
                className="flex-1 px-2 py-1 text-[12px] border border-zinc-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                autoFocus
              />
              <button
                onClick={handleCreateNew}
                disabled={creatingNew || !newDocTitle.trim()}
                className="px-2.5 py-1 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium flex items-center gap-1"
              >
                {creatingNew ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                Create
              </button>
              <button
                onClick={() => {
                  setShowNewDoc(false);
                  setNewDocTitle('');
                }}
                className="px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Mode: browse = DocumentListPane, edit = EditorPanel */}
          {mode === 'browse' ? (
            <DocumentListPane
              folderLabel={browseLabel}
              documents={browseDocs}
              selectedId={selectedDocId}
              onSelect={handleSelectDoc}
              onCreateNew={() => setShowNewDoc(true)}
            />
          ) : (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
              }
            >
              <EditorPanel
                projectId={projectId}
                submissionType={submissionType || projectType}
                initialContent={initialContent}
                initialTitle={initialTitle}
                initialCtdSection={initialCtdSection}
                onInitialContentConsumed={onInitialContentConsumed}
              />
            </Suspense>
          )}
        </div>
      </div>

      {/* ── Placement dialog ──────────────────────────────────────────────── */}
      {placementDialog.artifact && (
        <PlacementDialog
          open={placementDialog.open}
          onClose={() => setPlacementDialog({ open: false, artifact: null, operation: 'place' })}
          artifact={placementDialog.artifact}
          operation={placementDialog.operation}
          targetSection={placementDialog.targetSection}
          onConfirm={handlePlacementConfirm}
          loading={placementLoading}
        />
      )}
    </div>
  );
};

export default ProjectWorkspaceShell;
