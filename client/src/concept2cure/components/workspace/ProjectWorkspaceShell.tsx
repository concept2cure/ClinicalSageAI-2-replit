/**
 * ProjectWorkspaceShell — 3-pane regulated document workspace.
 *
 * Layout: far-left nav rail (ZenSidebar) → [this shell]
 *   left: File/Dossier/Template/Outline tree (220px) with mode toggle
 *   center: DocumentListPane (browse) or EditorPanel (edit) with doc header
 *   right: Inspector panel (provenance/compare/audit) — only when doc open
 *
 * Phase 2 additions:
 *   - Outline mode (per-document heading navigator)
 *   - Dossier metrics rollup (real artifact aggregation)
 *   - Cut/paste governed document move
 *   - Section requirements panel
 *   - Tree-aware document header (CTD path, template, status)
 *   - Evidence/precedent linkage counts
 */

import React, { useState, useCallback, useEffect, useMemo, lazy, Suspense, useRef } from 'react';

import { ProjectFileTree, type TreeArtifact } from './ProjectFileTree';
import { DocumentListPane } from './DocumentListPane';
import { DossierTree } from './DossierTree';
import { TemplateTree } from './TemplateTree';
import { DocumentOutlineTree } from './DocumentOutlineTree';
import {
  PlacementDialog,
  type PlacementConfirmation,
  type PlacementOperation,
} from './PlacementDialog';
import {
  getSectionLabel,
  getSectionRequirements,
  type SectionRequirement,
} from '../../models/ctdHierarchy';
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
  List,
  Scissors,
  X,
  MapPin,
  Copy,
  Info,
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
type LeftRailMode = 'files' | 'dossier' | 'templates' | 'outline';

// ── Dossier metrics types ────────────────────────────────────────────────────
interface SectionMetrics {
  artifactCount: number;
  draftCount: number;
  reviewCount: number;
  approvedCount: number;
  lockedCount: number;
  completionPercent: number;
  templateCoverageAvailable: boolean;
  evidenceCount: number;
  precedentCount: number;
}

