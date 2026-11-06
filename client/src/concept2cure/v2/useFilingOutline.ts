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

import { useLiveData, type DataReadOwner } from './dataConnect';
import { useAuthUser } from '@/services/portal/authService';
import { useAuthoringReadSession } from './editor/authoringCurrentRead';
import { filingSectionKey } from '@shared/regulatory/filing-section-key';

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
    project_id?: string;
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
    project_id?: string;
    title: string;
    doc_type: string;
    agency: string;
    status: string;
    readiness: number;
    /** Absent when the server predates the provenance columns. */
    provenance?: unknown;
    /** Absent before F22b: the home filing. */
    filing_scope?: 'home' | 'market';
  };
  outline: FilingOutlineRow[];
  /** A market document's required sections the home filing lacks (F22b). */
  gaps?: Array<{ key: string; label: string }>;
}

/** One of the project's filings: its home filing or an added market (F22b). */
export interface FilingMarket {
  id: string;
  title: string;
  agency: string;
  doc_type: string;
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
  /** 'market' for an added market's Module 1 and 3.2.R (F22b). */
  filing_scope: 'home' | 'market';
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
  | 'unbound-document'
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
  /** The project's home filing, when one resolved (F22b). */
  home: FilingMarket | null;
  /** The markets added to the project, each its own governed document (F22b). */
  markets: FilingMarket[];
  /** The market list could not be read: the home filing is still shown. */
  marketsError: boolean;
  /** A market document's required sections the home filing lacks. Shown, never added. */
  gaps: Array<{ key: string; label: string }>;
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
const asFiling = (d: DocumentsResponse['documents'][number]): FilingMarket => ({
  id: d.id, title: d.title, agency: d.agency, doc_type: d.doc_type,
});
const nonblank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
function isFiling(value: unknown, projectId: string | null, allowMissingProject = false): value is DocumentsResponse['documents'][number] {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const matches = allowMissingProject && row.project_id === undefined ||
    typeof row.project_id === 'string' && row.project_id.toLowerCase() === projectId?.toLowerCase();
  return matches && [row.id, row.title, row.agency, row.doc_type].every(nonblank);
}
function isDocumentsResponse(value: unknown, projectId: string | null): value is DocumentsResponse {
  const rows = value && typeof value === 'object' && 'documents' in value ? value.documents : null;
  return Array.isArray(rows) && rows.every(row => isFiling(row, projectId));
}
type FilingSelection = { filing: FilingMarket | null; scope: 'home' | 'market'; loading?: boolean; error?: string };
export interface FilingOutlineOptions { bindingUnavailable?: boolean; unboundDocument?: boolean }
const UNVERIFIED_BINDING = 'The open document’s saved filing could not be verified. Reopen it before using filing requirements.';
function selectFiling(homes: DocumentsResponse['documents'], markets: ReturnType<typeof useProjectMarkets>,
  boundId: string | null, options: FilingOutlineOptions): FilingSelection {
  const none: FilingSelection = { filing: null, scope: 'home' };
  if (options.bindingUnavailable || options.unboundDocument && boundId !== null) return { ...none, error: UNVERIFIED_BINDING };
  if (options.unboundDocument) return none;
  if (boundId === null) return { ...none, filing: homes[0] ? asFiling(homes[0]) : null };
  if (!nonblank(boundId) || boundId.trim() !== boundId) return { ...none, error: UNVERIFIED_BINDING };
  const home = homes.filter(row => row.id === boundId);
  if (home.length === 1) return { filing: asFiling(home[0]), scope: 'home' };
  if (home.length > 1) return { ...none, error: UNVERIFIED_BINDING };
  if (markets.loading) return { ...none, loading: true };
  if (markets.error) return { ...none, error: UNVERIFIED_BINDING };
  const market = markets.list.filter(row => row.id === boundId);
  return market.length === 1 ? { filing: market[0], scope: 'market' } : { ...none, error: UNVERIFIED_BINDING };
}
function isSelectedOutline(value: unknown, selection: FilingSelection, projectId: string | null): value is OutlineResponse {
  if (!value || typeof value !== 'object' || !selection.filing) return false;
  const data = value as OutlineResponse;
  const responseScope = data.document?.filing_scope;
  if (!isFiling(data.document, projectId, true) || data.document.id !== selection.filing.id ||
    data.document.doc_type !== selection.filing.doc_type || data.document.agency !== selection.filing.agency ||
    responseScope !== undefined && responseScope !== selection.scope) return false;
  return Array.isArray(data.outline) && data.outline.every(row => row && nonblank(row.key) && nonblank(row.label)) &&
    (data.gaps === undefined || Array.isArray(data.gaps) && data.gaps.every(row => row && nonblank(row.key) && nonblank(row.label)));
}
function useProjectMarkets(projectId: string | null, homeIds: ReadonlySet<string>, owner: DataReadOwner) {
  const markets = useLiveData<DocumentsResponse>(
    projectId ? `/api/c2c/documents?projectId=${encodeURIComponent(projectId)}&scope=market` : null,
    [projectId], value => isDocumentsResponse(value, projectId), owner,
  );
  const list = React.useMemo(() => (markets.data?.documents ?? []).filter(row => !homeIds.has(row.id)).map(asFiling), [markets.data, homeIds]);
  return { list, loading: markets.loading, error: Boolean(markets.error) };
}
function useFilingReadOwner(projectId: string | null): DataReadOwner {
  const session = useAuthoringReadSession(useAuthUser());
  const key = JSON.stringify([projectId, session.actor, session.key]);
  const live = React.useRef(key); live.current = key;
  return React.useMemo(() => ({ key, current: () => live.current === key && session.sameRevision() }), [key, session]);
}
/** Exact saved bindings select their own home or market; failed identity never
 * selects a different filing. A known unbound copy retains explicit project
 * filing starts but receives no ambient requirements. */
export function useFilingOutline(projectId: string | null, boundDocumentId: string | null = null,
  { bindingUnavailable = false, unboundDocument = false }: FilingOutlineOptions = {}): FilingOutlineState {
  const owner = useFilingReadOwner(projectId);
  const docs = useLiveData<DocumentsResponse>(
    projectId ? `/api/c2c/documents?projectId=${encodeURIComponent(projectId)}&scope=home` : null,
    [projectId], value => isDocumentsResponse(value, projectId), owner,
  );
  const homeDocs = docs.data?.documents;
  const homeIds = React.useMemo(() => new Set((homeDocs ?? []).map(row => row.id)), [homeDocs]);
  const markets = useProjectMarkets(projectId, homeIds, owner);
  const selection = React.useMemo(() => selectFiling(homeDocs ?? [], { list: markets.list, loading: markets.loading, error: markets.error },
    boundDocumentId, { bindingUnavailable, unboundDocument }),
    [homeDocs, markets.list, markets.loading, markets.error, boundDocumentId, bindingUnavailable, unboundDocument]);
  const documentId = selection.filing?.id ?? null;
  const outlineKey = JSON.stringify([owner.key, boundDocumentId, bindingUnavailable, unboundDocument, documentId]);
  const liveOutline = React.useRef(outlineKey); liveOutline.current = outlineKey;
  const outlineOwner = React.useMemo<DataReadOwner>(() => ({ key: outlineKey,
    current: () => liveOutline.current === outlineKey && owner.current() }), [outlineKey, owner]);
  const outline = useLiveData<OutlineResponse>(
    documentId ? `/api/c2c/documents/${encodeURIComponent(documentId)}/outline` : null,
    [documentId], value => isSelectedOutline(value, selection, projectId), outlineOwner,
  );
  return React.useMemo<FilingOutlineState>(() => {
    const primaryHome = homeDocs?.[0] ? asFiling(homeDocs[0]) : null;
    const around = { home: selection.filing && selection.scope === 'home' ? selection.filing
      : selection.filing || unboundDocument ? primaryHome : null, markets: markets.list, marketsError: markets.error };
    const blocked = noTreeState({ loading: docs.loading || outline.loading || Boolean(selection.loading),
      error: docs.error ?? selection.error ?? outline.error, projectId, documentId });
    if (blocked) return { ...blocked, ...around, gaps: [],
      ...(unboundDocument && !blocked.loading && !blocked.error ? { reason: 'unbound-document' as const } : {}) };
    return { ...treeState(outline.data, selection.scope), ...around };
  }, [projectId, documentId, homeDocs, selection, unboundDocument, markets.list, markets.error,
    docs.loading, docs.error, outline.loading, outline.error, outline.data]);
}

type TreePart = Pick<FilingOutlineState, 'document' | 'tree' | 'flat' | 'loading' | 'error' | 'reason'>;

/** The states with no tree: reading, failed, no project, no governed document. */
function noTreeState(a: { loading: boolean; error?: string; projectId: string | null; documentId: string | null }): TreePart | null {
  const none = { document: null, tree: [], flat: [] };
  if (a.loading || a.error) return { ...none, loading: a.loading, error: a.error };
  if (!a.projectId) return { ...none, loading: false, reason: 'no-project' };
  if (!a.documentId) return { ...none, loading: false, reason: 'no-governed-document' };
  return null;
}

/** The outline read, as a tree, with its document and (for a market) its gaps. */
function treeState(data: OutlineResponse | null | undefined, scope: 'home' | 'market'): TreePart & { gaps: FilingOutlineState['gaps'] } {
  const rows = data?.outline ?? [];
  const tree = buildOutlineTree(rows);
  const raw = data?.document ?? null;
  return {
    // Normalised here as well as on the server, because a client can be
    // newer than the API it is talking to. An older server omits
    // `provenance` entirely, and the surface must show "basis undeclared"
    // rather than crash or — far worse — render nothing and let the outline
    // read as unqualified.
    document: raw
      ? { ...raw, provenance: normalizeRulePackProvenance(raw.provenance), filing_scope: scope }
      : null,
    tree,
    flat: flattenOutline(tree),
    loading: false,
    reason: rows.length === 0 ? 'empty-outline' : undefined,
    gaps: Array.isArray(data?.gaps) ? data.gaps : [],
  };
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
 *
 * QA 2026-10-08, walk 2 (j4): given the outline's keys, a node the outline
 * does not subdivide also opens the document's first section that belongs to
 * it — 2.5 opens 2.5.1 of the Clinical Overview — by the same rule the server
 * files that section's text into the node (shared/regulatory/filing-section-key.ts).
 */
export function findSectionForNode<T extends { code?: string | null }>(
  sections: readonly T[],
  sectionKey: string,
  outlineKeys?: ReadonlyArray<string>,
): T | null {
  if (!sectionKey) return null;
  const own = sections.find((s) => typeof s.code === 'string' && s.code === sectionKey);
  if (own || !outlineKeys) return own ?? null;
  return sections.find((s) => filingSectionKey(outlineKeys, s.code) === sectionKey) ?? null;
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
