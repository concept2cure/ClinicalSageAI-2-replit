/**
 * One outline per filing in the Vault's Library (P-123 item 8, 2026-11-12).
 *
 * The Library listed a filing's outline twice. First came the filing binder (S6): the headings of the filing's
 * outline, holding the files placed against them. Below it came the authored filing document's own sections, with
 * the same headings, each with its requirement, its drafting state and its door to the one editor. The two counted
 * different things (files; sections), so a person saw "A Administrative 0/0" in one place and "A Administrative 0/9"
 * in the other. That was seen on a 510(k) (eSTAR A to G) and on two INDs (eCTD Modules 1 to 5).
 *
 * Here each authored section goes into the binder heading with its code, beside the files placed there. It keeps
 * everything it had: its requirement, its state, its owner and the filing document it belongs to, which the editor
 * door reads from the section itself once it is no longer under that document's folder. A section the binder has
 * no heading for stays under its document, and so does a document the binder is not the outline of. Nothing is
 * dropped, and the binder stays first (S6: "the Vault opens on the filing's binder, not on an authored document's
 * draft outline").
 *
 * Pure: it rearranges the tree it is given and reads nothing.
 *
 * @module server/services/vault/vault-binder-outline
 */

/** A folder of the Library's tree, as `server/routes/c2c/project-vault.ts` builds it. */
export interface BinderOutlineFolder {
  id: string;
  code: string;
  label?: string;
  kind?: string;
  filingDocumentId?: string;
  binder?: { docType: string; agency: string };
  children: BinderOutlineNode[];
}

/** A leaf of the tree: a file, or an authored section (`filingSectionKey`). */
export interface BinderOutlineLeaf {
  id: string;
  filingSectionKey?: string | null;
  /** Set on an authored section placed in the binder: the filing document it is a section of. */
  filingDocumentId?: string;
  /** Set with `filingDocumentId`: the filing's type, as the document's folder carried it (`IND`, `K510`, ...). */
  filingFamily?: string;
}

export type BinderOutlineNode = BinderOutlineFolder | BinderOutlineLeaf;

/** What the merge needs of each authored document. */
export interface BinderOutlineDocument {
  id: string;
  doc_type: string | null;
  agency: string | null;
  filing_scope?: string | null;
}

const isFolder = (n: BinderOutlineNode): n is BinderOutlineFolder => Array.isArray((n as BinderOutlineFolder).children);
const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

const BINDER_HEADING = 'cab-bn:';

/**
 * The binder's headings by the outline's key, read from the heading's id (`cab-bn:<key>`, vault-folders.ts
 * `binderFolderId`): its shown code is blank for a module (M1 to M5). Only a binder heading is a place for a section;
 * presets and people's folders are not.
 */
function headingsByCode(cabinet: BinderOutlineFolder): Map<string, BinderOutlineFolder> {
  const out = new Map<string, BinderOutlineFolder>();
  const walk = (nodes: BinderOutlineNode[]) => {
    for (const n of nodes) {
      if (!isFolder(n)) continue;
      const key = n.kind === 'binder' && n.id.startsWith(BINDER_HEADING) ? norm(n.id.slice(BINDER_HEADING.length)) : '';
      if (key && !out.has(key)) out.set(key, n);
      walk(n.children);
    }
  };
  walk(cabinet.children);
  return out;
}

/** The one authored document whose outline the binder is: its filing type and agency, and not a market's part (F22). */
function outlineDocument(tree: BinderOutlineNode[], cabinet: BinderOutlineFolder, docs: readonly BinderOutlineDocument[]): BinderOutlineFolder | null {
  const binder = cabinet.binder!;
  const byId = new Map(docs.map((d) => [d.id, d]));
  const matches = tree.filter((n): n is BinderOutlineFolder => {
    if (!isFolder(n) || !n.filingDocumentId) return false;
    const doc = byId.get(n.filingDocumentId);
    return !!doc && norm(doc.doc_type) === norm(binder.docType) && norm(doc.filing_scope) !== 'market'
      && (!norm(binder.agency) || !norm(doc.agency) || norm(doc.agency) === norm(binder.agency));
  });
  // Two documents of the same filing: which one the binder is the outline of is not known, so neither moves.
  return matches.length === 1 ? matches[0] : null;
}

/** Moves each section leaf with a heading into it, first among the heading's own items; returns what is left. */
function moveSections(nodes: BinderOutlineNode[], headings: Map<string, BinderOutlineFolder>, from: BinderOutlineFolder): BinderOutlineNode[] {
  const kept: BinderOutlineNode[] = [];
  for (const n of nodes) {
    if (isFolder(n)) {
      n.children = moveSections(n.children, headings, from);
      if (n.children.length > 0) kept.push(n);
      continue;
    }
    const heading = typeof n.filingSectionKey === 'string' ? headings.get(norm(n.filingSectionKey)) : undefined;
    if (!heading) { kept.push(n); continue; }
    n.filingDocumentId = from.filingDocumentId;
    n.filingFamily = from.code;
    const firstLeaf = heading.children.findIndex((c) => !isFolder(c));
    heading.children.splice(firstLeaf < 0 ? heading.children.length : firstLeaf, 0, n);
  }
  return kept;
}

/**
 * Puts the authored filing document's sections into the binder's headings, in place. The document's folder keeps
 * only the sections the binder has no heading for, and leaves the tree when none is left. A tree with no binder, or
 * with no single document the binder is the outline of, is left as it was.
 */
export function placeAuthoredSectionsInBinder(tree: BinderOutlineNode[], docs: readonly BinderOutlineDocument[]): void {
  const cabinet = tree.find((n): n is BinderOutlineFolder => isFolder(n) && n.id === 'cabinet' && !!n.binder);
  if (!cabinet) return;
  const draft = outlineDocument(tree, cabinet, docs);
  if (!draft) return;
  draft.children = moveSections(draft.children, headingsByCode(cabinet), draft);
  if (draft.children.length === 0) tree.splice(tree.indexOf(draft), 1);
}
