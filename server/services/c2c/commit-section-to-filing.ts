/**
 * Commit an authored section's text into the filing it belongs to.
 *
 * ── The split this closes ─────────────────────────────────────────────────────
 * The platform ships TWO section editors, one per store:
 *
 *   v2  DocumentAuthoring  → PATCH /api/authoring/sections/:id → authoring_sections
 *   mdx PathwayPanes       → PATCH /api/c2c/documents/:id/sections/:key
 *                                                      → c2c_document_sections
 *
 * c2c_documents is the system of record for a regulatory filing. It carries the
 * rule-pack outline, the readiness trigger, the version-snapshot trigger that
 * RAISES without an actor, and the span-lineage gate. authoring_sections is the
 * editing layer — comments, citations, e-signature, freeze, export.
 *
 * The editor most people use writes the SECOND one. So the store that decides
 * what the filing contains never saw the text anybody actually wrote: readiness
 * stayed where it was, the Part 11 version ledger recorded nothing, and the
 * governed outline reported those sections empty. A whole series of surface
 * fixes made the two agree about what they each knew; none of them changed the
 * fact that the system of record did not contain the record.
 *
 * ── What this does, and what it deliberately does not ─────────────────────────
 * On a section save, when the authored document is bound to a governed document
 * (authoring_documents.c2c_document_id, set at creation by
 * governed-document-binding.ts), the text is written through to the matching
 * governed section IN THE CALLER'S TRANSACTION. The Part 11 attribution GUC is
 * set first, so the snapshot trigger fires with a real actor and the superseded
 * version enters the immutable ledger properly attributed.
 *
 * This is not dual-write of two competing truths. It is the editing layer
 * committing its working copy into the repository: authoring_sections is where
 * you type, c2c_document_sections is what the filing IS.
 *
 * NOTHING IS BACKFILLED and nothing is created. A section that has no governed
 * counterpart is not invented here — the governed outline comes from the rule
 * pack, and inventing a section outside it would put text in a filing position
 * the pack does not define. Unbound documents behave exactly as they did.
 *
 * ── Correspondence is by section key ──────────────────────────────────────────
 * The two stores are bound at DOCUMENT level, not section level. The section
 * correspondence is `authoring_sections.code === c2c_document_sections.section_key`
 * — the same match the editor's own tree uses (findSectionForNode in
 * client/src/concept2cure/v2/useFilingOutline.ts). A null or empty code matches
 * nothing, deliberately: writing one section's text into another's slot is the
 * one outcome worse than not writing it at all.
 *
 * 2026-10-08 (QA walk 2, j4): and a section under an outline node the outline
 * does not subdivide is part of that node's document — the 2.5 Clinical
 * Overview's 2.5.1 … 2.5.7 file into the outline's single 2.5, as the placement
 * dialog already files that document at 2.5. The node receives the document's
 * sections under it, assembled; a section with no such node still reaches
 * nothing, and says so (./filing-section-target.ts).
 *
 * ── Content shape ─────────────────────────────────────────────────────────────
 * authoring_sections.content is TEXT; the governed column is jsonb. It is
 * written as `{"text": …}` — the same shape the mdx editor saves, which
 * sectionHasContentSql and sectionPlainText both already understand, so the
 * governed outline, the vault, readiness and span lineage all see it.
 */

import type { PoolClient } from 'pg';
import { filingSectionKey } from '../../../shared/regulatory/filing-section-key.js';
import { filingSectionText } from './filing-section-target.js';

/**
 * What the version ledger records when the save gave no reason.
 *
 * The snapshot trigger refuses an empty `app.reason`, so silence cannot be
 * stored as silence — the record has to say, in words, that no reason was
 * given. This says that and names how the change arrived, and it is
 * deliberately NOT phrased as something a person would write, so it cannot be
 * mistaken for one on the page an inspector reads.
 *
 * Exported so the assertion that this is what lands is made against the same
 * constant the writer uses, rather than a copy that can drift out of agreement
 * with it.
 */
export const REASON_NOT_STATED = 'Not stated — saved from the document editor';

export interface CommitSectionInput {
  /** The caller's OPEN transaction. Everything here joins that transaction. */
  client: PoolClient;
  /** authoring_sections.id being saved. */
  sectionId: string;
  /** The new text, exactly as stored on the authored section. */
  content: string;
  /** Verified actor id — the Part 11 attribution, never a header or a body field. */
  actorId: string;
  /** Verified tenant. */
  tenantId: number;
  /** Why, for the version ledger. Absent means the save did not state one, and
   *  that is what the ledger records — see REASON_NOT_STATED. */
  reason?: string;
  /**
   * What produced THIS content, when the caller genuinely knows — the same
   * signal `createRevision`'s `origin` already uses ('ana' when the save
   * incorporated an accepted AI draft). Absent/null means "not stated", which
   * stays the honest default: this field makes a POSITIVE claim only when the
   * caller has one, it never guesses 'human' for an ordinary save. See the
   * draft_source comment below for why the wrong guess in either direction is
   * worse than leaving it unstated.
   */
  draftSource?: string | null;
}

