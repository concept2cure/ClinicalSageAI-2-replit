/**
 * The regulatory vocabulary — one spelling per agency, one registry per scale.
 *
 * Ledger L56 measured what this replaces: `Agency` declared with 26 distinct
 * members across four modules, of which roughly half are the same thirteen
 * agencies written twice (`FDA` beside `fda`, `Health_Canada` beside
 * `health_canada`); `Region` with 35 across six; `Jurisdiction` with 29 across
 * seven, spelling Japan as `JP`, `jp`, `japan` and `PMDA`; `Severity` with 15
 * across seven. A finding marked `major` by one engine and `high` by another
 * cannot be sorted with it, and a row recording `FDA` will not join a row
 * recording `fda`.
 *
 * ── Two problems, deliberately solved differently ───────────────────────────
 * Most of that fragmentation is *spelling*: the same agency, region or
 * submission type written several ways. That has one right answer, and §1 below
 * is it — one canonical spelling, plus `normalizeAgency` and friends to accept
 * the historical variants so existing rows keep resolving.
 *
 * The rest is *not* spelling and must not be flattened. A three-point reviewer
 * scale (`error | warning | info`), a four-point inspection scale
 * (`critical | major | minor | informational`) and a four-point risk scale
 * (`critical | high | medium | low`) are different regulatory instruments that
 * happen to share the word "severity". Collapsing them into one enum would
 * destroy the distinction an inspector relies on. §2 keeps each scale intact,
 * names it, and gives its members an explicit rank — so comparing across scales
 * becomes a deliberate mapping someone wrote down, rather than a string
 * comparison that silently sorts `major` above `high` because m > h.
 *
 * ── What this module does not do ────────────────────────────────────────────
 * It does not re-point the 170 local declarations. Each of those is a decision
 * about stored data — a column holding `fda` does not become `FDA` because a
 * type changed — and `normalizeAgency` exists precisely so a call site can move
 * without a data migration. See ledger L56 for the order.
 *
 * @module shared/regulatory/vocabulary
 */

// ─────────────────────────────────────────────────────────────────────────────
// §1 · Identity — the vocabularies where a variant is just a spelling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Regulatory authorities, canonically spelled.
 *
 * Uppercase acronym where the agency is known by one (`FDA`, `EMA`, `PMDA`);
 * the same form the agencies use themselves. `ICH`, `ISO`, `IEC` and `IMDRF`
 * are standards bodies rather than authorities and are listed separately —
 * conflating them is how `Agency` ended up with 26 members.
 */
export const AGENCIES = [
  'FDA',            // United States
  'EMA',            // European Union
  'MHRA',           // United Kingdom
  'PMDA',           // Japan
  'NMPA',           // China
  'HEALTH_CANADA',  // Canada
  'TGA',            // Australia
  'ANVISA',         // Brazil
  'SWISSMEDIC',     // Switzerland
  'MFDS',           // South Korea
  'CDSCO',          // India
  'HSA',            // Singapore
] as const;
export type Agency = (typeof AGENCIES)[number];

/** Standards bodies. Not authorities — they publish, they do not approve. */
export const STANDARDS_BODIES = ['ICH', 'ISO', 'IEC', 'IMDRF'] as const;
export type StandardsBody = (typeof STANDARDS_BODIES)[number];

/**
 * Historical spellings seen across the codebase, mapped to the canonical form.
 * Exists so a call site can adopt `Agency` without migrating stored rows.
 */
const AGENCY_ALIASES: Record<string, Agency> = {
  fda: 'FDA', us_fda: 'FDA',
  ema: 'EMA', eu_ema: 'EMA',
  mhra: 'MHRA', uk_mhra: 'MHRA',
  pmda: 'PMDA', jp_pmda: 'PMDA', japan: 'PMDA',
  nmpa: 'NMPA', cn_nmpa: 'NMPA', cde: 'NMPA',
  health_canada: 'HEALTH_CANADA', healthcanada: 'HEALTH_CANADA',
  ca_health_canada: 'HEALTH_CANADA', canada: 'HEALTH_CANADA', hc: 'HEALTH_CANADA',
  tga: 'TGA', au_tga: 'TGA',
  anvisa: 'ANVISA', br_anvisa: 'ANVISA',
  swissmedic: 'SWISSMEDIC', ch_swissmedic: 'SWISSMEDIC',
  mfds: 'MFDS', kr_mfds: 'MFDS',
  cdsco: 'CDSCO', in_cdsco: 'CDSCO',
  hsa: 'HSA', sg_hsa: 'HSA',
};

/**
 * Resolve any historical spelling to the canonical agency, or null.
 *
 * Returns null rather than guessing: an unrecognized agency string is a fact
 * worth surfacing, and `general` — which one of the old enums carried as a
 * member — is not an agency at all.
 */
export function normalizeAgency(value: string | null | undefined): Agency | null {
  if (!value) return null;
  const raw = value.trim();
  if ((AGENCIES as readonly string[]).includes(raw)) return raw as Agency;
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  return AGENCY_ALIASES[key] ?? null;
}

/**
 * Regulatory jurisdictions — the territory a filing is made in.
 *
 * Distinct from {@link Agency} on purpose: the EU is a jurisdiction and the EMA
 * is its agency, and the old enums used the two interchangeably. ISO 3166-1
 * alpha-2 where one applies, so these join cleanly against country data.
 */
