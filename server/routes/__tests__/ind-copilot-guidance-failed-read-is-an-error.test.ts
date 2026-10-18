/**
 * GET /api/ind/applications/:id/guidance/:sectionCode answers an error when the
 * regulatory guideline read fails.
 *
 * Until 2026-10-15 (audit report_ind_ivd_irb finding 24) indCopilot's
 * fetchRegulatoryGuidelines returned its failure as the guideline text
 * ('Unable to fetch specific guidelines. Please refer to general FDA guidance
 * for IND submissions.'), getRegulatoryGuidance passed it on, and this route
 * wrapped it as `{ success: true, guidance }` with 200.
 *
 * The router and indCopilot are real; Supabase is a stand-in client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const F = vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  return { select: {} as Record<string, { data: unknown; error: unknown }> };
});

vi.mock('@supabase/supabase-js', () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = () => b;
    b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve(F.select[table] ?? { data: [], error: null }).then(ok, ko);
    return b;
  };
  return { createClient: () => ({ from: (table: string) => builder(table) }) };
});
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: vi.fn() } }));
vi.mock('../../db', () => ({ query: vi.fn(), transaction: vi.fn() }));

import indRouter from '../ind';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { tenantId: number }).tenantId = 7;
    next();
  });
  a.use('/api/ind', indRouter);
  return a;
}

beforeEach(() => {
  F.select = {};
});

describe('GET /api/ind/applications/:id/guidance/:sectionCode', () => {
  it('answers 500, with no guidance, when the guideline store refused the read', async () => {
    F.select.regulatory_guidelines = { data: null, error: { message: 'permission denied for table regulatory_guidelines' } };
    const r = await request(app()).get('/api/ind/applications/1/guidance/2.7');
    expect(r.status, 'the failed read was served as guidance with 200').toBe(500);
    expect(r.body).toEqual({ success: false, error: 'Failed to get regulatory guidance' });
  });

  it('answers 200 with the guideline text when the read succeeds', async () => {
    F.select.regulatory_guidelines = { data: [{ title: 'ICH M4Q', text: 'Quality module structure.', url: null }], error: null };
    const r = await request(app()).get('/api/ind/applications/1/guidance/3.2.P');
    expect(r.status).toBe(200);
    expect(r.body.guidance.guidance).toContain('Quality module structure.');
  });
});
