/**
 * A leaf may only point at a document table the assembler can actually resolve.
 *
 * WHAT WAS MISSING. `submission_leaves.document_table` is a polymorphic string
 * pointer, and nothing on the WRITE path constrained it: the route schema took
 * `z.string().max(64)`, `upsertLeaf` only recognised the tables it had a tenancy
 * verifier for and stored every other string verbatim, and AnA's
 * `place_into_sequence` forwarded a model-authored string. A misspelled or
 * invented table (`coauthor_doccuments`) was accepted, audited as LEAF_CREATED,
 * shown in the Builder, and reported dispatch-CLEAR by the deterministic
 * readiness validator — which only checked that a table string was PRESENT. The
 * gap surfaced at transmit, as `unsupported document_table "…" — no resolver
 * registered`, i.e. at the end of a filing window.
 *
 * WHAT IS LOCKED HERE:
 *   • upsertLeaf REFUSES (VALIDATION → 400) a document_table outside the
 *     placeable set, on create and on update, and writes nothing;
 *   • every table the read-side resolver branches on stays placeable — the
 *     allowlist must not be derived from a narrower/stale list, which would
 *     break IND-lifecycle filing (rendered_leaf_files) and device uploads
 *     (ctd_onboarding_documents).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectChain = vi.fn();
const executeChain = vi.fn();
const insertValues = vi.fn();
const updateSet = vi.fn();

const poolQuery = vi.fn();
vi.mock('../../../db', () => {
  const db: any = {
    select: () => {
      const tail = { limit: () => selectChain() };
      const afterWhere = { ...tail, orderBy: () => tail };
      return { from: () => ({ where: () => afterWhere }) };
    },
    execute: (...a: unknown[]) => executeChain(...a),
    insert: () => ({ values: (v: unknown) => ({ returning: () => insertValues(v) }) }),
    update: () => ({
      set: (v: unknown) => ({ where: () => ({ returning: () => updateSet(v) }) }),
    }),
  };
  // 2026-09-23 (W5/D7, round-2 skeptic): the leaf write now runs inside a
  // transaction holding the sequence row lock; the stub's lock read reports an
  // unlocked sequence (without consuming executeChain), and the write goes
  // through the same stubs as before.
  db.transaction = async (fn: (tx: any) => unknown) => fn({ ...db, execute: async () => ({ rows: [{ status: 'draft' }] }) });
  return { pool: { query: (...a: unknown[]) => poolQuery(...a) }, db };
});
vi.mock('../../auditService', () => ({
  default: { logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })) },
}));

import { upsertLeaf } from '../submission-service';

const CTX = { organizationId: 7, userId: 3 };
const SEQ = { id: 1, status: 'draft', submissionId: 21 };

const BOGUS_TABLE = 'coauthor_doccuments';

beforeEach(() => {
  selectChain.mockReset();
  executeChain.mockReset();
  poolQuery.mockReset();
  insertValues.mockReset();
  updateSet.mockReset();
  insertValues.mockResolvedValue([{ id: 99 }]);
  updateSet.mockResolvedValue([{ id: 99 }]);
});

/**
 * getSequence runs first, then the submission lookup that decides which
 * section-code vocabulary the leaf is judged against. An IND is a CTD
 * submission, so these tests keep exercising the CTD gate they were written
 * for.
 */
function seedSequence() {
  selectChain.mockResolvedValueOnce([SEQ]);
  selectChain.mockResolvedValueOnce([{ applicationType: 'ind' }]);
}

/** Run upsertLeaf and report the OUTCOME rather than throwing, so a failure
 *  message can name what was written instead of only "did not reject". */
async function outcomeOf(input: Record<string, unknown>) {
  return upsertLeaf(input as any, CTX).then(
    () => ({
      rejected: false as const,
      code: null as string | null,
      wroteTable:
        (insertValues.mock.calls[0]?.[0] as Record<string, unknown> | undefined)?.documentTable ??
        (updateSet.mock.calls[0]?.[0] as Record<string, unknown> | undefined)?.documentTable ??
        null,
    }),
    (err: any) => ({ rejected: true as const, code: err?.code ?? null, wroteTable: null }),
  );
}

