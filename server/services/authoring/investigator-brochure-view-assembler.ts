/**
 * Assemble the v2 InvestigatorBrochure surface's render contract (the ICH E6(R3)
 * Appendix A IB section tree with a per-section readiness verdict) for ONE PROJECT,
 * from the REAL upstream evidence stores — NOT the seed-only
 * `c2c_investigator_brochure` blob (retired 2026-08; see
 * docs/architecture/C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md).
 *
 * The IB is not authored instance data with its own table; it is *assembled* from
 * the upstream artefacts the CTD composers already produce (ICH E6(R3) Appendix A; ICH M4).
 * So this assembler derives each of the four IB input domains from the store where
 * the project's real evidence actually lives, then runs the EXISTING deterministic
 * `ib-builder` gap engine (`ibSectionRows`) to get the honest per-section
 * rendered/partial/missing verdict. No IB prose is fabricated — only the (real) ICH
 * section registry and honest status/gap verdicts.
 *
 * ── One project (2026-11-12, S12 sweep finding 92) ───────────────────────────
 * Until then the view was the ORGANISATION's: a domain was "available" when any
 * project of the organisation held a row. With C2C-101 open the page read 36% on
 * the strength of C2C-201's Module 3 sections, and with no project open it still
 * showed a percentage. A readiness figure belongs to the project whose brochure it
 * describes, so every store is now read for the named project only, and a store
 * that cannot say which project a row belongs to is not read at all.
 *
 * Domain → real upstream store(s), and how a row names its project (a domain is
 * "available" when the project has ≥1 qualifying row in ANY of its candidate stores;
 * each store is `to_regclass`-guarded so a not-yet-migrated store is an honest absent
 * domain, never a throw):
 *
 *   nonclinical (§4/4.1–4.3, feeds §1/§6)  ← nonclinical_studies (governed registry,
 *                                             migrations/20260610_nonclinical_send.sql;
 *                                             deleted_at aware), through its
 *                                             submission's program_id. A study with no
 *                                             submission belongs to no project.
 *   clinical    (§5/5.1/5.2, feeds §1/§6)  ← clinical_studies.program_id (deleted_at
 *                                             aware). clinical_ops.studies carries the
 *                                             organisation and no project, so it is
 *                                             NOT read; `storesWithoutProject` names it.
 *   safety      (§5.2/5.3, feeds §1/§6)    ← adverse_events.project_id (ICSR worklist) OR
 *                                             risk_management_plans.project_id (GVP-V
 *                                             identified/potential risks)
 *   product     (§2/§3)                    ← cmc_module3_sections.project_id (compiled
 *                                             M3.2.S/P product & formulation content)
 *
 * HONEST-EMPTY SPLIT: a domain with no real backing rows (e.g. a project that has not
 * yet compiled any Module 3 product content) is honestly ABSENT — the sections that
 * need it render `missing` with the input they still need, never a fabricated verdict.
 * A project with no upstream evidence at all yields the same honest ICH E6(R3)
 * Appendix A skeleton the route falls closed to, with `provisioned=false` and a
 * completeness of 0: the figure counts only the sections that need project data.
 *
 * Not read (stated, not hidden): documents filed in the project's Vault. A toxicology
 * report held there as a PDF does not make §4 "ready" here; only the registers above do.
 *
 * Data flow mirrors server/services/nonclinical/m26-m4-view.ts + the nonclinical
 * summary route: a small bulk read of the real registries, then a pure projection.
 */
import { pool } from '../../db';
import { ibCompleteness, ibSectionRows, type IBInputDomain, type IBSectionRow } from './ib-builder';

export type { IBSectionRow };

/** The four data-bearing IB input domains (excludes the always-available 'none'). */
export type IBDataDomain = Exclude<IBInputDomain, 'none'>;

