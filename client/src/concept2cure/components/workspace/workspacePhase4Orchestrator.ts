/**
 * workspacePhase4Orchestrator.ts
 *
 * Extracted from ProjectWorkspaceShell — owns Phase 4 panel operations:
 * - Panel openers (transform, verification, twin, apps, pulse)
 * - Document consequence row building
 * - Governance state normalization
 * - Review package capture
 * - Subsection creation
 */

import { useCallback, useMemo, useRef } from 'react';
import { apiRequest } from '@/lib/queryClient';
import {
  resolveDocumentMode,
  MODE_CAPABILITIES,
  type WorkflowStage,
} from '../../contexts/DocumentModeContext';
import { buildDocumentConsequenceRows } from './documentConsequence';
import type { TreeArtifact } from './ProjectFileTree';
import type { Phase4Panel } from './workspaceShellControllers';

// ── Phase 4 panel openers ───────────────────────────────────────────────────

export function usePhase4PanelOpeners(
  artifacts: TreeArtifact[],
  activeArtifactRef: React.MutableRefObject<TreeArtifact | null>,
  setPhase4Panel: (p: Phase4Panel) => void,
  setPhase4Ctx: (ctx: { ctdSection?: string; templateKey?: string; artifactId?: string; artifactTitle?: string }) => void
) {
  const openTransformCanvas = useCallback(
    (ctdSection?: string, templateKey?: string, artifactId?: string, artifactTitle?: string) => {
      setPhase4Ctx({ ctdSection, templateKey, artifactId, artifactTitle });
      setPhase4Panel('transform');
    },
    [setPhase4Ctx, setPhase4Panel]
  );

  const openVerification = useCallback(
    (artifactId?: string) => {
      const art = artifactId ? artifacts.find(a => a.id === artifactId) : activeArtifactRef.current;
      setPhase4Ctx({ artifactId: art?.id, artifactTitle: art?.title });
      setPhase4Panel('verification');
    },
    [artifacts, setPhase4Ctx, setPhase4Panel]
  );

  const openProgramTwin = useCallback(() => {
    setPhase4Panel('twin');
  }, [setPhase4Panel]);

  const openSubmissionApps = useCallback((ctdSection?: string, templateKey?: string) => {
    setPhase4Ctx({ ctdSection, templateKey });
    setPhase4Panel('apps');
  }, [setPhase4Ctx, setPhase4Panel]);

  const openReviewPulse = useCallback(() => {
    setPhase4Panel('pulse');
  }, [setPhase4Panel]);

  const closePhase4Panel = useCallback(() => {
    setPhase4Panel('none');
    setPhase4Ctx({});
  }, [setPhase4Panel, setPhase4Ctx]);

  return {
    openTransformCanvas,
    openVerification,
    openProgramTwin,
    openSubmissionApps,
    openReviewPulse,
    closePhase4Panel,
  };
}

// ── Compute artifact opener ─────────────────────────────────────────────────

export function useComputeArtifactOpener(
  artifacts: TreeArtifact[],
  pushShellToast: (msg: string, type: 'success' | 'error' | 'info') => void,
  setSelectedDocId: (id: string | undefined) => void,
  setDocumentTab: (tab: string) => void,
  applyWorkflowTransition: (key: string, ctx: Record<string, any>) => boolean
) {
  return useCallback(
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
    [artifacts, pushShellToast, setSelectedDocId, setDocumentTab, applyWorkflowTransition]
  );
}

// ── Phase 4 draft creation ──────────────────────────────────────────────────

export function usePhase4DraftCreation(
  projectId: string | undefined,
  loadArtifacts: () => Promise<void>,
  setSelectedDocId: (id: string | undefined) => void,
  applyWorkflowTransition: (key: string, ctx: Record<string, any>) => boolean,
  closePhase4Panel: () => void,
  pushShellToast: (msg: string, type: 'success' | 'error' | 'info') => void
) {
  return useCallback(
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
    [projectId, loadArtifacts, setSelectedDocId, applyWorkflowTransition, closePhase4Panel, pushShellToast]
  );
}

// ── Document consequence rows ───────────────────────────────────────────────

export function useDocumentConsequenceRows(
  artifacts: TreeArtifact[],
  computeJobs: any[],
  proposals: any[],
  workflowStage: WorkflowStage
) {
  return useMemo(
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
}

// ── Governance state normalization ──────────────────────────────────────────

export function useGovernanceNormalizer() {
  return useCallback(
    (proposal: { artifactStatus?: string; governanceState?: string }) => {
      const artifactStatus = String(proposal.artifactStatus || '').toLowerCase();
      if (artifactStatus === 'locked')
        return { label: 'Locked / Finalized', tone: 'text-slate-700' };
      if (artifactStatus === 'review') return { label: 'Review in flight', tone: 'text-stone-700' };
      if (proposal.governanceState === 'ACCEPTED_GOVERNED')
        return { label: 'Accepted and governed', tone: 'text-stone-800' };
      if (proposal.governanceState === 'ACCEPTED_PERSISTED_NO_GOVERNANCE')
        return { label: 'Generated (not governed)', tone: 'text-stone-700' };
      return { label: 'Generated', tone: 'text-stone-700' };
    },
    []
  );
}

// ── Review package capture ──────────────────────────────────────────────────

export function useReviewPackageCapture(
  documentConsequenceRows: any[],
  pushShellToast: (msg: string, type: 'success' | 'error' | 'info') => void
) {
  return useCallback(
    async (proposal: {
      artifactId?: string;
      artifactVersion?: number;
      artifactStatus?: string;
      governanceState?: string;
      placementState?: string;
      provenanceRef?: string;
      auditRef?: string;
    }) => {
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
          documentConsequenceRows.find((row: any) => row.artifactId === proposal.artifactId) ?? null,
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
}

// ── Subsection creation ─────────────────────────────────────────────────────

export function useSubsectionCreation(
  projectId: string | undefined,
  activeArtifactRef: React.MutableRefObject<TreeArtifact | null>,
  activeDocContent: string,
  loadArtifacts: () => Promise<void>,
  pushShellToast: (msg: string, type: 'success' | 'error' | 'info') => void
) {
  return useCallback(
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
    [projectId, activeArtifactRef, activeDocContent, loadArtifacts, pushShellToast]
  );
}
