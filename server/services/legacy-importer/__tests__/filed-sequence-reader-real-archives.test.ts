/**
 * The filed-sequence reader on what real archives hold, and on what an
 * uploaded archive could hold to mislead it. Each case is a finding of the
 * independent reviews of 2026-11-02 (docs/evidence/MR-10/2026-11-01-filed-sequence-
 * reader/README.md, "Review round" and "Second review").
 *
 * The cases above "a second review of the fixes" were run first against the
 * reader at 0835454a: 33 of 37 failed. Four passed there:
 *   - the size cap, which tests the new module directly;
 *   - the later-sequence refusal, a control;
 *   - `sequence_number_missing` and the wrong-backbone pointer, which existing
 *     code already handled but no test exercised.
 * The cases from "a second review" on were run first against 7e7fae33, and
 * "grouped-form paths" against 24694d13.
 */
import { describe, expect, it, vi } from 'vitest';
import { loadFiledStateBySubmission } from '../../ectd/prior-sequence-loader';
import { readFiledSequences, isComplete, type FiledSequence } from '../filed-sequence-reader';
import { BACKBONE_MAX_BYTES, decodeBackbone } from '../filed-sequence-xml';
import { H, filedStatePool, handSequenceFiles, md5, zipOf, type HandLeaf, type HandSequence } from './support/conformant-sequence';

type Files = Record<string, string | Buffer>;

const OV: HandLeaf = { headings: [...H.clinicalOverview], href: 'm2/2-5/clinical-overview.pdf', id: 'ov' };
const CSR: HandLeaf = { headings: [...H.efficacySafety], href: 'm5/5-3-5/csr.pdf', id: 'csr' };
const COVER: HandLeaf = { headings: [...H.coverLetters], href: '1-2/cover.pdf', id: 'cover' };
const BASE: HandSequence = { m1: [COVER], ich: [OV, CSR] };

const read = async (files: Files) => readFiledSequences(await zipOf(files));
const only = async (files: Files): Promise<FiledSequence> => (await read(files)).sequences[0];
const codes = (s: FiledSequence) => s.refusals.map((r) => r.code);

/**
 * Rewrite a sequence's backbones and keep every checksum that covers them
 * right: the regional backbone's in index.xml's pointer, and index.xml's in
 * index-md5.txt.
 */
function rewrite(files: Files, root: string, how: { regional?: (b: Buffer) => Buffer; index?: (b: Buffer) => Buffer }): Files {
  const out = { ...files };
  const asBuf = (v: string | Buffer) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : v);
  let index = asBuf(out[`${root}index.xml`]);
  if (how.regional) {
    const regional = how.regional(asBuf(out[`${root}m1/us/us-regional.xml`]));
    out[`${root}m1/us/us-regional.xml`] = regional;
    index = Buffer.from(index.toString('utf8').replace(/checksum="[0-9a-f]{32}"(?=[^>]*ID="leaf-m1-regional-backbone")/, `checksum="${md5(regional)}"`), 'utf8');
  }
  if (how.index) index = how.index(index);
  out[`${root}index.xml`] = index;
  out[`${root}index-md5.txt`] = md5(index);
  return out;
}
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const text = (f: (s: string) => string) => (b: Buffer) => Buffer.from(f(b.toString('utf8')), 'utf8');

