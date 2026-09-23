/**
 * migrations/20260923b_artifact_approval_follows_status.sql — an approval does
 * not outlive the status that carries it.
 *
 * 2026-09-23 (W5/D7, final pass): the filing rule (artifactApproval,
 * server/services/ectd/package-content-fingerprint.ts) files an artifact when
 * its status is approved/locked AND version = approved_version_id. Only the
 * governed approval act (the status route's review → approved, authoring-
 * actions approve-artifact — role check + P12 review quorum) records
 * approved_version_id. But nothing cleared it when the approval was revoked:
 * the status route's approved → review and bundle-executor's
 * markObjectSuperseded (→ 'archived') left it in place, so a later
 * promote_artifact (APPROVAL_ROLES, no quorum) or an AnA archived → approved
 * made the artifact filable again with no review. The migration installs one
 * BEFORE INSERT OR UPDATE trigger that clears approved_version_id and
 * published_version_id whenever the row's status is not approved/locked — one
 * place, every writer.
 *
 * Run on PGlite with the REAL migration file (as registered in
 * C2C_MIGRATION_FILES), through the real writers where they can run here:
 * promote_artifact's handler, markObjectSuperseded, the AnA
 * update_artifact_status command. The status route's writes are its UPDATE
 * payload (server/routes/c2c/artifacts.ts PUT …/status, `updateData`) issued
 * through drizzle on the real table definition; the route itself is driven in
 * tests/artifact-status-lock-covers-approval.test.ts.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const h = vi.hoisted(() => ({ db: null as any, pool: null as any, handlers: new Map<string, any>() }));
vi.mock('../../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
}));
vi.mock('../../ai-actions/action-registry', () => ({
  registerActionHandler: (x: any) => h.handlers.set(x.actionType, x),
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => undefined) } }));
vi.mock('../../contradiction-engine-service', () => ({
  contradictionEngineService: {
    checkPromotionBlocked: vi.fn(async () => ({ blocked: false, blockingFindings: [], warningFindings: [] })),
  },
}));

import '../../ai-actions/handlers/promote-artifact';
import { updateArtifactStatus } from '../command-executor';
import { markObjectSuperseded } from '../../resolution/bundle-executor';
import { artifactApproval } from '../../ectd/package-content-fingerprint';
import { concept2cureArtifacts } from '../../../../shared/schema';
import { C2C_MIGRATION_FILES } from '../../../../scripts/db/migration-set.mjs';

const REPO = resolve(__dirname, '../../../..');
const FILE = 'migrations/20260923b_artifact_approval_follows_status.sql';
const migrationSql = () => readFileSync(resolve(REPO, FILE), 'utf8');

const pg = new PGlite();
h.db = drizzle(pg);
h.pool = {
  query: async (text: string, params?: unknown[]) => {
    const r = await pg.query(text, params);
    const rows = r.rows as unknown[];
    return { rows, rowCount: rows.length > 0 ? rows.length : ((r as { affectedRows?: number }).affectedRows ?? 0) };
  },
};

const ORG = 7;
const ARTIFACT_DDL = `
CREATE TABLE concept2cure_artifacts (
  id SERIAL PRIMARY KEY, artifact_id TEXT NOT NULL UNIQUE, project_id INTEGER NOT NULL,
  conversation_id INTEGER, organization_id INTEGER NOT NULL, type TEXT NOT NULL,
  category TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1, ctd_section TEXT, template_id TEXT, ana_thread_id TEXT,
  title_slug TEXT, status TEXT NOT NULL DEFAULT 'draft', approved_version_id INTEGER,
  published_version_id INTEGER, published_at TIMESTAMP, locked_at TIMESTAMP, locked_by_id INTEGER,
  created_by_id INTEGER, metadata JSON, citations JSONB DEFAULT '[]'::jsonb, citation_run_id UUID,
  citations_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);`;
const DDL = `
DROP TABLE IF EXISTS workflow_document_versions, unified_documents, concept2cure_artifacts CASCADE;
DROP FUNCTION IF EXISTS public.concept2cure_artifacts_approval_follows_status() CASCADE;
${ARTIFACT_DDL}
CREATE TABLE unified_documents (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, document_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', created_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_by TEXT, updated_at TIMESTAMP DEFAULT NOW(),
  organization_id INTEGER NOT NULL, latest_version INTEGER NOT NULL DEFAULT 1, metadata JSON
);
CREATE TABLE workflow_document_versions (
  id SERIAL PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, content JSON, created_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), comments TEXT, organization_id INTEGER NOT NULL
);`;

beforeEach(async () => {
  await pg.exec(DDL);
  await pg.exec(`
    INSERT INTO concept2cure_artifacts (id, artifact_id, project_id, organization_id, type, category, title, content, version, ctd_section, status, metadata)
    VALUES (5, 'artifact_five', 3, ${ORG}, 'markdown', 'document', 'Clinical Overview', 'body v1', 1, '2.5', 'review', '{"harness":{"submissionProgram":"ind"}}');
  `);
  if (existsSync(resolve(REPO, FILE))) await pg.exec(migrationSql());
});
afterAll(async () => {
  await pg.close();
});

interface Row {
  status: string;
  version: number;
  approved_version_id: number | null;
  published_version_id: number | null;
}
const row = async (): Promise<Row> =>
  (
    await pg.query<Row>(
      'SELECT status, version, approved_version_id, published_version_id FROM concept2cure_artifacts WHERE id = 5'
    )
  ).rows[0];
const verdict = (r: Row) =>
  artifactApproval({
    status: r.status,
    version: r.version,
    approvedVersionId: r.approved_version_id,
    publishedVersionId: r.published_version_id,
  });

/** The status route's writes: its `updateData` for each transition. */
const route = {
  async approve() {
    const r = await row();
    await h.db
      .update(concept2cureArtifacts)
      .set({ status: 'approved', updatedAt: new Date(), approvedVersionId: r.version })
      .where(eq(concept2cureArtifacts.id, 5));
  },
  async toReview() {
    await h.db.update(concept2cureArtifacts).set({ status: 'review', updatedAt: new Date() }).where(eq(concept2cureArtifacts.id, 5));
  },
  async lock() {
    const r = await row();
    await h.db
      .update(concept2cureArtifacts)
      .set({ status: 'locked', updatedAt: new Date(), lockedAt: new Date(), lockedById: 11, publishedVersionId: r.version, publishedAt: new Date() })
      .where(eq(concept2cureArtifacts.id, 5));
  },
  async unlock() {
    await h.db
      .update(concept2cureArtifacts)
      .set({ status: 'draft', updatedAt: new Date(), lockedAt: null, lockedById: null })
      .where(eq(concept2cureArtifacts.id, 5));
  },
};
const promote = () =>
  h.handlers.get('promote_artifact').execute(
    {
      actionType: 'promote_artifact',
      targetId: 5,
      projectId: 3,
      sourceSurface: 'ai_panel',
      payload: { approvalReason: 'Reviewed and approved for filing', confirmApproval: true },
    },
    { user: { userId: 11, userName: 'Approver', userRole: 'approver', organizationId: ORG }, db: h.db, actionId: 'act_1', ipAddress: '127.0.0.1' }
  );
