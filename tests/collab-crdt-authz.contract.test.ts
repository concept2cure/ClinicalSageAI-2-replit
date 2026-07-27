/**
 * Security + durability contract (C2C-COLLAB-001): the Hocuspocus CRDT endpoint
 * must authorize every room against a REAL document row scoped by the tenant on
 * the VERIFIED access token, and must actually persist Y.js state.
 *
 * On the parent commit, server/services/hocuspocus-server.ts `onAuthenticate`
 * verified only the JWT signature. It performed no token-class check, never read
 * the organization claim, and never resolved `documentName` to a row — so any
 * authenticated user in any organization could join and edit any document room
 * by naming it. It also had two fail-OPEN fallbacks outside production: an
 * "Anonymous" identity when no token was presented, and a "Dev User" identity
 * AFTER signature verification FAILED (a forged token authenticated).
 * `onStoreDocument` / `onLoadDocument` only logged, so every collaborative edit
 * was lost on document unload or process restart.
 *
 * EVERY case below fails on the parent commit: the rejection cases returned an
 * identity instead of throwing, and the persistence cases had no storage at all.
 *
 * @compliance 21 CFR Part 11 §11.10(d) limiting system access to authorized
 *             individuals; §11.10(c) protection of records.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SignJWT } from 'jose';
import * as Y from 'yjs';
import { createJourneyDb, type JourneyDb } from './golden-journeys/harness';

// >= 32 chars: server/config/environment.ts enforces a minimum secret length.
const JWT_SECRET = 'collab-crdt-authz-contract-secret-0727';
process.env.JWT_SECRET = JWT_SECRET;
// Canonical verifyJwtWithRotation reads JWT_SECRET_{ENV} first; NODE_ENV=test
// maps to the DEV suffix.
process.env.JWT_SECRET_DEV = JWT_SECRET;

const T = 120_000;

const ORG_A = 11;
const ORG_B = 22;
const DOC_A = '11111111-1111-4111-8111-111111111111'; // owned by ORG_A
const DOC_B = '22222222-2222-4222-8222-222222222222'; // owned by ORG_B
const DOC_MISSING = '33333333-3333-4333-8333-333333333333'; // exists nowhere

/**
 * Minimal FK parent for the migration under test. Mirrors the real columns the
 * composite (doc_id, tenant_id) FK needs: `authoring_documents.id` UUID PK plus
 * the UNIQUE (id, tenant_id) target the loop-tables migration installs.
 */
const PREREQ = `
  CREATE TABLE authoring_documents (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    tenant_id INTEGER NOT NULL,
    CONSTRAINT authoring_documents_id_tenant_key UNIQUE (id, tenant_id)
  );
  INSERT INTO authoring_documents (id, title, tenant_id) VALUES
    ('${DOC_A}', 'org-a doc', ${ORG_A}),
    ('${DOC_B}', 'org-b doc', ${ORG_B});
`;

const h = vi.hoisted(() => ({ pglite: null as any }));

// withTenantConnection acquires a dedicated client from the runtime pool and
// sets app.current_tenant_id on it. Redirect that pool at the in-process
// Postgres so the real helper, the real SQL, and the real migration DDL all run.
vi.mock('../server/db/runtime', () => ({
  getPool: () => ({
    connect: async () => ({
      query: async (text: string, params?: unknown[]) => {
        const r = await h.pglite.query(text, params);
        const rows = (r.rows ?? []) as unknown[];
        const affected = (r as { affectedRows?: number }).affectedRows ?? 0;
        return { rows, rowCount: rows.length > 0 ? rows.length : affected };
      },
      release: () => undefined,
    }),
  }),
}));

let jdb: JourneyDb;
let mod: typeof import('../server/services/hocuspocus-server');

/** A normally-minted access token. */
async function accessToken(orgId: number | undefined, extra: Record<string, unknown> = {}) {
  const claims: Record<string, unknown> = { userId: 7, email: 'author@collab.example', name: 'Author', ...extra };
  if (orgId !== undefined) claims.organizationId = orgId;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

/** A token signed with an attacker-chosen secret — a forgery. */
async function forgedToken(orgId: number) {
  return new SignJWT({ userId: 7, organizationId: orgId, name: 'Mallory' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode('an-attacker-chosen-secret-at-least-32-chars'));
}

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: ['db/migrations/20260727_authoring_document_yjs_state.sql'],
  });
  h.pglite = jdb.pglite;
  mod = await import('../server/services/hocuspocus-server');
}, T);

afterAll(async () => {
  await jdb?.close();
});

