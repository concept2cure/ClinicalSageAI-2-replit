import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { ValidationError } from '../submission-gateways/types';
import type { LeafSourceIntegrity, OriginalPdfProof, RegisteredLegalOriginalRef } from './original-pdf-contract';
import { assessOriginalPdfIntegrity, validateOriginalPdfA } from './original-pdf-integrity';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const HASH = /^[a-f0-9]{64}$/i;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function refuse(message: string, fileName: string, ruleId = 'ORIGINAL-PDF-INTEGRITY'): never {
  throw new ValidationError(`${message} Nothing was packaged. Original legal and signed PDFs must remain unchanged.`,
    [{ ruleId, severity: 'error', filePath: fileName }]);
}

function immutableReference(record: Record<string, unknown>, vaultDocumentId: string): RegisteredLegalOriginalRef {
  if (typeof record.id !== 'string' || !record.id || typeof record.programId !== 'string' || !UUID.test(record.programId)
    || typeof record.version !== 'string' || !record.version || typeof record.contentHash !== 'string' || !HASH.test(record.contentHash)) {
    refuse('The registered legal original has incomplete immutable version metadata.', vaultDocumentId);
  }
  return { registryId: record.id, programId: record.programId, version: record.version, contentHash: record.contentHash.toLowerCase() };
}

function referenceForVault(entry: unknown, vaultDocumentId: string, sourceSha256: string, programId: string): RegisteredLegalOriginalRef | null {
    if (!entry || typeof entry !== 'object' || !('vaultDocumentId' in entry) || typeof entry.vaultDocumentId !== 'string') {
      refuse('The company legal registry contains an unverifiable version reference.', vaultDocumentId);
    }
    if (entry.vaultDocumentId.toLowerCase() !== vaultDocumentId.toLowerCase()) return null;
    const reference = immutableReference(entry as Record<string, unknown>, vaultDocumentId);
    if (reference.contentHash !== sourceSha256) refuse('The registered legal original no longer matches its source SHA-256.', vaultDocumentId);
    if (reference.programId.toLowerCase() !== programId?.toLowerCase()) refuse('The registered legal original belongs to a different source program.', vaultDocumentId);
    return reference;
}

/** Called only after tenant/program admission and original-byte verification. */
export function vaultLeafSourceIntegrity(registry: unknown, vaultDocumentId: string, sourceSha256: string, programId: string): LeafSourceIntegrity {
  if (registry != null && !Array.isArray(registry)) refuse('The company legal registry could not be verified.', vaultDocumentId);
  const references = ((registry ?? []) as unknown[]).flatMap(entry => {
    const reference = referenceForVault(entry, vaultDocumentId, sourceSha256, programId);
    return reference ? [reference] : [];
  });
  return { sourceSha256, vaultDocumentId, registeredLegalOriginals: references.sort((a, b) => a.registryId.localeCompare(b.registryId)) };
}

/** Source digests are checked even when an ordinary unsigned Vault PDF may be normalized. */
export function assertLeafSourceIntegrity(bytes: Buffer, fileName: string, source?: LeafSourceIntegrity): void {
  if (!source) return;
  if (!HASH.test(source.sourceSha256) || !UUID.test(source.vaultDocumentId) || !Array.isArray(source.registeredLegalOriginals)) {
    refuse('The admitted Vault source identity is invalid.', fileName);
  }
  if (sha256(bytes) !== source.sourceSha256) refuse('The staged PDF no longer matches its admitted source SHA-256.', fileName);
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') refuse('The admitted Vault original is not a PDF.', fileName);
  for (const reference of source.registeredLegalOriginals) {
    if (!reference.registryId || !UUID.test(reference.programId) || !reference.version || reference.contentHash !== source.sourceSha256) {
      refuse('The admitted legal version does not match the PDF source.', fileName);
    }
  }
}

/** Validation inspects the retained original; it never converts or rewrites it. */
export async function prepareOriginalPdf(bytes: Buffer, fileName: string, source?: LeafSourceIntegrity): Promise<OriginalPdfProof | undefined> {
  assertLeafSourceIntegrity(bytes, fileName, source);
  let signed: boolean;
  try { ({ signed } = await assessOriginalPdfIntegrity(bytes)); }
  catch (error) { return refuse(error instanceof Error ? error.message : 'The PDF signature structure could not be verified.', fileName, 'ORIGINAL-PDF-SIGNATURE-UNVERIFIABLE'); }
  const references = source?.registeredLegalOriginals ?? [];
  if (!signed && references.length === 0) return undefined;
  const hash = sha256(bytes);
  return {
    version: 1,
    reasons: [...(references.length ? ['registered-legal' as const] : []), ...(signed ? ['embedded-signature' as const] : [])],
    sourceSha256: hash, shippedSha256: hash,
    ...(source ? { vaultDocumentId: source.vaultDocumentId } : {}),
    registeredLegalOriginals: references,
    embeddedSignature: signed ? 'present' : 'absent', cryptographicSignatureValidation: 'not-performed',
    pdfAValidation: await validateOriginalPdfA(bytes),
  };
}

export function requireOriginalPdfA(proof: OriginalPdfProof, fileName: string): void {
  if (!proof.pdfAValidation.valid) {
    refuse(`The preserved original '${fileName}' could not be validated as PDF/A (${proof.pdfAValidation.reason}). ` +
      'This deployment requires PDF/A. Obtain a compliant original before signing or registering it, or have an authorized administrator review the PDF/A policy; conversion would alter the legal original.',
    fileName, 'ORIGINAL-PDF-PDFA-UNVERIFIED');
  }
}

/** Verify the actual compressed artifact before delivery, including later ZIP name collisions. */
export async function verifyPreservedOriginalsArchive(archive: Buffer, originals: Array<{ href: string; proof: OriginalPdfProof }>): Promise<void> {
  if (!originals.length) return;
  const zip = await JSZip.loadAsync(archive);
  for (const { href, proof } of originals) {
    const file = zip.file(href);
    if (!file) refuse('The final ZIP omitted a preserved original.', href);
    const finalHash = sha256(await file.async('nodebuffer'));
    if (finalHash !== proof.sourceSha256 || finalHash !== proof.shippedSha256) {
      refuse('The final ZIP changed a preserved original or its shipping proof.', href);
    }
  }
}
