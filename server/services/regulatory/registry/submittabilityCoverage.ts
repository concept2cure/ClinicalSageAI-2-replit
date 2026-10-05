/**
 * Submittability coverage — can a filing type actually reach an agency?
 *
 * ── The half that was not measured ────────────────────────────────────────────
 * `registryCoverage` answers the AUTHORING question: does this filing type have a
 * real section blueprint, a real task plan, and the forms it requires? Its
 * readiness tiers (`production_ready` / `buildable` / `catalog_only`) are
 * computed entirely from those three inputs.
 *
 * That is the front half of "project initiation → submission". It says nothing
 * about the back half: whether the thing you authored can be PACKAGED into a
 * regional bundle, VALIDATED, and TRANSMITTED to a gateway. A filing type can be
 * `production_ready` by the authoring definition and have no path off the
 * platform at all.
 *
 * Every registry region except GLOBAL resolves through `region-identity` to a
 * registered gateway pair — but a registered gateway for the REGION is not a
 * channel for every filing in it (see `submissionChannelFor`). Coverage holds
 * by diligence, and nothing else asserts it keeps holding: add
 * a region to `GLOBAL_REGISTRY` and its filing types become selectable at project
 * initiation immediately, with no gateway, and no test notices. The customer
 * discovers it at the end of a submission.
 *
 * This module makes the back half measurable on the same terms as the front, so
 * the two can be reported together and gated together.
 *
 * ── Why GLOBAL is not a gap ───────────────────────────────────────────────────
 * The 22 `GLOBAL` (ICH) entries are document COMPONENTS — CSR, protocol, IB,
 * ICF, SAP, the CTD module definitions, QMS manuals — not filings. They are
 * authored into a regional dossier and travel inside it. A DSUR reaches FDA
 * inside an IND sequence over ESG; it has no gateway of its own and should not.
 * They are classified `not_a_filing` rather than counted as failures, because a
 * coverage number that treats them as gaps is a number people learn to ignore.
 *
 * Pure and synchronous — static catalogs only, no DB — so it backs both a CI gate
 * and an operator report, exactly like `registryCoverage`.
 *
 * @module server/services/regulatory/registry/submittabilityCoverage
 */

import { GLOBAL_REGISTRY } from '../../../../shared/regulatory/global-document-registry.js';
import {
  REGION_IDENTITY,
  type CanonicalRegion,
} from '../../../../shared/regulatory/region-identity.js';
import {
  listGateways,
  type GatewayName,
  type Region as GatewayRegion,
} from '../../submission-gateways/index.js';
import { SUBMISSION_FORMATS } from '../../global-ri/electronic-submission-format.js';
import type {
  RegulatoryApplicationType,
  Region,
  Agency,
  Segment,
} from '../../../../shared/regulatory/document-taxonomy.js';

/**
 * Why a filing type can or cannot be transmitted.
 *
 *  `submittable`    — resolves to a registered (gatewaySlug, defaultGateway) pair.
 *  `not_a_filing`   — a document component, not something filed on its own.
 *  `no_identity`    — the region has no `region-identity` entry, so nothing can
 *                     map it to a gateway, a rules region, or an M1 backbone.
 *  `no_gateway`     — identity exists but names a gateway that is not registered,
 *                     or the filing's channel is one the platform has no
 *                     connector for (`submissionChannelFor` → `unconnected`,
 *                     e.g. a centralised MAA and the EMA eSubmission Gateway,
 *                     an orphan designation and EMA IRIS, or an EMA filing
 *                     whose channel is not modelled at all).
 */
export type SubmittabilityTier =
  | 'submittable'
  | 'not_a_filing'
  | 'no_identity'
  | 'no_gateway'
  /**
   * The filing's own entry names a channel that is a human web portal, so no
   * gateway can carry it — distinct from `no_gateway`, which means an
   * integration is missing and could be built.
   */
  | 'portal_only';

