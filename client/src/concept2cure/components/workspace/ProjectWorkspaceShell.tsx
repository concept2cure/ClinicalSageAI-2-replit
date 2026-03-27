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
import { OperatingSystemRegistryPanel, type RegistryKind } from './OperatingSystemRegistryPanel';
import { DocumentStudioSurface } from './DocumentStudioSurface';
import { RegulatoryTransformCanvas } from './RegulatoryTransformCanvas';
import { GoldenDossierVerificationPanel } from './GoldenDossierVerificationPanel';
import { ProgramTwinPanel } from './ProgramTwinPanel';
import { SubmissionAppsPanel } from './SubmissionAppsPanel';
import { ReviewPulseDashboard } from './ReviewPulseDashboard';
import { NotificationCenter } from './NotificationCenter';
import { ComputeJobPanel } from '../compute/ComputeJobPanel';
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
import { apiRequest } from '@/lib/queryClient';
import { SkeletonText, LoadingState } from '@/components/ui/statesV2';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DocumentModeProvider,
  resolveDocumentMode,
  MODE_CAPABILITIES,
  type WorkflowStage,
} from '../../contexts/DocumentModeContext';
import { buildDocumentConsequenceRows, type ConsequenceComputeJob } from './documentConsequence';

// Feature flag for governed drag-and-drop (Phase 3C groundwork)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ENABLE_GOVERNED_DND = false;

// Lazy-load the existing EditorPanel
const EditorPanel = lazy(() => import('../editor/EditorPanel').then(m => ({ default: m.default })));

import { NewDocumentDialog } from './NewDocumentDialog';
import { canEscalateToEdit } from '../../contexts/DocumentModeContext';

// ── Left-rail mode type ──────────────────────────────────────────────────────
type LeftRailMode = 'files' | 'dossier' | 'templates' | 'outline' | 'registry';
type OperatingLayer = 'document_studio' | 'vault' | 'reports';
type WorkspaceWorkbench = 'cmc' | 'biostats' | 'device' | 'clinical';
type ProjectNav =
  | 'overview'
  | 'documents'
  | 'vault'
  | 'reports'
  | 'tasks'
  | 'reviews'
  | 'submission'
  | 'activity';
type DocumentTab =
  | 'content'
  | 'evidence'
  | 'versions'
  | 'review'
  | 'signatures'
  | 'provenance'
  | 'export';

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