describe('encodings real publishing tools write', () => {
  it('reads a backbone that starts with a UTF-8 byte-order mark, as .NET writes by default', async () => {
    const s = await only(rewrite(handSequenceFiles({ ...BASE, root: '0001/', sequenceNumber: '0001' }), '0001/', {
      regional: (b) => Buffer.concat([BOM, b]), index: (b) => Buffer.concat([BOM, b]),
    }));
    expect(s.refusals).toEqual([]);
    expect(s.leaves.map((l) => l.leafId).sort()).toEqual(['cover', 'csr', 'ov']);
    expect(s.sequence).toBe('0001');
  });

  it('decodes a backbone in the encoding it declares, so an accented title is recorded as written', async () => {
    const title = 'Lettre de présentation, réf. ïñ';
    const s = await only(rewrite(handSequenceFiles({ ...BASE, m1: [{ ...COVER, title }] }), '', {
      regional: (b) => Buffer.from(b.toString('utf8').replace('<?xml version="1.0" encoding="UTF-8"?>', '<?xml version="1.0" encoding="ISO-8859-1"?>'), 'latin1'),
    }));
    expect(s.refusals).toEqual([]);
    expect(s.leaves.find((l) => l.leafId === 'cover')?.title).toBe(title);
  });

  it('refuses a backbone whose bytes are not the UTF-8 it implies, rather than recording replacement characters', async () => {
    const s = await only(rewrite(handSequenceFiles({ ...BASE, root: '0000/' }), '0000/', {
      regional: (b) => Buffer.concat([b.subarray(0, b.indexOf('Acme')), Buffer.from([0xe9]), b.subarray(b.indexOf('Acme'))]),
    }));
    expect(codes(s)).toEqual(['backbone_encoding_unsupported']);
  });

  it('refuses a backbone over the size a backbone can have, before decoding it', () => {
    expect(decodeBackbone(Buffer.alloc(BACKBONE_MAX_BYTES + 1, 0x20))).toMatchObject({ code: 'backbone_too_large' });
  });

  it('reads backbones that rely on the DTD to fix the xlink, ectd and fda-regional prefixes', async () => {
    const strip = text((x) => x.replace(/\s+xmlns:(xlink|ectd|fda-regional)="[^"]*"/g, ''));
    const s = await only(rewrite(handSequenceFiles(BASE), '', { regional: strip, index: strip }));
    expect(s.refusals).toEqual([]);
    expect(s.leaves).toHaveLength(3);
  });
});

describe('the DOCTYPE check is linear and quote-aware', () => {
  it('answers within a second on a backbone of repeated <!DOCTYPE (it took 20 s for three of them)', async () => {
    const started = performance.now();
    const out = await read({ 'a/0000/index.xml': '<!DOCTYPE'.repeat(40000), 'a/0000/index-md5.txt': md5('<!DOCTYPE'.repeat(40000)) });
    expect(performance.now() - started).toBeLessThan(1500);
    expect(codes(out.sequences[0])).toEqual(['backbone_not_well_formed']);
  });

  it('refuses an internal subset after a ">" inside a quoted system literal', async () => {
    const s = await only(handSequenceFiles({ ...BASE, root: '0000/', indexPrologue: '\n<!DOCTYPE ectd:ectd SYSTEM "a>b" [<!ATTLIST leaf operation CDATA "new">]>' }));
    expect(codes(s)).toEqual(['backbone_declares_entities']);
  });
});

describe('a href into an earlier sequence: ICH file reuse', () => {
  const zero = handSequenceFiles({ ...BASE, root: '0000/' });
  const reuse = (href: string, extra: Partial<HandLeaf> = {}): HandLeaf => ({
    headings: [...H.clinicalOverview], href, id: 'ov1', omitFile: true, checksum: md5('%PDF-1.4 ov'), ...extra,
  });

  it('reads a leaf whose file is in an earlier sequence of the archive, verifying its checksum there', async () => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [reuse('../0000/m2/2-5/clinical-overview.pdf')] });
    const [, s1] = (await read({ ...zero, ...one })).sequences;
    expect(s1.refusals).toEqual([]);
    expect(s1.leaves[0]).toMatchObject({ href: '../0000/m2/2-5/clinical-overview.pdf', archivePath: '0000/m2/2-5/clinical-overview.pdf', md5: md5('%PDF-1.4 ov') });
    expect(isComplete(s1)).toBe(true);
  });

  it('reads one reused from the regional backbone too', async () => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', m1: [{ ...COVER, id: 'cov1', href: '../../../0000/m1/us/1-2/cover.pdf', omitFile: true, checksum: md5('%PDF-1.4 cover') }] });
    const [, s1] = (await read({ ...zero, ...one })).sequences;
    expect(s1.refusals).toEqual([]);
    expect(s1.leaves[0]).toMatchObject({ href: '../0000/m1/us/1-2/cover.pdf', archivePath: '0000/m1/us/1-2/cover.pdf' });
  });

  it('refuses a reused file whose bytes are not the ones the leaf checksums', async () => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [reuse('../0000/m2/2-5/clinical-overview.pdf', { checksum: md5('other') })] });
    const [, s1] = (await read({ ...zero, ...one })).sequences;
    expect(codes(s1)).toEqual(['leaf_checksum_mismatch']);
  });

  it('refuses a href into a later sequence', async () => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [{ ...CSR }] });
    const zeroReusingOne = handSequenceFiles({ root: '0000/', ich: [reuse('../0001/m5/5-3-5/csr.pdf', { checksum: md5('%PDF-1.4 csr') })] });
    const [s0] = (await read({ ...zeroReusingOne, ...one })).sequences;
    expect(codes(s0)).toEqual(['leaf_href_unsafe']);
  });

  it('leaves a file reused from a sequence the archive does not hold for the filed state to bind; the sequence is not complete until then', async () => {
    const s1 = await only(handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [reuse('../0000/m2/2-5/clinical-overview.pdf')] }));
    expect(s1.refusals).toEqual([]);
    expect(s1.outsideArchive).toEqual(['ov1']);
    expect(s1.leaves[0]).toMatchObject({ archivePath: '', md5: md5('%PDF-1.4 ov') });
    expect(isComplete(s1)).toBe(false);
  });

  it('checks an archive-root sequence\'s reuse against the number its regional backbone gives it', async () => {
    const at = (n: string) => only(handSequenceFiles({ sequenceNumber: n, ich: [reuse('../0000/m2/2-5/clinical-overview.pdf')] }));
    expect((await at('0001')).outsideArchive).toEqual(['ov1']);
    expect(codes(await at('0000'))).toEqual(['leaf_href_unsafe']);
  });

  it('refuses a href from an outer sequence into a sequence folder nested inside it', async () => {
    const nested = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [CSR] });
    const outer = handSequenceFiles({ sequenceNumber: '0002', ich: [{ ...CSR, id: 'csr2', href: '0001/m5/5-3-5/csr.pdf', omitFile: true }] });
    const out = await read({ ...nested, ...outer });
    expect(codes(out.sequences.find((s) => s.root === '')!)).toEqual(['leaf_href_unsafe']);
  });
});

