/**
 * POST /api/c2c/documents/:id/lock is the governed `lock` command, and passes
 * the gate every high-risk command passes: the signer re-verified (§11.200),
 * and not the document's author (separation of duties).
 *
 * ── The defect this pins (reproduced 2026-09-23, before the fix) ─────────────
 * The route said it locks "via /actions/lock", and wrote the same governed
 * ledger row through writeMutation. But the re-authentication and the
 * separation-of-duties check live in the /api/c2c/actions HTTP handler, not in
 * writeMutation, so this route ran neither: the session alone locked a
 * document, its author could lock it, and the `reauth` it accepted was never
 * read. Its handling of REAUTH_* errors could never be reached. No browser
 * caller; reachable by any session through the API.
 *
 * The ceremony and the ledger writer run for real behind the route, with the
 * account's state as the ceremony's wiring and the authorship check stubbed to
 * a chosen author.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  writeMutation: vi.fn(),
  compare: vi.fn(),
  failures: vi.fn(),
  account: { mfa: false },
  author: 99,
  statements: [] as string[],
}));

vi.mock('../../../db.js', () => ({
  pool: {
    query: async (sql: string) =>
      /FROM c2c_documents/.test(sql) ? { rows: [{ id: 'doc-1', status: 'draft' }] } : { rows: [] },
    connect: async () => ({
      query: async (sql: string) => {
        h.statements.push(sql);
        return { rows: [] };
      },
      release: () => {},
    }),
  },
}));
vi.mock('../actions.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../actions.js')>()),
  writeMutation: (...a: unknown[]) => h.writeMutation(...a),
}));
vi.mock('../../../services/part11/reverify-signer-deps.js', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: (plain: string, hash: string) => h.compare(plain, hash),
    isMfaEnabled: async () => h.account.mfa,
    verifyMfaToken: async (_id: number, token: string) => token === '135790',
    isAccountActive: async () => true,
    isAccountLocked: async () => false,
    recordFailedAttempt: (id: number) => h.failures(id),
    warn: () => {},
  }),
}));
vi.mock('../../../services/governance/separation-of-duties.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/governance/separation-of-duties.js')>();
  return {
    ...actual,
    // The document's recorded author is h.author; the check itself is the real rule's outcome.
    assertSignerIsNotAuthor: async (_target: string, _org: number, signerId: number) => {
      if (signerId === h.author) {
        throw new actual.SeparationOfDutiesError(
          'You authored this record, so you cannot lock it. Another person must.',
        );
      }
      return { checked: true };
    },
  };
});

const SIGNER = 7;

async function app() {
  const router = (await import('../documents.js')).default;
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: SIGNER, organizationId: 3 };
    next();
  });
  a.use('/api/c2c/documents', router);
  return a;
}
const lock = async (body: Record<string, unknown>) =>
  request(await app()).post('/api/c2c/documents/doc-1/lock').send({ reason: 'Final for filing.', ...body });

beforeEach(() => {
  h.writeMutation.mockReset();
  h.writeMutation.mockResolvedValue({ actionId: 'act_1', auditId: 'aud_1' });
  h.compare.mockReset();
  h.compare.mockImplementation(async (plain: string) => plain === 'right-password');
  h.failures.mockReset();
  h.failures.mockResolvedValue(undefined);
  h.account = { mfa: false };
  h.author = 99;
  h.statements = [];
});

const lockedIt = () => h.statements.some((s) => /UPDATE c2c_documents SET status = 'locked'/.test(s));

describe('POST /api/c2c/documents/:id/lock — the high-risk gate', () => {
  it('refuses a lock without credentials, and nothing is written', async () => {
    const res = await lock({});
    expect(res.status, 'a document was locked on the session alone').toBe(401);
    expect(res.body.error).toBe('REAUTH_PASSWORD_REQUIRED');
    expect(h.writeMutation).not.toHaveBeenCalled();
    expect(lockedIt()).toBe(false);
  });

  it('refuses a wrong password, counts it, and writes nothing', async () => {
    const res = await lock({ reauth: { password: 'wrong' } });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('REAUTH_PASSWORD_INVALID');
    expect(h.failures).toHaveBeenCalledWith(SIGNER);
    expect(h.writeMutation).not.toHaveBeenCalled();
  });

  it('requires the enrolled code', async () => {
    h.account.mfa = true;
    const res = await lock({ reauth: { password: 'right-password' } });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('REAUTH_TOTP_REQUIRED');
    expect(h.writeMutation).not.toHaveBeenCalled();
  });

  it("refuses the document's author (separation of duties), and nothing is written", async () => {
    h.author = SIGNER;
    const res = await lock({ reauth: { password: 'right-password' } });
    expect(res.status, 'the author locked their own document').toBe(403);
    expect(res.body.error).toBe('SEPARATION_OF_DUTIES');
    expect(h.writeMutation).not.toHaveBeenCalled();
    expect(lockedIt()).toBe(false);
  });

  it('locks, once, for a re-verified signer who is not the author', async () => {
    h.account.mfa = true;
    const res = await lock({ reauth: { password: 'right-password', totp: '135790' } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe('locked');
    expect(h.writeMutation).toHaveBeenCalledTimes(1);
    expect(lockedIt()).toBe(true);
  });
});
