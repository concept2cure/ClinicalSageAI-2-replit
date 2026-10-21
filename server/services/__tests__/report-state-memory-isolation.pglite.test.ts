import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import {
  clientMemoryEntries,
  notifications,
  auditTrail,
  projectIntelligenceProfiles,
  projectMemoryEntries,
} from '../../../shared/schema';

const h = vi.hoisted(() => ({
  pg: null as PGlite | null,
  db: null as ReturnType<typeof drizzle> | null,
}));
const dbDouble = vi.hoisted(() => ({
  get db() { if (!h.db) throw new Error('test database not initialized'); return h.db; },
  pool: { query: (text: string, params?: unknown[]) => h.pg!.query(text, params) },
  getPool: () => ({ query: (text: string, params?: unknown[]) => h.pg!.query(text, params) }),
}));
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);
vi.mock('../enhancedEmbeddingService.js', () => ({ getEmbeddingService: vi.fn() }));
vi.mock('../ragRouter.js', () => ({ ragRetrieve: vi.fn() }));
// Admission itself is covered by native JWT/request tests. This mounted feed
// companion exercises the real Drizzle selection/count/rendering boundary.
vi.mock('../../middleware/auth', () => ({ authenticateToken: ((_req, _res, next) => next()) as RequestHandler }));
vi.mock('../../middleware/tenantContext', () => ({
  requireOrganizationContext: ((_req, _res, next) => next()) as RequestHandler,
  requireTenantContext: ((_req, _res, next) => next()) as RequestHandler,
}));
vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => ((_req, _res, next) => next()) as RequestHandler,
}));

import {
  buildProjectIntelligenceContext,
  getProjectMemoryEntries,
  getSharedMemoryPool,
} from '../client-intelligence-memory';
import {
  getProjectIntelligence,
  getProjectMemory,
} from '../intelligence/project-intelligence-service';
import anaFeaturesRouter from '../../routes/ana-features';

const ORG = 7;
const PUBLIC_PROJECT = 41;
const PRIVATE_PROJECT = 42;
const PRIVATE_SOURCE = 'private-assessment-9';
const BUNDLE = {
  bundleId: 'mixed-account-bundle',
  organizationId: ORG,
  projectIds: [PUBLIC_PROJECT, PRIVATE_PROJECT],
  items: [{
    runId: PRIVATE_SOURCE,
    reportType: 'account-calendar',
    accessProjectIds: [PUBLIC_PROJECT, PRIVATE_PROJECT],
  }],
};
let profileId: number;
const app = express();
app.use((req, _res, next) => {
  req.organizationId = ORG;
  next();
});
app.use('/api/ana', anaFeaturesRouter);

// The same durable columns/defaults as the application schema. This test does
// not exercise vector arithmetic or ReportOS production: it directly retains
// the reserved full-manifest shape that the separately tested producer writes.
function ddlOf(table: PgTable): string {
  const config = getTableConfig(table);
  const columns = config.columns.map(column => {
    const type = column.getSQLType().startsWith('vector') ? 'text' : column.getSQLType();
    const value = column.default;
    const literal = typeof value === 'number' || typeof value === 'boolean' ? ` DEFAULT ${value}`
      : typeof value === 'string' ? ` DEFAULT '${value.replace(/'/g, "''")}'` : '';
    return `"${column.name}" ${type}${column.primary ? ' PRIMARY KEY' : ''}${literal}`;
  });
  return `CREATE TABLE "${config.name}" (${columns.join(', ')})`;
}

