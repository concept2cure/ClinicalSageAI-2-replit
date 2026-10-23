/**
 * GET /api/module-subscriptions/enabled and /license report a licence that
 * could not be read as an error (500), and an organization with no row as 404.
 *
 * What the code used to do (until 2026-10-15): both read through getLicenseInfo,
 * which turns a failed read into null — the same null as "no such
 * organization". /enabled then answered 200 { modules: [], tier: 'free' } (an
 * unread licence shown as the free plan with nothing enabled, and the same for
 * an organization with no row), and /license answered 404 'License not found'
 * for a read that had failed.
 *
 * license-manager is the real module; only the pool answers are stubbed, by
 * statement, so the licence read can fail while the quota reads succeed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

type Rows = { rows: Array<Record<string, unknown>> };
const H = vi.hoisted(() => ({
  org: null as null | Record<string, unknown>,
  failLicenceRead: false,
}));

const DRIVER_TEXT = 'connect ECONNREFUSED 10.0.0.5:5432';

async function answer(sql: string): Promise<Rows> {
  const q = sql.replace(/\s+/g, ' ').trim();
  if (/^SELECT id, tier, industry_mode, max_users, max_projects, max_storage FROM organizations/.test(q)) {
    if (H.failLicenceRead) throw new Error(DRIVER_TEXT);
    return { rows: H.org ? [H.org] : [] };
  }
  if (/^SELECT module_id, expires_at FROM module_subscriptions/.test(q)) {
    return { rows: [{ module_id: 'vault', expires_at: null }] };
  }
  if (/^SELECT max_projects FROM organizations/.test(q)) return { rows: H.org ? [{ max_projects: H.org.max_projects }] : [] };
  if (/^SELECT max_users FROM organizations/.test(q)) return { rows: H.org ? [{ max_users: H.org.max_users }] : [] };
  if (/^SELECT COUNT\(\*\) as cnt FROM projects/.test(q)) return { rows: [{ cnt: '3' }] };
  if (/^SELECT COUNT\(\*\) as cnt FROM organization_users/.test(q)) return { rows: [{ cnt: '2' }] };
  throw new Error(`unexpected SQL in test: ${q}`);
}

vi.mock('../../db.js', () => ({ pool: { query: (sql: string) => answer(sql) }, query: (sql: string) => answer(sql) }));
vi.mock('../../db', () => ({ pool: { query: (sql: string) => answer(sql) }, query: (sql: string) => answer(sql) }));
vi.mock('../../services/auditService.js', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));
vi.mock('../../services/user-intelligence.js', () => ({
  loadUserIntelligence: vi.fn(),
  touchWorkSession: vi.fn(),
  generateWorkRecommendations: vi.fn(),
  addToWorkQueue: vi.fn(),
}));

import moduleSubscriptionsRouter from '../module-subscriptions';

const app = express();
app.use((req, _res, next) => {
  (req as unknown as { user: { id: number; organizationId: number; role: string } }).user = { id: 42, organizationId: 7, role: 'member' };
  next();
});
app.use('/api/module-subscriptions', moduleSubscriptionsRouter);

const ORG = { id: 7, tier: 'professional', industry_mode: 'biotech', max_users: 5, max_projects: null, max_storage: 5 };

beforeEach(() => {
  H.org = { ...ORG };
  H.failLicenceRead = false;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('GET /enabled', () => {
  it('answers 500 when the licence could not be read — not the free plan with nothing enabled', async () => {
    H.failLicenceRead = true;
    const res = await request(app).get('/api/module-subscriptions/enabled');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to load enabled modules' });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('answers 404 when the organization has no row', async () => {
    H.org = null;
    const res = await request(app).get('/api/module-subscriptions/enabled');
    expect(res.status).toBe(404);
    expect(res.body.tier).toBeUndefined();
  });

  it('answers the modules and plan it read (control)', async () => {
    const res = await request(app).get('/api/module-subscriptions/enabled');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ modules: ['vault'], tier: 'professional', industryMode: 'biotech' });
  });
});

describe('GET /license', () => {
  it('answers 500 when the licence could not be read — not 404 "License not found"', async () => {
    H.failLicenceRead = true;
    const res = await request(app).get('/api/module-subscriptions/license');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to load license info' });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('answers 404 when the organization has no row', async () => {
    H.org = null;
    const res = await request(app).get('/api/module-subscriptions/license');
    expect(res.status).toBe(404);
  });

  it('answers the licence it read, an unrecorded limit as null (control)', async () => {
    const res = await request(app).get('/api/module-subscriptions/license');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tier: 'professional', maxProjects: null, maxUsers: 5 });
    expect(res.body.usage).toEqual({
      projects: { withinQuota: null, currentCount: 3, maxAllowed: null },
      users: { withinQuota: true, currentCount: 2, maxAllowed: 5 },
    });
  });
});
