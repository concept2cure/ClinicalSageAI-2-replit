#!/usr/bin/env node
/**
 * Inspect or recover Data Room capture processing for one organization (D2).
 * Uses the canonical tenant-scoped processor; this command contains no SQL or
 * repair writes. Dry-run performs selection only, without loading/extracting
 * stored bytes or claiming work. Apply is an explicit operator action.
 *
 * Node 22, from the repository root:
 *   node --import tsx scripts/process-data-room-captures.mjs --org 42
 *   node --import tsx scripts/process-data-room-captures.mjs --org 42 --apply
 *   node --import tsx scripts/process-data-room-captures.mjs --org 42 --source 71 --retry-failed --apply
 *
 * Exit 2: invalid arguments; 1: unavailable/unresolved work; 0: clean report.
 * Counts describe a bounded run, never the entire organization. Stdout is a
 * whitelisted JSON report. Stderr contains safe codes, never caught errors.
 */
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_ROOM_PROCESSING_REASON_CODES } from '../shared/data-room-processing-status.js';

const USAGE = 'node --import tsx scripts/process-data-room-captures.mjs --org <id> [--source <id>] [--limit 1..500] [--retry-failed] [--apply]';
const VALUE_ARGS = new Set(['--org', '--source', '--limit']);
const FLAG_ARGS = new Set(['--retry-failed', '--apply']);
const REASON_CODES = new Set(DATA_ROOM_PROCESSING_REASON_CODES);
const CLEAN_STATUSES = new Set(['candidate', 'completed', 'already_complete']);
const STATUSES = new Set([
  ...CLEAN_STATUSES, 'extraction_failed', 'retryable_failure', 'blocked',
  'stale_source', 'busy', 'retry_not_due', 'retry_exhausted',
]);
const DIAGNOSTIC_KEYS = [
  'blocked', 'busy', 'retry_not_due', 'retry_exhausted', 'extraction_failed', 'stale_source',
];

function positiveDecimal(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) throw new Error('USAGE_ERROR');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('USAGE_ERROR');
  return n;
}

/** Validate the complete argument list before importing any database module. */
export function parseRecoveryArgs(argv) {
  const values = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i];
    if ((!VALUE_ARGS.has(name) && !FLAG_ARGS.has(name)) || values.has(name)) throw new Error('USAGE_ERROR');
    if (FLAG_ARGS.has(name)) values.set(name, true);
    else {
      values.set(name, positiveDecimal(argv[i + 1]));
      i += 1;
    }
  }
  const organizationId = values.get('--org');
  if (!organizationId) throw new Error('USAGE_ERROR');
  const limit = values.get('--limit') ?? 50;
  if (limit > 500) throw new Error('USAGE_ERROR');
  return {
    organizationId, sourceId: values.get('--source'), limit,
    retryFailed: values.has('--retry-failed'), apply: values.has('--apply'),
  };
}

class InvalidReport extends Error {}

function assertReport(condition) {
  if (!condition) throw new InvalidReport('REPORT_INVALID');
}

function safeCount(value) {
  assertReport(Number.isSafeInteger(value) && value >= 0);
  return value;
}

function safeSourceId(value) {
  assertReport(Number.isSafeInteger(value) && value > 0);
  return value;
}

function safeReasonCode(value) {
  return REASON_CODES.has(value) ? value : 'UNSPECIFIED';
}

function safeItem(item, dryRun) {
  assertReport(item && STATUSES.has(item.status) && (dryRun || item.status !== 'candidate'));
  return {
    sourceId: safeSourceId(item.sourceId), status: item.status,
    ...(item.reasonCode === undefined ? {} : { reasonCode: safeReasonCode(item.reasonCode) }),
  };
}

function hasUnresolvedOutcome(counts, diagnosticCounts, unreadable, items) {
  return counts.failed > 0 || counts.blocked > 0 || unreadable.length > 0
    || Object.values(diagnosticCounts).some(count => count > 0)
    || items.some(item => !CLEAN_STATUSES.has(item.status));
}

