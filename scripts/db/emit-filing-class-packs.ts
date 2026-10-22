/**
 * Write the migration that seeds the filing class packs no migration
 * seeds yet, from server/services/c2c/filing-class-packs.ts.
 *
 *   npx tsx scripts/db/emit-filing-class-packs.ts                 # what is unseeded; exit 1 if any
 *   npx tsx scripts/db/emit-filing-class-packs.ts migrations/<YYYYMMDD[x]>_<name>.sql
 *
 * The migration is the only way a pack reaches a database (CLAUDE.md Rule 1),
 * and it must hold literal rows, so it is generated rather than hand-copied.
 *
 * FILING_CLASS_PACKS names each class's CURRENT version. A version is "seeded"
 * when some file in migrations/ inserts its (doc_type, agency, version) row;
 * this script emits only the versions none does, each superseding exactly the
 * version its spec names. migrations/20261018_filing_class_rule_packs.sql seeded
 * the first versions and is frozen: on a deployed database a rewrite of it would
 * insert a second live version beside the first, and its own "exactly one live
 * pack" assertion would stop the deploy (review finding, 2026-10-18).
 *
 * The output file is written once. Run again with the same file, the script
 * confirms it is what the module still produces (exit 0); if the module has
 * changed since, it refuses to rewrite it (exit 1) — a file on the applier is
 * never rewritten — and the change is a new version in another new file.
 * tests/schema-contract/c2c-filing-class-packs.contract.test.ts applies every
 * pack file and holds each live pack to the module node for node.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FILING_CLASS_PACKS,
  filingClassPackMinted,
  filingClassPackGoverningRule,
  filingClassPackSections,
  filingClassPackUncertainties,
  type FilingClassPackSpec,
} from '../../server/services/c2c/filing-class-packs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS = path.join(ROOT, 'migrations');

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const tuple = (spec: FilingClassPackSpec) => `(${lit(spec.docType)}, ${lit(spec.agency)}, ${lit(spec.version)},`;

/** Every migration's text but `except`'s, by file name. */
function migrationTexts(except: string | null): Map<string, string> {
  const texts = new Map<string, string>();
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    if (except && path.join(MIGRATIONS, f) === except) continue;
    texts.set(f, readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  }
  return texts;
}

/** The doc_type values some file's c2c_documents CHECK already admits. */
function admittedDocTypes(texts: Map<string, string>): Set<string> {
  const admitted = new Set<string>();
  for (const sql of texts.values()) {
    for (const m of sql.matchAll(/CHECK \(doc_type IN \(([^)]*)\)\)/g)) {
      for (const v of m[1].matchAll(/'([a-z0-9_]+)'/g)) admitted.add(v[1]);
    }
  }
  return admitted;
}

/** Only this governed table's agency CHECK, never another subsystem's agency vocabulary. */
function admittedAgencies(texts: Map<string, string>): Set<string> {
  const admitted = new Set<string>();
  for (const sql of texts.values()) {
    for (const m of sql.matchAll(/CONSTRAINT c2c_documents_agency_check\s+CHECK \(agency IN \(([^)]*)\)\)/g)) {
      for (const v of m[1].matchAll(/'([a-z0-9_]+)'/g)) admitted.add(v[1]);
    }
  }
  return admitted;
}

/** Conditional strict-superset widening; older files must leave later values admitted. */
function widenCheck(column: 'doc_type' | 'agency', values: string[]): string {
  return `  IF to_regclass('public.c2c_documents') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.c2c_documents'::regclass
         AND conname = 'c2c_documents_${column}_check'
${values.map((v) => `         AND pg_get_constraintdef(oid) LIKE '%''${v}''%'`).join('\n')}
    ) THEN
      ALTER TABLE c2c_documents DROP CONSTRAINT IF EXISTS c2c_documents_${column}_check;
      ALTER TABLE c2c_documents ADD CONSTRAINT c2c_documents_${column}_check
        CHECK (${column} IN (${values.map(lit).join(',')}));
    END IF;
  END IF;

`;
}

