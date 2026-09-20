/**
 * POST /api/analytics/demo-analysis must not assert provenance it does not have.
 *
 * The handler used to build three academic references PER REQUEST by
 * interpolating the caller's own indication and phase into title templates,
 * then attach invented authors, journal, volume, pages and a DOI — a resolvable
 * identifier for one specific published work, minted by a route that runs no
 * literature search. Its wisdom trace separately claimed a comparison against
 * "database of N similar protocols" (findSimilarProtocols reads `protocols`,
 * which has no INSERT anywhere in this repository — ledger L167, so N is 0 on
 * any real deployment), plus statistical-power validation and an
 * inclusion/exclusion representativeness review that no code here performs.
 *
 * Two earlier sessions had already removed Math.random() from the IND score and
 * the dropout rate in this same handler; one of them wrote that a fabricated
 * number "dressed with academic citations" is "the dangerous case" — and left
 * the citations. These tests pin what replaced them.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const analyzeProtocol = vi.fn();
const findSimilarProtocols = vi.fn();

vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../protocol-analyzer-service', () => ({
  protocolAnalyzerService: {
    analyzeProtocol: (...a: unknown[]) => analyzeProtocol(...a),
    findSimilarProtocols: (...a: unknown[]) => findSimilarProtocols(...a),
  },
}));
vi.mock('../../protocol-optimizer-service', () => ({ protocolOptimizerService: {} }));
vi.mock('../../openai-service', () => ({ analyzeText: vi.fn(async () => 'narrative analysis') }));

import analyticsRouter from '../analytics-routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: 1 };
    next();
  });
  a.use('/api/analytics', analyticsRouter);
  return a;
}

// The handler writes exports/<session_id>/ under process.cwd(). That is its
// behaviour, not this test's business to change — but a test that leaves
// untracked files in the repo root is debris every later `git status` and
// repo-health scan has to step over, so it clears up after itself.
const SESSION_ID = 'provenance-test';
const SESSION_DIR = path.join(process.cwd(), 'exports', SESSION_ID);
afterAll(() => {
  fs.rmSync(SESSION_DIR, { recursive: true, force: true });
});

const post = () =>
  request(app())
    .post('/api/analytics/demo-analysis')
    .send({ content: 'A protocol body.', session_id: SESSION_ID });

beforeEach(() => {
  vi.clearAllMocks();
  analyzeProtocol.mockResolvedValue({
    phase: 'Phase 2',
    indication: 'Duchenne muscular dystrophy',
    sample_size: 120,
    primary_endpoint: '6-minute walk distance',
    duration_weeks: 52,
  });
  findSimilarProtocols.mockResolvedValue([]);
});

describe('demo-analysis provenance', () => {
  it('emits no manufactured academic citations', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('academic_citations');
  });

  it('emits no DOI anywhere in the response', async () => {
    const res = await post();
    // The whole payload, not a named field: a DOI must not survive in any shape.
    expect(JSON.stringify(res.body)).not.toMatch(/\b10\.\d{4,9}\//);
  });

  it('does not interpolate the caller’s indication into a citation-shaped title', async () => {
    const res = await post();
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/Endpoint selection for regulatory approval in/);
    expect(body).not.toMatch(/Recent advances in clinical trial design for drug development in/);
    expect(body).not.toMatch(/Statistical power considerations in/);
  });

  it('says no comparison was performed when the protocol store is empty', async () => {
    const res = await post();
    const evidence = res.body.wisdom_trace.find(
      (s: { section: string }) => s.section === 'Evidence Base',
    );
    expect(evidence.insights.join(' ')).toMatch(/no comparison against prior protocols was performed/i);
    // The defect was reporting a count as though it were a comparison.
    expect(evidence.insights.join(' ')).not.toMatch(/Compared against database of 0/);
  });

  it('reports a real comparison when the store actually returns matches', async () => {
    findSimilarProtocols.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = await post();
    const evidence = res.body.wisdom_trace.find(
      (s: { section: string }) => s.section === 'Evidence Base',
    );
    // The honest-empty branch must not swallow a genuine result.
    expect(evidence.insights.join(' ')).toMatch(/Compared against 2 stored protocol\(s\)/);
  });

  /*
   * WO-16C #65, follow-up review. The Evidence Base and Risk Assessment
   * sections were corrected and the FIRST section was left as it was:
   *
   *   `Sample size of ${sample_size} participants analyzed against benchmarks`
   *   `Primary endpoint "${primary_endpoint}" evaluated for statistical robustness`
   *   `Study duration of ${duration_weeks} weeks compared with similar trials`
   *
   * Nothing in this handler holds a benchmark set, evaluates statistical
   * robustness, or compares duration against anything — the only comparison it
   * attempts is findSimilarProtocols, whose result the section below already
   * reports honestly as "no comparison was performed". Three claims of analysis
   * over one real act: a regex extraction from the submitted text.
   *
   * And every one of those fields is `undefined` when its pattern does not
   * match — analyzeProtocol defaults none of them — so a protocol that states
   * no sample size produced the literal sentence "Sample size of undefined
   * participants analyzed against benchmarks".
   */
  it('does not claim benchmark, robustness or duration analysis it never performs', async () => {
    const res = await post();
    const structure = res.body.wisdom_trace.find(
      (s: { section: string }) => s.section === 'Protocol Structure',
    );
    const text = structure.insights.join(' ');

    expect(text).not.toMatch(/analyzed against benchmarks/i);
    expect(text).not.toMatch(/evaluated for statistical robustness/i);
    expect(text).not.toMatch(/compared with similar trials/i);
    // The real act is an extraction from the submitted text, and it says so.
    expect(text).toMatch(/extracted/i);
    expect(text).toMatch(/120 participants/);
    expect(text).toMatch(/6-minute walk distance/);
    expect(text).toMatch(/52 weeks/);
  });

  it('never renders an unmatched field as the word undefined', async () => {
    // analyzeProtocol returns `undefined` for every pattern that does not
    // match — a protocol body with none of them is the ordinary case.
    analyzeProtocol.mockResolvedValue({});
    const res = await post();
    const structure = res.body.wisdom_trace.find(
      (s: { section: string }) => s.section === 'Protocol Structure',
    );
    const text = structure.insights.join(' ');

    expect(text).not.toMatch(/undefined/);
    expect(text).not.toMatch(/\bnull\b/);
    // An extractor that found nothing says so, once per field it looked for.
    expect(text).toMatch(/no sample size/i);
    expect(text).toMatch(/no primary endpoint/i);
    expect(text).toMatch(/no study duration/i);
  });

  it('claims no statistical-power or representativeness work it does not do', async () => {
    const res = await post();
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/Statistical power calculations validated against historical data/);
    expect(body).not.toMatch(/evaluated for population representativeness/);
  });

  it('still returns the analysis the handler genuinely produces', async () => {
    const res = await post();
    expect(res.body.detailed_analysis).toBe('narrative analysis');
    expect(res.body.protocol_data.indication).toBe('Duchenne muscular dystrophy');
    expect(res.body.global_regulations).toHaveProperty('FDA');
  });
});
