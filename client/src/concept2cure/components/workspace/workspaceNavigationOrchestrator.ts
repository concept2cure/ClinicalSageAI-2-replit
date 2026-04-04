/**
 * workspaceNavigationOrchestrator.ts
 *
 * Extracted from ProjectWorkspaceShell — owns navigation state orchestration:
 * - Workflow transition application
 * - Layer/workbench switching
 * - Guided sequence stage navigation and prompt building
 * - Mode-to-projectNav synchronization
 */

import { useCallback, useMemo, useEffect } from 'react';
import type { SectionNode } from '../../hooks/useSubmissionSections';
import {
  type WorkspaceMode,
  type LeftRailMode,
  type OperatingLayer,
  type WorkspaceWorkbench,
  type GuidedSequenceStage,
  type Phase4Panel,
  type ProjectNav,
  type WorkflowTransition,
  WORKFLOW_TRANSITION_MAP,
} from './workspaceShellControllers';
import { WORKBENCHES } from './workspaceShellConstants';
import { canEscalateToEdit } from '../../contexts/DocumentModeContext';
import type { TreeArtifact } from './ProjectFileTree';

// ── Workflow transition application ─────────────────────────────────────────

export function useWorkflowTransitionApplicator(
  mode: WorkspaceMode,
  setMode: (m: WorkspaceMode) => void
) {
  const applyWorkflowTransition = useCallback(
    (
      key: string,
      context: {
        hasDoc?: boolean;
        createIntent?: boolean;
        reviewContext?: boolean;
        submissionContext?: boolean;
      } = {}
    ) => {
      const transition = WORKFLOW_TRANSITION_MAP[key];
      if (!transition) return false;

      if (!transition.from.includes(mode)) {
        setMode(transition.fallback);
        return false;
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
    [mode, setMode]
  );

  return applyWorkflowTransition;
}

// ── Layer switching ─────────────────────────────────────────────────────────

export function useLayerSwitching(
  setActiveLayer: (l: OperatingLayer) => void,
  setPhase4Panel: (p: Phase4Panel) => void,
  setLeftRailMode: (m: LeftRailMode) => void,
  applyWorkflowTransition: (key: string, ctx: Record<string, any>) => boolean
) {
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
    [setActiveLayer, setPhase4Panel, setLeftRailMode, applyWorkflowTransition]
  );

  return handleLayerChange;
}

// ── Workbench switching ─────────────────────────────────────────────────────

export function useWorkbenchSwitching(
  setActiveWorkbench: (w: WorkspaceWorkbench) => void,
  setSelectedFolder: (f: string) => void,
  setLeftRailMode: (m: LeftRailMode) => void,
  setPhase4Panel: (p: Phase4Panel) => void,
  applyWorkflowTransition: (key: string, ctx: Record<string, any>) => boolean
) {
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
    [setActiveWorkbench, setSelectedFolder, setLeftRailMode, setPhase4Panel, applyWorkflowTransition]
  );

  return handleWorkbenchChange;
}

// ── Guided sequence ─────────────────────────────────────────────────────────

export function useGuidedSequenceDefinition(isINDWorkspace: boolean) {
  return useMemo<Array<{ id: GuidedSequenceStage; label: string; hint: string }>>(
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
}

export function useCurrentGuidedStage(deps: {
  isINDWorkspace: boolean;
  leftRailMode: LeftRailMode;
  mode: WorkspaceMode;
  phase4Panel: Phase4Panel;
  projectNav: ProjectNav;
  reviewInFlight: number;
  selectedCtdSection: string | undefined;
  selectedDocId: string | undefined;
  submissionReady: boolean;
}): GuidedSequenceStage {
  const {
    isINDWorkspace,
    leftRailMode,
    mode,
    phase4Panel,
    projectNav,
    reviewInFlight,
    selectedCtdSection,
    selectedDocId,
    submissionReady,
  } = deps;

  return useMemo<GuidedSequenceStage>(() => {
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
}

export function useGuidedStageNavigation(deps: {
  setProjectNav: (nav: ProjectNav) => void;
  setActiveLayer: (l: OperatingLayer) => void;
  setLeftRailMode: (m: LeftRailMode) => void;
  setPhase4Panel: (p: Phase4Panel) => void;
  setSelectedCtdSection: (s: string) => void;
  selectedDocId: string | undefined;
  activeArtifactStatus: string | undefined;
  nextRecommendedSectionCode: string | undefined;
  onNavigate: ((mode: string) => void) | undefined;
  submissionReady: boolean;
  applyWorkflowTransition: (key: string, ctx: Record<string, any>) => boolean;
  pushShellToast: (message: string, type: 'success' | 'error' | 'info') => void;
}) {
  const {
    setProjectNav,
    setActiveLayer,
    setLeftRailMode,
    setPhase4Panel,
    setSelectedCtdSection,
    selectedDocId,
    activeArtifactStatus,
    nextRecommendedSectionCode,
    onNavigate,
    submissionReady,
    applyWorkflowTransition,
    pushShellToast,
  } = deps;

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
        if (nextRecommendedSectionCode) setSelectedCtdSection(nextRecommendedSectionCode);
        return;
      }
      if (stage === 'authoring') {
        setProjectNav('submission_builder');
        setActiveLayer('document_studio');
        setLeftRailMode('dossier');
        if (selectedDocId) {
          const check = canEscalateToEdit('section-workspace', activeArtifactStatus as any);
          if (check.allowed) {
            applyWorkflowTransition('edit_document', { hasDoc: true });
          } else {
            applyWorkflowTransition('browse_list', {});
          }
          return;
        }
        if (nextRecommendedSectionCode) setSelectedCtdSection(nextRecommendedSectionCode);
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
      setProjectNav,
      setActiveLayer,
      setLeftRailMode,
      setPhase4Panel,
      setSelectedCtdSection,
      selectedDocId,
      activeArtifactStatus,
      nextRecommendedSectionCode,
      onNavigate,
      applyWorkflowTransition,
    ]
  );

  return navigateGuidedStage;
}

export function useBuildGuidedStagePrompt(
  projectName: string | undefined,
  nextRecommendedSection: { code: string; title: string } | undefined
) {
  return useCallback(
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
    [projectName, nextRecommendedSection?.code, nextRecommendedSection?.title]
  );
}

// ── Mode-to-projectNav sync ─────────────────────────────────────────────────

export function useProjectNavSync(
  activeLayer: OperatingLayer,
  mode: WorkspaceMode,
  phase4Panel: Phase4Panel,
  setProjectNav: (nav: ProjectNav) => void
) {
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
  }, [activeLayer, mode, phase4Panel, setProjectNav]);
}
