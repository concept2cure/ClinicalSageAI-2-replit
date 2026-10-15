/**
 * Real-world evidence 503 / 501 — the caller is told what failed, never the
 * thrower's own text (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * - The FAERS 503 (`respondFaersUnavailable`) carried `detail: err.detail`, and
 *   for a transport failure that detail embedded the fetch error's message:
 *   the proxy or resolver the server dials, an internal address. openFDA's own
 *   HTTP status and error code are public facts about a public API and stay —
 *   rwe-faers-honesty.contract.test.ts pins the 429 case.
 * - The study 501 (`source_not_configured`) carried `message: err.message`,
 *   which names the deployment's environment variable (FHIR_BASE_URL).
 *
 * Both keep their status and machine-readable code (the first P1-17 tranche's
 * treatment of a coded non-500; `serverError()` answers only 500). The
 * fail-closed shape of the FAERS 503 — no `data`, no `signals` — is unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-TRANSPORT-DETAIL connect ECONNREFUSED 10.9.8.7:3128';

const { runRWEStudy, logError } = vi.hoisted(() => ({ runRWEStudy: vi.fn(), logError: vi.fn() }));

vi.mock('../../services/rwe-study-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/rwe-study-service')>();
  return { ...actual, runRWEStudy };
});
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: logError, info: vi.fn(), debug: vi.fn() }),
  };
});

import { RWESourceNotConfiguredError } from '../../services/rwe-study-service';
import rweRouter from '../real-world-evidence';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/real-world-evidence', rweRouter);
  return a;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('FAERS 503: the outage is stated, the transport text is logged', () => {
  for (const path of ['/faers', '/signal-detection']) {
    it(`POST ${path}`, async () => {
      fetchMock.mockRejectedValue(new Error(SENTINEL));
      const res = await request(app()).post(`/api/real-world-evidence${path}`).send({ drugName: 'aspirin' });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FAERS_UNAVAILABLE');
      expect(res.body.error.message).toContain('not a finding of no signal');
      expect(res.body.error.detail).toBe('openFDA request failed');
      expect(res.body.data).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/SENTINEL-TRANSPORT-DETAIL|ECONNREFUSED|10\.9\.8\.7/);
      expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-TRANSPORT-DETAIL');
    });
  }
});

describe('study 501: the unconfigured source is named, the deployment variable is not', () => {
  it('POST /query with no FHIR source connected', async () => {
    runRWEStudy.mockRejectedValue(new RWESourceNotConfiguredError('fhir'));
    const res = await request(app())
      .post('/api/real-world-evidence/query')
      .send({ exposureCode: 'E1', outcomeCode: 'O1' });

    expect(res.status).toBe(501);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('source_not_configured');
    expect(res.body.error.dataSource).toBe('fhir');
    expect(res.body.error.message).toMatch(/not configured/);
    expect(JSON.stringify(res.body)).not.toContain('FHIR_BASE_URL');
  });

  it('POST /query with a licensed vendor source', async () => {
    runRWEStudy.mockRejectedValue(new RWESourceNotConfiguredError('aetion'));
    const res = await request(app())
      .post('/api/real-world-evidence/query')
      .send({ dataSource: 'aetion', exposureCode: 'E1', outcomeCode: 'O1' });
    expect(res.status).toBe(501);
    expect(res.body.error.dataSource).toBe('aetion');
    expect(res.body.error.message).toContain('"aetion"');
  });
});