describe('percent-encoded hrefs', () => {
  it('reads a href whose file name the publisher percent-encoded', async () => {
    const files = handSequenceFiles({ ich: [{ ...OV, href: 'm2/2-5/clinical%20overview.pdf', omitFile: true }] });
    const s = await only({ ...files, 'm2/2-5/clinical overview.pdf': '%PDF-1.4 ov' });
    expect(s.refusals).toEqual([]);
    expect(s.leaves[0]).toMatchObject({ fileName: 'clinical overview.pdf', archivePath: 'm2/2-5/clinical overview.pdf' });
  });

  it('still refuses traversal spelled in percent-encoding', async () => {
    const s = await only(handSequenceFiles({ ich: [{ ...OV, href: '%2e%2e/%2e%2e/x.pdf', omitFile: true }] }));
    expect(codes(s)).toEqual(['leaf_href_unsafe']);
  });
});

describe('modified-file pointers', () => {
  const zero = (root = '0000/') => handSequenceFiles({ ...BASE, root });
  const act = (operation: 'replace' | 'append' | 'delete', modifiedFile: string, extra: Partial<HandLeaf> = {}): HandLeaf =>
    ({ headings: [...H.clinicalOverview], href: 'm2/2-5/clinical-overview-v2.pdf', id: `${operation}-1`, operation, modifiedFile, ...extra });

  it('records a grouped-layout pointer in the form the fold binds, so the replaced leaf leaves the filed state', async () => {
    const one = handSequenceFiles({ root: 'app/0001/', sequenceNumber: '0001', ich: [act('replace', '../../app/0000/index.xml#ov')] });
    const out = await read({ ...zero('app/0000/'), ...one });
    const [s0, s1] = out.sequences;
    expect(s1.refusals).toEqual([]);
    expect(s1.leaves[0].modifiedFile).toBe('../0000/index.xml#ov');
    const state = await loadFiledStateBySubmission(filedStatePool([s0, s1].map((s) => ({ sequence_number: s.sequence!, leaf_manifest: s.leaves }))), { organizationId: 1, submissionId: 1 });
    expect(state.leaves.map((l) => l.fileName).sort()).toEqual(['clinical-overview-v2.pdf', 'cover.pdf', 'csr.pdf']);
  });

  it('refuses a pointer that climbs past its own application, or names another application', async () => {
    for (const pointer of ['../../0000/index.xml#ov', '../../other/0000/index.xml#ov']) {
      const one = handSequenceFiles({ root: 'app/0001/', sequenceNumber: '0001', ich: [act('replace', pointer)] });
      const [, s1] = (await read({ ...zero('app/0000/'), ...one })).sequences;
      expect(codes(s1), pointer).toEqual(['leaf_modified_file_unresolved']);
    }
  });

  it('refuses a pointer at a leaf already replaced, or at a withdrawal', async () => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [act('replace', '../0000/index.xml#ov'), act('delete', '../0000/index.xml#csr', { headings: [...H.efficacySafety] })] });
    const two = handSequenceFiles({ root: '0002/', sequenceNumber: '0002', ich: [
      act('replace', '../0000/index.xml#ov', { id: 'again', href: 'm2/2-5/v3.pdf' }),
      act('replace', '../0001/index.xml#delete-1', { id: 'of-a-delete', href: 'm2/2-5/v4.pdf' }),
    ] });
    const [, , s2] = (await read({ ...zero(), ...one, ...two })).sequences;
    expect(s2.refusals.map((r) => [r.code, r.leafId])).toEqual([
      ['leaf_modified_file_unresolved', 'again'], ['leaf_modified_file_unresolved', 'of-a-delete'],
    ]);
  });

  it('refuses a second leaf of one sequence replacing the leaf another already replaces', async () => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [act('replace', '../0000/index.xml#ov'), act('replace', '../0000/index.xml#ov', { id: 'twice', href: 'm2/2-5/v3.pdf' })] });
    const [, s1] = (await read({ ...zero(), ...one })).sequences;
    expect(s1.refusals.map((r) => [r.code, r.leafId])).toEqual([['leaf_modified_file_unresolved', 'twice']]);
  });

  it('refuses a pointer at its own sequence or a later one, wherever that sequence is', async () => {
    const atRoot = await only(handSequenceFiles({ sequenceNumber: '0001', ich: [act('replace', '../0001/index.xml#x')] }));
    expect(codes(atRoot)).toEqual(['leaf_modified_file_unresolved']);
    const forward = await only(handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [act('replace', '../0007/index.xml#x')] }));
    expect(codes(forward)).toEqual(['leaf_modified_file_unresolved']);
  });

  it('a withdrawal of a leaf the archive does not hold leaves the sequence not complete', async () => {
    const s1 = await only(handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [act('delete', '../0000/index.xml#ov')] }));
    expect(s1.refusals).toEqual([]);
    expect(s1.outsideArchive).toEqual(['delete-1']);
    expect(isComplete(s1)).toBe(false);
  });

  it('a withdrawal takes the withdrawn leaf\'s section, so the fold withdraws only that leaf', async () => {
    const zeroTwo = handSequenceFiles({ root: '0000/', ich: [OV, { headings: [...H.efficacySafety], href: 'm5/5-3-5/clinical-overview.pdf', id: 'other' }] });
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [act('delete', '../0000/index.xml#ov', { headings: [...H.efficacySafety] })] });
    const [, s1] = (await read({ ...zeroTwo, ...one })).sequences;
    expect(s1.leaves[0]).toMatchObject({ ctdSection: '2.5', fileName: 'clinical-overview.pdf', href: '../0000/index.xml#ov' });
  });

  it('refuses a pointer that names the right ID in the wrong backbone', async () => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [act('replace', '../0000/m1/us/us-regional.xml#ov')] });
    const [, s1] = (await read({ ...zero(), ...one })).sequences;
    expect(codes(s1)).toEqual(['leaf_modified_file_unresolved']);
    expect(s1.leaves).toEqual([]);
  });
});

