/**
 * Every query the AI audit logger issues must declare a tenant scope.
 *
 * ── The regression this pins ─────────────────────────────────────────────────
 * Pool instrumentation refuses ANY unscoped `pool.query` once RLS_ENFORCE=on,
 * and production permits no other value. The audit store probe was written
 * without a scope, so on the shipped build it threw
 *
 *   [tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope
 *
 * which checkStore() reported as "probe failed", which the boot invariant
 * turned into a fail-closed error — and the production build shut down before
 * it ever listened. Caught by the production-boot-smoke job on 262f349, one
 * commit after the ledger fix that introduced it.
 *
 * ── Why this test rather than the real-DB suite ──────────────────────────────
 * tests/db/ai-gateway-audit-log.dbtest.ts exercises a plain pg.Pool, which has
 * no instrumentation and therefore cannot fail this way — it passed throughout
 * the outage. The property that actually broke is "a tenant scope is active at
 * the moment the query is issued", and that is observable directly, without a
 * database, by asking the scope store from inside a fake pool's query().
 *
 * The INSERT path is covered as well as the probe. An AI call can originate
 * outside a request — schedulers, workers, queue consumers — where no ambient
 * scope exists, so an unscoped write would be refused in exactly the places it
 * is hardest to notice.
 */

import { describe, it, expect } from 'vitest';
import { GatewayAuditLogger, LEDGER_COLUMNS } from '../audit';
import { getTenantScope } from '../../../db/tenantStore';
import type { AuditLogEntry } from '../types';

/** A pool that records the tenant scope in force for each query it receives. */
function scopeRecordingPool() {
  const scopes: Array<{ sql: string; tenantId?: string; caller?: string }> = [];
  return {
    scopes,
    query: async (sql: string) => {
      const scope = getTenantScope();
      scopes.push({
        sql: String(sql).slice(0, 40),
        tenantId: scope?.tenantId,
        caller: scope?.caller,
      });
      if (String(sql).includes('to_regclass')) return { rows: [{ present: true }] };
      if (String(sql).includes('has_table_privilege')) {
        return { rows: [{ role: 'app_service', can_insert: true }] };
      }
      if (String(sql).includes('information_schema.columns')) {
        return { rows: LEDGER_COLUMNS.map(column_name => ({ column_name })) };
      }
      return { rows: [] };
    },
  };
}

const entry: AuditLogEntry = {
  requestId: '00000000-0000-4000-8000-00000000aaaa',
  timestamp: new Date(),
  provider: 'anthropic',
  model: 'claude-opus-4-8',
  taskType: 'general' as AuditLogEntry['taskType'],
  strategy: 'task_based' as AuditLogEntry['strategy'],
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
  estimatedCostUsd: 0,
  latencyMs: 1,
  success: true,
  cached: false,
  deterministic: false,
};

describe('GatewayAuditLogger — tenant scope on every query', () => {
  it('runs the store probe inside a tenant scope', async () => {
    const pool = scopeRecordingPool();
    await new GatewayAuditLogger(pool).initialize();

    expect(pool.scopes.length).toBeGreaterThan(0);
    for (const q of pool.scopes) {
      // undefined tenantId is precisely the condition instrumentation rejects.
      expect(q.tenantId, `unscoped query: ${q.sql}`).toBeDefined();
      expect(q.caller).toBe('ai-gateway:audit-store-probe');
    }
  });

  it('runs the INSERT inside a tenant scope, with no ambient request scope', async () => {
    const pool = scopeRecordingPool();
    await new GatewayAuditLogger(pool).log(entry);

    const insert = pool.scopes.find((q) => q.sql.includes('INSERT INTO ai.gateway_audit_log'));
    expect(insert, 'the ledger INSERT was never issued').toBeDefined();
    expect(insert!.tenantId).toBeDefined();
    expect(insert!.caller).toBe('ai-gateway:audit-write');
  });

  it('leaves no scope leaked behind after logging', async () => {
    const pool = scopeRecordingPool();
    await new GatewayAuditLogger(pool).log(entry);
    // AsyncLocalStorage.run must not leak into the caller's context.
    expect(getTenantScope()).toBeUndefined();
  });
});

describe('GatewayAuditLogger — which failures latch', () => {
  /**
   * Structural problems are operator-fixable and will not resolve on their own,
   * so re-probing per AI call is noise. Anything else must keep retrying: an
   * earlier revision latched on everything, which meant one dropped connection
   * could silently stop the Part 11 ledger for the life of the process — the
   * exact failure mode this work exists to remove, one level up.
   */
  it('keeps retrying after a transient failure', async () => {
    let calls = 0;
    const flaky = {
      query: async (sql: string) => {
        calls += 1;
        if (calls <= 2) throw new Error('connection terminated unexpectedly');
        if (String(sql).includes('to_regclass')) return { rows: [{ present: true }] };
        if (String(sql).includes('has_table_privilege')) {
          return { rows: [{ role: 'app_service', can_insert: true }] };
        }
        return { rows: [] };
      },
    };

    const logger = new GatewayAuditLogger(flaky);
    await logger.log(entry); // fails transiently
    const afterFirst = calls;
    await logger.log(entry); // must try again, not stay latched off
    expect(calls).toBeGreaterThan(afterFirst);
  });

  it('stops re-probing once the table is known absent', async () => {
    let probes = 0;
    const empty = {
      query: async () => {
        probes += 1;
        return { rows: [{ present: false }] };
      },
    };

    const logger = new GatewayAuditLogger(empty);
    await logger.log(entry);
    const afterFirst = probes;
    await logger.log(entry);
    await logger.log(entry);
    expect(probes).toBe(afterFirst);
  });

  it('stops re-probing once the table is known to lack a column the writer inserts', async () => {
    // A migration not yet applied will not apply itself: re-probing on every AI
    // call cost three round trips each and recorded nothing (2026-09-26 review).
    let probes = 0;
    let inserts = 0;
    const behind = {
      query: async (sql: string) => {
        if (String(sql).startsWith('INSERT')) {
          inserts += 1;
          return { rows: [] };
        }
        probes += 1;
        if (String(sql).includes('to_regclass')) return { rows: [{ present: true }] };
        if (String(sql).includes('has_table_privilege')) return { rows: [{ role: 'app_service', can_insert: true }] };
        return { rows: LEDGER_COLUMNS.filter(c => c !== 'run_id').map(column_name => ({ column_name })) };
      },
    };

    const logger = new GatewayAuditLogger(behind);
    await logger.log(entry);
    const afterFirst = probes;
    await logger.log(entry);
    await logger.log(entry);
    expect(probes).toBe(afterFirst);
    expect(inserts).toBe(0);
  });
});

