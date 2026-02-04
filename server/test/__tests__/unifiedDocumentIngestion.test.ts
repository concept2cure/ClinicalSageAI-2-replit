import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { UnifiedDocumentIngestion } from '../../services/unifiedDocumentIngestion.js';

describe('UnifiedDocumentIngestion Excel extraction', () => {
  it('extracts text from an Excel workbook', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.addRow(['ColA', 'ColB']);
    sheet.addRow(['Value1', 'Value2']);

    const ingestion = new UnifiedDocumentIngestion();
    const text = ingestion.extractExcelText(workbook);

    expect(text).toContain('--- Sheet: Data ---');
    expect(text).toContain('ColA,ColB');
    expect(text).toContain('Value1,Value2');
  });
});
