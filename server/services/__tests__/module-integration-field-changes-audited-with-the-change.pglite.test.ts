/**
 * A change to a unified document and its audit rows commit together, under the
 * actor the caller authenticated, and a patch cannot move what is not its to move.
 *
 * What ModuleIntegrationService used to do (finding 10, 2026-10-15):
 *  - updateDocument built one `field_updated` row per changed field with
 *    `tx.insert(documentAuditLogs).values(...)` inside a forEach and never
 *    awaited it. A Drizzle builder is lazy — nothing is sent until it is
 *    awaited — so those rows were never written: a renamed regulated document
 *    had no field-level entry in document_audit_logs at all. (The
 *    `document_created` and `version_created` rows were awaited and existed.)
 *  - updateDocument spread its patch into the UPDATE, so a patch could set
 *    status (to 'approved', which the eCTD leaf resolver treats as finalized),
 *    created_by, organization_id and latest_version.
 *  - registerDocument took the initial status from its input.
 *
 * Real migrations and real SQL on PGlite: whether a row exists is the
 * database's to say, not a fake's.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

// WorkflowService imports the shared handle at load; this test hands the
// service its own PGlite-backed one, so the shared one is never used.
vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../db.js', () => ({ db: {} }));

import { ModuleIntegrationService, type RegisterDocumentInput } from '../ModuleIntegrationService';
import type { RequestDb } from '../../db/requestDb';

/** The files that create these tables on the deploy path, in set order. */
const MIGRATIONS = [
  'migrations/20260729_unified_documents_provision.sql',
  'migrations/20260729b_unified_workflow_companion_tables.sql',
  'migrations/20260730_workflow_doc_versions_org_id.sql',
  'migrations/20260731_workflow_doc_versions_org_not_null.sql',
  'migrations/20261001_domain_history_append_only.sql',
];

const ORG = 7;
const FOREIGN_ORG = 991;
const ACTOR = '41';
const TITLE = 'ACME-401 stability protocol';

type Patch = Parameters<ModuleIntegrationService['updateDocument']>[1];

let pg: PGlite;
let service: ModuleIntegrationService;
let seq = 0;

