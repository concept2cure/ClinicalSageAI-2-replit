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
import { GatewayAuditLogger } from '../../server/services/ai-gateway/audit';
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
    // The exact 29 identifiers in the INSERT in audit.ts. A column added to the
    // writer without a matching migration fails here rather than at runtime,
    // where the failure would land in the swallowing catch.
    for (const column of [
      'request_id', 'timestamp', 'provider', 'model', 'resolved_model', 'task_type',
      'strategy', 'organization_id', 'user_id', 'project_id', 'caller_module',
      'input_tokens', 'output_tokens', 'total_tokens', 'estimated_cost_usd',
      'latency_ms', 'success', 'error', 'cached', 'deterministic', 'metadata',
      'temperature', 'seed', 'prompt_hash', 'prompt_version', 'tried_models',
      'substrate', 'region', 'retention_policy',
    ]) {
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
