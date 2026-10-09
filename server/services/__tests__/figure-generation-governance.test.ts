/**
 * generateFigure draws a figure from data, with an approved model, or not at all.
 *
 * Figures are stored as governed artifacts in concept2cure_artifacts, and
 * document export includes them. Until 2026-09-23:
 *   - with no source data the model was asked for "a representative template",
 *     so Kaplan-Meier curves, PK profiles and CONSORT counts were invented;
 *   - with no OpenAI key a placeholder figure was stored as a success;
 *   - the call defaulted to gpt-4o as a 'general' request, and modelUsed
 *     recorded that default rather than the model that served.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const S = vi.hoisted(() => ({
  chat: vi.fn(),
  inserts: [] as Array<{ sql: string; params: unknown[] }>,
}));

vi.mock('../../db.js', () => ({
  pool: {
    query: async (sql: string, params: unknown[] = []) => {
      if (/^\s*INSERT/i.test(sql)) {
        S.inserts.push({ sql, params });
        return { rows: [{ id: 101 }] };
      }
      if (/COUNT\(\*\)/.test(sql)) return { rows: [{ count: '0' }] };
      return { rows: [] };
    },
  },
}));
vi.mock('../auditService', () => ({ default: { logAction: async () => undefined } }));
vi.mock('../provenance/artifact-provenance', () => ({ recordArtifactProvenance: async () => undefined }));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: S.chat } }));

import { generateFigure } from '../figureGenerationService';

const BASE = {
  projectId: 5,
  organizationId: 9,
  userId: 1,
  figureType: 'bar_chart' as const,
  title: 'Response rate by arm',
  description: 'Objective response rate, treatment vs placebo',
  targetSection: '2.7.3',
};

beforeEach(() => {
  S.chat.mockReset();
  S.inserts.length = 0;
});

describe('generateFigure', () => {
  it('with no source data, refuses and asks no model and stores nothing', async () => {
    const r = await generateFigure(BASE);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/No source data/);
    expect(S.chat).not.toHaveBeenCalled();
    expect(S.inserts).toEqual([]);
  });

  it('with data, drafts as document_drafting with no model pinned and records the model that served', async () => {
    S.chat.mockResolvedValue({ content: 'graph TD\n A[Treatment 42%] --> B[Placebo 18%]', model: 'claude-opus-5', usage: { totalTokens: 10 } });
    const r = await generateFigure({ ...BASE, rawData: [{ arm: 'treatment', orr: 0.42 }, { arm: 'placebo', orr: 0.18 }] });
    expect(r.success).toBe(true);
    const [req] = S.chat.mock.calls[0];
    expect(req.taskType).toBe('document_drafting');
    expect(req.model).toBeUndefined();
    expect(r.figure?.metadata.modelUsed).toBe('claude-opus-5');
  });

  it('an empty draft is not stored', async () => {
    S.chat.mockResolvedValue({ content: '', model: 'claude-opus-5' });
    const r = await generateFigure({ ...BASE, rawData: [{ arm: 'treatment', orr: 0.42 }] });
    expect(r.success).toBe(false);
    expect(S.inserts).toEqual([]);
  });
});
