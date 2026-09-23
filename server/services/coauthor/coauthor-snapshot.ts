/**
 * The filing copy of an authoring document: a coauthor_documents row taken
 * from it, which a submission leaf can point at.
 *
 * 2026-09-23 (W5/D7, round-3 review, repair 1). Two defects in
 * POST /api/coauthor/documents with a `sourceAuthoringDocId`:
 *
 *   1. It derived the copy's STATUS from the source (APPROVED -> approved,
 *      FROZEN -> finalized) but took its TEXT (and title) from the request
 *      body. Any org member who named an APPROVED document got back an
 *      `approved` row carrying whatever text they sent; a leaf pointed at it
 *      cleared transmit's "only approved documents" refusal. The status was
 *      honest about the source; the text it vouched for was not the source's.
 *   2. It could not be repeated. The copy is aliased under the source's uuid
 *      and c2c_document_aliases is UNIQUE (canonical_id, store), so placing a
 *      source a second time was refused — as a 500, because the conflict
 *      arrives wrapped — and DELETE leaves the alias behind, so it was refused
 *      after a delete too. A draft placed once could never be re-placed once
 *      approved, and the read-only refusal in coauthor-status-write.ts sent
 *      authors down exactly this path.
 *
 * The rule now: a source's copy IS the source. The server reads the source's
 * status and its saved sections — through the one assembler that already
 * turns sections into a document body server-side,
 * defaultAuthoringBridgeDeps().loadDocumentSnapshot in
 * services/ana/authoring-canonical-bridge.ts — and the request says only WHICH
 * document and where to file it (moduleNumber). A second placement of the same
 * source re-takes the SAME copy (same row, same alias), so the alias map's
 * one-copy-per-source invariant holds and a correction is reachable: a copy
 * whose source has moved on (draft -> approved), or whose text drifted, is
 * re-derived; a deleted copy is re-created under the id the alias map still
 * names.
 *
 * 2026-09-23 (W5/D7, round-3 review, repair 2). Repair 1 argued here that an
 * APPROVED or FROZEN source cannot change because services/authoring/
 * document-lock.ts refuses every section writer, so re-taking an approved copy
 * "yields the text that was approved, never new text". That was false:
 * POST /api/authoring/docs/:docId/apply-template rewrites and adds sections
 * without consulting the lock, and any org member may call it — so a member
 * could change an approved document's text and have it filed, or re-filed over
 * the existing copy, as 'approved'. The filing path no longer rests on every
 * section writer honouring the lock. A verdict copy (approved / finalized) is
 * written only when the source's saved sections and title are exactly what its
 * latest seal — the frozen_documents record the freeze and approval handlers
 * write, verified against its own content_hash — recorded. Otherwise the
 * placement is refused and nothing is written: SOURCE_NOT_SEALED (no seal, or
 * the pre-2026 approval stub that holds no sections), SOURCE_SEAL_INTEGRITY_FAILED
 * (the seal's bytes do not match its hash), SOURCE_ALTERED_SINCE_SEAL.
 *
 * Also in repair 2: a source is refused with 422 unless some section has
 * non-blank text — the rule the placement dialog already applies — since
 * headings alone always assembled to a non-empty string; and re-taking an
 * existing copy (updating it, or re-creating a deleted one) writes a
 * 'coauthor_document.retaken' audit event with the before/after sha256 in the
 * same transaction, so replacing an author's saved co-author edits, or
 * correcting an approved copy, is on the record.
 *
 * 2026-09-23 (W5/D7, co-author final pass). Four corrections:
 *   - The text filed is assembled ON the placement's transaction, after the
 *     source is locked, from the same section rows the rules below check
 *     (loadDocumentSnapshot now takes a queryable and returns its rows). It
 *     used to be assembled first, on the pool, while the check re-read the
 *     sections on the transaction: a section changed before the first read
 *     and restored before the second was filed with sealVersion and
 *     sealContentHash naming a seal that text is not in (the A-B-A).
 *   - The seal compare is of what is FILED: each section's code, title and
 *     text, in filed order, and the document title. It used to compare a set
 *     of (id, code, title, content, order_index), so a seal whose sections
 *     carry no id (seed 99's shape) was reported as "altered" when its text
 *     was the live text byte for byte, and ordering was not compared at all.
 *   - The pre-2026 approval stub (a record with no document and no sections)
 *     is recognised BEFORE the hash check. Its content_hash is the hash of the
 *     live sections, not of its own bytes, so it failed the integrity check
 *     and was reported as tampered; it is "not sealed".
 *   - Sections are ordered order_index, created_at, id — the editor's order —
 *     by the assembler (services/ana/authoring-canonical-bridge.ts) and by the
 *     router's seal queries alike.
 */
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../../db';
import { coauthorDocuments } from '../../../shared/schema';
import { queryableFromDrizzle, type DrizzleQueryable } from '../../db/drizzle-queryable.js';
import { aliasesFor, recordDocumentAlias } from '../c2c/document-alias-map.js';
import { defaultAuthoringBridgeDeps, type AuthoringSectionRow } from '../ana/authoring-canonical-bridge.js';
import { recordCoauthorDocumentEvent, type CoauthorAuditActor } from './coauthor-audit.js';

