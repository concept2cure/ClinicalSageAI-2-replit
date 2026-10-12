/**
 * The pathway positions a sponsor can take, in one governed place
 * (founder's directive, 2026-10-12).
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * "Which pathway are you on?" had four answers, depending on where it was
 * asked:
 *
 *   global-document-registry GLOBAL_REGISTRY   the authoritative id space:
 *       234 filings with region, agency, segment, format and validation
 *       profile. It knows US_505B2 is not US_NDA and US_DE_NOVO_IVD is not
 *       US_510K. It does not say what choosing one commits you to.
 *   modality.ts MODALITY_FRAME[*].pathways     which statutory pathways apply
 *       to a modality, default first, with the fee programme. Drugs and
 *       biologics only, and named in its own words ('NDA 505(b)(2)').
 *   types/submission-constants APPLICATION_TYPES
 *       nine bare labels, drug and device mixed, no domain awareness.
 *   intelligence-questions/flows/project-setup.ts
 *       two more hand-written lists — `submission_type` (ten) and
 *       `device_submission_pathway` (seven, which conflates the three 510(k)
 *       flavours with distinct pathways and omits exempt and 513(g)).
 *
 * So the person answering AnA's interview saw a list that matched neither the
 * registry the platform files against nor the frame it reasons with, and none
 * of them said what taking a position commits the programme to.
 *
 * ── What this module is, and is not ─────────────────────────────────────────
 * It is NOT a fifth list. The positions ARE registry entries: this module
 * holds, per registry id, what taking that position commits the programme to
 * and the authority that makes it a position. Two tests keep it honest in both
 * directions — a filing the registry gains cannot reach a person as a bare
 * label, and an annotation for an id the registry does not hold is an orphan.
 *
 * For a drug or biologic the ORDER and AVAILABILITY come from
 * `MODALITY_FRAME`, which is modality-aware where the registry is not; a
 * bridge maps its pathway names onto registry ids, and a test holds that every
 * one of them resolves. That bridge is the first thing in the codebase that
 * checks those two governed modules against each other.
 *
 * ── What is deliberately absent ─────────────────────────────────────────────
 * Japan, Health Canada, NMPA and the rest: the registry holds their filings,
 * but nobody has written what those positions commit a sponsor to, and
 * guessing would be worse than a person writing it themselves. A pair this
 * module holds nothing for returns nothing, so a caller must say so rather
 * than draw an empty question or offer the wrong regulator's routes.
 *
 * `EU_MDR_TECHDOC` and `EU_IVDR` are not positions: they are the technical
 * documentation every class route produces, not a choice between routes. The
 * class entries carry the route's meaning.
 *
 * ── Marking, not hiding ─────────────────────────────────────────────────────
 * A position the programme's own answers contradict is MARKED and still
 * offered (`cautionFor`, {@link ProgrammeFacts}). The reasoning is in
 * `PositionAvailability`; the line this module draws is:
 *
 *   the DOMAIN decides which positions exist — a monoclonal antibody is
 *   licensed under section 351 and the modality frame does not offer it an
 *   NDA, because that is which statute governs the product, not a judgement
 *   about this programme;
 *   the programme's own FACTS decide which of those carry a caution — and a
 *   caution is a mark on an offered position, never its removal.
 *
 * An absent fact is not a contradiction. A rule fires only on something the
 * person has actually said, so an interview that has not reached the question
 * yet produces no cautions at all.
 *
 * @module shared/regulatory/pathway-positions
 */

import type { PositionCaution } from '../types/intelligence-questions.js';
import { agencyFor } from './agency-positions.js';
import { getApplicationType } from './global-document-registry.js';
import { canonicalRegionOf, type CanonicalRegion } from './region-identity.js';
import { MODALITIES, MODALITY_FRAME, type Modality } from './modality.js';

/** The regulator a position is taken in front of. */
export type PathwayRegion = 'US' | 'EU';

/** What kind of product the question is about. The registry's own segments. */
export type PathwayDomain = 'pharma_biotech' | 'medical_devices' | 'diagnostics_ivd';

