/**
 * International reliance / work-sharing / collaborative registration pathways —
 * catalog + recommender.
 *
 * Increasingly, regulators do not review every dossier from scratch: they rely
 * on, work-share with, or jointly assess alongside other authorities. Picking
 * the right collaborative pathway can shorten review and harmonise outcomes
 * across markets. This service encodes the major international reliance /
 * work-sharing / collaborative-registration programs and recommends the ones a
 * development context may be able to use — the orientation a global regulatory
 * strategist provides.
 *
 * This is a planning aid, NOT a regulatory determination: each program has its
 * own scope, entry criteria, timing, and acceptance decisions made at the
 * discretion of the coordinating authority and each participating authority.
 *
 *   - Project Orbis — FDA Oncology Center of Excellence (OCE)-coordinated
 *     concurrent review of oncology products with international partners.
 *     Reference: 'FDA Oncology Center of Excellence — Project Orbis'.
 *   - Access Consortium — TGA (AU), Health Canada (CA), HSA (SG), Swissmedic
 *     (CH), MHRA (UK) work-sharing for new active substances, generics, etc.
 *     Reference: 'Access Consortium (TGA/HC/HSA/Swissmedic/MHRA)'.
 *   - EU-M4all (EU-Medicines4all, ex-Article 58) — EMA scientific opinion in
 *     cooperation with WHO for medicines intended for markets outside the EU.
 *     Reference: 'EMA EU-M4all (ex-Art 58), Reg (EC) 726/2004 Art 58'.
 *   - WHO Collaborative Registration Procedure (CRP) — WHO Prequalification +
 *     national regulatory authorities accelerating national registration of
 *     WHO-prequalified / SRA-approved products.
 *     Reference: 'WHO Collaborative Registration Procedure'.
 *   - ASEAN Joint Assessment — ASEAN NRAs jointly assessing marketing-
 *     authorisation applications. Reference: 'ASEAN Joint Assessment
 *     Coordinating Group'.
 *   - Swissmedic MAGHP — Marketing Authorisation for Global Health Products with
 *     WHO/partner reliance. Reference: 'Swissmedic MAGHP'.
 *
 * Pure / deterministic — no DB, no IO. `recommendReliancePathways` is inclusive
 * (a pathway may be returned for more than one reason) and sorts `eligible` by
 * id for stable output.
 *
 * @module server/services/global-ri/reliance-pathways
 */

/** A single international reliance / work-sharing / collaborative pathway. */
export interface ReliancePathway {
  /** Stable identifier (e.g. 'project-orbis'). */
  id: string;
  name: string;
  /** The authority that leads or coordinates the procedure. */
  leadOrCoordinator: string;
  /** The authorities that participate in (or rely under) the procedure. */
  participatingAuthorities: string[];
  /** The kinds of products / contexts the pathway is for. */
  scope: string;
  description: string;
  /** Program / authority citation (these are programs, not single statutes). */
  citation: string;
}

/**
 * Catalog of international reliance / work-sharing / collaborative-registration
 * pathways. Ordered by `id` so the array itself is deterministic.
 */