/* Regression guard against over-tightening. Each of these is a table the
   read-side resolver branches on (or, for vault_documents, a documented
   polymorphic target it answers with an explained guard-stop). Narrowing the
   allowlist to a subset would make ind-lifecycle filing (rendered_leaf_files)
   and device uploads (ctd_onboarding_documents) throw on every placement. */
const VAULT_UUID = '9f2c1d40-0000-4000-8000-0000000000aa';

/** `ref` is the key space this table is addressed by — integer for most stores,
 *  uuid for the vault. Defaults to the integer so the existing entries are
 *  unchanged. */
const PLACEABLE: Array<{ table: string; ref?: Record<string, unknown>; seed: () => void }> = [
  {
    table: 'coauthor_documents',
    seed: () => selectChain.mockResolvedValueOnce([{ id: 55, content: 'x' }]),
  },
  {
    table: 'unified_documents',
    // parent row, then the latest workflow_document_versions row
    seed: () => {
      selectChain.mockResolvedValueOnce([{ id: 55 }]);
      selectChain.mockResolvedValueOnce([{ content: { body: 'x' } }]);
    },
  },
  {
    table: 'ctd_onboarding_documents',
    seed: () => selectChain.mockResolvedValueOnce([{ storagePath: '/nonexistent/upload.pdf' }]),
  },
  {
    table: 'rendered_leaf_files',
    seed: () => selectChain.mockResolvedValueOnce([{ sha256: 'abc' }]),
  },
  {
    table: 'c2c_document_sections',
    seed: () => executeChain.mockResolvedValueOnce({ rows: [{ content: { text: 'x' } }] }),
  },
  // UUID-KEYED. The vault names its documents by uuid, so this leaf carries
  // document_uuid and NOT document_id — upsertLeaf refuses the other shape, in
  // either direction, because a leaf that names no document resolves to
  // nothing while looking placed. Its verifier reads through the programme
  // (the authoritative owner of a vault document) and pins content_hash.
  {
    table: 'vault_documents',
    ref: { documentUuid: VAULT_UUID },
    seed: () => poolQuery.mockResolvedValueOnce({ rows: [{ content_hash: 'abc123' }] }),
  },
];