export interface PathwayPosition {
  /** The registry id. Stable, and the thing a project is configured from. */
  value: string;
  /** The registry's own display name, so the question and the filing agree. */
  label: string;
  /** What taking this position commits the programme to. Consequence first. */
  commits: string;
  /** The part, section or annex that makes this a position rather than a preference. */
  authority: string;
  /**
   * False where the position is not a route to market: a classification
   * request, a meeting, a waiver application. A person taking one still needs
   * a marketing route afterwards, and the copy says so.
   */
  marketingRoute: boolean;
}

interface PositionMeaning {
  commits: string;
  authority: string;
  marketingRoute: boolean;
}

/**
 * What each registry filing commits a programme to, and its authority. Keyed
 * by registry id. Nothing here is written by a model, and nothing here invents
 * a filing: every key must resolve in `GLOBAL_REGISTRY`.
 */
const POSITION_MEANING: Readonly<Record<string, PositionMeaning>> = {
  /* ── Drugs and biologics, FDA ─────────────────────────────────────────── */
  US_IND: {
    commits:
      'Permission to study the product in people, not to market it. The 30-day review starts a clinical hold clock, and every later amendment files into the same application.',
    authority: '21 CFR 312.20; FD&C Act 505(i)',
    marketingRoute: false,
  },
  US_NDA: {
    commits:
      'A full application on investigations you conducted or have a right of reference to. You owe the complete nonclinical and clinical package.',
    authority: '21 CFR 314.50; FD&C Act 505(b)(1)',
    marketingRoute: true,
  },
  US_505B2: {
    commits:
      'Reliance on published literature or another sponsor’s approved application, with bridging data for every difference you did not study. It changes what you must justify, not how much.',
    authority: '21 CFR 314.54; FD&C Act 505(b)(2)',
    marketingRoute: true,
  },
  US_ANDA: {
    commits:
      'Sameness to a reference listed drug: no clinical efficacy programme, and bioequivalence with identical labelling carries the application.',
    authority: '21 CFR 314.94; FD&C Act 505(j)',
    marketingRoute: true,
  },
  US_BLA: {
    commits:
      'A standalone biologics licence on your own data, licensing the product and its manufacture together — so the process and its comparability record are part of the application, not an annex to it.',
    authority: 'PHS Act 351(a); 21 CFR 601.2',
    marketingRoute: true,
  },
  US_351K: {
    commits:
      'Biosimilarity to a licensed reference product: analytical similarity leads, and the clinical programme exists to resolve residual uncertainty rather than to re-establish efficacy.',
    authority: 'PHS Act 351(k); 21 CFR 601.2',
    marketingRoute: true,
  },
  US_ACCEL_APPROVAL: {
    commits:
      'Approval on a surrogate or intermediate endpoint reasonably likely to predict benefit, with a confirmatory trial underway and withdrawal procedures if it does not confirm.',
    authority: '21 CFR 314 Subpart H / 601 Subpart E; FD&C Act 506(c)',
    marketingRoute: true,
  },

  /* ── Devices, FDA ─────────────────────────────────────────────────────── */
  US_510K: {
    commits:
      'Substantial equivalence to a predicate you name: the comparison carries the submission, and a difference in technology or indication you cannot bridge to that predicate takes you off this route.',
    authority: '21 CFR 807 Subpart E; FD&C Act 510(k)',
    marketingRoute: true,
  },
  US_DE_NOVO: {
    commits:
      'No predicate: you are asking FDA to classify the device, and you propose the special controls it will be held to — yours and every later sponsor’s.',
    authority: '21 CFR 860 Subpart D; FD&C Act 513(f)(2)',
    marketingRoute: true,
  },
  US_PMA: {
    commits:
      'Valid scientific evidence of safety and effectiveness in its own right, normally a clinical investigation, plus a manufacturing inspection before approval.',
    authority: '21 CFR 814; FD&C Act 515',
    marketingRoute: true,
  },
  US_HDE: {
    commits:
      'A humanitarian exemption for a condition affecting few patients: you must show safety and probable benefit rather than effectiveness, and use is tied to the exemption’s conditions.',
    authority: '21 CFR 814 Subpart H; FD&C Act 520(m)',
    marketingRoute: true,
  },
  US_EUA: {
    commits:
      'Authorisation only while a declared emergency lasts, on known and potential benefits outweighing risks. It is not a clearance or an approval, and it ends with the declaration.',
    authority: 'FD&C Act 564',
    marketingRoute: true,
  },
  US_IDE: {
    commits:
      'Permission to use an unapproved device in a clinical investigation, not to market it. It carries the investigation’s own reporting and record obligations.',
    authority: '21 CFR 812; FD&C Act 520(g)',
    marketingRoute: false,
  },
  US_513G: {
    commits:
      'FDA’s view on how the device is classified and what applies to it. It clears nothing and approves nothing: a marketing route is still to be chosen afterwards.',
    authority: 'FD&C Act 513(g); 21 CFR 860.123',
    marketingRoute: false,
  },
  US_QSUB: {
    commits:
      'FDA’s written feedback before you file — on a predicate, a protocol or a test plan. Advice, not agreement: it binds neither side, though departing from it invites the question why.',
    authority: 'FD&C Act 515B/513(a); the Q-Submission Program guidance',
    marketingRoute: false,
  },

  /* ── Diagnostics and IVDs, FDA ────────────────────────────────────────── */
  US_510K_IVD: {
    commits:
      'Substantial equivalence for an IVD: the predicate comparison carries it, and the performance claims you make are the ones you must have supported.',
    authority: '21 CFR 807 Subpart E; 21 CFR 809',
    marketingRoute: true,
  },
  US_DE_NOVO_IVD: {
    commits:
      'No predicate assay: FDA classifies the test and you propose its special controls, including the performance characteristics every later test of that type will be held to.',
    authority: '21 CFR 860 Subpart D; FD&C Act 513(f)(2)',
    marketingRoute: true,
  },
  US_PMA_IVD: {
    commits:
      'Approval on your own clinical and analytical performance evidence, with a manufacturing inspection — the usual route for a Class III assay.',
    authority: '21 CFR 814; 21 CFR 809',
    marketingRoute: true,
  },
  US_EUA_IVD: {
    commits:
      'Authorisation only while a declared emergency lasts. It is neither a clearance nor an approval, and a transition plan is needed before the declaration ends.',
    authority: 'FD&C Act 564',
    marketingRoute: true,
  },
  US_CLIA_WAIVER: {
    commits:
      'A waiver decides where the test may be run, not whether it may be sold: it needs accuracy in untrained hands, and it rides on a clearance you still have to obtain.',
    authority: '42 USC 263a (CLIA); FD&C Act 510(k) dual submission',
    marketingRoute: false,
  },
  US_CDX_PMA: {
    commits:
      'A test whose result decides a therapeutic decision, approved with the drug’s claim: its development is tied to the drug’s programme and its labelling to the drug’s label.',
    authority: '21 CFR 814; the In Vitro Companion Diagnostic Devices guidance',
    marketingRoute: true,
  },
  US_CDX_510K: {
    commits:
      'A companion claim reached by substantial equivalence rather than approval — available only where a predicate already carries that use.',
    authority: '21 CFR 807 Subpart E; the In Vitro Companion Diagnostic Devices guidance',
    marketingRoute: true,
  },
  US_LDT: {
    commits:
      'A test designed, manufactured and used within one certified high-complexity laboratory. FDA’s enforcement position on these changed in 2024 and has been challenged, so treat the premarket obligation as unsettled and confirm it before relying on this route.',
    authority: '21 CFR 809; 42 CFR 493 (CLIA)',
    marketingRoute: true,
  },

  /* ── Devices and IVDs, EU ─────────────────────────────────────────────── */
  /* -- Medicines, EU --------------------------------------------------- */
  EU_MAA: {
    commits:
      'A marketing authorisation for the whole Union through the centralised procedure: one dossier, one CHMP opinion, and the EU risk-management plan and paediatric obligations with it.',
    authority: 'Regulation (EC) 726/2004; Directive 2001/83/EC Art 8(3)',
    marketingRoute: true,
  },
  EU_CMA: {
    commits:
      'Authorisation on less complete data where the unmet need justifies it, with specific obligations to complete and annual renewal until they are met.',
    authority: 'Regulation (EC) 507/2006; Regulation (EC) 726/2004 Art 14-a',
    marketingRoute: true,
  },
  EU_BIOSIMILAR_MAA: {
    commits:
      'Biosimilarity to a reference medicinal product authorised in the EEA: the comparability exercise carries the dossier, and extrapolation across indications must be justified.',
    authority: 'Directive 2001/83/EC Art 10(4); EMA biosimilar guidelines',
    marketingRoute: true,
  },
  EU_GENERIC_DCP: {
    commits:
      'A generic application run through the decentralised procedure: one reference member state leads and the concerned states recognise it, so national questions arrive late and in parallel.',
    authority: 'Directive 2001/83/EC Art 10(1), Art 28(3)',
    marketingRoute: true,
  },

  /* -- Devices, EU: the class decides the conformity route -------------- */
  EU_MDR_CLASS_I: {
    commits:
      'You declare conformity yourself and hold the technical documentation. Sterile, measuring or reusable-surgical devices still need a notified body for those aspects alone.',
    authority: 'MDR (EU) 2017/745 Art 52(7), Annexes II and III',
    marketingRoute: true,
  },
  EU_MDR_CLASS_IIA: {
    commits:
      'A notified body audits the quality management system and assesses the technical documentation of at least one representative device per category (Annex IX), or examines the type and verifies production instead (Annex X with XI).',
    authority: 'MDR Art 52(6), Annexes IX to XI',
    marketingRoute: true,
  },
  EU_MDR_CLASS_IIB: {
    commits:
      'As Class IIa, but technical documentation is assessed per generic device group, and implantable Class IIb devices are assessed device by device.',
    authority: 'MDR Art 52(4) to (5), Annexes IX to XI',
    marketingRoute: true,
  },
  EU_MDR_CLASS_III: {
    commits:
      'Full notified-body assessment of the quality system and of the technical documentation for each device, with a clinical evaluation consultation procedure for implantables and an expert panel view where one applies.',
    authority: 'MDR Art 52(3), Art 54, Annexes IX to XI',
    marketingRoute: true,
  },

  /* -- Diagnostics, EU -------------------------------------------------- */
  EU_IVDR_CLASS_A: {
    commits:
      'You declare conformity yourself. A Class A device that is sterile needs a notified body for the sterility aspects alone.',
    authority: 'IVDR (EU) 2017/746 Art 48(10), Annexes II and III',
    marketingRoute: true,
  },
  EU_IVDR_CLASS_B: {
    commits:
      'A notified body audits the quality management system and assesses the technical documentation of at least one device per category, with the performance evaluation carrying the claim.',
    authority: 'IVDR Art 48(7), Annex IX',
    marketingRoute: true,
  },
  EU_IVDR_CLASS_CD: {
    commits:
      'Technical documentation assessed per generic device group, and for Class D an EU reference laboratory verifies performance against common specifications with batch verification - the longest route to market under the IVDR.',
    authority: 'IVDR Art 48(3) to (6), Art 49, Annex IX Section 4.4',
    marketingRoute: true,
  },
  EU_CDX_IVDR_D: {
    commits:
      'A companion diagnostic is Class C or D under the IVDR, and its notified body must consult the EMA or the medicine\u2019s competent authority on the suitability of the test for the therapy.',
    authority: 'IVDR Annex VIII Rule 3(f); Art 48(6)',
    marketingRoute: true,
  },
  EU_IVDR_ART48_CONSULT: {
    commits:
      'The consultation a companion diagnostic\u2019s notified body must run with the medicines authority. It is a step inside the IVDR route, not a route of its own.',
    authority: 'IVDR Art 48(6)',
    marketingRoute: false,
  },
  EU_REF_LAB: {
    commits:
      'A Class D consultation: the reference laboratory verifies performance against common specifications. It is a step inside the IVDR route, not a route of its own.',
    authority: 'IVDR Art 48(3)–(6), Art 100; Annex IX Section 4.4',
    marketingRoute: false,
  },
};

