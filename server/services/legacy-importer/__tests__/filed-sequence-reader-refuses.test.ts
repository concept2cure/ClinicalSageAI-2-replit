/**
 * What the filed-sequence reader refuses, and that it never guesses.
 *
 * A sequence read from another publisher becomes filed state: the leaves a
 * later sequence replaces, appends to and withdraws. A leaf read wrong is a
 * lifecycle act against the wrong document at the agency, so each defect below
 * is a refusal naming the leaf, and a refused leaf is not in `leaves`. Nothing
 * is placed from a filename.
 */
import { describe, expect, it } from 'vitest';
import { allHeadingElements, ICH_BACKBONE, type IchHeading } from '../../submission-gateways/ectd-packager/ich-headings';
import { usRegionalHeadingPlacement } from '../../ectd/controlled-vocab/fda-regional-sections';
import { CV_CONTEXT_OF_USE } from '../../ectd/controlled-vocab/cv-v4-data';
import { headingSection, readFiledSequences, readFiledSequenceArchive } from '../filed-sequence-reader';
import { H, handSequenceFiles, md5, zipBufferOf, zipOf, type HandSequence } from './support/conformant-sequence';

const BASE: HandSequence = {
  m1: [{ headings: [...H.coverLetters], href: '1-2/cover.pdf', id: 'm1-cover' }],
  ich: [
    { headings: [...H.clinicalOverview], href: 'm2/2-5/clinical-overview.pdf', id: 'ov' },
    { headings: [...H.specification], href: 'm3/3-2-s-4-1/specification.pdf', id: 'spec' },
    { headings: [...H.efficacySafety], href: 'm5/5-3-5/csr.pdf', id: 'csr' },
  ],
};

async function read(s: HandSequence, extra: Record<string, string> = {}) {
  const out = await readFiledSequences(await zipOf({ ...handSequenceFiles(s), ...extra }));
  return { out, seq: out.sequences[0] };
}

describe('the reader on a conformant sequence', () => {
  it('reads every leaf of both backbones at its declared heading, from the sequence root', async () => {
    const { out, seq } = await read(BASE);
    expect(out.refusals).toEqual([]);
    expect(seq.refusals).toEqual([]);
    expect(seq.sequence).toBe('0000');
    expect(seq.leaves.map((l) => [l.leafId, l.backbone, l.ctdSection, l.href, l.heading])).toEqual([
      ['ov', 'index.xml', '2.5', 'm2/2-5/clinical-overview.pdf', 'm2-5-clinical-overview'],
      ['spec', 'index.xml', '3.2.S.4.1', 'm3/3-2-s-4-1/specification.pdf', 'm3-2-s-4-1-specification'],
      ['csr', 'index.xml', '5.3.5', 'm5/5-3-5/csr.pdf', 'm5-3-5-reports-of-efficacy-and-safety-studies'],
      ['m1-cover', 'm1/us/us-regional.xml', '1.2', 'm1/us/1-2/cover.pdf', 'm1-2-cover-letters'],
    ]);
    expect(seq.leaves[0].md5).toBe(md5('%PDF-1.4 ov'));
  });

  it('reports a file neither backbone references, and does not place it', async () => {
    const { seq } = await read(BASE, { 'm5/5-3-5/protocol-deviation-log.xlsx': 'x' });
    expect(seq.unreferenced).toEqual(['m5/5-3-5/protocol-deviation-log.xlsx']);
    expect(seq.leaves.some((l) => l.href.includes('protocol'))).toBe(false);
  });
});

