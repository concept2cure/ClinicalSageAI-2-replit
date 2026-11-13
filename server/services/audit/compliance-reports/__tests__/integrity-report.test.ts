/**
 * The audit-trail integrity attestation states each check as it came out:
 * intact, broken, or not verified with the reason. A check that did not run —
 * or ran over nothing — is never 'intact' (verification-outcome.ts; WO-16B).
 */
import { describe, expect, it, vi } from 'vitest';

import { findReport } from '../catalog';
import type { IntegrityChecks, LinkageSnapshot, RunContext, SealCheck, TenantChainWalk } from '../types';

const ORG = 7;

const client = {
  query: vi.fn(async (sql: string) => {
    if (/FROM audit_logs/.test(sql)) {
      return { rows: [{ store: 'audit_logs', rows_total: 5, hashed: 5, legacy: 1, sealed: 4, first_at: null, last_at: null, in_period: 2 }] };
    }
    if (/FROM audit_events/.test(sql)) {
      return { rows: [{ store: 'audit_events', rows_total: 3, hashed: 0, legacy: null, sealed: 0, first_at: null, last_at: null, in_period: 1 }] };
    }
    return { rows: [] };
  }),
};

function ctx(chain: TenantChainWalk, linkage: LinkageSnapshot, seals: SealCheck): RunContext {
  const checks: IntegrityChecks = {
    auditEventsLinkage: vi.fn(async () => linkage),
    auditLogsSeals: vi.fn(async () => seals),
  };
  return {
    client,
    orgId: ORG,
    period: { from: '2026-09-01', to: '2026-09-30', kind: 'range' },
    bounds: { start: '2026-09-01T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' },
    chain,
    checks,
  };
}

const intactLinkage: LinkageSnapshot = { status: 'intact', totalEntries: 3, hashedEntries: 3, brokenLinks: 0 };
const sealsOk: SealCheck = { ran: true, valid: true, sealedRows: 4, brokenAt: null };

async function verdicts(c: RunContext) {
  const out = await findReport('audit-trail-integrity')!.run!(c);
  return Object.fromEntries(out.verdicts.rows.map((r) => [String(r.check), r])) as Record<string, Record<string, unknown>>;
}

describe('audit-trail integrity: the stores', () => {
  it('counts each store for this organisation only, with the period bounds', async () => {
    client.query.mockClear();
    const out = await findReport('audit-trail-integrity')!.run!(ctx({ ok: true, rowsChecked: 5 }, intactLinkage, sealsOk));
    expect(out.stores.rows.map((r) => r.store)).toEqual(['audit_logs', 'audit_events']);
    const calls = client.query.mock.calls as unknown as [string, unknown[]][];
    const logs = calls.find(([sql]) => /FROM audit_logs/.test(sql))!;
    const events = calls.find(([sql]) => /FROM audit_events/.test(sql))!;
    expect(logs[0]).toMatch(/tenant_id = \$1/);
    expect(events[0]).toMatch(/organization_id = \$1/);
    expect(logs[1]).toEqual([ORG, '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z']);
    expect(events[1]).toEqual([ORG, '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z']);
  });
});

