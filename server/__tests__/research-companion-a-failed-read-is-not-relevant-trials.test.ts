/**
 * The research companion does not feed the model invented trials or sources
 * when its reads fail.
 *
 * What it used to do (until 2026-10-22): when the csr_reports query failed,
 * findRelevantCSRs returned up to three invented "fallback" trials (ids
 * 9001-9003, "Phase 3 Trial of Novel Treatment for Advanced Cancer", ...) that
 * matched a word of the question, and generateResponse put them in the prompt
 * as RELEVANT TRIAL entries. findRelevantAcademicSources did the same with
 * three invented "Concept2Cure Knowledge Base" sources carrying relevance 0.9,
 * 0.85 and 0.8. Both reads now throw, and so does the reply built on them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  queryHuggingFace: vi.fn(),
  generateEmbeddings: vi.fn(),
  retrieveKnowledge: vi.fn(),
  select: vi.fn(),
}));

vi.mock('shared/schema', () => ({ csrReports: { title: 'title', indication: 'indication', sponsor: 'sponsor' } }));
vi.mock('../db', () => ({ db: { select: h.select } }));
vi.mock('../huggingface-service', () => ({
  huggingFaceService: { queryHuggingFace: h.queryHuggingFace, generateEmbeddings: h.generateEmbeddings },
  HFModel: { TEXT: 'text' },
}));
vi.mock('../academic-knowledge-service', () => ({ academicKnowledgeService: { retrieveKnowledge: h.retrieveKnowledge } }));

import { researchCompanionService } from '../research-companion-service';

type Internals = {
  findRelevantCSRs: (q: string, limit?: number) => Promise<unknown[]>;
  findRelevantAcademicSources: (q: string, limit?: number) => Promise<unknown[]>;
};
const svc = researchCompanionService as unknown as Internals;

const failingSelect = () => ({
  from: () => ({ where: () => ({ limit: () => Promise.reject(new Error('relation "csr_reports" does not exist')) }) }),
});

beforeEach(() => {
  h.queryHuggingFace.mockReset().mockResolvedValue('An answer.');
  h.generateEmbeddings.mockReset().mockResolvedValue([0.1]);
  h.retrieveKnowledge.mockReset().mockResolvedValue([]);
  h.select.mockReset().mockImplementation(failingSelect);
});

describe('a failed read is an error, not relevant trials', () => {
  it('findRelevantCSRs throws when the query fails', async () => {
    await expect(
      svc.findRelevantCSRs('phase 3 cancer treatment', 3),
      'a failed csr_reports read was answered with invented trials',
    ).rejects.toThrow();
  });

  it('findRelevantAcademicSources throws when the retrieval fails', async () => {
    h.retrieveKnowledge.mockRejectedValue(new Error('knowledge store unavailable'));
    await expect(svc.findRelevantAcademicSources('oncology endpoints', 3)).rejects.toThrow();
  });

  it('no reply is generated from invented trials', async () => {
    const { id } = await researchCompanionService.createConversation();
    await expect(researchCompanionService.addMessageToConversation(id, 'phase 3 cancer treatment')).rejects.toThrow();
    const prompts = h.queryHuggingFace.mock.calls.map(c => String(c[0])).join('\n');
    expect(prompts).not.toMatch(/Novel Treatment for Advanced Cancer|9001|Concept2Cure Knowledge Base/);
  });
});