/** The assembled IB readiness view (rows + the meta the route surfaces). */
export interface IBView {
  rows: IBSectionRow[];
  /** Which data domains the project actually has real upstream evidence for. */
  availability: Record<IBDataDomain, boolean>;
  /** The real stores that were read AND had this project's rows (honest provenance). */
  sources: string[];
  /** meta.source string — the real store(s) backing the read. */
  source: string;
  /** Installed stores that carry no project link, so were not read for a project. */
  storesWithoutProject: string[];
  /** True when the project has real evidence for at least one data domain. */
  provisioned: boolean;
  /** Share (0–100) of the REQUIRED sections that need project data and have all of it. */
  completeness: number;
  /** No authored IB instance identity in an availability view — honestly null. */
  productName: string | null;
}

/** A column that names a row's project, on the store itself or on the table its foreign key points to. */
type ProjectLink =
  | { column: string }
  | { through: { name: string; regclass: string; fk: string; orgColumn: string; column: string } };

/** A candidate real upstream store for one IB domain. */
interface StoreProbe {
  domain: IBDataDomain;
  /** Canonical store name (also the FROM-clause reference) for meta.sources. */
  name: string;
  /** Argument to `to_regclass` (schema-qualified where needed). */
  regclass: string;
  /** The tenant column on this store. Its TYPE is read from the catalog at
   *  probe time, never assumed — see `deriveAvailability`. */
  orgColumn: string;
  /** Extra predicate ANDed after the tenant filter, or null. Must not
   *  reference $1 or $2: the tenant and project comparisons are built from the catalog. */
  extra?: string;
  /** How a row names its project. Absent: the store has no project link and is
   *  not read for a project (the caller is told which stores those are). */
  project?: ProjectLink;
}

/**
 * The IB domain → real store map. Ordered so the first-listed store for a domain is
 * the canonical/primary one. `name` doubles as the FROM-clause table reference
 * (schema-qualified names are valid in both the `to_regclass` argument and the
 * FROM position).
 *
 * ── Why the tenant cast is NOT written here ──────────────────────────────────
 * It used to be. Each probe carried a full `where` string with the cast baked
 * in — `organization_id = $1::int` for some stores, `$1::text` for others — and
 * two of them were simply wrong: `adverse_events.organization_id` and
 * `risk_management_plans.organization_id` are INTEGER in the schema, and both
 * probes cast the parameter to text. Postgres has no `integer = text` operator,
 * so the UNION below failed to plan and `GET /api/investigator-brochure`
 * returned 500 on EVERY call, for every tenant, however much evidence the org
 * had. Nothing degraded; the whole surface was simply down.
 *
 * A cast written next to a table name is an assertion about that table's schema
 * held in a different file from the schema, so it drifts silently and is only
 * discovered by the endpoint falling over. The type is now read from the
 * catalog in the same round trip that checks the table exists, so the probe
 * cannot disagree with the database it is probing.
 */
const STORE_PROBES: StoreProbe[] = [
  {
    domain: 'nonclinical',
    name: 'nonclinical_studies',
    regclass: 'public.nonclinical_studies',
    orgColumn: 'organization_id',
    extra: 'deleted_at IS NULL',
    project: { through: { name: 'submissions', regclass: 'public.submissions', fk: 'submission_id', orgColumn: 'organization_id', column: 'program_id' } },
  },
  {
    domain: 'clinical',
    name: 'clinical_ops.studies',
    regclass: 'clinical_ops.studies',
    orgColumn: 'org_id',
  },
  {
    domain: 'clinical',
    name: 'clinical_studies',
    regclass: 'public.clinical_studies',
    orgColumn: 'organization_id',
    extra: 'deleted_at IS NULL',
    project: { column: 'program_id' },
  },
  {
    domain: 'safety',
    name: 'adverse_events',
    regclass: 'public.adverse_events',
    orgColumn: 'organization_id',
    project: { column: 'project_id' },
  },
  {
    domain: 'safety',
    name: 'risk_management_plans',
    regclass: 'public.risk_management_plans',
    orgColumn: 'organization_id',
    extra: "(COALESCE(identified_risks, '[]') <> '[]' OR COALESCE(potential_risks, '[]') <> '[]')",
    project: { column: 'project_id' },
  },
  {
    domain: 'product',
    name: 'cmc_module3_sections',
    regclass: 'public.cmc_module3_sections',
    orgColumn: 'organization_id',
    project: { column: 'project_id' },
  },
];

