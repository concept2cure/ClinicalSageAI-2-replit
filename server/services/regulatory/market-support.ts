/**
 * What the platform can carry for one market (docs/design/FILING_SPINE.md F19).
 *
 * A market is one agency and one application type. Whether the platform can
 * build and send a filing for it was decided in four places that never met,
 * and the submission resolver read none of them: it called a market
 * "buildable" whenever a Module 1 backbone file name existed, so EMA and PMDA
 * read buildable while their Module 1 is filed flat. Nothing on screen said
 * what a market cannot do.
 *
 * This module composes the four into one statement:
 *   1. the rule pack — is there a governed outline for (doc_type, agency)?
 *      (c2c_rule_packs through rule-pack-lookup.ts; the class through
 *      document-class.ts, so an unmapped agency is refused as at creation);
 *   2. the regional backbone — is Module 1 built to the agency's own headings,
 *      filed flat, or another region's placeholder?
 *      (module1ShapeOf, regional-backbone-readiness.ts);
 *   3. the region profile — does the gate check this region's Module 1?
 *      (getSubmissionRegionProfile, region-profile-service.ts);
 *   4. the channel — is there a way to send it, and does its adapter refuse?
 *      (submissionChannelFor, submittabilityCoverage.ts, judged here against
 *      the adapters' own refusals, transport-refusals.ts).
 *
 * No model writes any part of it. Every sentence comes from a fixed source, so
 * the market rows, the New submission options, the New project picker and the
 * resolver give one answer.
 *
 * Pure apart from `readMarketSupport`, which reads the active packs once.
 */
import {
  AGENCY_FALLBACKS,
  AGENCY_TO_CODE,
  PROGRAM_TO_DOC_TYPE,
  describeUnmappedClass,
} from '../c2c/document-class.js';
import { listActiveRulePacks, type RulePackQueryable } from '../c2c/rule-pack-lookup.js';
import { module1ShapeOf, type Module1Shape } from '../ectd/regional-backbone-readiness.js';
import { pmdaEctdV4Fact } from '../ectd/dispatch-readiness.js';
import { getSubmissionRegionProfile } from '../region-profiles/region-profile-service.js';
import { submissionChannelFor } from './registry/submittabilityCoverage.js';
import {
  ADAPTER_UNSOURCED,
  FDA_ESG_NOT_PROVEN,
  PMDA_PROTOCOL_UNVERIFIED,
} from '../submission-gateways/transport-refusals.js';
// Health Canada's adapter no longer posts anywhere (2026-10-08, F19b), so
// ADAPTER_UNSOURCED, "its adapter posts to an endpoint…", is not true of it.
// The adapter's own sentence is the channel detail; re-exported for readers.
import { HEALTH_CANADA_NO_TRANSPORT } from '../submission-gateways/health-canada-gateway.js';
export { HEALTH_CANADA_NO_TRANSPORT };
import {
  REGION_IDENTITY,
  canonicalRegionOf,
  type CanonicalRegion,
} from '../../../shared/regulatory/region-identity.js';
import { getByAgency } from '../../../shared/regulatory/global-document-registry.js';
import type { RegulatoryApplicationType } from '../../../shared/regulatory/document-taxonomy.js';
import { resolveToRegistryEntry } from '../../../shared/regulatory/submission-type-bridge.js';

/** The active rule packs, by (doc_type, agency code). Injected so the composition stays pure. */
export interface ActiveRulePacks {
  find(docType: string, agency: string): { version: string; label: string } | null;
}

export interface MarketInput {
  /** The application type as the submission or program records it ('nda', 'maa', 'NDS', …). */
  applicationType: string;
  /** The market: an agency ('EMA', 'Health_Canada'), a region code ('EU', 'CA') or a submission region ('eu', 'ca'). */
  market: string;
  /**
   * True when the application is already on file with the agency (an
   * agency-assigned number exists), so the filing is its continuing lifecycle,
   * not a new application. Only the offer reads it (PMDA: a new application
   * needs eCTD v4.0, a continuing one does not). Absent means a new application.
   */
  continuingLifecycle?: boolean;
}

