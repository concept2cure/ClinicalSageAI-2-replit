#!/usr/bin/env node
/**
 * verify-audit-chain — walk every chained audit table and refuse on the first
 * break. D5 evidence for docs/LAUNCH_DEFINITION_OF_DONE.md ("audit-chain
 * verifier run on production and its output filed").
 *
 *   npm run ops:verify-audit-chain            # human report, exit 0/1/2
 *   npm run ops:verify-audit-chain -- --json  # one JSON document on stdout
 *
 * Tables (docs/AUDIT_INTEGRITY_HMAC_PLAN.md names the last two; the first is
 * the 21 CFR Part 11 store server/lib/tamper-proof-audit.ts writes):
 *
 *   audit.tamper_proof_log   previous_hash → content_hash → chain_hash, plus an
 *                            HMAC-SHA256 `signature` over chain_hash keyed by
 *                            AUDIT_HMAC_SECRET. Verified with the SAME exported
 *                            function the service's verifyChain runs
 *                            (verifyTamperProofLogRows) — one recipe, not two.
 *   public.audit_logs        sha256_chain (server/services/audit/chain.ts) and
 *                            the optional hmac_seal keyed by AUDIT_HMAC_KEY.
 *   public.audit_events      record_hash/previous_hash set by the DB trigger
 *                            audit_events_hash_chain (recomputed here IN SQL
 *                            with the trigger's own expression, per org), and
 *                            the optional hmac_seal keyed by AUDIT_HMAC_KEY.
 *
 * Exit codes: 0 every link verified; 1 a break was found (the first is named);
 * 2 the verifier could not run (no database, missing secret for a signed row,
 * missing table). Silence is never success: a table that cannot be checked is
 * reported as such and exits 2.
 *
 * Read-only. Opens one connection, issues SELECTs only, never writes a
 * verification row (the service's verifyChain appends one; this does not).
 *
 * Runs under tsx (package.json) so it can import the TypeScript verifiers the
 * writers share; `verifyAuditChains(client, opts)` is exported so a proof can
 * run it INSIDE a transaction it then rolls back — that is how
 * docs/evidence/W3b/2026-09-20/verify-audit-chain-fail-proof.txt was produced.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { verifyTamperProofLogRows } from '../../server/lib/tamper-proof-audit.ts';
import {
  verifyAuditChain,
  verifyAuditChainSeals,
  verifyAuditEventsChainSeals,
} from '../../server/services/audit/chain.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });

const DEV_FALLBACK_SECRET = 'INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION';

/** Resolve the tamper-proof chain secret exactly as the writer does. */
export function resolveChainSecret(env = process.env) {
  const secret = (env.AUDIT_HMAC_SECRET || '').trim();
  if (secret) return { secret, source: 'AUDIT_HMAC_SECRET' };
  if ((env.NODE_ENV || '').toLowerCase() === 'production') return { secret: null, source: 'missing' };
  return { secret: DEV_FALLBACK_SECRET, source: 'development-fallback (same value the writer used)' };
}

async function tableExists(client, qualified) {
  const r = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [qualified]);
  return r.rows[0]?.present === true;
}

async function verifyTamperProofLog(client, env) {
  const name = 'audit.tamper_proof_log';
  if (!(await tableExists(client, name))) return { table: name, status: 'unverifiable', reason: 'table absent' };
  const { rows } = await client.query('SELECT * FROM audit.tamper_proof_log ORDER BY sequence_number ASC');
  const signedRows = rows.filter((r) => r.signature).length;
  const { secret, source } = resolveChainSecret(env);
  if (signedRows > 0 && !secret) {
    return { table: name, status: 'unverifiable', rows: rows.length, signedRows, reason: 'AUDIT_HMAC_SECRET is not set and signed rows exist' };
  }
  const v = verifyTamperProofLogRows(rows, { hmacSecret: secret ?? '' });
  return {
    table: name,
    status: v.valid ? 'ok' : 'broken',
    rows: rows.length,
    chainedRows: v.entriesVerified,
    signedRows: v.signedEntries,
    secretSource: source,
    lastChainHash: v.lastChainHash,
    ...(v.valid ? {} : { firstBreak: { sequence: v.firstInvalidEntry, reason: v.invalidReason } }),
  };
}

async function verifyAuditLogs(client, env) {
  const name = 'public.audit_logs';
  if (!(await tableExists(client, name))) return { table: name, status: 'unverifiable', reason: 'table absent' };
  const counts = (await client.query(
    'SELECT count(*)::int AS total, count(sha256_chain)::int AS chained, count(hmac_seal)::int AS sealed FROM audit_logs',
  )).rows[0];
  const chain = await verifyAuditChain(client);
  const out = { table: name, status: 'ok', rows: counts.total, chainedRows: chain.rowsChecked, sealedRows: counts.sealed };
  if (!chain.ok) {
    return { ...out, status: 'broken', firstBreak: { id: chain.brokenAt.id, reason: 'sha256_chain mismatch', expected: chain.brokenAt.expected, stored: chain.brokenAt.stored } };
  }
  if (counts.sealed > 0) {
    if (!env.AUDIT_HMAC_KEY) return { ...out, status: 'unverifiable', reason: 'AUDIT_HMAC_KEY is not set and sealed rows exist' };
    const seals = await verifyAuditChainSeals(client);
    if (!seals.valid) return { ...out, status: 'broken', firstBreak: { sealedIndex: seals.brokenAt, reason: 'hmac_seal does not verify' } };
    out.sealsVerified = counts.sealed;
  }
  return out;
}