describe('the reader refuses, naming the leaf', () => {
  it('a leaf whose bytes are not the ones its backbone checksums', async () => {
    const { seq } = await read({ ...BASE, ich: [{ ...BASE.ich![0], bytes: 'tampered', checksum: md5('%PDF-1.4 ov') }] });
    expect(seq.refusals).toEqual([expect.objectContaining({ code: 'leaf_checksum_mismatch', leafId: 'ov', path: 'm2/2-5/clinical-overview.pdf' })]);
    expect(seq.leaves.map((l) => l.leafId)).toEqual(['m1-cover']);
  });

  it('a leaf with no checksum', async () => {
    const { seq } = await read({ ...BASE, ich: [{ ...BASE.ich![0], checksum: null }] });
    expect(seq.refusals.map((r) => r.code)).toEqual(['leaf_checksum_missing']);
  });

  it.each([
    // Not into another sequence of the application (that is file reuse): out of the archive altogether.
    ['out of the sequence', '../../etc/clinical-overview.pdf'],
    ['absolute', '/etc/passwd'],
    ['a URL', 'https://example.com/x.pdf'],
    ['a backslash path', 'm2\\x.pdf'],
  ])('a href %s, without reading it', async (_, href) => {
    const { seq } = await read({ ...BASE, ich: [{ ...BASE.ich![0], href, omitFile: true }] });
    expect(seq.refusals).toEqual([expect.objectContaining({ code: 'leaf_href_unsafe', leafId: 'ov' })]);
  });

  it('a leaf whose file is not in the archive', async () => {
    const { seq } = await read({ ...BASE, ich: [{ ...BASE.ich![0], omitFile: true }] });
    expect(seq.refusals).toEqual([expect.objectContaining({ code: 'leaf_file_missing', path: 'm2/2-5/clinical-overview.pdf' })]);
  });

  it.each([
    ['a heading this tree does not know and whose name encodes no section', ['m3-quality', 'appendix-stuff']],
    ['a heading outside Modules 1-5', ['m9-extra']],
    ['a heading whose section is not inside the heading holding it', ['m3-quality', 'm3-2-body-of-data', 'm5-3-5-reports-of-efficacy-and-safety-studies']],
    ['no heading at all', [] as string[]],
  ])('a leaf under %s, rather than guessing its section', async (_, headings) => {
    const { seq } = await read({ ...BASE, ich: [{ headings, href: 'm3/x.pdf', id: 'odd' }] });
    expect(seq.refusals).toEqual([expect.objectContaining({ code: 'leaf_heading_unmapped', leafId: 'odd' })]);
    expect(seq.leaves.find((l) => l.leafId === 'odd')).toBeUndefined();
  });

  it('a Module 1 leaf directly under <m1-regional>', async () => {
    const { seq } = await read({ ...BASE, m1: [{ headings: [], href: 'x/cover.pdf', id: 'loose' }] });
    expect(seq.refusals.map((r) => [r.code, r.leafId])).toEqual([['leaf_heading_unmapped', 'loose']]);
  });

  it('a replace, append or delete that names no filed leaf', async () => {
    const { seq } = await read({ ...BASE, sequenceNumber: '0001', root: '0001/', ich: [
      { ...BASE.ich![0], operation: 'replace' },
      { ...BASE.ich![1], operation: 'append', modifiedFile: 'm2/2-5/clinical-overview.pdf' },
    ] });
    expect(seq.refusals.map((r) => [r.code, r.leafId])).toEqual([
      ['leaf_modified_file_missing', 'ov'],
      ['leaf_modified_file_unresolved', 'spec'],
    ]);
  });

  it('an unknown operation, a missing ID and a repeated ID', async () => {
    const { seq } = await read({ ...BASE, ich: [
      { ...BASE.ich![0], operation: 'supersede' as 'new' },
      { ...BASE.ich![1], id: '' },
      { ...BASE.ich![2], id: 'm1-dup' },
      { headings: [...H.efficacySafety], href: 'm5/5-3-5/csr-2.pdf', id: 'm1-dup' },
    ] });
    expect(seq.refusals.map((r) => r.code)).toEqual(['leaf_operation_unknown', 'leaf_id_missing', 'leaf_id_duplicate']);
  });

});