export type OutlineState = 'outline' | 'no_outline' | 'unmapped';
export type ChannelState =
  /** A gateway adapter exists and is wired; nothing has been accepted through it (D7). */
  | 'unproven'
  /** The agency's channel is one the platform has no connector for; the applicant transmits. */
  | 'applicant_uploads'
  /** A web portal the applicant uses (CTIS). */
  | 'portal'
  /** The adapter refuses every transmit (PMDA). */
  | 'refused'
  /** No channel: none on record, or an adapter written from no agency source. */
  | 'none';

export interface MarketSupport {
  applicationType: string;
  /** The market as given. */
  market: string;
  /** Canonical region code, or null when the market names no region the platform knows. */
  region: CanonicalRegion | null;
  /** The agency, as the platform names it, or null. */
  agency: string | null;
  outline: { state: OutlineState; pack: { version: string; label: string } | null; detail: string };
  module1: { state: Module1Shape | null; detail: string };
  /** True when the gate checks this region's Module 1 against a region profile. */
  regionProfile: boolean;
  channel: { state: ChannelState; detail: string };
  /** The short statement: "Structured Module 1", "Flat Module 1, no channel", "No outline, no channel", "Unmapped", "Not offered". */
  summary: string;
  /** The sentence a market row says (FILING_SPINE.md §3, "Market row says"). */
  line: string;
  /** A region-correct dossier can be built: an outline, and Module 1 to the agency's own headings. */
  buildable: boolean;
  /** False when the platform refuses the market at creation or does not offer it. */
  offered: boolean;
  /**
   * What the product offers for a filing in this market, read from the fields
   * above (WORKFLOW_DECISION_2026-10-08.md §4 Q2 and §5): build and sequence,
   * author documents only, or not offered, with the reason. Project creation
   * (POST /api/c2c/projects) refuses a filing that is not offered, and the New
   * project picker lists only offered filings, both from this field.
   */
  offer: FilingOffer;
}

// ── What the product offers for a filing (added 2026-10-08, F19b) ───────────
// The product never offers a filing it cannot finish, it says why, and it keeps
// authoring value (WORKFLOW_DECISION_2026-10-08.md §5). The tier is derived from
// the statement above only; no reader keeps its own copy of the rule.

export type FilingOfferTier = 'build_and_sequence' | 'author_only' | 'not_offered';

export interface FilingOffer {
  tier: FilingOfferTier;
  /** The short label a picker or market row shows next to the filing. */
  label: string;
  /** One plain sentence: what the product does for this filing, or why not. */
  reason: string;
  /**
   * The registered filings (registry ids) the tier is stated for, or null when
   * it holds for every filing that creates this application type in this
   * market. Build and sequence is stated only for the application itself and
   * the registered filings of its own family with an eCTD dossier: an NDA, a
   * 505(b)(2), a rolling NDA. A meeting request, a designation, a supplement, a
   * safety report or a QMS record that a picker files under the same
   * application type is not that application, and no sequence is claimed for it.
   * (Added 2026-10-08, F19b review: the picker showed "Build and sequence" for
   * a Type A meeting because it creates an NDA project.)
   */
  appliesTo: string[] | null;
}

export const FILING_OFFER_LABEL: Readonly<Record<FilingOfferTier, string>> = {
  build_and_sequence: 'Build and sequence',
  author_only: 'Author documents for this market',
  not_offered: 'Not offered',
};

/** Registry families that are an application a sequence belongs to. A device
 *  clearance, a master file or a designation is authored, not sequenced here. */
const SEQUENCED_FAMILIES: ReadonlySet<string> = new Set(['clinical_trial', 'marketing_authorization']);

function offerOf(tier: FilingOfferTier, reason: string, appliesTo: string[] | null = null): FilingOffer {
  return { tier, label: FILING_OFFER_LABEL[tier], reason, appliesTo };
}

