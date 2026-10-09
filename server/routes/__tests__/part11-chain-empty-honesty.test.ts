/**
 * Part 11 §11.10(e) — an EMPTY audit-event chain carries no integrity verdict.
 *
 * `/audit-trail/chain-integrity` re-computes the org's `audit_events` chain. When
 * that table holds no rows for the org it answered
 *
 *     { chainStatus: 'empty', totalEntries: 0, integrityValid: true }
 *
 * and Part11Console rendered that as "Integrity valid" over "0 Chained entries".
 * On a fresh organisation this was the one verdict on the Part 11 console, and
 * it was a pass over nothing: the org's sign-ins and governed actions are
 * chained in `audit_logs`, which this query never reads (launch sweep finding
 * 111, 2026-09-23). A boolean `integrityValid` is a verdict whichever way it
 * points (scripts/ci/lib/verdict-inspector.mjs, VERDICT_BOOLEAN_KEYS); over zero
 * re-computed rows none was earned. The route's own "not verified" state is
 * `null`, which it already emits for an unhashed chain.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findVerdictClaims } from '../../../scripts/ci/lib/verdict-inspector.mjs';

const mockQuery = vi.fn();

import router from '../part11-compliance';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.dbClient = { query: mockQuery };
    req.user = { id: 1, organizationId: 101, roles: ['admin'] };
    req.tenantContext = { organizationId: 101 };
    next();
  });
  app.use('/api/part11', router);
  return app;
}

const get = () => request(makeApp()).get('/api/part11/audit-trail/chain-integrity');

describe('chain-integrity — zero audit events is not a verified chain', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('reports the empty chain without an integrity verdict', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.data.chainStatus).toBe('empty');
    expect(res.body.data.totalEntries).toBe(0);
    // Pre-fix: `true` — "Integrity valid" over nothing re-computed.
    expect(res.body.data.integrityValid).toBeNull();
    expect(res.body.data.verifiedEntries).toBe(0);
  });

  it('claims no verdict anywhere in the empty-chain body', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await get();
    expect(findVerdictClaims(res.body.data)).toEqual([]);
  });

  it('does not describe cryptographic linkage between entries that do not exist', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await get();
    expect(res.body.data.compliance.tamperEvident).not.toMatch(/Each entry is cryptographically linked/);
    expect(res.body.data.compliance.tamperEvident).toMatch(/no chain to verify/i);
  });
});
