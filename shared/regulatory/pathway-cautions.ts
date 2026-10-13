/**
 * What a programme's own answers say against a position
 * (founder's decision, 2026-10-12).
 *
 * The catalogue beside this one lists the positions a sponsor can take
 * (`pathway-positions.ts`). This holds the other half: the rules that mark the
 * ones the programme's own answers contradict, each with the reason — naming
 * the answer that creates the contradiction — and the authority that makes it
 * one. Nothing here is written by a model.
 *
 * Read `PositionAvailability` in `shared/types/intelligence-questions.ts` for
 * why a contradicted position is MARKED and still offered rather than hidden.
 * The line this pair of modules draws:
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
 * It was part of `pathway-positions.ts` until that file passed 500 lines; the
 * split is along the seam the two halves already had, and the dependency runs
 * one way — the rules read the catalogue, never the reverse.
 *
 * @module shared/regulatory/pathway-cautions
 */

import type { PositionCaution } from '../types/intelligence-questions.js';
import { agencyFor } from './agency-positions.js';
import type { DeviceClass, IvdrClass, MdrRuleClass } from './device-class.js';
import { getApplicationType } from './global-document-registry.js';
import { MODALITY_FRAME, MODALITY_LABEL, type Modality } from './modality.js';
import { annotatedPositionIds, positionFor } from './pathway-positions.js';
import { canonicalRegionOf, type CanonicalRegion } from './region-identity.js';

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
  /**
   * The region of the PRIMARY agency, kept apart from the rest because it
   * decides which routes a question offers, and 'the first of the regions' is
   * an ordering a reader would have to trust rather than read.
   */
  primaryRegion?: CanonicalRegion;
  /** A predicate device the sponsor has named, as they wrote it. */
  predicateNamed?: string;
  /**
   * What the programme says about the device it compares itself to
   * (`predicate-positions.ts`). 'none' and 'nse' are statements a sponsor has
   * made, not the absence of an answer — an empty predicate box says nothing.
   */
  predicate?: 'named' | 'none' | 'nse';
  /** The US risk class the sponsor states. 'Not yet classified' is not a fact. */
  deviceClass?: DeviceClass;
  /**
   * The MDR class the sponsor states for the EU, read onto the four the Annex
   * VIII rules YIELD — these rules reason about routes, and Is, Im and Ir take
   * the Class I route with the notified body involved for that aspect alone.
   * The RECORD keeps the seven a sponsor declares.
   */
  euMdrClass?: MdrRuleClass;
  /**
   * The IVDR class the sponsor states for the EU. Until the classification
   * question landed no interview could state it at all, so the IVDR routes
   * were offered to a diagnostics programme flat.
   */
  ivdrClass?: IvdrClass;
  /**
   * The modality behind the product the sponsor named
   * (`product-modality.ts`). It decides which statute governs the product, so
   * it speaks against a route under the other one.
   */
  modality?: Modality;
  /**
   * Which statute governs the product, where the answer said that much and no
   * more — "Biologic (BLA)", "Prescription Drug (NDA)". A modality always
   * implies its statute, so this is read only when there is no modality.
   */
  statute?: 'biologic' | 'chemical';
}

/** The modalities that are biological products, licensed rather than approved. */
const BIOLOGICAL: readonly Modality[] = ['protein', 'mab', 'adc', 'vaccine', 'cell_therapy', 'gene_therapy', 'biosimilar'];

/** The modalities the FD&C Act approves under section 505. */
const CHEMICAL: readonly Modality[] = ['small_molecule', 'peptide', 'oligonucleotide'];

/**
 * Which statute the answers put the product under: the modality where one was
 * named, and otherwise the statute the answer stated on its own. A combination
 * product sits under neither until its primary mode of action is determined
 * (21 CFR Part 3), so it resolves to null.
 */
function statuteIn(facts: ProgrammeFacts): 'biologic' | 'chemical' | null {
  if (facts.modality && BIOLOGICAL.includes(facts.modality)) return 'biologic';
  if (facts.modality && CHEMICAL.includes(facts.modality)) return 'chemical';
  return facts.statute ?? null;
}