/** The registered filings a build-and-sequence offer covers: the judged
 *  application and every filing registered at its agency in the same family
 *  with an eCTD dossier. */
function sequencedFilingsLike(entry: RegulatoryApplicationType): string[] {
  return getByAgency(entry.agency as never)
    .filter((e) => e.applicationFamily === entry.applicationFamily && e.dossierStandard === 'eCTD')
    .map((e) => e.id)
    .sort();
}

/** The agency as a person reads it ('Health_Canada' → 'Health Canada'). */
const agencyName = (agency: string | null, market: string): string => (agency ?? market).replace(/_/g, ' ');

/** "IND", "NDA", "MAA": the application type as a person reads it. */
const applicationName = (applicationType: string): string => applicationType.replace(/_/g, ' ').toUpperCase();

/** Why this market's filing is not offered, or null when it is. */
function notOfferedReason(
  s: Omit<MarketSupport, 'offer'>,
  pmdaBlocked: boolean,
  continuing: boolean,
): string | null {
  // Refused at creation, or not offered (MHRA "IND"): the statement's own line.
  if (!s.offered) return `${s.line.replace(/\.$/, '')}.`;
  if (s.outline.state !== 'outline') {
    const noChannel = NO_CHANNEL_STATES.has(s.channel.state) ? ' and no channel to send it' : '';
    return `${agencyName(s.agency, s.market)} has no governed ${applicationName(s.applicationType)} outline here, ` +
      `so a project would have nothing to author${noChannel}.`;
  }
  // The sentence names only what blocks the filing. A continuing application
  // (MarketInput.continuingLifecycle) lifts it for an API caller that sends the
  // approval number, but no screen sends one yet, so no screen is told it can.
  if (pmdaBlocked && !continuing) {
    return 'PMDA requires eCTD v4.0 for new applications, and this platform builds eCTD v3.2.2 only.';
  }
  return null;
}

/** The offer for one statement. `entry` is the registered filing the channel was judged from. */
function filingOfferFor(
  s: Omit<MarketSupport, 'offer'>,
  entry: RegulatoryApplicationType | null,
  pmdaBlocked: boolean,
  continuing: boolean,
): FilingOffer {
  const refused = notOfferedReason(s, pmdaBlocked, continuing);
  if (refused) return offerOf('not_offered', refused);
  const agency = agencyName(s.agency, s.market);
  const sequenced = !!entry && entry.dossierStandard === 'eCTD' && SEQUENCED_FAMILIES.has(String(entry.applicationFamily));
  if (s.buildable && sequenced && s.channel.state !== 'refused') {
    return offerOf(
      'build_and_sequence',
      `Authored, built and frozen here as an eCTD sequence for ${agency}. ${s.line.replace(/\.$/, '')}.`,
      sequencedFilingsLike(entry as RegulatoryApplicationType),
    );
  }
  if (!sequenced) {
    return offerOf('author_only', `Author the documents here. This platform builds no ${agency} sequence for a ${applicationName(s.applicationType)}.`);
  }
  return offerOf('author_only', `Author the documents here. ${s.module1.detail}, so no ${agency} sequence is built.`);
}

/** Why an FDA sequence is never a 'variation' (WORKFLOW_DECISION_2026-10-08.md §5). */
export const FDA_VARIATION_REASON =
  "'Variation' is the EU term. An FDA post-approval change is a supplement (PAS, CBE-30 or CBE-0), which is not built " +
  'yet. Coding it as an amendment to the original application would misfile it.';

/**
 * Why a sequence of this type is not offered in this market, or null when it
 * is. Today one rule: FDA has no 'variation'. Read by createSequence (a direct
 * API caller) and by the FDA coding in core-to-packager.ts, so neither keeps
 * its own copy.
 */
