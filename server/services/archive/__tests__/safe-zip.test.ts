/**
 * The one archive limit (SEC-17): what the directory declares, and what each
 * entry actually expands to, each held to the limits before anything inflates.
 * Limits are shrunk through the options so every fixture stays a few kilobytes.
 */
import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { crc32 } from 'node:zlib';
import JSZip from 'jszip';
import archiver from 'archiver';
import { ArchiveLimitError, assertZipWithinLimits, DEFAULT_ZIP_LIMITS, inspectZip } from '../safeZip';

const zipOf = (files: Record<string, string>) => {
  const z = new JSZip();
  for (const [name, body] of Object.entries(files)) z.file(name, body, { createFolders: false });
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};

/** The offset of the first central directory entry. */
const centralAt = (buf: Buffer) => buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));

const refusal = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

/** Where the first local header's name starts, and how long it is. */
const localNameOf = (buf: Buffer) => {
  const at = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])) + 30;
  return { at, length: buf.readUInt16LE(at - 4) };
};

/** A one-entry ZIP whose local header names the file otherwise (same length); its directory is untouched. */
function withLocalName(buf: Buffer, name: string): Buffer {
  const out = Buffer.from(buf);
  const local = localNameOf(out);
  if (local.length !== name.length) throw new Error('the fixture rewrites a name of the same length');
  out.write(name, local.at, 'latin1');
  return out;
}

/**
 * A one-entry ZIP with an Info-ZIP Unicode Path extra field on its directory
 * entry: version 1, the CRC-32 of the local name (JSZip ignores a field whose
 * CRC does not match), then the UTF-8 name.
 */
function withUnicodePath(buf: Buffer, name: string): Buffer {
  const cd = centralAt(buf);
  const nameLength = buf.readUInt16LE(cd + 28);
  const extraLength = buf.readUInt16LE(cd + 30);
  const local = localNameOf(buf);
  const head = Buffer.alloc(9);
  head.writeUInt16LE(0x7075, 0);
  head.writeUInt8(1, 4);
  head.writeUInt32LE(crc32(buf.subarray(local.at, local.at + local.length)), 5);
  const field = Buffer.concat([head, Buffer.from(name, 'utf8')]);
  field.writeUInt16LE(field.length - 4, 2);
  const at = cd + 46 + nameLength + extraLength;
  const out = Buffer.concat([buf.subarray(0, at), field, buf.subarray(at)]);
  out.writeUInt16LE(extraLength + field.length, cd + 30);
  const eocd = out.length - 22;
  out.writeUInt32LE(out.readUInt32LE(eocd + 12) + field.length, eocd + 12);
  return out;
}

