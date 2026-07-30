/**
 * xmllint-backed XML validator. These exercise the REAL xmllint binary when it
 * is present (it is, in CI + this container); if it is ever absent the checks
 * degrade to ran:false rather than throwing.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  checkWellFormed,
  validateAgainstDtd,
  validateAgainstXsd,
  isXmllintAvailable,
} from '../xml-validator';

let available = false;
beforeAll(async () => {
  available = await isXmllintAvailable();
});

describe('checkWellFormed', () => {
  it('accepts well-formed XML', async () => {
    const r = await checkWellFormed('<?xml version="1.0"?><root><a/></root>');
    if (!r.ran) return; // xmllint absent — nothing to assert
    expect(r.valid).toBe(true);
  });

  it('rejects malformed XML with diagnostics', async () => {
    const r = await checkWellFormed('<root><a></root>');
    if (!r.ran) return;
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('validateAgainstDtd', () => {
  it('validates a document against an explicit DTD (and fails an invalid one)', async () => {
    if (!available) return;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-dtd-test-'));
    try {
      const dtd = path.join(dir, 'note.dtd');
      await fs.writeFile(dtd, '<!ELEMENT note (to)><!ELEMENT to (#PCDATA)>');

      const okXml = path.join(dir, 'ok.xml');
      await fs.writeFile(okXml, '<?xml version="1.0"?><note><to>x</to></note>');
      expect((await validateAgainstDtd(okXml, dtd)).valid).toBe(true);

      const badXml = path.join(dir, 'bad.xml');
      await fs.writeFile(badXml, '<?xml version="1.0"?><note><from>x</from></note>');
      const bad = await validateAgainstDtd(badXml, dtd);
      expect(bad.valid).toBe(false);
      expect(bad.errors.length).toBeGreaterThan(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('validateAgainstXsd', () => {
  it('validates against an XSD schema', async () => {
    if (!available) return;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-xsd-test-'));
    try {
      const xsd = path.join(dir, 's.xsd');
      await fs.writeFile(
        xsd,
        `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="n" type="xs:integer"/>
</xs:schema>`,
      );
      expect((await validateAgainstXsd('<n>42</n>', xsd)).valid).toBe(true);
      expect((await validateAgainstXsd('<n>notanint</n>', xsd)).valid).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