export function sequenceTypeRefusal(market: string | null | undefined, type: string | null | undefined): string | null {
  const t = String(type ?? '').trim().toLowerCase();
  if (t !== 'variation') return null;
  return regionOfMarket(String(market ?? '')) === 'US' ? FDA_VARIATION_REASON : null;
}

const MODULE1_DETAIL: Record<Module1Shape, string> = {
  structured: "Module 1 is built to the agency's own headings",
  flat: "Module 1 leaves are filed flat under the agency's root element, not under its headings",
  placeholder: "Module 1 reuses another region's backbone structure as a placeholder",
};

const MODULE1_LABEL: Record<Module1Shape, string> = {
  structured: 'Structured Module 1',
  flat: 'Flat Module 1',
  placeholder: 'Placeholder Module 1',
};

/** The region profile's key for a canonical region (region-profile-service.ts REGION_MAP). */
const PROFILE_KEY: Partial<Record<CanonicalRegion, string>> = { US: 'fda', EU: 'eu', JP: 'jp' };

/** The registered filing for (agency, application type), or null. */
function registryEntryFor(agency: string, applicationType: string): RegulatoryApplicationType | null {
  const want = applicationType.trim().toUpperCase();
  const bridged = resolveToRegistryEntry(want as never) as RegulatoryApplicationType | null | undefined;
  if (bridged && bridged.agency === agency) return bridged;
  return getByAgency(agency as never).find((e) => e.applicationType.toUpperCase() === want) ?? null;
}

/** The channel, judged against the adapters' own refusals. */
export function channelSupportFor(entry: RegulatoryApplicationType | null): { state: ChannelState; detail: string; channel: string | null } {
  if (!entry) return { state: 'none', detail: 'no filing of this type is registered for this agency, so no channel is on record', channel: null };
  const ch = submissionChannelFor(entry);
  switch (ch.kind) {
    case 'portal':
      return { state: 'portal', detail: `${ch.channel}: a web portal the applicant uses`, channel: ch.channel };
    case 'unconnected':
      return { state: 'applicant_uploads', detail: `${ch.reason}. ${ch.applicantStep}`, channel: ch.channel };
    case 'none':
      return { state: 'none', detail: 'its region has no gateway identity, so no channel is on record', channel: null };
    case 'gateway': {
      const name = `${ch.region}:${ch.name}`;
      if (ch.region === 'pmda') return { state: 'refused', detail: PMDA_PROTOCOL_UNVERIFIED, channel: name };
      if (ch.region === 'fda' && ch.name === 'esg') return { state: 'unproven', detail: FDA_ESG_NOT_PROVEN, channel: name };
      if (ch.region === 'ema') return { state: 'unproven', detail: `the ${name} adapter is wired and nothing has been accepted through it`, channel: name };
      if (ch.region === 'ca') return { state: 'none', detail: HEALTH_CANADA_NO_TRANSPORT, channel: name };
      return { state: 'none', detail: ADAPTER_UNSOURCED, channel: name };
    }
  }
}

/** The canonical region a market names: an agency, a region code or a submission
 *  region, with 'Health Canada' and 'health-canada' read as 'Health_Canada'. */
function regionOfMarket(market: string): CanonicalRegion | null {
  return canonicalRegionOf(market) ?? canonicalRegionOf(market.trim().replace(/[\s-]+/g, '_')) ?? null;
}

/** How Module 1 is built for an agency or region, or null when it names no region. */
export function module1ShapeForAgency(market: string): Module1Shape | null {
  const region = regionOfMarket(market);
  return region ? module1ShapeOf(REGION_IDENTITY[region].gatewaySlug) : null;
}

/** How Module 1 is built for an agency, with the sentence that says so, or null. */
export function module1StatementForAgency(market: string): { shape: Module1Shape; detail: string } | null {
  const shape = module1ShapeForAgency(market);
  return shape ? { shape, detail: MODULE1_DETAIL[shape] } : null;
}

