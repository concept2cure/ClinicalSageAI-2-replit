/**
 * Module 3 regional (3.2.R) coverage — honest-state per region.
 *
 * ── WHAT THIS CLOSES ─────────────────────────────────────────────────────────
 * Module 3 holds an authored 3.2.R template for four regions
 * (REGIONAL_SUBSECTIONS in module3-extensions: US, EU, JP, CA). The run route
 * accepts thirteen — the twelve canonical regions of
 * shared/regulatory/region-identity plus the GLOBAL pseudo-region — since the
 * Move-7 widening. For the other nine, composeRegional finds no matching
 * subsection and returns an empty array, and until this module existed the only
 * thing said about that was 'skipped (no inputs)': the product's gap reported as
 * the caller's omission.
 *
 * ── WHY THIS CLASSIFIES RATHER THAN AUTHORS ──────────────────────────────────
 * The obvious-looking fix is to write the eight missing agencies' 3.2.R content.
 * That content is a set of pointers to named agency guidance — the EU template
 * cites Annex 16 of the EU GMP Guide, EMA/CHMP/SWP/4447/00 Rev. 1 and
 * EMEA/410/01 rev. 3 by number — and inventing the MHRA, Swissmedic, TGA, NMPA,
 * ANVISA, CDSCO, MFDS and HSA equivalents from memory would put unverified
 * regulatory citations into a section a reviewer reads as dossier content. This
 * repository already refused exactly that one layer down, and said why:
 * regional-backbone-readiness.ts declines to claim Module 1 conformance it cannot
 * verify because "the agency DTDs are licensed and not vendored … claiming
 * conformance meanwhile would be a fabrication", and classifies the SAME eight
 * regions as placeholders. Authoring 3.2.R for them is regulatory-affairs work
 * with a citable source per claim; this module is the honest state until that
 * work lands, and the hook it lands into.
 *
 * ── POSTURE ──────────────────────────────────────────────────────────────────
 * Deliberately identical to the regional-backbone / DTD / PDF-A gates: the gap is
 * ALWAYS surfaced (a check row plus a warning) so no surface can read a missing
 * 3.2.R as a present one, and it BLOCKS only a production transmit when
 * enforcement is opted in via M3_REQUIRE_REGIONAL_SECTION=true.
 *
 * Region identity, agency names and the set of real regions all come from
 * REGION_IDENTITY. Nothing here hand-writes another region table — that module's
 * header asks callers not to, and a fourth list is how the drift this fixes
 * happened in the first place.
 *
 * @module server/services/module3-regional-readiness
 */

import {
  REGION_IDENTITY,
  canonicalRegionOf,
  getRegionIdentity,
  type CanonicalRegion,
} from '../../shared/regulatory/region-identity.js';
import { REGIONS_WITH_REGIONAL_TEMPLATE } from './module3-extensions.js';

/**
 * Every region a submission run may target: the twelve canonical jurisdictions
 * plus GLOBAL.
 *
 * GLOBAL is not a jurisdiction — region-identity defines its twelve as "taxonomy
 * `Region` minus GLOBAL" — so it is carried here because runs may legitimately
 * target a region-agnostic dossier, and classified `not-applicable` below rather
 * than counted as a missing template.
 *
 * The route's RegionSchema is built from this constant. It used to be an
 * independent z.enum, which is precisely why it drifted nine regions away from
 * the templates without anything noticing.
 */
/**
 * The twelve real jurisdictions, without GLOBAL.
 *
 * For anything that needs an actual agency — validating a package against a
 * region's rules, choosing a gateway — GLOBAL is not an answer. Exported so those
 * callers derive from one list too: a second hand-written region literal is
 * exactly the drift this module was written to end, and there was already a
 * second one (the run route's ValidatorRegionSchema) when it was.
 */
export const JURISDICTION_REGIONS: readonly [CanonicalRegion, ...CanonicalRegion[]] = Object.keys(
  REGION_IDENTITY
) as [CanonicalRegion, ...CanonicalRegion[]];