type CoauthorRow = typeof coauthorDocuments.$inferSelect;

/**
 * The copy's status, from the source's governed state. Claims nothing the
 * source has not earned:
 *   APPROVED  -> 'approved'   an APPROVER e-signature was applied
 *   FROZEN    -> 'finalized'  content snapshotted, hash-sealed and locked
 *   anything else -> 'draft'  which correctly fails completeness
 */
export function snapshotStatusFor(sourceStatus: string | null | undefined): 'approved' | 'finalized' | 'draft' {
  const state = String(sourceStatus ?? '').toUpperCase();
  return state === 'APPROVED' ? 'approved' : state === 'FROZEN' ? 'finalized' : 'draft';
}

type SnapshotRefusal = { ok: false; httpStatus: 404 | 409 | 422; body: Record<string, unknown> };

export type SnapshotOutcome =
  | { ok: true; created: boolean; document: CoauthorRow; aliasRecorded: boolean }
  | SnapshotRefusal;

const refuse = (httpStatus: 404 | 409 | 422, error: string, message: string): SnapshotRefusal => ({
  ok: false,
  httpStatus,
  body: { error, message },
});

const NOTHING = 'Nothing was filed or changed.';
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

type SectionRow = Pick<AuthoringSectionRow, 'code' | 'title' | 'content'> & Partial<AuthoringSectionRow>;

/** What a section contributes to the filed text: its heading (code, title) and its text. Its
 *  place is the position of the key in the sequence. (2026-09-23, co-author final pass: the
 *  row id is not filed and is no longer compared; a seal without ids is not "altered".) */
const filedKey = (s: SectionRow) => JSON.stringify([s.code ?? null, s.title ?? null, s.content ?? null]);

/** A section's created_at as the seal records it: milliseconds (JSON has no finer unit). */
const sealedMs = (x: { created_at?: unknown }): number => Date.parse(String(x.created_at ?? ''));

/** Compare two sealed sections on what the seal records of the editor's order:
 *  order_index, then created_at to the millisecond. 0 when the seal cannot tell them apart. */
function recordedOrder(a: SectionRow & { created_at?: unknown }, b: SectionRow & { created_at?: unknown }): number {
  const byIndex = Number(a.order_index) - Number(b.order_index);
  if (byIndex !== 0) return byIndex;
  const ta = sealedMs(a);
  const tb = sealedMs(b);
  return Number.isFinite(ta) && Number.isFinite(tb) ? ta - tb : 0;
}

/** Ties the recorded order cannot separate: by id where the seal records no created_at;
 *  otherwise the seal's own order (the sort is stable). */
function unrecordedTie(a: SectionRow & { created_at?: unknown }, b: SectionRow & { created_at?: unknown }): number {
  if (Number.isFinite(sealedMs(a)) && Number.isFinite(sealedMs(b))) return 0;
  if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
  if (a.id != null && b.id != null) return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  return 0;
}

/** The sealed sections in the order they are compared with the filed ones.
 *
 *  2026-09-23 (W5/D7, co-author final pass, repair): this re-sorted every seal
 *  by order_index, then created_at, then id. The seal records created_at only
 *  to the millisecond while the database orders by the microsecond, so for two
 *  tied sections created inside one millisecond the id tie-break could invert
 *  the order the real freeze sealed them in. Both directions were wrong: a
 *  document nobody touched was refused (409 SOURCE_ALTERED_SINCE_SEAL, skeptic
 *  probe verify-r4 Q1), and the same document with the two sections swapped
 *  after the seal was FILED as finalized, in an order nobody sealed
 *  (coauthorSnapshotSeal.test.ts). Now the sort is by what the seal records of
 *  the editor's order — order_index, then created_at to the millisecond — and
 *  rows it cannot separate keep the seal's own order (the sort is stable); id
 *  breaks a tie only where the seal records no created_at. A seal the router
 *  writes today is already in that order, so it is compared as written; a seal
 *  written before the router ordered ties by created_at, id (storage order) is
 *  put in the editor's order. A seal without order_index is compared in the
 *  order it lists.
 *  2026-09-23 (W5/D7, co-author close): used only for a seal that records no
 *  section ids; a seal with ids is compared by id (sameSectionsById). */