export const RELIANCE_PATHWAYS: readonly ReliancePathway[] = [
  {
    id: 'access-consortium',
    name: 'Access Consortium',
    leadOrCoordinator: 'Access Consortium (rotating chair among member authorities)',
    participatingAuthorities: [
      'TGA (Australia)',
      'Health Canada (Canada)',
      'HSA (Singapore)',
      'Swissmedic (Switzerland)',
      'MHRA (United Kingdom)',
    ],
    scope: 'general — work-sharing for new active substances, generics, and other application types',
    description:
      'A consortium of five regulatory authorities (Australia, Canada, Singapore, Switzerland and the United Kingdom) that work-share the assessment of marketing-authorisation applications, allowing companies to submit to multiple members and benefit from a shared review.',
    citation: 'Access Consortium (TGA/HC/HSA/Swissmedic/MHRA)',
  },
  {
    id: 'asean-joint-assessment',
    name: 'ASEAN Joint Assessment',
    leadOrCoordinator: 'ASEAN Joint Assessment Coordinating Group',
    participatingAuthorities: [
      'ASEAN National Regulatory Authorities (e.g. HSA Singapore, NPRA Malaysia, Thai FDA, BPOM Indonesia)',
    ],
    scope: 'ASEAN regional — joint assessment of marketing-authorisation applications among ASEAN NRAs',
    description:
      'A collaborative procedure in which ASEAN national regulatory authorities jointly assess a marketing-authorisation application, sharing the assessment workload while each authority retains its own national authorisation decision.',
    citation: 'ASEAN Joint Assessment Coordinating Group',
  },
  {
    id: 'eu-m4all',
    name: 'EU-M4all (EU-Medicines4all, ex-Article 58)',
    leadOrCoordinator: 'EMA (CHMP), in cooperation with WHO',
    participatingAuthorities: ['EMA (CHMP)', 'WHO', 'Target-country national regulatory authorities'],
    scope: 'non-EU / global-health — medicines intended for markets outside the EU (priority diseases)',
    description:
      'A procedure under which the EMA issues a scientific opinion, in cooperation with the WHO, on medicines intended for markets outside the European Union (typically priority diseases such as those of major public-health interest), supporting registration by national authorities in target countries.',
    citation: 'EMA EU-M4all (ex-Art 58), Reg (EC) 726/2004 Art 58',
  },
  {
    id: 'project-orbis',
    name: 'Project Orbis',
    leadOrCoordinator: 'FDA Oncology Center of Excellence (OCE)',
    participatingAuthorities: [
      'TGA (Australia)',
      'ANVISA (Brazil)',
      'Health Canada (Canada)',
      'MOH (Israel)',
      'HSA (Singapore)',
      'Swissmedic (Switzerland)',
      'MHRA (United Kingdom)',
    ],
    scope: 'oncology — concurrent submission and review of oncology products across partner authorities',
    description:
      'An FDA Oncology Center of Excellence (OCE)-coordinated framework for the concurrent submission and review of oncology products among international partner regulators, enabling earlier patient access through near-simultaneous review and (where applicable) approval across participating authorities.',
    citation: 'FDA Oncology Center of Excellence — Project Orbis',
  },
  {
    id: 'swissmedic-maghp',
    name: 'Swissmedic MAGHP (Marketing Authorisation for Global Health Products)',
    leadOrCoordinator: 'Swissmedic',
    participatingAuthorities: ['Swissmedic', 'WHO', 'Partner national regulatory authorities'],
    scope: 'global-health — products primarily intended for markets outside Switzerland (low- and middle-income countries)',
    description:
      'A Swissmedic procedure for the marketing authorisation of global-health products intended primarily for populations outside Switzerland, relying on cooperation with the WHO and partner authorities to support registration and use in low- and middle-income countries.',
    citation: 'Swissmedic MAGHP',
  },
  {
    id: 'who-crp',
    name: 'WHO Collaborative Registration Procedure (CRP)',
    leadOrCoordinator: 'WHO Prequalification Team',
    participatingAuthorities: ['WHO Prequalification', 'National regulatory authorities (NRAs)'],
    scope: 'LMIC / global-health — accelerated national registration of WHO-prequalified / SRA-approved products',
    description:
      'A WHO procedure that facilitates and accelerates the national registration of products that have been WHO-prequalified or approved by a stringent regulatory authority, by sharing assessment and inspection outcomes with participating national regulatory authorities (predominantly in low- and middle-income countries).',
    citation: 'WHO Collaborative Registration Procedure',
  },
];

/** All reliance-pathway ids, in catalog (id-sorted) order. */
export const RELIANCE_PATHWAY_IDS: string[] = RELIANCE_PATHWAYS.map((p) => p.id);

const PATHWAY_BY_ID: Record<string, ReliancePathway> = Object.fromEntries(
  RELIANCE_PATHWAYS.map((p) => [p.id, p]),
);

/** Look up a single pathway by id. Returns `null` for an unknown id. */
export function getReliancePathway(id: string): ReliancePathway | null {
  return PATHWAY_BY_ID[id] ?? null;
}

/** Target-market member codes recognised by the Access Consortium screen. */
const ACCESS_CONSORTIUM_MARKETS = new Set(['AU', 'CA', 'SG', 'CH', 'UK']);

/** Markers (case-insensitive) that flag an ASEAN target. */
const ASEAN_MARKERS = new Set(['ASEAN']);

