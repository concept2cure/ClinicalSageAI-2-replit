/**
 * The open project's governed filing outline — the tree the document canvas
 * navigates by.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * A project's structure is decided the moment it is created. The wizard writes
 * `program_type` + `primary_agency`, and `scaffoldProjectDocuments()` resolves
 * the matching `c2c_rule_packs` row and inserts its whole section tree into
 * `c2c_document_sections` inside the creation transaction. A BLA gets 71 nested
 * sections, a 510(k) gets A/B/C/D/E, a CER gets A0–A8.
 *
 * The canvas never read any of it. It navigated by a Module (M1–M5) × status
 * dropdown pair, defaulted to "M3", identical for every filing type — so the
 * derived tree existed in the database, was rendered by the Vault, was served
 * by `GET /api/c2c/documents/:id/outline`, and stopped one step short of the
 * editor.
 *
 * ── Why not reuse authoring/hooks.ts ──────────────────────────────────────────
 * `authoring/hooks.ts` already exports `useC2cDocumentOutline`, and it is the
 * right shape. It also imports `mdx/hooks/useFetchJson`, so consuming it from
 * v2 would create a fresh v2→mdx dependency — in the same change set that
 * removed the last one. The fetch is a dozen lines against v2's own
 * `useLiveData`; the duplication is cheaper than the coupling.
 *
 * @module client/src/concept2cure/v2/useFilingOutline
 */
import React from 'react';

import {
  normalizeRulePackProvenance,
  type RulePackProvenance,
} from '@shared/rule-pack-provenance';

import { useLiveData } from './dataConnect';

/** One row of `GET /api/c2c/documents/:id/outline`. */
export interface FilingOutlineRow {
  key: string;
  parent_key: string | null;
  label: string;
  mandatory: boolean;
  path_order: number;
  /** Live per-section state, or the server's 'todo' default when unwritten. */
  status: string;
  draft_source: string | null;
  has_content: boolean;
  version: number;
}

/** A row with its children resolved. */
export interface FilingOutlineNode extends FilingOutlineRow {
  children: FilingOutlineNode[];
  depth: number;
}

interface DocumentsResponse {
  documents: Array<{
    id: string;
    doc_type: string;
    agency: string;
    title: string;
    rule_pack_version: string;
    status: string;
    readiness: number;
  }>;
}

interface OutlineResponse {
  document: {
    id: string;
    title: string;
    doc_type: string;
    agency: string;
    status: string;
    readiness: number;
    /** Absent when the server predates the provenance columns. */
    provenance?: unknown;
  };
  outline: FilingOutlineRow[];
}

/** The document, with provenance guaranteed present and in the vocabulary. */
export interface FilingOutlineDocument {
  id: string;
  title: string;
  doc_type: string;
  agency: string;
  status: string;
  readiness: number;
  provenance: RulePackProvenance;
}

/**
 * Build the nested tree from the flat rows.
 *
 * Adjacency on `parent_key`, ordered by `path_order` — the same walk
 * `server/routes/c2c/project-vault.ts` does for the Vault, so both render the
 * same shape from the same source.
 *
 * A row whose `parent_key` does not resolve is promoted to a root rather than
 * dropped. The rule packs are authored data and a typo there must not make a
 * mandatory section silently vanish from the editor — a section in the wrong
 * place is visible and fixable, a section that is absent is neither.
 */