const anaStatus = (status: 'draft' | 'review' | 'approved' | 'locked') =>
  updateArtifactStatus({ userId: 11, organizationId: ORG } as never, { projectId: 3, artifactId: 'artifact_five' as never, status });

describe('20260923b_artifact_approval_follows_status.sql', () => {
  it('is registered in C2C_MIGRATION_FILES above the final pair', () => {
    const idx = C2C_MIGRATION_FILES.indexOf(FILE);
    expect(idx).toBeGreaterThan(-1);
    expect(idx).toBeLessThan(C2C_MIGRATION_FILES.length - 2);
  });

  it('carries no DROP (RULE 1)', () => {
    const executable = migrationSql()
      .split('\n')
      .filter((line) => !/^\s*--/.test(line))
      .join('\n');
    expect(/\bDROP\b/i.test(executable)).toBe(false);
  });
});

describe('an approval does not outlive the status that carries it', () => {
  it('review → approved through the status route records v1 and is filable', async () => {
    await route.approve();
    const r = await row();
    expect(r.approved_version_id).toBe(1);
    expect(verdict(r)).toEqual({ filable: true });
  });

  it('approved → review clears the approval; promote_artifact back to approved is NOT filable', async () => {
    await route.approve();
    await route.toReview();
    const revoked = await row();
    expect(revoked.status).toBe('review');
    expect(revoked.approved_version_id).toBeNull();

    const out = await promote();
    expect(out.success).toBe(true);
    const r = await row();
    expect(r.status).toBe('approved');
    expect(r.approved_version_id).toBeNull();
    expect(verdict(r)).toMatchObject({ filable: false, reason: 'no-approved-version' });
    expect(out.warnings.join(' ')).toMatch(/recorded only by the review workflow's Approve action .*; this action records none/);
  }, 30_000);

  it('archived by markObjectSuperseded, then restored to approved by AnA, is NOT filable', async () => {
    await route.approve();
    await markObjectSuperseded(ORG, 'artifact', 'artifact_five');
    const archived = await row();
    expect(archived.status).toBe('archived');
    expect(archived.approved_version_id).toBeNull();

    const res = await anaStatus('approved');
    expect(res.success).toBe(true);
    const r = await row();
    expect(r.status).toBe('approved');
    expect(verdict(r)).toMatchObject({ filable: false, reason: 'no-approved-version' });
    expect(res.message).toMatch(/recorded only by the review workflow's Approve action .*; this command records none/);
  });

  it('approve → lock at the same version keeps the approval: still filable', async () => {
    await route.approve();
    await route.lock();
    const r = await row();
    expect(r.status).toBe('locked');
    expect(r.approved_version_id).toBe(1);
    expect(r.published_version_id).toBe(1);
    expect(verdict(r)).toEqual({ filable: true });
  });

  it('locked → draft (unlock) clears both the approval and the lock; re-approval records the new version', async () => {
    await route.approve();
    await route.lock();
    await route.unlock();
    const unlocked = await row();
    expect(unlocked.approved_version_id).toBeNull();
    expect(unlocked.published_version_id).toBeNull();
    await pg.query("UPDATE concept2cure_artifacts SET version = 2, content = 'body v2', status = 'review' WHERE id = 5");
    await route.approve();
    const r = await row();
    expect(r.approved_version_id).toBe(2);
    expect(verdict(r)).toEqual({ filable: true });
  });

  it('the status comparison is case-insensitive', async () => {
    await pg.query("UPDATE concept2cure_artifacts SET status = 'Approved', approved_version_id = 1 WHERE id = 5");
    expect((await row()).approved_version_id).toBe(1);
    await pg.query("UPDATE concept2cure_artifacts SET status = 'REVIEW' WHERE id = 5");
    expect((await row()).approved_version_id).toBeNull();
  });

  it('an INSERT of a non-approved row carries no approval', async () => {
    await pg.query(
      `INSERT INTO concept2cure_artifacts (artifact_id, project_id, organization_id, type, category, title, content, status, approved_version_id, published_version_id)
       VALUES ('artifact_six', 3, ${ORG}, 'markdown', 'document', 'T', 'c', 'draft', 1, 1)`
    );
    const r = (
      await pg.query<Row>("SELECT status, version, approved_version_id, published_version_id FROM concept2cure_artifacts WHERE artifact_id = 'artifact_six'")
    ).rows[0];
    expect(r.approved_version_id).toBeNull();
    expect(r.published_version_id).toBeNull();
  });
});

describe('replay safety and the existing rows', () => {
  it('clears a stale approval left on a non-approved row before the trigger existed', async () => {
    const fresh = new PGlite();
    try {
      await fresh.exec(ARTIFACT_DDL);
      await fresh.exec(`
        INSERT INTO concept2cure_artifacts (artifact_id, project_id, organization_id, type, category, title, content, status, approved_version_id, published_version_id)
        VALUES ('stale_review', 1, 1, 'm', 'd', 'T', 'c', 'review', 1, NULL),
               ('stale_archived', 1, 1, 'm', 'd', 'T', 'c', 'archived', 1, 1),
               ('kept_approved', 1, 1, 'm', 'd', 'T', 'c', 'approved', 1, NULL),
               ('kept_locked', 1, 1, 'm', 'd', 'T', 'c', 'locked', 1, 1);
      `);
      await fresh.exec(migrationSql());
      const rows = (
        await fresh.query<{ artifact_id: string; approved_version_id: number | null; published_version_id: number | null }>(
          'SELECT artifact_id, approved_version_id, published_version_id FROM concept2cure_artifacts ORDER BY artifact_id'
        )
      ).rows;
      expect(rows).toEqual([
        { artifact_id: 'kept_approved', approved_version_id: 1, published_version_id: null },
        { artifact_id: 'kept_locked', approved_version_id: 1, published_version_id: 1 },
        { artifact_id: 'stale_archived', approved_version_id: null, published_version_id: null },
        { artifact_id: 'stale_review', approved_version_id: null, published_version_id: null },
      ]);
    } finally {
      await fresh.close();
    }
  });

  it('applies twice: one trigger, and an approved row written between the runs keeps its approval', async () => {
    await route.approve();
    await pg.exec(migrationSql());
    const triggers = await pg.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = 'concept2cure_artifacts'::regclass AND NOT tgisinternal"
    );
    expect(triggers.rows[0].n).toBe(1);
    expect(verdict(await row())).toEqual({ filable: true });
  });

  it('NOTICE-skips on a database without concept2cure_artifacts (the set-only blank replay)', async () => {
    const blank = new PGlite();
    try {
      await expect(blank.exec(migrationSql())).resolves.toBeDefined();
    } finally {
      await blank.close();
    }
  });
});
