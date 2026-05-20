#!/usr/bin/env node
/**
 * Backfill the regulatory precedent pattern library for existing organizations.
 *
 * Usage:
 *   node scripts/seed-regulatory-patterns.mjs                  # All organizations
 *   node scripts/seed-regulatory-patterns.mjs --org-id 42      # One organization
 *   node scripts/seed-regulatory-patterns.mjs --dry-run        # Report what would seed
 *
 * The orchestrator is idempotent: patterns whose patternCode is already
 * present for an org are skipped. Safe to re-run.
 */

import pg from 'pg';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register tsx loader so the orchestrator's TS imports resolve.
register('tsx/esm', pathToFileURL('./'));

const { Pool } = pg;

function getDbUrl() {
  const raw = process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL;
  if (raw) {
    let url = raw;
    if (url.startsWith('psql ')) url = url.substring(5);
    if ((url.startsWith("'") && url.endsWith("'")) || (url.startsWith('"') && url.endsWith('"'))) {
      url = url.slice(1, -1);
    }
    return url.trim();
  }
  return 'postgresql://postgres:postgres@127.0.0.1:5432/concept2cure-ri?sslmode=disable';
}

function parseArgs(argv) {
  const opts = { orgId: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--org-id' || a === '-o') opts.orgId = Number(argv[++i]);
  }
  return opts;
}

async function listOrgIds(pool, requested) {
  if (requested != null) {
    const { rows } = await pool.query('SELECT id FROM organizations WHERE id = $1', [requested]);
    if (rows.length === 0) {
      throw new Error(`Organization ${requested} not found`);
    }
    return rows.map(r => Number(r.id));
  }
  const { rows } = await pool.query('SELECT id FROM organizations WHERE status = $1 ORDER BY id', ['active']);
  return rows.map(r => Number(r.id));
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  const dbUrl = getDbUrl();
  const isNeon = dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: isNeon ? { rejectUnauthorized: false } : false,
  });

  process.env.DATABASE_URL = dbUrl;

  let orgIds;
  try {
    orgIds = await listOrgIds(pool, opts.orgId);
  } catch (err) {
    console.error(`Failed to list organizations: ${err.message}`);
    await pool.end();
    process.exit(1);
  }

  console.log(`Seeding regulatory patterns for ${orgIds.length} org(s)${opts.dryRun ? ' (dry run)' : ''}`);
  if (opts.dryRun) {
    for (const id of orgIds) console.log(`  org_id=${id}`);
    await pool.end();
    return;
  }

  // Import the orchestrator after registering tsx.
  const { seedAllRegulatoryPatterns } = await import(
    pathToFileURL(
      new URL('../server/services/regulatory-precedent-intelligence/index.ts', import.meta.url).pathname,
    ).href,
  );

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const orgId of orgIds) {
    const result = await seedAllRegulatoryPatterns(String(orgId));
    const counts = {
      crl: result.crl,
      rtfNonclinical: result.rtfNonclinical,
      rtfCmc: result.rtfCmc,
      advisoryCommittee: result.advisoryCommittee,
      emaQuestions: result.emaQuestions,
      crossJurisdictional: result.crossJurisdictional,
      confidenceCalibration: result.confidenceCalibration,
    };
    const inserted = Object.values(counts).reduce((s, c) => s + c.inserted, 0);
    const skipped = Object.values(counts).reduce((s, c) => s + c.skipped, 0);
    const errors = Object.values(counts).filter(c => c.error).length;
    totalInserted += inserted;
    totalSkipped += skipped;
    totalErrors += errors;
    const errorDetail = Object.entries(counts)
      .filter(([, c]) => c.error)
      .map(([k, c]) => `${k}: ${c.error}`)
      .join('; ');
    console.log(
      `  org_id=${orgId}  inserted=${inserted}  skipped=${skipped}  errors=${errors}` +
        (errorDetail ? `  [${errorDetail}]` : ''),
    );
  }

  console.log(
    `\nDone. inserted=${totalInserted}  skipped=${totalSkipped}  errors=${totalErrors}`,
  );
  await pool.end();
  if (totalErrors > 0) process.exit(2);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
