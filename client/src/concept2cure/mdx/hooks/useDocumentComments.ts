/**
 * useDocumentComments — fetches and adapts real authoring comments for the
 * document editor. Two-step chain:
 *
 *   1. GET /api/authoring/docs?product_code=<ident>&status=draft
 *      → find the authoring document for this program
 *   2. GET /api/authoring/documents/:docId/comments
 *      → fetch all comments for that document
 *
 * Falls back to an empty array (no seed) when the program has no documents
 * yet or the fetch fails. The editor renders its kit-faithful empty state.
 */
import { useEffect, useState } from 'react';
import type { EditorComment } from '../data/editor';
import { getAuthHeaders } from '@/utils/authToken';

function relTime(iso: string | undefined): string {
  if (!iso) return 'recently';
  const d = Date.now() - new Date(iso).getTime();
  if (!isFinite(d) || d < 0) return 'just now';
  const m = Math.floor(d / 60_000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface ApiDoc { id: string | number; }
interface ApiComment {
  id: string | number;
  body?: string;
  status?: string;
  user_name?: string;
  created_by?: string;
  anchor?: string;
  section_id?: string | number | null;
  created_at?: string;
}

function adaptComment(c: ApiComment): EditorComment {
  return {
    id: String(c.id),
    blockId: c.anchor || (c.section_id != null ? String(c.section_id) : ''),
    author: c.user_name || c.created_by || 'Reviewer',
    role: 'Reviewer',
    when: relTime(c.created_at),
    resolved: c.status === 'resolved',
    body: c.body || '',
  };
}

export interface UseDocumentCommentsReturn {
  comments: EditorComment[];
  loading: boolean;
}

export function useDocumentComments(programIdent: string | null | undefined): UseDocumentCommentsReturn {
  const [comments, setComments] = useState<EditorComment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!programIdent) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
        const docsRes = await fetch(
          `/api/authoring/docs?product_code=${encodeURIComponent(programIdent)}&status=draft`,
          { headers, credentials: 'include' },
        );
        if (!docsRes.ok || cancelled) return;
        const docsBody = (await docsRes.json()) as { data?: ApiDoc[]; documents?: ApiDoc[] } | ApiDoc[];
        const docs: ApiDoc[] = Array.isArray(docsBody)
          ? docsBody
          : (docsBody as { data?: ApiDoc[]; documents?: ApiDoc[] }).data ?? (docsBody as { documents?: ApiDoc[] }).documents ?? [];
        if (docs.length === 0 || cancelled) return;

        const docId = docs[0].id;
        const commRes = await fetch(
          `/api/authoring/documents/${encodeURIComponent(String(docId))}/comments`,
          { headers, credentials: 'include' },
        );
        if (!commRes.ok || cancelled) return;
        const commBody = (await commRes.json()) as { data?: ApiComment[]; comments?: ApiComment[] } | ApiComment[];
        const raw: ApiComment[] = Array.isArray(commBody)
          ? commBody
          : (commBody as { data?: ApiComment[]; comments?: ApiComment[] }).data ?? (commBody as { comments?: ApiComment[] }).comments ?? [];
        if (!cancelled) setComments(raw.map(adaptComment));
      } catch { /* degrade to empty */ } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [programIdent]);

  return { comments, loading };
}
