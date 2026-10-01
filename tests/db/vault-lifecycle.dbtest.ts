/**
 * A Vault version is sent for review, approved with an e-signature, and
 * supersedes the version before it (VR-13, row D5).
 *
 * On PostgreSQL as the runtime role with RLS on, through the real ingest,
 * Vault and lifecycle routes (the signing ceremony is the one stand-in: it is
 * pinned by its own suites):
 *
 *   - starting a version's lifecycle makes one record at authoring whose
 *     content hash is the version's, whatever the body says; a second start
 *     returns the same record; another tenant's version is not found;
 *   - the uploader may neither review nor approve; the reviewer does not also
 *     approve; a viewer may not act; approving without a review sign-off is
 *     refused; only the current version is approved;
 *   - approving v2 moves v1 to superseded in the same transaction, each with
 *     its chained audit row, and the approval is bound to v2's bytes; a failure
 *     while superseding leaves both as they were;
 *   - an approved version's details cannot be edited;
 *   - the Vault reads each version's stage and sign-offs, and its history.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-vr13 ';
const CODE = 'DBTEST-VR13';

type Tenant = { orgId: number; orgUuid: string; programId: string };
type Who = 'uploader' | 'reviewer' | 'approver' | 'viewer';
let owner: Pool;
const users = {} as Record<Who, number>;
let mine: Tenant;
let theirs: Tenant;

const pdf = (tag: string) =>
  Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${tag}\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'utf8');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** The signing ceremony's verdict: verified (its own suites prove the real one). */
const reverify = async () => ({ ok: true as const, authenticationMethod: 'password+totp', secondFactorVerified: true });

async function appFor(t: Tenant, who: Who, opts: { failSupersede?: boolean } = {}): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { createDocumentLifecycleRouter } = await import('../../server/routes/document-lifecycle');
  const { buildLifecycleBindings } = await import('../../server/services/regulatory/lifecycleBindings');
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  // The runtime db, as production's router resolves it (a lazy require there,
  // which vitest's loader cannot follow).
  const { db } = await import('../../server/db');
  const role = who === 'viewer' ? 'viewer' : 'admin';
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = users[who];
    r.tenantId = t.orgId;
    r.userRole = role;
    r.user = { id: users[who], organizationId: t.orgId, organizationUuid: t.orgUuid, role };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  a.use('/api/regulatory/documents', createDocumentLifecycleRouter({
    db: db as never,
    reverify,
    ...(opts.failSupersede
      ? {
          bindingsFactory: (deps) => {
            const b = buildLifecycleBindings(deps);
            return { ...b, audit: async (e) => {
              if (e.to === 'superseded') throw new Error('injected: the superseded audit row could not be written');
              return b.audit(e);
            } };
          },
        }
      : {}),
  }));
  return a;
}

async function ingest(t: Tenant, code: string, bytes: Buffer, supersedes?: string) {
  let r = request(await appFor(t, 'uploader')).post('/api/vault/ingest').field('programId', t.programId)
    .field('documentTitle', `Clinical overview ${code}`).field('documentType', 'OTHER');
  r = supersedes ? r.field('supersedesDocumentId', supersedes) : r.field('documentCode', `${CODE}-${code}`);
  const res = await r.attach('file', bytes, 'overview.pdf');
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.document.id);
}

/** POST to the lifecycle route in my organization, as `who`. */
const lifecycle = async (who: Who, path: string, body: object, opts = {}) =>
  request(await appFor(mine, who, opts)).post(`/api/regulatory/documents${path}`).send(body);
const start = (who: Who, vaultId: string, extra: object = {}) =>
  lifecycle(who, '', { sources: { vault_documents: { nativeId: vaultId, role: 'artifact' } }, ...extra });
const advance = (who: Who, id: string, to: string, opts = {}) =>
  lifecycle(who, `/${id}/advance`, { to, password: 'x', mfaToken: '000000', reason: `To ${to}` }, opts);
const review = (who: Who, id: string) =>
  lifecycle(who, `/${id}/sign`, { meaning: 'reviewed', password: 'x', mfaToken: '000000', reason: 'Reviewed against the protocol' });
const vault = async (who: Who, path: string) =>
  request(await appFor(mine, who)).get(`/api/c2c/project-vault/${mine.programId}${path}`);

/** Start, send for review, and sign the review: a version ready to approve. */
async function reviewed(vaultId: string): Promise<string> {
  const s = await start('uploader', vaultId);
  expect(s.status, JSON.stringify(s.body)).toBe(201);
  expect((await advance('uploader', s.body.canonicalId, 'in_review')).status).toBe(200);
  const r = await review('reviewer', s.body.canonicalId);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return s.body.canonicalId;
}

