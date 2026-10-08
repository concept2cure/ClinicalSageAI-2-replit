/**
 * QA 2026-10-08, walk 2, j3: the Vault reads who may sign from the server.
 * `canSign` is the platform's one check (checkSigningAuthority) — a 403 is
 * "no", a lookup that failed is unknown (null), never "no"; `signers` are the
 * members whose role the one signing policy admits.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const check = vi.hoisted(() => vi.fn());
vi.mock('../../part11/signing-authority-gate', () => ({ checkSigningAuthority: check }));

import { readOrgSigners, readSigningPosture, readerCanSign } from '../vault-signing-posture';

const members = [
  { id: 1, name: 'Ada Admin', role: 'admin' },
  { id: 2, name: 'Sam Manager', role: 'manager' },
  { id: 3, name: 'Raj Approver', role: 'APPROVER' },
  { id: 4, name: 'Mia Member', role: 'member' },
  { id: 5, name: 'Rae Reviewer', role: 'reviewer' },
  { id: 6, name: 'Vic Viewer', role: 'viewer' },
];
const q = { query: vi.fn(async () => ({ rows: members })) };

beforeEach(() => { check.mockReset(); q.query.mockClear(); });

describe('vault signing posture', () => {
  it('lists only the members the signing policy admits, scoped to the organization', async () => {
    expect(await readOrgSigners(q, 1)).toEqual([
      { id: 1, name: 'Ada Admin' },
      { id: 3, name: 'Raj Approver' },
      { id: 5, name: 'Rae Reviewer' },
    ]);
    expect(q.query).toHaveBeenCalledWith(expect.stringContaining('ou.organization_id = $1'), [1]);
  });

  it('tells two signers with one printed name apart by their address', async () => {
    const twins = { query: vi.fn(async () => ({ rows: [
      { id: 1, name: 'JM Smith', email: 'jm@x.test', role: 'admin' },
      { id: 8, name: 'JM Smith', email: 'jon@x.test', role: 'admin' },
      { id: 3, name: 'Raj Patel', email: 'raj@x.test', role: 'approver' },
    ] })) };
    expect((await readOrgSigners(twins, 1)).map((s) => s.name)).toEqual(['JM Smith (jm@x.test)', 'JM Smith (jon@x.test)', 'Raj Patel']);
  });

  it('answers the reader from the check the sign route applies: yes, no, or unknown', async () => {
    check.mockResolvedValueOnce(null);
    expect(await readerCanSign(3, 1)).toBe(true);
    check.mockResolvedValueOnce({ status: 403, code: 'ESIGNATURE_NO_AUTHORITY', message: 'no' });
    expect(await readerCanSign(2, 1)).toBe(false);
    check.mockResolvedValueOnce({ status: 503, code: 'SIGNING_AUTHORITY_UNVERIFIED', message: '?' });
    expect(await readerCanSign(2, 1)).toBeNull();
    expect(await readerCanSign(null, 1)).toBe(false);
    expect(check).toHaveBeenCalledWith(2, 1);
  });

  it('a signer list that could not be read is null, never an empty list', async () => {
    check.mockResolvedValueOnce({ status: 403, code: 'ESIGNATURE_NO_AUTHORITY', message: 'no' });
    const failing = { query: vi.fn(async () => { throw new Error('boom'); }) };
    expect(await readSigningPosture(failing, 1, 2)).toEqual({ canSign: false, signers: null });
  });
});
