/**
 * ONE projection from a submission_leaves row to a CoreLeaf.
 *
 * 2026-09-23 (W5/D7, round-2 review). package-from-core and the device
 * technical-file assembler each built CoreLeaf by hand from the same row.
 * 6fed3840b added documentUuid to one of them; the other kept dropping it, so
 * every vault-backed leaf was staged and then left out of the MDR/IVDR
 * technical file. Both now read the row through coreLeafFromSubmissionLeaf.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { coreLeafFromSubmissionLeaf, type CoreLeaf } from '../core-to-packager';

/** A submission_leaves row as the Drizzle select returns it. */
const row = {
  id: 41,
  sequenceId: 9,
  sectionCode: 'II.6.1.g',
  title: 'Clinical Evaluation Report',
  granularity: 'leaf',
  lifecycleOp: 'new',
  documentTable: 'vault_documents',
  documentId: null,
  documentUuid: '33333333-3333-4333-8333-333333333333',
  documentType: 'cer',
  leafGuid: null,
  parentLeafId: null,
  checksum: null,
  documentContentSha256: 'a'.repeat(64),
  documentPinnedAt: null,
  organizationId: 7,
  createdBy: 3,
  createdAt: null,
  updatedAt: null,
  deletedAt: null,
};

describe('coreLeafFromSubmissionLeaf', () => {
  it('carries the uuid half of the document reference', () => {
    expect(coreLeafFromSubmissionLeaf(row).documentUuid).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('carries every CoreLeaf field and nothing else from the row', () => {
    const expected: Required<CoreLeaf> = {
      sectionCode: 'II.6.1.g',
      title: 'Clinical Evaluation Report',
      lifecycleOp: 'new',
      checksum: null,
      documentTable: 'vault_documents',
      documentId: null,
      documentUuid: '33333333-3333-4333-8333-333333333333',
      granularity: 'leaf',
      documentType: 'cer',
    };
    expect(coreLeafFromSubmissionLeaf(row)).toEqual(expected);
  });

  it('is the projection both submission_leaves packagers use — neither builds a CoreLeaf by hand', () => {
    const root = path.resolve(__dirname, '../../../..');
    for (const rel of [
      'server/services/ectd/package-from-core.ts',
      'server/services/pathway-engines/mdr-ivdr/assemble-technical-file-from-core.ts',
    ]) {
      const src = readFileSync(path.join(root, rel), 'utf8');
      expect(/\bcoreLeafFromSubmissionLeaf\b/.test(src), `${rel} reads its rows through coreLeafFromSubmissionLeaf`).toBe(true);
      // A hand-built projection of the row is how the two drifted.
      expect(/lifecycleOp:\s*l\.lifecycleOp/.test(src), `${rel} builds a CoreLeaf by hand`).toBe(false);
    }
  });
});
