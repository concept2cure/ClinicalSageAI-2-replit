/**
 * What the filing outline can say about a node before the open document's
 * sections have been read — and when there is no document to read.
 *
 * QA 2026-10-08, walk 2 (j4). A new project has its filing outline and no
 * document. The editor's sections state stays 'idle' when no document is open,
 * and the outline treated every state but 'ready' as "unread": each node was
 * titled "this document’s sections have not been read yet" and a click said
 * "This document’s sections are still being read." — a read that never starts,
 * so it never finished. The states are now kept apart: the project's document
 * list still being read (or failed), no document open, and the open document's
 * sections being read (or failed). Starting an unstarted section from the
 * outline is a separate slice (docs/design/FILING_SPINE.md, F4).
 */

export type OutlineReadState =
  | 'ready'
  | 'sections-loading'
  | 'sections-error'
  | 'documents-loading'
  | 'documents-error'
  | 'no-document';

export function outlineReadState(args: {
  activeDocId: string | null;
  docsState: 'loading' | 'ready' | 'error';
  sectionsState: 'idle' | 'loading' | 'ready' | 'error';
}): OutlineReadState {
  const { activeDocId, docsState, sectionsState } = args;
  if (sectionsState === 'ready') return 'ready';
  if (sectionsState === 'error') return 'sections-error';
  if (sectionsState === 'loading' || activeDocId != null) return 'sections-loading';
  if (docsState === 'loading') return 'documents-loading';
  if (docsState === 'error') return 'documents-error';
  return 'no-document';
}

/** The node's title while it cannot be bound to a section. */
export function unboundNodeTitle(label: string, state: Exclude<OutlineReadState, 'ready'>): string {
  switch (state) {
    case 'no-document':
      return `${label} — no document is open, so there is nothing to edit here yet`;
    case 'documents-loading':
      return `${label} — this project’s documents are still being read`;
    case 'documents-error':
      return `${label} — this project’s documents could not be read`;
    default:
      return `${label} — this document’s sections have not been read yet`;
  }
}

/** What a click on such a node says. */
export function unboundNodeToast(node: { key: string; label: string }, state: Exclude<OutlineReadState, 'ready'>): string {
  switch (state) {
    case 'no-document':
      return (
        `No document is open, so ${node.key} ${node.label} has nothing to edit yet. ` +
        'Open a document from the list, or create one with New document.'
      );
    case 'documents-loading':
      return 'This project’s documents are still being read.';
    case 'documents-error':
      return 'This project’s documents could not be read, so nothing is known about whether this part is drafted.';
    case 'sections-error':
      return 'This document’s sections could not be read, so nothing is known about whether this part is drafted. Retry from the tree.';
    default:
      return 'This document’s sections are still being read.';
  }
}
