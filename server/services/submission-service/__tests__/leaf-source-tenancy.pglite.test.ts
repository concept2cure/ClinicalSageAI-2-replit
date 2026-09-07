/**
 * upsertLeaf must prove tenancy for EVERY resolvable document source — not two
 * of five.
 *
 * WHAT WAS MISSING. The comment above the tenancy block in upsertLeaf promises
 * "the target must belong to the caller's org — no dangling cross-tenant
 * document pointers", but only `coauthor_documents` and `rendered_leaf_files`
 * were ever checked. A leaf pointing at `unified_documents`,
 * `ctd_onboarding_documents` or `c2c_document_sections` was written straight
 * through: the id was stored verbatim, whoever owned it, and
 * `document_content_sha256` / `document_pinned_at` stayed NULL. The read side
 * fails closed per table, so no cross-tenant bytes ever reached a package — but
 * dispatch-readiness only checks that a pointer is PRESENT, so a sequence
 * carrying a foreign or non-existent pointer read as READY and only fell over at
 * assembly, as an `unresolved` leaf.
 *
 * WHAT IS LOCKED HERE (against real SQL, in-process PGlite — a mocked `db`
 * cannot prove the c2c JOIN predicate, which is the whole point of case 3):
 *   • placing a leaf at another organization's unified_documents,
 *     ctd_onboarding_documents or c2c_document_sections row is REFUSED;
 *   • those refusals persist NO leaf row at all;
 *   • the caller's OWN unified_documents / c2c_document_sections rows are
 *     accepted AND pinned — the source attestation the coauthor path has always
 *     had now exists for the governed-authoring path an MDx client uses most;
 *   • drift guard: the tenancy dispatch covers every table the READ-side
 *     resolver branches on, so a new resolver source cannot ship unverified.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHash } from 'crypto';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../auditService', () => ({
  default: {
    logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })),
  },
}));

import { upsertLeaf, LEAF_SOURCE_TENANCY_TABLES } from '../submission-service';
import { RESOLVABLE_DOCUMENT_TABLES } from '../../ectd/leaf-document-tables';
import { sectionPlainText } from '../../c2c/section-content';

let harness: IndPgliteDb;

const OWNER = { organizationId: 1, userId: 9 };
const FOREIGN_ORG = 2;

/** Bodies seeded below; the expected pins are derived from these, not copied. */
const OWN_UNIFIED_CONTENT = { text: 'Org 1 unified body.' };
const OWN_SECTION_CONTENT = { text: 'Org 1 governed section body.' };

let SEQUENCE_ID = 0;
const FOREIGN_UNIFIED_ID = 77;
const FOREIGN_CTD_ID = 88;
let FOREIGN_SECTION_ID = 0;
const OWN_UNIFIED_ID = 101;
let OWN_SECTION_ID = 0;