describe('C2C-COLLAB-001: collaboration rooms are authorized per document and per tenant', () => {
  it('rejects a connection with NO token, even outside production', async () => {
    expect(process.env.NODE_ENV).not.toBe('production');
    await expect(mod.authorizeCollabConnection(undefined, DOC_A)).rejects.toThrow(
      /Authentication required/i,
    );
    await expect(mod.authorizeCollabConnection('', DOC_A)).rejects.toThrow(/Authentication required/i);
  }, T);

  it('rejects a FORGED token (bad signature) — no "Dev User" fallback outside production', async () => {
    const token = await forgedToken(ORG_A);
    await expect(mod.authorizeCollabConnection(token, DOC_A)).rejects.toThrow(
      /Invalid authentication token/i,
    );
  }, T);

  it('rejects a validly-signed REFRESH token (non-access token class)', async () => {
    const token = await accessToken(ORG_A, { type: 'refresh' });
    await expect(mod.authorizeCollabConnection(token, DOC_A)).rejects.toThrow(/not an access token/i);
  }, T);

  it('rejects a validly-signed MFA-partial token', async () => {
    const token = await accessToken(ORG_A, { mfaPending: true });
    await expect(mod.authorizeCollabConnection(token, DOC_A)).rejects.toThrow(/not an access token/i);
  }, T);

  it('rejects a valid token with NO organization claim — never defaults to a tenant', async () => {
    const token = await accessToken(undefined);
    await expect(mod.authorizeCollabConnection(token, DOC_A)).rejects.toThrow(
      /missing required organization claim/i,
    );
  }, T);

  it('rejects a valid token with no subject claim', async () => {
    const token = await new SignJWT({ organizationId: ORG_A })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(JWT_SECRET));
    await expect(mod.authorizeCollabConnection(token, DOC_A)).rejects.toThrow(
      /missing required subject claim/i,
    );
  }, T);

  it('CROSS-TENANT: an ORG_B user is refused ORG_A’s document room', async () => {
    const token = await accessToken(ORG_B);
    await expect(mod.authorizeCollabConnection(token, DOC_A)).rejects.toThrow(
      /Document not found or access denied/i,
    );
  }, T);

  it('refuses a document id that does not exist in the caller’s tenant', async () => {
    const token = await accessToken(ORG_A);
    await expect(mod.authorizeCollabConnection(token, DOC_MISSING)).rejects.toThrow(
      /Document not found or access denied/i,
    );
  }, T);

  it('refuses a room name that is not a bare document UUID', async () => {
    const token = await accessToken(ORG_A);
    for (const name of ['lobby', `${DOC_A}; DROP TABLE authoring_documents`, `doc:${DOC_A}`, '']) {
      await expect(mod.authorizeCollabConnection(token, name)).rejects.toThrow(/Unknown document/i);
    }
  }, T);

  it('admits the owner and derives the tenant from the CLAIM, not the room name', async () => {
    const token = await accessToken(ORG_A);
    const ctx = await mod.authorizeCollabConnection(token, DOC_A);
    expect(ctx.tenantId).toBe(ORG_A);
    expect(ctx.docId).toBe(DOC_A);
    expect(ctx.user.id).toBe('7');
    expect(ctx.user.email).toBe('author@collab.example');

    // Each tenant reaches only its own room.
    const bCtx = await mod.authorizeCollabConnection(await accessToken(ORG_B), DOC_B);
    expect(bCtx.tenantId).toBe(ORG_B);
    await expect(mod.authorizeCollabConnection(await accessToken(ORG_A), DOC_B)).rejects.toThrow(
      /Document not found or access denied/i,
    );
  }, T);
});

