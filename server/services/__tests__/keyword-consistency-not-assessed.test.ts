/**
 * Keyword "consistency" across documents is reported for the documents given,
 * and is not called consistent when nothing compared them.
 *
 * checkKeywordConsistency read the organisation's last 20 'keywords_extracted'
 * audit rows (whatever documents those were), marked every shared term
 * `isConsistent: true` ("Default — would need deeper analysis"), and turned
 * any failure into [] — "no inconsistent terms". The database and the model
 * client are the only things replaced.
 */
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(async () => ({ rows: [] })) }));
vi.mock('../../db.js', () => ({ pool: { query: h.query } }));
vi.mock('../auditService', () => ({ default: { logAction: async () => undefined } }));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: vi.fn() } }));

import { checkKeywordConsistency } from '../keywordExtractionService';

describe('checkKeywordConsistency', () => {
  const docs = [
    { id: 'a', title: 'Protocol', content: 'Each SAE is reported within 24 hours. The primary endpoint is ORR.' },
    { id: 'b', title: 'SAP', content: 'The primary endpoint is analysed by stratified test. SAE listings follow.' },
    { id: 'c', title: 'IB', content: 'Dissolution data are summarised.' },
  ];

  it('lists the terms the given documents share, and judges none of them', async () => {
    const r = await checkKeywordConsistency(docs);
    const terms = r.terms.map((t) => t.term).sort();
    expect(terms).toEqual(['primary endpoint', 'sae']);
    for (const t of r.terms) {
      expect(t.isConsistent).toBeNull();
      expect(t.documents.map((d) => d.documentId).sort()).toEqual(['a', 'b']);
    }
    expect(r.assessed).toBe(false);
    expect(h.query).not.toHaveBeenCalled();
  });
});
