#!/usr/bin/env node
/**
 * run-chain-verify.mjs — daily hash-chain integrity verification.
 *
 * Walks the `audit_events` hash chain end-to-end (or a 24-hour window)
 * and reports broken links. On failure: emits a non-zero exit code,
 * writes a detailed JSON report to AUDIT_VERIFY_OUT, and inserts an
 * `audit.chain_integrity_failure` event into the audit trail of each
 * organisation whose chain broke, so the failure is part of that trail.
 *
 * Cron entries (production):
 *   # Daily 24-hour scan
 *   30 2 * * *  node scripts/run-chain-verify.mjs --window=24h
 *   # Weekly full scan
 *   0  4 * * 0  node scripts/run-chain-verify.mjs --window=full
 *
 * Required env:
 *   DATABASE_URL or DATABASE_NEON_NEW_SECRET
 *
 * Optional env:
 *   AUDIT_VERIFY_OUT   Output JSON path (default: ./.chain-verify/<ts>.json)
 *
 * Exit codes:
 *   0  chain INTACT (at least one row was checkable and every link held)
 *   1  chain BROKEN (broken links detected)
 *   2  configuration / runtime error
 *   3  chain UNVERIFIED — rows were read but none carried a record_hash, so
 *      nothing was checkable. Not intact and not broken: no integrity
 *      statement can be made. See WO-16C #72.
 *   4  chain BROKEN, and the failure event could not be recorded in every
 *      affected organisation's trail (the report's failureEvents says which).
 */
import pg from 'pg';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { Pool } = pg;

/**
 * Record a broken chain in the audit trail of each organisation whose chain
 * broke, naming only that organisation's links. Returns, per organisation,
 * whether the event was recorded.
 *
 * Until 2026-10-15 one event went to organisation 1 with every tenant's
 * links, as user_id 0 — which audit_events_user_id_users_id_fk refuses, so
 * on a migrated database it was never recorded — named 'system' from
 * 127.0.0.1, and the refusal was only logged. The actor is this scheduled
 * job: it has no user id and no client address, so both are NULL (as SCIM
 * provisioning records itself). entity_id 0: the entity is the chain itself.
 */
export async function recordChainFailures(pool, broken, { window, totalEntries }) {
  const byOrg = new Map();
  for (const link of broken) {
    const list = byOrg.get(link.organizationId) ?? [];
    list.push(link);
    byOrg.set(link.organizationId, list);
  }
  const outcomes = [];
  for (const [organizationId, links] of byOrg) {
    try {
      await pool.query(
        `INSERT INTO audit_events
          (organization_id, event_type, entity_type, entity_id, user_id, user_name,
           user_role, ip_address, timestamp, reason, metadata, regulatory_significant, gxp_relevant)
         VALUES ($1, 'audit.chain_integrity_failure', 'audit_chain.cron_verify', 0,
                 NULL, 'chain-verify scheduled job', 'system', NULL, NOW(), $2, $3, true, true)`,
        [
          organizationId,
          `Chain integrity verification failed: ${links.length} broken link(s) in this organisation's audit trail`,
          JSON.stringify({ window, brokenLinks: links.slice(0, 20), brokenLinkCount: links.length, totalEntries }),
        ],
      );
      outcomes.push({ organizationId, recorded: true });
    } catch (err) {
      console.error(`[chain-verify] The failure event for organisation ${organizationId} was not recorded:`, err.message);
      outcomes.push({ organizationId, recorded: false, error: err.message });
    }
  }
  return outcomes;
}

function arg(name) {
  const m = process.argv.find(a => a.startsWith(`--${name}=`));
  return m ? m.slice(`--${name}=`.length) : null;
}

function getDbUrl() {
  const raw = process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL;
  if (!raw) {
    console.error('ERROR: Set DATABASE_URL or DATABASE_NEON_NEW_SECRET');
    process.exit(2);
  }
  let url = raw;
  if (url.startsWith('psql ')) url = url.substring(5);
  return url.trim();
}