/**
 * `MODALITY_FRAME`'s pathway names, mapped onto registry ids. The frame is
 * modality-aware where the registry is not, and the registry is the id space
 * the platform files against; this is the only place the two meet, and a test
 * holds that every frame pathway resolves.
 */
const FRAME_PATHWAY_TO_REGISTRY: Readonly<Record<string, string>> = {
  'NDA 505(b)(1)': 'US_NDA',
  'NDA 505(b)(2)': 'US_505B2',
  'ANDA 505(j)': 'US_ANDA',
  'BLA 351(a)': 'US_BLA',
  'BLA 351(k)': 'US_351K',
};

/** Every pathway name the modality frame holds, in frame order, de-duplicated. */
export function governedFramePathways(): string[] {
  const seen: string[] = [];
  for (const modality of MODALITIES) {
    for (const option of MODALITY_FRAME[modality].pathways) {
      if (!seen.includes(option.pathway)) seen.push(option.pathway);
    }
  }
  return seen;
}

/** The registry ids this module annotates. */
export function annotatedPositionIds(): string[] {
  return Object.keys(POSITION_MEANING);
}

/** One position, from the registry entry and this module's meaning. Null when either is missing. */
export function positionFor(registryId: string): PathwayPosition | null {
  const entry = getApplicationType(registryId);
  const meaning = POSITION_MEANING[registryId];
  if (!entry || !meaning) return null;
  return {
    value: entry.id,
    label: entry.displayName,
    commits: meaning.commits,
    authority: meaning.authority,
    marketingRoute: meaning.marketingRoute,
  };
}