describe('the reader refuses a backbone or a sequence, naming it', () => {
  it('an index.xml whose index-md5.txt does not hold its MD5, or is absent', async () => {
    expect((await read({ ...BASE, indexMd5: md5('something else') })).seq.refusals.map((r) => r.code)).toEqual(['index_md5_mismatch']);
    expect((await read({ ...BASE, indexMd5: null })).seq.refusals.map((r) => r.code)).toEqual(['index_md5_missing']);
  });

  it('a regional backbone index.xml checksums differently', async () => {
    // In a sequence folder, so the number does not depend on the backbone refused.
    const { seq } = await read({ ...BASE, root: '0000/', regionalChecksum: md5('not it') });
    expect(seq.refusals.map((r) => r.code)).toEqual(['regional_backbone_checksum_mismatch']);
    expect(seq.leaves.some((l) => l.backbone !== 'index.xml')).toBe(false);
  });

  it('a regional backbone index.xml does not reference', async () => {
    const { seq } = await read({ ...BASE, root: '0000/', noRegionalPointer: true });
    expect(seq.refusals.map((r) => r.code)).toEqual(['regional_backbone_unreferenced']);
  });

  it('a backbone that declares entities or an internal subset, before parsing it', async () => {
    const { seq } = await read({ ...BASE, indexPrologue: '\n<!DOCTYPE ectd:ectd [<!ENTITY x SYSTEM "file:///etc/passwd">]>' });
    expect(seq.refusals.map((r) => r.code)).toEqual(['backbone_declares_entities']);
    expect(seq.leaves).toEqual([]);
  });

  it('a backbone that is not well-formed', async () => {
    const files = handSequenceFiles(BASE);
    files['index.xml'] = files['index.xml'].replace('</ectd:ectd>', '');
    files['index-md5.txt'] = md5(files['index.xml']);
    const seq = (await readFiledSequences(await zipOf(files))).sequences[0];
    expect(seq.refusals.map((r) => r.code)).toEqual(['backbone_not_well_formed']);
  });

  it('a regional backbone index.xml points at and the archive does not hold', async () => {
    const files = handSequenceFiles({ ...BASE, root: '0000/' });
    delete files['0000/m1/us/us-regional.xml'];
    const seq = (await readFiledSequences(await zipOf(files))).sequences[0];
    expect(seq.refusals.map((r) => [r.code, r.path])).toEqual([['regional_backbone_missing', 'm1/us/us-regional.xml']]);
  });

  it('one sequence number twice in one application', async () => {
    // Two sibling folders of one application that both number themselves 0000
    // (the second is read as a sequence because it holds index-md5.txt).
    const out = await readFiledSequences(await zipOf({ ...handSequenceFiles({ ...BASE, root: 'app/0000/' }), ...handSequenceFiles({ ...BASE, root: 'app/copy/' }) }));
    expect(out.sequences.map((s) => [s.sequence, s.root])).toEqual([['0000', 'app/0000/'], ['0000', 'app/copy/']]);
    expect(out.refusals.map((r) => r.code)).toEqual(['sequence_number_duplicate']);
  });

  it('a sequence folder its regional backbone numbers differently', async () => {
    const { seq } = await read({ ...BASE, root: '0003/', sequenceNumber: '0002' });
    expect(seq.refusals.map((r) => r.code)).toEqual(['sequence_number_disagrees']);
  });

  it('an archive over the upload limits, before inflating it (SEC-17)', async () => {
    // 8 MiB of one byte deflates to a few kilobytes: a ratio no real file has.
    const bomb = await zipBufferOf({ ...handSequenceFiles(BASE), 'm2/bomb.xml': Buffer.alloc(8 * 1024 * 1024, 0x41) });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(readFiledSequenceArchive(bomb)).rejects.toMatchObject({ name: 'ArchiveLimitError' });
    await expect(readFiledSequenceArchive(await zipBufferOf(handSequenceFiles(BASE)))).resolves.toMatchObject({ refusals: [] });
  });
});

