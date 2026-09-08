/**
 * "New document" — reachable from the panels that need it, not only the toolbar.
 *
 * ── The circle this breaks ───────────────────────────────────────────────────
 * Open the document editor on a project with no documents and it renders two
 * empty states that point at each other:
 *
 *   the tree    "No documents here — No {status} documents in this project.
 *                Switch the status filter above."
 *   the canvas  "Select a document — Choose a document from the tree to open
 *                its sections."
 *
 * The tree is empty, so there is nothing to choose; the filter is already on
 * "all", so switching it changes nothing. Neither panel offers the one action
 * that resolves the state, and that action exists — "New document" sits in the
 * toolbar above, opening a dialog owned privately by `AuthoringCreateExport`
 * (`setDialog('doc')`), reachable from nowhere else.
 *
 * So the centrepiece surface of the product greets a new project with a dead
 * end, twice, next to a button that fixes it.
 *
 * ── Mechanism ────────────────────────────────────────────────────────────────
 * A DOM event, the same idiom as `./programAction.ts` and `c2c:open-collab`.
 * `AuthoringCreateExport` listens and opens its own dialog, so the dialog's
 * state stays where it belongs and the panels do not need it lifted or threaded
 * through them.
 */

/** Dispatched when a panel asks for the new-document dialog. */
export const NEW_DOCUMENT_EVENT = 'c2c:new-document';

/** The single label for this action across the authoring surface. */
export const NEW_DOCUMENT_LABEL = 'New document';

/**
 * Ask for the new-document dialog. Safe before the listener mounts and safe
 * with no DOM — it does nothing, which is the honest outcome when there is no
 * dialog to open.
 */
export function startNewDocument(): void {
  try {
    window.dispatchEvent(new CustomEvent(NEW_DOCUMENT_EVENT));
  } catch {
    /* No DOM (SSR or a test without jsdom). Nothing to open. */
  }
}

/** The `{ label, onAct }` shape `<EmptyState action>` takes. */
export function newDocumentAction(): { label: string; onAct: () => void } {
  return { label: NEW_DOCUMENT_LABEL, onAct: startNewDocument };
}