describe('GatewayAuditLogger — every value binds to its own column (D6)', () => {
  // The provenance cases read the in-memory buffer; this reads what the INSERT
  // is handed, so a parameter out of order against LEDGER_INSERT_SQL fails.
  it('binds each provenance field to the column of the same name', async () => {
    let sql = '';
    let params: unknown[] = [];
    const pool = {
      query: async (text: string, values?: unknown[]) => {
        if (String(text).startsWith('INSERT')) {
          sql = String(text);
          params = values ?? [];
          return { rows: [] };
        }
        if (String(text).includes('to_regclass')) return { rows: [{ present: true }] };
        if (String(text).includes('has_table_privilege')) return { rows: [{ role: 'app_service', can_insert: true }] };
        return { rows: LEDGER_COLUMNS.map(column_name => ({ column_name })) };
      },
    };
    await new GatewayAuditLogger(pool).log({
      ...entry,
      region: 'eu',
      payloadProvenance: 'tenant_derived',
      dataClass: 'pii',
      tenantPolicyResolution: 'resolved',
      tenantBoundFrom: 'ambient_scope',
      placementReasonCode: 'ALLOW_APPROVED_DATA_CLASS',
      approvedModelId: 'claude-opus-4-8',
      pinnedVersion: 'claude-opus-4-8',
      pqStatus: 'pending',
      riskTier: 'high',
      runId: 'run-7',
      parentRunId: 'run-1',
      serverToolsUsed: ['web_search'],
      serverToolsWithheld: [{ name: 'web_fetch', reason: 'not_first_party' }],
    } as AuditLogEntry);

    const bound = (column: string) => params[LEDGER_COLUMNS.indexOf(column)];
    expect(sql.match(/\$\d+/g)).toHaveLength(LEDGER_COLUMNS.length);
    expect(params).toHaveLength(LEDGER_COLUMNS.length);
    expect({
      region: bound('region'),
      payload_provenance: bound('payload_provenance'),
      data_class: bound('data_class'),
      tenant_policy_resolution: bound('tenant_policy_resolution'),
      tenant_bound_from: bound('tenant_bound_from'),
      placement_reason_code: bound('placement_reason_code'),
      approved_model_id: bound('approved_model_id'),
      pinned_version: bound('pinned_version'),
      pq_status: bound('pq_status'),
      risk_tier: bound('risk_tier'),
      run_id: bound('run_id'),
      parent_run_id: bound('parent_run_id'),
      server_tools_used: JSON.parse(String(bound('server_tools_used'))),
      server_tools_withheld: JSON.parse(String(bound('server_tools_withheld'))),
    }).toEqual({
      region: 'eu',
      payload_provenance: 'tenant_derived',
      data_class: 'pii',
      tenant_policy_resolution: 'resolved',
      tenant_bound_from: 'ambient_scope',
      placement_reason_code: 'ALLOW_APPROVED_DATA_CLASS',
      approved_model_id: 'claude-opus-4-8',
      pinned_version: 'claude-opus-4-8',
      pq_status: 'pending',
      risk_tier: 'high',
      run_id: 'run-7',
      parent_run_id: 'run-1',
      server_tools_used: ['web_search'],
      server_tools_withheld: [{ name: 'web_fetch', reason: 'not_first_party' }],
    });
  });
});

describe('GatewayAuditLogger — the probe checks the columns the writer inserts (D6)', () => {
  // A deploy that ran ahead of the migration used to fail each INSERT inside
  // the writer's catch, and the ledger recorded nothing while the probe said
  // it was ready.
  it('a table missing a column the writer inserts is refused, and the column named', async () => {
    const pool = {
      query: async (sql: string) => {
        if (String(sql).includes('to_regclass')) return { rows: [{ present: true }] };
        if (String(sql).includes('has_table_privilege')) return { rows: [{ role: 'app_service', can_insert: true }] };
        if (String(sql).includes('information_schema.columns')) {
          return { rows: LEDGER_COLUMNS.filter(c => c !== 'run_id').map(column_name => ({ column_name })) };
        }
        return { rows: [] };
      },
    };
    const problem = await (new GatewayAuditLogger() as any).checkStore(pool);
    expect(problem).toMatch(/lacks column\(s\) the writer inserts: run_id/);
  });

  it('the column list is the INSERT\'s own, including the provenance columns', () => {
    expect(LEDGER_COLUMNS).toEqual(expect.arrayContaining(['request_id', 'payload_provenance', 'run_id', 'server_tools_withheld']));
    expect(new Set(LEDGER_COLUMNS).size).toBe(LEDGER_COLUMNS.length);
  });
});