export const JURISDICTIONS = [
  'US', 'EU', 'GB', 'JP', 'CN', 'CA', 'AU', 'BR', 'CH', 'KR', 'IN', 'SG',
] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

/** The agency that regulates each jurisdiction. One-to-one, today. */
export const JURISDICTION_AGENCY: Record<Jurisdiction, Agency> = {
  US: 'FDA', EU: 'EMA', GB: 'MHRA', JP: 'PMDA', CN: 'NMPA', CA: 'HEALTH_CANADA',
  AU: 'TGA', BR: 'ANVISA', CH: 'SWISSMEDIC', KR: 'MFDS', IN: 'CDSCO', SG: 'HSA',
};

const JURISDICTION_ALIASES: Record<string, Jurisdiction> = {
  us: 'US', usa: 'US', fda: 'US', united_states: 'US',
  eu: 'EU', ema: 'EU', europe: 'EU',
  uk: 'GB', gb: 'GB', mhra: 'GB', united_kingdom: 'GB',
  jp: 'JP', japan: 'JP', pmda: 'JP',
  cn: 'CN', china: 'CN', nmpa: 'CN',
  ca: 'CA', canada: 'CA', health_canada: 'CA', ca_health_canada: 'CA',
  au: 'AU', australia: 'AU', tga: 'AU', au_tga: 'AU',
  br: 'BR', brazil: 'BR', anvisa: 'BR', br_anvisa: 'BR',
  ch: 'CH', switzerland: 'CH', swissmedic: 'CH',
  kr: 'KR', korea: 'KR', mfds: 'KR',
  in: 'IN', india: 'IN', cdsco: 'IN',
  sg: 'SG', singapore: 'SG', hsa: 'SG',
};

/**
 * Resolve any historical spelling to the canonical jurisdiction, or null.
 *
 * Accepts agency names as input because several of the old enums used them as
 * jurisdictions — `FDA` resolves to `US`. `GLOBAL`, `ICH` and `mdsap` are not
 * jurisdictions and return null; they are programmes or standards scopes, and
 * the call site should say which it means.
 */
export function normalizeJurisdiction(value: string | null | undefined): Jurisdiction | null {
  if (!value) return null;
  const raw = value.trim();
  if ((JURISDICTIONS as readonly string[]).includes(raw)) return raw as Jurisdiction;
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  return JURISDICTION_ALIASES[key] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 · Scales — the vocabularies where a variant is a different instrument
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A named ordinal scale. `members` are ordered least-severe first, so a
 * member's index IS its rank — which is the property string comparison does not
 * have, and the reason `major` currently sorts above `high`.
 */
export interface OrdinalScale<M extends string = string> {
  readonly id: string;
  readonly description: string;
  readonly members: readonly M[];
}

/** Four-point risk scale. The most common shape in the codebase. */
export const RISK_SCALE = {
  id: 'risk-4',
  description: 'Four-point risk rating. `moderate` and `extreme` are historical spellings of `medium` and `critical`.',
  members: ['low', 'medium', 'high', 'critical'],
} as const satisfies OrdinalScale;

/** Inspection / deficiency classification. Not a risk scale. */
export const DEFICIENCY_SCALE = {
  id: 'deficiency-4',
  description: 'Inspection finding classification, as used in agency correspondence.',
  members: ['informational', 'minor', 'major', 'critical'],
} as const satisfies OrdinalScale;

/** Validator output. Three points, and genuinely not a risk rating. */
export const DIAGNOSTIC_SCALE = {
  id: 'diagnostic-3',
  description: 'Machine validation output. `info` is not "low risk" — it is "no finding".',
  members: ['info', 'warning', 'error'],
} as const satisfies OrdinalScale;

export const SCALES = [RISK_SCALE, DEFICIENCY_SCALE, DIAGNOSTIC_SCALE] as const;

/** Historical spellings, per scale, that mean an existing member. */
const SCALE_ALIASES: Record<string, Record<string, string>> = {
  'risk-4': { moderate: 'medium', extreme: 'critical', very_high: 'critical', informational: 'low' },
  'deficiency-4': { info: 'informational', deficiency: 'major', minor_deficiency: 'minor' },
  'diagnostic-3': { informational: 'info', critical: 'error' },
};

/**
 * Rank a value within a named scale: 0 is least severe, or null if the value is
 * not a member. Use this instead of comparing the strings.
 */
export function rankIn(scale: OrdinalScale, value: string | null | undefined): number | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  const direct = scale.members.indexOf(raw);
  if (direct >= 0) return direct;
  const aliased = SCALE_ALIASES[scale.id]?.[raw];
  if (aliased === undefined) return null;
  const i = scale.members.indexOf(aliased);
  return i >= 0 ? i : null;
}

/**
 * Translate a value from one scale to another, proportionally by rank.
 *
 * Deliberately explicit and deliberately lossy. Mapping a three-point validator
 * result onto a four-point risk scale loses information, and every call site
 * doing it should be visible in a grep rather than buried in a comparison. When
 * the two scales measure genuinely different things, the honest move is not to
 * call this — it is to keep them apart and say so on screen.
 */
export function translateScale(
  from: OrdinalScale,
  to: OrdinalScale,
  value: string | null | undefined,
): string | null {
  const rank = rankIn(from, value);
  if (rank === null) return null;
  if (from.members.length === 1) return to.members[0] ?? null;
  const ratio = rank / (from.members.length - 1);
  return to.members[Math.round(ratio * (to.members.length - 1))] ?? null;
}
