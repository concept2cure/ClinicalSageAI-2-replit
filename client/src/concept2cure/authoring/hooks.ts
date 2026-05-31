/**
 * Universal Authoring — live data hooks (Phase 9).
 *
 * Bridges the authoring shell to the live `/api/c2c/documents/*` API (which
 * already serves the c2c_documents model — list, rule-packs, outline). The
 * shell keeps its ported fixtures as the fallback (the house `live ?? fixture`
 * pattern, same as MDX): when an org has real c2c_documents the picker and
 * outline reflect them; otherwise the kit demo content renders so the surface
 * is never blank.
 *
 * Endpoint contract (server/routes/c2c/documents.ts):
 *   GET /api/c2c/documents?docType=&agency=   → { documents: C2cDocumentSummary[] }
 *   GET /api/c2c/documents/rule-packs          → { rulePacks: C2cRulePack[] }
 *   GET /api/c2c/documents/:id/outline         → { document, outline: C2cOutlineNode[] }
 *
 * @module client/src/concept2cure/authoring/hooks
 */

import * as React from 'react';
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { getAuthToken, getOrgId } from '@/utils/authToken';

export interface C2cDocumentSummary {
  id: string;
  org_id: string;
  project_id: string;
  doc_type: string;
  agency: string;
  rule_pack_version: string;
  title: string;
  status: string;
  readiness: number;
  owner_id: number | null;
  locked_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface C2cRulePack {
  doc_type: string;
  agency: string;
  version: string;
  label: string;
  required_sections: unknown;
  esubmit_channel: string | null;
  effective_from: string;
}

export interface C2cOutlineNode {
  key: string;
  parent_key: string | null;
  label: string;
  mandatory: boolean;
  path_order: number;
  status: string;
  draft_source: string | null;
  drafted_at: string | null;
  accepted_at: string | null;
  version: number;
  has_content: boolean;
}

/**
 * Live document list for the current org, optionally scoped by doc type /
 * agency. Returns `null` while loading / on error / when none exist — the
 * caller falls back to the kit fixtures.
 */
export function useC2cDocuments(opts: { docType?: string; agency?: string } = {}): {
  documents: C2cDocumentSummary[] | null;
  loading: boolean;
  error: string | null;
} {
  const qs = new URLSearchParams();
  if (opts.docType) qs.set('docType', opts.docType);
  if (opts.agency) qs.set('agency', opts.agency);
  const url = `/api/c2c/documents${qs.toString() ? `?${qs}` : ''}`;
  const { data, loading, error } = useFetchJson<{ documents: C2cDocumentSummary[] }>(url);
  const documents = data?.documents && data.documents.length > 0 ? data.documents : null;
  return { documents, loading, error };
}

/** Live rule-pack registry (top-bar pickers). Null when unavailable. */
export function useC2cRulePacks(opts: { docType?: string; agency?: string } = {}): {
  rulePacks: C2cRulePack[] | null;
  loading: boolean;
} {
  const qs = new URLSearchParams();
  if (opts.docType) qs.set('docType', opts.docType);
  if (opts.agency) qs.set('agency', opts.agency);
  const url = `/api/c2c/documents/rule-packs${qs.toString() ? `?${qs}` : ''}`;
  const { data, loading } = useFetchJson<{ rulePacks: C2cRulePack[] }>(url);
  const rulePacks = data?.rulePacks && data.rulePacks.length > 0 ? data.rulePacks : null;
  return { rulePacks, loading };
}

/**
 * Live outline (rule-pack sections overlaid with per-section live status) for
 * a specific document. Pass `null` to skip the fetch. Null result → fixtures.
 */
export function useC2cDocumentOutline(documentId: string | null): {
  outline: C2cOutlineNode[] | null;
  documentTitle: string | null;
  loading: boolean;
} {
  const url = documentId ? `/api/c2c/documents/${encodeURIComponent(documentId)}/outline` : null;
  const { data, loading } = useFetchJson<{ document: { title: string }; outline: C2cOutlineNode[] }>(url);
  return {
    outline: data?.outline ?? null,
    documentTitle: data?.document?.title ?? null,
    loading,
  };
}

/** A paragraph inside a c2c section's `content` jsonb. Shapes vary (legacy
 *  backfill stores `prov: 'legacy'` as a string), so all fields are loose. */
export interface C2cContentParagraph {
  id?: string | number;
  text?: string;
  tag?: string;
  prov?: unknown;
  citations?: unknown;
}

/** Raw c2c_document_sections row (GET /:id/sections/:key returns it directly). */
export interface C2cSectionRow {
  id: number;
  document_id: string;
  section_key: string;
  label: string;
  status: string;
  content: { paragraphs?: C2cContentParagraph[] } | null;
  version: number;
}

/**
 * Live content for one section of a document. Returns `null` (→ fixture body)
 * while loading, on error/404, or when either id is missing.
 */
export function useC2cDocumentSection(documentId: string | null, sectionKey: string | null): {
  section: C2cSectionRow | null;
  loading: boolean;
} {
  const url =
    documentId && sectionKey
      ? `/api/c2c/documents/${encodeURIComponent(documentId)}/sections/${encodeURIComponent(sectionKey)}`
      : null;
  const { data, loading } = useFetchJson<C2cSectionRow>(url);
  return { section: data ?? null, loading };
}

export interface SaveSectionInput {
  documentId: string;
  sectionKey: string;
  /** New content jsonb (`{ paragraphs: [...] }`). Omit to change status only. */
  content?: { paragraphs: C2cContentParagraph[] };
  /** New lifecycle status. Omit to change content only. */
  status?: string;
  /** Required Part-11 reason-for-change. Server rejects empty. */
  reason: string;
}

/**
 * Save a section via the audited `PATCH /api/c2c/documents/:id/sections/:key`.
 * The route writes the Part-11 version snapshot + c2c_ana_actions ledger from
 * the reason; this just forwards the governed mutation with bearer + org
 * headers (the global /api gate is Bearer-only). Returns the updated row.
 */
export function useSaveC2cSection(): {
  save: (input: SaveSectionInput) => Promise<C2cSectionRow>;
  saving: boolean;
  error: string | null;
} {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = React.useCallback(async (input: SaveSectionInput): Promise<C2cSectionRow> => {
    setSaving(true);
    setError(null);
    try {
      const token = getAuthToken();
      const orgId = getOrgId();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (orgId) headers['x-organization-id'] = orgId;

      const body: Record<string, unknown> = { reason: input.reason };
      if (input.content !== undefined) body.content = input.content;
      if (input.status !== undefined) body.status = input.status;

      const res = await fetch(
        `/api/c2c/documents/${encodeURIComponent(input.documentId)}/sections/${encodeURIComponent(input.sectionKey)}`,
        { method: 'PATCH', credentials: 'include', headers, body: JSON.stringify(body) },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
      }
      return (await res.json()) as C2cSectionRow;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setError(msg);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { save, saving, error };
}