describe('what the fold could not tell apart', () => {
  it('refuses two leaves of one sequence filed under one heading with one file name, rather than fold one away', async () => {
    const s = await only(handSequenceFiles({ ich: [
      { headings: [...H.drugSubstance], href: 'm3/3-2-s-4-1/specification.pdf', id: 'a' },
      { headings: [...H.drugSubstance], href: 'm3/3-2-s-4-2/specification.pdf', id: 'b', bytes: 'other bytes' },
    ] }));
    expect(s.refusals.map((r) => [r.code, r.leafId, r.path])).toEqual([
      ['leaf_identity_ambiguous', 'a', 'm3/3-2-s-4-1/specification.pdf'],
      ['leaf_identity_ambiguous', 'b', 'm3/3-2-s-4-2/specification.pdf'],
    ]);
    expect(s.leaves).toEqual([]);
  });
});

describe('the sequence itself', () => {
  it('refuses a number that is not four digits', async () => {
    expect(codes(await only(handSequenceFiles({ ...BASE, sequenceNumber: '1' })))).toEqual(['sequence_number_malformed']);
  });

  it('says so when nothing gives the sequence a number', async () => {
    const s = await only(handSequenceFiles({ ...BASE, noRegionalPointer: true }));
    expect(codes(s)).toEqual(['regional_backbone_unreferenced', 'sequence_number_missing']);
    expect(s.sequence).toBeNull();
  });

  it('reads no leaf from an index.xml its index-md5.txt does not vouch for, and calls nothing unreferenced', async () => {
    const s = await only(handSequenceFiles({ ...BASE, root: '0000/', indexMd5: md5('other') }));
    expect(codes(s)).toEqual(['index_md5_mismatch']);
    expect(s.leaves).toEqual([]);
    expect(s.unreferenced).toEqual([]);
  });

  it('reads a sequence folder not named with four digits when it holds index-md5.txt, numbered by its backbone', async () => {
    const s = await only(handSequenceFiles({ ...BASE, root: 'seq-1/', sequenceNumber: '0003' }));
    expect(s).toMatchObject({ root: 'seq-1/', sequence: '0003', refusals: [] });
  });

  it('takes the application from the <application> whose files the grouped backbone carries', async () => {
    const other = '<application application-containing-files="false"><application-information><application-number application-type="fdaat1">999999</application-number></application-information><submission-information><submission-id submission-type="fdast2">0007</submission-id><sequence-number submission-sub-type="fdasst1">0007</sequence-number></submission-information></application>';
    const s = await only(rewrite(handSequenceFiles({ ...BASE, root: '0000/' }), '0000/', { regional: text((x) => x.replace('<application-set>', `<application-set>${other}`)) }));
    expect(s.refusals).toEqual([]);
    expect(s.application).toMatchObject({ number: '123456', applicationType: 'fdaat4' });
    expect(s.sequence).toBe('0000');
  });

  it('reads an EU sequence\'s number and applicant from its envelope', async () => {
    const regional = `<?xml version="1.0" encoding="UTF-8"?>
<eu:eu-backbone xmlns:eu="http://europa.eu.int" xmlns:xlink="http://www.w3c.org/1999/xlink"><eu-envelope><envelope country="common"><applicant>Acme Pharma</applicant><procedure-tracking><number>EMEA/H/C/001234</number></procedure-tracking><sequence>0000</sequence></envelope></eu-envelope>
<m1-eu><m1-0-cover><specific country="common"><leaf operation="new" checksum="${md5('cover')}" checksum-type="md5" xlink:href="10-cover/common/cover.pdf" ID="c"><title>Cover</title></leaf></specific></m1-0-cover></m1-eu></eu:eu-backbone>`;
    const index = `<?xml version="1.0" encoding="UTF-8"?><ectd:ectd xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3c.org/1999/xlink"><m1-administrative-information-and-prescribing-information><leaf operation="new" checksum="${md5(regional)}" checksum-type="md5" xlink:href="m1/eu/eu-regional.xml" ID="p"><title>M1</title></leaf></m1-administrative-information-and-prescribing-information></ectd:ectd>`;
    const s = await only({ 'index.xml': index, 'index-md5.txt': md5(index), 'm1/eu/eu-regional.xml': regional, 'm1/eu/10-cover/common/cover.pdf': 'cover' });
    expect(s).toMatchObject({ sequence: '0000', region: 'ema', refusals: [] });
    expect(s.application).toMatchObject({ applicant: 'Acme Pharma', number: 'EMEA/H/C/001234' });
    expect(s.leaves[0]).toMatchObject({ ctdSection: '1.0', fileName: 'cover.pdf' });
  });
});

