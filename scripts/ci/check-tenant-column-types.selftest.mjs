#!/usr/bin/env node
/**
 * Self-test for ci:tenant-column-types (scripts/ci/check-tenant-column-types.mjs).
 *
 * On the real tree the gate prints "OK — all tenant columns are integer-typed",
 * so its failure branch never fires in normal use, and a gate whose failure
 * branch has never been seen has not been tested (CLAUDE.md, working agreement).
 * This shows it firing.
 *
 * Each case builds a throwaway shared/ tree in a temp directory and runs a copy
 * of the REAL gate whose `repoRoot` (and, for the allowlist cases, its
 * `ALLOWED_NON_INTEGER` set) is patched to the fixture. Nothing else in the gate
 * is changed, so what is tested is the command CI runs.
 *
 * The failing cases are the defect the gate was written for: the four tenant
 * columns that migrations/0019_tenant_column_audit.sql found declared TEXT and
 * 0020_coerce_text_tenant_columns.sql had to coerce before 0021's RLS policy
 * (`<col> = …::INT`) could be installed —
 *   gap_analysis_results.organization_id         (shared/schema.ts)
 *   cmc_projects.organization_id                 (shared/cmc-schema.ts)
 *   workflow_templates.organization_id           (shared/cmc-schema.ts)
 *   multi_agency_validation_sessions.tenant_id   (shared/schema.ts)
 * — written back the way they were declared before 0020, plus the other types
 * the gate names (varchar with a length, the uuid-keyed org column CLAUDE.md
 * RULE 1 says ships with no RLS policy, char), and a new schema module in a
 * nested shared/ subdirectory, which is why the gate walks the whole tree.
 * One failing case writes the tenant key in house style, with a trailing
 * `// note` after the declaration (1190 column lines in shared/ end that way,
 * e.g. shared/schema.ts `organizationType: text('organization_type').notNull(),
 * // manufacturer, supplier, …`). The gate skips only lines that START with a
 * comment; a gate that skips any line containing `//` would miss that new
 * column, and only a failing case shows the difference.
 *
 * Every failing case also asserts the OK line is absent, and every quiet case
 * that no violation header was printed: a gate that lists violations and then
 * falls through to "OK" contradicts itself even if its exit code is right.
 *
 * The quiet cases are near-misses a sloppy gate would flag, taken from the real
 * shared/ tree: `mdufaOrgId: varchar(…)` (an FDA MDUFA organisation identifier
 * in shared/schema/estar-registration.ts, not a tenant key),
 * `organizationType: text(…)`, `systemOrganClass: text(…)`, a pre-0020
 * declaration kept as a comment, an integer column whose trailing comment
 * mentions the old text type, and DTO/zod shapes that say `organizationId:
 * string` without being columns. A `bigint` org column is also quiet: 0021
 * installs the same `::INT` policy on integer, bigint and smallint, and 0020
 * skips all three as already coerced. If the gate is ever tightened to
 * INTEGER-only (CLAUDE.md RULE 1 says new tables use INTEGER), move that line
 * into a failing case rather than deleting it.
 *
 * The gate's allowlist is a line-precise in-script Set with no reason field and
 * no stale-entry check, so the allowlist cases assert only what it implements:
 * an exact `file:line:column` key suppresses that one site, a key for any
 * other line suppresses nothing, and a key for one file does not cover the same
 * column on the same line of another file (a copy of the excepted table pasted
 * into a new module is how that drift arrives).
 *
 * Usage:
 *   node scripts/ci/check-tenant-column-types.selftest.mjs
 *   SELFTEST_GATE_PATH=/tmp/mutant.mjs node scripts/ci/check-tenant-column-types.selftest.mjs
 *     (run the cases against a different copy of the gate — the mutation check)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:tenant-column-types:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-tenant-column-types.mjs');

const ROOT_DECL = /const repoRoot = [^;]+;/;
const ALLOW_DECL = /const ALLOWED_NON_INTEGER = new Set\(\[[\s\S]*?\]\);/;
const LIB_IMPORT = /from '\.\/lib\//g;

const gateSrc = fs.readFileSync(GATE, 'utf8');
for (const [what, re] of [
  ['`const repoRoot = …;`', ROOT_DECL],
  ['`const ALLOWED_NON_INTEGER = new Set([…]);`', ALLOW_DECL],
]) {
  if (!re.test(gateSrc)) {
    // Without these the patched copy would judge the real tree (or the real
    // allowlist) and every case would be testing something other than its fixture.
    console.error(`${TAG} cannot find ${what} in ${GATE} — the selftest no longer knows how to point it at a fixture tree.`);
    process.exit(1);
  }
}
// The patched copy runs from a temp directory, so its relative `./lib/…`
// imports are rewritten to the real helpers (the gate's own lib/ when it has
// one, else this repository's) — requireScanRoots is part of the behaviour
// under test, not something to stub.
const libDir = fs.existsSync(path.join(path.dirname(GATE), 'lib'))
  ? path.join(path.dirname(GATE), 'lib')
  : path.join(repoRoot, 'scripts', 'ci', 'lib');
const LIB_URL = `${pathToFileURL(libDir).href}/`;

/** Run a patched gate against `files` (rel path → content); null → no shared/ at all. */
function runGate(files, allowlist = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-col-types-'));
  try {
    for (const [rel, content] of Object.entries(files ?? {})) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    const src = gateSrc
      .replace(ROOT_DECL, `const repoRoot = ${JSON.stringify(root)};`)
      .replace(ALLOW_DECL, `const ALLOWED_NON_INTEGER = new Set(${JSON.stringify(allowlist)});`)
      .replace(LIB_IMPORT, `from '${LIB_URL}`);
    const gatePath = path.join(root, 'gate.mjs');
    fs.writeFileSync(gatePath, src);
    // spawnSync, not execFileSync: a clean exit must still show its stderr, or a
    // quiet case could never see a violation list printed beside exit 0. A
    // killed or timed-out run gets a non-numeric code so it matches no expectExit.
    const r = spawnSync(process.execPath, [gatePath], { encoding: 'utf8', timeout: 20_000 });
    const code = r.status ?? `killed (${r.signal ?? r.error?.code ?? 'unknown'})`;
    return { code, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** 1-based numbers of every line of `content` containing `needle`. */
function linesOf(content, needle) {
  const hits = content.split('\n').flatMap((l, i) => (l.includes(needle) ? [i + 1] : []));
  if (hits.length === 0) throw new Error(`${TAG} fixture error: ${JSON.stringify(needle)} not in fixture`);
  return hits;
}
const lineOf = (content, needle) => linesOf(content, needle)[0];

/** The gate's own report line for one site. */
const site = (file, content, needle, col, type) => `${file}:${lineOf(content, needle)}  ${col}: ${type}(...)`;

// ── Fixtures ────────────────────────────────────────────────────────────────

/** shared/schema.ts as it stood before 0020: two TEXT tenant keys. */
const SCHEMA_PRE_0020 = `import { pgTable, serial, text, integer, uuid, timestamp } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const multiAgencyValidationSessions = pgTable(
  'multi_agency_validation_sessions',
  {
    sessionId: uuid('session_id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    documentId: text('document_id').notNull(),
    userId: text('user_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    validationStartedAt: timestamp('validation_started_at').defaultNow().notNull(),
  },
);

export const gapAnalysisResults = pgTable('gap_analysis_results', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  userId: text('user_id').notNull(),
  submissionType: text('submission_type').notNull(),
  overallReadiness: integer('overall_readiness').notNull(),
});
`;

/** shared/cmc-schema.ts as it stood before 0020: two more. */
const CMC_PRE_0020 = `import { pgTable, text, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';

// CMC Projects - Core project management
export const cmcProjects = pgTable('cmc_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  drugName: text('drug_name').notNull(),
  targetSubmissionDate: timestamp('target_submission_date'),
});

// Workflow Templates
export const workflowTemplates = pgTable('workflow_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  templateData: jsonb('template_data').notNull(),
});
`;

/** The same two files as they are pinned today, after 0020: all integer. */
const SCHEMA_PINNED = SCHEMA_PRE_0020
  .replace("tenantId: text('tenant_id')", "tenantId: integer('tenant_id')")
  .replace("organizationId: text('organization_id')", "organizationId: integer('organization_id')");
const CMC_PINNED = CMC_PRE_0020.replaceAll(
  "organizationId: text('organization_id')",
  "organizationId: integer('organization_id')",
);

/** A clean base so shared/ exists and the scan has something real to read. */
const BASE = { 'shared/schema.ts': SCHEMA_PINNED, 'shared/cmc-schema.ts': CMC_PINNED };

/** A new modular schema in a nested subdirectory, keyed by a uuid org column. */
const NESTED_UUID = `import { pgTable, serial, uuid, text } from 'drizzle-orm/pg-core';

export const dossierRegions = pgTable('dossier_regions', {
  id: serial('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  region: text('region').notNull(),
});
`;

/** The header's own example shape, plus char: varchar with a length option. */
const VARCHAR_AND_CHAR = `import { pgTable, serial, varchar, char, text } from 'drizzle-orm/pg-core';

export const partnerLinks = pgTable('partner_links', {
  id: serial('id').primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  label: text('label'),
});

export const legacyImports = pgTable('legacy_imports', {
  id: serial('id').primaryKey(),
  orgId: char('org_id', { length: 36 }),
});
`;

/**
 * A new module in house style, modelled on supply_chain_organizations in
 * shared/schema.ts: column declarations carry a trailing `// note`. Two tenant
 * keys are declared that way; `organizationType` (a near-miss, same comment
 * style, copied from the real line) must not be counted with them.
 */
const HOUSE_STYLE = `import { pgTable, serial, text, uuid, json } from 'drizzle-orm/pg-core';

export const supplyChainPartners = pgTable(
  'supply_chain_partners',
  {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id').notNull(), // owning organisation
    name: text('name').notNull(),
    organizationType: text('organization_type').notNull(), // manufacturer, supplier, distributor, testing_lab, warehouse
    duns: text('duns'), // D-U-N-S Number
    address: json('address').notNull(), // Full address object
  },
);

export const partnerContacts = pgTable('partner_contacts', {
  id: serial('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(), // tenant of the partner record
  email: text('email').notNull(), // primary contact
});
`;

/** Near-misses from the real shared/ tree that must stay quiet. */
const NEAR_MISSES = `import { pgTable, serial, integer, bigint, text, varchar } from 'drizzle-orm/pg-core';
import { z } from 'zod';

export const fdaRegistrations = pgTable('fda_registrations', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull(),
  // FDA's MDUFA organisation identifier — an agency id, not a tenant key.
  mdufaOrgId: varchar('mdufa_org_id', { length: 64 }),
  organizationType: text('organization_type').notNull(), // manufacturer, supplier
  systemOrganClass: text('system_organ_class'),
});

export const qmsSites = pgTable('qms_sites', {
  id: serial('id').primaryKey(),
  // organizationId: text('organization_id').notNull(),  — declaration before 0020
  organizationId: integer('organization_id').notNull(), // was text('organization_id') until 0020
  orgId: bigint('org_id', { mode: 'number' }),
});

/**
 * Example of the old shape, kept for the reader:
 *   tenantId: varchar('tenant_id', { length: 64 }),
 */
export interface SiteDto {
  organizationId: string;
  tenantId: string | null;
}

export const siteQuery = z.object({
  organizationId: z.string(),
  orgId: z.string().uuid(),
});
`;

/** One deliberate non-integer tenant key, for the allowlist cases. */
const VENDOR_LINK = `import { pgTable, serial, uuid } from 'drizzle-orm/pg-core';

export const vendorLinks = pgTable('vendor_links', {
  id: serial('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
});
`;
const VENDOR_FILE = 'shared/schema/vendor-link.ts';
const VENDOR_LINE = lineOf(VENDOR_LINK, "tenantId: uuid('tenant_id')");
/**
 * The excepted table pasted into a new module: same column, same line, other
 * file. Only the file part of the allowlist key tells the two apart.
 */
const VENDOR_COPY = VENDOR_LINK.replace("'vendor_links'", "'vendor_link_archive'").replace(
  'vendorLinks',
  'vendorLinkArchive',
);
const VENDOR_COPY_FILE = 'shared/archive/partner-links.ts';
if (lineOf(VENDOR_COPY, "tenantId: uuid('tenant_id')") !== VENDOR_LINE) {
  throw new Error(`${TAG} fixture error: VENDOR_COPY must declare tenantId on the allowlisted line`);
}

/** Printed only on a clean scan; must never appear beside a violation list. */
const OK_LINE = 'OK — all tenant columns are integer-typed';
/** Printed only when violations were found; must never appear on a quiet run. */
const VIOLATION_HEADER = 'declared with a non-INTEGER type';

// ── Cases ───────────────────────────────────────────────────────────────────

const cases = [
  {
    name: 'FAILS on the four TEXT tenant columns 0020 had to coerce, each named at its line',
    files: { 'shared/schema.ts': SCHEMA_PRE_0020, 'shared/cmc-schema.ts': CMC_PRE_0020 },
    expectExit: 1,
    expectIn: [
      '4 tenant column(s) declared with a non-INTEGER type',
      site('shared/schema.ts', SCHEMA_PRE_0020, "tenantId: text('tenant_id')", 'tenantId', 'text'),
      site('shared/schema.ts', SCHEMA_PRE_0020, "organizationId: text('organization_id')", 'organizationId', 'text'),
      // cmc_projects and workflow_templates — two sites, same file, both named.
      ...linesOf(CMC_PRE_0020, "organizationId: text('organization_id')").map(
        (n) => `shared/cmc-schema.ts:${n}  organizationId: text(...)`,
      ),
      'migrations/0021_enable_rls_everywhere.sql',
    ],
  },
  {
    name: 'FAILS on a uuid-keyed org column in a new module two directories under shared/',
    files: { ...BASE, 'shared/schema/regulatory/dossier/regions.ts': NESTED_UUID },
    expectExit: 1,
    expectIn: [
      '1 tenant column(s)',
      site('shared/schema/regulatory/dossier/regions.ts', NESTED_UUID, "organizationId: uuid(", 'organizationId', 'uuid'),
    ],
  },
  {
    name: 'FAILS on varchar(…, { length }) and char(…) tenant keys',
    files: { ...BASE, 'shared/partner-schema.ts': VARCHAR_AND_CHAR },
    expectExit: 1,
    expectIn: [
      '2 tenant column(s)',
      site('shared/partner-schema.ts', VARCHAR_AND_CHAR, "tenantId: varchar('tenant_id'", 'tenantId', 'varchar'),
      site('shared/partner-schema.ts', VARCHAR_AND_CHAR, "orgId: char('org_id'", 'orgId', 'char'),
    ],
  },
  {
    name: 'FAILS on tenant keys written in house style, with a trailing // comment on the declaration line',
    files: { ...BASE, 'shared/supply-chain-schema.ts': HOUSE_STYLE },
    expectExit: 1,
    expectIn: [
      // Exactly two: the commented organizationType line beside them is not a tenant key.
      '2 tenant column(s)',
      site('shared/supply-chain-schema.ts', HOUSE_STYLE, "organizationId: text('organization_id')", 'organizationId', 'text'),
      site('shared/supply-chain-schema.ts', HOUSE_STYLE, "tenantId: uuid('tenant_id')", 'tenantId', 'uuid'),
    ],
    expectNotIn: ['organizationType'],
  },
  {
    name: 'FAILS — a missing shared/ is a broken scan, not a clean one',
    files: { 'server/index.ts': 'export {};\n' },
    expectExit: 1,
    expectIn: ['required scan root(s) missing', 'shared'],
  },
  {
    name: 'quiet — the same four tables as pinned after 0020 (integer)',
    files: BASE,
    expectExit: 0,
    expectIn: [OK_LINE],
  },
  {
    name: 'quiet — near-misses: mdufaOrgId/organizationType/systemOrganClass, commented and DTO/zod shapes, bigint',
    files: { ...BASE, 'shared/schema/estar-registration.ts': NEAR_MISSES },
    expectExit: 0,
    expectIn: [OK_LINE],
  },
  {
    name: 'quiet — an exact file:line:column allowlist key suppresses that site',
    files: { ...BASE, [VENDOR_FILE]: VENDOR_LINK },
    allowlist: [`${VENDOR_FILE}:${VENDOR_LINE}:tenantId`],
    expectExit: 0,
    expectIn: [OK_LINE],
  },
  {
    name: 'FAILS — an allowlist key for another line (the declaration moved) suppresses nothing',
    files: { ...BASE, [VENDOR_FILE]: VENDOR_LINK },
    allowlist: [`${VENDOR_FILE}:${VENDOR_LINE + 1}:tenantId`],
    expectExit: 1,
    expectIn: ['1 tenant column(s)', `${VENDOR_FILE}:${VENDOR_LINE}  tenantId: uuid(...)`],
  },
  {
    name: 'FAILS — an allowlisted site does not cover the same column on the same line of another file',
    files: { ...BASE, [VENDOR_FILE]: VENDOR_LINK, [VENDOR_COPY_FILE]: VENDOR_COPY },
    allowlist: [`${VENDOR_FILE}:${VENDOR_LINE}:tenantId`],
    expectExit: 1,
    expectIn: ['1 tenant column(s)', `${VENDOR_COPY_FILE}:${VENDOR_LINE}  tenantId: uuid(...)`],
    expectNotIn: [`${VENDOR_FILE}:`],
  },
];

// ── Run ─────────────────────────────────────────────────────────────────────

if (process.env.SELFTEST_GATE_PATH) console.log(`${TAG} testing ${GATE} (SELFTEST_GATE_PATH)`);

let failed = 0;
for (const c of cases) {
  const { code, out } = runGate(c.files, c.allowlist ?? []);
  const missing = c.expectIn.filter((s) => !out.includes(s));
  // A failing run must not also claim to be clean, and a quiet run must not
  // have listed anything — whatever its exit code says.
  const notIn = [...(c.expectNotIn ?? []), c.expectExit === 0 ? VIOLATION_HEADER : OK_LINE];
  const unwanted = notIn.filter((s) => out.includes(s));
  const ok = code === c.expectExit && missing.length === 0 && unwanted.length === 0;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
  if (!ok) {
    failed++;
    if (code !== c.expectExit) console.log(`      expected exit ${c.expectExit}, got ${code}`);
    for (const s of missing) console.log(`      output lacked: ${JSON.stringify(s)}`);
    for (const s of unwanted) console.log(`      output should not contain: ${JSON.stringify(s)}`);
    console.log(out.trimEnd().split('\n').map((l) => `      | ${l}`).join('\n'));
  }
}

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold.`);
  process.exit(1);
}
console.log(`\n${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);
