/**
 * The title a read is announced with comes only from the open project's Vault
 * (ANA-SUMMARY S3 test 5, docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §2.3).
 *
 * resolveStepDocumentTitles runs one query for the round's document ids,
 * scoped the way documentScopeRefusal scopes the read handler: the
 * organisation, and the open project's program. Run here against in-memory
 * PostgreSQL with the canonical disposition migration, so the scoping is the
 * SQL's own, not a stand-in's. A document of another project of the same
 * organisation, of another organisation, a deleted one and one whose data was
 * removed each get no title.
 *
 * LIMITATION: PGlite, no RLS; the org predicate in the SQL is what is tested.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, PROGRAM, PROGRAM_B, OTHER_PROGRAM, ORG, OTHER_ORG } from '../../../routes/__tests__/_authoring-canvas-fixture';
import { resolveStepDocumentTitles } from '../step-presentation';

let jdb: JourneyDb;
const query = (sql: string, params: unknown[]) => jdb.pool.query(sql, params) as Promise<{ rows: Array<{ id: string; document_title: string | null; organization_id: number; program_id: string }> }>;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ + VAULT_DDL,
    migrations: ['migrations/20261006_document_data_dispositions.sql'],
    // The subject is the title query's eligibility predicate, not the disposition
    // write guard (its own suite, document-data-disposition/__tests__): the guard
    // reads a dozen tables this fixture has no reason to build.
    testOnlySql: 'ALTER TABLE public.document_data_dispositions DISABLE TRIGGER USER',
  });
}, 240_000);
beforeEach(async () => {
  await jdb.pool.query('DELETE FROM vault.documents');
});
afterAll(async () => {
  try {
    assertNoSchemaGaps(jdb);
  } finally {
    await jdb?.close();
  }
});

async function doc(title: string, program: string, opts: { deleted?: boolean } = {}): Promise<string> {
  const id = randomUUID();
  await jdb.pool.query(
    `INSERT INTO vault.documents (id, program_id, organization_id, document_code, document_title, document_type, content_hash, deleted_at)
     VALUES ($1, $2, $3, $4, $5, 'report', $6, $7)`,
    [id, program, program === OTHER_PROGRAM ? OTHER_ORG : ORG, `D-${id.slice(0, 8)}`, title, id.replaceAll('-', '').repeat(2), opts.deleted ? new Date() : null],
  );
  return id;
}

const reads = (...ids: string[]) => ids.map(id => ({ name: 'read_project_document', input: { document_id: id } }));
const admitted = (programId: string | null, programs = programId ? [programId] : [PROGRAM, PROGRAM_B]) => ({ organizationId: ORG, userId: 1, role: 'viewer', projectId: programId ? 42 : null, programId, accessibleProgramIds: programs, actorFiltered: true as const });
const inProject = { scope: async () => ({ programId: PROGRAM, admittedScope: admitted(PROGRAM) }), query, revalidate: async () => {} };

describe('resolveStepDocumentTitles', () => {
  it('names a document of the open project', async () => {
    const id = await doc('Stability report 2025', PROGRAM);
    const titles = await resolveStepDocumentTitles(reads(id), { organizationId: ORG, userId: 1 }, inProject);
    expect(titles.get(id)).toBe('Stability report 2025');
  });

  it('gives no title to a document of another project of the same organisation', async () => {
    const mine = await doc('Stability report 2025', PROGRAM);
    const other = await doc('Project B protocol', PROGRAM_B);
    const titles = await resolveStepDocumentTitles(reads(mine, other), { organizationId: ORG, userId: 1 }, inProject);
    expect([...titles.keys()]).toEqual([mine]);
  });

  it('gives no title to another organisation\'s document, even with no project open', async () => {
    const theirs = await doc('Their protocol', OTHER_PROGRAM);
    const orgWide = { scope: async () => ({ programId: null, admittedScope: admitted(null) }), query, revalidate: async () => {} };
    const titles = await resolveStepDocumentTitles(reads(theirs), { organizationId: ORG, userId: 1 }, orgWide);
    expect(titles.size).toBe(0);
  });

  it('with no project open, names documents in the explicitly admitted accessible sample', async () => {
    const a = await doc('A', PROGRAM);
    const b = await doc('B', PROGRAM_B);
    const orgWide = { scope: async () => ({ programId: null, admittedScope: admitted(null) }), query, revalidate: async () => {} };
    const titles = await resolveStepDocumentTitles(reads(a, b), { organizationId: ORG, userId: 1 }, orgWide);
    expect(titles.get(a)).toBe('A');
    expect(titles.get(b)).toBe('B');
  });

  it('gives no title to a deleted document or one whose data was removed', async () => {
    const deleted = await doc('Deleted', PROGRAM, { deleted: true });
    const removed = await doc('Removed', PROGRAM);
    // A 'remove_data' disposition on the document, with every column the canonical migration requires.
    const hex = (c: string) => c.repeat(64);
    await jdb.pool.query(
      `INSERT INTO public.document_data_dispositions
         (organization_id, program_id, vault_document_id, choice, reason, actor_id, source_sha256, preview_hash,
          linked_ids, impact_snapshot, audit_receipt)
       VALUES ($1, $2, $3, 'remove_data', 'withdrawn by the sponsor', 1, $4, $5, $6, '{}'::jsonb, $7)`,
      [
        // The guard binds the disposition to the document's own SHA-256.
        ORG, PROGRAM, removed, removed.replaceAll('-', '').repeat(2), hex('e'),
        JSON.stringify({ capturedSourceIds: [], vaultDocumentIds: [removed], artifactIds: [], uploadIds: [] }),
        JSON.stringify({ id: 'audit-1', sha256Chain: hex('d') }),
      ],
    );
    const titles = await resolveStepDocumentTitles(reads(deleted, removed), { organizationId: ORG, userId: 1 }, inProject);
    expect(titles.size).toBe(0);
  });

  it('a scope that refuses the read gives no title and runs no query', async () => {
    const id = await doc('Stability report 2025', PROGRAM);
    let ran = 0;
    const titles = await resolveStepDocumentTitles(reads(id), { organizationId: ORG, userId: 1 }, {
      scope: async () => ({ error: 'The open project has no program.', code: 'NO_PROJECT' }),
      query: async (sql, params) => {
        ran++;
        return query(sql, params);
      },
    });
    expect(titles.size).toBe(0);
    expect(ran).toBe(0);
  });
  it('organization-level titles exclude a same-org private program before returning metadata', async () => {
    const mine = await doc('Visible source', PROGRAM), privateId = await doc('PRIVATE source title', PROGRAM_B);
    const scope = { organizationId: ORG, userId: 1, role: 'viewer', projectId: null, programId: null, accessibleProgramIds: [PROGRAM], actorFiltered: true as const };
    const titles = await resolveStepDocumentTitles(reads(mine, privateId), { organizationId: ORG, userId: 1 } ,
      { scope: async () => ({ programId: null, admittedScope: scope }), query, revalidate: async () => {} });
    expect([...titles]).toEqual([[mine, 'Visible source']]);
  });

  it('recorded source organization must agree with the actor and live parent', async () => {
    const wrong = await doc('WRONG recorded organization', PROGRAM);
    await jdb.pool.query('UPDATE vault.documents SET organization_id=$1 WHERE id=$2', [OTHER_ORG, wrong]);
    const scope = { organizationId: ORG, userId: 1, role: 'viewer', projectId: 42, programId: PROGRAM, accessibleProgramIds: [PROGRAM], actorFiltered: true as const };
    const titles = await resolveStepDocumentTitles(reads(wrong), { organizationId: ORG, userId: 1 } ,
      { scope: async () => ({ programId: PROGRAM, admittedScope: scope }), query, revalidate: async () => {} });
    expect(titles.size).toBe(0);
  });

  it('a private sharing revocation during metadata lookup returns no title', async () => {
    const id = await doc('Source title before revocation', PROGRAM);
    const scope = { organizationId: ORG, userId: 1, role: 'viewer', projectId: 42, programId: PROGRAM, accessibleProgramIds: [PROGRAM], actorFiltered: true as const };
    const titles = await resolveStepDocumentTitles(reads(id), { organizationId: ORG, userId: 1 } ,
      { scope: async () => ({ programId: PROGRAM, admittedScope: scope }), query, revalidate: async () => { throw new Error('REVOKED'); } });
    expect(titles.size).toBe(0);
  });

});
