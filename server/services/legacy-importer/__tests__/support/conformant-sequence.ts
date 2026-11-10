/**
 * A small, conformant FDA eCTD v3.2.2 sequence written by hand, with every
 * checksum right unless a test says otherwise, for the reader's refusal cases
 * and the detector's fixtures. A sequence another publisher filed looks like
 * this: index.xml at the sequence root holds Modules 2-5 under the ICH heading
 * tree and points at the regional backbone; the regional backbone's hrefs are
 * relative to its own folder (m1/us/); index-md5.txt holds the MD5 of index.xml.
 *
 * The round trip through the platform's own packager is in
 * filed-sequence-reader-round-trip.test.ts; this builder exists for the cases
 * the packager refuses to write (a wrong checksum, an unknown heading, a href
 * out of the sequence).
 */
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

export const md5 = (b: string | Buffer): string => createHash('md5').update(b).digest('hex');

export interface HandLeaf {
  /** Heading elements from the module root down, e.g. ['m2-common-technical-document-summaries', 'm2-5-clinical-overview']. */
  headings: string[];
  /** The href as the backbone writes it (relative to that backbone's folder). Omitted for a delete. */
  href?: string;
  id: string;
  operation?: 'new' | 'replace' | 'append' | 'delete';
  modifiedFile?: string;
  title?: string;
  /** Bytes the archive holds for the leaf; default a short PDF-shaped string. */
  bytes?: string;
  /** Checksum the backbone records; default the MD5 of `bytes`. null writes none. */
  checksum?: string | null;
  /** Leave the file out of the archive. */
  omitFile?: boolean;
}