describe('the ICH tree and the nesting it allows', () => {
  it.each([['m2-8-other'], ['m3-9-other'], ['m5-9-other']])('refuses a leaf under <%s>, a section no ICH heading has', async (heading) => {
    const top = { m2: 'm2-common-technical-document-summaries', m3: 'm3-quality', m5: 'm5-clinical-study-reports' }[heading.slice(0, 2)]!;
    const s = await only(handSequenceFiles({ ich: [{ headings: [top, heading], href: 'm/x.pdf', id: 'x' }] }));
    expect(codes(s)).toEqual(['leaf_heading_unmapped']);
  });

  it('refuses a leaf nested deeper than any backbone nests, without walking all of it', async () => {
    const s = await only(handSequenceFiles({ ich: [{ headings: [...H.clinicalOverview, ...Array(40).fill('node-extension')], href: 'm2/x.pdf', id: 'deep' }] }));
    expect(s.refusals.map((r) => [r.code, r.leafId, r.path])).toEqual([['leaf_heading_unmapped', 'deep', 'm2/x.pdf']]);
  });
});

describe('every file is inflated and hashed once', () => {
  it('reads a file once however many leaves name it', async () => {
    const leaves = Array.from({ length: 40 }, (_, i): HandLeaf => ({ headings: [...H.efficacySafety], href: 'm5/5-3-5/csr.pdf', id: `l${i}`, checksum: md5('%PDF-1.4 l0'), bytes: '%PDF-1.4 l0' }));
    const zip = await zipOf(handSequenceFiles({ ich: leaves }));
    const inflate = vi.spyOn(zip.file('m5/5-3-5/csr.pdf')!, 'async');
    await readFiledSequences(zip);
    expect(inflate).toHaveBeenCalledTimes(1);
  });
});

