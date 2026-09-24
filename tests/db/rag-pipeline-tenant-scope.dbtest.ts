/**
 * The RAG pipeline's vault scope is the session's, not its caller's argument
 * (D3, 2026-09-24; evidence docs/evidence/D3/2026-09-24-rag-pipeline-tenant/).
 *
 * The vault re-baseline listed "the vault context-expansion (small-to-big) query
 * has no org predicate and relies on RLS alone" as unclaimed. Following that
 * found the boundary one level up. Every vault query in
 * server/services/advancedRAGPipeline.ts takes its tenant from the pipeline's
 * `organizationUuid` OPTION, twice over:
 *
 *   - `withTenantContext` runs `SET LOCAL app.current_org_id = <option>`, and
 *     vault RLS keys on exactly that GUC (vault.documents' policy is
 *     core.can_access_program → identity.can_access_program →
 *     identity.current_org_id(), which reads app.current_org_id); and
 *   - the vault search arm's explicit predicate, `o.uuid = $4`, is the same
 *     option — its comment calls RLS "defence in depth here, not the boundary".
 *
 * So the database and the SQL both answered to whatever uuid the caller handed
 * the pipeline, and the request's own tenant scope — the one the auth boundary
 * opened from the verified session — was overridden for the transaction. Any
 * caller that passes a uuid it did not get from the session reads that tenant's
 * vault. `server/routes/chat/send-message.ts` builds its tool context's uuid as
 * `req.tenantContext.organizationUuid || req.headers['x-org-uuid']`, and the
 * cortex query route did the same until c062f4b0.
 *
 * These cases drive `ragRouter.retrieve` exactly as search_document_passages
 * does (vault corpus, basic strategy, no reranking), inside a request tenant
 * scope for tenant A, and hand it tenant B's uuid. Only the query embedding is
 * stubbed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { EnhancedEmbeddingService } from '../../server/services/enhancedEmbeddingService';
import { ragRouter } from '../../server/services/ragRouter';
import {
  TAG,
  ORG_A,
  ORG_B,
  FIXTURE_ORGS,
  owner,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

const VEC = Array.from({ length: 1536 }, () => 0.001);
const SECRET = { A: `${TAG}-vault-secret-A`, B: `${TAG}-vault-secret-B` };
const uuidOf: Record<'A' | 'B', string> = { A: '', B: '' };

beforeAll(async () => {
  await provisionTwoTenantFixture();
  vi.spyOn(EnhancedEmbeddingService.prototype, 'embed').mockImplementation(async text => ({
    text,
    embedding: VEC,
    model: 'text-embedding-3-small',
    tokenCount: 1,
    cached: false,
  }));

  const orgs = await owner.query(
    'SELECT id, uuid::text AS uuid FROM organizations WHERE id = ANY($1::int[])',
    [FIXTURE_ORGS]
  );
  for (const row of orgs.rows) uuidOf[row.id === ORG_A ? 'A' : 'B'] = row.uuid;

  for (const [side, org] of [
    ['A', ORG_A],
    ['B', ORG_B],
  ] as const) {
    // Vault RLS resolves a document's tenant through its program
    // (core.get_program_org_id → regulatory_programs → organizations.uuid).
    const prog = await owner.query(
      `INSERT INTO regulatory_programs
         (name, code, organization_id, program_type, product_type, primary_agency, product_name)
       VALUES ($1,$2,$3,'IND','drug','FDA',$4) RETURNING id`,
      [`${TAG}-rag-program-${side}`, `${TAG}-RAG-${side}`, org, `${TAG} product ${side}`]
    );
    const doc = await owner.query(
      `INSERT INTO vault.documents
         (program_id, organization_id, content_hash, document_title, file_name, status, source_type)
       VALUES ($1,$2,$3,$4,$5,'completed','txt') RETURNING id`,
      [
        prog.rows[0].id,
        org,
        `${TAG}${side}`.padEnd(64, '0').slice(0, 64),
        SECRET[side],
        `${SECRET[side]}.txt`,
      ]
    );
    await owner.query(
      `INSERT INTO vault.document_chunks (document_id, chunk_index, chunk_text, embedding)
       VALUES ($1, 0, $2, $3::vector)`,
      [doc.rows[0].id, `NOAEL passage ${SECRET[side]}`, `[${VEC.join(',')}]`]
    );
  }
}, 60_000);

afterAll(async () => {
  if (owner) {
    await owner.query(
      `DELETE FROM vault.document_chunks WHERE document_id IN
         (SELECT id FROM vault.documents WHERE organization_id = ANY($1::int[]))`,
      [FIXTURE_ORGS]
    );
    await owner.query('DELETE FROM vault.documents WHERE organization_id = ANY($1::int[])', [
      FIXTURE_ORGS,
    ]);
    await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [
      `${TAG}-rag-program-%`,
    ]);
  }
  await teardownTwoTenantFixture();
});

/** Tenant A's request scope, as the auth boundary opens it from a verified session. */
function asTenantA<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantScope(
    {
      tenantId: String(ORG_A),
      orgUuid: uuidOf.A,
      role: 'member',
      source: 'request',
      caller: 'tests/db/rag-pipeline-tenant-scope.dbtest.ts',
    },
    fn
  );
}

