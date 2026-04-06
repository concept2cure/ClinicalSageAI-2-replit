/**
 * useWorkspaceDocumentActions — Document CRUD, placement, cut/paste, and
 * Phase 4 panel openers extracted from ProjectWorkspaceShell.
 */

import { useCallback, useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { type TreeArtifact } from './ProjectFileTree';
import { getSectionLabel } from '../../models/ctdHierarchy';
import {
  resolveDocumentMode,
  MODE_CAPABILITIES,
  canEscalateToEdit,
  type WorkflowStage,
} from '../../contexts/DocumentModeContext';
import { type PlacementConfirmation, type PlacementOperation } from './PlacementDialog';
import { buildTemplateContent } from './workspaceShellConstants';
import type { PendingMove, Phase4Panel, LeftRailMode } from './workspaceShellControllers';

// ── Toast helper type ────────────────────────────────────────────────────────
type PushToast = (message: string, type?: 'success' | 'error' | 'info') => void;

// ── Toast queue hook ─────────────────────────────────────────────────────────
type ShellToast = { id: number; message: string; type: 'success' | 'error' | 'info' };

export function useShellToasts() {
  const [shellToasts, setShellToasts] = useState<ShellToast[]>([]);
  const idRef = useRef(0);
  const pushShellToast: PushToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = ++idRef.current;
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

// ── Escalation gate hook ─────────────────────────────────────────────────────
export function useEscalationGate(pushShellToast: PushToast) {
  return useCallback(
    (artifactStatus?: string): boolean => {
      const check = canEscalateToEdit('section-workspace', artifactStatus as any);
      if (!check.allowed) {
        pushShellToast(check.reason || 'Editing is not available for this document', 'error');
        return false;
      }
      if (check.reason) pushShellToast(check.reason, 'info');
      return true;
    },
    [pushShellToast]
  );
}

// ── Document CRUD ────────────────────────────────────────────────────────────
interface DocCrudDeps {
  projectId?: string;
  projectName?: string;
  projectType?: string;
  submissionType?: string;
  resolvedSubmissionProgram: string;
  selectedCtdSection?: string;
  loadArtifacts: () => Promise<void>;
  pushShellToast: PushToast;
  setSelectedDocId: (id: string | undefined) => void;
  applyWorkflowTransition: (key: string, ctx?: Record<string, any>) => boolean;
  setLeftRailMode: (mode: LeftRailMode) => void;
  setShowNewDoc: (show: boolean) => void;
  setShowNewDocDialog: (show: boolean) => void;
}

export function useDocumentCrud(deps: DocCrudDeps) {
  const [newDocTitle, setNewDocTitle] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);

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
    applyWorkflowTransition,
    setLeftRailMode,
    setShowNewDoc,
    setShowNewDocDialog,
  } = deps;

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
  }, [
    projectId,
    newDocTitle,
    loadArtifacts,
    pushShellToast,
    resolvedSubmissionProgram,
    setSelectedDocId,
    applyWorkflowTransition,
    setShowNewDoc,
  ]);

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
    [
      projectId,
      loadArtifacts,
      pushShellToast,
      resolvedSubmissionProgram,
      setSelectedDocId,
      applyWorkflowTransition,
      setLeftRailMode,
    ]
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
    [
      projectId,
      loadArtifacts,
      pushShellToast,
      resolvedSubmissionProgram,
      setSelectedDocId,
      applyWorkflowTransition,
      setShowNewDocDialog,
    ]
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
    [
      projectId,
      loadArtifacts,
      pushShellToast,
      resolvedSubmissionProgram,
      setSelectedDocId,
      applyWorkflowTransition,
      setShowNewDocDialog,
    ]
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

// ── Placement + Cut/Paste ────────────────────────────────────────────────────
interface PlacementDeps {
  projectId?: string;
  artifacts: TreeArtifact[];
  selectedDocId?: string;
  pendingMove: PendingMove | null;
  setPendingMove: (m: PendingMove | null) => void;
  setPlacementDialog: (d: any) => void;
  setPlacementLoading: (l: boolean) => void;
  loadArtifacts: () => Promise<void>;
  pushShellToast: PushToast;
  workflowStage: WorkflowStage;
}

