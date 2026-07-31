/**
 * Assemble the v2 InvestigatorBrochure surface's render contract (the ICH E6(R2)
 * §7 IB section tree with a per-section readiness verdict) from the REAL,
 * org-scoped upstream evidence stores — NOT the seed-only `c2c_investigator_brochure`
 * blob (retired 2026-08; see docs/architecture/C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md).
 *
 * The IB is not authored instance data with its own table; it is *assembled* from
 * the upstream artefacts the CTD composers already produce (ICH E6(R2) §7; ICH M4).
 * So this assembler derives each of the four IB input domains from the store where
 * the org's real evidence actually lives, then runs the EXISTING deterministic
 * `ib-builder` gap engine (`flattenSections` + `detectSectionGaps` + `sectionStatus`)
 * to get the honest per-section rendered/partial/missing verdict. No IB prose is
 * fabricated — only the (real) ICH section registry and honest status/gap verdicts.
 *
 * Domain → real upstream store(s) (a domain is "available" when the org has ≥1
 * qualifying row in ANY of its candidate stores; each store is `to_regclass`-guarded
 * so a not-yet-migrated store is an honest absent domain, never a throw):
 *
 *   nonclinical (§4/4.1–4.3, feeds §1/§6)  ← nonclinical_studies (governed registry,
 *                                             migrations/20260610_nonclinical_send.sql;
 *                                             organization_id int, deleted_at aware)
 *   clinical    (§5/5.1/5.2, feeds §1/§6)  ← clinical_ops.studies (org_id text) OR
 *                                             clinical_studies (organization_id int,
 *                                             deleted_at aware)
 *   safety      (§5.2/5.3, feeds §1/§6)    ← adverse_events (ICSR worklist; org text) OR
 *                                             risk_management_plans (GVP-V identified/
 *                                             potential risks; org text)
 *   product     (§2/§3)                    ← cmc_module3_sections (compiled M3.2.S/P
 *                                             product & formulation content; org int)
 *
 * HONEST-EMPTY SPLIT: a domain with no real backing rows (e.g. an org that has not
 * yet compiled any Module 3 product content) is honestly ABSENT — the sections that
 * need it render `missing` with the input they still need, never a fabricated verdict.
 * An org with no upstream evidence at all yields the same honest ICH E6(R2) §7
 * skeleton the route falls closed to, with `provisioned=false`.
 *
 * Data flow mirrors server/services/nonclinical/m26-m4-view.ts + the nonclinical
 * summary route: a small bulk read of the real registries, then a pure projection.
 */
import { pool } from '../../db';
import {
  flattenSections,
  detectSectionGaps,
  sectionStatus,
  type IBInputDomain,
} from './ib-builder';

/** The four data-bearing IB input domains (excludes the always-available 'none'). */
export type IBDataDomain = Exclude<IBInputDomain, 'none'>;

/** Per-section display contract the v2 InvestigatorBrochure surface renders. */
export interface IBSectionRow {
  number: string;
  title: string;
  required: boolean;
  status: 'rendered' | 'partial' | 'missing';
  gaps: string[];
  description: string;
  /** 0 = top-level IB chapter / front matter, 1 = sub-section (e.g. 4.1). */
  depth: number;
}

/** The assembled IB readiness view (rows + the meta the route surfaces). */
export interface IBView {
  rows: IBSectionRow[];
  /** Which data domains the org actually has real upstream evidence for. */
  availability: Record<IBDataDomain, boolean>;
  /** The real stores that were read AND had org-scoped rows (honest provenance). */
  sources: string[];
  /** meta.source string — the real store(s) backing the read. */
  source: string;
  /** True when the org has real evidence for at least one data domain. */
  provisioned: boolean;
  /** Fraction (0–100) of REQUIRED sections that render (all inputs present). */
  completeness: number;
  /** No authored IB instance identity in an availability view — honestly null. */
  productName: string | null;
}

/** A candidate real upstream store for one IB domain. */
interface StoreProbe {
  domain: IBDataDomain;
  /** Canonical store name (also the FROM-clause reference) for meta.sources. */
  name: string;
  /** Argument to `to_regclass` (schema-qualified where needed). */
  regclass: string;
  /** EXISTS-probe body (no wrapping EXISTS) filtered to the org via $1. */
  where: string;
}

/**
 * The IB domain → real store map. Ordered so the first-listed store for a domain is
 * the canonical/primary one. `$1` binds the org id (int); text-keyed stores cast it.
 * `name` doubles as the FROM-clause table reference (schema-qualified names are valid
 * in both the `to_regclass` argument and the FROM position).
 */
