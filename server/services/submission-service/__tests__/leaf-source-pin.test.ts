/**
 * A filed leaf must pin what it shipped.
 *
 * WHAT WAS MISSING. `submission_leaves` recorded WHERE a document lives
 * (`document_table` + `document_id`) and the MD5 of the leaf's RENDERED bytes
 * (`checksum`, which exists for the eCTD index). Neither describes the SOURCE
 * content, so "this leaf went to the agency — is the document behind it still
 * what went?" had no answer. `document_id` resolves to the document as it is
 * NOW; editing it after filing left every column on the leaf unchanged.
 *
 * WHAT IS LOCKED HERE:
 *   • filing with a document pointer records a SHA-256 of that document's
 *     content, and a timestamp for when the pin was taken;
 *   • the digest is the one an inspector can re-derive from the document row;
 *   • empty or absent content pins NULL, never sha256('') — a real constant
 *     that would look like a pin and would "match" every other empty document;
 *   • filing without a document pointer pins nothing rather than something;
 *   • an update re-pins, because an update can re-point the leaf at a different
 *     document and carrying the old pin forward would attest to content the
 *     leaf no longer references.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const CONTENT = '<h1>2.5 Clinical Overview</h1><p>Filed body text.</p>';
const EXPECTED = createHash('sha256').update(CONTENT, 'utf8').digest('hex');

const selectChain = vi.fn();
const insertValues = vi.fn();
const updateSet = vi.fn();

vi.mock('../../../db', () => ({
  db: {
    select: (..._a: unknown[]) => ({
      from: () => ({ where: () => ({ limit: () => selectChain() }) }),
    }),
    insert: () => ({ values: (v: unknown) => ({ returning: () => insertValues(v) }) }),
    update: () => ({
      set: (v: unknown) => ({ where: () => ({ returning: () => updateSet(v) }) }),
    }),
  },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn() } }));

import { upsertLeaf } from '../submission-service';

const CTX = { organizationId: 7, userId: 3 };
const SEQ = { id: 1, status: 'draft' };

beforeEach(() => {
  selectChain.mockReset();
  insertValues.mockReset();
  updateSet.mockReset();
  insertValues.mockResolvedValue([{ id: 99 }]);
  updateSet.mockResolvedValue([{ id: 99 }]);
});

/** getSequence runs first, then the document lookup when a pointer is given. */
function seedSelects(docRow?: Record<string, unknown> | null) {
  selectChain.mockResolvedValueOnce([SEQ]);
  if (docRow !== undefined) selectChain.mockResolvedValueOnce(docRow === null ? [] : [docRow]);
}

describe('upsertLeaf — source pin', () => {
  it('pins the SHA-256 of the document content it filed', async () => {
    seedSelects({ id: 55, content: CONTENT });
    await upsertLeaf(
      {
        sequenceId: 1,
        sectionCode: '2.5',
        title: 'Clinical Overview',
        documentTable: 'coauthor_documents',
        documentId: 55,
      } as any,
      CTX,
    );
    const written = insertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(written.documentContentSha256).toBe(EXPECTED);
    expect(written.documentPinnedAt).toBeInstanceOf(Date);
  });

  it('the pin is re-derivable by an inspector from the document row', async () => {
    seedSelects({ id: 55, content: CONTENT });
    await upsertLeaf(
      {
        sequenceId: 1,
        sectionCode: '2.5',
        title: 'Clinical Overview',
        documentTable: 'coauthor_documents',
        documentId: 55,
      } as any,
      CTX,
    );
    const written = insertValues.mock.calls[0][0] as Record<string, unknown>;
    // Independently recomputed here, exactly as a reviewer would.
    expect(written.documentContentSha256).toBe(
      createHash('sha256').update(CONTENT, 'utf8').digest('hex'),
    );
  });

  it('REGRESSION: a document edited after filing no longer matches its pin', async () => {
    seedSelects({ id: 55, content: CONTENT });
    await upsertLeaf(
      {
        sequenceId: 1,
        sectionCode: '2.5',
        title: 'Clinical Overview',
        documentTable: 'coauthor_documents',
        documentId: 55,
      } as any,
      CTX,
    );
    const pinned = (insertValues.mock.calls[0][0] as Record<string, unknown>)
      .documentContentSha256;
    // Someone edits the document after it was filed.
    const edited = CONTENT + '<p>Added after filing.</p>';
    const nowDigest = createHash('sha256').update(edited, 'utf8').digest('hex');
    // Previously nothing on the leaf could move; now the divergence is visible.
    expect(nowDigest).not.toBe(pinned);
  });

  it('pins NULL, not sha256 of empty, when the document has no content', async () => {
    seedSelects({ id: 55, content: '' });
    await upsertLeaf(
      {
        sequenceId: 1,
        sectionCode: '2.5',
        title: 'Placeholder',
        documentTable: 'coauthor_documents',
        documentId: 55,
      } as any,
      CTX,
    );
    const written = insertValues.mock.calls[0][0] as Record<string, unknown>;
    // sha256('') is a real constant that would read as a pin and would match
    // every other empty document forever.
    expect(written.documentContentSha256).toBeNull();
    expect(written.documentPinnedAt).toBeNull();
  });

  it('pins nothing when the leaf carries no document pointer', async () => {
    // The IND path files leaves exactly like this — section code and title only.
    seedSelects();
    await upsertLeaf(
      { sequenceId: 1, sectionCode: 'm1.12.4', title: 'IND Safety Report' } as any,
      CTX,
    );
    const written = insertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(written.documentContentSha256).toBeNull();
    expect(written.documentPinnedAt).toBeNull();
  });

  it('re-pins on update, so a re-pointed leaf cannot keep an old attestation', async () => {
    const NEXT = '<h1>2.5</h1><p>A different document entirely.</p>';
    seedSelects({ id: 77, content: NEXT });
    await upsertLeaf(
      {
        leafId: 99,
        sequenceId: 1,
        sectionCode: '2.5',
        title: 'Clinical Overview',
        documentTable: 'coauthor_documents',
        documentId: 77,
      } as any,
      CTX,
    );
    const written = updateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(written.documentContentSha256).toBe(
      createHash('sha256').update(NEXT, 'utf8').digest('hex'),
    );
    expect(written.documentContentSha256).not.toBe(EXPECTED);
  });

  it('still refuses a document that belongs to another organization', async () => {
    seedSelects(null);
    await expect(
      upsertLeaf(
        {
          sequenceId: 1,
          sectionCode: '2.5',
          title: 'Clinical Overview',
          documentTable: 'coauthor_documents',
          documentId: 55,
        } as any,
        CTX,
      ),
    ).rejects.toThrow(/not found for this organization/i);
    expect(insertValues).not.toHaveBeenCalled();
  });
});
