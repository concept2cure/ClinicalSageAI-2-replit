/**
 * The filed-sequence reader on what real archives hold, and on what an
 * uploaded archive could hold to mislead it. Each case is a finding of the
 * independent review of 2026-11-02 (docs/evidence/MR-10/2026-11-01-filed-sequence-
 * reader/README.md, "Review round"), shown failing on the reader of 90f1c747
 * before it was fixed.
 */
import { describe, expect, it, vi } from 'vitest';
import { loadFiledStateBySubmission } from '../../ectd/prior-sequence-loader';
import { readFiledSequences, isComplete, type FiledSequence } from '../filed-sequence-reader';
import { BACKBONE_MAX_BYTES, decodeBackbone } from '../filed-sequence-xml';
import { H, handSequenceFiles, md5, zipOf, type HandLeaf, type HandSequence } from './support/conformant-sequence';

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
    const pool = (rows: Array<Record<string, unknown>>) => ({ query: async (sql: string) => ({ rows: /leaf_manifest/.test(sql) ? rows : [] }) });
    const state = await loadFiledStateBySubmission(pool([s0, s1].map((s) => ({ sequence_number: s.sequence, leaf_manifest: s.leaves }))), { organizationId: 1, submissionId: 1 });
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
