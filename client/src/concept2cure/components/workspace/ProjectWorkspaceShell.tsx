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
import {
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

import {
  DocumentModeProvider,
  type WorkflowStage,
} from '../../contexts/DocumentModeContext';
import {
  useWorkspaceNavigationState,
  useGuidedSequenceState,
  useDocumentConsequenceState,
  usePhase4Panels,
} from './workspaceShellControllers';

import { NewDocumentDialog } from './NewDocumentDialog';
import { SectionRequirementsPanel, type SectionMetrics } from './SectionRequirementsPanel';

import type {
  OperatingLayer,
  WorkspaceWorkbench,
  GuidedSequenceStage,
} from './workspaceShellControllers';
import {
  type DocumentTab,
  FOLDER_LABELS,
} from './workspaceShellConstants';

// ── Extracted orchestration modules ─────────────────────────────────────────
import {
  useWorkflowTransitionApplicator,
  useLayerSwitching,
  useWorkbenchSwitching,
  useGuidedSequenceDefinition,
  useCurrentGuidedStage,
  useGuidedStageNavigation,
  useBuildGuidedStagePrompt,
  useProjectNavSync,
} from './workspaceNavigationOrchestrator';
import {
  useShellToasts,
  useEscalationGate,
  useArtifactLoader,
  useComputeJobLoader,
  useDossierMetricsLoader,
  classifyArtifact,
  useDocumentCreation,
  usePlacementOperations,
} from './workspaceArtifactManager';
import {
  usePhase4PanelOpeners,
  useComputeArtifactOpener,
  usePhase4DraftCreation,
  useDocumentConsequenceRows,
  useGovernanceNormalizer,
  useReviewPackageCapture,
  useSubsectionCreation,
} from './workspacePhase4Orchestrator';
import {
  useConversationSnapshot as useConversationSnapshotHook,
  useProposalActions,
  useWorkspaceResumeState,
  useDocumentTabSync,
  useWorkspaceKeyboardShortcuts,
  useOutlineNavigation,
  useWorkspaceSelectionHandlers,
} from './workspaceConversationAndState';

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
  // ── Artifact data (extracted to workspaceArtifactManager) ────────────────
  const { artifacts, loading, loadArtifacts } = useArtifactLoader(projectId);
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

  // New document creation state
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);

  // Inspector panel to auto-open in EditorPanel (set via GovernedDocumentPanel)
  const [editorInitialInspector, setEditorInitialInspector] = useState<
    'compare' | 'provenance' | 'audit' | null
  >(null);

  // Placement state now managed by usePlacementOperations below

  // Dossier metrics (extracted to workspaceArtifactManager)
  const { dossierMetrics, loadDossierMetrics } = useDossierMetricsLoader(projectId);

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
  const { computeJobs, setComputeJobs, showGovernedPanel, setShowGovernedPanel } =
    useDocumentConsequenceState();

  // Editor ref for outline scroll
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const { phase4Panel, setPhase4Panel, phase4Ctx, setPhase4Ctx } = usePhase4Panels();

  // ── Workflow transitions (extracted to workspaceNavigationOrchestrator) ──
  const applyWorkflowTransition = useWorkflowTransitionApplicator(mode, setMode);

  // If initialContent is provided, go straight to edit mode
  useEffect(() => {
    if (initialContent && initialTitle) {
      applyWorkflowTransition('edit_document', { hasDoc: true });
    }
  }, [initialContent, initialTitle]);

  // Conversation-OS snapshot fetch (extracted to workspaceConversationAndState)
  useConversationSnapshotHook(projectId, mode, setConversationSnapshot);

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

  // loadArtifacts extracted to useArtifactLoader above

  const loadComputeJobs = useComputeJobLoader(projectId, setComputeJobs);

  // Proposal accept/reject actions (extracted to workspaceConversationAndState)
  const { actOnProposal } = useProposalActions(projectId, loadArtifacts, setConversationSnapshot);

  // Resume where left off — persist last active artifact per project (extracted to workspaceConversationAndState)
  useWorkspaceResumeState(projectId, selectedDocId, setSelectedDocId, artifacts, openArtifactId, initialContent, applyWorkflowTransition);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  useEffect(() => {
    loadComputeJobs();
  }, [loadComputeJobs]);

  // loadDossierMetrics extracted to useDossierMetricsLoader above

  useEffect(() => {
    loadDossierMetrics();
  }, [loadDossierMetrics, artifacts]);

  // ── Clear pending move on project change ─────────────────────────────────
  useEffect(() => {
    setPendingMove(null);
  }, [projectId]);

  // ── Toast + escalation gate (extracted to workspaceArtifactManager) ──────
  const { shellToasts, pushShellToast, dismissToast } = useShellToasts();
  const tryOpenForEdit = useEscalationGate(pushShellToast);

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

  // ProjectNav sync (extracted to workspaceNavigationOrchestrator)
  useProjectNavSync(activeLayer, mode, phase4Panel, setProjectNav);

  // Document tab sync (extracted to workspaceConversationAndState)
  useDocumentTabSync(mode, documentTab, setShowGovernedPanel, setEditorInitialInspector, setDocumentTab, showContextBars, setShowContextBars);

  // Outline navigation (extracted to workspaceConversationAndState)
  const { handleOutlineNavigate } = useOutlineNavigation(editorContainerRef);

  // classifyArtifact extracted to workspaceArtifactManager

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

  // ── Document creation (5 paths — extracted to workspaceArtifactManager) ──
  const {
    newDocTitle, setNewDocTitle, creatingNew,
    handleCreateNew, handleCreateFromTemplate,
    handleDialogCreateBlank, handleDialogCreateFromTemplate,
    handleCreateSectionDraftWithRI,
  } = useDocumentCreation({
    projectId, projectName, projectType, submissionType,
    resolvedSubmissionProgram, selectedCtdSection,
    loadArtifacts, pushShellToast, setSelectedDocId,
    setShowNewDoc, setShowNewDocDialog, setLeftRailMode,
    applyWorkflowTransition,
  });

  const workflowStage: WorkflowStage = (() => {
    if (mode === 'dashboard') return 'project-home';
    if (mode === 'edit') return 'section-workspace';
    if (leftRailMode === 'dossier') return 'dossier';
    return 'documents';
  })();

  // ── Placement/move operations (extracted to workspaceArtifactManager) ──
  const {
    placementDialog, setPlacementDialog, placementLoading,
    pendingMove, setPendingMove, cutBlockedMessage, setCutBlockedMessage,
    handlePlaceArtifact, handleCutDocument, handlePasteHere,
    handleCancelMove, handlePlacementConfirmWithCleanup,
    handleCopyCtdPath, handleOpenPlacementForDoc,
  } = usePlacementOperations({
    projectId, artifacts, selectedDocId, workflowStage,
    loadArtifacts, pushShellToast,
  });

  // Global keyboard shortcuts (extracted to workspaceConversationAndState)
  useWorkspaceKeyboardShortcuts(pendingMove, setPendingMove, phase4Panel, setPhase4Panel);

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

  // ── Phase 4 panel openers (extracted to workspacePhase4Orchestrator) ────
  const {
    openTransformCanvas, openVerification, openProgramTwin,
    openSubmissionApps, openReviewPulse, closePhase4Panel,
  } = usePhase4PanelOpeners(artifacts, activeArtifactRef, setPhase4Panel, setPhase4Ctx);

  const openComputeArtifact = useComputeArtifactOpener(
    artifacts, pushShellToast, setSelectedDocId, setDocumentTab, applyWorkflowTransition
  );

  const handlePhase4CreateDraft = usePhase4DraftCreation(
    projectId, loadArtifacts, setSelectedDocId, applyWorkflowTransition, closePhase4Panel, pushShellToast
  );

  // ── Consequence/governance (extracted to workspacePhase4Orchestrator) ──
  const documentConsequenceRows = useDocumentConsequenceRows(
    artifacts, computeJobs, conversationSnapshot.proposals, workflowStage
  );
  const normalizeGovernanceState = useGovernanceNormalizer();
  const captureReviewPackage = useReviewPackageCapture(documentConsequenceRows, pushShellToast);
  const handleCreateSubsection = useSubsectionCreation(
    projectId, activeArtifactRef, activeDocContent, loadArtifacts, pushShellToast
  );

  // Selection handlers (extracted to workspaceConversationAndState)
  const { handleSelectDoc, handleSelectFolder, handleSelectSection, handleBackToList } =
    useWorkspaceSelectionHandlers(
      tryOpenForEdit, setSelectedDocId, applyWorkflowTransition,
      setDocumentTab, setSectionReqs, setSelectedFolder,
      setSelectedCtdSection, artifacts,
    );

  // ── Layer/workbench switching (extracted to workspaceNavigationOrchestrator) ──
  const handleLayerChange = useLayerSwitching(
    setActiveLayer, setPhase4Panel, setLeftRailMode, applyWorkflowTransition
  );
  const handleWorkbenchChange = useWorkbenchSwitching(
    setActiveWorkbench, setSelectedFolder, setLeftRailMode, setPhase4Panel, applyWorkflowTransition
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

  // ── Guided sequence (extracted to workspaceNavigationOrchestrator) ──────
  const guidedSequence = useGuidedSequenceDefinition(isINDWorkspace);
  const currentGuidedStage = useCurrentGuidedStage({
    isINDWorkspace, leftRailMode, mode, phase4Panel, projectNav,
    reviewInFlight, selectedCtdSection, selectedDocId, submissionReady,
  });
  const navigateGuidedStage = useGuidedStageNavigation({
    setProjectNav, setActiveLayer, setLeftRailMode, setPhase4Panel, setSelectedCtdSection,
    selectedDocId, activeArtifactStatus: activeArtifactRef.current?.status,
    nextRecommendedSectionCode: nextRecommendedSection?.code,
    onNavigate, submissionReady, applyWorkflowTransition, pushShellToast,
  });
  const buildGuidedStagePrompt = useBuildGuidedStagePrompt(projectName, nextRecommendedSection);

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
    </DocumentModeProvider>
  );
};

export default ProjectWorkspaceShell;