/** Retrieve exactly as search_document_passages does. */
function retrieveVault(organizationUuid: string | undefined) {
  return ragRouter.retrieve({
    query: 'NOAEL passage',
    intent: 'regulatory_qa',
    corpus: 'vault',
    organizationUuid,
    limit: 10,
    strategy: 'basic',
    useReranking: false,
  });
}

const text = (v: unknown) => JSON.stringify(v);

describe("the RAG pipeline scopes the vault to the session, not to its caller's argument (D3)", () => {
  it('positive control: tenant A, handed its own uuid, retrieves its own passage', async () => {
    const ctx = await asTenantA(() => retrieveVault(uuidOf.A));
    expect(text(ctx), 'the stubbed retrieval must actually find the seeded chunk').toContain(
      SECRET.A
    );
    expect(text(ctx)).not.toContain(SECRET.B);
  });

  it("tenant A's session, handed tenant B's uuid, never receives B's passage", async () => {
    // The attack. Both the RLS GUC and the SQL predicate used to be built from
    // this argument, so this returned B's chunk with RLS enforcing.
    let out: unknown;
    try {
      out = await asTenantA(() => retrieveVault(uuidOf.B));
    } catch (err) {
      out = { refused: String(err) };
    }
    expect(text(out), "tenant B's vault passage reached tenant A's session").not.toContain(
      SECRET.B
    );
  });

  it('a uuid that disagrees with the session scope is refused, not quietly answered', async () => {
    // Returning an empty result would read as "the vault has nothing on this" —
    // an error rendered as an empty result. A caller naming another tenant is a
    // defect in that caller, and it should fail where it can be seen.
    await expect(asTenantA(() => retrieveVault(uuidOf.B))).rejects.toThrow(/tenant/i);
  });

  it('…including when the session scope carries no uuid — exactly when a header fallback fires', async () => {
    // send-message.ts falls back to the client's x-org-uuid header only when
    // req.tenantContext.organizationUuid is missing, i.e. when the request's
    // scope has no orgUuid. A guard that compared against scope.orgUuid alone
    // would stand down in precisely that case, so the session's uuid is resolved
    // from its tenant id instead.
    const uuidlessScopeA = <T>(fn: () => Promise<T>) =>
      runWithTenantScope(
        {
          tenantId: String(ORG_A),
          orgUuid: null,
          role: 'member',
          source: 'request',
          caller: 'tests/db/rag-pipeline-tenant-scope.dbtest.ts',
        },
        fn
      );
    let out: unknown;
    try {
      out = await uuidlessScopeA(() => retrieveVault(uuidOf.B));
    } catch (err) {
      out = { refused: String(err) };
    }
    expect(text(out)).not.toContain(SECRET.B);
    expect(text(out)).toMatch(/refused/);
    // …and the same scope handed its OWN uuid is served, so the lookup is right.
    const own = await uuidlessScopeA(() => retrieveVault(uuidOf.A));
    expect(text(own)).toContain(SECRET.A);
  });

  it('a missing uuid keeps its existing refusal (unchanged by this fix)', async () => {
    // Pinned by tests/db/vault-passage-search.dbtest.ts for the tool; here for
    // the pipeline: no uuid, no vault search, never a search across tenants.
    const ctx = await asTenantA(() => retrieveVault(undefined));
    expect(text(ctx)).not.toContain(SECRET.A);
    expect(text(ctx)).not.toContain(SECRET.B);
  });
});
