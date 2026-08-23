/**
 * Document text extraction for memory ingestion.
 *
 * Pure, self-contained buffer→text extraction across the formats the client and
 * project intelligence ingest paths accept (plain text / markdown / CSV, PDF,
 * DOCX, XLSX). Parser libraries are loaded lazily via dynamic import so the
 * module carries no heavy top-level dependencies, and every parser is wrapped so
 * a failure degrades to a descriptive placeholder rather than throwing. No
 * database or tenant context — extracted verbatim from client-intelligence-memory
 * to shrink that governed file and put the extraction under direct test.
 *
 * @module server/services/memory/document-text-extraction
 */

/**
 * Extract text from an uploaded file buffer based on MIME type.
 * Uses available parsers for PDF, DOCX, Excel, CSV, and plain text.
 */
export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<{ text: string; pageCount?: number }> {
  try {
    // Plain text / Markdown
    if (
      mimeType === 'text/plain' ||
      mimeType === 'text/markdown' ||
      mimeType === 'text/csv' ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.md') ||
      fileName.endsWith('.csv')
    ) {
      const text = buffer.toString('utf-8');
      return { text };
    }

    // PDF
    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const result = await pdfParse(buffer);
        return { text: result.text, pageCount: result.numpages };
      } catch {
        return { text: `[PDF file: ${fileName} — text extraction unavailable]` };
      }
    }

    // DOCX
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')
    ) {
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return { text: result.value };
      } catch {
        return { text: `[DOCX file: ${fileName} — text extraction unavailable]` };
      }
    }

    // XLSX / Excel
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel' ||
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls')
    ) {
      try {
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        // exceljs's own typings resolve `Buffer` through the older
        // @types/node bundled under its @fast-csv/* dependencies, so it is a
        // structurally different interface from the root @types/node 26
        // `Buffer<ArrayBufferLike>` this file has. The runtime value is a real
        // Node Buffer and exceljs handles it; only the two type copies
        // disagree. Cast at this one boundary rather than deduping the
        // dependency tree, which is a far wider change than a typecheck fix.
        await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
        const textParts: string[] = [];
        workbook.eachSheet((worksheet) => {
          textParts.push(`\n--- Sheet: ${worksheet.name} ---\n`);
          worksheet.eachRow((row) => {
            const values = row.values as any[];
            if (Array.isArray(values)) {
              textParts.push(values.slice(1).map(v => String(v ?? '')).join('\t'));
            }
          });
        });
        return { text: textParts.join('\n') };
      } catch {
        return { text: `[Excel file: ${fileName} — text extraction unavailable]` };
      }
    }

    // Fallback
    return { text: `[File: ${fileName} (${mimeType}) — unsupported format for text extraction]` };
  } catch (err: any) {
    console.error(`[ClientIntelligence] Text extraction failed for ${fileName}:`, err.message);
    return { text: `[File: ${fileName} — extraction error: ${err.message}]` };
  }
}
