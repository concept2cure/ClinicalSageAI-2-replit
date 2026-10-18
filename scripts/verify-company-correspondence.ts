/** Synthetic actual-renderer qualification. Run with Node 22 and a configured
 * LibreOffice binary; no provider, submission transmission or customer data.
 * LIBREOFFICE_BIN may point at an operator-managed wrapper. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import AdmZip from 'adm-zip';
import { PDFParse } from 'pdf-parse';
import { normalizeTemplateSpec } from '../shared/templates/template-spec.ts';
import { stableStringify } from '../shared/canonical-json.ts';
import { companyPresentationSnapshot } from '../server/services/company-documents/history.ts';
import { companyProfileHash } from '../server/services/company-documents/provenance.ts';
import { renderAuthoringExport } from '../server/services/authoring/authoring-export.ts';
const destination = path.resolve(process.env.COMPANY_CORRESPONDENCE_PROOF_DIR ?? 'docs/evidence/COMPANY-DOCUMENTS/gap-closure/correspondence');
await fs.mkdir(destination, { recursive: true });
const programId = '11111111-1111-4111-8111-111111111111';
const variantId = '44444444-4444-4444-8444-444444444444';
const logo = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const profile = { version: 1 as const, revision: 4, companyName: 'Historical Subsidiary Therapeutics', address: '120 Historical Avenue', contact: 'legal@example.test', registrationDetails: 'Synthetic company registration 123', importedFrom: null,
  brandingAdopted: true, applyToReports: false, applyToSubmissionCorrespondence: false, variantId, legalDocuments: [],
  letterhead: normalizeTemplateSpec({ page: { size: 'a4', orientation: 'landscape' }, brand: { logo: { dataBase64: logo, mimeType: 'image/png', placement: 'header' }, confidentialityNotice: 'Synthetic historical confidentiality' }, header: { text: 'Historical published variant header', showLogo: true, alignment: 'left' }, footer: { text: 'Historical published footer', showPageNumbers: true } }) };
const snapshot = companyPresentationSnapshot(profile);
const digest = createHash('sha256').update(stableStringify(snapshot)).digest('hex');
let currentCompanyName = 'Current unrelated parent brand';
let historicalReads = 0;
const q = { async query(sql: string, args?: unknown[]) {
  if (sql.includes('FROM company_document_revisions')) {
    if (args?.[0] !== 7 || args?.[1] !== 4 || args?.[2] !== variantId) throw new Error('Wrong historical presentation scope');
    historicalReads++;
    return { rows: [{ profile: snapshot, sha256: digest }] };
  }
  if (sql.includes('FROM organizations')) throw new Error(`Historical render incorrectly read current branding ${currentCompanyName}`);
  return { rows: [] };
} };
const origin = { version: 1 as const, organizationId: 7, programId, projectId: 42, submissionId: 5, sequenceId: 9, sequenceNumber: '0002', submissionTitle: 'Synthetic agency response', applicationType: 'ind', applicationNumber: 'IND123456', applicantName: 'Recorded applicant', country: 'US', agency: 'FDA', recipient: { authority: 'FDA', basis: 'recorded_filing_market' }, companyDocumentRevision: 4, companyProfileHash: companyProfileHash(profile), companyBrandingApplied: true, variantId, explicitSelection: true };
const args = { executor: q, tenantId: 7, doc: { id: '22222222-2222-4222-8222-222222222222', title: 'Synthetic historical correspondence', status: 'APPROVED', client_program_id: programId, provenance: { source: 'seed', companyCorrespondence: origin } },
  sections: [{ id: 'section-1', code: 'correspondence', title: 'Response for reviewed filing', content: '<p><strong>Reviewed correspondence body.</strong></p>' + Array.from({ length: 120 }, (_, index) => `<p>Synthetic reviewed response paragraph ${index + 1}. Filing identity remains IND123456, sequence 0002.</p>`).join('') }], signatures: [] };
const word = await renderAuthoringExport({ ...args, format: 'docx' });
const pdf = await renderAuthoringExport({ ...args, format: 'pdf' });
currentCompanyName = 'Changed current company branding after historical publication';
const repeated = await renderAuthoringExport({ ...args, format: 'pdf' });
const parser = new PDFParse({data: pdf.fileContent});
const parsed = await parser.getText();
await parser.destroy();
for (const required of [profile.companyName, profile.address, 'Historical published variant header', 'Historical published footer', 'Electronic signatures', 'No electronic signatures are recorded', 'Reviewed correspondence body.']) {
  if (!parsed.text.includes(required)) throw new Error(`PDF missing required text: ${required}`);
}
if (parsed.text.includes(currentCompanyName)) throw new Error('Current brand leaked into historical PDF');
if (parsed.pages.length < 2) throw new Error('Expected multi-page proof');
if (pdf.fileContent.toString('latin1').match(/\/Subtype\s*\/Image/g)?.length === undefined) throw new Error('PDF contains no embedded logo image');
const parserAgain = new PDFParse({data: repeated.fileContent});
const repeatedText = await parserAgain.getText();
await parserAgain.destroy();
if (parsed.text !== repeatedText.text) throw new Error('Historical PDF text changed after unrelated current branding changed');
async function pdfAppearanceIdentity(bytes: Buffer) {
  const parsedPdf = await PDFDocument.load(bytes);
  return {pages: parsedPdf.getPages().map(page => page.getSize()), images: parsedPdf.context.enumerateIndirectObjects()
    .filter(([,object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))
    .map(([,object]) => createHash('sha256').update((object as {contents:Buffer}).contents).digest('hex')).sort()};
}
const appearance = await pdfAppearanceIdentity(pdf.fileContent);
if (stableStringify(appearance) !== stableStringify(await pdfAppearanceIdentity(repeated.fileContent))) throw new Error('Historical page geometry or logo changed after current brand change');
const zip = new AdmZip(word.fileContent);
if (!zip.getEntries().some(entry => entry.entryName.startsWith('word/media/') && entry.getData().equals(Buffer.from(logo, 'base64')))) throw new Error('Original logo bytes absent from Word');
await fs.writeFile(`${destination}/historical-correspondence.docx`, word.fileContent);
await fs.writeFile(`${destination}/historical-correspondence.pdf`, pdf.fileContent);
await fs.writeFile(`${destination}/historical-correspondence.txt`, parsed.text);
const summary = { syntheticFixture: true, actualRenderer: 'canonical Authoring DOCX -> strict LibreOffice PDF converter', noProviderCalled: true, historicalReads, retainedVariantId: variantId, retainedRevision: 4, explicitSelectionOverridesAutomaticDefault: profile.applyToSubmissionCorrespondence === false,
  pageCount: parsed.pages.length, originalLogoBytesInWord: true, embeddedLogoImageInPdf: true, mandatorySignatureStatementPreserved: true, currentBrandingNeverRead: true, historicalTextGeometryAndLogoStableAfterCurrentBrandChange: true, repeatedPdfBinaryIdentical: pdf.fileContent.equals(repeated.fileContent), repeatedPdfSha256: repeated.artifactSha256, pageGeometryAndImageHashes: appearance,
  wordSha256: word.artifactSha256, pdfSha256: pdf.artifactSha256, pdfBytes: pdf.fileContent.length };
await fs.writeFile(`${destination}/verification.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