beforeAll(async () => {
  h.pg = new PGlite();
  h.db = drizzle(h.pg);
  for (const table of [projectIntelligenceProfiles, projectMemoryEntries, clientMemoryEntries, notifications, auditTrail]) {
    await h.pg.exec(ddlOf(table));
  }
  const profile = await h.pg.query<{ id: number }>(
    `INSERT INTO project_intelligence_profiles (project_id, organization_id, profile_status)
     VALUES ($1, $2, 'active') RETURNING id`, [PUBLIC_PROJECT, ORG]);
  profileId = profile.rows[0].id;
  for (const [title, source, content, date] of [
    ['Ordinary legacy memory', null, 'Ordinary public project knowledge', '2026-10-16'],
    ['Ordinary PDF memory', 'application/pdf', 'Read from a public project PDF', '2026-10-17'],
    ['Reserved mixed bundle', 'report_os_state', JSON.stringify(BUNDLE), '2026-10-18'],
  ]) {
    await h.pg.query(
      `INSERT INTO project_memory_entries
       (project_profile_id, project_id, organization_id, category, title, content,
        status, source_document_type, importance_level, confidence_score, created_at, updated_at)
       VALUES ($1,$2,$3,'regulatory',$4,$5,'active',$6,'high',NULL,$7,$7)`,
      [profileId, PUBLIC_PROJECT, ORG, title, content, source, date]);
  }
});
afterAll(async () => { await h.pg?.close(); });

describe('ReportOS internal records do not enter raw project memory', () => {
  it('excludes reserved records before raw list limits and total counts, preserving NULL/PDF sources', async () => {
    const first = await getProjectMemoryEntries(profileId, { limit: 1 });
    expect(first.totalCount).toBe(2);
    expect(first.entries.map(entry => entry.title)).toEqual(['Ordinary PDF memory']);
    const all = await getProjectMemoryEntries(profileId);
    expect(all.entries.map(entry => entry.sourceDocumentType)).toEqual(['application/pdf', null]);
    expect(JSON.stringify(all)).not.toContain(PRIVATE_SOURCE);
  });

  it('keeps internal manifests out of the shared memory pool before its limit', async () => {
    const pool = await getSharedMemoryPool(ORG, { projectId: PUBLIC_PROJECT, limit: 1 });
    expect(pool.entries.map(entry => entry.title)).toEqual(['Ordinary PDF memory']);
    expect(JSON.stringify(pool)).not.toContain(PRIVATE_SOURCE);
    const queried = await getSharedMemoryPool(ORG, { projectId: PUBLIC_PROJECT, query: PRIVATE_SOURCE });
    expect(queried.entries).toEqual([]);
  });

  it('builds the project prompt from ordinary memory only', async () => {
    const context = await buildProjectIntelligenceContext(PUBLIC_PROJECT, ORG);
    expect(context).toContain('Ordinary public project knowledge');
    expect(context).toContain('Read from a public project PDF');
    expect(context).not.toContain(PRIVATE_SOURCE);
    expect(context).not.toContain('Reserved mixed bundle');
  });

  it('excludes reserved state from intelligence summaries and their prompt reader', async () => {
    const summary = await getProjectIntelligence(PUBLIC_PROJECT, ORG);
    expect(summary?.memoryEntryCount).toBe(2);
    const memory = await getProjectMemory(PUBLIC_PROJECT, ORG, { limit: 1 });
    expect(memory.map(entry => entry.title)).toEqual(['Ordinary PDF memory']);
    expect(JSON.stringify(memory)).not.toContain(PRIVATE_SOURCE);
  });

  it('keeps reserved source metadata and content out of the mounted intelligence feed', async () => {
    const response = await request(app).get('/api/ana/intelligence-feed?limit=1');
    expect(response.status).toBe(200);
    expect(response.body.pagination.total).toBe(2);
    expect(response.body.items.map((item: { title: string }) => item.title)).toEqual(['Ordinary PDF memory']);
    expect(JSON.stringify(response.body)).not.toContain(PRIVATE_SOURCE);
    expect(JSON.stringify(response.body)).not.toContain('report_os_state');
  });

  it('retains the complete original manifest and all ordinary rows in storage', async () => {
    const records = await h.pg!.query<{ content: string }>(
      `SELECT content FROM project_memory_entries WHERE source_document_type = 'report_os_state'`);
    expect(records.rows.map(record => JSON.parse(record.content))).toEqual([BUNDLE]);
    const count = await h.pg!.query<{ count: number }>('SELECT COUNT(*)::integer AS count FROM project_memory_entries');
    expect(count.rows[0].count).toBe(3);
  });
});