/**
 * Submission formats whose channel is a portal with no sponsor-facing machine
 * submission path.
 *
 * Deliberately small, and grounded only in what this repository already
 * asserts. `EU_CTA` carries `submissionFormat: 'CTIS'` and states in its own
 * moduleAuthority that "a CTR CTA is a Part I / Part II submission through
 * CTIS, not an eCTD five-module dossier" — while REGION_IDENTITY.EU routes the
 * whole region to `cesp`, the medicines dossier gateway. The registry and the
 * submittability report therefore disagreed, and the report won.
 *
 * eSTAR and eCopy are NOT here. server/services/ivd-knowledge/regulatory/
 * fda-ivd.ts:81 describes CDRH submission as "the CDRH Customer Collaboration
 * Portal/eSG", which leaves a gateway path open; this module does not settle a
 * question the codebase itself hedges on. Add a format here only when the
 * repository states plainly that no machine channel exists.
 */
const PORTAL_ONLY_FORMATS: ReadonlyMap<string, string> = new Map([
  ['CTIS', 'CTIS — the EU Clinical Trials Information System portal (Regulation (EU) 536/2014)'],
]);

/**
 * Where one filing actually goes. The ONE channel function: the submittability
 * report, the submission resolver (planner and AnA) and every other caller read
 * this, so no two of them can name different channels for the same filing.
 *
 *  `gateway`     — a gateway pair in the submission-gateways registry carries it.
 *  `portal`      — a human web portal; no gateway will ever carry it.
 *  `unconnected` — a machine channel exists at the agency, but the platform has
 *                  no connector for it. Build-only here; the applicant transmits.
 *  `none`        — the region has no identity, so nothing names a channel.
 */
export type SubmissionChannel =
  | { kind: 'gateway'; region: GatewayRegion; name: GatewayName }
  | { kind: 'portal'; channel: string }
  | {
      kind: 'unconnected';
      channel: string;
      reason: string;
      /** What the platform does and what the applicant does, for this channel. */
      applicantStep: string;
    }
  | { kind: 'none' };

/**
 * The centralised-procedure channel, worded once in
 * global-ri/electronic-submission-format.ts (SUBMISSION_FORMATS.EMA.gateway).
 *
 * EMA made the eSubmission Gateway / Web Client mandatory for every
 * centralised-procedure eCTD submission from 2014-03-01 — new MAAs, variations,
 * renewals, PSURs, ASMFs — and tells applicants not to send those submissions to
 * NCAs via CESP as well (regulator text, ema.europa.eu; basis in
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-submission-channel-function-facts.md rows 1-2). REGION_IDENTITY.EU.defaultGateway
 * stays `cesp`: that IS the channel for national, MRP and DCP filings, which the
 * registry marks agency 'National_Competent_Authority'.
 *
 * No eSubmission Gateway connector exists (Rule 2; founder decision, DECISIONS.md
 * row 10), so this is `unconnected` — never a GatewayName, and never CESP.
 */
/* SUBMISSION_FORMATS.EMA.gateway also names CESP in a trailing parenthetical
   ("CESP for national procedures"); that is the national channel, not this one,
   so only the centralised channel is named here. */
const EMA_CENTRALISED_CHANNEL = `EMA ${SUBMISSION_FORMATS.EMA.gateway.replace(/\s*\([^)]*\)\s*$/, '')}`;
const EMA_CENTRALISED_REASON =
  'Centralised procedure — the eSubmission Gateway/Web Client is mandatory (EMA, since 2014-03-01); ' +
  'CESP is not an accepted channel, and the platform has no eSubmission Gateway connector';
const EMA_CENTRALISED_STEP =
  'The platform builds and validates the eCTD sequence; the applicant transmits it through that channel.';