describe('refusals name the file', () => {
  it('names the file of a leaf refused for its heading, its ID, its operation or its pointer, and counts it as referenced', async () => {
    const s = await only(handSequenceFiles({ ich: [
      { headings: ['m3-quality', 'appendix-stuff'], href: 'm3/a.pdf', id: 'h' },
      { headings: [...H.efficacySafety], href: 'm5/b.pdf', id: '' },
      { headings: [...H.efficacySafety], href: 'm5/c.pdf', id: 'op', operation: 'supersede' as 'new' },
      { headings: [...H.efficacySafety], href: 'm5/d.pdf', id: 'act', operation: 'replace' },
    ] }));
    expect(s.refusals.map((r) => [r.code, r.path])).toEqual([
      ['leaf_heading_unmapped', 'm3/a.pdf'], ['leaf_id_missing', 'm5/b.pdf'], ['leaf_operation_unknown', 'm5/c.pdf'], ['leaf_modified_file_missing', 'm5/d.pdf'],
    ]);
    expect(s.unreferenced).toEqual([]);
  });
});

describe('a second review of the fixes', () => {
  const zero = (extra: Partial<HandSequence> = {}) => handSequenceFiles({ ...BASE, root: '0000/', ...extra });
  const reuseOf = (href: string, bytes: string): HandLeaf => ({ headings: [...H.clinicalOverview], href, id: 'r1', omitFile: true, checksum: md5(bytes) });

  it('refuses a backbone of more leaves than any real one, before building its document', async () => {
    const many = Array.from({ length: 60_001 }, (_, i) => `<leaf ID="a${i}"/>`).join('');
    const index = `<?xml version="1.0"?><ectd:ectd xmlns:ectd="http://www.ich.org/ectd"><m2-common-technical-document-summaries><m2-5-clinical-overview>${many}</m2-5-clinical-overview></m2-common-technical-document-summaries></ectd:ectd>`;
    const started = performance.now();
    const s = await only({ '0000/index.xml': index, '0000/index-md5.txt': md5(index) });
    expect(codes(s)).toEqual(['backbone_too_large']);
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it.each([
    ['whose own leaf for it the earlier sequence refused', zero({ ich: [{ ...OV, checksum: md5('not these bytes') }] })],
    ['in an earlier sequence nothing of which was read', zero({ indexMd5: md5('other') })],
    ['that the earlier sequence holds but never filed', { ...zero({ ich: [CSR] }), '0000/m2/2-5/clinical-overview.pdf': '%PDF-1.4 ov' }],
  ])('refuses a reused file %s', async (_, files) => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [reuseOf('../0000/m2/2-5/clinical-overview.pdf', '%PDF-1.4 ov')] });
    const [, s1] = (await read({ ...files, ...one })).sequences;
    expect(s1.refusals.map((r) => [r.code, r.leafId])).toEqual([['leaf_href_unsafe', 'r1']]);
    expect(s1.leaves).toEqual([]);
  });

  it('reads a reused file under an application folder whose ancestor is named with four digits', async () => {
    const at = 'export/2024/ind123/';
    const one = handSequenceFiles({ root: `${at}0001/`, sequenceNumber: '0001', ich: [reuseOf('../0000/m2/2-5/clinical-overview.pdf', '%PDF-1.4 ov')] });
    const [, s1] = (await read({ ...handSequenceFiles({ ...BASE, root: `${at}0000/` }), ...one })).sequences;
    expect(s1.refusals).toEqual([]);
    expect(s1.leaves[0].archivePath).toBe(`${at}0000/m2/2-5/clinical-overview.pdf`);
  });

  it('binds a grouped-form pointer in an archive zipped without its application folder', async () => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [{ headings: [...H.clinicalOverview], href: 'm2/2-5/v2.pdf', id: 'v2', operation: 'replace', modifiedFile: '../../ind123456/0000/index.xml#ov' }] });
    const [, s1] = (await read({ ...zero(), ...one })).sequences;
    expect(s1.refusals).toEqual([]);
    expect(s1.leaves[0].modifiedFile).toBe('../0000/index.xml#ov');
    expect(s1.outsideArchive).toEqual([]);
  });

  it('refuses a pointer at a leaf a later filing under its section and name already took off file', async () => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [{ ...OV, id: 'ov-again', bytes: 'other bytes' }] });
    const two = handSequenceFiles({ root: '0002/', sequenceNumber: '0002', ich: [{ headings: [...H.clinicalOverview], id: 'gone', operation: 'delete', modifiedFile: '../0000/index.xml#ov' }] });
    const [, , s2] = (await read({ ...zero(), ...one, ...two })).sequences;
    expect(s2.refusals.map((r) => [r.code, r.leafId])).toEqual([['leaf_modified_file_unresolved', 'gone']]);
  });

  it('refuses a leaf ID, or a pointer\'s ID, the filed state could not bind', async () => {
    const s0 = await only(handSequenceFiles({ root: '0000/', ich: [{ ...OV, id: '1ov' }] }));
    expect(s0.refusals.map((r) => [r.code, r.leafId])).toEqual([['leaf_id_malformed', '1ov']]);
    const s1 = await only(handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [{ headings: [...H.clinicalOverview], href: 'm2/v2.pdf', id: 'v2', operation: 'replace', modifiedFile: '../0000/index.xml#1ov' }] }));
    expect(codes(s1)).toEqual(['leaf_modified_file_unresolved']);
  });

});