const STORE_PROBES: StoreProbe[] = [
  {
    domain: 'nonclinical',
    name: 'nonclinical_studies',
    regclass: 'public.nonclinical_studies',
    where: 'organization_id = $1::int AND deleted_at IS NULL',
  },
  {
    domain: 'clinical',
    name: 'clinical_ops.studies',
    regclass: 'clinical_ops.studies',
    where: 'org_id = $1::text',
  },
  {
    domain: 'clinical',
    name: 'clinical_studies',
    regclass: 'public.clinical_studies',
    where: 'organization_id = $1::int AND deleted_at IS NULL',
  },
  {
    domain: 'safety',
    name: 'adverse_events',
    regclass: 'public.adverse_events',
    where: 'organization_id = $1::text',
  },
  {
    domain: 'safety',
    name: 'risk_management_plans',
    regclass: 'public.risk_management_plans',
    where:
      "organization_id = $1::text AND (COALESCE(identified_risks, '[]') <> '[]' OR COALESCE(potential_risks, '[]') <> '[]')",
  },
  {
    domain: 'product',
    name: 'cmc_module3_sections',
    regclass: 'public.cmc_module3_sections',
    where: 'organization_id = $1::int',
  },
];

const ALL_DOMAINS: IBDataDomain[] = ['product', 'nonclinical', 'clinical', 'safety'];

const depthOf = (number: string): number => (number.includes('.') ? 1 : 0);

/** Build the display rows for a given domain-availability map via the IB gap engine. */
function rowsFor(availability: Record<IBDataDomain, boolean>): IBSectionRow[] {
  const available: Record<IBInputDomain, boolean> = { ...availability, none: true };
  return flattenSections().map((s) => {
    const gaps = detectSectionGaps(s, available);
    return {
      number: s.number,
      title: s.title,
      required: s.required,
      status: sectionStatus(s, available, gaps),
      gaps,
      description: s.description,
      depth: depthOf(s.number),
    };
  });
}

/** Fraction of REQUIRED sections rendered (mirrors the builder's completeness rollup). */
function completenessOf(rows: IBSectionRow[]): number {
  const required = rows.filter((r) => r.required);
  const rendered = required.filter((r) => r.status === 'rendered').length;
  return required.length ? Math.round((rendered / required.length) * 100) : 0;
}

/**
 * Derive per-domain availability from the real upstream stores. Two bulk reads:
 *   1. one `to_regclass` batch to learn which candidate stores exist, then
 *   2. one UNION-ALL EXISTS probe across only the present stores.
 * A missing store is simply skipped (its domain stays absent) — never a 42P01.
 * A genuine connection error propagates to the caller (the route fails closed).
 */
async function deriveAvailability(orgId: number): Promise<{
  availability: Record<IBDataDomain, boolean>;
  sources: string[];
}> {
  const availability: Record<IBDataDomain, boolean> = {
    product: false,
    nonclinical: false,
    clinical: false,
    safety: false,
  };

  // 1. Which candidate stores actually exist in this database?
  const regSelects = STORE_PROBES.map(
    (p, i) => `to_regclass('${p.regclass}') AS r${i}`,
  ).join(', ');
  const regRes = await pool.query(`SELECT ${regSelects}`);
  const regRow = (regRes.rows[0] ?? {}) as Record<string, unknown>;
  const present = STORE_PROBES.filter((_, i) => regRow[`r${i}`] != null);
  if (present.length === 0) return { availability, sources: [] };

  // 2. One bulk probe: which present stores hold org-scoped rows? (Table names are
  //    fixed constants from STORE_PROBES — never user input — so the interpolation
  //    is injection-safe; the org id is the sole bound parameter.)
  const union = present
    .map((p) => `SELECT '${p.domain}' AS domain, '${p.name}' AS store WHERE EXISTS (SELECT 1 FROM ${p.name} WHERE ${p.where})`)
    .join(' UNION ALL ');
  // $1 is bound as text and cast per-column ($1::int / $1::text) so the parameter
  // type is unambiguous regardless of which stores are present in this database.
  const hitRes = await pool.query(union, [String(orgId)]);
  const sources = new Set<string>();
  for (const row of hitRes.rows as Array<{ domain: IBDataDomain; store: string }>) {
    availability[row.domain] = true;
    sources.add(row.store);
  }
  return { availability, sources: [...sources] };
}

/**
 * Assemble the org's IB readiness view from the real upstream evidence stores.
 * Read-only; org-scoped; deterministic given the stored rows.
 */
export async function assembleOrgIBSections(orgId: number): Promise<IBView> {
  const { availability, sources } = await deriveAvailability(orgId);
  const rows = rowsFor(availability);
  const provisioned = ALL_DOMAINS.some((d) => availability[d]);
  return {
    rows,
    availability,
    sources,
    source: sources.length ? sources.join('+') : 'nonclinical_studies',
    provisioned,
    completeness: completenessOf(rows),
    productName: null,
  };
}

export default { assembleOrgIBSections };
