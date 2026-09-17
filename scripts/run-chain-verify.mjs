#!/usr/bin/env node
/**
 * run-chain-verify.mjs — daily hash-chain integrity verification.
 *
 * Walks the `audit_events` hash chain end-to-end (or a 24-hour window)
 * and reports broken links. On failure: emits a non-zero exit code,
 * writes a detailed JSON report to AUDIT_VERIFY_OUT, and inserts a
 * `audit.chain_integrity_failure` event into audit_events itself so
 * the failure is part of the trail.
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
 */
import pg from 'pg';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const { Pool } = pg;

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
    schemaVersion: '1.1',
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
    // Record the failure in the chain itself so it persists across restarts.
    // entity_id is INTEGER per the schema. Use 0 as a sentinel for system-
    // originated events (the entity is the chain itself, not a domain row).
    // entity_type carries the human-readable scope.
    try {
      await pool.query(
        `INSERT INTO audit_events
          (organization_id, event_type, entity_type, entity_id, user_id, user_name,
           user_role, ip_address, timestamp, reason, metadata, regulatory_significant, gxp_relevant)
         VALUES (1, 'audit.chain_integrity_failure', 'audit_chain.cron_verify', 0,
                 0, 'system', 'system', '127.0.0.1', NOW(), $1, $2, true, true)`,
        [
          `Chain integrity verification failed: ${broken.length} broken link(s)`,
          JSON.stringify({
            window,
            brokenLinks: broken.slice(0, 20),
            totalEntries: rows.length,
          }),
        ],
      );
    } catch (err) {
      console.error('[chain-verify] Failed to log failure event:', err.message);
    }

    await pool.end();
    process.exit(1);
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

main().catch(err => {
  console.error('[chain-verify] fatal:', err);
  process.exit(2);
});
