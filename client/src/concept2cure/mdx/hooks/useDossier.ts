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
 * Resilience: when there's no programId, no matching document, or any request
 * fails, the store keeps its fixture seed (DossierStore.hydratePathway no-ops on
 * an empty section list). `live` reports whether real data was seeded.
 *
 * Scope note: the program→document association (projectId filter), document
 * selection, and the exact content/paragraph shape are verified against the
 * deployed backend — they can't be exercised in CI without it. Adapters degrade
 * defensively (placeholders, never throw) so a shape drift can't crash the pane.
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../../lib/queryClient';
import { DossierStore, type HydrateSection } from '../store/dossierStore';
import type { PathwayKey } from '../types';

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
  return (await res.json()) as T;
}

/* A program usually has one document; prefer one whose doc_type matches the
   pathway, else the most-recently-updated (the list is ordered DESC). */
function pickDoc(docs: C2cDocument[], pathway: PathwayKey): C2cDocument | null {
  if (!Array.isArray(docs) || docs.length === 0) return null;
  const hint = ({ k510: '510', pma: 'pma', cer: 'cer' } as Record<string, string>)[pathway];
  const matched = hint ? docs.find((d) => String(d.doc_type || '').toLowerCase().includes(hint)) : undefined;
  return matched || docs[0];
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
  const doc = pickDoc(docsRes?.documents || [], pathway);
  if (!doc) return null;

  const outlineRes = await apiGet<{ outline?: OutlineSection[] }>(
    `/api/c2c/documents/${encodeURIComponent(doc.id)}/outline`,
  );
  const outline = outlineRes?.outline || [];
  if (!outline.length) return { docId: doc.id, sections: [] };

  const sections = await Promise.all(
    outline.map(async (s): Promise<HydrateSection> => {
      let body = '';
      if (s.has_content) {
        try {
          const sec = await apiGet<SectionContent>(
            `/api/c2c/documents/${encodeURIComponent(doc.id)}/sections/${encodeURIComponent(String(s.key))}`,
          );
          body = contentToBody(sec?.content);
        } catch {
          /* leave the body empty — a draft-pending placeholder, like the fixtures */
        }
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
  /** True once real backend sections were seeded (vs the fixture fallback). */
  live: boolean;
  documentId: string | null;
}

export function useDossierHydration(pathway: PathwayKey, programId?: string | null): DossierHydration {
  const q = useQuery<DossierFetch | null>({
    queryKey: ['dossier', pathway, programId],
    queryFn: () => fetchDossier(pathway, programId as string),
    enabled: !!programId,
    staleTime: 5 * 60 * 1000,
  });

  const [version, setVersion] = React.useState(0);
  const hasSections = !!(q.data && q.data.sections.length > 0);

  React.useEffect(() => {
    if (q.data && q.data.sections.length > 0) {
      DossierStore.hydratePathway(pathway, q.data.docId, q.data.sections);
      setVersion((v) => v + 1);
    }
  }, [q.data, pathway]);

  return { version, live: hasSections, documentId: q.data?.docId ?? null };
}
