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
import { requiredModule1CodesForRegion } from '../region-profiles/region-profile-service';

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
/**
 * How many sections a pack actually marks mandatory, independent of whether
 * their keys are CTD-numbered. `requiredSectionsFromPack` drops any key that is
 * not `1.`-`5.` (moduleOfSectionKey returns null), which is correct for grouping
 * by CTD module but means an empty grouped result CANNOT be read as "the pack
 * marks nothing mandatory" — the medtech/EU packs (PMA, CTA, MDR, IVDR) are not
 * CTD-numbered at all, so every one of their mandatory sections is dropped.
 */
export function countMandatorySections(sections: ReadonlyArray<PackSection>): number {
  let n = 0;
  for (const s of sections) if (s?.key && s.mandatory) n++;
  return n;
}

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
        /* An empty grouped result has TWO causes and they are not the same fact.
           requiredSectionsFromPack drops every key moduleOfSectionKey cannot map
           to a CTD module (`^m?[1-5]\.`), and the medtech/EU packs are not
           CTD-numbered, so their mandatory sections are all dropped. Reporting
           "marks no section mandatory" for those states something the pack's own
           required_sections refutes. Count first, then say the true thing. */
        const mandatoryCount = countMandatorySections(sections);
        return fallbackSet(
          mandatoryCount === 0
            ? `Rule pack ${klass.docType}:${agency} ${pack.version} marks no section mandatory; the ICH CTD marketing-application baseline is in force.`
            : `Rule pack ${klass.docType}:${agency} ${pack.version} marks ${mandatoryCount} section(s) mandatory, but none carry an ICH CTD module number (1.-5.), so they could not be mapped to CTD modules. Those requirements are NOT reflected below — the ICH CTD marketing-application baseline is shown instead, and it is not this pack's requirement set.`,
        );
      }
      return { modules, provenance: { source: 'rule_pack', docType: klass.docType, agency, packVersion: String(pack.version) } };
    }
  } catch (err) {
    return fallbackSet(`The rule-pack store could not be read (${err instanceof Error ? err.message : String(err)}); the ICH CTD marketing-application baseline is in force.`);
  }
  return fallbackSet(`No live rule pack exists for ${klass.docType} at ${candidates.join(' or ')}; the ICH CTD marketing-application baseline is in force.`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// REQUIRED-SECTION PROFILES BY SUBMISSION TYPE AND REGION
// ═══════════════════════════════════════════════════════════════════════════════
/*
 * Moved here from `ectd4-validator.ts` (2026-10-05, g-required-sections-home),
 * where the profile was private to the leaf validator and knew three types,
 * all FDA. Nothing else could ask the question, so the completeness engine kept
 * its own table and mapped an EU MAA onto the FDA NDA set. The validator now
 * reads this; the EU MAA and J-NDA profiles are new.
 *
 * MODULE 1 COMES FROM THE REGION PROFILE, NOT FROM A LITERAL HERE.
 * The validator's sets once spelled Module 1 out by hand, and their comments
 * described the EU/legacy CTD layout while the codes were read as FDA ones:
 *
 *   demanded  comment said                        FDA v2.3 is            real home
 *   m1.5      Table of Contents                   Application Status     —
 *   m1.6      Introductory Statement & Gen. Plan  Meetings               1.20
 *   m1.7      Investigator's Brochure             (absent from FDA M1)   1.14.4.1
 *   m1.9      Environmental Assessment            Pediatric Admin Info   1.12.14
 *
 * `requiredModule1CodesForRegion` is the one walk over the profile, shared with
 * `assess-dispatch-readiness.requiredModule1Codes` — the gate that blocks
 * freeze and transmit — so the two cannot disagree about Module 1 again.
 * Modules 2-5 are declared here: the region profile models Module 1 only, and
 * these are the ICH M4 bodies each application type must carry.
 *
 * Codes are unprefixed ('3.2.S'), as everywhere else in this module. The leaf
 * validator, whose leaves are written 'm3.2.S', prefixes them itself.
 */

/** Regions that carry a required-section profile. */
export type RequiredSectionRegion = 'fda' | 'eu' | 'jp';

/** Submission types that carry a required-section profile. */
export type ProfiledSubmissionType = 'IND' | 'NDA' | 'BLA' | 'MAA' | 'JNDA';

export interface RequiredSectionProfile {
  submissionType: ProfiledSubmissionType;
  region: RequiredSectionRegion;
  /** Unprefixed CTD codes ('1.1', '3.2.S') a complete submission must carry. */
  sections: ReadonlySet<string>;
  /** Citation for the requirement — a reference, not quoted regulator text. */
  basis: string;
}

/** Modules 2-5 for an initial IND per 21 CFR 312.23(a). */
const IND_M2_M5 = [
  '2.3', // Quality Overall Summary
  '2.4', // Nonclinical Overview
  '2.6', // Nonclinical Summaries
  '3.2.S', // Drug Substance
  '3.2.P', // Drug Product
  '4.2.1', // Pharmacology
  '4.2.2', // Pharmacokinetics
  '4.2.3', // Toxicology
  '5.3.5', // Phase 1 protocol (21 CFR 312.23(a)(6))
];

/**
 * The ICH M4 Modules 2-5 of a full marketing application — the harmonised
 * body every region's new-medicine dossier carries. Two Module 3 slots are
 * NOT here, because neither is unconditionally owed:
 *   - 3.2.R, Regional Information — each region's own slot, its content set
 *     regionally;
 *   - 3.2.A, Appendices — facilities and equipment (biotech), adventitious-
 *     agents safety evaluation, novel excipients (ICH M4Q; recall). A small-
 *     molecule product with no novel excipient files none of them.
 * The record has no Necessity=conditional for Modules 2-5 yet, so a
 * conditional slot here would be reported missing on every product it does
 * not apply to. FDA's NDA and BLA bodies keep both, as they did before the
 * move (2026-10-05), so their findings are unchanged.
 */
const ICH_MARKETING_M2_M5 = [
  '2.2', '2.3', '2.4', '2.5', '2.6', '2.7',
  '3.2.S', '3.2.P',
  '4.2.1', '4.2.2', '4.2.3',
  '5.2', '5.3.5',
];

/**
 * Modules 2-5 for an NDA per 21 CFR 314.50 / ICH M4: the ICH body with 3.2.A
 * and FDA's 3.2.R after 3.2.P — the list and order the validator enforced
 * before the move.
 */
const NDA_M2_M5 = ICH_MARKETING_M2_M5.flatMap((c) => (c === '3.2.P' ? [c, '3.2.A', '3.2.R'] : [c]));

/** Modules 2-5 for a BLA per 21 CFR 601.2 / ICH M4 (no separate 4.2.2). */
const BLA_M2_M5 = NDA_M2_M5.filter((c) => c !== '4.2.2');

interface ProfileDef {
  region: RequiredSectionRegion;
  /** The application type the region profile's `requiredFor` speaks of. */
  module1App: string;
  m2m5: readonly string[];
  basis: string;
}

const PROFILE_DEFS: Readonly<Record<ProfiledSubmissionType, ProfileDef>> = {
  IND: {
    region: 'fda',
    module1App: 'ind',
    m2m5: IND_M2_M5,
    basis: '21 CFR 312.23(a); FDA eCTD Module 1 (region profile); ICH M4',
  },
  NDA: {
    region: 'fda',
    module1App: 'nda',
    m2m5: NDA_M2_M5,
    basis: '21 CFR 314.50; FDA eCTD Module 1 (region profile); ICH M4',
  },
  BLA: {
    region: 'fda',
    module1App: 'bla',
    m2m5: BLA_M2_M5,
    basis: '21 CFR 601.2; FDA eCTD Module 1 (region profile); ICH M4',
  },
  MAA: {
    region: 'eu',
    module1App: 'maa',
    m2m5: ICH_MARKETING_M2_M5,
    basis: 'Directive 2001/83/EC Art. 8(3) and Annex I; EU eCTD Module 1 (region profile); ICH M4',
  },
  JNDA: {
    region: 'jp',
    module1App: 'jnda',
    m2m5: ICH_MARKETING_M2_M5,
    basis: 'PMD Act Art. 14 approval application; PMDA eCTD Module 1 (region profile); ICH M4',
  },
};

/*
 * ANDA has no profile here, on purpose. The FDA region profile's `requiredFor`
 * does cover 'anda' in Module 1, but no ICH M4 list fits a generic: 21 CFR
 * 314.94 asks for bioequivalence (5.3.1.2) instead of Module 4 and the 5.3.5
 * efficacy reports, so lending it the NDA body would report sections missing
 * that an ANDA never files. The only ANDA M2-M5 record in this repository is
 * the anda:fda v1.0 rule pack, whose Module 1 numbering is itself owed a
 * correction (R10). Until that lands, an ANDA stays NOT ASSESSED.
 */

/** Type aliases callers already send → the profiled type. */
const TYPE_ALIASES: Readonly<Record<string, ProfiledSubmissionType>> = {
  IND: 'IND',
  NDA: 'NDA',
  BLA: 'BLA',
  MAA: 'MAA',
  EUMAA: 'MAA',
  JNDA: 'JNDA',
  JPNDA: 'JNDA',
};

/** Region tokens callers already send (profile keys, canonical codes, agencies). */
const REGION_ALIASES: Readonly<Record<string, RequiredSectionRegion>> = {
  FDA: 'fda',
  US: 'fda',
  USA: 'fda',
  EU: 'eu',
  EMA: 'eu',
  JP: 'jp',
  PMDA: 'jp',
  JAPAN: 'jp',
};

const profileCache = new Map<ProfiledSubmissionType, RequiredSectionProfile>();

function buildProfile(type: ProfiledSubmissionType): RequiredSectionProfile {
  const def = PROFILE_DEFS[type];
  const sections = new Set<string>([
    ...requiredModule1CodesForRegion(def.region, def.module1App),
    ...def.m2m5,
  ]);
  return { submissionType: type, region: def.region, sections, basis: def.basis };
}

/**
 * The required-section profile for a submission type in a region, or NULL
 * when there is none.
 *
 * Null, not an empty set and never another region's set. An empty set produced
 * no missing sections, so an unprofiled type read as structurally complete with
 * the check never having run; a borrowed set (an EU MAA judged against FDA Form
 * 356h) is a confident wrong answer. Callers have to say which happened.
 *
 * `region` may be omitted: each profiled type has one home region (IND, NDA,
 * BLA → FDA; MAA → EU; J-NDA → Japan). A region that is given and is not the
 * type's home — an "NDA" filed in the EU, an IND in Japan — returns null.
 */
export function requiredSectionProfileFor(
  submissionType: string,
  region?: string | null,
): RequiredSectionProfile | null {
  const typeKey = String(submissionType ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const type = TYPE_ALIASES[typeKey];
  if (!type) return null;
  const regionKey = String(region ?? '').trim().toUpperCase();
  if (regionKey) {
    const resolved = REGION_ALIASES[regionKey];
    if (resolved !== PROFILE_DEFS[type].region) return null;
  }
  let profile = profileCache.get(type);
  if (!profile) {
    profile = buildProfile(type);
    profileCache.set(type, profile);
  }
  // A fresh set per call: a caller that mutates its answer cannot change the next one.
  return { ...profile, sections: new Set(profile.sections) };
}

/** The required section codes (unprefixed) for a submission type, or null — see `requiredSectionProfileFor`. */
export function requiredSectionsFor(
  submissionType: string,
  region?: string | null,
): ReadonlySet<string> | null {
  return requiredSectionProfileFor(submissionType, region)?.sections ?? null;
}

export default {
  resolveRequiredSections,
  requiredSectionsFromPack,
  requiredSectionsFor,
  requiredSectionProfileFor,
  FALLBACK_REQUIRED_MODULES,
  MODULE_NAMES,
};