export type CommitSectionResult =
  /** Written through to the filing. `partOf`: the outline node holds several of
   *  the document's sections, assembled, and this one is part of it.
   *  `approvalWithdrawn` is present when the section was 'approved' and this
   *  text is not the text that was signed, so it no longer reads approved
   *  (spine F1). */
  | { committed: true; documentId: string; sectionKey: string; partOf?: string; approvalWithdrawn?: true }
  /** Not written, and why — never a silent no-op. */
  | { committed: false; reason: string };

/**
 * The one statement that writes an authored section's text into the filing.
 * Parameters: $1 governed document id, $2 section key, $3 text, $4 tenant,
 * $5 draft_source. Status rules are described at the call site.
 */
const WRITE_SECTION_SQL = `WITH prev AS (
       SELECT ds.id, ds.section_key, ds.status
         FROM c2c_document_sections ds
        WHERE ds.document_id = $1
          AND ds.section_key = $2
          AND EXISTS (SELECT 1 FROM c2c_documents d
                       WHERE d.id = ds.document_id AND d.org_id = $4)
        FOR UPDATE
     ), upd AS (
       UPDATE c2c_document_sections ds
          SET content      = jsonb_build_object('text', $3::text),
              draft_source = $5::text,
              status       = CASE
                               WHEN ds.status = 'todo' AND $3::text !~ '^\\s*$'
                                 THEN 'drafted'
                               WHEN ds.status = 'approved'
                                    AND (ds.content ->> 'text') IS DISTINCT FROM $3::text
                                 THEN CASE WHEN $3::text !~ '^\\s*$' THEN 'drafted' ELSE 'todo' END
                               ELSE ds.status
                             END,
              drafted_at   = now(),
              updated_at   = now()
         FROM prev
        WHERE ds.id = prev.id
          AND prev.status <> 'locked'
        RETURNING ds.id, ds.section_key, ds.status
     )
     SELECT upd.section_key, prev.status AS previous_status, upd.status
       FROM prev LEFT JOIN upd ON upd.id = prev.id`;

/**
 * Write `content` through to the governed section, if there is one.
 *
 * Throws only on a real database fault. Because the caller runs this inside the
 * transaction that also writes authoring_sections, a throw aborts BOTH — which
 * is the point: the filing and the working copy move together or neither does.
 */