interface OperatingLayerConfig {
  id: OperatingLayer;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface WorkbenchConfig {
  id: WorkspaceWorkbench;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultFolder: string;
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
  generated: 'Generated',
  dossier: 'Dossier',
  evidence: 'Evidence Packs',
  cmc: 'CMC',
  ind: 'IND',
  ectd: 'eCTD',
  clinical: 'Clinical / CSR Evidence',
  audit: 'Audit / Provenance',
  final: 'Submitted / Final',
};

const OPERATING_LAYERS: OperatingLayerConfig[] = [
  {
    id: 'document_studio',
    label: 'Document Studio',
    description: 'Core authoring + governed workflow',
    icon: FileText,
  },
  {
    id: 'vault',
    label: 'Evidence',
    description: 'Evidence and document operations',
    icon: Files,
  },
  {
    id: 'reports',
    label: 'Readiness',
    description: 'Readiness, review, and executive reporting',
    icon: Activity,
  },
];

const WORKBENCHES: WorkbenchConfig[] = [
  {
    id: 'cmc',
    label: 'CMC',
    description: 'Module 3 authoring',
    icon: Layers,
    defaultFolder: 'cmc',
  },
  {
    id: 'biostats',
    label: 'Biostats',
    description: 'Statistical narratives',
    icon: Brain,
    defaultFolder: 'clinical',
  },
  {
    id: 'device',
    label: 'Device',
    description: 'Device evidence and equivalence',
    icon: Target,
    defaultFolder: 'evidence',
  },
  {
    id: 'clinical',
    label: 'Clinical',
    description: 'Clinical studies and summaries',
    icon: BookOpen,
    defaultFolder: 'clinical',
  },
];

const PROJECT_NAV_ITEMS: Array<{ id: ProjectNav; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Tools' },
  { id: 'vault', label: 'Vault' },
  { id: 'reports', label: 'Readiness' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'submission', label: 'Submission' },
  { id: 'activity', label: 'Activity' },
];

const DOCUMENT_TAB_ITEMS: Array<{ id: DocumentTab; label: string }> = [
  { id: 'content', label: 'Content' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'versions', label: 'Versions' },
  { id: 'review', label: 'Review' },
  { id: 'signatures', label: 'Signatures' },
  { id: 'provenance', label: 'Provenance' },
  { id: 'export', label: 'Export' },
];

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
    doc: {
      id?: string;
      title: string;
      ctdSection?: string;
      excerpt: string;
      version?: number;
      status?: string;
    } | null
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
  const [projectNav, setProjectNav] = useState<ProjectNav>('overview');
  const [documentTab, setDocumentTab] = useState<DocumentTab>('content');
  const [leftRailMode, setLeftRailMode] = useState<LeftRailMode>('files');
  const [activeLayer, setActiveLayer] = useState<OperatingLayer>('document_studio');
  const [activeWorkbench, setActiveWorkbench] = useState<WorkspaceWorkbench>('clinical');
  const [activeRegistry, setActiveRegistry] = useState<RegistryKind>('documents');
  // operatingLayer maps 'document_studio' -> 'documents' for OperatingSystemRegistryPanel compatibility
  const operatingLayer = activeLayer === 'document_studio' ? 'documents' : activeLayer;
  const setOperatingLayer = (layer: string) => {
    if (layer === 'documents') setActiveLayer('document_studio');
    else if (layer === 'vault') setActiveLayer('vault');
    else if (layer === 'reports') setActiveLayer('reports');
  };
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
  const [conversationSnapshot, setConversationSnapshot] = useState<{
    manifestMode?: string;
    latestFinding?: string;
    latestPlanTask?: string;
    proposals: Array<{
      id: string;
      status: string;
      governanceState?: 'ACCEPTED_GOVERNED' | 'ACCEPTED_PERSISTED_NO_GOVERNANCE' | 'REJECTED';
      artifactId?: string;
      artifactVersion?: number;
      artifactStatus?: string;
      placementState?: string;
      provenanceRef?: string;
      auditRef?: string;
    }>;
  }>({ proposals: [] });
  const [computeJobs, setComputeJobs] = useState<ConsequenceComputeJob[]>([]);

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

  useEffect(() => {
    if (!projectId || mode !== 'dashboard') return;
    const conversationId = `project-${projectId}`;
    const qs = `?projectId=${encodeURIComponent(projectId)}`;
    Promise.all([
      apiRequest('POST', `/api/conversation-os/conversations/${conversationId}/tools`, {
        mode: 'on-demand',
        projectId,
      }).catch(() => null),
      apiRequest('GET', `/api/conversation-os/conversations/${conversationId}/scout${qs}`).catch(
        () => null
      ),
      apiRequest(
        'GET',
        `/api/conversation-os/conversations/${conversationId}/plan-summary${qs}`
      ).catch(() => null),
      apiRequest(
        'GET',
        `/api/conversation-os/conversations/${conversationId}/proposals${qs}`
      ).catch(() => null),
    ]).then(([manifestRes, scoutRes, planRes, proposalRes]) => {
      setConversationSnapshot({
        manifestMode: (manifestRes as any)?.manifest?.mode,
        latestFinding: (scoutRes as any)?.findings?.[0]?.summary,
        latestPlanTask: (planRes as any)?.plan?.task,
        proposals: ((proposalRes as any)?.proposals ?? [])
          .slice(0, 3)
          .map((p: any) => ({
            id: p.id,
            status: p.status,
            governanceState: p.governanceState,
            artifactId: p.artifactId,
            artifactVersion: p.artifactVersion,
            artifactStatus: p.artifactStatus,
            placementState: p.placementState,
            provenanceRef: p.provenanceRef,
            auditRef: p.auditRef,
          })),
      });
    });
  }, [projectId, mode]);

