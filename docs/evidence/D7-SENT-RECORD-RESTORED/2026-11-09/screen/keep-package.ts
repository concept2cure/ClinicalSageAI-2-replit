/**
 * P-99 C2 walk: build a real 0000 package with the canonical packager and keep it in the app's own store, exactly as the
 * transmit guard keeps a sent package (sent-package-archive.ts archiveSentPackage: getStorageProvider().put), on the
 * walk's throwaway setup only. Prints the record the transmittal row names (metadata.sentPackage) as JSON.
 * Run from the repo root: npx tsx docs/evidence/D7-SENT-RECORD-RESTORED/2026-11-09/screen/keep-package.ts <orgId> <workDir>
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { packageEctdSubmission, type EctdLeaf } from '../../../../../server/services/submission-gateways/regional-packager';
import { getStorageProvider } from '../../../../../server/services/storage';
import { plainPdfFixture as pdf } from '../../../../../server/services/ectd/__tests__/support/signed-pdf-fixture';

(async () => {
  const orgId = Number(process.argv[2]);
  const work = process.argv[3];
  await fs.mkdir(work, { recursive: true });
  const file = async (n: string, label: string) => { const p = path.join(work, n); await fs.writeFile(p, await pdf(label)); return p; };
  const bundle = await packageEctdSubmission({
    region: 'fda', applicationId: '000512', sequence: '0000', submissionType: 'original', fda: { applicationType: 'ind' },
    sponsorId: 'D', sponsorName: 'Walk sponsor', productName: 'Walk product', outputDir: path.join(work, 'out'), environment: 'staging',
    leaves: [
      { ctdSection: 'm1.2', fileName: 'cover-letter.pdf', title: 'Cover letter (walk stand-in)', operation: 'new', sourcePath: await file('c.pdf', 'Cover letter, walk stand-in') },
      { ctdSection: '2.5', fileName: 'clinical-overview.pdf', title: 'Clinical overview (walk stand-in)', operation: 'new', sourcePath: await file('co.pdf', 'Clinical overview, walk stand-in') },
      { ctdSection: '3.2.S.4.2', fileName: 'analytical-procedures.pdf', title: 'Analytical procedures (walk stand-in)', operation: 'new', sourcePath: await file('ap.pdf', 'Analytical procedures, walk stand-in') },
    ] as EctdLeaf[],
  } as Parameters<typeof packageEctdSubmission>[0]);
  const bytes = await fs.readFile(bundle.path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const stored = await getStorageProvider().put({ orgId, projectId: 'sent-packages', filename: `fda-esg-${sha256}.zip`, bytes, mime: 'application/zip',
    metadata: { kind: 'sent-package', region: 'fda', gateway: 'esg', environment: 'production', sha256 } });
  console.info(JSON.stringify({ storageVersionId: stored.vaultVersionId, provider: stored.provider, sha256: stored.sha256, sizeBytes: stored.sizeBytes, filename: `fda-esg-${sha256}.zip` }));
})().catch((e) => { console.error(e); process.exit(1); });