async function main() {
  const window = arg('window') || '24h';
  const dbUrl = getDbUrl();
  const isNeon = dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: isNeon ? { rejectUnauthorized: false } : false,
  });

  let timeFilter = '';
  const params = [];
  if (window === '24h') {
    timeFilter = `WHERE timestamp > NOW() - INTERVAL '24 hours'`;
  } else if (window === 'full') {
    timeFilter = '';
  } else if (window.endsWith('d')) {
    const days = parseInt(window.slice(0, -1), 10);
    timeFilter = `WHERE timestamp > NOW() - INTERVAL '${days} days'`;
  } else {
    console.error(`Unsupported --window=${window}; use 24h | full | <N>d`);
    process.exit(2);
  }

  console.log(`[chain-verify] starting; window=${window}`);
  const startedAt = new Date().toISOString();

  const { rows } = await pool.query(
    `SELECT id, organization_id, sequence_number, record_hash, previous_hash, timestamp
     FROM audit_events
     ${timeFilter}
     ORDER BY organization_id ASC, sequence_number ASC`,
    params,
  );

  // WO-16C #72 (follow-up). This walk skipped any row carrying a NULL
  // `record_hash` — it could not compare one — but counted it in
  // `totalEntries` and never counted the skip, so an audit_events table in
  // which nothing was hashed produced `verdict: 'INTACT'`, `brokenLinks: 0`,
  // a totalEntries covering every row, and exit 0, whose documented meaning is
  // "chain INTACT". That report is written to .chain-verify/ and cited by
  // docs/operations/database-disaster-recovery.md as audit-integrity evidence.
  //
  // Until the hash-chain trigger landed this week, a canonically provisioned
  // database had NULL record_hash on every row, so this script's steady state
  // was a green attestation over a chain it had not verified. Counting the
  // unhashable rows is what makes the difference visible, and an all-unhashed
  // scan is UNVERIFIED — not INTACT, and not BROKEN either.
  const broken = [];
  const prevByOrg = new Map();
  let hashedEntries = 0;
  let unhashedEntries = 0;
  for (const row of rows) {
    if (row.record_hash === null || row.record_hash === undefined) {
      unhashedEntries += 1;
      // Explicit: a row with no hash cannot anchor the next comparison.
      prevByOrg.set(row.organization_id, null);
      continue;
    }
    hashedEntries += 1;
    const expectedPrev = prevByOrg.get(row.organization_id) ?? null;
    if (
      expectedPrev !== null &&
      row.previous_hash !== null &&
      row.previous_hash !== expectedPrev
    ) {
      broken.push({
        id: row.id,
        organizationId: row.organization_id,
        sequenceNumber: row.sequence_number,
        timestamp: row.timestamp,
      });
    }
    prevByOrg.set(row.organization_id, row.record_hash);
  }

  const finishedAt = new Date().toISOString();
  const verdict =
    rows.length === 0
      ? 'EMPTY'
      : broken.length > 0
        ? 'BROKEN'
        : hashedEntries === 0
          ? 'UNVERIFIED'
          : 'INTACT';
  const report = {
    schemaVersion: '1.2',
    window,
    startedAt,
    finishedAt,
    verdict,
    totalEntries: rows.length,
    // What the verdict actually rests on. `INTACT` over hashedEntries < total
    // means the unhashed remainder was not checked by anything.
    hashedEntries,
    unhashedEntries,
    reason:
      verdict === 'UNVERIFIED'
        ? `no row in this window carries a record_hash: ${rows.length} row(s) read, none checkable`
        : verdict === 'EMPTY'
          ? 'no entries in this window: there is no chain to verify'
          : undefined,
    organizationsCovered: prevByOrg.size,
    brokenLinks: broken.length,
    brokenLinkSamples: broken.slice(0, 50),
    // Per affected organisation: was the failure recorded in its trail.
    failureEvents: verdict === 'BROKEN'
      ? await recordChainFailures(pool, broken, { window, totalEntries: rows.length })
      : undefined,
  };

  const outPath =
    process.env.AUDIT_VERIFY_OUT ||
    path.join(
      '.chain-verify',
      `${finishedAt.replace(/[:.]/g, '-')}.json`,
    );
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`[chain-verify] verdict=${verdict} totalEntries=${rows.length} broken=${broken.length}`);
  console.log(`[chain-verify] report=${outPath}`);

  if (verdict === 'BROKEN') {
    await pool.end();
    process.exit(report.failureEvents.every((e) => e.recorded) ? 1 : 4);
  }

  // WO-16C #72 (follow-up). Exit 0 is documented as "chain INTACT", so a scan
  // that verified nothing must not take it. It is not exit 1 either: nothing is
  // known to be broken, and paging an operator for a break that was not found
  // would be its own false claim. Exit 3 says what happened.
  if (verdict === 'UNVERIFIED') {
    console.error(
      `[chain-verify] UNVERIFIED — ${report.reason}. No integrity statement can be made about this window.`,
    );
    await pool.end();
    process.exit(3);
  }

  await pool.end();
  process.exit(0);
}

// Run as the cron entry; importing the module (tests) runs nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error('[chain-verify] fatal:', err);
    process.exit(2);
  });
}
