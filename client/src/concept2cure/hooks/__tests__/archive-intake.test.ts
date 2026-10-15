// @vitest-environment node
/**
 * A .zip opened in the browser for the Data Room: every bound is shown
 * refusing the archive or the entry built to cross it, by name, and nothing
 * refused is handed on for upload.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { ARCHIVE_LIMITS, archiveSummary, entryPathRefusal, expandArchive, isArchiveName } from '../archive-intake';

async function zipOf(entries: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(entries)) zip.file(name, body);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
const asFile = (bytes: Uint8Array, name = 'study.zip') => new File([bytes], name, { type: 'application/zip' });

/** Rewrite every header's uncompressed size: the local header (+22) and the central directory (+24). */
function claimSize(bytes: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(bytes);
  const view = new DataView(out.buffer);
  for (let i = 0; i + 4 <= out.length; i++) {
    const sig = view.getUint32(i, true);
    if (sig === 0x04034b50) view.setUint32(i + 22, size, true);
    if (sig === 0x02014b50) view.setUint32(i + 24, size, true);
  }
  return out;
}

/** Bytes that do not compress, so a size bound is reached before the ratio bound. */
function noise(n: number): Uint8Array {
  const out = new Uint8Array(n);
  let x = 2463534242;
  for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; out[i] = x & 0xff; }
  return out;
}

const AE_CSV = 'STUDYID,DOMAIN,USUBJID,AESEQ,AETERM\nX,AE,S-1,1,Headache\n';

describe('expandArchive', () => {
  it('returns each file by its own name, typed by its extension, and its path in the archive', async () => {
    const x = await expandArchive(asFile(await zipOf({ 'sdtm/ae.csv': AE_CSV, 'define.xml': '<ODM/>' })));
    expect(x.ok).toBe(true);
    if (!x.ok) return;
    expect(x.files.map((f) => [f.path, f.file.name, f.file.type])).toEqual([
      ['sdtm/ae.csv', 'ae.csv', 'text/csv'],
      ['define.xml', 'define.xml', 'application/xml'],
    ]);
    expect(await x.files[0].file.text()).toBe(AE_CSV);
    expect(archiveSummary('study.zip', x)).toBe('study.zip: 2 files sent as separate uploads. The archive itself is not kept.');
  });

  it('refuses a path that climbs out, an absolute path and an archive inside the archive; skips clutter', async () => {
    const x = await expandArchive(asFile(await zipOf({
      '../evil.csv': 'a', '/etc/passwd.txt': 'b', 'inner.zip': 'c', '__MACOSX/._ae.csv': 'd', 'sdtm/.DS_Store': 'e', 'ae.csv': AE_CSV,
    })));
    expect(x.ok).toBe(true);
    if (!x.ok) return;
    expect(x.files.map((f) => f.path)).toEqual(['ae.csv']);
    expect(x.refused).toEqual([
      { path: '../evil.csv', reason: 'its path climbs out of the archive (..)' },
      { path: '/etc/passwd.txt', reason: 'its path is absolute' },
      { path: 'inner.zip', reason: 'an archive inside an archive is not opened; upload it on its own' },
    ]);
    expect(x.skipped).toEqual(['__MACOSX/._ae.csv', 'sdtm/.DS_Store']);
  });

  it('refuses an entry compressed like a bomb, without inflating it', async () => {
    const x = await expandArchive(asFile(await zipOf({ 'zeros.csv': new Uint8Array(20 * 1024 * 1024) })));
    expect(x.ok && x.refused).toEqual([{ path: 'zeros.csv', reason: 'it is compressed more than 1000:1, which is how archive bombs are built' }]);
  });

  it('stops inflating at the cap when a header understates the size, and refuses a size that does not match', async () => {
    const limits = { ...ARCHIVE_LIMITS, maxEntryBytes: 1024 * 1024 };
    const lying = claimSize(await zipOf({ 'big.csv': 'x'.repeat(3 * 1024 * 1024) }), 500);
    const over = await expandArchive(asFile(lying), limits);
    expect(over.ok && over.refused).toEqual([{ path: 'big.csv', reason: 'it inflates past the 1 MB upload limit, more than its header says' }]);
    expect(over.ok && over.files).toEqual([]);
    const short = await expandArchive(asFile(claimSize(await zipOf({ 'ae.csv': 'y'.repeat(800) }), 500)), limits);
    expect(short.ok && short.refused).toEqual([{ path: 'ae.csv', reason: "its size does not match the archive's record of it" }]);
  });

  it('refuses the whole archive, before inflating anything, over the count, total or archive size', async () => {
    const three = asFile(await zipOf({ 'a.csv': 'a', 'b.csv': 'b', 'c.csv': 'c' }));
    expect(await expandArchive(three, { ...ARCHIVE_LIMITS, maxEntries: 2 }))
      .toEqual({ ok: false, reason: 'it holds 3 files; up to 2 are opened from one archive. Split it.' });
    const big = asFile(await zipOf({ 'a.csv': noise(3 * 1024 * 1024) }));
    expect(await expandArchive(big, { ...ARCHIVE_LIMITS, maxTotalBytes: 2 * 1024 * 1024 }))
      .toEqual({ ok: false, reason: 'its files come to 3 MB; up to 2 MB are opened from one archive. Split it.' });
    expect((await expandArchive(three, { ...ARCHIVE_LIMITS, maxArchiveBytes: 10 })).ok).toBe(false);
  });

  it('says when the bytes are not an archive', async () => {
    expect(await expandArchive(asFile(new TextEncoder().encode('not a zip')))).toEqual({ ok: false, reason: 'it could not be read as a .zip archive.' });
  });
});

describe('entry names', () => {
  it('judges the path as written', () => {
    expect(entryPathRefusal('sdtm/ae.xpt')).toBeNull();
    expect(entryPathRefusal('a\\..\\b.csv')).toMatch(/backslashes/);
    expect(entryPathRefusal('C:/x.csv')).toBe('its path is absolute');
    expect(entryPathRefusal('a/../../b.csv')).toMatch(/climbs out/);
    expect(isArchiveName('Study.ZIP')).toBe(true);
    expect(isArchiveName('ae.xpt')).toBe(false);
  });
});