/**
 * The application families fact row 1 covers: the centralised-procedure eCTD
 * submissions EMA names (MAAs, variations, renewals, PSURs, ASMFs). Nothing
 * else is sent to the eSubmission Gateway by this module. Fix round 2
 * (2026-10-05): the round-1 rule was "EU + EMA + eCTD", which also caught
 * EU_ORPHAN, EU_SCIENTIFIC_ADVICE, EU_PIP and EU_PRIME — they carry
 * submissionFormat 'eCTD' in the registry — and told an orphan-designation
 * applicant the centralised procedure applied.
 */
const EMA_CENTRALISED_FAMILIES = new Set([
  'marketing_authorization',
  'variation',
  'renewal',
  'safety_report',
  'master_file',
]);

/**
 * EMA filings received through IRIS, keyed by registry id rather than family:
 * `pre_submission` and `designation` also hold EU_REF_LAB and EU_ACCEL_ASSESS,
 * which nothing on record routes to IRIS. Each row is regulator text
 * (ema.europa.eu search results, facts rows 4-5). The platform has no IRIS
 * connector (Rule 2), so these are `unconnected`, not `portal`: this module does
 * not assert that no machine channel exists.
 */
const EMA_IRIS_CHANNEL = 'EMA IRIS (Regulatory & Scientific Information Management Platform)';
const EMA_IRIS_FILINGS: ReadonlyMap<string, string> = new Map([
  ['EU_ORPHAN', 'Orphan designation applications are submitted to EMA through IRIS (EMA, since 2018)'],
  ['EU_SCIENTIFIC_ADVICE', 'Scientific advice requests are submitted to EMA through IRIS (EMA, since 2020-10-19)'],
  ['EU_PIP', 'Paediatric investigation plan applications are submitted to EMA through IRIS (EMA)'],
  ['EU_PRIME', 'PRIME eligibility requests are submitted to EMA through IRIS (EMA)'],
]);
const EMA_IRIS_STEP =
  'The platform prepares the application content; the applicant submits it through IRIS, for which the platform has no connector.';

/**
 * Any other EMA-agency entry: no channel is modelled, and none is invented.
 * Falling through to the region default reported EU_EUDRAVIGILANCE_ICSR, EU_PSMF
 * and the IVDR consultations submittable through CESP — a channel nothing on
 * record says accepts them. Fail closed, and make no regulator claim.
 */
const EMA_UNMODELLED_CHANNEL = 'EMA — channel not modelled';
const EMA_UNMODELLED_REASON =
  "This filing's EMA submission channel is not modelled on the platform; confirm it with EMA. " +
  'The EU region default (CESP) is not assumed';
const EMA_UNMODELLED_STEP =
  'The platform prepares the content; the applicant submits it through the channel EMA specifies.';

const DEVICE_FAMILIES = new Set(['device_approval', 'device_clearance']);

export function submissionChannelFor(entry: RegulatoryApplicationType): SubmissionChannel {
  // The entry's own declared format first: a registered gateway for the region
  // is not a channel for a filing whose entry says it goes to a portal.
  const portal = PORTAL_ONLY_FORMATS.get(String(entry.submissionFormat ?? ''));
  if (portal) return { kind: 'portal', channel: portal };

  if (entry.region === 'EU' && entry.agency === 'EMA') {
    if (DEVICE_FAMILIES.has(String(entry.applicationFamily))) {
      return { kind: 'gateway', region: 'ema', name: 'eudamed' };
    }
    const iris = EMA_IRIS_FILINGS.get(entry.id);
    if (iris) {
      return { kind: 'unconnected', channel: EMA_IRIS_CHANNEL, reason: iris, applicantStep: EMA_IRIS_STEP };
    }
    if (entry.submissionFormat === 'eCTD' && EMA_CENTRALISED_FAMILIES.has(String(entry.applicationFamily))) {
      return {
        kind: 'unconnected',
        channel: EMA_CENTRALISED_CHANNEL,
        reason: EMA_CENTRALISED_REASON,
        applicantStep: EMA_CENTRALISED_STEP,
      };
    }
    return {
      kind: 'unconnected',
      channel: EMA_UNMODELLED_CHANNEL,
      reason: EMA_UNMODELLED_REASON,
      applicantStep: EMA_UNMODELLED_STEP,
    };
  }

  const identity = (REGION_IDENTITY as Record<string, any>)[entry.region as CanonicalRegion];
  if (!identity) return { kind: 'none' };
  return { kind: 'gateway', region: identity.gatewaySlug, name: identity.defaultGateway };
}

