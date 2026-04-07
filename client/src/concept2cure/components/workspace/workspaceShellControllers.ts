import { useMemo, useState } from 'react';
import type { TreeArtifact } from './ProjectFileTree';
import type { ConsequenceComputeJob } from './documentConsequence';

export type WorkspaceMode = 'dashboard' | 'browse' | 'edit';
export type LeftRailMode = 'files' | 'dossier' | 'templates' | 'outline' | 'registry';
export type OperatingLayer = 'document_studio' | 'vault' | 'reports' | 'documents';
export type WorkspaceWorkbench = 'cmc' | 'biostats' | 'device' | 'clinical';
export type ProjectNav =
  | 'submission_builder'
  | 'communications'
  | 'cmc'
  | 'clinical_module5'
  | 'verify'
  | 'review'
  | 'publish'
  | 'haq'
  | 'vault'
  | 'communication_center'
  | 'reports'
  | 'activity'
  | 'documents';
export type GuidedSequenceStage = 'project' | 'ind_ectd' | 'authoring' | 'verify' | 'submission';
export type Phase4Panel =
  | 'none'
  | 'transform'
  | 'verification'
  | 'twin'
  | 'apps'
  | 'pulse'
  | 'communication_center';

export interface PendingMove {
  artifact: TreeArtifact;
  fromSection: string | null;
  targetSection?: string;
}

export const useWorkspaceNavigationState = () => {
  const [mode, setMode] = useState<WorkspaceMode>('dashboard');
  const [projectNav, setProjectNav] = useState<ProjectNav>('submission_builder');
  const [leftRailMode, setLeftRailMode] = useState<LeftRailMode>('files');
  const [activeLayer, setActiveLayer] = useState<OperatingLayer>('document_studio');
  const [activeWorkbench, setActiveWorkbench] = useState<WorkspaceWorkbench>('clinical');
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
  const [selectedCtdSection, setSelectedCtdSection] = useState<string | undefined>();

  return {
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
    selectedDocId,
    setSelectedDocId,
    selectedCtdSection,
    setSelectedCtdSection,
  };
};

export const useGuidedSequenceState = () => {
  const [guidedControlMode, setGuidedControlMode] = useState<'ana' | 'client'>('ana');
  const [guidedStage, setGuidedStage] = useState<GuidedSequenceStage>('project');
  return { guidedControlMode, setGuidedControlMode, guidedStage, setGuidedStage };
};

export const usePlacementAndMoveState = () => {
  const [placementDialog, setPlacementDialog] = useState<{
    open: boolean;
    artifact: TreeArtifact | null;
    operation: 'move' | 'place';
    targetSection?: string;
  }>({ open: false, artifact: null, operation: 'place' });
  const [placementLoading, setPlacementLoading] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  return {
    placementDialog,
    setPlacementDialog,
    placementLoading,
    setPlacementLoading,
    pendingMove,
    setPendingMove,
  };
};

export const useDocumentConsequenceState = () => {
  const [computeJobs, setComputeJobs] = useState<ConsequenceComputeJob[]>([]);
  const [showGovernedPanel, setShowGovernedPanel] = useState(false);
  const [proposalActionState, setProposalActionState] = useState<Record<string, 'idle' | 'running'>>(
    {}
  );

  return {
    computeJobs,
    setComputeJobs,
    showGovernedPanel,
    setShowGovernedPanel,
    proposalActionState,
    setProposalActionState,
  };
};

export const usePhase4Panels = () => {
  const [phase4Panel, setPhase4Panel] = useState<Phase4Panel>('none');
  const [phase4Ctx, setPhase4Ctx] = useState<{ ctdSection?: string; templateKey?: string; artifactId?: string; artifactTitle?: string }>({});
  return { phase4Panel, setPhase4Panel, phase4Ctx, setPhase4Ctx };
};

export interface WorkflowTransition {
  from: WorkspaceMode[];
  to: WorkspaceMode;
  requires?: 'selectedDocOrCreateIntent' | 'reviewContext' | 'submissionContext';
  fallback: WorkspaceMode;
}

export const WORKFLOW_TRANSITION_MAP: Record<string, WorkflowTransition> = {
  project_home: { from: ['dashboard', 'browse', 'edit'], to: 'dashboard', fallback: 'dashboard' },
  dossier_planning: { from: ['dashboard', 'browse'], to: 'browse', fallback: 'dashboard' },
  browse_list: { from: ['dashboard', 'edit'], to: 'browse', fallback: 'dashboard' },
  edit_document: {
    from: ['browse'],
    to: 'edit',
    requires: 'selectedDocOrCreateIntent',
    fallback: 'browse',
  },
  verify_review: { from: ['browse', 'edit'], to: 'browse', requires: 'reviewContext', fallback: 'browse' },
  publish_package: {
    from: ['browse'],
    to: 'browse',
    requires: 'submissionContext',
    fallback: 'dashboard',
  },
};

export const useWorkflowTransitionModel = () => {
  return useMemo(() => WORKFLOW_TRANSITION_MAP, []);
};
