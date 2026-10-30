import os from 'node:os'; import path from 'node:path'; import { promises as fs } from 'node:fs';
import { assembleCsr } from '../../../../server/services/csr/csr-assembly';
import { assemblyInput } from '../../../../server/services/csr/__tests__/support/csr-assembly-fixture';
import { packageEctdSubmission } from '../../../../server/services/submission-gateways/regional-packager';
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'csr-e2e-')); const out = path.join(work, 'out'); await fs.mkdir(out);
const r = await assembleCsr(await assemblyInput(out));
const b: any = await packageEctdSubmission({ region: 'fda', applicationId: '123456', sequence: '0000', submissionType: 'original', fda: { applicationType: 'ind' },
  sponsorId: 'D', sponsorName: 'SYNTHETIC sponsor', productName: 'SYNTHETIC product', outputDir: path.join(work, 'pkg'), environment: 'staging',
  leaves: r.leaves, crossReferences: r.crossReferences, studyMeta: [{ studyId: 'SYN-LMN201-B', studyTitle: 'SYNTHETIC LMN-201-shaped study' }] });
const summary = { synthetic: 'SYNTHETIC — slice-6 LMN-201-shaped ADaM set (adam-lmn201-synthetic.ts), invented prose and invented supplied PDFs',
  assembly: { status: r.status, structure: r.structure, unresolvedReferences: r.unresolvedReferences, missing: r.missing, notApplicable: r.notApplicable,
    abbreviations: r.abbreviations, stfWarnings: r.stfWarnings, pdfa: r.pdfa,
    leaves: r.leaves.map(l => ({ appendix: l.appendix, fileName: l.fileName, title: l.title, ctdSection: l.ctdSection, stfFileTag: l.stfFileTag, origin: l.origin, pages: l.pages, bytes: l.bytes, sha256: l.sha256 })),
    listings: r.listings.map(l => ({ number: l.number, rows: l.rows, pages: l.pages, receiptSha256: l.receiptSha256, verification: l.verification })),
    crossReferences: r.crossReferences.length },
  packager: { stf: b.stf, crossReferenceStatus: b.crossReferenceStatus,
    submissionGrade: b.submissionGrade, dtdStatus: b.dtdStatus, sizeBytes: b.sizeBytes, files: (b.leafManifest ?? []).length } };
await fs.writeFile(process.argv[2], JSON.stringify(summary, null, 2) + '\n');
await fs.rm(work, { recursive: true, force: true });
