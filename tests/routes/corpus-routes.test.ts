import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock the service layer so the route test exercises HTTP wiring + validation,
// not the database or the live ClinicalTrials.gov API.
vi.mock('../../server/services/corpus/precedent-benchmark-reader', () => ({
  precedentBenchmarkReader: {
    benchmark: vi.fn().mockResolvedValue({
      indication: 'NSCLC',
      phase: 'Phase 2',
      totalTrials: 0,
      sampleSize: { assessable: false, n: 0, note: 'none' },
      duration: { assessable: false, n: 0, note: 'none' },
      commonDesigns: [],
      commonEndpoints: [],
      successRate: {
        assessable: false,
        knownOutcomeN: 0,
        successes: 0,
        rate: null,
        ci95: null,
        note: 'none',
      },
      note: 'No comparable trials in the corpus for this indication and phase.',
    }),
  },
}));

vi.mock('../../server/services/corpus', () => ({
  ingestCtgovToCorpus: vi.fn().mockResolvedValue({
    fetched: 3,
    normalized: 3,
    inserted: 3,
    updated: 0,
    skipped: 0,
    errors: 0,
    failures: [],
  }),
}));

import corpusRouter from '../../server/routes/corpus-routes';
import { precedentBenchmarkReader } from '../../server/services/corpus/precedent-benchmark-reader';
import { ingestCtgovToCorpus } from '../../server/services/corpus';

let app: express.Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/corpus', corpusRouter);
});

describe('GET /api/corpus/benchmark', () => {
  it('returns a benchmark for valid indication + phase', async () => {
    const res = await request(app)
      .get('/api/corpus/benchmark')
      .query({ indication: 'NSCLC', phase: 'Phase 2' });
    expect(res.status).toBe(200);
    expect(res.body.indication).toBe('NSCLC');
    expect(precedentBenchmarkReader.benchmark).toHaveBeenCalledWith('NSCLC', 'Phase 2');
  });

  it('400s when required params are missing', async () => {
    const res = await request(app).get('/api/corpus/benchmark').query({ indication: 'NSCLC' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid request/);
  });
});

describe('POST /api/corpus/extract', () => {
  it('extracts entities from CSR text (real deterministic service)', async () => {
    const res = await request(app)
      .post('/api/corpus/extract')
      .send({ text: 'A Phase 3, randomized, double-blind study; enrolled 450 patients (p < 0.01).' });
    expect(res.status).toBe(200);
    expect(res.body.extraction.sampleSize).toBe(450);
    expect(res.body.extraction.phase).toBe('Phase 3');
    expect(res.body.validation).toBeDefined();
  });

  it('400s on empty text', async () => {
    const res = await request(app).post('/api/corpus/extract').send({ text: '' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/corpus/ingest', () => {
  it('triggers ingestion with at least one query field', async () => {
    const res = await request(app)
      .post('/api/corpus/ingest')
      .send({ indication: 'NSCLC', limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(3);
    expect(ingestCtgovToCorpus).toHaveBeenCalled();
  });

  it('400s when no query field is provided (no unbounded pull)', async () => {
    const res = await request(app).post('/api/corpus/ingest').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one/i);
  });

  it('400s on an invalid limit', async () => {
    const res = await request(app).post('/api/corpus/ingest').send({ indication: 'X', limit: -5 });
    expect(res.status).toBe(400);
  });
});