/** Every upload leaf in the tree, however deep. */
function leaves(node: unknown, out: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(node)) node.forEach((n) => leaves(n, out));
  else if (node && typeof node === 'object') {
    const n = node as Record<string, unknown>;
    if (n.src === 'upload') out.push(n);
    if (n.children) leaves(n.children, out);
  }
  return out;
}

const stageOf = async (canonicalId: string) =>
  (await owner.query('SELECT stage FROM canonical_documents WHERE canonical_id = $1', [canonicalId])).rows[0]?.stage;

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-vr13-${slug}`],
  );
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Approvin 5mg') RETURNING id`,
    [`${PROBE}${slug} program`, `${CODE}-${slug.toUpperCase()}`, org.rows[0].id],
  );
  return { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
}

async function cleanup(): Promise<void> {
  // Lifecycle records and signatures are append-only (VR-03, VR-12) and stay
  // with the probe tenant; each run uses fresh Vault versions.
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1 AND supersedes_id IS NOT NULL', [`${CODE}%`]);
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query(
    'DELETE FROM c2c_documents WHERE project_id IN (SELECT id FROM regulatory_programs WHERE name LIKE $1)',
    [`${PROBE}%`],
  );
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  for (const who of ['uploader', 'reviewer', 'approver', 'viewer'] as Who[]) {
    const u = await owner.query(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, 'not-a-real-hash')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [`dbtest-vr13-${who}@example.test`, `Vera ${who[0].toUpperCase()}${who.slice(1)}`],
    );
    users[who] = Number(u.rows[0].id);
  }
  await cleanup();
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  // A signature is attributed through the signer's membership (§11.100).
  for (const who of ['uploader', 'reviewer', 'approver', 'viewer'] as Who[]) {
    await owner.query(
      `INSERT INTO organization_users (organization_id, user_id, role)
       SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM organization_users WHERE organization_id = $1 AND user_id = $2)`,
      [mine.orgId, users[who], who === 'viewer' ? 'viewer' : 'admin'],
    );
  }
}, 60_000);

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
});

describe('starting a Vault version\'s lifecycle (VR-13)', () => {
  it('makes one record at authoring with the version\'s hash, whatever the body says', async () => {
    const v = await ingest(mine, 'START', pdf('start'));
    const res = await start('uploader', v, { title: 'Forged', documentType: 'X', contentHash: 'f'.repeat(64), hasContent: false });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const row = (await owner.query(
      'SELECT stage, content_hash, title, has_content, created_by FROM canonical_documents WHERE canonical_id = $1',
      [res.body.canonicalId],
    )).rows[0];
    expect(row).toMatchObject({ stage: 'authoring', content_hash: sha(pdf('start')), title: 'Clinical overview START', has_content: true });
    expect(Number(row.created_by)).toBe(users.uploader);
    // Who started it is on the org-wide chain: the creator is an author for separation of duties.
    const created = await owner.query(
      `SELECT user_id FROM audit_logs WHERE tenant_id = $1 AND table_name = 'canonical_document'
         AND record_id = $2 AND action = 'regulated_document.created'`,
      [mine.orgId, res.body.canonicalId],
    );
    expect(created.rows.map((r) => Number(r.user_id))).toEqual([users.uploader]);

    const again = await start('approver', v);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ canonicalId: res.body.canonicalId, created: false });
  });

  it("does not find another organization's version", async () => {
    const theirsV = await ingest(theirs, 'THEIRS', pdf('theirs'));
    const res = await start('uploader', theirsV);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VAULT_SOURCE_NOT_FOUND');
  });
});