function sealedInFiledOrder(sections: SectionRow[]): SectionRow[] {
  const indexed = sections.every((x) => x.order_index != null && Number.isFinite(Number(x.order_index)));
  return indexed ? [...sections].sort((a, b) => recordedOrder(a, b) || unrecordedTie(a, b)) : sections;
}

/** True when every sealed and every live section carries an id, unique on each side. */
function sealRecordsIds(sealed: SectionRow[], live: SectionRow[]): boolean {
  const ids = (xs: SectionRow[]) => xs.map((x) => (x.id == null ? null : String(x.id)));
  const s = ids(sealed);
  const l = ids(live);
  return s.every((x) => x !== null) && l.every((x) => x !== null)
    && new Set(s).size === s.length && new Set(l).size === l.length;
}

/**
 * Section by section, by id: the same set of sections, each with the same
 * heading, text and order_index as sealed.
 *
 * 2026-09-23 (W5/D7, co-author close): the seal was re-sorted and compared by
 * position. Sections inserted in one transaction share created_at exactly, so
 * neither order_index nor created_at separates them; a legacy seal lists them
 * in storage order while the live assembler orders them by id, and an
 * untouched approved document was refused 409 SOURCE_ALTERED_SINCE_SEAL — a
 * false "altered" (skeptic verify-r4). Matching by id needs no order at all:
 * the filed order is the live order_index, created_at, id, and a section's
 * order_index is compared here while its created_at and id never change, so a
 * document whose sections all match files in exactly the order the sealed
 * sections would. An exchange of two sections' texts, headings or positions
 * changes a section's own values and is refused.
 */
function sameSectionsById(sealed: SectionRow[], live: SectionRow[]): boolean {
  if (sealed.length !== live.length) return false;
  const byId = new Map(sealed.map((x) => [String(x.id), x] as const));
  return live.every((x) => {
    const at = byId.get(String(x.id));
    return at !== undefined
      && filedKey(at) === filedKey(x)
      && Number(at.order_index) === Number(x.order_index);
  });
}

/** Position by position, for a seal that records no section ids (the shape seed 99 wrote). */
function sameSectionsInOrder(sealed: SectionRow[], live: SectionRow[]): boolean {
  const sealedKeys = sealedInFiledOrder(sealed).map(filedKey);
  const liveKeys = live.map(filedKey);
  return sealedKeys.length === liveKeys.length && sealedKeys.every((k, i) => k === liveKeys[i]);
}

type Seal = { version: string; contentHash: string };

/**
 * Hold a verdict copy to the source's latest seal. The seal is the record the
 * authoring router writes when it freezes or approves a document
 * (authoring.router.ts: POST /docs/:docId/freeze and the APPROVER auto-freeze):
 * frozen_content = {document, sections, ...}, content_hash = its sha256. The
 * live sections and title — the ones the assembler has just turned into the
 * copy's text — must file exactly as the sealed ones would: same headings, same
 * text, same order, same document title.
 */
