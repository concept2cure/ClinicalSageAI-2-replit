/**
 * POST /api/real-world-evidence/{faers,signal-detection} — an outage must not
 * read as an all-clear, and a statistic must be a statistic.
 *
 * ── THE TWO DEFECTS THIS PINS ────────────────────────────────────────────────
 *
 * 1. INVENTED DISPROPORTIONALITY STATISTICS. queryFAERS built its
 *    `signalDetection` array from the frequency of each reaction term within
 *    the <=100 reports it had just retrieved:
 *
 *      reportingOddsRatio:         1.0 + percentage / 10
 *      proportionalReportingRatio: 1.0 + percentage / 15
 *      ic025:                      percentage > 5 ? 0.5 : -0.5
 *      signalDetected:             percentage > 5
 *      confidence:                 0.7
 *
 *    A ROR, a PRR and an IC025 are computed from a 2x2 contingency table
 *    against the whole FAERS background. Three of those four cells were never
 *    fetched, so these could not have been those statistics under ANY input —
 *    they are linear rescalings of a within-page share. POST /signal-detection
 *    then labelled them `signalDetectionMethod: 'Multi-item Gamma Poisson
 *    Shrinker (MGPS)'`, naming the FDA's Bayesian data-mining algorithm, which
 *    was implemented nowhere in the file.
 *
 *    The platform ALREADY OWNED a real implementation —
 *    pharmacovigilance-knowledge.ts::detectSafetySignal, carrying the Evans
 *    2001 PRR criteria, a Yates-corrected chi-squared, the Haldane-Anscombe
 *    correction and its own citations. This route had grown a second,
 *    fabricated copy of a capability that already existed.
 *
 * 2. AN OUTAGE RENDERED AS A NEGATIVE FINDING. queryFAERS wrapped everything in
 *    a catch returning `{ totalReports: 0, topReactions: [], signalDetection: [] }`,
 *    and /signal-detection turned an empty array into the sentence
 *    "No significant safety signals detected". So an openFDA outage produced a
 *    pharmacovigilance all-clear. It did not even need to throw: nothing checked
 *    `response.ok`, so a 404, a 429 rate-limit and a 500 all fell through to
 *    `data.results || []` and reported zero reports on the SUCCESS path.
 *
 * The distinction these tests hold open is the one the whole surface turns on:
 * "queried FAERS, found no disproportionate reporting" and "could not reach
 * FAERS" must never be the same response.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

import rweRouter from '../real-world-evidence';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/real-world-evidence', rweRouter);
  return a;
}

/** One openFDA report carrying the fields queryFAERS reads. */
function report(reaction: string, extra: Record<string, unknown> = {}) {
  return {
    serious: 1,
    receiptdate: '20240115',
    patient: {
      reaction: [{ reactionmeddrapt: reaction }],
      drug: [{ drugindication: 'HYPERTENSION' }],
      patientsex: '2',
      patientonsetage: '54',
      patientonsetageunit: '801',
    },
    ...extra,
  };
}

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('an unreachable FAERS is never reported as "no signals"', () => {
  it('POST /faers answers 503 when openFDA is unreachable, not zero reports', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(app())
      .post('/api/real-world-evidence/faers')
      .send({ drugName: 'aspirin' });

    // The old code returned 200 with totalReports: 0.
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FAERS_UNAVAILABLE');
    expect(res.body.data).toBeUndefined();
  });

  it('a non-OK openFDA status is an outage, not an empty result set', async () => {
    // 429 is the realistic one: openFDA rate-limits unkeyed callers. The old
    // code never checked response.ok, so this produced "0 reports" on the
    // success path without even reaching the catch.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: 'OVER_RATE_LIMIT' } }),
    } as unknown as Response);

    const res = await request(app())
      .post('/api/real-world-evidence/faers')
      .send({ drugName: 'aspirin' });

    expect(res.status).toBe(503);
    expect(res.body.error.detail).toContain('429');
  });

  it('POST /signal-detection answers 503 and emits NO signals array at all', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));

    const res = await request(app())
      .post('/api/real-world-evidence/signal-detection')
      .send({ drugName: 'aspirin' });

    expect(res.status).toBe(503);
    // The load-bearing assertion. The old response was
    //   { regulatoryImplication: 'No significant safety signals detected' }
    // A caller counting `signals.length === 0` must not be able to read this
    // as a negative finding, so there is no empty array to count.
    expect(res.body.data).toBeUndefined();
    expect(res.body.signals).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('No significant safety signals');
    expect(res.body.error.message).toContain('not a finding of no signal');
  });

  it('openFDA 404/NOT_FOUND is a genuine zero, not an outage', async () => {
    // The one non-OK status that IS a real answer: openFDA says NOT_FOUND when
    // a search matches nothing. Failing closed on this would be its own defect.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'NOT_FOUND' } }),
    } as unknown as Response);

    const res = await request(app())
      .post('/api/real-world-evidence/faers')
      .send({ drugName: 'zzzznotadrug' });

    expect(res.status).toBe(200);
    expect(res.body.data.totalReports).toBe(0);
    expect(res.body.data.reportsAnalyzed).toBe(0);
  });
});

