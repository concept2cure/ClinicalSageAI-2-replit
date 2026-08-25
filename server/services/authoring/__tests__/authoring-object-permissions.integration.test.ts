import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import {
  decideAuthoringPermission,
  grantAuthoringPermission,
  resolveAuthoringDocumentScope,
  resolveAuthoringSectionScope,
  revokeAuthoringPermission,
  roleAllowsAction,
} from '../authoring-permissions';

const AUTHOR_ID = '3f1c2a10-0000-4000-8000-000000000001';
const REVIEWER_ID = '3f1c2a10-0000-4000-8000-000000000002';
const APPROVER_ID = '3f1c2a10-0000-4000-8000-000000000003';
const UNRELATED_ID = '3f1c2a10-0000-4000-8000-000000000004';
const OTHER_TENANT_ID = '3f1c2a10-0000-4000-8000-000000000099';

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE users (id UUID PRIMARY KEY, name TEXT, email TEXT);
  INSERT INTO organizations (id, name) VALUES (1, 'permission-org'), (2, 'other-org');
  INSERT INTO users (id, name, email) VALUES
    ('${AUTHOR_ID}', 'Avery Author', 'author@permission.example'),
    ('${REVIEWER_ID}', 'Riley Reviewer', 'reviewer@permission.example'),
    ('${APPROVER_ID}', 'Alex Approver', 'approver@permission.example'),
    ('${UNRELATED_ID}', 'Unaffiliated User', 'unrelated@permission.example'),
    ('${OTHER_TENANT_ID}', 'Other Tenant', 'other@permission.example');
