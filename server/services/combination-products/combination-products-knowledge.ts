/**
 * Combination Products & Device Constituent — Deterministic Knowledge Engine
 * =========================================================================
 *
 * A pure, closed-form regulatory knowledge base for drug-device, biologic-device,
 * and drug-biologic combination products. Every engine in this module is
 * DETERMINISTIC: identical input always yields identical output. There is NO LLM,
 * NO network call, NO database access, and NO import from any other service.
 *
 * The engines implement the FDA and EU regulatory frameworks that govern
 * combination products end-to-end:
 *
 *   - 21 CFR Part 3        — Product jurisdiction; the Primary Mode of Action
 *                            (PMOA) construct and the 21 CFR 3.4 assignment
 *                            algorithm used by FDA's Office of Combination
 *                            Products (OCP) to assign a lead Center.
 *   - 21 CFR 3.2(e)        — The four statutory/regulatory categories of
 *                            combination product (single-entity, co-packaged,
 *                            two cross-labeled variants).
 *   - 21 CFR 3.2(m)        — Definition of "mode of action."
 *   - 21 CFR Part 4        — cGMP for combination products: the "streamlined"
 *                            approach (Subpart A) and post-marketing safety
 *                            reporting (Subpart B).
 *   - 21 CFR 820 (QSR)     — Quality System Regulation / design controls.
 *   - 21 CFR 820.30        — Design controls (inputs, outputs, V&V, DHF).
 *   - QMSR (2024 final rule, effective Feb 2, 2026) — incorporation of
 *                            ISO 13485:2016 by reference, replacing most of QSR.
 *   - FDA Human Factors    — "Applying Human Factors and Usability Engineering
 *                            to Medical Devices" (final guidance, Feb 2016).
 *   - IEC 62366-1:2015     — Application of usability engineering to medical
 *                            devices (+ Amendment 1:2020).
 *   - ISO 14971:2019       — Application of risk management to medical devices.
 *   - EU MDR 2017/745      — Article 117 (drug-device combinations) and Rule 14;
 *                            notified-body opinion (NBOp) on the device part.
 *
 * The intent is to give downstream callers (e.g. the AnA tool layer) numbers,
 * decisions, and verbatim citations they can report directly without
 * re-deriving regulatory interpretation. Citations are the load-bearing output;
 * they are returned as strings and MUST be reported verbatim.
 *
 * @module server/services/combination-products/combination-products-knowledge
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 0 — Shared types and citation registry
// ─────────────────────────────────────────────────────────────────────────────

/** A regulatory citation: a short label plus the authoritative source string. */
export interface RegulatoryCitation {
  /** Short stable identifier, e.g. "21 CFR 3.2(m)". */
  id: string;
  /** Human-readable description of what the citation establishes. */
  description: string;
}

/** The three FDA lead Centers that can take a combination product. */
export type FdaCenter = 'CDER' | 'CBER' | 'CDRH';

/** A constituent part's underlying regulated article type. */
export type ConstituentType = 'drug' | 'device' | 'biologic';

/** Confidence with which a deterministic decision is rendered. */
export type DecisionConfidence = 'high' | 'moderate' | 'low';

/**
 * Canonical citation registry. Defined once, referenced everywhere. Using a
 * named interface array (NOT `as const`) so the strings remain `string`-typed
 * and can be spread into typed result objects without TS4104/TS2322.
 */
interface CitationEntry {
  id: string;
  description: string;
}

const CITATIONS: CitationEntry[] = [
  {
    id: '21 CFR 3.2(e)',
    description:
      'Definition of "combination product": single-entity, co-packaged, and two ' +
      'cross-labeled forms.',
  },
  {
    id: '21 CFR 3.2(m)',
    description:
      'Definition of "mode of action" — the means by which a constituent part ' +
      'achieves its intended therapeutic effect or action.',
  },
  {
    id: '21 CFR 3.4',
    description:
      'Assignment of combination products and the algorithm used when the PMOA ' +
      'cannot be determined with reasonable certainty.',
  },
  {
    id: '21 CFR 3.5',
    description: 'Submission of a Request for Designation (RFD) to FDA OCP.',
  },
  {
    id: '21 CFR 3.7',
    description:
      'Timeline and procedures for an FDA letter of designation in response to an RFD.',
  },
  {
    id: '21 CFR Part 4 Subpart A',
    description:
      'Current Good Manufacturing Practice requirements for combination products ' +
      '(the streamlined approach, §§ 4.1–4.4).',
  },
  {
    id: '21 CFR 4.3',
    description:
      'Definition of constituent part and the cGMP requirements that apply to a ' +
      'combination product.',
  },
  {
    id: '21 CFR 4.4',
    description:
      'Streamlined cGMP: a manufacturer may comply with either a drug-cGMP base ' +
      'or a device-QS base and then satisfy specified called-out provisions of the other.',
  },
  {
    id: '21 CFR Part 4 Subpart B',
    description:
      'Postmarketing safety reporting for combination products (§§ 4.100–4.110).',
  },
  {
    id: '21 CFR 820.30',
    description: 'Design controls for medical devices.',
  },
  {
    id: '21 CFR 820',
    description:
      'Quality System Regulation (QSR) for medical devices; being superseded by the QMSR.',
  },
  {
    id: 'QMSR (89 FR 7496, Feb 2, 2024)',
    description:
      'Quality Management System Regulation final rule incorporating ISO 13485:2016 ' +
      'by reference; effective February 2, 2026, amending 21 CFR Part 820.',
  },
  {
    id: 'ISO 13485:2016',
    description: 'Medical devices — Quality management systems — Requirements for regulatory purposes.',
  },
  {
    id: 'ISO 14971:2019',
    description: 'Medical devices — Application of risk management to medical devices.',
  },
  {
    id: 'IEC 62366-1:2015/A1:2020',
    description: 'Medical devices — Application of usability engineering to medical devices.',
  },
  {
    id: 'FDA HF Guidance (Feb 2016)',
    description:
      'Applying Human Factors and Usability Engineering to Medical Devices — Guidance ' +
      'for Industry and FDA Staff.',
  },
  {
    id: 'FDA Draft HF Guidance (Dec 2022)',
    description:
      'Content of Human Factors Information in Medical Device Marketing Submissions (draft).',
  },
  {
    id: 'EU MDR 2017/745 Art. 117',
    description:
      'Amendment to Annex I of Directive 2001/83/EC requiring a notified-body opinion ' +
      'on the device part of an integral drug-device combination in a medicinal-product MAA.',
  },
  {
    id: 'EU MDR 2017/745 Rule 14',
    description:
      'Classification rule for devices incorporating a medicinal substance as an integral part.',
  },
  {
    id: 'FDA OCP Guidance (Jan 2017)',
    description:
      'Classification of Products as Drugs and Devices and Additional Product ' +
      'Classification Issues — Guidance for Industry and FDA Staff.',
  },
  {
    id: 'FDA cGMP Guidance (Jan 2017)',
    description:
      'Current Good Manufacturing Practice Requirements for Combination Products — ' +
      'Guidance for Industry and FDA Staff.',
  },
  {
    id: '21 USC 353(g)',
    description:
      'Section 503(g) of the FD&C Act — primary mode of action and agency assignment ' +
      'for combination products.',
  },
];

/** Look up a canonical citation by id; returns a fully-typed RegulatoryCitation. */
function cite(id: string): RegulatoryCitation {
  const found = CITATIONS.find((c: CitationEntry): boolean => c.id === id);
  if (found) {
    return { id: found.id, description: found.description };
  }
  return { id, description: '(citation text not catalogued)' };
}

