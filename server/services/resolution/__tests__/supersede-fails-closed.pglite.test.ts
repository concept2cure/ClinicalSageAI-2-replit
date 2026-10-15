/**
 * A lock that cannot be read is a lock, and a supersede that did not archive
 * did not happen.
 *
 * ── The defects ──────────────────────────────────────────────────────────────
 * `executeSupersede` in bundle-executor.ts:
 *
 * 1. Read the object's state with getObjectState, which answers 'unknown' when
 *    its read FAILS, when the object is not in this tenant, and for a type it
 *    does not model — and then denied only 'locked' and 'superseded'. So a lock
 *    timeout on that read (a deploy's unconditional ALTER TABLE replay produces
 *    exactly that) let the executor supersede the locked record the guard
 *    exists to refuse.
 *
 * 2. Recorded, confirmed and archived in three separate commits, and the
 *    archive — markObjectSuperseded — was Promise<void> with a warn-only catch.
 *    A failed or zero-row archive was invisible, the function returned
 *    { outcome: 'executed', newState: 'superseded' }, and a CONFIRMED
 *    supersession record stood beside an artifact that was never archived and
 *    still counted toward submission readiness.
 *
 * 3. For an artifact, superseded IS archived (status = 'archived'), so an
 *    already-superseded artifact read 'archived' and the "already superseded"
 *    guard never fired for the one type it mattered most for.
 *
 * The resolution suite's mocks answer any statement, which is how all three
 * stayed invisible there. This runs against the real DDL on PGlite.
 *
 * @module server/services/resolution/__tests__/supersede-fails-closed.pglite
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const h = vi.hoisted(() => ({ db: null as any, pool: null as any }));
vi.mock('../../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
}));

import { executeSupersede, markObjectSuperseded } from '../bundle-executor';

const pg = new PGlite();
h.db = drizzle(pg);
h.pool = { query: async (text: string, params?: unknown[]) => pg.query(text, params) };

const ORG = 7;
const PROJECT = 3;
const USER = 11;

const DDL = `
DROP TABLE IF EXISTS supersession_records, concept2cure_artifacts CASCADE;
DROP TYPE IF EXISTS supersession_state;
CREATE TYPE supersession_state AS ENUM ('proposed', 'confirmed', 'reverted');
CREATE TABLE concept2cure_artifacts (
  id SERIAL PRIMARY KEY, artifact_id TEXT NOT NULL UNIQUE, project_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL, title TEXT NOT NULL DEFAULT 't',
  status TEXT NOT NULL DEFAULT 'draft', updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE supersession_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL, project_id INTEGER NOT NULL,
  superseded_object_type VARCHAR(100) NOT NULL, superseded_object_id TEXT NOT NULL,
  superseded_object_title TEXT,
  successor_object_type VARCHAR(100) NOT NULL, successor_object_id TEXT NOT NULL,
  successor_object_title TEXT,
  state supersession_state NOT NULL DEFAULT 'proposed',
  rationale TEXT NOT NULL, resolution_plan_id UUID, bundle_id UUID,
  created_by_id INTEGER NOT NULL, confirmed_by_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), confirmed_at TIMESTAMPTZ
);`;

const BUNDLE = { id: '00000000-0000-4000-8000-000000000001', projectId: PROJECT, planId: null } as any;
const item = (objectId: string) => ({
  objectType: 'artifact', objectId, objectTitle: 'Clinical Overview',
  actionDescription: 'replaced by corrected draft',
}) as any;

async function seed(artifactId: string, status: string) {
  await pg.query(
    `INSERT INTO concept2cure_artifacts (artifact_id, project_id, organization_id, status) VALUES ($1, $2, $3, $4)`,
    [artifactId, PROJECT, ORG, status],
  );
}
const records = async () =>
  (await pg.query(`SELECT state FROM supersession_records`)).rows as Array<{ state: string }>;
const statusOf = async (artifactId: string) =>
  ((await pg.query(`SELECT status FROM concept2cure_artifacts WHERE artifact_id = $1`, [artifactId])).rows[0] as any)?.status;

beforeEach(async () => { await pg.exec(DDL); });
afterAll(async () => { await pg.close(); });

describe('the lock guard fails closed', () => {
  it('refuses a locked artifact (the control)', async () => {
    await seed('a_locked', 'locked');
    const r = await executeSupersede(ORG, USER, BUNDLE, item('a_locked'));
    expect(r.outcome).toBe('blocked');
    expect(await records()).toEqual([]);
  });

  it('refuses when the state cannot be read, rather than proceeding', async () => {
    /* The read fails outright. getObjectState answers 'unknown', which the old
       guard let through — and the supersede then ran against a state nobody
       had seen. */
    await seed('a_locked', 'locked');
    await pg.exec(`ALTER TABLE concept2cure_artifacts RENAME TO concept2cure_artifacts_hidden`);

    const r = await executeSupersede(ORG, USER, BUNDLE, item('a_locked'));

    expect(r.outcome).toBe('blocked');
    expect((r as { reason: string }).reason).toMatch(/could not be\s+established/);
    expect(await records(), 'no supersession may be recorded for an unread state').toEqual([]);
    await pg.exec(`ALTER TABLE concept2cure_artifacts_hidden RENAME TO concept2cure_artifacts`);
  });

  it('refuses an object that is not in this organization', async () => {
    const r = await executeSupersede(ORG, USER, BUNDLE, item('a_nowhere'));
    expect(r.outcome).toBe('blocked');
    expect(await records()).toEqual([]);
  });

  it('refuses an artifact that is already superseded — which reads as archived', async () => {
    await seed('a_archived', 'archived');
    const r = await executeSupersede(ORG, USER, BUNDLE, item('a_archived'));
    expect(r.outcome).toBe('blocked');
    expect((r as { reason: string }).reason).toMatch(/already superseded/);
  });
});