`;

const DOCUMENT_ID = '10000000-0000-4000-8000-000000000001';
const SECTION_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_DOCUMENT_ID = '10000000-0000-4000-8000-000000000002';
const OTHER_SECTION_ID = '20000000-0000-4000-8000-000000000002';

let jdb: JourneyDb;
let pool: Pool;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
    ],
  });
  pool = jdb.pool as unknown as Pool;

  await jdb.pool.query(
    `INSERT INTO authoring_documents
       (id, title, module, status, created_by, tenant_id)
     VALUES
       ($1, 'Owned document', 'M2', 'draft', $2, 1),
       ($3, 'Other tenant document', 'M2', 'draft', $4, 2)`,
    [DOCUMENT_ID, AUTHOR_ID, OTHER_DOCUMENT_ID, OTHER_TENANT_ID],
  );
  await jdb.pool.query(
    `INSERT INTO authoring_sections
       (id, doc_id, code, title, content, tenant_id)
     VALUES
       ($1, $2, '2.5.1', 'Rationale', 'Draft', 1),
       ($3, $4, '2.5.1', 'Other rationale', 'Other draft', 2)`,
    [SECTION_ID, DOCUMENT_ID, OTHER_SECTION_ID, OTHER_DOCUMENT_ID],
  );
});

afterAll(async () => {
  await jdb?.close();
});

describe('authoring object permissions — real canonical DDL', () => {
  it('seeds every document creator as OWNER and AUTHOR atomically', async () => {
    const result = await jdb.pool.query(
      `SELECT role, principal_id, email
         FROM doc_permissions
        WHERE tenant_id = 1 AND doc_id = $1 AND revoked_at IS NULL
        ORDER BY role`,
      [DOCUMENT_ID],
    );

    expect(result.rows).toEqual([
      expect.objectContaining({
        role: 'AUTHOR',
        principal_id: AUTHOR_ID,
        email: 'author@permission.example',
      }),
      expect.objectContaining({
        role: 'OWNER',
        principal_id: AUTHOR_ID,
        email: 'author@permission.example',
      }),
    ]);
  });

  it('allows the creator to edit and manage the document', async () => {
    const scope = await resolveAuthoringSectionScope(pool, 1, SECTION_ID);
    const edit = await decideAuthoringPermission({
      pool,
      principal: {
        id: AUTHOR_ID,
        email: 'author@permission.example',
        roles: [],
      },
      scope,
      action: 'edit',
    });
    const manage = await decideAuthoringPermission({
      pool,
      principal: {
        id: AUTHOR_ID,
        email: 'author@permission.example',
        roles: [],
      },
      scope: await resolveAuthoringDocumentScope(pool, 1, DOCUMENT_ID),
      action: 'manage_permissions',
    });

    expect(edit.allowed).toBe(true);
    expect(edit.matchedRoles).toContain('AUTHOR');
    expect(manage.allowed).toBe(true);
    expect(manage.matchedRoles).toContain('OWNER');
  });

  it('denies a same-tenant user with no object permission', async () => {
    const decision = await decideAuthoringPermission({
      pool,
      principal: {
        id: UNRELATED_ID,
        email: 'unrelated@permission.example',
        roles: ['QA'],
      },
      scope: await resolveAuthoringSectionScope(pool, 1, SECTION_ID),
      action: 'edit',
    });

    expect(decision).toMatchObject({ allowed: false, reason: 'permission-denied' });
  });

  it('grants reviewer and approver authority explicitly, without edit escalation', async () => {
    await grantAuthoringPermission({
      pool,
      tenantId: 1,
      docId: DOCUMENT_ID,
      principalId: REVIEWER_ID,
      email: 'reviewer@permission.example',
      role: 'REVIEWER',
      grantedBy: AUTHOR_ID,
      reason: 'Assigned quality review',
    });
    await grantAuthoringPermission({
      pool,
      tenantId: 1,
      docId: DOCUMENT_ID,
      sectionId: SECTION_ID,
      principalId: APPROVER_ID,
      email: 'approver@permission.example',
      role: 'APPROVER',
      grantedBy: AUTHOR_ID,
      reason: 'Assigned final approval',
    });

    const scope = await resolveAuthoringSectionScope(pool, 1, SECTION_ID);
    const reviewerReview = await decideAuthoringPermission({
      pool,
      principal: { id: REVIEWER_ID, email: 'reviewer@permission.example', roles: [] },
      scope,
      action: 'review',
    });
    const reviewerEdit = await decideAuthoringPermission({
      pool,
      principal: { id: REVIEWER_ID, email: 'reviewer@permission.example', roles: [] },
      scope,
      action: 'edit',
    });
    const approverApprove = await decideAuthoringPermission({
      pool,
      principal: { id: APPROVER_ID, email: 'approver@permission.example', roles: [] },
      scope,
      action: 'approve',
    });
    const approverEdit = await decideAuthoringPermission({
      pool,
      principal: { id: APPROVER_ID, email: 'approver@permission.example', roles: [] },
      scope,
      action: 'edit',
    });

    expect(reviewerReview.allowed).toBe(true);
    expect(reviewerEdit.allowed).toBe(false);
    expect(approverApprove.allowed).toBe(true);
    expect(approverEdit.allowed).toBe(false);
    expect(roleAllowsAction('REVIEWER', 'edit')).toBe(false);
    expect(roleAllowsAction('APPROVER', 'approve')).toBe(true);
  });

  it('does not let a permission on one section authorize a different section', async () => {
    const secondSection = '20000000-0000-4000-8000-000000000003';
    await jdb.pool.query(
      `INSERT INTO authoring_sections
         (id, doc_id, code, title, content, tenant_id)
       VALUES ($1, $2, '2.5.2', 'Development history', 'Draft', 1)`,
      [secondSection, DOCUMENT_ID],
    );

    const decision = await decideAuthoringPermission({
      pool,
      principal: { id: APPROVER_ID, email: 'approver@permission.example', roles: [] },
      scope: await resolveAuthoringSectionScope(pool, 1, secondSection),
      action: 'approve',
    });

    expect(decision).toMatchObject({ allowed: false, reason: 'permission-denied' });
  });

  it('rejects cross-tenant document and section permission links at the database boundary', async () => {
    await expect(
      jdb.pool.query(
        `INSERT INTO doc_permissions
           (doc_id, section_id, tenant_id, principal_id, role, granted_by)
         VALUES ($1, NULL, 1, $2, 'AUTHOR', $2)`,
        [OTHER_DOCUMENT_ID, AUTHOR_ID],
      ),
    ).rejects.toThrow(/foreign key|violates/i);

    await expect(
      jdb.pool.query(
        `INSERT INTO doc_permissions
           (doc_id, section_id, tenant_id, principal_id, role, granted_by)
         VALUES ($1, $2, 1, $3, 'REVIEWER', $3)`,
        [DOCUMENT_ID, OTHER_SECTION_ID, REVIEWER_ID],
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('blocks edits after the document becomes immutable', async () => {
    await jdb.pool.query(
      `UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1 AND tenant_id = 1`,
      [DOCUMENT_ID],
    );

    const decision = await decideAuthoringPermission({
      pool,
      principal: { id: AUTHOR_ID, email: 'author@permission.example', roles: [] },
      scope: await resolveAuthoringSectionScope(pool, 1, SECTION_ID),
      action: 'edit',
    });

    expect(decision).toMatchObject({ allowed: false, reason: 'document-immutable' });
  });

  it('prevents revocation of the final active owner', async () => {
    const owner = await jdb.pool.query(
      `SELECT id::text
         FROM doc_permissions
        WHERE tenant_id = 1 AND doc_id = $1 AND role = 'OWNER' AND revoked_at IS NULL
        LIMIT 1`,
      [DOCUMENT_ID],
    );

    await expect(
      revokeAuthoringPermission({
        pool,
        tenantId: 1,
        docId: DOCUMENT_ID,
        permissionId: String((owner.rows[0] as { id: string }).id),
        revokedBy: AUTHOR_ID,
        reason: 'Attempt to remove final owner',
      }),
    ).rejects.toThrow('LAST_OWNER');
  });
});
