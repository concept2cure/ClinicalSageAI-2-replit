#!/usr/bin/env node
/**
 * How much of a tenant survives a tenant purge.
 *
 * ── The question this answers ────────────────────────────────────────────────
 * server/services/tenant/tenant-offboarding.ts purges a tenant by running
 * `DELETE FROM <table> WHERE organization_id = $1` over PURGE_CHILD_TABLES, and
 * then UPDATEs the organizations row to status='purged' rather than deleting it
 * (deliberately — the deletion has to stay auditable). Nothing cascades from
 * organizations as a result.
 *
 * That list names 8 tables. Against a provisioned schema, 666 tables carry an
 * organization_id column. Following every ON DELETE CASCADE out of those 8
 * reaches 74. So 615 org-keyed tables still hold the tenant's rows after a
 * purge — and only 19 of those match the audit/billing/ledger pattern the
 * implementation deliberately retains.
 *
 * The rest is customer content: adverse_events, agency_correspondence,
 * ai_threads, adaptive_trial_plans, and hundreds more.
 *
 * ── What this script is, and is not ──────────────────────────────────────────
 * It is NOT a second purge implementation, and it does not edit the list. The
 * offboarding service is owned elsewhere and actively being built; duplicating
 * its design would be worse than useless. This measures the gap so the number
 * is checkable instead of adjectival, and RATCHETS it: the residue may shrink
 * but never grow. That last property is the point — the gap reached 615 because
 * new org-keyed tables were added for years with nothing watching whether the
 * purge could reach them.
 * Explicit immutable receipt retention is read from the same offboarding policy
 * and reported separately; no name pattern or baseline expansion exempts content.
 *
 * ── The second question: does the purge get to the end? (2026-10-29) ─────────
 * The purge deletes the list IN ORDER inside one transaction, and rethrows any
 * error but 42P01/42703. So a foreign key with no delete action (NO ACTION or
 * RESTRICT), from a table the purge has not yet emptied to a table it deletes,
 * fails that DELETE with 23503 for any tenant holding one such row, and the
 * WHOLE erasure rolls back. So does ON DELETE SET NULL on a NOT NULL column
 * (23502). The residue question above is a set question and could not see it:
 * risk_items aborted every purge of a tenant with a hazard under a project
 * (07d0116f9), and on 2026-10-29 the install-fresh + deploy-migrate schema had
 * 105 such keys into projects, client_workspaces, documents and
 * regulatory_programs (docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/).
 *
 * This walks the list as a sequence over the live catalog. Each entry deletes
 * its table when the table exists and has organization_id, or has a predicate
 * in PURGE_PARENT_SCOPED; otherwise the purge skips it (42703) and so does
 * this. Each delete also takes every table ON DELETE CASCADE reaches from it,
 * in the same statement. A key fails here when its referenced table is deleted
 * and its referencing table is not deleted before it, or in that same
 * statement. The exceptions are named, each with its reason, never baselined:
 * PURGE_RETAINED_RECORDS and PURGE_REFERRERS_NOT_ERASED (tenant-offboarding.ts),
 * the tables whose rows the purge must not erase, so a tenant holding one is
 * not purged until a decision is made about them. Those are also not residue.
 *
 * ── Platform records (P-58, 2026-10-29) ───────────────────────────────────────
 * PURGE_PLATFORM_RECORDS (purge-referrers.ts) names the records the platform
 * keeps ABOUT a purge and that hold no customer content: the offboarding
 * certificate (tenant_offboarding_certificates). It is org-keyed and the purge
 * does not erase it, by design, so it is reported as a platform record and
 * never counted as residue; the gate fails if the purge list names one or a
 * listed delete's cascade reaches one, and its keys are written after the
 * deletes, so they are reported, not failed.
 *
 * Not modelled: what a door function deletes beyond the table its entry names
 * (company_document_designs' disposal also deletes c2c_template_specs; the Vault
 * door, vault.document_archives). Those deletes run inside the door, in its own
 * order.
 *
 * Run against a provisioned database (the blank-db-provisioning CI job).
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { stripComments } from './lib/strip-comments.mjs';
import { blockingKeys, DEL_ACTION, FOREIGN_KEYS_SQL, TABLES_SQL } from './lib/purge-order.mjs';

const repoRoot = process.cwd();
const OFFBOARDING = path.join(repoRoot, 'server', 'services', 'tenant', 'tenant-offboarding.ts');
const baselinePath = path.join(repoRoot, 'docs', 'reports', 'purge-coverage-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');

/**
 * Read PURGE_CHILD_TABLES out of the service rather than restating it.
 * A copy here would be a second source of truth that silently disagrees the
 * first time someone extends the real one — the exact failure mode this
 * codebase keeps producing.
 */
