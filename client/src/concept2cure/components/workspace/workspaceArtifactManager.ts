/**
 * workspaceArtifactManager.ts
 *
 * Extracted from ProjectWorkspaceShell — owns artifact operations:
 * - Loading artifacts, compute jobs, dossier metrics
 * - Document creation (5 paths: blank, template, dialog-blank, dialog-template, RI draft)
 * - Placement and move operations
 * - Artifact classification
 * - Toast notification queue
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { getSectionLabel, getSectionRequirements } from '../../models/ctdHierarchy';
import { buildTemplateContent } from './workspaceShellConstants';
import { resolveDocumentMode, MODE_CAPABILITIES, canEscalateToEdit } from '../../contexts/DocumentModeContext';
import type { TreeArtifact } from './ProjectFileTree';
import type { PlacementConfirmation, PlacementOperation } from './PlacementDialog';
import type { ConsequenceComputeJob } from './documentConsequence';
import type { WorkflowStage } from '../../contexts/DocumentModeContext';
import type { PendingMove } from './workspaceShellControllers';

// ── Toast notification queue ────────────────────────────────────────────────

export type ShellToast = { id: number; message: string; type: 'success' | 'error' | 'info' };

export function useShellToasts() {
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

  const dismissToast = useCallback((id: number) => {
    setShellToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { shellToasts, pushShellToast, dismissToast };
}

// ── Escalation gate ─────────────────────────────────────────────────────────

export function useEscalationGate(pushShellToast: (msg: string, type: 'success' | 'error' | 'info') => void) {
  return useCallback(
    (artifactStatus?: string): boolean => {
      const check = canEscalateToEdit('section-workspace', artifactStatus as any);
      if (!check.allowed) {
        pushShellToast(check.reason || 'Editing is not available for this document', 'error');
        return false;
      }
      if (check.reason) {
        pushShellToast(check.reason, 'info');
      }
      return true;
    },
    [pushShellToast]
  );
}

// ── Artifact data loading ───────────────────────────────────────────────────

export function useArtifactLoader(projectId: string | undefined) {
  const [artifacts, setArtifacts] = useState<TreeArtifact[]>([]);
  const [loading, setLoading] = useState(false);

  const loadArtifacts = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts`);
      const payload = await res.json();
      const list = payload.data ?? payload;
      setArtifacts(Array.isArray(list) ? list : []);
    } catch {
      // Handled by caller via toast
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  return { artifacts, setArtifacts, loading, loadArtifacts };
}

export function useComputeJobLoader(
  projectId: string | undefined,
  setComputeJobs: (jobs: ConsequenceComputeJob[]) => void
) {
  return useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await apiRequest('GET', `/api/concept2cure/compute/projects/${projectId}/jobs`);
      const payload = await res.json();
      setComputeJobs(payload.data ?? []);
    } catch {
      setComputeJobs([]);
    }
  }, [projectId, setComputeJobs]);
}

export function useDossierMetricsLoader(projectId: string | undefined) {
  const [dossierMetrics, setDossierMetrics] = useState<Record<string, any>>({});

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

  return { dossierMetrics, loadDossierMetrics };
}

// ── Artifact classification ─────────────────────────────────────────────────

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

// ── Document creation (5 paths) ─────────────────────────────────────────────

export function useDocumentCreation(deps: {
  projectId: string | undefined;
  projectName: string | undefined;
  projectType: string | undefined;
  submissionType: string | undefined;
  resolvedSubmissionProgram: string;
  selectedCtdSection: string | undefined;
  loadArtifacts: () => Promise<void>;
  pushShellToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  setSelectedDocId: (id: string | undefined) => void;
  setShowNewDoc: (show: boolean) => void;
  setShowNewDocDialog: (show: boolean) => void;
  setLeftRailMode: (m: string) => void;
  applyWorkflowTransition: (key: string, ctx: Record<string, any>) => boolean;
}) {
  const {
    projectId,
    projectName,
    projectType,
    submissionType,
    resolvedSubmissionProgram,
    selectedCtdSection,
    loadArtifacts,
    pushShellToast,
    setSelectedDocId,
    setShowNewDoc,
    setShowNewDocDialog,
    setLeftRailMode,
    applyWorkflowTransition,
  } = deps;

  const [newDocTitle, setNewDocTitle] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);

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
  }, [projectId, newDocTitle, loadArtifacts, pushShellToast, resolvedSubmissionProgram, setSelectedDocId, setShowNewDoc, applyWorkflowTransition]);

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
    [projectId, loadArtifacts, pushShellToast, resolvedSubmissionProgram, setSelectedDocId, setLeftRailMode, applyWorkflowTransition]
  );

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
    [projectId, loadArtifacts, pushShellToast, resolvedSubmissionProgram, setSelectedDocId, setShowNewDocDialog, applyWorkflowTransition]
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
    [projectId, loadArtifacts, pushShellToast, resolvedSubmissionProgram, setSelectedDocId, setShowNewDocDialog, applyWorkflowTransition]
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
    setSelectedDocId,
    applyWorkflowTransition,
  ]);

  return {
    newDocTitle,
    setNewDocTitle,
    creatingNew,
    handleCreateNew,
    handleCreateFromTemplate,
    handleDialogCreateBlank,
    handleDialogCreateFromTemplate,
    handleCreateSectionDraftWithRI,
  };
}

// ── Placement and move operations ───────────────────────────────────────────

export function usePlacementOperations(deps: {
  projectId: string | undefined;
  artifacts: TreeArtifact[];
  selectedDocId: string | undefined;
  workflowStage: WorkflowStage;
  loadArtifacts: () => Promise<void>;
  pushShellToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
  const { projectId, artifacts, selectedDocId, workflowStage, loadArtifacts, pushShellToast } = deps;

  const [placementDialog, setPlacementDialog] = useState<{
    open: boolean;
    artifact: TreeArtifact | null;
    operation: 'move' | 'place' | 'relocate';
    targetSection?: string;
  }>({ open: false, artifact: null, operation: 'place' });
  const [placementLoading, setPlacementLoading] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [cutBlockedMessage, setCutBlockedMessage] = useState<string | null>(null);

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

  const handleCutDocument = useCallback(
    (art: TreeArtifact) => {
      const artMode = resolveDocumentMode(workflowStage, art.status as any);
      const artCaps = MODE_CAPABILITIES[artMode];
      if (!artCaps.canMoveDocument) {
        setCutBlockedMessage(`"${art.title}" cannot be moved in the current mode.`);
        setTimeout(() => setCutBlockedMessage(null), 4000);
        return;
      }
      setPendingMove({ artifact: art, fromSection: art.ctdSection || null });
    },
    [workflowStage]
  );

  const handlePasteHere = useCallback(
    (ctdSection: string) => {
      if (!pendingMove) return;
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
    [pendingMove, workflowStage]
  );

  const handleCancelMove = useCallback(() => {
    setPendingMove(null);
  }, []);

  const handlePlacementConfirmWithCleanup = useCallback(
    async (params: PlacementConfirmation) => {
      await handlePlacementConfirm(params);
      setPendingMove(null);
    },
    [handlePlacementConfirm]
  );

  const handleCopyCtdPath = useCallback((art: TreeArtifact) => {
    const section = art.ctdSection || 'unplaced';
    const label = art.ctdSection ? getSectionLabel(art.ctdSection) : 'Unplaced';
    const text = `${section} — ${label} → ${art.title}`;
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  const handleOpenPlacementForDoc = useCallback((art: TreeArtifact, op: PlacementOperation) => {
    setPlacementDialog({
      open: true,
      artifact: art,
      operation: op,
      targetSection: undefined,
    });
  }, []);

  return {
    placementDialog,
    setPlacementDialog,
    placementLoading,
    pendingMove,
    setPendingMove,
    cutBlockedMessage,
    setCutBlockedMessage,
    handlePlacementConfirm,
    handlePlaceArtifact,
    handleCutDocument,
    handlePasteHere,
    handleCancelMove,
    handlePlacementConfirmWithCleanup,
    handleCopyCtdPath,
    handleOpenPlacementForDoc,
  };
}