/** The order positions are offered in, per domain and region. Routes to market first. */
const ORDER: Readonly<Record<string, string[]>> = {
  'pharma_biotech:US': ['US_NDA', 'US_505B2', 'US_BLA', 'US_351K', 'US_ANDA', 'US_ACCEL_APPROVAL', 'US_IND'],
  'medical_devices:US': ['US_510K', 'US_DE_NOVO', 'US_PMA', 'US_HDE', 'US_EUA', 'US_IDE', 'US_513G', 'US_QSUB'],
  'pharma_biotech:EU': ['EU_MAA', 'EU_CMA', 'EU_BIOSIMILAR_MAA', 'EU_GENERIC_DCP'],
  'medical_devices:EU': ['EU_MDR_CLASS_I', 'EU_MDR_CLASS_IIA', 'EU_MDR_CLASS_IIB', 'EU_MDR_CLASS_III'],
  'diagnostics_ivd:US': [
    'US_510K_IVD',
    'US_DE_NOVO_IVD',
    'US_PMA_IVD',
    'US_CDX_PMA',
    'US_CDX_510K',
    'US_EUA_IVD',
    'US_LDT',
    'US_CLIA_WAIVER',
  ],
  'diagnostics_ivd:EU': [
    'EU_IVDR_CLASS_A',
    'EU_IVDR_CLASS_B',
    'EU_IVDR_CLASS_CD',
    'EU_CDX_IVDR_D',
    'EU_IVDR_ART48_CONSULT',
    'EU_REF_LAB',
  ],
};

