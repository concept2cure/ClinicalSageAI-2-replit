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

import { useFetchJson } from '../mdx/hooks/useFetchJson';

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
