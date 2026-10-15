/**
 * Review round 1, item 1 — "intact" over zero rows.
 *
 * chain.ts walkAuditChain returns `ok: true, rowsChecked: 0` for an
 * organisation with no chained rows: nothing was checked, and every reader that
 * passed that on said the chain verified. The rule now holds at the source
 * (audited-export.ts walkTenantChain, which the turn-record, authoring and
 * compliance-report exports all state), in the signed audit export's
 * audit_logs verdict, and in the integrity attestation's own verdict row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { walk } = vi.hoisted(() => ({ walk: vi.fn() }));
vi.mock('../../tenant-chain-verdict.js', () => ({ verifyTenantChainOnAdminScope: walk }));

import { walkTenantChain } from '../../audited-export';
import { generateSignedAuditExport } from '../../signedAuditExport';
import { findReport } from '../catalog';
import type { RunContext } from '../types';

const NO_CHAIN = 'No chained rows exist for this organisation, so there is no chain to verify.';
const empty = { ok: true, rowsChecked: 0, tenants: 0, legacyRows: 0, sequencedRows: 0 };

beforeEach(() => {
  walk.mockReset();
  process.env.AUDIT_EXPORT_SIGNING_KEY = 'z'.repeat(40);
});

describe('a chain walk over zero rows is not a verdict', () => {
  it('walkTenantChain states it as unknown, with the reason', async () => {
    walk.mockResolvedValue(empty);
    expect(await walkTenantChain(7)).toEqual({ ok: null, rowsChecked: 0, reason: NO_CHAIN });
  });

  it('walkTenantChain still says ok over rows it checked', async () => {
    walk.mockResolvedValue({ ...empty, rowsChecked: 3, sequencedRows: 3 });
    expect(await walkTenantChain(7)).toEqual({ ok: true, rowsChecked: 3 });
  });

  it('the signed audit export states the audit_logs chain as unverified, not intact', async () => {
    const pool = { query: async (sql: string) => (/INSERT INTO audit_events/.test(sql) ? { rows: [{ id: 1 }] } : { rows: [] }) };
    const out = await generateSignedAuditExport(
      pool as never,
      { organizationId: 7, format: 'json', exportedBy: 'probe', exportedByRole: 'admin' },
      { verifyAuditLogsChain: async () => empty },
    );
    expect(out.manifest.auditLogsChain).toMatchObject({ status: 'unverified', rowsChecked: 0, reason: NO_CHAIN });
  });

  it('the integrity attestation says "not verified" for a walk of zero rows, even if handed ok: true', async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    const ctx: RunContext = {
      client,
      orgId: 7,
      period: { from: '2026-09-01', to: '2026-09-30', kind: 'range' },
      bounds: { start: '2026-09-01T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' },
      chain: { ok: true, rowsChecked: 0 },
      checks: {
        auditEventsLinkage: async () => ({ status: 'intact', totalEntries: 1, hashedEntries: 1, brokenLinks: 0 }),
        auditLogsSeals: async () => ({ ran: true, valid: true, sealedRows: 1, brokenAt: null }),
      },
    };
    const out = await findReport('audit-trail-integrity')!.run!(ctx);
    const row = out.verdicts.rows.find((r) => r.check === 'audit_logs hash chain')!;
    expect(row).toMatchObject({ verdict: 'not verified', rows_checked: 0, detail: NO_CHAIN });
  });
});
