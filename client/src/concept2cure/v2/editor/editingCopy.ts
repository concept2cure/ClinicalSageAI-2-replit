/**
 * A filing's editing copy: the authoring document bound to it
 * (`authoring_documents.c2c_document_id`), one rule for every client reader.
 *
 * The server keeps one copy per filing when it creates one (resolveBinding in
 * server/services/authoring/authoring-documents.ts, through the alias map). The
 * database does not: the binding column has a plain index
 * (migrations/20260728_authoring_document_governed_binding.sql), so a
 * deployment without the alias map can hold several. More than one bound
 * document is said, never chosen between: the list is newest first, and the
 * newest is not the alias holder.
 *
 * Read by the editor's filing pane (FilingMarkets), the outline's start guard
 * (startOutlineSection) and Project home's module rows (ProjectDossier).
 */
export type EditingCopy<T> =
  | { kind: 'one'; doc: T }
  | { kind: 'none' }
  | { kind: 'several'; docs: T[] };

export function editingCopyOf<T>(
  docs: readonly T[], filingId: string, bindingOf: (d: T) => string | null | undefined,
): EditingCopy<T> {
  const bound = docs.filter((d) => bindingOf(d) === filingId);
  if (bound.length === 1) return { kind: 'one', doc: bound[0] };
  return bound.length === 0 ? { kind: 'none' } : { kind: 'several', docs: bound };
}
