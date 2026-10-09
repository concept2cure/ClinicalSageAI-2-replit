/**
 * The AI provenance ledger must actually record AI calls.
 *
 * ── What this pins closed ────────────────────────────────────────────────────
 * `ai.gateway_audit_log` is the record of which model, at which temperature,
 * from which prompt, on which substrate, produced every AI output here. It
 * recorded nothing at all, for two independent reasons that were each silent:
 *
 *   1. The table had no migration anywhere in the repo. Its only creator was
 *      runtime DDL inside GatewayAuditLogger (`CREATE SCHEMA IF NOT EXISTS ai`
 *      + CREATE TABLE) wrapped in a catch that logged and returned. PostgreSQL
 *      evaluates the database-level CREATE privilege BEFORE the IF NOT EXISTS
 *      short-circuit, so the least-privileged runtime role was refused on the
 *      first statement — even though schema `ai` already exists.
 *      scripts/ci/tables-live-schema-baseline.json listed it as absent from a
 *      real, fully provisioned database.
 *   2. Nothing ever handed the logger a pool. `GatewayConfig.dbPool` is
 *      optional, `buildConfig()` never set it, and every `getGateway()` call
 *      site calls it with no arguments — so the `if (this.pool)` guard around
 *      persistence was permanently false.
 *
 * ── Why this is a real-database test ─────────────────────────────────────────
 * Both defects are invisible to a mocked pool, which answers every query
 * successfully and has no catalog, no privileges and no column types. A mock
 * would have reported this ledger healthy for as long as it has been broken —
 * it is, in fact, exactly what the existing unit tests did. The assertions
 * below are about what PostgreSQL holds after the writer runs.
 *
 * The migration is applied by this file rather than assumed, so the suite is
 * self-provisioning regardless of which migrations the surrounding CI job ran.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { GatewayAuditLogger, LEDGER_COLUMNS } from '../../server/services/ai-gateway/audit';
import type { AuditLogEntry } from '../../server/services/ai-gateway/types';

const MIGRATION = path.join(
  __dirname,
  '../../db/migrations/20260813_ai_gateway_audit_log.sql'
);

/** Tags the rows this suite writes, so cleanup can never touch anything else. */
const CALLER = 'dbtest-ai-gateway-audit';

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    requestId: '00000000-0000-4000-8000-000000000001',
    timestamp: new Date(),
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    taskType: 'general' as AuditLogEntry['taskType'],
    strategy: 'task_based' as AuditLogEntry['strategy'],
    callerModule: CALLER,
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    estimatedCostUsd: 0.001,
    latencyMs: 42,
    success: true,
    cached: false,
    deterministic: false,
    ...overrides,
  };
}

