import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';

const h = vi.hoisted(() => ({ validation: { valid: false, reason: 'veraPDF unavailable in this fixture' } }));
vi.mock('../../ectd/pdfa-pipeline', () => ({
  finalizePdfA: vi.fn(async (bytes: Buffer) => ({
    pdfBytes: Buffer.concat([bytes, Buffer.from('\n% toolchain changed the document')]),
    converted: true, pdfaPart: '1', warnings: [],
  })),
}));
vi.mock('../../ectd/original-pdf-integrity', async original => ({
  ...(await original<typeof import('../../ectd/original-pdf-integrity')>()),
  validateOriginalPdfA: vi.fn(async () => h.validation),
}));

import { packageEctdSubmission, type PackagerInput } from '../regional-packager';
import { finalizePdfA } from '../../ectd/pdfa-pipeline';
import { buildLeafManifest } from '../../ectd/sequence-manifest';
import { verifyPreservedOriginalsArchive, vaultLeafSourceIntegrity } from '../../ectd/original-pdf-preservation';
import { signedPdfFixture, plainPdfFixture } from '../../ectd/__tests__/support/signed-pdf-fixture';
import { evaluatePreTransmit } from '../pre-transmit-check';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const VAULT = '33333333-3333-4333-8333-333333333333';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const directories: string[] = [];
let oldRequire: string | undefined;
beforeEach(() => {
  oldRequire = process.env.ECTD_REQUIRE_PDFA;
  delete process.env.ECTD_REQUIRE_PDFA;
  h.validation = { valid: false, reason: 'veraPDF unavailable in this fixture' };
  vi.clearAllMocks();
});
afterEach(async () => {
  if (oldRequire === undefined) delete process.env.ECTD_REQUIRE_PDFA;
  else process.env.ECTD_REQUIRE_PDFA = oldRequire;
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

const plainPdf = () => plainPdfFixture('Reviewed company authorization');

async function inputFor(bytes: Buffer, registered = true): Promise<PackagerInput> {
  const directory = await mkdtemp(join(tmpdir(), 'legal-final-zip-'));
  directories.push(directory);
  const sourcePath = join(directory, 'authorization.pdf');
  await writeFile(sourcePath, bytes);
  const sourceIntegrity = vaultLeafSourceIntegrity(registered ? [{
    id: 'legal-original', programId: PROGRAM, vaultDocumentId: VAULT,
    contentHash: sha(bytes), version: 'v2', active: true,
  }] : [], VAULT, sha(bytes), PROGRAM);
  return { region: 'ema', applicationId: 'MAA123', sequence: '0000', submissionType: 'maa',
    sponsorId: 'ORG123', sponsorName: 'Recorded Applicant', productName: 'Product', outputDir: directory,
    leaves: [{ ctdSection: 'm2.5', operation: 'new', sourcePath, fileName: 'authorization.pdf', title: 'Company authorization', sourceIntegrity }],
  };
}

describe('final eCTD ZIP retains legal and signed originals', () => {
  it('preserves an admitted registered legal version despite a toolchain that would change it, retaining proof through the persisted manifest', async () => {
    const original = await plainPdf();
    const bundle = await packageEctdSubmission(await inputFor(original));
    const zip = await JSZip.loadAsync(await readFile(bundle.path));
    const entry = bundle.leafManifest![0];
    expect(await zip.file(entry.href)!.async('nodebuffer')).toEqual(original);
    expect(finalizePdfA).not.toHaveBeenCalled();
    expect(entry.originalPdfProof).toMatchObject({ reasons: ['registered-legal'], sourceSha256: sha(original), shippedSha256: sha(original),
      vaultDocumentId: VAULT, registeredLegalOriginals: [{ registryId: 'legal-original', programId: PROGRAM, version: 'v2', contentHash: sha(original) }],
      embeddedSignature: 'absent', cryptographicSignatureValidation: 'not-performed', pdfAValidation: { valid: false } });
    expect(buildLeafManifest(bundle.leafManifest!)[0].originalPdfProof).toEqual(entry.originalPdfProof);
    expect(entry.md5).toBe(createHash('md5').update(original).digest('hex'));
  });

  it('independently preserves an unregistered PDF with compressed embedded-signature fields without claiming signature trust', async () => {
    const original = await signedPdfFixture(true);
    const bundle = await packageEctdSubmission(await inputFor(original, false));
    const entry = bundle.leafManifest![0];
    const zip = await JSZip.loadAsync(await readFile(bundle.path));
    expect(await zip.file(entry.href)!.async('nodebuffer')).toEqual(original);
    expect(finalizePdfA).not.toHaveBeenCalled();
    expect(entry.originalPdfProof).toMatchObject({ reasons: ['embedded-signature'], embeddedSignature: 'present', cryptographicSignatureValidation: 'not-performed' });
  });

  it('continues normalizing an ordinary unsigned PDF and makes no original-preservation claim', async () => {
    const original = await plainPdf();
    const bundle = await packageEctdSubmission(await inputFor(original, false));
    const entry = bundle.leafManifest![0];
    const zip = await JSZip.loadAsync(await readFile(bundle.path));
    expect(await zip.file(entry.href)!.async('nodebuffer')).not.toEqual(original);
    expect(finalizePdfA).toHaveBeenCalledOnce();
    expect(entry.originalPdfProof).toBeUndefined();
  });

  it('refuses staged bytes that no longer match the admitted original before invoking conversion', async () => {
    const original = await plainPdf();
    const input = await inputFor(original);
    await writeFile(input.leaves[0].sourcePath, Buffer.concat([original, Buffer.from('\nchanged')]));
    await expect(packageEctdSubmission(input)).rejects.toThrow('admitted source SHA-256');
    expect(finalizePdfA).not.toHaveBeenCalled();
  });

  it('fails closed when an embedded signature dictionary is malformed', async () => {
    const original = await signedPdfFixture();
    const input = await inputFor(original, false);
    const malformed = Buffer.from(original.toString('latin1').replace('/ByteRange', '/BadRanges'), 'latin1');
    await writeFile(input.leaves[0].sourcePath, malformed);
    delete input.leaves[0].sourceIntegrity;
    await expect(packageEctdSubmission(input)).rejects.toThrow('signature');
    expect(finalizePdfA).not.toHaveBeenCalled();
  });

  it('requires actual validation of the original under mandatory PDF/A, with no preservation exemption', async () => {
    process.env.ECTD_REQUIRE_PDFA = 'true';
    const input = await inputFor(await plainPdf());
    await expect(packageEctdSubmission(input)).rejects.toThrow(/requires PDF\/A.*compliant original/);
    expect(finalizePdfA).not.toHaveBeenCalled();
    h.validation = { valid: true, reason: 'veraPDF explicitly validated the retained original' };
    const bundle = await packageEctdSubmission(input);
    expect(bundle.submissionGrade).toMatchObject({ pdfaConverted: 0, pdfaValidatedOriginals: ['authorization.pdf'], notConverted: [], allPdfA: true });
    expect(finalizePdfA).not.toHaveBeenCalled();
  });

  it('retains actionable failure evidence for an organization PDF/A policy checked later at transmission', async () => {
    const bundle = await packageEctdSubmission(await inputFor(await plainPdf()));
    expect(bundle.submissionGrade?.originalPdfAValidationFailures).toEqual([{ fileName: 'authorization.pdf', reason: h.validation.reason }]);
    const verdict = evaluatePreTransmit({ region: 'ema', bundle, environment: 'production', enforceExternal: false,
      pdfa: { required: true, source: 'organization' }, env: {} });
    expect(verdict.cleared).toBe(false);
    expect(verdict.blockers.join(' ')).toContain('Originals are never converted');
  });

  it('verifies extracted final ZIP bytes, refusing a missing or overwritten preserved original', async () => {
    const bundle = await packageEctdSubmission(await inputFor(await plainPdf()));
    const entry = bundle.leafManifest![0];
    const zip = await JSZip.loadAsync(await readFile(bundle.path));
    zip.file(entry.href, await plainPdf());
    // Ensure a deterministic different value even when two PDFs share their metadata timestamp.
    zip.file(entry.href, Buffer.from('%PDF-altered-original'));
    await expect(verifyPreservedOriginalsArchive(await zip.generateAsync({ type: 'nodebuffer' }), [{ href: entry.href, proof: entry.originalPdfProof! }])).rejects.toThrow('final ZIP changed');
    zip.remove(entry.href);
    await expect(verifyPreservedOriginalsArchive(await zip.generateAsync({ type: 'nodebuffer' }), [{ href: entry.href, proof: entry.originalPdfProof! }])).rejects.toThrow('omitted');
  });
});
