/**
 * useDossierHydration — async-seed the dossier store from the real backend.
 *
 * Operator decision (2026-06-02): the Files tree + DossierDrawer keep the kit UI
 * byte-identical but are backed by the program's real documents instead of the
 * in-memory fixtures. This walks the c2c/documents API:
 *
 *   GET /api/c2c/documents?projectId=<programId>   → the program's documents
 *   GET /api/c2c/documents/:id/outline             → rule-pack sections + live status
 *   GET /api/c2c/documents/:id/sections/:key       → section content (has_content only)
 *
 * adapts each section to the store's HydrateSection shape, and calls
 * DossierStore.hydratePathway (which rewrites the pathway subtree through the
 * same path scheme the tree + drawer read). The returned `version` bumps on
 * hydration; PathwayPanes keys FilesTreePane on it so the memoized tree remounts.
 *
 * Data honesty: no program, an empty document, loading, or request failure
 * clears the pathway rather than retaining fictional evidence. (The sample-mode
 * path that installed the kit's example dossier was removed on 2026-10-14.)
 *
 * Scope: exact project/document-class selection and hydration outcomes are
 * exercised in CI. Missing pathway documents stay empty; failed/unreadable
 * responses remain unavailable. Cached results belong to the existing
 * authoring session owner and are revalidated before presentation.
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiRequestError, apiRequest } from '../../../lib/queryClient';
import { DossierStore, type HydrateSection } from '../store/dossierStore';
import type { PathwayKey } from '../types';
import { useAuthUser } from '@/services/portal/authService';
import { useAuthoringReadSession } from '../../v2/editor/authoringCurrentRead';

interface C2cDocument {
  id: string;
  project_id?: string | number | null;
  doc_type?: string | null;
  agency?: string | null;
  title?: string | null;
  status?: string | null;
}

interface OutlineSection {
  key: string | number;
  parent_key?: string | null;
  label?: string | null;
  path_order?: number | null;
  status?: string | null;
  version?: number | null;
  owner_id?: string | null;
  drafted_at?: string | null;
  accepted_at?: string | null;
  has_content?: boolean;
}

interface SectionContent {
  content?: unknown;
  owner_id?: string | null;
  accepted_at?: string | null;
  drafted_at?: string | null;
  version?: number | null;
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await apiRequest('GET', url);
  // apiRequest deliberately returns 401 so shared query functions can apply
  // their configured on401 policy. Dossier hydration needs the status itself
  // to distinguish an authentication/authorization failure from an outage.
  if (res.status === 401) {
    throw new ApiRequestError('Unauthorized', 401);
  }
  return (await res.json()) as T;
}

/** Only an exact document of this project may populate a pathway dossier. */
export function pickDossierDocument(docs: C2cDocument[], pathway: PathwayKey, programId: string): C2cDocument | null {
  if (!Array.isArray(docs) || docs.length === 0) return null;
  const exactType = ({ k510: 'k510', pma: 'pma', cer: 'cer', ivd: 'ivdr' } as Record<string, string>)[pathway];
  return docs.find(doc => doc.doc_type === exactType && String(doc.project_id ?? '') === programId) ?? null;
}

/* Section content is stored as JSON; the kit drawer renders a markdown string.
   Handle the documented { paragraphs: [...] } shape plus plain string / markdown
   fallbacks defensively. */
function contentToBody(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') {
    const c = content as Record<string, unknown>;
    if (Array.isArray(c.paragraphs)) {
      return (c.paragraphs as unknown[])
        .map((p) => {
          if (typeof p === 'string') return p;
          const o = p as Record<string, unknown> | null;
          return (o?.text as string) ?? (o?.content as string) ?? (o?.md as string) ?? '';
        })
        .filter(Boolean)
        .join('\n\n');
    }
    if (typeof c.markdown === 'string') return c.markdown;
    if (typeof c.text === 'string') return c.text;
  }
  return '';
}

/* Map the backend section status onto the kit's status vocabulary. */
function mapStatus(s?: string | null): string {
  const v = (s || '').toLowerCase();
  if (['accepted', 'approved', 'locked', 'complete', 'completed', 'signed'].includes(v)) return 'complete';
  if (['in_review', 'review', 'reviewing'].includes(v)) return 'review';
  if (['drafting', 'in_progress', 'in-progress', 'drafted'].includes(v)) return 'in_progress';
  if (['todo', 'not_started', 'pending', ''].includes(v)) return 'draft';
  return v;
}

