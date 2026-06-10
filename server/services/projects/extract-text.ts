/**
 * Best-effort text extraction for uploaded project-knowledge files.
 *
 * Binary documents (PDF, DOCX) were previously stored as a placeholder string
 * (`[<mime> document <name>]`), which left them invisible to retrieval and the
 * in-context corpus. This extracts their real text so uploads are searchable.
 * Plain-text types pass through. Never throws — on any failure it returns ''
 * and the caller falls back to its placeholder, so an unparseable file can
 * never break an upload.
 *
 * pdf-parse and mammoth are imported lazily so the cost is paid only when a
 * matching file is uploaded.
 *
 * @module server/services/projects/extract-text
 */

const DOCX_MIMETYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

/** Cap extracted text so a huge document can't blow downstream limits. */
export const MAX_EXTRACTED_CHARS = 200_000;

function clip(text: string): string {
  const trimmed = (text || '').trim();
  return trimmed.length > MAX_EXTRACTED_CHARS ? trimmed.slice(0, MAX_EXTRACTED_CHARS) : trimmed;
}

export async function extractUploadedText(
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<string> {
  if (!buffer || buffer.length === 0) return '';
  try {
    if (mimetype.startsWith('text/')) {
      return clip(buffer.toString('utf8'));
    }
    if (mimetype === 'application/pdf' || /\.pdf$/i.test(filename)) {
      const mod: any = await import('pdf-parse');
      const pdfParse = mod.default ?? mod;
      const parsed = await pdfParse(buffer);
      return clip(typeof parsed?.text === 'string' ? parsed.text : '');
    }
    if (DOCX_MIMETYPES.has(mimetype) || /\.docx?$/i.test(filename)) {
      const mod: any = await import('mammoth');
      const mammoth = mod.default ?? mod;
      const result = await mammoth.extractRawText({ buffer });
      return clip(typeof result?.value === 'string' ? result.value : '');
    }
    return '';
  } catch (err: any) {
    console.warn('[projects] text extraction failed (using fallback):', err?.message);
    return '';
  }
}
