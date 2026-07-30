import JSZip from 'jszip';
import crypto from 'crypto';

// MD5 is mandated by the ICH eCTD v3.2.2 spec for leaf checksums and
// index-md5.txt — it is a conformance identifier here, not a security control
// (bundle security integrity is SHA-256 at assemble + gateway send).
function md5Hex(content: Buffer): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Optional xmlbuilder2 import - gracefully degrades if not available
let create: any;
try {
  const xmlbuilder2 = await import('xmlbuilder2');
  create = xmlbuilder2.create;
} catch (e) {
  // xmlbuilder2 not available - will use fallback
  create = null;
}

export async function buildECTDZip(opts: {
  region: 'FDA' | 'EMA' | 'PMDA';
  sequence: string;
  operation: 'new' | 'replace' | 'append' | 'delete';
  leafs: { path: string; mediaType: string; content: Buffer }[];
}) {
  const zip = new JSZip();

  // Per-leaf MD5 checksums are required by eCTD v3.2.2 so regional
  // validators (FDA/EMA/PMDA) can verify each file against the backbone.
  const leafChecksums = opts.leafs.map(l => md5Hex(l.content));

  // If xmlbuilder2 not available, use simple XML template
  let xml: string;
  if (!create) {
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<ectd:index xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink">
${opts.leafs.map((l, i) => `  <ectd:leaf xlink:href="${escapeXmlAttr(l.path)}" operation="${opts.operation}" checksum="${leafChecksums[i]}" checksum-type="md5" application-version="1.0"/>`).join('\n')}
</ectd:index>`;
  } else {
    const root = {
      'ectd:leaf': opts.leafs.map((l, i) => ({
        '@xlink:href': l.path,
        '@operation': opts.operation,
        '@checksum': leafChecksums[i],
        '@checksum-type': 'md5',
        '@application-version': '1.0',
      })),
    };
    xml = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('ectd:index', {
        'xmlns:ectd': 'http://www.ich.org/ectd',
        'xmlns:xlink': 'http://www.w3.org/1999/xlink',
      })
      .ele(root)
      .up()
      .end({ prettyPrint: true });
  }
  
  zip.file('index.xml', xml);
  // eCTD v3.2.2: index-md5.txt at the sequence root holds the MD5 of
  // index.xml so validators can detect backbone tampering/corruption.
  zip.file('index-md5.txt', md5Hex(Buffer.from(xml, 'utf8')));
  for (const l of opts.leafs) {
    zip.file(l.path, l.content);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

