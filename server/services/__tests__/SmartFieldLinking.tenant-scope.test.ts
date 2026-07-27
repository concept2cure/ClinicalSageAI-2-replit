/**
 * SmartFieldLinking tenant scoping — END-TO-END against in-process PGlite.
 *
 * The 510(k) field-sync data layer resolved the row to mutate by `document_type`
 * (or stage/section) alone, with `.limit(1)` and no organization/project
 * predicate. A `POST /api/field-sync/update-field` — or the Socket.io
 * `update-field` event — for `documentType: 'main_510k'` therefore mutated
 * whichever tenant's `main_510k` row Postgres returned first: a cross-tenant
 * write that survived the route/SSE authentication fix (#1168). These tests run
 * the REAL propagation through `smartFieldLinking.updateField` against real
 * Postgres and prove:
 *
 *   - a workflow update writes ONLY the caller-tenant/project document;
 *   - a caller claiming another tenant's project id writes ZERO rows (the
 *     cross-tenant hazard, closed);
 *   - an update carrying no (organization, project) scope is refused (fail
 *     closed) and mutates nothing;
 *   - a document→workflow update refuses a project outside the caller's
 *     organization (stage_progress has no organization_id column of its own),
 *     and succeeds for the owning tenant.
 *
 * One PGlite instance for the file; tables are truncated and reseeded per test.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';

// `db` is hoisted so the same drizzle instance is shared with the service under
// test, which imports `{ db }` from `../db`.
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../db', () => ({
  get db() {
    return holder.db;
  },
}));

import { smartFieldLinking } from '../SmartFieldLinking';
import { fda510kDocuments, fda510kStageProgress } from '@shared/schema';

const ORG_A = 9001;
const ORG_B = 9002;
const PROJECT_A = 5001;
const PROJECT_B = 5002;

// Full column sets: the service uses `db.select()` (all columns), so the DDL
// must define every column the drizzle schema lists for these tables. Projects
// is read only via `.select({ id })`, so a minimal shape suffices there.
const DDL = `
CREATE TABLE IF NOT EXISTS fda_510k_projects (
  id              INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fda_510k_documents (
  id                  SERIAL PRIMARY KEY,
  organization_id     INTEGER NOT NULL,
  project_id          INTEGER NOT NULL,
  template_id         INTEGER,
  document_id         TEXT NOT NULL UNIQUE,
  document_type       TEXT NOT NULL,
  document_name       TEXT NOT NULL,
  content             TEXT,
  form_data           JSON,
  attachments         JSON,
  status              TEXT DEFAULT 'draft',
  is_locked           BOOLEAN DEFAULT false,
  locked_at           TIMESTAMPTZ,
  locked_by           INTEGER,
  version             INTEGER DEFAULT 1,
  previous_version_id INTEGER,
  change_log          JSON,
  signatures          JSON,
  signature_required  BOOLEAN DEFAULT false,
  validation_status   TEXT DEFAULT 'pending',
  validation_errors   JSON,
  compliance_score    INTEGER,
  created_by          INTEGER,
  updated_by          INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fda_510k_stage_progress (
  id                SERIAL PRIMARY KEY,
  project_id        INTEGER NOT NULL,
  stage_name        TEXT NOT NULL,
  section_name      TEXT NOT NULL,
  status            TEXT DEFAULT 'pending',
  progress          INTEGER DEFAULT 0,
  is_required       BOOLEAN DEFAULT true,
  collected_data    JSON,
  validation_status TEXT DEFAULT 'pending',
  validation_errors JSON,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  completed_by      INTEGER,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

let pglite: PGlite;

async function docContent(documentId: string): Promise<any> {
  const rows = await holder.db
    .select()
    .from(fda510kDocuments)
    .where(eq(fda510kDocuments.documentId, documentId))
    .limit(1);
  const c = rows[0]?.content;
  return typeof c === 'string' ? JSON.parse(c) : c ?? null;
}

async function stageData(projectId: number): Promise<any> {
  const rows = await holder.db
    .select()
    .from(fda510kStageProgress)
    .where(eq(fda510kStageProgress.projectId, projectId))
    .limit(1);
  return rows[0]?.collectedData ?? null;
}

/** Drain the update queue: updateField awaits its own processing, but resolve a
 * microtask so any trailing emit settles before assertions. */
