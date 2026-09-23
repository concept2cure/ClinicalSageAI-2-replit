/**
 * PDF leaf security — the whole-file /Encrypt scan and the FDA-form rule.
 *
 * 2026-09-22 (W5/D7). Two defects on the sequence path to FDA:
 *
 *  1. The encryption test read a 512 KB head window and a 64 KB tail window,
 *     the tail only when it started past the head. A secured file of 513-575 KB
 *     had its trailer read by neither; an /Encrypt in an earlier incremental
 *     section of a large file, and any #-escaped spelling, were missed at every
 *     size. Each read as "not encrypted" and packaged.
 *  2. The official Form FDA 1571 and 3674 are FDA-secured, FDA asks for its
 *     forms to be submitted with their existing security settings, and the
 *     packager refused every /Encrypt — so the m1.1 transmittal form of every
 *     IND sequence was unpackageable.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { classifyPdfA, pdfNameOffsets, hasPdfHeader } from '../pdfa-detect';
import { assessLeafPdfSecurity } from '../leaf-pdf-security';
import { generateIndForm, templatePathFor } from '../../ind-forms/ind-form-fill-service';

const latin1 = (s: string) => Buffer.from(s, 'latin1');

/** A structurally ordinary PDF of `size` bytes whose final trailer is `trailer`. */
function pdfOfSize(size: number, trailer: string, middle = ''): Buffer {
  const head = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n2 0 obj<</Length 0>>stream\n';
  const tail = `\nendstream\nendobj\n${trailer}\n%%EOF\n`;
  const fill = size - head.length - tail.length - middle.length;
  const half = Math.floor(fill / 2);
  return Buffer.concat([latin1(head), Buffer.alloc(half, 0x41), latin1(middle), Buffer.alloc(fill - half, 0x41), latin1(tail)]);
}

describe('classifyPdfA — /Encrypt anywhere in the file', () => {
  it('finds a trailer /Encrypt in a 540 KB file (the band neither window read)', () => {
    const b = pdfOfSize(540 * 1024, 'trailer<</Size 3/Root 1 0 R/Encrypt 5 0 R>>');
    expect(b.length).toBe(540 * 1024);
    const r = classifyPdfA(b);
    expect(r.encrypted).toBe(true);
    expect(r.acceptableForEctd).toBe(false);
  });

  it('finds every size in the band, 513 through 575 KB', () => {
    for (const kb of [513, 530, 560, 575]) {
      expect(classifyPdfA(pdfOfSize(kb * 1024, 'trailer<</Root 1 0 R/Encrypt 5 0 R>>')).encrypted).toBe(true);
    }
  });

  it('finds a #-escaped /Encrypt, which every reader decodes to /Encrypt', () => {
    expect(classifyPdfA(latin1('%PDF-1.6\ntrailer<</Root 1 0 R/Encr#79pt 5 0 R>>\n%%EOF')).encrypted).toBe(true);
    expect(classifyPdfA(latin1('%PDF-1.6\ntrailer<</Root 1 0 R/#45#6E#63#72#79#70#74 5 0 R>>\n%%EOF')).encrypted).toBe(true);
  });

  it('finds an /Encrypt in an earlier incremental section in the middle of a 2 MB file', () => {
    const b = pdfOfSize(2 * 1024 * 1024, 'trailer<</Root 1 0 R/Prev 9>>', '\ntrailer<</Root 1 0 R/Encrypt 5 0 R>>\n');
    expect(classifyPdfA(b).encrypted).toBe(true);
  });

  it('does not read a different name as /Encrypt', () => {
    expect(classifyPdfA(latin1('%PDF-1.6\n<</EncryptMetadata false>>trailer<</Root 1 0 R>>')).encrypted).toBe(false);
    expect(classifyPdfA(latin1('%PDF-1.6\n<</EncryptX 1 0 R>>trailer<</Root 1 0 R>>')).encrypted).toBe(false);
    expect(classifyPdfA(latin1('%PDF-1.6\n<</Encr#7 1 0 R>>trailer<</Root 1 0 R>>')).encrypted).toBe(false);
    expect(classifyPdfA(latin1('%PDF-1.6\ntrailer<</Root 1 0 R>>\n%%EOF')).encrypted).toBe(false);
  });

  it('pdfNameOffsets points at each occurrence and hasPdfHeader tolerates a short preamble', () => {
    const b = latin1('%PDF-1.4\n/Encrypt 1 0 R /Encr#79pt 2 0 R /EncryptMetadata');
    expect(pdfNameOffsets(b, 'Encrypt')).toEqual([9, 24]);
    expect(hasPdfHeader(latin1('\n\n%PDF-1.7\n'))).toBe(true);
    expect(hasPdfHeader(latin1('not a pdf'))).toBe(false);
  });
});

