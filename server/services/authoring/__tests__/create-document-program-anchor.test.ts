/**
 * A new authoring document is anchored to a project its organization owns, or it
 * is not created (LX-20, project first).
 *
 * `createDocument` checked only that `client_program_id` LOOKED like a UUID, on
 * the reasoning "cross-org mis-scoping is already prevented downstream: every
 * read is gated on tenant_id". Reads are; the anchor is not. A document of org A
 * could be created naming org B's project, a project that does not exist, or a
 * deleted one — and every chain that starts at a project would then start at
 * the wrong one.
 *
 * The pool is a recorder: the only thing that matters is that the refusal comes
 * before anything is written.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../c2c/governed-document-binding.js', () => ({
  resolveGovernedDocument: vi.fn(async () => ({ documentId: null, reason: 'unbound in this test' })),
}));

import { createDocument, type CreateContext } from '../authoring-documents';

const ORG_A = 1;
const OWN = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '22222222-2222-4222-8222-222222222222';
const MISSING = '33333333-3333-4333-8333-333333333333';
const DELETED = '44444444-4444-4444-8444-444444444444';

/** regulatory_programs as the database holds it. */
const PROGRAMS = [
  { id: OWN, organization_id: ORG_A, deleted_at: null },
  { id: FOREIGN, organization_id: 2, deleted_at: null },
  { id: DELETED, organization_id: ORG_A, deleted_at: '2026-09-01T00:00:00Z' },
];

function recorder() {
  const statements: string[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    statements.push(sql);
    if (/FROM regulatory_programs/i.test(sql)) {
      const [id, org] = params as [string, number];
      const hit = PROGRAMS.find((p) => p.id === id && p.organization_id === org && p.deleted_at === null);
      return { rows: hit ? [{ id: hit.id }] : [], rowCount: hit ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  const pool = { query, connect: vi.fn(async () => client) };
  const ctx = {
    pool: pool as unknown as CreateContext['pool'],
    tenantId: ORG_A,
    actor: { id: '3', name: 'Avery Author' },
    audit: { ipAddress: '127.0.0.1', userAgent: 'test' },
  } as unknown as CreateContext;
  const writes = () => statements.filter((s) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(s));
  return { ctx, writes };
}

describe('createDocument anchors to a project the organization owns', () => {
  it.each([
    ['another organization’s project', FOREIGN],
    ['a project that does not exist', MISSING],
    ['a deleted project', DELETED],
  ])('refuses %s, before anything is written', async (_label, programId) => {
    const { ctx, writes } = recorder();
    const outcome = await createDocument(ctx, { title: 'Clinical overview', client_program_id: programId });
    expect(outcome).toMatchObject({ kind: 'refused', status: 404 });
    expect(writes()).toEqual([]);
  });

  it('still refuses a malformed id with 400', async () => {
    const { ctx } = recorder();
    const outcome = await createDocument(ctx, { title: 'Clinical overview', client_program_id: 'not-a-uuid' });
    expect(outcome).toMatchObject({ kind: 'refused', status: 400 });
  });
});