/**
 * The positions available for this product in front of this regulator, in the
 * order they should be offered.
 *
 * `modality` narrows a drug or biologic to what the governed frame allows it,
 * in the frame's own order (default first); without one, every annotated drug
 * position is offered. An empty list means this module holds nothing for that
 * pair, and the caller must say so rather than draw an empty question.
 */
export function pathwayPositionsFor(input: {
  domain: PathwayDomain;
  region: PathwayRegion;
  modality?: Modality | null;
}): PathwayPosition[] {
  const { domain, region, modality } = input;
  if (domain === 'pharma_biotech' && region === 'US' && modality) {
    const ids = MODALITY_FRAME[modality].pathways
      .map(option => FRAME_PATHWAY_TO_REGISTRY[option.pathway])
      .filter((id): id is string => Boolean(id));
    return ids.map(positionFor).filter((p): p is PathwayPosition => p !== null);
  }
  const ids = ORDER[`${domain}:${region}`] ?? [];
  return ids.map(positionFor).filter((p): p is PathwayPosition => p !== null);
}

/** Every position this module offers anywhere, for the gates that check them all. */
export function allPathwayPositions(): PathwayPosition[] {
  const out: PathwayPosition[] = [];
  for (const ids of Object.values(ORDER)) {
    for (const id of ids) {
      const position = positionFor(id);
      if (position && !out.some(p => p.value === position.value)) out.push(position);
    }
  }
  return out;
}

/* ── Marking a position the programme's own answers contradict ─────────── */

/**
 * The facts an interview holds that can speak against a position. Every field
 * is optional and an ABSENT fact means nothing: not knowing is not a
 * contradiction, so a rule fires only on something the person has said.
 *
 * Only facts the flows can actually state are here. Notably absent: an
 * explicit "there is no predicate", which would make a 510(k) inapplicable
 * outright rather than merely unsupported — no flow asks it yet, and the
 * predicate-strategy question is where it will come from. A rule nothing can
 * reach is worse than no rule: it reads as a check that passes.
 */
