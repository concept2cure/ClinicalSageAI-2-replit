/**
 * Guidance Ingestion Service — what the platform can say about FDA and ICH guidance.
 *
 *   1. FDA guidance search (fetchFdaGuidanceList): no FDA guidance index is
 *      connected, so it says so. (It used to query openFDA's substance
 *      endpoint and return each substance as a "guidance".)
 *   2. ICH guideline update checks from a curated step-date list (fetchIchGuidelineUpdates).
 *   3. Freshness checks against the currency registry (checkGuidanceFreshness):
 *      a citation is identified by its ICH code, by what a dated fact
 *      supersedes, or by an exact registry name. Anything else is unverified,
 *      never assumed current.
 *
 * No network, no model.
 *
 * @module server/services/regulatory-currency/guidance-ingestion-service
 */

import { REGULATORY_FACTS, factAsOf, hasFixedEffectiveDate, type RegulatoryFact } from './currency-registry.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FdaGuidanceOpts {
  topic?: string;
  year?: number;
  status?: 'final' | 'draft' | 'withdrawn';
  limit?: number;
}

export interface FdaGuidanceResult {
  status: 'unavailable';
  reason: 'no_guidance_index';
  message: string;
}

export interface IchGuidelineOpts {
  category?: 'Q' | 'S' | 'E' | 'M';
  since?: string;
}

export interface IchGuidelineItem {
  code: string;
  title: string;
  step: string;
  stepDate: string;
  category: 'Q' | 'S' | 'E' | 'M';
}

export interface IchGuidelineResult {
  status: 'fetched';
  guidelines: IchGuidelineItem[];
  /** A curated list in this file, not a fetch from ich.org. */
  source: 'curated_registry';
}

export interface FreshnessOpts {
  citedGuidances: Array<{ title: string; citedDate?: string; jurisdiction?: string }>;
  /** ISO date statuses are resolved against. Defaults to today. */
  asOf?: string;
}

export interface FreshnessResultItem {
  title: string;
  /**
   * true or false only when the citation was identified in a registry;
   * null when it was not. An unidentified citation is never "current".
   */
  current: boolean | null;
  verification: 'identified' | 'unverified';
  latestKnownDate?: string;
  warning?: string;
  /** The registry entry the verdict rests on. Absent when unverified. */
  basis?: {
    registry: 'currency_registry' | 'ich_step_registry';
    id: string;
    sourceUrl?: string;
    lastVerified?: string;
  };
}