export function buildOutlineTree(rows: readonly FilingOutlineRow[]): FilingOutlineNode[] {
  const sorted = [...rows].sort((a, b) => (a.path_order ?? 0) - (b.path_order ?? 0));
  const byKey = new Map<string, FilingOutlineNode>();
  for (const r of sorted) byKey.set(r.key, { ...r, children: [], depth: 0 });

  const roots: FilingOutlineNode[] = [];
  for (const r of sorted) {
    const node = byKey.get(r.key)!;
    const parent = r.parent_key ? byKey.get(r.parent_key) : undefined;
    if (parent) {
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Flatten a tree back to render order, parents before their children. */
export function flattenOutline(nodes: readonly FilingOutlineNode[]): FilingOutlineNode[] {
  const out: FilingOutlineNode[] = [];
  const walk = (list: readonly FilingOutlineNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export type FilingOutlineReason =
  | 'no-project'
  | 'no-governed-document'
  | 'empty-outline';

export interface FilingOutlineState {
  /** The governed document this outline belongs to, when one resolved. */
  document: FilingOutlineDocument | null;
  tree: FilingOutlineNode[];
  flat: FilingOutlineNode[];
  loading: boolean;
  error?: string;
  /** Set when there is no tree to show, saying WHICH of the reasons applies. */
  reason?: FilingOutlineReason;
}

/**
 * Resolve the open project's governed document and its outline.
 *
 * `projectId` is the `regulatory_programs` UUID that `window.C2C_PROJECT.id`
 * carries. Null skips both fetches — the canvas still works org-wide, which is
 * the pre-existing behaviour and not something this hook should break.
 *
 * The three no-tree outcomes are distinguished rather than collapsed into one
 * empty, because they need different words on screen. In particular a project
 * with no governed document is usually not an error: `program_type` values
 * ivd / device / ide / biologic / anda have no `doc_type` and no rule pack, so
 * `scaffoldProjectDocuments()` skips them deliberately and says why.
 */
export function useFilingOutline(projectId: string | null): FilingOutlineState {
  const docs = useLiveData<DocumentsResponse>(
    projectId ? `/api/c2c/documents?projectId=${encodeURIComponent(projectId)}` : null,
    [projectId],
  );

  // The project's governed document. More than one is possible in principle;
  // the newest by the server's own `updated_at DESC` ordering is the one the
  // editor should open.
  const documentId = docs.data?.documents?.[0]?.id ?? null;

  const outline = useLiveData<OutlineResponse>(
    documentId ? `/api/c2c/documents/${encodeURIComponent(documentId)}/outline` : null,
    [documentId],
  );

  return React.useMemo<FilingOutlineState>(() => {
    const loading = docs.loading || outline.loading;
    const error = docs.error ?? outline.error;

    if (loading || error) {
      return { document: null, tree: [], flat: [], loading, error };
    }
    if (!projectId) {
      return { document: null, tree: [], flat: [], loading: false, reason: 'no-project' };
    }
    if (!documentId) {
      return { document: null, tree: [], flat: [], loading: false, reason: 'no-governed-document' };
    }

    const rows = outline.data?.outline ?? [];
    const tree = buildOutlineTree(rows);
    const raw = outline.data?.document ?? null;
    return {
      // Normalised here as well as on the server, because a client can be
      // newer than the API it is talking to. An older server omits
      // `provenance` entirely, and the surface must show "basis undeclared"
      // rather than crash or — far worse — render nothing and let the outline
      // read as unqualified.
      document: raw ? { ...raw, provenance: normalizeRulePackProvenance(raw.provenance) } : null,
      tree,
      flat: flattenOutline(tree),
      loading: false,
      reason: rows.length === 0 ? 'empty-outline' : undefined,
    };
  }, [projectId, documentId, docs.loading, docs.error, outline.loading, outline.error, outline.data]);
}

/**
 * Match an outline node to the authored section that holds its text.
 *
 * The two stores are bound at DOCUMENT level (`authoring_documents.c2c_document_id`)
 * but not at section level, so the correspondence is by code:
 * `authoring_sections.code === outline row .key`.
 *
 * `code` is nullable TEXT. A null must never match anything — collapsing null
 * onto a real section key would open the wrong section's text under a node,
 * which is the one failure mode worse than showing nothing.
 */
export function findSectionForNode<T extends { code?: string | null }>(
  sections: readonly T[],
  sectionKey: string,
): T | null {
  if (!sectionKey) return null;
  return sections.find((s) => typeof s.code === 'string' && s.code === sectionKey) ?? null;
}

/**
 * Does this outline node have a draft anywhere?
 *
 * ── Why the node's own flag is not the answer ─────────────────────────────────
 * `has_content` arrives on the outline row and is computed from
 * `c2c_document_sections.content` — the GOVERNED store. The editor that renders
 * this tree writes the OTHER one: DocumentAuthoring saves through
 * `PATCH /api/authoring/sections/:id` into `authoring_sections`, and lists from
 * `GET /api/authoring/docs/:id/sections`.
 *
 * So `node.has_content` could never become true from anything done in this
 * editor. Someone could draft ten sections here and every one of them would keep
 * reporting no content on the tree they navigate by — a progress indicator blind
 * to the editor it sits inside. The two stores are bound at document level but
 * not at section level (see findSectionForNode above), which is exactly why the
 * question has to be asked of both.
 *
 * Answering from both is honest in every direction: text written here shows,
 * text written through the governed path (the mdx dossier editor, AnA drafting)
 * still shows, and a section with nothing anywhere stays blank. Reading only the
 * authored side would have swapped one blind spot for the mirror image of it.
 *
 * Whitespace is not a draft, which matches the server-side predicate the
 * governed flag comes from (server/services/c2c/section-content.ts).
 */
export function nodeHasDraft(
  node: Pick<FilingOutlineRow, 'has_content'>,
  section: { content?: string | null } | null,
): boolean {
  const authored = typeof section?.content === 'string' && section.content.trim().length > 0;
  return authored || node.has_content === true;
}
