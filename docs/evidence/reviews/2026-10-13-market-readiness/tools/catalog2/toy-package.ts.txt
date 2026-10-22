// Toy eCTD sequence through the canonical packager (regional-packager.packageEctdSubmission).
import { promises as fs } from 'fs';
import * as path from 'path';
import { PDFDocument, StandardFonts } from '<repo>/node_modules/pdf-lib/cjs/index.js';
import { packageEctdSubmission } from '<repo>/server/services/submission-gateways/regional-packager';

const OUT = '<scratch>/catalog2/out';

async function mkPdf(p: string, text: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage();
  page.drawText(text, { x: 50, y: 700, size: 12, font });
  await fs.writeFile(p, await doc.save());
}

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });
  const src = path.join(OUT, 'src');
  await fs.mkdir(src, { recursive: true });
  const files = {
    cover: path.join(src, 'cover.pdf'),
    f1571: path.join(src, '1571.pdf'),
    qos: path.join(src, 'qos.pdf'),
    spec: path.join(src, 'spec.pdf'),
    anal: path.join(src, 'analytical.pdf'),
    csr: path.join(src, 'csr.pdf'),
    tox: path.join(src, 'tox.pdf'),
  };
  for (const [k, p] of Object.entries(files)) await mkPdf(p, `toy ${k}`);

  const bundle = await packageEctdSubmission({
    region: 'fda',
    applicationId: '123456',
    sequence: '0000',
    submissionType: 'original',
    sponsorId: '123456789',
    sponsorName: 'Toy Pharma Inc',
    productName: 'Toyzumab',
    outputDir: OUT,
    emitUnzipped: true,
    environment: 'staging',
    skipPdfaConversion: true,
    fda: {
      applicationType: 'IND',
      submissionType: 'original application',
      contacts: [{ type: 'regulatory', name: 'Jane Doe', email: 'jane@toy.example', phone: '555-0100' }],
    },
    leaves: [
      { ctdSection: '1.2', operation: 'new', sourcePath: files.cover, fileName: 'cover.pdf', title: 'Cover Letter' },
      { ctdSection: 'm1.1', operation: 'new', sourcePath: files.f1571, fileName: 'form-1571.pdf', title: 'Form FDA 1571' },
      { ctdSection: '2.3', operation: 'new', sourcePath: files.qos, fileName: 'qos.pdf', title: 'Quality Overall Summary' },
      { ctdSection: '3.2.S.4.1', operation: 'new', sourcePath: files.spec, fileName: 'spec.pdf', title: 'Specification' },
      { ctdSection: '3.2.S.4.2', operation: 'new', sourcePath: files.anal, fileName: 'analytical-procedures.pdf', title: 'Analytical Procedures' },
      { ctdSection: '4.2.3.2', operation: 'new', sourcePath: files.tox, fileName: 'tox-rpt.pdf', title: 'Repeat-dose Toxicity', studyId: 'TOX-001', stfFileTag: 'study-report-body' },
      { ctdSection: '5.3.5.1', operation: 'new', sourcePath: files.csr, fileName: 'csr-101.pdf', title: 'CSR Study 101', studyId: 'STUDY-101', stfFileTag: 'study-report-body' },
    ],
    studyMeta: [
      { studyId: 'STUDY-101', title: 'A Phase 1 Study', category: 'efficacy' } as any,
      { studyId: 'TOX-001', title: '28-day tox', category: 'toxicology' } as any,
    ],
  });
  const { leafManifest, ...rest } = bundle as any;
  console.log(JSON.stringify(rest, null, 2));
  console.log('leafManifest entries:', leafManifest?.length);
}

main().catch((e) => {
  console.error('FAILED:', e?.name, e?.message, JSON.stringify(e?.findings ?? null));
  process.exit(1);
});
