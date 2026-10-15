/**
 * POST /api/protocol/optimize and /upload-and-optimize report what the protocol
 * states beside what comparable trials show — and nothing neither of them says.
 *
 * Before 2026-10-01 both routes returned generateSectionAnalysis: five fixed
 * paragraphs ("Successful Phase 3 trials have utilized central randomization…")
 * with "alignment" scores of 85/78/82/75/80 for every protocol, keyword-keyed
 * risk and endpoint lists, four "alignment" scores built from constants (a
 * protocol with no evidence at all scored 67), a template "analysis" when no
 * model was configured, and — on the upload route — 'Obesity' for a protocol
 * that stated no indication. The comparable-trial read targeted a table no
 * migration creates and returned [] on every failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

import {
  computeBenchmark,
  type PrecedentTrial,
} from '../../services/corpus/precedent-benchmark';
import {
  buildSectionAnalysis,
  riskFactorsFrom,
  toCorpusPhase,
} from '../../services/corpus/protocol-precedent-comparison';

vi.mock('../../db', () => ({
  db: {},
  pool: {},
  getPool: () => ({}),
  getDb: () => ({}),
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../middleware/uploadSafety', () => ({
  assertUploadSafe: vi.fn(async () => undefined),
  UploadSafetyError: class UploadSafetyError extends Error {},
}));

const compare = vi.fn();
vi.mock('../../services/corpus/precedent-benchmark-reader', () => ({
  precedentBenchmarkReader: { compare: (...a: unknown[]) => compare(...a) },
}));

/** Twelve comparable trials: enrolment 100..210, 24..46 weeks. */
function trials(): PrecedentTrial[] {
  return Array.from({ length: 12 }, (_, i) => ({
    sampleSize: 100 + i * 10,
    durationWeeks: 24 + i * 2,
    studyDesign: i < 8 ? 'Randomized, double-blind, placebo-controlled' : 'Open-label',
    endpoints: [i < 7 ? 'Percent change in body weight' : 'Change in waist circumference'],
    outcome: true,
  }));
}

const BENCHMARK = computeBenchmark('Obesity', 'Phase 3', trials());

const CORPUS_TRIAL = {
  id: 71,
  title: 'A 52-week study of drug X in obesity',
  sponsor: 'Sponsor A',
  nctId: 'NCT00000071',
  indication: 'Obesity',
  phase: 'Phase 3',
  registryStatus: 'completed',
  sampleSize: 180,
  durationWeeks: 52,
  studyDesign: 'Randomized, double-blind, placebo-controlled',
  primaryEndpoint: 'Percent change in body weight',
  efficacyResults: null,
  safetyResults: null,
};

describe('buildSectionAnalysis — the protocol against its precedent', () => {
  it('places a stated value against the distribution, with the N it came from', () => {
    const analysis = buildSectionAnalysis(
      { sample_size: 40, duration_weeks: 30, primary_endpoint: 'Percent change in body weight' },
      BENCHMARK,
    );
    expect(analysis.sampleSize.stated).toBe('40 participants');
    expect(analysis.sampleSize.precedent).toContain('across 12 comparable trials');
    expect(analysis.sampleSize.comparison).toMatch(/^Below the 10th percentile/);
    expect(analysis.sampleSize.outsidePrecedentRange).toBe(true);
    expect(analysis.duration.comparison).toMatch(/Within the (interquartile|10th–90th)/);
    expect(analysis.primaryEndpoint.comparison).toBe('Recorded by 7 of the 12 comparable trials.');

    expect(riskFactorsFrom(analysis)).toEqual([
      'Sample size 40 participants: Below the 10th percentile (111 participants) of the 12 comparable trials.',
    ]);
  });

  it('says nothing about a section the protocol does not state, and scores nothing', () => {
    const analysis = buildSectionAnalysis({}, BENCHMARK);
    for (const section of Object.values(analysis)) {
      expect(section.stated).toBeNull();
      expect(section.comparison).toBeNull();
    }
    expect(riskFactorsFrom(analysis)).toEqual([]);
    expect(JSON.stringify(analysis)).not.toMatch(/alignment/i);
  });

  it('reports the benchmark\'s own reason when there are too few trials, not a number', () => {
    const thin = computeBenchmark('Obesity', 'Phase 3', trials().slice(0, 2));
    const analysis = buildSectionAnalysis({ sample_size: 40 }, thin);
    expect(analysis.sampleSize.precedent).toMatch(/Only 2 comparable trial/);
    expect(analysis.sampleSize.comparison).toBeNull();
    expect(analysis.sampleSize.outsidePrecedentRange).toBe(false);
  });

  it('reads phases in the form the corpus stores them', () => {
    expect(toCorpusPhase('phase3')).toBe('Phase 3');
    expect(toCorpusPhase('Phase III')).toBe('Phase 3');
    expect(toCorpusPhase('2')).toBe('Phase 2');
    expect(toCorpusPhase('Phase 1/2')).toBe('Phase 1/Phase 2');
    expect(toCorpusPhase('Early Phase 1')).toBe('Early Phase 1');
    expect(toCorpusPhase('pivotal')).toBeNull();
    expect(toCorpusPhase(undefined)).toBeNull();
  });
});