export interface HandSequence {
  /** Zip folder of the sequence root: '' or e.g. '0001/'. */
  root?: string;
  sequenceNumber?: string;
  /** Module 1 leaves, in us-regional.xml under <m1-regional>. */
  m1?: HandLeaf[];
  /** Module 2-5 leaves, in index.xml. */
  ich?: HandLeaf[];
  /** Overrides index-md5.txt's content; null leaves the file out. */
  indexMd5?: string | null;
  /** Text inserted after the XML declaration of index.xml (a DOCTYPE, say). */
  indexPrologue?: string;
  /** Write no pointer to the regional backbone in index.xml. */
  noRegionalPointer?: boolean;
  /** Overrides the checksum index.xml records for the regional backbone. */
  regionalChecksum?: string;
  extraFiles?: Record<string, string>;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function leafXml(l: HandLeaf, sums: Map<HandLeaf, string>): string {
  const op = l.operation ?? 'new';
  const checksum = l.checksum === null ? '' : ` checksum="${l.checksum ?? sums.get(l)}" checksum-type="md5"`;
  const href = l.href !== undefined ? ` xlink:href="${esc(l.href)}"` : '';
  const modified = l.modifiedFile ? ` modified-file="${esc(l.modifiedFile)}"` : '';
  const content = op === 'delete' ? '' : `${checksum}${href}`;
  const inner = `<leaf operation="${op}"${modified}${content} xlink:type="simple" ID="${esc(l.id)}"><title>${esc(l.title ?? l.id)}</title></leaf>`;
  return [...l.headings].reverse().reduce((xml, h) => `<${h}>${xml}</${h}>`, inner);
}

function regionalXml(s: HandSequence, sums: Map<HandLeaf, string>): string {
  const n = s.sequenceNumber ?? '0000';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fda-regional:fda-regional SYSTEM "../../util/dtd/us-regional-v3-3.dtd">
<fda-regional:fda-regional xmlns:fda-regional="http://www.ich.org/fda" xmlns:xlink="http://www.w3c.org/1999/xlink" dtd-version="3.3">
  <admin>
    <applicant-info><id>123456789</id><company-name>Acme Biologics Inc.</company-name></applicant-info>
    <application-set><application application-containing-files="true">
      <application-information><application-number application-type="fdaat4">123456</application-number></application-information>
      <submission-information>
        <submission-id submission-type="fdast1">${n}</submission-id>
        <sequence-number submission-sub-type="fdasst1">${n}</sequence-number>
      </submission-information>
    </application></application-set>
  </admin>
  <m1-regional>${(s.m1 ?? []).map((l) => leafXml(l, sums)).join('')}</m1-regional>
</fda-regional:fda-regional>`;
}

function indexXml(s: HandSequence, sums: Map<HandLeaf, string>, regional: string): string {
  const pointer = s.noRegionalPointer
    ? ''
    : `<m1-administrative-information-and-prescribing-information><leaf operation="new" checksum="${s.regionalChecksum ?? md5(regional)}" checksum-type="md5" xlink:href="m1/us/us-regional.xml" xlink:type="simple" ID="leaf-m1-regional-backbone"><title>Module 1</title></leaf></m1-administrative-information-and-prescribing-information>`;
  const prologue = s.indexPrologue ?? '\n<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">';
  return `<?xml version="1.0" encoding="UTF-8"?>${prologue}
<ectd:ectd xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3c.org/1999/xlink" dtd-version="3.2">${pointer}${(s.ich ?? []).map((l) => leafXml(l, sums)).join('')}</ectd:ectd>`;
}

/** The sequence's files, keyed by their zip path. */
export function handSequenceFiles(s: HandSequence): Record<string, string> {
  const root = s.root ?? '';
  const files: Record<string, string> = {};
  const sums = new Map<HandLeaf, string>();
  const place = (l: HandLeaf, dir: string) => {
    if (l.operation === 'delete' || l.href === undefined) return;
    const bytes = l.bytes ?? `%PDF-1.4 ${l.id}`;
    sums.set(l, md5(bytes));
    if (!l.omitFile) files[`${root}${dir}${l.href}`] = bytes;
  };
  for (const l of s.m1 ?? []) place(l, 'm1/us/');
  for (const l of s.ich ?? []) place(l, '');
  const regional = regionalXml(s, sums);
  files[`${root}m1/us/us-regional.xml`] = regional;
  const index = indexXml(s, sums, regional);
  files[`${root}index.xml`] = index;
  if (s.indexMd5 !== null) files[`${root}index-md5.txt`] = s.indexMd5 ?? md5(index);
  return { ...files, ...(s.extraFiles ?? {}) };
}

export async function zipOf(files: Record<string, string | Buffer>): Promise<JSZip> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
}

export async function zipBufferOf(files: Record<string, string | Buffer>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * A pool that answers the fold's filed-manifest query (prior-sequence-loader's
 * readFiledManifestRows) with these manifests, oldest first, as compiles of
 * sent sequences: the rows carry `kind: 'compile'`, as that loader's own tests
 * write them. Since 090f62af the query also returns a row per sequence and per
 * transmittal; a row without a kind is neither, so it folded to nothing.
 */
export function filedStatePool(rows: Array<{ sequence_number: string; leaf_manifest: unknown }>) {
  return { query: async (sql: string) => ({ rows: /leaf_manifest/.test(sql) ? rows.map((r) => ({ kind: 'compile', ...r })) : [] }) };
}

/** Heading chains a test can name. */
export const H = {
  coverLetters: ['m1-2-cover-letters'],
  clinicalOverview: ['m2-common-technical-document-summaries', 'm2-5-clinical-overview'],
  drugSubstance: ['m3-quality', 'm3-2-body-of-data', 'm3-2-s-drug-substance'],
  /** Deeper than this repository's heading tree goes; the ICH DTD defines it. */
  specification: ['m3-quality', 'm3-2-body-of-data', 'm3-2-s-drug-substance', 'm3-2-s-4-control-of-drug-substance', 'm3-2-s-4-1-specification'],
  efficacySafety: ['m5-clinical-study-reports', 'm5-3-clinical-study-reports', 'm5-3-5-reports-of-efficacy-and-safety-studies'],
} as const;