describe('pointers between sequences in one archive', () => {
  it('binds a replace to the leaf it names, and refuses one that names no leaf there', async () => {
    const zero = handSequenceFiles({ ...BASE, root: '0000/' });
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [
      { headings: [...H.clinicalOverview], href: 'm2/2-5/clinical-overview.pdf', id: 'ov1', operation: 'replace', modifiedFile: '../0000/index.xml#ov' },
      { headings: [...H.efficacySafety], id: 'gone', operation: 'delete', modifiedFile: '../0000/index.xml#nope' },
    ] });
    const out = await readFiledSequences(await zipOf({ ...zero, ...one }));
    const [, s1] = out.sequences;
    expect(s1.leaves.map((l) => [l.leafId, l.operation, l.modifiedFile])).toEqual([['ov1', 'replace', '../0000/index.xml#ov']]);
    expect(s1.refusals.map((r) => [r.code, r.leafId])).toEqual([['leaf_modified_file_unresolved', 'gone']]);
  });

  it('leaves a pointer to a sequence the archive does not hold for the filed state to bind, and says so', async () => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [
      { headings: [...H.clinicalOverview], href: 'm2/2-5/clinical-overview.pdf', id: 'ov1', operation: 'replace', modifiedFile: '../0000/index.xml#ov' },
    ] });
    const [s1] = (await readFiledSequences(await zipOf(one))).sequences;
    expect(s1.refusals).toEqual([]);
    expect(s1.outsideArchive).toEqual(['ov1']);
  });

  it('refuses a pointer into the archive that names no sequence\'s backbone', async () => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [
      { headings: [...H.clinicalOverview], href: 'm2/2-5/clinical-overview.pdf', id: 'ov1', operation: 'replace', modifiedFile: '../util/style/x.xml#ov' },
    ] });
    const [s1] = (await readFiledSequences(await zipOf(one))).sequences;
    expect(s1.refusals.map((r) => [r.code, r.leafId])).toEqual([['leaf_modified_file_unresolved', 'ov1']]);
    expect(s1.outsideArchive).toEqual([]);
  });

  it('refuses a pointer at a sequence outside the archive that names no leaf ID, rather than leaving it to be bound', async () => {
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [
      { headings: [...H.clinicalOverview], href: 'm2/2-5/clinical-overview.pdf', id: 'ov1', operation: 'replace', modifiedFile: '../0000/index.xml' },
    ] });
    const [s1] = (await readFiledSequences(await zipOf(one))).sequences;
    expect(s1.refusals.map((r) => [r.code, r.leafId])).toEqual([['leaf_modified_file_unresolved', 'ov1']]);
    expect(s1.outsideArchive).toEqual([]);
  });

  it('refuses a pointer at a later sequence', async () => {
    const zero = handSequenceFiles({ ...BASE, root: '0000/', ich: [{ ...BASE.ich![0], operation: 'replace', modifiedFile: '../0001/index.xml#x1' }] });
    const one = handSequenceFiles({ root: '0001/', sequenceNumber: '0001', ich: [{ headings: [...H.efficacySafety], href: 'm5/a.pdf', id: 'x1' }] });
    const [s0] = (await readFiledSequences(await zipOf({ ...zero, ...one }))).sequences;
    expect(s0.refusals.map((r) => [r.code, r.leafId])).toEqual([['leaf_modified_file_unresolved', 'ov']]);
  });
});

describe('a heading name says its section, and agrees with the trees this repository writes', () => {
  it('every ICH heading the packager writes reads back as its own section', () => {
    const want: [string, string][] = [];
    const walk = (hs: IchHeading[]) => hs.forEach((h) => { want.push([h.element, h.section]); walk(h.children ?? []); });
    walk(ICH_BACKBONE);
    expect(want.length).toBe(allHeadingElements().length);
    for (const [element, section] of want) expect(headingSection(element), element).toBe(section);
  });

  it('every FDA Module 1 heading the packager writes reads back as its own section, except the one the code says it cannot stand behind', () => {
    const exceptions: string[] = [];
    for (const row of CV_CONTEXT_OF_USE.codes) {
      const section = row.code.replace(/^us_/, '');
      const { heading, element, gap } = usRegionalHeadingPlacement(section);
      if (gap && /does not encode/.test(gap)) { exceptions.push(heading); continue; }
      expect(headingSection(element), element).toBe(heading);
    }
    expect([...new Set(exceptions)]).toEqual(['1.18']);
  });

  it('reads the ICH DTD names deeper than that tree, and a letter only where the CTD has one', () => {
    expect(headingSection('m3-2-s-4-1-specification')).toBe('3.2.S.4.1');
    expect(headingSection('m3-2-p-3-3-description-of-manufacturing-process-and-process-controls')).toBe('3.2.P.3.3');
    expect(headingSection('m2-3-s-drug-substance')).toBe('2.3.S');
    expect(headingSection('m5-3-5-1-study-reports-of-controlled-clinical-studies')).toBe('5.3.5.1');
    expect(headingSection('m4-2-3-a-test')).toBe('4.2.3');
    expect(headingSection('node-extension')).toBeNull();
    expect(headingSection('m-thing')).toBeNull();
  });
});