describe('signal detection reports real disproportionality, not rescaled frequency', () => {
  it('builds a 2x2 table from openFDA counts and returns cited measures', async () => {
    // First call: the page of reports. Then, per candidate term, the four
    // count queries that make the contingency table.
    fetchMock.mockImplementation(async (url: string) => {
      if (!url.endsWith('&limit=1')) {
        return okJson({
          meta: { results: { total: 900 } },
          results: [report('ANAPHYLACTIC REACTION'), report('ANAPHYLACTIC REACTION')],
        });
      }
      if (url.includes('_exists_')) return okJson({ meta: { results: { total: 1_000_000 } } });
      // drug AND event
      if (url.includes('medicinalproduct') && url.includes('reactionmeddrapt')) {
        return okJson({ meta: { results: { total: 300 } } });
      }
      if (url.includes('medicinalproduct')) return okJson({ meta: { results: { total: 900 } } });
      return okJson({ meta: { results: { total: 1200 } } });
    });

    const res = await request(app())
      .post('/api/real-world-evidence/signal-detection')
      .send({ drugName: 'aspirin' });

    expect(res.status).toBe(200);

    // The label is gone. This is the string that named an algorithm the file
    // did not implement.
    expect(JSON.stringify(res.body)).not.toContain('Multi-item Gamma Poisson Shrinker');
    expect(res.body.data.method.computed).toEqual(['PRR', 'ROR', 'EBGM']);

    const signal = res.body.data.signals[0];

    // a = 300 (drug AND event); b = 900 - 300; c = 1200 - 300;
    // d = 1000000 - 300 - 600 - 900.
    expect(signal.contingencyTable).toEqual({ a: 300, b: 600, c: 900, d: 998200 });

    // Real measures, each carrying the citation for its own threshold.
    const prr = signal.measures.find((m: { method: string }) => m.method === 'PRR');
    expect(prr.citation).toContain('Evans');
    // PRR = (300/900) / (900/999100) ~= 370 — a large disproportionality, which
    // is the point: the OLD code would have answered 1.0 + percentage/15 here,
    // i.e. a number just above 1, for the same data.
    expect(prr.pointEstimate).toBeGreaterThan(100);
    expect(signal.signalOfDisproportionateReporting).toBe(true);

    // None of the invented fields survive.
    expect(signal.reportingOddsRatio).toBeUndefined();
    expect(signal.ic025).toBeUndefined();
    expect(signal.confidence).toBeUndefined();
  });

  it('carries the engine low-count warning instead of suppressing it', async () => {
    // a = 1. Below the a >= 3 count criterion, so the estimate is unstable and
    // the engine says so. A surface that dropped `warnings` would present an
    // unstable estimate as a finding.
    fetchMock.mockImplementation(async (url: string) => {
      if (!url.endsWith('&limit=1')) {
        return okJson({ meta: { results: { total: 4 } }, results: [report('DIZZINESS')] });
      }
      if (url.includes('_exists_')) return okJson({ meta: { results: { total: 1_000_000 } } });
      if (url.includes('medicinalproduct') && url.includes('reactionmeddrapt')) {
        return okJson({ meta: { results: { total: 1 } } });
      }
      if (url.includes('medicinalproduct')) return okJson({ meta: { results: { total: 4 } } });
      return okJson({ meta: { results: { total: 50 } } });
    });

    const res = await request(app())
      .post('/api/real-world-evidence/signal-detection')
      .send({ drugName: 'aspirin' });

    expect(res.status).toBe(200);
    expect(res.body.data.signals[0].warnings.join(' ')).toMatch(/a < 3|statistically\s+unstable/);
  });

  it('reports the page size separately from the FAERS-wide total', async () => {
    // totalReports (900) is every matching report in FAERS; reportsAnalyzed (2)
    // is what this response actually read. Collapsing them is how a page gets
    // presented as a census.
    fetchMock.mockImplementation(async (url: string) => {
      if (!url.endsWith('&limit=1')) {
        return okJson({
          meta: { results: { total: 900 } },
          results: [report('NAUSEA'), report('NAUSEA')],
        });
      }
      return okJson({ meta: { results: { total: 10 } } });
    });

    const res = await request(app())
      .post('/api/real-world-evidence/faers')
      .send({ drugName: 'aspirin' });

    expect(res.body.data.totalReports).toBe(900);
    expect(res.body.data.reportsAnalyzed).toBe(2);
  });

  it('computes the demographics it returns instead of shipping empty objects', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (!url.endsWith('&limit=1')) {
        return okJson({
          meta: { results: { total: 2 } },
          results: [
            report('NAUSEA'),
            report('NAUSEA', {
              patient: {
                reaction: [{ reactionmeddrapt: 'NAUSEA' }],
                drug: [],
                patientsex: '1',
                // Age in DECADES (unit 800), not years — must not be read as 8 years old.
                patientonsetage: '8',
                patientonsetageunit: '800',
              },
              receiptdate: '20230601',
            }),
          ],
        });
      }
      return okJson({ meta: { results: { total: 10 } } });
    });

    const res = await request(app())
      .post('/api/real-world-evidence/faers')
      .send({ drugName: 'aspirin' });

    const d = res.body.data.demographicDistribution;
    expect(d.genderDistribution).toEqual({ female: 1, male: 1 });
    // 54 years -> '45-64'. The decade-coded one is 'not reported', NOT '2-11'.
    expect(d.ageGroups['45-64']).toBe(1);
    expect(d.ageGroups['not reported']).toBe(1);
    expect(d.ageGroups['2-11']).toBeUndefined();
    expect(res.body.data.reportsByYear).toEqual({ '2024': 1, '2023': 1 });
  });
});

describe('GET /health does not assert capabilities it does not have', () => {
  it('names the three unimplemented analytics as not_implemented', async () => {
    const res = await request(app()).get('/api/real-world-evidence/health');

    expect(res.status).toBe(200);
    // Each of these was a hardcoded `true`, on the endpoint an integrator reads.
    expect(res.body.capabilities.propensityScoreMatching).toBe('not_implemented');
    expect(res.body.capabilities.survivalAnalysis).toBe('not_implemented');
    expect(res.body.capabilities.externalControlArm).toBe('not_implemented');
  });

  it('makes no HIPAA compliance claim and no FDA-alignment claim', async () => {
    const res = await request(app()).get('/api/real-world-evidence/health');

    // `hipaaCompliant: true` and `fdaRweFramework.aligned: true` were regulatory
    // statuses asserted as literals. Neither is a property a route can know
    // about itself; both are determinations someone makes about a deployment or
    // a study.
    expect(res.body.capabilities.hipaaCompliant).toBeUndefined();
    expect(res.body.fdaRweFramework).toBeUndefined();
    // The guidance documents survive as references, which is what they are.
    expect(res.body.fdaRweGuidanceReferences).toHaveLength(3);
  });
});