describe('C2C-COLLAB-001: Y.js state is durably persisted, tenant-scoped', () => {
  it('survives a store/load round trip with a verified checksum', async () => {
    const ctx = await mod.authorizeCollabConnection(await accessToken(ORG_A), DOC_A);

    const doc = new Y.Doc();
    doc.getText('body').insert(0, 'Section 2.5 Clinical Overview — draft text.');
    doc.getMap('meta').set('module', 'm2.5');
    await mod.storeCollabDocumentState(ctx, DOC_A, doc);

    // A fresh process would start from nothing; loading must reconstruct it.
    const loaded = await mod.loadCollabDocumentState(ctx, DOC_A);
    expect(loaded).not.toBeNull();
    expect(loaded!.getText('body').toString()).toBe(
      'Section 2.5 Clinical Overview — draft text.',
    );
    expect(loaded!.getMap('meta').get('module')).toBe('m2.5');

    const row = (await jdb.pool.query(
      'SELECT tenant_id, version, checksum, updated_by FROM authoring_document_yjs_state WHERE doc_id = $1',
      [DOC_A],
    )).rows[0] as { tenant_id: number; version: number; checksum: string; updated_by: string };
    expect(row.tenant_id).toBe(ORG_A);
    expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(row.updated_by).toBe('7');
    expect(row.version).toBe(1);
  }, T);

  it('bumps the version and keeps later edits on re-store', async () => {
    const ctx = await mod.authorizeCollabConnection(await accessToken(ORG_A), DOC_A);
    const first = await mod.loadCollabDocumentState(ctx, DOC_A);
    first!.getText('body').insert(0, 'REVISED: ');
    await mod.storeCollabDocumentState(ctx, DOC_A, first!);

    const again = await mod.loadCollabDocumentState(ctx, DOC_A);
    expect(again!.getText('body').toString()).toMatch(/^REVISED: Section 2\.5/);

    const row = (await jdb.pool.query(
      'SELECT version FROM authoring_document_yjs_state WHERE doc_id = $1',
      [DOC_A],
    )).rows[0] as { version: number };
    expect(row.version).toBe(2);
  }, T);

  it('CROSS-TENANT: state stored for ORG_A is not readable under an ORG_B tenant scope', async () => {
    // The only way to reach the load path is with an authorized context; forge
    // one that names ORG_B for ORG_A's document to prove the READ is scoped by
    // the context tenant and not by the document name alone.
    const spoofed = { user: { id: '9', name: 'B', email: '', color: '#000' }, tenantId: ORG_B, docId: DOC_A };
    const leaked = await mod.loadCollabDocumentState(spoofed, DOC_A);
    expect(leaked).toBeNull();

    const rows = (await jdb.pool.query(
      'SELECT tenant_id FROM authoring_document_yjs_state WHERE doc_id = $1',
      [DOC_A],
    )).rows as { tenant_id: number }[];
    expect(rows.map(r => r.tenant_id)).toEqual([ORG_A]);
  }, T);

  it('refuses to load or store without an authorized context', async () => {
    const doc = new Y.Doc();
    doc.getText('body').insert(0, 'x');
    for (const bad of [undefined, {}, { tenantId: ORG_A }, { docId: DOC_A }, { user: { id: '1' } }]) {
      await expect(mod.loadCollabDocumentState(bad, DOC_A)).rejects.toThrow(/not authorized/i);
      await expect(mod.storeCollabDocumentState(bad, DOC_A, doc)).rejects.toThrow(/not authorized/i);
    }
  }, T);

  it('refuses when the connection context does not describe the document being persisted', async () => {
    const ctx = await mod.authorizeCollabConnection(await accessToken(ORG_A), DOC_A);
    const doc = new Y.Doc();
    doc.getText('body').insert(0, 'poison');
    await expect(mod.storeCollabDocumentState(ctx, DOC_B, doc)).rejects.toThrow(
      /does not match document/i,
    );
    await expect(mod.loadCollabDocumentState(ctx, DOC_B)).rejects.toThrow(/does not match document/i);
  }, T);

  it('returns null (not an error) for an authorized room that has never been edited', async () => {
    const ctx = await mod.authorizeCollabConnection(await accessToken(ORG_B), DOC_B);
    expect(await mod.loadCollabDocumentState(ctx, DOC_B)).toBeNull();
  }, T);

  it('refuses a snapshot whose checksum does not match its bytes (corruption is not a warning)', async () => {
    const ctx = await mod.authorizeCollabConnection(await accessToken(ORG_B), DOC_B);
    const doc = new Y.Doc();
    doc.getText('body').insert(0, 'intact');
    await mod.storeCollabDocumentState(ctx, DOC_B, doc);
    await jdb.pool.query(
      "UPDATE authoring_document_yjs_state SET checksum = repeat('0', 64) WHERE doc_id = $1",
      [DOC_B],
    );
    await expect(mod.loadCollabDocumentState(ctx, DOC_B)).rejects.toThrow(/checksum/i);
  }, T);
});

describe('C2C-COLLAB-001: the durable table is part of the atomic authoring subsystem', () => {
  it('is listed in the provisioning unit AND the readiness contract', async () => {
    const { AUTHORING_SUBSYSTEM_FILES, AUTHORING_SUBSYSTEM_TABLES } = await import(
      '../scripts/db/authoring-subsystem.mjs'
    );
    expect(AUTHORING_SUBSYSTEM_TABLES).toContain('authoring_document_yjs_state');
    expect(AUTHORING_SUBSYSTEM_FILES).toContain(
      'db/migrations/20260727_authoring_document_yjs_state.sql',
    );

    const src = await import('node:fs').then(fs =>
      fs.readFileSync(
        new URL('../server/db/ensureCoreTables.ts', import.meta.url).pathname,
        'utf8',
      ),
    );
    expect(src).toContain("'authoring_document_yjs_state'");
  }, T);

  it('enforces tenant-consistent parentage at the DB boundary', async () => {
    // A state row for ORG_A's document cannot be attached to ORG_B.
    await expect(
      jdb.pool.query(
        'INSERT INTO authoring_document_yjs_state (doc_id, tenant_id, state, checksum) VALUES ($1, $2, $3, $4)',
        [DOC_A, ORG_B, Buffer.from([0]), 'x'],
      ),
    ).rejects.toThrow();
  }, T);
});
