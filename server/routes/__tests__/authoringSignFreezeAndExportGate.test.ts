/**
 * Two Part 11 record-integrity gates on the authoring router.
 *
 * F2 — POST /docs/:docId/sign AUTO-FREEZES on final approval. When the last
 * workflow step clears, the handler flips the document to APPROVED. It used to
 * stop there, leaving the document APPROVED with NO frozen_documents row: the
 * approved content lived only in the editable authoring_sections table and the
 * approval signature's covered_* pointed at "no snapshot". These tests pin the
 * fix: the /sign approval now writes the same full immutable snapshot the e-sign
 * APPROVER path writes, on the SAME transaction client, so it lands with the
 * status flip or rolls back with it.
 *
 * F3 — POST /docs/:docId/export IS A FILING ARTIFACT, NOT A PREVIEW. It rendered
 * sections live with no status gate, so a DRAFT document exported byte-for-byte
 * like an approved one with the §11.50 signature manifest appended — unapproved
 * content presented as a certified record. The export now refuses (409) unless
 * the document is sealed (FROZEN / APPROVED), and records a hash of the
 * DELIVERED artifact bytes on the export-history row, not only the source hash.
 *
 * Mirrors the auth + db mocking of authoring-atomic-mutations.test.ts: the
 * router carries its own §11 JWT gate, so we sign a real HS256 token rather than
 * stubbing auth.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const clientQuery = vi.fn();
  const clientRelease = vi.fn();
  const client = { query: clientQuery, release: clientRelease };
  return {
    poolQuery: vi.fn(),
    clientQuery,
    clientRelease,
    connect: vi.fn(async () => client),
    auditLogAction: vi.fn(),
    chainedAudit: vi.fn(async (..._a: unknown[]) => {}),
  };
});

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => h.poolQuery(...a), connect: () => h.connect() },
  getPool: () => ({ query: (...a: unknown[]) => h.poolQuery(...a), connect: () => h.connect() }),
  query: (...a: unknown[]) => h.poolQuery(...a),
  db: {},
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: (...a: unknown[]) => h.auditLogAction(...a) },
  writeChainedAuditRow: (...a: unknown[]) => h.chainedAudit(...a),
}));
// §11.10(g): the signing routes resolve the signer's org role and refuse without
// signing authority. That control has its own suite; here it must simply PASS.
vi.mock('../../services/part11/resolve-signer-role.js', () => ({
  resolveSignerOrgRole: vi.fn(async () => 'approver'),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-sign-freeze-export';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

const PIN = '246810';
let PIN_HASH = '';

async function bearer(roles?: string[]): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({
    sub: 'u1', // non-numeric subject → membership re-check is skipped
    organizationId: 7,
    email: 'author@test.co',
    ...(roles ? { roles } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

/** Ordered list of the SQL verbs the transaction client saw. */
function clientSql(): string[] {
  return h.clientQuery.mock.calls.map((c) => String(c[0]).trim());
}
const sawBegin = () => clientSql().findIndex((s) => /^BEGIN/i.test(s));
const sawCommit = () => clientSql().findIndex((s) => /^COMMIT/i.test(s));
const writeIndex = (re: RegExp) => clientSql().findIndex((s) => re.test(s));
/** Every SQL string the pool (not the transaction client) saw. */
const poolSql = () => h.poolQuery.mock.calls.map((c) => String(c[0]));

beforeEach(async () => {
  if (!PIN_HASH) PIN_HASH = await bcrypt.hash(PIN, 4);
  vi.clearAllMocks();
  h.auditLogAction.mockResolvedValue(undefined);
  h.connect.mockImplementation(async () => ({ query: h.clientQuery, release: h.clientRelease }));

  h.clientQuery.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(s)) return {};
    if (/COUNT\(\*\)[\s\S]*FROM authoring_workflow_steps/i.test(s)) {
      /* A workflow that EXISTS and is complete — which is the scenario this
         test is named for. `pending: '0'` alone used to be enough, because the
         handler counted only pending steps and could not tell "all approved"
         from "no approval workflow was ever created". It now counts the total
         too, and refuses to approve a document that never had a workflow, so
         the fixture has to say which of the two it is modelling. */
      return { rowCount: 1, rows: [{ pending: '0', total: '1' }] };
    }
    // The auto-freeze SELECT * and section read both return a row so the snapshot
    // has content; every other client write returns a benign rowCount.
    return { rowCount: 1, rows: [{ id: 'D1', doc_id: 'D1', code: '2.6.6', content: 'body' }] };
  });
});

