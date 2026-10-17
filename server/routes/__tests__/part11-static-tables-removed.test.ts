/**
 * Settings/integrity audit 2026-10-17, finding 1.
 *
 * GET /api/part11/compliance-status answered every §11.10 section and every
 * SOC 2 Trust Services category as a hardcoded `not_assessed`, and
 * GET /api/part11/soc2/controls answered every control as a hardcoded
 * `not_collected` with zero evidence. Nothing was assessed and nothing was
 * collected: the rows were constants. A table of constant verdicts is a static
 * claim dressed as an assessment, so both routes are gone. The real verdict
 * this router serves — the recomputed audit-event chain — stays.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import part11Router from '../part11-compliance';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).dbClient = { query: () => Promise.resolve({ rows: [] }) };
    (req as any).user = { organizationId: 7 };
    next();
  });
  a.use('/', part11Router);
  return a;
}

describe('Part 11 router serves no hardcoded assessment tables', () => {
  it('GET /compliance-status is not served', async () => {
    const res = await request(app()).get('/compliance-status');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body ?? {})).not.toMatch(/not_assessed/);
  });

  it('GET /soc2/controls is not served', async () => {
    const res = await request(app()).get('/soc2/controls');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body ?? {})).not.toMatch(/not_collected/);
  });

  it('POST /soc2/evidence is not served: it answered "collected" and stored nothing', async () => {
    const res = await request(app()).post('/soc2/evidence').send({ controlId: 'CC6.1', title: 'MFA log', collectedBy: 'qa' });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body ?? {})).not.toMatch(/collected/);
  });

  it('the source carries no constant not_assessed / not_collected verdicts', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../part11-compliance.ts'), 'utf8');
    expect(src).not.toMatch(/['"]not_assessed['"]/);
    expect(src).not.toMatch(/['"]not_collected['"]/);
  });
});