export interface SubmittabilityCoverage {
  id: string;
  displayName: string;
  region: Region;
  agency: Agency;
  segment?: Segment;
  /**
   * REGION-level: the gateway registry slug the entry's region maps to, e.g.
   * 'fda'. Not this filing's channel — read `tier` (and `channel` /
   * `portalChannel`) for that; an EU centralised MAA carries slug 'ema' and
   * default 'cesp' here while its tier is `no_gateway`.
   */
  gatewaySlug?: string;
  /** REGION-level: the gateway the region defaults to, e.g. 'esg'. See `gatewaySlug`. */
  defaultGateway?: string;
  /** REGION-level: the region's (slug, default gateway) pair is in the gateway registry. */
  gatewayRegistered: boolean;
  /** A regional M1 backbone is declared for the region. */
  hasM1Backbone: boolean;
  tier: SubmittabilityTier;
  /**
   * When `tier` is `portal_only`, the channel the filing actually goes to.
   * Named so an operator is sent somewhere rather than told an integration is
   * missing that was never going to exist.
   */
  portalChannel?: string;
  /**
   * When the channel is `unconnected` (tier `no_gateway`), the channel the
   * filing must use, and why the region's default gateway is not it.
   */
  channel?: string;
  channelReason?: string;
}

/**
 * Application families that are document components rather than filings.
 *
 * Deliberately keyed on FAMILY, not on a list of ids: a new ICH clinical
 * document added next year should classify correctly without anyone remembering
 * to extend a hardcoded set — the same reasoning that made the tenant export
 * catalog-driven rather than hand-listed.
 */
const NON_FILING_FAMILIES = new Set([
  'clinical_document',
  'dossier_module',
  'quality_system',
  'software_documentation',
]);

/**
 * `quality_cmc` and `safety_report` are ambiguous: an ICH QOS is a component,
 * but a regional safety report IS filed. Region decides — a GLOBAL/ICH entry in
 * these families is a component; a regional one is a filing.
 */
const REGION_DEPENDENT_FAMILIES = new Set(['quality_cmc', 'safety_report']);

function isNonFiling(entry: RegulatoryApplicationType): boolean {
  const family = String(entry.applicationFamily);
  if (NON_FILING_FAMILIES.has(family)) return true;
  if (REGION_DEPENDENT_FAMILIES.has(family) && entry.region === 'GLOBAL') return true;
  return false;
}

/** The registered (slug, gateway) pairs, read once per call. */
function registeredGatewayPairs(): Set<string> {
  return new Set(listGateways().map((g) => `${g.region}:${g.gateway}`));
}

/** Submittability for one registry entry. */
export function getSubmittability(
  entry: RegulatoryApplicationType,
  pairs: Set<string> = registeredGatewayPairs()
): SubmittabilityCoverage {
  const identity = (REGION_IDENTITY as Record<string, any>)[entry.region as CanonicalRegion];
  const gatewaySlug: string | undefined = identity?.gatewaySlug;
  const defaultGateway: string | undefined = identity?.defaultGateway;
  const gatewayRegistered = Boolean(
    gatewaySlug && defaultGateway && pairs.has(`${gatewaySlug}:${defaultGateway}`)
  );

  const base = {
    id: entry.id,
    displayName: entry.displayName,
    region: entry.region,
    agency: entry.agency,
    segment: entry.segment,
    gatewaySlug,
    defaultGateway,
    gatewayRegistered,
    hasM1Backbone: Boolean(identity?.m1Backbone),
  };

  // Component-vs-filing is decided FIRST. A CSR has no gateway and that is
  // correct, not a gap; reporting it as one trains people to ignore the number.
  if (isNonFiling(entry)) return { ...base, tier: 'not_a_filing' };
  if (!identity) return { ...base, tier: 'no_identity' };
  /* The filing's channel, not the region's: the EU region HAS a registered
     gateway, and that is exactly how an EU CTA (CTIS) and every centralised MAA
     (eSubmission Gateway) came to be reported submittable through CESP. */
  const channel = submissionChannelFor(entry);
  if (channel.kind === 'portal') return { ...base, tier: 'portal_only', portalChannel: channel.channel };
  if (channel.kind === 'unconnected') {
    return { ...base, tier: 'no_gateway', channel: channel.channel, channelReason: channel.reason };
  }
  if (channel.kind !== 'gateway' || !pairs.has(`${channel.region}:${channel.name}`)) {
    return { ...base, tier: 'no_gateway' };
  }
  return { ...base, tier: 'submittable' };
}

