/**
 * Pre-approval (expanded access / compassionate use / named-patient) expert.
 *
 * Outside of enrollment in a clinical trial, a patient with a serious or
 * life-threatening disease who has no satisfactory authorised therapy may
 * sometimes obtain an investigational (unapproved) drug through a regulated
 * "expanded access" / "compassionate use" pathway. The right vehicle depends
 * on the region and on how many patients are intended to be treated — a single
 * patient, an intermediate-size population, or widespread use. This service
 * encodes the modeled frameworks per region and recommends the appropriate
 * mechanism for a given population size — the judgement an RA / medical-affairs
 * lead makes when fielding a treating-physician request.
 *
 * Regions: FDA (US expanded access), EU (Union compassionate use), JP (Japan
 * expanded-access / compassionate-use system).
 *
 * Pure / deterministic — no DB, no IO. This is an indicative reference aid:
 * access is always request- and program-specific and remains at the discretion
 * of the regulatory agency AND the manufacturer (who is not obliged to supply).
 * The governing legislation / agency guidance is the authority for any real
 * request, and individual Member-State / local implementation varies.
 *
 * References:
 *  - FDA Expanded Access: 21 CFR 312.300–312.320; FD&C Act §561 (21 U.S.C. 360bbb).
 *    Three mechanisms scaling with population: individual-patient (incl.
 *    emergency use) IND/protocol; intermediate-size patient-population
 *    IND/protocol; treatment IND / treatment protocol (widespread use). The
 *    Right to Try Act (21 U.S.C. 360bbb-0a) is a separate pathway, not modeled
 *    here.
 *  - EU compassionate use: Article 83 of Regulation (EC) No 726/2004 — a
 *    programme making a medicinal product available to a GROUP of patients with
 *    a chronically or seriously debilitating disease, or whose disease is
 *    life-threatening, and who cannot be treated satisfactorily by an
 *    authorised medicinal product; the product must be the subject of a
 *    marketing-authorisation application or undergoing clinical trials.
 *    Implemented at Member-State level. Named-patient supply under Article 5(1)
 *    of Directive 2001/83/EC is a separate single-patient route.
 *  - JP: Pharmaceuticals and Medical Devices (PMD) Act; MHLW expanded-access /
 *    compassionate-use framework permitting use of an unapproved drug already
 *    in late-stage (e.g. Phase III) trials for patients with serious diseases
 *    and no satisfactory alternative.
 *
 * @module server/services/global-ri/expanded-access
 */

export type ExpandedAccessRegion = 'FDA' | 'EU' | 'JP';

/** Intended treatment population size, smallest → largest. */
export type PopulationSize = 'individual' | 'intermediate' | 'widespread';

/** The set of modeled regions. */
export const EXPANDED_ACCESS_REGIONS: ExpandedAccessRegion[] = ['FDA', 'EU', 'JP'];

/** The set of modeled population sizes. */
export const POPULATION_SIZES: PopulationSize[] = ['individual', 'intermediate', 'widespread'];

export interface ExpandedAccessMechanism {
  /** Stable mechanism code (e.g. 'fda_individual'). */
  id: string;
  /** Human label / name of the mechanism. */
  name: string;
  /** Intended scope of use (population it serves). */
  scope: string;
  /** Mechanism-specific criteria / conditions. */
  criteria: string[];
  /** Governing citation. */
  citation: string;
}

export interface ExpandedAccessFramework {
  region: ExpandedAccessRegion;
  /** The modeled mechanisms for the region (ordered smallest → largest scope). */
  mechanisms: ExpandedAccessMechanism[];
  /** General eligibility criteria common to the region's framework. */
  generalCriteria: string[];
  /** Governing citation for the framework. */
  citation: string;
  /** Honest caveats about the framework. */
  notes: string[];
}

const ACCESS_DISCRETION_NOTE =
  'Indicative reference aid only: expanded access is request- and program-specific and granted at the discretion of both the regulatory agency and the manufacturer (who is under no obligation to supply).';

const FDA_GENERAL_CRITERIA: string[] = [
  'The patient has a serious or immediately life-threatening disease or condition.',
  'There is no comparable or satisfactory alternative therapy to diagnose, monitor, or treat the disease or condition.',
  'The potential patient benefit justifies the potential risks of the treatment, and those risks are not unreasonable in the context of the disease.',
  'Providing the investigational drug will not interfere with the initiation, conduct, or completion of clinical investigations that could support marketing approval.',
];

