import { describe, it, expect } from 'vitest';
import { lookupIvdKnowledge, IVD_KNOWLEDGE_TOOL_SPEC } from '../ivd-knowledge-advisor';

describe('lookupIvdKnowledge', () => {
  it('returns grounded, citation-backed entries for a real IVD query', () => {
    const a = lookupIvdKnowledge({ query: 'analytical performance' });
    expect(a.corpusSize).toBeGreaterThan(0);
    expect(a.results.length).toBeGreaterThan(0);
    expect(a.results.length).toBeLessThanOrEqual(5);
    const first = a.results[0];
    expect(typeof first.id).toBe('string');
    expect(typeof first.summary).toBe('string');
    expect(Array.isArray(first.citations)).toBe(true);
    expect(a.headline).toMatch(/Ground your answer/i);
  });

  it('honestly reports no match for an unrelated query (nothing invented)', () => {
    const a = lookupIvdKnowledge({ query: 'zzzqqqxyzzyplughwxqv' });
    expect(a.results).toHaveLength(0);
    expect(a.headline).toMatch(/No IVD knowledge-base entries matched/i);
  });

  it('respects the limit (capped at 15) and a domain filter', () => {
    const a = lookupIvdKnowledge({ query: 'performance', domain: 'scientific', limit: 3 });
    expect(a.results.length).toBeLessThanOrEqual(3);
    expect(a.results.every((r) => r.domain === 'scientific')).toBe(true);
  });

  it('caps an over-large limit at 15', () => {
    const a = lookupIvdKnowledge({ query: 'ivd', limit: 9999 });
    expect(a.results.length).toBeLessThanOrEqual(15);
  });

  it('carries corpus version + provenance', () => {
    const a = lookupIvdKnowledge({ query: 'classification' });
    expect(typeof a.corpusVersion).toBe('string');
    expect(a.provenance.modules).toContain('ivd-knowledge/knowledge.service');
  });

  it('exposes a well-formed tool spec', () => {
    expect(IVD_KNOWLEDGE_TOOL_SPEC.name).toBe('ivd_knowledge_lookup');
    expect(IVD_KNOWLEDGE_TOOL_SPEC.input_schema.type).toBe('object');
    expect(IVD_KNOWLEDGE_TOOL_SPEC.input_schema.properties).toHaveProperty('query');
    expect(IVD_KNOWLEDGE_TOOL_SPEC.input_schema.required).toContain('query');
  });
});
