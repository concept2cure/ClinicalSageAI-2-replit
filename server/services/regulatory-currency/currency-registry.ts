/**
 * Regulatory Currency Registry — a curated, freshness-stamped registry of DATED
 * regulatory facts whose status changed materially in the recent landscape.
 *
 * AnA's broader regulatory knowledge is static/embedded (the ICH corpus, the
 * global-RI frameworks, guidance.json). Static knowledge silently goes STALE: a
 * rule the model "knows" may have been vacated, rescinded, superseded, or had its
 * effective date arrive. Advising on a VOID rule in a governed (21 CFR Part 11)
 * context is a critical defect. This module is the antidote — a small, HONEST,
 * deterministic registry of facts that are (a) dated, (b) freshness-stamped with
 * `lastVerified`, and (c) carry an official `sourceUrl`. It is the SEED, not the
 * universe; keep it typed and extensible.
 *
 * HONEST BY CONSTRUCTION:
 *   - No LLM, no network, no IO. Identical input → identical output.
 *   - Every fact carries the official source it was verified against and the date
 *     of that verification, so downstream callers can show their work.
 *
 * Surfaced to AnA via the `check_regulatory_currency` / `guidance_change_radar`
 * tools (server/services/ana/regulatoryCurrencyTools.ts), classified
 * `deterministic_registry` in tool-pedigree.ts.
 *
 * @module server/services/regulatory-currency/currency-registry
 */

import type { ClientSegment } from '../ana-ri/industry-wisdom-pack.js';

/** Jurisdiction a fact governs. 'ICH' = harmonised across ICH-member regulators. */
export type Jurisdiction = 'US' | 'EU' | 'JP' | 'UK' | 'CA' | 'ICH' | 'GLOBAL';

/**
 * Lifecycle status of a dated fact, in rough decreasing order of "live authority".
 *   - in_force          : currently effective and binding.
 *   - mandatory_upcoming : adopted with a future hard effective/mandatory date.
 *   - vacated           : struck down by a court (no longer has legal effect).
 *   - rescinded         : formally withdrawn by the issuing authority.
 *   - superseded        : replaced by a newer instrument (see `supersedes`).
 *   - void              : the rule the platform might cite is now without effect
 *                          (vacated AND/OR rescinded) — the dangerous case.
 */
export type CurrencyStatus =
  | 'in_force'
  | 'mandatory_upcoming'
  | 'vacated'
  | 'rescinded'
  | 'superseded'
  | 'void';

/** A single dated regulatory fact. */
export interface RegulatoryFact {
  /** Stable, human-recognisable id (kebab-case). */
  id: string;
  /** Short human-recognisable topic (for retrieval + display). */
  topic: string;
  jurisdiction: Jurisdiction;
  status: CurrencyStatus;
  /** ISO date the status took/takes effect (effective, mandatory, or vacatur date). */
  effectiveDate: string;
  /** ISO date this fact was last verified against `sourceUrl`. */
  lastVerified: string;
  /** Official source the fact was verified against. */
  sourceUrl: string;
  /** Segments for which the fact is most load-bearing. */
  appliesTo: ClientSegment[];
  /** id (or external code) of the rule/expectation this fact supersedes or voids. */
  supersedes?: string;
  /** Plain-language consequence — what changed and what to do now. */
  note: string;
  /** Retrieval keywords. */
  keywords: string[];
}

/**
 * The seed registry. Every entry was verified against the cited official/primary
 * source on its `lastVerified` date. Extend (do not rewrite) as the landscape moves.
 */