/** Whitelist the core report, including its separate bounded diagnostics. */
function operatorReport(r, args) {
  assertReport(r && r.dryRun === !args.apply && r.limit === args.limit);
  const counts = Object.fromEntries(['examined', 'processed', 'completed', 'failed', 'blocked', 'skipped']
    .map(key => [key, safeCount(r[key])]));
  assertReport(counts.examined <= args.limit && counts.processed === counts.completed && counts.completed <= counts.examined);
  assertReport(!r.dryRun || (counts.processed === 0 && counts.completed === 0));
  const diagnosticLimit = safeCount(r.diagnosticLimit);
  assertReport(diagnosticLimit >= 1 && diagnosticLimit <= 500 && typeof r.diagnosticsCapped === 'boolean');
  assertReport(Array.isArray(r.items) && r.items.length <= args.limit + diagnosticLimit);
  assertReport(Array.isArray(r.unreadable) && r.unreadable.length <= args.limit + diagnosticLimit);
  assertReport(r.diagnosticCounts && typeof r.diagnosticCounts === 'object');
  const diagnosticCounts = Object.fromEntries(DIAGNOSTIC_KEYS.map(key => [key, safeCount(r.diagnosticCounts[key])]));
  const items = r.items.map(item => safeItem(item, r.dryRun));
  const unreadable = r.unreadable.map(item => ({
    sourceId: safeSourceId(item.sourceId), reasonCode: safeReasonCode(item.reason),
  }));
  assertReport(args.sourceId === undefined || [...items, ...unreadable].every(item => item.sourceId === args.sourceId));
  const unresolved = hasUnresolvedOutcome(counts, diagnosticCounts, unreadable, items);
  return {
    code: 'RECOVERY_REPORT', outcome: unresolved ? 'unresolved' : 'clean',
    organizationId: args.organizationId, sourceId: args.sourceId ?? null,
    dryRun: r.dryRun, limit: args.limit, diagnosticLimit, diagnosticsCapped: r.diagnosticsCapped,
    ...counts, diagnosticCounts, items, unreadable,
  };
}

async function loadCanonicalService() {
  // The wrapper's scoped lookup proves connectivity. Avoid the runtime's
  // independent startup probe/retry timer in this bounded one-shot command.
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  // Imported application loggers write to stdout and may carry provider error
  // prose. This process reports safe outcome codes through its own writer.
  process.env.LOG_LEVEL = 'silent';
  const runtime = await import('../server/db/runtime.js');
  try {
    const service = await import('../server/services/clinical-regulatory-evidence/data-room-processing.js');
    if (typeof service.processPendingSourcesForTenant !== 'function') throw new Error('PROCESSOR_UNAVAILABLE');
    const database = runtime.getPool();
    return {
      processPendingSourcesForTenant: service.processPendingSourcesForTenant,
      close: () => database.end(),
    };
  } catch (error) {
    // Imports may initialize the pool before rejecting. Release it without
    // replacing the original failure or printing its private message.
    try { await runtime.getPool().end(); } catch { /* no usable pool */ }
    throw error;
  }
}

function errorCode(error) {
  if (error instanceof InvalidReport) return 'REPORT_INVALID';
  if (error instanceof Error && error.message === 'Database connection not available') return 'DATABASE_UNAVAILABLE';
  return 'RECOVERY_UNAVAILABLE';
}

/** Dependency injection is for local tests, never a CLI-selectable module. */
export async function runRecoveryCli(argv, {
  loadService = loadCanonicalService,
  stdout = line => process.stdout.write(`${line}\n`),
  stderr = line => process.stderr.write(`${line}\n`),
} = {}) {
  let args;
  try { args = parseRecoveryArgs(argv); } catch {
    stderr(JSON.stringify({ code: 'USAGE_ERROR', usage: USAGE }));
    return 2;
  }
  let service;
  let exitCode = 1;
  try {
    service = await loadService();
    const result = await service.processPendingSourcesForTenant(args.organizationId, {
      sourceId: args.sourceId, limit: args.limit, retryFailed: args.retryFailed, apply: args.apply,
    });
    const output = operatorReport(result, args);
    stdout(JSON.stringify(output));
    exitCode = output.outcome === 'clean' ? 0 : 1;
  } catch (error) {
    stderr(JSON.stringify({ code: errorCode(error) }));
  } finally {
    if (service?.close) {
      try { await service.close(); } catch {
        stderr(JSON.stringify({ code: 'CLEANUP_FAILED' }));
        exitCode = 1;
      }
    }
  }
  return exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runRecoveryCli(process.argv.slice(2));
}