async function verifyAuditEvents(client, env) {
  const name = 'public.audit_events';
  if (!(await tableExists(client, name))) return { table: name, status: 'unverifiable', reason: 'table absent' };
  const counts = (await client.query(
    'SELECT count(*)::int AS total, count(record_hash)::int AS chained, count(hmac_seal)::int AS sealed FROM audit_events',
  )).rows[0];
  // Recompute record_hash per org with the trigger's exact expression
  // (db/migrations/20260222_audit_events_hash_chain.sql) and check
  // previous_hash continuity in sequence order. Rows written before the
  // trigger (record_hash NULL) are outside the chain and reported as such.
  const walk = await client.query(`
    WITH chained AS (
      SELECT id, organization_id, sequence_number, record_hash, previous_hash,
             LAG(record_hash) OVER (PARTITION BY organization_id ORDER BY sequence_number, id) AS expected_previous,
             encode(sha256(convert_to(
               COALESCE(sequence_number::text, '') || '|' ||
               COALESCE(event_type, '') || '|' ||
               COALESCE(entity_type, '') || '|' ||
               COALESCE(entity_id::text, '') || '|' ||
               COALESCE(user_id::text, '') || '|' ||
               COALESCE(user_name, '') || '|' ||
               COALESCE("timestamp"::text, '') || '|' ||
               COALESCE(reason, '') || '|' ||
               COALESCE(previous_hash, 'GENESIS'), 'UTF8')), 'hex') AS recomputed
        FROM audit_events
       WHERE record_hash IS NOT NULL
    )
    SELECT id, organization_id, sequence_number,
           (record_hash = recomputed) AS hash_ok,
           (previous_hash IS NOT DISTINCT FROM expected_previous) AS link_ok
      FROM chained
     WHERE record_hash <> recomputed OR previous_hash IS DISTINCT FROM expected_previous
     ORDER BY organization_id, sequence_number, id
     LIMIT 1`);
  const out = { table: name, status: 'ok', rows: counts.total, chainedRows: counts.chained, unchainedRows: counts.total - counts.chained, sealedRows: counts.sealed };
  if (walk.rows.length) {
    const b = walk.rows[0];
    return { ...out, status: 'broken', firstBreak: { id: b.id, organizationId: b.organization_id, sequence: b.sequence_number, reason: !b.hash_ok ? 'record_hash mismatch' : 'previous_hash mismatch' } };
  }
  if (counts.sealed > 0) {
    if (!env.AUDIT_HMAC_KEY) return { ...out, status: 'unverifiable', reason: 'AUDIT_HMAC_KEY is not set and sealed rows exist' };
    const seals = await verifyAuditEventsChainSeals(client);
    if (!seals.valid) return { ...out, status: 'broken', firstBreak: { sealedIndex: seals.brokenAt, reason: 'hmac_seal does not verify' } };
    out.sealsVerified = counts.sealed;
  }
  return out;
}

/** Verify every chained table on `client`. Pure over the connection: SELECTs only. */
export async function verifyAuditChains(client, env = process.env) {
  const tables = [await verifyTamperProofLog(client, env), await verifyAuditLogs(client, env), await verifyAuditEvents(client, env)];
  const broken = tables.filter((t) => t.status === 'broken');
  const unverifiable = tables.filter((t) => t.status === 'unverifiable');
  const verdict = broken.length ? 'broken' : unverifiable.length ? 'unverifiable' : 'ok';
  return { verifiedAt: new Date().toISOString(), verdict, exitCode: verdict === 'ok' ? 0 : verdict === 'broken' ? 1 : 2, tables };
}

export function renderReport(report) {
  const lines = [`verify-audit-chain @ ${report.verifiedAt}`, `verdict: ${report.verdict.toUpperCase()}`, ''];
  for (const t of report.tables) {
    lines.push(`${t.table}: ${t.status.toUpperCase()}`);
    for (const [k, v] of Object.entries(t)) {
      if (k === 'table' || k === 'status') continue;
      lines.push(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const json = process.argv.includes('--json');
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('verify-audit-chain: DATABASE_URL is not set');
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    console.error(`verify-audit-chain: cannot connect: ${err.message}`);
    process.exit(2);
  }
  try {
    const report = await verifyAuditChains(client, process.env);
    if (json) console.log(JSON.stringify(report, null, 2));
    else console.log(renderReport(report));
    process.exit(report.exitCode);
  } finally {
    await client.end();
  }
}

const invokedDirectly = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`verify-audit-chain: ${err.stack || err.message}`);
    process.exit(2);
  });
}
