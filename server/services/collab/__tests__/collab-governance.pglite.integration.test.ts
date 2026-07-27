/**
 * Governed collaboration — END-TO-END against in-process PGlite.
 *
 * The collaboration server authenticated a signed JWT and then let the
 * connection open whatever `documentName` it asked for, with no token-class
 * check, no live membership check, and no persistence. These tests apply the
 * REAL migration DDL — the authoring document-loop tables and the new
 * collaboration state table — and prove against real Postgres that:
 *
 *   - a refresh / MFA-challenge / MFA-partial token cannot open a session, the
 *     same class check the HTTP path applies;
 *   - a user whose organization membership row is gone is refused, even though
 *     the token they hold is still perfectly valid and unexpired — the case a
 *     long-lived socket makes worse than a request;
 *   - one tenant cannot open another tenant's document, by id, and cannot open
 *     a section of it either;
 *   - a documentName that does not parse never reaches Postgres;
 *   - CRDT state survives a restart: what one Y.Doc wrote, a fresh Y.Doc loads,
 *     including edits made concurrently on two docs and merged;
 *   - the store keys on (tenant, documentName), so two tenants holding the same
 *     documentName string never read each other's bytes;
 *   - an unprovisioned store is reported as missing rather than as an empty
 *     document — a collaboration server that starts every document blank
 *     because its table is absent looks identical to a working one until the
 *     first reconnect.
 *
 * One PGlite instance for the file: several instances per file is what made the
 * pglite suites flake under combined load.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import jwt from 'jsonwebtoken';
import * as Y from 'yjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as unknown[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) } }));

// The membership re-check reaches for drizzle via '../db'; the collaboration
// tests drive it explicitly through this mock so a revoked membership is a
// deliberate state rather than an artefact of an uninitialised handle.
let membershipRows: Array<{ userId: number; organizationId: number }> = [];
vi.mock('../../../middleware/orgMembership', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../middleware/orgMembership')>();
  return {
    ...actual,
    checkOrgMembership: async (userId: number, organizationId: number) =>
      membershipRows.some(r => r.userId === userId && r.organizationId === organizationId)
        ? 'member'
        : 'revoked',
  };
});

import { authenticateCollabConnection } from '../../hocuspocus-server';
import { parseDocumentName } from '../collab-authorization';
import { loadCollabState, storeCollabState } from '../collab-state.store';

const JWT_SECRET = 'collab-governance-test-secret';

const ORG_A = 4101;
const ORG_B = 4202;
const USER_A = 7001;
const USER_B = 7002;

const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SECTION_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SECTION_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

/** Mint an access token the way the login route does. */
function accessToken(over: Record<string, unknown> = {}): string {
  return jwt.sign(
    { userId: USER_A, organizationId: ORG_A, email: 'a@example.test', name: 'Author A', ...over },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

beforeAll(async () => {
  // verifyJwtWithRotation resolves JWT_SECRET_<ENV> before the bare
  // JWT_SECRET, and tests/setup.ts sets JWT_SECRET_DEV — so setting only
  // JWT_SECRET here would leave every token in this file signed with a key the
  // verifier never tries.
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.JWT_SECRET_DEV = JWT_SECRET;
  delete process.env.JWT_SECRET_PREVIOUS;
  delete process.env.JWT_SECRET_PREVIOUS_DEV;

  pglite = new PGlite();
  await pglite.exec(migration('db/migrations/20260725_authoring_document_loop_tables.sql'));
  await pglite.exec(migration('db/migrations/20260727_collab_document_state.sql'));

  // Two tenants, one document each, one section each.
  for (const [doc, section, tenant] of [
    [DOC_A, SECTION_A, ORG_A],
    [DOC_B, SECTION_B, ORG_B],
  ] as const) {
    await pool.query(
      `INSERT INTO authoring_documents (id, title, status, created_by, tenant_id)
       VALUES ($1, 'Doc', 'draft', 'seed', $2)`,
      [doc, tenant]
    );
    await pool.query(
      `INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id)
       VALUES ($1, $2, '2.5', 'Overview', 'text', $3)`,
      [section, doc, tenant]
    );
  }
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(() => {
  membershipRows = [
    { userId: USER_A, organizationId: ORG_A },
    { userId: USER_B, organizationId: ORG_B },
  ];
});

describe('documentName parsing', () => {
  it('accepts a whole-document name and a section name', () => {
    expect(parseDocumentName(`authoring:${DOC_A}`)).toEqual({
      kind: 'authoring-document',
      documentId: DOC_A,
      sectionId: null,
    });
    expect(parseDocumentName(`authoring:${DOC_A}:${SECTION_A}`)).toEqual({
      kind: 'authoring-document',
      documentId: DOC_A,
      sectionId: SECTION_A,
    });
  });

  it('refuses an unknown resource kind rather than defaulting to permitted', () => {
    // A future surface must add its rule to be collaborative at all. Silently
    // allowing an unrecognised prefix is how "anyone may open it" gets
    // inherited by accident.
    expect(parseDocumentName(`vault:${DOC_A}`)).toBeNull();
    expect(parseDocumentName(DOC_A)).toBeNull();
    expect(parseDocumentName('')).toBeNull();
  });

  it('refuses a malformed id before it can reach Postgres', () => {
    expect(parseDocumentName('authoring:not-a-uuid')).toBeNull();
    expect(parseDocumentName(`authoring:${DOC_A}:not-a-uuid`)).toBeNull();
    expect(parseDocumentName(`authoring:${DOC_A}:${SECTION_A}:extra`)).toBeNull();
  });

  it("does not treat a SQL-injection attempt as a document id", async () => {
    const hostile = "authoring:' OR '1'='1";
    expect(parseDocumentName(hostile)).toBeNull();
    await expect(
      authenticateCollabConnection({ token: accessToken(), documentName: hostile })
    ).rejects.toMatchObject({ reason: 'unknown-document' });
  });
});

describe('authenticating a collaboration connection', () => {
  it('admits a member of the document owning tenant', async () => {
    const ctx = await authenticateCollabConnection({
      token: accessToken(),
      documentName: `authoring:${DOC_A}`,
    });
    expect(ctx.tenantId).toBe(ORG_A);
    expect(ctx.user.id).toBe(String(USER_A));
    expect(ctx.resource).toEqual({
      kind: 'authoring-document',
      documentId: DOC_A,
      sectionId: null,
    });
  });

  it('admits a member for a section of their own document', async () => {
    const ctx = await authenticateCollabConnection({
      token: accessToken(),
      documentName: `authoring:${DOC_A}:${SECTION_A}`,
    });
    expect(ctx.resource.sectionId).toBe(SECTION_A);
  });

  it('refuses a missing token', async () => {
    await expect(
      authenticateCollabConnection({ token: '', documentName: `authoring:${DOC_A}` })
    ).rejects.toMatchObject({ reason: 'authentication-required' });
  });

  it('refuses a token signed with the wrong secret — no fallback identity', async () => {
    // The previous implementation fell through to a "Dev User" identity here
    // whenever NODE_ENV !== 'production', which includes staging.
    const forged = jwt.sign({ userId: USER_A, organizationId: ORG_A }, 'not-the-secret', {
      algorithm: 'HS256',
    });
    await expect(
      authenticateCollabConnection({ token: forged, documentName: `authoring:${DOC_A}` })
    ).rejects.toMatchObject({ reason: 'invalid-token' });
  });

  it('refuses an expired token', async () => {
    const expired = jwt.sign({ userId: USER_A, organizationId: ORG_A }, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '-1h',
    });
    await expect(
      authenticateCollabConnection({ token: expired, documentName: `authoring:${DOC_A}` })
    ).rejects.toMatchObject({ reason: 'invalid-token' });
  });

  it.each([
    ['refresh', { type: 'refresh' }],
    ['mfa_challenge', { type: 'mfa_challenge' }],
    ['mfa_partial', { type: 'mfa_partial' }],
    ['mfaPending flag', { mfaPending: true }],
    ['pending_mfa role', { role: 'pending_mfa' }],
  ])('refuses a non-access token (%s)', async (_label, claims) => {
    // These are signed with the SAME secret as an access token, so signature
    // verification alone admits them. That is the MFA bypass the HTTP path
    // guards against and this path did not.
    await expect(
      authenticateCollabConnection({
        token: accessToken(claims),
        documentName: `authoring:${DOC_A}`,
      })
    ).rejects.toMatchObject({ reason: 'invalid-token-class' });
  });

  it('refuses a valid token whose organization membership has been revoked', async () => {
    // The token is untouched and unexpired. Only the membership row is gone —
    // the case a long-lived socket makes worse than a request, because the old
    // behaviour kept write access for as long as the socket stayed open.
    membershipRows = membershipRows.filter(r => r.userId !== USER_A);
    await expect(
      authenticateCollabConnection({ token: accessToken(), documentName: `authoring:${DOC_A}` })
    ).rejects.toMatchObject({ reason: 'membership-revoked' });
  });

  it('refuses a token with no tenant claim', async () => {
    const noOrg = jwt.sign({ userId: USER_A }, JWT_SECRET, { algorithm: 'HS256' });
    await expect(
      authenticateCollabConnection({ token: noOrg, documentName: `authoring:${DOC_A}` })
    ).rejects.toMatchObject({ reason: 'no-tenant' });
  });

  it('refuses a token with no usable subject claim', async () => {
    const noSub = jwt.sign({ organizationId: ORG_A }, JWT_SECRET, { algorithm: 'HS256' });
    await expect(
      authenticateCollabConnection({ token: noSub, documentName: `authoring:${DOC_A}` })
    ).rejects.toMatchObject({ reason: 'invalid-token' });
  });

  it("refuses to open another tenant's document", async () => {
    // The headline: before this change, knowing the id was enough.
    await expect(
      authenticateCollabConnection({ token: accessToken(), documentName: `authoring:${DOC_B}` })
    ).rejects.toMatchObject({ reason: 'forbidden-document' });
  });

  it("refuses to open a section of another tenant's document", async () => {
    await expect(
      authenticateCollabConnection({
        token: accessToken(),
        documentName: `authoring:${DOC_B}:${SECTION_B}`,
      })
    ).rejects.toMatchObject({ reason: 'forbidden-document' });
  });

  it("refuses another tenant's section even when paired with an owned document id", async () => {
    // Proves the section check is not merely "does this section exist".
    await expect(
      authenticateCollabConnection({
        token: accessToken(),
        documentName: `authoring:${DOC_A}:${SECTION_B}`,
      })
    ).rejects.toMatchObject({ reason: 'forbidden-document' });
  });

  it('refuses a document that does not exist at all', async () => {
    await expect(
      authenticateCollabConnection({
        token: accessToken(),
        documentName: 'authoring:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      })
    ).rejects.toMatchObject({ reason: 'forbidden-document' });
  });

  it('is symmetric — the other tenant is refused in the other direction', async () => {
    const tokenB = jwt.sign({ userId: USER_B, organizationId: ORG_B }, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });
    await expect(
      authenticateCollabConnection({ token: tokenB, documentName: `authoring:${DOC_A}` })
    ).rejects.toMatchObject({ reason: 'forbidden-document' });
    const ok = await authenticateCollabConnection({
      token: tokenB,
      documentName: `authoring:${DOC_B}`,
    });
    expect(ok.tenantId).toBe(ORG_B);
  });
});

describe('durable CRDT state', () => {
  const NAME = `authoring:${DOC_A}`;

  it('reports an unwritten document as absent, not as an error', async () => {
    const result = await loadCollabState(ORG_A, 'authoring:99999999-9999-4999-8999-999999999999');
    expect(result.status).toBe('absent');
  });

  it('survives a restart: a fresh Y.Doc reloads what the first one wrote', async () => {
    // This is the whole point of the change. Previously onStoreDocument logged
    // and returned, so this round trip could not happen at all.
    const original = new Y.Doc();
    original.getText('body').insert(0, 'Module 2.5 clinical overview');

    await storeCollabState({
      tenantId: ORG_A,
      documentName: NAME,
      state: Buffer.from(Y.encodeStateAsUpdate(original)),
      stateVector: Buffer.from(Y.encodeStateVector(original)),
      authoringDocId: DOC_A,
      updatedBy: String(USER_A),
    });

    const loaded = await loadCollabState(ORG_A, NAME);
    expect(loaded.status).toBe('found');
    if (loaded.status !== 'found') return;

    const restored = new Y.Doc();
    Y.applyUpdate(restored, new Uint8Array(loaded.document.state));
    expect(restored.getText('body').toString()).toBe('Module 2.5 clinical overview');
    expect(loaded.document.updatedBy).toBe(String(USER_A));
    expect(loaded.document.sizeBytes).toBeGreaterThan(0);
  });

  it('preserves concurrent edits rather than last-write-wins', async () => {
    // Stored state is the CRDT update, not a rendered snapshot, so two clients
    // that edited while apart both survive the reload.
    const left = new Y.Doc();
    const right = new Y.Doc();
    left.getText('body').insert(0, 'left');
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
    left.getText('body').insert(4, '-A');
    right.getText('body').insert(4, '-B');
    Y.applyUpdate(left, Y.encodeStateAsUpdate(right));

    await storeCollabState({
      tenantId: ORG_A,
      documentName: `${NAME}:merged`,
      state: Buffer.from(Y.encodeStateAsUpdate(left)),
      stateVector: Buffer.from(Y.encodeStateVector(left)),
      authoringDocId: DOC_A,
      updatedBy: String(USER_A),
    });

    const loaded = await loadCollabState(ORG_A, `${NAME}:merged`);
    expect(loaded.status).toBe('found');
    if (loaded.status !== 'found') return;
    const restored = new Y.Doc();
    Y.applyUpdate(restored, new Uint8Array(loaded.document.state));
    const text = restored.getText('body').toString();
    expect(text).toContain('-A');
    expect(text).toContain('-B');
  });

  it('replaces rather than appends on a second store', async () => {
    const doc = new Y.Doc();
    doc.getText('body').insert(0, 'first');
    const write = async () =>
      storeCollabState({
        tenantId: ORG_A,
        documentName: `${NAME}:replace`,
        state: Buffer.from(Y.encodeStateAsUpdate(doc)),
        stateVector: Buffer.from(Y.encodeStateVector(doc)),
        authoringDocId: DOC_A,
        updatedBy: String(USER_A),
      });
    await write();
    doc.getText('body').insert(5, ' second');
    await write();

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM collab_document_state
        WHERE tenant_id = $1 AND document_name = $2`,
      [ORG_A, `${NAME}:replace`]
    );
    expect((rows[0] as { n: number }).n).toBe(1);

    const loaded = await loadCollabState(ORG_A, `${NAME}:replace`);
    if (loaded.status !== 'found') throw new Error('expected the row to be present');
    const restored = new Y.Doc();
    Y.applyUpdate(restored, new Uint8Array(loaded.document.state));
    expect(restored.getText('body').toString()).toBe('first second');
  });

  it('does not serve one tenant the bytes another tenant stored under the same name', async () => {
    // (tenant_id, document_name) is the primary key, so the same string is two
    // different rows. Defense in depth behind the authorization check.
    const shared = 'authoring:11111111-1111-4111-8111-111111111111';
    for (const [tenant, text] of [
      [ORG_A, 'tenant A content'],
      [ORG_B, 'tenant B content'],
    ] as const) {
      const doc = new Y.Doc();
      doc.getText('body').insert(0, text);
      await storeCollabState({
        tenantId: tenant,
        documentName: shared,
        state: Buffer.from(Y.encodeStateAsUpdate(doc)),
        stateVector: Buffer.from(Y.encodeStateVector(doc)),
        authoringDocId: null,
        updatedBy: 'seed',
      });
    }

    for (const [tenant, expected] of [
      [ORG_A, 'tenant A content'],
      [ORG_B, 'tenant B content'],
    ] as const) {
      const loaded = await loadCollabState(tenant, shared);
      if (loaded.status !== 'found') throw new Error('expected both rows to exist');
      const restored = new Y.Doc();
      Y.applyUpdate(restored, new Uint8Array(loaded.document.state));
      expect(restored.getText('body').toString()).toBe(expected);
    }
  });

  it('cascades the CRDT state away with the document it belongs to', async () => {
    // Collaborative edit history outliving its deleted document is a retention
    // defect in a regulated system, not a harmless orphan.
    const doomedDoc = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await pool.query(
      `INSERT INTO authoring_documents (id, title, status, created_by, tenant_id)
       VALUES ($1, 'Doomed', 'draft', 'seed', $2)`,
      [doomedDoc, ORG_A]
    );
    const doc = new Y.Doc();
    doc.getText('body').insert(0, 'transient');
    await storeCollabState({
      tenantId: ORG_A,
      documentName: `authoring:${doomedDoc}`,
      state: Buffer.from(Y.encodeStateAsUpdate(doc)),
      stateVector: null,
      authoringDocId: doomedDoc,
      updatedBy: 'seed',
    });
    expect((await loadCollabState(ORG_A, `authoring:${doomedDoc}`)).status).toBe('found');

    await pool.query(`DELETE FROM authoring_documents WHERE id = $1`, [doomedDoc]);
    expect((await loadCollabState(ORG_A, `authoring:${doomedDoc}`)).status).toBe('absent');
  });
});

describe('an unprovisioned store', () => {
  it('reports missing rather than looking like an empty document', async () => {
    // The dangerous failure: a server whose table was never created would
    // otherwise start every document blank and then persist that blank over
    // whatever the real content was.
    const bare = new PGlite();
    try {
      const barePool = {
        query: async (sql: string, params?: unknown[]) => {
          const r = await bare.query(sql, params as unknown[]);
          return { rows: r.rows as unknown[], rowCount: (r.rows as unknown[]).length };
        },
      };
      const previous = pglite;
      pglite = bare as unknown as PGlite;
      void barePool;
      try {
        expect((await loadCollabState(ORG_A, 'authoring:whatever')).status).toBe('missing');
        const stored = await storeCollabState({
          tenantId: ORG_A,
          documentName: 'authoring:whatever',
          state: Buffer.from([1, 2, 3]),
          stateVector: null,
          authoringDocId: null,
          updatedBy: null,
        });
        expect(stored.status).toBe('missing');
      } finally {
        pglite = previous;
      }
    } finally {
      await bare.close();
    }
  });
});