describe('F2 — POST /docs/:id/sign auto-freezes when the final step approves the document', () => {
  beforeEach(() => {
    h.poolQuery.mockImplementation(async (sql: string) => {
      if (/FROM user_pins/i.test(sql)) {
        return { rowCount: 1, rows: [{ pin_hash: PIN_HASH, failed_attempts: 0, locked_until: null }] };
      }
      if (/FROM frozen_documents/i.test(sql)) {
        // No PRE-EXISTING snapshot — the whole point of the finding is that the
        // approval must CREATE one.
        return { rowCount: 0, rows: [] };
      }
      if (/SELECT 1 FROM authoring_documents/i.test(sql)) {
        return { rowCount: 1, rows: [{ '?column?': 1 }] };
      }
      if (/SELECT code, content FROM authoring_sections/i.test(sql)) {
        return { rowCount: 1, rows: [{ code: '2.6.6', content: 'body' }] };
      }
      return { rowCount: 0, rows: [] };
    });
  });

  it('writes a frozen_documents row on the transaction client, between BEGIN and COMMIT', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/sign')
      .set('Authorization', await bearer(['REVIEWER']))
      .send({ pin: PIN, meaning: 'REVIEWER', reason: 'reviewed and approved' });

    expect(res.status).toBe(200);

    const begin = sawBegin();
    const commit = sawCommit();
    expect(begin).toBe(0);
    expect(commit).toBeGreaterThan(begin);

    // The document is flipped to APPROVED …
    const approvedIdx = writeIndex(/UPDATE authoring_documents\s+SET status = 'APPROVED'/i);
    // … and — the fix — an immutable snapshot is inserted in the same transaction.
    const freezeIdx = writeIndex(/INSERT INTO frozen_documents/i);
    expect(approvedIdx).toBeGreaterThan(begin);
    expect(freezeIdx).toBeGreaterThan(approvedIdx); // freeze accompanies the approval
    expect(freezeIdx).toBeLessThan(commit); // and commits with it

    // The freeze is ON CONFLICT DO NOTHING, mirroring the proven e-sign path.
    const freezeSql = clientSql().find((s) => /INSERT INTO frozen_documents/i.test(s)) ?? '';
    expect(freezeSql).toMatch(/ON CONFLICT \(document_id, version, tenant_id\) DO NOTHING/i);

    // It must NOT have leaked onto the pool — the snapshot has to roll back with
    // the approval if anything after it fails.
    expect(poolSql().some((s) => /INSERT INTO frozen_documents/i.test(s))).toBe(false);
    expect(h.clientRelease).toHaveBeenCalledTimes(1);
  });
});

describe('F3 — POST /docs/:id/export gates on the record being sealed', () => {
  function mockDoc(status: string, extra: Record<string, unknown> = {}) {
    h.poolQuery.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (/FROM authoring_documents WHERE id = \$1/i.test(s)) {
        return {
          rowCount: 1,
          rows: [{ id: 'D1', title: 'Tox Summary', module: 'M2', status, locked_at: null, created_at: new Date(), ...extra }],
        };
      }
      if (/SELECT code, content FROM authoring_sections/i.test(s)) {
        return { rowCount: 1, rows: [{ code: '2.6.6', content: 'No adverse findings.' }] };
      }
      if (/FROM authoring_sections/i.test(s)) {
        return { rowCount: 1, rows: [{ id: 'S1', code: '2.6.6', title: 'Tox', content: 'No adverse findings.' }] };
      }
      if (/FROM authoring_signatures/i.test(s)) {
        return {
          rowCount: 1,
          rows: [{
            signer_email: 'r.okafor@test.co', signer_name: 'Rita Okafor', meaning: 'APPROVER',
            reason: 'Approved for filing.', method: 'PIN', content_hash: 'abc',
            covered_freeze_version: 'v3', pin_verified: true, signed_at: new Date(),
          }],
        };
      }
      if (/INSERT INTO authoring_export_history/i.test(s)) {
        return { rowCount: 1, rows: [{ id: 'X1', exported_at: new Date() }] };
      }
      return { rowCount: 1, rows: [{}] };
    });
  }

  it('REFUSES with 409 when the document is a DRAFT — no unapproved artifact, no manifest', async () => {
    mockDoc('draft');
    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/export')
      .set('Authorization', await bearer())
      .send({ format: 'xml' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not approved for export/i);
    // The gate short-circuits before any export record is written.
    expect(poolSql().some((s) => /INSERT INTO authoring_export_history/i.test(s))).toBe(false);
  });

  it('ALLOWS an APPROVED document and records the DELIVERED artifact-bytes hash', async () => {
    mockDoc('APPROVED');
    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/export')
      .set('Authorization', await bearer())
      .send({ format: 'xml' });

    expect(res.status).toBe(200);

    // The export-history INSERT carried metadata, and that metadata now includes
    // a sha256 of the real file bytes — not only the source doc hash.
    const insertCall = h.poolQuery.mock.calls.find((c) => /INSERT INTO authoring_export_history/i.test(String(c[0])));
    expect(insertCall).toBeTruthy();
    const metadataParam = String((insertCall as unknown[])[1] ? (insertCall![1] as unknown[])[6] : '');
    expect(metadataParam).toContain('artifactSha256');
    expect(metadataParam).toMatch(/"artifactSha256":"[0-9a-f]{64}"/);
  });
});