async function checkAgainstSeal(
  q: DrizzleQueryable,
  args: { sourceId: string; organizationId: number; live: SectionRow[]; title: string; verdict: string },
): Promise<{ ok: true; seal: Seal } | SnapshotRefusal> {
  const r = await q.query<{ version: string; frozen_content: string; content_hash: string }>(
    `SELECT version, frozen_content, content_hash FROM frozen_documents
      WHERE document_id = $1 AND tenant_id = $2
      ORDER BY frozen_at DESC, id DESC LIMIT 1`,
    [args.sourceId, args.organizationId],
  );
  const notSealed = (): SnapshotRefusal =>
    refuse(
      409,
      'SOURCE_NOT_SEALED',
      `This document is marked ${args.verdict}, but there is no sealed record of the text that was ${args.verdict}, ` +
        `so a copy cannot be filed as ${args.verdict}. ${NOTHING}`,
    );
  const row = r.rows[0];
  if (!row) return notSealed();
  type SealBody = { document?: { title?: unknown } | null; sections?: unknown };
  let sealed: SealBody | null = null;
  try {
    const parsed: unknown = JSON.parse(String(row.frozen_content));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) sealed = parsed as SealBody;
  } catch {
    sealed = null;
  }
  /* 2026-09-23 (co-author final pass): the pre-2026 approval stub
     ({approvedBy, documentHash, timestamp}) holds no text, and its
     content_hash is the hash of the live sections — so it is "not sealed",
     decided before the hash check would call a legitimate legacy record
     tampered. */
  if (sealed && !('document' in sealed) && !('sections' in sealed)) return notSealed();
  if (sha256(String(row.frozen_content)) !== String(row.content_hash)) {
    return refuse(
      409,
      'SOURCE_SEAL_INTEGRITY_FAILED',
      `The sealed record of this document does not match its own hash, so what was ${args.verdict} cannot be ` +
        `established from it. ${NOTHING}`,
    );
  }
  if (!sealed || !Array.isArray(sealed.sections) || !sealed.document) return notSealed();
  const sealedSections = sealed.sections as SectionRow[];
  const sameSections = sealRecordsIds(sealedSections, args.live)
    ? sameSectionsById(sealedSections, args.live)
    : sameSectionsInOrder(sealedSections, args.live);
  const sameTitle = String(sealed.document.title ?? 'Untitled document') === args.title;
  if (!sameSections || !sameTitle) {
    return refuse(
      409,
      'SOURCE_ALTERED_SINCE_SEAL',
      `This document's saved sections or title are not the ones sealed when it was ${args.verdict}, so they ` +
        `cannot be filed as ${args.verdict}. ${NOTHING}`,
    );
  }
  return { ok: true, seal: { version: String(row.version), contentHash: String(row.content_hash) } };
}

/**
 * Take (or re-take) the filing copy of an authoring document, in this
 * organization. `moduleNumber` is where the author is filing it; it is set
 * when the copy is created (or re-created) and when the copy has none, and is
 * otherwise left as it is — the leaf records where each placement goes.
 */