/** information_schema.data_type values that compare against $1::int.
 *  Anything else (text, varchar, uuid, citext) is compared as text. */
const INTEGER_TYPES = new Set(['integer', 'bigint', 'smallint']);

const ALL_DOMAINS: IBDataDomain[] = ['product', 'nonclinical', 'clinical', 'safety'];

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `schema.table` → its two parts, defaulting to `public`. */
function tableOf(regclass: string): [string, string] {
  const [schema, table] = regclass.includes('.') ? regclass.split('.') : ['public', regclass];
  return [schema, table];
}

/** The catalog's data_type of one column, as a correlated scalar. Names are constants of this file. */
function columnType(regclass: string, column: string): string {
  const [schema, table] = tableOf(regclass);
  return `(SELECT data_type FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${table}' AND column_name = '${column}')`;
}

const known = (type: unknown): type is string => typeof type === 'string' && type.length > 0;

/** The comparison of a tenant column against $1, cast as the catalog types the column. */
const orgEquals = (column: string, type: string): string => `${column} = ${INTEGER_TYPES.has(type) ? '$1::int' : '$1::text'}`;

/** The comparison of a project column against $2. A project id is a UUID: an
 *  integer-typed column cannot hold one, so it is no project link at all. */
function projectEquals(column: string, type: unknown): string | null {
  if (!known(type) || INTEGER_TYPES.has(type)) return null;
  return `${column} = ${type === 'uuid' ? '$2::uuid' : '$2::text'}`;
}

/**
 * Derive per-domain availability for one project from the real upstream stores. Two bulk reads:
 *   1. one catalog batch to learn which candidate stores exist, the type of each
 *      one's tenant column, and whether and how each names a project, then
 *   2. one UNION-ALL EXISTS probe across only the stores that can be read for a project.
 * A missing store is simply skipped (its domain stays absent) — never a 42P01.
 * A genuine connection error propagates to the caller (the route fails closed).
 */
