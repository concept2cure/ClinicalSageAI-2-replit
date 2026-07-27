/**
 * Security contract (C2C-DEVICE-001 + C2C-DEVICE-002): SmartFieldLinking must
 * bind every 510(k) read and write to the caller's organization AND project,
 * and must not fabricate submission readiness.
 *
 * On the parent commit:
 *  - updateDocumentField() selected the FIRST fda_510k_documents row matching
 *    documentType ALONE and overwrote it — a cross-tenant write.
 *  - updateWorkflowField() selected the FIRST fda_510k_stage_progress row
 *    matching stageName + sectionName ALONE (projectId was not even in the
 *    WHERE) and overwrote it — a cross-tenant write.
 *  - checkWorkflowFieldValue() was a `return true` stub, so
 *    checkFieldCompleteness() reported every required field satisfied for every
 *    project — a fabricated 100% readiness signal.
 *
 * Each `it` below fails on the parent commit.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createJourneyDb, type JourneyDb } from './golden-journeys/harness';

const T = 60_000;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../server/db', () => ({
  get db() {
    return h.db;
  },
  get pool() {
    return h.pool;
  },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const ORG_A = 1;
const ORG_B = 2;
const PROJECT_A = 10; // org A
const PROJECT_B = 20; // org B
const PROJECT_C = 30; // org B — completeness fixture

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE fda_510k_projects (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    device_name TEXT
  );
  CREATE TABLE fda_510k_documents (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    template_id INTEGER,
    document_id TEXT NOT NULL UNIQUE,
    document_type TEXT NOT NULL,
    document_name TEXT NOT NULL,
    content TEXT,
    form_data JSON,
    attachments JSON,
    status TEXT DEFAULT 'draft',
    is_locked BOOLEAN DEFAULT FALSE,
    locked_at TIMESTAMP,
    locked_by INTEGER,
    version INTEGER DEFAULT 1,
    previous_version_id INTEGER,
    change_log JSON,
    signatures JSON,
    signature_required BOOLEAN DEFAULT FALSE,
    validation_status TEXT DEFAULT 'pending',
    validation_errors JSON,
    compliance_score INTEGER,
    created_by INTEGER,
    updated_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
  );
  CREATE TABLE fda_510k_stage_progress (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    stage_name TEXT NOT NULL,
    section_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT TRUE,
    collected_data JSON,
    validation_status TEXT DEFAULT 'pending',
    validation_errors JSON,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    completed_by INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
  );

  INSERT INTO organizations (id, name) VALUES (${ORG_A}, 'org-a'), (${ORG_B}, 'org-b');
  INSERT INTO fda_510k_projects (id, organization_id, device_name) VALUES
    (${PROJECT_A}, ${ORG_A}, 'device-a'),
    (${PROJECT_B}, ${ORG_B}, 'device-b'),
    (${PROJECT_C}, ${ORG_B}, 'device-c');

  -- Org A's row is inserted FIRST so it is the row the unscoped
  -- "first row matching documentType" query used to select and clobber.
  INSERT INTO fda_510k_documents
    (id, organization_id, project_id, document_id, document_type, document_name, content)
  VALUES
    (1, ${ORG_A}, ${PROJECT_A}, 'DOC-A', 'main_510k', 'A main',
     '{"coverPage":{"deviceName":"A-original"}}'),
    (2, ${ORG_B}, ${PROJECT_B}, 'DOC-B', 'main_510k', 'B main',
     '{"coverPage":{"deviceName":"B-original"}}');

  -- Same ordering trap for stage progress.
  INSERT INTO fda_510k_stage_progress (id, project_id, stage_name, section_name, collected_data)
  VALUES
    (1, ${PROJECT_A}, 'setup', 'device_info', '{"device":{"deviceName":"A-stage-original"}}'),
    (2, ${PROJECT_B}, 'setup', 'device_info', '{"device":{"deviceName":"B-stage-original"}}'),
    -- Completeness fixture: deviceName present, everything else absent.
    (3, ${PROJECT_C}, 'setup', 'device_info', '{"device":{"deviceName":"C-device"}}');
`;

let jdb: JourneyDb;
let smartFieldLinking: import('../server/services/SmartFieldLinking').SmartFieldLinking;

async function docContent(id: number): Promise<any> {
  const r = await jdb.pool.query('SELECT content FROM fda_510k_documents WHERE id = $1', [id]);
  return JSON.parse((r.rows[0] as { content: string }).content);
}

async function stageData(id: number): Promise<any> {
  const r = await jdb.pool.query(
    'SELECT collected_data FROM fda_510k_stage_progress WHERE id = $1',
    [id],
  );
  const raw = (r.rows[0] as { collected_data: unknown }).collected_data;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

beforeAll(async () => {
  jdb = await createJourneyDb({ prereqSql: PREREQ, migrations: [] });
  h.db = jdb.db;
  h.pool = jdb.pool;
  ({ smartFieldLinking } = await import('../server/services/SmartFieldLinking'));
}, T);

afterAll(async () => {
  await jdb?.close();
});

describe('C2C-DEVICE-001: SmartFieldLinking writes are org + project scoped', () => {
  it('a two-tenant workflow->document write touches ONLY the caller\'s row', async () => {
    await smartFieldLinking.updateField({
      organizationId: ORG_B,
      projectId: PROJECT_B,
      source: 'workflow',
      field: 'device.deviceName',
      value: 'B-updated',
      timestamp: new Date(),
      userId: 7,
    });

    expect((await docContent(2)).coverPage.deviceName).toBe('B-updated');
    // Org A's document — the row the unscoped query used to hit — is untouched.
    expect((await docContent(1)).coverPage.deviceName).toBe('A-original');
  }, T);

  it('a two-tenant document->workflow write touches ONLY the caller\'s stage row', async () => {
    await smartFieldLinking.updateField({
      organizationId: ORG_B,
      projectId: PROJECT_B,
      source: 'document',
      field: 'main_510k.coverPage.deviceName',
      value: 'B-stage-updated',
      timestamp: new Date(),
      userId: 7,
    });

    expect((await stageData(2)).device.deviceName).toBe('B-stage-updated');
    // Org A's stage-progress row — previously the first row matching
    // stage+section across the whole table — is untouched.
    expect((await stageData(1)).device.deviceName).toBe('A-stage-original');
  }, T);

  it('refuses a project that belongs to another organization, and writes nothing', async () => {
    await expect(
      smartFieldLinking.updateField({
        organizationId: ORG_B,
        projectId: PROJECT_A, // org A's project
        source: 'workflow',
        field: 'device.deviceName',
        value: 'spoofed',
        timestamp: new Date(),
      }),
    ).rejects.toThrow('project_not_in_organization');

    expect((await docContent(1)).coverPage.deviceName).toBe('A-original');
    expect((await docContent(2)).coverPage.deviceName).toBe('B-updated');
  }, T);

  it('refuses an update carrying no tenant context at all', async () => {
    await expect(
      smartFieldLinking.updateField({
        source: 'workflow',
        field: 'device.deviceName',
        value: 'unscoped',
        timestamp: new Date(),
      }),
    ).rejects.toThrow('field_update_missing_tenant_context');

    expect((await docContent(1)).coverPage.deviceName).toBe('A-original');
  }, T);

  it('accepts the scope through metadata, the shape the HTTP router already sends', async () => {
    await smartFieldLinking.updateField({
      source: 'workflow',
      field: 'device.deviceName',
      value: 'A-via-metadata',
      timestamp: new Date(),
      metadata: { organizationId: ORG_A, projectId: PROJECT_A },
    });

    expect((await docContent(1)).coverPage.deviceName).toBe('A-via-metadata');
    expect((await docContent(2)).coverPage.deviceName).toBe('B-updated');
  }, T);
});

describe('C2C-DEVICE-002: field completeness reflects stored data, not a stub', () => {
  it('does not report a project complete when its required fields are absent', async () => {
    const result = await smartFieldLinking.checkFieldCompleteness(PROJECT_C, ORG_B);

    // The stub returned true for every required field: complete === total,
    // missing === [].
    expect(result.complete).toBeLessThan(result.total);
    expect(result.missing).toContain('device.intendedUse');
    expect(result.missing).toContain('device.classification');
    expect(result.missing).toContain('manufacturer.companyName');
    expect(result.missing).toContain('predicate.kNumber');
    // The one required field that IS populated is not reported missing.
    expect(result.missing).not.toContain('device.deviceName');
    // Nothing was un-provable in this fixture.
    expect(result.unknown).toEqual([]);
  }, T);

  it('refuses a completeness read for another organization\'s project', async () => {
    await expect(
      smartFieldLinking.checkFieldCompleteness(PROJECT_A, ORG_B),
    ).rejects.toThrow('project_not_in_organization');
  }, T);
});

/**
 * Prototype-pollution regression (Semgrep prototype-pollution-loop).
 *
 * `field` is caller-supplied — it arrives as `data.field` on the socket
 * update-field handler and in the body of POST /api/field-sync/update-field.
 * The nested-path walker used `key in current`, so "__proto__.polluted"
 * resolved to Object.prototype and assigned onto it, polluting every object in
 * the process. These pin the refusal and prove legitimate paths still work.
 */
describe('nested field paths cannot reach the object prototype', () => {
  const setNested = (svc: any, obj: any, path: string, value: unknown) =>
    (svc as any).setNestedField(obj, path, value);

  afterEach(() => {
    delete (Object.prototype as any).polluted;
  });

  it('refuses a __proto__ segment instead of polluting Object.prototype', () => {
    const svc: any = smartFieldLinking;
    expect(() => setNested(svc, {}, '__proto__.polluted', 'PWNED')).toThrow(/Unsafe field path segment/);
    expect(({} as any).polluted).toBeUndefined();
  });

  it('refuses constructor and prototype segments too', () => {
    const svc: any = smartFieldLinking;
    expect(() => setNested(svc, {}, 'constructor.x', 1)).toThrow(/Unsafe field path segment/);
    expect(() => setNested(svc, {}, 'a.prototype.x', 1)).toThrow(/Unsafe field path segment/);
  });

  it('still sets a legitimate nested device field', () => {
    const svc: any = smartFieldLinking;
    const target: any = {};
    setNested(svc, target, 'device.deviceName', 'Acme Widget');
    expect(target.device.deviceName).toBe('Acme Widget');
  });
});
