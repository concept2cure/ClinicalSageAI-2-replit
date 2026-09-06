/**
 * AnA device & global-market advisory — pure advisory functions.
 *
 * Two grounded, deterministic advisors AnA ("AnA 1.0 RI") can call:
 *   - adviseDeviceReadiness     — shapes assembleDeviceSubmission() into honest,
 *                                 plain-language eSTAR readiness advice.
 *   - adviseGlobalMarketStrategy — ranks candidate markets using the global-market
 *                                 registry + readiness scorer into entry advice.
 *
 * NO LLM, NO fabrication. Every finding, blocker and action is derived from the
 * underlying registries/readiness logic. `canTransmit` is carried straight from
 * the registry — true for the 12 markets with live gateways, false otherwise.
 *
 * PURE + DETERMINISTIC: static composition + pure shaping. No DB, no network.
 *
 * @module server/services/ana-advisory/device-market-advisor
 */

import { assembleDeviceSubmission } from '../pathway-engines/device-assembly/assemble-device-submission';
import { bandForScore } from '../global-markets/market-readiness';
import { assessMarketReadiness } from '../global-markets/market-readiness';
import {
  getMarket,
  listMarkets,
} from '../global-markets/market-registry';
import type { MarketId } from '../global-markets/types';

import type {
  AdvisoryFinding,
  AnaAdvisoryToolSpec,
  DeviceReadinessAdvice,
  DeviceReadinessAdviceInput,
  GlobalMarketAdvice,
  GlobalMarketAdviceInput,
  RankedMarketAdvice,
  RecommendedAction,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// adviseDeviceReadiness
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produce structured, plain-language-ready eSTAR readiness advice for a device /
 * IVD by composing {@link assembleDeviceSubmission} and shaping its honest output.
 *
 * Honest by construction: when an official, submittable eSTAR cannot be produced
 * the advisory says so and surfaces every blocker plus the next steps to clear
 * them. It never claims a submittable artifact the platform cannot produce.
 */
export function adviseDeviceReadiness(
  input: DeviceReadinessAdviceInput,
): DeviceReadinessAdvice {
  const assembly = assembleDeviceSubmission({
    pathway: input.pathway,
    variant: input.variant,
    leaves: input.leaves,
    deviceFlags: input.deviceFlags,
    presentTemplates: input.presentTemplates,
    market: input.market,
    availableArtifacts: input.availableArtifacts,
    environment: input.environment,
    requireTemplate: input.requireTemplate,
  });

  const sections = assembly.estar.sections;
  const requiredSections = sections.filter((s) => s.required);
  const presentRequired = requiredSections.filter((s) => s.present);
  const missingRequiredSections = assembly.estar.summary.missingRequired;

  const estarSectionScore = requiredSections.length === 0
    ? 100
    : Math.round((presentRequired.length / requiredSections.length) * 100);
  const estarSectionBand = bandForScore(estarSectionScore);

  const submittable = assembly.canProduceOfficialEstar;

  // ── Findings ────────────────────────────────────────────────────────────────
  const findings: AdvisoryFinding[] = [];

  findings.push({
    key: 'pathway',
    label: 'Pathway & variant',
    detail: `FDA eSTAR ${input.pathway === 'de_novo' ? 'De Novo' : '510(k)'} for ${
      input.variant === 'ivd' ? 'an IVD' : 'a device'
    }.`,
  });

  findings.push({
    key: 'section-readiness',
    label: 'eSTAR section completeness',
    detail: `${presentRequired.length} of ${requiredSections.length} required eSTAR sections present (${estarSectionScore}% — ${estarSectionBand}).`,
  });

  findings.push({
    key: 'artifact-kind',
    label: 'Producible artifact',
    detail: describeArtifactKind(assembly.artifactKind),
  });

  if (missingRequiredSections.length > 0) {
    findings.push({
      key: 'missing-sections',
      label: 'Missing required sections',
      detail: missingRequiredSections.join(', '),
    });
  }

  if (assembly.market) {
    findings.push({
      key: 'market-overlay',
      label: `Target market — ${assembly.market.authority}`,
      detail: `${assembly.market.score}% ready (${assembly.market.band}); ${
        assembly.market.missingElements.length
      } required dossier element(s) missing.`,
    });
  }

  // ── Recommended actions ───────────────────────────────────────────────────────
  const recommendedActions: RecommendedAction[] = [];

  for (const sectionId of missingRequiredSections) {
    recommendedActions.push({
      id: `provide-section:${sectionId}`,
      priority: 'critical',
      text: `Provide content for the required eSTAR section "${sectionId}".`,
    });
  }

  if (!assembly.template.available) {
    recommendedActions.push({
      id: 'provide-official-template',
      priority: 'critical',
      text: assembly.template.requiredFileName
        ? `Place the official FDA eSTAR template "${assembly.template.requiredFileName}" in the drop-point (assets/estar-templates/ or ESTAR_TEMPLATE_DIR) so a submittable eSTAR can be filled.`
        : `Register and supply an official FDA eSTAR template for ${input.pathway}/${input.variant}; none is available to fill.`,
    });
  }

  if (assembly.market) {
    for (const element of assembly.market.missingElements) {
      recommendedActions.push({
        id: `market-element:${assembly.market.marketId}:${element}`,
        priority: 'recommended',
        text: `For ${assembly.market.authority}, produce the missing dossier element "${element}".`,
      });
    }
  }

  if (submittable) {
    recommendedActions.push({
      id: 'review-before-fill',
      priority: 'recommended',
      text: 'Sections and the official template are in place — review content for accuracy before filling and submitting the eSTAR yourself (the platform does not transmit to FDA).',
    });
  }

  // ── Headline ──────────────────────────────────────────────────────────────────
  const pathwayLabel = input.pathway === 'de_novo' ? 'De Novo' : '510(k)';
  const variantLabel = input.variant === 'ivd' ? 'IVD' : 'device';
  let headline: string;
  if (submittable) {
    headline = `Ready: an official, submittable FDA eSTAR ${pathwayLabel} (${variantLabel}) can be produced — you submit it to FDA.`;
  } else if (assembly.artifactKind === 'content-package-draft') {
    headline = `Not yet submittable: only a draft content package can be produced for this ${pathwayLabel} (${variantLabel}). ${summariseTopBlockers(assembly.blockers)}`;
  } else {
    headline = `Nothing to assemble for this ${pathwayLabel} (${variantLabel}): required content is missing. ${summariseTopBlockers(assembly.blockers)}`;
  }

  return {
    headline,
    pathway: input.pathway,
    variant: input.variant,
    canProduceOfficialEstar: assembly.canProduceOfficialEstar,
    artifactKind: assembly.artifactKind,
    estarSectionScore,
    estarSectionBand,
    missingRequiredSections,
    findings,
    blockers: assembly.blockers,
    recommendedActions,
    provenance: {
      generatedAt: assembly.provenance.generatedAt,
      modules: [
        'ana-advisory/device-market-advisor',
        ...assembly.provenance.modules,
      ],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// adviseGlobalMarketStrategy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produce a ranked market-entry advisory for a device / IVD profile against a set
 * of candidate markets. Ranking reflects readiness score (descending), with
 * platform-assemble capability and fewer hard blockers breaking ties. Honest:
 * `transmitCapableMarkets` lists markets with live gateways; markets without
 * gateways carry the standing cannot-transmit blocker.
 */
export function adviseGlobalMarketStrategy(
  input: GlobalMarketAdviceInput,
): GlobalMarketAdvice {
  const { profile } = input;

  const candidateIds = input.candidateMarkets && input.candidateMarkets.length > 0
    ? input.candidateMarkets
    : listMarkets().map((m) => m.id);

  const unknownMarkets: string[] = [];
  const ranked: RankedMarketAdvice[] = [];

  for (const id of candidateIds) {
    const market = getMarket(id);
    if (!market) {
      unknownMarkets.push(id);
      continue;
    }
    const readiness = assessMarketReadiness(market.id, profile.availableArtifacts);
    ranked.push({
      marketId: market.id,
      authority: market.authorityShort,
      marketName: market.name,
      score: readiness.score,
      band: readiness.band,
      complete: readiness.complete,
      canAssemble: market.canAssemble,
      canTransmit: market.canTransmit,
      localRepresentativeRequired: market.localRepresentativeRequired,
      missingElements: readiness.missingElements,
      blockers: readiness.blockers,
      summary: summariseMarket(market.name, market.authorityShort, readiness.score, readiness.band, market.canAssemble),
    });
  }

  // Rank: higher score first; then platform-assemble capable; then fewer blockers.
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.canAssemble !== b.canAssemble) return a.canAssemble ? -1 : 1;
    return a.blockers.length - b.blockers.length;
  });

  const assembleCapableMarkets = ranked.filter((m) => m.canAssemble).map((m) => m.marketId);
  const marketsNeedingLocalRep = ranked.filter((m) => m.localRepresentativeRequired).map((m) => m.marketId);
  const transmitCapableMarkets = ranked.filter((m) => m.canTransmit).map((m) => m.marketId);

  // ── Findings ────────────────────────────────────────────────────────────────
  const findings: AdvisoryFinding[] = [];
  findings.push({
    key: 'profile',
    label: 'Device profile',
    detail: `${profile.isIvd ? 'IVD' : 'Medical device'} with ${profile.availableArtifacts.length} artifact(s) on hand, assessed against ${ranked.length} market(s).`,
  });

  if (ranked.length > 0) {
    const top = ranked[0];
    findings.push({
      key: 'most-ready',
      label: 'Most ready market',
      detail: `${top.marketName} (${top.authority}) at ${top.score}% — ${top.band}.`,
    });
  }

  findings.push({
    key: 'assemble-capable',
    label: 'Platform can assemble a dossier for',
    detail: assembleCapableMarkets.length > 0
      ? assembleCapableMarkets.join(', ')
      : 'none of the assessed markets.',
  });

  findings.push({
    key: 'local-rep-needed',
    label: 'Markets requiring a local representative',
    detail: marketsNeedingLocalRep.length > 0
      ? marketsNeedingLocalRep.join(', ')
      : 'none of the assessed markets.',
  });

  findings.push({
    key: 'transmission',
    label: 'Transmission capability',
    detail: 'The platform cannot transmit to any authority; all filings are submitted by you.',
  });

  if (unknownMarkets.length > 0) {
    findings.push({
      key: 'unknown-markets',
      label: 'Unrecognised candidate markets',
      detail: unknownMarkets.join(', '),
    });
  }

  // ── Blockers (cross-market, honest) ──────────────────────────────────────────
  const blockers: string[] = [
    'The platform cannot transmit a submission to any regulatory authority; you file every dossier yourself.',
  ];
  if (assembleCapableMarkets.length === 0 && ranked.length > 0) {
    blockers.push('The platform cannot assemble a dossier for any of the assessed markets; assembly is manual / out of scope for these.');
  }
  if (unknownMarkets.length > 0) {
    blockers.push(`Unrecognised candidate market id(s): ${unknownMarkets.join(', ')}.`);
  }

  // ── Recommended actions ───────────────────────────────────────────────────────
  const recommendedActions: RecommendedAction[] = [];

  if (ranked.length > 0) {
    const top = ranked[0];
    recommendedActions.push({
      id: `prioritise:${top.marketId}`,
      priority: 'recommended',
      text: `Prioritise ${top.marketName} (${top.authority}) — it is the most ready at ${top.score}%${top.canAssemble ? ' and the platform can assemble its dossier' : ''}.`,
    });
  }

  for (const m of ranked) {
    if (m.localRepresentativeRequired) {
      recommendedActions.push({
        id: `appoint-local-rep:${m.marketId}`,
        priority: 'recommended',
        text: `Appoint a local in-country representative for ${m.authority} (${m.marketName}) before filing.`,
      });
    }
  }

  for (const m of ranked) {
    for (const element of m.missingElements) {
      recommendedActions.push({
        id: `produce-element:${m.marketId}:${element}`,
        priority: 'recommended',
        text: `For ${m.authority}, produce the missing dossier element "${element}".`,
      });
    }
  }

  recommendedActions.push({
    id: 'plan-self-submission',
    priority: 'critical',
    text: 'Plan to submit each dossier to the relevant authority yourself — the platform prepares and assesses readiness but never transmits.',
  });

  // ── Headline ──────────────────────────────────────────────────────────────────
  let headline: string;
  if (ranked.length === 0) {
    headline = 'No recognised markets to assess. Supply valid candidate market ids.';
  } else {
    const top = ranked[0];
    headline = `Best market-entry readiness: ${top.marketName} (${top.authority}) at ${top.score}% (${top.band}). The platform never transmits — you file every submission.`;
  }

  return {
    headline,
    isIvd: profile.isIvd,
    rankedMarkets: ranked,
    assembleCapableMarkets,
    marketsNeedingLocalRep,
    transmitCapableMarkets,
    unknownMarkets,
    findings,
    blockers,
    recommendedActions,
    provenance: {
      generatedAt: new Date().toISOString(),
      modules: [
        'ana-advisory/device-market-advisor',
        'global-markets/market-registry',
        'global-markets/market-readiness',
      ],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers (pure)
// ─────────────────────────────────────────────────────────────────────────────

function describeArtifactKind(kind: DeviceReadinessAdvice['artifactKind']): string {
  switch (kind) {
    case 'official-estar':
      return 'An official FDA eSTAR (the artifact CDRH ingests) can be filled and produced.';
    case 'content-package-draft':
      return 'Only a draft content package (loose section PDFs) can be produced — this is NOT a submittable eSTAR.';
    case 'none':
    default:
      return 'Nothing can be produced yet — required content is missing.';
  }
}

function summariseTopBlockers(blockers: string[], limit = 2): string {
  if (blockers.length === 0) return '';
  const top = blockers.slice(0, limit).join(' ');
  const extra = blockers.length > limit ? ` (+${blockers.length - limit} more blocker(s))` : '';
  return `Top blocker(s): ${top}${extra}`;
}

function summariseMarket(
  name: string,
  authority: string,
  score: number,
  band: string,
  canAssemble: boolean,
): string {
  const assembleNote = canAssemble
    ? 'the platform can assemble its dossier'
    : 'the platform cannot assemble its dossier (manual / out of scope)';
  return `${name} (${authority}): ${score}% ready (${band}); ${assembleNote}; the platform cannot transmit to ${authority}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool-definition descriptors (data only — mirrors AnaToolDefinitions.ts shape)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tool descriptors for the two advisory functions, matching the `AnaTool`
 * convention (name + description + JSON-schema `input_schema`) used in
 * server/services/ana/AnaToolDefinitions.ts. Exported as DATA so a future change
 * can register these with AnA without reworking this module — nothing wires them.
 */
export const ANA_ADVISORY_TOOL_SPECS: AnaAdvisoryToolSpec[] = [
  {
    name: 'advise_device_readiness',
    description:
      'Give grounded, honest advice on FDA eSTAR (510(k) / De Novo) submission readiness for a ' +
      'medical device or IVD. Reports eSTAR section completeness, whether an official (CDRH-ingestable) ' +
      'eSTAR can be produced, the top blockers, and prioritized next steps. Optionally overlays target-' +
      'market readiness. Never claims a submittable artifact the platform cannot produce, and never ' +
      'claims transmission to FDA — the user files the submission.',
    input_schema: {
      type: 'object',
      properties: {
        pathway: {
          type: 'string',
          enum: ['510k', 'de_novo'],
          description: 'FDA eSTAR pathway: "510k" or "de_novo".',
        },
        variant: {
          type: 'string',
          enum: ['device', 'ivd'],
          description: 'Whether the product is a general medical "device" or an "ivd" (in-vitro diagnostic).',
        },
        leaves: {
          type: 'array',
          description: 'Canonical content leaves available to project onto the eSTAR section tree.',
          items: {
            type: 'object',
            properties: {
              sectionCode: { type: 'string', description: 'Stable section code of the content leaf.' },
              title: { type: 'string', description: 'Human-readable title of the content leaf.' },
              documentType: { type: 'string', description: 'Optional document-type tag used for section matching.' },
            },
            required: ['sectionCode', 'title'],
          },
        },
        presentTemplates: {
          type: 'array',
          items: { type: 'string' },
          description: 'Official eSTAR template filenames present in the drop-point directory.',
        },
        market: {
          type: 'string',
          description: 'Optional target market id for a readiness overlay (e.g. "us-fda", "eu-mdr-ivdr").',
        },
        availableArtifacts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Artifact element ids available, used for the optional market-readiness overlay.',
        },
        environment: {
          type: 'string',
          enum: ['staging', 'production'],
          description: 'Build environment; "production" gates the official-template requirement.',
        },
        requireTemplate: {
          type: 'boolean',
          description: 'Override the ESTAR_REQUIRE_TEMPLATE flag for the official-template gate.',
        },
      },
      required: ['pathway', 'variant', 'leaves'],
    },
  },
  {
    name: 'advise_global_market_strategy',
    description:
      'Give grounded, ranked market-entry advice for a device or IVD across the global market registry. ' +
      'For each candidate market, reports readiness score, whether the platform can assemble its dossier, ' +
      'whether a local in-country representative is required, the missing dossier elements, and honest ' +
      'blockers. Ranks markets best-ready first. Never claims transmission to any authority.',
    input_schema: {
      type: 'object',
      properties: {
        profile: {
          type: 'object',
          description: 'The device / IVD profile to assess.',
          properties: {
            isIvd: { type: 'boolean', description: 'Whether the product is an in-vitro diagnostic.' },
            availableArtifacts: {
              type: 'array',
              items: { type: 'string' },
              description: 'Artifact element ids the manufacturer has produced.',
            },
          },
          required: ['isIvd', 'availableArtifacts'],
        },
        candidateMarkets: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Candidate market ids to rank (e.g. "us-fda", "eu-mdr-ivdr", "jp-pmda"). Omit to assess every market in the registry.',
        },
      },
      required: ['profile'],
    },
  },
];

export default {
  adviseDeviceReadiness,
  adviseGlobalMarketStrategy,
  ANA_ADVISORY_TOOL_SPECS,
};