interface DossierFetch {
  docId: string;
  sections: HydrateSection[];
}

async function fetchDossier(pathway: PathwayKey, programId: string): Promise<DossierFetch | null> {
  const docsRes = await apiGet<{ documents?: C2cDocument[] }>(
    `/api/c2c/documents?projectId=${encodeURIComponent(programId)}`,
  );
  if (!Array.isArray(docsRes?.documents)) throw new Error('The project document list could not be read.');
  const doc = pickDossierDocument(docsRes.documents, pathway, programId);
  if (!doc) return null;

  const outlineRes = await apiGet<{ outline?: OutlineSection[] }>(
    `/api/c2c/documents/${encodeURIComponent(doc.id)}/outline`,
  );
  if (!Array.isArray(outlineRes?.outline)) throw new Error('The selected document outline could not be read.');
  const outline = outlineRes.outline;
  if (!outline.length) return { docId: doc.id, sections: [] };

  const sections = await Promise.all(
    outline.map(async (s): Promise<HydrateSection> => {
      let body = '';
      if (s.has_content) {
        const sec = await apiGet<SectionContent>(
          `/api/c2c/documents/${encodeURIComponent(doc.id)}/sections/${encodeURIComponent(String(s.key))}`,
        );
        body = contentToBody(sec?.content);
      }
      return {
        key: s.key,
        label: s.label || String(s.key),
        status: mapStatus(s.status),
        version: s.version ?? 1,
        owner: s.owner_id || undefined,
        when: s.accepted_at || s.drafted_at || undefined,
        body,
        attachments: [],
      };
    }),
  );
  return { docId: doc.id, sections };
}

export interface DossierHydration {
  /** Bumps each time the store is hydrated; key FilesTreePane on it to remount. */
  version: number;
  /** True once real backend sections were seeded. */
  live: boolean;
  documentId: string | null;
  status: 'loading' | 'live-data' | 'empty' | 'unavailable' | 'permission-denied';
  /**
   * Re-run the dossier fetch. Every other live hook in this lane has exposed
   * one (`usePathwayTabsData.refresh`, `useMdxPrograms.refresh`); this one did
   * not, which is why the Files tab's failure states offered no way out —
   * there was nothing for a retry control to call. UI standards §8.
   */
  refresh: () => void;
}

interface DossierStatusInput {
  hasSections: boolean;
  isLoading: boolean;
  error: unknown;
}

/** Pure policy boundary used by the hook and tests. HTTP authorization failures
 * must never be presented as an empty dossier or a dependency outage. */
export function deriveDossierStatus({
  hasSections,
  isLoading,
  error,
}: DossierStatusInput): DossierHydration['status'] {
  if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
    return 'permission-denied';
  }
  if (error) return 'unavailable';
  if (isLoading) return 'loading';
  if (hasSections) return 'live-data';
  return 'empty';
}

export function useDossierHydration(pathway: PathwayKey, programId?: string | null): DossierHydration {
  const user = useAuthUser();
  const session = useAuthoringReadSession(user);
  const q = useQuery<DossierFetch | null>({
    queryKey: ['dossier', session.actor, session.key, pathway, programId],
    queryFn: async () => {
      const result = await fetchDossier(pathway, programId as string);
      if (!session.sameRevision()) throw new ApiRequestError('The document read belongs to an earlier session.', 403);
      return result;
    },
    enabled: !!programId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const [version, setVersion] = React.useState(0);
  const hasSections = session.sameRevision() && !q.isFetching && !q.error && !!(q.data && q.data.sections.length > 0);

  React.useEffect(() => {
    if (hasSections && q.data) {
      DossierStore.hydratePathway(pathway, q.data.docId, q.data.sections);
      setVersion((v) => v + 1);
    } else {
      DossierStore.clearPathway(pathway);
      setVersion((v) => v + 1);
    }
  }, [q.data, hasSections, pathway, programId]);

  const status = deriveDossierStatus({ hasSections, isLoading: q.isFetching, error: q.error });
  const refresh = React.useCallback(() => void q.refetch(), [q]);
  return { version, live: hasSections, documentId: hasSections ? q.data!.docId : null, status, refresh };
}