// ── Cut/paste move state ─────────────────────────────────────────────────────
interface PendingMove {
  artifact: TreeArtifact;
  fromSection: string | null;
}

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

  // Cut/paste move state
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  // Dossier metrics
  const [dossierMetrics, setDossierMetrics] = useState<Record<string, SectionMetrics>>({});

  // Active document content for outline
  const [activeDocContent, setActiveDocContent] = useState<string>('');
  const [activeDocTitle, setActiveDocTitle] = useState<string>('');

  // Section requirements panel
  const [sectionReqs, setSectionReqs] = useState<SectionRequirement | null>(null);

  // Editor ref for outline scroll
  const editorContainerRef = useRef<HTMLDivElement>(null);

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

  // ── Load dossier metrics ─────────────────────────────────────────────────
  const loadDossierMetrics = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/concept2cure/projects/${projectId}/dossier-metrics`, {
        headers: getAuthHeaders(),
      });
      const payload = await res.json();
      if (res.ok && payload.data) {
        setDossierMetrics(payload.data);
      }
    } catch {
      // silent
    }
  }, [projectId]);

  useEffect(() => {
    loadDossierMetrics();
  }, [loadDossierMetrics, artifacts]);

  // ── Clear pending move on project change ─────────────────────────────────
  useEffect(() => {
    setPendingMove(null);
  }, [projectId]);

  // ── Outline navigation ───────────────────────────────────────────────────
  const handleOutlineNavigate = useCallback((nodeId: string) => {
    const container = editorContainerRef.current;
    if (!container) return;
    // Try to find element by id, then fallback to heading text match
    let target: Element | null = null;
    try {
      target = container.querySelector(`#${globalThis.CSS?.escape?.(nodeId) ?? nodeId}`);
    } catch {
      /* invalid selector */
    }
    if (!target) {
      // Try data-outline-id
      target = container.querySelector(`[data-outline-id="${nodeId}"]`);
    }
    if (!target) {
      // Fallback: find headings and tables and match by index
      const allAnchors = container.querySelectorAll('h1, h2, h3, table, [data-evidence]');
      const idx = parseInt(nodeId.replace(/\D/g, ''), 10);
      if (!isNaN(idx) && allAnchors[idx]) {
        target = allAnchors[idx];
      }
    }
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

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
      // If there's a pending move, use that artifact
      if (pendingMove) {
        setPlacementDialog({
          open: true,
          artifact: pendingMove.artifact,
          operation: pendingMove.fromSection ? 'relocate' : 'place',
          targetSection: ctdSection,
        });
        return;
      }
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
    [artifacts, selectedDocId, pendingMove]
  );

  // ── Cut (start pending move) ─────────────────────────────────────────────
  const handleCutDocument = useCallback((art: TreeArtifact) => {
    if (art.status === 'locked') return; // Cannot move locked docs
    setPendingMove({ artifact: art, fromSection: art.ctdSection || null });
  }, []);

  // ── Paste here (complete pending move via governed dialog) ───────────────
  const handlePasteHere = useCallback(
    (ctdSection: string) => {
      if (!pendingMove) return;
      setPlacementDialog({
        open: true,
        artifact: pendingMove.artifact,
        operation: pendingMove.fromSection ? 'relocate' : 'place',
        targetSection: ctdSection,
      });
    },
    [pendingMove]
  );

  // ── Cancel pending move ──────────────────────────────────────────────────
  const handleCancelMove = useCallback(() => {
    setPendingMove(null);
  }, []);

  // ── Placement confirm with move cleanup ──────────────────────────────────
  const handlePlacementConfirmWithCleanup = useCallback(
    async (params: PlacementConfirmation) => {
      await handlePlacementConfirm(params);
      setPendingMove(null);
    },
    [handlePlacementConfirm]
  );

  // ── Copy CTD path ────────────────────────────────────────────────────────
  const handleCopyCtdPath = useCallback((art: TreeArtifact) => {
    const section = art.ctdSection || 'unplaced';
    const label = art.ctdSection ? getSectionLabel(art.ctdSection) : 'Unplaced';
    const text = `${section} — ${label} → ${art.title}`;
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  // ── Open placement dialog for a specific doc ─────────────────────────────
  const handleOpenPlacementForDoc = useCallback((art: TreeArtifact, op: PlacementOperation) => {
    setPlacementDialog({
      open: true,
      artifact: art,
      operation: op,
      targetSection: undefined,
    });
  }, []);

  // ── View section requirements ────────────────────────────────────────────
  const handleViewSectionReqs = useCallback((ctdSection: string) => {
    const reqs = getSectionRequirements(ctdSection);
    setSectionReqs(reqs);
  }, []);

  // ── Track active document content for outline ────────────────────────────
  const handleDocContentChange = useCallback((content: string, title: string) => {
    setActiveDocContent(content);
    setActiveDocTitle(title);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectDoc = useCallback((doc: TreeArtifact) => {
    setSelectedDocId(doc.id);
    setMode('edit');
    // Don't auto-switch to outline — keep user's current rail mode
  }, []);

  const handleSelectFolder = useCallback((folderKey: string) => {
    setSelectedFolder(folderKey);
    setSelectedDocId(undefined);
    setMode('browse');
    setSectionReqs(null);
  }, []);

  const handleSelectSection = useCallback((ctdSection: string, _label: string) => {
    setSelectedCtdSection(ctdSection);
    setSelectedDocId(undefined);
    setMode('browse');
    setSectionReqs(null);
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

  // Active artifact for doc-header and outline
  const activeArtifact = useMemo(() => {
    if (!selectedDocId) return null;
    return artifacts.find(a => a.id === selectedDocId) || null;
  }, [selectedDocId, artifacts]);

  // Outline available only when doc is open
  const outlineAvailable = mode === 'edit' && !!selectedDocId;

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

      {/* ── Pending move banner ───────────────────────────────────────────── */}
      {pendingMove && (
        <div className="flex items-center gap-2 px-3 h-8 border-b border-amber-200 bg-amber-50 shrink-0">
          <Scissors className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-[11px] text-amber-800 font-medium truncate">
            Moving: {pendingMove.artifact.title}
          </span>
          {pendingMove.fromSection && (
            <span className="text-[10px] text-amber-600">from {pendingMove.fromSection}</span>
          )}
          <span className="text-[10px] text-amber-500 ml-1">Select a dossier section to paste</span>
          <button
            onClick={handleCancelMove}
            className="ml-auto text-[10px] text-amber-700 hover:text-red-600 font-medium flex items-center gap-0.5"
          >
            <X className="w-3 h-3" />
            Cancel
          </button>
        </div>
      )}

      {/* ── Doc-aware header (shown when editing) ─────────────────────────── */}
      {mode === 'edit' && activeArtifact && (
        <div className="flex items-center gap-2 px-3 h-8 border-b border-zinc-100 bg-zinc-50/60 shrink-0">
          <FileText className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-[11px] font-medium text-zinc-700 truncate">
            {activeArtifact.title}
          </span>
          {activeArtifact.ctdSection && (
            <>
              <span className="text-zinc-200 text-xs">·</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                {activeArtifact.ctdSection} — {getSectionLabel(activeArtifact.ctdSection)}
              </span>
            </>
          )}
          {activeArtifact.templateId && (
            <>
              <span className="text-zinc-200 text-xs">·</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
                Template: {activeArtifact.templateId}
              </span>
            </>
          )}
          <span className="text-zinc-200 text-xs">·</span>
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium',
              activeArtifact.status === 'locked'
                ? 'bg-red-50 text-red-700'
                : activeArtifact.status === 'approved'
                  ? 'bg-green-50 text-green-700'
                  : activeArtifact.status === 'review'
                    ? 'bg-yellow-50 text-yellow-700'
                    : 'bg-zinc-100 text-zinc-500'
            )}
          >
            {activeArtifact.status || 'draft'}
          </span>
          {activeArtifact.version && (
            <span className="text-[10px] text-zinc-400 ml-0.5">v{activeArtifact.version}</span>
          )}
          {/* Doc-level actions */}
          <div className="ml-auto flex items-center gap-1">
            {activeArtifact.status !== 'locked' && (
              <button
                onClick={() => handleCutDocument(activeArtifact)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100"
                title="Cut — move to another section"
              >
                <Scissors className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={() =>
                handleOpenPlacementForDoc(
                  activeArtifact,
                  activeArtifact.ctdSection ? 'relocate' : 'place'
                )
              }
              className="p-1 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100"
              title={activeArtifact.ctdSection ? 'Relocate in dossier' : 'Place in dossier'}
            >
              <MapPin className="w-3 h-3" />
            </button>
            <button
              onClick={() => handleCopyCtdPath(activeArtifact)}
              className="p-1 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100"
              title="Copy CTD path"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* ── 3-pane body ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Tree panel with mode toggle */}
        <div className="w-[220px] border-r border-zinc-100 shrink-0 flex flex-col bg-white">
          {/* Mode toggle tabs */}
          <div className="flex border-b border-zinc-100 shrink-0 bg-zinc-50/40">
            {[
              { key: 'files' as LeftRailMode, icon: Files, label: 'Files', disabled: false },
              { key: 'dossier' as LeftRailMode, icon: BookOpen, label: 'Dossier', disabled: false },
              {
                key: 'templates' as LeftRailMode,
                icon: Layers,
                label: 'Templates',
                disabled: false,
              },
              {
                key: 'outline' as LeftRailMode,
                icon: List,
                label: 'Outline',
                disabled: !outlineAvailable,
              },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => !tab.disabled && setLeftRailMode(tab.key)}
                disabled={tab.disabled}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold transition-colors',
                  leftRailMode === tab.key
                    ? 'text-blue-700 bg-white border-b-2 border-blue-600'
                    : tab.disabled
                      ? 'text-zinc-300 cursor-not-allowed'
                      : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'
                )}
                data-testid={`rail-mode-${tab.key}`}
                title={tab.disabled ? 'Open a document to use Outline' : tab.label}
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
              onPlaceArtifact={selectedDocId || pendingMove ? handlePlaceArtifact : undefined}
              metrics={dossierMetrics}
              pendingMove={pendingMove}
              onPasteHere={pendingMove ? handlePasteHere : undefined}
              onViewRequirements={handleViewSectionReqs}
              onCutDocument={handleCutDocument}
              onCopyCtdPath={handleCopyCtdPath}
            />
          ) : leftRailMode === 'outline' ? (
            outlineAvailable ? (
              <DocumentOutlineTree
                content={activeDocContent}
                title={activeDocTitle || activeArtifact?.title || ''}
                onNavigate={handleOutlineNavigate}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-4">
                <p className="text-[11px] text-zinc-400 text-center">
                  Open a document to view its outline
                </p>
              </div>
            )
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
              onCutDocument={handleCutDocument}
              onCopyCtdPath={handleCopyCtdPath}
              onOpenPlacement={handleOpenPlacementForDoc}
            />
          ) : (
            <div ref={editorContainerRef} className="flex-1 flex min-h-0 min-w-0">
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
                  onContentChange={handleDocContentChange}
                />
              </Suspense>
            </div>
          )}
        </div>

        {/* ── Section requirements side panel ─────────────────────────────── */}
        {sectionReqs && (
          <div className="w-[260px] border-l border-zinc-100 shrink-0 flex flex-col bg-white overflow-y-auto">
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 bg-zinc-50/40">
              <div className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[11px] font-semibold text-zinc-700">
                  Section Requirements
                </span>
              </div>
              <button
                onClick={() => setSectionReqs(null)}
                className="p-0.5 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-3 space-y-3">
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1">
                  Section
                </div>
                <div className="text-[12px] font-semibold text-zinc-800">{sectionReqs.section}</div>
                <div className="text-[11px] text-zinc-600 mt-0.5">{sectionReqs.label}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1">
                  Description
                </div>
                <p className="text-[11px] text-zinc-600 leading-relaxed">
                  {sectionReqs.description}
                </p>
              </div>
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1">
                  Required Documents
                </div>
                <ul className="space-y-1">
                  {sectionReqs.requiredDocTypes.map((dt, i) => (
                    <li key={i} className="text-[11px] text-zinc-700 flex items-center gap-1.5">
                      <FileText className="w-3 h-3 text-zinc-400" />
                      {dt}
                    </li>
                  ))}
                </ul>
              </div>
              {sectionReqs.optional && (
                <div className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50">
                  <Info className="w-3 h-3 text-blue-500" />
                  <span className="text-[10px] text-blue-700 font-medium">Optional section</span>
                </div>
              )}
              {dossierMetrics[sectionReqs.section] && (
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1">
                    Current Status
                  </div>
                  <div className="space-y-1">
                    {(() => {
                      const m = dossierMetrics[sectionReqs.section];
                      return (
                        <>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-500">Documents</span>
                            <span className="font-medium text-zinc-700">{m.artifactCount}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-500">Completion</span>
                            <span className="font-medium text-zinc-700">
                              {m.completionPercent}%
                            </span>
                          </div>
                          <div className="w-full bg-zinc-100 rounded-full h-1.5">
                            <div
                              className="bg-blue-600 h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.min(100, m.completionPercent)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-500">Evidence</span>
                            <span className="font-medium text-zinc-700">{m.evidenceCount}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-500">Precedents</span>
                            <span className="font-medium text-zinc-700">{m.precedentCount}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Placement dialog ──────────────────────────────────────────────── */}
      {placementDialog.artifact && (
        <PlacementDialog
          open={placementDialog.open}
          onClose={() => setPlacementDialog({ open: false, artifact: null, operation: 'place' })}
          artifact={placementDialog.artifact}
          operation={placementDialog.operation}
          targetSection={placementDialog.targetSection}
          onConfirm={handlePlacementConfirmWithCleanup}
          loading={placementLoading}
        />
      )}
    </div>
  );
};

export default ProjectWorkspaceShell;