/** Markers (case-insensitive) that flag a global-health target market. */
const GLOBAL_HEALTH_MARKERS = new Set(['GLOBAL-HEALTH', 'GLOBAL_HEALTH', 'GLOBALHEALTH', 'LMIC']);

/** Input context used to recommend reliance pathways. */
export interface ReliancePathwayInput {
  /** Product is an oncology product. */
  isOncology?: boolean;
  /**
   * Target markets, as ISO-style codes / markers
   * (e.g. ['AU','CA','SG','CH','UK','BR','global-health','ASEAN']).
   */
  targetMarkets?: string[];
  /** Product is a global-health product (priority disease / LMIC focus). */
  globalHealth?: boolean;
}

/** Result of recommending reliance pathways for an input context. */
export interface ReliancePathwayRecommendation {
  /** Pathways the context may be able to use, sorted by id. */
  eligible: ReliancePathway[];
  /** Convenience count (`eligible.length`). */
  count: number;
  /** One rationale line per included pathway, in the same order as `eligible`. */
  rationale: string[];
}

/**
 * Recommend international reliance / work-sharing / collaborative pathways for a
 * development context. Inclusive and deterministic:
 *
 *   - Project Orbis            — when `isOncology`.
 *   - Access Consortium        — when any `targetMarkets` entry is a member
 *                                (AU / CA / SG / CH / UK).
 *   - EU-M4all, WHO CRP, MAGHP — when `globalHealth` (or a global-health/LMIC
 *                                target-market marker).
 *   - ASEAN Joint Assessment   — when `targetMarkets` includes an ASEAN marker.
 *
 * `eligible` is always sorted by id and `rationale` is aligned 1:1 with it.
 * Eligibility / acceptance is program- and case-specific and at each
 * authority's discretion — confirm with the coordinating authority.
 */
export function recommendReliancePathways(
  input: ReliancePathwayInput,
): ReliancePathwayRecommendation {
  const markets = (input.targetMarkets ?? []).map((m) => m.trim().toUpperCase());

  const hasAccessMarket = markets.some((m) => ACCESS_CONSORTIUM_MARKETS.has(m));
  const hasAseanMarker = markets.some((m) => ASEAN_MARKERS.has(m));
  const hasGlobalHealthMarker = markets.some((m) => GLOBAL_HEALTH_MARKERS.has(m));
  const isGlobalHealth = !!input.globalHealth || hasGlobalHealthMarker;

  // Collect rationales keyed by pathway id (inclusive — at most one line per id).
  const reasons = new Map<string, string>();

  if (input.isOncology) {
    reasons.set(
      'project-orbis',
      'Oncology product — eligible for FDA OCE-coordinated concurrent review under Project Orbis with international partner authorities.',
    );
  }

  if (hasAccessMarket) {
    const members = markets.filter((m) => ACCESS_CONSORTIUM_MARKETS.has(m)).join(', ');
    reasons.set(
      'access-consortium',
      `Target market(s) ${members} are Access Consortium members (AU/CA/SG/CH/UK) — candidate for work-shared assessment under the Access Consortium.`,
    );
  }

  if (isGlobalHealth) {
    reasons.set(
      'eu-m4all',
      'Global-health product intended for markets outside the EU — candidate for an EMA scientific opinion under EU-M4all (ex-Article 58), in cooperation with WHO.',
    );
    reasons.set(
      'who-crp',
      'Global-health product — candidate for accelerated national registration via the WHO Collaborative Registration Procedure (CRP) once WHO-prequalified or SRA-approved.',
    );
    reasons.set(
      'swissmedic-maghp',
      'Global-health product primarily for markets outside Switzerland — candidate for Swissmedic Marketing Authorisation for Global Health Products (MAGHP).',
    );
  }

  if (hasAseanMarker) {
    reasons.set(
      'asean-joint-assessment',
      'ASEAN target market(s) — candidate for the ASEAN Joint Assessment procedure among ASEAN national regulatory authorities.',
    );
  }

  const eligible = RELIANCE_PATHWAYS.filter((p) => reasons.has(p.id)).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const rationale = eligible.map((p) => reasons.get(p.id)!);

  return { eligible, count: eligible.length, rationale };
}