/** How to name the product in a reason: the modality if one was given, else the statute. */
function productWords(facts: ProgrammeFacts): string {
  if (facts.modality) return MODALITY_LABEL[facts.modality].toLowerCase();
  return facts.statute === 'biologic' ? 'a biological product' : 'a product approved under section 505';
}

/**
 * The IVDR classes each position applies to. Four of these are routes and two
 * are steps inside one — the Article 48(6) consultation and the Class D
 * reference-laboratory verification — and the classes decide both.
 */
const IVDR_POSITION_CLASSES: Readonly<Record<string, readonly IvdrClass[]>> = {
  EU_IVDR_CLASS_A: ['A'],
  EU_IVDR_CLASS_B: ['B'],
  /* The registry holds C and D as one entry; the classes are two. */
  EU_IVDR_CLASS_CD: ['C', 'D'],
  /* A companion diagnostic is Class C or D (Annex VIII Rule 3(f)). */
  EU_CDX_IVDR_D: ['C', 'D'],
  EU_IVDR_ART48_CONSULT: ['C', 'D'],
  /* An EU reference laboratory is designated for Class D devices. */
  EU_REF_LAB: ['D'],
};

/** The MDR class each class route is the route FOR. */
const MDR_POSITION_CLASS: Readonly<Record<string, MdrRuleClass>> = {
  EU_MDR_CLASS_I: 'I',
  EU_MDR_CLASS_IIA: 'IIa',
  EU_MDR_CLASS_IIB: 'IIb',
  EU_MDR_CLASS_III: 'III',
};

