/**
 * A zip entry whose name starts with '/' ends the reader's walk to its sequence
 * root. Until 2026-11-02 that walk never ended: lastIndexOf('/', -1) finds the
 * leading '/' again, so any upload holding such an entry hung the detector.
 * safeZip does not refuse the name. This case is in a file of its own because,
 * against the code that looped, it hangs the test worker.
 */
import { describe, expect, it } from 'vitest';
import { readFiledSequences } from '../filed-sequence-reader';
import { H, handSequenceFiles, zipOf } from './support/conformant-sequence';

describe('an absolute zip entry name', () => {
  it('belongs to no sequence, and the archive is read', async () => {
    const files = { ...handSequenceFiles({ ich: [{ headings: [...H.clinicalOverview], href: 'm2/a.pdf', id: 'a' }] }), '/evil.pdf': 'x', '/m2/b/c.pdf': 'y' };
    const out = await readFiledSequences(await zipOf(files));
    expect(out.sequences).toHaveLength(1);
    expect(out.sequences[0].refusals).toEqual([]);
    expect(out.sequences[0].unreferenced).toEqual([]);
  });
});