describe('review and approval of a Vault version (VR-13)', () => {
  it('the uploader may not review, a viewer may not act, and approval needs a review', async () => {
    const v = await ingest(mine, 'POLICY', pdf('policy'));
    const s = await start('uploader', v);
    expect((await advance('uploader', s.body.canonicalId, 'in_review')).status).toBe(200);
    expect((await review('uploader', s.body.canonicalId)).body.error).toBe('SELF_APPROVAL');
    expect((await review('viewer', s.body.canonicalId)).status).toBe(403);
    const early = await advance('approver', s.body.canonicalId, 'approved');
    expect(early.status).toBe(409);
    expect(early.body.blockedBy).toContain('REVIEW_SIGNOFF_REQUIRED');
  });

  it('the reviewer and the uploader may not approve; a third person approves exactly those bytes', async () => {
    const v1 = await ingest(mine, 'FAMILY', pdf('family-v1'));
    const c1 = await reviewed(v1);
    for (const who of ['reviewer', 'uploader'] as Who[]) {
      const r = await advance(who, c1, 'approved');
      expect(r.status, who).toBe(403);
      expect(r.body.error, who).toBe('SELF_APPROVAL');
    }
    const ok = await advance('approver', c1, 'approved');
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.superseded).toEqual([]);
    const sig = await owner.query(
      `SELECT bound_payload_digest, signer_id, signature_meaning FROM electronic_signatures
        WHERE organization_id = $1 AND signed_target = $2 ORDER BY id DESC LIMIT 1`,
      [mine.orgId, `canonical_document:${c1}`],
    );
    expect(sig.rows[0]).toMatchObject({ bound_payload_digest: sha(pdf('family-v1')), signature_meaning: 'APPROVED' });
    expect(Number(sig.rows[0].signer_id)).toBe(users.approver);

    // The approved version's details are kept as approved.
    const edit = await request(await appFor(mine, 'uploader'))
      .post(`/api/c2c/project-vault/${mine.programId}/documents/${v1}/details`)
      .send({ documentTitle: 'Renamed after approval', reason: 'Tidy the title' });
    expect(edit.status, JSON.stringify(edit.body)).toBe(409);
    expect(JSON.stringify(edit.body)).toContain('APPROVED_VERSION_IMMUTABLE');

    // Approving v2 supersedes v1, in the same transaction.
    const v2 = await ingest(mine, 'FAMILY', pdf('family-v2'), v1);
    const c2 = await reviewed(v2);
    const approved = await advance('approver', c2, 'approved');
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.superseded).toEqual([c1]);
    expect(await stageOf(c1)).toBe('superseded');
    expect(await stageOf(c2)).toBe('approved');
    const trail = await owner.query(
      `SELECT action, record_id FROM audit_logs WHERE tenant_id = $1 AND table_name = 'canonical_document'
         AND record_id = ANY($2::text[]) AND action IN ('regulated_document.approved', 'regulated_document.superseded')`,
      [mine.orgId, [c1, c2]],
    );
    expect(trail.rows.map((r) => `${r.action}:${r.record_id}`).sort()).toEqual(
      [`regulated_document.approved:${c1}`, `regulated_document.approved:${c2}`, `regulated_document.superseded:${c1}`].sort(),
    );

    // The Vault shows each version's stage and its approval.
    const list = await vault('viewer', `/documents/${v2}/versions`);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    const [first, second] = list.body.data.versions;
    expect(first.lifecycle).toMatchObject({ canonicalId: c2, stage: 'approved', creatorId: users.uploader });
    expect(first.lifecycle.approval).toMatchObject({ printedName: 'Vera Approver', meaning: 'APPROVED' });
    expect(first.lifecycle.review).toMatchObject({ printedName: 'Vera Reviewer', meaning: 'REVIEWED' });
    expect(second.lifecycle).toMatchObject({ canonicalId: c1, stage: 'superseded' });

    const tree = await vault('viewer', '');
    const leaf = leaves(tree.body.data.tree).find((l) => l.docId === v2);
    expect(leaf).toMatchObject({ lifecycleStage: 'approved', versionCount: 2 });

    const history = await vault('viewer', `/documents/${v2}/history`);
    expect(history.status).toBe(200);
    const events = history.body.data.entries.map((e: { event: string; version: string | null }) => `${e.version}`);
    expect(events).toContain('1.0');
    expect(events).toContain('2.0');
    expect(JSON.stringify(history.body.data.entries)).toMatch(/superseded/i);
  });

  it('only the current version is started or approved', async () => {
    const v1 = await ingest(mine, 'STALE', pdf('stale-v1'));
    const c1 = await reviewed(v1);
    const v2 = await ingest(mine, 'STALE', pdf('stale-v2'), v1);
    const res = await advance('approver', c1, 'approved');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('VERSION_NOT_CURRENT');
    expect(await stageOf(c1)).toBe('in_review');
    const v3Start = await start('uploader', v2);
    expect(v3Start.status).toBe(201);
    const v1Again = await start('uploader', v1);
    expect(v1Again.body).toMatchObject({ canonicalId: c1, created: false });
  });

  it('a failure while superseding leaves both versions as they were', async () => {
    const v1 = await ingest(mine, 'ATOMIC', pdf('atomic-v1'));
    const c1 = await reviewed(v1);
    expect((await advance('approver', c1, 'approved')).status).toBe(200);
    const v2 = await ingest(mine, 'ATOMIC', pdf('atomic-v2'), v1);
    const c2 = await reviewed(v2);
    const sigsBefore = Number((await owner.query(
      `SELECT count(*) FROM electronic_signatures WHERE signed_target = $1`, [`canonical_document:${c2}`])).rows[0].count);
    const res = await advance('approver', c2, 'approved', { failSupersede: true });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await stageOf(c1)).toBe('approved');
    expect(await stageOf(c2)).toBe('in_review');
    const sigsAfter = Number((await owner.query(
      `SELECT count(*) FROM electronic_signatures WHERE signed_target = $1`, [`canonical_document:${c2}`])).rows[0].count);
    expect(sigsAfter).toBe(sigsBefore);
  });
});
