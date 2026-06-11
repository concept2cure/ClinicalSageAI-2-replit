/**
 * eCTD backbone checksum conformance (ICH eCTD v3.2.2).
 *
 * Every leaf element in index.xml must carry the MD5 of its referenced file
 * (checksum-type="md5"), and index-md5.txt at the sequence root must hold the
 * MD5 of index.xml itself — regional validators (FDA/EMA/PMDA) reject
 * sequences with missing or mismatched checksums.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import JSZip from 'jszip';
import { buildECTDZip } from '../server/src/services/ectd';

const md5 = (b: Buffer | string) => crypto.createHash('md5').update(b).digest('hex');

const leafs = [
  { path: 'm1/us/cover.pdf', mediaType: 'application/pdf', content: Buffer.from('%PDF-1.4 cover') },
  { path: 'm3/32-p/spec.pdf', mediaType: 'application/pdf', content: Buffer.from('%PDF-1.4 spec') },
];

describe('buildECTDZip checksum conformance', () => {
  it('writes per-leaf MD5 checksums with checksum-type="md5" into index.xml', async () => {
    const buf = await buildECTDZip({ region: 'FDA', sequence: '0001', operation: 'new', leafs });
    const zip = await JSZip.loadAsync(buf);
    const indexXml = await zip.file('index.xml')!.async('string');

    for (const leaf of leafs) {
      const expected = md5(leaf.content);
      expect(indexXml).toContain(`checksum="${expected}"`);
    }
    expect(indexXml).toContain('checksum-type="md5"');
    expect(indexXml).not.toContain('checksum=""');
  });

  it('writes index-md5.txt containing the MD5 of index.xml', async () => {
    const buf = await buildECTDZip({ region: 'FDA', sequence: '0001', operation: 'new', leafs });
    const zip = await JSZip.loadAsync(buf);
    const indexXml = await zip.file('index.xml')!.async('string');
    const indexMd5 = await zip.file('index-md5.txt')!.async('string');

    expect(indexMd5).toBe(md5(Buffer.from(indexXml, 'utf8')));
  });

  it('still packages every leaf at its declared path', async () => {
    const buf = await buildECTDZip({ region: 'FDA', sequence: '0001', operation: 'new', leafs });
    const zip = await JSZip.loadAsync(buf);
    for (const leaf of leafs) {
      const content = await zip.file(leaf.path)!.async('nodebuffer');
      expect(content.equals(leaf.content)).toBe(true);
    }
  });

  it('escapes XML-special characters in leaf hrefs', async () => {
    const tricky = [{
      path: 'm1/us/a&b "c".pdf',
      mediaType: 'application/pdf',
      content: Buffer.from('%PDF-1.4 tricky'),
    }];
    const buf = await buildECTDZip({ region: 'FDA', sequence: '0001', operation: 'new', leafs: tricky });
    const zip = await JSZip.loadAsync(buf);
    const indexXml = await zip.file('index.xml')!.async('string');
    // The raw & and " must not appear unescaped inside the href attribute.
    expect(indexXml).toContain('a&amp;b &quot;c&quot;.pdf');
  });
});