/** A channel the platform cannot send through. Only an unproven, wired gateway is not this. */
export const NO_CHANNEL_STATES: ReadonlySet<ChannelState> = new Set(['applicant_uploads', 'portal', 'refused', 'none']);

function channelLine(channel: { state: ChannelState; detail: string; channel: string | null }): string {
  switch (channel.state) {
    case 'unproven': return `Transmit not proven: ${channel.detail}`;
    case 'applicant_uploads': return `Applicant uploads through the ${channel.channel}`;
    case 'portal': return `${(channel.channel ?? 'Portal').split(' — ')[0]} portal only`;
    case 'refused': return `Not sent: ${channel.detail}`;
    case 'none': return 'No channel';
  }
}

type Base = Pick<MarketSupport, 'applicationType' | 'market' | 'region' | 'agency'>;
type Identity = (typeof REGION_IDENTITY)[CanonicalRegion];
type JudgedChannel = ReturnType<typeof channelSupportFor>;

/**
 * An agency that names a region without being that region's own agency
 * (added 2026-10-08, F19b review).
 *
 * The EU device lane: an MDR or IVDR technical file, or a clinical evaluation
 * report, is assessed by a Notified Body, not by the EMA. The catalog names the
 * agency 'EU / Notified Body' (filing-catalog.ts AGENCY_LABEL), and neither the
 * region identity nor AGENCY_TO_CODE knows that string, so every such filing
 * read "Refused at creation" and the EU MDR/IVDR lane had no way in, while its
 * packs exist (mdr:ema, ivdr:ema, cer:ema). Those packs are keyed 'ema' by
 * their own migration's choice (migrations/20260810b, "WHY agency 'ema'": the
 * c2c_documents agency CHECK has no Notified Body value), so a Notified Body
 * filing of those three classes reads the 'ema' outline. The statement still
 * names the Notified Body, and its channel is judged from the Notified Body's
 * own registered filings. Any other class at a Notified Body has no outline:
 * a Notified Body takes no NDA or MAA.
 */
const NOTIFIED_BODY = {
  keys: new Set(['notified_body', 'eu_notified_body', 'nb']),
  region: 'EU' as CanonicalRegion,
  agency: 'Notified_Body',
  documentAgency: 'EMA',
  docTypes: new Set(['mdr', 'ivdr', 'cer']),
};

const marketKey = (market: string) => market.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** The market's region, identity and agency code, from whatever the caller named it. */
function identify(input: MarketInput): { base: Base; identity: Identity | null; agencyCode: string | null } {
  const applicationType = String(input.applicationType ?? '').trim();
  const market = String(input.market ?? '').trim();
  if (NOTIFIED_BODY.keys.has(marketKey(market))) {
    const docType = PROGRAM_TO_DOC_TYPE[applicationType.toLowerCase()] ?? null;
    const agencyCode = docType && NOTIFIED_BODY.docTypes.has(docType)
      ? AGENCY_TO_CODE[NOTIFIED_BODY.documentAgency] ?? null
      : null;
    return {
      base: { applicationType, market, region: NOTIFIED_BODY.region, agency: NOTIFIED_BODY.agency },
      identity: REGION_IDENTITY[NOTIFIED_BODY.region],
      agencyCode,
    };
  }
  const region = regionOfMarket(market);
  const identity = region ? REGION_IDENTITY[region] : null;
  const agencyCode = identity ? AGENCY_TO_CODE[identity.agency.toUpperCase().replace(/[\s-]+/g, '_')] ?? null : null;
  return { base: { applicationType, market, region, agency: identity?.agency ?? null }, identity, agencyCode };
}

/**
 * The agency name the document class should be resolved from for a market, so
 * project creation scaffolds against the market the verdict judged: 'us' and
 * 'US' read as 'FDA', 'eu' as 'EMA', and a Notified Body device filing as
 * 'EMA' (its packs' key, above). Null when the market names no region, or a
 * Notified Body is asked for a class it does not assess; the caller then keeps
 * what it was given and the class stays unmapped.
 */
