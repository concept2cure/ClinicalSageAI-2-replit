#!/usr/bin/env node
/**
 * Self-test for scripts/ci/check-tenant-blind-models.mjs (ci:tenant-blind-models).
 *
 * The gate reports OK on the current tree — four blind models, all baselined —
 * so its failure branch never fires in normal use, and a guard whose failure
 * branch has never been seen has not been tested (CLAUDE.md, working agreement).
 *
 * Each case builds a throwaway repo in a temp directory — a drizzle journal at
 * migrations/0000_sweet_joseph.sql, models under shared/, a baseline at
 * docs/reports/tenant-blind-models-baseline.json — writes a copy of the gate
 * whose `repoRoot` is that directory, runs it as a subprocess, and asserts its
 * exit code and what it names.
 *
 * The failing cases are the defect the gate was written for: the stale
 * shared/cmc-schema.ts models of drug_products / drug_substances, which omit the
 * `organization_id` their tables declare NOT NULL, so every route on them is
 * structurally unable to carry an organization predicate. The DDL and model
 * text below are those definitions, trimmed. Out of scope here, as it is for the
 * gate: the reverse direction (a model declaring a column the SQL lineage never
 * created — the electronic_signatures incident), which other gates own.
 *
 * Baseline semantics asserted: an entry with a written reason suppresses; an
 * entry whose reason is missing, empty, or the generated TODO fails; a stale
 * entry fails. Every fixture baseline has the real file's shape, `{ _readme,
 * entries }`. --write-baseline is the documented fix-up path (the stale-entry
 * message and npm ci:tenant-blind-models:write-baseline both point at it), so
 * it is held to what that path must do: keep written reasons, record a new
 * blind model as TODO, PRUNE stale entries (that is how "the list may only
 * SHRINK" is enforced), and keep the file's `_readme` — in the real baseline,
 * the "READ BEFORE 'FIXING' ANY cmc-schema ENTRY" warning that adding
 * organizationId without route predicates would create a cross-tenant write.
 *
 * KNOWN GATE DEFECT (2026-10-01): the gate's --write-baseline writes
 * `JSON.stringify({ entries })`, so every regenerate deletes `_readme`. The case
 * "--write-baseline keeps the baseline's _readme" therefore FAILS against the
 * gate as it stands, and that is the correct outcome: the fix belongs in the
 * gate (write `{ ...existing, entries }`), not here. Do not weaken that case to
 * match the lossy behaviour.
 *
 * KNOWN GATE LIMITATION (not covered, by design — a false negative): the gate
 * takes a model's body to be the text from its `pgTable(` match up to the next
 * "\nexport const". Comments and any `export type` / `export function` in that
 * span count as the model. So a blind model whose body carries
 * `// TODO: add organizationId once the routes are scoped`, or which is followed
 * by `export type Row = typeof t.$inferSelect & { organizationId: number }`, is
 * read as tenant-aware, and the gate exits 0. No real model is masked this way
 * today. Fix in the gate (strip comments; bound the body by matching the
 * `pgTable(` call's parentheses), then add those two shapes as FAILS cases.
 *
 * Mutation check: SELFTEST_GATE_PATH=<copy of the gate> runs every case
 * against that copy instead of the real gate.
 *
 * Usage: node scripts/ci/check-tenant-blind-models.selftest.mjs   (exit 0 = every case held)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TAG = '[ci:tenant-blind-models:selftest]';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-tenant-blind-models.mjs');
const REAL_BASELINE = path.join(repoRoot, 'docs', 'reports', 'tenant-blind-models-baseline.json');
const BASELINE_REL = 'docs/reports/tenant-blind-models-baseline.json';
const REASON =
  'Selftest fixture: a stale parallel definition whose routes fail closed; fix order documented.';
const TODO_REASON = 'TODO: state why this model may omit the tenant column, or fix it.';

/** The real baseline's top-level `_readme` (trimmed) — what a regenerate must not discard. */
const FIXTURE_README = [
  'Drizzle models that omit a tenant column their physical table declares.',
  'Gate: scripts/ci/check-tenant-blind-models.mjs. The list may only SHRINK.',
  '',
  "READ BEFORE 'FIXING' ANY cmc-schema ENTRY BELOW. Adding organizationId to",
  'these models WITHOUT first adding an organization predicate to the routes',
  'that use them would CREATE a cross-tenant write that does not exist today.',
];

