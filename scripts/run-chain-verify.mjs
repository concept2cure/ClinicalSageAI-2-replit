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
 *   0  chain INTACT
 *   1  chain BROKEN (broken links detected)
 *   2  configuration / runtime error
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

  const broken = [];
  const prevByOrg = new Map();
  for (const row of rows) {
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
  const verdict = rows.length === 0 ? 'EMPTY' : broken.length === 0 ? 'INTACT' : 'BROKEN';
  const report = {
    schemaVersion: '1.0',
    window,
    startedAt,
    finishedAt,
    verdict,
    totalEntries: rows.length,
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
    try {
      await pool.query(
        `INSERT INTO audit_events
          (organization_id, event_type, entity_type, entity_id, user_id, user_name,
           user_role, ip_address, timestamp, reason, metadata, regulatory_significant, gxp_relevant)
         VALUES (1, 'audit.chain_integrity_failure', 'audit_chain', 'cron_verify',
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

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('[chain-verify] fatal:', err);
  process.exit(2);
});