describe('ai.gateway_audit_log — AI provenance ledger', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, max: 4 });
    await pool.query(fs.readFileSync(MIGRATION, 'utf8'));
    await pool.query('DELETE FROM ai.gateway_audit_log WHERE caller_module = $1', [CALLER]);
  }, 60_000);

  afterAll(async () => {
    if (pool) {
      await pool
        .query('DELETE FROM ai.gateway_audit_log WHERE caller_module = $1', [CALLER])
        .catch(() => {/* table may not exist if beforeAll failed */});
      await pool.end();
    }
  });

  it('the migration creates the table the writer INSERTs into', async () => {
    const { rows } = await pool.query(
      `SELECT to_regclass('ai.gateway_audit_log') IS NOT NULL AS present`,
    );
    expect(rows[0].present).toBe(true);
  });

  it('carries every column the writer binds, including resolved_model', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'ai' AND table_name = 'gateway_audit_log'`,
    );
    const columns = new Set(rows.map((r: any) => r.column_name));
    // Every identifier in the INSERT in audit.ts, read from the INSERT itself
    // (LEDGER_COLUMNS): a column added to the writer without a matching
    // migration fails here rather than at runtime, where the failure would land
    // in the swallowing catch. Until 2026-09-26 this was a literal of the first
    // 29, so the provenance columns went unchecked on a real database.
    expect(LEDGER_COLUMNS.length).toBeGreaterThan(29);
    for (const column of LEDGER_COLUMNS) {
      expect(columns.has(column), `missing column ${column}`).toBe(true);
    }
  });

  it('persists a row through the real writer', async () => {
    const logger = new GatewayAuditLogger(pool);
    await logger.log(
      entry({
        requestId: '00000000-0000-4000-8000-000000000002',
        resolvedModel: 'claude-opus-4-8-20260210',
        temperature: 0.3,
        promptHash: 'a'.repeat(64),
        substrate: 'shared' as AuditLogEntry['substrate'],
        region: 'us',
      }),
    );

    const { rows } = await pool.query(
      `SELECT model, resolved_model, temperature, region, prompt_hash
         FROM ai.gateway_audit_log
        WHERE request_id = '00000000-0000-4000-8000-000000000002'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe('claude-opus-4-8');
    // The point of the column: the alias asked for and the snapshot that
    // answered are different strings, and the ledger keeps both.
    expect(rows[0].resolved_model).toBe('claude-opus-4-8-20260210');
    expect(Number(rows[0].temperature)).toBeCloseTo(0.3, 2);
    expect(rows[0].region).toBe('us');
  });

  it('round-trips every provenance column, at the longest values the gateway writes (D6)', async () => {
    // An oversize value fails the whole INSERT inside the writer's catch, and
    // the ledger records nothing: each value here is the longest of its kind.
    const logger = new GatewayAuditLogger(pool);
    await logger.log(
      entry({
        requestId: '00000000-0000-4000-8000-000000000005',
        region: 'us,eu,apac,global',
        payloadProvenance: 'tenant_governed',
        dataClass: 'unscreened_media',
        tenantPolicyResolution: 'unresolvable',
        tenantBoundFrom: 'platform_scope',
        placementReasonCode: 'audit_only:DENY_UNAPPROVED_DATA_CLASS',
        approvedModelId: 'claude-opus-4-bedrock',
        pinnedVersion: 'us.anthropic.claude-opus-4-7-20260115-v1:0',
        pqStatus: 'unregistered',
        riskTier: 'medium',
        runId: '00000000-0000-4000-8000-0000000000aa',
        parentRunId: '00000000-0000-4000-8000-0000000000bb',
        serverToolsUsed: ['web_search'],
        serverToolsWithheld: [{ name: 'web_fetch', reason: 'not_first_party' }],
      } as Partial<AuditLogEntry>),
    );

    const { rows } = await pool.query(
      `SELECT region, payload_provenance, data_class, tenant_policy_resolution, tenant_bound_from,
              placement_reason_code, approved_model_id, pinned_version, pq_status, risk_tier,
              run_id, parent_run_id, server_tools_used, server_tools_withheld
         FROM ai.gateway_audit_log WHERE request_id = '00000000-0000-4000-8000-000000000005'`,
    );
    expect(rows).toEqual([
      {
        region: 'us,eu,apac,global',
        payload_provenance: 'tenant_governed',
        data_class: 'unscreened_media',
        tenant_policy_resolution: 'unresolvable',
        tenant_bound_from: 'platform_scope',
        placement_reason_code: 'audit_only:DENY_UNAPPROVED_DATA_CLASS',
        approved_model_id: 'claude-opus-4-bedrock',
        pinned_version: 'us.anthropic.claude-opus-4-7-20260115-v1:0',
        pq_status: 'unregistered',
        risk_tier: 'medium',
        run_id: '00000000-0000-4000-8000-0000000000aa',
        parent_run_id: '00000000-0000-4000-8000-0000000000bb',
        server_tools_used: ['web_search'],
        server_tools_withheld: [{ name: 'web_fetch', reason: 'not_first_party' }],
      },
    ]);
  });

  it('upgrades a table in the pre-2026-09-26 shape: columns added, region widened, rows kept (Rule 1)', async () => {
    // The migration re-runs on every deploy against a table that already
    // exists. Put the table back in its old shape, with a row in it, and apply
    // the file again.
    const added = LEDGER_COLUMNS.slice(LEDGER_COLUMNS.indexOf('payload_provenance'));
    // An old table never held a region past 16 characters; this suite's rows can.
    await pool.query('DELETE FROM ai.gateway_audit_log WHERE caller_module = $1', [CALLER]);
    await pool.query(
      `ALTER TABLE ai.gateway_audit_log ${added.map(c => `DROP COLUMN IF EXISTS ${c}`).join(', ')},
         ALTER COLUMN region TYPE VARCHAR(16)`,
    );
    await pool.query(
      `INSERT INTO ai.gateway_audit_log (request_id, timestamp, provider, model, task_type, strategy, caller_module,
         input_tokens, output_tokens, total_tokens, estimated_cost_usd, latency_ms, success, cached, deterministic, region)
       VALUES ('00000000-0000-4000-8000-000000000006', now(), 'anthropic', 'claude-opus-4-8', 'general', 'task_based', $1,
         1, 1, 2, 0, 1, true, false, false, 'eu')`,
      [CALLER],
    );

    await pool.query(fs.readFileSync(MIGRATION, 'utf8'));

    const cols = await pool.query(
      `SELECT column_name, character_maximum_length FROM information_schema.columns
        WHERE table_schema = 'ai' AND table_name = 'gateway_audit_log'`,
    );
    const present = new Map(cols.rows.map((r: any) => [r.column_name, r.character_maximum_length]));
    for (const column of added) expect(present.has(column), `missing column ${column}`).toBe(true);
    expect(present.get('region')).toBe(64);
    const kept = await pool.query(
      `SELECT region, payload_provenance FROM ai.gateway_audit_log WHERE request_id = '00000000-0000-4000-8000-000000000006'`,
    );
    // Not backfilled: an old row's new columns are NULL (the header note says so).
    expect(kept.rows).toEqual([{ region: 'eu', payload_provenance: null }]);

    // And a second run is a no-op.
    await pool.query(fs.readFileSync(MIGRATION, 'utf8'));
    const again = await pool.query(
      `SELECT character_maximum_length FROM information_schema.columns
        WHERE table_schema = 'ai' AND table_name = 'gateway_audit_log' AND column_name = 'region'`,
    );
    expect(again.rows[0].character_maximum_length).toBe(64);
  });

  it('stores NULL rather than inventing a resolution the provider never gave', async () => {
    const logger = new GatewayAuditLogger(pool);
    await logger.log(
      entry({ requestId: '00000000-0000-4000-8000-000000000003', resolvedModel: undefined }),
    );

    const { rows } = await pool.query(
      `SELECT model, resolved_model FROM ai.gateway_audit_log
        WHERE request_id = '00000000-0000-4000-8000-000000000003'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe('claude-opus-4-8');
    // NOT copied across from `model` — "the provider did not tell us" is true,
    // a manufactured resolution is not.
    expect(rows[0].resolved_model).toBeNull();
  });

  it('records the EFFECTIVE temperature: NULL means no sampling parameter was sent', async () => {
    const logger = new GatewayAuditLogger(pool);
    await logger.log(
      entry({
        requestId: '00000000-0000-4000-8000-000000000004',
        model: 'claude-opus-4-7',
        temperature: undefined,
      }),
    );

    const { rows } = await pool.query(
      `SELECT temperature FROM ai.gateway_audit_log
        WHERE request_id = '00000000-0000-4000-8000-000000000004'`,
    );
    expect(rows[0].temperature).toBeNull();
  });

  it('initialize() throws — naming the role — when the store is not writable', async () => {
    // A pool that answers the existence probe but reports no INSERT privilege:
    // the case a CREATE TABLE IF NOT EXISTS could never distinguish, because it
    // succeeded as a no-op and the INSERT then failed into the same catch.
    const unwritable = {
      query: async (sql: string) => {
        if (sql.includes('to_regclass')) return { rows: [{ present: true }] };
        return { rows: [{ role: 'app_service', can_insert: false }] };
      },
    };
    const logger = new GatewayAuditLogger(unwritable);
    await expect(logger.initialize()).rejects.toThrow(/app_service.*lacks INSERT/s);
  });

  it('initialize() throws when the table is absent, and says which migration creates it', async () => {
    const empty = {
      query: async () => ({ rows: [{ present: false }] }),
    };
    const logger = new GatewayAuditLogger(empty);
    await expect(logger.initialize()).rejects.toThrow(
      /20260813_ai_gateway_audit_log\.sql/,
    );
  });

  it('initialize() passes against the provisioned table', async () => {
    const logger = new GatewayAuditLogger(pool);
    await expect(logger.initialize()).resolves.toBeUndefined();
  });
});