// ── Fixture text ─────────────────────────────────────────────────────────────

/** One drizzle-journal CREATE TABLE, in the exact shape drizzle-kit emits. */
const ddl = (table, cols) =>
  `CREATE TABLE "${table}" (\n${cols.map(c => `\t${c}`).join(',\n')}\n);\n--> statement-breakpoint\n`;

const DRUG_PRODUCTS_DDL = ddl('drug_products', [
  '"id" serial PRIMARY KEY NOT NULL',
  '"organization_id" integer NOT NULL',
  '"product_name" text NOT NULL',
  '"dosage_form" text NOT NULL',
  '"strength" text NOT NULL',
  '"created_at" timestamp DEFAULT now() NOT NULL',
]);
const DRUG_SUBSTANCES_DDL = ddl('drug_substances', [
  '"id" serial PRIMARY KEY NOT NULL',
  '"organization_id" integer NOT NULL',
  '"substance_name" text NOT NULL',
  '"structural_formula" text',
]);
const CMC_PROJECTS_DDL = ddl('cmc_projects', [
  '"id" serial PRIMARY KEY NOT NULL',
  '"organization_id" integer NOT NULL',
  '"name" text NOT NULL',
]);
const ANALYTICAL_METHODS_DDL = ddl('analytical_methods', [
  '"id" serial PRIMARY KEY NOT NULL',
  '"organization_id" integer NOT NULL',
  '"method_code" text NOT NULL',
  '"title" text NOT NULL',
  '"purpose" text NOT NULL',
]);
const MANUFACTURING_PROCESSES_DDL = ddl('manufacturing_processes', [
  '"id" serial PRIMARY KEY NOT NULL',
  '"organization_id" integer NOT NULL',
  '"process_name" text NOT NULL',
]);

/** shared/cmc-schema.ts::cmcProjects — tenant-aware; sits BEFORE the blind models. */
const CMC_PROJECTS_MODEL = `export const cmcProjects = pgTable('cmc_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull(),
  name: text('name').notNull(),
});
`;

/** shared/cmc-schema.ts::drugProducts — the blind model, as it stands in the tree. */
const DRUG_PRODUCTS_BLIND = `export const drugProducts = pgTable('drug_products', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => cmcProjects.id, { onDelete: 'cascade' }),
  productName: text('product_name').notNull(),
  dosageForm: text('dosage_form'),
  strength: text('strength'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
`;

/** shared/cmc-schema.ts::drugSubstances — blind; in the tree it precedes tenant-aware models. */
const DRUG_SUBSTANCES_BLIND = `export const drugSubstances = pgTable('drug_substances', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => cmcProjects.id, { onDelete: 'cascade' }),
  substanceName: text('substance_name').notNull(),
  structuralFormula: text('structural_formula'),
});
`;

/**
 * shared/cmc-schema.ts::analyticalMethods once FIXED — it now maps organization_id,
 * so the baseline entry the real file still carries for it is stale.
 */
const ANALYTICAL_METHODS_FIXED = `export const analyticalMethods = pgTable('analytical_methods', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull(),
  methodCode: text('method_code').notNull(),
  title: text('title').notNull(),
  purpose: text('purpose').notNull(),
});
`;

/** shared/cmc-schema.ts::manufacturingProcesses — tenant-aware; FOLLOWS a blind model. */
const MANUFACTURING_PROCESSES_MODEL = `export const manufacturingProcesses = pgTable('manufacturing_processes', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull(),
  processName: text('process_name').notNull(),
});
`;