export interface FreshnessResult {
  status: 'checked';
  results: FreshnessResultItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ICH Guideline Curated Registry
// ─────────────────────────────────────────────────────────────────────────────

const ICH_GUIDELINES: IchGuidelineItem[] = [
  {
    code: 'E6(R3)',
    title: 'Good Clinical Practice',
    step: 'Step 4',
    stepDate: '2025-01',
    category: 'E',
  },
  {
    code: 'M11',
    title: 'Clinical electronic Structured Harmonised Protocol',
    step: 'Step 4',
    // As the currency registry's `ich-m11-cesharp-step4`, verified against
    // ICH's Step 4 document (2025-11-19). This list said 2024-11.
    stepDate: '2025-11',
    category: 'M',
  },
  {
    code: 'Q12',
    title: 'Lifecycle Management',
    step: 'Step 4',
    // Step 4 on 2019-11-20 (post-approval-knowledge.ts and
    // standards-registry.ts already say 2019). This list said 2023-01.
    stepDate: '2019-11',
    category: 'Q',
  },
  {
    code: 'Q14',
    title: 'Analytical Procedure Development',
    step: 'Step 4',
    // Step 4 on 2023-11-01, with Q2(R2). This list said 2024-01.
    stepDate: '2023-11',
    category: 'Q',
  },
  {
    code: 'E8(R1)',
    title: 'General Considerations for Clinical Studies',
    step: 'Step 4',
    stepDate: '2021-10',
    category: 'E',
  },
];
// An "M4(R4), Step 2, 2025-06" entry is removed (2026-10-01): M4(R4) is the 2016
// CTD organisation revision, and nothing in the repository sources a 2025 Step 2
// for it. A guideline not in this list is unverified, not absent.

// ─────────────────────────────────────────────────────────────────────────────
// fetchFdaGuidanceList
// ─────────────────────────────────────────────────────────────────────────────

/**
 * No FDA guidance index is connected, so this names no guidance.
 *
 * It used to query openFDA's substance endpoint (`/other/substance.json`) and
 * return each chemical substance as an FDA guidance (`title: r.substance_name`),
 * with the caller's status filter written into every record. The authoritative
 * index is an open founder decision (plan open decision 11: the fda.gov
 * guidance datatable, or a reviewer-signed registry on the currency-registry
 * model). Until one is chosen and built, the honest answer is this one.
 */
export async function fetchFdaGuidanceList(
  _opts: FdaGuidanceOpts = {},
): Promise<FdaGuidanceResult> {
  return {
    status: 'unavailable',
    reason: 'no_guidance_index',
    message:
      'No FDA guidance index is connected to this platform, so no FDA guidance can be listed. ' +
      'Name an FDA guidance only from a document the user supplied, or confirm it at ' +
      'https://www.fda.gov/regulatory-information/search-fda-guidance-documents.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchIchGuidelineUpdates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check for ICH guideline updates from the curated registry.
 * Filters by category and/or since date. Pure (no network).
 */
export function fetchIchGuidelineUpdates(
  opts: IchGuidelineOpts = {},
): IchGuidelineResult {
  let guidelines = [...ICH_GUIDELINES];

  if (opts.category) {
    guidelines = guidelines.filter((g) => g.category === opts.category);
  }

  if (opts.since) {
    guidelines = guidelines.filter((g) => g.stepDate >= opts.since!);
  }

  return {
    status: 'fetched',
    guidelines,
    source: 'curated_registry',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// checkGuidanceFreshness
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise for matching. */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Does `haystack` contain `needle` as whole words (not inside another word)? */
function containsWords(haystack: string, needle: string): boolean {
  const n = norm(needle);
  if (!n) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(n)}($|[^a-z0-9])`).test(norm(haystack));
}

/**
 * ICH guideline codes named in a title, normalised: "ICH E6 (R3)" → "E6(R3)",
 * "q3d(r2)" → "Q3D(R2)", "M11" → "M11".
 */
const ICH_CODE_RE = /(?<![A-Za-z0-9])([QSEM])(\d{1,2})([A-Z])?(?:\s?\(\s?(R\d{1,2})\s?\))?(?![A-Za-z0-9(])/gi;

function ichCodesIn(title: string): string[] {
  const codes: string[] = [];
  for (const m of title.matchAll(ICH_CODE_RE)) {
    const code = `${m[1]}${m[2]}${m[3] ?? ''}`.toUpperCase() + (m[4] ? `(${m[4].toUpperCase()})` : '');
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

/** A registry string read as an ICH code, or null when it is not exactly one. */
function asIchCode(s: string): string | null {
  const codes = ichCodesIn(s);
  return codes.length === 1 && norm(s).replace(/\s/g, '') === codes[0].toLowerCase() ? codes[0] : null;
}

type Identified =
  | { kind: 'superseded'; code: string; successor: RegulatoryFact }
  | { kind: 'fact'; fact: RegulatoryFact }
  | { kind: 'ich'; entry: IchGuidelineItem };

/** The ICH codes a fact is keyed by ("E6(R3)", "M11"). */
function factCodes(fact: RegulatoryFact): string[] {
  return fact.keywords.map(asIchCode).filter((c): c is string => c !== null);
}

/** Does the title name the fact by an alias it is cited by? */
function namedByAlias(title: string, fact: RegulatoryFact): boolean {
  return (fact.aliases ?? []).some((alias) => containsWords(title, alias));
}

/**
 * Of the facts keyed by one ICH code, the one the title singles out: the
 * member with the most keywords no other member carries in the title ("Annex
 * 2"), not counting its jurisdiction ("ICH" says nothing about which part).
 * A tie goes to the first, the base entry.
 */
function pickFamilyMember(family: RegulatoryFact[], code: string, title: string): RegulatoryFact {
  const score = (f: RegulatoryFact) =>
    f.keywords.filter(
      (k) =>
        asIchCode(k) !== code &&
        norm(k) !== norm(f.jurisdiction) &&
        !family.some((o) => o !== f && o.keywords.some((ok) => norm(ok) === norm(k))) &&
        containsWords(title, k),
    ).length;
  return family.reduce((best, f) => (score(f) > score(best) ? f : best), family[0]);
}

/**
 * The members of an ICH-code family a citation is answered from: those of the
 * cited jurisdiction first, then the ICH members. An ICH Step 4 fact is ICH
 * adoption, not regional effect — EU E6(R3) Annex 2 is ICH Step 4 on
 * 2026-06-03 but in effect in the EU only from 2027-01-15 — so an EU citation
 * is answered by the EU fact whenever one exists. With no jurisdiction cited,
 * the ICH members answer: the title names an ICH code. Choosing the tier
 * before the member also keeps a keyword such as "annex 2", carried by both
 * the ICH and the EU Annex 2 facts, unique within the tier pickFamilyMember
 * scores.
 */
function preferredMembers(family: RegulatoryFact[], jurisdiction: string | undefined): RegulatoryFact[] {
  const own = jurisdiction ? family.filter((f) => norm(f.jurisdiction) === norm(jurisdiction)) : [];
  if (own.length > 0) return own;
  const ich = family.filter((f) => f.jurisdiction === 'ICH');
  return ich.length > 0 ? ich : family;
}

/**
 * The cited jurisdiction's own fact for what `successor` (an ICH fact) is
 * keyed by, or `successor` itself. "E6(R2)" is superseded on the ICH fact
 * only; an EU citation of it is dated by the EU fact (2025-07-23), not by ICH
 * Step 4 (2025-01-06). The base entry — listed first — answers.
 */
function regionalSuccessor(successor: RegulatoryFact, jurisdiction: string | undefined): RegulatoryFact {
  if (!jurisdiction || norm(successor.jurisdiction) === norm(jurisdiction)) return successor;
  const codes = factCodes(successor);
  const own = REGULATORY_FACTS.find(
    (f) => norm(f.jurisdiction) === norm(jurisdiction) && factCodes(f).some((c) => codes.includes(c)),
  );
  return own ?? successor;
}

function identifyByCode(
  title: string,
  codes: string[],
  jurisdiction: string | undefined,
  inJurisdiction: (f: RegulatoryFact) => boolean,
): Identified | null {
  for (const code of codes) {
    const successor = REGULATORY_FACTS.find(
      (f) => f.supersedes !== undefined && asIchCode(f.supersedes) === code && inJurisdiction(f),
    );
    // A title that also names the successor ("E6(R3) … replaces E6(R2)") is
    // about the successor, not a citation of what it replaced.
    if (successor && !factCodes(successor).some((c) => codes.includes(c))) {
      return { kind: 'superseded', code, successor: regionalSuccessor(successor, jurisdiction) };
    }
  }
  for (const code of codes) {
    const family = preferredMembers(
      REGULATORY_FACTS.filter((f) => inJurisdiction(f) && factCodes(f).includes(code)),
      jurisdiction,
    );
    if (family.length > 0) return { kind: 'fact', fact: pickFamilyMember(family, code, title) };
    const entry = ICH_GUIDELINES.find((g) => g.code === code);
    if (entry) return { kind: 'ich', entry };
  }
  // A named ICH code the registries do not hold. Falling back to word
  // matching is how E9(R1) used to be dated as E6(R3); the caller falls back
  // to identifiers only (what a fact supersedes, its names, its id).
  return null;
}

/**
 * Identify a cited guidance in the registries, or return null.
 *
 * Only an identifier counts: an ICH code, what a dated fact supersedes, a name
 * the fact is cited by (its `aliases`), or its id. A retrieval keyword is not
 * an identifier: "ICH E9(R1)" is not E6(R3) because both say "ICH", "510(k)"
 * is not the eSTAR mandate, and "IVD" is not the LDT rule. When two facts fit
 * equally, the citation is ambiguous and stays unverified.
 */
function identify(title: string, jurisdiction: string | undefined): Identified | null {
  const inJurisdiction = (f: RegulatoryFact) =>
    !jurisdiction || f.jurisdiction === 'ICH' || norm(f.jurisdiction) === norm(jurisdiction);

  const codes = ichCodesIn(title);
  if (codes.length > 0) {
    const byCode = identifyByCode(title, codes, jurisdiction, inJurisdiction);
    if (byCode) return byCode;
    /* "EU M1 v3.1.1" reads as the ICH code M1, which no registry holds. Only
       identifiers are tried after that — never a retrieval keyword. */
  }

  const superseding = REGULATORY_FACTS.filter(
    (f) =>
      inJurisdiction(f) &&
      f.supersedes !== undefined &&
      f.supersedes.split(' / ').some((alt) => containsWords(title, alt)) &&
      !namedByAlias(title, f),
  );
  if (superseding.length === 1) {
    return { kind: 'superseded', code: title.trim(), successor: superseding[0] };
  }
  if (superseding.length > 1) return null;

  const t = norm(title);
  const named = REGULATORY_FACTS.filter(
    (f) => inJurisdiction(f) && (norm(f.id) === t || namedByAlias(title, f)),
  );
  return named.length === 1 ? { kind: 'fact', fact: named[0] } : null;
}

function factBasis(fact: RegulatoryFact): NonNullable<FreshnessResultItem['basis']> {
  return {
    registry: 'currency_registry',
    id: fact.id,
    sourceUrl: fact.sourceUrl,
    lastVerified: fact.lastVerified,
  };
}

type CitedGuidance = FreshnessOpts['citedGuidances'][number];

/** The verdict on a citation identified as one dated fact (its status already resolved as at `asOf`). */
function factVerdict(cited: CitedGuidance, fact: RegulatoryFact): FreshnessResultItem {
  const dated = hasFixedEffectiveDate(fact);
  /* Deliberately excludes 'proposed': a proposal is not current law, so a
     citation of it is never reported current (founder decision 25). */
  const isCurrent = fact.status === 'in_force' || fact.status === 'mandatory_upcoming';
  /* Upcoming as at `asOf`: adopted, not yet in effect. The citation names the
     latest text, so it is current — but it does not apply yet, and a document
     dated before a date still to come is not stale. */
  const notYetInEffect = fact.status === 'mandatory_upcoming';
  const isStale =
    fact.status === 'in_force' && dated && cited.citedDate ? cited.citedDate < fact.effectiveDate : false;
  let warning: string | undefined;
  if (fact.status === 'proposed') {
    /* A proposal is not law (founder decision 25): not current, never "adopted",
       never stale against a date it does not have. */
    warning = `Proposed, not law (${fact.jurisdiction}): current law governs until it is adopted and applies. ${fact.note}`;
  } else if (!isCurrent) {
    warning = `This guidance has status '${fact.status}' — it may no longer be in force. ${fact.note}`;
  } else if (notYetInEffect) {
    warning =
      `Adopted but not yet in effect (${fact.jurisdiction}): ` +
      `${dated ? `applies from ${fact.effectiveDate}` : 'no effective date is fixed yet'}. ${fact.note}`;
  } else if (isStale) {
    warning = `Cited date (${cited.citedDate}) predates the latest effective date (${fact.effectiveDate}). Review for updates.`;
  }
  return {
    title: cited.title,
    current: isCurrent && !isStale,
    verification: 'identified',
    latestKnownDate: dated ? fact.effectiveDate : undefined,
    warning,
    basis: factBasis(fact),
  };
}

/**
 * Check cited guidances against the currency registry and the ICH step-date
 * list. Pure (no network, no model). A citation neither can identify is
 * reported unverified with `current: null`; it used to be reported current.
 */
export function checkGuidanceFreshness(
  opts: FreshnessOpts,
): FreshnessResult {
  if (!opts.citedGuidances || !Array.isArray(opts.citedGuidances) || opts.citedGuidances.length === 0) {
    throw new Error('citedGuidances is required');
  }
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);

  const results: FreshnessResultItem[] = opts.citedGuidances.map((cited) => {
    const found = identify(cited.title, cited.jurisdiction);

    if (!found) {
      return {
        title: cited.title,
        current: null,
        verification: 'unverified',
        warning:
          'Not identified in the dated registries, so its currency is unverified — not assumed current. ' +
          'Confirm against the primary source.',
      };
    }

    if (found.kind === 'superseded') {
      const successor = factAsOf(found.successor, asOf);
      const dated = hasFixedEffectiveDate(successor);
      return {
        title: cited.title,
        current: false,
        verification: 'identified',
        latestKnownDate: dated ? successor.effectiveDate : undefined,
        warning:
          `${found.code} is superseded by ${successor.topic} ` +
          `(${dated ? `effective ${successor.effectiveDate}` : 'no effective date fixed yet'}). ` +
          successor.note,
        basis: factBasis(successor),
      };
    }

    if (found.kind === 'fact') return factVerdict(cited, factAsOf(found.fact, asOf));

    const { entry } = found;
    const isStale = cited.citedDate ? cited.citedDate < entry.stepDate : false;
    return {
      title: cited.title,
      current: !isStale,
      verification: 'identified',
      latestKnownDate: entry.stepDate,
      warning: isStale
        ? `ICH ${entry.code} reached ${entry.step} on ${entry.stepDate}. Cited date (${cited.citedDate}) predates this.`
        : undefined,
      basis: { registry: 'ich_step_registry', id: entry.code },
    };
  });

  return {
    status: 'checked',
    results,
  };
}