export const REGULATORY_FACTS: RegulatoryFact[] = [
  {
    id: 'us-ldt-final-rule-void',
    topic: 'US LDT final rule (2024) — vacated & rescinded',
    jurisdiction: 'US',
    status: 'void',
    effectiveDate: '2025-09-19',
    lastVerified: '2026-06-29',
    sourceUrl:
      'https://www.federalregister.gov/documents/2025/09/19/2025-18239/regulation-identification-number-0910-aj05-medical-devices-laboratory-developed-tests-implementation',
    appliesTo: ['mdx'],
    supersedes: 'us-ldt-final-rule-2024-phaseout',
    note:
      'The FDA 2024 LDT final rule (which phased out enforcement discretion over four stages) was VACATED in its entirety by the US District Court (E.D. Tex.) on 2025-03-31 and formally RESCINDED by FDA on 2025-09-19, reverting the device regulations to the pre-2024 text. Enforcement reverts to pre-2024 enforcement discretion: do NOT advise that LDTs require 510(k)/PMA under the phase-out timeline — that schedule is VOID.',
    keywords: ['LDT', 'laboratory developed test', 'vacated', 'rescinded', 'enforcement discretion', 'IVD', 'phase-out'],
  },
  {
    id: 'ich-e6r3-gcp-step4',
    topic: 'ICH E6(R3) GCP — Step 4 (Principles + Annex 1)',
    jurisdiction: 'ICH',
    status: 'in_force',
    effectiveDate: '2025-01-06',
    lastVerified: '2026-06-29',
    sourceUrl: 'https://www.ema.europa.eu/en/ich-e6-good-clinical-practice-scientific-guideline',
    appliesTo: ['pharma', 'biotech'],
    supersedes: 'E6(R2)',
    note:
      'ICH E6(R3) Good Clinical Practice (Principles + Annex 1) reached Step 4 on 2025-01-06, modernising GCP around quality-by-design and varied trial types; it supersedes E6(R2). Annex 2 (non-traditional/decentralised trials, RWD) reached Step 4 on 2026-06-03 — see ich-e6r3-annex2-step4.',
    keywords: ['E6(R3)', 'GCP', 'good clinical practice', 'step 4', 'ICH', 'quality by design'],
  },
  {
    id: 'ich-e6r3-annex2-step4',
    topic: 'ICH E6(R3) GCP Annex 2 — Step 4',
    jurisdiction: 'ICH',
    status: 'in_force',
    effectiveDate: '2026-06-03',
    lastVerified: '2026-06-29',
    sourceUrl: 'https://database.ich.org/sites/default/files/ICH_E6(R3)_Annex%202_Guideline_Step%204_2026_0603_0.pdf',
    appliesTo: ['pharma', 'biotech'],
    note:
      'ICH E6(R3) Annex 2 (additional considerations for non-traditional interventional trials — decentralised/pragmatic designs and real-world data) reached Step 4 on 2026-06-03, completing the E6(R3) package.',
    keywords: ['E6(R3)', 'annex 2', 'GCP', 'decentralised', 'DCT', 'real-world data', 'step 4'],
  },
  {
    id: 'ich-m11-cesharp-step4',
    topic: 'ICH M11 (CeSHarP) — Step 4 + EMA template effective',
    jurisdiction: 'ICH',
    status: 'in_force',
    effectiveDate: '2025-11-19',
    lastVerified: '2026-06-29',
    sourceUrl: 'https://database.ich.org/sites/default/files/ICH_Step4_M11_Final_Guideline_2025_1119.pdf',
    appliesTo: ['pharma', 'biotech'],
    note:
      'ICH M11 Clinical electronic Structured Harmonised Protocol (CeSHarP) — guideline, template and technical specification — reached Step 4 on 2025-11-19. The EMA-adopted M11 template comes into effect on 2026-06-11. Use the harmonised structured protocol where available rather than legacy free-form templates.',
    keywords: ['M11', 'CeSHarP', 'structured protocol', 'protocol template', 'step 4', 'ICH'],
  },
  {
    id: 'fda-estar-510k-mandatory',
    topic: 'FDA eSTAR mandatory — 510(k)',
    jurisdiction: 'US',
    status: 'in_force',
    effectiveDate: '2023-10-01',
    lastVerified: '2026-06-29',
    sourceUrl: 'https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program',
    appliesTo: ['mdx'],
    note:
      'Since 2023-10-01 all 510(k) submissions (unless exempted) must be submitted electronically using the FDA eSTAR template. Non-eSTAR 510(k)s are not accepted.',
    keywords: ['eSTAR', '510(k)', 'electronic submission', 'mandatory', 'CDRH', 'device'],
  },
  {
    id: 'fda-estar-denovo-mandatory',
    topic: 'FDA eSTAR mandatory — De Novo',
    jurisdiction: 'US',
    status: 'in_force',
    effectiveDate: '2025-10-01',
    lastVerified: '2026-06-29',
    sourceUrl: 'https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program',
    appliesTo: ['mdx'],
    note:
      'Since 2025-10-01 all De Novo classification requests (unless exempted) must be submitted electronically using the FDA eSTAR template, extending the 510(k) eSTAR mandate to the De Novo pathway.',
    keywords: ['eSTAR', 'De Novo', 'electronic submission', 'mandatory', 'CDRH', 'device'],
  },
  {
    id: 'fda-ectd-v4-accepted',
    topic: 'FDA eCTD v4.0 — voluntary acceptance',
    jurisdiction: 'US',
    status: 'in_force',
    effectiveDate: '2024-09-16',
    lastVerified: '2026-06-29',
    sourceUrl: 'https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/ectd-submission-standards-ectd-v40-and-regional-m1',
    appliesTo: ['pharma', 'biotech'],
    note:
      'Since 2024-09-16 CDER and CBER accept new regulatory applications in eCTD v4.0. Acceptance is VOLUNTARY — eCTD v3.2.2 remains supported and FDA has NOT announced a mandatory v4.0 date. Do not tell US sponsors v4.0 is required.',
    keywords: ['eCTD', 'v4.0', 'CDER', 'CBER', 'electronic submission', 'voluntary', 'v3.2.2'],
  },
  {
    id: 'pmda-ectd-v4-mandatory',
    topic: 'PMDA eCTD v4.0 — only accepted format',
    jurisdiction: 'JP',
    status: 'mandatory_upcoming',
    effectiveDate: '2026-04-01',
    lastVerified: '2026-06-29',
    sourceUrl: 'https://www.pmda.go.jp/english/review-services/reviews/0001.html',
    appliesTo: ['pharma', 'biotech', 'mdx'],
    supersedes: 'eCTD v3.2.2 (PMDA)',
    note:
      'From 2026-04-01 eCTD v4.0 is the ONLY accepted electronic format for new applications to PMDA (Japan) — there is no grace period and new dossiers can no longer be filed in v3.2.2. Japan is the first major regulator to mandate v4.0. Plan v4.0 tooling before any new Japanese filing.',
    keywords: ['eCTD', 'v4.0', 'PMDA', 'Japan', 'mandatory', 'only accepted', 'v3.2.2'],
  },
  {
    id: 'eu-eudamed-mandatory',
    topic: 'EU EUDAMED — first 4 modules mandatory',
    jurisdiction: 'EU',
    status: 'mandatory_upcoming',
    effectiveDate: '2026-05-28',
    lastVerified: '2026-06-29',
    sourceUrl: 'https://health.ec.europa.eu/medical-devices-eudamed/udidevice-registration_en',
    appliesTo: ['mdx'],
    note:
      'Following the OJEU notice of full functionality (2025-11-27, Commission Decision (EU) 2025/2371), the first four EUDAMED modules (Actor Registration; UDI & Device Registration; Notified Bodies & Certificates; Market Surveillance) become MANDATORY from 2026-05-28. Legacy devices (placed on the market before that date but still sold afterwards) must complete EUDAMED registration by 2026-11-28.',
    keywords: ['EUDAMED', 'MDR', 'IVDR', 'UDI', 'actor registration', 'mandatory', 'legacy device', 'EU'],
  },
  {
    id: 'eu-ctis-only-trials',
    topic: 'EU CTIS-only for clinical trials (EudraCT retired)',
    jurisdiction: 'EU',
    status: 'in_force',
    effectiveDate: '2025-01-31',
    lastVerified: '2026-06-29',
    sourceUrl: 'https://www.ema.europa.eu/en/news/use-clinical-trials-information-system-becomes-mandatory-new-clinical-trial-applications-eu',
    appliesTo: ['pharma', 'biotech'],
    supersedes: 'EudraCT / Clinical Trials Directive 2001/20/EC',
    note:
      'Since 2025-01-31 the Clinical Trials Information System (CTIS) is the SOLE entry point for EU clinical trial applications, substantial modifications and safety reporting under the CTR; the transition from the Clinical Trials Directive/EudraCT is complete and EudraCT is retired. Do not advise EudraCT submission for new EU trials.',
    keywords: ['CTIS', 'CTR', 'EudraCT', 'clinical trial', 'EU', 'mandatory', 'transition'],
  },
  {
    id: 'eu-ai-act-high-risk',
    topic: 'EU AI Act — high-risk obligations',
    jurisdiction: 'EU',
    status: 'mandatory_upcoming',
    effectiveDate: '2026-08-02',
    lastVerified: '2026-06-29',
    sourceUrl: 'https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai',
    appliesTo: ['mdx', 'pharma', 'biotech'],
    note:
      'Under Regulation (EU) 2024/1689 (AI Act), the bulk of high-risk obligations apply from 2026-08-02 (two years after entry into force). RISK/WATCH: a proposed "Digital Omnibus" deferral (provisional agreement 2026-05-07) would postpone certain Annex III (use-case) high-risk obligations to 2027-12; treat 2026-08-02 as the statutory date and re-verify against the source before relying on either date.',
    keywords: ['AI Act', 'high-risk', 'EU', '2024/1689', 'AI', 'SaMD', 'annex III', 'digital omnibus'],
  },
];