export async function takeAuthoringSnapshot(args: {
  organizationId: number;
  sourceAuthoringDocId: string;
  moduleNumber: string | null;
  templateId: number | null;
  createdBy: string | null;
  /** Who is placing it; recorded when an existing copy is re-taken. */
  actor: CoauthorAuditActor;
}): Promise<SnapshotOutcome> {
  const { organizationId, moduleNumber, templateId, createdBy, actor } = args;
  const sourceId = String(args.sourceAuthoringDocId);

  const src = await pool.query<{ status: string | null }>(
    'SELECT status FROM authoring_documents WHERE id = $1 AND tenant_id = $2',
    [sourceId, organizationId],
  );
  if (src.rows.length === 0) {
    return refuse(
      404,
      'Source document not found',
      'The document this snapshot was to be taken from does not exist in this organization. Nothing was created.',
    );
  }
  const readState = String(src.rows[0].status ?? '').toUpperCase();
  const status = snapshotStatusFor(readState);

  return db.transaction(async (tx): Promise<SnapshotOutcome> => {
    const q = queryableFromDrizzle(tx);
    /* The source is locked for the rest of the placement, and must still be in
       the state its text was read under: a source frozen or approved between
       the read above and here could otherwise be filed with text read while
       it was still a draft. (2026-09-23, co-author final pass: the text is now
       read after this lock, so the check guards the status derived from the
       first read — a copy is never filed under a state the source has left.) */
    const locked = await q.query<{ status: string | null }>(
      'SELECT status FROM authoring_documents WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [sourceId, organizationId],
    );
    if (locked.rows.length === 0 || String(locked.rows[0].status ?? '').toUpperCase() !== readState) {
      return refuse(
        409,
        'SOURCE_CHANGED',
        'The document changed state while it was being placed. Place it again. Nothing was created.',
      );
    }

    /* 2026-09-23 (repair 2): the sections are read here, on the placement's
       transaction, for two rules. Some section must carry text — the rule
       AuthoringPlaceIntoFiling applies; this replaced a test of the assembled
       string, which headings alone always made non-empty. And a verdict copy
       is held to the source's seal (checkAgainstSeal).
       2026-09-23 (co-author final pass): ONE read. The canonical assembler
       runs here, on this transaction, and both rules check the rows it
       assembled the filed text from — so the text filed is the text checked. */
    const body = await defaultAuthoringBridgeDeps().loadDocumentSnapshot(sourceId, organizationId, q);
    if (!body) {
      return refuse(
        404,
        'Source document not found',
        'The document this snapshot was to be taken from does not exist in this organization. Nothing was created.',
      );
    }
    const live: SectionRow[] = body.sections ?? [];
    if (!live.some((sec) => String(sec.content ?? '').trim() !== '')) {
      return refuse(
        422,
        'SOURCE_HAS_NO_SAVED_CONTENT',
        'This document has no saved section text, so there is nothing to file. Nothing was created.',
      );
    }
    let seal: Seal | null = null;
    if (status !== 'draft') {
      const held = await checkAgainstSeal(q, { sourceId, organizationId, live, title: body.title, verdict: status });
      if (!held.ok) return held;
      seal = held.seal;
    }
    const provenance = {
      source: 'authoring-document',
      docId: sourceId,
      status: readState || 'UNKNOWN',
      ...(seal ? { sealVersion: seal.version, sealContentHash: seal.contentHash } : {}),
    };
    const retaken = (id: number, before: CoauthorRow | null) =>
      recordCoauthorDocumentEvent(q, {
        organizationId,
        documentId: id,
        eventType: 'coauthor_document.retaken',
        actor,
        reason: before
          ? 'filing copy re-taken from its source authoring document'
          : 'deleted filing copy re-created from its source authoring document',
        metadata: {
          sourceAuthoringDocId: sourceId,
          recreated: before === null,
          before: before
            ? { status: before.status, title: before.title, contentSha256: sha256(before.content ?? '') }
            : null,
          after: { status, title: body.title, contentSha256: sha256(body.content) },
          ...(seal ? { sealVersion: seal.version, sealContentHash: seal.contentHash } : {}),
        },
      });

    const derived = { title: body.title, content: body.content, status };
    const aliases = await aliasesFor(q, { organizationId, canonicalId: sourceId });
    const nativeId = aliases.available
      ? aliases.aliases.find((a) => a.store === 'coauthor_documents')?.nativeId
      : undefined;

    if (nativeId !== undefined) {
      const id = Number(nativeId);
      const [existing] = await tx
        .select()
        .from(coauthorDocuments)
        .where(and(eq(coauthorDocuments.id, id), eq(coauthorDocuments.organizationId, organizationId)))
        .limit(1)
        .for('update');
      if (existing) {
        const unchanged =
          existing.status === derived.status &&
          existing.content === derived.content &&
          existing.title === derived.title;
        if (unchanged) return { ok: true, created: false, document: existing, aliasRecorded: true };
        const [document] = await tx
          .update(coauthorDocuments)
          .set({
            ...derived,
            ...(existing.moduleNumber ? {} : { moduleNumber }),
            metadata: { ...((existing.metadata as Record<string, unknown> | null) ?? {}), ...provenance },
            updatedAt: new Date(),
          })
          .where(and(eq(coauthorDocuments.id, id), eq(coauthorDocuments.organizationId, organizationId)))
          .returning();
        await retaken(id, existing);
        return { ok: true, created: false, document, aliasRecorded: true };
      }
      /* The copy was deleted and its identity is still recorded (DELETE does
         not remove the alias). It is re-created under that id, so the alias
         map stays true — this row IS that document's copy — rather than
         forking the identity or refusing forever. */
      const taken = await q.query('SELECT 1 FROM coauthor_documents WHERE id = $1', [id]);
      if (taken.rows.length > 0) {
        return refuse(
          409,
          'DOCUMENT_ALIAS_CONFLICT',
          'This document is recorded as filed under a copy that is not this organization’s. Nothing was created.',
        );
      }
      const [document] = await tx
        .insert(coauthorDocuments)
        .values({ id, organizationId, ...derived, moduleNumber, templateId, createdBy, metadata: provenance })
        .returning();
      await retaken(id, null);
      return { ok: true, created: true, document, aliasRecorded: true };
    }

    const [document] = await tx
      .insert(coauthorDocuments)
      .values({ organizationId, ...derived, moduleNumber, templateId, createdBy, metadata: provenance })
      .returning();
    const alias = await recordDocumentAlias(q, {
      organizationId,
      canonicalId: sourceId,
      store: 'coauthor_documents',
      nativeId: String(document.id),
    });
    return {
      ok: true,
      created: true,
      document,
      aliasRecorded: !(!alias.recorded && alias.reason === 'relation_absent'),
    };
  });
}