export interface ProgrammeFacts {
  /**
   * Every region the sponsor has named an agency for — the primary one and any
   * others. Empty or absent means they have not said, which speaks against
   * nothing.
   */
  regions?: CanonicalRegion[];
  /** A predicate device the sponsor has named, as they wrote it. */
  predicateNamed?: string;
  /** The US risk class the sponsor states. 'Not yet classified' is not a fact. */
  deviceClass?: 'I' | 'II' | 'III';
  /** The MDR class the sponsor states for the EU. */
  euMdrClass?: 'I' | 'IIa' | 'IIb' | 'III';
}

/** The MDR class each class route is the route FOR. */
const MDR_POSITION_CLASS: Readonly<Record<string, 'I' | 'IIa' | 'IIb' | 'III'>> = {
  EU_MDR_CLASS_I: 'I',
  EU_MDR_CLASS_IIA: 'IIa',
  EU_MDR_CLASS_IIB: 'IIb',
  EU_MDR_CLASS_III: 'III',
};

interface CautionRule {
  /** The positions this rule can mark. Every one must be a position this module offers. */
  positions: readonly string[];
  availability: PositionCaution['availability'];
  when: (facts: ProgrammeFacts, positionId: string) => boolean;
  reason: (facts: ProgrammeFacts, positionId: string) => string;
  /** A citation, or one read off the position itself where that IS the authority. */
  authority: string | ((positionId: string) => string);
}

/** The region a position is taken in, from the registry entry behind it. */
function regionOfPosition(positionId: string): CanonicalRegion | null {
  const entry = getApplicationType(positionId);
  return (entry && canonicalRegionOf(String(entry.region))) || null;
}