describe('a second review of the fixes: headings, applications, identity', () => {
  it.each([
    [['m3-quality', 'm3-2-body-of-data', 'm3-2-z-other']],
    // 2.3 is a heading leaves sit in; a name saying 2.3.Z is not read as it.
    [['m2-common-technical-document-summaries', 'm2-3-z-other']],
  ])('refuses a leaf under a heading whose name says a section letter the CTD does not have: %j', async (headings) => {
    const s = await only(handSequenceFiles({ root: '0000/', ich: [{ headings, href: 'm3/x.pdf', id: 'x' }] }));
    expect(codes(s)).toEqual(['leaf_heading_unmapped']);
  });

  it.each([
    [['m3-quality', 'm3-2-body-of-data'], '3.2'],
    [['m3-quality'], '3'],
    [['m5-clinical-study-reports', 'm5-3-clinical-study-reports'], '5.3'],
  ])('reads a leaf filed in a heading that has sub-headings, as the DTD allows: %j', async (headings, section) => {
    const s = await only(handSequenceFiles({ root: '0000/', ich: [{ headings, href: 'm3/x.pdf', id: 'x' }] }));
    expect(s.refusals).toEqual([]);
    expect(s.leaves[0].ctdSection).toBe(section);
  });

  it('takes no application from a grouped backbone that marks none as carrying the files', async () => {
    const other = '<application><application-information><application-number application-type="fdaat1">999999</application-number></application-information><submission-information><submission-id submission-type="fdast2">0000</submission-id><sequence-number submission-sub-type="fdasst1">0000</sequence-number></submission-information></application>';
    const unmark = text((x) => x.replace(' application-containing-files="true"', '').replace('<application-set>', `<application-set>${other}`));
    const s = await only(rewrite(handSequenceFiles({ ...BASE, root: '0000/' }), '0000/', { regional: unmark }));
    expect(s.application.number).toBeNull();
    expect(s.sequence).toBe('0000');
  });

  it('binds nothing to a leaf its own sequence refused as ambiguous', async () => {
    const zeroTwo = handSequenceFiles({ root: '0000/', ich: [
      { headings: [...H.drugSubstance], href: 'm3/a/specification.pdf', id: 'a' },
      { headings: [...H.drugSubstance], href: 'm3/b/specification.pdf', id: 'b', bytes: 'b' },
    ] });
    // b, the second of the two, is the one the fold's own supersession would leave on file.
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [{ headings: [...H.drugSubstance], href: 'm3/c/spec-v2.pdf', id: 'c', operation: 'replace', modifiedFile: '../0000/index.xml#b' }] });
    const [, s1] = (await read({ ...zeroTwo, ...one })).sequences;
    expect(codes(s1)).toEqual(['leaf_modified_file_unresolved']);
  });

  it('binds a pointer to the leaf of the backbone it names when both backbones carry the ID', async () => {
    const zeroSame = handSequenceFiles({ root: '0000/', m1: [{ ...COVER, id: 'ov' }], ich: [OV] });
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', m1: [{ headings: [...H.coverLetters], id: 'w', operation: 'delete', modifiedFile: '../../../0000/m1/us/us-regional.xml#ov' }] });
    const [, s1] = (await read({ ...zeroSame, ...one })).sequences;
    expect(s1.refusals).toEqual([]);
    expect(s1.leaves[0]).toMatchObject({ ctdSection: '1.2', fileName: 'cover.pdf' });
  });

  it('does not call a refused regional backbone\'s files unreferenced', async () => {
    const s = await only(handSequenceFiles({ ...BASE, root: '0000/', regionalChecksum: md5('not it') }));
    expect(codes(s)).toEqual(['regional_backbone_checksum_mismatch']);
    expect(s.unreferenced).not.toContain('m1/us/1-2/cover.pdf');
  });

  it('refuses a sequence folder inside another sequence of the same number', async () => {
    const out = await read({ ...handSequenceFiles(BASE), ...handSequenceFiles({ ...BASE, root: '0000/' }) });
    expect(out.refusals.map((r) => r.code)).toEqual(['sequence_number_duplicate']);
  });

  it('answers in a few seconds on 20,000 reuses refused at once (it took 14 s)', async () => {
    const leaves = Array.from({ length: 20_000 }, (_, i): HandLeaf => ({ headings: [...H.efficacySafety], href: `../0001/m5/f${i}.pdf`, id: `l${i}`, omitFile: true, checksum: md5('x') }));
    const started = performance.now();
    const s = await only(handSequenceFiles({ sequenceNumber: '0000', ich: leaves }));
    expect(s.refusals).toHaveLength(20_000);
    expect(performance.now() - started).toBeLessThan(6000);
  }, 30_000);
});

