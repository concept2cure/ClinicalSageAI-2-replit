/**
 * CSR slice 8 test fixture. SYNTHETIC: the slice-6 LMN-201-shaped ADaM set
 * (adam-lmn201-synthetic.ts, every row invented) derived through the engine,
 * plus invented section prose and invented "supplied" PDFs. Tests only.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { buildCSRTables } from '../../../csr-tabulation-builders';
import { readAdamDataset, type AdamDataset } from '../../adam-dataset-reader';
import { deriveCsrSourceFromAdam } from '../../adam-source-derivation';
import type { CsrAssemblyInput } from '../../csr-assembly';
import { adae, adcm, adex, adlb, adsl, advs, bundle, efficacyResults, STUDY_ID, SYNTHETIC_LABEL } from './adam-lmn201-synthetic';

export const read = (doc: unknown, file = 'x.json'): AdamDataset => {
  const out = readAdamDataset(Buffer.from(JSON.stringify(doc)), file);
  if (!out.ok) throw new Error(out.reason);
  return out.dataset;
};

/** Invented section prose, with the cross-references a medical writer makes. */
export const SECTIONS = [
  { code: '1', title: 'Title Page', content: `Synthetic study ${STUDY_ID}. ${SYNTHETIC_LABEL}.` },
  { code: '2', title: 'Synopsis', content: 'The Clinical Study Report (CSR) summarises a synthetic study of an Investigational Medicinal Product (IMP). Adverse events (AEs) are coded in MedDRA.' },
  { code: '9.1', title: 'Overall Study Design and Plan — Description', content: 'The protocol is provided in Appendix 16.1.1 and the statistical methods in Appendix 16.1.9. Analyses follow Section 11.4.1.' },
  { code: '10.1', title: 'Disposition of Patients', content: 'Disposition is summarised in Table 14.1.1 and listed in Listing 16.2.1.' },
  { code: '11.4.1', title: 'Analysis of Efficacy', content: 'The primary result is in Table 14.2.1.' },
  { code: '11.4.2.1', title: 'Statistical/Analytical Issues — Adjustments for Covariates', content: 'No covariate adjustment was specified (see Section 9.1).' },
  { code: '12.2.2', title: 'Display of Adverse Events', content: 'AEs are summarised in Table 14.3.1.1 and Table 14.3.1.2, and listed by subject in Listing 16.2.7.\n\n- Severity was graded by the investigator.\n- Seriousness followed ICH E2A.' },
  { code: '12.3.1.1', title: 'Deaths', content: 'Deaths are presented in Table 14.3.2.1.' },
  { code: '12.4.2.1', title: 'Laboratory Values Over Time', content: 'Laboratory values are listed in Listing 16.2.8.' },
];

export async function minimalPdf(file: string, label: string): Promise<{ path: string; sha256: string }> {
  const doc = new (PDFDocument as unknown as new (o: object) => NodeJS.ReadableStream & { text(t: string): void; end(): void })({ info: { CreationDate: new Date(0), ModDate: new Date(0) } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise(resolve => doc.on('end', resolve));
  doc.text(`SYNTHETIC supplied document: ${label}`);
  doc.end();
  await done;
  const bytes = Buffer.concat(chunks);
  await fs.writeFile(file, bytes);
  return { path: file, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export const SUPPLIED = ['16.1.1', '16.1.2', '16.1.3', '16.1.4', '16.1.5', '16.1.7', '16.1.9', '16.3'] as const;

export async function assemblyInput(outDir: string, over: Partial<CsrAssemblyInput> = {}): Promise<CsrAssemblyInput> {
  const datasets = { ADSL: read(adsl()), ADAE: read(adae()), ADEX: read(adex()), ADLB: read(adlb()), ADVS: read(advs()), ADCM: read(adcm()) };
  const envelope = deriveCsrSourceFromAdam(bundle(), datasets, efficacyResults());
  const suppliedDir = path.join(outDir, '..', 'supplied');
  await fs.mkdir(suppliedDir, { recursive: true });
  const supplied: NonNullable<CsrAssemblyInput['supplied']> = {};
  for (const n of SUPPLIED) supplied[n] = await minimalPdf(path.join(suppliedDir, `${n}.pdf`), n);
  return {
    studyId: envelope.studyData.studyId, title: `Part B — ${SYNTHETIC_LABEL}`, sections: SECTIONS,
    tables: buildCSRTables(envelope.studyData), contentModifiedAt: new Date('2026-03-31T00:00:00Z'), outDir,
    listingSource: { study: envelope.studyData, participants: envelope.participants, laboratory: datasets.ADLB, protocolDeviations: [] },
    supplied,
    notApplicable: { '16.2.6': 'SYNTHETIC test: the source carries no subject-level efficacy data' },
    ...over,
  };
}
