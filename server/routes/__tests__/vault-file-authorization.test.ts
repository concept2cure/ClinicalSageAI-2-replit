/**
 * POST /api/c2c/project-vault/:id/file — who may commit a filing decision.
 *
 * ── The gap ──────────────────────────────────────────────────────────────────
 * This router is mounted with `authenticateToken` and nothing else
 * (register-clinical-intel-routes.ts:187) and carried no role check of its own,
 * so ANY member of the organisation could commit a filing decision — including
 * a `viewer`, the one organisation role whose entire meaning is that it does
 * not write.
 *
 * That is not a cosmetic permission. Filing moves a regulatory document into a
 * dossier folder and writes a Part 11 audit row naming the caller as the person
 * who decided it. A viewer could therefore author an attributable governed
 * record — the audit trail would be accurate about who did it and wrong about
 * whether they were allowed to.
 *
 * ── What is deliberately NOT gated ───────────────────────────────────────────
 * The reads. A viewer enumerating and downloading their own organisation's
 * dossier is the viewer role working as intended. The gap was only the write,
 * and widening the fix to the reads would break the role rather than enforce it.
 *
 * ── Why this file exists at all ──────────────────────────────────────────────
 * Nothing anywhere covered this route. The gate was added against an untested
 * handler, which is how a gate ends up asserted in a comment and absent in the
 * code path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { query, connect } = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query, connect } }));

/** The governed write itself. Asserting it is never reached is how "refused"
 *  is distinguished from "attempted and failed". */
const { placeVaultDocument } = vi.hoisted(() => ({ placeVaultDocument: vi.fn() }));
vi.mock('../../services/vault/vault-placement.service.js', () => ({ placeVaultDocument }));

import createProjectVaultRoutes from '../c2c/project-vault';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';

function app(user: Record<string, unknown> | null) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) (req as unknown as { user: unknown }).user = user;
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

const post = (user: Record<string, unknown> | null) =>
  request(app(user))
    .post(`/api/c2c/project-vault/${PROGRAM}/file`)
    .send({ documentId: DOCUMENT, confirm: true });

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  placeVaultDocument.mockResolvedValue({ ok: true, filing: { folderId: 'module-3' } });
});

describe('a viewer cannot commit a filing decision', () => {
  it('refuses with 403 and never reaches the governed write', async () => {
    const res = await post({ organizationId: 7, id: 3, role: 'viewer' });
    expect(res.status).toBe(403);
    // The distinction that matters: refused BEFORE the write, not refused by it.
    expect(placeVaultDocument).not.toHaveBeenCalled();
  });

  it('refuses whatever case the role arrives in', async () => {
    const res = await post({ organizationId: 7, id: 3, role: 'VIEWER' });
    expect(res.status).toBe(403);
    expect(placeVaultDocument).not.toHaveBeenCalled();
  });

  it('refuses a caller with no role at all', async () => {
    // An absent role is not a writing role. Defaulting it to one is how a
    // permission gate becomes decorative.
    const res = await post({ organizationId: 7, id: 3 });
    expect(res.status).toBe(403);
    expect(placeVaultDocument).not.toHaveBeenCalled();
  });
});

describe('the writing roles still get through', () => {
  // Narrowing the set is the other way this goes wrong: a gate that refuses
  // everyone is not a gate, it is an outage.
  for (const role of ['member', 'manager', 'admin', 'owner', 'super_admin']) {
    it(`admits ${role}`, async () => {
      const res = await post({ organizationId: 7, id: 3, role });
      expect(res.status, `${role} was refused the write it is entitled to`).not.toBe(403);
      expect(placeVaultDocument).toHaveBeenCalled();
    });
  }
});

describe('organization context is still required', () => {
  it('refuses a writing role with no organization', async () => {
    const res = await post({ id: 3, role: 'member' });
    expect([400, 403]).toContain(res.status);
    expect(placeVaultDocument).not.toHaveBeenCalled();
  });
});

/**
 * POST /api/vault/ingest — the other governed write into the vault.
 *
 * Same gap, arguably worse consequence: ingest does not move an existing
 * record, it CREATES one — a vault.documents row plus its Part 11 audit row,
 * attributed to the caller. A viewer could therefore put bytes into the
 * regulatory store under their own name.
 *
 * The role was already being read on this path (it is stamped into the ingest
 * arguments) and simply never decided anything. Recording who did something
 * while not checking whether they may is the worst of both.
 */
describe('POST /api/vault/ingest — who may put bytes in the vault', () => {
  it('gates the role BEFORE the upload is parsed', async () => {
    /* Ordering is the assertion. Refusing after multer has run means a caller
       who may not write can still make the server buffer a file for them, which
       is a denial-of-service shape rather than a permission one. Proven by
       sending NO file at all: a viewer must get 403 (the gate ran first), not
       400 NO_FILE_RECEIVED (multer ran first and found nothing). */
    const mod = await import('../vault-ingest');
    const a = express();
    a.use(express.json());
    a.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { organizationId: 7, id: 3, role: 'viewer' };
      next();
    });
    a.use('/api/vault/ingest', mod.default());

    const res = await request(a).post('/api/vault/ingest').send({});
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).not.toBe('NO_FILE_RECEIVED');
  });

  it('lets a writing role past the gate', async () => {
    const mod = await import('../vault-ingest');
    const a = express();
    a.use(express.json());
    a.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { organizationId: 7, id: 3, role: 'member' };
      next();
    });
    a.use('/api/vault/ingest', mod.default());

    // No file attached, so the handler's own guard answers — which is exactly
    // what proves the role gate did NOT answer.
    const res = await request(a).post('/api/vault/ingest').send({});
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('NO_FILE_RECEIVED');
  });
});
