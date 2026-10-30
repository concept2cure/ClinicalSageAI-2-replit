/**
 * Document Authoring — the Authoring surface: the project's document LIST and
 * THE editor.
 *
 * Registry id: `document-authoring` (full: true, ownsConversation: true)
 *
 * ── What lives here, what moved ──────────────────────────────────────────────
 * On 2026-09-21 the editing core of this surface — the section outline, the
 * canonical `RichSectionEditor` over the active section, and the side rail
 * (then AnA, comments, history, sources, signatures, audit, exports, project files,
 * review tasks) — moved, unchanged, to `../editor/DocumentWorkbench.tsx`
 * (docs/design/ANA_DOCUMENT_CANVAS.md). This file was 5,143 lines; it is now
 * the part that is genuinely the surface's:
 *
 *   · the document list — GET /api/authoring/docs, scoped to the open program
 *     (window.C2C_PROJECT, the same channel every project-aware surface reads)
 *     and filtered by status (BP-W0-7: `all` first and default, because a
 *     filter that silently hides a frozen document is worse than no filter);
 *   · the honesty of that read — a failed list is an error state, never an
 *     empty project;
 *   · the surface-level contracts the workbench must not claim for another
 *     host: the editor deep-link channel (`editorTarget.ts`, consumed once on
 *     mount) and the surface-action bus registration (`document-authoring`).
 *
 * The workbench is the SAME component the conversation thread's document
 * canvas expands into (`../editor/DocumentCanvas.tsx`), so a document AnA
 * drafted in a conversation and a document opened from this list are edited
 * by one editor, over one store, with one save path. There is no second
 * editor; `scripts/ci/check-canvas-path.mjs` fails the build if this file
 * stops mounting the workbench.
 * All current AnA requests use the single ConversationThread and this same
 * DocumentCanvas, preserving the saved version and unsaved-work decision.
 *
 * REAL WIRING (regulated GA product): the list reads the governed authoring
 * store at `/api/authoring` (server/routes/authoring.router.ts, table
 * authoring_documents). Nothing here is a fixture; nothing here writes.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { DocumentWorkbench } from '../editor/DocumentWorkbench';
import { useScopedDocuments } from '../editor/useScopedDocuments';
import { shellProgramId, useShellProject } from '../shellProject';
import { clearEditorTarget } from '../editorTarget';
import { clearVaultTarget } from '../vaultTarget';
import '../styles/project-home-v2.css';

/* The audit-metadata reader moved with the audit rail; its unit test and any
   other reader keep this import path. */
export { describeAuditMetadata, describeAuditSource } from '../editor/DocumentWorkbench';


export function DocumentAuthoring({ onNav, liveDrive }: OwnedSurfaceViewProps) {
  const [status, setStatus] = useState('all');
  const requestedProject = useShellProject();
  const [effectiveProject, setEffectiveProject] = useState(requestedProject);
  const programId = shellProgramId(effectiveProject);
  const requestedId = shellProgramId(requestedProject);
  const requestedRef = useRef(requestedId);
  requestedRef.current = requestedId;
  const [dismissedSwitch, setDismissedSwitch] = useState<string | null>(null);
  const held = requestedId !== programId;
  const targetKey = requestedId ?? 'organization';
  const pendingProgramSwitch = useMemo(() => held && dismissedSwitch !== targetKey ? {
    id: targetKey,
    label: requestedProject?.title || 'the selected project',
    onContinue: () => {
      if (requestedRef.current !== requestedId) return;
      setEffectiveProject(requestedProject);
      setDismissedSwitch(null);
    },
    onCancel: () => { if (requestedRef.current === requestedId) setDismissedSwitch(targetKey); },
  } : null, [held, dismissedSwitch, targetKey, requestedProject, requestedId]);
  const { docs, docsState, loadDocs, refreshCreationContext } = useScopedDocuments(programId, status);
  const guardedNav = useCallback((id: string) => { if (held) { clearEditorTarget(); clearVaultTarget(); return; } onNav(id); }, [held, onNav]);
  return <>
    {held && <div className="scaf-note" role="status">
      Still editing the previous project. Finish the unsaved-work decision before switching or navigating.
      {dismissedSwitch === targetKey && <button className="btn ghost" onClick={() => setDismissedSwitch(null)}>Switch to selected project</button>}
    </div>}
    <DocumentWorkbench onNav={guardedNav} liveDrive={liveDrive} docs={docs} docsState={docsState}
      status={status} onStatusChange={setStatus} reloadDocs={loadDocs} programId={programId}
      refreshCreationContext={refreshCreationContext}
      pendingProgramSwitch={pendingProgramSwitch} programSwitchHeld={held}
      surfaceActionId="document-authoring" consumeDeepLinks />
  </>;
}