export function documentAgencyFor(input: MarketInput): string | null {
  const { base, identity, agencyCode } = identify(input);
  if (!identity || !agencyCode) return null;
  return base.agency === NOTIFIED_BODY.agency ? NOTIFIED_BODY.documentAgency : identity.agency;
}

/** Refused at creation: the agency is one the platform maps to no governed class. */
function unmappedSupport(base: Base, identity: Identity | null): MarketSupport {
  const nbClass = base.agency === NOTIFIED_BODY.agency && PROGRAM_TO_DOC_TYPE[base.applicationType.toLowerCase()];
  const reason = nbClass
    ? `A Notified Body assesses EU MDR and IVDR technical documentation and clinical evaluation reports; it takes no ${applicationName(base.applicationType)}.`
    : describeUnmappedClass(base.applicationType, base.agency ?? identity?.agency ?? base.market);
  const shape = identity ? module1ShapeOf(identity.gatewaySlug) : null;
  const line = `Refused at creation: ${reason}`;
  return {
    ...base,
    outline: { state: 'unmapped', pack: null, detail: reason },
    module1: { state: shape, detail: shape ? MODULE1_DETAIL[shape] : 'no region' },
    regionProfile: false,
    channel: { state: 'none', detail: 'the market is refused at creation' },
    summary: 'Unmapped',
    line,
    buildable: false,
    offered: false,
    offer: offerOf('not_offered', `${line.replace(/\.$/, '')}.`),
  };
}

/**
 * The agency's own pack, never a neighbour's; then the harmonised ICH baseline,
 * which is no jurisdiction (document-class.ts AGENCY_FALLBACKS).
 *
 * 2026-10-08 (F19b): the fallback is the scaffolder's own order
 * (scaffold-project-documents.ts tries [agency, ...AGENCY_FALLBACKS]). Without
 * it a master file (dmf → mod3) read "No outline" here while project creation
 * bound it to mod3:ich, and the two disagreed about the same filing.
 */
function outlineFor(docType: string | null, agencyCode: string, applicationType: string, packs: ActiveRulePacks): MarketSupport['outline'] {
  let pack: { version: string; label: string } | null = null;
  for (const candidate of docType ? [agencyCode, ...AGENCY_FALLBACKS] : []) {
    pack = packs.find(docType as string, candidate);
    if (pack) break;
  }
  if (pack) return { state: 'outline', pack, detail: `governed outline ${pack.label} (${pack.version})` };
  return {
    state: 'no_outline',
    pack: null,
    detail: docType
      ? `no rule pack defines '${docType}' for '${agencyCode}'`
      : `the application type '${applicationType}' has no governed document class`,
  };
}

/** PMDA takes only eCTD v4.0 for new applications from the dated fact's effective date. */
function pmdaNewApplicationsBlocked(code: CanonicalRegion, asOf: string): boolean {
  if (code !== 'JP') return false;
  const fact = pmdaEctdV4Fact(asOf);
  return !!fact && fact.status === 'in_force' && asOf >= fact.effectiveDate;
}

function lineFor(outline: MarketSupport['outline'], ch: JudgedChannel, pmdaBlocked: boolean): string {
  if (pmdaBlocked) return 'New applications blocked: eCTD v4.0 required';
  if (outline.state === 'outline') return channelLine(ch);
  return `No outline; ${NO_CHANNEL_STATES.has(ch.state) ? 'no channel' : channelLine(ch)}`;
}

function summaryFor(outline: MarketSupport['outline'], shape: Module1Shape, ch: JudgedChannel): string {
  const noChannel = NO_CHANNEL_STATES.has(ch.state) ? ', no channel' : '';
  return outline.state === 'outline' ? `${MODULE1_LABEL[shape]}${noChannel}` : `No outline${noChannel}`;
}

/**
 * The statement for one market. `asOf` (YYYY-MM-DD) dates the facts that change
 * with time, today PMDA's end of eCTD v3.2.2 for new applications.
 */