export function usePlacementActions(deps: PlacementDeps) {
  const {
    projectId,
    artifacts,
    selectedDocId,
    pendingMove,
    setPendingMove,
    setPlacementDialog,
    setPlacementLoading,
    loadArtifacts,
    pushShellToast,
    workflowStage,
  } = deps;
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
    [
      projectId,
      loadArtifacts,
      pushShellToast,
      setPlacementDialog,
      setPlacementLoading,
      setPendingMove,
    ]
  );

  const handlePlaceArtifact = useCallback(
    (ctdSection: string) => {
      if (pendingMove) {
        setPendingMove(pendingMove ? { ...pendingMove, targetSection: ctdSection } : null);
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
        setPlacementDialog({
          open: true,
          artifact: art,
          operation: art.ctdSection ? 'relocate' : 'place',
          targetSection: ctdSection,
        });
      }
    },
    [artifacts, selectedDocId, pendingMove, setPlacementDialog, setPendingMove]
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
    [workflowStage, setPendingMove]
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
      setPendingMove(pendingMove ? { ...pendingMove, targetSection: ctdSection } : null);
      setPlacementDialog({
        open: true,
        artifact: pendingMove.artifact,
        operation: pendingMove.fromSection ? 'relocate' : 'place',
        targetSection: ctdSection,
      });
    },
    [pendingMove, workflowStage, setPendingMove, setPlacementDialog]
  );

  const handleCancelMove = useCallback(() => setPendingMove(null), [setPendingMove]);

  const handlePlacementConfirmWithCleanup = useCallback(
    async (params: PlacementConfirmation) => {
      await handlePlacementConfirm(params);
      setPendingMove(null);
    },
    [handlePlacementConfirm, setPendingMove]
  );

  const handleCopyCtdPath = useCallback((art: TreeArtifact) => {
    const section = art.ctdSection || 'unplaced';
    const label = art.ctdSection ? getSectionLabel(art.ctdSection) : 'Unplaced';
    navigator.clipboard.writeText(`${section} — ${label} → ${art.title}`).catch(() => {});
  }, []);

  const handleOpenPlacementForDoc = useCallback(
    (art: TreeArtifact, op: PlacementOperation) => {
      setPlacementDialog({ open: true, artifact: art, operation: op, targetSection: undefined });
    },
    [setPlacementDialog]
  );

  return {
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

// ── Phase 4 panel openers ────────────────────────────────────────────────────
interface Phase4Deps {
  projectId?: string;
  artifacts: TreeArtifact[];
  activeArtifactRef: React.RefObject<TreeArtifact | null>;
  setPhase4Panel: (p: Phase4Panel) => void;
  setPhase4Ctx: (ctx: Record<string, any>) => void;
  setSelectedDocId: (id: string | undefined) => void;
  setDocumentTab: (tab: string) => void;
  applyWorkflowTransition: (key: string, ctx?: Record<string, any>) => boolean;
  loadArtifacts: () => Promise<void>;
  pushShellToast: PushToast;
}

export function usePhase4Actions(deps: Phase4Deps) {
  const {
    projectId,
    artifacts,
    activeArtifactRef,
    setPhase4Panel,
    setPhase4Ctx,
    setSelectedDocId,
    setDocumentTab,
    applyWorkflowTransition,
    loadArtifacts,
    pushShellToast,
  } = deps;

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
    [artifacts, activeArtifactRef, setPhase4Ctx, setPhase4Panel]
  );

  const openProgramTwin = useCallback(() => setPhase4Panel('twin'), [setPhase4Panel]);

  const openSubmissionApps = useCallback(
    (ctdSection?: string, templateKey?: string) => {
      setPhase4Ctx({ ctdSection, templateKey });
      setPhase4Panel('apps');
    },
    [setPhase4Ctx, setPhase4Panel]
  );

  const openReviewPulse = useCallback(() => setPhase4Panel('pulse'), [setPhase4Panel]);

  const closePhase4Panel = useCallback(() => {
    setPhase4Panel('none');
    setPhase4Ctx({});
  }, [setPhase4Panel, setPhase4Ctx]);

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
    [artifacts, pushShellToast, setSelectedDocId, applyWorkflowTransition, setDocumentTab]
  );

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
              metadata: { source: 'generated_draft', governed: true },
            }
          );
          const payload = await res.json();
          createdId = (payload.data ?? payload).id;
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
    [
      projectId,
      loadArtifacts,
      closePhase4Panel,
      pushShellToast,
      setSelectedDocId,
      applyWorkflowTransition,
    ]
  );

  return {
    openTransformCanvas,
    openVerification,
    openProgramTwin,
    openSubmissionApps,
    openReviewPulse,
    closePhase4Panel,
    openComputeArtifact,
    handlePhase4CreateDraft,
  };
}