interface CautionRule {
  /** What this rule is, named. It travels on the caution and onto the record. */
  id: string;
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

/**
 * What the filing IS, in words true of it. For a medicine the regulator is the
 * agency: EMA grants a marketing authorisation. For a device or a diagnostic
 * in the EU it is not — the MDR and IVDR routes are a notified body's
 * assessment — so naming EMA over an MDR class route is a sentence that is
 * simply false (a review caught it, 2026-10-12).
 */
function filingIs(positionId: string, region: CanonicalRegion): string {
  const segment = String(getApplicationType(positionId)?.segment ?? '');
  if (region === 'EU' && (segment === 'medical_devices' || segment === 'diagnostics_ivd')) {
    return `an EU conformity assessment under the ${segment === 'diagnostics_ivd' ? 'IVDR' : 'MDR'}`;
  }
  return `a filing to ${agencyFor(region)}`;
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
    id: 'wrong_regulator',
    positions: annotatedPositionIds(),
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
        `You have named ${them} for this project, and this is ${filingIs(id, region)}. ` +
        `If you are filing there as well, name ${agencyFor(region)} among the agencies and this route is open.`
      );
    },
    /* What makes a 510(k) FDA's and an MDR route the EU's is the statute behind
       the position itself; there is no separate citation to give. */
    authority: id => positionFor(id)?.authority ?? '',
  },

  /* -- EU: the class decides the route, so a different class closes it ---- */
  {
    id: 'mdr_class_route_mismatch',
    positions: Object.keys(MDR_POSITION_CLASS),
    availability: 'inapplicable',
    when: (f, id) => Boolean(f.euMdrClass) && f.euMdrClass !== MDR_POSITION_CLASS[id],
    reason: (f, id) =>
      `You have said this device is Class ${f.euMdrClass} under the MDR. The conformity assessment route follows ` +
      `from the classification rules rather than from a choice, so the Class ${MDR_POSITION_CLASS[id]} route is not ` +
      'open to it unless the classification itself changes.',
    authority: 'MDR (EU) 2017/745 Art 51, Art 52, Annex VIII',
  },

  /* -- Which statute governs the product, which is not a choice either ---
        A biological product is LICENSED under section 351 of the PHS Act; a
        chemical one is APPROVED under section 505 of the FD&C Act. Since the
        BPCIA transition of 23 March 2020 there is no overlap for the products
        that moved, so a route under the other statute is not a hard choice but
        a category error — marked, as everything here is, rather than hidden. */
  {
    id: 'biological_under_505',
    positions: ['US_NDA', 'US_505B2', 'US_ANDA'],
    availability: 'inapplicable',
    when: f => statuteIn(f) === 'biologic',
    reason: f =>
      `You have said this is ${productWords(f)}, which is licensed under section 351 of the PHS Act rather than ` +
      'approved under section 505 of the FD&C Act. Since the BPCIA transition of 2020 there is no 505 route for it.',
    authority: 'PHS Act 351; FD&C Act 505; BPCIA § 7002(e) transition (23 March 2020)',
  },
  {
    id: 'chemical_as_biologic',
    positions: ['US_BLA', 'US_351K', 'EU_BIOSIMILAR_MAA'],
    availability: 'inapplicable',
    when: f => statuteIn(f) === 'chemical',
    reason: f =>
      `You have said this is ${productWords(f)} — approved under section 505 of the FD&C Act rather than licensed ` +
      'as a biological product — so a biologics licence is not the route for it.',
    authority: 'FD&C Act 505; PHS Act 351(i) definition of a biological product',
  },

  /* -- A combination product: the lead centre decides, not the product type
        The US side offers nothing for one and says why in the frame's own
        words (governed-options.ts). The EU side offers all four medicines
        routes, because the frame holds no European equivalent to narrow them
        — so a combination product was offered an Article 8(3) MAA, a
        conditional MA, a biosimilar application and a generic DCP with
        nothing said (2026-10-12 review).

        The CTA is here for the same reason, and it was missed when the
        investigational filings were added to the catalogue a day later: a
        device-led combination runs an MDR clinical investigation under Article
        62, not a CTR trial through CTIS, so which application permits the
        study follows from the same determination as which one permits the
        sale. --------------------------------------------------------- */
  {
    id: 'combination_product_route_undecided',
    positions: ['EU_MAA', 'EU_CMA', 'EU_BIOSIMILAR_MAA', 'EU_GENERIC_DCP', 'EU_CTA'],
    availability: 'needs_basis',
    when: f => f.modality === 'combination',
    reason: () =>
      'You have said this is a drug-device combination. ' +
      `${MODALITY_FRAME.combination.centerBasis} Which route applies follows from that determination rather than ` +
      'from the product type, so the application has to say what the primary mode of action is and which ' +
      'regulation governs it — the trial application included, since a device-led combination runs an MDR ' +
      'clinical investigation rather than a CTR trial.',
    authority:
      '21 CFR Part 3 (US); MDR (EU) 2017/745 Art 1(8)-(9) and Directive 2001/83/EC Art 1(2) for the EU division; ' +
      'MDR Art 62 against Regulation (EU) 536/2014 for the trial application',
  },

  /* -- A biosimilar claim, or the absence of one -------------------------- */
  {
    id: 'biosimilar_standalone_bla',
    positions: ['US_BLA'],
    availability: 'needs_basis',
    when: f => f.modality === 'biosimilar',
    reason: () =>
      'You have said biosimilar. A standalone 351(a) licence means you are NOT claiming biosimilarity to a ' +
      'reference product, and owe the full nonclinical and clinical programme in your own right — which is a ' +
      'position some sponsors take deliberately, and the application has to say so.',
    authority: 'PHS Act 351(a) against 351(k)',
  },
  {
    id: 'biosimilar_full_maa',
    positions: ['EU_MAA', 'EU_CMA'],
    availability: 'needs_basis',
    when: f => f.modality === 'biosimilar',
    reason: () =>
      'You have said biosimilar. A full Article 8(3) application means you are not relying on a reference ' +
      'medicinal product’s dossier, and the comparability exercise is not what carries it.',
    authority: 'Directive 2001/83/EC Art 8(3) against Art 10(4)',
  },
  {
    id: 'biological_as_generic',
    positions: ['EU_GENERIC_DCP'],
    availability: 'inapplicable',
    when: f => statuteIn(f) === 'biologic',
    reason: f =>
      'A generic application under Article 10(1) is for a product with the same qualitative and quantitative ' +
      `composition as the reference, and you have said this is ${productWords(f)} — for which the route is a ` +
      'biosimilar application under Article 10(4).',
    authority: 'Directive 2001/83/EC Art 10(1) against Art 10(4)',
  },

  /* -- The IVDR class decides the route the same way, and until the
        classification question landed nothing could state it ------------- */
  {
    id: 'ivdr_class_route_mismatch',
    positions: Object.keys(IVDR_POSITION_CLASSES),
    availability: 'inapplicable',
    when: (f, id) => Boolean(f.ivdrClass) && !IVDR_POSITION_CLASSES[id].includes(f.ivdrClass!),
    reason: (f, id) => {
      const applies = IVDR_POSITION_CLASSES[id].join(' or ');
      const label = positionFor(id)?.label ?? id;
      return (
        `You have said this assay is Class ${f.ivdrClass} under the IVDR. ${label} applies to Class ${applies}, and ` +
        'the classification rules decide the conformity assessment route rather than a choice between them.'
      );
    },
    authority: 'IVDR (EU) 2017/746 Art 47, Art 48, Annex VIII',
  },

  /* -- US: a De Novo is for a device with no predicate -------------------- */
  {
    id: 'de_novo_with_named_predicate',
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
    id: 'de_novo_class_iii',
    positions: ['US_DE_NOVO', 'US_DE_NOVO_IVD'],
    availability: 'needs_basis',
    when: f => f.deviceClass === 'III',
    reason: () =>
      'A De Novo asks FDA to classify the device into Class I or Class II with special controls. You have said ' +
      'Class III, which is the premarket approval route — so either the classification or the route is in question.',
    authority: 'FD&C Act 513(f)(2); 21 CFR 860.200',
  },

  /* -- A 510(k) is a comparison, so with nothing to compare to there is no
        510(k). The fact this rule reads could not be stated by any interview
        until the predicate-strategy question landed; it is the stronger half
        of the De Novo pair below. ----------------------------------------- */
  {
    id: 'notification_without_predicate',
    positions: ['US_510K', 'US_510K_IVD', 'US_CDX_510K'],
    availability: 'inapplicable',
    when: f => f.predicate === 'none' || f.predicate === 'nse',
    reason: f =>
      f.predicate === 'nse'
        ? 'You have said FDA already found this device not substantially equivalent. That 510(k) is closed, and an NSE ' +
          'determination is one of the two conditions for a De Novo request rather than a basis for filing again.'
        : 'You have said there is no legally marketed device to compare to. Substantial equivalence is a comparison, so ' +
          'there is no 510(k) to make — which is the first condition for a De Novo request.',
    authority: 'FD&C Act 513(i), 513(f)(2)(A); 21 CFR 807.100(b), 860 Subpart D',
  },

  /* -- US: a Class III device is a PMA unless it is preamendments --------- */
  {
    id: 'notification_class_iii',
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
    id: 'notification_class_i',
    positions: ['US_510K', 'US_510K_IVD', 'US_CDX_510K'],
    availability: 'needs_basis',
    when: f => f.deviceClass === 'I',
    reason: () =>
      'You have said Class I. Most Class I devices are exempt from premarket notification by their own ' +
      'classification regulation, so check the exemption and the limitations on it before filing one.',
    /* The exemption is granted by the device's own classification regulation
       and limited by that part's § .9; 21 CFR 807.85 is a different exemption
       (custom devices and relabellers) and was the wrong citation. */
    authority: '21 CFR 862–892 — the classification regulation and its own § .9 limitations of exemption',
  },

  /* -- US: a PMA is the Class III route ----------------------------------- */
  {
    id: 'pma_lower_class',
    positions: ['US_PMA', 'US_PMA_IVD', 'US_CDX_PMA'],
    availability: 'needs_basis',
    when: f => f.deviceClass === 'I' || f.deviceClass === 'II',
    reason: f =>
      `Premarket approval is the route for a Class III device, and you have said Class ${f.deviceClass}. A PMA for a ` +
      'device of a lower class is answerable — a transitional device, or one reclassified into Class II, for which ' +
      'FDA has called for premarket approval — but that is a basis the application has to state.',
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
    return { availability: rule.availability, reason: rule.reason(facts, positionId), authority, ruleId: rule.id };
  }
  return null;
}

/** Every rule, named, for the gate that holds each one can actually fire. */
export function cautionRuleIds(): string[] {
  return CAUTION_RULES.map(rule => rule.id);
}

/** Every position any rule can mark, for the gate that checks they are all offered. */
export function cautionablePositionIds(): string[] {
  const out: string[] = [];
  for (const rule of CAUTION_RULES) for (const id of rule.positions) if (!out.includes(id)) out.push(id);
  return out;
}