/**
 * The scope a Module 3 section is classified under: one canonical jurisdiction,
 * or GLOBAL for content that is not region-specific. Named for the scope rather
 * than for "a submission region" because region-profiles/region-profile-service
 * exports its own, narrower list under that noun.
 */
export type Module3RegionScope = CanonicalRegion | 'GLOBAL';

/* Typed as a non-empty readonly tuple because z.enum needs to see that it has a
   first element; Object.keys alone gives string[], which no Zod overload accepts.
   The runtime contents are still derived, and a test pins them to
   REGION_IDENTITY + GLOBAL so the annotation cannot quietly become a fiction. */
export const SUBMISSION_REGIONS: readonly [Module3RegionScope, ...Module3RegionScope[]] = [
  ...JURISDICTION_REGIONS,
  'GLOBAL',
];

/**
 * - `authored`       — a 3.2.R template exists and will compose.
 * - `not-authored`   — 3.2.R applies to this jurisdiction; no template here yet.
 * - `not-applicable` — not a jurisdiction, so 3.2.R has no meaning for it.
 */
export type Module3RegionalCoverage = 'authored' | 'not-authored' | 'not-applicable';

export interface Module3RegionalStatus {
  /** The region as classified, upper-cased. */
  region: string;
  coverage: Module3RegionalCoverage;
  /** The agency, when the region is a real jurisdiction. */
  agency?: string;
  /** One sentence naming the gap. Absent when `authored`. */
  reason?: string;
  /** The regions that DO have a template — the reader's next question. */
  authoredRegions: string[];
}

/**
 * Resolve a region written in any of the platform's vocabularies — canonical code
 * ('UK'), gateway slug ('uk', 'fda'), rule region ('eu') or agency name ('MHRA',
 * 'Health_Canada') — to the canonical code, keeping GLOBAL and passing an unknown
 * value through upper-cased so the classifier can name it.
 *
 * Amended 2026-09-24: this used to carry its own resolution loop, reading canonical
 * codes and gateway slugs only. Agency names fell through untouched, so
 * classifyModule3Regional('MHRA') was 'not-applicable' — "3.2.R does not apply" —
 * and the gate PASSED it, for TGA, NMPA, Swissmedic and ANVISA alike;
 * 'Health_Canada' was reported not-applicable for a region whose template EXISTS;
 * and 'EMA' resolved only because 'ema' is also EU's gateway slug. No live caller
 * passed an agency name (the gate receives gateway slugs, the orchestrator step
 * canonical codes), so this was latent — but it was an exported classifier giving
 * the one answer that makes a gate stand down. region-identity has since gained
 * canonicalRegionOf, which resolves all four vocabularies beside the table it
 * reads; this now delegates to it rather than keeping a partial private copy.
 */
export function normalizeSubmissionRegion(region: string): string {
  const upper = String(region ?? '')
    .trim()
    .toUpperCase();
  if (upper === 'GLOBAL') return 'GLOBAL';
  // undefined means "not a region this platform knows": pass it through named,
  // so the classifier reports it as unrecognised rather than guessing.
  return canonicalRegionOf(region) ?? upper;
}

function authoredRegions(): string[] {
  return [...REGIONS_WITH_REGIONAL_TEMPLATE].sort();
}

/** Classify a region's 3.2.R coverage. Pure. */
export function classifyModule3Regional(region: string): Module3RegionalStatus {
  const code = normalizeSubmissionRegion(region);
  const list = authoredRegions();

  if (REGIONS_WITH_REGIONAL_TEMPLATE.has(code)) {
    return {
      region: code,
      coverage: 'authored',
      agency: getRegionIdentity(code)?.agency,
      authoredRegions: list,
    };
  }

  const identity = getRegionIdentity(code);
  if (!identity) {
    return {
      region: code,
      coverage: 'not-applicable',
      reason:
        code === 'GLOBAL'
          ? 'GLOBAL is not a jurisdiction — ICH M4Q 3.2.R is regional information for a specific agency, ' +
            'so there is no regional section to compose for a region-agnostic dossier. This is not a gap.'
          : `${code} is not one of the twelve canonical regions (shared/regulatory/region-identity), ` +
            'so no 3.2.R applies to it.',
      authoredRegions: list,
    };
  }

  return {
    region: code,
    coverage: 'not-authored',
    agency: identity.agency,
    reason:
      `no 3.2.R template is authored for ${code} (${identity.agency}) — Module 3 regional content exists ` +
      `for ${list.join(
        '/'
      )} only. Authoring it requires the agency's own guidance cited per claim, the way ` +
      `the EU template cites Annex 16 and EMEA/410/01 rev. 3; it has not been written, and is not inferred ` +
      `from another region. The Module 1 backbone for this region is classified a placeholder for the same ` +
      `reason (see regional-backbone-readiness).`,
    authoredRegions: list,
  };
}