export interface SubmittabilityReport {
  total: number;
  byTier: Record<SubmittabilityTier, number>;
  /** Entries that SHOULD be submittable but are not — the actionable list. */
  gaps: SubmittabilityCoverage[];
  /**
   * Filings whose channel is a portal. Deliberately NOT in `gaps`: `gaps` is the
   * integration backlog, and no integration will ever make these transmittable.
   * Reported separately so they are visible without being mistaken for work.
   */
  portalOnly: SubmittabilityCoverage[];
  /** Region-level rollup, which is where a gap is actually fixed. */
  byRegion: Array<{
    region: Region;
    filings: number;
    components: number;
    submittable: number;
    gatewaySlug?: string;
    defaultGateway?: string;
    reachable: boolean;
  }>;
}

export function computeSubmittability(): SubmittabilityCoverage[] {
  const pairs = registeredGatewayPairs();
  return GLOBAL_REGISTRY.map((entry) => getSubmittability(entry, pairs));
}

export function buildSubmittabilityReport(): SubmittabilityReport {
  const all = computeSubmittability();
  const byTier: Record<SubmittabilityTier, number> = {
    submittable: 0,
    not_a_filing: 0,
    no_identity: 0,
    no_gateway: 0,
    portal_only: 0,
  };
  for (const c of all) byTier[c.tier] += 1;

  const regions = [...new Set(all.map((c) => c.region))];
  const byRegion = regions.map((region) => {
    const inRegion = all.filter((c) => c.region === region);
    const components = inRegion.filter((c) => c.tier === 'not_a_filing').length;
    const submittable = inRegion.filter((c) => c.tier === 'submittable').length;
    const sample = inRegion[0];
    return {
      region,
      filings: inRegion.length - components,
      components,
      submittable,
      gatewaySlug: sample?.gatewaySlug,
      defaultGateway: sample?.defaultGateway,
      reachable: inRegion.length - components === 0 || submittable > 0,
    };
  });

  return {
    total: all.length,
    byTier,
    gaps: all.filter((c) => c.tier === 'no_identity' || c.tier === 'no_gateway'),
    portalOnly: all.filter((c) => c.tier === 'portal_only'),
    byRegion,
  };
}

/**
 * The gate. Returns the filing types that a customer could select at project
 * initiation and then be unable to submit.
 *
 * A non-empty result means either someone added filing types for a region
 * without wiring its identity or its gateway — a failure that would otherwise
 * surface to the customer at the end of a submission rather than to us at the
 * start of a pull request — or a filing's channel has no connector here. The
 * centralised EMA filings (eSubmission Gateway / Web Client, `channel` names it)
 * are in that second group by founder decision (Rule 2; DECISIONS.md row 10):
 * build-only until a connector is approved, and listed here rather than hidden
 * as submittable through CESP, which EMA does not accept for them.
 */
export function getUnsubmittableFilings(): SubmittabilityCoverage[] {
  return computeSubmittability().filter(
    (c) => c.tier === 'no_identity' || c.tier === 'no_gateway'
  );
}