export async function commitSectionToFiling(
  input: CommitSectionInput,
): Promise<CommitSectionResult> {
  const { client, sectionId, content, actorId, tenantId, reason, draftSource } = input;

  // ── Is there a governed store to commit into at all? ────────────────────────
  // This runs inside the caller's OPEN transaction, and in PostgreSQL a failed
  // statement aborts the whole transaction — there is no catching a 42P01 here
  // and carrying on. So absence is detected with a SELECT that cannot fail,
  // BEFORE anything is attempted.
  //
  // It matters because the phase-9 store is genuinely optional: the project
  // vault already fails closed on 42P01 for exactly these tables, and the
  // binding column arrives via a guarded ALTER that no-ops where either bundle
  // is missing. Without this probe every section save on such a database — the
  // primary editor's only write — would start returning 500.
  //
  // Note the distinction this preserves: the store being ABSENT is "not
  // applicable"; a write FAILING against a store that is present still aborts
  // the transaction and refuses the save. Those must not collapse into each
  // other, or the guarantee that the two stores move together is worthless.
  const capable = await client.query<{ ok: boolean }>(
    `SELECT (to_regclass('public.c2c_document_sections') IS NOT NULL
             AND to_regclass('public.c2c_documents') IS NOT NULL
             AND EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public'
                            AND table_name = 'authoring_documents'
                            AND column_name = 'c2c_document_id')) AS ok`,
  );
  if (!capable.rows[0]?.ok) {
    return {
      committed: false,
      reason: 'The governed document store is not provisioned here, so there is no filing to update.',
    };
  }

  // The authored section, its code, and the governed document its parent is
  // bound to — one query, tenant-scoped on the section AND the document so a
  // cross-tenant id cannot reach the join.
  const link = await client.query<{ code: string | null; c2c_document_id: string | null }>(
    `SELECT s.code, d.c2c_document_id
       FROM authoring_sections s
       JOIN authoring_documents d ON d.id = s.doc_id AND d.tenant_id = s.tenant_id
      WHERE s.id = $1 AND s.tenant_id = $2
      LIMIT 1`,
    [sectionId, tenantId],
  );
  if (link.rows.length === 0) {
    return { committed: false, reason: 'The authored section was not found in this organization.' };
  }

  const { code, c2c_document_id: documentId } = link.rows[0];
  if (!documentId) {
    return {
      committed: false,
      reason: 'This document is not bound to a filing, so there is no governed section to update.',
    };
  }
  if (typeof code !== 'string' || code.trim() === '') {
    // findSectionForNode refuses a null code for the same reason.
    return {
      committed: false,
      reason: 'This section has no code, so it cannot be matched to a section of the filing.',
    };
  }

  // Part 11 attribution for c2c_snapshot_section_version(), which RAISES
  // without it. set_config(..., true) rather than the utility statement with a
  // bind placeholder: that grammar has no parameter production, so it fails at
  // Parse with 42601 — the defect that made the governed save return 500 on
  // every request before #1188. tests/schema-contract/c2c-section-save fences
  // the whole class repo-wide.
  await client.query(`SELECT set_config('app.actor_id', $1, true)`, [String(actorId)]);
  /* THE REASON IS NEVER INVENTED.
   *
   * This defaulted to the literal 'authored in the document editor', and that
   * string went into `c2c_document_section_versions.reason` — the immutable
   * ledger an inspector reads to answer "why was this changed" — as though a
   * person had given it. Nobody had. Only AuthoringAiDraft sends a reason at
   * all; every ordinary save from the document editor sends none, so nearly
   * every row in the reason column of the filing's version ledger was a
   * sentence no human wrote and none of them was distinguishable from one that
   * was.
   *
   * It also defeated the gate built to catch exactly this. The snapshot
   * trigger RAISES on an empty app.reason — "Part 11 reason-for-change is
   * mandatory" (migrations/20260814g) — and a constant supplied here satisfies
   * that check on every save, so the mandatory-reason gate has never once
   * fired for the editor most people use. And the two Part 11 records
   * disagreed about the same act: `authoring_audit_trail.change_reason` was
   * NULL for a save whose version-ledger row stated a reason.
   *
   * The trigger requires a non-empty value, so the honest answer cannot be
   * empty — it has to SAY it was not stated. That is precisely the precedent
   * set for `author_kind` in this same trigger, which records 'unspecified'
   * rather than guessing 'human' (migrations/20260822), for the reason the
   * draft_source comment below states: a guess is indistinguishable from a
   * genuine assertion and cannot be audited back out.
   *
   * This does not make the editor stop needing a real reason-for-change
   * prompt. It stops the record claiming to have one. */
  const stated = reason && reason.trim() ? reason.trim() : null;
  await client.query(`SELECT set_config('app.reason', $1, true)`, [
    stated ?? REASON_NOT_STATED,
  ]);

  /* Which outline node the section files into (2026-10-08, QA walk 2, j4):
     its own key, or the undivided node it sits under. Org-scoped like the
     write below. */
  const outline = await client.query<{ section_key: string }>(
    `SELECT ds.section_key FROM c2c_document_sections ds
      WHERE ds.document_id = $1
        AND EXISTS (SELECT 1 FROM c2c_documents d WHERE d.id = ds.document_id AND d.org_id = $2)`,
    [documentId, tenantId],
  );
  const key = filingSectionKey(outline.rows.map((r) => String(r.section_key)), code);
  if (!key) return noSuchSection(code);
  const filed = await filingSectionText(client, { sectionId, tenantId, key, code, content });

  // Org-scoped through the document: c2c_document_sections has no org column of
  // its own, so the EXISTS is what keeps this write inside the caller's tenant.
  const updated = await client.query<{
    section_key: string | null;
    previous_status?: string | null;
    status?: string | null;
  }>(
    // draft_source defaults to NULL — "origin not stated" — and is never
    // GUESSED as 'human'. authoring_sections has no provenance column of its
    // own (db/migrations/20260725_authoring_document_loop_tables.sql), so this
    // function cannot independently know who authored the text — but its
    // CALLER sometimes does. The PATCH /sections/:sectionId handler tracks
    // accepted AI contributors for exactly this save (machineContributors,
    // revision-ledger.ts) and the AI-draft-accept route's whole content is by
    // definition an accepted draft; both now pass that knowledge through as
    // `draftSource` rather than it being invented here.
    //
    // The asymmetry is deliberate: a caller-supplied 'ana' is a genuine,
    // upstream-validated fact (machineContributors only admits ids present in
    // MACHINE_AUTHOR_IDS), so writing it is not a guess. An ABSENT draftSource
    // still resolves to NULL, never to a default 'human' — the exact
    // fabrication 20260822_section_version_author_kind_unspecified.sql closed
    // one layer up. This function only ever ADDS a true claim; it does not
    // invent the false one the old hardcoded NULL was silently protecting
    // against by never claiming anything at all.
    //
    // NULL still records that the origin was not captured, which stays true
    // for every caller that has not been taught to pass one.
    //
    // 2026-10-08: a node assembled from several sections has no single origin
    // — this save's is one section's — so it records NULL, never a claim about
    // text this save did not produce. $2 is the node the section files into
    // (filingSectionKey) and $3 that node's text (filingSectionText).
    //
    // STATUS FOLLOWS THE WORK (spine F1, 2026-10-08). The scaffold writes every
    // section 'todo' and nothing on this path ever moved it, so Module
    // completion, Recent drafts and c2c_documents.readiness read zero for work
    // done in the editor. In this same statement:
    //   - 'todo' with written text becomes 'drafted'. "Written" is the
    //     governed outline's own test (sectionHasContentSql: text that is not
    //     only whitespace), so status and has_content agree.
    //   - 'drafted' and 'review' are kept: a save never moves work backwards.
    //   - 'approved' means the approver's signature covers THIS text
    //     (approveBoundFilingSections in server/routes/authoring.router.ts).
    //     Text that is not the signed text is not approved, so the section
    //     becomes 'drafted' ('todo' if the new text is empty) and the
    //     withdrawal is recorded below. Keeping 'approved' would let readiness
    //     and the dispatch gate count text nobody signed.
    //   - 'locked' is not written at all; the result says so.
    // The CTE reads the row's status before the write (FOR UPDATE), so the
    // result can tell a locked section from a missing one and say when an
    // approval was withdrawn. Parameter order is unchanged.
    WRITE_SECTION_SQL,
    [documentId, key, filed.text, tenantId, filed.partOf ? null : draftSource ?? null],
  );

  return settleWrite(updated.rows, {
    client, code, documentId, sectionId, actorId, tenantId, stated, partOf: filed.partOf,
  });
}