async function q<T = any>(text: string, params: unknown[] = []) {
  const r = await harness.pglite.query<T>(text, params);
  return r.rows;
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, governedSections: true });
  holder.db = harness.db;

  const [submission] = await q<{ id: number | string }>(
    `INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by)
     VALUES ('MDR technical file', 'mdr', 'mdx', 'eu', $1, $2) RETURNING id`,
    [OWNER.organizationId, OWNER.userId],
  );
  const [sequence] = await q<{ id: number | string }>(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, organization_id, created_by)
     VALUES ($1, 'eu', '0001', 'draft', $2, $3) RETURNING id`,
    [Number(submission.id), OWNER.organizationId, OWNER.userId],
  );
  SEQUENCE_ID = Number(sequence.id);

  // ── The OTHER tenant's documents ────────────────────────────────────────
  await q(
    `INSERT INTO unified_documents (id, title, document_type, created_by, organization_id)
     VALUES ($1, 'Org 2 clinical overview', 'clinical_overview', 'u2', $2)`,
    [FOREIGN_UNIFIED_ID, FOREIGN_ORG],
  );
  await q(
    `INSERT INTO workflow_document_versions (document_id, version, content, created_by, organization_id)
     VALUES ($1, 1, $2, 'u2', $3)`,
    [FOREIGN_UNIFIED_ID, JSON.stringify({ text: 'Org 2 body.' }), FOREIGN_ORG],
  );
  await q(
    `INSERT INTO ctd_onboarding_documents (id, organization_id, file_name, mime_type, storage_path)
     VALUES ($1, $2, 'org2.pdf', 'application/pdf', 'uploads/org2-does-not-exist')`,
    [FOREIGN_CTD_ID, FOREIGN_ORG],
  );
  await q(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title)
     VALUES ('doc-org2', $1, '00000000-0000-0000-0000-000000000002', 'mdr_technical_file', 'eu', '1.0', 'Org 2 TF')`,
    [FOREIGN_ORG],
  );
  const [foreignSection] = await q<{ id: number | string }>(
    `INSERT INTO c2c_document_sections (document_id, section_key, label, path_order, content)
     VALUES ('doc-org2', 'A.1', 'Device description', 1, $1) RETURNING id`,
    [JSON.stringify({ text: 'Org 2 governed section body.' })],
  );
  FOREIGN_SECTION_ID = Number(foreignSection.id);

  // ── The caller's OWN documents ──────────────────────────────────────────
  await q(
    `INSERT INTO unified_documents (id, title, document_type, created_by, organization_id)
     VALUES ($1, 'Org 1 clinical overview', 'clinical_overview', 'u1', $2)`,
    [OWN_UNIFIED_ID, OWNER.organizationId],
  );
  await q(
    `INSERT INTO workflow_document_versions (document_id, version, content, created_by, organization_id)
     VALUES ($1, 1, $2, 'u1', $3)`,
    [OWN_UNIFIED_ID, JSON.stringify(OWN_UNIFIED_CONTENT), OWNER.organizationId],
  );
  await q(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title)
     VALUES ('doc-org1', $1, '00000000-0000-0000-0000-000000000001', 'mdr_technical_file', 'eu', '1.0', 'Org 1 TF')`,
    [OWNER.organizationId],
  );
  const [ownSection] = await q<{ id: number | string }>(
    `INSERT INTO c2c_document_sections (document_id, section_key, label, path_order, content)
     VALUES ('doc-org1', 'A.1', 'Device description', 1, $1) RETURNING id`,
    [JSON.stringify(OWN_SECTION_CONTENT)],
  );
  OWN_SECTION_ID = Number(ownSection.id);
});

afterAll(async () => {
  await harness.close();
});

function place(documentTable: string, documentId: number) {
  return upsertLeaf(
    {
      sequenceId: SEQUENCE_ID,
      sectionCode: 'A.1',
      title: 'Device description',
      documentTable,
      documentId,
    },
    OWNER,
  );
}

describe('upsertLeaf — cross-tenant document pointers are refused', () => {
  it('refuses another organization’s unified_documents id', async () => {
    await expect(place('unified_documents', FOREIGN_UNIFIED_ID)).rejects.toThrow(
      /not found for this organization/i,
    );
  });

  it('refuses another organization’s ctd_onboarding_documents id', async () => {
    await expect(place('ctd_onboarding_documents', FOREIGN_CTD_ID)).rejects.toThrow(
      /not found for this organization/i,
    );
  });

  it('refuses a c2c_document_sections row whose PARENT document belongs to another organization', async () => {
    // c2c_document_sections has no organization column: the only tenant gate is
    // the JOIN onto c2c_documents.org_id, which is what this case proves.
    await expect(place('c2c_document_sections', FOREIGN_SECTION_ID)).rejects.toThrow(
      /not found for this organization/i,
    );
  });

  it('persists NO leaf row for any of those refusals', async () => {
    const [row] = await q<{ count: string }>('SELECT count(*)::int AS count FROM submission_leaves');
    expect(Number(row.count)).toBe(0);
  });
});

describe('upsertLeaf — the caller’s own sources are accepted AND pinned', () => {
  it('pins the sha256 of the latest workflow version for its own unified_documents leaf', async () => {
    const leaf = await place('unified_documents', OWN_UNIFIED_ID);
    expect(leaf.documentTable).toBe('unified_documents');
    expect(leaf.documentId).toBe(OWN_UNIFIED_ID);
    expect(leaf.documentContentSha256).toBe(
      createHash('sha256').update(JSON.stringify(OWN_UNIFIED_CONTENT), 'utf8').digest('hex'),
    );
    expect(leaf.documentPinnedAt).not.toBeNull();
  });

  it('pins the sha256 of the section body for its own c2c_document_sections leaf', async () => {
    const leaf = await place('c2c_document_sections', OWN_SECTION_ID);
    expect(leaf.documentContentSha256).toBe(
      createHash('sha256')
        .update(sectionPlainText(OWN_SECTION_CONTENT).trim(), 'utf8')
        .digest('hex'),
    );
    expect(leaf.documentPinnedAt).not.toBeNull();
  });
});

describe('drift guard', () => {
  it('the tenancy dispatch covers every table the read-side resolver can materialize', () => {
    expect([...LEAF_SOURCE_TENANCY_TABLES].sort()).toEqual([...RESOLVABLE_DOCUMENT_TABLES].sort());
  });
});