/** Read the opt-in enforcement flag (mirrors regionalBackboneRequiredFromEnv). */
export function module3RegionalRequiredFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.M3_REQUIRE_REGIONAL_SECTION ?? '').toLowerCase() === 'true';
}

export interface Module3RegionalGateInput {
  region: string;
  /**
   * The package's shipped CTD sections, when known. A 3.2.R leaf present means
   * the content reached the package by some other route (hand-authored and
   * uploaded, say) and the absent template did not cost the submission anything
   * — so the gate must not block on it.
   */
  shippedCtdSections?: readonly string[];
  environment: 'staging' | 'production';
  /** Wire from module3RegionalRequiredFromEnv(); false ⇒ report-only. */
  required: boolean;
}

export interface Module3RegionalGateResult {
  check?: { name: string; passed: boolean; detail: string };
  blockers: string[];
  warnings: string[];
}

/** Whether a shipped-section list contains any 3.2.R leaf. */
function carriesRegionalLeaf(sections: readonly string[] | undefined): boolean | undefined {
  if (sections === undefined) return undefined;
  return sections.some(s => String(s).replace(/^m/i, '').startsWith('3.2.R'));
}

/**
 * Evaluate the 3.2.R coverage gate.
 *
 * `authored` and `not-applicable` both pass: one has the section, the other
 * cannot need it. `not-authored` is always surfaced, and blocks a production
 * transmit only under M3_REQUIRE_REGIONAL_SECTION — unless the package turns out
 * to carry a 3.2.R leaf anyway, in which case the template's absence cost the
 * submission nothing and saying otherwise would be the same kind of false report
 * this module exists to remove.
 */
export function evaluateModule3RegionalGate(
  input: Module3RegionalGateInput
): Module3RegionalGateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const status = classifyModule3Regional(input.region);
  const hasLeaf = carriesRegionalLeaf(input.shippedCtdSections);

  if (status.coverage !== 'not-authored') {
    return {
      check: {
        name: 'module3-regional-section',
        passed: true,
        detail:
          status.coverage === 'authored'
            ? `${status.region} has an authored 3.2.R template`
            : `3.2.R does not apply to ${status.region}`,
      },
      blockers,
      warnings,
    };
  }

  if (hasLeaf === true) {
    return {
      check: {
        name: 'module3-regional-section',
        passed: true,
        detail:
          `${status.region} has no authored 3.2.R template, but the package ships a 3.2.R leaf — ` +
          `the content came from elsewhere`,
      },
      blockers,
      warnings,
    };
  }

  const detail = `${status.region}: ${status.reason}`;
  const check = { name: 'module3-regional-section', passed: false, detail };

  const msg =
    `This package carries no Module 3 regional information (3.2.R) for ${status.region}` +
    (status.agency ? ` (${status.agency})` : '') +
    `, and none can be composed: ${status.reason}` +
    (hasLeaf === undefined
      ? " The package manifest was not available, so this is the region's coverage, not a check of the package."
      : '');

  if (input.environment === 'production' && input.required) {
    blockers.push(`${msg} M3_REQUIRE_REGIONAL_SECTION blocks this production transmit.`);
  } else {
    warnings.push(msg);
  }

  return { check, blockers, warnings };
}

export default {
  JURISDICTION_REGIONS,
  classifyModule3Regional,
  evaluateModule3RegionalGate,
  module3RegionalRequiredFromEnv,
  normalizeSubmissionRegion,
  SUBMISSION_REGIONS,
};
