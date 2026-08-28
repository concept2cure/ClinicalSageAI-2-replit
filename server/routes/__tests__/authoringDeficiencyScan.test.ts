/**
 * The heuristic section scan — its arithmetic, and the verdict it must not make.
 *
 * Two defects met here.
 *
 * 1. THE SCORE COULD GO NEGATIVE. It was `(10 - deficiencies.length) / 10`,
 *    where 10 was a constant unrelated to the checks performed. The
 *    module-keyword check pushes one deficiency PER missing term — six of them
 *    — so an empty section reached thirteen deficiencies and scored -30%. The
 *    denominator now counts distinct checks, which keeps the range 0-100 and
 *    means something a reader can act on.
 *
 * 2. A SECOND ENDPOINT ANSWERED "PASS" HAVING CHECKED NOTHING. POST
 *    /ai/validate-compliance returned `overall_compliance: 'PASS'` whenever its
 *    missing-element list was empty, and that list was only ever populated for
 *    five hardcoded 3.2.S.* codes. Every other section in the CTD got PASS from
 *    zero assertions. Its useful half — the per-section element lists — is now
 *    a check here; the endpoint is gone.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../../db', () => {
  const api = {
    query: (...a: unknown[]) => mockQuery(...a),
    connect: async () => ({ query: (...a: unknown[]) => mockQuery(...a), release: () => {} }),
  };
  return { pool: api, getPool: () => api, query: (...a: unknown[]) => mockQuery(...a), db: {} };
});

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-deficiency-scan';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return `Bearer ${await new SignJWT({ sub: 'u1', organizationId: 7, email: 'ra@test.co' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret)}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

function wireSection(code: string, content: string, module = 'M3') {
  mockQuery.mockImplementation(async (sql: unknown) => {
    if (String(sql).includes('FROM authoring_sections')) {
      return {
        rowCount: 1,
        rows: [{ id: 'S1', doc_id: 'D1', code, title: 'A section', content, module }],
      };
    }
    return { rowCount: 0, rows: [] };
  });
}

async function scan() {
  return request(makeApp())
    .post('/api/authoring/sections/S1/ai/deficiency-scan')
    .set('Authorization', await bearer())
    .send({});
}

beforeEach(() => mockQuery.mockReset());

describe('POST /sections/:id/ai/deficiency-scan', () => {
  it('never reports a negative percentage, however bad the section', async () => {
    // Empty content trips length, all six module keywords, data, and structure.
    wireSection('3.2.S.1', '');
    const r = await scan();

    expect(r.status).toBe(200);
    const s = r.body.scan_results;
    expect(s.deficiency_count).toBeGreaterThan(10); // the old denominator was 10
    expect(s.quality_score).toBeGreaterThanOrEqual(0);
    expect(s.quality_score).toBeLessThanOrEqual(100);
    expect(s.compliance_score).toBe(s.quality_score);
  });

  it('publishes the denominator, so the percentage is not taken on trust', async () => {
    wireSection('3.2.S.1', '');
    const s = (await scan()).body.scan_results;

    expect(typeof s.checks_run).toBe('number');
    expect(s.checks_run).toBeGreaterThan(0);
    expect(s.checks_passed).toBeGreaterThanOrEqual(0);
    expect(s.checks_passed).toBeLessThanOrEqual(s.checks_run);
    expect(s.quality_score).toBe(Math.round((s.checks_passed / s.checks_run) * 100));
  });

  it('applies the CTD element check migrated off the deleted endpoint', async () => {
    // 3.2.S.3 expects elucidation of structure and impurities.
    wireSection('3.2.S.3', 'x'.repeat(200) + '\nTable 1\nspecification validation stability quality manufacture control\na\nb\nc');
    const s = (await scan()).body.scan_results;

    const ctd = s.deficiencies.filter((d: any) => d.type === 'missing_ctd_element');
    expect(ctd.length).toBeGreaterThan(0);
    expect(JSON.stringify(ctd)).toMatch(/elucidation of structure|impurities/);
  });

  it('does not count a CTD check it has no expectations for', async () => {
    // The deleted endpoint's arithmetic bug: an empty list read as a pass, so
    // a section it knew nothing about scored as if it had been examined.
    wireSection('3.2.S.1', '');
    const withList = (await scan()).body.scan_results.checks_run;

    wireSection('5.3.5.1', '', 'M5'); // no CTD element list for this code
    const withoutList = (await scan()).body.scan_results.checks_run;

    expect(withList).toBe(withoutList + 1);
  });

  it('frames its output as a signal, never as a compliance determination', async () => {
    wireSection('3.2.S.1', 'x'.repeat(400));
    const body = (await scan()).body;

    expect(body.scan_results.signal_type).toBe('heuristic_quality');
    expect(body.message).toMatch(/not a compliance determination/i);
    // The word this scan is not entitled to use.
    expect(JSON.stringify(body)).not.toMatch(/"(PASS|compliant)"/);
  });
});

describe('POST /ai/validate-compliance', () => {
  it('is gone — it answered PASS for every section it never examined', async () => {
    wireSection('3.2.S.1', 'x');
    const r = await request(makeApp())
      .post('/api/authoring/ai/validate-compliance')
      .set('Authorization', await bearer())
      .send({ section_code: '5.3.5.1', content: 'anything at all' });

    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toMatch(/overall_compliance|PASS/);
  });
});