describe('what the directory declares', () => {
  it('admits an ordinary archive and lists its entries without inflating them', async () => {
    const buf = await zipOf({ 'word/document.xml': '<w:document/>', 'docProps/app.xml': '<Properties/>' });
    const entries = await assertZipWithinLimits(buf);
    expect(entries.map((e) => e.name).sort()).toEqual(['docProps/app.xml', 'word/document.xml']);
    expect(entries.find((e) => e.name === 'word/document.xml')?.uncompressedSize).toBe('<w:document/>'.length);
  });

  it('refuses too many entries, before reading any of them', async () => {
    const buf = await zipOf(Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`f${i}.txt`, 'x'])));
    const err = await refusal(assertZipWithinLimits(buf, { maxEntries: 5 }));
    expect(err).toBeInstanceOf(ArchiveLimitError);
    expect((err as ArchiveLimitError).reason).toMatch(/holds 6 files, more than 5/);
  });

  it('refuses a declared total over the limit', async () => {
    const buf = await zipOf({ 'a.txt': 'abcdefghij'.repeat(200), 'b.txt': 'klmnopqrst'.repeat(200) });
    expect(((await refusal(assertZipWithinLimits(buf, { maxTotalUncompressedBytes: 3000 }))) as ArchiveLimitError).reason)
      .toMatch(/expands to more than 3000 bytes/);
  });

  it('refuses an entry above the size floor that claims more than the ratio', async () => {
    const buf = await zipOf({ 'word/document.xml': 'a'.repeat(64 * 1024) });
    expect(((await refusal(assertZipWithinLimits(buf, { ratioCheckAboveBytes: 1024 }))) as ArchiveLimitError).reason)
      .toMatch(/word\/document\.xml expands more than 100 times/);
    await expect(assertZipWithinLimits(buf)).resolves.toHaveLength(1); // under the default 1 MiB floor
  });

  it('refuses a name that is absolute, names a drive or climbs out', async () => {
    for (const name of ['../evil.txt', 'a/../../evil.txt', '/etc/passwd', 'C:/Windows/evil.dll', 'a\\..\\evil.txt']) {
      const err = await refusal(assertZipWithinLimits(await zipOf({ [name]: 'x' })));
      expect((err as ArchiveLimitError).reason, name).toMatch(/names a file outside itself/);
    }
  });

  it('refuses an encrypted entry and an unknown compression method', async () => {
    const buf = await zipOf({ 'a.txt': 'hello' });
    const encrypted = Buffer.from(buf);
    encrypted.writeUInt16LE(encrypted.readUInt16LE(centralAt(buf) + 8) | 0x1, centralAt(buf) + 8);
    expect(((await refusal(assertZipWithinLimits(encrypted))) as ArchiveLimitError).reason).toMatch(/encrypted/);
    const lzma = Buffer.from(buf);
    lzma.writeUInt16LE(14, centralAt(buf) + 10);
    expect(((await refusal(assertZipWithinLimits(lzma))) as ArchiveLimitError).reason).toMatch(/compression method 14/);
  });

  it('refuses what it cannot read, rather than passing it on', async () => {
    const buf = await zipOf({ 'a.txt': 'hello' });
    for (const bad of [Buffer.from('not an archive at all'), buf.subarray(0, buf.length - 8), Buffer.alloc(0)]) {
      expect(((await refusal(assertZipWithinLimits(bad))) as ArchiveLimitError).reason).toMatch(/directory could not be read/);
    }
  });
});

describe('what each entry actually expands to', () => {
  it('refuses an entry that inflates past the size its header declares', async () => {
    const buf = Buffer.from(await zipOf({ 'word/document.xml': 'a'.repeat(256 * 1024) }));
    // Lie in both headers: claim 100 bytes, so the declared ratio looks harmless.
    buf.writeUInt32LE(100, centralAt(buf) + 24);
    buf.writeUInt32LE(100, 22);
    const err = await refusal(assertZipWithinLimits(buf, { ratioCheckAboveBytes: 1024 }));
    expect((err as ArchiveLimitError).reason).toMatch(/word\/document\.xml expands to more than the size it declares/);
  });

  it('counts overlapping entries that share one compressed body, the non-recursive bomb', async () => {
    const one = await zipOf({ 'k.txt': 'b'.repeat(20 * 1024) });
    const cd = centralAt(one);
    const eocd = one.length - 22;
    const entry = one.subarray(cd, eocd);
    const copies = 8;
    // Every copy keeps the local header's name: one named otherwise is refused
    // for naming one file two ways (2026-11-02) before its size is counted.
    const names = Array.from({ length: copies }, () => Buffer.from(entry));
    const tail = Buffer.from(one.subarray(eocd));
    tail.writeUInt16LE(copies, 8);
    tail.writeUInt16LE(copies, 10);
    tail.writeUInt32LE(entry.length * copies, 12);
    const bomb = Buffer.concat([one.subarray(0, cd), ...names, tail]);
    expect(inspectZip(bomb)).toHaveLength(copies);
    const err = await refusal(assertZipWithinLimits(bomb, { maxTotalUncompressedBytes: 100 * 1024 }));
    expect((err as ArchiveLimitError).reason).toMatch(/expands to more than 102400 bytes/);
  });
});

