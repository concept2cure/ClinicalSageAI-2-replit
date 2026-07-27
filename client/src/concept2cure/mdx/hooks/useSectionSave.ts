/**
 * useSectionSave — persists dossier section edits to the governed store.
 *
 * ## What this replaces
 *
 * The dossier drawer's editor committed edits to the in-memory
 * `DossierStore` and then rendered:
 *
 *     ● saved            edits sync to audit + activity
 *
 * Neither claim was true. Nothing left the browser, no audit row was
 * written, and a refresh discarded the work. A user could spend an
 * afternoon drafting a submission section and lose all of it while the
 * UI told them, the whole time, that it was saved.
 *
 * ## What happens now
 *
 * Edits go to `PATCH /api/c2c/documents/:id/sections/:key`, which sets
 * the Part-11 attribution GUCs (`app.actor_id`, `app.reason`) before the
 * UPDATE so the version-snapshot trigger can record who changed what and
 * why, and writes an audit-ledger row for the change.
 *
 * The hook reports one of four honest states — idle, saving, saved,
 * error — and `saved` is set only after the server confirms. When the
 * document has not been hydrated from the backend (no `documentId`), the
 * hook reports `unavailable` so the editor can say the edit is a local
 * draft instead of claiming a save that cannot happen.
 */

import { useCallback, useRef, useState } from 'react';
import { getAuthToken, getOrgId } from '@/utils/authToken';

export type SaveState =
  /** Nothing typed yet this session. */
  | { status: 'idle' }
  /** No governed document behind this section — edits are local only. */
  | { status: 'unavailable' }
  | { status: 'saving' }
  /** Server confirmed the write. `at` is the client's receipt time. */
  | { status: 'saved'; at: Date }
  | { status: 'error'; message: string };

export interface UseSectionSaveResult {
  state: SaveState;
  /** Persist one section's body. Resolves true only on a confirmed write. */
  save: (sectionKey: string, body: string) => Promise<boolean>;
}

/** Default Part-11 attribution reason for a routine authoring edit. */
const EDIT_REASON = 'Section content edited in dossier editor';

/**
 * @param documentId c2c_documents id for the hydrated dossier, or null
 *                   when the drawer is showing an unhydrated section.
 */
export function useSectionSave(documentId: string | null): UseSectionSaveResult {
  const [state, setState] = useState<SaveState>(
    documentId ? { status: 'idle' } : { status: 'unavailable' },
  );

  /* Guards against an older in-flight save resolving after a newer one
     and reporting a stale "saved" for content already superseded. */
  const seqRef = useRef(0);

  const save = useCallback(
    async (sectionKey: string, body: string): Promise<boolean> => {
      if (!documentId) {
        setState({ status: 'unavailable' });
        return false;
      }

      const seq = ++seqRef.current;
      setState({ status: 'saving' });

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = getAuthToken();
      const orgId = getOrgId();
      if (token) headers.Authorization = `Bearer ${token}`;
      if (orgId) headers['x-organization-id'] = orgId;

      try {
        const res = await fetch(
          `/api/c2c/documents/${encodeURIComponent(documentId)}/sections/${encodeURIComponent(sectionKey)}`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers,
            body: JSON.stringify({
              content: { text: body },
              /* Required by the route for Part-11 attribution — the
                 trigger writes it onto the version row. */
              reason: EDIT_REASON,
              draftSource: 'human',
            }),
          },
        );

        if (seq !== seqRef.current) return false; // superseded

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          setState({
            status: 'error',
            message: `Not saved — HTTP ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`,
          });
          return false;
        }

        setState({ status: 'saved', at: new Date() });
        return true;
      } catch (err) {
        if (seq !== seqRef.current) return false;
        setState({
          status: 'error',
          message: err instanceof Error ? `Not saved — ${err.message}` : 'Not saved',
        });
        return false;
      }
    },
    [documentId],
  );

  return { state, save };
}