const FDA_FRAMEWORK: ExpandedAccessFramework = {
  region: 'FDA',
  mechanisms: [
    {
      id: 'fda_individual',
      name: 'Individual Patient Expanded Access IND/protocol',
      scope: 'A single individual patient (including emergency use).',
      criteria: [
        'For a single named patient; may proceed as an emergency-use request when treatment cannot wait for written submission.',
        'A licensed physician submits the request (often the treating physician as sponsor-investigator).',
      ],
      citation: '21 CFR 312.310 (incl. 312.310(d) emergency use); FD&C Act §561',
    },
    {
      id: 'fda_intermediate',
      name: 'Intermediate-Size Patient Population IND/protocol',
      scope: 'An intermediate-size group of patients (more than individual, smaller than a treatment IND).',
      criteria: [
        'For a defined patient population smaller than that of a treatment IND.',
        'Used when a drug is not being developed (e.g. for a small population) or while development is ongoing.',
      ],
      citation: '21 CFR 312.315; FD&C Act §561',
    },
    {
      id: 'fda_treatment',
      name: 'Treatment IND / Treatment Protocol',
      scope: 'Widespread use in a large patient population.',
      criteria: [
        'For widespread treatment use, typically during ongoing clinical investigation or after trials are complete and a marketing application is under review.',
        'The drug is being investigated (or has been investigated) for the disease in adequate and well-controlled studies.',
      ],
      citation: '21 CFR 312.320; FD&C Act §561',
    },
  ],
  generalCriteria: FDA_GENERAL_CRITERIA,
  citation: '21 CFR 312.300–312.320; FD&C Act §561 (21 U.S.C. 360bbb)',
  notes: [
    ACCESS_DISCRETION_NOTE,
    'The three mechanisms scale with the intended population: individual → intermediate-size → treatment IND.',
    'The Right to Try Act (21 U.S.C. 360bbb-0a) is a separate pathway and is not modeled here.',
  ],
};

const EU_GENERAL_CRITERIA: string[] = [
  'Intended for a group of patients with a chronically or seriously debilitating disease, or whose disease is considered to be life-threatening.',
  'The patients cannot be treated satisfactorily by an authorised medicinal product.',
  'The medicinal product concerned must be the subject of a marketing-authorisation application or be undergoing clinical trials.',
];

const EU_FRAMEWORK: ExpandedAccessFramework = {
  region: 'EU',
  mechanisms: [
    {
      id: 'eu_named_patient',
      name: 'Named-patient supply (Art 5(1) Dir 2001/83/EC)',
      scope: 'A single individual (named) patient, on an unsolicited order of a healthcare professional.',
      criteria: [
        'Supply of an unauthorised medicinal product to fulfil a bona fide unsolicited order, formulated in accordance with a healthcare professional’s specifications, for use by an individual patient under their direct personal responsibility.',
        'A separate single-patient route, distinct from a Union/Member-State compassionate-use programme.',
      ],
      citation: 'Article 5(1) of Directive 2001/83/EC',
    },
    {
      id: 'eu_compassionate_use',
      name: 'Compassionate use programme (Art 83 Reg 726/2004)',
      scope: 'A group (cohort) of patients, via a Member-State compassionate-use programme.',
      criteria: [
        'A programme making a medicinal product available, on compassionate grounds, to a group of patients with a chronically/seriously debilitating or life-threatening disease.',
        'The product must be the subject of a marketing-authorisation application or undergoing clinical trials; implemented and authorised at Member-State level.',
      ],
      citation: 'Article 83 of Regulation (EC) No 726/2004',
    },
  ],
  generalCriteria: EU_GENERAL_CRITERIA,
  citation: 'Article 83 of Regulation (EC) No 726/2004 (compassionate use); Article 5(1) of Directive 2001/83/EC (named-patient)',
  notes: [
    ACCESS_DISCRETION_NOTE,
    'EU compassionate use under Article 83 is for a GROUP of patients and is implemented at Member-State level; national rules vary.',
    'Named-patient supply under Article 5(1) of Directive 2001/83/EC is a separate single-patient route.',
  ],
};

const JP_GENERAL_CRITERIA: string[] = [
  'The patient has a serious disease.',
  'There is no satisfactory alternative (approved) therapy available.',
  'The unapproved drug is already under evaluation in late-stage (e.g. Phase III) clinical trials in Japan.',
];

