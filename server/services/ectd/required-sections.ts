/**
 * Required sections for a submission — ONE resolver for every gate.
 *
 * ── The defect this closes ───────────────────────────────────────────────────
 * The compile, validate and readiness routes carried a hard-coded, application-
 * agnostic table: an IND was required to place 1.3.3 (debarment — marketing
 * applications only), 1.3.4 (financial disclosure), 2.7.1 (clinical summary),
 * 3.2.R and 5.2 — none of which 21 CFR 312.23 asks of an initial IND — while
 * the editor's outline (the live c2c_rule_packs row the project was scaffolded
 * from) marked 1.20, 1.14.4.1 and 1.12.14 mandatory. An outline-complete IND
 * could never read "complete" on the compile gate, and the two surfaces could
 * not agree on what was missing.
 *
 * The required set is now derived from the same rule pack the outline is:
 * every `mandatory` node with no mandatory descendant (the leaf-most claims),
 * grouped by CTD module. When the program's class does not resolve to a pack —
 * a legacy numeric project with no program type, an agency with no pack, or a
 * store that cannot be read — the ICH CTD marketing-application baseline
 * applies and the response SAYS so (`source: 'fallback'`, with the reason), so a
 * generic requirement list is never mistaken for the program's own.
 *
 * Pure derivation is exported separately (`requiredSectionsFromPack`) so the
 * contract can be pinned without a database.
 *
 * @module server/services/ectd/required-sections
 */

import { AGENCY_FALLBACKS, resolveDocumentClass } from '../c2c/document-class';

export type CtdModuleCode = 'm1' | 'm2' | 'm3' | 'm4' | 'm5';

export interface RequiredModule {
  code: CtdModuleCode;
  name: string;
  /** Section codes (unprefixed: '1.2', '3.2.S.1') that must be present. */
  requiredSections: string[];
}

export interface RequiredSectionProvenance {
  source: 'rule_pack' | 'fallback';
  /** Present when source === 'rule_pack'. */
  docType?: string;
  agency?: string;
  packVersion?: string;
  /** Present when source === 'fallback': why no pack applied. */
  reason?: string;
}

export interface RequiredSectionSet {
  modules: RequiredModule[];
  provenance: RequiredSectionProvenance;
}

/** Minimal query surface — node-postgres Pool, a PoolClient, or PGlite. */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface PackSection {
  key: string;
  parent_key?: string | null;
  mandatory?: boolean | null;
}

export const MODULE_NAMES: Readonly<Record<CtdModuleCode, string>> = {
  m1: 'Administrative Information',
  m2: 'CTD Summaries',
  m3: 'Quality (CMC)',
  m4: 'Nonclinical Study Reports',
  m5: 'Clinical Study Reports',
};

const MODULE_ORDER: CtdModuleCode[] = ['m1', 'm2', 'm3', 'm4', 'm5'];

/**
 * The ICH CTD marketing-application baseline. Module 1 carries only what every
 * FDA application files (forms and cover letter — FDA eCTD Module 1 v2.3); the
 * application-specific Module 1 claims (debarment, financial disclosure, the
 * general investigational plan, the investigator's brochure) come from the
 * program's rule pack, never from here.
 */
export const FALLBACK_REQUIRED_MODULES: ReadonlyArray<RequiredModule> = [
  { code: 'm1', name: MODULE_NAMES.m1, requiredSections: ['1.1', '1.2'] },
  { code: 'm2', name: MODULE_NAMES.m2, requiredSections: ['2.2', '2.3', '2.4', '2.5', '2.6.2', '2.6.4', '2.6.6', '2.7.1'] },
  { code: 'm3', name: MODULE_NAMES.m3, requiredSections: ['3.2.S', '3.2.P', '3.2.R'] },
  { code: 'm4', name: MODULE_NAMES.m4, requiredSections: ['4.2.1', '4.2.2', '4.2.3'] },
  { code: 'm5', name: MODULE_NAMES.m5, requiredSections: ['5.2', '5.3.5.1'] },
];

function fallbackSet(reason: string): RequiredSectionSet {
  return {
    modules: FALLBACK_REQUIRED_MODULES.map((m) => ({ ...m, requiredSections: [...m.requiredSections] })),
    provenance: { source: 'fallback', reason },
  };
}

/** Module a section key belongs to, or null for container keys ('M1') and non-CTD keys. */
export function moduleOfSectionKey(key: string): CtdModuleCode | null {
  // A bare module key ('M1', '1') is a container, never a requirement.
  const m = /^m?([1-5])\./i.exec(String(key ?? '').trim());
  if (!m) return null;
  return `m${m[1]}` as CtdModuleCode;
}

