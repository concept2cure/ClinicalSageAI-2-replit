/**
 * GET /api/c2c/project-vault/:id says whether this reader may place a legal hold (P-125 point 8, 2026-11-11).
 *
 * "Place legal hold" belongs on the record in the Vault, for everyone the server already allows. The hold routes
 * admit an owner, an administrator, a manager, an approver and a platform administrator
 * (server/routes/vault-legal-holds.ts). The only screen that placed one was Admin › Settings, a door for
 * administrators and owners, so a manager had the right and no place to use it.
 *
 * The record can offer the control to exactly the people the routes admit only if it asks the routes' own rule.
 * This pins that: the Vault read reports `mayPlaceLegalHold` from `mayManageLegalHolds`, the function the hold
 * routes refuse by. A second copy of the role list on either side would let the two drift.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/clinical-regulatory-evidence/record-source.js', async (importOriginal) => ({
  ...(await importOriginal<object>()), syncQualityProjectSources: vi.fn(async () => ({ created: 0, unchanged: 0, superseded: 0 })),
}));
const queryMock = vi.fn();
vi.mock('../../../db', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));
vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});
const platformAdmin = vi.hoisted(() => ({ is: false }));
vi.mock('../../../middleware/requirePlatformAdmin', async (original) => ({
  ...(await original<object>()), isPlatformAdmin: () => platformAdmin.is,
}));

import createProjectVaultRoutes from '../project-vault';
import { mayManageLegalHolds } from '../../vault-legal-holds';
import { clearSeats, seatMember, seatProgram } from './support/current-member';

const PROJECT = '11111111-2222-3333-4444-555555555555';
const USER = 41;

function app(user: Record<string, unknown> | undefined) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.organizationId = 7;
    req.userId = USER;
    req.user = user;
    req.dbClient = { query: (...args: unknown[]) => queryMock(...args) };
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

beforeEach(() => {
  platformAdmin.is = false;
  clearSeats();
  seatMember(7, USER, 'member');
  seatProgram(7, PROJECT);
  queryMock.mockReset();
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: PROJECT, name: 'BX-204', product_type: 'drug' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
  queryMock.mockImplementation(async (sql: string) => (/COUNT\(\*\)::int AS total/.test(sql) ? { rows: [{ total: 0, unfiled: 0 }] } : { rows: [] }));
});

const read = async (user: Record<string, unknown>) => {
  const res = await request(app(user)).get(`/api/c2c/project-vault/${PROJECT}`);
  expect(res.status).toBe(200);
  return res.body.data.mayPlaceLegalHold as unknown;
};

describe('the Vault read reports who may place a legal hold, by the hold routes’ own rule', () => {
  it.each(['owner', 'admin', 'manager', 'approver'])('a %s may', async (role) => {
    expect(await read({ id: USER, role })).toBe(true);
    expect(mayManageLegalHolds({ user: { id: USER, role } } as never)).toBe(true);
  });

  it.each(['member', 'viewer', 'editor', ''])('a %s may not', async (role) => {
    expect(await read({ id: USER, role })).toBe(false);
    expect(mayManageLegalHolds({ user: { id: USER, role } } as never)).toBe(false);
  });

  it('reads a role the session lists among its roles, in any case', async () => {
    expect(await read({ id: USER, role: 'member', roles: ['Manager'] })).toBe(true);
  });

  it('a platform administrator may, whatever the organisation role', async () => {
    platformAdmin.is = true;
    expect(await read({ id: USER, role: 'member' })).toBe(true);
  });

  it('a request with no user may not', () => {
    expect(mayManageLegalHolds({} as never)).toBe(false);
  });
});