const JP_FRAMEWORK: ExpandedAccessFramework = {
  region: 'JP',
  mechanisms: [
    {
      id: 'jp_expanded_access',
      name: 'Japanese expanded-access (compassionate use) system',
      scope: 'Patients with serious diseases and no alternative; the drug is already in late-stage trials.',
      criteria: [
        'Permits use of an unapproved drug that is already in late-stage (e.g. Phase III) clinical development for patients with serious diseases and no satisfactory alternative.',
        'Operated within the PMD Act framework and MHLW expanded-access guidance; tied to an ongoing/planned development programme.',
      ],
      citation: 'PMD Act; MHLW expanded-access / compassionate-use framework',
    },
  ],
  generalCriteria: JP_GENERAL_CRITERIA,
  citation: 'PMD Act; MHLW expanded-access / compassionate-use framework',
  notes: [
    ACCESS_DISCRETION_NOTE,
    'The Japanese system requires the drug to already be in late-stage trials in Japan; it is not a route for drugs with no domestic development.',
  ],
};

const FRAMEWORKS: Record<ExpandedAccessRegion, ExpandedAccessFramework> = {
  FDA: FDA_FRAMEWORK,
  EU: EU_FRAMEWORK,
  JP: JP_FRAMEWORK,
};

/**
 * Return the modeled expanded-access / compassionate-use framework for a region.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function getExpandedAccessFramework(region: ExpandedAccessRegion): ExpandedAccessFramework {
  const framework = FRAMEWORKS[region];
  if (!framework) {
    throw new Error(`No expanded-access framework modeled for region "${region}".`);
  }
  return framework;
}

export interface RecommendMechanismInput {
  region: ExpandedAccessRegion;
  populationSize: PopulationSize;
}

export interface MechanismRecommendation {
  region: ExpandedAccessRegion;
  populationSize: PopulationSize;
  /** Recommended mechanism name. */
  mechanism: string;
  /** Intended scope of the recommended mechanism. */
  scope: string;
  /** Governing citation for the recommended mechanism. */
  citation: string;
  /** Honest caveats. */
  notes: string[];
}

/**
 * Map region + intended population size to the appropriate modeled mechanism.
 *
 * FDA scales across three mechanisms (individual → intermediate-size →
 * treatment IND). The EU splits between named-patient supply (individual) and a
 * compassionate-use programme (a group, i.e. intermediate/widespread). Japan
 * has a single expanded-access system regardless of population size.
 *
 * Pure / deterministic. Throws for an unmodeled region or unknown population
 * size.
 */
export function recommendExpandedAccessMechanism(input: RecommendMechanismInput): MechanismRecommendation {
  const framework = FRAMEWORKS[input.region];
  if (!framework) {
    throw new Error(`No expanded-access framework modeled for region "${input.region}".`);
  }
  if (!POPULATION_SIZES.includes(input.populationSize)) {
    throw new Error(`Unknown population size "${input.populationSize}".`);
  }

  let mechanism: ExpandedAccessMechanism;
  switch (input.region) {
    case 'FDA':
      mechanism =
        input.populationSize === 'individual'
          ? mechanismById(framework, 'fda_individual')
          : input.populationSize === 'intermediate'
            ? mechanismById(framework, 'fda_intermediate')
            : mechanismById(framework, 'fda_treatment');
      break;
    case 'EU':
      mechanism =
        input.populationSize === 'individual'
          ? mechanismById(framework, 'eu_named_patient')
          : mechanismById(framework, 'eu_compassionate_use');
      break;
    case 'JP':
      mechanism = mechanismById(framework, 'jp_expanded_access');
      break;
    default:
      // Exhaustiveness guard — unreachable given the region check above.
      throw new Error(`No expanded-access framework modeled for region "${input.region}".`);
  }

  return {
    region: input.region,
    populationSize: input.populationSize,
    mechanism: mechanism.name,
    scope: mechanism.scope,
    citation: mechanism.citation,
    notes: [
      ACCESS_DISCRETION_NOTE,
      'The recommended mechanism follows the intended population size; confirm against the governing legislation/agency guidance for the specific request.',
    ],
  };
}

/** Internal: resolve a mechanism by id within a framework (invariant: id exists). */
function mechanismById(framework: ExpandedAccessFramework, id: string): ExpandedAccessMechanism {
  const mechanism = framework.mechanisms.find((m) => m.id === id);
  if (!mechanism) {
    throw new Error(`Internal error: mechanism "${id}" not modeled for region "${framework.region}".`);
  }
  return mechanism;
}
