/**
 * useWorkspaceGuidedSequence — Guided sequence derivation, navigation logic,
 * and stage prompt generation extracted from ProjectWorkspaceShell.
 */

import { useCallback, useMemo } from 'react';
import type { SectionNode } from '../../hooks/useSubmissionSections';
import type {
  GuidedSequenceStage,
  LeftRailMode,
  OperatingLayer,
  Phase4Panel,
  ProjectNav,
  WorkspaceMode,
} from './workspaceShellControllers';

// ── Types ────────────────────────────────────────────────────────────────────
export interface GuidedStep {
  id: GuidedSequenceStage;
  label: string;
  hint: string;
}

interface GuidedSequenceDeps {
  isINDWorkspace: boolean;
  mode: WorkspaceMode;
  projectNav: ProjectNav;
  phase4Panel: Phase4Panel;
  leftRailMode: LeftRailMode;
  selectedDocId?: string;
  selectedCtdSection?: string;
  reviewInFlight: number;
  submissionReady: boolean;
  projectName?: string;
  nextRecommendedSection?: SectionNode;
  guidedControlMode: 'ana' | 'client';
  // Setters
  setProjectNav: (nav: ProjectNav) => void;
  setActiveLayer: (layer: OperatingLayer) => void;
  setLeftRailMode: (mode: LeftRailMode) => void;
  setPhase4Panel: (panel: Phase4Panel) => void;
  setSelectedCtdSection: (section: string | undefined) => void;
  applyWorkflowTransition: (key: string, ctx?: Record<string, any>) => boolean;
  tryOpenForEdit: (status?: string) => boolean;
  activeArtifactStatus?: string;
  onNavigate?: (mode: string) => void;
  onSuggestedPrompt?: (prompt: string) => void;
}

export function useWorkspaceGuidedSequence(deps: GuidedSequenceDeps) {
  const {
    isINDWorkspace,
    mode,
    projectNav,
    phase4Panel,
    leftRailMode,
    selectedDocId,
    selectedCtdSection,
    reviewInFlight,
    submissionReady,
    projectName,
    nextRecommendedSection,
    guidedControlMode,
    setProjectNav,
    setActiveLayer,
    setLeftRailMode,
    setPhase4Panel,
    setSelectedCtdSection,
    applyWorkflowTransition,
    tryOpenForEdit,
    activeArtifactStatus,
    onNavigate,
    onSuggestedPrompt,
  } = deps;

  // ── Static step definitions ────────────────────────────────────────────
  const guidedSequence = useMemo<GuidedStep[]>(
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

  // ── Current stage derivation ───────────────────────────────────────────
  const currentGuidedStage = useMemo<GuidedSequenceStage>(() => {
    if (submissionReady || projectNav === 'publish') return 'submission';
    if (
      projectNav === 'verify' ||
      projectNav === 'review' ||
      phase4Panel === 'verification' ||
      phase4Panel === 'pulse' ||
      reviewInFlight > 0
    )
      return 'verify';
    if (mode === 'edit' || selectedDocId) return 'authoring';
    if (mode === 'dashboard' && !selectedCtdSection && !selectedDocId) return 'project';
    if (
      leftRailMode === 'dossier' ||
      !!selectedCtdSection ||
      isINDWorkspace ||
      projectNav === 'submission_builder'
    )
      return 'ind_ectd';
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

  // ── Stage navigation (client-led mode) ─────────────────────────────────
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
          if (tryOpenForEdit(activeArtifactStatus)) {
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
      // 'submission'
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
      selectedDocId,
      tryOpenForEdit,
      activeArtifactStatus,
      setProjectNav,
      setActiveLayer,
      setLeftRailMode,
      setPhase4Panel,
      setSelectedCtdSection,
    ]
  );

  // ── Prompt generator (Ana-led mode) ────────────────────────────────────
  const buildGuidedStagePrompt = useCallback(
    (stage: GuidedSequenceStage) => {
      const projectLabel = projectName || 'this project';
      const nextSectionText = nextRecommendedSection?.code
        ? `Next recommended section is ${nextRecommendedSection.code} ${nextRecommendedSection.title}.`
        : 'Select the highest-priority missing section.';
      switch (stage) {
        case 'project':
          return `Guide ${projectLabel} through project setup and confirm the submission strategy, regulatory pathway, and governed document sequence.`;
        case 'ind_ectd':
          return `Guide ${projectLabel} through IND/eCTD dossier planning. ${nextSectionText} Create the next concrete drafting plan.`;
        case 'authoring':
          return `For ${projectLabel}, take the lead on authoring the next governed draft and provide executable steps I can run now. ${nextSectionText}`;
        case 'verify':
          return `Run a verification pass for ${projectLabel}: readiness, blockers, contradictions, and promotion status. Provide the next required fixes in order.`;
        default:
          return `Prepare ${projectLabel} for submission packaging and publishing. Confirm what is ready, what is missing, and execute the final assembly sequence.`;
      }
    },
    [nextRecommendedSection?.code, nextRecommendedSection?.title, projectName]
  );

  // ── Unified stage action (dispatches to Ana or client-led) ─────────────
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

  // ── Continue to next stage ─────────────────────────────────────────────
  const handleGuidedContinue = useCallback(() => {
    const currentIndex = guidedSequence.findIndex(step => step.id === currentGuidedStage);
    if (currentIndex < 0 || currentIndex === guidedSequence.length - 1) return;
    const nextStage = guidedSequence[currentIndex + 1]?.id;
    if (nextStage) handleGuidedStageAction(nextStage);
  }, [currentGuidedStage, guidedSequence, handleGuidedStageAction]);

  return {
    guidedSequence,
    currentGuidedStage,
    navigateGuidedStage,
    handleGuidedStageAction,
    handleGuidedContinue,
  };
}
