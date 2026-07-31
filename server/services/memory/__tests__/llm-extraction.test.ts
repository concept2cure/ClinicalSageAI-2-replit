import { describe, it, expect, vi } from 'vitest';
import {
  parseMemoryEntries,
  buildExtractionPrompt,
  isLlmMemoryExtractionEnabled,
  resolveMemoryEntries,
  type MemoryEntryDraft,
} from '../llm-extraction';

const validEntry = {
  category: 'regulatory',
  subcategory: 'submission_pathways',
  title: 'IND pathway referenced',
  content: 'The document references an IND submission for the lead asset.',
  confidenceScore: 0.8,
  importanceLevel: 'high',
};

describe('parseMemoryEntries', () => {
  it('parses a { entries: [...] } envelope', () => {
    const out = parseMemoryEntries(JSON.stringify({ entries: [validEntry] }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ category: 'regulatory', importanceLevel: 'high' });
  });

  it('parses a bare array', () => {
    const out = parseMemoryEntries(JSON.stringify([validEntry]));
    expect(out).toHaveLength(1);
  });

  it('tolerates ```json fenced output', () => {
    const raw = '```json\n' + JSON.stringify({ entries: [validEntry] }) + '\n```';
    expect(parseMemoryEntries(raw)).toHaveLength(1);
  });

  it('returns [] for non-JSON, empty, or whitespace input', () => {
    expect(parseMemoryEntries('not json at all')).toEqual([]);
    expect(parseMemoryEntries('')).toEqual([]);
    expect(parseMemoryEntries('   ')).toEqual([]);
  });

  it('drops malformed entries (missing required fields) but keeps valid ones', () => {
    const out = parseMemoryEntries(
      JSON.stringify({ entries: [validEntry, { category: 'x' }, { title: 'no content' }] }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('IND pathway referenced');
  });

  it('clamps confidenceScore into [0,1] and coerces numeric strings', () => {
    const out = parseMemoryEntries(
      JSON.stringify({
        entries: [
          { ...validEntry, confidenceScore: 1.7 },
          { ...validEntry, confidenceScore: -3 },
          { ...validEntry, confidenceScore: '0.42' },
        ],
      }),
    );
    expect(out.map(e => e.confidenceScore)).toEqual([1, 0, 0.42]);
  });

  it('normalizes importanceLevel to low|medium|high (unknown -> medium)', () => {
    const out = parseMemoryEntries(
      JSON.stringify({
        entries: [
          { ...validEntry, importanceLevel: 'High' },
          { ...validEntry, importanceLevel: 'CRITICAL' },
          { ...validEntry, importanceLevel: 'low' },
        ],
      }),
    );
    expect(out.map(e => e.importanceLevel)).toEqual(['high', 'medium', 'low']);
  });

  it('caps the number of returned entries', () => {
    const many = Array.from({ length: 100 }, (_v, i) => ({ ...validEntry, title: `t${i}` }));
    expect(parseMemoryEntries(JSON.stringify({ entries: many }), { max: 5 })).toHaveLength(5);
  });

  it('trims string fields', () => {
    const out = parseMemoryEntries(
      JSON.stringify({ entries: [{ ...validEntry, title: '  padded  ' }] }),
    );
    expect(out[0].title).toBe('padded');
  });
});

describe('buildExtractionPrompt', () => {
  it('labels client vs project scope and truncates long input', () => {
    const client = buildExtractionPrompt({
      kind: 'client',
      fileName: 'overview.pdf',
      subjectName: 'Acme Bio',
      text: 'x'.repeat(50000),
    });
    expect(client).toContain('client organization "Acme Bio"');
    expect(client).toContain('overview.pdf');
    // truncated well under the raw 50k input
    expect(client.length).toBeLessThan(30000);

    const project = buildExtractionPrompt({
      kind: 'project',
      fileName: 'sap.docx',
      subjectName: 'Study 001',
      text: 'short',
    });
    expect(project).toContain('project "Study 001"');
  });
});

describe('resolveMemoryEntries (LLM-first, heuristic fallback)', () => {
  const heuristicEntry: MemoryEntryDraft = {
    category: 'pipeline',
    subcategory: 'therapeutic_areas',
    title: 'heuristic',
    content: 'from regex',
    confidenceScore: 0.7,
    importanceLevel: 'medium',
  };
  const llmEntry: MemoryEntryDraft = { ...heuristicEntry, title: 'llm', content: 'from model' };
  const baseInput = {
    kind: 'client' as const,
    text: 'doc text',
    fileName: 'f.pdf',
    subjectName: 'Acme',
    organizationId: 1,
    userId: 2,
  };

  it('uses LLM entries and does NOT call the heuristic when the model returns entries', async () => {
    const heuristic = vi.fn(() => [heuristicEntry]);
    const extract = vi.fn(async () => [llmEntry]);
    const out = await resolveMemoryEntries({ ...baseInput, heuristic }, { extract, enabled: () => true });
    expect(out).toEqual([llmEntry]);
    expect(extract).toHaveBeenCalledOnce();
    expect(heuristic).not.toHaveBeenCalled();
  });

  it('falls back to the heuristic when the model returns an empty list', async () => {
    const heuristic = vi.fn(() => [heuristicEntry]);
    const out = await resolveMemoryEntries(
      { ...baseInput, heuristic },
      { extract: async () => [], enabled: () => true },
    );
    expect(out).toEqual([heuristicEntry]);
    expect(heuristic).toHaveBeenCalledOnce();
  });

  it('falls back to the heuristic when the gateway extraction fails (null)', async () => {
    const heuristic = vi.fn(() => [heuristicEntry]);
    const out = await resolveMemoryEntries(
      { ...baseInput, heuristic },
      { extract: async () => null, enabled: () => true },
    );
    expect(out).toEqual([heuristicEntry]);
    expect(heuristic).toHaveBeenCalledOnce();
  });

  it('never calls the gateway when LLM extraction is disabled', async () => {
    const heuristic = vi.fn(() => [heuristicEntry]);
    const extract = vi.fn(async () => [llmEntry]);
    const out = await resolveMemoryEntries({ ...baseInput, heuristic }, { extract, enabled: () => false });
    expect(out).toEqual([heuristicEntry]);
    expect(extract).not.toHaveBeenCalled();
    expect(heuristic).toHaveBeenCalledOnce();
  });
});

describe('isLlmMemoryExtractionEnabled', () => {
  it('defaults on and can be disabled with MEMORY_LLM_EXTRACTION_ENABLED=false', () => {
    const prev = process.env.MEMORY_LLM_EXTRACTION_ENABLED;
    delete process.env.MEMORY_LLM_EXTRACTION_ENABLED;
    expect(isLlmMemoryExtractionEnabled()).toBe(true);
    process.env.MEMORY_LLM_EXTRACTION_ENABLED = 'false';
    expect(isLlmMemoryExtractionEnabled()).toBe(false);
    if (prev === undefined) delete process.env.MEMORY_LLM_EXTRACTION_ENABLED;
    else process.env.MEMORY_LLM_EXTRACTION_ENABLED = prev;
  });
});