beforeAll(async () => {
  pg = new PGlite();
  for (const file of MIGRATIONS) {
    await pg.exec(fs.readFileSync(path.join(process.cwd(), file), 'utf8'));
  }
  service = new ModuleIntegrationService(drizzle(pg) as unknown as RequestDb);
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

/** Register through the service; `extra` stands in for an untyped caller. */
async function register(extra: Record<string, unknown> = {}) {
  seq += 1;
  const input: Record<string, unknown> = {
    title: TITLE,
    documentType: 'protocol',
    createdBy: ACTOR,
    organizationId: ORG,
    moduleType: 'cmc',
    originalId: `cmc-doc-${seq}`,
    ...extra,
  };
  return service.registerDocument(input as unknown as RegisterDocumentInput);
}

interface AuditRow {
  action: string;
  performed_by: string;
  details: Record<string, unknown>;
}

async function auditRows(documentId: number): Promise<AuditRow[]> {
  const { rows } = await pg.query<AuditRow>(
    'SELECT action, performed_by, details FROM document_audit_logs WHERE document_id = $1 ORDER BY id',
    [documentId],
  );
  return rows;
}

interface DocumentRow {
  title: string;
  document_type: string;
  status: string;
  created_by: string;
  updated_by: string | null;
  organization_id: number;
  latest_version: number;
}

async function documentRow(id: number): Promise<DocumentRow> {
  const { rows } = await pg.query<DocumentRow>(
    `SELECT title, document_type, status, created_by, updated_by, organization_id, latest_version
       FROM unified_documents WHERE id = $1`,
    [id],
  );
  return rows[0];
}

/** Drizzle wraps a driver error; the database's own message is on `cause`. */
function errorText(error: unknown): string {
  const e = error as { message?: string; cause?: { message?: string } } | null;
  return `${e?.message ?? ''} ${e?.cause?.message ?? ''}`;
}

describe('ModuleIntegrationService.updateDocument — field changes are audited with the change', () => {
  it('writes one field_updated row per changed field, attributed to the actor', async () => {
    const doc = await register();

    await service.updateDocument(
      doc.id,
      { title: `${TITLE} v2`, documentType: 'stability_protocol', updatedBy: ACTOR },
      ORG,
    );

    const row = await documentRow(doc.id);
    expect(row).toMatchObject({ title: `${TITLE} v2`, document_type: 'stability_protocol', updated_by: ACTOR });

    const fieldRows = (await auditRows(doc.id))
      .filter(r => r.action === 'field_updated')
      .sort((a, b) => String(a.details.field).localeCompare(String(b.details.field)));
    expect(fieldRows).toEqual([
      {
        action: 'field_updated',
        performed_by: ACTOR,
        details: { field: 'documentType', previous: 'protocol', current: 'stability_protocol' },
      },
      {
        action: 'field_updated',
        performed_by: ACTOR,
        details: { field: 'title', previous: TITLE, current: `${TITLE} v2` },
      },
    ]);
  });

  it('does not commit a field change whose audit row cannot be written', async () => {
    const doc = await register();
    await pg.exec(`
      CREATE FUNCTION refuse_field_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'audit store refused the field_updated row'; END $$;
      CREATE TRIGGER refuse_field_audit BEFORE INSERT ON document_audit_logs
        FOR EACH ROW WHEN (NEW.action = 'field_updated') EXECUTE FUNCTION refuse_field_audit();
    `);
    let failure: unknown = null;
    try {
      await service.updateDocument(doc.id, { title: 'Renamed with no record of it', updatedBy: ACTOR }, ORG);
    } catch (error) {
      failure = error;
    } finally {
      await pg.exec('DROP TRIGGER refuse_field_audit ON document_audit_logs; DROP FUNCTION refuse_field_audit();');
    }

    expect(failure, 'the update resolved although its audit row was refused').not.toBeNull();
    expect(errorText(failure)).toMatch(/audit store refused the field_updated row/);
    expect(await documentRow(doc.id)).toMatchObject({ title: TITLE, updated_by: null });
  });

  it('records a content change as a new version, with every audit row under the actor', async () => {
    const doc = await register();

    const result = await service.updateDocument(doc.id, { content: { text: 'Revised body' }, updatedBy: ACTOR }, ORG);

    expect(result.version).toMatchObject({ version: 2, createdBy: ACTOR, organizationId: ORG });
    expect(await documentRow(doc.id)).toMatchObject({ latest_version: 2, updated_by: ACTOR });
    const rows = await auditRows(doc.id);
    expect(rows.map(r => r.action)).toEqual([
      'document_created',
      'version_created',
      'content_changed',
      'field_updated',
    ]);
    expect(rows.every(r => r.performed_by === ACTOR)).toBe(true);
    expect(rows[3].details).toEqual({ field: 'latestVersion', previous: 1, current: 2 });
  });

  it('a patch with nothing to change writes nothing, not even "updated by"', async () => {
    const doc = await register();

    await service.updateDocument(doc.id, { updatedBy: ACTOR }, ORG);

    expect(await documentRow(doc.id)).toMatchObject({ title: TITLE, updated_by: null });
    expect((await auditRows(doc.id)).map(r => r.action)).toEqual(['document_created']);
  });

  it('a patch cannot set status, authorship, version or tenant', async () => {
    const doc = await register();

    const hostile = {
      title: 'Renamed',
      updatedBy: ACTOR,
      status: 'approved',
      createdBy: 'mallory',
      organizationId: FOREIGN_ORG,
      latestVersion: 42,
    };
    await service.updateDocument(doc.id, hostile as unknown as Patch, ORG);

    expect(await documentRow(doc.id)).toEqual({
      title: 'Renamed',
      document_type: 'protocol',
      status: 'draft',
      created_by: ACTOR,
      updated_by: ACTOR,
      organization_id: ORG,
      latest_version: 1,
    });
    const fieldRows = (await auditRows(doc.id)).filter(r => r.action === 'field_updated');
    expect(fieldRows.map(r => r.details.field)).toEqual(['title']);
  });
});

describe('ModuleIntegrationService.registerDocument — the server sets the initial status', () => {
  it('registers as draft whatever status the input carries', async () => {
    const doc = await register({ status: 'approved' });

    expect(doc.status).toBe('draft');
    expect(await documentRow(doc.id)).toMatchObject({ status: 'draft', created_by: ACTOR, organization_id: ORG });
    expect(await auditRows(doc.id)).toEqual([
      {
        action: 'document_created',
        performed_by: ACTOR,
        details: { moduleType: 'cmc', originalId: `cmc-doc-${seq}` },
      },
    ]);
  });
});