async function deriveAvailability(orgId: number, programId: string): Promise<{
  availability: Record<IBDataDomain, boolean>;
  sources: string[];
  storesWithoutProject: string[];
}> {
  const availability: Record<IBDataDomain, boolean> = {
    product: false,
    nonclinical: false,
    clinical: false,
    safety: false,
  };

  // 1. Which candidate stores exist here, what TYPE is each one's tenant column,
  //    and what type is the column that names its project? All three answers come
  //    from the catalog in one round trip, so the probe below is built against the
  //    schema that is actually installed rather than against an assumption recorded
  //    in this file.
  //
  //    `to_regclass` answers existence (and tolerates a missing schema, which a
  //    join against information_schema would not). Each type lookup is a separate
  //    correlated scalar, matched on the same schema and table the regclass names.
  //    For a store attributed through another table (a study through its
  //    submission), that table's tenant and project columns are typed too, and the
  //    store's own foreign-key column is checked to exist.
  const catalogSelects = STORE_PROBES.map((p, i) => {
    const link = p.project;
    const projectType = !link ? 'NULL::text'
      : 'column' in link ? columnType(p.regclass, link.column)
        : columnType(link.through.regclass, link.through.column);
    const through = link && 'through' in link ? link.through : null;
    return [
      `to_regclass('${p.regclass}') AS r${i}`,
      `${columnType(p.regclass, p.orgColumn)} AS t${i}`,
      `${projectType} AS p${i}`,
      `${through ? columnType(p.regclass, through.fk) : 'NULL::text'} AS f${i}`,
      `${through ? columnType(through.regclass, through.orgColumn) : 'NULL::text'} AS o${i}`,
    ].join(', ');
  }).join(', ');
  const regRes = await pool.query(`SELECT ${catalogSelects}`);
  const regRow = (regRes.rows[0] ?? {}) as Record<string, unknown>;

  /* A store is probe-able only if it EXISTS and its tenant column exists. A
     table present without the column it is supposed to be scoped by is not a
     store we can read safely — skipping it degrades one domain, where guessing
     would either crash the endpoint or, worse, probe unscoped. */
  const present = STORE_PROBES
    .map((probe, i) => ({ probe, i, type: regRow[`t${i}`], exists: regRow[`r${i}`] != null }))
    .filter((x): x is { probe: StoreProbe; i: number; type: string; exists: boolean } => x.exists && known(x.type));

  /* The same care for the project: a store is read for a project only when a
     column says which project a row belongs to. One that cannot say is not read,
     and is named, so "missing" is never mistaken for "looked and found nothing". */
  const readable: Array<{ probe: StoreProbe; where: string }> = [];
  const storesWithoutProject: string[] = [];
  for (const { probe, i, type } of present) {
    const link = probe.project;
    let project: string | null = null;
    if (link && 'column' in link) {
      project = projectEquals(link.column, regRow[`p${i}`]);
    } else if (link && known(regRow[`f${i}`]) && known(regRow[`o${i}`])) {
      const t = link.through;
      const inner = projectEquals(t.column, regRow[`p${i}`]);
      project = inner && `${t.fk} IN (SELECT id FROM ${t.name} WHERE ${orgEquals(t.orgColumn, String(regRow[`o${i}`]))} AND ${inner})`;
    }
    if (!project) { storesWithoutProject.push(probe.name); continue; }
    readable.push({ probe, where: [orgEquals(probe.orgColumn, type), project, probe.extra].filter(Boolean).join(' AND ') });
  }
  if (readable.length === 0) return { availability, sources: [], storesWithoutProject };

  // 2. One bulk probe: which readable stores hold this project's rows? (Table and
  //    column names are fixed constants from STORE_PROBES — never user input —
  //    so the interpolation is injection-safe; the organisation and the project
  //    are the only bound parameters.)
  //
  //    The casts are derived, not declared: an integer-keyed column compares
  //    against $1::int and a text-keyed one against $1::text; a uuid project
  //    column against $2::uuid and a text one against $2::text. Casting the
  //    parameter (rather than the column) keeps any index on the column usable.
  const union = readable
    .map(({ probe, where }) =>
      `SELECT '${probe.domain}' AS domain, '${probe.name}' AS store WHERE EXISTS (SELECT 1 FROM ${probe.name} WHERE ${where})`)
    .join(' UNION ALL ');
  // Both bound as text and cast per-column above, so the parameter types are
  // unambiguous whichever stores this database happens to have.
  const hitRes = await pool.query(union, [String(orgId), programId]);
  const sources = new Set<string>();
  for (const row of hitRes.rows as Array<{ domain: IBDataDomain; store: string }>) {
    availability[row.domain] = true;
    sources.add(row.store);
  }
  return { availability, sources: [...sources], storesWithoutProject };
}

/**
 * Assemble one project's IB readiness view from the real upstream evidence stores.
 * Read-only; scoped to the organisation and the project; deterministic given the
 * stored rows. The caller has already admitted the reader to the project
 * (server/routes/investigator-brochure.routes.ts): this function does not decide access.
 */
export async function assembleProjectIBSections(orgId: number, programId: string): Promise<IBView> {
  if (!PROJECT_ID.test(programId)) throw new Error('A project id is required to assemble Investigator\'s Brochure readiness.');
  const { availability, sources, storesWithoutProject } = await deriveAvailability(orgId, programId);
  const rows = ibSectionRows({ ...availability, none: true });
  const provisioned = ALL_DOMAINS.some((d) => availability[d]);
  return {
    rows,
    availability,
    sources,
    // Honest provenance: when no store backed the read, report 'none' rather
    // than naming a specific store ('nonclinical_studies') that contributed
    // nothing — the rest of this assembler already reports the empty state
    // honestly (provisioned:false, productName:null).
    source: sources.length ? sources.join('+') : 'none',
    storesWithoutProject,
    provisioned,
    completeness: ibCompleteness(rows),
    productName: null,
  };
}

export default { assembleProjectIBSections };
