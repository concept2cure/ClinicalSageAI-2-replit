/**
 * Knowledge Base API — read-only reference endpoints over the citable corpora.
 * Verifies each endpoint returns the expected corpus, honours filters, validates
 * bad input (422), and carries the honesty caveats. No DB or auth needed (the
 * router is pure reference data; auth is applied at mount time in bootstrap).
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

import knowledgeRouter from '../server/routes/knowledge';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/knowledge', knowledgeRouter);
  return a;
}

describe('GET /api/knowledge/summary', () => {
  it('reports counts across all corpora', async () => {
    const res = await request(app()).get('/api/knowledge/summary');
    expect(res.status).toBe(200);
    expect(res.body.ich.total).toBeGreaterThanOrEqual(40);
    expect(res.body.pathways.total).toBeGreaterThanOrEqual(20);
    expect(res.body.standards.total).toBeGreaterThanOrEqual(30);
    expect(res.body.deficiencies.total).toBeGreaterThan(0);
  });
});

describe('GET /api/knowledge/ich-guidelines', () => {
  it('resolves an exact code with the ich.org caveat', async () => {
    const res = await request(app()).get('/api/knowledge/ich-guidelines?code=E6(R3)');
    expect(res.status).toBe(200);
    expect(res.body.match).toBe('exact');
    expect(res.body.guideline.topic).toBe('GCP');
    expect(res.body.note).toMatch(/ich\.org/);
  });

  it('searches by topic', async () => {
    const res = await request(app()).get('/api/knowledge/ich-guidelines?query=nitrosamine');
    expect(res.body.guidelines.some((g: any) => g.code === 'M7(R2)')).toBe(true);
  });

  it('rejects an invalid category with 422', async () => {
    const res = await request(app()).get('/api/knowledge/ich-guidelines?category=nope');
    expect(res.status).toBe(422);
  });
});

describe('GET /api/knowledge/pathways', () => {
  it('lists a regulator with the verify caveat', async () => {
    const res = await request(app()).get('/api/knowledge/pathways?agency=FDA');
    expect(res.status).toBe(200);
    expect(res.body.pathways.every((p: any) => p.agency === 'FDA')).toBe(true);
    expect(res.body.note).toMatch(/Confirm eligibility/i);
  });

  it('rejects an unknown agency with 422', async () => {
    const res = await request(app()).get('/api/knowledge/pathways?agency=XYZ');
    expect(res.status).toBe(422);
  });
});

describe('GET /api/knowledge/standards', () => {
  it('returns standards and filters by domain', async () => {
    const all = await request(app()).get('/api/knowledge/standards');
    expect(all.body.count).toBeGreaterThanOrEqual(30);
    const combo = await request(app()).get('/api/knowledge/standards?domain=combination_product');
    expect(combo.body.count).toBeGreaterThanOrEqual(3);
    expect(combo.body.standards.every((s: any) => s.domain === 'combination_product')).toBe(true);
  });
});

describe('GET /api/knowledge/deficiencies', () => {
  it('filters by category and agency', async () => {
    const global = await request(app()).get('/api/knowledge/deficiencies?category=Global');
    expect(global.body.count).toBeGreaterThanOrEqual(2);
    const nmpa = await request(app()).get('/api/knowledge/deficiencies?agency=nmpa');
    expect(nmpa.body.deficiencies.every((d: any) => d.agencies.includes('nmpa'))).toBe(true);
  });
});

describe('GET /api/knowledge/pharmacopoeia', () => {
  it('lists pharmacopoeias and chapters with the verify caveat', async () => {
    const res = await request(app()).get('/api/knowledge/pharmacopoeia');
    expect(res.status).toBe(200);
    expect(res.body.pharmacopoeias.some((p: any) => p.code === 'Ph.Eur.')).toBe(true);
    expect(res.body.count).toBeGreaterThanOrEqual(15);
    expect(res.body.note).toMatch(/current pharmacopoeia/i);
  });

  it('resolves an exact chapter and searches by test', async () => {
    const exact = await request(app()).get('/api/knowledge/pharmacopoeia?code=USP <85>');
    expect(exact.body.match).toBe('exact');
    expect(exact.body.chapter.topic).toBe('Endotoxins');
    const search = await request(app()).get('/api/knowledge/pharmacopoeia?query=dissolution');
    expect(search.body.chapters.some((c: any) => c.code === 'USP <711>')).toBe(true);
  });
});

describe('GET /api/knowledge/validation-rules', () => {
  it('returns the corpus and scopes by region', async () => {
    const all = await request(app()).get('/api/knowledge/validation-rules');
    expect(all.status).toBe(200);
    expect(all.body.count).toBeGreaterThan(0);
    const ca = await request(app()).get('/api/knowledge/validation-rules?region=ca');
    expect(ca.body.rules.some((r: any) => r.id === 'CA_REGIONAL_BACKBONE')).toBe(true);
  });

  it('rejects an unknown region with 422', async () => {
    const res = await request(app()).get('/api/knowledge/validation-rules?region=zz');
    expect(res.status).toBe(422);
  });
});
