/**
 * useWorkspaceDerivedState — Computed/derived values that the shell used to
 * inline: workflowStage, browseLabel, browseDocs, workflowStep,
 * submission readiness, resolvedSubmissionProgram, etc.
 */

import { useMemo, useCallback } from 'react';
import { type TreeArtifact } from './ProjectFileTree';
import {
  type WorkflowStage,
  resolveDocumentMode,
  MODE_CAPABILITIES,
} from '../../contexts/DocumentModeContext';
import { buildDocumentConsequenceRows } from './documentConsequence';
import type { ConsequenceComputeJob, ConsequenceProposal } from './documentConsequence';
import { FOLDER_LABELS } from './workspaceShellConstants';
import type { WorkspaceMode, LeftRailMode } from './workspaceShellControllers';

// ── Submission program resolution ────────────────────────────────────────────
export function resolveSubmissionProgram(submissionType?: string, projectType?: string): string {
  const norm = String(submissionType || projectType || '').toUpperCase();
  if (norm.includes('IND')) return 'ind';
  if (norm.includes('510') || norm.includes('PMA')) return '510k';
  if (norm.includes('MAA') || norm.includes('BLA')) return 'ectd';
  return 'general_ri';
}

export function isINDWorkspaceType(submissionType?: string, projectType?: string): boolean {
  const norm = String(submissionType || projectType || '').toUpperCase();
  return ['IND', 'NDA', 'BLA', 'MAA'].includes(norm);
}

// ── Workflow stage selector ──────────────────────────────────────────────────
export function deriveWorkflowStage(
  mode: WorkspaceMode,
  leftRailMode: LeftRailMode
): WorkflowStage {
  if (mode === 'dashboard') return 'project-home';
  if (mode === 'edit') return 'section-workspace';
  if (leftRailMode === 'dossier') return 'dossier';
  return 'documents';
}

// ── Artifact classification ──────────────────────────────────────────────────
export function classifyArtifact(a: TreeArtifact): string {
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

// ── Combined derived state hook ──────────────────────────────────────────────
interface DerivedStateDeps {
  mode: WorkspaceMode;
  leftRailMode: LeftRailMode;
  selectedDocId?: string;
  selectedFolder: string;
  selectedCtdSection?: string;
  artifacts: TreeArtifact[];
  readinessPercent: number;
  computeJobs: ConsequenceComputeJob[];
  proposals: ConsequenceProposal[];
}

export function useWorkspaceDerivedState(deps: DerivedStateDeps) {
  const {
    mode,
    leftRailMode,
    selectedDocId,
    selectedFolder,
    selectedCtdSection,
    artifacts,
    readinessPercent,
    computeJobs,
    proposals,
  } = deps;

  const workflowStage = useMemo(
    () => deriveWorkflowStage(mode, leftRailMode),
    [mode, leftRailMode]
  );

  const workflowStep = useMemo(() => {
    if (mode === 'edit') return 3;
    if (mode === 'browse') return selectedDocId ? 2 : 1;
    return 1;
  }, [mode, selectedDocId]);

  const activeArtifact = useMemo(() => {
    if (!selectedDocId) return null;
    return artifacts.find(a => a.id === selectedDocId) || null;
  }, [selectedDocId, artifacts]);

  const reviewInFlight = useMemo(
    () =>
      artifacts.filter(a => ['review', 'approved'].includes((a.status || '').toLowerCase())).length,
    [artifacts]
  );

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

  const outlineAvailable = mode === 'edit' && !!selectedDocId;

  // Browse-mode document lists
  const folderDocs = useMemo(
    () => artifacts.filter(a => classifyArtifact(a) === selectedFolder),
    [artifacts, selectedFolder]
  );

  const sectionDocs = useMemo(() => {
    if (!selectedCtdSection) return [];
    return artifacts.filter(a => {
      const s = a.ctdSection || '';
      return s === selectedCtdSection || s.startsWith(selectedCtdSection + '.');
    });
  }, [artifacts, selectedCtdSection]);

  const browseDocs = leftRailMode === 'dossier' ? sectionDocs : folderDocs;

  const browseLabel =
    leftRailMode === 'dossier'
      ? selectedCtdSection
        ? `Section ${selectedCtdSection}`
        : 'Select a section'
      : FOLDER_LABELS[selectedFolder] || selectedFolder;

  // Document consequence rows
  const documentConsequenceRows = useMemo(
    () =>
      buildDocumentConsequenceRows({
        artifacts,
        computeJobs,
        proposals,
        canOpenArtifact: (artifactId: string, status: string) =>
          artifacts.some(a => a.id === artifactId) &&
          MODE_CAPABILITIES[resolveDocumentMode(workflowStage, status)].editable,
      }),
    [artifacts, computeJobs, proposals, workflowStage]
  );

  // Governance normalizer
  const normalizeGovernanceState = useCallback(
    (proposal: { governanceState?: string; artifactStatus?: string }) => {
      const s = String(proposal.artifactStatus || '').toLowerCase();
      if (s === 'locked') return { label: 'Locked / Finalized', tone: 'text-slate-700' };
      if (s === 'review') return { label: 'Review in flight', tone: 'text-blue-700' };
      if (proposal.governanceState === 'ACCEPTED_GOVERNED')
        return { label: 'Accepted and governed', tone: 'text-emerald-700' };
      if (proposal.governanceState === 'ACCEPTED_PERSISTED_NO_GOVERNANCE')
        return { label: 'Generated (not governed)', tone: 'text-amber-700' };
      return { label: 'Generated', tone: 'text-stone-700' };
    },
    []
  );

  return {
    workflowStage,
    workflowStep,
    activeArtifact,
    reviewInFlight,
    approvedOrLockedCount,
    submissionReady,
    outlineAvailable,
    folderDocs,
    sectionDocs,
    browseDocs,
    browseLabel,
    documentConsequenceRows,
    normalizeGovernanceState,
  };
}