export function marketSupport(input: MarketInput, packs: ActiveRulePacks, asOf: string = new Date().toISOString().slice(0, 10)): MarketSupport {
  const { base, identity, agencyCode } = identify(input);
  if (!identity || !agencyCode) return unmappedSupport(base, identity);
  const { applicationType } = base;

  const docType = PROGRAM_TO_DOC_TYPE[applicationType.toLowerCase()] ?? null;
  const shape = module1ShapeOf(identity.gatewaySlug);
  const regionProfile = getSubmissionRegionProfile(PROFILE_KEY[identity.code] ?? identity.code.toLowerCase()) != null;
  const entry = registryEntryFor(base.agency ?? identity.agency, applicationType);
  const ch = channelSupportFor(entry);
  const pmdaBlocked = pmdaNewApplicationsBlocked(identity.code, asOf);
  const continuing = input.continuingLifecycle === true;
  const shared = { ...base, module1: { state: shape, detail: MODULE1_DETAIL[shape] }, regionProfile, channel: { state: ch.state, detail: ch.detail } };

  // The UK has no IND. The ind:mhra pack exists and is mislabelled (FILING_SPINE.md §3).
  if (agencyCode === 'mhra' && docType === 'ind') {
    const mhra: Omit<MarketSupport, 'offer'> = {
      ...shared,
      outline: { state: 'no_outline', pack: null, detail: 'the ind:mhra rule pack is mislabelled: the UK has no IND' },
      summary: 'Not offered',
      line: 'Not offered: the UK has no IND, and the ind:mhra rule pack is mislabelled',
      buildable: false,
      offered: false,
    };
    return { ...mhra, offer: filingOfferFor(mhra, entry, pmdaBlocked, continuing) };
  }

  const outline = outlineFor(docType, agencyCode, applicationType, packs);
  const statement: Omit<MarketSupport, 'offer'> = {
    ...shared,
    outline,
    summary: summaryFor(outline, shape, ch),
    line: lineFor(outline, ch, pmdaBlocked),
    buildable: outline.state === 'outline' && shape === 'structured',
    offered: true,
  };
  return { ...statement, offer: filingOfferFor(statement, entry, pmdaBlocked, continuing) };
}

/**
 * The offer for one market whose outline the caller has already resolved
 * through rule-pack-lookup.ts, in the scaffolder's order ([agency,
 * ...AGENCY_FALLBACKS], as outlineFor reads it). Project creation uses it so the
 * pack is read once, by the scaffold that binds it, and not again here:
 *   - before anything is written, with `outlineFound: true`, a refusal that no
 *     pack could lift (an unmapped agency, an MHRA "IND", a new Japanese
 *     application) is final; an outline only ever raises the offer;
 *   - after the scaffold, with `outlineFound: false` when it found no pack, the
 *     filing has nothing to author and is not offered.
 * Only the offer is returned: its tier and reason never read the pack's label
 * or version, so none is invented here.
 */
export function marketOfferGivenOutline(input: MarketInput, outlineFound: boolean, asOf?: string): FilingOffer {
  const resolved: ActiveRulePacks = {
    find: () => (outlineFound ? { version: 'resolved-by-caller', label: 'resolved-by-caller' } : null),
  };
  return marketSupport(input, resolved, asOf).offer;
}

/** The statement for each market, with the active packs read once. */
export async function readMarketSupport(
  client: RulePackQueryable,
  inputs: MarketInput[],
  asOf?: string,
): Promise<MarketSupport[]> {
  const rows = await listActiveRulePacks(client);
  const byKey = new Map(rows.map((r) => [`${r.doc_type}:${r.agency}`, { version: r.version, label: r.label }]));
  const packs: ActiveRulePacks = { find: (docType, agency) => byKey.get(`${docType}:${agency}`) ?? null };
  return inputs.map((input) => marketSupport(input, packs, asOf));
}
