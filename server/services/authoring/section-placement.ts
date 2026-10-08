/**
 * Where a new authoring section goes, and whether its code is already taken —
 * one step of POST /api/authoring/sections (createSection in
 * authoring-documents.ts), run on the create's transaction.
 *
 * QA 2026-10-08 (browser walk j4-authoring, docs/evidence/QA-2026-10-08/authoring/):
 *  - A section created after template-seeded sections was stored FIRST: the
 *    create used the LIST position from sectionInsertIndex as the stored index,
 *    and template sections are stored at their template ordering (100 … 700),
 *    so a new 2.5.8 was stored at 7 and assembled, exported and filed ahead of
 *    2.5.1. The index now comes from the stored indexes (sectionInsertSlot).
 *  - A code the document already had answered 500 LINEAGE_REQUIRED, because
 *    the unique index refused the INSERT and the create's catch reported every
 *    error as a lineage failure. It is now a 409 that names the code, decided
 *    before anything moves (and, for a concurrent create that loses at the
 *    index, recognised by isSectionCodeConflict).
 *
 * @module server/services/authoring/section-placement
 */
import { sectionInsertSlot } from '../../../shared/regulatory/section-code';
import type { Queryable } from './authoring-evidence';

/** The unique index that makes a section code one section per document. */
export const SECTION_CODE_UNIQUE_INDEX = 'authoring_sections_doc_code_tenant_uq';

/** The refusal for a code the document already has (409, field-level wording). */
export function sectionCodeExists(code: string): { kind: 'refused'; status: 409; code: string; error: string } {
  return {
    kind: 'refused',
    status: 409,
    code: 'SECTION_CODE_EXISTS',
    error: `Section ${code} already exists in this document. Open ${code} to edit it, or choose another code. Nothing was created.`,
  };
}

/** A unique violation on the section-code index (Postgres 23505). */
export function isSectionCodeConflict(err: unknown): boolean {
  const e = err as { code?: unknown; constraint?: unknown; message?: unknown } | null;
  if (!e || e.code !== '23505') return false;
  return e.constraint === SECTION_CODE_UNIQUE_INDEX || String(e.message ?? '').includes(SECTION_CODE_UNIQUE_INDEX);
}

type StoredRow = { id: string; code?: string | null; order_index?: number | string | null };

/**
 * Read the document's sections (locked: two concurrent creates reading the same
 * order would otherwise compute the same index), refuse a code it already has
 * — compared as the structure check compares (duplicateSectionCodes: trimmed,
 * case-folded) — and otherwise make room for the new section. An explicitly
 * supplied index is honoured as given.
 */
export async function placeNewSection(
  client: Queryable,
  args: { docId: unknown; tenantId: number; code: string; requestedOrderIndex: number | undefined },
): Promise<{ kind: 'duplicate' } | { kind: 'placed'; orderIndex: number }> {
  const { docId, tenantId, code, requestedOrderIndex } = args;
  const existing = await client.query(
    `SELECT id, code, order_index FROM authoring_sections
      WHERE doc_id = $1 AND tenant_id = $2
      ORDER BY order_index, created_at
      FOR UPDATE`,
    [docId, tenantId],
  );
  const rows = existing.rows as StoredRow[];
  const codeKey = code.trim().toUpperCase();
  if (rows.some((r) => String(r.code ?? '').trim().toUpperCase() === codeKey)) return { kind: 'duplicate' };
  if (requestedOrderIndex !== undefined) return { kind: 'placed', orderIndex: requestedOrderIndex };
  const slot = sectionInsertSlot(
    rows.map((r) => ({ id: String(r.id), code: String(r.code ?? ''), orderIndex: Number(r.order_index ?? 0) })),
    code,
  );
  // The row it goes in front of, and every row after it, move down by one.
  if (slot.shiftIds.length > 0) {
    await client.query(
      `UPDATE authoring_sections SET order_index = order_index + 1
        WHERE doc_id = $1 AND tenant_id = $2 AND id = ANY($3::uuid[])`,
      [docId, tenantId, slot.shiftIds],
    );
  }
  return { kind: 'placed', orderIndex: slot.orderIndex };
}
