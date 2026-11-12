/**
 * AUD-01 and W1-18 (client administration walk, 2026-11-10): a governed change
 * reads back from the audit trail as what changed, from what to what, about whom
 * and why — when the row holds it — and says so when it does not.
 *
 * What the walkers saw: a session policy change read "Tenant Settings Changed",
 * target "organization_settings:7", and opening it showed neither the field nor
 * the values, although the row held both. Six role changes on a member read
 * "Member Role Changed", target "organization_users:11"; a search for her name
 * found nothing. An API key revocation, stored with no reason, said nothing about
 * the missing reason. A seats change kept its reason inside the stored values,
 * so the entry showed none.
 *
 * Real SQL on PGlite (the same set-up as audit-trail-ledger.routes.test.ts): the
 * rows are written by the real chained writer in the exact shapes the walk found
 * in the database, and read by the real route.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';

vi.mock('../../db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
  getPool: () => ({ query: vi.fn(), connect: vi.fn() }),
  query: vi.fn(),
  db: {},
}));

import { writeChainedAuditRow } from '../../services/auditService';
import createAuditTrailLedgerRoutes, { type AuditLedgerEntry } from '../audit-trail-ledger.routes';
import { verifyAuditChain } from '../../services/audit/chain';

const ORG = 7;
let pg: PGlite;

const client = (): PoolClient => ({ query: (sql: string, params?: unknown[]) => pg.query(sql, params) }) as unknown as PoolClient;

function app() {
  const a = express();
  a.use((req, _res, next) => {
    (req as express.Request & { user?: unknown }).user = { id: 5, role: 'admin', organizationId: ORG };
    next();
  });
  a.use('/api/audit-trail', createAuditTrailLedgerRoutes(
    { connect: (async () => ({ query: (s: string, p?: unknown[]) => pg.query(s, p), release: () => undefined })) as unknown as Pool['connect'] },
    { verifyTenantChain: (orgId) => verifyAuditChain(client(), { tenantId: orgId }) },
  ));
  return a;
}

async function write(action: string, resourceType: string, resourceId: string, details: Record<string, unknown> | null, reason?: string): Promise<string> {
  await pg.transaction(async (tx) => {
    await writeChainedAuditRow(tx as never, { tenantId: ORG, userId: 5, action, resourceType, resourceId, details: details ?? undefined, reason });
  });
  return (await pg.query<{ id: string }>('SELECT id FROM audit_logs ORDER BY chain_seq DESC LIMIT 1')).rows[0].id;
}

async function entry(auditId: string): Promise<AuditLedgerEntry> {
  const res = await request(app()).get('/api/audit-trail/ledger');
  expect(res.status).toBe(200);
  const e = (res.body.data as AuditLedgerEntry[]).find((x) => x.id === `AUD-${auditId}`);
  expect(e, `entry AUD-${auditId}`).toBeTruthy();
  return e as AuditLedgerEntry;
}

/** What the screen's search box matches on (AdminSurfaces.tsx AuditTrail). */
const searchHits = (e: AuditLedgerEntry, term: string) =>
  [e.event, e.actor, e.actorRef ?? '', e.target, e.targetRef ?? '', e.id].some((f) => f.toLowerCase().includes(term.toLowerCase()));

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(fs.readFileSync(path.join(process.cwd(), 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await pg.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason text;
    CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, name text, email text);
    CREATE TABLE IF NOT EXISTS audit_events (id serial PRIMARY KEY, organization_id integer NOT NULL,
      event_type varchar(100) NOT NULL, entity_type varchar(100) NOT NULL, entity_id integer NOT NULL, user_id integer,
      user_name text NOT NULL, ip_address text, "timestamp" timestamp DEFAULT now() NOT NULL, reason text,
      signature_status varchar(50), signature_meaning text, metadata json, record_hash text, previous_hash text, sequence_number integer);
    INSERT INTO users (id, name, email) VALUES (5, 'Avery Lind', 'avery@example.test'), (11, 'Priya Raman', 'priya@example.test');
    CREATE TABLE IF NOT EXISTS organization_users (user_id integer, organization_id integer);
    INSERT INTO organization_users VALUES (5, ${ORG}), (11, ${ORG});`);
  await pg.exec(fs.readFileSync(path.join(process.cwd(), 'migrations/20260929_actor_names.sql'), 'utf8'));
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => { await pg.exec('DELETE FROM audit_logs; DELETE FROM audit_events;'); });

describe('a member role change reads as who, from which role to which, by whom and why (W1-18)', () => {
  it('names the person, not organization_users:11, and keeps the record reference beside it', async () => {
    const id = await write('member_role_changed', 'organization_users', '11',
      { targetUserId: 11, previousRole: 'approver', newRole: 'admin', reason: 'Second administrator for continuity' },
      'Second administrator for continuity');
    const e = await entry(id);
    expect(e.target).toBe('Priya Raman');
    expect(e.targetRef).toBe('organization_users:11');
    expect(e.event).toBe('Member role changed: role from Approver to Administrator');
    expect(e.reason).toBe('Second administrator for continuity');
    expect(e.changes).toEqual([{ field: 'role', label: 'Role', before: 'Approver', after: 'Administrator' }]);
    expect(e.changeNote ?? null).toBeNull();
  });

  it('is found by searching for the person\'s name, which found nothing before', async () => {
    const id = await write('member_role_changed', 'organization_users', '11',
      { targetUserId: 11, previousRole: 'manager', newRole: 'viewer', reason: 'Read-only during leave' }, 'Read-only during leave');
    const e = await entry(id);
    expect(searchHits(e, 'Priya Raman')).toBe(true);
    expect(searchHits(e, 'priya')).toBe(true);
  });

  it('a removed member the organisation can no longer name is said to be so, never shown as a reference alone', async () => {
    const id = await write('member_removed', 'organization_users', '99',
      { targetUserId: 99, previousRole: 'member', newRole: null, revokedApiKeyIds: [], reason: 'Engagement cancelled' }, 'Engagement cancelled');
    const e = await entry(id);
    expect(e.target).toBe('A person who is no longer a member');
    expect(e.targetRef).toBe('organization_users:99');
    expect(e.event).toBe('Member removed: role from Member to none (removed)');
  });
});

describe('a settings change reads as the field, the value before and after, and the reason (AUD-01)', () => {
  it('session policy: each changed field from its old value to its new one', async () => {
    const id = await write('tenant_settings_changed', 'organization_settings', '7', {
      sections: ['security'],
      changedFields: { security: ['sessionTimeoutMinutes', 'maxConcurrentSessions'] },
      values: { security: {
        before: { mfaRequired: null, sessionTimeoutMinutes: 15, maxConcurrentSessions: 1 },
        after: { mfaRequired: null, sessionTimeoutMinutes: 1, maxConcurrentSessions: 2 } } },
    }, 'Shorter idle sign-out for the inspection');
    const e = await entry(id);
    expect(e.target).toBe('Organisation settings');
    expect(e.targetRef).toBe('organization_settings:7');
    expect(e.event).toBe('Organisation settings changed: idle sign-out (minutes) from 15 to 1; concurrent sessions from 1 to 2');
    expect(e.reason).toBe('Shorter idle sign-out for the inspection');
    expect(e.changes).toEqual([
      { field: 'security.sessionTimeoutMinutes', label: 'Idle sign-out (minutes)', before: '15', after: '1' },
      { field: 'security.maxConcurrentSessions', label: 'Concurrent sessions', before: '1', after: '2' },
    ]);
  });

  it('a row that names the field but holds no value says that the values were not recorded', async () => {
    const id = await write('tenant_settings_changed', 'organization_settings', '7',
      { sections: ['submission'], changedFields: { submission: ['requirePdfA'] }, values: {} }, 'PDF/A requirement on');
    const e = await entry(id);
    expect(e.changes).toEqual([]);
    expect(e.changeNote).toBe('The values before and after were not recorded for: PDF/A required.');
    expect(e.event).toBe('Organisation settings changed: the values before and after were not recorded for: PDF/A required.');
  });

  it('a seats change whose reason was stored only with the values shows that reason', async () => {
    const id = await write('compliance.seats_purchased.update', 'organization_seats', '7', {
      reason: 'Restore the seat count', seatsConsumed: 5, previousValue: { seatsPurchased: 50 }, newValue: { seatsPurchased: 5 } });
    const e = await entry(id);
    expect(e.reason).toBe('Restore the seat count');
    expect(e.target).toBe('Purchased seats');
    expect(e.event).toBe('Purchased seats changed: purchased seats from 50 to 5');
  });

  it('a seats change whose value before and after are the same says it stayed, never that the values were not recorded (V-2)', async () => {
    const id = await write('compliance.seats_purchased.update', 'organization_seats', '7', {
      reason: 'Confirm the seat count', previousValue: { seatsPurchased: 5 }, newValue: { seatsPurchased: 5 } });
    const e = await entry(id);
    expect(e.changes).toEqual([{ field: 'seatsPurchased', label: 'Purchased seats', before: '5', after: '5' }]);
    expect(e.changeNote ?? null).toBeNull();
    expect(e.event).toBe('Purchased seats changed: purchased seats stayed at 5');
  });

  it('a switch turned on reads from off to on, in that order (V-4a)', async () => {
    const id = await write('tenant_settings_changed', 'organization_settings', '7', {
      sections: ['submission'], changedFields: { submission: ['requirePdfA'] },
      values: { submission: { before: { requirePdfA: false }, after: { requirePdfA: true } } },
    }, 'Agency asks for PDF/A');
    const e = await entry(id);
    expect(e.changes).toEqual([{ field: 'submission.requirePdfA', label: 'PDF/A required', before: 'off', after: 'on' }]);
    expect(e.event).toBe('Organisation settings changed: PDF/A required from off to on');
  });

  it('a governed change whose row holds no values says so (V-4c)', async () => {
    const id = await write('billing.budget.update', 'billing_budgets', '7', { reason: 'Quarterly review' });
    const e = await entry(id);
    expect(e.changes).toEqual([]);
    expect(e.changeNote).toBe('This entry does not record the values before and after.');
    expect(e.event).toBe('Monthly budget changed. This entry does not record the values before and after.');
    expect(e.reason).toBe('Quarterly review');
  });

  it('a client type change that stored only the new value says the old one was not recorded', async () => {
    const id = await write('update', 'organization_industry_profile', '7',
      { primaryIndustry: 'cro', mdxSpecialization: null, reason: 'Change the client type' });
    const e = await entry(id);
    expect(e.target).toBe('Client type');
    expect(e.changes).toEqual([{ field: 'primaryIndustry', label: 'Client type', before: null, after: 'Contract research organisation' }]);
    expect(e.event).toBe('Client type changed: client type set to Contract research organisation. The value before was not recorded.');
    expect(e.reason).toBe('Change the client type');
  });
});

describe('a governed act stored without a reason says so (AUD-01)', () => {
  it('an API key revocation with no reason reads that no reason was recorded', async () => {
    const id = await write('api_key_revoked', 'api_key', '1', { outcome: 'success' });
    const e = await entry(id);
    expect(e.event).toBe('API key revoked. No reason was recorded.');
    expect(e.target).toBe('API key');
    expect(e.reason).toBeNull();
  });

  it('an act that is not a governed change is left as it was', async () => {
    const id = await write('vault.document.ingest', 'vault_document', 'v1', {});
    const e = await entry(id);
    expect(e.event).toBe('Uploaded to the Vault');
    expect(e.target).toBe('vault_document:v1');
    expect(e.changes ?? []).toEqual([]);
  });
});

describe('a signed export, recorded on the audit-event chain, is named in words', () => {
  it('reads "Signed audit trail exported", about the audit trail, not "Audit Export" / audit_export', async () => {
    await pg.query(
      `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_id, user_name, reason, record_hash, sequence_number)
       VALUES ($1, 'audit.export', 'audit_export', 0, NULL, 'walk2.owner@example.test', 'Audit trail export AUDIT-EXPORT-1: 3 records, format=json', $2, 1)`,
      [ORG, 'c'.repeat(64)]);
    const res = await request(app()).get('/api/audit-trail/ledger');
    const e = (res.body.data as AuditLedgerEntry[]).find((x) => x.source === 'audit_events');
    expect(e?.event).toBe('Signed audit trail exported');
    expect(e?.target).toBe('Audit trail');
  });
});