/**
 * The leaf-most mandatory claims of a rule pack, grouped by module.
 *
 * A mandatory node whose descendants include a mandatory node is satisfied by
 * that descendant (3.2.S by 3.2.S.1…); requiring both would double-count. A
 * mandatory node with only optional children is itself the requirement.
 * Module containers ('M1') and keys that are not CTD codes are never required.
 */
export function requiredSectionsFromPack(sections: ReadonlyArray<PackSection>): RequiredModule[] {
  const byKey = new Map<string, PackSection>();
  for (const s of sections) if (s?.key) byKey.set(String(s.key), s);

  const hasMandatoryAncestor = new Set<string>();
  for (const s of byKey.values()) {
    if (!s.mandatory) continue;
    let parent = s.parent_key ? byKey.get(String(s.parent_key)) : undefined;
    while (parent) {
      hasMandatoryAncestor.add(String(parent.key));
      parent = parent.parent_key ? byKey.get(String(parent.parent_key)) : undefined;
    }
  }

  const grouped: Record<CtdModuleCode, string[]> = { m1: [], m2: [], m3: [], m4: [], m5: [] };
  for (const s of byKey.values()) {
    if (!s.mandatory) continue;
    if (hasMandatoryAncestor.has(String(s.key))) continue;
    const mod = moduleOfSectionKey(String(s.key));
    if (!mod) continue;
    grouped[mod].push(String(s.key).replace(/^m(?=\d)/i, ''));
  }
  for (const mod of MODULE_ORDER) grouped[mod].sort(compareSectionCodes);

  return MODULE_ORDER.map((code) => ({ code, name: MODULE_NAMES[code], requiredSections: grouped[code] }));
}

function compareSectionCodes(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? '';
    const y = pb[i] ?? '';
    if (x === y) continue;
    const nx = Number(x);
    const ny = Number(y);
    if (Number.isFinite(nx) && Number.isFinite(ny)) return nx - ny;
    return x.localeCompare(y);
  }
  return 0;
}

interface RulePackRow {
  version: string;
  required_sections: unknown;
}

export interface ResolveRequiredSectionsInput {
  /** regulatory_programs.program_type (ind/nda/510k/…); null for legacy projects. */
  programType: string | null | undefined;
  /** regulatory_programs.primary_agency ('FDA', 'EMA', …); null when unknown. */
  primaryAgency: string | null | undefined;
}

/**
 * Resolve the required-section set for a program from its live rule pack, or
 * the labelled fallback when no pack applies. Never throws: a store that
 * cannot be read is reported as the fallback reason.
 */
export async function resolveRequiredSections(
  client: Queryable,
  input: ResolveRequiredSectionsInput,
): Promise<RequiredSectionSet> {
  const programType = input.programType ? String(input.programType).trim().toLowerCase() : '';
  if (!programType) {
    return fallbackSet('The program type is unknown, so no rule pack applies; the ICH CTD marketing-application baseline is in force.');
  }
  // The agency may be unknown (a program created before primary_agency was
  // recorded); the doc type alone still reaches the harmonised ICH pack.
  const klass = resolveDocumentClass(programType, input.primaryAgency ?? 'ICH');
  if (!klass) {
    return fallbackSet(`No governed document class is mapped for program type '${programType}'; the ICH CTD marketing-application baseline is in force.`);
  }
  const candidates = [klass.agency, ...AGENCY_FALLBACKS.filter((a) => a !== klass.agency)];
  try {
    for (const agency of candidates) {
      const { rows } = await client.query<RulePackRow>(
        `SELECT version, required_sections
           FROM c2c_rule_packs
          WHERE doc_type = $1 AND agency = $2 AND superseded_by IS NULL
          ORDER BY effective_from DESC
          LIMIT 1`,
        [klass.docType, agency],
      );
      const pack = rows[0];
      if (!pack) continue;
      const sections = Array.isArray(pack.required_sections) ? (pack.required_sections as PackSection[]) : [];
      const modules = requiredSectionsFromPack(sections);
      if (modules.every((m) => m.requiredSections.length === 0)) {
        return fallbackSet(`Rule pack ${klass.docType}:${agency} ${pack.version} marks no section mandatory; the ICH CTD marketing-application baseline is in force.`);
      }
      return { modules, provenance: { source: 'rule_pack', docType: klass.docType, agency, packVersion: String(pack.version) } };
    }
  } catch (err) {
    return fallbackSet(`The rule-pack store could not be read (${err instanceof Error ? err.message : String(err)}); the ICH CTD marketing-application baseline is in force.`);
  }
  return fallbackSet(`No live rule pack exists for ${klass.docType} at ${candidates.join(' or ')}; the ICH CTD marketing-application baseline is in force.`);
}

export default { resolveRequiredSections, requiredSectionsFromPack, FALLBACK_REQUIRED_MODULES, MODULE_NAMES };
