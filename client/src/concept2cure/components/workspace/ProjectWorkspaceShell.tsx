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

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';

import { type TreeArtifact } from './ProjectFileTree';
import { useSubmissionSections, type SectionNode } from '../../hooks/useSubmissionSections';

import {
  PlacementDialog,
  type PlacementConfirmation,
  type PlacementOperation,
} from './PlacementDialog';
import { GovernedDocumentPanel } from './GovernedDocumentPanel';
import { GovernedDecisionReviewPanel } from './GovernedDecisionReviewPanel';
import { WorkspaceGovernanceProvider, runTransitionPreflight, type TransitionPreflightResult } from './WorkspaceGovernanceContext';
import { TransitionPreflightBanner } from './TransitionPreflightBanner';
import { useFabricDecisions } from '../../hooks/useFabricState';
import {
  getSectionLabel,
  getSectionRequirements,
  type SectionRequirement,
  type DossierNode,
} from '../../models/ctdHierarchy';
import { type RegistryKind } from './OperatingSystemRegistryPanel';
import { WorkspaceTopBar } from './WorkspaceTopBar';
import { WorkspaceCenterSurface } from './WorkspaceCenterSurface';
import { WorkspaceLeftRail } from './WorkspaceLeftRail';
import WorkspaceContextBars from './WorkspaceContextBars';
import {
  Loader2,
  FileText,
  Plus,
  FolderOpen,
  Scissors,
  X,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  Target,
  AppWindow,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';

import {
  DocumentModeProvider,
  resolveDocumentMode,
  MODE_CAPABILITIES,
  type WorkflowStage,
} from '../../contexts/DocumentModeContext';
import { buildDocumentConsequenceRows } from './documentConsequence';
import {
  useWorkspaceNavigationState,
  useGuidedSequenceState,
  usePlacementAndMoveState,
  useDocumentConsequenceState,
  usePhase4Panels,
  useWorkflowTransitionModel,
} from './workspaceShellControllers';

// Feature flag for governed drag-and-drop (Phase 3C groundwork)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ENABLE_GOVERNED_DND = false;

import { NewDocumentDialog } from './NewDocumentDialog';
import { canEscalateToEdit } from '../../contexts/DocumentModeContext';
import { SectionRequirementsPanel, type SectionMetrics } from './SectionRequirementsPanel';

// ── Left-rail mode type (imported from controllers to avoid duplication) ──────
import type {
  OperatingLayer,
  WorkspaceWorkbench,
  GuidedSequenceStage,
} from './workspaceShellControllers';
import {
  type DocumentTab,
  FOLDER_LABELS,
  WORKBENCHES,
  buildTemplateContent,
} from './workspaceShellConstants';

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectWorkspaceShellProps {
  projectId?: string;
  projectName?: string;
  projectType?: string;
  submissionType?: string;
  industryMode?: string;
  onBackToProjects: () => void;
  onSelectProject: () => void;
  /** Switch to AnA intelligence view */
  onSwitchToIntelligence?: () => void;
  /** Pending content from IND/eCTD handoff */
  initialContent?: string;
  initialTitle?: string;
  initialCtdSection?: string;
  initialTemplateId?: string;
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
  /** Push a guided prompt into AnA */
  onSuggestedPrompt?: (prompt: string) => void;
  /** Allow parent (AnA/ZenApp) to trigger guided stage execution */
  guidedStageCommand?: { stage: GuidedSequenceStage; ts: number } | null;
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
  initialTemplateId,
  onInitialContentConsumed,
  openArtifactId,
  onOpenArtifactConsumed,
  onActiveDocumentChange,
  onNavigate,
  onSuggestedPrompt,
  guidedStageCommand,
}) => {
  // ── Local state ──────────────────────────────────────────────────────────
  const [artifacts, setArtifacts] = useState<TreeArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>('drafts');
  const {
    selectedDocId,
    setSelectedDocId,
    mode,
    setMode,
    projectNav,
    setProjectNav,
    leftRailMode,
    setLeftRailMode,
    activeLayer,
    setActiveLayer,
    activeWorkbench,
    setActiveWorkbench,
    selectedCtdSection,
    setSelectedCtdSection,
  } = useWorkspaceNavigationState();
  const [showContextBars, setShowContextBars] = useState(false);
  const { guidedControlMode, setGuidedControlMode } = useGuidedSequenceState();
  const [documentTab, setDocumentTab] = useState<DocumentTab>('content');
  const [activeRegistry, setActiveRegistry] = useState<RegistryKind>('documents');

  // Submission-type-aware section tree for dossier mode
  const { sections: submissionSections, readinessPercent } = useSubmissionSections(
    projectId,
    submissionType || projectType
  );
  const normalizedSubmissionType = String(submissionType || projectType || '').toUpperCase();
  const isINDWorkspace = ['IND', 'NDA', 'BLA', 'MAA'].includes(normalizedSubmissionType);
  const resolvedSubmissionProgram = normalizedSubmissionType.includes('IND')
    ? 'ind'
    : normalizedSubmissionType.includes('510') || normalizedSubmissionType.includes('PMA')
    ? '510k'
    : normalizedSubmissionType.includes('MAA') || normalizedSubmissionType.includes('BLA')
    ? 'ectd'
    : 'general_ri';
  const nextRecommendedSection = useMemo(() => {
    const flatten = (nodes: SectionNode[]): SectionNode[] =>
      nodes.flatMap(n => [n, ...(n.children ? flatten(n.children) : [])]);
    return flatten(submissionSections).find(
      section =>
        section.depth > 0 &&
        section.required &&
        (section.status === 'empty' || section.status === 'drafting')
    );
  }, [submissionSections]);

  // Convert SectionNode[] to DossierNode[] for DossierTree when submission-specific sections are available
  const submissionDossierHierarchy = useMemo<DossierNode[] | undefined>(() => {
    if (!submissionSections || submissionSections.length === 0) return undefined;
    function convertToDossierNode(node: SectionNode): DossierNode {
      return {
        nodeId: `${node.module.toLowerCase()}-${node.code}`,
        parentNodeId: null,
        label: node.title,
        ctdSection: node.code,
        nodeType: node.depth === 0 ? 'module' : node.depth === 1 ? 'section' : 'subsection',
        children: node.children ? node.children.map(convertToDossierNode) : [],
      };
    }
    return submissionSections.map(convertToDossierNode);
  }, [submissionSections]);
  // operatingLayer maps 'document_studio' -> 'documents' for OperatingSystemRegistryPanel compatibility
  const operatingLayer = activeLayer === 'document_studio' ? 'documents' : activeLayer;
  const setOperatingLayer = (layer: string) => {
    if (layer === 'documents') setActiveLayer('document_studio');
    else if (layer === 'vault') setActiveLayer('vault');
    else if (layer === 'reports') setActiveLayer('reports');
  };

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

  const {
    placementDialog,
    setPlacementDialog,
    placementLoading,
    setPlacementLoading,
    pendingMove,
    setPendingMove,
  } = usePlacementAndMoveState();

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
  const { computeJobs, setComputeJobs, governance } =
    useDocumentConsequenceState();
  const showGovernedPanel = governance.governedPanelOpen;
  const setShowGovernedPanel = (open: boolean) => open ? governance.openGovernedPanel() : governance.closeGovernedPanel();
  const reviewQueueVisible = governance.isActive;
  const setReviewQueueVisible = (visible: boolean) => visible ? governance.openQueue() : governance.closeQueue();

  // Shared fabric decision fetch — pushes into governance model for all consumers
  const fabricQuery = useFabricDecisions(projectId != null ? String(projectId) : undefined, { limit: 20 });
  useEffect(() => {
    governance.setFabricDetail(fabricQuery.data?.entries ?? [], fabricQuery.isLoading);
  }, [fabricQuery.data, fabricQuery.isLoading, governance.setFabricDetail]);

  // Wire manual refresh into governance model
  useEffect(() => {
    governance.setRefreshFn(() => fabricQuery.refetch());
  }, [fabricQuery.refetch, governance.setRefreshFn]);

  // Editor ref for outline scroll
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const { phase4Panel, setPhase4Panel, phase4Ctx, setPhase4Ctx } = usePhase4Panels();

  const workflowTransitionModel = useWorkflowTransitionModel();

  // Governance-aware transition preflight state
  const [pendingPreflight, setPendingPreflight] = useState<TransitionPreflightResult | null>(null);

  const applyWorkflowTransition = useCallback(
    (
      key: keyof typeof workflowTransitionModel,
      context: {
        hasDoc?: boolean;
        createIntent?: boolean;
        reviewContext?: boolean;
        submissionContext?: boolean;
      } = {}
    ) => {
      const transition = workflowTransitionModel[key];
      if (!transition) return false;

      if (!transition.from.includes(mode)) {
        setMode(transition.fallback);
        return false;
      }

      // Governance-aware preflight for verify/publish transitions
      if (key === 'verify_review' || key === 'publish_package') {
        const preflight = runTransitionPreflight(governance, key);
        if (!preflight.allowed) {
          setPendingPreflight(preflight);
          return false;
        }
        setPendingPreflight(null);
      }

      const requirement = transition.requires;
      if (requirement === 'selectedDocOrCreateIntent' && !context.hasDoc && !context.createIntent) {
        setMode(transition.fallback);
        return false;
      }
      if (requirement === 'reviewContext' && !context.reviewContext) {
        setMode(transition.fallback);
        return false;
      }
      if (requirement === 'submissionContext' && !context.submissionContext) {
        setMode(transition.fallback);
        return false;
      }

      setMode(transition.to);
      return true;
    },
    [mode, setMode, workflowTransitionModel, governance]
  );

  // If initialContent is provided, go straight to edit mode
  useEffect(() => {
    if (initialContent && initialTitle) {
      applyWorkflowTransition('edit_document', { hasDoc: true });
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
        proposals: ((proposalRes as any)?.proposals ?? []).slice(0, 3).map((p: any) => ({
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

  useEffect(() => {
    if (!projectId || !isINDWorkspace) return;
    setActiveLayer('document_studio');
    setLeftRailMode('dossier');
    if (!selectedDocId) {
      applyWorkflowTransition('browse_list', {});
    }
  }, [projectId, isINDWorkspace, selectedDocId]);

  useEffect(() => {
    if (!isINDWorkspace || selectedCtdSection || submissionSections.length === 0) return;
    const firstLeaf =
      submissionSections.find(s => s.depth > 0)?.code || submissionSections[0]?.code;
    if (firstLeaf) setSelectedCtdSection(firstLeaf);
  }, [isINDWorkspace, selectedCtdSection, submissionSections]);

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

  // ── Resume where left off — persist last active artifact per project ───
  const resumeAttemptedRef = useRef(false);

  // Save last active artifact to localStorage whenever it changes
  useEffect(() => {
    if (!projectId || !selectedDocId) return;
    try {
      localStorage.setItem(`c2c_last_artifact_${projectId}`, selectedDocId);
    } catch {
      /* storage full — non-critical */
    }
  }, [projectId, selectedDocId]);

  // On workspace mount, auto-restore last active artifact if nothing else is requesting a specific doc
  useEffect(() => {
    if (resumeAttemptedRef.current) return;
    if (!projectId || artifacts.length === 0) return;
    // Don't override explicit openArtifactId or initialContent
    if (openArtifactId || initialContent) return;
    resumeAttemptedRef.current = true;

    try {
      const lastDocId = localStorage.getItem(`c2c_last_artifact_${projectId}`);
      if (!lastDocId) return;
      const art = artifacts.find(a => a.id === lastDocId);
      if (!art) return;
      // Resume: open the document in browse mode (user can escalate to edit)
      setSelectedDocId(lastDocId);
      applyWorkflowTransition('browse_list', {});
    } catch {
      /* localStorage unavailable */
    }
  }, [projectId, artifacts, openArtifactId, initialContent]);

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

  // If openArtifactId is provided, switch to edit mode for that artifact (gated)
  useEffect(() => {
    if (!openArtifactId) return;
    const art = artifacts.find(a => a.id === openArtifactId);
    if (!tryOpenForEdit(art?.status)) {
      // Still select the doc for viewing, but don't enter edit mode
      setSelectedDocId(openArtifactId);
      applyWorkflowTransition('browse_list', {});
      return;
    }
    setSelectedDocId(openArtifactId);
    applyWorkflowTransition('edit_document', { hasDoc: true });
  }, [openArtifactId, artifacts, tryOpenForEdit, applyWorkflowTransition]);

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
    if (phase4Panel === 'communication_center' || mode === 'dashboard') {
      setProjectNav('communication_center');
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

  useEffect(() => {
    if (mode === 'edit' && showContextBars) {
      setShowContextBars(false);
    }
  }, [mode, showContextBars]);

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
        submissionProgram: resolvedSubmissionProgram,
        originSurface: 'project_workspace_shell',
      });
      if (res.ok) {
        const payload = await res.json();
        const created = payload.data ?? payload;
        setNewDocTitle('');
        setShowNewDoc(false);
        await loadArtifacts();
        setSelectedDocId(created.id);
        applyWorkflowTransition('edit_document', { hasDoc: true });
        pushShellToast(`Created "${newDocTitle.trim()}"`, 'success');
      } else {
        pushShellToast('Document creation failed', 'error');
      }
    } catch {
      pushShellToast('Network error — document not created', 'error');
    } finally {
      setCreatingNew(false);
    }
  }, [projectId, newDocTitle, loadArtifacts, pushShellToast, resolvedSubmissionProgram]);

  // ── Create from template ─────────────────────────────────────────────────
  const handleCreateFromTemplate = useCallback(
    async (templateKey: string, ctdSection: string, label: string) => {
      if (!projectId) return;
      setCreatingNew(true);
      try {
        const content = buildTemplateContent(label, ctdSection, templateKey);
        const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
          title: label,
          content,
          type: 'regulatory_document',
          category: 'document',
          ctdSection,
          templateId: templateKey,
          submissionProgram: resolvedSubmissionProgram,
          originSurface: 'project_workspace_shell',
        });
        if (res.ok) {
          const payload = await res.json();
          const created = payload.data ?? payload;
          await loadArtifacts();
          setSelectedDocId(created.id);
          applyWorkflowTransition('edit_document', { hasDoc: true });
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
    [projectId, loadArtifacts, pushShellToast, resolvedSubmissionProgram]
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
          submissionProgram: resolvedSubmissionProgram,
          originSurface: 'project_workspace_shell',
        });
        if (res.ok) {
          const payload = await res.json();
          const created = payload.data ?? payload;
          setShowNewDocDialog(false);
          await loadArtifacts();
          setSelectedDocId(created.id);
          applyWorkflowTransition('edit_document', { hasDoc: true });
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
    [projectId, loadArtifacts, pushShellToast, resolvedSubmissionProgram]
  );

  const handleDialogCreateFromTemplate = useCallback(
    async (templateId: string, title: string, ctdSection?: string) => {
      if (!projectId) return;
      setCreatingNew(true);
      try {
        const templateContent = buildTemplateContent(title, ctdSection || '', templateId);
        const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
          title,
          content: templateContent,
          type: 'regulatory_document',
          category: 'document',
          ...(ctdSection ? { ctdSection } : {}),
          templateId,
          submissionProgram: resolvedSubmissionProgram,
          originSurface: 'project_workspace_shell',
        });
        if (res.ok) {
          const payload = await res.json();
          const created = payload.data ?? payload;
          setShowNewDocDialog(false);
          await loadArtifacts();
          setSelectedDocId(created.id);
          applyWorkflowTransition('edit_document', { hasDoc: true });
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
    [projectId, loadArtifacts, pushShellToast, resolvedSubmissionProgram]
  );

  const handleCreateSectionDraftWithRI = useCallback(async () => {
    if (!projectId || !selectedCtdSection) return;
    setCreatingNew(true);
    try {
      const sectionLabel = getSectionLabel(selectedCtdSection);
      const riContext = [
        `Project: ${projectName || 'Untitled Project'}`,
        `Submission Type: ${submissionType || projectType || 'IND'}`,
        `Section Code: ${selectedCtdSection}`,
        `Section Title: ${sectionLabel}`,
      ].join('\n');
      const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
        title: `${selectedCtdSection} — ${sectionLabel}`,
        content: `<h1>${sectionLabel}</h1><p>RI draft scaffold initialized.</p><pre>${riContext}</pre>`,
        type: 'regulatory_document',
        category: 'document',
        ctdSection: selectedCtdSection,
        submissionProgram: resolvedSubmissionProgram,
        originSurface: 'project_workspace_shell',
        metadata: {
          draftingMode: 'ri',
          projectId,
          projectName: projectName || 'Untitled Project',
          submissionType: submissionType || projectType || 'IND',
          sectionCode: selectedCtdSection,
          moduleCode: selectedCtdSection.split('.')[0],
        },
      });
      if (!res.ok) throw new Error('Failed to create draft');
      const payload = await res.json();
      const created = payload.data ?? payload;
      await loadArtifacts();
      setSelectedDocId(created.id);
      applyWorkflowTransition('edit_document', { hasDoc: true });
      pushShellToast(`RI draft started for ${selectedCtdSection}`, 'success');
    } catch {
      pushShellToast('RI draft creation failed', 'error');
    } finally {
      setCreatingNew(false);
    }
  }, [
    projectId,
    selectedCtdSection,
    projectName,
    submissionType,
    projectType,
    loadArtifacts,
    pushShellToast,
    resolvedSubmissionProgram,
  ]);

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

  const workflowStage: WorkflowStage = (() => {
    if (mode === 'dashboard') return 'project-home';
    if (mode === 'edit') return 'section-workspace';
    if (leftRailMode === 'dossier') return 'dossier';
    return 'documents';
  })();

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
      applyWorkflowTransition('edit_document', { hasDoc: true });
      if (inspector === 'compare') setDocumentTab('versions');
      else if (inspector === 'provenance') setDocumentTab('provenance');
      else if (inspector === 'audit') setDocumentTab('review');
      else setDocumentTab('content');
    },
    [artifacts, pushShellToast]
  );

  /** Called when Transform Canvas / Submission App creates a draft */
  const handlePhase4CreateDraft = useCallback(
    async (
      title: string,
      ctdSection: string,
      templateKey?: string,
      existingArtifactId?: string
    ) => {
      if (!projectId) return;
      try {
        let createdId = existingArtifactId;
        if (!createdId) {
          const res = await apiRequest(
            'POST',
            `/api/concept2cure/projects/${projectId}/artifacts`,
            {
              title,
              content: `<h1>${title}</h1><p>This governed draft was created from the selected workflow action. Continue by adding evidence-linked content, section rationale, and regulatory conclusions.</p>`,
              type: 'regulatory_document',
              category: 'document',
              ctdSection,
              templateId: templateKey,
              metadata: {
                source: 'generated_draft',
                governed: true,
              },
            }
          );
          const payload = await res.json();
          const created = payload.data ?? payload;
          createdId = created.id;
        }
        await loadArtifacts();
        if (!createdId) return;
        setSelectedDocId(createdId);
        applyWorkflowTransition('edit_document', { hasDoc: true });
        closePhase4Panel();
      } catch {
        pushShellToast('Failed to create draft', 'error');
      }
    },
    [projectId, loadArtifacts, closePhase4Panel, pushShellToast]
  );

  const documentConsequenceRows = useMemo(
    () =>
      buildDocumentConsequenceRows({
        artifacts,
        computeJobs,
        proposals: conversationSnapshot.proposals,
        canOpenArtifact: (artifactId: string, status: string) =>
          artifacts.some(a => a.id === artifactId) &&
          MODE_CAPABILITIES[resolveDocumentMode(workflowStage, status)].editable,
      }),
    [artifacts, computeJobs, conversationSnapshot.proposals]
  );

  const normalizeGovernanceState = useCallback(
    (proposal: (typeof conversationSnapshot.proposals)[number]) => {
      const artifactStatus = String(proposal.artifactStatus || '').toLowerCase();
      if (artifactStatus === 'locked')
        return { label: 'Locked / Finalized', tone: 'text-slate-700' };
      if (artifactStatus === 'review') return { label: 'Review in flight', tone: 'text-blue-700' };
      if (proposal.governanceState === 'ACCEPTED_GOVERNED')
        return { label: 'Accepted and governed', tone: 'text-emerald-700' };
      if (proposal.governanceState === 'ACCEPTED_PERSISTED_NO_GOVERNANCE')
        return { label: 'Generated (not governed)', tone: 'text-amber-700' };
      return { label: 'Generated', tone: 'text-stone-700' };
    },
    []
  );

  const captureReviewPackage = useCallback(
    async (proposal: (typeof conversationSnapshot.proposals)[number]) => {
      if (!proposal.artifactId) return;
      const packagePayload = {
        artifactId: proposal.artifactId,
        artifactVersion: proposal.artifactVersion ?? 1,
        artifactStatus: proposal.artifactStatus ?? 'draft',
        governanceState: proposal.governanceState ?? 'unknown',
        placementState: proposal.placementState ?? 'unplaced',
        provenanceRef: proposal.provenanceRef ?? null,
        auditRef: proposal.auditRef ?? null,
        latestConsequence:
          documentConsequenceRows.find(row => row.artifactId === proposal.artifactId) ?? null,
      };
      try {
        await navigator.clipboard.writeText(JSON.stringify(packagePayload, null, 2));
        pushShellToast('Review package copied to clipboard', 'success');
      } catch {
        pushShellToast('Unable to copy review package', 'error');
      }
    },
    [documentConsequenceRows, pushShellToast]
  );

  // ── Create missing subsection from template structure ────────────────────
  const handleCreateSubsection = useCallback(
    async (subsectionKey: string, label: string) => {
      if (!projectId || !activeArtifactRef.current) return;
      const art = activeArtifactRef.current;
      try {
        const scaffoldHtml = `<h2>${label}</h2><p>Draft this subsection with explicit evidence traceability, regulatory rationale, and reviewer-ready language aligned to submission expectations.</p>`;
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
      applyWorkflowTransition('edit_document', { hasDoc: true });
      setDocumentTab('content');
      setSectionReqs(null); // close reqs panel when opening governed panel
    },
    [tryOpenForEdit]
  );

  const handleSelectFolder = useCallback(
    (folderKey: string) => {
      setSelectedFolder(folderKey);
      setSelectedDocId(undefined);
      applyWorkflowTransition('browse_list', {});
      setSectionReqs(null);
    },
    [applyWorkflowTransition]
  );

  const handleSelectSection = useCallback(
    (ctdSection: string, _label: string) => {
      setSelectedCtdSection(ctdSection);
      const sectionArtifact = artifacts
        .filter(
          a => a.ctdSection === ctdSection || (a.ctdSection || '').startsWith(`${ctdSection}.`)
        )
        .sort((a, b) => {
          const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return tb - ta;
        })[0];
      if (sectionArtifact) {
        setSelectedDocId(sectionArtifact.id);
        if (tryOpenForEdit(sectionArtifact.status)) {
          applyWorkflowTransition('edit_document', { hasDoc: true });
        } else {
          applyWorkflowTransition('browse_list', {});
        }
      } else {
        setSelectedDocId(undefined);
        applyWorkflowTransition('browse_list', {});
      }
      setSectionReqs(null);
    },
    [artifacts, tryOpenForEdit, applyWorkflowTransition]
  );

  const handleBackToList = useCallback(() => {
    setSelectedDocId(undefined);
    applyWorkflowTransition('project_home', {});
  }, []);

  const handleLayerChange = useCallback(
    (layer: OperatingLayer) => {
      setActiveLayer(layer);
      if (layer === 'document_studio') {
        setPhase4Panel('none');
        return;
      }
      if (layer === 'vault') {
        setPhase4Panel('none');
        applyWorkflowTransition('browse_list', {});
        setLeftRailMode('files');
        return;
      }
      applyWorkflowTransition('browse_list', {});
      setPhase4Panel('pulse');
    },
    [applyWorkflowTransition]
  );

  const handleWorkbenchChange = useCallback(
    (workbench: WorkspaceWorkbench) => {
      setActiveWorkbench(workbench);
      const config = WORKBENCHES.find(item => item.id === workbench);
      if (!config) return;
      setSelectedFolder(config.defaultFolder);
      setLeftRailMode('files');
      applyWorkflowTransition('browse_list', {});
      setPhase4Panel('none');
    },
    [applyWorkflowTransition]
  );

  // Which docs to show in the center pane when browsing
  const browseLabel =
    leftRailMode === 'dossier'
      ? selectedCtdSection
        ? `Section ${selectedCtdSection}`
        : 'Select a section'
      : FOLDER_LABELS[selectedFolder] || selectedFolder;
  const browseDocs = leftRailMode === 'dossier' ? sectionDocs : folderDocs;
  const workflowStep = useMemo(() => {
    if (mode === 'edit') return 3;
    if (mode === 'browse') return selectedDocId ? 2 : 1;
    return 1;
  }, [mode, selectedDocId]);
  const approvedOrLockedCount = useMemo(
    () =>
      artifacts.filter(a => {
        const status = String(a.status || '').toLowerCase();
        return status === 'approved' || status === 'locked';
      }).length,
    [artifacts]
  );
  const submissionReady =
    approvedOrLockedCount > 0 &&
    readinessPercent >= 80 &&
    approvedOrLockedCount >= Math.max(1, Math.ceil(artifacts.length * 0.4));

  const guidedSequence = useMemo<Array<{ id: GuidedSequenceStage; label: string; hint: string }>>(
    () => [
      { id: 'project', label: 'Project', hint: 'Goal + plan context' },
      {
        id: 'ind_ectd',
        label: isINDWorkspace ? 'IND/eCTD' : 'Dossier',
        hint: 'Section map + package structure',
      },
      { id: 'authoring', label: 'Authoring', hint: 'Draft and refine governed docs' },
      { id: 'verify', label: 'Verify', hint: 'Readiness and quality checks' },
      { id: 'submission', label: 'Submission', hint: 'Assemble and publish package' },
    ],
    [isINDWorkspace]
  );

  const currentGuidedStage = useMemo<GuidedSequenceStage>(() => {
    if (submissionReady || projectNav === 'publish') return 'submission';
    if (
      projectNav === 'verify' ||
      projectNav === 'review' ||
      phase4Panel === 'verification' ||
      phase4Panel === 'pulse' ||
      reviewInFlight > 0
    ) {
      return 'verify';
    }
    if (mode === 'edit' || selectedDocId) return 'authoring';
    if (mode === 'dashboard' && !selectedCtdSection && !selectedDocId) return 'project';
    if (
      leftRailMode === 'dossier' ||
      !!selectedCtdSection ||
      isINDWorkspace ||
      projectNav === 'submission_builder'
    ) {
      return 'ind_ectd';
    }
    return 'project';
  }, [
    isINDWorkspace,
    leftRailMode,
    mode,
    phase4Panel,
    projectNav,
    reviewInFlight,
    selectedCtdSection,
    selectedDocId,
    submissionReady,
  ]);

  const navigateGuidedStage = useCallback(
    (stage: GuidedSequenceStage) => {
      if (stage === 'project') {
        setProjectNav('submission_builder');
        applyWorkflowTransition('project_home', {});
        setPhase4Panel('none');
        return;
      }
      if (stage === 'ind_ectd') {
        setProjectNav('submission_builder');
        setActiveLayer('document_studio');
        setLeftRailMode('dossier');
        applyWorkflowTransition('browse_list', {});
        if (nextRecommendedSection?.code) setSelectedCtdSection(nextRecommendedSection.code);
        return;
      }
      if (stage === 'authoring') {
        setProjectNav('submission_builder');
        setActiveLayer('document_studio');
        setLeftRailMode('dossier');
        if (selectedDocId) {
          if (tryOpenForEdit(activeArtifactRef.current?.status)) {
            applyWorkflowTransition('edit_document', { hasDoc: true });
          } else {
            applyWorkflowTransition('browse_list', {});
          }
          return;
        }
        if (nextRecommendedSection?.code) setSelectedCtdSection(nextRecommendedSection.code);
        applyWorkflowTransition('browse_list', {});
        return;
      }
      if (stage === 'verify') {
        setProjectNav('verify');
        setActiveLayer('reports');
        applyWorkflowTransition('browse_list', {});
        setPhase4Panel('verification');
        return;
      }
      setProjectNav('publish');
      if (onNavigate) {
        onNavigate('submissions');
      } else {
        applyWorkflowTransition('project_home', {});
      }
    },
    [
      applyWorkflowTransition,
      nextRecommendedSection?.code,
      onNavigate,
      projectNav,
      pushShellToast,
      selectedDocId,
      submissionReady,
      tryOpenForEdit,
    ]
  );

  const buildGuidedStagePrompt = useCallback(
    (stage: GuidedSequenceStage) => {
      const projectLabel = projectName || 'this project';
      const nextSectionText = nextRecommendedSection?.code
        ? `Next recommended section is ${nextRecommendedSection.code} ${nextRecommendedSection.title}.`
        : 'Select the highest-priority missing section.';
      if (stage === 'project') {
        return `Guide ${projectLabel} through project setup and confirm the submission strategy, regulatory pathway, and governed document sequence.`;
      }
      if (stage === 'ind_ectd') {
        return `Guide ${projectLabel} through IND/eCTD dossier planning. ${nextSectionText} Create the next concrete drafting plan.`;
      }
      if (stage === 'authoring') {
        return `For ${projectLabel}, take the lead on authoring the next governed draft and provide executable steps I can run now. ${nextSectionText}`;
      }
      if (stage === 'verify') {
        return `Run a verification pass for ${projectLabel}: readiness, blockers, contradictions, and promotion status. Provide the next required fixes in order.`;
      }
      return `Prepare ${projectLabel} for submission packaging and publishing. Confirm what is ready, what is missing, and execute the final assembly sequence.`;
    },
    [nextRecommendedSection?.code, nextRecommendedSection?.title, projectName]
  );

  const handleGuidedStageAction = useCallback(
    (stage: GuidedSequenceStage) => {
      if (guidedControlMode === 'ana') {
        onSuggestedPrompt?.(buildGuidedStagePrompt(stage));
        onNavigate?.('project-home');
        return;
      }
      navigateGuidedStage(stage);
    },
    [buildGuidedStagePrompt, guidedControlMode, navigateGuidedStage, onNavigate, onSuggestedPrompt]
  );

  const handleGuidedContinue = useCallback(() => {
    const currentIndex = guidedSequence.findIndex(step => step.id === currentGuidedStage);
    if (currentIndex < 0 || currentIndex === guidedSequence.length - 1) return;
    const nextStage = guidedSequence[Math.min(currentIndex + 1, guidedSequence.length - 1)]?.id;
    if (!nextStage) return;
    handleGuidedStageAction(nextStage);
  }, [currentGuidedStage, guidedSequence, handleGuidedStageAction]);

  useEffect(() => {
    if (!guidedStageCommand?.stage) return;
    handleGuidedStageAction(guidedStageCommand.stage);
  }, [guidedStageCommand?.stage, guidedStageCommand?.ts, handleGuidedStageAction]);

  // Outline available only when doc is open
  const outlineAvailable = mode === 'edit' && !!selectedDocId;

  // ── No project guard ────────────────────────────────────────────────────
  if (!projectId) {
    return (
      <div
        className="flex-1 flex items-center justify-center bg-stone-50/30 p-8"
        data-testid="no-project-selected"
      >
        <div className="max-w-sm text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-blue-50 flex items-center justify-center">
            <FolderOpen className="w-7 h-7 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-stone-900 mb-2">Select a Project</h2>
          <p className="text-sm text-stone-500 mb-5">
            Choose a project from the sidebar to access its documents, version history, and audit
            trail.
          </p>
          <button
            onClick={onSelectProject}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-800 text-white text-sm font-medium hover:bg-stone-900 transition-colors shadow-sm"
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
      <WorkspaceGovernanceProvider value={governance}>
      <div className="flex-1 flex flex-col min-h-0" data-testid="project-workspace-shell">
        {/* ── Compact breadcrumb bar — extracted to WorkspaceTopBar ──────── */}
        <WorkspaceTopBar
          projectType={projectType}
          projectName={projectName}
          mode={mode}
          selectedDocId={selectedDocId}
          showContextBars={showContextBars}
          onBackToProjects={onBackToProjects}
          onNavigateHome={() => {
            setSelectedDocId(undefined);
            applyWorkflowTransition('project_home', {});
          }}
          onNavigateFiles={() => applyWorkflowTransition('browse_list', {})}
          onToggleContextBars={() => setShowContextBars(prev => !prev)}
          onSwitchToIntelligence={onSwitchToIntelligence}
        />

        <WorkspaceContextBars
          showContextBars={showContextBars}
          isINDWorkspace={isINDWorkspace}
          mode={mode}
          workflowStep={workflowStep}
          guidedSequence={guidedSequence}
          currentGuidedStage={currentGuidedStage}
          guidedControlMode={guidedControlMode}
          activeLayer={activeLayer}
          activeWorkbench={activeWorkbench}
          activeArtifactTitle={activeArtifact?.title}
          reviewInFlight={reviewInFlight}
          projectNav={projectNav}
          selectedDocId={selectedDocId}
          selectedCtdSection={selectedCtdSection}
          readinessPercent={readinessPercent}
          nextRecommendedSection={nextRecommendedSection}
          onGuidedStageAction={handleGuidedStageAction}
          onGuidedContinue={handleGuidedContinue}
          onSetGuidedControlMode={setGuidedControlMode}
          onLayerChange={handleLayerChange}
          onWorkbenchChange={handleWorkbenchChange}
          onOpenReviews={() => {
            applyWorkflowTransition('project_home', {});
            setPhase4Panel('pulse');
          }}
          onOpenReports={() => setOperatingLayer('reports')}
          onOpenSubmissionBuilder={() => {
            setProjectNav('submission_builder');
            setActiveLayer('document_studio');
            setLeftRailMode('dossier');
            setMode(selectedDocId ? 'edit' : 'browse');
          }}
          onNavItemClick={id => {
            setProjectNav(id);
            if (id === 'communication_center') {
              applyWorkflowTransition('project_home', {});
              setPhase4Panel('communication_center');
            } else if (id === 'submission_builder') {
              setActiveLayer('document_studio');
              setLeftRailMode('dossier');
              setMode(selectedDocId ? 'edit' : 'browse');
              setPhase4Panel('none');
            } else if (id === 'cmc') {
              setActiveLayer('document_studio');
              setActiveWorkbench('cmc');
              setSelectedFolder('cmc');
              setLeftRailMode('dossier');
              applyWorkflowTransition('browse_list', {});
              setPhase4Panel('none');
            } else if (id === 'clinical_module5') {
              setActiveLayer('document_studio');
              setActiveWorkbench('clinical');
              setSelectedCtdSection('5');
              setLeftRailMode('dossier');
              applyWorkflowTransition('browse_list', {});
              setPhase4Panel('none');
            } else if (id === 'verify') {
              setActiveLayer('reports');
              applyWorkflowTransition('browse_list', {});
              setPhase4Panel('verification');
            } else if (id === 'review') {
              setActiveLayer('reports');
              applyWorkflowTransition('browse_list', {});
              setPhase4Panel('pulse');
            } else if (id === 'publish') {
              if (onNavigate) {
                onNavigate('submissions');
              } else if (
                !applyWorkflowTransition('publish_package', {
                  submissionContext: submissionReady,
                })
              ) {
                pushShellToast(
                  'Submission context missing. Complete verify/review before publish.',
                  'warning'
                );
              }
            } else if (id === 'haq') {
              setActiveLayer('reports');
              applyWorkflowTransition('project_home', {});
              setPhase4Panel('pulse');
            } else if (id === 'vault') {
              setActiveLayer('vault');
              applyWorkflowTransition('browse_list', {});
              setLeftRailMode('files');
            }
          }}
          onOpenSectionTree={() => {
            setLeftRailMode('dossier');
            applyWorkflowTransition('browse_list', {});
          }}
          onStartNextWithRI={() => {
            if (nextRecommendedSection?.code) {
              setSelectedCtdSection(nextRecommendedSection.code);
            }
            setLeftRailMode('dossier');
            applyWorkflowTransition('browse_list', {});
            setTimeout(() => {
              handleCreateSectionDraftWithRI();
            }, 0);
          }}
          onHAQPath={() => onNavigate?.('haq')}
          onAssembleExport={() => onNavigate?.('submissions')}
        />

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

        {/* ── Governance transition preflight banner ─────────────────────── */}
        {pendingPreflight && !pendingPreflight.allowed && (
          <TransitionPreflightBanner
            preflight={pendingPreflight}
            onOpenQueue={() => { setPendingPreflight(null); governance.openQueue(); }}
            onInspectDecision={(id) => { setPendingPreflight(null); governance.inspectDecision(id, 'under_review'); }}
            onRefresh={() => { governance.requestRefresh(); }}
            onDismiss={() => setPendingPreflight(null)}
            className="mx-3 mt-2 mb-1"
          />
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
                  : 'bg-stone-100 text-stone-500'
              )}
            >
              {activeArtifact.status || 'draft'}
            </span>
            <button
              onClick={() => {
                if (tryOpenForEdit(activeArtifact.status))
                  applyWorkflowTransition('edit_document', { hasDoc: true });
              }}
              className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Open →
            </button>
          </div>
        )}

        {/* ── Compact doc context bar (shown when editing) — document-led, minimal chrome */}
        {mode === 'edit' && activeArtifact && (
          <div className="flex items-center gap-2 px-4 h-8 border-b border-stone-100 bg-white shrink-0">
            <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <span className="text-xs font-semibold text-stone-800 truncate">
              {activeArtifact.title}
            </span>
            {activeArtifact.ctdSection && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium shrink-0">
                {activeArtifact.ctdSection}
              </span>
            )}
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
                activeArtifact.status === 'locked'
                  ? 'bg-red-50 text-red-600'
                  : activeArtifact.status === 'approved'
                  ? 'bg-green-50 text-green-600'
                  : activeArtifact.status === 'review'
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-stone-50 text-stone-400'
              )}
            >
              {activeArtifact.status || 'draft'}
            </span>
            {activeArtifact.version && (
              <span className="text-[10px] text-stone-400 tabular-nums">
                v{activeArtifact.version}
              </span>
            )}
            {/* Essential doc-level actions — secondary actions available in EditorPanel overflow */}
            <div className="ml-auto flex items-center gap-0.5">
              <button
                onClick={() => openVerification(activeArtifact.id)}
                className="p-1 text-stone-300 hover:text-emerald-600 rounded hover:bg-emerald-50 transition-colors"
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
                className="p-1.5 text-stone-400 hover:text-violet-600 rounded-md hover:bg-blue-50"
                title="Transform Canvas"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={openProgramTwin}
                className="p-1.5 text-stone-400 hover:text-blue-600 rounded-md hover:bg-blue-50"
                title="Program Twin"
              >
                <Target className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() =>
                  openSubmissionApps(activeArtifact.ctdSection, activeArtifact.templateId)
                }
                className="p-1.5 text-stone-400 hover:text-orange-600 rounded-md hover:bg-orange-50"
                title="AI Assistants"
              >
                <AppWindow className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={openReviewPulse}
                className={cn(
                  'p-1 rounded transition-colors',
                  phase4Panel === 'pulse'
                    ? 'text-rose-600 bg-rose-50'
                    : 'text-stone-300 hover:text-rose-600 hover:bg-rose-50'
                )}
                title="Review Pulse"
              >
                <Activity className="w-3.5 h-3.5" />
              </button>
              <NotificationCenter projectId={projectId} industryMode={industryMode} />
            </div>
          </div>
        )}

        {/* Trust strip and document tabs removed from edit mode —
            EditorPanel's InspectorRibbon provides all these capabilities
            (Provenance, Compare, Audit, Versions, Review, Compliance, etc.)
            with better stage-aware progressive disclosure. */}

        {/* ── 3-pane body ───────────────────────────────────────────────────── */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Tree panel with mode toggle — hidden in dashboard mode for full-width layout */}
          {mode !== 'dashboard' && (
            <WorkspaceLeftRail
              isINDWorkspace={isINDWorkspace}
              operatingLayer={operatingLayer}
              setOperatingLayer={setOperatingLayer}
              activeRegistry={activeRegistry}
              setActiveRegistry={setActiveRegistry}
              leftRailMode={leftRailMode}
              setLeftRailMode={setLeftRailMode}
              outlineAvailable={outlineAvailable}
              activeArtifact={activeArtifact}
              loading={loading}
              artifacts={artifacts}
              selectedDocId={selectedDocId}
              selectedFolder={selectedFolder}
              pendingMove={pendingMove}
              selectedCtdSection={selectedCtdSection}
              setSelectedCtdSection={setSelectedCtdSection}
              submissionDossierHierarchy={submissionDossierHierarchy}
              dossierMetrics={dossierMetrics}
              activeDocContent={activeDocContent}
              activeDocTitle={activeDocTitle}
              submissionType={submissionType}
              projectType={projectType}
              projectId={projectId}
              projectName={projectName}
              phase4Panel={phase4Panel}
              handleSelectDoc={handleSelectDoc}
              handleSelectFolder={handleSelectFolder}
              setShowNewDoc={setShowNewDoc}
              handleCutDocument={handleCutDocument}
              handleOpenPlacementForDoc={handleOpenPlacementForDoc}
              handleCopyCtdPath={handleCopyCtdPath}
              handlePasteHere={handlePasteHere}
              handleSelectSection={handleSelectSection}
              handlePlaceArtifact={selectedDocId || pendingMove ? handlePlaceArtifact : undefined}
              handleViewSectionReqs={handleViewSectionReqs}
              openTransformCanvas={openTransformCanvas}
              openProgramTwin={openProgramTwin}
              openSubmissionApps={openSubmissionApps}
              handleCreateFromTemplate={handleCreateFromTemplate}
              setShowNewDocDialog={setShowNewDocDialog}
              applyWorkflowTransition={applyWorkflowTransition}
              handleOutlineNavigate={handleOutlineNavigate}
              handleCreateSubsection={handleCreateSubsection}
              openReviewPulse={openReviewPulse}
            />
          )}

          {/* Center + Right: Content area */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* New document input strip */}
            {showNewDoc && (
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-stone-200 bg-stone-50/60 shrink-0">
                <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
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
                  className="flex-1 px-2 py-1 text-sm border border-stone-200 rounded focus-visible:ring-2 focus-visible:ring-stone-400 outline-none/30"
                  autoFocus
                />
                <button
                  onClick={handleCreateNew}
                  disabled={creatingNew || !newDocTitle.trim()}
                  className="px-2.5 py-1 text-xs bg-stone-800 text-white rounded hover:bg-stone-900 disabled:opacity-60 font-medium flex items-center gap-1"
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
                  className="px-2 py-1 text-xs text-stone-500 hover:text-stone-700"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Mode: browse = DocumentListPane, edit = EditorPanel, Phase 4 overlay */}
            <WorkspaceCenterSurface
              mode={mode}
              phase4Panel={phase4Panel}
              phase4Ctx={phase4Ctx}
              operatingLayer={operatingLayer}
              projectId={projectId}
              projectName={projectName}
              projectType={projectType}
              submissionType={submissionType}
              artifacts={artifacts}
              onClosePhase4Panel={closePhase4Panel}
              onPhase4CreateDraft={handlePhase4CreateDraft}
              onOpenEditorForArtifact={(artId: string) => {
                const art = artifacts.find(a => a.id === artId);
                if (!tryOpenForEdit(art?.status)) return;
                setSelectedDocId(artId);
                applyWorkflowTransition('edit_document', { hasDoc: true });
                closePhase4Panel();
              }}
              onOpenPlacementForArtifact={(artId: string) => {
                const art = artifacts.find(a => a.id === artId);
                if (art) handleOpenPlacementForDoc(art, art.ctdSection ? 'relocate' : 'place');
              }}
              onOpenVerification={openVerification}
              onOpenTransformCanvas={openTransformCanvas}
              onCreateSubsection={handleCreateSubsection}
              onSelectSection={(section: string) => {
                setSelectedCtdSection(section);
                applyWorkflowTransition('browse_list', {});
              }}
              onNavigateToArtifact={(artifactId: string) => {
                const art = artifacts.find(a => a.id === artifactId);
                closePhase4Panel();
                if (!tryOpenForEdit(art?.status)) {
                  setSelectedDocId(artifactId);
                  applyWorkflowTransition('browse_list', {});
                  return;
                }
                setSelectedDocId(artifactId);
                applyWorkflowTransition('edit_document', { hasDoc: true });
              }}
              onNavigate={onNavigate}
              dashboardProps={{
                projectNav,
                reviewInFlight,
                documentConsequenceRows,
                proposals: conversationSnapshot.proposals,
                onSetComputeJobs: (jobs: any[]) => setComputeJobs(jobs),
                onOpenComputeArtifact: openComputeArtifact,
                onOpenPlacementForDoc: handleOpenPlacementForDoc,
                onOpenDocument: (docId: string) => {
                  const art = artifacts.find(a => a.id === docId);
                  if (!tryOpenForEdit(art?.status)) {
                    setSelectedDocId(docId);
                    applyWorkflowTransition('browse_list', {});
                    return;
                  }
                  setSelectedDocId(docId);
                  applyWorkflowTransition('edit_document', { hasDoc: true });
                  setShowGovernedPanel(true);
                },
                onCreateDocument: () => setShowNewDocDialog(true),
                onOpenEditor: () => applyWorkflowTransition('browse_list', {}),
                onOpenDossier: () => {
                  setLeftRailMode('dossier');
                  applyWorkflowTransition('browse_list', {});
                },
                onSwitchToIntelligence,
                onNavigate,
                onActOnProposal: actOnProposal,
                normalizeGovernanceState,
                captureReviewPackage,
              }}
              browseProps={{
                activeLayer,
                isINDWorkspace,
                leftRailMode,
                selectedCtdSection,
                browseLabel,
                browseDocs,
                selectedDocId,
                onSelectDoc: handleSelectDoc,
                onShowNewDoc: () => setShowNewDoc(true),
                onCreateSectionDraftWithRI: handleCreateSectionDraftWithRI,
                onDialogCreateFromTemplate: handleDialogCreateFromTemplate,
                onDialogCreateBlank: handleDialogCreateBlank,
                onCutDocument: handleCutDocument,
                onCopyCtdPath: handleCopyCtdPath,
                onOpenPlacementForDoc: handleOpenPlacementForDoc,
              }}
              editProps={{
                initialContent,
                initialTitle,
                initialCtdSection,
                initialTemplateId,
                onInitialContentConsumed,
                openArtifactId,
                onOpenArtifactConsumed,
                onContentChange: handleDocContentChange,
                editorInitialInspector,
                editorContainerRef,
              }}
            />
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
                applyWorkflowTransition('edit_document', { hasDoc: true });
                setDocumentTab('versions');
              }}
            />
          )}

          {/* ── Governed decision review queue panel ─────────────────────────── */}
          {reviewQueueVisible && projectId && (
            <GovernedDecisionReviewPanel
              projectId={String(projectId)}
              className="w-[320px] shrink-0 h-full"
              onClose={() => governance.closeQueue()}
              onInspectDecision={(id, state) => governance.inspectDecision(id, state)}
              onActionStarted={(id, action) => governance.startAction(id, action)}
              onActionCompleted={(result) => governance.completeAction({
                ...result,
                completedAt: new Date().toISOString(),
              })}
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
                  'pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg shadow-sm text-xs font-medium',
                  t.type === 'success' && 'bg-emerald-600 text-white',
                  t.type === 'error' && 'bg-red-600 text-white',
                  t.type === 'info' && 'bg-stone-700 text-white'
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
        </WorkspaceGovernanceProvider>
    </DocumentModeProvider>
  );
};

export default ProjectWorkspaceShell;
