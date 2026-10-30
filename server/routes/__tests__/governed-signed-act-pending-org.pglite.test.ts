/**
 * Only the custody act signs from an organization pending deletion (P-58, D6,
 * 2026-10-29; services/part11/custody-signature.ts).
 *
 * The platform's signing authority admits a signer while their organization is
 * active (resolveSignerOrgRole). The custody signature of a departing tenant's
 * export is the one exception: the final export is taken once the tenant is
 * frozen in pending_deletion, and custody belongs on it. An act asks for it
 * with SignedAct.signerOrganizationStatuses, and the ceremony honours that only
 * for the custody act (its target, domain and meanings together). Any other
 * act that asks is held to active organizations, so its signer is refused 403
 * ESIGNATURE_NO_AUTHORITY before the password, exactly as before.
 *
 * Real: signGovernedAct, checkSigningAuthority and resolveSignerOrgRole's SQL,
 * on an in-process PGlite. Stubbed at their module boundaries: the request
 * client (the PGlite connection), the password check, the tenant context and
 * the ledger. Each act's domain write throws a coded STOP, so a 418 means the
 * signer got past the signing authority and the credential, and nothing was
 * signed either way.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  pg: null as unknown as { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; affectedRows?: number }> },
  runs: 0,
  org: 1,
}));
const conn = {
  query: async (sql: string, params: unknown[] = []) => {
    const r = await h.pg.query(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
  release: () => undefined,
};

vi.mock('../../db/requestDb', async (orig) => ({ ...(await orig<Record<string, unknown>>()), requestPgClient: () => conn }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: async () => undefined }));
vi.mock('../../services/part11/reverify-signer', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  reverifySigner: async () => ({ ok: true, authenticationMethod: 'password', secondFactorVerified: false }),
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: () => ({}) }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: async () => { throw new Error('nothing is recorded in this suite'); } }));

import { signGovernedAct, type SignedAct } from '../governed-signed-act';
import { DECISION_ACT_MEANINGS } from '../../services/part11/signature-meanings';
import { CUSTODY_ACT_MEANINGS, CUSTODY_DOMAIN, CUSTODY_TARGET_PREFIX } from '../../services/part11/custody-signature';

const PENDING = 1;
const ACTIVE = 2;
const ADMIN = 10;
const DIGEST = `sha256:${'a'.repeat(64)}`;

const stop = async () => {
  h.runs += 1;
  throw Object.assign(new Error('Stopped after the authority and the credential.'), { code: 'STOP' });
};
const act = (over: Partial<SignedAct>): SignedAct => ({
  domain: 'qms', target: 'qms-document:1', meanings: DECISION_ACT_MEANINGS, codeStatus: { STOP: 418 }, run: stop, ...over,
});
const custody = (over: Partial<SignedAct> = {}): SignedAct => act({
  domain: CUSTODY_DOMAIN, target: `${CUSTODY_TARGET_PREFIX}${DIGEST}`, meanings: CUSTODY_ACT_MEANINGS,
  signerOrganizationStatuses: ['pending_deletion'], ...over,
});

function sign(signed: SignedAct, org: number, meaning = 'responsibility') {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: ADMIN, organizationId: org, role: 'admin' };
    next();
  });
  a.post('/sign', (req, res) => signGovernedAct(req, res, signed));
  return request(a).post('/sign').send({ reason: 'Recording the act for this suite.', meaning, password: 'x' });
}

beforeAll(async () => {
  const pg = new PGlite();
  h.pg = pg as unknown as typeof h.pg;
  await pg.exec(`
    CREATE TABLE organizations (id int PRIMARY KEY, status text NOT NULL);
    CREATE TABLE users (id int PRIMARY KEY, status text NOT NULL);
    CREATE TABLE organization_users (organization_id int NOT NULL, user_id int NOT NULL, role text NOT NULL);
    INSERT INTO organizations VALUES (${PENDING}, 'pending_deletion'), (${ACTIVE}, 'active');
    INSERT INTO users VALUES (${ADMIN}, 'active');
    INSERT INTO organization_users VALUES (${PENDING}, ${ADMIN}, 'admin'), (${ACTIVE}, ${ADMIN}, 'admin');`);
});
afterAll(async () => {
  await (h.pg as unknown as PGlite).close();
});

describe('an organization pending deletion signs only the custody act', () => {
  it.each([
    ['an approval that asks for pending_deletion', act({ signerOrganizationStatuses: ['pending_deletion'] }), 'approval'],
    ['an approval that asks for nothing', act({}), 'approval'],
    ['a custody target under another domain', custody({ domain: 'qms' }), 'responsibility'],
    ['a custody target with an approval meaning beside it', custody({ meanings: DECISION_ACT_MEANINGS }), 'responsibility'],
    ['the custody meaning and domain on another target', custody({ target: 'qms-document:1' }), 'responsibility'],
  ])('%s: 403 before the password, nothing run', async (_what, signed, meaning) => {
    const before = h.runs;
    const res = await sign(signed, PENDING, meaning);
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error.code).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(h.runs).toBe(before);
  });

  it('the custody act: its signer passes the authority and the credential', async () => {
    const res = await sign(custody(), PENDING);
    expect(res.status, JSON.stringify(res.body)).toBe(418);
  });

  it('the custody act from an active organization: refused, custody is signed only by a tenant that is leaving', async () => {
    const res = await sign(custody(), ACTIVE);
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error.code).toBe('ESIGNATURE_NO_AUTHORITY');
  });

  it('an approval from an active organization still signs (the control)', async () => {
    const res = await sign(act({}), ACTIVE, 'approval');
    expect(res.status, JSON.stringify(res.body)).toBe(418);
  });
});