describe('POST /api/protocol/optimize and /upload-and-optimize', () => {
  let app: express.Express;
  const saved = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY };

  beforeEach(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    compare.mockReset();
    vi.resetModules();
    const { protocolRoutes } = await import('../protocol_routes');
    app = express();
    app.use(express.json());
    app.use('/api/protocol', protocolRoutes);
  });

  afterEach(() => {
    if (saved.a !== undefined) process.env.ANTHROPIC_API_KEY = saved.a;
    if (saved.o !== undefined) process.env.OPENAI_API_KEY = saved.o;
  });

  it('answers from the protocol and the corpus — no fixed sections, no alignment scores, no template', async () => {
    compare.mockResolvedValue({ benchmark: BENCHMARK, trials: [CORPUS_TRIAL] });
    const res = await request(app)
      .post('/api/protocol/optimize')
      .send({
        indication: 'Obesity',
        phase: 'phase3',
        protocolSummary:
          'Sample size: 40 participants\nDuration: 30 weeks\nPrimary endpoint: percent change in body weight',
      });

    expect(res.status).toBe(200);
    expect(compare).toHaveBeenCalledWith('Obesity', 'Phase 3');

    expect(res.body.sectionAnalysis.sampleSize.comparison).toMatch(/^Below the 10th percentile/);
    expect(res.body.riskFactors).toHaveLength(1);
    expect(res.body.suggestedEndpoints[0]).toBe('Percent change in body weight — 7 of 12 comparable trials');
    expect(res.body.matchedCsrInsights.map((t: { nct_id: string }) => t.nct_id)).toEqual(['NCT00000071']);

    // No model is configured: no recommendation, and the response says why.
    expect(res.body.recommendation).toBeNull();
    expect(res.body.recommendationUnavailable).toMatch(/No AI model is configured/);
    expect(res.body.keySuggestions).toEqual([]);

    const body = JSON.stringify(res.body);
    for (const gone of [
      'regulatoryAlignmentScore', 'csrAlignmentScore', 'academicAlignmentScore', 'overallQualityScore',
      'suggestedArms', 'regulatory_insights', '"alignment"', 'central randomization',
      'comprehensive endpoint packages', 'Based on our analysis',
    ]) {
      expect(body).not.toContain(gone);
    }
  });

  it('refuses to analyse without an indication — it no longer assumes one', async () => {
    const res = await request(app)
      .post('/api/protocol/upload-and-optimize')
      .field('phase', 'Phase 3')
      .attach('file', Buffer.from('Sample size: 120 participants\nDuration: 24 weeks'), 'protocol.txt');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INDICATION_AND_PHASE_REQUIRED');
    expect(compare).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toMatch(/obesity/i);
  });

  it('reports a failed corpus read as a failure, never as "no comparable trials"', async () => {
    compare.mockRejectedValue(new Error('connection refused'));
    const res = await request(app)
      .post('/api/protocol/optimize')
      .send({ indication: 'Obesity', phase: 'Phase 3', protocolSummary: 'Sample size: 40 participants' });

    expect(res.status).toBe(500);
    expect(res.body.success).not.toBe(true);
    expect(res.body.matchedCsrInsights).toBeUndefined();
  });
});
