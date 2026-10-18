/** Execute the actual list query: corrupt target ids must never disclose another tenant's names. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({ pool: {}, db: {} }));
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow: vi.fn() }));
import { HOLD_LIST_SQL } from '../vault-legal-holds';

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA vault;
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, name text);
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, organization_id integer NOT NULL, program_id uuid, document_title text, file_name text);
    CREATE TABLE vault.legal_holds (
      id uuid PRIMARY KEY, organization_id integer NOT NULL, reference text, reason text, scope text,
      program_id uuid, document_id uuid, placed_by integer, placed_at timestamptz, lifted_at timestamptz,
      lifted_by integer, lift_reason text
    );
    INSERT INTO regulatory_programs VALUES
      ('11111111-1111-4111-8111-111111111111', 7, 'Organization seven project'),
      ('22222222-2222-4222-8222-222222222222', 8, 'Organization eight private project');
    INSERT INTO vault.documents VALUES
      ('33333333-3333-4333-8333-333333333333', 7, '11111111-1111-4111-8111-111111111111', 'Inspection report', 'report.pdf'),
      ('44444444-4444-4444-8444-444444444444', 8, '22222222-2222-4222-8222-222222222222', 'Private document', 'private.pdf'),
      ('55555555-5555-4555-8555-555555555555', 7, '11111111-1111-4111-8111-111111111111', '', 'sponsor-letter.pdf');
    INSERT INTO vault.legal_holds (id, organization_id, reference, reason, scope, program_id, document_id, placed_by, placed_at) VALUES
      ('a1111111-1111-4111-8111-111111111111', 7, 'own-project', 'inspection', 'program', '11111111-1111-4111-8111-111111111111', NULL, 7, NOW()),
      ('a2222222-2222-4222-8222-222222222222', 7, 'own-document', 'inspection', 'document', NULL, '33333333-3333-4333-8333-333333333333', 7, NOW()),
      ('a3333333-3333-4333-8333-333333333333', 7, 'foreign-project-id', 'damaged legacy row', 'program', '22222222-2222-4222-8222-222222222222', NULL, 7, NOW()),
      ('a4444444-4444-4444-8444-444444444444', 7, 'foreign-document-id', 'damaged legacy row', 'document', NULL, '44444444-4444-4444-8444-444444444444', 7, NOW()),
      ('a5555555-5555-4555-8555-555555555555', 7, 'own-file-name', 'inspection', 'document', NULL, '55555555-5555-4555-8555-555555555555', 7, NOW()),
      ('a6666666-6666-4666-8666-666666666666', 8, 'foreign-hold', 'inspection', 'program', '22222222-2222-4222-8222-222222222222', NULL, 8, NOW());
  `);
});
afterAll(async () => { await db?.close(); });

describe('legal-hold target names on the tenant-scoped list query', () => {
  it('names the tenant’s own stored projects and documents, with a file-name fallback', async () => {
    const { rows } = await db.query<Record<string, unknown>>(HOLD_LIST_SQL, [7]);
    const named = (reference: string) => rows.find((r) => r.reference === reference);
    expect(named('own-project')).toMatchObject({ target_label: 'Organization seven project', target_project_label: 'Organization seven project' });
    expect(named('own-document')).toMatchObject({ target_label: 'Inspection report', target_project_label: 'Organization seven project' });
    expect(named('own-file-name')).toMatchObject({ target_label: 'sponsor-letter.pdf' });
  });

  it('keeps foreign records out and yields no foreign names from damaged target ids', async () => {
    const { rows } = await db.query<Record<string, unknown>>(HOLD_LIST_SQL, [7]);
    expect(rows).toHaveLength(5);
    for (const reference of ['foreign-project-id', 'foreign-document-id']) {
      expect(rows.find((r) => r.reference === reference)).toMatchObject({ target_label: null, target_project_label: null });
    }
    expect(JSON.stringify(rows)).not.toContain('Organization eight private project');
    expect(JSON.stringify(rows)).not.toContain('Private document');
    expect(JSON.stringify(rows)).not.toContain('private.pdf');
    expect(JSON.stringify(rows)).not.toContain('foreign-hold');
  });
});
