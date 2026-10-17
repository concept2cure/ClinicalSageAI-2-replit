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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { apiRequest } from '@/lib/queryClient';
import { DocumentWorkbench, type AuthDoc } from '../editor/DocumentWorkbench';
import { shellProgramId, useShellProject } from '../shellProject';
import { clearEditorTarget } from '../editorTarget';
import { clearVaultTarget } from '../vaultTarget';
import '../styles/project-home-v2.css';

/* The audit-metadata reader moved with the audit rail; its unit test and any
   other reader keep this import path. */
export { describeAuditMetadata, describeAuditSource } from '../editor/DocumentWorkbench';

type WorkingDocumentRead = { success?: boolean; documents?: Array<AuthDoc & { program_id?: unknown }> };
function workingDocumentRows(body: WorkingDocumentRead | null): AuthDoc[] {
  return Array.isArray(body?.documents) ? body.documents : [];
}
function verifiedWorkingDocuments(body: WorkingDocumentRead | null, programId: string | null): boolean {
  return programId !== null && body?.success === true && Array.isArray(body.documents) && body.documents.every(row =>
    row && typeof row.id === 'string' && row.id.trim() && typeof row.title === 'string' && row.program_id === programId);
}

function useScopedDocuments(programId: string | null, status: string) {
  const [docs, setDocs] = useState<AuthDoc[]>([]);
  const [docsState, setDocsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadedScope, setLoadedScope] = useState<string | null>(programId);
  const sequence = useRef(0);
  const alive = useRef(true);
  const context = `${programId ?? 'organization'}:${status}`;
  const currentContext = useRef({ key: context });
  if (currentContext.current.key !== context) currentContext.current = { key: context };
  const recoveredContext = useRef<string | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current += 1; }; }, []);
  const readDocs = useCallback(async (readStatus: string, recovery = false) => {
    const scope = currentContext.current;
    if (scope.key !== context) return false;
    const generation = ++sequence.current;
    setDocsState('loading');
    let body: WorkingDocumentRead | null = null;
    let ok = false;
    try {
      const res = await apiRequest('GET', `/api/authoring/docs?status=${encodeURIComponent(readStatus)}`
        + (programId ? `&programId=${encodeURIComponent(programId)}` : ''));
      body = await res.json().catch(() => null);
      ok = res.ok;
    } catch { /* A failed read is reported below, without stale list fallback. */ }
    if (!alive.current || generation !== sequence.current || currentContext.current !== scope) return false;
    const verified = ok && verifiedWorkingDocuments(body, programId);
    const usable = ok && body && (!recovery || verified);
    setLoadedScope(programId);
    setDocs(usable ? workingDocumentRows(body) : []);
    setDocsState(usable ? 'ready' : 'error');
    return verified;
  }, [programId, context]);
  const loadDocs = useCallback(async () => { await readDocs(status); }, [readDocs, status]);
  const refreshCreationContext = useCallback(async () => {
    const scope = currentContext.current;
    if (!await readDocs('all', true) || currentContext.current !== scope) return false;
    recoveredContext.current = `${programId ?? 'organization'}:all`;
    return true;
  }, [readDocs, programId]);
  useEffect(() => {
    const recovered = recoveredContext.current === context;
    recoveredContext.current = null;
    if (!recovered) void loadDocs();
  }, [loadDocs, context]);
  return { docs: loadedScope === programId ? docs : [], docsState: loadedScope === programId ? docsState : 'loading' as const, loadDocs, refreshCreationContext };
}

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
