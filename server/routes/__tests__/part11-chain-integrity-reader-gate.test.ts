/**
 * P-65 (2026-10-29): the audit_events chain verdict is for those who may review
 * the audit trail.
 *
 * GET /api/part11/audit-trail/chain-integrity answered any member of the
 * organisation, while the other chain verdict on the same Audit trail screen,
 * the ledger's (GET /api/audit-trail/ledger), answers only an audit reader
 * (requireAuditReader: owners, admins and managers, the roles that extend a
 * manager, and a platform administrator). Audit trail review is a role-scoped
 * duty, so both verdicts now answer to that one policy. A refused role gets the
 * ledger's 403 body, and nothing is read: the gate runs before the chain query.
 *
 * Evidence: docs/evidence/D6-ISOLATION-HARDENING/2026-10-29/.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import router from '../part11-compliance';
import { AUDIT_READER_ROLES } from '../../services/audit/audit-api-authority';

const query = vi.fn();

function app(role: string) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { dbClient: unknown }).dbClient = { query };
    (req as unknown as { user: unknown }).user = { id: 3, email: 'r@acme.test', organizationId: 7, role, roles: [role] };
    next();
  });
  a.use('/api/part11', router);
  return a;
}

const get = (role: string) => request(app(role)).get('/api/part11/audit-trail/chain-integrity');

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('GET /audit-trail/chain-integrity takes the audit reader gate (P-65)', () => {
  it.each(['member', 'user', 'viewer', 'editor', 'reviewer'])('%s is refused with the ledger\'s 403, and nothing is read', async role => {
    const res = await get(role);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'AUDIT_READ_RESTRICTED' });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([...AUDIT_READER_ROLES])('%s reads the verdict over its own organisation', async role => {
    const res = await get(role);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('chainStatus');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM audit_events WHERE organization_id = \$1/);
    expect(params).toEqual([7]);
  });

  it('the reader roles are the ledger\'s: owners, admins and managers', () => {
    expect(AUDIT_READER_ROLES).toEqual(expect.arrayContaining(['owner', 'admin', 'manager']));
  });
});
