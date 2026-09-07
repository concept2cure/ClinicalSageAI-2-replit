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

vi.mock('../../../db', () => ({
  db: {
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
  },
}));
vi.mock('../../auditService', () => ({
  default: { logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })) },
}));

import { upsertLeaf } from '../submission-service';

const CTX = { organizationId: 7, userId: 3 };
const SEQ = { id: 1, status: 'draft' };

const BOGUS_TABLE = 'coauthor_doccuments';

beforeEach(() => {
  selectChain.mockReset();
  executeChain.mockReset();
  insertValues.mockReset();
  updateSet.mockReset();
  insertValues.mockResolvedValue([{ id: 99 }]);
  updateSet.mockResolvedValue([{ id: 99 }]);
});

/** getSequence always runs first. */
function seedSequence() {
  selectChain.mockResolvedValueOnce([SEQ]);
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
const PLACEABLE: Array<{ table: string; seed: () => void }> = [
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
  // No tenancy verifier (UUID-keyed, program-scoped) — the resolver reports it
  // unresolved with an explanation. Placement itself stays legal.
  { table: 'vault_documents', seed: () => {} },
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

  for (const { table, seed } of PLACEABLE) {
    it(`accepts ${table} — a table the resolver branches on`, async () => {
      seedSequence();
      seed();
      await upsertLeaf(
        {
          sequenceId: 1,
          sectionCode: '2.5',
          title: 'Clinical Overview',
          documentTable: table,
          documentId: 55,
        } as any,
        CTX,
      );
      expect(insertValues).toHaveBeenCalledTimes(1);
      expect((insertValues.mock.calls[0][0] as Record<string, unknown>).documentTable).toBe(table);
    });
  }

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
