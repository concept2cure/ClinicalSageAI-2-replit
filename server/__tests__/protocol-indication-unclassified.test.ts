/**
 * An indication no keyword classifies is not classified "Other".
 *
 * shared/utils/therapeutic-area-classifier.ts returned 'Other' for text that
 * matched no therapeutic-area keyword, and the protocol analyzer took it for a
 * classification: an explicit "Indication: relapsed multiple myeloma" came
 * back as indication "Other", and two unrelated unclassified indications
 * scored as the same therapeutic area in protocol similarity.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));
vi.mock('../db/runtime', () => ({ getPool: () => null }));
vi.mock('../services/enhancedEmbeddingService', () => ({ getEmbeddingService: () => null }));

import { protocolAnalyzerService } from '../protocol-analyzer-service';
import { classifyTherapeuticArea } from '../../shared/utils/therapeutic-area-classifier';

describe('therapeutic-area classification', () => {
  it('returns no area when no keyword matches', () => {
    expect(classifyTherapeuticArea('relapsed multiple myeloma')).toBeNull();
    expect(classifyTherapeuticArea('metastatic carcinoma of the colon')).toBe('Oncology');
  });

  it('keeps an explicit indication it cannot classify, rather than "Other"', async () => {
    const r = await protocolAnalyzerService.analyzeProtocol(
      'Indication: relapsed multiple myeloma\nA phase 2 study.');
    expect(r.indication).toBe('relapsed multiple myeloma');
  });

  it('does not score two unclassified indications as the same area', () => {
    const similarity = (protocolAnalyzerService as unknown as {
      computeSimilarity: (i: Record<string, unknown>, c: Record<string, unknown>) => number | null;
    }).computeSimilarity.bind(protocolAnalyzerService);
    expect(similarity({ indication: 'relapsed multiple myeloma' }, { indication: 'sickle cell disease' })).toBeNull();
  });
});