/** 'FDA', 'FDA and EMA', 'FDA, EMA and PMDA' — the agencies as a person wrote them. */
function listed(regions: readonly CanonicalRegion[]): string {
  const names = regions.map(agencyFor);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * What the programme's own answers can say against a position. First match
 * wins, so the order here is the order of severity, and nothing here is
 * written by a model.
 */
const CAUTION_RULES: readonly CautionRule[] = [
  /* -- The regulator comes first: a filing is made to one, or it is not made.
        Derived from the registry entry's own region, so every position this
        module annotates is covered by this one rule and a filing the registry
        gains is covered the day it is annotated. -------------------------- */
  {
    positions: Object.keys(POSITION_MEANING),
    availability: 'inapplicable',
    when: (f, id) => {
      if (!f.regions?.length) return false;
      const region = regionOfPosition(id);
      return region !== null && !f.regions.includes(region);
    },
    reason: (f, id) => {
      const region = regionOfPosition(id)!;
      const them = listed(f.regions ?? []);
      return (
        `You have named ${them} for this project, and this is a filing to ${agencyFor(region)}. ` +
        `If you are filing there as well, name ${agencyFor(region)} among the agencies and this route is open.`
      );
    },
    /* What makes a 510(k) FDA's and an MDR route the EU's is the statute behind
       the position itself; there is no separate citation to give. */
    authority: id => POSITION_MEANING[id].authority,
  },

  /* -- EU: the class decides the route, so a different class closes it ---- */
  {
    positions: Object.keys(MDR_POSITION_CLASS),
    availability: 'inapplicable',
    when: (f, id) => Boolean(f.euMdrClass) && f.euMdrClass !== MDR_POSITION_CLASS[id],
    reason: (f, id) =>
      `You have said this device is Class ${f.euMdrClass} under the MDR. The conformity assessment route follows ` +
      `from the classification rules rather than from a choice, so the Class ${MDR_POSITION_CLASS[id]} route is not ` +
      'open to it unless the classification itself changes.',
    authority: 'MDR (EU) 2017/745 Art 51, Art 52, Annex VIII',
  },

  /* -- US: a De Novo is for a device with no predicate -------------------- */
  {
    positions: ['US_DE_NOVO', 'US_DE_NOVO_IVD'],
    availability: 'needs_basis',
    when: f => Boolean(f.predicateNamed),
    reason: f =>
      'A De Novo has two entry conditions: no legally marketed device to compare to, or an NSE determination on a ' +
      `510(k) you have already filed. You have named a predicate (${f.predicateNamed}), so taking this position ` +
      'means saying which of those two applies.',
    authority: 'FD&C Act 513(f)(2); 21 CFR 860 Subpart D',
  },
  {
    positions: ['US_DE_NOVO', 'US_DE_NOVO_IVD'],
    availability: 'needs_basis',
    when: f => f.deviceClass === 'III',
    reason: () =>
      'A De Novo asks FDA to classify the device into Class I or Class II with special controls. You have said ' +
      'Class III, which is the premarket approval route — so either the classification or the route is in question.',
    authority: 'FD&C Act 513(f)(2); 21 CFR 860.200',
  },

  /* -- US: a Class III device is a PMA unless it is preamendments --------- */
  {
    positions: ['US_510K', 'US_510K_IVD', 'US_CDX_510K'],
    availability: 'needs_basis',
    when: f => f.deviceClass === 'III',
    reason: () =>
      'You have said Class III. A Class III device needs premarket approval unless it is a preamendments type, or a ' +
      'post-amendments device found substantially equivalent to one, for which FDA has not yet called for PMAs — ' +
      'that is the basis a 510(k) here has to state.',
    authority: 'FD&C Act 515(a); 21 CFR 814.1(c)',
  },
  {
    positions: ['US_510K', 'US_510K_IVD', 'US_CDX_510K'],
    availability: 'needs_basis',
    when: f => f.deviceClass === 'I',
    reason: () =>
      'You have said Class I. Most Class I devices are exempt from premarket notification by their own ' +
      'classification regulation, so check the exemption and the limitations on it before filing one.',
    authority: '21 CFR 807.85; the classification part’s own § .9 limitations of exemption',
  },

  /* -- US: a PMA is the Class III route ----------------------------------- */
  {
    positions: ['US_PMA', 'US_PMA_IVD', 'US_CDX_PMA'],
    availability: 'needs_basis',
    when: f => f.deviceClass === 'I' || f.deviceClass === 'II',
    reason: f =>
      `Premarket approval is the route for a Class III device, and you have said Class ${f.deviceClass}. A PMA for a ` +
      'device of a lower class is answerable, but the application has to say why the classification does not decide ' +
      'the route.',
    authority: 'FD&C Act 515; 21 CFR 814.1(c)',
  },
];

/**
 * What this programme's own answers say against a position, or null where they
 * say nothing. Deterministic, and never a model's judgment: the reason and the
 * authority are written above.
 */
export function cautionFor(positionId: string, facts: ProgrammeFacts): PositionCaution | null {
  for (const rule of CAUTION_RULES) {
    if (!rule.positions.includes(positionId)) continue;
    if (!rule.when(facts, positionId)) continue;
    const authority = typeof rule.authority === 'string' ? rule.authority : rule.authority(positionId);
    return { availability: rule.availability, reason: rule.reason(facts, positionId), authority };
  }
  return null;
}

/** Every position any rule can mark, for the gate that checks they are all offered. */
export function cautionablePositionIds(): string[] {
  const out: string[] = [];
  for (const rule of CAUTION_RULES) for (const id of rule.positions) if (!out.includes(id)) out.push(id);
  return out;
}

/**
 * The positions as a question's options — the shape a flow puts in a field, so
 * it states what each position commits to by referring here instead of writing
 * its own list.
 *
 * `facts` marks the positions the programme's own answers speak against. It
 * removes none of them: the caution travels on the option, and the person
 * still chooses (see `PositionAvailability`).
 */
export function pathwayOptions(input: {
  domain: PathwayDomain;
  region: PathwayRegion;
  modality?: Modality | null;
  facts?: ProgrammeFacts;
}): Array<{ value: string; label: string; commits: string; authority: string; caution?: PositionCaution }> {
  const facts = input.facts;
  return pathwayPositionsFor(input).map(position => {
    const caution = facts ? cautionFor(position.value, facts) : null;
    return {
      value: position.value,
      label: position.marketingRoute ? position.label : `${position.label} — not a route to market`,
      commits: position.commits,
      authority: position.authority,
      ...(caution ? { caution } : {}),
    };
  });
}