describe('audit-trail integrity: the verdicts', () => {
  /* HS-1008-7, honest-state review 2026-10-08, closed in two steps. This verdict
     read "Every one of N rows carries a hash linked to its predecessor" over a
     check that compared stored pointers and re-computed nothing. First the
     sentence was cut down to the check (2026-10-12). Now the check is the one
     walk of the chain (services/audit/audit-event-chain.ts), which re-computes
     each entry's hash as well, and the sentence is the walk's own. */
  it('says the entries match their recorded hash, and that before and after values are not part of it', async () => {
    const recomputed: LinkageSnapshot = { ...intactLinkage, verifiedEntries: 3 };
    const v = await verdicts(ctx({ ok: true, rowsChecked: 5 }, recomputed, sealsOk));
    const detail = String(v['audit_events linkage'].detail);
    expect(detail).toMatch(/All 3 audit entries match the hash recorded/);
    expect(detail).toMatch(/follows the entry before it/);
    expect(detail, 'the verdict reads as covering the before and after values')
      .toMatch(/before and after values .* not part of the hash/);
    expect(v['audit_events linkage'].rows_checked).toBe(3);
  });

  /* A snapshot with no re-computed count compared pointers only. It is still
     described as that, never as a re-computation it did not do. */
  it('does not claim a re-computation for a snapshot that only compared pointers', async () => {
    const v = await verdicts(ctx({ ok: true, rowsChecked: 5 }, intactLinkage, sealsOk));
    const detail = String(v['audit_events linkage'].detail);
    expect(detail, 'the linkage verdict claimed a re-computation it never did').toMatch(/No hash was re-computed/);
    expect(detail).not.toMatch(/match the hash recorded/);
    expect(detail).toContain('3');
  });

  /* An altered entry and a broken link are different findings. */
  it('says which kind of break was found', async () => {
    const altered: LinkageSnapshot = { status: 'broken', totalEntries: 3, hashedEntries: 3, verifiedEntries: 2, brokenLinks: 1, contentBreaks: 1, pointerBreaks: 0 };
    const a = await verdicts(ctx({ ok: true, rowsChecked: 5 }, altered, sealsOk));
    expect(String(a['audit_events linkage'].detail)).toMatch(/1 entry does not match the hash recorded when it was written/);

    const relinked: LinkageSnapshot = { status: 'broken', totalEntries: 3, hashedEntries: 3, verifiedEntries: 3, brokenLinks: 2, contentBreaks: 0, pointerBreaks: 2 };
    const r = await verdicts(ctx({ ok: true, rowsChecked: 5 }, relinked, sealsOk));
    expect(String(r['audit_events linkage'].detail)).toMatch(/2 entries do not follow the entry before them/);
  });

  /* The walk's reason is already a sentence; it is not wrapped in a second one. */
  it('prints the walk\'s own sentence for a chain that could not be verified', async () => {
    const gap: LinkageSnapshot = { status: 'unverified', totalEntries: 3, hashedEntries: 2, verifiedEntries: 2, brokenLinks: 0, reason: '1 of 3 audit entries carries no hash, so it could not be verified.' };
    const v = await verdicts(ctx({ ok: true, rowsChecked: 5 }, gap, sealsOk));
    expect(v['audit_events linkage']).toMatchObject({ verdict: 'not verified', detail: '1 of 3 audit entries carries no hash, so it could not be verified.' });
  });

  it('states three intact checks when all three ran and passed', async () => {
    const v = await verdicts(ctx({ ok: true, rowsChecked: 5 }, intactLinkage, sealsOk));
    expect(v['audit_logs hash chain']).toMatchObject({ store: 'audit_logs', verdict: 'intact', rows_checked: 5 });
    expect(v['audit_events linkage']).toMatchObject({ store: 'audit_events', verdict: 'intact', rows_checked: 3 });
    expect(v['audit_logs HMAC seals']).toMatchObject({ store: 'audit_logs', verdict: 'intact', rows_checked: 4 });
  });

  it('a broken chain says where, as this organisation may read it', async () => {
    const brokenAt = { segment: 'sequenced', id: 'row-own', expected: 'e', stored: 's', commitsTo: null };
    const v = await verdicts(ctx({ ok: false, rowsChecked: 5, brokenAt }, intactLinkage, sealsOk));
    expect(v['audit_logs hash chain'].verdict).toBe('broken');
    expect(JSON.parse(String(v['audit_logs hash chain'].detail))).toEqual(brokenAt);
  });

  it('a broken linkage and a failing seal are broken', async () => {
    const v = await verdicts(
      ctx(
        { ok: true, rowsChecked: 5 },
        { status: 'broken', totalEntries: 3, hashedEntries: 3, brokenLinks: 2 },
        { ran: true, valid: false, sealedRows: 4, brokenAt: 1 },
      ),
    );
    expect(v['audit_events linkage']).toMatchObject({ verdict: 'broken' });
    expect(String(v['audit_events linkage'].detail)).toContain('2');
    expect(v['audit_logs HMAC seals']).toMatchObject({ verdict: 'broken' });
  });

  it.each([
    ['the chain walk did not run', { ok: null, reason: 'The audit chain could not be walked at export time.' }, intactLinkage, sealsOk, 'audit_logs hash chain'],
    ['the linkage had nothing hashed', { ok: true, rowsChecked: 5 }, { status: 'unverified', totalEntries: 3, hashedEntries: 0, brokenLinks: 0, reason: 'no row carries a record_hash' }, sealsOk, 'audit_events linkage'],
    ['the linkage query did not run', { ok: true, rowsChecked: 5 }, { status: 'unavailable', totalEntries: 0, brokenLinks: 0, reason: '42P01: relation "audit_events" does not exist' }, sealsOk, 'audit_events linkage'],
    ['the seal check could not run', { ok: true, rowsChecked: 5 }, intactLinkage, { ran: false, reason: 'The seal key is not configured on this server, so no seal was checked.' }, 'audit_logs HMAC seals'],
    ['no row carried a seal', { ok: true, rowsChecked: 5 }, intactLinkage, { ran: true, valid: true, sealedRows: 0, brokenAt: null }, 'audit_logs HMAC seals'],
  ] as const)('%s: "not verified", with the reason, never intact', async (_label, chain, linkage, seals, check) => {
    const v = await verdicts(ctx(chain as TenantChainWalk, linkage as LinkageSnapshot, seals as SealCheck));
    expect(v[check].verdict).toBe('not verified');
    expect(String(v[check].detail).length).toBeGreaterThan(10);
  });

  it('a check that could not run does not put the failure text in the report', async () => {
    const v = await verdicts(
      ctx({ ok: true, rowsChecked: 5 }, { status: 'unavailable', totalEntries: 0, brokenLinks: 0, reason: '42P01: relation "audit_events" does not exist' }, sealsOk),
    );
    expect(String(v['audit_events linkage'].detail)).not.toContain('42P01');
    expect(String(v['audit_events linkage'].detail)).not.toContain('relation');
  });
});
