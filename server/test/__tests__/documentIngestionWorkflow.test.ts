import fs from 'fs';
import os from 'os';
import path from 'path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { DocumentIngestionWorkflow } from '../../services/documentIngestionWorkflow.js';

describe('DocumentIngestionWorkflow Excel extraction', () => {
  it('extracts text from Excel files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingestion-'));
    const filePath = path.join(tempDir, 'sample.xlsx');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['HeaderA', 'HeaderB']);
    sheet.addRow([1, 2]);
    await workbook.xlsx.writeFile(filePath);

    const workflow = new DocumentIngestionWorkflow();
    const text = await workflow.extractFromExcel(filePath);

    expect(text).toContain('Sheet: Sheet1');
    expect(text).toContain('HeaderA,HeaderB');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
