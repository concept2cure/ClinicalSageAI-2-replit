#!/usr/bin/env node
/**
 * Find — and only on an explicit flag, remove — the fabricated CAPA rows that
 * db/migrations/030_stability_results.sql inserted on every deploy.
 *
 * ── WHAT HAPPENED ────────────────────────────────────────────────────────────
 * Until 2026-09-10 that migration ended with:
 *
 *   INSERT INTO capa (study_id, title, why, owner, due_date, status) VALUES
 *   ('STAB-001', 'Investigate Dissolution OOT at ACC 3M', ..., 'Dr. Johnson', ...),
 *   ('STAB-002', 'Review Water Content Methodology', ..., 'QA Team', ...);
 *
 * No DO-block guard, no WHERE NOT EXISTS, no ON CONFLICT — and `capa.id` is
 * SERIAL, so nothing could dedupe it. The file is entry 600 on an applier that
 * replays every migration on every deploy (CLAUDE.md RULE 1). Each deploy
 * therefore minted two more rows. An estate that has deployed N times carries
 * 2N of them.
 *
 * CAPA is a corrective-and-preventive-action record. These are regulated
 * records, and one of them names an investigator who does not exist.
 *
 * The INSERT is gone. THAT DOES NOT REMOVE ROWS ALREADY WRITTEN, which is what
 * this script is for.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A MIGRATION ─────────────────────────────────
 * A DELETE in a replayed migration would run on every deploy against a
 * regulated table, forever, with no human reading the result. Deleting a CAPA
 * record is also not obviously safe: a customer may have edited one, linked it
 * to a real investigation, or closed it. So this refuses to touch any row that
 * differs from the seed, and defaults to reporting rather than deleting.
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *   DATABASE_URL=... node scripts/ops/audit-fabricated-capa-rows.mjs
 *       Report only. Prints every matching row, and separately every row that
 *       looks seeded but has been MODIFIED. Exit 0 if none found, 1 if any are.
 *
 *   DATABASE_URL=... node scripts/ops/audit-fabricated-capa-rows.mjs --delete
 *       Delete only rows that match the seed EXACTLY on every seeded column.
 *       Modified rows are never deleted — they are reported for a human.
 *
 *   --json    machine-readable output for an evidence pack
 *
 * Run the report against every environment before running --delete on any.
 */
import pg from 'pg';

const args = new Set(process.argv.slice(2));
const DELETE = args.has('--delete');
const JSON_OUT = args.has('--json');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  process.stderr.write('DATABASE_URL is required\n');
  process.exit(2);
}

/**
 * The seed rows, exactly as the migration wrote them.
 *
 * due_date is deliberately NOT part of the match: the migration computed it as
 * CURRENT_DATE + INTERVAL, so every deploy produced a different date and no two
 * copies agree on it. Matching on it would find nothing. Everything else was a
 * literal and is stable.
 */
const SEED_ROWS = [
  {
    study_id: 'STAB-001',
    title: 'Investigate Dissolution OOT at ACC 3M',
    why: 'Result below specification limit requiring investigation',
    owner: 'Dr. Johnson',
    status: 'OPEN',
  },
  {
    study_id: 'STAB-002',
    title: 'Review Water Content Methodology',
    why: 'Trending upward requires method validation review',
    owner: 'QA Team',
    status: 'IN_PROGRESS',
  },
];

const client = new pg.Client({
  connectionString: databaseUrl,
  application_name: 'c2c-audit-fabricated-capa',
});

const out = { exact: [], modified: [], deleted: 0, tableAbsent: false };

try {
  await client.connect();

  const exists = await client.query("SELECT to_regclass('public.capa') AS t");
  if (!exists.rows[0].t) {
    out.tableAbsent = true;
    if (JSON_OUT) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    else process.stdout.write('capa table does not exist here — nothing to audit.\n');
    process.exit(0);
  }

  for (const seed of SEED_ROWS) {
    // Candidates: anything carrying the seed's study_id AND title. Title is the
    // discriminator — a real CAPA on STAB-001 will not share this exact title.
    const candidates = await client.query(
      'SELECT id, study_id, process_id, title, why, owner, due_date, status, created_at, updated_at ' +
        'FROM capa WHERE study_id = $1 AND title = $2 ORDER BY id',
      [seed.study_id, seed.title],
    );

    for (const row of candidates.rows) {
      // Exact = every seeded column still holds its seeded value. Anything else
      // has been touched by a person or a process and is not ours to delete.
      const untouched =
        row.why === seed.why && row.owner === seed.owner && row.status === seed.status;
      (untouched ? out.exact : out.modified).push(row);
    }
  }

  if (DELETE && out.exact.length) {
    const ids = out.exact.map((r) => r.id);
    const res = await client.query('DELETE FROM capa WHERE id = ANY($1::int[])', [ids]);
    out.deleted = res.rowCount;
  }
} finally {
  await client.end();
}

if (JSON_OUT) {
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
} else {
  process.stdout.write(
    `capa rows matching the removed seed: ${out.exact.length} exact, ${out.modified.length} modified\n`,
  );
  for (const r of out.exact) {
    process.stdout.write(`  EXACT     id=${r.id}  ${r.study_id}  "${r.title}"  owner=${r.owner}\n`);
  }
  for (const r of out.modified) {
    process.stdout.write(
      `  MODIFIED  id=${r.id}  ${r.study_id}  "${r.title}"  owner=${r.owner}  status=${r.status}\n`,
    );
  }
  if (out.modified.length) {
    process.stdout.write(
      '\n  MODIFIED rows are NOT deleted by --delete. Someone changed one of these\n' +
        '  after it was seeded, so it may now carry real investigation content.\n' +
        '  Decide each one with a human.\n',
    );
  }
  if (DELETE) process.stdout.write(`\ndeleted ${out.deleted} exact-match row(s)\n`);
  else if (out.exact.length) process.stdout.write('\nre-run with --delete to remove the exact matches\n');
}

// Exit 1 when anything was found and nothing was deleted, so a runbook step or
// CI check can treat "fabricated records still present" as a failure.
process.exit(!DELETE && (out.exact.length || out.modified.length) ? 1 : 0);