/**
 * What the write did, and the record of a withdrawn approval when there was one.
 *
 * The statement returns no row when the filing has no such section, a row with
 * a null section_key when the section is locked (prev found it, upd did not
 * write it), and otherwise the written row with its status before and after.
 */
async function settleWrite(
  rows: Array<{ section_key: string | null; previous_status?: string | null; status?: string | null }>,
  ctx: {
    client: PoolClient;
    code: string;
    documentId: string;
    sectionId: string;
    actorId: string;
    tenantId: number;
    stated: string | null;
    /** The assembled node this section is part of, when it is one. */
    partOf?: string;
  },
): Promise<CommitSectionResult> {
  const { client, code, documentId, sectionId, actorId, tenantId, stated, partOf } = ctx;
  // rows.length, never rowCount: PGlite does not populate rowCount, and this
  // path is exercised against it.
  if (rows.length === 0) return noSuchSection(code);
  const row = rows[0];
  if (!row.section_key) {
    return {
      committed: false,
      reason: `Section "${partOf ?? code}" of the filing is locked, so its text was not changed. ` +
              'A locked section is not edited in place.',
    };
  }
  const part = partOf ? { partOf } : {};
  if (row.previous_status !== 'approved' || row.status === 'approved') {
    return { committed: true, documentId, sectionKey: row.section_key, ...part };
  }
  // The approval was a signed act, so withdrawing it is recorded too: one
  // governed-action row on this transaction, beside the version-ledger row the
  // snapshot trigger writes for the text. Imported here, not at module load,
  // as the other services that record governed actions do.
  const userId = Number(actorId);
  if (!Number.isInteger(userId)) {
    // The snapshot trigger casts the actor to integer too; fail the save
    // rather than withdraw an approval with no record of who did it.
    throw new Error('commitSectionToFiling: the actor id is not a user id');
  }
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  await recordGovernedAction(client, {
    orgId: tenantId,
    userId,
    command: 'transition',
    target: `section:${documentId}:${row.section_key}`,
    reason: stated,
    payload: {
      from: 'approved',
      to: row.status,
      approvalWithdrawn: true,
      why: 'The text changed after the approval signature; the signature does not cover the new text.',
      authoringSectionId: sectionId,
    },
    domain: 'documents',
    surface: 'authoring-save',
  });
  return { committed: true, documentId, sectionKey: row.section_key, ...part, approvalWithdrawn: true };
}

/** The refusal for a section with no place in the filing — unchanged in its words. */
function noSuchSection(code: string): CommitSectionResult {
  return {
    committed: false,
    reason: `The filing has no section "${code}", so there was nothing to update. ` +
            'The governed outline comes from the rule pack; a section outside it is not created here.',
  };
}
