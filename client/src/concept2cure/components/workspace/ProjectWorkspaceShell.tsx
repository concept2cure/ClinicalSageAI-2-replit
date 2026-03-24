/**
 * ProjectWorkspaceShell — Regulated document workspace.
 *
 * Layout: far-left nav rail (ZenSidebar) → [this shell]
 *   left: File/Dossier/Template/Outline tree (220px) with mode toggle
 *   center: DocumentListPane (browse) or EditorPanel (edit) with doc header
 *   right: Inspector panel (provenance/compare/audit) — only when doc open
 *
 * Phase 3 additions:
 *   - Persistent active-document context band across all modes
 *   - Template structure view (Outline | Structure segmented subview)
 *   - Create missing subsection from template structure
 *   - Enhanced cut/paste: locked blocking, approved warning, destination preview
 *   - Expanded section requirements panel
 *   - DnD feature flag groundwork (ENABLE_GOVERNED_DND)
 *   - Scale discipline for 1366x768
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
import { GovernedDocumentPanel } from './GovernedDocumentPanel';
import {
  getSectionLabel,
  getSectionRequirements,
  type SectionRequirement,
} from '../../models/ctdHierarchy';
import { ProjectDashboard } from './ProjectDashboard';
import { RegulatoryTransformCanvas } from './RegulatoryTransformCanvas';
import { GoldenDossierVerificationPanel } from './GoldenDossierVerificationPanel';
import { ProgramTwinPanel } from './ProgramTwinPanel';
import { SubmissionAppsPanel } from './SubmissionAppsPanel';
import { ReviewPulseDashboard } from './ReviewPulseDashboard';
import { NotificationCenter } from './NotificationCenter';
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
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Target,
  AppWindow,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DocumentModeProvider,
  resolveDocumentMode,
  MODE_CAPABILITIES,
  type WorkflowStage,
} from '../../contexts/DocumentModeContext';

// Feature flag for governed drag-and-drop (Phase 3C groundwork)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ENABLE_GOVERNED_DND = false;

// Lazy-load the existing EditorPanel
const EditorPanel = lazy(() => import('../editor/EditorPanel').then(m => ({ default: m.default })));

import { NewDocumentDialog } from './NewDocumentDialog';
import { canEscalateToEdit } from '../../contexts/DocumentModeContext';

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
  targetSection?: string;
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
  industryMode?: string;
  onBackToProjects: () => void;
  onSelectProject: () => void;
  /** Switch to RI Copilot intelligence view */
  onSwitchToIntelligence?: () => void;
  /** Pending content from IND/eCTD handoff */
  initialContent?: string;
  initialTitle?: string;
  initialCtdSection?: string;
  onInitialContentConsumed?: () => void;
  /** Open a specific existing artifact directly (no creation) */
  openArtifactId?: string;
  onOpenArtifactConsumed?: () => void;
  /** Callback when the active document changes — used for chat/authoring context awareness */
  onActiveDocumentChange?: (
    doc: { id?: string; title: string; ctdSection?: string; excerpt: string; version?: number; status?: string } | null
  ) => void;
  /** Navigate to a different layout mode (e.g., submission-builder, template-library) */
  onNavigate?: (mode: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export const ProjectWorkspaceShell: React.FC<ProjectWorkspaceShellProps> = ({
  projectId,
  projectName,
  projectType,
  submissionType,
  industryMode,
  onBackToProjects,
  onSelectProject,
  onSwitchToIntelligence,
  initialContent,
  initialTitle,
  initialCtdSection,
  onInitialContentConsumed,
  openArtifactId,
  onOpenArtifactConsumed,
  onActiveDocumentChange,
  onNavigate,
}) => {
  // ── Local state ──────────────────────────────────────────────────────────
  const [artifacts, setArtifacts] = useState<TreeArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>('drafts');
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
  const [mode, setMode] = useState<'dashboard' | 'browse' | 'edit'>('dashboard');
  const [leftRailMode, setLeftRailMode] = useState<LeftRailMode>('files');
  const [selectedCtdSection, setSelectedCtdSection] = useState<string | undefined>();

  // New document creation
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  // Feedback message when cut/move is blocked by capability
  const [cutBlockedMessage, setCutBlockedMessage] = useState<string | null>(null);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);

  // Inspector panel to auto-open in EditorPanel (set via GovernedDocumentPanel)
  const [editorInitialInspector, setEditorInitialInspector] = useState<
    'compare' | 'provenance' | 'audit' | null
  >(null);

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

  // Governed document panel (right inspector)
  const [showGovernedPanel, setShowGovernedPanel] = useState(false);

  // Editor ref for outline scroll
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // ── Phase 4 overlay state ──────────────────────────────────────────────
  type Phase4Panel = 'none' | 'transform' | 'verification' | 'twin' | 'apps' | 'pulse';
  const [phase4Panel, setPhase4Panel] = useState<Phase4Panel>('none');
  const [phase4Ctx, setPhase4Ctx] = useState<{
    ctdSection?: string;
    templateKey?: string;
    artifactId?: string;
    artifactTitle?: string;
  }>({});

  // If initialContent is provided, go straight to edit mode
  useEffect(() => {
    if (initialContent && initialTitle) {
      setMode('edit');
    }
  }, [initialContent, initialTitle]);

  // If openArtifactId is provided, switch to edit mode for that artifact (gated)
  useEffect(() => {
    if (!openArtifactId) return;
    const art = artifacts.find(a => a.id === openArtifactId);
    if (!tryOpenForEdit(art?.status)) {
      // Still select the doc for viewing, but don't enter edit mode
      setSelectedDocId(openArtifactId);
      setMode('browse');
      return;
    }
    setSelectedDocId(openArtifactId);
    setMode('edit');
  }, [openArtifactId, artifacts, tryOpenForEdit]);

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

  // ── Toast notification queue ─────────────────────────────────────────────
  type ShellToast = { id: number; message: string; type: 'success' | 'error' | 'info' };
  const [shellToasts, setShellToasts] = useState<ShellToast[]>([]);
  const shellToastIdRef = useRef(0);
  const pushShellToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = ++shellToastIdRef.current;
      setShellToasts(prev => [...prev.slice(-2), { id, message, type }]);
      setTimeout(() => setShellToasts(prev => prev.filter(t => t.id !== id)), 5000);
    },
    []
  );

  // ── Escalation gate — checks if opening an existing artifact in edit mode is allowed ──
  const tryOpenForEdit = useCallback(
    (artifactStatus?: string): boolean => {
      const check = canEscalateToEdit('section-workspace', artifactStatus as any);
      if (!check.allowed) {
        pushShellToast(check.reason || 'Editing is not available for this document', 'error');
        return false;
      }
      if (check.reason) {
        // Allowed with warning (e.g. approved → editing will reset to draft)
        pushShellToast(check.reason, 'info');
      }
      return true;
    },
    [pushShellToast]
  );

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape — cancel pending move
      if (e.key === 'Escape' && pendingMove) {
        setPendingMove(null);
      }
      // Escape — dismiss phase4 panel
      if (e.key === 'Escape' && phase4Panel !== 'none') {
        setPhase4Panel('none');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pendingMove, phase4Panel]);

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
        pushShellToast(`Created "${newDocTitle.trim()}"`, 'success');
      } else {
        pushShellToast('Document creation failed', 'error');
      }
    } catch {
      pushShellToast('Network error — document not created', 'error');
    } finally {
      setCreatingNew(false);
    }
  }, [projectId, newDocTitle, loadArtifacts, pushShellToast]);

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
          pushShellToast(`Created "${label}" from template`, 'success');
        } else {
          pushShellToast('Template creation failed', 'error');
        }
      } catch {
        pushShellToast('Network error', 'error');
      } finally {
        setCreatingNew(false);
      }
    },
    [projectId, loadArtifacts, pushShellToast]
  );

  // ── Create from dialog (blank or template) ─────────────────────────────
  const handleDialogCreateBlank = useCallback(
    async (title: string, ctdSection?: string) => {
      if (!projectId) return;
      setCreatingNew(true);
      try {
        const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            title,
            content: '<p>Begin editing your document here...</p>',
            type: 'regulatory_document',
            category: 'document',
            ...(ctdSection ? { ctdSection } : {}),
          }),
        });
        if (res.ok) {
          const payload = await res.json();
          const created = payload.data ?? payload;
          setShowNewDocDialog(false);
          await loadArtifacts();
          setSelectedDocId(created.id);
          setMode('edit');
          pushShellToast(`Created "${title}"`, 'success');
        } else {
          pushShellToast('Document creation failed', 'error');
        }
      } catch {
        pushShellToast('Network error — document not created', 'error');
      } finally {
        setCreatingNew(false);
      }
    },
    [projectId, loadArtifacts, pushShellToast]
  );

  const handleDialogCreateFromTemplate = useCallback(
    async (templateId: string, title: string, ctdSection?: string) => {
      if (!projectId) return;
      setCreatingNew(true);
      try {
        const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            title,
            content: `<h1>${title}</h1><p>Generated from template <code>${templateId}</code>${ctdSection ? ` for CTD section ${ctdSection}` : ''}.</p>`,
            type: 'regulatory_document',
            category: 'document',
            ...(ctdSection ? { ctdSection } : {}),
            templateId,
          }),
        });
        if (res.ok) {
          const payload = await res.json();
          const created = payload.data ?? payload;
          setShowNewDocDialog(false);
          await loadArtifacts();
          setSelectedDocId(created.id);
          setMode('edit');
          pushShellToast(`Created "${title}" from template`, 'success');
        } else {
          pushShellToast('Template creation failed', 'error');
        }
      } catch {
        pushShellToast('Network error', 'error');
      } finally {
        setCreatingNew(false);
      }
    },
    [projectId, loadArtifacts, pushShellToast]
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
          pushShellToast(`Placed in ${params.toSection}`, 'success');
          setPendingMove(null);
        } else {
          pushShellToast('Placement failed', 'error');
        }
      } catch {
        pushShellToast('Placement error — try again', 'error');
      } finally {
        setPlacementLoading(false);
      }
    },
    [projectId, loadArtifacts, pushShellToast]
  );

  // ── Open placement dialog from dossier tree ──────────────────────────────
  const handlePlaceArtifact = useCallback(
    (ctdSection: string) => {
      if (pendingMove) {
        setPendingMove(prev => (prev ? { ...prev, targetSection: ctdSection } : null));
        setPlacementDialog({
          open: true,
          artifact: pendingMove.artifact,
          operation: pendingMove.fromSection ? 'relocate' : 'place',
          targetSection: ctdSection,
        });
        return;
      }
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

  // ── Cut (start pending move) — capability-gated ──────────────────────────
  const handleCutDocument = useCallback(
    (art: TreeArtifact) => {
      // Derive capabilities from canonical mode resolution
      const artMode = resolveDocumentMode(workflowStage, art.status as any);
      const artCaps = MODE_CAPABILITIES[artMode];
      if (!artCaps.canMoveDocument) {
        // Provide user feedback instead of silent return
        setCutBlockedMessage(`"${art.title}" cannot be moved in the current mode.`);
        setTimeout(() => setCutBlockedMessage(null), 4000);
        return;
      }
      setPendingMove({ artifact: art, fromSection: art.ctdSection || null });
    },
    [workflowStage]
  );

  // ── Paste here (complete pending move via governed dialog) ───────────────
  const handlePasteHere = useCallback(
    (ctdSection: string) => {
      if (!pendingMove) return;
      // Re-check capabilities at paste time (status may have changed)
      const artMode = resolveDocumentMode(workflowStage, pendingMove.artifact.status as any);
      const artCaps = MODE_CAPABILITIES[artMode];
      if (!artCaps.canMoveDocument) {
        setCutBlockedMessage(`"${pendingMove.artifact.title}" can no longer be moved.`);
        setTimeout(() => setCutBlockedMessage(null), 4000);
        setPendingMove(null);
        return;
      }
      setPendingMove(prev => (prev ? { ...prev, targetSection: ctdSection } : null));
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

  // ── Handle governed status change from panel ────────────────────────────
  const handleGovernedStatusChange = useCallback(
    (_newStatus: string) => {
      // Refresh artifacts and metrics after status change
      loadArtifacts();
      loadDossierMetrics();
    },
    [loadArtifacts, loadDossierMetrics]
  );

  // Active artifact for doc-header and outline (must be before callbacks that reference it)
  const activeArtifact = useMemo(() => {
    if (!selectedDocId) return null;
    return artifacts.find(a => a.id === selectedDocId) || null;
  }, [selectedDocId, artifacts]);

  // Ref for use in callbacks that need current activeArtifact
  const activeArtifactRef = useRef(activeArtifact);
  activeArtifactRef.current = activeArtifact;

  // Bubble active document context up for chat awareness
  useEffect(() => {
    if (!onActiveDocumentChange) return;
    if (activeArtifact) {
      const plainText = (activeDocContent || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      onActiveDocumentChange({
        id: String(activeArtifact.id),
        title: activeArtifact.title,
        ctdSection: activeArtifact.ctdSection,
        excerpt: plainText.slice(0, 300),
        version: activeArtifact.version,
        status: activeArtifact.status,
      });
    } else {
      onActiveDocumentChange(null);
    }
  }, [activeArtifact?.id, activeArtifact?.title, activeDocContent, onActiveDocumentChange]);

  // ── Phase 4 panel openers ──────────────────────────────────────────────
  const openTransformCanvas = useCallback(
    (ctdSection?: string, templateKey?: string, artifactId?: string, artifactTitle?: string) => {
      setPhase4Ctx({ ctdSection, templateKey, artifactId, artifactTitle });
      setPhase4Panel('transform');
    },
    []
  );

  const openVerification = useCallback(
    (artifactId?: string) => {
      const art = artifactId ? artifacts.find(a => a.id === artifactId) : activeArtifactRef.current;
      setPhase4Ctx({ artifactId: art?.id, artifactTitle: art?.title });
      setPhase4Panel('verification');
    },
    [artifacts]
  );

  const openProgramTwin = useCallback(() => {
    setPhase4Panel('twin');
  }, []);

  const openSubmissionApps = useCallback((ctdSection?: string, templateKey?: string) => {
    setPhase4Ctx({ ctdSection, templateKey });
    setPhase4Panel('apps');
  }, []);

  const openReviewPulse = useCallback(() => {
    setPhase4Panel('pulse');
  }, []);

  const closePhase4Panel = useCallback(() => {
    setPhase4Panel('none');
    setPhase4Ctx({});
  }, []);

  /** Called when Transform Canvas / Submission App creates a draft */
  const handlePhase4CreateDraft = useCallback(
    async (title: string, ctdSection: string, templateKey?: string) => {
      if (!projectId) return;
      try {
        const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            title,
            content: `<h1>${title}</h1><p>Begin editing this document.</p>`,
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
          closePhase4Panel();
        }
      } catch {
        /* silent */
      }
    },
    [projectId, loadArtifacts, closePhase4Panel]
  );

  // ── Create missing subsection from template structure ────────────────────
  const handleCreateSubsection = useCallback(
    async (subsectionKey: string, label: string) => {
      if (!projectId || !activeArtifactRef.current) return;
      const art = activeArtifactRef.current;
      try {
        const scaffoldHtml = `<h2>${label}</h2><p>[Content for ${label} — fill this section per regulatory requirements.]</p>`;
        const res = await fetch(
          `/api/concept2cure/projects/${projectId}/artifacts/${art.id}/versions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
              content: (activeDocContent || '') + '\n' + scaffoldHtml,
              changeDescription: `Added template subsection: ${label}`,
              changeType: 'template_subsection_insert',
            }),
          }
        );
        if (res.ok) {
          await loadArtifacts();
        }
      } catch {
        // silent
      }
    },
    [projectId, activeDocContent, loadArtifacts]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectDoc = useCallback(
    (doc: TreeArtifact) => {
      if (!tryOpenForEdit(doc.status)) return;
      setSelectedDocId(doc.id);
      setMode('edit');
      setShowGovernedPanel(true);
      setSectionReqs(null); // close reqs panel when opening governed panel
    },
    [tryOpenForEdit]
  );

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
    setMode('dashboard');
  }, []);

  // Which docs to show in the center pane when browsing
  const browseLabel =
    leftRailMode === 'dossier'
      ? selectedCtdSection
        ? `Section ${selectedCtdSection}`
        : 'Select a section'
      : FOLDER_LABELS[selectedFolder] || selectedFolder;
  const browseDocs = leftRailMode === 'dossier' ? sectionDocs : folderDocs;

  // Outline available only when doc is open
  const outlineAvailable = mode === 'edit' && !!selectedDocId;

  const workflowStage: WorkflowStage = (() => {
    if (mode === 'dashboard') return 'project-home';
    if (mode === 'edit') return 'section-workspace';
    if (leftRailMode === 'dossier') return 'dossier';
    return 'documents';
  })();

  // ── No project guard ────────────────────────────────────────────────────
  if (!projectId) {
    return (
      <div
        className="flex-1 flex items-center justify-center bg-zinc-50/30 p-8"
        data-testid="no-project-selected"
      >
        <div className="max-w-sm text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-blue-50 flex items-center justify-center">
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
    <DocumentModeProvider initialStage={workflowStage} key={workflowStage}>
      <div className="flex-1 flex flex-col min-h-0" data-testid="project-workspace-shell">
      {/* ── Compact breadcrumb bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 h-11 border-b border-zinc-200 bg-white shrink-0">
        <button
          onClick={onBackToProjects}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 transition-colors duration-150"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Projects</span>
        </button>
        <span className="text-zinc-300">/</span>
        {projectType && (
          <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 font-semibold">
            {projectType}
          </span>
        )}
        <span className="text-sm font-semibold text-zinc-900 truncate">
          {projectName || 'Untitled Project'}
        </span>
        {(mode === 'edit' || mode === 'browse') && (
          <>
            <span className="text-zinc-300">/</span>
            <button
              onClick={() => {
                setSelectedDocId(undefined);
                setMode('dashboard');
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Dashboard
            </button>
            {mode === 'edit' && selectedDocId && (
              <>
                <span className="text-zinc-300">/</span>
                <button
                  onClick={() => setMode('browse')}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Files
                </button>
              </>
            )}
          </>
        )}
        {/* View toggle — push to right */}
        {onSwitchToIntelligence && (
          <div className="ml-auto flex items-center rounded-lg border border-zinc-200 overflow-hidden">
            <button
              onClick={onSwitchToIntelligence}
              className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 transition-colors flex items-center gap-1.5"
            >
              <Brain className="w-3.5 h-3.5" />
              Intelligence
            </button>
            <button className="px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white transition-colors duration-150">
              Documents
            </button>
          </div>
        )}
      </div>

      {/* ── Pending move banner ───────────────────────────────────────────── */}
      {pendingMove && (
        <div className="flex items-center gap-2.5 px-4 h-10 border-b border-amber-200 bg-amber-50 shrink-0">
          <Scissors className="w-4 h-4 text-amber-600" />
          <span className="text-xs text-amber-900 font-medium truncate">
            Moving: {pendingMove.artifact.title}
          </span>
          {pendingMove.fromSection && (
            <span className="text-xs text-amber-700">from {pendingMove.fromSection}</span>
          )}
          {pendingMove.targetSection ? (
            <>
              <span className="text-xs text-amber-500">→</span>
              <span className="text-xs text-amber-800 font-semibold">
                {pendingMove.targetSection}
              </span>
            </>
          ) : (
            <span className="text-xs text-amber-600 ml-1">Select a dossier section to paste</span>
          )}
          {pendingMove.artifact.status === 'approved' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
              ⚠ Approved
            </span>
          )}
          <button
            onClick={handleCancelMove}
            className="ml-auto text-xs text-amber-800 hover:text-red-600 font-medium flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
            <kbd className="ml-1 text-xs px-1.5 py-0.5 rounded bg-amber-200/60 text-amber-800 font-mono">
              Esc
            </kbd>
          </button>
        </div>
      )}

      {/* ── Cut/move blocked feedback ───────────────────────────────────── */}
      {cutBlockedMessage && (
        <div className="flex items-center gap-2.5 px-4 h-9 border-b border-red-200 bg-red-50 shrink-0 animate-in fade-in duration-200">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
          <span className="text-xs text-red-800 font-medium">{cutBlockedMessage}</span>
          <button onClick={() => setCutBlockedMessage(null)} className="ml-auto">
            <X className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
          </button>
        </div>
      )}

      {/* ── Persistent context band (browse mode — selected doc reminder) */}
      {mode === 'browse' && activeArtifact && (
        <div className="flex items-center gap-2.5 px-4 h-9 border-b border-blue-100 bg-blue-50/40 shrink-0">
          <FileText className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-xs text-blue-800 font-medium truncate">{activeArtifact.title}</span>
          {activeArtifact.ctdSection && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100/60 text-blue-600 font-medium">
              {activeArtifact.ctdSection}
            </span>
          )}
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded font-medium',
              activeArtifact.status === 'locked'
                ? 'bg-red-100/60 text-red-600'
                : activeArtifact.status === 'approved'
                  ? 'bg-green-100/60 text-green-600'
                  : 'bg-zinc-100 text-zinc-500'
            )}
          >
            {activeArtifact.status || 'draft'}
          </span>
          <button
            onClick={() => {
              if (tryOpenForEdit(activeArtifact.status)) setMode('edit');
            }}
            className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Open →
          </button>
        </div>
      )}

      {/* ── Doc-aware header (shown when editing) ─────────────────────────── */}
      {mode === 'edit' && activeArtifact && (
        <div className="flex items-center gap-2.5 px-4 h-10 border-b border-zinc-200 bg-zinc-50/60 shrink-0">
          <FileText className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-semibold text-zinc-900 truncate">
            {activeArtifact.title}
          </span>
          {activeArtifact.ctdSection && (
            <>
              <span className="text-zinc-300">/</span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium">
                {activeArtifact.ctdSection} — {getSectionLabel(activeArtifact.ctdSection)}
              </span>
            </>
          )}
          {activeArtifact.templateId && (
            <>
              <span className="text-zinc-200 text-xs">·</span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-violet-50 text-violet-700">
                Template: {activeArtifact.templateId}
              </span>
            </>
          )}
          <span className="text-zinc-200 text-xs">·</span>
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded font-medium',
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
            <span className="text-xs text-zinc-400 ml-0.5">v{activeArtifact.version}</span>
          )}
          {/* Doc-level actions */}
          <div className="ml-auto flex items-center gap-1">
            {activeArtifact.status !== 'locked' && (
              <button
                onClick={() => handleCutDocument(activeArtifact)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-md hover:bg-zinc-100"
                title="Cut — move to another section"
              >
                <Scissors className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() =>
                handleOpenPlacementForDoc(
                  activeArtifact,
                  activeArtifact.ctdSection ? 'relocate' : 'place'
                )
              }
              className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-md hover:bg-zinc-100"
              title={activeArtifact.ctdSection ? 'Relocate in dossier' : 'Place in dossier'}
            >
              <MapPin className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleCopyCtdPath(activeArtifact)}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-md hover:bg-zinc-100"
              title="Copy CTD path"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <span className="w-px h-4 bg-zinc-200 mx-1" />
            <button
              onClick={() => openVerification(activeArtifact.id)}
              className="p-1.5 text-zinc-400 hover:text-emerald-600 rounded-md hover:bg-emerald-50"
              title="Verify document"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() =>
                openTransformCanvas(
                  activeArtifact.ctdSection,
                  activeArtifact.templateId,
                  activeArtifact.id,
                  activeArtifact.title
                )
              }
              className="p-1.5 text-zinc-400 hover:text-violet-600 rounded-md hover:bg-blue-50"
              title="Transform Canvas"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={openProgramTwin}
              className="p-1.5 text-zinc-400 hover:text-blue-600 rounded-md hover:bg-blue-50"
              title="Program Twin"
            >
              <Target className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() =>
                openSubmissionApps(activeArtifact.ctdSection, activeArtifact.templateId)
              }
              className="p-1.5 text-zinc-400 hover:text-orange-600 rounded-md hover:bg-orange-50"
              title="Submission Apps"
            >
              <AppWindow className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={openReviewPulse}
              className={cn(
                'p-1.5 rounded-md',
                phase4Panel === 'pulse'
                  ? 'text-rose-600 bg-rose-50'
                  : 'text-zinc-400 hover:text-rose-600 hover:bg-rose-50'
              )}
              title="Review Pulse"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
            <NotificationCenter projectId={projectId} industryMode={industryMode} />
          </div>
        </div>
      )}

      {/* ── 3-pane body ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Tree panel with mode toggle — hidden in dashboard mode for full-width layout */}
        {mode !== 'dashboard' && (
          <div className="w-[200px] 2xl:w-[240px] border-r border-zinc-200 shrink-0 flex flex-col bg-white">
            {/* Mode toggle tabs */}
            <div className="flex border-b border-zinc-200 shrink-0 bg-zinc-50/60">
              {[
                { key: 'files' as LeftRailMode, icon: Files, label: 'Files', disabled: false },
                {
                  key: 'dossier' as LeftRailMode,
                  icon: BookOpen,
                  label: 'Dossier',
                  disabled: false,
                },
                {
                  key: 'templates' as LeftRailMode,
                  icon: Layers,
                  label: 'Tmpl',
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
                    'flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors duration-150',
                    leftRailMode === tab.key
                      ? 'text-zinc-900 bg-white border-b-2 border-zinc-900'
                      : tab.disabled
                        ? 'text-zinc-400 cursor-not-allowed'
                        : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/60'
                  )}
                  data-testid={`rail-mode-${tab.key}`}
                  title={tab.disabled ? 'Open a document to use Outline' : tab.label}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* ── Active document context band ──────────────────────────────── */}
            {activeArtifact && (
              <div
                className="border-b border-zinc-200 bg-zinc-50/60 px-2.5 py-2 shrink-0"
                data-testid="active-doc-context"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="text-xs font-medium text-zinc-700 truncate flex-1">
                    {activeArtifact.title}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {activeArtifact.ctdSection && (
                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium">
                      {activeArtifact.ctdSection}
                    </span>
                  )}
                  {activeArtifact.templateId && (
                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700">
                      {activeArtifact.templateId.replace('tpl-', '')}
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-xs px-1.5 py-0.5 rounded-md font-medium',
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
                    <span className="text-xs text-zinc-400">v{activeArtifact.version}</span>
                  )}
                </div>
              </div>
            )}

            {/* Tree content based on mode */}
            {loading && artifacts.length === 0 ? (
              <div className="flex-1 flex flex-col gap-2.5 p-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center gap-2.5 animate-pulse">
                    <div className="w-3.5 h-3.5 rounded bg-zinc-200" />
                    <div
                      className="h-3.5 rounded bg-zinc-100"
                      style={{ width: `${60 + (i % 3) * 20}%` }}
                    />
                  </div>
                ))}
                <span className="text-xs text-zinc-400 mt-1">Loading files...</span>
              </div>
            ) : leftRailMode === 'files' ? (
              <ProjectFileTree
                artifacts={artifacts}
                selectedId={selectedDocId}
                onSelect={handleSelectDoc}
                onSelectFolder={handleSelectFolder}
                selectedFolder={selectedFolder}
                onCreateNew={() => setShowNewDoc(true)}
                onCutDocument={handleCutDocument}
                onOpenPlacement={art =>
                  handleOpenPlacementForDoc(art, art.ctdSection ? 'relocate' : 'place')
                }
                onCopyCtdPath={handleCopyCtdPath}
                pendingMove={pendingMove}
                onPasteHere={pendingMove ? handlePasteHere : undefined}
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
                onOpenTransformCanvas={(ctdSection: string) => openTransformCanvas(ctdSection)}
                onOpenProgramTwin={openProgramTwin}
                onOpenSubmissionApps={(ctdSection: string) => openSubmissionApps(ctdSection)}
              />
            ) : leftRailMode === 'outline' ? (
              outlineAvailable ? (
                <DocumentOutlineTree
                  content={activeDocContent}
                  title={activeDocTitle || activeArtifact?.title || ''}
                  templateKey={activeArtifact?.templateId}
                  ctdSection={activeArtifact?.ctdSection}
                  onNavigate={handleOutlineNavigate}
                  onCreateSubsection={handleCreateSubsection}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center p-4">
                  <p className="text-xs text-zinc-400 text-center">
                    Open a document to view its outline
                  </p>
                </div>
              )
            ) : (
              <TemplateTree
                onCreateFromTemplate={handleCreateFromTemplate}
                onOpenTransformCanvas={(ctdSection: string, templateKey: string) =>
                  openTransformCanvas(ctdSection, templateKey)
                }
              />
            )}

            {/* Project-level Review Pulse button */}
            <div className="shrink-0 border-t border-zinc-200 p-2">
              <button
                onClick={openReviewPulse}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-colors duration-150',
                  phase4Panel === 'pulse'
                    ? 'text-rose-700 bg-rose-50'
                    : 'text-zinc-500 hover:text-rose-600 hover:bg-rose-50'
                )}
                title="Review Pulse — project-wide review status"
              >
                <Activity className="w-3.5 h-3.5" />
                Review Pulse
              </button>
            </div>
          </div>
        )}

        {/* Center + Right: Content area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* New document input strip */}
          {showNewDoc && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-200 bg-zinc-50/60 shrink-0">
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
                className="flex-1 px-2 py-1 text-sm border border-zinc-200 rounded focus-visible:ring-2 focus-visible:ring-blue-500 outline-none/30"
                autoFocus
              />
              <button
                onClick={handleCreateNew}
                disabled={creatingNew || !newDocTitle.trim()}
                className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60 font-medium flex items-center gap-1"
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
                className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Mode: browse = DocumentListPane, edit = EditorPanel, Phase 4 overlay */}
          {phase4Panel === 'transform' ? (
            <RegulatoryTransformCanvas
              projectId={projectId}
              projectName={projectName || 'Project'}
              ctdSection={phase4Ctx.ctdSection}
              templateKey={phase4Ctx.templateKey}
              artifactId={phase4Ctx.artifactId}
              artifactTitle={phase4Ctx.artifactTitle}
              onClose={closePhase4Panel}
              onCreateDraft={handlePhase4CreateDraft}
              onOpenEditor={(artId: string) => {
                const art = artifacts.find(a => a.id === artId);
                if (!tryOpenForEdit(art?.status)) return;
                setSelectedDocId(artId);
                setMode('edit');
                closePhase4Panel();
              }}
              onOpenPlacement={(artId?: string) => {
                if (artId) {
                  const art = artifacts.find(a => a.id === artId);
                  if (art) handleOpenPlacementForDoc(art, art.ctdSection ? 'relocate' : 'place');
                }
                closePhase4Panel();
              }}
              onOpenVerification={(artId: string) => openVerification(artId)}
            />
          ) : phase4Panel === 'verification' && phase4Ctx.artifactId ? (
            <GoldenDossierVerificationPanel
              projectId={projectId}
              artifactId={phase4Ctx.artifactId}
              onClose={closePhase4Panel}
              onOpenEditor={(artId: string) => {
                const art = artifacts.find(a => a.id === artId);
                if (!tryOpenForEdit(art?.status)) return;
                setSelectedDocId(artId);
                setMode('edit');
                closePhase4Panel();
              }}
              onOpenPlacement={(artId: string) => {
                const art = artifacts.find(a => a.id === artId);
                if (art) handleOpenPlacementForDoc(art, art.ctdSection ? 'relocate' : 'place');
                closePhase4Panel();
              }}
              onOpenProvenance={() => {
                if (phase4Ctx.artifactId) {
                  const art = artifacts.find(a => a.id === phase4Ctx.artifactId);
                  if (!tryOpenForEdit(art?.status)) {
                    closePhase4Panel();
                    return;
                  }
                  setSelectedDocId(phase4Ctx.artifactId);
                  setMode('edit');
                }
                closePhase4Panel();
              }}
              onOpenAudit={() => closePhase4Panel()}
              onOpenCompare={() => closePhase4Panel()}
              onOpenTransformCanvas={() =>
                openTransformCanvas(
                  undefined,
                  undefined,
                  phase4Ctx.artifactId,
                  phase4Ctx.artifactTitle
                )
              }
              onCreateSubsection={() => {}}
            />
          ) : phase4Panel === 'twin' ? (
            <ProgramTwinPanel
              projectId={projectId}
              projectName={projectName || 'Project'}
              onClose={closePhase4Panel}
              onOpenVerification={openVerification}
              onOpenTransformCanvas={() => openTransformCanvas()}
              onSelectSection={(section: string) => {
                setSelectedCtdSection(section);
                setMode('browse');
                closePhase4Panel();
              }}
            />
          ) : phase4Panel === 'apps' ? (
            <SubmissionAppsPanel
              projectId={projectId}
              projectName={projectName || 'Project'}
              onClose={closePhase4Panel}
              onCreateDraft={handlePhase4CreateDraft}
              onOpenTransformCanvas={(ctdSec?: string, tmplKey?: string) =>
                openTransformCanvas(ctdSec, tmplKey)
              }
            />
          ) : phase4Panel === 'pulse' ? (
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <ReviewPulseDashboard
                projectId={projectId}
                onNavigateToArtifact={artifactId => {
                  const art = artifacts.find(a => a.id === artifactId);
                  closePhase4Panel();
                  if (!tryOpenForEdit(art?.status)) {
                    setSelectedDocId(artifactId);
                    setMode('browse');
                    return;
                  }
                  setSelectedDocId(artifactId);
                  setMode('edit');
                }}
              />
            </div>
          ) : mode === 'dashboard' ? (
            <ProjectDashboard
              projectId={projectId}
              projectName={projectName || 'Untitled Project'}
              projectType={projectType}
              submissionType={submissionType}
              artifacts={artifacts}
              onOpenDocument={(docId: string) => {
                const art = artifacts.find(a => a.id === docId);
                if (!tryOpenForEdit(art?.status)) {
                  setSelectedDocId(docId);
                  setMode('browse');
                  return;
                }
                setSelectedDocId(docId);
                setMode('edit');
                setShowGovernedPanel(true);
              }}
              onCreateDocument={() => setShowNewDocDialog(true)}
              onOpenEditor={() => setMode('browse')}
              onOpenDossier={() => {
                setLeftRailMode('dossier');
                setMode('browse');
              }}
              onOpenIntelligence={onSwitchToIntelligence}
              onOpenSubmissions={onNavigate ? () => onNavigate('submission-builder') : undefined}
              onOpenTemplates={onNavigate ? () => onNavigate('template-library') : undefined}
            />
          ) : mode === 'browse' ? (
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
                  <div className="flex-1 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                    <span className="text-sm text-zinc-400">Loading editor...</span>
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
                  openArtifactId={openArtifactId}
                  onOpenArtifactConsumed={onOpenArtifactConsumed}
                  onContentChange={handleDocContentChange}
                  initialInspector={editorInitialInspector}
                />
              </Suspense>
            </div>
          )}
        </div>

        {/* ── Section requirements side panel ─────────────────────────────── */}
        {sectionReqs && !showGovernedPanel && (
          <SectionRequirementsPanel
            reqs={sectionReqs}
            metrics={dossierMetrics[sectionReqs.section]}
            onClose={() => setSectionReqs(null)}
          />
        )}

        {/* ── Governed document panel ─────────────────────────────────────── */}
        {showGovernedPanel && selectedDocId && activeArtifact && projectId && (
          <GovernedDocumentPanel
            projectId={projectId}
            artifact={activeArtifact}
            industryMode={industryMode}
            onStatusChange={handleGovernedStatusChange}
            onClose={() => setShowGovernedPanel(false)}
            onOpenDiff={() => {
              if (!tryOpenForEdit(activeArtifact.status)) return;
              setShowGovernedPanel(false);
              setMode('edit');
              setEditorInitialInspector('compare');
            }}
          />
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

      {/* ── New Document Dialog ── */}
      <NewDocumentDialog
        isOpen={showNewDocDialog}
        onClose={() => setShowNewDocDialog(false)}
        onCreateBlank={handleDialogCreateBlank}
        onCreateFromTemplate={handleDialogCreateFromTemplate}
        onAIGenerate={handleDialogCreateFromTemplate}
        submissionType={submissionType}
        isCreating={creatingNew}
      />

      {/* ── Toast notifications ── */}
      {shellToasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          {shellToasts.map(t => (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-xs font-medium',
                t.type === 'success' && 'bg-emerald-600 text-white',
                t.type === 'error' && 'bg-red-600 text-white',
                t.type === 'info' && 'bg-zinc-700 text-white'
              )}
            >
              {t.message}
              <button
                onClick={() => setShellToasts(prev => prev.filter(x => x.id !== t.id))}
                className="ml-1 opacity-60 hover:opacity-100"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Section requirements panel (extracted) ───────────────────────────────────

interface SectionReqsPanelProps {
  reqs: SectionRequirement;
  metrics?: SectionMetrics;
  onClose: () => void;
}

function SectionRequirementsPanel({ reqs, metrics, onClose }: SectionReqsPanelProps) {
  const [showChildren, setShowChildren] = useState(false);

  return (
    <div className="w-[200px] 2xl:w-[240px] border-l border-zinc-200 shrink-0 flex flex-col bg-white overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-200 bg-zinc-50/60">
        <div className="flex items-center gap-1.5">
          <Info className="w-3 h-3 text-blue-600" />
          <span className="text-xs font-semibold text-zinc-700">Section Requirements</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
          aria-label="Close panel"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2.5 space-y-2.5 text-xs">
        {/* Section */}
        <div>
          <div className="text-xs text-zinc-400 uppercase tracking-wide mb-0.5">Section</div>
          <div className="font-semibold text-zinc-900">{reqs.ctdSection}</div>
          <div className="text-zinc-600 mt-0.5">{reqs.label}</div>
        </div>

        {/* Description */}
        <div>
          <div className="text-xs text-zinc-400 uppercase tracking-wide mb-0.5">Description</div>
          <p className="text-zinc-600 leading-relaxed">{reqs.description}</p>
        </div>

        {/* Expected doc types */}
        <div>
          <div className="text-xs text-zinc-400 uppercase tracking-wide mb-0.5">
            Expected Documents
          </div>
          <ul className="space-y-0.5">
            {reqs.requiredDocTypes.map((dt, i) => (
              <li key={i} className="text-zinc-700 flex items-center gap-1">
                <FileText className="w-2.5 h-2.5 text-zinc-400" />
                {dt}
              </li>
            ))}
          </ul>
        </div>

        {/* Required / Optional */}
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-50">
          {reqs.optional ? (
            <>
              <Info className="w-3 h-3 text-blue-500" />
              <span className="text-xs text-blue-700 font-medium">Optional section</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              <span className="text-xs text-amber-700 font-medium">Required section</span>
            </>
          )}
        </div>

        {/* Templates available */}
        {reqs.starterTemplatesAvailable.length > 0 && (
          <div>
            <div className="text-xs text-zinc-400 uppercase tracking-wide mb-0.5">
              Starter Templates
            </div>
            {reqs.starterTemplatesAvailable.map((t, i) => (
              <div key={i} className="text-zinc-600 flex items-center gap-1 py-0.5">
                <Layers className="w-2.5 h-2.5 text-violet-500" />
                {t}
              </div>
            ))}
          </div>
        )}

        {/* Common missing blocks */}
        {reqs.commonMissingBlocks.length > 0 && (
          <div>
            <div className="text-xs text-zinc-400 uppercase tracking-wide mb-0.5">
              Expected Content Blocks
            </div>
            {reqs.commonMissingBlocks.map((b, i) => (
              <div key={i} className="text-zinc-500 text-xs py-0.5">
                • {b}
              </div>
            ))}
          </div>
        )}

        {/* Children sections */}
        {(reqs.requiredChildren.length > 0 || reqs.optionalChildren.length > 0) && (
          <div>
            <button
              onClick={() => setShowChildren(!showChildren)}
              className="flex items-center gap-1 text-xs text-zinc-400 uppercase tracking-wide mb-0.5 hover:text-zinc-600"
            >
              {showChildren ? (
                <ChevronDown className="w-2.5 h-2.5" />
              ) : (
                <ChevronRight className="w-2.5 h-2.5" />
              )}
              Child Sections ({reqs.requiredChildren.length + reqs.optionalChildren.length})
            </button>
            {showChildren && (
              <div className="space-y-0.5 mt-0.5">
                {reqs.requiredChildren.map((c, i) => (
                  <div key={i} className="text-zinc-600 text-xs">
                    ▸ {c}
                  </div>
                ))}
                {reqs.optionalChildren.map((c, i) => (
                  <div key={i} className="text-zinc-400 text-xs italic">
                    ▹ {c}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Current metrics */}
        {metrics && (
          <div>
            <div className="text-xs text-zinc-400 uppercase tracking-wide mb-0.5">
              Current Status
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Documents</span>
                <span className="font-medium text-zinc-700">{metrics.artifactCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Completion</span>
                <span className="font-medium text-zinc-700">{metrics.completionPercent}%</span>
              </div>
              <div className="w-full bg-zinc-100 rounded-full h-1.5">
                <div
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-150',
                    metrics.completionPercent >= 75
                      ? 'bg-emerald-500'
                      : metrics.completionPercent >= 25
                        ? 'bg-amber-500'
                        : 'bg-red-400'
                  )}
                  style={{ width: `${Math.min(100, metrics.completionPercent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Evidence</span>
                <span className="font-medium text-zinc-700">{metrics.evidenceCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Precedents</span>
                <span className="font-medium text-zinc-700">{metrics.precedentCount}</span>
              </div>
              {/* Warning signals */}
              {metrics.artifactCount > 0 && metrics.evidenceCount === 0 && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-xs">
                  <AlertTriangle className="w-2.5 h-2.5" /> No evidence linked
                </div>
              )}
              {metrics.artifactCount > 0 && metrics.precedentCount === 0 && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 text-xs">
                  <AlertTriangle className="w-2.5 h-2.5" /> No precedents
                </div>
              )}
              {metrics.artifactCount === 0 && reqs.hasTemplates && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-xs">
                  <Info className="w-2.5 h-2.5" /> Template available, no doc created
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </DocumentModeProvider>
  );
}

export default ProjectWorkspaceShell;