/** shared/schema.ts::drugProducts — the canonical, tenant-aware definition (multi-line call). */
const DRUG_PRODUCTS_CANONICAL = `export const drugProducts = pgTable(
  'drug_products',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    productName: text('product_name').notNull(),
  },
  (table) => ({
    orgIdx: index('drug_products_org_idx').on(table.organizationId),
  }),
);
`;

// ── Harness ──────────────────────────────────────────────────────────────────

/** A copy of the gate whose repoRoot is `root`; refuses if the anchor moved. */
function patchedGate(root) {
  const src = fs.readFileSync(GATE, 'utf8');
  const anchor = /const repoRoot = [^;]+;/g;
  const hits = src.match(anchor) ?? [];
  if (hits.length !== 1) {
    // Without this, a patch that silently failed to apply would run the gate —
    // and --write-baseline — against the REAL repository.
    throw new Error(`${TAG} expected exactly one 'const repoRoot = …;' in ${GATE}, found ${hits.length}`);
  }
  const out = src.replace(anchor, `const repoRoot = ${JSON.stringify(root)};`);
  const gatePath = path.join(root, 'gate.mjs');
  fs.writeFileSync(gatePath, out);
  return gatePath;
}

function runGate(gatePath, args = []) {
  try {
    const out = execFileSync(process.execPath, [gatePath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/**
 * Build the fixture repo for one case. `baseline` is the entries map, written in
 * the real file's shape `{ _readme, entries }`; undefined = no baseline file.
 */
function buildTree({ journal, files, baseline }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-blind-models-selftest-'));
  const write = (rel, content) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  write('migrations/0000_sweet_joseph.sql', journal.join(''));
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) write(rel, content);
  if (baseline !== undefined) {
    write(BASELINE_REL, JSON.stringify({ _readme: FIXTURE_README, entries: baseline }, null, 2) + '\n');
  }
  return root;
}

const readBaseline = root => JSON.parse(fs.readFileSync(path.join(root, BASELINE_REL), 'utf8'));

// ── Cases ────────────────────────────────────────────────────────────────────

const cases = [
  {
    name: 'FAILS on the real defect — cmc-schema.ts::drugProducts omits the organization_id its table declares NOT NULL',
    journal: [CMC_PROJECTS_DDL, DRUG_PRODUCTS_DDL],
    files: { 'shared/cmc-schema.ts': CMC_PROJECTS_MODEL + '\n' + DRUG_PRODUCTS_BLIND },
    expectExit: 1,
    expectIn: [
      '2 table(s) carry a tenant column; 2 model(s) scanned; 1 blind (baseline 0)',
      'NEW tenant-blind model',
      'shared/cmc-schema.ts :: drugProducts',
      'table "drug_products" declares "organization_id"; the model does not.',
    ],
    expectNotIn: ['shared/cmc-schema.ts :: cmcProjects'],
  },
  {
    name: "FAILS on a blind model FOLLOWED by a tenant-aware one in the same file (the next export const ends the blind model's body)",
    journal: [DRUG_SUBSTANCES_DDL, MANUFACTURING_PROCESSES_DDL],
    files: { 'shared/cmc-schema.ts': DRUG_SUBSTANCES_BLIND + '\n' + MANUFACTURING_PROCESSES_MODEL },
    expectExit: 1,
    expectIn: [
      'shared/cmc-schema.ts :: drugSubstances',
      'table "drug_substances" declares "organization_id"',
    ],
    expectNotIn: ['shared/cmc-schema.ts :: manufacturingProcesses'],
  },
  {
    name: 'FAILS on tenant_id and org_id tables, naming the column each one declares',
    journal: [
      ddl('submission_events', ['"id" serial PRIMARY KEY NOT NULL', '"tenant_id" integer NOT NULL', '"kind" text']),
      ddl('vendor_contacts', ['"id" serial PRIMARY KEY NOT NULL', '"org_id" integer NOT NULL', '"email" text']),
    ],
    files: {
      'shared/events.ts': `export const submissionEvents = pgTable('submission_events', {
  id: serial('id').primaryKey(),
  kind: text('kind'),
});
export const vendorContacts = pgTable('vendor_contacts', {
  id: serial('id').primaryKey(),
  email: text('email'),
});
`,
    },
    expectExit: 1,
    expectIn: [
      'shared/events.ts :: submissionEvents',
      'table "submission_events" declares "tenant_id"',
      'shared/events.ts :: vendorContacts',
      'table "vendor_contacts" declares "org_id"',
    ],
  },
  {
    name: 'FAILS when the model maps only a look-alike column (sponsorOrgId → sponsor_org_id), not the tenant key',
    journal: [
      ddl('clinical_sites', [
        '"id" serial PRIMARY KEY NOT NULL',
        '"organization_id" integer NOT NULL',
        '"sponsor_org_id" integer',
        '"parent_organization_id" integer',
      ]),
    ],
    files: {
      'shared/sites.ts': `export const clinicalSites = pgTable('clinical_sites', {
  id: serial('id').primaryKey(),
  sponsorOrgId: integer('sponsor_org_id'),
  parentOrganizationId: integer('parent_organization_id'),
});
`,
    },
    expectExit: 1,
    expectIn: ['shared/sites.ts :: clinicalSites', 'table "clinical_sites" declares "organization_id"'],
  },
  {
    // shared/schema/estar-registration.ts carries `organizationIdentity` (the FDA
    // eSTAR "organization identity" prerequisite) and `mdufaOrgId` next to its real
    // organizationId. Drop organizationId and only the word boundary after
    // `organizationId` stops the prefix look-alike from passing for it.
    name: 'FAILS when the model maps only prefix look-alikes of the tenant key (estarRegistrations: organizationIdentity, mdufaOrgId)',
    journal: [
      ddl('estar_registrations', [
        '"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL',
        '"organization_id" integer NOT NULL',
        '"fda_esg_account" boolean DEFAULT false NOT NULL',
        '"organization_identity" boolean DEFAULT false NOT NULL',
        '"mdufa_org_id" varchar(64)',
      ]),
    ],
    files: {
      'shared/schema/estar-registration.ts': `export const estarRegistrations = pgTable(
  'estar_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fdaEsgAccount: boolean('fda_esg_account').notNull().default(false),
    organizationIdentity: boolean('organization_identity').notNull().default(false),
    mdufaOrgId: varchar('mdufa_org_id', { length: 64 }),
  },
);
`,
    },
    expectExit: 1,
    expectIn: [
      'shared/schema/estar-registration.ts :: estarRegistrations',
      'table "estar_registrations" declares "organization_id"',
    ],
  },
  {
    name: 'FAILS in a nested shared/ module written as a multi-line pgTable( call',
    journal: [DRUG_PRODUCTS_DDL],
    files: {
      'shared/schema/products-v2.ts': `export const drugProductsV2 = pgTable(
  'drug_products',
  {
    id: serial('id').primaryKey(),
    productName: text('product_name').notNull(),
  },
);
`,
    },
    expectExit: 1,
    expectIn: ['shared/schema/products-v2.ts :: drugProductsV2'],
  },
  {
    name: 'FAILS on a second blind model of an already-baselined table in another file (baseline is per model, not per table)',
    journal: [DRUG_PRODUCTS_DDL],
    files: {
      'shared/cmc-schema.ts': DRUG_PRODUCTS_BLIND,
      'shared/products-legacy.ts': DRUG_PRODUCTS_BLIND,
    },
    baseline: {
      'shared/cmc-schema.ts::drugProducts': { table: 'drug_products', tenantColumn: 'organization_id', reason: REASON },
    },
    expectExit: 1,
    expectIn: ['NEW tenant-blind model', 'shared/products-legacy.ts :: drugProducts'],
    expectNotIn: ['shared/cmc-schema.ts :: drugProducts', 'no longer blind'],
  },
  {
    name: 'FAILS on a baseline entry with no `reason` key',
    journal: [DRUG_PRODUCTS_DDL],
    files: { 'shared/cmc-schema.ts': DRUG_PRODUCTS_BLIND },
    baseline: { 'shared/cmc-schema.ts::drugProducts': { table: 'drug_products', tenantColumn: 'organization_id' } },
    expectExit: 1,
    expectIn: ['baseline entr(ies) with no written reason:\n  shared/cmc-schema.ts::drugProducts\n'],
    expectNotIn: ['NEW tenant-blind model'],
  },
  {
    name: 'FAILS on a baseline entry whose reason is the empty string (a key is not a justification)',
    journal: [DRUG_PRODUCTS_DDL],
    files: { 'shared/cmc-schema.ts': DRUG_PRODUCTS_BLIND },
    baseline: {
      'shared/cmc-schema.ts::drugProducts': { table: 'drug_products', tenantColumn: 'organization_id', reason: '' },
    },
    expectExit: 1,
    expectIn: ['baseline entr(ies) with no written reason:\n  shared/cmc-schema.ts::drugProducts\n'],
    expectNotIn: ['NEW tenant-blind model', 'OK — no unjustified'],
  },
  {
    name: 'FAILS on a baseline entry whose reason is the TODO placeholder --write-baseline emits',
    journal: [DRUG_PRODUCTS_DDL],
    files: { 'shared/cmc-schema.ts': DRUG_PRODUCTS_BLIND },
    baseline: {
      'shared/cmc-schema.ts::drugProducts': { table: 'drug_products', tenantColumn: 'organization_id', reason: TODO_REASON },
    },
    expectExit: 1,
    expectIn: ['baseline entr(ies) with no written reason:\n  shared/cmc-schema.ts::drugProducts\n'],
  },
  {
    name: 'FAILS on a stale entry once the model is fixed — the ratchet only shrinks',
    journal: [DRUG_PRODUCTS_DDL],
    files: { 'shared/schema.ts': DRUG_PRODUCTS_CANONICAL },
    baseline: {
      'shared/cmc-schema.ts::drugProducts': { table: 'drug_products', tenantColumn: 'organization_id', reason: REASON },
    },
    expectExit: 1,
    expectIn: ['no longer blind — remove them', 'shared/cmc-schema.ts::drugProducts'],
    expectNotIn: ['NEW tenant-blind model'],
  },
  {
    name: 'quiet — the canonical shared/schema.ts::drugProducts declares organizationId',
    journal: [DRUG_PRODUCTS_DDL],
    files: { 'shared/schema.ts': DRUG_PRODUCTS_CANONICAL },
    expectExit: 0,
    expectIn: [
      '1 table(s) carry a tenant column; 1 model(s) scanned; 0 blind (baseline 0)',
      'OK — no unjustified tenant-blind models.',
    ],
  },
  {
    name: "quiet (near-miss) — the tenant column mapped under another property name (owner: integer('organization_id'))",
    journal: [DRUG_PRODUCTS_DDL],
    files: {
      'shared/products-view.ts': `export const productView = pgTable('drug_products', {
  id: serial('id').primaryKey(),
  owner: integer("organization_id").notNull(),
});
`,
    },
    expectExit: 0,
    expectIn: ['1 model(s) scanned; 0 blind', 'OK'],
  },
  {
    name: 'quiet (near-miss) — the table has only look-alike columns (parent_organization_id, organization_name, sponsor_org_id)',
    journal: [
      ddl('organization_directory', [
        '"id" serial PRIMARY KEY NOT NULL',
        '"parent_organization_id" integer',
        '"organization_name" text NOT NULL',
        '"sponsor_org_id" integer',
      ]),
    ],
    files: {
      'shared/directory.ts': `export const organizationDirectory = pgTable('organization_directory', {
  id: serial('id').primaryKey(),
  organizationName: text('organization_name').notNull(),
});
`,
    },
    expectExit: 0,
    expectIn: ['0 table(s) carry a tenant column; 1 model(s) scanned; 0 blind', 'OK'],
  },
  {
    name: 'quiet (near-miss) — a blind model of a global table, even when the NEXT journal table is tenant-keyed',
    journal: [
      ddl('global_code_list', ['"id" serial PRIMARY KEY NOT NULL', '"code" text NOT NULL']),
      CMC_PROJECTS_DDL,
    ],
    files: {
      'shared/codes.ts': `export const globalCodeList = pgTable('global_code_list', {
  id: serial('id').primaryKey(),
  code: text('code').notNull(),
});
`,
      'shared/cmc-schema.ts': CMC_PROJECTS_MODEL,
    },
    expectExit: 0,
    expectIn: ['1 table(s) carry a tenant column; 2 model(s) scanned; 0 blind', 'OK'],
  },
  {
    name: 'quiet (near-miss) — a blind fixture model under shared/__tests__ is not a production model',
    journal: [DRUG_PRODUCTS_DDL],
    files: { 'shared/__tests__/fixtures.ts': DRUG_PRODUCTS_BLIND },
    expectExit: 0,
    expectIn: ['0 model(s) scanned; 0 blind', 'OK'],
  },
  {
    name: 'quiet — the real blind models, each baselined with a written reason',
    journal: [CMC_PROJECTS_DDL, DRUG_SUBSTANCES_DDL, DRUG_PRODUCTS_DDL],
    files: { 'shared/cmc-schema.ts': [CMC_PROJECTS_MODEL, DRUG_SUBSTANCES_BLIND, DRUG_PRODUCTS_BLIND].join('\n') },
    baseline: {
      'shared/cmc-schema.ts::drugProducts': { table: 'drug_products', tenantColumn: 'organization_id', reason: REASON },
      'shared/cmc-schema.ts::drugSubstances': { table: 'drug_substances', tenantColumn: 'organization_id', reason: REASON },
    },
    expectExit: 0,
    expectIn: ['3 model(s) scanned; 2 blind (baseline 2)', 'OK — no unjustified tenant-blind models.'],
  },
  {
    name: '--write-baseline keeps written reasons, records a new blind model as TODO, PRUNES a stale entry, and the next run still FAILS',
    journal: [DRUG_SUBSTANCES_DDL, DRUG_PRODUCTS_DDL, ANALYTICAL_METHODS_DDL],
    files: {
      'shared/cmc-schema.ts': [DRUG_SUBSTANCES_BLIND, DRUG_PRODUCTS_BLIND, ANALYTICAL_METHODS_FIXED].join('\n'),
    },
    baseline: {
      'shared/cmc-schema.ts::drugSubstances': { table: 'drug_substances', tenantColumn: 'organization_id', reason: REASON },
      // Reasoned, but the model is fixed: the regenerate the stale message prescribes must drop it.
      'shared/cmc-schema.ts::analyticalMethods': { table: 'analytical_methods', tenantColumn: 'organization_id', reason: REASON },
    },
    run(gatePath, root) {
      const before = runGate(gatePath);
      const write = runGate(gatePath, ['--write-baseline']);
      const entries = readBaseline(root).entries ?? {};
      const problems = [];
      // Precondition: the fixture really is the stale shape the regenerate is prescribed for.
      if (before.code !== 1 || !before.out.includes('no longer blind — remove them:\n  shared/cmc-schema.ts::analyticalMethods\n')) {
        problems.push('precondition: the plain run did not report analyticalMethods as stale');
      }
      if (write.code !== 0) problems.push(`--write-baseline exited ${write.code}`);
      const keys = Object.keys(entries).sort();
      const want = ['shared/cmc-schema.ts::drugProducts', 'shared/cmc-schema.ts::drugSubstances'];
      if (JSON.stringify(keys) !== JSON.stringify(want)) {
        problems.push(`regenerated entries were ${JSON.stringify(keys)}, expected exactly ${JSON.stringify(want)}`);
      }
      if ('shared/cmc-schema.ts::analyticalMethods' in entries) {
        problems.push('the stale analyticalMethods entry survived the regenerate — the ratchet cannot shrink');
      }
      if (entries['shared/cmc-schema.ts::drugSubstances']?.reason !== REASON) {
        problems.push('the existing written reason was not preserved');
      }
      if (entries['shared/cmc-schema.ts::drugProducts']?.reason !== TODO_REASON) {
        problems.push('the new blind model was not recorded with the TODO reason');
      }
      const after = runGate(gatePath);
      return { ...after, out: `${write.out}\n${after.out}`, problems };
    },
    expectExit: 1,
    expectIn: [
      'wrote baseline with 2 entr(ies)',
      '2 blind (baseline 2)',
      'baseline entr(ies) with no written reason:\n  shared/cmc-schema.ts::drugProducts\n',
    ],
    expectNotIn: ['no longer blind', 'shared/cmc-schema.ts::analyticalMethods', 'NEW tenant-blind model'],
  },
  {
    // KNOWN GATE DEFECT (see header): fails until the gate writes `{ ...existing, entries }`.
    name: "--write-baseline keeps the baseline's _readme (the real file's 'READ BEFORE FIXING' warning)",
    journal: [DRUG_PRODUCTS_DDL],
    files: { 'shared/cmc-schema.ts': DRUG_PRODUCTS_BLIND },
    baseline: {
      'shared/cmc-schema.ts::drugProducts': { table: 'drug_products', tenantColumn: 'organization_id', reason: REASON },
    },
    run(gatePath, root) {
      const write = runGate(gatePath, ['--write-baseline']);
      const written = readBaseline(root);
      const problems = [];
      if (write.code !== 0) problems.push(`--write-baseline exited ${write.code}`);
      if (JSON.stringify(written._readme) !== JSON.stringify(FIXTURE_README)) {
        problems.push(
          `--write-baseline discarded the baseline's _readme (top-level keys after: ${JSON.stringify(Object.keys(written))}) — ` +
            'GATE DEFECT: it writes { entries } only; fix the gate to write { ...existing, entries }',
        );
      }
      if (written.entries?.['shared/cmc-schema.ts::drugProducts']?.reason !== REASON) {
        problems.push('the existing written reason was not preserved');
      }
      const after = runGate(gatePath);
      return { ...after, out: `${write.out}\n${after.out}`, problems };
    },
    expectExit: 0,
    expectIn: ['wrote baseline with 1 entr(ies)', '1 blind (baseline 1)', 'OK — no unjustified tenant-blind models.'],
  },
];

// ── Run ──────────────────────────────────────────────────────────────────────

const hashOf = p => (fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : 'absent');
const realBaselineBefore = hashOf(REAL_BASELINE);

let failed = 0;
for (const c of cases) {
  const root = buildTree(c);
  let result;
  try {
    const gatePath = patchedGate(root);
    result = c.run ? c.run(gatePath, root) : runGate(gatePath);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  const { code, out, problems = [] } = result;
  const missing = c.expectIn.filter(s => !out.includes(s));
  const unexpected = (c.expectNotIn ?? []).filter(s => out.includes(s));
  const ok = code === c.expectExit && !missing.length && !unexpected.length && !problems.length;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
  if (ok) continue;
  failed++;
  if (code !== c.expectExit) console.log(`      expected exit ${c.expectExit}, got ${code}`);
  for (const s of missing) console.log(`      output lacked: ${JSON.stringify(s)}`);
  for (const s of unexpected) console.log(`      output should not contain: ${JSON.stringify(s)}`);
  for (const p of problems) console.log(`      ${p}`);
  console.log(out.split('\n').map(l => `      | ${l}`).join('\n'));
}

if (hashOf(REAL_BASELINE) !== realBaselineBefore) {
  console.error(`\n${TAG} FAIL — the real ${BASELINE_REL} changed during the selftest`);
  process.exit(1);
}

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold (gate: ${path.relative(repoRoot, GATE)})`);
  process.exit(1);
}
console.log(`\n${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);