describe('upsertLeaf — placeable document_table allowlist', () => {
  it('refuses a document_table no resolver can materialize (create)', async () => {
    seedSequence();
    const outcome = await outcomeOf({
      sequenceId: 1,
      sectionCode: '2.5',
      title: 'Clinical Overview',
      documentTable: BOGUS_TABLE,
      documentId: 55,
    });
    expect(
      outcome,
      `upsertLeaf accepted an unresolvable document_table and persisted documentTable=${JSON.stringify(outcome.wroteTable)}`,
    ).toMatchObject({ rejected: true, code: 'VALIDATION' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('refuses a document_table no resolver can materialize (update)', async () => {
    seedSequence();
    const outcome = await outcomeOf({
      sequenceId: 1,
      leafId: 99,
      sectionCode: '2.5',
      title: 'Clinical Overview',
      documentTable: BOGUS_TABLE,
      documentId: 55,
    });
    expect(
      outcome,
      `upsertLeaf accepted an unresolvable document_table on update and persisted documentTable=${JSON.stringify(outcome.wroteTable)}`,
    ).toMatchObject({ rejected: true, code: 'VALIDATION' });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('names the allowed tables in the refusal so the caller can correct it', async () => {
    seedSequence();
    await expect(
      upsertLeaf(
        {
          sequenceId: 1,
          sectionCode: '2.5',
          title: 'Clinical Overview',
          documentTable: BOGUS_TABLE,
          documentId: 55,
        } as any,
        CTX,
      ),
    ).rejects.toThrow(/coauthor_documents/);
  });

  for (const { table, ref, seed } of PLACEABLE) {
    it(`accepts ${table} — a table the resolver branches on`, async () => {
      seedSequence();
      seed();
      await upsertLeaf(
        {
          sequenceId: 1,
          sectionCode: '2.5',
          title: 'Clinical Overview',
          documentTable: table,
          ...(ref ?? { documentId: 55 }),
        } as any,
        CTX,
      );
      expect(insertValues).toHaveBeenCalledTimes(1);
      expect((insertValues.mock.calls[0][0] as Record<string, unknown>).documentTable).toBe(table);
    });
  }

  /*
   * THE KEY SPACE MUST MATCH THE TABLE.
   *
   * `submission_leaves` addresses two of them: integer `document_id` for most
   * stores, uuid `document_uuid` for the vault
   * (migrations/20260917b_submission_leaf_document_uuid.sql). Both mismatches
   * produce the same bad outcome — a leaf that LOOKS placed, is audited as
   * placed, and resolves to nothing — so both are refused at this one choke
   * point rather than by a CHECK constraint, which would have to name tables
   * and would drift from leaf-document-tables.ts.
   */
  it('refuses a vault leaf addressed by an integer — a uuid-keyed store has no integer to name', async () => {
    seedSequence();
    const outcome = await outcomeOf({
      sequenceId: 1,
      sectionCode: '2.5',
      title: 'Clinical Overview',
      documentTable: 'vault_documents',
      documentId: 55,
    });
    expect(outcome).toMatchObject({ rejected: true, code: 'VALIDATION' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('refuses a vault leaf with no uuid at all — it would name no document', async () => {
    seedSequence();
    const outcome = await outcomeOf({
      sequenceId: 1,
      sectionCode: '2.5',
      title: 'Clinical Overview',
      documentTable: 'vault_documents',
    });
    expect(outcome).toMatchObject({ rejected: true, code: 'VALIDATION' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('refuses a uuid on an integer-keyed table — that store has no uuids', async () => {
    seedSequence();
    const outcome = await outcomeOf({
      sequenceId: 1,
      sectionCode: '2.5',
      title: 'Clinical Overview',
      documentTable: 'coauthor_documents',
      documentUuid: VAULT_UUID,
    });
    expect(outcome).toMatchObject({ rejected: true, code: 'VALIDATION' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('refuses a vault document belonging to another organization, and pins nothing', async () => {
    // The verifier reads through the programme with the caller's org. No row
    // means the document is not theirs — refused as FORBIDDEN, and no leaf is
    // written pointing at a document they cannot see.
    seedSequence();
    poolQuery.mockResolvedValueOnce({ rows: [] });
    const outcome = await outcomeOf({
      sequenceId: 1,
      sectionCode: '2.5',
      title: 'Clinical Overview',
      documentTable: 'vault_documents',
      documentUuid: VAULT_UUID,
    });
    expect(outcome).toMatchObject({ rejected: true, code: 'FORBIDDEN' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('pins the vault document content hash onto the leaf it writes', async () => {
    // The pin is what makes "is the document behind this filing still what went
    // to the agency?" answerable, and content_hash is exactly what the resolver
    // re-verifies before staging the bytes.
    seedSequence();
    poolQuery.mockResolvedValueOnce({ rows: [{ content_hash: 'abc123' }] });
    await upsertLeaf(
      {
        sequenceId: 1,
        sectionCode: '2.5',
        title: 'Clinical Overview',
        documentTable: 'vault_documents',
        documentUuid: VAULT_UUID,
      } as any,
      CTX,
    );
    const written = insertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(written.documentUuid).toBe(VAULT_UUID);
    expect(written.documentId).toBeNull();
    expect(written.documentContentSha256).toBe('abc123');
  });

  it('still accepts a leaf with no document pointer at all', async () => {
    seedSequence();
    await upsertLeaf(
      { sequenceId: 1, sectionCode: '2.5', title: 'Placeholder' } as any,
      CTX,
    );
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect((insertValues.mock.calls[0][0] as Record<string, unknown>).documentTable).toBeNull();
  });
});