/** Build a list of RegulatoryCitation from a list of ids. */
function citeAll(ids: string[]): RegulatoryCitation[] {
  return ids.map((id: string): RegulatoryCitation => cite(id));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Primary Mode of Action (PMOA) → lead Center assignment
// 21 CFR 3.2(m), 21 CFR 3.4, 21 USC 353(g)
// ─────────────────────────────────────────────────────────────────────────────

/** A single constituent part described for PMOA purposes. */
export interface ConstituentDescriptor {
  /** Underlying regulated-article type. */
  type: ConstituentType;
  /**
   * Whether THIS constituent provides the product's primary therapeutic effect.
   * Exactly one constituent should be flagged primary; if none/multiple are, the
   * engine falls back to the 21 CFR 3.4 assignment algorithm.
   */
  providesPrimaryTherapeuticEffect?: boolean;
  /** Free-text description of the constituent's mechanism (recorded, not parsed). */
  modeOfActionDescription?: string;
}

export interface PmoaParams {
  /** Plain-language product description (recorded for the rationale). */
  productDescription?: string;
  /** All constituent parts of the combination product. */
  constituents: ConstituentDescriptor[];
  /**
   * Optional explicit statement of which constituent type provides the PMOA.
   * If provided and unambiguous, it short-circuits the inference.
   */
  assertedPmoaType?: ConstituentType;
  /**
   * For the 21 CFR 3.4(b) algorithm fallback: which Center already regulates
   * the other combination products that raise similar types of
   * safety/effectiveness questions, if known.
   */
  centerForSimilarQuestions?: FdaCenter;
}

export interface PmoaResult {
  /** The determined PMOA constituent type (drug/device/biologic), if determinable. */
  pmoaType: ConstituentType | 'indeterminate';
  /** Assigned lead FDA Center. */
  leadCenter: FdaCenter;
  /** Whether assignment used the 21 CFR 3.4(b) algorithm because PMOA was unclear. */
  usedAssignmentAlgorithm: boolean;
  /** Confidence in the determination. */
  confidence: DecisionConfidence;
  /** Stepwise human-readable rationale. */
  rationale: string[];
  /** Mode-of-action summary per constituent. */
  constituentModes: Array<{ type: ConstituentType; mode: string }>;
  /** Whether a Request for Designation (RFD) is recommended to confirm assignment. */
  recommendRequestForDesignation: boolean;
  /** Supporting citations. */
  citations: RegulatoryCitation[];
  /** Operational notes for the sponsor. */
  notes: string[];
}

/**
 * Map a PMOA constituent type to its default lead FDA Center.
 *
 * Per 21 CFR 3.4(a) and longstanding OCP practice:
 *   - drug PMOA      → CDER
 *   - biologic PMOA  → CBER (or CDER for therapeutic biologics transferred in 2003,
 *                      but the statutory lead-Center construct is CBER for the
 *                      biologic article type)
 *   - device PMOA    → CDRH
 */
function centerForPmoaType(type: ConstituentType): FdaCenter {
  switch (type) {
    case 'drug':
      return 'CDER';
    case 'biologic':
      return 'CBER';
    case 'device':
      return 'CDRH';
    default:
      return 'CDRH';
  }
}

/**
 * Determine the Primary Mode of Action of a combination product and the
 * resulting lead FDA Center, implementing the 21 CFR 3.2(m) PMOA construct and
 * the 21 CFR 3.4 assignment algorithm.
 *
 * The "mode of action" (21 CFR 3.2(m)) is the means by which a constituent part
 * achieves its intended therapeutic effect. The "primary mode of action"
 * (21 USC 353(g)(1); 21 CFR 3.4(a)) is the single mode of action that provides
 * the MOST IMPORTANT therapeutic action of the combination product as a whole.
 * The Center with primary jurisdiction over a constituent that provides the
 * PMOA is assigned as the lead.
 *
 * When FDA cannot determine with reasonable certainty which mode of action
 * provides the most important therapeutic action, 21 CFR 3.4(b) provides a
 * two-step algorithm:
 *   (1) Assign to the Center that regulates other combination products that
 *       present similar questions of safety and effectiveness; otherwise
 *   (2) Assign to the Center with the most expertise to evaluate the most
 *       significant safety and effectiveness questions.
 */
export function determinePrimaryModeOfAction(params: PmoaParams): PmoaResult {
  const rationale: string[] = [];
  const notes: string[] = [];

  const constituentModes = params.constituents.map(
    (c: ConstituentDescriptor): { type: ConstituentType; mode: string } => ({
      type: c.type,
      mode: c.modeOfActionDescription ?? `${c.type} mode of action (not described)`,
    }),
  );

  rationale.push(
    'Mode of action (21 CFR 3.2(m)) is the means by which a constituent part achieves ' +
      'its intended therapeutic effect or action.',
  );
  rationale.push(
    'Primary mode of action (PMOA, 21 USC 353(g)(1); 21 CFR 3.4(a)) is the single mode of ' +
      'action expected to make the GREATEST contribution to the overall intended ' +
      'therapeutic effects of the combination product.',
  );

  // 1. Explicit assertion path.
  let pmoaType: ConstituentType | 'indeterminate' = 'indeterminate';
  let usedAssignmentAlgorithm = false;
  let confidence: DecisionConfidence = 'low';

  if (params.assertedPmoaType) {
    pmoaType = params.assertedPmoaType;
    confidence = 'high';
    rationale.push(
      `Sponsor asserts the PMOA is provided by the ${params.assertedPmoaType} constituent; ` +
        'accepted as the basis for assignment.',
    );
  } else {
    // 2. Infer from the constituent flagged as providing the primary therapeutic effect.
    const primaries = params.constituents.filter(
      (c: ConstituentDescriptor): boolean => c.providesPrimaryTherapeuticEffect === true,
    );
    if (primaries.length === 1) {
      pmoaType = primaries[0].type;
      confidence = 'high';
      rationale.push(
        `Exactly one constituent (${primaries[0].type}) is identified as providing the ` +
          'primary therapeutic action; its mode of action is the PMOA.',
      );
    } else if (primaries.length === 0) {
      rationale.push(
        'No constituent was identified as providing the primary therapeutic action; PMOA ' +
          'cannot be determined with reasonable certainty from the inputs.',
      );
    } else {
      rationale.push(
        `${primaries.length} constituents were each flagged as primary; the PMOA is ` +
          'ambiguous on the inputs.',
      );
    }
  }

  // 3. Assignment algorithm fallback (21 CFR 3.4(b)) when PMOA is indeterminate.
  let leadCenter: FdaCenter;
  if (pmoaType === 'indeterminate') {
    usedAssignmentAlgorithm = true;
    if (params.centerForSimilarQuestions) {
      leadCenter = params.centerForSimilarQuestions;
      confidence = 'moderate';
      rationale.push(
        '21 CFR 3.4(b)(1): because the PMOA cannot be determined with reasonable certainty, ' +
          `FDA assigns the product to the Center that regulates other combination products ` +
          `presenting similar questions of safety and effectiveness — ${leadCenter}.`,
      );
    } else {
      // Step (2): most-expertise tiebreak. Deterministic heuristic — choose the
      // Center for the constituent type whose questions are typically most
      // significant, prioritizing biologic > drug > device per OCP practice for
      // novel mechanisms, but flag low confidence and recommend an RFD.
      const types = params.constituents.map((c: ConstituentDescriptor): ConstituentType => c.type);
      if (types.includes('biologic')) {
        leadCenter = 'CBER';
        rationale.push(
          '21 CFR 3.4(b)(2): no precedent Center identified; the most significant safety and ' +
            'effectiveness questions are presumed to arise from the biologic constituent, so the ' +
            'Center with the most expertise (CBER) is selected pending an RFD.',
        );
      } else if (types.includes('drug')) {
        leadCenter = 'CDER';
        rationale.push(
          '21 CFR 3.4(b)(2): no precedent Center identified; the most significant safety and ' +
            'effectiveness questions are presumed to arise from the drug constituent (CDER) pending an RFD.',
        );
      } else {
        leadCenter = 'CDRH';
        rationale.push(
          '21 CFR 3.4(b)(2): no precedent Center identified; assigned to CDRH for the device ' +
            'constituent pending an RFD.',
        );
      }
      confidence = 'low';
    }
  } else {
    leadCenter = centerForPmoaType(pmoaType);
    rationale.push(
      `The PMOA constituent type (${pmoaType}) places primary jurisdiction with ${leadCenter} ` +
        '(21 CFR 3.4(a)).',
    );
  }

  notes.push(
    'A drug-device or biologic-device PMOA determination does NOT change which constituent is ' +
      'a drug vs a device; it only sets the lead Center and the review program for the whole product.',
  );
  notes.push(
    'CDER took over most therapeutic-biologic review in 2003, so a "biologic PMOA" therapeutic ' +
      'protein may in practice be led by CDER even though the article is a 351 biologic; confirm with OCP.',
  );

  const recommendRequestForDesignation = usedAssignmentAlgorithm || confidence !== 'high';
  if (recommendRequestForDesignation) {
    notes.push(
      'Because the assignment is not unambiguous, submit a Request for Designation (RFD) under ' +
        '21 CFR 3.5 to obtain a binding FDA letter of designation (21 CFR 3.7), or request a ' +
        'Pre-RFD informal feedback meeting with OCP.',
    );
  }

  return {
    pmoaType,
    leadCenter,
    usedAssignmentAlgorithm,
    confidence,
    rationale,
    constituentModes,
    recommendRequestForDesignation,
    citations: citeAll([
      '21 CFR 3.2(m)',
      '21 CFR 3.4',
      '21 USC 353(g)',
      '21 CFR 3.5',
      '21 CFR 3.7',
      'FDA OCP Guidance (Jan 2017)',
    ]),
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Combination-product classification (21 CFR 3.2(e))
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The four 21 CFR 3.2(e) categories:
 *   (1) single-entity     — physically/chemically combined into a single entity.
 *   (2) co-packaged       — two or more separate products packaged together.
 *   (3) cross-labeled-drug — a separately marketed drug/device/biologic whose
 *                            labeling references and is intended for use only with
 *                            another individually specified product (3.2(e)(3)).
 *   (4) cross-labeled-investigational — same, where the other product is
 *                            investigational and the labeling is needed to achieve
 *                            the intended use (3.2(e)(4)).
 */
export type CombinationCategory =
  | 'single-entity'
  | 'co-packaged'
  | 'cross-labeled'
  | 'cross-labeled-investigational'
  | 'not-a-combination-product';

export interface ClassifyParams {
  /** Constituent article types present. */
  constituentTypes: ConstituentType[];
  /**
   * Physical/packaging relationship between the constituents.
   *   'physically-combined'  → single entity (e.g. prefilled syringe, drug-eluting stent).
   *   'co-packaged'          → separate articles in one package (e.g. kit).
   *   'separately-marketed'  → marketed separately but cross-labeled for joint use.
   */
  relationship: 'physically-combined' | 'co-packaged' | 'separately-marketed';
  /**
   * For separately-marketed products: whether the labeling of one product
   * specifically references and requires use with the other.
   */
  crossLabeled?: boolean;
  /** Whether the referenced "other" product is investigational (3.2(e)(4)). */
  otherProductInvestigational?: boolean;
  /** Optional product description (recorded). */
  productDescription?: string;
}

export interface ClassifyResult {
  category: CombinationCategory;
  /** Whether the article meets the 21 CFR 3.2(e) definition of a combination product at all. */
  isCombinationProduct: boolean;
  /** Plain-language description of the resulting regulatory framework. */
  regulatoryFramework: string[];
  /** The 21 CFR 3.2(e) subparagraph that applies. */
  definitionSubparagraph: string;
  /** Stepwise rationale. */
  rationale: string[];
  /** Worked examples of the category for orientation. */
  examples: string[];
  citations: RegulatoryCitation[];
  notes: string[];
}

/**
 * Classify a combination product into one of the four 21 CFR 3.2(e) categories
 * and describe the resulting regulatory framework (single marketing application
 * vs separate applications; one constituent type leading).
 */
export function classifyCombinationProduct(params: ClassifyParams): ClassifyResult {
  const rationale: string[] = [];
  const notes: string[] = [];
  const examples: string[] = [];

  const distinctTypes = Array.from(new Set(params.constituentTypes));
  const isMultiType = distinctTypes.length >= 2;

  rationale.push(
    '21 CFR 3.2(e) defines a combination product as one comprising two or more regulated ' +
      'components (drug/device/biologic) that are combined or otherwise associated.',
  );
  rationale.push(
    `Constituent article types present: ${distinctTypes.join(', ') || '(none)'}.`,
  );

  let category: CombinationCategory;
  let definitionSubparagraph: string;
  let isCombinationProduct = true;

  if (!isMultiType && params.relationship !== 'co-packaged') {
    // A product of a single article type that is merely co-packaged with more of
    // the same type is generally NOT a combination product unless types differ.
    category = 'not-a-combination-product';
    definitionSubparagraph = 'n/a';
    isCombinationProduct = false;
    rationale.push(
      'Only a single regulated article type is present and the parts are physically combined; ' +
        'this does not meet the two-or-more-different-article-type element of 21 CFR 3.2(e). ' +
        'NOTE: two devices, or a device with software, are typically regulated as one device, not a combination.',
    );
  } else if (params.relationship === 'physically-combined') {
    category = 'single-entity';
    definitionSubparagraph = '21 CFR 3.2(e)(1)';
    rationale.push(
      '21 CFR 3.2(e)(1): the constituent parts are physically, chemically, or otherwise ' +
        'combined or mixed and produced as a single entity.',
    );
    examples.push(
      'Prefilled syringe / drug-filled autoinjector; drug-eluting stent; transdermal patch; ' +
        'antibody-drug conjugate delivery system; bone cement with antibiotic.',
    );
  } else if (params.relationship === 'co-packaged') {
    category = 'co-packaged';
    definitionSubparagraph = '21 CFR 3.2(e)(2)';
    rationale.push(
      '21 CFR 3.2(e)(2): two or more separate products packaged together in a single package ' +
        'or as a unit (a "kit").',
    );
    examples.push(
      'Surgical or first-aid kit with a drug and an applicator; a vial of drug co-packaged with ' +
        'a reconstitution/delivery device; an allergy-test kit.',
    );
  } else {
    // separately-marketed
    if (params.crossLabeled === false) {
      category = 'not-a-combination-product';
      definitionSubparagraph = 'n/a';
      isCombinationProduct = false;
      rationale.push(
        'The products are marketed separately and not cross-labeled to require joint use; ' +
          'absent cross-labeling, 21 CFR 3.2(e)(3)/(4) is not met and this is not a combination product.',
      );
    } else if (params.otherProductInvestigational) {
      category = 'cross-labeled-investigational';
      definitionSubparagraph = '21 CFR 3.2(e)(4)';
      rationale.push(
        '21 CFR 3.2(e)(4): a separately-marketed product whose labeling proposes use only with ' +
          'another individually specified INVESTIGATIONAL product, where both are needed to ' +
          'achieve the intended use, indication, or effect.',
      );
      examples.push(
        'A marketed imaging device cross-labeled for use only with an investigational ' +
          'radiopharmaceutical; a light-activating device labeled for use only with an ' +
          'investigational photosensitizer drug.',
      );
    } else {
      category = 'cross-labeled';
      definitionSubparagraph = '21 CFR 3.2(e)(3)';
      rationale.push(
        '21 CFR 3.2(e)(3): a drug, device, or biologic packaged separately that, according to ' +
          'its investigational plan or labeling, is intended for use ONLY with an approved, ' +
          'individually specified other product, where both are needed to achieve the intended use.',
      );
      examples.push(
        'A photosensitizing drug cross-labeled for use only with a specific laser; a contrast ' +
          'agent labeled for use only with a specific imaging system.',
      );
    }
  }

  // Regulatory framework consequences.
  const regulatoryFramework: string[] = [];
  if (!isCombinationProduct) {
    regulatoryFramework.push(
      'Regulated as the individual product type(s); no combination-product-specific framework applies.',
    );
  } else {
    regulatoryFramework.push(
      'The whole product is a combination product; the lead Center (set by PMOA, see ' +
        'determinePrimaryModeOfAction) runs the premarket review.',
    );
    if (category === 'single-entity' || category === 'co-packaged') {
      regulatoryFramework.push(
        'Generally reviewed under a single marketing application owned by the lead Center; the ' +
          'application must address BOTH constituent parts (drug/biologic data + device design controls).',
      );
      regulatoryFramework.push(
        'Combination-product cGMP under 21 CFR Part 4 applies to the manufacturer that makes the ' +
          'combined product or co-packages it.',
      );
    } else {
      regulatoryFramework.push(
        'Cross-labeled constituents are frequently the subject of SEPARATE marketing applications ' +
          '(one per constituent), coordinated by the lead Center; each application addresses its own constituent.',
      );
      regulatoryFramework.push(
        'Cross-labeling claims must be supported and consistent across both products’ labeling.',
      );
    }
  }

  notes.push(
    'Classification (3.2(e) category) is independent of PMOA-based Center assignment; you need ' +
      'both: the category determines application structure, the PMOA determines the lead Center.',
  );
  notes.push(
    'If category or combination-product status is uncertain, OCP can confirm via a Request for ' +
      'Designation (21 CFR 3.5) or an informal Pre-RFD.',
  );

  return {
    category,
    isCombinationProduct,
    regulatoryFramework,
    definitionSubparagraph,
    rationale,
    examples,
    citations: citeAll([
      '21 CFR 3.2(e)',
      'FDA OCP Guidance (Jan 2017)',
      '21 CFR 3.5',
    ]),
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Combination-product cGMP operating model (21 CFR Part 4)
// ─────────────────────────────────────────────────────────────────────────────

/** The streamlined-approach base a manufacturer may operate under. */
export type CgmpBase = 'drug-cGMP-base' | 'device-QS-base';

/** A called-out cGMP/QS provision that must be satisfied on top of the base. */
interface CalledOutProvision {
  /** Regulatory citation of the provision. */
  citation: string;
  /** Short topic label. */
  topic: string;
  /** What the provision requires. */
  requirement: string;
}

/**
 * The six device Quality System provisions called out by 21 CFR 4.4(b)(1) that
 * a drug-cGMP-base manufacturer must additionally satisfy. (Annotated array,
 * NOT `as const`.)
 */
const DEVICE_PROVISIONS_CALLED_INTO_DRUG_BASE: CalledOutProvision[] = [
  {
    citation: '21 CFR 820.20',
    topic: 'Management responsibility',
    requirement:
      'Establish quality policy, organizational structure, management review, and quality planning ' +
      'for the device constituent (drug cGMP §§ 211 do not fully cover device management controls).',
  },
  {
    citation: '21 CFR 820.30',
    topic: 'Design controls',
    requirement:
      'Apply full design controls to the device constituent: design and development planning, ' +
      'design inputs/outputs, review, verification, validation, transfer, changes, and a Design History File.',
  },
  {
    citation: '21 CFR 820.50',
    topic: 'Purchasing controls',
    requirement:
      'Establish supplier evaluation/selection and purchasing data controls for device-constituent ' +
      'components and services.',
  },
  {
    citation: '21 CFR 820.100',
    topic: 'Corrective and preventive action (CAPA)',
    requirement:
      'Operate a device-style CAPA system (note: this is distinct in scope from the drug ' +
      'investigations and discrepancy procedures under 21 CFR 211.192).',
  },
  {
    citation: '21 CFR 820.170',
    topic: 'Installation',
    requirement: 'Establish installation and inspection procedures where the device constituent is installed.',
  },
  {
    citation: '21 CFR 820.200',
    topic: 'Servicing',
    requirement: 'Establish servicing procedures and records where the device constituent is serviced.',
  },
];

/**
 * The eight drug cGMP provisions called out by 21 CFR 4.4(b)(2) that a
 * device-QS-base manufacturer must additionally satisfy. (Annotated array.)
 */
const DRUG_PROVISIONS_CALLED_INTO_DEVICE_BASE: CalledOutProvision[] = [
  {
    citation: '21 CFR 211.84',
    topic: 'Testing & approval/rejection of components, containers, closures',
    requirement:
      'Test or examine incoming drug components, containers, and closures and approve/reject them ' +
      'before use.',
  },
  {
    citation: '21 CFR 211.103',
    topic: 'Calculation of yield',
    requirement: 'Calculate and document actual yields and percentages of theoretical yield.',
  },
  {
    citation: '21 CFR 211.132',
    topic: 'Tamper-evident packaging (OTC)',
    requirement: 'Apply tamper-evident packaging requirements to OTC drug constituent parts.',
  },
  {
    citation: '21 CFR 211.137',
    topic: 'Expiration dating',
    requirement: 'Establish and apply expiration dating supported by stability testing.',
  },
  {
    citation: '21 CFR 211.165',
    topic: 'Testing and release for distribution',
    requirement:
      'Perform appropriate laboratory testing of each batch of drug constituent prior to release.',
  },
  {
    citation: '21 CFR 211.166',
    topic: 'Stability testing',
    requirement: 'Operate a written stability-testing program to support expiration dating.',
  },
  {
    citation: '21 CFR 211.167',
    topic: 'Special testing requirements',
    requirement:
      'Conduct special testing (e.g., sterility, pyrogen) for products purporting to be sterile/pyrogen-free.',
  },
  {
    citation: '21 CFR 211.170',
    topic: 'Reserve samples',
    requirement: 'Retain reserve samples of active ingredient and finished drug constituent.',
  },
];

export interface CgmpParams {
  /** Constituent types present in the combination product. */
  constituentTypes: ConstituentType[];
  /** 21 CFR 3.2(e) category from classifyCombinationProduct. */
  category: CombinationCategory;
  /**
   * Whether the constituents are manufactured at a single facility / under a
   * single quality system (single set of operations). Part 4 streamlining is
   * designed for co-located/single-entity manufacture.
   */
  singleSetOfOperations?: boolean;
  /**
   * Preferred base, if the manufacturer already operates a mature drug or device
   * quality system. The engine validates it against the constituents present.
   */
  preferredBase?: CgmpBase;
  /** Whether any drug constituent purports to be sterile (drives 211.167). */
  hasSterileDrugConstituent?: boolean;
  /** Whether any drug constituent is an OTC product (drives 211.132). */
  hasOtcDrugConstituent?: boolean;
}

export interface CgmpResult {
  /** Whether 21 CFR Part 4 streamlined cGMP applies at all. */
  partFourApplies: boolean;
  /** Recommended operating base. */
  recommendedBase: CgmpBase;
  /** The provisions of the OTHER system that must be additionally satisfied. */
  calledOutProvisions: CalledOutProvision[];
  /** Whether the manufacturer may instead demonstrate compliance with both full systems. */
  fullDualComplianceAllowed: boolean;
  /** Postmarketing safety reporting requirements (Subpart B). */
  postmarketSafetyReporting: string[];
  /** Stepwise rationale. */
  rationale: string[];
  citations: RegulatoryCitation[];
  notes: string[];
}

/**
 * Plan the cGMP operating model for a combination product under 21 CFR Part 4.
 *
 * Part 4 Subpart A lets a manufacturer of a single-entity or co-packaged
 * combination product, operating under a single set of operations, choose ONE
 * base quality system — drug cGMP (21 CFR 210/211) OR device QS (21 CFR 820) —
 * and then additionally satisfy a SHORT LIST of "called-out" provisions from the
 * other system (the "streamlined" approach, 21 CFR 4.4). Alternatively, the
 * manufacturer may comply fully with BOTH systems (21 CFR 4.4(a)) — but that is
 * usually more burdensome.
 */
export function planCombinationCGMP(params: CgmpParams): CgmpResult {
  const rationale: string[] = [];
  const notes: string[] = [];

  const distinctTypes = Array.from(new Set(params.constituentTypes));
  const hasDevice = distinctTypes.includes('device');
  const hasDrug = distinctTypes.includes('drug');
  const hasBiologic = distinctTypes.includes('biologic');

  // Part 4 applies to combination products; cross-labeled products manufactured
  // entirely separately may not get streamlining benefits.
  const isStreamlineEligibleCategory =
    params.category === 'single-entity' || params.category === 'co-packaged';
  const singleSet = params.singleSetOfOperations !== false;
  const partFourApplies = (hasDevice && (hasDrug || hasBiologic)) || (hasDrug && hasBiologic);

  rationale.push(
    '21 CFR 4.3: each constituent part of a combination product remains subject to the cGMP ' +
      'requirements that would apply to it on its own.',
  );
  rationale.push(
    '21 CFR 4.4(a): a manufacturer demonstrating compliance with the cGMP for one constituent ' +
      'may operate a single quality system, provided it also implements the specified provisions ' +
      'of the other constituent’s cGMP (the streamlined approach).',
  );

  // Decide the base.
  let recommendedBase: CgmpBase;
  if (params.preferredBase) {
    recommendedBase = params.preferredBase;
    rationale.push(`Manufacturer’s established quality system favors a ${recommendedBase}.`);
  } else if (hasDrug || hasBiologic) {
    // Default to the drug-cGMP base when a drug/biologic is present, because drug
    // cGMP (211) lacks design controls/CAPA that are simpler to add than the full
    // 211 chemistry suite is to add onto a device base.
    recommendedBase = 'drug-cGMP-base';
    rationale.push(
      'Default base is drug cGMP (21 CFR 210/211) because a drug/biologic constituent is present; ' +
        'the device QS gaps (design controls, CAPA, purchasing, management, installation, servicing) ' +
        'are then called out under 21 CFR 4.4(b)(1).',
    );
  } else {
    recommendedBase = 'device-QS-base';
    rationale.push('No drug/biologic constituent dominates manufacture; a device QS base is appropriate.');
  }

  // Assemble called-out provisions for the chosen base.
  let calledOutProvisions: CalledOutProvision[];
  if (recommendedBase === 'drug-cGMP-base') {
    calledOutProvisions = DEVICE_PROVISIONS_CALLED_INTO_DRUG_BASE.map(
      (p: CalledOutProvision): CalledOutProvision => ({ ...p }),
    );
    rationale.push(
      '21 CFR 4.4(b)(1): on a drug-cGMP base, additionally satisfy device QS §§ 820.20 (management), ' +
        '820.30 (design controls), 820.50 (purchasing), 820.100 (CAPA), 820.170 (installation), ' +
        'and 820.200 (servicing).',
    );
  } else {
    calledOutProvisions = DRUG_PROVISIONS_CALLED_INTO_DEVICE_BASE.map(
      (p: CalledOutProvision): CalledOutProvision => ({ ...p }),
    );
    rationale.push(
      '21 CFR 4.4(b)(2): on a device-QS base, additionally satisfy drug cGMP §§ 211.84, 211.103, ' +
        '211.132, 211.137, 211.165, 211.166, 211.167, and 211.170.',
    );
    // Trim provisions that are inapplicable to the specific product.
    if (params.hasSterileDrugConstituent === false) {
      calledOutProvisions = calledOutProvisions.filter(
        (p: CalledOutProvision): boolean => p.citation !== '21 CFR 211.167',
      );
      notes.push('211.167 (special/sterility testing) omitted: no sterile drug constituent indicated.');
    }
    if (params.hasOtcDrugConstituent === false) {
      calledOutProvisions = calledOutProvisions.filter(
        (p: CalledOutProvision): boolean => p.citation !== '21 CFR 211.132',
      );
      notes.push('211.132 (tamper-evident OTC packaging) omitted: no OTC drug constituent indicated.');
    }
  }

  if (!isStreamlineEligibleCategory) {
    notes.push(
      `Category "${params.category}" is cross-labeled; constituents made under separate quality ` +
        'systems generally comply with their own cGMP separately, and the streamlined single-system ' +
        'approach may not be available — confirm the manufacturing arrangement.',
    );
  }
  if (!singleSet) {
    notes.push(
      'Constituents are NOT made under a single set of operations; the streamlined approach is ' +
        'intended for co-located/single quality-system manufacture. Each operation must meet the ' +
        'cGMP applicable to the constituent it makes.',
    );
  }

  // QMSR note — Part 820 is being replaced by ISO 13485-based QMSR effective Feb 2, 2026.
  notes.push(
    'Effective 2026-02-02, 21 CFR Part 820 is restructured as the QMSR incorporating ISO 13485:2016; ' +
      'the Part 4 cross-references are correspondingly updated, but the streamlined construct persists. ' +
      'Map each called-out 820.x clause to its ISO 13485 equivalent (e.g., 820.30 → ISO 13485 §7.3).',
  );

  // Subpart B — postmarket safety reporting.
  const postmarketSafetyReporting: string[] = [
    '21 CFR Part 4 Subpart B (§§ 4.100–4.110): a combination-product applicant must comply with ' +
      'the postmarketing safety reporting requirements applicable to EACH type of constituent part.',
    'Constituent-type reports: drug/biologic adverse-event reports (21 CFR 314.80 / 600.80) AND device ' +
      'Medical Device Reports (21 CFR 803), as applicable to the constituents present.',
    'Five combination-product-specific report types apply where relevant: 5-day, 15-day, malfunction, ' +
      '30-day, and periodic reports, submitted to the lead Center with a unique combination-product identifier.',
  ];

  return {
    partFourApplies,
    recommendedBase,
    calledOutProvisions,
    fullDualComplianceAllowed: true,
    postmarketSafetyReporting,
    rationale,
    citations: citeAll([
      '21 CFR Part 4 Subpart A',
      '21 CFR 4.3',
      '21 CFR 4.4',
      '21 CFR Part 4 Subpart B',
      '21 CFR 820.30',
      'QMSR (89 FR 7496, Feb 2, 2024)',
      'FDA cGMP Guidance (Jan 2017)',
    ]),
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Human Factors / usability engineering plan
// FDA HF Guidance (2016), IEC 62366-1:2015, ISO 14971:2019
// ─────────────────────────────────────────────────────────────────────────────

/** Distinct intended user groups (each requires its own summative cohort). */
export interface UserGroup {
  /** Name of the user group, e.g. "patient", "caregiver", "nurse". */
  name: string;
  /** Whether this group is intended to use the product. */
  intendedUser: boolean;
}

export interface HumanFactorsParams {
  /** Product description / device-constituent type, e.g. "autoinjector". */
  deviceConstituentDescription: string;
  /** Distinct intended user groups (drives summative cohort count). */
  userGroups: UserGroup[];
  /**
   * Use environment, e.g. "home", "clinical", "transport". Affects use scenarios
   * and the realism required of the validation environment.
   */
  useEnvironment?: 'home' | 'clinical' | 'emergency' | 'transit' | 'mixed';
  /**
   * Whether the product is a high-risk delivery system where use errors can lead
   * to serious harm (e.g., autoinjector, infusion pump, on-body injector). Drives
   * the criticality of summative validation.
   */
  highRiskDelivery?: boolean;
  /**
   * Pre-identified critical tasks (tasks whose failure could cause serious harm).
   * If omitted, the engine notes that a use-related risk analysis (URRA) must
   * derive them.
   */
  knownCriticalTasks?: string[];
  /**
   * Whether the device-constituent user interface is identical to a previously
   * validated predicate (may support leveraging prior HF data / threshold analysis).
   */
  identicalToValidatedPredicate?: boolean;
}

export interface HumanFactorsResult {
  /** Recommended minimum participants per distinct user group for summative validation. */
  minParticipantsPerUserGroup: number;
  /** Number of distinct intended user groups counted. */
  distinctUserGroupCount: number;
  /** Total minimum summative-study participants across all groups. */
  totalSummativeParticipants: number;
  /** Ordered HF/UE program steps. */
  programSteps: string[];
  /** Required study types. */
  studies: Array<{ phase: 'formative' | 'summative'; purpose: string; whenToRun: string }>;
  /** Critical-task handling. */
  criticalTasks: string[];
  /** Whether a full summative (human factors validation) study is required. */
  summativeValidationRequired: boolean;
  /** Use-related risk analysis (URRA) requirements. */
  useRelatedRiskAnalysis: string[];
  /** Stepwise rationale. */
  rationale: string[];
  citations: RegulatoryCitation[];
  notes: string[];
}

/**
 * Design a human factors / usability engineering plan for the device constituent
 * of a combination product, per FDA's 2016 HF guidance and IEC 62366-1:2015.
 *
 * FDA's foundational expectation: at least 15 participants from EACH distinct
 * intended user group in the human factors validation (summative) study, testing
 * the product under realistic (simulated) use conditions, with all use errors and
 * difficulties on CRITICAL TASKS analyzed for root cause and residual risk.
 */
export function designHumanFactorsStudy(params: HumanFactorsParams): HumanFactorsResult {
  const rationale: string[] = [];
  const notes: string[] = [];

  const distinctGroups = params.userGroups.filter((g: UserGroup): boolean => g.intendedUser);
  const distinctUserGroupCount = Math.max(1, distinctGroups.length);

  // FDA's threshold: n >= 15 per distinct user group in the summative study.
  const minParticipantsPerUserGroup = 15;
  const totalSummativeParticipants = minParticipantsPerUserGroup * distinctUserGroupCount;

  rationale.push(
    'Human factors validation testing should include AT LEAST 15 participants from each distinct ' +
      'intended user group (FDA HF Guidance, 2016, Section 7.3 / Appendix B).',
  );
  rationale.push(
    `Distinct intended user groups: ${distinctUserGroupCount} ` +
      `(${distinctGroups.map((g: UserGroup): string => g.name).join(', ') || 'unspecified'}); ` +
      `minimum summative n = 15 × ${distinctUserGroupCount} = ${totalSummativeParticipants}.`,
  );
  rationale.push(
    'IEC 62366-1:2015 frames this as the usability engineering process: identify the use ' +
      'specification, hazard-related use scenarios, user interface specification, and a summative ' +
      'evaluation of the user interface of the FINAL design.',
  );

  // Determine whether a full summative is required.
  const summativeValidationRequired = params.identicalToValidatedPredicate !== true;
  if (!summativeValidationRequired) {
    notes.push(
      'User interface is asserted identical to a validated predicate; a threshold/HF report ' +
        'leveraging prior validation MAY suffice in lieu of a new summative study — confirm with FDA ' +
        'and document the equivalence and any differences analysis.',
    );
  }

  // Critical tasks.
  const criticalTasks: string[] = [];
  if (params.knownCriticalTasks && params.knownCriticalTasks.length > 0) {
    criticalTasks.push(...params.knownCriticalTasks);
  } else {
    criticalTasks.push(
      'Critical tasks must be derived from the use-related risk analysis (URRA): a task is critical ' +
        'if a use error or task failure could cause serious harm.',
    );
  }
  if (params.highRiskDelivery) {
    criticalTasks.push(
      'For high-risk delivery systems, common critical tasks include: correct dose selection/confirmation, ' +
        'full needle insertion and complete dose delivery, hold-time adherence, sharps/needle-stick avoidance, ' +
        'and correct interpretation of dose-complete indicators.',
    );
  }

  // URRA requirements (ISO 14971-aligned, use-related).
  const useRelatedRiskAnalysis: string[] = [
    'Perform a use-related risk analysis (URRA) consistent with ISO 14971:2019, identifying ' +
      'use errors, their potential harms, and risk-control measures focused on the user interface.',
    'Map each hazard-related use scenario to its task(s); designate tasks whose failure could cause ' +
      'serious harm as CRITICAL TASKS for evaluation in formative and summative studies.',
    'Carry the URRA into the summative analysis: for every observed use error or difficulty on a ' +
      'critical task, conduct a root-cause analysis and assess residual risk and acceptability.',
  ];

  // Studies.
  const studies: Array<{ phase: 'formative' | 'summative'; purpose: string; whenToRun: string }> = [
    {
      phase: 'formative',
      purpose:
        'Iteratively evaluate and refine the user interface; identify use errors, close calls, and ' +
        'difficulties; inform the URRA and risk-control measures. Small samples (e.g., 5–8 per group) are typical.',
      whenToRun: 'Throughout design and development, BEFORE the design is frozen.',
    },
    {
      phase: 'summative',
      purpose:
        'Validate that the FINAL, production-equivalent user interface can be used safely and ' +
        'effectively by the intended users under realistic conditions; demonstrate critical tasks ' +
        'are performed without use errors that would cause serious harm.',
      whenToRun: 'On the frozen, production-equivalent design, after formative iterations are complete.',
    },
  ];

  // Program steps (IEC 62366-1 + FDA HF).
  const programSteps: string[] = [
    '1. Define the use specification: intended users, uses, use environments, and operating principle ' +
      `(${params.deviceConstituentDescription}).`,
    '2. Identify user interface characteristics related to safety and potential use errors.',
    '3. Identify known and foreseeable hazards and hazardous situations (link to ISO 14971 risk analysis).',
    '4. Identify and describe hazard-related use scenarios; select those for summative evaluation.',
    '5. Establish the user interface specification and the user interface evaluation plan.',
    '6. Conduct formative evaluations and iterate the design; update the URRA.',
    '7. Freeze the design; conduct the summative (HF validation) study with ≥ 15 participants per ' +
      'distinct user group under realistic simulated use.',
    '8. Analyze all use errors/difficulties on critical tasks for root cause and residual risk; ' +
      'document conclusions in the HF Engineering/Validation Report.',
  ];

  if (params.useEnvironment === 'home' || params.useEnvironment === 'transit') {
    notes.push(
      'Lay/home use environment: realism of the simulated-use environment and inclusion of ' +
        'representative lay users (including those with relevant impairments) is essential to validity.',
    );
  }
  if (params.useEnvironment === 'emergency') {
    notes.push(
      'Emergency-use product: validation should simulate time pressure, stress, and untrained or ' +
        'minimally trained users where appropriate to the intended use.',
    );
  }
  notes.push(
    'The HF Engineering/Validation Report (62366-1) and the HF information for the marketing ' +
      'submission (FDA 2016; draft Dec 2022) are distinct deliverables; both should be planned. ' +
      'Submission HF content should follow the risk-based categorization in the FDA guidance.',
  );

  return {
    minParticipantsPerUserGroup,
    distinctUserGroupCount,
    totalSummativeParticipants,
    programSteps,
    studies,
    criticalTasks,
    summativeValidationRequired,
    useRelatedRiskAnalysis,
    rationale,
    citations: citeAll([
      'FDA HF Guidance (Feb 2016)',
      'FDA Draft HF Guidance (Dec 2022)',
      'IEC 62366-1:2015/A1:2020',
      'ISO 14971:2019',
      '21 CFR 820.30',
    ]),
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Device-constituent design controls (21 CFR 820.30 / QMSR)
// ─────────────────────────────────────────────────────────────────────────────

/** A design-control element with its citation and expected content. */
interface DesignControlElement {
  citation: string;
  element: string;
  expectation: string;
}

/** The 820.30 design-control elements (annotated array, not `as const`). */
const DESIGN_CONTROL_ELEMENTS: DesignControlElement[] = [
  {
    citation: '21 CFR 820.30(b)',
    element: 'Design and development planning',
    expectation:
      'Establish and maintain plans describing design/development activities, responsibilities, and ' +
      'interfaces; update as the design evolves.',
  },
  {
    citation: '21 CFR 820.30(c)',
    element: 'Design inputs',
    expectation:
      'Define the physical and performance requirements of the device constituent, including ' +
      'user/patient needs, intended use, essential performance, and interface with the drug/biologic.',
  },
  {
    citation: '21 CFR 820.30(d)',
    element: 'Design outputs',
    expectation:
      'Define outputs in terms that allow adequacy evaluation against inputs; identify outputs ' +
      'essential to proper functioning (acceptance criteria, specifications, drawings).',
  },
  {
    citation: '21 CFR 820.30(e)',
    element: 'Design review',
    expectation:
      'Conduct formal, documented design reviews at appropriate stages with an independent reviewer present.',
  },
  {
    citation: '21 CFR 820.30(f)',
    element: 'Design verification',
    expectation:
      'Confirm design outputs meet design inputs (e.g., dose accuracy, delivery force, dimensional ' +
      'conformance, container-closure integrity).',
  },
  {
    citation: '21 CFR 820.30(g)',
    element: 'Design validation',
    expectation:
      'Confirm devices conform to defined user needs and intended uses under actual or simulated use, ' +
      'using initial production units/lots; includes human factors validation and, where appropriate, ' +
      'clinical/simulated-use data.',
  },
  {
    citation: '21 CFR 820.30(h)',
    element: 'Design transfer',
    expectation:
      'Ensure the device design is correctly translated into production specifications.',
  },
  {
    citation: '21 CFR 820.30(i)',
    element: 'Design changes',
    expectation: 'Identify, document, validate/verify, review, and approve design changes before implementation.',
  },
  {
    citation: '21 CFR 820.30(j)',
    element: 'Design History File (DHF)',
    expectation:
      'Maintain a DHF for each device type that demonstrates the design was developed per the ' +
      'approved design plan and 820.30.',
  },
];

export interface DeviceConstituentControlsParams {
  /** Device-constituent description, e.g. "prefilled syringe", "on-body injector". */
  deviceConstituentDescription: string;
  /**
   * Device risk class proxy. true if the device constituent is higher-risk
   * (Class II/III analog) — affects rigor and whether clinical data support validation.
   */
  higherRisk?: boolean;
  /** Whether the device delivers a defined dose (drives dose-accuracy essential performance). */
  doseDelivering?: boolean;
  /** Whether the device or its fluid path must be sterile (drives CCI / sterility V&V). */
  sterilePath?: boolean;
  /** Whether software is part of the device constituent (drives software V&V, IEC 62304). */
  containsSoftware?: boolean;
  /** Known/declared essential performance requirements (recorded and supplemented). */
  declaredEssentialPerformance?: string[];
}

export interface DeviceConstituentControlsResult {
  /** Full 820.30 design-control program. */
  designControls: DesignControlElement[];
  /** Representative design inputs to capture. */
  designInputs: string[];
  /** Representative design outputs. */
  designOutputs: string[];
  /** Verification activities (output-meets-input). */
  verificationActivities: string[];
  /** Validation activities (meets user needs/intended use). */
  validationActivities: string[];
  /** Essential performance requirements (must continue to function correctly). */
  essentialPerformanceRequirements: string[];
  /** Design History File contents. */
  designHistoryFileContents: string[];
  /** Stepwise rationale. */
  rationale: string[];
  citations: RegulatoryCitation[];
  notes: string[];
}

/**
 * Assess and lay out the device-constituent design controls required under
 * 21 CFR 820.30 (and the equivalent ISO 13485 §7.3 under the QMSR), tailored to
 * the device-constituent characteristics. This is the device-side counterpart to
 * the drug-side CMC dossier for a drug-device combination product.
 */
export function assessDeviceConstituentControls(
  params: DeviceConstituentControlsParams,
): DeviceConstituentControlsResult {
  const rationale: string[] = [];
  const notes: string[] = [];

  rationale.push(
    'The device constituent of a combination product is subject to design controls under ' +
      '21 CFR 820.30 (called out for a drug-cGMP base by 21 CFR 4.4(b)(1)).',
  );
  rationale.push(
    'Design controls trace user needs → design inputs → design outputs → verification ' +
      '→ validation, all captured in the Design History File (DHF).',
  );

  const designControls = DESIGN_CONTROL_ELEMENTS.map(
    (e: DesignControlElement): DesignControlElement => ({ ...e }),
  );

  // Design inputs.
  const designInputs: string[] = [
    'Intended use, indications, and user/patient needs (incl. self-administration if applicable).',
    'Interface requirements with the drug/biologic constituent (compatibility, extractables/leachables, ' +
      'container-closure integrity, drug stability in contact materials).',
    'Performance requirements (e.g., delivery accuracy/precision, activation/injection force, flow rate).',
    'Human-factors / use-related requirements derived from the URRA (link to designHumanFactorsStudy).',
    'Applicable standards and regulatory requirements (ISO 11608 series for needle-based injectors, ' +
      'ISO 11040 for prefilled syringes, ISO 14971 for risk management).',
  ];

  // Design outputs.
  const designOutputs: string[] = [
    'Component and assembly specifications and engineering drawings.',
    'Acceptance criteria and test methods for verification.',
    'Labeling and instructions-for-use (IFU) content.',
    'Risk-control measures traced from the risk management file.',
  ];

  // Verification.
  const verificationActivities: string[] = [
    'Dimensional and material conformance testing.',
    'Mechanical performance testing (activation force, break-loose/gliding force, delivery time).',
  ];
  if (params.doseDelivering) {
    verificationActivities.push(
      'Dose-accuracy and dose-precision verification across the labeled dose range and use conditions.',
    );
  }
  if (params.sterilePath) {
    verificationActivities.push(
      'Container-closure integrity (CCI) and sterility-barrier verification; sterilization validation.',
    );
  }
  if (params.containsSoftware) {
    verificationActivities.push(
      'Software verification per IEC 62304 (unit/integration/system testing) commensurate with software safety class.',
    );
  }

  // Validation.
  const validationActivities: string[] = [
    'Design validation on initial production units under actual or simulated use conditions (820.30(g)).',
    'Human factors validation (summative) study demonstrating safe and effective use (see HF plan).',
    'Process validation for manufacturing operations affecting the device constituent.',
  ];
  if (params.higherRisk) {
    validationActivities.push(
      'Clinical or representative simulated-use data to validate the device constituent where required by risk.',
    );
  }

  // Essential performance.
  const essentialPerformanceRequirements: string[] = [];
  if (params.declaredEssentialPerformance && params.declaredEssentialPerformance.length > 0) {
    essentialPerformanceRequirements.push(...params.declaredEssentialPerformance);
  }
  essentialPerformanceRequirements.push(
    'Delivery of the intended dose to the intended site within accuracy/precision limits.',
  );
  if (params.sterilePath) {
    essentialPerformanceRequirements.push('Maintenance of sterility / container-closure integrity through shelf life.');
  }
  if (params.doseDelivering) {
    essentialPerformanceRequirements.push('Complete dose delivery without premature termination or under-delivery.');
  }
  essentialPerformanceRequirements.push(
    'Functional reliability across the labeled shelf life, storage, transport, and use conditions.',
  );

  // DHF.
  const designHistoryFileContents: string[] = [
    'Design and development plan(s).',
    'Design input and design output documents with traceability matrix.',
    'Design review records (with independent reviewer).',
    'Verification and validation protocols, data, and reports.',
    'Risk management file (ISO 14971) and URRA.',
    'Design transfer records and design change records.',
  ];

  if (params.containsSoftware) {
    notes.push(
      'Software in the device constituent additionally invokes IEC 62304 software life-cycle and FDA ' +
        'software documentation expectations; classify software safety per IEC 62304 and address cybersecurity.',
    );
  }
  notes.push(
    'Under the QMSR (effective 2026-02-02), 21 CFR 820.30 design controls map to ISO 13485:2016 §7.3; ' +
      'maintain the same objective evidence under the ISO clause structure.',
  );
  notes.push(
    'For a single-entity combination product, the device design controls and the drug CMC must be ' +
      'integrated: e.g., drug-contact materials are both a design input (device) and a stability/compatibility ' +
      'question (drug).',
  );

  return {
    designControls,
    designInputs,
    designOutputs,
    verificationActivities,
    validationActivities,
    essentialPerformanceRequirements,
    designHistoryFileContents,
    rationale,
    citations: citeAll([
      '21 CFR 820.30',
      '21 CFR 820',
      '21 CFR 4.4',
      'QMSR (89 FR 7496, Feb 2, 2024)',
      'ISO 13485:2016',
      'ISO 14971:2019',
    ]),
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Submission pathway selection (US lead application + EU MDR Art. 117)
// ─────────────────────────────────────────────────────────────────────────────

/** Candidate US lead application types. */
export type UsLeadApplication =
  | 'NDA'
  | 'BLA'
  | '510(k)'
  | 'PMA'
  | 'De Novo'
  | 'separate-applications';

export interface SubmissionPathwayParams {
  /** Lead Center from PMOA. */
  leadCenter: FdaCenter;
  /** 21 CFR 3.2(e) category. */
  category: CombinationCategory;
  /** Constituent types present. */
  constituentTypes: ConstituentType[];
  /**
   * Whether the sponsor prefers (or the structure requires) a single marketing
   * application vs separate applications per constituent.
   */
  preferSingleApplication?: boolean;
  /**
   * Device-constituent risk/novelty for the device pathway branch:
   *   'exempt'    → 510(k)-exempt class I analog
   *   'moderate'  → substantially equivalent to a predicate (510(k))
   *   'novel-low' → novel but low-moderate risk (De Novo)
   *   'high'      → high risk / no predicate (PMA)
   */
  deviceRiskPathway?: 'exempt' | 'moderate' | 'novel-low' | 'high';
  /** Whether an EU marketing-authorisation route is also in scope (drives Art. 117). */
  euInScope?: boolean;
  /**
   * For EU: whether the drug-device combination is INTEGRAL (single integrated
   * product, e.g. prefilled syringe) — integral DDCs whose principal action is
   * the medicinal substance go through a medicinal MAA with an Art. 117 NBOp.
   */
  euIntegralDrugDevice?: boolean;
}

export interface SubmissionPathwayResult {
  /** Recommended US lead application type. */
  usLeadApplication: UsLeadApplication;
  /** Whether a single application or separate applications are recommended. */
  applicationStructure: 'single' | 'separate';
  /** Device-constituent US pathway when a drug/biologic leads (data included in the lead app). */
  deviceConstituentUsPathway: string;
  /** EU MDR Article 117 handling. */
  euArticle117: string[];
  /** Stepwise rationale. */
  rationale: string[];
  /** Outstanding considerations / data the sponsor must address. */
  considerations: string[];
  citations: RegulatoryCitation[];
  notes: string[];
}

/**
 * Select the marketing submission pathway for a combination product:
 *   - the US lead application (NDA / BLA when a drug/biologic leads; 510(k) /
 *     PMA / De Novo when a device leads),
 *   - single vs separate applications, and
 *   - EU MDR Article 117 notified-body-opinion handling for integral
 *     drug-device combinations marketed in the EU.
 *
 * Under FDA's one-application policy for combination products, a single
 * application owned by the lead Center is generally used and must address BOTH
 * constituents; the non-lead constituent's data are reviewed via intercenter
 * consultation rather than a separate marketing application (except for some
 * cross-labeled products, which may use separate applications).
 */
export function selectCombinationSubmissionPathway(
  params: SubmissionPathwayParams,
): SubmissionPathwayResult {
  const rationale: string[] = [];
  const considerations: string[] = [];
  const notes: string[] = [];

  const hasBiologic = params.constituentTypes.includes('biologic');
  const hasDrug = params.constituentTypes.includes('drug');

  // Determine application structure.
  const isCrossLabeled =
    params.category === 'cross-labeled' || params.category === 'cross-labeled-investigational';
  let applicationStructure: 'single' | 'separate';
  if (params.preferSingleApplication === false || isCrossLabeled) {
    applicationStructure = 'separate';
    rationale.push(
      isCrossLabeled
        ? 'Cross-labeled constituents are commonly cleared/approved under SEPARATE applications ' +
            '(one per constituent), coordinated by the lead Center.'
        : 'Sponsor elects separate applications per constituent.',
    );
  } else {
    applicationStructure = 'single';
    rationale.push(
      'FDA’s one-application policy: a single marketing application owned by the lead Center is ' +
        'generally used for single-entity and co-packaged combination products and must address BOTH ' +
        'constituent parts (intercenter consultation reviews the non-lead constituent).',
    );
  }

  // Determine US lead application by lead Center.
  let usLeadApplication: UsLeadApplication;
  let deviceConstituentUsPathway: string;

  if (params.leadCenter === 'CDER') {
    usLeadApplication = applicationStructure === 'separate' ? 'separate-applications' : 'NDA';
    rationale.push(
      'Lead Center CDER → lead application is an NDA (505(b)) (or, for a 351 therapeutic protein ' +
        'led by CDER, a BLA); the device-constituent design controls/data are included in the lead application.',
    );
    deviceConstituentUsPathway =
      'Device constituent reviewed within the NDA/BLA via CDRH intercenter consultation; no separate ' +
      '510(k)/PMA is filed for an integral device constituent. Device design controls (820.30) and HF ' +
      'data are submitted in the lead application.';
  } else if (params.leadCenter === 'CBER') {
    usLeadApplication = applicationStructure === 'separate' ? 'separate-applications' : 'BLA';
    rationale.push(
      'Lead Center CBER → lead application is a BLA (351(a)); the device-constituent data are ' +
        'included via CDRH intercenter consultation.',
    );
    deviceConstituentUsPathway =
      'Device constituent reviewed within the BLA via CDRH intercenter consultation; device design ' +
      'controls (820.30) and HF data are submitted in the BLA.';
  } else {
    // CDRH leads — device pathway is the lead application.
    const dr = params.deviceRiskPathway ?? 'moderate';
    switch (dr) {
      case 'exempt':
        usLeadApplication = '510(k)';
        deviceConstituentUsPathway =
          'Device constituent is the lead; if 510(k)-exempt (Class I analog), market with QS/registration ' +
          'and listing, but the drug/biologic constituent still requires its own review via intercenter consultation.';
        break;
      case 'novel-low':
        usLeadApplication = 'De Novo';
        deviceConstituentUsPathway =
          'Novel low-to-moderate-risk device constituent leads via De Novo classification; the drug/biologic ' +
          'constituent data are reviewed via CDER/CBER intercenter consultation.';
        break;
      case 'high':
        usLeadApplication = 'PMA';
        deviceConstituentUsPathway =
          'High-risk device constituent leads via PMA; the drug/biologic constituent data are reviewed via ' +
          'CDER/CBER intercenter consultation.';
        break;
      case 'moderate':
      default:
        usLeadApplication = '510(k)';
        deviceConstituentUsPathway =
          'Moderate-risk device constituent leads via 510(k) (substantial equivalence to a predicate); the ' +
          'drug/biologic constituent data are reviewed via CDER/CBER intercenter consultation.';
        break;
    }
    if (applicationStructure === 'separate') {
      usLeadApplication = 'separate-applications';
    }
    rationale.push(
      `Lead Center CDRH → the device marketing pathway (${dr}) is the lead application; the drug/biologic ` +
        'constituent is addressed via intercenter consultation (or a separate application if cross-labeled).',
    );
  }

  // EU MDR Article 117.
  const euArticle117: string[] = [];
  if (params.euInScope) {
    if (params.euIntegralDrugDevice && (hasDrug || hasBiologic)) {
      euArticle117.push(
        'EU MDR Art. 117 amends Annex I of Directive 2001/83/EC: for an INTEGRAL drug-device combination ' +
          'whose principal mode of action is the medicinal substance, the product is authorised as a ' +
          'MEDICINAL PRODUCT (MAA via EMA/national authority), and the device part must meet the relevant ' +
          'MDR Annex I General Safety and Performance Requirements (GSPRs).',
      );
      euArticle117.push(
        'A Notified Body Opinion (NBOp) on the device part’s conformity with the relevant GSPRs must be ' +
          'included in the MAA dossier (Module 3.2.R / device section), UNLESS the device part is covered by a ' +
          'CE certificate already.',
      );
      euArticle117.push(
        'EU MDR Rule 14 may classify a device incorporating a medicinal substance with ancillary action as ' +
          'Class III; coordinate the NBOp timeline with the MAA submission.',
      );
    } else {
      euArticle117.push(
        'If the device and medicinal product are NOT integral (e.g., co-packaged/separate), each follows its ' +
          'own EU route: the device CE-marks under the MDR and the medicinal product is authorised separately; ' +
          'Art. 117 (integral DDC NBOp) does not apply.',
      );
    }
  } else {
    euArticle117.push('EU market not in scope; Article 117 not assessed.');
  }

  // Considerations.
  considerations.push(
    'Engage the lead Center and OCP early; the intercenter consultation and review timelines should be ' +
      'planned (combination products may use a single user-fee program tied to the lead application type).',
  );
  considerations.push(
    'Ensure the single application contains the complete device design controls/DHF summary and HF ' +
      'validation, in addition to the drug/biologic CMC, nonclinical, and clinical data.',
  );
  if (hasBiologic) {
    considerations.push(
      'Confirm whether the biologic is regulated under a BLA (351) and whether CDER or CBER leads the ' +
        'biologic review per the 2003 transfer and OCP assignment.',
    );
  }
  if (isCrossLabeled) {
    considerations.push(
      'For cross-labeled products, ensure the labeling of each constituent consistently references the ' +
        'other and that the marketing applications are coordinated.',
    );
  }

  notes.push(
    'Pathway selection is downstream of PMOA (lead Center) and 3.2(e) classification (category); run ' +
      'determinePrimaryModeOfAction and classifyCombinationProduct first.',
  );

  return {
    usLeadApplication,
    applicationStructure,
    deviceConstituentUsPathway,
    euArticle117,
    rationale,
    considerations,
    citations: citeAll([
      '21 CFR 3.4',
      '21 CFR 3.2(e)',
      'FDA OCP Guidance (Jan 2017)',
      'EU MDR 2017/745 Art. 117',
      'EU MDR 2017/745 Rule 14',
    ]),
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — Reference data exports (deterministic, for callers that want the
// underlying tables verbatim). These do not perform computation.
// ─────────────────────────────────────────────────────────────────────────────

/** Public, read-only view of the canonical citation registry. */
export function listCitations(): RegulatoryCitation[] {
  return CITATIONS.map((c: CitationEntry): RegulatoryCitation => ({ id: c.id, description: c.description }));
}

/** Public view of the device QS provisions called into a drug-cGMP base (4.4(b)(1)). */
export function listDeviceProvisionsForDrugBase(): Array<{
  citation: string;
  topic: string;
  requirement: string;
}> {
  return DEVICE_PROVISIONS_CALLED_INTO_DRUG_BASE.map(
    (p: CalledOutProvision): { citation: string; topic: string; requirement: string } => ({
      citation: p.citation,
      topic: p.topic,
      requirement: p.requirement,
    }),
  );
}

/** Public view of the drug cGMP provisions called into a device-QS base (4.4(b)(2)). */
export function listDrugProvisionsForDeviceBase(): Array<{
  citation: string;
  topic: string;
  requirement: string;
}> {
  return DRUG_PROVISIONS_CALLED_INTO_DEVICE_BASE.map(
    (p: CalledOutProvision): { citation: string; topic: string; requirement: string } => ({
      citation: p.citation,
      topic: p.topic,
      requirement: p.requirement,
    }),
  );
}

/** Public view of the 820.30 design-control elements. */
export function listDesignControlElements(): Array<{
  citation: string;
  element: string;
  expectation: string;
}> {
  return DESIGN_CONTROL_ELEMENTS.map(
    (e: DesignControlElement): { citation: string; element: string; expectation: string } => ({
      citation: e.citation,
      element: e.element,
      expectation: e.expectation,
    }),
  );
}
