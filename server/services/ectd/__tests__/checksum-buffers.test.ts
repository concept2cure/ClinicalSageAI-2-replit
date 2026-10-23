import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { verifyChecksumBuffers, verifyChecksumManifest } from '../checksum-manifest';

const bytes = Buffer.from('synthetic supportive bytes');
const sha = createHash('sha256').update(bytes).digest('hex');
describe('the existing checksum verifier over captured package bytes', () => {
  it('checks the exact buffers, including stylesheets, and reports all three fault classes', () => {
    const result = verifyChecksumBuffers([{ fileName: 'root.dtd', content: bytes }, { fileName: 'style.xsl', content: Buffer.from('tampered') },
      { fileName: 'extra.dtd', content: bytes }], `${sha}  root.dtd\n${sha}  style.xsl\n${sha}  missing.dtd\n`);
    expect(result).toMatchObject({ verified: ['root.dtd'], missingFiles: ['missing.dtd'], unlistedFiles: ['extra.dtd'], ok: false });
    expect(result.mismatched).toEqual([{ fileName: 'style.xsl', expected: sha, actual: createHash('sha256').update('tampered').digest('hex') }]);
  });
  it('treats a missing manifest as unlisted files, and keeps the empty pre-vendoring result distinct', () => {
    expect(verifyChecksumBuffers([{ fileName: 'root.dtd', content: bytes }], '')).toMatchObject({ ok: false, unlistedFiles: ['root.dtd'] });
    expect(verifyChecksumBuffers([], '# no vendored files')).toMatchObject({ ok: true, verified: [] });
  });
  it('honors the existing extension filter', () => {
    expect(verifyChecksumBuffers([{ fileName: 'notes.txt', content: bytes }, { fileName: 'root.dtd', content: bytes }], `${sha}  root.dtd`, ['.dtd']))
      .toMatchObject({ ok: true, verified: ['root.dtd'], unlistedFiles: [] });
  });
  it('does not reread changed drop-point bytes; its filesystem wrapper uses the same result shape', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'checksum-capture-'));
    try {
      const manifest = `${sha}  root.dtd\n`;
      await fs.writeFile(path.join(dir, 'root.dtd'), bytes);
      await fs.writeFile(path.join(dir, 'checksums.txt'), manifest);
      const captured = [{ fileName: 'root.dtd', content: await fs.readFile(path.join(dir, 'root.dtd')) }];
      expect(await verifyChecksumManifest(dir)).toEqual(verifyChecksumBuffers(captured, manifest));
      await fs.writeFile(path.join(dir, 'root.dtd'), 'changed after capture');
      expect(verifyChecksumBuffers(captured, manifest).ok).toBe(true);
      expect((await verifyChecksumManifest(dir)).ok).toBe(false);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
});
