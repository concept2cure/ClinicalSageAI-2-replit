/**
 * WO-16C finding 65 — POST /api/analytics/demo-analysis returns an
 * "IND Readiness Assessment" for a protocol it never assessed.
 *
 * `indAnalysis` (server/routes/analytics-routes.ts) was a hardcoded object
 * literal that read neither `content`, nor `protocolData`, nor
 * `detailedAnalysis`. Every caller — any authenticated user of any tenant,
 * since the router is mounted unconditionally behind the session gate — got
 * back four adequacy verdicts about their submission ("Well-defined primary
 * and secondary endpoints", "Clear inclusion/exclusion criteria",
 * "Appropriate statistical analysis plan", "Adequate safety monitoring
 * provisions") and three alignment verdicts ("Aligns with FDA guidance for
 * Phase 2 trials in this indication", "Consistent with ICH E6(R2)
 * requirements for Good Clinical Practice", "Meets basic requirements for EMA
 * Scientific Advice submissions") — for a Phase 1 protocol, a Phase 3
 * protocol, a protocol with no endpoint, or the string "hello". The same
 * payload is written to exports/<session_id>/analysis_results.json, so the
 * fabrication is persisted with the caller's session id on it. The identical
 * strings were removed from the client's own `genIndReadiness` in 6866d4fb1;
 * this was the server twin, left in place.
 *
 * There is no dependency to make fail here: the defect is a constant, so the
 * injection is the INPUT. `analyzeProtocol` is stubbed to return a Phase 3
 * protocol, which contradicts the fixed "Phase 2" alignment verdict, and the
 * assertions below are on the whole payload — response and persisted file —
 * rather than on one field, so no verdict can survive by moving.
 *
 * RED on the pre-fix head: `ind_analysis.strengths` was present, the body
 * matched /Well-defined primary and secondary endpoints/ and /Aligns with FDA
 * guidance for Phase 2 trials in this indication/ for a Phase 3 submission,
 * and no `status` / `basis` field said the assessment had not been run.
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

// The handler writes exports/<session_id>/ under process.cwd(); clean up after.
const SESSION_ID = 'ind-readiness-test';
const SESSION_DIR = path.join(process.cwd(), 'exports', SESSION_ID);
afterAll(() => {
  fs.rmSync(SESSION_DIR, { recursive: true, force: true });
});

const post = () =>
  request(app())
    .post('/api/analytics/demo-analysis')
    .send({ content: 'hello', session_id: SESSION_ID });

/** Verdicts about the submitted protocol that nothing in this handler computes. */
const ADEQUACY_VERDICTS = [
  /Well-defined primary and secondary endpoints/,
  /Clear inclusion\/exclusion criteria/,
  /Appropriate statistical analysis plan/,
  /Adequate safety monitoring provisions/,
];
const ALIGNMENT_VERDICTS = [
  /Aligns with FDA guidance for Phase 2 trials in this indication/,
  /Consistent with ICH E6\(R2\) requirements for Good Clinical Practice/,
  /Meets basic requirements for EMA Scientific Advice submissions/,
];

beforeEach(() => {
  vi.clearAllMocks();
  // A Phase 3 protocol: the removed verdict claimed Phase 2 alignment for it.
  analyzeProtocol.mockResolvedValue({
    phase: 'Phase 3',
    indication: 'Duchenne muscular dystrophy',
    sample_size: 120,
    primary_endpoint: '6-minute walk distance',
    duration_weeks: 52,
  });
  findSimilarProtocols.mockResolvedValue([]);
});

describe('demo-analysis IND readiness', () => {
  it('asserts no adequacy verdict about a protocol it never read', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body.ind_analysis).not.toHaveProperty('strengths');
    const body = JSON.stringify(res.body);
    for (const verdict of ADEQUACY_VERDICTS) expect(body).not.toMatch(verdict);
  });

  it('asserts no regulatory alignment for a protocol it never read', async () => {
    const res = await post();
    const body = JSON.stringify(res.body);
    for (const verdict of ALIGNMENT_VERDICTS) expect(body).not.toMatch(verdict);
    // The submission is Phase 3. Nothing may claim Phase 2 anything about it.
    expect(body).not.toMatch(/Phase 2/);
  });

  it('says the assessment was not run, rather than returning an unlabelled verdict list', async () => {
    const res = await post();
    const ind = res.body.ind_analysis;
    expect(ind.status).toBe('NOT_ASSESSED');
    expect(ind.score).toBeNull();
    expect(typeof ind.basis).toBe('string');
    expect(ind.basis).toMatch(/not derived from this protocol/i);
  });

  it('keeps the standing guidance it genuinely has, labelled as standing guidance', async () => {
    const res = await post();
    const ind = res.body.ind_analysis;
    // Real, identifiable published documents survive — the defect was the
    // provenance claim, not the reference material.
    expect(Array.isArray(ind.standing_guidance)).toBe(true);
    expect(ind.standing_guidance.length).toBeGreaterThan(0);
    expect(ind.standing_guidance.join(' ')).toMatch(/21 CFR 312\.23\(a\)\(6\)/);
    expect(ind.standing_guidance.join(' ')).toMatch(/Points to Consider for Ethnic Factors/);
    expect(Array.isArray(ind.citations)).toBe(true);
    expect(ind.citations.length).toBeGreaterThan(0);
  });

  it('persists no verdict to exports/<session_id>/analysis_results.json either', async () => {
    await post();
    const persisted = fs.readFileSync(
      path.join(SESSION_DIR, 'analysis_results.json'),
      'utf8',
    );
    for (const verdict of [...ADEQUACY_VERDICTS, ...ALIGNMENT_VERDICTS]) {
      expect(persisted).not.toMatch(verdict);
    }
    expect(JSON.parse(persisted).ind_analysis.status).toBe('NOT_ASSESSED');
  });

  it('still returns the analysis the handler genuinely produces', async () => {
    const res = await post();
    expect(res.body.detailed_analysis).toBe('narrative analysis');
    expect(res.body.protocol_data.phase).toBe('Phase 3');
    expect(res.body.dropout_prediction.basis).toMatch(/Not derived from this protocol/i);
  });
});
