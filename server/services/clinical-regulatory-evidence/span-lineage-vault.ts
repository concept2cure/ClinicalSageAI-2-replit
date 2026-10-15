/**
 * A drafted figure the cited Vault version states, as span lineage (D2, Data
 * Room catalog S5c, 2026-10-15;
 * docs/evidence/D2-DATA-ROOM-CATALOG/2026-10-15-s5c-figure-lineage/).
 *
 * The `vault_document` provenance kind (migrations/20260908, amended in
 * place): usage 'derived', reference_id the vault.documents id,
 * payload_sha256 that version's content hash, and no asserter, because the
 * source supports the figure and nobody asserted it. The readers in
 * span-lineage.service.ts return it with its state and credit it in the
 * attribution summary only where no weaker claim covers the same characters.
 * This module holds its writer and its retirement. It depends on the service;
 * the service never imports it.
 */
import {
  assertSpan,
  defaultExec,
  hashSpanText,
  retireStaleSourceSpans,
  SpanLineageError,
  type DocumentRef,
  type Queryable,
} from './span-lineage.service';

/**
 * Retire the Vault figure spans (S5c) whose figure is no longer where they
 * say, for one content write. Both gates call it: an edit keeps a figure's
 * support only while the figure is exactly where it was supported.
 */
export async function retireStaleFigureSpans(
  orgId: number,
  ref: { documentTable: string; documentId: string },
  content: string,
  exec: Queryable = defaultExec,
): Promise<{ retired: number }> {
  const { retired } = await retireStaleSourceSpans(orgId, ref, content, exec, 'vault_document');
  return { retired };
}

/** A drafted figure the cited Vault version states, at its place in the stored content. */
export interface VaultFigureSpanInput {
  charStart: number;
  charEnd: number;
  /** The figure as stored at [charStart, charEnd). Hashed, never stored. */
  spanText: string;
  /** vault.documents id and the version's content hash the figure was found in. */
  vaultDocumentId: string;
  contentHash: string;
  /** Where in the source, e.g. "offset:1043"; null when the position was not confirmed. */
  sourceLocator: string | null;
}

/**
 * Replace a section's Vault figure spans (S5c): usage 'derived', the Vault
 * version as the reference. Each insert is admitted only for a version of a
 * project of this organization with that content hash; one that is not fails
 * the write closed (SpanLineageError), in the caller's transaction.
 */
export async function replaceVaultFigureSpans(
  orgId: number,
  ref: DocumentRef,
  spans: VaultFigureSpanInput[],
  opts: { createdBy?: string | null } = {},
  exec: Queryable = defaultExec,
): Promise<{ recorded: number }> {
  await exec.query(
    `UPDATE document_span_lineage SET deleted_at = NOW(), updated_at = NOW()
      WHERE organization_id = $1 AND document_table = $2 AND document_id = $3
        AND provenance_kind = 'vault_document' AND deleted_at IS NULL`,
    [orgId, ref.documentTable, ref.documentId],
  );
  // One row per (range, version): the same figure found twice is one claim.
  const unique = [...new Map(spans.map((sp) => [`${sp.charStart}:${sp.charEnd}:${sp.vaultDocumentId}`, sp])).values()];
  for (const sp of unique) {
    assertSpan(sp.charStart, sp.charEnd);
    const inserted = await exec.query(
      `INSERT INTO document_span_lineage (
         document_table, document_id, document_version, char_start, char_end, span_text_sha256,
         provenance_kind, source, reference_id, payload_sha256, source_locator, usage, organization_id, created_by
       )
       SELECT $1::text, $2::text, $3::text, $4::int, $5::int, $6::text, 'vault_document', 'vault_document',
              $7::text, $8::text, $9::text, 'derived', $10::int, $11::text
        WHERE EXISTS (
          SELECT 1 FROM vault.documents d
            JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $10::int
           WHERE d.id::text = $7::text AND d.content_hash::text = $8::text AND d.deleted_at IS NULL)
       RETURNING id`,
      [ref.documentTable, ref.documentId, ref.documentVersion ?? null, sp.charStart, sp.charEnd, hashSpanText(sp.spanText),
        sp.vaultDocumentId, sp.contentHash, sp.sourceLocator, orgId, opts.createdBy ?? null],
    );
    if (inserted.rows.length === 0) {
      throw new SpanLineageError(`figure lineage names a Vault version this organization does not hold: ${sp.vaultDocumentId}`);
    }
  }
  return { recorded: unique.length };
}
