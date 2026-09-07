/**
 * Retention of the delivered official FDA eSTAR.
 *
 * Before this, the bytes CDRH would ingest were produced, hashed, base64'd into
 * an HTTP response and forgotten: `510k-estar-routes.ts` stored the export's
 * INPUTS, and `governedExportConsequence` hashed the output without keeping it
 * (docs/reports/device-market-readiness-2026-09-07.md §5, "Part 11 on the
 * governed export"). A sponsor asking "what exactly did we file" had the
 * platform's word for it and nothing else.
 *
 * Retention goes through `ingestVaultDocument` — the ONE implementation that
 * admits a document into the governed corpus — and never a second path. The
 * properties pinned here are the ones a Part 11 reviewer asks about:
 *
 *   - the retained bytes are content-addressed, so re-exporting identical
 *     bytes is idempotent and different bytes never overwrite the record;
 *   - a retention that did not happen FAILS the export rather than being
 *     reported beside a delivered file;
 *   - a program with no vault to retain into is said plainly, not silently
 *     skipped;
 *   - the bytes are declared platform-generated, so an unconfigured virus
 *     scanner cannot take the export down with it.
 */
import { createHash } from 'node:crypto';

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { ingestVaultDocument } = vi.hoisted(() => ({ ingestVaultDocument: vi.fn() }));
vi.mock('../../../vault/vault-ingest.service', () => ({ ingestVaultDocument }));

import {
  EstarRetentionError,
  retainOfficialEstar,
} from '../estar-artifact-retention';

/* A real PDF header, so nothing here depends on a fake magic-byte check. */
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0x20)]);
const PROGRAM = 'a2b4c6d8-0000-0000-0000-000000000001';

const input = {
  organizationId: 2,
  userId: 7,
  programUuid: PROGRAM,
  descriptorId: '510k-device',
  title: 'BX-204 — official FDA eSTAR',
  filename: 'BX-204_eSTAR.pdf',
  pdfBytes: PDF,
  ctdSection: 'm1.5',
};

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** What the real ingest returns: the hash IT computed over the bytes it stored. */
function ingested(bytes: Buffer = PDF, overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    document: { id: 'doc-1', contentHash: sha256(bytes), ...overrides },
    filing: { folderId: 'k510/administrative', placementStatus: 'suggested' },
  };
}

describe('retainOfficialEstar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admits the delivered bytes through the canonical vault ingest', async () => {
    ingestVaultDocument.mockResolvedValue(ingested());
    const report = await retainOfficialEstar(input);

    expect(report).toMatchObject({
      retained: true,
      documentId: 'doc-1',
      documentCode: 'eSTAR-510k-device',
      folderId: 'k510/administrative',
      placementStatus: 'suggested',
    });
    const args = ingestVaultDocument.mock.calls[0][0];
    expect(args).toMatchObject({
      organizationId: 2,
      userId: 7,
      programId: PROGRAM,
      documentCode: 'eSTAR-510k-device',
      mimeType: 'application/pdf',
      fileName: 'BX-204_eSTAR.pdf',
      ctdSection: 'm1.5',
      classification: 'CONFIDENTIAL',
      /* Not ingress — see middleware/uploadSafety's Origin note. */
      origin: 'platform-generated',
    });
    expect(args.fileBuffer).toBe(PDF);
    /* The classifier proposes a placement; nobody confirmed one here. */
    expect(args.folderId).toBeUndefined();
  });

  it('versions by content, so the same bytes are idempotent and new bytes are a new version', async () => {
    const other = Buffer.concat([PDF, Buffer.from('x')]);
    ingestVaultDocument
      .mockResolvedValueOnce(ingested(PDF))
      .mockResolvedValueOnce(ingested(other));
    const a = await retainOfficialEstar(input);
    const b = await retainOfficialEstar({ ...input, pdfBytes: other });

    const versionOf = (n: number) => ingestVaultDocument.mock.calls[n][0].version as string;
    expect(versionOf(0)).toMatch(/^sha256-[0-9a-f]{16}$/);
    expect(versionOf(0)).not.toBe(versionOf(1));
    /* The version is derived from the delivered hash the caller can verify. */
    expect(versionOf(0)).toBe(`sha256-${(a as { contentHash: string }).contentHash.slice(0, 16)}`);
    expect(b.retained).toBe(true);
  });

  it('says plainly when a program has no vault to retain into', async () => {
    const report = await retainOfficialEstar({ ...input, programUuid: null });
    expect(report).toEqual({
      retained: false,
      reason:
        'This export is anchored to a legacy 510(k) project, which has no program vault. ' +
        'The delivered file is audited by its SHA-256 but not retained.',
    });
    expect(ingestVaultDocument).not.toHaveBeenCalled();
  });

  it.each([
    ['storage refused the bytes', { ok: false, status: 500, code: 'STORAGE_WRITE_FAILED', message: 'The document could not be stored.' }],
    ['the program is not ours', { ok: false, status: 403, code: 'PROGRAM_FORBIDDEN', message: 'Program not found or not owned by your organization.' }],
    ['different bytes already hold this version', { ok: false, status: 409, code: 'DOCUMENT_CONFLICT', message: 'conflict' }],
  ])('THROWS when %s — an unretained submission artifact is not delivered', async (_label, result) => {
    ingestVaultDocument.mockResolvedValue(result);
    await expect(retainOfficialEstar(input)).rejects.toBeInstanceOf(EstarRetentionError);
    await expect(retainOfficialEstar(input)).rejects.toThrow(new RegExp(String(result.code)));
  });

  it('THROWS when the ingest itself fails, rather than reporting a retention', async () => {
    ingestVaultDocument.mockRejectedValue(new Error('pool exhausted'));
    await expect(retainOfficialEstar(input)).rejects.toThrow(/pool exhausted/);
  });

  it('THROWS when the stored hash is not the delivered hash', async () => {
    /* The row would then describe bytes other than the ones handed over — the
       failure mode the vault's own ingest calls "a record that lies". */
    ingestVaultDocument.mockResolvedValue(ingested(Buffer.from('some other file')));
    await expect(retainOfficialEstar(input)).rejects.toMatchObject({
      code: 'RETAINED_HASH_MISMATCH',
    });
  });
});