/** Severity used by the change-radar, in increasing order of urgency. */
export type DriftSeverity = 'info' | 'mandatory_change' | 'void_rule';

/** Order of {@link DriftSeverity}, ascending; index = rank. */
export const DRIFT_SEVERITY_ORDER: DriftSeverity[] = ['info', 'mandatory_change', 'void_rule'];

/** Numeric rank of a severity (higher = more urgent). Pure/total. */
export function severityRank(severity: DriftSeverity): number {
  return DRIFT_SEVERITY_ORDER.indexOf(severity);
}

/* ── Time-resolved status ─────────────────────────────────────────────
   `mandatory_upcoming` is a claim about the future, and a stored one
   goes wrong the moment its date arrives. This registry had two facts
   in exactly that state — EU EUDAMED (effective 2026-05-28) and PMDA
   eCTD v4.0 (2026-04-01) — still labelled "upcoming" months later. The
   AnA tool that surfaces these is instructed to "report the status
   verbatim", so it would have told a user EUDAMED was not yet mandatory
   when it had been for two months.

   That is the exact failure this module exists to prevent, turned on
   itself. Editing the two entries would fix today and re-break on the
   next date to pass, so the promotion is derived instead.

   `asOf` is an explicit parameter, never a wall-clock read, so the
   module keeps its "identical input → identical output" guarantee.
   Callers pass the current date at the boundary. */