/** Wrap a header paragraph at 78 columns under "--   ". */
function wrap(text: string, indent = '--   '): string {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if ((indent + line + ' ' + word).length > 80 && line) { out.push(indent + line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(indent + line);
  return out.join('\n');
}

async function render(file: string, specs: FilingClassPackSpec[], admitted: Set<string>, existingAgencies: Set<string>): Promise<string> {
  const m = /^(\d{4})(\d{2})(\d{2})[a-z]?_/.exec(path.basename(file));
  if (!m) throw new Error(`${path.basename(file)}: a migration file name starts with its date, YYYYMMDD.`);
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  for (const spec of specs) {
    if (filingClassPackMinted(spec) !== date) {
      throw new Error(`${spec.docType}:${spec.agency} ${spec.version} states it was minted ${filingClassPackMinted(spec)}; this file is dated ${date}. Set the spec's \`minted\`, or date the file for it.`);
    }
    if (spec.supersedes && !spec.changeNote) {
      throw new Error(`${spec.docType}:${spec.agency} ${spec.version} supersedes ${spec.supersedes} and says nothing of what it changes: give it a changeNote.`);
    }
  }
  const packs = await Promise.all(specs.map(async (spec) => ({
    spec,
    sections: await filingClassPackSections(spec.docType),
    governingRule: await filingClassPackGoverningRule(spec.docType),
    uncertainties: await filingClassPackUncertainties(spec),
  })));
  for (const { sections } of packs) {
    if (JSON.stringify(sections).includes('$pack$')) throw new Error('An outline contains the $pack$ quote tag.');
  }
  const missing = [...new Set(specs.map((s) => s.docType))].filter((t) => !admitted.has(t));
  const docTypes = [...admitted].sort().concat(missing);
  const missingAgencies = [...new Set(specs.map((s) => s.agency))].filter((a) => !existingAgencies.has(a));
  const agencies = [...existingAgencies].sort().concat(missingAgencies);
  const expected = JSON.stringify(packs.map(({ spec, sections }) => ({
    doc_type: spec.docType, agency: spec.agency, version: spec.version, nodes: sections.length,
  })));

  const changes = packs.map(({ spec, sections }) =>
    `${wrap(`${spec.docType}:${spec.agency} ${spec.version} (${sections.length} nodes)` +
      `${spec.supersedes ? `, superseding ${spec.supersedes}` : ', its first pack'}: ` +
      `${spec.changeNote ?? 'first version.'}`)}`).join('\n');
  const header = `-- ═══════════════════════════════════════════════════════════════════════════════
-- ${date} · D2 · Filing class packs (${packs.length})
--
-- GENERATED by scripts/db/emit-filing-class-packs.ts from
-- server/services/c2c/filing-class-packs.ts. Do not edit by hand: a change to a
-- pack is a new version in a new file, never a rewrite of this file's rows.
-- tests/schema-contract/c2c-filing-class-packs.contract.test.ts applies this
-- file and holds every live pack to the module node for node.
--
-- WHAT EACH PACK IS
${changes}
--
-- THE LIMIT
--   A document already bound to a superseded version keeps that outline: the
--   composite FK to (doc_type, agency, version) is what makes the record true.
--   New projects get these versions (the scaffolder reads superseded_by IS NULL).
--   No pack here is reviewed by a regulatory professional; each states its basis.
--
-- RULE 1 (every file in C2C_MIGRATION_FILES re-runs on every deploy)
--   ON CONFLICT DO NOTHING; provenance is assigned after 20260810c re-runs;
--   supersede is guarded on the exact prior version and superseded_by IS NULL;
--   ${missing.length || missingAgencies.length ? 'the doc_type/agency CHECKs are widened only while needed,\n--   with strict supersets of the previously admitted values;' : 'no constraint is touched: every doc_type and agency here is already admitted;'}
--   the assertions at the end refuse a missing, truncated or edited row, and a
--   (doc_type, agency) without exactly one live pack, while tolerating a later
--   version superseding one of these.
-- ═══════════════════════════════════════════════════════════════════════════════
`;
  const check = (missing.length ? widenCheck('doc_type', docTypes) : '') +
    (missingAgencies.length ? widenCheck('agency', agencies) : '');
  const values = packs.map(({ spec, sections }) =>
    `    (${lit(spec.docType)}, ${lit(spec.agency)}, ${lit(spec.version)}, ${lit(spec.label)},\n     $pack$${JSON.stringify(sections)}$pack$::jsonb,\n     NULL,\n     DATE '${date}')`,
  ).join(',\n');
  const provenance = packs.map(({ spec, governingRule, uncertainties }) =>
    `    UPDATE c2c_rule_packs SET
      source_basis   = ${lit(spec.sourceBasis)},
      confidence     = ${lit(spec.confidence)},
      governing_rule = ${lit(governingRule)},
      uncertainties  = ${lit(uncertainties)}
    WHERE doc_type = ${lit(spec.docType)} AND agency = ${lit(spec.agency)} AND version = ${lit(spec.version)};`,
  ).join('\n');
  const supersede = packs.filter(({ spec }) => spec.supersedes).map(({ spec }) =>
    `  UPDATE c2c_rule_packs SET superseded_by = ${lit(spec.version)}
   WHERE doc_type = ${lit(spec.docType)} AND agency = ${lit(spec.agency)} AND version = ${lit(spec.supersedes as string)}
     AND superseded_by IS NULL;`,
  ).join('\n');
  // A document bound to a superseded version keeps its outline, so the version
  // says what superseded it and why; a provenance claim the review found false
  // is corrected, never left standing. The file that seeded it re-asserts its
  // own literal on every deploy and this file runs after it, so the corrected
  // text is what every deploy ends with (review finding, 2026-10-18).
  const superseded = packs.filter(({ spec }) => spec.supersedes).map(({ spec, governingRule }) => {
    const note = ` Superseded by ${spec.version} on ${date}: ${spec.changeNote}`;
    const corrected = spec.correctsSupersededProvenance
      ? `\n      governing_rule = ${lit(governingRule)},\n      confidence     = ${lit(spec.confidence)},`
      : '';
    return `    UPDATE c2c_rule_packs SET${corrected}
      uncertainties  = coalesce(uncertainties, '') || ${lit(note)}
    WHERE doc_type = ${lit(spec.docType)} AND agency = ${lit(spec.agency)} AND version = ${lit(spec.supersedes as string)}
      AND position(${lit(`Superseded by ${spec.version}`)} in coalesce(uncertainties, '')) = 0;`;
  }).join('\n');
  const trees = packs.map(({ spec, sections }) =>
    `    WHEN ${lit(`${spec.docType}:${spec.agency}:${spec.version}`)} THEN $pack$${JSON.stringify(sections)}$pack$::jsonb`,
  ).join('\n');

  return `${header}
DO $mig$
DECLARE
  expected CONSTANT jsonb := ${lit(expected)}::jsonb;
  e     jsonb;
  n     integer;
  tree  jsonb;
  same  boolean;
  sup   text;
  live  integer;
BEGIN
${check}  IF to_regclass('public.c2c_rule_packs') IS NULL THEN
    RAISE NOTICE 'c2c_rule_packs not present - skipping the filing class packs';
    RETURN;
  END IF;

  -- 2 ── The packs. New versions only; no existing row is rewritten.
  INSERT INTO c2c_rule_packs
    (doc_type, agency, version, label, required_sections, esubmit_channel, effective_from)
  VALUES
${values}
  ON CONFLICT (doc_type, agency, version) DO NOTHING;

  -- 3 ── Provenance (columns exist once 20260810c has run). review_status stays
  --      'unreviewed' (20260810d): no pack here has been signed off.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'c2c_rule_packs' AND column_name = 'source_basis') THEN
${provenance}
  END IF;

  -- 4 ── Supersede exactly the version each pack replaces, and say so on it.
${supersede || '  -- (none: every pack here is its class\'s first)'}
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'c2c_rule_packs' AND column_name = 'source_basis') THEN
${superseded || '    NULL;'}
  END IF;

  -- 5 ── Assertions (CLAUDE.md Rule 1, seed corollary). A tree the CASE does not
  --      name is refused, never read as a match.
  FOR e IN SELECT * FROM jsonb_array_elements(expected) LOOP
    tree := CASE (e->>'doc_type') || ':' || (e->>'agency') || ':' || (e->>'version')
${trees}
    END;
    SELECT jsonb_array_length(required_sections), required_sections = tree, superseded_by
      INTO n, same, sup
      FROM c2c_rule_packs
     WHERE doc_type = e->>'doc_type' AND agency = e->>'agency' AND version = e->>'version';
    IF NOT FOUND OR n IS DISTINCT FROM (e->>'nodes')::integer OR same IS NOT TRUE THEN
      RAISE EXCEPTION '%:% % must hold this file''s % nodes; found % (tree matches: %)',
        e->>'doc_type', e->>'agency', e->>'version', e->>'nodes',
        coalesce(n::text, 'no row'), coalesce(same::text, 'n/a');
    END IF;
    IF sup IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM c2c_rule_packs
       WHERE doc_type = e->>'doc_type' AND agency = e->>'agency' AND version = sup) THEN
      RAISE EXCEPTION '%:% % is superseded by %, which does not exist',
        e->>'doc_type', e->>'agency', e->>'version', sup;
    END IF;
    SELECT count(*) INTO live FROM c2c_rule_packs
     WHERE doc_type = e->>'doc_type' AND agency = e->>'agency' AND superseded_by IS NULL;
    IF live <> 1 THEN
      RAISE EXCEPTION '%:% must have exactly one live pack; found %', e->>'doc_type', e->>'agency', live;
    END IF;
  END LOOP;
END
$mig$;
`;
}

async function main() {
  const arg = process.argv[2];
  const out = arg ? path.resolve(ROOT, arg) : null;
  if (out && path.dirname(out) !== MIGRATIONS) throw new Error(`${arg}: the file goes in migrations/.`);
  const texts = migrationTexts(out);
  const seededIn = (spec: FilingClassPackSpec) => [...texts].find(([, sql]) => sql.includes(tuple(spec)))?.[0];
  const unseeded = FILING_CLASS_PACKS.filter((spec) => !seededIn(spec));

  if (!out) {
    for (const spec of FILING_CLASS_PACKS) {
      const at = seededIn(spec);
      console.log(`${at ? 'seeded  ' : 'UNSEEDED'} ${spec.docType}:${spec.agency} ${spec.version}${at ? `  (${at})` : ''}`);
    }
    if (unseeded.length) {
      console.error(`\n${unseeded.length} version(s) no migration seeds. Write them with:\n  npx tsx scripts/db/emit-filing-class-packs.ts migrations/<YYYYMMDD[x]>_<name>.sql`);
      process.exit(1);
    }
    return;
  }

  const rel = path.relative(process.cwd(), out);
  if (unseeded.length === 0) {
    console.log(`Every FILING_CLASS_PACKS version is seeded by another migration; ${rel} is not needed.`);
    return;
  }
  const sql = await render(out, unseeded, admittedDocTypes(texts), admittedAgencies(texts));
  if (existsSync(out)) {
    if (readFileSync(out, 'utf8') === sql) {
      console.log(`${rel} is unchanged: it is still what FILING_CLASS_PACKS produces.`);
      return;
    }
    console.error(
      `REFUSED: ${rel} exists and is not what FILING_CLASS_PACKS now produces. A pack file on the applier ` +
      'is never rewritten: mint the changed pack as a new version, and write it to a NEW migration file.',
    );
    process.exit(1);
  }
  writeFileSync(out, sql);
  console.log(`wrote ${rel}: ${unseeded.length} pack(s): ${unseeded.map((s) => `${s.docType}:${s.agency} ${s.version}`).join(', ')}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
