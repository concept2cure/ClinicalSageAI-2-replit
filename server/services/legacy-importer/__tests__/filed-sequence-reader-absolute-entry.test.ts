/**
 * A zip entry whose name starts with '/' ends the reader's walk to its sequence
 * root. Until 2026-11-02 that walk never ended: lastIndexOf('/', -1) finds the
 * leading '/' again. safeZip refuses the name in a zip's central directory,
 * but JSZip takes each name from the local header, so an upload whose two
 * headers disagreed carried it to the detector
 * (docs/evidence/MR-10/2026-11-01-filed-sequence-reader/zip-local-name-probe.txt).
 * This case is in a file of its own because, against the code that looped, it
 * hangs the test worker.
 */
import { describe, expect, it } from 'vitest';
import { readFiledSequenceArchive, readFiledSequences } from '../filed-sequence-reader';
import { H, handSequenceFiles, zipBufferOf, zipOf } from './support/conformant-sequence';

describe('an absolute zip entry name', () => {
  it('belongs to no sequence, and the archive is read', async () => {
    const files = { ...handSequenceFiles({ ich: [{ headings: [...H.clinicalOverview], href: 'm2/a.pdf', id: 'a' }] }), '/evil.pdf': 'x', '/m2/b/c.pdf': 'y' };
    const out = await readFiledSequences(await zipOf(files));
    expect(out.sequences).toHaveLength(1);
    expect(out.sequences[0].refusals).toEqual([]);
    expect(out.sequences[0].unreferenced).toEqual([]);
  });
});

describe('an upload that names /x only in a local header (2026-11-02)', () => {
  it('is refused by safeZip before the reader reads it', async () => {
    // "ax" is the archive's first entry, so its local header starts at byte 0 and its name at 30. Its directory
    // record keeps "ax"; its local header is rewritten to "/x", the name JSZip reads.
    const buf = await zipBufferOf({ ax: 'x', ...handSequenceFiles({ ich: [{ headings: [...H.clinicalOverview], href: 'm2/a.pdf', id: 'a' }] }) });
    expect(buf.toString('latin1', 30, 32)).toBe('ax');
    buf.write('/x', 30, 'latin1');
    await expect(readFiledSequenceArchive(buf)).rejects.toMatchObject({ code: 'ARCHIVE_LIMITS_EXCEEDED' });
  });
});