const META = {
  sponsorName: 'Concept2Cure Biopharma, Inc.',
  sponsor: {
    name: 'Concept2Cure Biopharma, Inc.',
    address: '400 Kendall Square, Cambridge, MA 02142',
    contactPhone: '+1 617 555 0142',
    authorizedRepName: 'Dana Reyes',
    authorizedRepTitle: 'VP, Regulatory Affairs',
  },
  indNumber: '162045',
  serialNumber: '0000',
  drugName: 'C2C-1042 capsules',
  indication: 'Moderate to severe plaque psoriasis',
  indType: 'commercial',
  studyPhase: 'Phase 1',
};

describe('assessLeafPdfSecurity — an FDA form as FDA issued it', () => {
  it('the vendored 1571 and 3674 are FDA-secured (the premise)', () => {
    for (const id of ['FDA_1571', 'FDA_3674']) {
      expect(classifyPdfA(fs.readFileSync(templatePathFor(id))).encrypted).toBe(true);
    }
  });

  it('accepts a filled official 1571 and 3674 for FDA', async () => {
    for (const id of ['FDA_1571', 'FDA_3674']) {
      const filled = Buffer.from((await generateIndForm(id, META as never)).pdfBytes);
      const v = await assessLeafPdfSecurity(filled, 'fda');
      expect(v).toMatchObject({ verdict: 'fda-form-as-issued', formId: id });
    }
  });

  it('accepts the blank form as issued', async () => {
    const blank = fs.readFileSync(templatePathFor('FDA_1571'));
    expect((await assessLeafPdfSecurity(blank, 'fda')).verdict).toBe('fda-form-as-issued');
  });

  it('grants the FDA exception to FDA only', async () => {
    const filled = Buffer.from((await generateIndForm('FDA_1571', META as never)).pdfBytes);
    for (const region of ['ema', 'pmda', null]) {
      const v = await assessLeafPdfSecurity(filled, region);
      expect(v.verdict).toBe('secured');
    }
  });

  it('refuses a form whose FDA-issued bytes were altered', async () => {
    const filled = Buffer.from((await generateIndForm('FDA_1571', META as never)).pdfBytes);
    const tampered = Buffer.from(filled);
    tampered[2000] ^= 0x01;
    const v = await assessLeafPdfSecurity(tampered, 'fda');
    expect(v.verdict).toBe('secured');
    if (v.verdict === 'secured') expect(v.reason).toMatch(/not an FDA form as FDA issued it/);
  });

  it('refuses a form whose appended update points /Encrypt at a new dictionary', async () => {
    const filled = Buffer.from((await generateIndForm('FDA_1571', META as never)).pdfBytes);
    const v = await assessLeafPdfSecurity(
      Buffer.concat([filled, latin1('\ntrailer<</Root 1 0 R/Encrypt 999 0 R>>\n%%EOF\n')]),
      'fda',
    );
    expect(v.verdict).toBe('secured');
    if (v.verdict === 'secured') expect(v.reason).toMatch(/security was changed after FDA issued it/);
  });

  it('refuses a form whose appended update redefines FDA\'s encryption dictionary', async () => {
    const filled = Buffer.from((await generateIndForm('FDA_1571', META as never)).pdfBytes);
    const v = await assessLeafPdfSecurity(
      Buffer.concat([filled, latin1('\n47 0 obj<</Filter/Standard/V 4/R 4/U<00>/O<00>/P -4>>endobj\n')]),
      'fda',
    );
    expect(v.verdict).toBe('secured');
    if (v.verdict === 'secured') expect(v.reason).toMatch(/redefined/);
  });

  it('refuses an ordinary secured PDF for FDA, and says why', async () => {
    const v = await assessLeafPdfSecurity(latin1('%PDF-1.4\ntrailer<</Root 1 0 R/Encrypt 5 0 R>>\n%%EOF'), 'fda');
    expect(v.verdict).toBe('secured');
    if (v.verdict === 'secured') expect(v.reason).toMatch(/not an FDA form as FDA issued it/);
  });

  it('reports an unsecured PDF as unsecured', async () => {
    expect((await assessLeafPdfSecurity(latin1('%PDF-1.4\ntrailer<</Root 1 0 R>>\n%%EOF'), 'fda')).verdict).toBe('unsecured');
  });
});
