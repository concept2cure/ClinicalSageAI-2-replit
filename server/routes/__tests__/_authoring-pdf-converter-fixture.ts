/** A converter seam for route/transaction tests, not LibreOffice qualification.
 * Read the real Word input and emit a real PDF with the existing leaf helper.
 * The separate actual-converter proof owns typography and layout fidelity. */
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { decodeHtmlEntities } from '../../export/decode-html-entities';
import { escapeHtml } from '../../export/authoring-blocks-to-html';
import { renderLeafPdf } from '../../services/ectd/leaf-pdf-renderer';
import type { PdfConvertResult } from '../../services/pdf-converter';

export async function wordPart(input: Buffer, name = 'word/document.xml'): Promise<string> {
  const zip = await JSZip.loadAsync(input);
  return zip.file(name)?.async('string') ?? '';
}

export async function wordBody(input: Buffer): Promise<string> {
  return decodeHtmlEntities((await wordPart(input)).replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ''));
}

export async function convertedPdfFixture(input: Buffer): Promise<PdfConvertResult> {
  const text = await wordBody(input);
  const pdf = await renderLeafPdf(`<p>${escapeHtml(text)}</p>`, { title: 'DOCX converter test seam' });
  return { pdf, sha256: createHash('sha256').update(pdf).digest('hex'), backend: 'libreoffice', originalBytes: pdf.length };
}
