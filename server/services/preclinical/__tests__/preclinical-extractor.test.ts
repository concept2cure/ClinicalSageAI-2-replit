/**
 * Unit tests for the preclinical extractor.
 *
 * Mocks the pdf-parse wrapper (the only filesystem-touching dependency) and
 * the unified AI client so the test runs offline and is fully deterministic.
 * The extractor imports the default export of ../../utils/pdfParse, which
 * loads pdf-parse via createRequire; mock that wrapper directly so the mock
 * actually reaches the consumer (mocking 'pdf-parse' does not, since the
 * wrapper's require() returns the real CJS export shape).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/pdfParse', () => ({
  default: vi.fn(async (_buf: Buffer) => ({
    text: 'GLP repeat-dose tox study, 13 weeks, rat, NOAEL 50 mg/kg/day.',
  })),
}));

const structuredMock = vi.fn();
vi.mock('../../../lib/unified-ai-client', () => ({
  ai: {
    structured: (...args: unknown[]) => structuredMock(...args),
  },
}));

import { extractFromPdf } from '../preclinical-extractor';

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

describe('extractFromPdf', () => {
  beforeEach(() => {
    structuredMock.mockReset();
  });

  it('returns parsed PreclinicalStudy data when the LLM output matches the schema', async () => {
    structuredMock.mockResolvedValueOnce(VALID_RESPONSE);
    const result = await extractFromPdf(Buffer.from('mock pdf bytes'), {
      sourcePdfId: 'pdf-123',
    });
    expect(result.data.studyType).toBe('repeat_dose_tox');
    expect(result.data.species).toBe('rat');
    expect(result.data.glpCompliant).toBe(true);
    expect(result.data.extractionConfidence).toBeCloseTo(0.92);
    expect(result.model).toBe('claude-opus-4-7');
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