  // ── Load artifacts (must be defined before actOnProposal) ────────────────
  const loadArtifacts = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts`);
      const payload = await res.json();
      const list = payload.data ?? payload;
      setArtifacts(Array.isArray(list) ? list : []);
    } catch {
      pushShellToast('Failed to load artifacts', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadComputeJobs = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await apiRequest('GET', `/api/concept2cure/compute/projects/${projectId}/jobs`);
      const payload = await res.json();
      setComputeJobs(payload.data ?? []);
    } catch {
      setComputeJobs([]);
    }
  }, [projectId]);

  const actOnProposal = useCallback(
    async (proposalId: string, action: 'accept' | 'reject') => {
      if (!projectId) return;
      const conversationId = `project-${projectId}`;
      const res = await apiRequest(
        'POST',
        `/api/conversation-os/conversations/${conversationId}/proposals/${proposalId}/${action}`,
        { projectId }
      );
      const payload = (await res.json()) as {
        success: boolean;
        result?: {
          state: string;
          proposalId: string;
          artifactId?: string;
          governedConsequence?: {
            artifactId: string;
            version: number;
            artifactStatus: string;
            placementState: string;
            provenanceEventId: string;
            auditId: string;
          };
        };
      };

      const result = payload.result;
      setConversationSnapshot(prev => ({
        ...prev,
        proposals: prev.proposals.map(p =>
          p.id === proposalId
            ? {
                ...p,
                status: action === 'accept' ? 'accepted' : 'rejected',
                governanceState: result?.state as any,
                artifactId: result?.governedConsequence?.artifactId ?? result?.artifactId,
                artifactVersion: result?.governedConsequence?.version,
                artifactStatus: result?.governedConsequence?.artifactStatus,
                placementState: result?.governedConsequence?.placementState,
                provenanceRef: result?.governedConsequence?.provenanceEventId,
                auditRef: result?.governedConsequence?.auditId,
              }
            : p
        ),
      }));

      // Reload artifacts so governed artifact appears in project context
      if (action === 'accept') {
        await loadArtifacts();
      }
    },
    [projectId, loadArtifacts]
  );

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

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  useEffect(() => {
    loadComputeJobs();
  }, [loadComputeJobs]);

  // ── Load dossier metrics ─────────────────────────────────────────────────
  const loadDossierMetrics = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await apiRequest(
        'GET',
        `/api/concept2cure/projects/${projectId}/dossier-metrics`
      );
      const payload = await res.json();
      if (payload.data) {
        setDossierMetrics(payload.data);
      }
    } catch {
      // Metrics are non-critical — degrade gracefully
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

  useEffect(() => {
    if (activeLayer === 'vault') {
      setProjectNav('vault');
      return;
    }
    if (activeLayer === 'reports') {
      setProjectNav('reports');
      return;
    }
    if (phase4Panel === 'pulse') {
      setProjectNav('activity');
      return;
    }
    if (mode === 'dashboard') {
      setProjectNav('overview');
      return;
    }
    setProjectNav('documents');
  }, [activeLayer, mode, phase4Panel]);

  useEffect(() => {
    if (mode !== 'edit') {
      setDocumentTab('content');
      setEditorInitialInspector(null);
      return;
    }
    switch (documentTab) {
      case 'content':
        setShowGovernedPanel(false);
        setEditorInitialInspector(null);
        break;
      case 'evidence':
        setShowGovernedPanel(true);
        setEditorInitialInspector('provenance');
        break;
      case 'versions':
        setShowGovernedPanel(false);
        setEditorInitialInspector('compare');
        break;
      case 'review':
      case 'signatures':
      case 'export':
        setShowGovernedPanel(true);
        setEditorInitialInspector('audit');
        break;
      case 'provenance':
        setShowGovernedPanel(true);
        setEditorInitialInspector('provenance');
        break;
    }
  }, [documentTab, mode]);

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
      const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
        title: newDocTitle.trim(),
        content: '<p>Begin editing your document here...</p>',
        type: 'regulatory_document',
        category: 'document',
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
        const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
          title: label,
          content: `<h1>${label}</h1><p>Generated from template <code>${templateKey}</code> for CTD section ${ctdSection}.</p>`,
          type: 'regulatory_document',
          category: 'document',
          ctdSection,
          templateId: templateKey,
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
        const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
          title,
          content: '<p>Begin editing your document here...</p>',
          type: 'regulatory_document',
          category: 'document',
          ...(ctdSection ? { ctdSection } : {}),
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
        const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
          title,
          content: `<h1>${title}</h1><p>Generated from template <code>${templateId}</code>${
            ctdSection ? ` for CTD section ${ctdSection}` : ''
          }.</p>`,
          type: 'regulatory_document',
          category: 'document',
          ...(ctdSection ? { ctdSection } : {}),
          templateId,
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
        const res = await apiRequest(
          'PUT',
          `/api/concept2cure/projects/${projectId}/artifacts/${params.artifactId}/placement`,
          {
            operation: params.operation,
            fromSection: params.fromSection,
            toSection: params.toSection,
            reason: params.reason,
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
  const reviewInFlight = useMemo(
    () =>
      artifacts.filter(a => ['review', 'approved'].includes((a.status || '').toLowerCase())).length,
    [artifacts]
  );

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

  const openComputeArtifact = useCallback(
    (artifactId: string, inspector: 'compare' | 'provenance' | 'audit' | null = null) => {
      const art = artifacts.find(a => a.id === artifactId);
      if (!art) {
        pushShellToast('Computed artifact not found in project context', 'error');
        return;
      }
      setSelectedDocId(artifactId);
      setMode('edit');
      if (inspector === 'compare') setDocumentTab('versions');
      else if (inspector === 'provenance') setDocumentTab('provenance');
      else if (inspector === 'audit') setDocumentTab('review');
      else setDocumentTab('content');
    },
    [artifacts, pushShellToast]
  );

  /** Called when Transform Canvas / Submission App creates a draft */
  const handlePhase4CreateDraft = useCallback(
    async (title: string, ctdSection: string, templateKey?: string, existingArtifactId?: string) => {
      if (!projectId) return;
      try {
        let createdId = existingArtifactId;
        if (!createdId) {
          const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
            title,
            content: `<h1>${title}</h1><p>Begin editing this document.</p>`,
            type: 'regulatory_document',
            category: 'document',
            ctdSection,
            templateId: templateKey,
            metadata: {
              source: 'generated_draft',
              governed: true,
            },
          });
          const payload = await res.json();
          const created = payload.data ?? payload;
          createdId = created.id;
        }
        await loadArtifacts();
        if (!createdId) return;
        setSelectedDocId(createdId);
        setMode('edit');
        closePhase4Panel();
      } catch {
        pushShellToast('Failed to create draft', 'error');
      }
    },
    [projectId, loadArtifacts, closePhase4Panel]
  );

  const documentConsequenceRows = useMemo(
    () =>
      buildDocumentConsequenceRows({
        artifacts,
        computeJobs,
        proposals: conversationSnapshot.proposals,
        canOpenArtifact: (artifactId: string, status: string) =>
          artifacts.some(a => a.id === artifactId) &&
          MODE_CAPABILITIES[resolveDocumentMode(status)].canEdit,
      }),
    [artifacts, computeJobs, conversationSnapshot.proposals]
  );

  // ── Create missing subsection from template structure ────────────────────
  const handleCreateSubsection = useCallback(
    async (subsectionKey: string, label: string) => {
      if (!projectId || !activeArtifactRef.current) return;
      const art = activeArtifactRef.current;
      try {
        const scaffoldHtml = `<h2>${label}</h2><p>[Content for ${label} — fill this section per regulatory requirements.]</p>`;
        const res = await apiRequest(
          'POST',
          `/api/concept2cure/projects/${projectId}/artifacts/${art.id}/versions`,
          {
            content: (activeDocContent || '') + '\n' + scaffoldHtml,
            changeDescription: `Added template subsection: ${label}`,
            changeType: 'template_subsection_insert',
          }
        );
        if (res.ok) {
          await loadArtifacts();
        }
      } catch {
        pushShellToast('Failed to add subsection', 'error');
      }
    },
    [projectId, activeDocContent, loadArtifacts, pushShellToast]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectDoc = useCallback(
    (doc: TreeArtifact) => {
      if (!tryOpenForEdit(doc.status)) return;
      setSelectedDocId(doc.id);
      setMode('edit');
      setDocumentTab('content');
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

  const handleLayerChange = useCallback((layer: OperatingLayer) => {
    setActiveLayer(layer);
    if (layer === 'document_studio') {
      setPhase4Panel('none');
      return;
    }
    if (layer === 'vault') {
      setPhase4Panel('none');
      setMode('browse');
      setLeftRailMode('files');
      return;
    }
    setMode('browse');
    setPhase4Panel('pulse');
  }, []);

  const handleWorkbenchChange = useCallback((workbench: WorkspaceWorkbench) => {
    setActiveWorkbench(workbench);
    const config = WORKBENCHES.find(item => item.id === workbench);
    if (!config) return;
    setSelectedFolder(config.defaultFolder);
    setLeftRailMode('files');
    setMode('browse');
    setPhase4Panel('none');
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
                Work
              </button>
            </div>
          )}
        </div>

        {/* ── AnA 1.0 controlled shell layer/workbench bar ─────────────────── */}
        <div className="flex items-center gap-3 px-4 h-11 border-b border-zinc-200 bg-zinc-50/70 shrink-0 overflow-x-auto">
          <div className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase whitespace-nowrap">
            AnA 1.0 Shell
          </div>
          <div className="flex items-center gap-1.5">
            {OPERATING_LAYERS.map(layer => {
              const LayerIcon = layer.icon;
              const selected = activeLayer === layer.id;
              return (
                <button
                  key={layer.id}
                  onClick={() => handleLayerChange(layer.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                    selected
                      ? 'bg-zinc-900 text-white'
                      : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100'
                  )}
                  title={layer.description}
                >
                  <LayerIcon className="w-3.5 h-3.5" />
                  {layer.label}
                </button>
              );
            })}
          </div>
          <span className="text-zinc-300">|</span>
          <div className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase whitespace-nowrap">
            Workbenches
          </div>
          <div className="flex items-center gap-1.5">
            {WORKBENCHES.map(workbench => {
              const WorkbenchIcon = workbench.icon;
              const selected = activeWorkbench === workbench.id;
              return (
                <button
                  key={workbench.id}
                  onClick={() => handleWorkbenchChange(workbench.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                    selected
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-blue-50'
                  )}
                  title={workbench.description}
                >
                  <WorkbenchIcon className="w-3.5 h-3.5" />
                  {workbench.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Canonical shell context band ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 h-9 border-b border-zinc-200 bg-white/95 shrink-0">
          <span className="text-[11px] font-semibold text-zinc-700">Project</span>
          <span className="text-[11px] text-zinc-900 font-medium truncate max-w-[240px]">
            {projectName || 'Untitled Project'}
          </span>
          <span className="text-zinc-300">/</span>
          <span className="text-[11px] text-zinc-600">
            Doc:{' '}
            {activeArtifact?.title ? activeArtifact.title.slice(0, 44) : 'No document selected'}
          </span>
          <span className="text-zinc-300">/</span>
          <span className="text-[11px] text-zinc-600">Reviews in flight: {reviewInFlight}</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => {
                setMode('dashboard');
                setPhase4Panel('pulse');
              }}
              className="text-[11px] px-2 py-0.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
            >
              Reviews
            </button>
            <button
              onClick={() => setOperatingLayer('reports')}
              className="text-[11px] px-2 py-0.5 rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              Reports
            </button>
            <button
              onClick={() => (onNavigate ? onNavigate('submission-builder') : setMode('dashboard'))}
              className="text-[11px] px-2 py-0.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              Submission
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 px-4 h-9 border-b border-zinc-200 bg-zinc-50/70 shrink-0 overflow-x-auto">
          {PROJECT_NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setProjectNav(item.id);
                if (item.id === 'overview') {
                  setMode('dashboard');
                  setPhase4Panel('none');
                } else if (item.id === 'documents') {
                  setActiveLayer('document_studio');
                  setMode(selectedDocId ? 'edit' : 'browse');
                  setPhase4Panel('none');
                } else if (item.id === 'vault') {
                  setActiveLayer('vault');
                  setMode('browse');
                  setLeftRailMode('files');
                } else if (
                  item.id === 'reports' ||
                  item.id === 'activity' ||
                  item.id === 'reviews'
                ) {
                  setActiveLayer('reports');
                  setMode('browse');
                  setPhase4Panel('pulse');
                } else if (item.id === 'submission') {
                  onNavigate ? onNavigate('submission-builder') : setMode('dashboard');
                } else if (item.id === 'tasks') {
                  setMode('dashboard');
                }
              }}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md border whitespace-nowrap transition-colors',
                projectNav === item.id
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100'
              )}
            >
              {item.label}
            </button>
          ))}
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
            <span className="text-xs text-blue-800 font-medium truncate">
              {activeArtifact.title}
            </span>
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

        {mode === 'edit' && activeArtifact && (
          <div className="flex items-center gap-1 px-4 h-9 border-b border-zinc-200 bg-white shrink-0 overflow-x-auto">
            {DOCUMENT_TAB_ITEMS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setDocumentTab(tab.id)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md border whitespace-nowrap transition-colors',
                  documentTab === tab.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-blue-50'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* ── 3-pane body ───────────────────────────────────────────────────── */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Tree panel with mode toggle — hidden in dashboard mode for full-width layout */}
          {mode !== 'dashboard' && (
            <div className="w-[200px] 2xl:w-[240px] border-r border-zinc-200 shrink-0 flex flex-col bg-white">
              <div className="grid grid-cols-3 gap-1 p-1.5 border-b border-zinc-200 bg-white">
                {[
                  { key: 'documents' as OperatingLayer, label: 'Docs' },
                  { key: 'vault' as OperatingLayer, label: 'Vault' },
                  { key: 'reports' as OperatingLayer, label: 'Readiness' },
                ].map(layer => (
                  <button
                    key={layer.key}
                    onClick={() => {
                      setOperatingLayer(layer.key);
                      if (layer.key === 'vault') setActiveRegistry('vault');
                      if (layer.key === 'reports') setActiveRegistry('reports');
                      if (layer.key === 'documents' && activeRegistry !== 'projects') {
                        setActiveRegistry('documents');
                      }
                    }}
                    className={cn(
                      'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      operatingLayer === layer.key
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    )}
                  >
                    {layer.label}
                  </button>
                ))}
              </div>
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
                  {
                    key: 'registry' as LeftRailMode,
                    icon: Brain,
                    label: 'OS',
                    disabled: false,
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
                <div className="flex-1 p-4" data-testid="workspace-files-loading">
                  <SkeletonText lines={6} label="Loading files" testId="workspace-skeleton" />
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
              ) : leftRailMode === 'registry' ? (
                <OperatingSystemRegistryPanel
                  projectId={projectId}
                  projectName={projectName}
                  artifacts={artifacts}
                  activeRegistry={activeRegistry}
                  onRegistryChange={setActiveRegistry}
                />
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
                    <Loader2 className="w-3 h-3 animate-spin" aria-label="Creating document" />
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
            <DocumentStudioSurface
              osLayer={operatingLayer}
              onOpenWorkbench={domain => {
                if (domain === 'biostatistics') onNavigate?.('biostatistics');
                if (domain === 'safety-narrative') onNavigate?.('safety-narrative');
                if (domain === 'precedent-intelligence') onNavigate?.('precedent-intelligence');
              }}
            >
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
                      if (art)
                        handleOpenPlacementForDoc(art, art.ctdSection ? 'relocate' : 'place');
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
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  <ComputeJobPanel
                    projectId={projectId}
                    onJobsLoaded={jobs => setComputeJobs(jobs)}
                    onOpenArtifact={artifactId => openComputeArtifact(artifactId)}
                    onOpenProvenance={artifactId => openComputeArtifact(artifactId, 'provenance')}
                    onOpenAudit={artifactId => openComputeArtifact(artifactId, 'audit')}
                    onPlaceArtifact={artifactId => {
                      const art = artifacts.find(a => a.id === artifactId);
                      if (!art) return;
                      handleOpenPlacementForDoc(art, art.ctdSection ? 'relocate' : 'place');
                    }}
                  />
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
                    onOpenSubmissions={
                      onNavigate ? () => onNavigate('submission-builder') : undefined
                    }
                    onOpenTemplates={onNavigate ? () => onNavigate('template-library') : undefined}
                  />
                  <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-semibold text-slate-900">
                        Document Consequence Ledger
                      </span>
                      <Badge variant="outline" className="text-[10px] ml-auto">
                        {documentConsequenceRows.length} tracked
                      </Badge>
                    </div>
                    {documentConsequenceRows.length === 0 ? (
                      <div className="text-xs text-slate-500">
                        No generated or accepted document consequences yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {documentConsequenceRows.map(row => (
                          <div
                            key={row.rowKey}
                            className="rounded border border-slate-100 px-3 py-2 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-medium text-slate-800 truncate">
                                {row.title}
                              </div>
                              <Badge variant="outline" className="text-[10px]">
                                {row.status}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-slate-600 flex items-center gap-2 flex-wrap">
                              <span>ID: {row.artifactId.slice(0, 22)}</span>
                              <span className="text-slate-300">·</span>
                              <span>v{row.version}</span>
                              <span className="text-slate-300">·</span>
                              <span>{row.sourceType}</span>
                              <span className="text-slate-300">·</span>
                              <span>Placement: {row.placement}</span>
                              <span className="text-slate-300">·</span>
                              <span>Prov: {row.provenancePresent ? 'yes' : 'no'}</span>
                              <span className="text-slate-300">·</span>
                              <span>Audit: {row.auditPresent ? 'yes' : 'no'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px] text-blue-600"
                                disabled={!row.openable}
                                onClick={() => openComputeArtifact(row.artifactId)}
                              >
                                {row.openable ? 'Open in editor' : 'Not reopenable in editor'}
                              </Button>
                              {row.provenancePresent && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] text-violet-600"
                                  onClick={() => openComputeArtifact(row.artifactId, 'provenance')}
                                >
                                  Provenance
                                </Button>
                              )}
                              {row.auditPresent && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] text-emerald-600"
                                  onClick={() => openComputeArtifact(row.artifactId, 'audit')}
                                >
                                  Audit
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Conversation proposals with governed consequence visibility */}
                  {conversationSnapshot.proposals.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold text-slate-900">
                          Document Proposals
                        </span>
                        <Badge variant="outline" className="text-[10px] ml-auto">
                          {conversationSnapshot.proposals.length}
                        </Badge>
                      </div>
                      {conversationSnapshot.proposals.map(p => (
                        <div
                          key={p.id}
                          className="rounded border border-slate-100 px-3 py-2 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-800">
                              {p.id.slice(0, 12)}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px]',
                                p.status === 'pending' && 'text-amber-700 border-amber-200',
                                p.status === 'accepted' && 'text-emerald-700 border-emerald-200',
                                p.status === 'rejected' && 'text-rose-700 border-rose-200'
                              )}
                            >
                              {p.status}
                            </Badge>
                          </div>

                          {/* Governance consequence (visible after accept) */}
                          {p.status === 'accepted' && p.governanceState && (
                            <div className="rounded bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-[11px] space-y-1">
                              <div className="flex items-center gap-1.5">
                                <ShieldCheck
                                  className={cn(
                                    'w-3 h-3',
                                    p.governanceState === 'ACCEPTED_GOVERNED'
                                      ? 'text-emerald-600'
                                      : 'text-amber-500'
                                  )}
                                />
                                <span
                                  className={cn(
                                    'font-medium',
                                    p.governanceState === 'ACCEPTED_GOVERNED'
                                      ? 'text-emerald-700'
                                      : 'text-amber-700'
                                  )}
                                >
                                  {p.governanceState === 'ACCEPTED_GOVERNED'
                                    ? 'Governed'
                                    : 'Persisted (no governance)'}
                                </span>
                              </div>
                              {p.artifactId && (
                                <div className="text-slate-600 space-y-0.5">
                                  <div>
                                    Artifact:{' '}
                                    <span className="font-medium text-slate-800">
                                      {p.artifactId.slice(0, 20)}
                                    </span>{' '}
                                    · v{p.artifactVersion ?? 1} · {p.artifactStatus || 'draft'}
                                  </div>
                                  <div>
                                    Placement: {p.placementState || 'unplaced'} · Provenance:{' '}
                                    {p.provenanceRef ? p.provenanceRef.slice(0, 12) : 'none'} ·
                                    Audit: {p.auditRef ? p.auditRef.slice(0, 12) : 'none'}
                                  </div>
                                </div>
                              )}
                              {p.artifactId && (
                                <div className="flex items-center gap-2 pt-0.5">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-[10px] text-blue-600"
                                    onClick={() => openComputeArtifact(p.artifactId!)}
                                  >
                                    Open in editor
                                  </Button>
                                  {p.provenanceRef && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-[10px] text-violet-600"
                                      onClick={() =>
                                        openComputeArtifact(p.artifactId!, 'provenance')
                                      }
                                    >
                                      Provenance
                                    </Button>
                                  )}
                                  {p.auditRef && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-[10px] text-emerald-600"
                                      onClick={() => openComputeArtifact(p.artifactId!, 'audit')}
                                    >
                                      Audit
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Actions for pending proposals */}
                          {p.status === 'pending' && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2.5 text-[11px] text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                onClick={() => actOnProposal(p.id, 'accept')}
                              >
                                Accept
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2.5 text-[11px] text-rose-700 border-rose-200 hover:bg-rose-50"
                                onClick={() => actOnProposal(p.id, 'reject')}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
                      <div
                        className="flex-1 flex flex-col items-center justify-center gap-3"
                        data-testid="editor-loading"
                      >
                        <LoadingState
                          message="Loading editor..."
                          size="sm"
                          testId="editor-suspense"
                        />
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
            </DocumentStudioSurface>
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
                setMode('edit');
                setDocumentTab('versions');
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
                <span>{t.message}</span>
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
    </DocumentModeProvider>
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
                <span className="text-zinc-500">Artifacts</span>
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
  );
}

export default ProjectWorkspaceShell;