async function settle(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
  holder.db = drizzle(pglite);
}, 60_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(async () => {
  await pglite.exec(
    `TRUNCATE fda_510k_documents, fda_510k_stage_progress, fda_510k_projects RESTART IDENTITY CASCADE;`
  );
  // Seed via raw SQL, not drizzle .insert(): drizzle would emit every schema
  // column (the projects table has ~30), and this harness only provisions the
  // columns the service actually reads. The service selects projects via
  // .select({ id }) filtered on organization_id, so id + organization_id suffice.
  await pglite.query(
    `INSERT INTO fda_510k_projects (id, organization_id) VALUES ($1, $2), ($3, $4)`,
    [PROJECT_A, ORG_A, PROJECT_B, ORG_B]
  );
  await pglite.query(
    `INSERT INTO fda_510k_documents
       (organization_id, project_id, document_id, document_type, document_name, content)
     VALUES ($1,$2,$3,$4,$5,$6), ($7,$8,$9,$10,$11,$12)`,
    [
      ORG_A, PROJECT_A, 'doc-a', 'main_510k', 'A', '{}',
      ORG_B, PROJECT_B, 'doc-b', 'main_510k', 'B', '{}',
    ]
  );
});

describe('SmartFieldLinking tenant scoping (G-08)', () => {
  it('writes ONLY the caller-tenant/project document on a workflow update', async () => {
    await smartFieldLinking.updateField({
      source: 'workflow',
      field: 'device.deviceName',
      value: 'Widget A',
      timestamp: new Date(),
      metadata: { organizationId: ORG_A, projectId: PROJECT_A },
    });
    await settle();

    expect(await docContent('doc-a')).toEqual({ coverPage: { deviceName: 'Widget A' } });
    // The other tenant's identically-typed document is untouched.
    expect(await docContent('doc-b')).toEqual({});
  });

  it('writes ZERO rows when a caller claims another tenant\'s project (cross-tenant hazard closed)', async () => {
    await smartFieldLinking.updateField({
      source: 'workflow',
      field: 'device.deviceName',
      value: 'HIJACK',
      timestamp: new Date(),
      // ORG_B presenting ORG_A's project id.
      metadata: { organizationId: ORG_B, projectId: PROJECT_A },
    });
    await settle();

    // Neither document changed: WHERE org=B AND project=A matches nothing, and
    // WHERE org=B AND project=B is not this document_type/project combination.
    expect(await docContent('doc-a')).toEqual({});
    expect(await docContent('doc-b')).toEqual({});
  });

  it('refuses an update carrying no organization/project scope (fail closed)', async () => {
    const errors: unknown[] = [];
    const onError = (e: unknown) => errors.push(e);
    smartFieldLinking.on('updateError', onError);
    try {
      await smartFieldLinking.updateField({
        source: 'workflow',
        field: 'device.deviceName',
        value: 'NOSCOPE',
        timestamp: new Date(),
        metadata: {},
      });
      await settle();
    } finally {
      smartFieldLinking.off('updateError', onError);
    }

    expect(await docContent('doc-a')).toEqual({});
    expect(await docContent('doc-b')).toEqual({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('refuses a document→workflow write for a project outside the caller org, and allows the owner', async () => {
    await pglite.query(
      `INSERT INTO fda_510k_stage_progress (project_id, stage_name, section_name, collected_data)
       VALUES ($1, $2, $3, $4::json)`,
      [PROJECT_B, 'setup', 'device_info', '{}']
    );

    // ORG_A claims ORG_B's project — refused; stage data unchanged.
    const errors: unknown[] = [];
    const onError = (e: unknown) => errors.push(e);
    smartFieldLinking.on('updateError', onError);
    try {
      await smartFieldLinking.updateField({
        source: 'document',
        field: 'main_510k.coverPage.deviceName',
        value: 'X',
        timestamp: new Date(),
        metadata: { organizationId: ORG_A, projectId: PROJECT_B },
      });
      await settle();
    } finally {
      smartFieldLinking.off('updateError', onError);
    }
    expect(await stageData(PROJECT_B)).toEqual({});
    expect(errors.length).toBeGreaterThan(0);

    // The owning tenant writes successfully.
    await smartFieldLinking.updateField({
      source: 'document',
      field: 'main_510k.coverPage.deviceName',
      value: 'Y',
      timestamp: new Date(),
      metadata: { organizationId: ORG_B, projectId: PROJECT_B },
    });
    await settle();
    expect(await stageData(PROJECT_B)).toEqual({ device: { deviceName: 'Y' } });
  });
});