describe('grouped-form paths: only through this application\'s own folder (draft review, 2026-11-02)', () => {
  // The fixture's regional backbone files an IND (fdaat4) numbered 123456: FDA's folder for it is ind123456.
  const zero = (extra: Partial<HandSequence> = {}) => handSequenceFiles({ ...BASE, root: '0000/', ...extra });
  const replaceOv = (modifiedFile: string): HandLeaf => ({ headings: [...H.clinicalOverview], href: 'm2/2-5/v2.pdf', id: 'v2', operation: 'replace', modifiedFile });
  const reuseOv = (href: string): HandLeaf => ({ headings: [...H.clinicalOverview], href, id: 'r1', omitFile: true, checksum: md5('%PDF-1.4 ov') });
  const refusedFor = (s: FiledSequence) => s.refusals.map((r) => [r.code, r.leafId]);

  it.each([
    ['another application', '../../nda999999/0000/index.xml#ov', /"nda999999", not this application's "ind123456"/],
    ['an application of another type with the same number', '../../nda123456/0000/index.xml#ov', /"nda123456", not this application's "ind123456"/],
    ['no application at all: a climb through ".."', '../../../0000/index.xml#ov', /"\.\.", not this application's "ind123456"/],
  ])('refuses a pointer into %s', async (_, pointer, why) => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [replaceOv(pointer)] });
    const [s0, s1] = (await read({ ...zero(), ...one })).sequences;
    expect(refusedFor(s1)).toEqual([['leaf_modified_file_unresolved', 'v2']]);
    expect(s1.refusals[0].message).toMatch(why);
    expect(s1.leaves).toEqual([]);
    expect(s0.leaves.map((l) => l.leafId)).toContain('ov');
  });

  it('leaves a pointer through its own folder, at a sequence the archive does not hold, for the filed state', async () => {
    const s = await only(handSequenceFiles({ root: '', sequenceNumber: '0003', ich: [replaceOv('../../ind123456/0002/index.xml#ov')] }));
    expect(s.refusals).toEqual([]);
    expect(s.leaves[0].modifiedFile).toBe('../0002/index.xml#ov');
    expect(s.outsideArchive).toEqual(['v2']);
  });

  it('refuses a pointer that climbs through a folder when no regional backbone names the application', async () => {
    const s = await only(handSequenceFiles({ root: '0003/', sequenceNumber: '0003', noRegionalPointer: true, ich: [replaceOv('../../ind123456/0002/index.xml#ov')] }));
    const leafRefusals = s.refusals.filter((r) => r.leafId);
    expect(leafRefusals.map((r) => [r.code, r.leafId])).toEqual([['leaf_modified_file_unresolved', 'v2']]);
    expect(leafRefusals[0].message).toMatch(/names no FDA application/);
    expect(s.outsideArchive).toEqual([]);
  });

  it('refuses a reused file in another application, and reads one in its own', async () => {
    const own = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [reuseOv('../../ind123456/0000/m2/2-5/clinical-overview.pdf')] });
    const [, ok] = (await read({ ...zero(), ...own })).sequences;
    expect(ok.refusals).toEqual([]);
    expect(ok.leaves[0].archivePath).toBe('0000/m2/2-5/clinical-overview.pdf');
    const other = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [reuseOv('../../nda999999/0000/m2/2-5/clinical-overview.pdf')] });
    const [, s1] = (await read({ ...zero(), ...other })).sequences;
    expect(refusedFor(s1)).toEqual([['leaf_href_unsafe', 'r1']]);
    expect(s1.refusals[0].message).toMatch(/"nda999999", not this application's "ind123456"/);
    expect(s1.leaves).toEqual([]);
  });
});
