/**
 * workspaceConversationAndState.ts
 *
 * Extracted orchestration hooks from ProjectWorkspaceShell.tsx.
 *
 * Covers:
 *   - useConversationSnapshot  — conversation-OS fetch on dashboard entry
 *   - useProposalActions       — actOnProposal callback
 *   - useWorkspaceResumeState  — localStorage resume + persistence
 *   - useDocumentTabSync       — documentTab → governed panel + inspector sync
 *   - useWorkspaceKeyboardShortcuts — global Escape handler
 *   - useOutlineNavigation     — editor heading scroll
 *   - useWorkspaceSelectionHandlers — doc/folder/section/back handlers
 */

import { useCallback, useEffect, useRef } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { type TreeArtifact } from './ProjectFileTree';

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type ConversationProposal = {
  id: string;
  status: string;
  governanceState?: 'ACCEPTED_GOVERNED' | 'ACCEPTED_PERSISTED_NO_GOVERNANCE' | 'REJECTED';
  artifactId?: string;
  artifactVersion?: number;
  artifactStatus?: string;
  placementState?: string;
  provenanceRef?: string;
  auditRef?: string;
};

export type ConversationSnapshot = {
  manifestMode?: string;
  latestFinding?: string;
  latestPlanTask?: string;
  proposals: ConversationProposal[];
};

// ─── 1. useConversationSnapshot ───────────────────────────────────────────────

/**
 * Fetches conversation-OS state (manifest, scout, plan, proposals) whenever
 * the workspace enters 'dashboard' mode for a given project.
 */
export function useConversationSnapshot(
  projectId: string | undefined,
  mode: string,
  setConversationSnapshot: React.Dispatch<React.SetStateAction<ConversationSnapshot>>
): void {
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
}

// ─── 2. useProposalActions ────────────────────────────────────────────────────

/**
 * Returns an `actOnProposal` callback that POSTs an accept/reject decision to
 * the conversation-OS proposals endpoint, updates local snapshot state, and
 * reloads artifacts on accept.
 */
export function useProposalActions(
  projectId: string | undefined,
  loadArtifacts: () => Promise<void>,
  setConversationSnapshot: React.Dispatch<React.SetStateAction<ConversationSnapshot>>
): {
  actOnProposal: (proposalId: string, action: 'accept' | 'reject') => Promise<void>;
} {
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
                governanceState: result?.state as ConversationProposal['governanceState'],
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

  return { actOnProposal };
}

// ─── 3. useWorkspaceResumeState ───────────────────────────────────────────────

/**
 * Persists the active artifact id to localStorage on every change, and
 * restores it on workspace mount unless an explicit artifact or initialContent
 * was requested via props.
 */
export function useWorkspaceResumeState(
  projectId: string | undefined,
  selectedDocId: string | undefined,
  setSelectedDocId: (id: string | undefined) => void,
  artifacts: TreeArtifact[],
  openArtifactId: string | undefined,
  initialContent: string | undefined,
  applyWorkflowTransition: (event: string, ctx: Record<string, unknown>) => void
): void {
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
}

// ─── 4. useDocumentTabSync ────────────────────────────────────────────────────

type DocumentTab = 'content' | 'evidence' | 'versions' | 'review' | 'signatures' | 'export' | 'provenance';

/**
 * Keeps the governed panel and editor inspector in sync with the active
 * documentTab. Also closes context bars when the user enters edit mode.
 */
export function useDocumentTabSync(
  mode: string,
  documentTab: DocumentTab,
  setShowGovernedPanel: (show: boolean) => void,
  setEditorInitialInspector: (inspector: string | null) => void,
  setDocumentTab: (tab: DocumentTab) => void,
  showContextBars: boolean,
  setShowContextBars: (show: boolean) => void
): void {
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
}

// ─── 5. useWorkspaceKeyboardShortcuts ─────────────────────────────────────────

/**
 * Registers a window-level keydown listener that:
 *   - Cancels a pending cut/move operation on Escape
 *   - Dismisses the phase4 panel on Escape
 */
export function useWorkspaceKeyboardShortcuts(
  pendingMove: unknown,
  setPendingMove: (move: null) => void,
  phase4Panel: string,
  setPhase4Panel: (panel: string) => void
): void {
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
}

// ─── 6. useOutlineNavigation ──────────────────────────────────────────────────

/**
 * Returns a callback that scrolls the editor container to a heading or
 * structural element matching the given outline node id.
 */
export function useOutlineNavigation(
  editorContainerRef: React.RefObject<HTMLDivElement>
): {
  handleOutlineNavigate: (nodeId: string) => void;
} {
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

  return { handleOutlineNavigate };
}

// ─── 7. useWorkspaceSelectionHandlers ────────────────────────────────────────

/**
 * Returns the four primary selection callbacks used by the left rail and
 * document list: handleSelectDoc, handleSelectFolder, handleSelectSection,
 * handleBackToList.
 */
export function useWorkspaceSelectionHandlers(
  tryOpenForEdit: (status: string | undefined) => boolean,
  setSelectedDocId: (id: string | undefined) => void,
  applyWorkflowTransition: (event: string, ctx: Record<string, unknown>) => void,
  setDocumentTab: (tab: DocumentTab) => void,
  setSectionReqs: (reqs: null) => void,
  setSelectedFolder: (folder: string) => void,
  setSelectedCtdSection: (section: string | undefined) => void,
  artifacts: TreeArtifact[]
): {
  handleSelectDoc: (doc: TreeArtifact) => void;
  handleSelectFolder: (folderKey: string) => void;
  handleSelectSection: (ctdSection: string, label: string) => void;
  handleBackToList: () => void;
} {
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

  return { handleSelectDoc, handleSelectFolder, handleSelectSection, handleBackToList };
}