/**
 * The status of `fact` as at `asOf`.
 *
 * Promotes `mandatory_upcoming` to `in_force` once the effective date
 * has arrived. Every other status is returned unchanged: a vacatur or
 * rescission does not expire, and `in_force` needs no promotion.
 *
 * @param asOf ISO date (YYYY-MM-DD). A malformed or missing value
 *             returns the stored status — when we cannot establish
 *             "now", asserting that a future obligation has landed is
 *             the more dangerous of the two errors.
 */
export function statusAsOf(fact: RegulatoryFact, asOf: string): CurrencyStatus {
  if (fact.status !== 'mandatory_upcoming') return fact.status;
  if (!ISO_DATE_RE.test(asOf) || !ISO_DATE_RE.test(fact.effectiveDate)) return fact.status;
  /* Lexicographic comparison is exact for zero-padded ISO dates and
     avoids timezone drift entirely — parsing to Date would shift the
     boundary by up to a day depending on the runtime's zone. */
  return asOf >= fact.effectiveDate ? 'in_force' : fact.status;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `fact` with its status resolved as at `asOf`. Returns the original
 * object when nothing changed, so callers can cheaply detect promotion
 * by identity.
 */
export function factAsOf(fact: RegulatoryFact, asOf: string): RegulatoryFact {
  const resolved = statusAsOf(fact, asOf);
  return resolved === fact.status ? fact : { ...fact, status: resolved };
}

/**
 * Map a fact's status to a drift severity. A VOID rule (vacated/rescinded/void) is
 * the most dangerous — the platform may still "know" it. Future mandatory changes
 * are second. Everything else is informational.
 */
export function severityForStatus(status: CurrencyStatus): DriftSeverity {
  if (status === 'void' || status === 'vacated' || status === 'rescinded') return 'void_rule';
  if (status === 'mandatory_upcoming' || status === 'superseded') return 'mandatory_change';
  return 'info';
}

/** Normalise a free-text token for matching. */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Does a fact match the given topic substring (over topic + keywords + id)? */
function matchesTopic(fact: RegulatoryFact, topic: string): boolean {
  const t = norm(topic);
  if (!t) return true;
  if (norm(fact.topic).includes(t)) return true;
  if (norm(fact.id).includes(t)) return true;
  return fact.keywords.some((k) => norm(k).includes(t) || t.includes(norm(k)));
}

/** Filters for {@link findFacts}. All optional; omitted filters do not constrain. */
export interface FactQuery {
  topic?: string;
  jurisdiction?: Jurisdiction;
  segment?: ClientSegment;
  /**
   * ISO date to resolve statuses against. When supplied, a
   * `mandatory_upcoming` fact whose effective date has arrived is
   * returned as `in_force` — see {@link statusAsOf}. Omit only when the
   * caller genuinely wants the stored value (migrations, fixtures).
   */
  asOf?: string;
}

/**
 * Find facts matching the (optional) topic / jurisdiction / segment. Pure; returns a
 * fresh array (possibly empty) and never throws on unknown/empty inputs.
 */
export function findFacts(query: FactQuery = {}): RegulatoryFact[] {
  const { topic, jurisdiction, segment, asOf } = query;
  const matched = REGULATORY_FACTS.filter((fact) => {
    if (jurisdiction && fact.jurisdiction !== jurisdiction) return false;
    if (segment && !fact.appliesTo.includes(segment)) return false;
    if (topic !== undefined && !matchesTopic(fact, topic)) return false;
    return true;
  });
  return asOf ? matched.map((f) => factAsOf(f, asOf)) : matched;
}

/** A fact paired with its computed drift severity, for the change-radar. */
export interface FactDrift {
  fact: RegulatoryFact;
  severity: DriftSeverity;
  severityRank: number;
}

/** Filters for {@link changeRadar}. */
export interface RadarQuery {
  topics?: string[];
  jurisdictions?: Jurisdiction[];
  /** ISO date a document was drafted on; facts effective AFTER it are drift. */
  draftedOn?: string;
}

/** Parse an ISO date to a comparable timestamp, or NaN if unparseable. Pure. */
function isoTime(iso: string | undefined): number {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? NaN : t;
}

/**
 * Surface facts that represent regulatory DRIFT — i.e. changes a drafted document
 * may not reflect. With `draftedOn`, returns facts whose `effectiveDate` is strictly
 * after it (so AnA can warn "guidance changed since this was drafted"); without it,
 * returns ALL current facts as potential drift. Results are sorted most-urgent first
 * (void_rule > mandatory_change > info), then by most-recent effective date. Pure;
 * an unparseable `draftedOn` is treated as "no cutoff" (returns all matches).
 */
export function changeRadar(query: RadarQuery = {}): FactDrift[] {
  const { topics, jurisdictions, draftedOn } = query;
  const cutoff = isoTime(draftedOn);
  const jurSet = jurisdictions && jurisdictions.length > 0 ? new Set(jurisdictions) : null;
  const topicList = topics?.map(norm).filter(Boolean) ?? [];

  const drifts: FactDrift[] = [];
  for (const fact of REGULATORY_FACTS) {
    if (jurSet && !jurSet.has(fact.jurisdiction)) continue;
    if (topicList.length > 0 && !topicList.some((t) => matchesTopic(fact, t))) continue;
    // With a valid cutoff, only facts that took effect AFTER it are drift.
    if (!Number.isNaN(cutoff) && isoTime(fact.effectiveDate) <= cutoff) continue;
    const severity = severityForStatus(fact.status);
    drifts.push({ fact, severity, severityRank: severityRank(severity) });
  }

  drifts.sort((a, b) => {
    if (b.severityRank !== a.severityRank) return b.severityRank - a.severityRank;
    return isoTime(b.fact.effectiveDate) - isoTime(a.fact.effectiveDate);
  });
  return drifts;
}

export default {
  REGULATORY_FACTS,
  findFacts,
  changeRadar,
  severityForStatus,
  severityRank,
  DRIFT_SEVERITY_ORDER,
};
