/**
 * Document Authoring — the Authoring surface: the project's document LIST and
 * THE editor.
 *
 * Registry id: `document-authoring` (full: true, ownsConversation: true)
 *
 * ── What lives here, what moved ──────────────────────────────────────────────
 * On 2026-09-21 the editing core of this surface — the section outline, the
 * canonical `RichSectionEditor` over the active section, and the side rail
 * (AnA, comments, history, sources, signatures, audit, exports, project files,
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
 *
 * REAL WIRING (regulated GA product): the list reads the governed authoring
 * store at `/api/authoring` (server/routes/authoring.router.ts, table
 * authoring_documents). Nothing here is a fixture; nothing here writes.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { apiRequest } from '@/lib/queryClient';
import { DocumentWorkbench, type AuthDoc } from '../editor/DocumentWorkbench';
import '../styles/project-home-v2.css';

/* The audit-metadata reader moved with the audit rail; its unit test and any
   other reader keep this import path. */
export { describeAuditMetadata } from '../editor/DocumentWorkbench';

export function DocumentAuthoring({ onNav, liveDrive }: OwnedSurfaceViewProps) {
  // BP-W0-7: was 'draft', so the editor opened onto a list that excluded every
  // document already submitted, approved or frozen.
  const [status, setStatus] = useState('all');

  /* The open program, read once per render from the runtime channel. A string
     id is a regulatory_programs UUID; absent or non-string → org-wide, so the
     editor still works with no project open (the workbench then says so in
     its empty states rather than naming a project it does not have). */
  const programId = (() => {
    const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
    return p && typeof p.id === 'string' ? p.id : null;
  })();

  // Documents for the current filter.
  const [docs, setDocs] = useState<AuthDoc[]>([]);
  const [docsState, setDocsState] = useState<'loading' | 'ready' | 'error'>('loading');

  /* ── Load documents for the current status ──
     No `module` filter. Every filter on this route is optional server-side,
     and pinning one hid the rest of the dossier behind a dropdown — the
     outline is what selects a section now, so the document list must span
     all modules for it to select into. A failed read is an ERROR the tree
     renders as one; it is never an empty list. */
  const loadDocs = useCallback(async () => {
    setDocsState('loading');
    const url =
      `/api/authoring/docs?status=${encodeURIComponent(status)}` +
      (programId ? `&programId=${encodeURIComponent(programId)}` : '');
    let ok: boolean;
    let body: { documents?: AuthDoc[] } | null = null;
    try {
      const res = await apiRequest('GET', url);
      body = (await res.json().catch(() => null)) as { documents?: AuthDoc[] } | null;
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (!ok || !body) {
      setDocsState('error');
      setDocs([]);
      return;
    }
    setDocs(Array.isArray(body.documents) ? body.documents : []);
    setDocsState('ready');
  }, [status, programId]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  return (
    <DocumentWorkbench
      onNav={onNav}
      liveDrive={liveDrive}
      docs={docs}
      docsState={docsState}
      status={status}
      onStatusChange={setStatus}
      reloadDocs={loadDocs}
      programId={programId}
      surfaceActionId="document-authoring"
      consumeDeepLinks
    />
  );
}
