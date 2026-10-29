/**
 * The file name a leaf ships under in a package, and the source key it carries.
 *
 * Moved verbatim out of leaf-source-resolver.ts (2026-10-30, CSR assembly
 * follow-up): the CSR assembler must link its report body to the names its
 * other files will ship under, and those names are made here. The resolver
 * imports and re-exports every function, so each existing leaf's name is
 * unchanged, byte for byte. Pure: no database, no storage.
 */

function safeName(s: string, max = 40): string {
  return (
    (s || 'leaf').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '') || 'leaf'
  );
}

/**
 * The shipped leaf file name: `<label>-<source key>.pdf`, within the eCTD
 * 64-character rule (FILENAME_PATTERN). The key is the unique part and is
 * kept whole; the label gives way. The label alone was capped at 40 and the
 * key never was, so `coauthor_documents:123` shipped a 68-character name that
 * the agency validator refuses and nothing on this path checked.
 */
export function leafFileName(label: string, key: string): string {
  const ext = '.pdf';
  const keyPart = leafFileKeyPart(key);
  const budget = 64 - ext.length - 1 - keyPart.length;
  const labelPart = budget >= 1 ? safeName(label, Math.min(40, budget)) : '';
  const name = labelPart ? `${labelPart}-${keyPart}${ext}` : `${keyPart}${ext}`;
  return name.slice(0, 64);
}

/** The unique, source-key part of a leaf file name (see leafFileName). */
function leafFileKeyPart(key: string): string {
  return key.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'leaf';
}

/**
 * Whether a file name was derived by leafFileName from this source key, under
 * ANY label — the label (module_number or title) can change after filing, the
 * key cannot. It is the document's identity in a filed leaf name.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic, second pass): package-from-core binds a
 * named withdrawal through this. It used to fall back to the section's only
 * filed leaf when the current derived name matched nothing, which withdrew a
 * different, still-current document whenever the named one was never filed in
 * that section or had already been withdrawn.
 */
export function leafFileCarriesKey(fileName: string, key: string): boolean {
  const keyPart = leafFileKeyPart(key);
  return fileName === `${keyPart}.pdf`.slice(0, 64) || fileName.endsWith(`-${keyPart}.pdf`);
}

/**
 * Stable key for a leaf's polymorphic document reference.
 *
 * The reference spans TWO key spaces: integer-keyed stores use `documentId`,
 * and uuid-keyed ones (vault.documents) use `documentUuid`. The uuid is the
 * unique part when present — without it every vault leaf collapses onto the key
 * `vault_documents:` and the first document resolved would be staged for all of
 * them, which is a wrong file in a submission rather than a missing one.
 */
export function leafSourceKey(
  documentTable: string | null | undefined,
  documentId: number | null | undefined,
  documentUuid?: string | null,
): string {
  if (documentUuid) return `${documentTable ?? ''}:${documentUuid}`;
  return `${documentTable ?? ''}:${documentId ?? ''}`;
}

/**
 * The name a `rendered_leaf_files` row ships under (leaf-source-resolver.ts
 * stages it as `leafFileName(row.fileName || 'rendered', key)`). A report that
 * links to another rendered file links by this name, or the link names a file
 * the package does not contain.
 */
export function renderedLeafPackageName(storedFileName: string | null | undefined, renderedLeafFileId: number): string {
  return leafFileName(storedFileName || 'rendered', leafSourceKey('rendered_leaf_files', renderedLeafFileId));
}