describe('record, confirm and archive are one act', () => {
  it('supersedes a draft: one confirmed record, and the artifact archived', async () => {
    await seed('a_draft', 'draft');
    const r = await executeSupersede(ORG, USER, BUNDLE, item('a_draft'));

    expect(r.outcome).toBe('executed');
    expect(await records()).toEqual([{ state: 'confirmed' }]);
    expect(await statusOf('a_draft')).toBe('archived');
  });

  it('rolls the confirmed record back when the archive fails', async () => {
    /* The archive write itself fails. Before, the record and its confirmation
       had already committed, the failure was swallowed, and the outcome read
       'executed' — a confirmed supersession of an artifact still in force. */
    await seed('a_draft', 'draft');
    await pg.exec(`
      CREATE FUNCTION refuse_archive() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = 'archived' THEN RAISE EXCEPTION 'archive refused'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER refuse_archive BEFORE UPDATE ON concept2cure_artifacts
        FOR EACH ROW EXECUTE FUNCTION refuse_archive();
    `);

    const r = await executeSupersede(ORG, USER, BUNDLE, item('a_draft'));

    expect(r.outcome).toBe('blocked');
    expect(await records(), 'the record and its confirmation must roll back with the archive').toEqual([]);
    expect(await statusOf('a_draft')).toBe('draft');
    await pg.exec(`DROP TRIGGER refuse_archive ON concept2cure_artifacts; DROP FUNCTION refuse_archive();`);
  });
});

describe('markObjectSuperseded reports what it did', () => {
  it('answers false for an artifact that is not there, instead of nothing', async () => {
    expect(await markObjectSuperseded(ORG, 'artifact', 'a_nowhere')).toBe(false);
  });

  it('answers true once the artifact is archived', async () => {
    await seed('a_draft', 'draft');
    expect(await markObjectSuperseded(ORG, 'artifact', 'a_draft')).toBe(true);
    expect(await statusOf('a_draft')).toBe('archived');
  });

  it('does not reach another organization\'s artifact', async () => {
    await seed('a_draft', 'draft');
    expect(await markObjectSuperseded(ORG + 1, 'artifact', 'a_draft')).toBe(false);
    expect(await statusOf('a_draft')).toBe('draft');
  });
});