function purgeChildTables() {
  if (!fs.existsSync(OFFBOARDING)) {
    console.error(`❌ purge-coverage: ${path.relative(repoRoot, OFFBOARDING)} not found.`);
    process.exit(1);
  }
  const src = fs.readFileSync(OFFBOARDING, 'utf8');
  const m = src.match(/PURGE_CHILD_TABLES[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  if (!m) {
    console.error('❌ purge-coverage: could not parse PURGE_CHILD_TABLES from the service.');
    console.error('   Refusing to report success for a list that was never read.');
    process.exit(1);
  }
  /* Comments FIRST. The entries are heavily annotated and those comments
     contain apostrophes ("the member's free-text justification"), so a quoted-
     literal scan over the raw body pairs an apostrophe in one comment with an
     apostrophe in the next and reads the prose between them as a table name.

     With the shared, quote-aware stripper (scripts/ci/lib/strip-comments.mjs),
     not a block-comment regex: /\/\*[\s\S]*?\*\// would also open at a `/*`
     inside a // note (say, "see /api/advisory/*") and run to the close of the
     next real block comment, silently dropping every entry in between — which
     this gate would then report as residue the purge does not reach. */
  const body = stripComments(m[1]);
  /* An entry `...NAME` splices in a frozen list a sibling module declares
     (purge-referrers.ts holds the 2026-10-29 block), in place, so the order
     read here is the order the purge runs. One it cannot resolve fails closed. */
  const literals = [];
  for (const x of body.matchAll(/'([^']+)'|\.\.\.([A-Za-z_$][\w$]*)/g)) {
    if (x[1] !== undefined) { literals.push(x[1]); continue; }
    const spread = declaredBody(x[2], '[', '])');
    if (!spread) {
      console.error(`❌ purge-coverage: cannot resolve the spread ...${x[2]} in PURGE_CHILD_TABLES.`);
      console.error('   Refusing to measure a list this gate could not fully read.');
      process.exit(1);
    }
    literals.push(...[...spread.body.matchAll(/'([^']+)'/g)].map((y) => y[1]));
  }
  if (literals.length === 0) {
    console.error('❌ purge-coverage: PURGE_CHILD_TABLES parsed to zero entries — broken scan.');
    process.exit(1);
  }

  /* Split, rather than filter.
     The pattern here used to be /'([a-z0-9_]+)'/ — which cannot match a
     SCHEMA-QUALIFIED entry, so when the vault tables were corrected to
     'vault.documents' and 'vault.document_chunks' the gate stopped seeing them
     and said nothing. It happened to change no number, because the residue
     query below is public-only in both halves and a 'vault.*' seed could never
     have matched a public relname anyway. But a list entry this gate cannot
     read must never simply vanish from it: that is how a guard starts measuring
     a list nobody wrote. Non-public entries are now reported as OUT OF SCOPE,
     and anything that is neither a bare name nor schema.name fails closed. */
  const tables = [];
  const outOfScope = [];
  for (const lit of literals) {
    if (/^[a-z0-9_]+$/.test(lit)) { tables.push(lit); continue; }
    if (/^[a-z0-9_]+\.[a-z0-9_]+$/.test(lit)) { outOfScope.push(lit); continue; }
    console.error(`❌ purge-coverage: cannot interpret PURGE_CHILD_TABLES entry '${lit}'.`);
    console.error('   Refusing to measure a list this gate could not fully read.');
    process.exit(1);
  }
  if (tables.length === 0) {
    console.error('❌ purge-coverage: PURGE_CHILD_TABLES has no public-schema entries — broken scan.');
    process.exit(1);
  }
  if (outOfScope.length > 0) {
    console.log(
      `   note: ${outOfScope.length} schema-qualified purge entr(y/ies) are OUTSIDE this gate's ` +
        `scope (it measures public.* only): ${outOfScope.join(', ')}`,
    );
  }
  // The residue question reads the public entries as a set; the order question
  // below reads every entry, in order.
  return { tables, ordered: literals };
}

/** Read the exact named retention policy, including its nonempty justification. */
function retainedRecords() {
  const src = stripComments(fs.readFileSync(OFFBOARDING, 'utf8'));
  const match = src.match(/^export\s+const\s+PURGE_RETAINED_RECORDS\b[^=]*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/m);
  try {
    if (!match) throw new Error('missing frozen literal');
    const policy = JSON.parse(`{${stripComments(match[1]).replace(/,\s*$/, '')}}`);
    for (const [table, reason] of Object.entries(policy)) {
      if (!/^[a-z][a-z0-9_]*$/.test(table) || typeof reason !== 'string' || reason.trim().length < 10) {
        throw new Error('every exact public table needs a nonempty retention reason');
      }
    }
    return policy;
  } catch (error) {
    console.error(`❌ purge-coverage: cannot read PURGE_RETAINED_RECORDS — ${error.message}`);
    process.exit(1);
  }
}

/**
 * PURGE_REFERRERS_NOT_ERASED: tables whose rows the purge does not erase although
 * a row of theirs can name a row it deletes with no delete action, each with its
 * reason. JSON-shaped, like PURGE_RETAINED_RECORDS. Absent, it is empty, which
 * only makes this gate stricter; present but unreadable, it fails closed.
 */
function referrersNotErased() {
  const declared = declaredBody('PURGE_REFERRERS_NOT_ERASED', '{', '})');
  if (!declared) return {};
  try {
    const policy = JSON.parse(`{${declared.body.replace(/,\s*$/, '')}}`);
    for (const [table, reason] of Object.entries(policy)) {
      if (!/^[a-z][a-z0-9_]*$/.test(table) || typeof reason !== 'string' || reason.trim().length < 10) {
        throw new Error('every exact public table needs a nonempty reason');
      }
    }
    return policy;
  } catch (error) {
    console.error(`❌ purge-coverage: cannot read PURGE_REFERRERS_NOT_ERASED — ${error.message}`);
    process.exit(1);
  }
}

/**
 * The service files the purge's literals live in: the list is in OFFBOARDING,
 * and parts of it and its maps are split into sibling modules beside it.
 */
const PURGE_SOURCES = [
  OFFBOARDING,
  path.join(repoRoot, 'server', 'services', 'tenant', 'purge-parent-scope.ts'),
  path.join(repoRoot, 'server', 'services', 'tenant', 'purge-referrers.ts'),
];

/**
 * The body of `export const NAME … = Object.freeze(<open>…<close>)` in whichever
 * purge source declares it, comments stripped; null when none does. Declared in
 * more than one, it fails closed: two copies are how a list and its reader drift.
 */
function declaredBody(name, open, close) {
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^export\\s+const\\s+${name}\\b[^=]*=\\s*Object\\.freeze\\(${esc(open)}([\\s\\S]*?)${esc(close)}`, 'm');
  const found = PURGE_SOURCES.filter((f) => fs.existsSync(f))
    .map((f) => ({ f, m: stripComments(fs.readFileSync(f, 'utf8')).match(re) }))
    .filter((d) => d.m);
  if (found.length > 1) {
    console.error(`❌ purge-coverage: ${name} is declared in more than one service file.`);
    process.exit(1);
  }
  return found.length ? { file: found[0].f, body: found[0].m[1] } : null;
}

/**
 * PURGE_PLATFORM_RECORDS: the platform's own records of a purge, each with why
 * (P-58). JSON-shaped; absent, it is empty (which only makes this gate
 * stricter); present but unreadable, it fails closed.
 */
function platformRecords() {
  const declared = declaredBody('PURGE_PLATFORM_RECORDS', '{', '})');
  if (!declared) return {};
  try {
    const policy = JSON.parse(`{${declared.body.replace(/,\s*$/, '')}}`);
    for (const [table, reason] of Object.entries(policy)) {
      if (!/^[a-z][a-z0-9_]*$/.test(table) || typeof reason !== 'string' || reason.trim().length < 10) {
        throw new Error('every exact public table needs a nonempty reason');
      }
    }
    return policy;
  } catch (error) {
    console.error(`❌ purge-coverage: cannot read PURGE_PLATFORM_RECORDS — ${error.message}`);
    process.exit(1);
  }
}

function parentScopedTables() {
  const declared = declaredBody('PURGE_PARENT_SCOPED', '{', '});');
  if (!declared) return [];
  const keys = [...declared.body.matchAll(/^\s*'([a-z0-9_]+(?:\.[a-z0-9_]+)?)'\s*:/gm)].map((x) => x[1]);
  if (keys.length === 0) {
    console.error(`❌ purge-coverage: could not read the keys of PURGE_PARENT_SCOPED in ${path.relative(repoRoot, declared.file)}.`);
    process.exit(1);
  }
  return keys;
}

const RESIDUE_SQL = `
WITH RECURSIVE seed(t) AS (
  SELECT unnest($1::text[])::text COLLATE "C"
),
casc(t) AS (
  SELECT t FROM seed
  UNION
  SELECT (ch.relname)::text COLLATE "C"
    FROM casc
    JOIN pg_class p ON (p.relname)::text COLLATE "C" = casc.t
                   AND p.relnamespace = 'public'::regnamespace
    JOIN pg_constraint con ON con.confrelid = p.oid AND con.contype = 'f'
                          AND con.confdeltype = 'c'
    JOIN pg_class ch ON ch.oid = con.conrelid
                    AND ch.relnamespace = 'public'::regnamespace
),
orgkeyed AS (
  SELECT (t.table_name)::text COLLATE "C" AS t
    FROM information_schema.tables t
   WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
     AND EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = 'public' AND c.table_name = t.table_name
                    AND c.column_name = 'organization_id')
)
SELECT o.t FROM orgkeyed o WHERE o.t NOT IN (SELECT t FROM casc) ORDER BY 1
`;

const url = process.env.DATABASE_URL;
if (!url || url.includes('placeholder')) {
  console.error('❌ purge-coverage: DATABASE_URL is unset or a placeholder.');
  console.error('   This check measures a LIVE schema; refusing to pass without one.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
} catch (err) {
  // A connection failure must read as one. Left unhandled this exits non-zero
  // with a pg-protocol stack trace, which is technically fail-closed and
  // practically unreadable — and an unreadable guard is one people learn to
  // scroll past.
  console.error(`❌ purge-coverage: cannot connect to DATABASE_URL — ${err?.message ?? err}`);
  process.exit(1);
}
try {
  // Same fail-closed posture as ci:tables-live-schema: on an unprovisioned
  // database every table looks absent, so the result would measure the fixture.
  const { rows: base } = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN
        ('organizations','users','projects','documents')`,
  );
  if (base[0].n < 4) {
    console.error('❌ purge-coverage: this database is not provisioned — refusing to check against it.');
    process.exit(1);
  }

  const { tables, ordered } = purgeChildTables();
  const retained = retainedRecords();
  const notErased = referrersNotErased();
  const platform = platformRecords();
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const twice = [
    ...Object.keys(notErased).filter((t) => own(retained, t)),
    ...Object.keys(platform).filter((t) => own(retained, t) || own(notErased, t)),
  ];
  if (twice.length) {
    console.error(`❌ purge-coverage: named in more than one of PURGE_RETAINED_RECORDS, PURGE_REFERRERS_NOT_ERASED and PURGE_PLATFORM_RECORDS: ${twice.join(', ')}`);
    process.exit(1);
  }
  const listedPlatform = Object.keys(platform).filter((t) => ordered.includes(t) || ordered.includes(`public.${t}`));
  if (listedPlatform.length) {
    console.error(`❌ purge-coverage: the purge list names a platform record it must never erase: ${listedPlatform.join(', ')}`);
    process.exit(1);
  }
  const listedHeld = Object.keys(notErased).filter((t) => ordered.includes(t) || ordered.includes(`public.${t}`));
  if (listedHeld.length) {
    console.error(`❌ purge-coverage: PURGE_REFERRERS_NOT_ERASED names table(s) the purge list erases: ${listedHeld.join(', ')}`);
    process.exit(1);
  }
  const held = { ...retained, ...notErased, ...platform };
  const retainedNames = Object.keys(held);
  const { rows } = await client.query(RESIDUE_SQL, [tables]);
  const allResidue = rows.map((r) => r.t);
  const { rows: visibleRetained } = await client.query(
    `SELECT t.table_name AS t FROM information_schema.tables t
      WHERE t.table_schema='public' AND t.table_type='BASE TABLE' AND t.table_name=ANY($1::text[])
        AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public'
          AND c.table_name=t.table_name AND c.column_name='organization_id')`, [retainedNames],
  );
  const reachedRetained = visibleRetained.map((r) => r.t).filter((t) => !allResidue.includes(t));
  if (reachedRetained.length) {
    const what = reachedRetained.some((t) => own(platform, t)) ? 'retained evidence or a platform record' : 'retained evidence';
    console.error(`❌ purge-coverage: ${what} is reachable by purge: ${reachedRetained.join(', ')}`);
    process.exit(1);
  }
  const retainedHere = allResidue.filter((t) => own(retained, t));
  const notErasedHere = allResidue.filter((t) => own(notErased, t));
  const residue = allResidue.filter((t) => !own(held, t));
  console.info(`   records with explicit retention policy (regulated content can block erasure): ${retainedHere.length}`);
  for (const table of retainedHere) console.info(`     ${table}: ${retained[table]}`);
  if (Object.keys(notErased).length) {
    console.info(`   tables the purge does not erase until a decision is made (PURGE_REFERRERS_NOT_ERASED): ${notErasedHere.length}`);
    for (const table of notErasedHere) console.info(`     ${table}: ${notErased[table]}`);
  }
  const platformHere = allResidue.filter((t) => own(platform, t));
  if (Object.keys(platform).length) {
    console.info(`   platform records of a purge, kept by design and not residue (PURGE_PLATFORM_RECORDS): ${platformHere.length}`);
    for (const table of platformHere) console.info(`     ${table}: ${platform[table]}`);
  }

  // The order question (header, "does the purge get to the end?").
  const { rows: fkRows } = await client.query(FOREIGN_KEYS_SQL);
  const { rows: tableRows } = await client.query(TABLES_SQL);
  const keys = blockingKeys(fkRows, tableRows, ordered, parentScopedTables());
  const bare = (t) => t.replace(/^public\./, '');
  const heldKeys = keys.filter((k) => own(held, bare(k.child)));
  const stopping = keys.filter((k) => !own(held, bare(k.child)));
  const describe = (k) => `${k.child} (${k.cols.join(', ')}) → ${k.parent}, ${DEL_ACTION[k.del]}${k.del === 'n' || k.del === 'd' ? ' on a NOT NULL column' : ''} [${k.conname}]`;
  if (heldKeys.length) {
    console.info(`   keys from a table the purge does not erase (a held row stops the purge; a platform record is written after it): ${heldKeys.length}`);
    for (const k of heldKeys) console.info(`     ${describe(k)}`);
  }
  if (stopping.length && !writeBaseline) {
    console.error(`❌ purge-coverage: ${stopping.length} foreign key(s) stop a tenant purge part-way:`);
    for (const k of stopping) console.error(`  ✗ ${describe(k)}: ${k.why}`);
    console.error('\nThe purge deletes the list in order in one transaction. For a tenant holding one such row, the');
    console.error('referenced DELETE fails (23503, or 23502 for SET NULL on a NOT NULL column) and the WHOLE erasure');
    console.error('rolls back. List the referencing table in PURGE_CHILD_TABLES before the table it names (with a');
    console.error('PURGE_PARENT_SCOPED predicate when it has no organization_id), or, when its rows must not be erased,');
    console.error('name it with its reason in PURGE_REFERRERS_NOT_ERASED.');
  }

  if (writeBaseline) {
    /* A table that DISAPPEARED from the residue is not automatically a gain.
       It is a gain only when the purge can now reach it; when it is simply
       absent from THIS database it was never measured, and dropping it from the
       baseline silently lowers the ratchet for every other environment.
       That is not hypothetical: a baseline written from a developer database
       missing eleven org-keyed tables took the count from 613 to 600, of which
       only two were earned — and the blank-database CI job, whose schema does
       have those tables, would then have reported eleven NEW unreachable tables
       and failed the release gate.

       So: anything the previous baseline listed that this database cannot see
       is CARRIED FORWARD, and said out loud. */
    const previous = fs.existsSync(baselinePath)
      ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
      : { tables: [] };
    const previousTables = Array.isArray(previous.tables) ? previous.tables : [];
    const nowInResidue = new Set(residue);
    const previouslyRetained = previousTables.filter((t) => Object.prototype.hasOwnProperty.call(retained, t));
    const dropped = previousTables.filter((t) => !nowInResidue.has(t) && !previouslyRetained.includes(t));

    let carried = [];
    if (dropped.length > 0) {
      const { rows: present } = await client.query(
        `SELECT table_name AS t FROM information_schema.tables
          WHERE table_schema='public' AND table_name = ANY($1::text[])`,
        [dropped],
      );
      const visible = new Set(present.map((r) => r.t));
      carried = dropped.filter((t) => !visible.has(t)).sort();
    }

    const finalTables = [...new Set([...residue, ...carried, ...previouslyRetained])].sort();
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(
      baselinePath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          purgeChildTables: tables,
          count: finalTables.length,
          tables: finalTables,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    console.log(`✅ wrote baseline: ${path.relative(repoRoot, baselinePath)} (${finalTables.length} tables)`);
    const earned = dropped.filter((t) => !carried.includes(t));
    if (earned.length > 0) {
      console.log(`   ${earned.length} table(s) genuinely covered and removed from the baseline:`);
      for (const t of earned.sort()) console.log(`     ${t}`);
    }
    if (carried.length > 0) {
      console.log(
        `   ${carried.length} table(s) are ABSENT from this database and were KEPT in the baseline —`,
      );
      console.log('   a table this database cannot see was not covered, it was not measured:');
      for (const t of carried) console.log(`     ${t}`);
    }
    process.exit(0);
  }

  const baseline = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { tables: [] };
  const known = new Set(baseline.tables ?? []);
  const added = residue.filter((t) => !known.has(t));
  const removed = [...known].filter((t) => !residue.includes(t) && !Object.prototype.hasOwnProperty.call(retained, t));

  if (added.length > 0) {
    console.error('❌ purge-coverage: NEW org-keyed table(s) a tenant purge cannot reach:');
    for (const t of added) console.error(`  - ${t}`);
    console.error(
      '\nFirst: confirm the table still exists on a CURRENT schema. This gate reads the',
    );
    console.error('live database, and a table some migration drops can linger on a local one');
    console.error('that has not replayed it — in which case the fix is to migrate, not to list');
    console.error('a table that a correctly-migrated database does not have. Listing a phantom');
    console.error('here makes the purge look more complete than it is, which is the opposite of');
    console.error('what this gate is for.');
    console.error(
      '\nIf it is real: add it to PURGE_CHILD_TABLES (FK-safe order) or give it an ON',
    );
    console.error('DELETE CASCADE path from a table already there. A tenant that asks to be');
    console.error('erased must not keep rows in a table nobody remembered to list.');
    process.exit(1);
  }

  if (stopping.length) process.exit(1);
  console.info(`✅ purge-coverage: no foreign key stops the purge part-way (${keys.length} from tables it does not erase, each named).`);
  console.log(
    `✅ purge-coverage: ${residue.length} org-keyed tables outside the purge reach ` +
      `(baseline ${known.size}, new 0${removed.length ? `, ${removed.length} now covered` : ''}).`,
  );
  if (removed.length > 0) {
    console.log('   Newly covered — re-run with --write-baseline to lock the gain in:');
    for (const t of removed) console.log(`     ${t}`);
  }
} finally {
  await client.end();
}