describe('the name a reader uses is the name that was checked (2026-11-02)', () => {
  // JSZip, and mammoth and exceljs through it, take an entry's name from its
  // local header, and from a Unicode Path extra field when there is one.
  const jszipNames = async (buf: Buffer) => Object.keys((await JSZip.loadAsync(buf)).files);
  const reason = async (buf: Buffer) => ((await refusal(assertZipWithinLimits(buf))) as ArchiveLimitError | null)?.reason;

  it('refuses a local header naming a file outside the archive that its directory names harmlessly', async () => {
    const crafted = withLocalName(await zipOf({ ax: 'x' }), '/x');
    expect(await jszipNames(crafted)).toEqual(['/x']);
    expect(await reason(crafted)).toMatch(/names one file two ways, "ax" in its directory and "\/x" in the file's own header/);
  });

  it('refuses a local header naming another file, even a harmless one', async () => {
    const crafted = withLocalName(await zipOf({ 'a.pdf': 'x' }), 'b.pdf');
    expect(await jszipNames(crafted)).toEqual(['b.pdf']);
    expect(await reason(crafted)).toMatch(/"a\.pdf" in its directory and "b\.pdf"/);
  });

  it('admits headers that differ only in the backslash a Windows tool wrote in one of them', async () => {
    const buf = Buffer.from(await zipOf({ 'a/b.txt': 'x' }));
    buf.write('a\\b.txt', centralAt(buf) + 46, 'latin1');
    expect((await assertZipWithinLimits(buf)).map((e) => e.name)).toEqual(['a\\b.txt']);
  });

  it.each([
    ['outside the archive', '/x', /names a file outside itself \("\/x"\)/],
    ['naming another file', 'bx', /"ax" in its directory and "bx" in a Unicode path/],
  ])('refuses a Unicode path %s', async (_, unicodePath, why) => {
    const crafted = withUnicodePath(await zipOf({ ax: 'x' }), unicodePath);
    expect(await jszipNames(crafted)).toEqual([unicodePath]);
    expect(await reason(crafted)).toMatch(why);
  });

  it('refuses a Unicode path that climbs out, which JSZip would resolve and read', async () => {
    expect(await reason(withUnicodePath(await zipOf({ ax: 'x' }), '../ax'))).toMatch(/names a file outside itself \("\.\.\/ax"\)/);
  });

  it('admits a Unicode path that names the file as its directory does', async () => {
    const buf = withUnicodePath(await zipOf({ ax: 'x' }), 'ax');
    expect((await assertZipWithinLimits(buf)).map((e) => e.name)).toEqual(['ax']);
  });
});

describe('ZIP64', () => {
  it('reads a ZIP64 directory and its entries', async () => {
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise((r) => out.on('end', r));
    const z = archiver('zip', { forceZip64: true });
    z.pipe(out);
    z.append('first entry', { name: 'm1/us/cover.pdf' });
    z.append('second entry', { name: 'index.xml' });
    await z.finalize();
    await done;
    const entries = await assertZipWithinLimits(Buffer.concat(chunks));
    expect(entries.map((e) => [e.name, e.uncompressedSize])).toEqual([['m1/us/cover.pdf', 11], ['index.xml', 12]]);
  });
});

describe('the ZIP64 extra field', () => {
  it('reads an entry\'s sizes from it when the directory marks them 0xFFFFFFFF', async () => {
    const one = await zipOf({ 'a.txt': 'hello world' });
    const cd = centralAt(one);
    const eocd = one.length - 22;
    const entry = Buffer.from(one.subarray(cd, eocd));
    const nameLength = entry.readUInt16LE(28);
    const oldExtra = entry.readUInt16LE(30);
    const [comp, uncomp] = [entry.readUInt32LE(20), entry.readUInt32LE(24)];
    entry.writeUInt32LE(0xffffffff, 20);
    entry.writeUInt32LE(0xffffffff, 24);
    entry.writeUInt16LE(oldExtra + 20, 30);
    const zip64 = Buffer.alloc(20);
    zip64.writeUInt16LE(0x0001, 0);
    zip64.writeUInt16LE(16, 2);
    zip64.writeBigUInt64LE(BigInt(uncomp), 4); // uncompressed first, then compressed (APPNOTE 4.5.3)
    zip64.writeBigUInt64LE(BigInt(comp), 12);
    const tail = Buffer.from(one.subarray(eocd));
    tail.writeUInt32LE(tail.readUInt32LE(12) + 20, 12);
    const marked = Buffer.concat([one.subarray(0, cd), entry.subarray(0, 46 + nameLength), zip64, entry.subarray(46 + nameLength), tail]);
    const [read] = await assertZipWithinLimits(marked);
    expect(read).toMatchObject({ name: 'a.txt', uncompressedSize: 11, compressedSize: comp });
  });
});

describe('the defaults', () => {
  it('are the work order’s: 10,000 entries, 512 MiB, 100:1 above 1 MiB', () => {
    expect(DEFAULT_ZIP_LIMITS).toEqual({ maxEntries: 10_000, maxTotalUncompressedBytes: 512 * 1024 * 1024, ratioCheckAboveBytes: 1024 * 1024, maxRatio: 100 });
  });
});
