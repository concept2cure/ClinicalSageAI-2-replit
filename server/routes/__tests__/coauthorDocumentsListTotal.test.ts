/**
 * GET /api/coauthor/documents reports the organisation's REAL document count
 * as `total`, not the length of the capped page it returned.
 *
 * ── The defect (HS-0928-1, 2026-09-28) ───────────────────────────────────────
 * The route capped the page at min(limit, 200) and then answered
 * `total: documents.length`. EctdCoauthor.tsx computes
 * `partialRead = serverTotal > total` from that field to decide whether the
 * backbone it rolled up readiness over is complete; with total always equal
 * to the page length the check could never fire, so a truncated backbone read
 * as complete — including the "All documents approved" reassurance.
 *
 * Runs the real router on PGlite: more rows than `limit` must give
 * total > documents.length, and another organisation's rows must not count.
 */
import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'coauthor-list-total-secret-padded-to-32-chars';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));

vi.mock('../../db', () => ({
  get db() {
    return holder.db;
  },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
  transaction: vi.fn(),
}));

vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { ...(req.user || {}), id: 3, userId: 3, organizationId: 7 };
    next();
  },
  authenticateToken: (_r: any, _s: any, n: any) => n(),
  requireAuth: (_r: any, _s: any, n: any) => n(),
}));

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';
import coauthorRoutes from '../coauthor';

const ORG = 7;
const OTHER_ORG = 8;
const OWN_ROWS = 5;
const FOREIGN_ROWS = 4;

let h: IndPgliteDb;
const app = express();
app.use(express.json());
app.use('/api/coauthor', coauthorRoutes);

beforeAll(async () => {
  h = await createIndPgliteDb({ leafSources: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  // The harness mirrors only the columns the resolver reads; the route's
  // `.select()` selects every column shared/schema.ts declares.
  await h.pglite.exec(`
    ALTER TABLE coauthor_documents
      ADD COLUMN IF NOT EXISTS sections JSONB, ADD COLUMN IF NOT EXISTS template_id INTEGER,
      ADD COLUMN IF NOT EXISTS created_by TEXT, ADD COLUMN IF NOT EXISTS client_workspace TEXT,
      ADD COLUMN IF NOT EXISTS completion_percentage INTEGER,
      ADD COLUMN IF NOT EXISTS regulatory_compliance_score INTEGER,
      ADD COLUMN IF NOT EXISTS metadata JSONB, ADD COLUMN IF NOT EXISTS ectd_module_id INTEGER,
      ADD COLUMN IF NOT EXISTS module_name TEXT, ADD COLUMN IF NOT EXISTS embedding TEXT;
    INSERT INTO coauthor_documents (organization_id, title, status)
      SELECT ${ORG}, 'own ' || g, 'approved' FROM generate_series(1, ${OWN_ROWS}) g;
    INSERT INTO coauthor_documents (organization_id, title, status)
      SELECT ${OTHER_ORG}, 'foreign ' || g, 'draft' FROM generate_series(1, ${FOREIGN_ROWS}) g;
  `);
}, 120_000);

afterAll(async () => {
  await h?.close();
});

describe('GET /api/coauthor/documents total', () => {
  it('reports the organisation count when the page is capped by limit', async () => {
    const res = await request(app).get('/api/coauthor/documents?limit=2');
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(2);
    expect(res.body.total).toBeGreaterThan(res.body.documents.length);
    expect(res.body.total).toBe(OWN_ROWS);
    expect(res.body.returned).toBe(2);
  });

  it('total equals the page length when every row fits, and excludes other organisations', async () => {
    const res = await request(app).get('/api/coauthor/documents?limit=50');
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(OWN_ROWS);
    expect(res.body.total).toBe(OWN_ROWS);
    expect(res.body.documents.every((d: any) => d.organizationId === ORG)).toBe(true);
  });
});
