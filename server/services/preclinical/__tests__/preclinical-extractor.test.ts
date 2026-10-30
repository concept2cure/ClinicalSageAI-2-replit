/**
 * Unit tests for the preclinical extractor.
 *
 * Exercises the extraction admission boundary without a provider or real OCR.
 * Common PDF/OCR behavior is tested in the OCR service's own suites.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const documentTextMock = vi.fn();
vi.mock('../../ocr/extractDocumentText', () => ({
  extractDocumentText: (...args: unknown[]) => documentTextMock(...args),
}));

const structuredMock = vi.fn();
vi.mock('../../../lib/unified-ai-client', () => ({
  ai: {
    structured: (...args: unknown[]) => structuredMock(...args),
  },
}));

import { extractFromPdf, DEFAULT_MODEL } from '../preclinical-extractor';
import { AUTOMATIC_PDF_OCR_BUDGET } from '../../ocr/ocr-budget';

const VALID_RESPONSE = {
  studyType: 'repeat_dose_tox',
  studyTitle: '13-week oral toxicity study in rat',
  species: 'rat',
  strain: 'Sprague-Dawley',
  routeOfAdministration: 'oral gavage',
  durationWeeks: 13,
  glpCompliant: true,
  noael: '50 mg/kg/day',
  loael: '150 mg/kg/day',
  mtd: null,
  keyFindings: 'Mild liver enzyme elevations at 150 mg/kg.',
  targetOrganToxicity: [{ organ: 'liver', severity: 'mild', doseLevel: '150 mg/kg' }],
  carcinogenicityFindings: null,
  genotoxicityResults: null,
  reproductiveToxicity: null,
  safetyMargins: [{ basis: 'AUC', multiple: 12 }],
  studyReportNumber: 'TX-2025-013',
  testingFacility: 'Charles River',
  studyCompletionDate: '2025-09-30',
  extractionConfidence: 0.92,
};

beforeEach(() => {
  structuredMock.mockReset();
  structuredMock.mockResolvedValue(VALID_RESPONSE);
  documentTextMock.mockReset();
  documentTextMock.mockResolvedValue({
    text: 'GLP repeat-dose tox study, 13 weeks, rat, NOAEL 50 mg/kg/day.',
    method: 'pdf-text',
  });
});

describe('extractFromPdf — structured result', () => {
  it('returns parsed PreclinicalStudy data when the LLM output matches the schema', async () => {
    structuredMock.mockResolvedValueOnce(VALID_RESPONSE);
    const result = await extractFromPdf(Buffer.from('mock pdf bytes'), {
      sourcePdfId: 'pdf-123',
    });
    expect(result.data.studyType).toBe('repeat_dose_tox');
    expect(result.data.species).toBe('rat');
    expect(result.data.glpCompliant).toBe(true);
    expect(result.data.extractionConfidence).toBeCloseTo(0.92);
    // The registry alias the extractor asks for, not a wire version — the
    // point of the assertion is that the model reaches the provenance record,
    // and repeating a version string here just made a model bump fail twice
    // for one reason.
    expect(result.model).toBe(DEFAULT_MODEL);
    expect(structuredMock).toHaveBeenCalledTimes(1);
  });

  it('records the model override on the result for provenance', async () => {
    structuredMock.mockResolvedValueOnce(VALID_RESPONSE);
    const result = await extractFromPdf(Buffer.from('mock'), {
      sourcePdfId: 'pdf-456',
      model: 'claude-sonnet-4-6',
    });
    expect(result.model).toBe('claude-sonnet-4-6');
  });

  it('throws when the LLM response fails Zod validation', async () => {
    structuredMock.mockResolvedValueOnce({
      ...VALID_RESPONSE,
      studyType: 'not-a-real-type',
    });
    await expect(
      extractFromPdf(Buffer.from('mock'), { sourcePdfId: 'pdf-789' }),
    ).rejects.toThrow();
  });

  it('throws when extractionConfidence is out of [0, 1]', async () => {
    structuredMock.mockResolvedValueOnce({ ...VALID_RESPONSE, extractionConfidence: 1.5 });
    await expect(
      extractFromPdf(Buffer.from('mock'), { sourcePdfId: 'pdf-999' }),
    ).rejects.toThrow();
  });
});

describe('extractFromPdf — readable and complete report input', () => {
  it('uses the existing PDF/OCR extractor with its bounded automatic OCR budget', async () => {
    const buffer = Buffer.from('mock pdf');
    await extractFromPdf(buffer, { sourcePdfId: 'pdf-common' });
    expect(documentTextMock).toHaveBeenCalledWith(
      buffer, 'application/pdf', 'preclinical-report.pdf',
      { pdfOcrBudget: AUTOMATIC_PDF_OCR_BUDGET },
    );
  });

  it('accepts complete OCR and sends all returned text to structured extraction', async () => {
    const text = 'Study report recovered through OCR. Liver finding at the end.';
    documentTextMock.mockResolvedValue({
      text, method: 'pdf-ocr',
      coverage: { pageCount: 3, pagesRead: 3, limitedBy: null },
    });
    const result = await extractFromPdf(Buffer.from('scan'), { sourcePdfId: 'pdf-scan' });
    expect(result.data).toEqual(VALID_RESPONSE);
    expect(structuredMock.mock.calls[0][0][1].content).toContain(text);
  });

  it.each([
    { pageCount: 150, pagesRead: 100, limitedBy: 'page_budget' },
    { pageCount: 8, pagesRead: 2, limitedBy: 'time_budget' },
    { pageCount: 8, pagesRead: null, limitedBy: 'ocr_failed' },
    { pageCount: 8, pagesRead: 2, limitedBy: null },
    { pageCount: null, pagesRead: 2, limitedBy: null },
    { pageCount: 0, pagesRead: 0, limitedBy: null },
  ])('refuses incomplete or unestablished OCR coverage %j before calling the model', async coverage => {
    documentTextMock.mockResolvedValue({
      text: 'Readable first page; remaining findings have not been read.',
      method: 'pdf-ocr', coverage,
    });
    await expect(extractFromPdf(Buffer.from('scan'), { sourcePdfId: 'pdf-partial' }))
      .rejects.toMatchObject({ name: 'PreclinicalExtractionInputError', code: 'PRECLINICAL_INCOMPLETE_TEXT', coverage });
    expect(structuredMock).not.toHaveBeenCalled();
  });

  it('refuses OCR text with no coverage record', async () => {
    documentTextMock.mockResolvedValue({ text: 'OCR text of unknown coverage.', method: 'pdf-ocr' });
    await expect(extractFromPdf(Buffer.from('scan'), { sourcePdfId: 'pdf-unknown' }))
      .rejects.toMatchObject({ code: 'PRECLINICAL_INCOMPLETE_TEXT' });
    expect(structuredMock).not.toHaveBeenCalled();
  });

  it('refuses a thin text-layer fallback when OCR left pages unread', async () => {
    documentTextMock.mockResolvedValue({
      text: 'Report cover only.', method: 'pdf-text',
      coverage: { pageCount: 30, pagesRead: 2, limitedBy: 'time_budget' },
    });
    await expect(extractFromPdf(Buffer.from('partial'), { sourcePdfId: 'pdf-fallback' }))
      .rejects.toMatchObject({ code: 'PRECLINICAL_INCOMPLETE_TEXT' });
    expect(structuredMock).not.toHaveBeenCalled();
  });

  it('reports unreadable input without making a provider request', async () => {
    documentTextMock.mockResolvedValue({ text: '   ', method: 'none' });
    await expect(extractFromPdf(Buffer.from('unreadable'), { sourcePdfId: 'pdf-empty' }))
      .rejects.toMatchObject({ code: 'PRECLINICAL_NO_TEXT' });
    expect(structuredMock).not.toHaveBeenCalled();
  });

  it('refuses reports beyond the supported input budget instead of silently slicing them', async () => {
    documentTextMock.mockResolvedValue({ text: 'x'.repeat(60_001), method: 'pdf-text' });
    await expect(extractFromPdf(Buffer.from('long'), { sourcePdfId: 'pdf-long' }))
      .rejects.toMatchObject({ code: 'PRECLINICAL_REPORT_TOO_LARGE' });
    expect(structuredMock).not.toHaveBeenCalled();
  });

  it('sends the complete text at the budget boundary', async () => {
    const text = 'x'.repeat(59_990) + 'LAST FACT.';
    documentTextMock.mockResolvedValue({ text, method: 'pdf-text' });
    await extractFromPdf(Buffer.from('limit'), { sourcePdfId: 'pdf-limit' });
    expect(structuredMock.mock.calls[0][0][1].content).toContain(text);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])('rejects invalid input-budget configuration %s', async maxInputChars => {
    await expect(extractFromPdf(Buffer.from('pdf'), { sourcePdfId: 'pdf-budget', maxInputChars }))
      .rejects.toThrow(/maxInputChars/);
    expect(structuredMock).not.toHaveBeenCalled();
  });
});
